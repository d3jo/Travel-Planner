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
        "transportation_options": [],
        "itinerary": [],
        "weekly_plan": [],
        "budget_breakdown": {
            "hotels_total": 0, "activities_total": 0, "food_total": 0,
            "transport_total": 0,
            "transport_range": {"min": 0, "max": 0},
            "transport_breakdown": {"international": {"min": 0, "max": 0, "note": ""}, "local": 0},
            "shopping_misc_total": 0,
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

    # Recompute grand_total from components so it's always consistent
    bb = fallback.get("budget_breakdown", {})
    computed_total = (
        (bb.get("hotels_total") or 0)
        + (bb.get("activities_total") or 0)
        + (bb.get("food_total") or 0)
        + (bb.get("transport_total") or 0)
        + (bb.get("shopping_misc_total") or 0)
    )
    if computed_total > 0:
        bb["grand_total"] = computed_total

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


def _build_trip_plan_prompt(preferences: Dict[str, Any]) -> tuple[str, str]:
    """Build and return (instructions, user_input) for trip plan generation."""
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
    transport_mode = preferences.get("transport_mode", "flight")

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

    # Exclude transport from percentage allocation — its cost is determined by pricing rules, not preference
    _alloc_cats = [(k, n) for k, n in _budget_cats if k != "transport_total"]
    n = len(_alloc_cats)
    weights = {key: max(1, n + 1 - key_rank[key]) for key, _ in _alloc_cats}
    total_w = sum(weights.values())
    pcts: Dict[str, float] = {key: weights[key] / total_w for key, _ in _alloc_cats}

    # Enforce minimum floor for shopping
    if pcts.get("shopping_misc_total", 1) < 0.12:
        deficit = 0.12 - pcts["shopping_misc_total"]
        others = [k for k, _ in _alloc_cats if k != "shopping_misc_total"]
        ot = sum(pcts[k] for k in others)
        if ot > 0:
            for k in others:
                pcts[k] -= deficit * pcts[k] / ot
        pcts["shopping_misc_total"] = 0.12

    target_alloc = " | ".join(
        f"{name}: {round(pcts[key] * 100)}%"
        for key, name in _alloc_cats
    )
    priority_allocation = ", ".join(
        f"#{i+1} {p}" for i, p in enumerate(budget_priorities)
    ) if budget_priorities else "none"

    is_luxury = "luxury" in [p.lower() for p in activity_preferences]
    transport_rank = next(
        (i + 1 for i, p in enumerate(budget_priorities) if "transport" in p.lower()),
        len(budget_priorities) + 1,
    )
    if is_luxury or transport_rank == 1:
        cabin_rule = "Recommend First Class or Business Class as primary option."
    elif transport_rank <= 3:
        cabin_rule = "Recommend Business Class or Premium Economy as primary option."
    else:
        cabin_rule = "Recommend Economy as primary option."

    long_trip = nights > 7
    num_weeks = -(-nights // 7)  # ceiling division

    if long_trip:
        schedule_schema = (
            '"weekly_plan":[{"week":num,"dates":str,"theme":str,"focus":str,'
            '"highlights":[str],"suggested_excursions":[str],"pacing_note":str}],'
            '"itinerary":[],'
        )
        counts_line = (
            f"Counts: EXACTLY {num_weeks} weekly_plan entries (one per week), 4 hotels, "
            "8 activities, 8 food_spots, 5 must_try_foods, 5 recommended_places. "
        )
        weekly_instructions = (
            f"weekly_plan: {num_weeks} entries, one per week. "
            "dates = human-readable range (e.g. 'Jun 3 - Jun 9'). "
            "theme = short catchy title (e.g. 'Settling In & City Highlights'). "
            "focus = 1 sentence on what to prioritise that week. "
            "highlights = 4-5 specific recommended activities/places for that week (real names). "
            "suggested_excursions = 1-2 optional day-trips or nearby towns worth visiting. "
            "pacing_note = 1 practical sentence on pace/logistics for the week.\n"
        )
    else:
        schedule_schema = (
            '"itinerary":[{"day":num,"date":str,"theme":str,"morning":str,"afternoon":str,'
            '"evening":str,"meals":{"breakfast":str,"lunch":str,"dinner":str},"estimated_daily_cost":num}],'
            '"weekly_plan":[],'
        )
        counts_line = (
            f"Counts: EXACTLY {nights} itinerary days, 4 hotels, 6 activities, 6 food_spots, "
            "5 must_try_foods, 5 recommended_places. "
        )
        weekly_instructions = ""

    parts = [
        "You are an expert travel planner. Output STRICT JSON only - no markdown fences, no extra text.\n",
        'Schema: {"overview":str,"destination_highlights":str,',
        '"hotels":[{"name":str,"type":str,"stars":num,"price_per_night":num,"location":str,"why":str,"amenities":[str],"booking_url":str}],',
        '"activities":[{"name":str,"category":str,"cost_per_person":num,"duration":str,"description":str,"best_time":str,"tags":[str],"booking_url":str}],',
        '"food_spots":[{"name":str,"cuisine":str,"avg_price":str,"neighborhood":str,"popular_dish":str,"why_popular":str,"review_summary":str,"booking_url":str}],',
        schedule_schema,
        '"budget_breakdown":{"hotels_total":num,"activities_total":num,"food_total":num,',
        '"transport_total":num,',
        '"transport_range":{"min":num,"max":num},',
        '"transport_breakdown":{"international":{"min":num,"max":num,"note":str},"local":num},',
        '"shopping_misc_total":num,"grand_total":num,"within_budget":bool,"savings_tip":str},',
        '"transportation_options":[{"type":str,"cabin":str,"durationEstimate":str,"why":str,"priceEstimate":{"min":num,"max":num,"currency":str,"confidence":str,"source":"llm_fallback"},"notes":[str]}],',
        '"local_tips":[str],"recommended_places":[{"name":str,"category":str,"why":str,"neighborhood":str}],',
        '"must_try_foods":[{"type":str,"dish":str}],"weather_note":str,"currency_note":str}\n',
        counts_line,
        "Real place names. All prices in user's currency. Be concise.\n",
        "Hotels: realistic rates incl. taxes. Major cities mid-range 180-400+/night. hotels_total = price_per_night x nights.\n",
        "food_spots.avg_price: '~CAD 18-30/person'. popular_dish: one dish. why_popular: 1-2 sentences. review_summary: one line.\n",
        "weather_note: 2 sentences, temp C/F, what to pack.\n",
        weekly_instructions,
        f"Budget: priorities={priority_allocation}. Target allocation (hotels/activities/food/shopping ONLY, NOT transport)={target_alloc}. ",
        "Apply each % to EFFECTIVE TOTAL. grand_total = sum of five categories. shopping_misc = Uber,metro,snacks,coffee,tips,souvenirs.\n",
        "FOOD BUDGET RULES:\n",
        f"- The itinerary covers {nights} days with 3 meals/day for {group_size} traveler(s). ",
        f"food_total MUST be at least {nights * group_size * 45} {currency} ",
        f"(= {nights} nights x {group_size} people x ~45/person/day covering breakfast ~10, lunch ~15, dinner ~20 minimum).\n",
        "- The plan includes 6 restaurant recommendations. Budget for at least 3 sit-down meals per person at those restaurants ",
        "(avg ~30-60/person/visit), on top of everyday meals. Do NOT underestimate food_total to fit within overall budget - ",
        "if the percentage allocation yields less than the floor above, use the floor and reduce shopping_misc or activities_total slightly to compensate.\n",
        "TRANSPORT BUDGET RULES (transport cost is based on real pricing, NOT allocation percentages):\n",
        f"- CRITICAL: Every traveler needs their own ticket/seat. All international costs below are TOTAL for all {group_size} traveler(s) combined.\n",
        f"- transport_breakdown.local = local transport AT the destination for all {group_size} traveler(s) over {nights} nights ",
        "(metro, bus, Uber/taxi within the city). ~10-25/person/day x group_size x nights. For car modes, add parking fees.\n",
        f"- transport_mode is '{transport_mode}'. Apply the matching rule below:\n",
        f"  FLIGHT: Each of the {group_size} traveler(s) needs their own round-trip ticket. ",
        f"international.min = cheapest connecting/budget-carrier round-trip fare PER PERSON x {group_size} (total for group). ",
        f"international.max = direct peak-season economy fare PER PERSON x {group_size} (total for group). ",
        "Connecting flights are typically 25-45% cheaper than direct; note this in international.note. ",
        "Flight fares PER PERSON round-trip: CA/US<->Asia 950-2500; CA/US<->Europe 700-1800; ",
        "CA/US<->Africa/ME 1100-2800; CA/US<->S.America 600-1600; intra-continent 150-600. ",
        f"Example: if per-person fare is 1200, then international.min = 1200 x {group_size} = {1200 * group_size}.\n",
        "  OWN_CAR: User drives their own car - NO rental fee. international.min/max = estimated round-trip fuel cost only ",
        f"(origin to destination and back, all {group_size} traveler(s) sharing one car). ",
        "Estimate driving distance realistically. Fuel: ~0.14-0.18 CAD/km. Add tolls if applicable. ",
        "Set min=low fuel estimate, max=high fuel estimate (traffic/detours/tolls). ",
        "international.note = 'Estimated X km round-trip; fuel and tolls only - no rental fee.'\n",
        f"  CAR_RENTAL: international.min = economy rental (~45-65 CAD/day) x {nights} nights + low fuel. ",
        f"international.max = mid-size/SUV rental (~80-120 CAD/day) x {nights} nights + high fuel. ",
        "international.note = 'Approx X CAD/day rental + fuel. Book in advance for best rates.'\n",
        "  BUS_TRAIN: international.min/max = round-trip ticket price x group_size (each traveler needs their own ticket). ",
        "international.note = 'Round-trip ticket estimate.'\n",
        "- transport_range.min = international.min + local. transport_range.max = international.max + local.\n",
        "- transport_total = round((international.min + international.max) / 2) + local. ",
        "This is the ONLY way to compute transport_total - do NOT use percentages. ",
        "IMPORTANT: transport_total must reflect the FULL cost of travel for ALL travelers including flights/transport TO the destination. ",
        "Do NOT set transport_total to only local transport - international travel cost MUST be included.\n",
        "- transportation_options[0].priceEstimate.min/max MUST equal transport_breakdown.international.min/max exactly. They describe the same cost.\n",
        "- grand_total = hotels_total + activities_total + food_total + transport_total + shopping_misc_total. ",
        "transport_total here includes the full international travel cost (flights/transport TO destination) for ALL travelers - it is NOT just local transport.\n",
        f"CABIN (flights only): {cabin_rule} Provide 2-3 options from recommended down to economy. ",
        "priceEstimate.source='llm_fallback'. confidence=low|medium|high. ",
        "notes must include 'Round-trip estimate' and 'Prices vary by airline and booking date'.\n",
        f"savings_tip: Write ONE specific, practical money-saving tip as if you are a long-time local resident of {destination} - ",
        "not a generic travel tip. Reference a real neighbourhood, market, transit line, local habit, or insider trick that only ",
        "someone who has lived there for years would know. Make it feel personal and place-specific. One sentence, vivid and actionable.",
    ]
    instructions = "".join(parts)

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
        "Generate a complete trip plan as JSON. Use EFFECTIVE TOTAL BUDGET for hotels/activities/food/shopping allocations. "
        "transport_total MUST be derived from the transport pricing rules (midpoint of international range + local), not from the budget percentage."
    )

    return instructions, user_input


def iter_trip_plan_events(preferences: Dict[str, Any]):
    """Streaming generator. Yields {"type":"delta","text":str} chunks, then {"type":"done","result":dict}."""
    instructions, user_input = _build_trip_plan_prompt(preferences)
    client = _get_client()

    _MODELS_NO_TEMP = ("o1", "o3", "o4", "gpt-5")
    supports_temp = not any(OPENAI_MODEL.startswith(m) for m in _MODELS_NO_TEMP)
    kwargs: Dict[str, Any] = dict(
        model=OPENAI_MODEL,
        instructions=instructions,
        input=user_input,
        max_output_tokens=8000,
    )
    if supports_temp:
        kwargs["temperature"] = 0.5

    buffer = ""
    with client.responses.stream(**kwargs) as stream:
        for event in stream:
            if getattr(event, "type", None) == "response.output_text.delta":
                delta = getattr(event, "delta", "") or ""
                if delta:
                    buffer += delta
                    yield {"type": "delta", "text": delta}

    result = _parse_trip_plan_payload(buffer)
    yield {"type": "done", "result": result}


def generate_trip_plan(preferences: Dict[str, Any]) -> Dict[str, Any]:
    for event in iter_trip_plan_events(preferences):
        if event["type"] == "done":
            return event["result"]
    return _default_trip_plan("")


def generate_city_recommendations(country: str, limit: int = 5) -> Dict[str, Any]:
    """Generate top city recommendations for a selected country."""
    limit = max(1, min(int(limit or 5), 10))

    instructions = (
        "You are an expert travel recommender. "
        "Recommend top cities for tourism in the given country. "
        "Output STRICT JSON only with this schema: "
        "{\"country\": string, \"cities\": [{"
        "\"name\": string, \"lat\": number, \"lon\": number, "
        "\"style_fit\": string, \"description\": string, "
        "\"attractions\": [string], \"vibe\": string, \"best_for\": string"
        "}]}. "
        "Return exactly the number of cities requested with unique city names. "
        "Use real cities and realistic latitude/longitude values. "
        "style_fit: 1 sentence on traveler fit. "
        "description: 1 sentence overview. "
        "attractions: exactly 3 iconic must-see places or experiences (short phrases). "
        "vibe: 1 sentence capturing the city's atmosphere and feel. "
        "best_for: 1 sentence on who should visit (e.g. history lovers, foodies, families, adventure seekers)."
    )
    user_input = (
        f"COUNTRY: {country}\n"
        f"CITY_COUNT: {limit}\n"
        "Generate recommendations now."
    )

    raw = _responses_text(instructions=instructions, user_input=user_input, max_output_tokens=1800)

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
            attractions = item.get("attractions", [])
            if not isinstance(attractions, list):
                attractions = []
            cleaned.append({
                "name": name,
                "lat": float(item.get("lat", 0)),
                "lon": float(item.get("lon", 0)),
                "style_fit": str(item.get("style_fit", "Great for many traveler styles.")).strip(),
                "description": str(item.get("description", "A popular city with memorable travel experiences.")).strip(),
                "attractions": [str(a).strip() for a in attractions[:3]],
                "vibe": str(item.get("vibe", "")).strip(),
                "best_for": str(item.get("best_for", "")).strip(),
            })
            if len(cleaned) >= limit:
                break

        return {"country": country, "cities": cleaned}
    except Exception:
        return {"country": country, "cities": []}
