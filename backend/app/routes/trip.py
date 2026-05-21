from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import llm

router = APIRouter()


class TripPreferences(BaseModel):
    origin: str
    destination: str
    start_date: str
    end_date: str
    budget: float
    currency: str = "USD"
    budget_priorities: List[str] = Field(default_factory=list)
    activity_preferences: List[str] = Field(default_factory=list)
    trip_type: str = "solo"
    group_size: int = 1
    budget_type: str = "total"
    transport_mode: str = "flight"
    additional_notes: Optional[str] = None


class CityRecommendationsRequest(BaseModel):
    country: str
    limit: int = 5



@router.post("/plan")
async def create_trip_plan(prefs: TripPreferences) -> Dict[str, Any]:
    if not prefs.origin.strip():
        raise HTTPException(status_code=400, detail="Origin is required.")
    if not prefs.destination.strip():
        raise HTTPException(status_code=400, detail="Destination is required.")
    if not prefs.start_date or not prefs.end_date:
        raise HTTPException(status_code=400, detail="Travel dates are required.")
    try:
        start = date.fromisoformat(prefs.start_date)
        end = date.fromisoformat(prefs.end_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Travel dates must use YYYY-MM-DD format.")
    if end <= start:
        raise HTTPException(status_code=400, detail="End date must be after start date.")
    if prefs.budget <= 0:
        raise HTTPException(status_code=400, detail="Budget must be greater than 0.")

    try:
        plan = llm.generate_trip_plan(prefs.model_dump())
        return plan
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate trip plan: {str(e)}")



@router.post("/recommend-cities")
async def recommend_cities(payload: CityRecommendationsRequest) -> Dict[str, Any]:
    if not payload.country.strip():
        raise HTTPException(status_code=400, detail="Country is required.")

    try:
        if not hasattr(llm, "generate_city_recommendations"):
            raise RuntimeError("City recommendation feature is unavailable. Please update backend/app/services/llm.py and restart the server.")
        return llm.generate_city_recommendations(payload.country.strip(), payload.limit)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate city recommendations: {str(e)}")