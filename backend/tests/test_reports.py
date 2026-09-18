import os
import tempfile
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import asyncio
import pytest

tmp = tempfile.TemporaryDirectory()
os.environ["DATABASE_URL"] = "sqlite:///" + str(Path(tmp.name) / "test.db")

from fastapi.testclient import TestClient
from app.main import app, engine
from sqlalchemy import delete, select, update
from app.main import Base, Budget, MAX_REPORTS, Report, SessionLocal, SUBMISSION_LIMIT
from app.spam import ReportBodyLimit

PAYLOAD = dict(location="Test street, Benin City", description="Drain blocked with discarded plastic bottles.",
               category="Blocked drain", blockage="Full", standing_water=True,
               nearby_buildings=True, latitude=6.335, longitude=5.6037)


@pytest.fixture(autouse=True)
def isolated_reports():
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        db.execute(delete(Report))
        db.execute(delete(Budget))
        db.commit()


def budget_used():
    with SessionLocal() as db:
        return db.get(Budget, 1).used


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


def test_honeypot_does_not_save_or_consume_budget_and_old_clients_work():
    with TestClient(app) as client:
        assert client.post('/reports', json={**PAYLOAD, 'website': 'bot-filled'}).status_code == 400
        assert budget_used() == 0
        saved = client.post('/reports', json=PAYLOAD)
        assert saved.status_code == 201
        assert 'website' not in saved.json()
        assert 'website' not in client.get('/reports').json()[0]


def test_duplicates_normalize_text_and_survive_restart_but_allow_new_observations():
    with TestClient(app) as client:
        assert client.post('/reports', json=PAYLOAD).status_code == 201
    engine.dispose()
    with TestClient(app) as client:
        duplicate = {**PAYLOAD, 'location': '  TEST  STREET, BENIN CITY ',
                     'description': PAYLOAD['description'].upper(), 'website': ''}
        assert client.post('/reports', json=duplicate).status_code == 409
        assert budget_used() == 1
        assert client.post('/reports', json={**PAYLOAD, 'blockage': 'Partial'}).status_code == 201
        with SessionLocal() as db:
            db.execute(update(Report).values(created_at=datetime.now(timezone.utc) - timedelta(minutes=16)))
            db.commit()
        assert client.post('/reports', json=PAYLOAD).status_code == 201


def test_shared_limit_persists_and_reads_remain_available_then_window_expires():
    with TestClient(app) as client:
        for i in range(SUBMISSION_LIMIT):
            assert client.post('/reports', json={**PAYLOAD, 'location': f'Test location {i}'}).status_code == 201
    engine.dispose()
    with TestClient(app) as client:
        limited = client.post('/reports', json={**PAYLOAD, 'location': 'Another location'},
                              headers={'X-Forwarded-For': '192.0.2.55', 'Origin': 'http://localhost:5173'})
        assert limited.status_code == 429
        assert 1 <= int(limited.headers['retry-after']) <= 600
        assert limited.headers['access-control-allow-origin'] == 'http://localhost:5173'
        assert budget_used() == SUBMISSION_LIMIT
        assert client.get('/health').status_code == 200
        assert client.get('/stats').json()['total'] == SUBMISSION_LIMIT
        assert len(client.get('/reports').json()) == SUBMISSION_LIMIT
        with SessionLocal() as db:
            db.execute(update(Report).values(created_at=datetime.now(timezone.utc) - timedelta(minutes=11)))
            db.commit()
        assert client.post('/reports', json={**PAYLOAD, 'location': 'Another location'}).status_code == 201


def test_oversized_body_rejected_before_json_validation_with_cors():
    with TestClient(app) as client:
        response = client.post('/reports', content=b'x' * 16385,
                               headers={'Origin': 'http://localhost:5173', 'Content-Type': 'application/json'})
        assert response.status_code == 413
        assert response.headers['access-control-allow-origin'] == 'http://localhost:5173'
        assert budget_used() == 0


def test_chunked_body_cannot_bypass_limit_with_missing_or_false_length():
    async def exercise(headers):
        messages = iter([{'type': 'http.request', 'body': b'x' * 10000, 'more_body': True},
                         {'type': 'http.request', 'body': b'x' * 7000, 'more_body': False}])
        sent = []
        async def receive():
            return next(messages)
        async def send(message):
            sent.append(message)
        async def downstream(scope, receive, send):
            pytest.fail('Oversized body reached application')
        await ReportBodyLimit(downstream)({'type': 'http', 'method': 'POST', 'path': '/reports',
                                          'headers': headers}, receive, send)
        assert sent[0]['status'] == 413
    asyncio.run(exercise([]))
    asyncio.run(exercise([(b'content-length', b'1')]))


def test_concurrent_identical_submissions_only_save_once():
    with TestClient(app) as client:
        with ThreadPoolExecutor(max_workers=6) as pool:
            codes = list(pool.map(lambda _: client.post('/reports', json=PAYLOAD).status_code, range(6)))
        assert sorted(codes) == [201, 409, 409, 409, 409, 409]
        assert budget_used() == 1


def test_concurrent_submissions_cannot_exceed_remaining_window_slot():
    with TestClient(app) as client:
        for i in range(SUBMISSION_LIMIT - 1):
            assert client.post('/reports', json={**PAYLOAD, 'location': f'Existing {i}'}).status_code == 201
        with ThreadPoolExecutor(max_workers=5) as pool:
            codes = list(pool.map(lambda i: client.post('/reports', json={**PAYLOAD, 'location': f'Concurrent {i}'}).status_code, range(5)))
        assert sorted(codes) == [201, 429, 429, 429, 429]
        assert budget_used() == SUBMISSION_LIMIT
