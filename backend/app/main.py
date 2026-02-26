from __future__ import annotations

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.trip import router as trip_router


def create_app() -> FastAPI:
    app = FastAPI(title="Trip Planner AI API")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://localhost:4173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(trip_router)

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app


app = create_app()
