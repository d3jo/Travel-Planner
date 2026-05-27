from __future__ import annotations

import os

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.trip import router as trip_router
from app.routes.photos import router as photos_router
from app.routes.auth import router as auth_router
from app.routes.saved_trips import router as saved_trips_router
from app.routes.share import router as share_router
from app.database import init_db


def _cors_origins() -> list[str]:
    raw = os.getenv("CORS_ALLOW_ORIGINS", "")
    if raw.strip():
        return [origin.strip() for origin in raw.split(",") if origin.strip()]

    # Keep `null` for Electron/file:// apps.
    return ["null"]


def _cors_origin_regex() -> str:
    configured = os.getenv("CORS_ALLOW_ORIGIN_REGEX", "").strip()
    if configured:
        return configured

    # Default to accepting any http(s) origin in local dev.
    # This prevents brittle failures when frontend port/host changes.
    return r"^https?://.+$"


def create_app() -> FastAPI:
    app = FastAPI(title="Trip Planner AI API")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins(),
        allow_origin_regex=_cors_origin_regex(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    init_db()

    app.include_router(auth_router)
    app.include_router(saved_trips_router)
    app.include_router(share_router)
    app.include_router(trip_router)
    app.include_router(photos_router)

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app


app = create_app()
