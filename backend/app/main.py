import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from math import ceil
from typing import Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import Boolean, DateTime, Float, Integer, String, create_engine, func, select, update
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from .spam import ReportBodyLimit, report_fingerprint

load_dotenv()
url = os.getenv("DATABASE_URL", "sqlite:///./drainwatch.db")
if url.startswith(("postgres://", "postgresql://")):
    url = "postgresql+psycopg://" + url.split("://", 1)[1]
engine = create_engine(url, pool_pre_ping=True,
                       connect_args={"check_same_thread": False} if url.startswith("sqlite") else {})
SessionLocal = sessionmaker(bind=engine)
MAX_REPORTS = int(os.getenv("MAX_REPORTS", "2000"))
# Shared by all visitors. Database-backed checks survive application restarts.
SUBMISSION_WINDOW = timedelta(minutes=10)
SUBMISSION_LIMIT = 30
DUPLICATE_WINDOW = timedelta(minutes=15)


class Base(DeclarativeBase):
    pass


class Report(Base):
    __tablename__ = "reports"
    id: Mapped[int] = mapped_column(primary_key=True)
    location: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(1500))
    category: Mapped[str] = mapped_column(String(30))
    blockage: Mapped[str] = mapped_column(String(20))
    standing_water: Mapped[bool] = mapped_column(Boolean)
    nearby_buildings: Mapped[bool] = mapped_column(Boolean)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    score: Mapped[int] = mapped_column(Integer)
    priority: Mapped[str] = mapped_column(String(10), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Budget(Base):
    __tablename__ = "report_budget"
    id: Mapped[int] = mapped_column(primary_key=True)
    used: Mapped[int] = mapped_column(Integer, default=0)


class ReportInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    location: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=10, max_length=1500)
    category: Literal["Blocked drain", "Waste buildup", "Standing water"]
    blockage: Literal["None", "Partial", "Full"]
    standing_water: bool = False
    nearby_buildings: bool = False
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)


class ReportSubmission(ReportInput):
    # Optional for compatibility with the existing frontend during rollout.
    website: str = Field(default="", max_length=200)


class ReportOutput(ReportInput):
    model_config = ConfigDict(from_attributes=True)
    id: int
    score: int
    priority: str
    created_at: datetime


def assess(data: ReportInput):
    """Prototype triage rules, not a calibrated flood probability or an AI model."""
    score = {"None": 0, "Partial": 25, "Full": 50}[data.blockage]
    score += 30 if data.standing_water else 0
    score += 20 if data.nearby_buildings else 0
    return score, "High" if score >= 70 else "Medium" if score >= 30 else "Low"


def get_db():
    with SessionLocal() as db:
        yield db


@asynccontextmanager
async def lifespan(app):
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if db.get(Budget, 1) is None:
            db.add(Budget(id=1, used=db.scalar(select(func.count()).select_from(Report))))
            db.commit()
    yield


app = FastAPI(title="DrainWatch", version="0.1.0", lifespan=lifespan)
app.add_middleware(ReportBodyLimit)
app.add_middleware(CORSMiddleware,
    allow_origins=[x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if x.strip()],
    allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


@app.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(select(1))
    return {"status": "healthy", "version": "0.1.0"}


@app.post("/reports", response_model=ReportOutput, status_code=201)
def create_report(data: ReportSubmission, db: Session = Depends(get_db)):
    if data.website:
        raise HTTPException(400, "The submission could not be accepted. Please reload the form and try again.")
    # This update locks the shared budget row until commit/rollback, serializing
    # submission checks on PostgreSQL (READ COMMITTED) and SQLite. No IP headers
    # are trusted, stored or needed. Rejected submissions roll back the counter.
    reserved = db.execute(update(Budget).where(Budget.id == 1, Budget.used < MAX_REPORTS)
                          .values(used=Budget.used + 1))
    if reserved.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "The demo report limit has been reached. Existing reports remain available.")
    now = datetime.now(timezone.utc)
    recent = db.scalars(select(Report).where(Report.created_at >= now - DUPLICATE_WINDOW)).all()
    fingerprint = report_fingerprint(data)
    if any(report_fingerprint(row) == fingerprint for row in recent):
        db.rollback()
        raise HTTPException(409, "An identical report was already submitted in the last 15 minutes. Check the dashboard before submitting again.")
    # SQLite returns naive datetimes; these timestamps were written in UTC.
    timestamps = [row.created_at.replace(tzinfo=timezone.utc) if row.created_at.tzinfo is None
                  else row.created_at for row in recent]
    active = sorted(stamp for stamp in timestamps if stamp > now - SUBMISSION_WINDOW)
    if len(active) >= SUBMISSION_LIMIT:
        retry_after = max(1, ceil((active[len(active) - SUBMISSION_LIMIT] + SUBMISSION_WINDOW - now).total_seconds()))
        db.rollback()
        raise HTTPException(429, f"The demo is receiving many reports. Please try again in {retry_after} seconds. Existing reports remain available.",
                            headers={"Retry-After": str(retry_after)})
    score, priority = assess(data)
    report = Report(**data.model_dump(exclude={"website"}), score=score, priority=priority, created_at=now)
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@app.get("/reports", response_model=list[ReportOutput])
def list_reports(limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0),
                 priority: Literal["High", "Medium", "Low"] | None = None,
                 db: Session = Depends(get_db)):
    query = select(Report)
    if priority:
        query = query.where(Report.priority == priority)
    return db.scalars(query.order_by(Report.created_at.desc(), Report.id.desc()).offset(offset).limit(limit)).all()


@app.get("/stats")
def stats(db: Session = Depends(get_db)):
    counts = dict(db.execute(select(Report.priority, func.count()).group_by(Report.priority)).all())
    return {"total": sum(counts.values()), "high": counts.get("High", 0),
            "medium": counts.get("Medium", 0), "low": counts.get("Low", 0)}
