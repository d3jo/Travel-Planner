# Multi-Select Transport Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to select multiple transport modes (e.g. Flight + Car Rental) so the AI budget understands and prices each mode independently.

**Architecture:** `transportMode: string` becomes `transportModes: string[]` throughout the stack. The Wizard UI flips from radio buttons to toggle buttons. The backend Pydantic model gains `transport_modes: List[str]` (backward-compatible). The LLM prompt receives the full list and applies combination rules: when flight + car_rental are both selected, flight covers the intercity leg and car_rental prices a local rental at the destination — not driving there.

**Tech Stack:** React (Wizard.jsx, TripPlan.jsx), FastAPI + Pydantic (trip.py), Python prompt-building (llm.py)

---

## Files

| File | Change |
|---|---|
| `frontend/src/pages/Wizard.jsx` | State, UI toggles, disabled-mode filtering, payload |
| `backend/app/routes/trip.py` | Add `transport_modes: List[str]`, derive compat `transport_mode` |
| `backend/app/services/llm.py` | Extract modes list, rewrite transport prompt section |
| `frontend/src/pages/TripPlan.jsx` | Read `transport_modes` array for budget row label |

---

## Task 1: Wizard — state and payload

**Files:**
- Modify: `frontend/src/pages/Wizard.jsx:1325` (state), `:1378` (payload), `:1732` (disabled effect)

- [ ] **Step 1: Change the state from string to array**

In `Wizard.jsx` around line 1325, replace:
```js
const [transportMode, setTransportMode] = useState("flight");
```
with:
```js
const [transportModes, setTransportModes] = useState(["flight"]);
```

- [ ] **Step 2: Update the submit payload**

Around line 1378, replace:
```js
transport_mode: transportMode,
```
with:
```js
transport_modes: transportModes,
transport_mode: transportModes[0] ?? "flight",   // backward-compat for saved trips
```

- [ ] **Step 3: Update the prop passed to StepDatesAndBudget (line ~1504)**

Replace:
```jsx
transportMode={transportMode} setTransportMode={setTransportMode}
```
with:
```jsx
transportModes={transportModes} setTransportModes={setTransportModes}
```

- [ ] **Step 4: Fix the disabled-modes auto-clean effect (line ~1732)**

Replace:
```js
useEffect(() => {
  if (disabledModes.has(transportMode)) setTransportMode("flight");
}, [disabledModes, transportMode, setTransportMode]);
```
with:
```js
useEffect(() => {
  setTransportModes((prev) => {
    const filtered = prev.filter((m) => !disabledModes.has(m));
    if (filtered.length === 0) return ["flight"];
    return filtered.length === prev.length ? prev : filtered;
  });
}, [disabledModes]);
```

- [ ] **Step 5: Verify the app still loads and the Wizard opens without console errors**

---

## Task 2: Wizard — multi-select toggle UI

**Files:**
- Modify: `frontend/src/pages/Wizard.jsx` — `StepDatesAndBudget` function signature and the transport mode rendering block (~lines 1632, 1901–1948)

- [ ] **Step 1: Update the StepDatesAndBudget function signature (line ~1632)**

Replace `transportMode, setTransportMode,` with `transportModes, setTransportModes,` in the destructured props.

- [ ] **Step 2: Replace the disabled-modes single-select block with a multi-select toggle**

Find the block starting at line ~1901 (`{TRANSPORT_MODES.map...}`) and replace the entire transport-mode section (lines ~1897–1948) with:

```jsx
{/* Transport mode — multi-select */}
<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
  <div style={styles.stepTitle}>How are you getting there?</div>
  <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: -4 }}>
    Select all that apply — e.g. fly there and rent a car locally
  </div>
  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 7 }}>
    {TRANSPORT_MODES.map(({ id, label, hint }) => {
      const sel = transportModes.includes(id);
      const disabled = disabledModes.has(id);
      return (
        <button
          key={id}
          type="button"
          onClick={() => {
            if (disabled) return;
            setTransportModes((prev) => {
              if (prev.includes(id)) {
                // Don't allow deselecting the last mode
                if (prev.length === 1) return prev;
                return prev.filter((m) => m !== id);
              }
              return [...prev, id];
            });
          }}
          disabled={disabled}
          title={disabled ? "Not available for this route" : undefined}
          style={{
            display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3,
            padding: "10px 12px", borderRadius: 10, textAlign: "left",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.38 : 1,
            background: sel ? "rgba(13,148,136,0.12)" : inputBg,
            border: `1px solid ${sel ? "var(--cal-accent)" : panelBorder.replace("1px solid ", "")}`,
            transition: "all 0.15s", position: "relative",
          }}
        >
          {sel && (
            <span style={{
              position: "absolute", top: 6, right: 8,
              fontSize: "0.65rem", color: "var(--cal-accent)", fontWeight: 900,
            }}>✓</span>
          )}
          <span style={{ fontSize: "0.9rem", fontWeight: sel ? 700 : 500, color: sel ? "var(--cal-accent-fg)" : "var(--white)", fontFamily: '"Pixelify Sans", sans-serif' }}>
            {label}
          </span>
          <span style={{ fontSize: "0.7rem", color: disabled ? "var(--text-muted)" : sel ? "var(--cal-accent)" : "var(--text-muted)" }}>
            {disabled ? "Not available for this route" : hint}
          </span>
        </button>
      );
    })}
  </div>
  {disabledModes.size > 0 ? (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "7px 11px", borderRadius: 8, background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.25)" }}>
      <span style={{ fontSize: "0.78rem", flexShrink: 0 }}>⚠️</span>
      <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", lineHeight: 1.45 }}>
        {disabledModes.size === 3
          ? "This route requires a flight — land & rail options are unavailable."
          : "Some options are unavailable for this route (no drive-on crossing)."}
      </span>
    </div>
  ) : (
    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 11px", borderRadius: 8, background: "rgba(56,189,248,0.07)", border: "1px solid rgba(56,189,248,0.18)" }}>
      <span style={{ fontSize: "0.78rem" }}>ℹ️</span>
      <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", lineHeight: 1.45 }}>
        All transport options are available for this route.
      </span>
    </div>
  )}
</div>
```

- [ ] **Step 3: Verify in browser — clicking modes toggles them on/off, last mode stays locked, disabled modes remain greyed out, ✓ badge appears on selected modes**

---

## Task 3: Backend — accept transport_modes list

**Files:**
- Modify: `backend/app/routes/trip.py:18-32`

- [ ] **Step 1: Add `transport_modes` field to `TripPreferences`**

Replace the model (lines 18–32) with:
```python
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
    transport_modes: List[str] = Field(default_factory=lambda: ["flight"])
    transport_mode: str = "flight"   # legacy compat — derived below
    accommodation_type: str = "hotel"
    additional_notes: Optional[str] = None

    def model_post_init(self, __context: Any) -> None:
        # If caller sent only the legacy transport_mode string, promote it to list
        if not self.transport_modes or self.transport_modes == ["flight"]:
            if self.transport_mode and self.transport_mode != "flight":
                self.transport_modes = [self.transport_mode]
        # Always keep legacy field in sync with primary mode
        self.transport_mode = self.transport_modes[0] if self.transport_modes else "flight"
```

Also add `from typing import Any` to the imports at the top of trip.py if not already present (it is already imported via `Dict, List, Optional, Any`).

- [ ] **Step 2: Verify the backend starts without errors**

```bash
cd backend && uvicorn app.main:app --reload
```
Expected: server starts, no import errors.

- [ ] **Step 3: Quick curl test — old single-string payload still works**

```bash
curl -s -X POST http://localhost:8000/plan \
  -H "Content-Type: application/json" \
  -d '{"origin":"Toronto","destination":"Tokyo","start_date":"2025-08-01","end_date":"2025-08-10","budget":3000,"transport_mode":"flight"}' \
  | python -m json.tool | grep -i transport
```
Expected: no 422 validation error.

---

## Task 4: LLM prompt — multi-mode transport rules

**Files:**
- Modify: `backend/app/services/llm.py:161-509` (`_build_trip_plan_prompt`)

- [ ] **Step 1: Extract `transport_modes` list at the top of `_build_trip_plan_prompt` (around line 177)**

Replace:
```python
transport_mode = preferences.get("transport_mode", "flight")
```
with:
```python
transport_modes = preferences.get("transport_modes") or [preferences.get("transport_mode", "flight")]
transport_mode = transport_modes[0]  # primary mode (kept for cabin_rule logic below)
```

- [ ] **Step 2: Replace the transport budget rules section in the `parts` list (lines ~432–481)**

Find the block starting with `"TRANSPORT BUDGET RULES — use explicit arithmetic, never invent totals:\n"` and ending with the `CABIN` line. Replace the entire block with:

```python
f"TRANSPORT BUDGET RULES — use explicit arithmetic, never invent totals:\n",
f"SELECTED TRANSPORT MODES: {', '.join(transport_modes)}\n",
f"COMBINATION SEMANTICS:\n",
f"  - If 'flight' is in the list: flight covers the intercity leg to {destination}.\n",
f"  - If 'car_rental' is ALSO in the list: it means a rental car at the destination for local use (NOT driving there). Price it as a local rental.\n",
f"  - If 'bus_train' is ALSO in the list with 'flight': it means local rail/bus passes at {destination}, not an intercity train.\n",
f"  - If 'own_car' is the only mode: the user drives their own car the entire route.\n",
f"  - If 'car_rental' is the only mode: the user drives a rented car the entire intercity route.\n",
f"  - If 'bus_train' is the only mode: the user takes trains/buses for the entire journey.\n",
f"STEP 1 — determine intercity transport cost:\n",
f"  Primary intercity mode = {transport_mode}.\n",
*(
    [
        f"  FLIGHT: per-person round-trip economy based on ACTUAL origin '{origin}' and destination '{destination}'.\n",
        "  Route reference table (per-person round-trip economy, taxes included, booked 4–8 weeks out):\n",
        "    Intra-East-Asia ≤3h (Seoul/Tokyo/Osaka/Taipei/HK to each other): CAD 300–600.\n",
        "    Intra-SE-Asia ≤4h (Bangkok/Singapore/KL/Manila/Bali to each other): CAD 250–550.\n",
        "    Asia cross-regional 4–8h (Korea/Japan↔SE Asia, Japan↔India): CAD 600–1200.\n",
        "    Asia↔Oceania 8–10h (Tokyo/Seoul↔Sydney/Auckland): CAD 1000–1800.\n",
        "    North America↔East Asia 10–14h (Vancouver/Toronto↔Tokyo/Seoul/Beijing): CAD 1400–2500.\n",
        "    North America↔Europe 7–10h (Toronto/NYC↔London/Paris/Frankfurt): CAD 900–1900.\n",
        "    North America↔SE Asia/South Asia 14h+ (Toronto↔Bangkok/Singapore/Mumbai): CAD 1600–3200.\n",
        "    Intra-Europe (budget carriers): CAD 150–500.\n",
        "    Europe↔Middle East/Africa 4–8h: CAD 600–1400.\n",
        "  IMPORTANT: Use realistic midpoint fares, not flash-sale lows.\n",
        "  Set: flight_low_pp = lower quarter of range, flight_high_pp = upper quarter.\n",
        f"  international.min = flight_low_pp × {group_size}  (group total)\n",
        f"  international.max = flight_high_pp × {group_size} (group total)\n",
    ] if transport_mode == "flight" else
    [
        f"  OWN_CAR: international.min/max = round-trip fuel for all {group_size} travelers. Fuel ~0.14–0.18/km.\n",
        f"  international.note = 'Estimated X km round-trip; fuel and tolls only.'\n",
    ] if transport_mode == "own_car" else
    [
        f"  CAR_RENTAL (intercity): international.min = economy ~45–65/day × {billing_days} day{'s' if billing_days != 1 else ''} + low fuel (group total).\n",
        f"  international.max = mid-size ~80–120/day × {billing_days} day{'s' if billing_days != 1 else ''} + high fuel (group total).\n",
    ] if transport_mode == "car_rental" else
    [
        f"  BUS_TRAIN: international.min/max = total round-trip ticket cost for all travelers.\n",
    ]
),
f"STEP 2 — local transport at destination:\n",
*(
    [
        f"  'car_rental' is selected as a local mode: price a rental car at {destination} (NOT driving there).\n",
        f"  Local rental: economy ~45–65/day × {billing_days} day{'s' if billing_days != 1 else ''} for the group. Add airport pick-up (~0–30 extra).\n",
        f"  Set local = rental_car_group_total (replace the standard 10–20/person/day estimate).\n",
    ] if "car_rental" in transport_modes and transport_mode != "car_rental" else
    [
        f"  'bus_train' is selected as a local mode: price local rail/bus passes at {destination}.\n",
        f"  Local passes: ~15–35/person/day × {billing_days} day{'s' if billing_days != 1 else ''}. Set local = local_pp × {group_size}.\n",
    ] if "bus_train" in transport_modes and transport_mode != "bus_train" else
    [
        f"  Standard local transport: ~10–20/person/day × {billing_days} day{'s' if billing_days != 1 else ''}. Add airport transfer if needed (~15–40 each way).\n",
        f"  Set: local_pp = total local per person. local = local_pp × {group_size}.\n",
    ]
),
f"STEP 3 — arithmetic:\n",
f"  transport_pp_low  = (international.min / {group_size}) + (local / {group_size})\n",
f"  transport_pp_high = (international.max / {group_size}) + (local / {group_size})\n",
f"STEP 4 — scale to group:\n",
f"  transport_range.min = international.min + local\n",
f"  transport_range.max = international.max + local\n",
f"  transport_total = round((transport_range.min + transport_range.max) / 2)\n",
f"  transportation_options[0].priceEstimate.min = international.min\n",
f"  transportation_options[0].priceEstimate.max = international.max\n",
"CONSISTENCY CHECK before outputting:\n",
"  ✓ transport_range.min = international.min + local\n",
"  ✓ transport_total = midpoint of range\n",
f"  ✓ priceEstimate.min = international.min (group total; frontend divides by group_size={group_size})\n",
"  ✓ grand_total = hotels + activities + food + transport_total + shopping\n",
f"CABIN (flights only — applies when 'flight' is in transport modes): {cabin_rule} Provide 2-3 options from recommended down to economy. ",
"priceEstimate.source='llm_fallback'. confidence=low|medium|high. ",
"notes must include 'Round-trip estimate' and 'Prices vary by airline and booking date'.\n",
f"savings_tip: Write ONE specific, practical money-saving tip as if you are a long-time local resident of {destination} - ",
"not a generic travel tip. Reference a real neighbourhood, market, transit line, local habit, or insider trick that only ",
"someone who has lived there for years would know. Make it feel personal and place-specific. One sentence, vivid and actionable.",
```

- [ ] **Step 3: Update the `user_input` string (line ~498) to show all modes**

Replace:
```python
f"TRANSPORT MODE TO DESTINATION: {transport_mode} (from {origin} to {destination})\n"
```
with:
```python
f"TRANSPORT MODES: {', '.join(transport_modes)} (from {origin} to {destination})\n"
```

- [ ] **Step 4: Verify backend starts without syntax errors**

```bash
cd backend && python -c "from app.services import llm; print('ok')"
```
Expected: `ok`

---

## Task 5: TripPlan — show combined modes in budget label

**Files:**
- Modify: `frontend/src/pages/TripPlan.jsx:1484` (BudgetRow prop), `BudgetRow` function (~line 1261)

- [ ] **Step 1: Pass `transport_modes` to `BudgetRow`**

On line ~1484, replace:
```jsx
<BudgetRow key={item.key} item={item} total={total} currency={prefs?.currency} nights={nights} groupSize={groupSize} perPersonMode={perPersonMode} transportMode={prefs?.transport_mode} />
```
with:
```jsx
<BudgetRow key={item.key} item={item} total={total} currency={prefs?.currency} nights={nights} groupSize={groupSize} perPersonMode={perPersonMode} transportModes={prefs?.transport_modes ?? [prefs?.transport_mode ?? "flight"]} />
```

- [ ] **Step 2: Update BudgetRow prop signature (line ~1180)**

Replace `transportMode` with `transportModes` in the function signature:
```js
function BudgetRow({ item, total, currency, nights, groupSize, perPersonMode, transportModes = ["flight"] }) {
```

- [ ] **Step 3: Update the transport label inside `BudgetRow` (lines ~1261–1264)**

Replace:
```js
{transportMode === "own_car" ? "⛽ Fuel & tolls" :
 transportMode === "car_rental" ? "🚗 Rental + fuel" :
 transportMode === "bus_train" ? "🚌 Bus / Train" :
 "✈️ Flights"}
```
with:
```js
{(() => {
  const primary = transportModes[0] ?? "flight";
  const hasSecondary = transportModes.length > 1;
  const primaryLabel =
    primary === "own_car"    ? "⛽ Fuel & tolls" :
    primary === "car_rental" ? "🚗 Rental + fuel" :
    primary === "bus_train"  ? "🚌 Bus / Train"  :
    "✈️ Flights";
  if (!hasSecondary) return primaryLabel;
  const secondaryLabels = transportModes.slice(1).map((m) =>
    m === "car_rental" ? "🚙 + Car Rental" :
    m === "bus_train"  ? "🚌 + Local Transit" :
    m === "own_car"    ? "🚗 + Own Car" :
    "✈️ + Flight"
  );
  return `${primaryLabel} ${secondaryLabels.join(" ")}`;
})()}
```

- [ ] **Step 4: Verify in browser — Budget tab shows combined label like "✈️ Flights 🚙 + Car Rental" when both modes were selected**

---

## Task 6: Commit

- [ ] **Step 1: Stage and commit all changes**

```bash
git add frontend/src/pages/Wizard.jsx backend/app/routes/trip.py backend/app/services/llm.py frontend/src/pages/TripPlan.jsx
git commit -m "feat: multi-select transport modes with combined budget pricing

Users can now select multiple transport modes (e.g. Flight + Car Rental).
The AI prices each independently: intercity leg uses the primary mode,
additional modes (car_rental, bus_train) are priced as local transport
at the destination. Budget breakdown label reflects all selected modes.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- ✓ Multi-select UI toggle buttons (Task 2)
- ✓ Last mode stays selected — can't deselect all (Task 2, step 2 toggle logic)
- ✓ Disabled modes auto-removed from selection array (Task 1, step 4)
- ✓ Backend accepts list (Task 3)
- ✓ Backward compat: old `transport_mode` string still works (Task 3, `model_post_init`)
- ✓ LLM understands combinations — flight+car_rental vs car_rental alone (Task 4)
- ✓ Budget label shows combined modes (Task 5)

**Placeholder scan:** No TBDs, no "handle edge cases" without code.

**Type consistency:** `transportModes: string[]` used consistently in Tasks 1, 2, 5. `transport_modes: List[str]` in Tasks 3 and 4.
