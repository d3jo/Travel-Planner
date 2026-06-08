"""
Tests for the share-link feature.

Coverage:
  POST /trips/{trip_id}/share  — generating a share token
  GET  /shared/{token}         — retrieving a shared itinerary
"""
from __future__ import annotations

import re

import pytest

from tests.conftest import SAMPLE_PLAN, SAMPLE_PREFS

UUID_HEX_RE = re.compile(r"^[0-9a-f]{32}$")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _share(client, trip_id, headers):
    return client.post(f"/trips/{trip_id}/share", headers=headers)


def _get_share_token(client, trip_id, headers):
    return _share(client, trip_id, headers).json()["share_token"]


def _create_trip(client, headers, title="Test Trip", origin="NYC", destination="Paris",
                 plan=None, prefs=None):
    resp = client.post(
        "/trips",
        json={
            "title": title,
            "origin": origin,
            "destination": destination,
            "start_date": "2024-09-01",
            "end_date": "2024-09-07",
            "plan": plan or {"days": []},
            "prefs": prefs or {},
        },
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# POST /trips/{trip_id}/share — generating a share token
# ---------------------------------------------------------------------------

def test_share_returns_200_for_own_trip(client, auth_headers, saved_trip_id):
    resp = _share(client, saved_trip_id, auth_headers)
    assert resp.status_code == 200


def test_share_response_contains_share_token_key(client, auth_headers, saved_trip_id):
    resp = _share(client, saved_trip_id, auth_headers)
    assert "share_token" in resp.json()


def test_share_token_is_32_char_hex_string(client, auth_headers, saved_trip_id):
    token = _get_share_token(client, saved_trip_id, auth_headers)
    assert UUID_HEX_RE.match(token), f"Expected 32-char hex UUID, got: {token!r}"


def test_sharing_same_trip_twice_is_idempotent(client, auth_headers, saved_trip_id):
    """Sharing the same trip twice must return the identical token."""
    token_1 = _get_share_token(client, saved_trip_id, auth_headers)
    token_2 = _get_share_token(client, saved_trip_id, auth_headers)
    assert token_1 == token_2


def test_share_requires_authentication(client, saved_trip_id):
    resp = client.post(f"/trips/{saved_trip_id}/share")
    assert resp.status_code == 401


def test_cannot_share_another_users_trip(client, auth_headers, other_auth_headers, saved_trip_id):
    """Trip belongs to auth_headers user; other user must get 404."""
    resp = _share(client, saved_trip_id, other_auth_headers)
    assert resp.status_code == 404


def test_cannot_share_nonexistent_trip(client, auth_headers):
    resp = _share(client, 99999, auth_headers)
    assert resp.status_code == 404


def test_different_trips_get_different_tokens(client, auth_headers):
    id1 = _create_trip(client, auth_headers, title="Trip A", destination="London")
    id2 = _create_trip(client, auth_headers, title="Trip B", destination="Rome")
    token1 = _get_share_token(client, id1, auth_headers)
    token2 = _get_share_token(client, id2, auth_headers)
    assert token1 != token2


# ---------------------------------------------------------------------------
# GET /shared/{token} — accessing a shared itinerary
# ---------------------------------------------------------------------------

def test_valid_share_token_returns_200(client, auth_headers, saved_trip_id):
    token = _get_share_token(client, saved_trip_id, auth_headers)
    resp = client.get(f"/shared/{token}")
    assert resp.status_code == 200


def test_shared_view_requires_no_authentication(client, auth_headers, saved_trip_id):
    """Anyone with the URL must be able to access the trip — no auth needed."""
    token = _get_share_token(client, saved_trip_id, auth_headers)
    resp = client.get(f"/shared/{token}")  # no headers
    assert resp.status_code == 200


def test_shared_response_contains_all_required_fields(client, auth_headers, saved_trip_id):
    token = _get_share_token(client, saved_trip_id, auth_headers)
    data = client.get(f"/shared/{token}").json()
    for field in ("title", "origin", "destination", "start_date", "end_date", "plan", "prefs"):
        assert field in data, f"Missing field in shared response: {field!r}"


def test_shared_title_matches_saved_trip(client, auth_headers, saved_trip_id):
    token = _get_share_token(client, saved_trip_id, auth_headers)
    data = client.get(f"/shared/{token}").json()
    assert data["title"] == "Tokyo Adventure"


def test_shared_origin_matches_saved_trip(client, auth_headers, saved_trip_id):
    token = _get_share_token(client, saved_trip_id, auth_headers)
    assert client.get(f"/shared/{token}").json()["origin"] == "New York"


def test_shared_destination_matches_saved_trip(client, auth_headers, saved_trip_id):
    token = _get_share_token(client, saved_trip_id, auth_headers)
    assert client.get(f"/shared/{token}").json()["destination"] == "Tokyo"


def test_shared_start_date_matches_saved_trip(client, auth_headers, saved_trip_id):
    token = _get_share_token(client, saved_trip_id, auth_headers)
    assert client.get(f"/shared/{token}").json()["start_date"] == "2024-07-01"


def test_shared_end_date_matches_saved_trip(client, auth_headers, saved_trip_id):
    token = _get_share_token(client, saved_trip_id, auth_headers)
    assert client.get(f"/shared/{token}").json()["end_date"] == "2024-07-14"


def test_shared_plan_matches_saved_itinerary_exactly(client, auth_headers, saved_trip_id):
    token = _get_share_token(client, saved_trip_id, auth_headers)
    assert client.get(f"/shared/{token}").json()["plan"] == SAMPLE_PLAN


def test_shared_prefs_match_saved_preferences_exactly(client, auth_headers, saved_trip_id):
    token = _get_share_token(client, saved_trip_id, auth_headers)
    assert client.get(f"/shared/{token}").json()["prefs"] == SAMPLE_PREFS


def test_invalid_token_returns_404(client):
    resp = client.get("/shared/thisisnotavalidtoken")
    assert resp.status_code == 404


def test_nonexistent_hex_token_returns_404(client):
    resp = client.get("/shared/deadbeefdeadbeefdeadbeefdeadbeef")
    assert resp.status_code == 404


def test_404_detail_mentions_not_found_or_expired(client):
    resp = client.get("/shared/deadbeefdeadbeefdeadbeefdeadbeef")
    detail = resp.json().get("detail", "").lower()
    assert "not found" in detail or "expired" in detail


def test_trip_with_no_prefs_returns_empty_dict(client, auth_headers):
    trip_id = _create_trip(client, auth_headers, title="No Prefs Trip", prefs=None)
    token = _get_share_token(client, trip_id, auth_headers)
    data = client.get(f"/shared/{token}").json()
    assert data["prefs"] == {}


def test_shared_plan_preserves_nested_structure(client, auth_headers):
    """Multi-day, multi-activity plan round-trips through share correctly."""
    complex_plan = {
        "days": [
            {
                "day": i,
                "date": f"2024-10-{i:02d}",
                "activities": [
                    {"time": f"{9 + i}:00", "title": f"Activity {i}", "description": f"Day {i} desc"},
                ],
            }
            for i in range(1, 6)
        ]
    }
    trip_id = _create_trip(client, auth_headers, title="Complex Trip", plan=complex_plan)
    token = _get_share_token(client, trip_id, auth_headers)
    assert client.get(f"/shared/{token}").json()["plan"] == complex_plan


def test_share_token_survives_round_trip_via_url(client, auth_headers, saved_trip_id):
    """Token returned by /share can immediately be used to fetch /shared/{token}."""
    token = _get_share_token(client, saved_trip_id, auth_headers)
    resp = client.get(f"/shared/{token}")
    assert resp.status_code == 200
    assert resp.json()["destination"] == "Tokyo"
