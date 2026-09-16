import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import Boolean, DateTime, Float, Integer, String, create_engine, func, select, update
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

load_dotenv()
url = os.getenv("DATABASE_URL", "sqlite:///./drainwatch.db")
if url.startswith(("postgres://", "postgresql://")):
    url = "postgresql+psycopg://" + url.split("://", 1)[1]
engine = create_engine(url, pool_pre_ping=True,
                       connect_args={"check_same_thread": False} if url.startswith("sqlite") else {})
SessionLocal = sessionmaker(bind=engine)
MAX_REPORTS = int(os.getenv("MAX_REPORTS", "2000"))


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
app.add_middleware(CORSMiddleware,
    allow_origins=[x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if x.strip()],
    allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


@app.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(select(1))
    return {"status": "healthy", "version": "0.1.0"}


@app.post("/reports", response_model=ReportOutput, status_code=201)
def create_report(data: ReportInput, db: Session = Depends(get_db)):
    # Atomic counter: concurrent requests cannot bypass the record budget.
    reserved = db.execute(update(Budget).where(Budget.id == 1, Budget.used < MAX_REPORTS)
                          .values(used=Budget.used + 1))
    if reserved.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "The demo report limit has been reached. Existing reports remain available.")
    score, priority = assess(data)
    report = Report(**data.model_dump(), score=score, priority=priority)
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
