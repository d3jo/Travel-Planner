"""
Authentication test suite — covers registration, login, and token endpoints.

Edge cases addressed:
  - duplicate username/email detection
  - email case-insensitivity
  - username case-sensitivity
  - whitespace trimming on username/email
  - validation boundaries (length, format)
  - login with credentials used to register (the reported regression)
  - JWT token validity after register and login
  - /auth/me with valid, invalid, and missing tokens
"""

from __future__ import annotations
import pytest


# ─── Helpers ──────────────────────────────────────────────────────────────────

def register(client, username="alice", email="alice@example.com", password="pass12"):
    return client.post("/auth/register", json={
        "username": username,
        "email": email,
        "password": password,
    })


def login(client, username="alice", password="pass12"):
    return client.post("/auth/login", json={
        "username": username,
        "password": password,
    })


def me(client, token):
    return client.get(f"/auth/me?token={token}")


# ─── Registration — happy path ─────────────────────────────────────────────────

class TestRegistrationSuccess:
    def test_returns_200(self, client):
        r = register(client)
        assert r.status_code == 200

    def test_returns_access_token(self, client):
        r = register(client)
        assert "access_token" in r.json()
        assert r.json()["access_token"]

    def test_returns_bearer_token_type(self, client):
        r = register(client)
        assert r.json()["token_type"] == "bearer"

    def test_returns_username(self, client):
        r = register(client, username="alice")
        assert r.json()["username"] == "alice"

    def test_returns_email_lowercased(self, client):
        r = register(client, email="Alice@Example.COM")
        assert r.json()["email"] == "alice@example.com"

    def test_username_is_trimmed_in_response(self, client):
        r = register(client, username="  alice  ")
        assert r.json()["username"] == "alice"

    def test_minimum_username_length_2(self, client):
        r = register(client, username="ab")
        assert r.status_code == 200

    def test_minimum_password_length_6(self, client):
        r = register(client, password="abc123")
        assert r.status_code == 200

    def test_token_authenticates_me_endpoint(self, client):
        token = register(client).json()["access_token"]
        r = me(client, token)
        assert r.status_code == 200
        assert r.json()["username"] == "alice"


# ─── Registration — validation failures ───────────────────────────────────────

class TestRegistrationValidation:
    def test_username_too_short_1_char(self, client):
        r = register(client, username="a")
        assert r.status_code == 400
        assert "2" in r.json()["detail"].lower() or "username" in r.json()["detail"].lower()

    def test_username_whitespace_only_rejected(self, client):
        r = register(client, username="   ")
        assert r.status_code == 400

    def test_password_too_short_5_chars(self, client):
        r = register(client, password="ab12!")
        assert r.status_code == 400
        assert "6" in r.json()["detail"].lower() or "password" in r.json()["detail"].lower()

    def test_invalid_email_no_at_sign(self, client):
        r = register(client, email="notanemail")
        assert r.status_code == 400
        assert "email" in r.json()["detail"].lower()

    def test_invalid_email_empty(self, client):
        r = register(client, email="")
        assert r.status_code == 400

    def test_empty_username_rejected(self, client):
        r = register(client, username="")
        assert r.status_code == 400

    def test_empty_password_rejected(self, client):
        r = register(client, password="")
        assert r.status_code == 400


# ─── Registration — duplicate detection ───────────────────────────────────────

class TestRegistrationDuplicates:
    def test_duplicate_username_exact_case(self, client):
        register(client)
        r = register(client, email="other@example.com")
        assert r.status_code == 409
        assert "username" in r.json()["detail"].lower()

    def test_duplicate_username_different_case_is_allowed(self, client):
        """Usernames are case-sensitive: 'alice' and 'Alice' can coexist."""
        register(client, username="alice", email="alice@example.com")
        r = register(client, username="Alice", email="alice2@example.com")
        assert r.status_code == 200

    def test_duplicate_email_exact_case(self, client):
        register(client)
        r = register(client, username="bob", email="alice@example.com")
        assert r.status_code == 409
        assert "email" in r.json()["detail"].lower()

    def test_duplicate_email_different_case(self, client):
        """Emails are case-insensitive: ALICE@example.com == alice@example.com."""
        register(client, email="alice@example.com")
        r = register(client, username="bob", email="ALICE@EXAMPLE.COM")
        assert r.status_code == 409
        assert "email" in r.json()["detail"].lower()

    def test_duplicate_email_mixed_case(self, client):
        register(client, email="alice@example.com")
        r = register(client, username="bob", email="Alice@Example.Com")
        assert r.status_code == 409

    def test_username_with_surrounding_spaces_matches_trimmed(self, client):
        """'  alice  ' trims to 'alice', which conflicts with existing 'alice'."""
        register(client, username="alice")
        r = register(client, username="  alice  ", email="other@example.com")
        assert r.status_code == 409


# ─── Login — happy path ────────────────────────────────────────────────────────

class TestLoginSuccess:
    def test_login_after_register_same_credentials(self, client):
        """Core regression: user should be able to log in with the password they registered with."""
        register(client, username="alice", password="mySecret9")
        r = login(client, username="alice", password="mySecret9")
        assert r.status_code == 200

    def test_login_returns_access_token(self, client):
        register(client)
        r = login(client)
        assert "access_token" in r.json()
        assert r.json()["access_token"]

    def test_login_returns_bearer_token_type(self, client):
        register(client)
        r = login(client)
        assert r.json()["token_type"] == "bearer"

    def test_login_returns_username(self, client):
        register(client, username="alice")
        r = login(client, username="alice")
        assert r.json()["username"] == "alice"

    def test_login_token_authenticates_me_endpoint(self, client):
        register(client, username="alice")
        token = login(client, username="alice").json()["access_token"]
        r = me(client, token)
        assert r.status_code == 200
        assert r.json()["username"] == "alice"

    def test_login_with_trimmed_username(self, client):
        """Username stored as 'alice' — login with '  alice  ' should work since backend trims."""
        register(client, username="alice")
        r = login(client, username="  alice  ")
        assert r.status_code == 200

    def test_multiple_logins_all_succeed(self, client):
        register(client)
        for _ in range(3):
            r = login(client)
            assert r.status_code == 200

    def test_second_login_token_is_valid(self, client):
        register(client, username="alice")
        login(client, username="alice")           # first login
        token = login(client, username="alice").json()["access_token"]  # second
        assert me(client, token).status_code == 200


# ─── Login — failures ─────────────────────────────────────────────────────────

class TestLoginFailures:
    def test_wrong_password(self, client):
        register(client)
        r = login(client, password="wrongpassword")
        assert r.status_code == 401

    def test_nonexistent_username(self, client):
        r = login(client, username="nobody")
        assert r.status_code == 401

    def test_wrong_password_generic_error_no_user_enumeration(self, client):
        """Error message must not reveal whether the username exists."""
        register(client)
        r_wrong_pass = login(client, password="wrong!")
        r_no_user = login(client, username="nobody", password="wrong!")
        assert r_wrong_pass.json()["detail"] == r_no_user.json()["detail"]

    def test_username_case_sensitive_wrong_case_rejected(self, client):
        """Login with 'Alice' when registered as 'alice' must fail."""
        register(client, username="alice")
        r = login(client, username="Alice")
        assert r.status_code == 401

    def test_empty_username(self, client):
        register(client)
        r = login(client, username="")
        assert r.status_code in (401, 422)

    def test_empty_password(self, client):
        register(client)
        r = login(client, password="")
        assert r.status_code == 401

    def test_password_prefix_rejected(self, client):
        """'pass1' should not match 'pass12'."""
        register(client, password="pass12")
        r = login(client, password="pass1")
        assert r.status_code == 401

    def test_password_with_extra_chars_rejected(self, client):
        register(client, password="pass12")
        r = login(client, password="pass123")
        assert r.status_code == 401

    def test_password_case_sensitive(self, client):
        register(client, password="Pass12")
        r = login(client, password="pass12")
        assert r.status_code == 401


# ─── /auth/me endpoint ────────────────────────────────────────────────────────

class TestMeEndpoint:
    def test_me_with_register_token(self, client):
        token = register(client, username="alice", email="alice@example.com").json()["access_token"]
        r = me(client, token)
        assert r.status_code == 200
        data = r.json()
        assert data["username"] == "alice"
        assert data["email"] == "alice@example.com"
        assert "id" in data

    def test_me_with_login_token(self, client):
        register(client, username="alice")
        token = login(client, username="alice").json()["access_token"]
        r = me(client, token)
        assert r.status_code == 200
        assert r.json()["username"] == "alice"

    def test_me_with_invalid_token(self, client):
        r = me(client, "this.is.not.a.valid.jwt")
        assert r.status_code == 401

    def test_me_with_empty_token(self, client):
        r = me(client, "")
        assert r.status_code == 401

    def test_me_with_tampered_token(self, client):
        token = register(client).json()["access_token"]
        tampered = token[:-4] + "XXXX"
        r = me(client, tampered)
        assert r.status_code == 401

    def test_me_with_random_string(self, client):
        r = me(client, "randomgarbage")
        assert r.status_code == 401

    def test_me_returns_id(self, client):
        token = register(client).json()["access_token"]
        r = me(client, token)
        assert isinstance(r.json()["id"], int)
        assert r.json()["id"] > 0

    def test_different_users_get_different_ids(self, client):
        token_a = register(client, username="alice", email="a@a.com").json()["access_token"]
        token_b = register(client, username="bob",   email="b@b.com").json()["access_token"]
        id_a = me(client, token_a).json()["id"]
        id_b = me(client, token_b).json()["id"]
        assert id_a != id_b


# ─── Full round-trip flows ─────────────────────────────────────────────────────

class TestFullFlows:
    def test_register_then_login_then_me(self, client):
        register(client, username="alice", email="alice@example.com", password="secret99")
        token = login(client, username="alice", password="secret99").json()["access_token"]
        profile = me(client, token).json()
        assert profile["username"] == "alice"
        assert profile["email"] == "alice@example.com"

    def test_two_independent_users_coexist(self, client):
        register(client, username="alice", email="alice@example.com")
        register(client, username="bob",   email="bob@example.com")
        token_a = login(client, username="alice").json()["access_token"]
        token_b = login(client, username="bob").json()["access_token"]
        assert me(client, token_a).json()["username"] == "alice"
        assert me(client, token_b).json()["username"] == "bob"

    def test_register_fails_then_retry_with_different_username_succeeds(self, client):
        register(client, username="alice", email="alice@example.com")
        r = register(client, username="alice", email="other@example.com")
        assert r.status_code == 409
        r2 = register(client, username="alicetwo", email="other@example.com")
        assert r2.status_code == 200

    def test_login_before_register_fails(self, client):
        r = login(client, username="ghost", password="pass12")
        assert r.status_code == 401
