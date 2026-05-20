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
        "food_spots": [],  # each: {name, cuisine, avg_price, neighborhood, popular_dish, why_popular, review_summary}
        "transportation_options": [],
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
    budget_type = preferences.get("budget_type", "total")
    additional_notes = preferences.get("additional_notes", "")

    effective_total = budget * group_size if budget_type == "per_person" else budget
    per_person = budget if budget_type == "per_person" else (budget / max(group_size, 1))

    # Compute number of nights
    try:
        from datetime import date as dt
        d1 = dt.fromisoformat(start_date)
        d2 = dt.fromisoformat(end_date)
        nights = max(1, (d2 - d1).days)
    except Exception:
        nights = 5

    # Map user-facing priority labels to budget_breakdown keys
    _priority_map = {
        "hotels": "hotels_total", "hotel": "hotels_total",
        "activities": "activities_total", "activity": "activities_total",
        "food": "food_total", "food & dining": "food_total", "dining": "food_total",
        "transportation": "transport_total", "transport": "transport_total",
        "shopping": "shopping_misc_total", "entertainment": "activities_total",
    }
    priority_allocation = ", ".join(
        f"#{i+1} {p} → boost {_priority_map.get(p.lower().strip(), p.lower())}"
        for i, p in enumerate(budget_priorities)
    ) if budget_priorities else "no specific priorities"

    instructions = (
        "You are an expert travel planner. Output STRICT JSON only — no markdown fences, no extra text.\n"
        "JSON schema (field: type):\n"
        '{"overview": string, "destination_highlights": string,\n'
        ' "hotels": [{"name": string, "type": string, "stars": number, "price_per_night": number, "location": string, "why": string, "amenities": [string], "booking_url": string}],\n'
        ' "activities": [{"name": string, "category": string, "cost_per_person": number, "duration": string, "description": string, "best_time": string, "tags": [string], "booking_url": string}],\n'
        ' "food_spots": [{"name": string, "cuisine": string, "avg_price": string, "neighborhood": string, "popular_dish": string, "why_popular": string, "review_summary": string, "booking_url": string}],\n'
        ' "itinerary": [{"day": number, "date": string, "theme": string, "morning": string, "afternoon": string, "evening": string, "meals": {"breakfast": string, "lunch": string, "dinner": string}, "estimated_daily_cost": number}],\n'
        ' "budget_breakdown": {"hotels_total": number, "activities_total": number, "food_total": number, "transport_total": number, "shopping_misc_total": number, "grand_total": number, "within_budget": boolean, "savings_tip": string},\n'
        ' "transportation_options": [{"mode": string, "estimated_cost_per_group": number, "duration": string, "why": string, "notes": string}],\n'
        ' "local_tips": [string], "best_neighborhoods": [string], "must_try_foods": [{"type": string, "dish": string}], "weather_note": string, "currency_note": string}\n'
        f"Generate EXACTLY {nights} itinerary days, 5 hotels, 8-10 activities, 10 food_spots, 8-10 must_try_foods. "
        "All prices in user's currency. Use real place names. "
        "food_spots.avg_price: number range e.g. '~CAD 18–30/person'. "
        "food_spots.popular_dish: single signature dish. "
        "food_spots.why_popular: 2–3 vivid sentences on atmosphere and must-orders. "
        "food_spots.review_summary: one punchy critic line. "
        "must_try_foods.type: cuisine/restaurant category. must_try_foods.dish: signature dish. "
        "weather_note: 2–3 sentences with temp in °C and °F, conditions, what to pack. "
        "budget_breakdown totals = TOTAL GROUP SPEND. grand_total = exact sum of five categories. "
        f"Budget allocation — user priorities in order: {priority_allocation}. "
        "Default ranges: hotels 30–40%, activities 20–25%, food 12–18%, transport 8–12%, shopping_misc 15–20%. "
        "Shift 5–10% extra toward top-ranked priorities, reduce lower-ranked ones. "
        "shopping_misc covers Uber, metro, snacks, coffee, tips, souvenirs — never below 12%."
    )

    user_input = (
        f"DESTINATION: {destination}\n"
        f"TRAVEL DATES: {start_date} to {end_date} ({nights} nights)\n"
        f"BUDGET (as entered): {budget} {currency} {'per person' if budget_type == 'per_person' else 'total for the group'}\n"
        f"EFFECTIVE TOTAL BUDGET: {effective_total:.2f} {currency} (for all {group_size} travelers)\n"
        f"PER-PERSON BUDGET: {per_person:.2f} {currency}\n"
        f"BUDGET PRIORITIES (most important first): {', '.join(budget_priorities)}\n"
        f"ACTIVITY PREFERENCES: {', '.join(activity_preferences)}\n"
        f"TRIP TYPE: {trip_type}\n"
        f"GROUP SIZE: {group_size} person(s)\n"
        f"ADDITIONAL NOTES: {additional_notes or 'None'}\n\n"
        "Generate a complete trip plan as JSON. Use EFFECTIVE TOTAL BUDGET for all budget_breakdown totals."
    )

    raw = _responses_text(instructions=instructions, user_input=user_input, max_output_tokens=5000)
    print("=== LLM RAW (first 200) ===", raw[:200])
    result = _parse_trip_plan_payload(raw)
    print("=== PARSED KEYS ===", {k: (len(v) if isinstance(v, list) else type(v).__name__) for k, v in result.items() if k not in ("_raw",)})
    if result.get("_parse_error"):
        print("=== PARSE FAILED — raw tail ===", raw[-300:])
    return result




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
