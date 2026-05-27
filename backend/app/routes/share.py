from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Trip

router = APIRouter(tags=["share"])


@router.get("/shared/{share_token}")
def get_shared_trip(share_token: str, db: Session = Depends(get_db)):
    trip = db.query(Trip).filter(Trip.share_token == share_token).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found or link has expired.")
    return {
        "title": trip.title,
        "origin": trip.origin,
        "destination": trip.destination,
        "start_date": trip.start_date,
        "end_date": trip.end_date,
        "plan": trip.plan(),
        "prefs": trip.prefs(),
    }
