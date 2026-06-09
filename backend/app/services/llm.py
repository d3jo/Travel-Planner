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
        "overview": "Could not parse the trip plan. The response may have been too large — try a shorter trip or fewer destinations.",
        "destination_highlights": "",
        "hotels": [],
        "activities": [],
        "food_spots": [],
        "transportation_options": [],
        "itinerary": [],
        "weekly_plan": [],
        "budget_breakdown": {
            "hotels_total": 0, "hotels_range": {"min": 0, "max": 0},
            "activities_total": 0, "activities_range": {"min": 0, "max": 0},
            "food_total": 0, "food_range": {"min": 0, "max": 0},
            "transport_total": 0,
            "transport_range": {"min": 0, "max": 0},
            "transport_breakdown": {"international": {"min": 0, "max": 0, "note": ""}, "local": 0},
            "shopping_misc_total": 0, "shopping_misc_range": {"min": 0, "max": 0},
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
    destinations = preferences.get("destinations", [])  # multi-city list
    is_multi_city = len(destinations) > 1
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
    accommodation_type = preferences.get("accommodation_type", "hotel")

    effective_total = budget * group_size if budget_type == "per_person" else budget
    per_person = budget if budget_type == "per_person" else (budget / max(group_size, 1))

    # Compute number of nights (0 for same-day / day-trip)
    try:
        from datetime import date as dt
        d1 = dt.fromisoformat(start_date)
        d2 = dt.fromisoformat(end_date)
        nights = max(0, (d2 - d1).days)
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

    # Rank for each category (1 = highest priority)
    num_cats = len(_budget_cats)
    accom_rank  = key_rank.get("hotels_total",        num_cats)
    food_rank   = key_rank.get("food_total",           num_cats)
    activity_rank = key_rank.get("activities_total",   num_cats)
    shopping_rank = key_rank.get("shopping_misc_total",num_cats)

    def _quality_label(rank):
        if rank <= 2: return "HIGH"
        if rank <= 4: return "MEDIUM"
        return "LOW"

    accom_quality   = _quality_label(accom_rank)
    food_quality    = _quality_label(food_rank)
    activity_quality = _quality_label(activity_rank)
    shopping_quality = _quality_label(shopping_rank)

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
    billing_days = max(1, nights)  # use 1 day minimum for food/shopping budgets on day trips

    # For multi-city trips, scale counts per city (min 2 each) and add city field to schema
    num_cities = len(destinations) if is_multi_city else 1
    city_field = ',"city":str' if is_multi_city else ""
    hotels_schema = f'{{"name":str,"type":str,"stars":num,"price_per_night":num,"location":str,"why":str,"amenities":[str],"booking_url":str{city_field}}}'
    activities_schema = f'{{"name":str,"category":str,"cost_per_person":num,"duration":str,"description":str,"best_time":str,"tags":[str],"booking_url":str{city_field}}}'
    food_spots_schema = f'{{"name":str,"cuisine":str,"avg_price":str,"neighborhood":str,"popular_dish":str,"why_popular":str,"review_summary":str,"booking_url":str{city_field}}}'

    hotels_count   = 0 if nights == 0 else max(4, 2 * num_cities)
    activities_count_short = max(6, 2 * num_cities)
    activities_count_long  = max(8, 3 * num_cities)
    food_count     = max(6, 2 * num_cities)

    if long_trip:
        schedule_schema = (
            '"weekly_plan":[{"week":num,"dates":str,"theme":str,"focus":str,'
            '"highlights":[str],"suggested_excursions":[str],"pacing_note":str}],'
            '"itinerary":[],'
        )
        counts_line = (
            f"Counts: EXACTLY {num_weeks} weekly_plan entries (one per week), {hotels_count} hotels, "
            f"{activities_count_long} activities, {food_count} food_spots, 5 must_try_foods, 5 recommended_places. "
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
        itinerary_days = max(1, nights)
        counts_line = (
            f"Counts: EXACTLY {itinerary_days} itinerary day{'s' if itinerary_days != 1 else ''}, {hotels_count} hotels, {activities_count_short} activities, {food_count} food_spots, "
            "5 must_try_foods, 5 recommended_places. "
        )
        weekly_instructions = ""

    multi_city_instruction = (
        f'MULTI-CITY TRIP: Distribute hotels, activities, and food_spots evenly across all {num_cities} cities: {", ".join(destinations)}. '
        f'Each city must have roughly {hotels_count // num_cities} hotels, {activities_count_short // num_cities} activities, and {food_count // num_cities} food_spots. '
        'Set the "city" field on every hotel, activity, and food_spot to exactly the city name it belongs to.\n'
    ) if is_multi_city else ""

    day_trip_instruction = (
        "DAY TRIP (0 nights): The traveler is NOT staying overnight — this is a same-day visit. "
        "Set hotels_total=0, hotels_range={\"min\":0,\"max\":0}, and output hotels=[]. "
        "Itinerary must have EXACTLY 1 day packed with morning, afternoon, and evening activities. "
        "Focus budget on activities, food, and local transport only.\n"
    ) if nights == 0 else ""

    parts = [
        "You are an expert travel planner. Output STRICT JSON only - no markdown fences, no extra text.\n",
        f'Schema: {{"overview":str,"destination_highlights":str,',
        f'"hotels":[{hotels_schema}],',
        f'"activities":[{activities_schema}],',
        f'"food_spots":[{food_spots_schema}],',
        schedule_schema,
        '"budget_breakdown":{"hotels_total":num,"hotels_range":{"min":num,"max":num},',
        '"activities_total":num,"activities_range":{"min":num,"max":num},',
        '"food_total":num,"food_range":{"min":num,"max":num},',
        '"transport_total":num,',
        '"transport_range":{"min":num,"max":num},',
        '"transport_breakdown":{"international":{"min":num,"max":num,"note":str},"local":num},',
        '"shopping_misc_total":num,"shopping_misc_range":{"min":num,"max":num},',
        '"grand_total":num,"within_budget":bool,"savings_tip":str},',
        '"transportation_options":[{"type":str,"cabin":str,"durationEstimate":str,"why":str,"priceEstimate":{"min":num,"max":num,"currency":str,"confidence":str,"source":"llm_fallback"},"notes":[str]}],',
        '"local_tips":[str],"recommended_places":[{"name":str,"category":str,"why":str,"neighborhood":str}],',
        '"must_try_foods":[{"type":str,"dish":str}],"weather_note":str,"currency_note":str}\n',
        counts_line,
        multi_city_instruction,
        day_trip_instruction,
        "Real place names. All prices in user's currency. Be concise.\n",
        f"ACCOMMODATION TYPE: User prefers '{accommodation_type}'. Follow the rules and rate table below exactly.\n",
        "- 'hotel': Traditional hotels, boutique hotels, resorts only. type = 'Hotel', 'Boutique Hotel', 'Resort', etc.\n",
        "- 'airbnb': Vacation rentals, serviced apartments, guesthouses — NOT hotels. type = 'Vacation Rental', 'Airbnb', 'Serviced Apartment', 'Guesthouse'. "
        "booking_url must point to airbnb.com search for the destination.\n",
        "- 'hostel': Hostels and budget stays only. type = 'Hostel', 'Budget Hostel', 'Party Hostel'. "
        "Mix private rooms and dorm beds; use appropriate rate per bed/room type.\n",
        "- 'mixed': At least one hotel, one Airbnb/rental, and one hostel. Apply the matching rate row for each.\n",
        "NIGHTLY RATE REFERENCE TABLE (all in user's currency, per unit, taxes included):\n",
        "Classify the destination into one of three tiers before picking rates:\n",
        "  BUDGET tier — SE Asia (Thailand/Vietnam/Indonesia/Philippines/Cambodia), South Asia (India/Nepal/Sri Lanka), "
        "Eastern Europe (Poland/Hungary/Romania/Bulgaria), Central America, most of Africa, rural/small-city destinations.\n",
        "  MID tier — Southern/Western Europe (Spain/Italy/France/Germany/Portugal), East Asia (Japan/South Korea/Taiwan/HK), "
        "major cities in Latin America (Mexico City/Buenos Aires/São Paulo), Middle East (Dubai/Jordan), Australia/NZ outside city centres.\n",
        "  PREMIUM tier — North America cities (NYC/Toronto/Vancouver/LA/SF/Chicago/Miami), London/Paris/Zurich/Amsterdam/Oslo/Copenhagen/Stockholm/Singapore/Sydney CBD/Tokyo central.\n",
        "  | Accommodation  | BUDGET tier      | MID tier          | PREMIUM tier        |\n",
        "  | Hotel (3★)     | 40–80/night      | 100–180/night     | 180–320/night       |\n",
        "  | Hotel (4–5★)   | 80–160/night     | 180–350/night     | 320–600+/night      |\n",
        "  | Airbnb entire  | 35–75/night      | 90–170/night      | 160–350/night       |\n",
        "  | Airbnb room    | 18–40/night      | 45–90/night       | 80–160/night        |\n",
        "  | Hostel private | 15–30/night      | 30–65/night       | 55–100/night        |\n",
        "  | Hostel dorm    | 6–15/night       | 15–35/night       | 30–60/night         |\n",
        "The priority-based quality rules below determine where within each cell to pick.\n",
        "food_spots.avg_price: '~CAD 18-30/person'. popular_dish: one dish. why_popular: 1-2 sentences. review_summary: one line.\n",
        "weather_note: 2 sentences, temp C/F, what to pack.\n",
        weekly_instructions,
        "CORE RULE: Plan at REALISTIC prices first. NEVER fabricate low prices to fit the budget — "
        "set within_budget=false if realistic grand_total exceeds the user's budget.\n",
        f"PRIORITY-BASED QUALITY — the user ranked their investment priorities as: {priority_allocation}.\n",
        "Each category has a priority level (HIGH/MEDIUM/LOW) that controls BOTH the quality chosen AND the price point within the tier range:\n",
        "  HIGH priority  → pick from the UPPER third of the tier range; upgrade quality (nicer room, finer restaurants, more activities).\n",
        "  MEDIUM priority → pick from the MIDDLE of the tier range.\n",
        "  LOW priority   → pick from the LOWER-MIDDLE of the tier range, but never below the absolute floor.\n",
        f"ACCOMMODATION PRICING (accommodation priority = {accom_quality}, rank #{accom_rank}):\n",
        f"STEP A — classify the destination tier (Budget/Mid/Premium) using the rate table above.\n",
        f"STEP B — pick price_per_night based on priority:\n",
        f"  HIGH  priority: upper third of tier cell (e.g. Hotel Mid → 250–350/night, Airbnb Mid → 140–170/night)\n",
        f"  MEDIUM priority: middle of tier cell    (e.g. Hotel Mid → 150–220/night, Airbnb Mid → 110–140/night)\n",
        f"  LOW   priority: lower-middle of tier cell but ≥ floor (e.g. Hotel Mid → 110–150/night)\n",
        f"STEP C — hotels_total = price_per_night × {nights} nights × rooms (1 room for solo/couple, 2 for group ≥3).\n",
        f"STEP D — this value is authoritative. Never reduce it below Step C to hit a budget percentage.\n",
        f"ABSOLUTE MINIMUM price_per_night (floor, regardless of priority):\n",
        f"  Hotel: Budget 50 | Mid 110 | Premium 200\n",
        f"  Airbnb entire home: Budget 40 | Mid 95 | Premium 170\n",
        f"  Airbnb private room: Budget 20 | Mid 50 | Premium 90\n",
        f"  Hostel private room: Budget 18 | Mid 35 | Premium 60\n",
        f"  Hostel dorm bed: Budget 8 | Mid 18 | Premium 35\n",
        f"stars field: set for hotels (3 or 4 or 5). Set to 0 for Airbnb and hostels.\n",
        f"FOOD BUDGET RULES (food priority = {food_quality}, rank #{food_rank}):\n",
        f"- Base food rate scales with priority:\n",
        f"  HIGH  priority: ~{billing_days * group_size * 85} {currency} target "
        f"(≈85/person/day — nicer restaurants, multi-course meals, wine, desserts).\n",
        f"  MEDIUM priority: ~{billing_days * group_size * 60} {currency} target "
        f"(≈60/person/day — mix of sit-down and casual).\n",
        f"  LOW   priority: minimum {billing_days * group_size * 45} {currency} "
        f"(≈45/person/day floor — mostly casual and street food).\n",
        f"- Use the target matching food priority ({food_quality}) as food_total. "
        f"Never go below the LOW floor of {billing_days * group_size * 45} {currency}.\n",
        f"ACTIVITIES BUDGET (activity priority = {activity_quality}, rank #{activity_rank}):\n",
        f"- {activity_quality} priority: "
        + ("plan premium experiences, guided tours, entrance fees to top attractions — allocate generously.\n" if activity_quality == "HIGH"
           else "mix of paid and free activities — moderate allocation.\n" if activity_quality == "MEDIUM"
           else "mostly free/low-cost activities; only 1-2 paid experiences.\n"),
        f"- activities_total target: {round(pcts.get('activities_total', 0.15) * effective_total)} {currency} "
        f"({round(pcts.get('activities_total', 0.15) * 100)}% of effective budget).\n",
        f"SHOPPING & MISC (shopping priority = {shopping_quality}, rank #{shopping_rank}):\n",
        f"- shopping_misc covers: Uber/taxi, metro/bus, coffee, snacks, tips, souvenirs, SIM cards, pharmacy, laundry.\n",
        f"- {shopping_quality} priority target: "
        + (f"{billing_days * group_size * 50}–{billing_days * group_size * 80} {currency} (generous shopping + souvenirs).\n" if shopping_quality == "HIGH"
           else f"{billing_days * group_size * 30}–{billing_days * group_size * 50} {currency} (moderate incidentals).\n" if shopping_quality == "MEDIUM"
           else f"{billing_days * group_size * 20}–{billing_days * group_size * 35} {currency} (essentials only).\n"),
        f"- shopping_misc_total must be at least {billing_days * group_size * 20} {currency}. Never set to 0.\n",
        f"REMAINING BUDGET RULE: after setting all category values from the rules above, "
        f"if the sum is below the effective budget ({effective_total} {currency}), "
        f"allocate the surplus to the highest-ranked category (rank #{accom_rank if accom_rank < food_rank else food_rank} "
        f"= {'accommodation' if accom_rank <= food_rank else 'food'}) by upgrading quality further.\n",
        "If grand_total exceeds effective budget, set within_budget=false. Do NOT compress floors to force within_budget=true.\n",
        "TRANSPORT BUDGET RULES — use explicit arithmetic, never invent totals:\n",
        f"STEP 1 — determine per-person flight cost (round-trip economy) based on ACTUAL origin '{origin}' and destination '{destination}'.\n",
        "Use ONLY the origin and destination cities — do NOT infer home country from currency.\n",
        "Route reference table (per-person round-trip economy, taxes included, booked 4–8 weeks out):\n",
        "  Intra-East-Asia ≤3h (Seoul/Tokyo/Osaka/Taipei/HK to each other): CAD 300–600. ",
        "  Example confirmed fares: Seoul↔Osaka ~CAD 300–450, Seoul↔Tokyo ~CAD 320–500, Tokyo↔Taipei ~CAD 350–550.\n",
        "  Intra-SE-Asia ≤4h (Bangkok/Singapore/KL/Manila/Bali to each other): CAD 250–550.\n",
        "  Asia cross-regional 4–8h (Korea/Japan↔SE Asia, Japan↔India): CAD 600–1200.\n",
        "  Asia↔Oceania 8–10h (Tokyo/Seoul↔Sydney/Auckland): CAD 1000–1800.\n",
        "  North America↔East Asia 10–14h (Vancouver/Toronto↔Tokyo/Seoul/Beijing): CAD 1400–2500. ",
        "  Example confirmed fares: Toronto↔Tokyo ~CAD 1600–2200, Vancouver↔Seoul ~CAD 1400–2000.\n",
        "  North America↔Europe 7–10h (Toronto/NYC↔London/Paris/Frankfurt): CAD 900–1900.\n",
        "  North America↔SE Asia/South Asia 14h+ (Toronto↔Bangkok/Singapore/Mumbai): CAD 1600–3200.\n",
        "  Intra-Europe (budget carriers, e.g. Ryanair/easyJet): CAD 150–500.\n",
        "  Europe↔Middle East/Africa 4–8h: CAD 600–1400.\n",
        "IMPORTANT: These are TYPICAL economy fares, NOT the absolute cheapest flash sales. ",
        "Pick a realistic midpoint for the specific city pair — do NOT anchor to the low end of the range.\n",
        "Set: flight_low_pp = lower quarter of range for specific cities, flight_high_pp = upper quarter.\n",
        f"STEP 2 — local transport at destination for ONE person: ~10–20/person/day × {billing_days} day{'s' if billing_days != 1 else ''}. ",
        "Add airport transfer if needed (~15–40 each way). Set: local_pp = total local per person.\n",
        f"STEP 3 — arithmetic (all per person):\n",
        "  transport_pp_low  = flight_low_pp  + local_pp\n",
        "  transport_pp_high = flight_high_pp + local_pp\n",
        f"STEP 4 — scale to group:\n",
        f"  international.min = flight_low_pp  × {group_size}\n",
        f"  international.max = flight_high_pp × {group_size}\n",
        f"  local             = local_pp × {group_size}\n",
        f"  transport_range.min = transport_pp_low  × {group_size}\n",
        f"  transport_range.max = transport_pp_high × {group_size}\n",
        f"  transport_total = round((transport_pp_low + transport_pp_high) / 2) × {group_size}\n",
        f"  transportation_options[0].priceEstimate.min = international.min = flight_low_pp × {group_size}\n",
        f"  transportation_options[0].priceEstimate.max = international.max = flight_high_pp × {group_size}\n",
        "CONSISTENCY CHECK before outputting — verify all of these:\n",
        "  ✓ international.min = flight_low_pp × group_size (not a guess)\n",
        "  ✓ transport_range.min = international.min + local\n",
        "  ✓ transport_total = midpoint of range\n",
        f"  ✓ priceEstimate.min = international.min (group total, NOT per-person; frontend divides by group_size={group_size})\n",
        f"  ✓ priceEstimate.max = international.max (group total, NOT per-person; frontend divides by group_size={group_size})\n",
        "  ✓ grand_total = hotels + activities + food + transport_total + shopping\n",
        f"OWN_CAR override: international.min/max = round-trip fuel for all {group_size} travelers. ",
        "Fuel ~0.14–0.18/km. international.note = 'Estimated X km round-trip; fuel and tolls only.'\n",
        f"CAR_RENTAL override: international.min = economy ~45–65/day × {billing_days} day{'s' if billing_days != 1 else ''} + low fuel (group total). ",
        f"international.max = mid-size ~80–120/day × {billing_days} day{'s' if billing_days != 1 else ''} + high fuel (group total).\n",
        "BUS_TRAIN override: international.min/max = total round-trip ticket cost for all travelers.\n",
        "Connecting flights are typically 25–45% cheaper than direct; note this in international.note.\n",
        "- grand_total = hotels_total + activities_total + food_total + transport_total + shopping_misc_total. ",
        "transport_total includes ALL travel + local for ALL travelers.\n",
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
        f"TRAVEL DATES: {start_date} to {end_date} ({nights} night{'s' if nights != 1 else ''}{' — single-day trip, no overnight stays' if nights == 0 else ''})\n"
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
        "transport_total MUST be derived from the transport pricing rules (midpoint of international range + local), not from the budget percentage.\n"
        "For each non-transport category, set _total to the realistic midpoint and _range.min/max as follows:\n"
        "  hotels_range: min = budget option within tier (lower quarter), max = nicer option within tier (upper quarter).\n"
        "  activities_range: min = fewer/free activities, max = more paid experiences.\n"
        "  food_range: min = mostly street food / casual, max = mix of upscale restaurants.\n"
        "  shopping_misc_range: min = minimal shopping, max = active shopping. Range ~±20-30% of total.\n"
        "grand_total = hotels_total + activities_total + food_total + transport_total + shopping_misc_total."
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
        max_output_tokens=16000,
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
