import os
import tempfile
from pathlib import Path

tmp = tempfile.TemporaryDirectory()
os.environ["DATABASE_URL"] = "sqlite:///" + str(Path(tmp.name) / "test.db")

from fastapi.testclient import TestClient
from app.main import app, engine
from sqlalchemy import update
from app.main import Budget, MAX_REPORTS, SessionLocal

PAYLOAD = dict(location="Test street, Benin City", description="Drain blocked with discarded plastic bottles.",
               category="Blocked drain", blockage="Full", standing_water=True,
               nearby_buildings=True, latitude=6.335, longitude=5.6037)


def test_report_persists_after_application_restart_and_validation_is_enforced():
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        response = client.post("/reports", json=PAYLOAD)
        assert response.status_code == 201
        saved = response.json()
        assert (saved["score"], saved["priority"]) == (100, "High")
        assert client.post("/reports", json={**PAYLOAD, "latitude": 91}).status_code == 422
        assert client.post("/reports", json={**PAYLOAD, "location": "   "}).status_code == 422
        assert client.post("/reports", json={**PAYLOAD, "score": 0}).status_code == 422
    engine.dispose()
    with TestClient(app) as client:
        assert client.get("/reports").json()[0]["id"] == saved["id"]
        assert client.get("/stats").json() == {"total": 1, "high": 1, "medium": 0, "low": 0}
        assert client.get("/reports?priority=Low").json() == []
        with SessionLocal() as db:
            db.execute(update(Budget).values(used=MAX_REPORTS))
            db.commit()
        assert client.post("/reports", json=PAYLOAD).status_code == 409
        assert client.get("/stats").json()["total"] == 1
