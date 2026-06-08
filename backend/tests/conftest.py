from __future__ import annotations

import json
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Import models before Base.metadata so tables are registered
from app.database import Base, get_db
from app import models as _models  # noqa: F401


TEST_DATABASE_URL = "sqlite:///:memory:"

SAMPLE_PLAN = {
    "days": [
        {
            "day": 1,
            "date": "2024-07-01",
            "activities": [
                {"time": "09:00", "title": "Arrive at Narita Airport", "description": "Immigration and customs"},
                {"time": "14:00", "title": "Check in to hotel", "description": "Shinjuku area"},
            ],
        },
        {
            "day": 2,
            "date": "2024-07-02",
            "activities": [
                {"time": "10:00", "title": "Senso-ji Temple", "description": "Historic temple in Asakusa"},
            ],
        },
    ]
}

SAMPLE_PREFS = {
    "budget": "mid-range",
    "travel_style": "cultural",
    "accommodation": "hotel",
}


@pytest.fixture(scope="function")
def client():
    engine = create_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    # Patch init_db so create_app() doesn't touch the production SQLite file
    with patch("app.main.init_db"):
        from app.main import create_app
        app = create_app()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client

    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def auth_headers(client):
    client.post("/auth/register", json={
        "username": "testuser",
        "email": "test@example.com",
        "password": "password123",
    })
    resp = client.post("/auth/login", json={
        "username": "testuser",
        "password": "password123",
    })
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def other_auth_headers(client):
    client.post("/auth/register", json={
        "username": "otheruser",
        "email": "other@example.com",
        "password": "password123",
    })
    resp = client.post("/auth/login", json={
        "username": "otheruser",
        "password": "password123",
    })
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def saved_trip_id(client, auth_headers):
    resp = client.post(
        "/trips",
        json={
            "title": "Tokyo Adventure",
            "origin": "New York",
            "destination": "Tokyo",
            "start_date": "2024-07-01",
            "end_date": "2024-07-14",
            "plan": SAMPLE_PLAN,
            "prefs": SAMPLE_PREFS,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201, f"Failed to save trip: {resp.json()}"
    return resp.json()["id"]
