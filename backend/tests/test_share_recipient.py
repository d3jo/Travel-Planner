"""
Tests for the share-link feature from the *recipient's* perspective —
i.e., what happens when the link is opened by someone other than the owner.

Scenarios covered:
  - Another authenticated user can open the link
  - An unauthenticated (anonymous) visitor can open the link
  - The shared response never leaks private owner data
  - The share link is read-only (no mutations via the shared endpoint)
  - The same link can be opened many times (reusable)
  - Owner deletes the trip → link returns 404
  - Token is case-sensitive (wrong case → 404)
  - Partial token → 404
  - Whitespace-padded token → 404
"""
from __future__ import annotations

import pytest

from tests.conftest import SAMPLE_PLAN, SAMPLE_PREFS


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_and_share(client, headers, title="Shared Trip", destination="Paris"):
    resp = client.post(
        "/trips",
        json={
            "title": title,
            "origin": "Seoul",
            "destination": destination,
            "start_date": "2025-03-01",
            "end_date": "2025-03-08",
            "plan": SAMPLE_PLAN,
            "prefs": SAMPLE_PREFS,
        },
        headers=headers,
    )
    assert resp.status_code == 201
    trip_id = resp.json()["id"]

    share_resp = client.post(f"/trips/{trip_id}/share", headers=headers)
    assert share_resp.status_code == 200
    token = share_resp.json()["share_token"]
    return trip_id, token


# ---------------------------------------------------------------------------
# Access by different user types
# ---------------------------------------------------------------------------

def test_another_authenticated_user_can_open_share_link(client, auth_headers, other_auth_headers):
    """User B (authenticated) must be able to view User A's shared trip."""
    _, token = _create_and_share(client, auth_headers)
    resp = client.get(f"/shared/{token}", headers=other_auth_headers)
    assert resp.status_code == 200


def test_anonymous_user_can_open_share_link(client, auth_headers):
    """No auth header at all — the link must still work."""
    _, token = _create_and_share(client, auth_headers)
    resp = client.get(f"/shared/{token}")  # no headers
    assert resp.status_code == 200


def test_anonymous_user_sees_correct_destination(client, auth_headers):
    _, token = _create_and_share(client, auth_headers, destination="Tokyo")
    assert client.get(f"/shared/{token}").json()["destination"] == "Tokyo"


def test_other_user_sees_correct_plan(client, auth_headers, other_auth_headers):
    _, token = _create_and_share(client, auth_headers)
    data = client.get(f"/shared/{token}", headers=other_auth_headers).json()
    assert data["plan"] == SAMPLE_PLAN


def test_other_user_sees_correct_prefs(client, auth_headers, other_auth_headers):
    _, token = _create_and_share(client, auth_headers)
    data = client.get(f"/shared/{token}", headers=other_auth_headers).json()
    assert data["prefs"] == SAMPLE_PREFS


# ---------------------------------------------------------------------------
# Privacy — response must not leak owner identity
# ---------------------------------------------------------------------------

def test_shared_response_does_not_contain_user_id(client, auth_headers):
    _, token = _create_and_share(client, auth_headers)
    data = client.get(f"/shared/{token}").json()
    assert "user_id" not in data


def test_shared_response_does_not_contain_owner_email(client, auth_headers):
    _, token = _create_and_share(client, auth_headers)
    data = client.get(f"/shared/{token}").json()
    assert "email" not in data


def test_shared_response_does_not_contain_share_token_field(client, auth_headers):
    """The token itself should not be echoed back in the payload."""
    _, token = _create_and_share(client, auth_headers)
    data = client.get(f"/shared/{token}").json()
    assert "share_token" not in data


def test_shared_response_fields_are_exactly_expected(client, auth_headers):
    """Response must contain exactly the documented public fields — nothing more."""
    _, token = _create_and_share(client, auth_headers)
    data = client.get(f"/shared/{token}").json()
    allowed = {"title", "origin", "destination", "start_date", "end_date", "plan", "prefs"}
    assert set(data.keys()) == allowed, f"Unexpected fields: {set(data.keys()) - allowed}"


# ---------------------------------------------------------------------------
# Read-only guarantee — no writes via the shared endpoint
# ---------------------------------------------------------------------------

def test_shared_endpoint_does_not_accept_post(client, auth_headers):
    _, token = _create_and_share(client, auth_headers)
    resp = client.post(f"/shared/{token}", json={"title": "Hacked"})
    assert resp.status_code in (404, 405)


def test_shared_endpoint_does_not_accept_put(client, auth_headers):
    _, token = _create_and_share(client, auth_headers)
    resp = client.put(f"/shared/{token}", json={"title": "Hacked"})
    assert resp.status_code in (404, 405)


def test_shared_endpoint_does_not_accept_delete(client, auth_headers):
    _, token = _create_and_share(client, auth_headers)
    resp = client.delete(f"/shared/{token}")
    assert resp.status_code in (404, 405)


# ---------------------------------------------------------------------------
# Reusability — the same link works multiple times
# ---------------------------------------------------------------------------

def test_share_link_can_be_accessed_multiple_times(client, auth_headers):
    _, token = _create_and_share(client, auth_headers)
    for _ in range(5):
        resp = client.get(f"/shared/{token}")
        assert resp.status_code == 200


def test_share_link_returns_same_data_on_repeated_access(client, auth_headers):
    _, token = _create_and_share(client, auth_headers)
    first = client.get(f"/shared/{token}").json()
    second = client.get(f"/shared/{token}").json()
    assert first == second


def test_two_different_users_get_identical_response(client, auth_headers, other_auth_headers):
    _, token = _create_and_share(client, auth_headers)
    data_owner = client.get(f"/shared/{token}", headers=auth_headers).json()
    data_other = client.get(f"/shared/{token}", headers=other_auth_headers).json()
    assert data_owner == data_other


# ---------------------------------------------------------------------------
# Token validity edge cases
# ---------------------------------------------------------------------------

def test_uppercase_token_returns_404(client, auth_headers):
    _, token = _create_and_share(client, auth_headers)
    resp = client.get(f"/shared/{token.upper()}")
    assert resp.status_code == 404


def test_partial_token_returns_404(client, auth_headers):
    _, token = _create_and_share(client, auth_headers)
    resp = client.get(f"/shared/{token[:16]}")
    assert resp.status_code == 404


def test_token_with_leading_space_returns_404(client, auth_headers):
    _, token = _create_and_share(client, auth_headers)
    resp = client.get(f"/shared/%20{token}")
    assert resp.status_code == 404


def test_empty_token_segment_returns_404_or_405(client):
    resp = client.get("/shared/")
    assert resp.status_code in (404, 405)


# ---------------------------------------------------------------------------
# Link breaks when owner deletes the trip
# ---------------------------------------------------------------------------

def test_share_link_returns_404_after_owner_deletes_trip(client, auth_headers):
    trip_id, token = _create_and_share(client, auth_headers)

    # Verify it works before deletion
    assert client.get(f"/shared/{token}").status_code == 200

    # Owner deletes the trip
    del_resp = client.delete(f"/trips/{trip_id}", headers=auth_headers)
    assert del_resp.status_code in (200, 204)

    # Link must now be dead
    assert client.get(f"/shared/{token}").status_code == 404


def test_anonymous_user_gets_404_after_trip_deleted(client, auth_headers):
    trip_id, token = _create_and_share(client, auth_headers)
    client.delete(f"/trips/{trip_id}", headers=auth_headers)
    resp = client.get(f"/shared/{token}")  # no auth
    assert resp.status_code == 404
