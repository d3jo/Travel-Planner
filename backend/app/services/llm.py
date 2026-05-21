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
        "recommended_places": [],
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





def _resolve_transport_mode(origin: str, destination: str, transport_mode: str) -> tuple[str, Optional[str]]:
    """
    Returns (effective_mode, override_reason).
    If user chose own_car/car_rental but the route requires crossing an ocean,
    we force 'flight' and return a reason string.
    """
    if transport_mode not in ("own_car", "car_rental"):
        return transport_mode, None

    check = _responses_text(
        instructions="You are a geography expert. Answer with only YES or NO.",
        user_input=(
            f"Can a person physically drive by land from '{origin}' to '{destination}' "
            "without crossing any ocean? Consider all land borders and road connections. "
            "Answer YES only if a continuous land/road route exists."
        ),
        max_output_tokens=5,
    )
    if check.strip().upper().startswith("Y"):
        return transport_mode, None

    label = "Own Car" if transport_mode == "own_car" else "Car Rental"
    reason = (
        f"{label} isn't feasible for this route (no drivable land connection between "
        f"{origin} and {destination}). Switched to flight automatically."
    )
    return "flight", reason


def generate_trip_plan(preferences: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate a full trip plan from user preferences.
    Returns a structured dict with hotels, activities, itinerary, budget breakdown, and tips.
    """
    origin = preferences.get("origin", "")
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
    raw_transport_mode = preferences.get("transport_mode", "flight")

    # Validate transport feasibility before sending to main LLM
    transport_mode, transport_override_reason = _resolve_transport_mode(origin, destination, raw_transport_mode)

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

    # Formula-based allocation: linear weights from rank, with minimum floors
    _budget_cats = [
        ("hotels_total",       "hotels"),
        ("activities_total",   "activities"),
        ("food_total",         "food"),
        ("transport_total",    "transport"),
        ("shopping_misc_total","shopping_misc"),
    ]
    key_rank: Dict[str, int] = {}
    for i, p in enumerate(budget_priorities):
        mapped = _priority_map.get(p.lower().strip())
        if mapped and mapped not in key_rank:
            key_rank[mapped] = i + 1
    next_r = len(budget_priorities) + 1
    for key, _ in _budget_cats:
        if key not in key_rank:
            key_rank[key] = next_r; next_r += 1

    n = len(_budget_cats)
    weights = {key: max(1, n + 1 - key_rank[key]) for key, _ in _budget_cats}
    total_w = sum(weights.values())
    pcts: Dict[str, float] = {key: weights[key] / total_w for key, _ in _budget_cats}

    # Enforce minimum floors
    for fk, floor in [("shopping_misc_total", 0.12), ("transport_total", 0.05)]:
        if pcts[fk] < floor:
            deficit = floor - pcts[fk]
            others = [k for k, _ in _budget_cats if k != fk]
            ot = sum(pcts[k] for k in others)
            if ot > 0:
                for k in others:
                    pcts[k] -= deficit * pcts[k] / ot
            pcts[fk] = floor

    target_alloc = " | ".join(
        f"{name}: {round(pcts[key] * 100)}%"
        for key, name in _budget_cats
    )
    priority_allocation = ", ".join(
        f"#{i+1} {p}" for i, p in enumerate(budget_priorities)
    ) if budget_priorities else "none"

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
        ' "local_tips": [string], "recommended_places": [{"name": string, "category": string, "why": string, "neighborhood": string}], "must_try_foods": [{"type": string, "dish": string}], "weather_note": string, "currency_note": string}\n'
        f"Generate EXACTLY {nights} itinerary days, 5 hotels, 8-10 activities, 10 food_spots, 8-10 must_try_foods. "
        "All prices in user's currency. Use real place names. "
        "HOTEL PRICING: use realistic current market rates — do NOT underestimate. "
        "Include taxes (12–18%), resort/destination fees, and seasonal demand in price_per_night. "
        "For major cities (Vancouver, Toronto, NYC, London, Paris, Tokyo, Sydney) expect CAD/USD/EUR 180–400+/night for mid-range, 350–700+ for upscale. "
        "hotels_total = price_per_night × nights (already inclusive of all fees). "
        "food_spots.avg_price: number range e.g. '~CAD 18–30/person'. "
        "food_spots.popular_dish: single signature dish. "
        "food_spots.why_popular: 2–3 vivid sentences on atmosphere and must-orders. "
        "food_spots.review_summary: one punchy critic line. "
        "recommended_places: 6–8 specific real venues/attractions. "
        "Prioritize categories that match activity_preferences; if none or to fill remaining slots, diversify across: Park, Museum, Market, Viewpoint, Beach, Cultural Site, Nightlife, Historic Site. "
        "recommended_places[].category: short label e.g. 'Park', 'Museum', 'Market', 'Viewpoint'. "
        "recommended_places[].why: 1 vivid sentence on why it's worth visiting. "
        "must_try_foods.type: cuisine/restaurant category. must_try_foods.dish: signature dish. "
        "weather_note: 2–3 sentences with temp in °C and °F, conditions, what to pack. "
        "budget_breakdown totals = TOTAL GROUP SPEND. grand_total = exact sum of five categories. "
        f"User investment priorities (ranked): {priority_allocation}. "
        f"TARGET budget allocation (follow these percentages): {target_alloc}. "
        "Apply each target % to EFFECTIVE TOTAL BUDGET to get the category total. "
        "shopping_misc covers Uber, metro, snacks, coffee, tips, souvenirs. "
        f"transport_total = round-trip cost to reach destination ({transport_mode}) + local in-city transport. "
        "flight: realistic round-trip airfare. car_rental: rental fee + gas. own_car: gas + tolls + parking only. bus_train: round-trip ticket cost. "
        "IMPORTANT: if the chosen transport_mode is not feasible for this route (e.g. own_car/car_rental for overseas or cross-ocean travel, flight for a short same-city drive), "
        "silently use the most practical alternative instead and note the change in transportation_options[0].notes."
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
        f"TRANSPORT MODE TO DESTINATION: {transport_mode} (from {origin} to {destination})\n"
        f"ADDITIONAL NOTES: {additional_notes or 'None'}\n\n"
        "Generate a complete trip plan as JSON. Use EFFECTIVE TOTAL BUDGET for all budget_breakdown totals."
    )

    raw = _responses_text(instructions=instructions, user_input=user_input, max_output_tokens=5000)
    print("=== LLM RAW (first 200) ===", raw[:200])
    result = _parse_trip_plan_payload(raw)
    print("=== PARSED KEYS ===", {k: (len(v) if isinstance(v, list) else type(v).__name__) for k, v in result.items() if k not in ("_raw",)})
    if result.get("_parse_error"):
        print("=== PARSE FAILED — raw tail ===", raw[-300:])
    if transport_override_reason:
        result["_transport_override"] = transport_override_reason
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
