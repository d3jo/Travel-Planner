from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional

from openai import OpenAI

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

_client: Optional[OpenAI] = None


def _get_client() -> OpenAI:
    global _client
    if _client is not None:
        return _client
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not set. Add it to backend/.env before starting the server.")
    _client = OpenAI(api_key=OPENAI_API_KEY)
    return _client


def _responses_text(*, instructions: str, user_input: str, max_output_tokens: int = 2000) -> str:
    client = _get_client()
    _MODELS_NO_TEMP = ("o1", "o3", "o4", "gpt-5")
    supports_temp = not any(OPENAI_MODEL.startswith(m) for m in _MODELS_NO_TEMP)
    kwargs: Dict[str, Any] = dict(
        model=OPENAI_MODEL,
        instructions=instructions,
        input=user_input,
        max_output_tokens=max_output_tokens,
    )
    if supports_temp:
        kwargs["temperature"] = 0.5
    resp = client.responses.create(**kwargs)
    return (resp.output_text or "").strip()




def _extract_first_json_object(raw: str) -> Optional[Dict[str, Any]]:
    """Best-effort JSON extraction when model adds surrounding text."""
    decoder = json.JSONDecoder()
    for idx, ch in enumerate(raw):
        if ch != "{":
            continue
        try:
            obj, _ = decoder.raw_decode(raw[idx:])
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            continue
    return None


def _default_trip_plan(raw_text: str) -> Dict[str, Any]:
    return {
        "overview": raw_text[:500] if raw_text else "Could not parse trip plan.",
        "destination_highlights": "",
        "hotels": [],
        "activities": [],
        "food_spots": [],
        "itinerary": [],
        "budget_breakdown": {
            "hotels_total": 0, "activities_total": 0, "food_total": 0,
            "transport_total": 0, "shopping_misc_total": 0,
            "grand_total": 0, "within_budget": True, "savings_tip": ""
        },
        "local_tips": [],
        "best_neighborhoods": [],
        "must_try_foods": [],
        "weather_note": "",
        "currency_note": "",
        "_parse_error": True,
        "_raw": raw_text[:2000],
    }


def _parse_trip_plan_payload(raw: str) -> Dict[str, Any]:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```")[1]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()

    parsed: Optional[Dict[str, Any]] = None
    try:
        data = json.loads(cleaned)
        if isinstance(data, str):
            data = json.loads(data)
        if isinstance(data, dict):
            parsed = data
    except json.JSONDecodeError:
        parsed = _extract_first_json_object(cleaned)

    if not parsed:
        return _default_trip_plan(cleaned)

    fallback = _default_trip_plan(cleaned)
    fallback.pop("_parse_error", None)
    fallback.pop("_raw", None)
    fallback.update(parsed)
    return fallback

def generate_trip_plan(preferences: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate a full trip plan from user preferences.
    Returns a structured dict with hotels, activities, itinerary, budget breakdown, and tips.
    """
    destination = preferences.get("destination", "")
    start_date = preferences.get("start_date", "")
    end_date = preferences.get("end_date", "")
    budget = preferences.get("budget", 0)
    currency = preferences.get("currency", "USD")
    budget_priorities = preferences.get("budget_priorities", [])
    activity_preferences = preferences.get("activity_preferences", [])
    trip_type = preferences.get("trip_type", "solo")
    group_size = preferences.get("group_size", 1)
    additional_notes = preferences.get("additional_notes", "")

    # Compute number of nights
    try:
        from datetime import date as dt
        d1 = dt.fromisoformat(start_date)
        d2 = dt.fromisoformat(end_date)
        nights = max(1, (d2 - d1).days)
    except Exception:
        nights = 5

    instructions = (
        "You are an expert luxury and budget travel planner. "
        "Given trip preferences, generate a comprehensive, realistic, and exciting trip plan. "
        "Output STRICT JSON only — no markdown fences, no extra text, just the JSON object. "
        "The JSON must match this exact schema:\n"
        "{\n"
        '  "overview": string,\n'
        '  "destination_highlights": string,\n'
        '  "hotels": [\n'
        '    {"name": string, "type": string, "stars": number, "price_per_night": number, "location": string, "why": string, "amenities": [string], "booking_url": string}\n'
        "  ],\n"
        '  "activities": [\n'
        '    {"name": string, "category": string, "cost_per_person": number, "duration": string, "description": string, "best_time": string, "tags": [string], "booking_url": string}\n'
        "  ],\n"
        '  "food_spots": [\n'
        '    {"name": string, "cuisine": string, "price_level": string, "neighborhood": string, "why_popular": string, "review_summary": string, "booking_url": string}\n'
        "  ],\n"
        '  "itinerary": [\n'
        '    {"day": number, "date": string, "theme": string, "morning": string, "afternoon": string, "evening": string, "meals": {"breakfast": string, "lunch": string, "dinner": string}, "estimated_daily_cost": number}\n'
        "  ],\n"
        '  "budget_breakdown": {"hotels_total": number, "activities_total": number, "food_total": number, "transport_total": number, "shopping_misc_total": number, "grand_total": number, "within_budget": boolean, "savings_tip": string},\n'
        '  "local_tips": [string],\n'
        '  "best_neighborhoods": [string],\n'
        '  "must_try_foods": [string],\n'
        '  "weather_note": string,\n'
        '  "currency_note": string\n'
        "}\n"
        f"Generate EXACTLY {nights} itinerary days (day 1 through {nights}). "
        "Recommend EXACTLY 5 hotels and 8-10 activities. Include EXACTLY 10 food_spots. "
        "For hotels, include a clear mix of 4-5 star luxury and budget-friendly options, tuned to budget priorities and notes. "
        "If user priorities favor hotels or luxury, bias toward more premium stays. If they favor savings, include stronger budget options. "
        "All prices in the user's currency. Use real place names and provide valid, direct URLs in booking_url for hotels, activities, and food_spots. "
        "Actively incorporate additional notes into hotels, activities, food recommendations, and itinerary themes."
    )

    user_input = (
        f"DESTINATION: {destination}\n"
        f"TRAVEL DATES: {start_date} to {end_date} ({nights} nights)\n"
        f"TOTAL BUDGET: {budget} {currency}\n"
        f"BUDGET PRIORITIES (most important first): {', '.join(budget_priorities)}\n"
        f"ACTIVITY PREFERENCES: {', '.join(activity_preferences)}\n"
        f"TRIP TYPE: {trip_type}\n"
        f"GROUP SIZE: {group_size} person(s)\n"
        f"ADDITIONAL NOTES: {additional_notes or 'None'}\n\n"
        "Generate a complete trip plan as JSON."
    )

    raw = _responses_text(instructions=instructions, user_input=user_input, max_output_tokens=3000)
    return _parse_trip_plan_payload(raw)




def generate_city_recommendations(country: str, limit: int = 5) -> Dict[str, Any]:
    """Generate top city recommendations for a selected country."""
    limit = max(1, min(int(limit or 5), 10))

    instructions = (
        "You are an expert travel recommender. "
        "Recommend top cities for tourism in the given country. "
        "Output STRICT JSON only with this schema: "
        "{\"country\": string, \"cities\": [{\"name\": string, \"lat\": number, \"lon\": number, \"style_fit\": string, \"description\": string}]}. "
        "Return exactly the number of cities requested with unique city names. "
        "Use real cities and realistic latitude/longitude values. "
        "Keep style_fit and description concise (1 sentence each)."
    )
    user_input = (
        f"COUNTRY: {country}\n"
        f"CITY_COUNT: {limit}\n"
        "Generate recommendations now."
    )

    raw = _responses_text(instructions=instructions, user_input=user_input, max_output_tokens=1200)

    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        data = json.loads(raw)
        cities = data.get("cities") if isinstance(data, dict) else []
        cleaned = []
        for item in (cities or []):
            name = str(item.get("name", "")).strip()
            if not name:
                continue
            cleaned.append({
                "name": name,
                "lat": float(item.get("lat", 0)),
                "lon": float(item.get("lon", 0)),
                "style_fit": str(item.get("style_fit", "Great for many traveler styles.")).strip(),
                "description": str(item.get("description", "A popular city with memorable travel experiences.")).strip(),
            })
            if len(cleaned) >= limit:
                break

        return {"country": country, "cities": cleaned}
    except Exception:
        return {"country": country, "cities": []}
