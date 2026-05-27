from __future__ import annotations

import json
import uuid
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Trip
from app.routes.auth import get_current_user

router = APIRouter(prefix="/trips", tags=["trips"])


def _auth(authorization: str = Header(None), db: Session = Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token.")
    token = authorization.split(" ", 1)[1]
    return get_current_user(token, db)


class SaveTripRequest(BaseModel):
    title: str
    origin: str
    destination: str
    start_date: str
    end_date: str
    plan: Dict[str, Any]
    prefs: Dict[str, Any] = {}


class TripSummary(BaseModel):
    id: int
    title: str
    origin: str
    destination: str
    start_date: str
    end_date: str
    created_at: str


@router.post("", status_code=201)
def save_trip(req: SaveTripRequest, db: Session = Depends(get_db), user=Depends(_auth)):
    trip = Trip(
        user_id=user.id,
        title=req.title.strip() or f"{req.origin} → {req.destination}",
        origin=req.origin,
        destination=req.destination,
        start_date=req.start_date,
        end_date=req.end_date,
        plan_json=json.dumps(req.plan),
        prefs_json=json.dumps(req.prefs),
    )
    db.add(trip)
    db.commit()
    db.refresh(trip)
    return {"id": trip.id, "title": trip.title}


@router.get("", response_model=List[TripSummary])
def list_trips(db: Session = Depends(get_db), user=Depends(_auth)):
    trips = (
        db.query(Trip)
        .filter(Trip.user_id == user.id)
        .order_by(Trip.created_at.desc())
        .all()
    )
    return [
        TripSummary(
            id=t.id,
            title=t.title,
            origin=t.origin or "",
            destination=t.destination or "",
            start_date=t.start_date or "",
            end_date=t.end_date or "",
            created_at=t.created_at.isoformat(),
        )
        for t in trips
    ]


@router.get("/{trip_id}")
def get_trip(trip_id: int, db: Session = Depends(get_db), user=Depends(_auth)):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.user_id == user.id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found.")
    return {
        "id": trip.id,
        "title": trip.title,
        "origin": trip.origin,
        "destination": trip.destination,
        "start_date": trip.start_date,
        "end_date": trip.end_date,
        "plan": trip.plan(),
        "prefs": trip.prefs(),
        "created_at": trip.created_at.isoformat(),
    }


@router.delete("/{trip_id}", status_code=204)
def delete_trip(trip_id: int, db: Session = Depends(get_db), user=Depends(_auth)):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.user_id == user.id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found.")
    db.delete(trip)
    db.commit()


@router.post("/{trip_id}/share")
def share_trip(trip_id: int, db: Session = Depends(get_db), user=Depends(_auth)):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.user_id == user.id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found.")
    if not trip.share_token:
        trip.share_token = uuid.uuid4().hex
        db.commit()
        db.refresh(trip)
    return {"share_token": trip.share_token}
