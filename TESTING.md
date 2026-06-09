# Testing Guide

All commands assume you are at the repo root (`Travel-Planner/`) unless noted.

---

## Quick Reference

| Suite | Command | What it tests |
|---|---|---|
| All backend tests | `cd backend && ../.venv-run pytest` | Share API, auth API, saved trips |
| Share — generation | `cd backend && ../.venv-run pytest tests/test_share.py` | Token creation, ownership, idempotency |
| Share — recipients | `cd backend && ../.venv-run pytest tests/test_share_recipient.py` | Access by other users, privacy, read-only |
| Mobile E2E | `cd frontend && npm run test:mobile` | Viewport, touch targets, iOS zoom, overflow |
| Mobile E2E (one device) | `cd frontend && npm run test:mobile -- --project="iPhone 12"` | Same, iPhone 12 only |
| Mobile E2E report | `cd frontend && npm run test:mobile:report` | Run + open HTML report |

---

## Prerequisites

### Backend (Python)

The backend tests use `pytest` with an in-memory SQLite database — no running server needed.

```bash
# First-time setup (creates venv and installs deps)
./start.sh   # or manually:
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
backend/.venv/bin/pip install pytest
```

### Frontend / E2E (Node + Playwright)

```bash
# Install Node deps (includes Playwright)
cd frontend && npm install

# Download Playwright browser (one-time, ~92 MB)
npx playwright install chromium
```

---

## Backend Tests

Run from the `backend/` directory. The test runner starts its own in-memory database — no `.env` or live server required.

```bash
cd backend
```

### Run everything

```bash
.venv/bin/python -m pytest tests/ -v
```

### Share link — token generation (`test_share.py`)

Tests `POST /trips/{id}/share` (creating a token) and `GET /shared/{token}` (basic retrieval).

```bash
.venv/bin/python -m pytest tests/test_share.py -v
```

| Test | What it checks |
|---|---|
| `test_share_returns_200_for_own_trip` | Owner gets 200 when sharing their own trip |
| `test_share_token_is_32_char_hex_string` | Token format is a 32-char UUID hex |
| `test_sharing_same_trip_twice_is_idempotent` | Sharing twice returns the same token |
| `test_share_requires_authentication` | Unauthenticated share attempt → 401 |
| `test_cannot_share_another_users_trip` | Cross-user share attempt → 404 |
| `test_different_trips_get_different_tokens` | Each trip gets a unique token |
| `test_valid_share_token_returns_200` | Valid token → 200 on GET /shared/{token} |
| `test_shared_view_requires_no_authentication` | No auth header needed for shared view |
| `test_shared_response_contains_all_required_fields` | Response has title, origin, destination, dates, plan, prefs |
| `test_shared_plan_preserves_nested_structure` | Multi-day itinerary round-trips correctly |
| `test_invalid_token_returns_404` | Garbage token → 404 |
| `test_404_detail_mentions_not_found_or_expired` | Error message is user-friendly |

### Share link — recipient access (`test_share_recipient.py`)

Tests the link from the perspective of someone other than the owner: another user, an anonymous visitor, privacy guarantees, and link lifecycle.

```bash
.venv/bin/python -m pytest tests/test_share_recipient.py -v
```

| Group | Tests |
|---|---|
| **Access** | Another authenticated user, anonymous visitor, correct plan/prefs/destination shown |
| **Privacy** | No `user_id`, `email`, or `share_token` in response; exactly the 7 expected fields |
| **Read-only** | POST / PUT / DELETE to `/shared/{token}` all rejected |
| **Reusability** | Same link works 5× in a row, returns identical data each time |
| **Token edge cases** | Uppercase → 404, partial → 404, leading space → 404, empty segment → 404/405 |
| **Lifecycle** | Owner deletes trip → link dies (404) for both auth and anonymous visitors |

### Filter by keyword

```bash
# Run only tests related to authentication
.venv/bin/python -m pytest tests/ -k "auth" -v

# Run only privacy tests
.venv/bin/python -m pytest tests/ -k "user_id or email or token_field or fields_are_exactly" -v

# Run only lifecycle tests (delete)
.venv/bin/python -m pytest tests/ -k "deleted" -v
```

### Verbose output + stop on first failure

```bash
.venv/bin/python -m pytest tests/ -v -x
```

---

## E2E Mobile Tests (Playwright)

Run from the `frontend/` directory. Playwright automatically starts the Vite dev server on port 5100 before running tests (macOS ControlCenter permanently holds port 5000, so tests use 5100).

```bash
cd frontend
```

### Devices tested

| Project name | Device | Viewport | UA |
|---|---|---|---|
| `iPhone 12` | iPhone 12 | 390×844 | Mobile Safari |
| `iPhone SE` | iPhone SE (3rd gen) | 375×667 | Mobile Safari |
| `Pixel 5` | Pixel 5 | 393×851 | Chrome Android |
| `Galaxy S9+` | Samsung Galaxy S9+ | 320×658 | Chrome Android |

### Run all devices (96 test runs: 24 tests × 4 devices)

```bash
npm run test:mobile
```

### Run a single device

```bash
npm run test:mobile -- --project="iPhone 12"
npm run test:mobile -- --project="iPhone SE"
npm run test:mobile -- --project="Pixel 5"
npm run test:mobile -- --project="Galaxy S9+"
```

### Run a specific test group

```bash
# No horizontal scroll checks
npm run test:mobile -- --grep "No horizontal scroll"

# Touch target size checks
npm run test:mobile -- --grep "Touch targets"

# iOS zoom prevention (input font-size ≥ 16px)
npm run test:mobile -- --grep "Input font-size"

# Tap highlight checks
npm run test:mobile -- --grep "Tap highlight"

# Wizard page usability
npm run test:mobile -- --grep "Wizard page"

# Share link for anonymous mobile visitors
npm run test:mobile -- --grep "Share link"

# Auth page form usability
npm run test:mobile -- --grep "Auth page"

# All routes fit viewport
npm run test:mobile -- --grep "All routes"
```

### Generate and open an HTML report

```bash
npm run test:mobile:report
```

### Run with traces on every test (useful for debugging)

```bash
npm run test:mobile -- --trace on
npx playwright show-trace test-results/<test-folder>/trace.zip
```

### Run headed (see the browser)

```bash
npm run test:mobile -- --headed --project="iPhone 12"
```

### What the mobile suite checks

| # | Check | Devices |
|---|---|---|
| 1 | No horizontal scroll on any page | All 4 |
| 2 | All interactive elements ≥ 44px tap area | All 4 |
| 3 | Input `font-size ≥ 16px` (prevents iOS auto-zoom) | All 4 |
| 4 | `-webkit-tap-highlight-color: transparent` on buttons | All 4 |
| 5 | Wizard loads without JS errors | All 4 |
| 6 | Destination input is visible and focusable | All 4 |
| 7 | Light/dark toggle is visible and tall enough to tap | All 4 |
| 8 | Loading animation fits within viewport | All 4 |
| 9 | Share link accessible to unauthenticated visitors | All 4 |
| 10 | Auth form inputs focusable, submit button ≥ 44px | All 4 |
| 11 | My Trips page renders without crash | All 4 |
| 12 | Every route body width ≤ viewport width | All 4 |

---

## Running Everything at Once

```bash
# 1. Backend tests
cd backend && .venv/bin/python -m pytest tests/ -v

# 2. Mobile E2E tests (from project root)
cd ../frontend && npm run test:mobile
```

---

## Test File Locations

```
Travel-Planner/
├── backend/
│   └── tests/
│       ├── conftest.py              # Shared fixtures (test client, auth headers, sample data)
│       ├── test_share.py            # Share token generation + basic retrieval (45 tests)
│       └── test_share_recipient.py  # Share link recipient access (21 tests)
└── frontend/
    ├── playwright.config.js         # Playwright device config + webServer setup
    └── e2e/
        └── mobile.spec.js           # Mobile regression suite (24 tests × 4 devices)
```

---

## Gaps — Test Areas Not Yet Covered

These routes exist but have no tests yet. Good candidates for future test files:

| Area | Route(s) | Suggested file |
|---|---|---|
| Auth — registration | `POST /auth/register` | `backend/tests/test_auth.py` |
| Auth — login / JWT | `POST /auth/login`, `GET /auth/me` | `backend/tests/test_auth.py` |
| Saved trips CRUD | `POST/GET/DELETE /trips`, `GET /trips/{id}` | `backend/tests/test_saved_trips.py` |
| Trip planning | `POST /plan`, `POST /plan/stream` | `backend/tests/test_trip_plan.py` (mock LLM) |
| City recommendations | `POST /recommend-cities` | `backend/tests/test_trip_plan.py` (mock LLM) |
| Desktop E2E | Full wizard → plan → save flow | `frontend/e2e/desktop.spec.js` |
