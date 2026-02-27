import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DayPicker } from "react-day-picker";
import { AnimatePresence, motion } from "framer-motion";
import { ComposableMap, Geographies, Geography, ZoomableGroup, Marker as MapMarker } from "react-simple-maps";
import "react-day-picker/dist/style.css";
import api from "../api";
import { useIsDarkMode } from "../contexts/ThemeContext";

// ─── Constants ────────────────────────────────────────────────────────────────
const TOTAL_STEPS = 3;

const BUDGET_PRIORITIES = [
  { id: "hotels",        label: "🏨 Hotels" },
  { id: "activities",    label: "🎭 Activities" },
  { id: "food",          label: "🍽️ Food & Dining" },
  { id: "transport",     label: "🚗 Transport" },
  { id: "shopping",      label: "🛍️ Shopping" },
  { id: "entertainment", label: "🎵 Entertainment" },
];

const ACTIVITY_TAGS = [
  { id: "outdoor",     label: "🏔️ Outdoor" },
  { id: "cultural",    label: "🏛️ Cultural" },
  { id: "food_tours",  label: "🍜 Food Tours" },
  { id: "nightlife",   label: "🎵 Nightlife" },
  { id: "wellness",    label: "🧘 Wellness" },
  { id: "art",         label: "🎨 Art & Museums" },
  { id: "beach",       label: "🏖️ Beach" },
  { id: "nature",      label: "🌿 Nature" },
  { id: "adventure",   label: "🏄 Adventure" },
  { id: "sightseeing", label: "📸 Sightseeing" },
  { id: "shopping",    label: "🛒 Shopping" },
  { id: "family",      label: "👨‍👩‍👧 Family Friendly" },
];

const TRIP_TYPES = [
  { id: "solo",    label: "🧍 Solo" },
  { id: "couple",  label: "💑 Couple" },
  { id: "friends", label: "👯 Friends" },
  { id: "family",  label: "👨‍👩‍👧 Family" },
];

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "KRW", "THB", "SGD", "MXN"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pad2(n)    { return String(n).padStart(2, "0"); }
function toYYYYMMDD(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function formatDateRange(range) {
  if (!range?.from) return "Select travel dates";
  const fmt = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (!range.to) return fmt(range.from) + " → ?";
  const nights = Math.round((range.to - range.from) / 86400000);
  return `${fmt(range.from)} → ${fmt(range.to)} (${nights} night${nights !== 1 ? "s" : ""})`;
}


// ─── Search bar with Nominatim suggestions ────────────────────────────────────
function MapSearchBar({ onSelect, isDarkMode = true }) {
  const [query, setQuery]           = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading]       = useState(false);
  const timerRef = useRef(null);

  const search = useCallback((q) => {
    if (!q.trim() || q.length < 2) { setSuggestions([]); return; }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const url =
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=1`;
        const res = await fetch(url, { headers: { "Accept-Language": "en" } });
        const data = await res.json();
        setSuggestions(data);
      } catch { setSuggestions([]); }
      finally  { setLoading(false); }
    }, 350);
  }, []);

  const handleChange = (e) => {
    setQuery(e.target.value);
    search(e.target.value);
  };

  const pickSuggestion = (item) => {
    onSelect({
      name:   item.display_name.split(",").slice(0, 2).join(",").trim(),
      coords: [parseFloat(item.lat), parseFloat(item.lon)],
    });
    setQuery(item.display_name.split(",").slice(0, 2).join(",").trim());
    setSuggestions([]);
  };

  return (
    <div style={mapStyles.searchWrap}>
      <div style={{
        ...mapStyles.searchRow,
        background: isDarkMode ? "rgba(255,255,255,0.07)" : "rgba(168, 207, 223, 0.15)",
        border: isDarkMode ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(168, 207, 223, 0.4)",
      }}>
        <span style={mapStyles.searchIcon}>🔍</span>
        <input
          type="text"
          placeholder="Search destination…"
          value={query}
          onChange={handleChange}
          style={{
            ...mapStyles.searchInput,
            color: isDarkMode ? "#fff" : "#334455",
          }}
          autoFocus
        />
        {loading && <span style={mapStyles.searchSpinner}>⏳</span>}
      </div>

      <AnimatePresence>
        {suggestions.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            style={{
              ...mapStyles.suggestionList,
              background: isDarkMode ? "rgba(12, 12, 20, 0.96)" : "rgba(255, 249, 240, 0.98)",
              border: isDarkMode ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(168, 207, 223, 0.3)",
            }}
          >
            {suggestions.map((s) => (
              <li
                key={s.place_id}
                style={mapStyles.suggestionItem}
                onMouseEnter={(e) => e.currentTarget.style.background = isDarkMode ? "rgba(13,148,136,0.18)" : "rgba(168, 207, 223, 0.2)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                onClick={() => pickSuggestion(s)}
              >
                <span style={mapStyles.suggestionIcon}>
                  {s.type === "country" ? "🌍" : s.type === "city" || s.addresstype === "city" ? "🏙️" : "📍"}
                </span>
                <span style={{ ...mapStyles.suggestionText, color: isDarkMode ? "rgba(255,255,255,0.88)" : "rgba(51, 68, 85, 0.8)" }}>
                  {s.display_name.split(",").slice(0, 3).join(", ")}
                </span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Continent labels [longitude, latitude] ───────────────────────────────────
const CONTINENTS = [
  { name: "NORTH AMERICA",  coords: [-100,  50] },
  { name: "SOUTH AMERICA",  coords: [ -58, -13] },
  { name: "EUROPE",      coords: [  15,  48] },
  { name: "AFRICA",      coords: [  20,   13] },
  { name: "ASIA",        coords: [  100,  50] },
  { name: "AUSTRALIA",   coords: [ 133, -27] },
];

// ─── Major Cities [latitude, longitude] ───────────────────────────────────────
const MAJOR_CITIES = [
  { name: "New York", coords: [40.7128, -74.0060] },
  { name: "Los Angeles", coords: [34.0522, -118.2437] },
  { name: "Chicago", coords: [41.8781, -87.6298] },
  { name: "Mexico City", coords: [19.4326, -99.1332] },
  { name: "Toronto", coords: [43.6532, -79.3832] },
  { name: "Bogotá", coords: [4.7110, -74.0721] },
  { name: "Lima", coords: [-12.0464, -77.0428] },
  { name: "Buenos Aires", coords: [-34.6037, -58.3816] },
  { name: "São Paulo", coords: [-23.5505, -46.6333] },
  { name: "London", coords: [51.5074, -0.1278] },
  { name: "Paris", coords: [48.8566, 2.3522] },
  { name: "Madrid", coords: [40.4168, -3.7038] },
  { name: "Rome", coords: [41.9028, 12.4964] },
  { name: "Berlin", coords: [52.5200, 13.4050] },
  { name: "Istanbul", coords: [41.0082, 28.9784] },
  { name: "Cairo", coords: [30.0444, 31.2357] },
  { name: "Lagos", coords: [6.5244, 3.3792] },
  { name: "Nairobi", coords: [-1.2921, 36.8219] },
  { name: "Cape Town", coords: [-33.9249, 18.4241] },
  { name: "Dubai", coords: [25.2048, 55.2708] },
  { name: "Mumbai", coords: [19.0760, 72.8777] },
  { name: "Delhi", coords: [28.6139, 77.2090] },
  { name: "Bangkok", coords: [13.7563, 100.5018] },
  { name: "Singapore", coords: [1.3521, 103.8198] },
  { name: "Tokyo", coords: [35.6762, 139.6503] },
  { name: "Seoul", coords: [37.5665, 126.9780] },
  { name: "Beijing", coords: [39.9042, 116.4074] },
  { name: "Sydney", coords: [-33.8688, 151.2093] },
  { name: "Melbourne", coords: [-37.8136, 144.9631] },
  { name: "Auckland", coords: [-36.8509, 174.7645] },
  { name: "Vancouver", coords: [49.2827, -123.1207] },
  { name: "Miami", coords: [25.7617, -80.1918] },
  { name: "Santiago", coords: [-33.4489, -70.6693] },
  { name: "Lisbon", coords: [38.7223, -9.1393] },
  { name: "Amsterdam", coords: [52.3676, 4.9041] },
  { name: "Athens", coords: [37.9838, 23.7275] },
  { name: "Johannesburg", coords: [-26.2041, 28.0473] },
  { name: "Jakarta", coords: [-6.2088, 106.8456] },
  { name: "Hong Kong", coords: [22.3193, 114.1694] },
  { name: "Osaka", coords: [34.6937, 135.5023] },
];

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// ─── Full-screen Map Phase ────────────────────────────────────────────────────
function MapPhase({ onConfirm }) {
  const isDarkMode = useIsDarkMode();
  const mapBackground = isDarkMode ? "#0f111a" : "#E8F4F8";
  const searchBoxBackground = isDarkMode ? "rgba(10, 10, 18, 0.82)" : "#FFF9F0";

  const [selected, setSelected] = useState(null);
  const [position, setPosition] = useState({ coordinates: [-95, 45], zoom: 2.2 });

  const handleCountryClick = useCallback(async (geo) => {
    const name = geo.properties.name;
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)}&format=json&limit=1`;
      const res  = await fetch(url, { headers: { "Accept-Language": "en" } });
      const data = await res.json();
      const coords = data[0]
        ? [parseFloat(data[0].lat), parseFloat(data[0].lon)]
        : [0, 0];
      setSelected({ name, coords });
    } catch {
      setSelected({ name, coords: [0, 0] });
    }
  }, []);

  const constrainPosition = (pos) => {
    // Calculate viewport bounds based on zoom level to prevent showing empty space
    // At zoom N, the viewport width/height in coordinate degrees is approximately 360/N and 180/N
    const viewportWidthDegrees = 360 / Math.max(1, pos.zoom);
    const viewportHeightDegrees = 180 / Math.max(1, pos.zoom);
    
    const minLng = -180 + viewportWidthDegrees / 2;
    const maxLng = 180 - viewportWidthDegrees / 2;
    const minLat = -85 + viewportHeightDegrees / 2;
    const maxLat = 85 - viewportHeightDegrees / 2;
    
    const constrained = {
      coordinates: [
        Math.max(minLng, Math.min(maxLng, pos.coordinates[0])),
        Math.max(minLat, Math.min(maxLat, pos.coordinates[1])),
      ],
      zoom: Math.max(1.8, Math.min(12, pos.zoom)),
    };
    return constrained;
  };

  const handleSearchSelect = useCallback(({ name, coords }) => {
    setSelected({ name, coords });
    const newPos = { coordinates: [coords[1], coords[0]], zoom: 5 };
    setPosition(constrainPosition(newPos));
  }, []);

  const handleMapMove = (pos) => {
    setPosition(constrainPosition(pos));
  };

  return (
    <div style={{ ...mapStyles.wrap, background: mapBackground }}>
      {/* SVG world map */}
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 145 }}
        style={{ width: "100%", height: "100%", background: mapBackground }}
      >
        <ZoomableGroup
          center={position.coordinates}
          zoom={position.zoom}
          onMoveEnd={handleMapMove}
          minZoom={1.8}
          maxZoom={12}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  onClick={() => handleCountryClick(geo)}
                  style={{
                    default: isDarkMode ? { fill: "#2a2f45", stroke: "#3e4a6e", strokeWidth: 0.4, outline: "none" } : { fill: "#A8CFDF", stroke: "#8AB5C8", strokeWidth: 0.4, outline: "none" },
                    hover:   { fill: "rgba(13,148,136,0.65)", stroke: "#0d9488", strokeWidth: 0.6, outline: "none", cursor: "pointer" },
                    pressed: { fill: "#0d9488", outline: "none" },
                  }}
                />
              ))
            }
          </Geographies>

          {/* Continent labels in Pixelify Sans */}
          {CONTINENTS.map((c) => (
            <MapMarker key={c.name} coordinates={c.coords}>
              <text
                textAnchor="middle"
                style={{
                  fontFamily: '"Pixelify Sans", sans-serif',
                  fontSize: `${14 / position.zoom}px`,
                  fill: isDarkMode ? "rgba(255,255,255,0.75)" : "rgba(70,100,130,0.6)",
                  fontWeight: 900,
                  letterSpacing: "0.15em",
                  pointerEvents: "none",
                  userSelect: "none",
                }}
              >
                {c.name}
              </text>
            </MapMarker>
          ))}


          {/* Major city markers */}
          {MAJOR_CITIES.map((city) => (
            <MapMarker key={city.name} coordinates={[city.coords[1], city.coords[0]]}>
              <title>{city.name}</title>
              <circle r={2.6 / position.zoom} fill="#38bdf8" fillOpacity={0.92} />
              <circle r={5.2 / position.zoom} fill="#38bdf8" fillOpacity={0.2} />
              {position.zoom >= 2.2 && (
                <text
                  y={-7 / position.zoom}
                  textAnchor="middle"
                  style={{
                    fontFamily: '"Pixelify Sans", sans-serif',
                    fontSize: `${10 / position.zoom}px`,
                    fill: isDarkMode ? "rgba(255,255,255,0.8)" : "rgba(51,68,85,0.85)",
                    fontWeight: 700,
                    pointerEvents: "none",
                    userSelect: "none",
                  }}
                >
                  {city.name}
                </text>
              )}
            </MapMarker>
          ))}

          {/* Selected location pin */}
          {selected && (
            <MapMarker coordinates={[selected.coords[1], selected.coords[0]]}>
              <circle r={5 / position.zoom} fill="#0d9488" stroke="#fff" strokeWidth={1.5 / position.zoom} />
              <circle r={11 / position.zoom} fill="#0d9488" fillOpacity={0.25} />
            </MapMarker>
          )}
        </ZoomableGroup>
      </ComposableMap>

      {/* Top overlay: title + search */}
      <div style={{ ...mapStyles.topOverlay }}>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          style={{
            ...mapStyles.titleCard,
            background: isDarkMode ? "rgba(10, 10, 18, 0.82)" : "rgba(255, 249, 240, 0.95)",
            border: isDarkMode ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(168, 207, 223, 0.3)",
            boxShadow: isDarkMode ? "0 8px 40px rgba(0,0,0,0.5)" : "0 4px 16px rgba(168, 207, 223, 0.15)",
          }}
        >
          <div style={mapStyles.appName}>✈️ Trip Planner AI</div>
          <div style={{ ...mapStyles.heroTitle, color: isDarkMode ? "#fff" : "#334455" }}>Where do you want to go?</div>
          <div style={{ ...mapStyles.heroHint, color: isDarkMode ? "rgba(255,255,255,0.45)" : "rgba(100,120,140,0.6)" }}>Search or click a country on the map</div>
          <MapSearchBar onSelect={handleSearchSelect} isDarkMode={isDarkMode} />
        </motion.div>
      </div>

      {/* Bottom CTA: appears when location selected */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            style={mapStyles.bottomOverlay}
          >
            <div style={mapStyles.selectedChip}>
              <span style={mapStyles.selectedPin}>📍</span>
              <span style={mapStyles.selectedName}>{selected.name}</span>
              <button
                type="button"
                style={mapStyles.clearBtn}
                onClick={() => setSelected(null)}
              >✕</button>
            </div>
            <motion.button
              type="button"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              style={mapStyles.ctaBtn}
              onClick={() => onConfirm(selected)}
            >
              Plan this trip →
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Shared Tag / Dot components ──────────────────────────────────────────────
function Tag({ label, selected: sel, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{
      ...styles.tag,
      background: sel ? "var(--cal-accent)" : "var(--bg-card)",
      border:     sel ? "1px solid var(--cal-accent)" : "1px solid var(--border-col)",
      color:      sel ? "#fff" : "var(--white)",
      fontWeight: sel ? 700 : 400,
    }}>
      {label}
    </button>
  );
}

function StepDots({ step }) {
  return (
    <div style={styles.dots}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div key={i} style={{
          ...styles.dot,
          background: i === step ? "var(--cal-accent)" : "var(--border-col)",
          width: i === step ? 24 : 8,
        }} />
      ))}
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────
export default function Wizard() {
  const nav = useNavigate();

  // Map phase
  const [mapDone, setMapDone]       = useState(false);
  const [destination, setDestination] = useState("");

  // Form steps
  const [step, setStep]             = useState(0);
  const [direction, setDirection]   = useState(1);
  const prevStepRef                 = useRef(0);

  const [dateRange, setDateRange]   = useState({ from: undefined, to: undefined });
  const [showCal, setShowCal]       = useState(false);
  const [calMonth, setCalMonth]     = useState(() => { const d = new Date(); d.setDate(1); return d; });

  const [budget, setBudget]         = useState("");
  const [currency, setCurrency]     = useState("USD");
  const [budgetPriorities, setBudgetPriorities] = useState([]);

  const [activityPrefs, setActivityPrefs] = useState([]);
  const [tripType, setTripType]     = useState("solo");
  const [groupSize, setGroupSize]   = useState(1);

  const [notes, setNotes]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [err, setErr]               = useState("");

  const toggleTag = (list, setList, id) =>
    setList((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const goTo = (next) => {
    setDirection(next > prevStepRef.current ? 1 : -1);
    prevStepRef.current = next;
    setStep(next);
  };

  const validateStep = () => {
    if (step === 0) {
      if (!dateRange.from || !dateRange.to) { setErr("Please select your travel dates."); return false; }
      if (!budget || Number(budget) <= 0)   { setErr("Please enter your total budget."); return false; }
    }
    setErr(""); return true;
  };

  const handleNext = () => { if (validateStep()) goTo(step + 1); };
  const handleBack = () => { if (step > 0) goTo(step - 1); };

  const handleSubmit = async () => {
    setErr(""); setLoading(true);
    try {
      const payload = {
        destination:          destination.trim(),
        start_date:           toYYYYMMDD(dateRange.from),
        end_date:             toYYYYMMDD(dateRange.to),
        budget:               Number(budget),
        currency,
        budget_priorities:    budgetPriorities,
        activity_preferences: activityPrefs,
        trip_type:            tripType,
        group_size:           Number(groupSize),
        additional_notes:     notes.trim() || null,
      };
      const res = await api.post("/plan", payload);
      nav("/plan", { state: { plan: res.data, preferences: payload } });
    } catch (e) {
      setErr(e?.response?.data?.detail || e?.message || "Failed to generate trip plan.");
    } finally { setLoading(false); }
  };

  const stepVariants = {
    enter:  (d) => ({ x: d * 60, opacity: 0 }),
    center:       { x: 0, opacity: 1 },
    exit:   (d) => ({ x: d * -60, opacity: 0 }),
  };

  // ── Phase 1: Map ────────────────────────────────────────────────────────────
  if (!mapDone) {
    return (
      <AnimatePresence>
        <motion.div
          key="map"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.5 }}
          style={{ position: "absolute", inset: 0 }}
        >
          <MapPhase onConfirm={(sel) => { setDestination(sel.name); setMapDone(true); }} />
        </motion.div>
      </AnimatePresence>
    );
  }

  // ── Phase 2: Form steps ─────────────────────────────────────────────────────
  return (
    <motion.div
      key="form"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      style={styles.wrap}
    >
      <div style={styles.content}>

        {/* Header */}
        <div style={styles.header}>
          <button style={styles.changeDestBtn} onClick={() => { setMapDone(false); setStep(0); setDirection(1); prevStepRef.current = 0; }}>
            ← Change destination
          </button>
          <div style={styles.title}>📍 {destination}</div>
          <div style={styles.subtitle}>Now let's fill in the details</div>
        </div>

        <StepDots step={step} />

        {/* Step Cards */}
        <div style={styles.cardWrap}>
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={step}
              custom={direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28, ease: "easeInOut" }}
              style={styles.card}
            >
              {step === 0 && (
                <StepDatesAndBudget
                  dateRange={dateRange}
                  setDateRange={setDateRange}
                  showCal={showCal}
                  setShowCal={setShowCal}
                  calMonth={calMonth}
                  setCalMonth={setCalMonth}
                  budget={budget}
                  setBudget={setBudget}
                  currency={currency}
                  setCurrency={setCurrency}
                />
              )}
              {step === 1 && (
                <StepPreferences
                  budgetPriorities={budgetPriorities}
                  togglePriority={(id) => toggleTag(budgetPriorities, setBudgetPriorities, id)}
                  activityPrefs={activityPrefs}
                  toggleActivity={(id) => toggleTag(activityPrefs, setActivityPrefs, id)}
                />
              )}
              {step === 2 && (
                <StepTripDetails
                  tripType={tripType}
                  setTripType={setTripType}
                  groupSize={groupSize}
                  setGroupSize={setGroupSize}
                  notes={notes}
                  setNotes={setNotes}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {err && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={styles.errBox}>
            {err}
          </motion.div>
        )}

        {/* Navigation */}
        <div style={styles.navRow}>
          {step > 0 && (
            <button type="button" style={styles.backBtn} onClick={handleBack} disabled={loading}>
              ← Back
            </button>
          )}
          <div style={{ flex: 1 }} />
          {step < TOTAL_STEPS - 1 ? (
            <button type="button" style={styles.nextBtn} onClick={handleNext} disabled={loading}>
              Next →
            </button>
          ) : (
            <button
              type="button"
              style={{ ...styles.nextBtn, minWidth: 210, fontSize: "1rem" }}
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading
                ? <><LoadingDots /> Generating…</>
                : "✈️ Generate My Trip Plan"}
            </button>
          )}
        </div>

        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={styles.loadingNote}>
            AI is crafting your personalized plan. This may take 15–30 seconds…
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Step Components ──────────────────────────────────────────────────────────

// Step 0: Dates + Budget — the first question right after picking the destination
function StepDatesAndBudget({
  dateRange, setDateRange, showCal, setShowCal, calMonth, setCalMonth,
  budget, setBudget, currency, setCurrency,
}) {
  return (
    <div style={styles.stepInner}>
      <div style={styles.stepLabel}>Step 1 of 3</div>

      <div style={styles.stepTitle}>When are you traveling?</div>
      <button type="button" style={styles.dateDisplayBtn} onClick={() => setShowCal((v) => !v)}>
        📅 {formatDateRange(dateRange)}
      </button>
      <AnimatePresence>
        {showCal && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22 }}
            style={{ overflow: "hidden", width: "100%" }}
          >
            <div className="calendar-picker" style={styles.calCard}>
              <DayPicker
                mode="range"
                selected={dateRange}
                onSelect={(r) => {
                  setDateRange(r || { from: undefined, to: undefined });
                  if (r?.from && r?.to) setShowCal(false);
                }}
                month={calMonth}
                onMonthChange={setCalMonth}
                disabled={{ before: new Date() }}
                showOutsideDays
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={styles.divider} />

      <div style={styles.stepTitle}>What's your total budget?</div>
      <div style={styles.stepHint}>This covers everything — hotels, food, activities, transport</div>
      <div style={{ display: "flex", gap: 10, width: "100%" }}>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          style={{ ...styles.input, flex: "0 0 88px", padding: "14px 8px" }}
        >
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          type="number"
          min="1"
          placeholder="e.g. 3000"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          style={{ ...styles.input, flex: 1 }}
          autoFocus={!!dateRange.to}
        />
      </div>
    </div>
  );
}

// Step 1: Spending priorities + activity preferences
function StepPreferences({ budgetPriorities, togglePriority, activityPrefs, toggleActivity }) {
  return (
    <div style={styles.stepInner}>
      <div style={styles.stepLabel}>Step 2 of 3</div>

      <div style={styles.stepTitle}>What do you invest most in?</div>
      <div style={styles.stepHint}>Select your priorities in order — numbers show rank</div>
      <div style={styles.tagGrid}>
        {BUDGET_PRIORITIES.map((p) => {
          const idx = budgetPriorities.indexOf(p.id);
          const sel = idx !== -1;
          return (
            <button key={p.id} type="button" onClick={() => togglePriority(p.id)} style={{
              ...styles.tag, position: "relative",
              background: sel ? "var(--cal-accent)" : "var(--bg-card)",
              border:     sel ? "1px solid var(--cal-accent)" : "1px solid var(--border-col)",
              color:      sel ? "#fff" : "var(--white)",
              fontWeight: sel ? 700 : 400,
            }}>
              {sel && <span style={styles.tagRank}>{idx + 1}</span>}
              {p.label}
            </button>
          );
        })}
      </div>

      <div style={styles.divider} />

      <div style={styles.stepTitle}>What kind of activities do you enjoy?</div>
      <div style={styles.tagGrid}>
        {ACTIVITY_TAGS.map((t) => (
          <Tag key={t.id} label={t.label} selected={activityPrefs.includes(t.id)} onClick={() => toggleActivity(t.id)} />
        ))}
      </div>
    </div>
  );
}

// Step 2: Trip type + travelers + free-text notes
function StepTripDetails({ tripType, setTripType, groupSize, setGroupSize, notes, setNotes }) {
  return (
    <div style={styles.stepInner}>
      <div style={styles.stepLabel}>Step 3 of 3</div>

      <div style={styles.stepTitle}>Trip type</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {TRIP_TYPES.map((tt) => (
          <Tag key={tt.id} label={tt.label} selected={tripType === tt.id} onClick={() => setTripType(tt.id)} />
        ))}
      </div>

      <div style={styles.stepTitle}>Number of travelers</div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button type="button" style={styles.counterBtn} onClick={() => setGroupSize((v) => Math.max(1, v - 1))}>−</button>
        <span style={{ fontSize: "1.5rem", fontFamily: '"Pixelify Sans", sans-serif', minWidth: 28, textAlign: "center" }}>{groupSize}</span>
        <button type="button" style={styles.counterBtn} onClick={() => setGroupSize((v) => Math.min(20, v + 1))}>+</button>
        <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>{groupSize === 1 ? "traveler" : "travelers"}</span>
      </div>

      <div style={styles.divider} />

      <div style={styles.stepTitle}>Anything specific you want to do?</div>
      <div style={styles.stepHint}>Restaurants, landmarks, dietary needs, accessibility…</div>
      <textarea
        placeholder="e.g. I love sushi, want to visit temples, need wheelchair access…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        style={styles.textarea}
        rows={4}
      />

      <div style={styles.readyBox}>
        <div style={styles.readyTitle}>You're all set! 🎉</div>
        <div style={styles.readyText}>
          Hit the button below — our AI will craft hotels, activities, a day-by-day itinerary, and budget breakdown just for you.
        </div>
      </div>
    </div>
  );
}

function LoadingDots() {
  return (
    <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <motion.span key={i}
          style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", display: "inline-block" }}
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </span>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const mapStyles = {
  wrap: {
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
  },
  topOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    display: "flex",
    justifyContent: "center",
    padding: "72px 20px 0",
    pointerEvents: "none",
  },
  titleCard: {
    background: "rgba(10, 10, 18, 0.82)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 20,
    padding: "20px 24px 16px",
    maxWidth: 520,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    pointerEvents: "all",
    boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
  },
  appName: {
    fontSize: "0.8rem",
    fontWeight: 700,
    color: "var(--cal-accent)",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
  },
  heroTitle: {
    fontSize: "1.9rem",
    fontWeight: 900,
    fontFamily: '"Pixelify Sans", sans-serif',
    color: "#fff",
    lineHeight: 1.2,
  },
  heroHint: {
    fontSize: "0.82rem",
    color: "rgba(255,255,255,0.45)",
    marginBottom: 6,
  },
  searchWrap: {
    position: "relative",
    width: "100%",
  },
  searchRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 12,
    padding: "10px 14px",
  },
  searchIcon: { fontSize: "1rem", flexShrink: 0 },
  searchInput: {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "#fff",
    fontSize: "1rem",
    fontFamily: "inherit",
  },
  searchSpinner: { fontSize: "0.85rem", flexShrink: 0 },
  suggestionList: {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    right: 0,
    background: "rgba(12, 12, 20, 0.96)",
    backdropFilter: "blur(20px)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: "6px 0",
    margin: 0,
    listStyle: "none",
    zIndex: 2000,
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
  },
  suggestionItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 14px",
    cursor: "pointer",
    transition: "background 0.15s",
    borderRadius: 8,
    margin: "0 4px",
  },
  suggestionIcon: { fontSize: "1rem", flexShrink: 0 },
  suggestionText: { color: "rgba(255,255,255,0.88)", fontSize: "0.9rem", lineHeight: 1.3 },
  bottomOverlay: {
    position: "absolute",
    bottom: 28,
    left: 0,
    right: 0,
    zIndex: 1000,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    pointerEvents: "none",
  },
  selectedChip: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "rgba(10, 10, 18, 0.85)",
    backdropFilter: "blur(16px)",
    border: "1px solid rgba(13,148,136,0.5)",
    borderRadius: 24,
    padding: "8px 16px",
    pointerEvents: "all",
    boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
  },
  selectedPin: { fontSize: "1rem" },
  selectedName: {
    color: "#fff",
    fontSize: "0.95rem",
    fontWeight: 600,
    maxWidth: 280,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  clearBtn: {
    background: "transparent",
    border: "none",
    color: "rgba(255,255,255,0.45)",
    cursor: "pointer",
    padding: "0 0 0 4px",
    fontSize: "0.85rem",
    lineHeight: 1,
  },
  ctaBtn: {
    padding: "14px 36px",
    background: "var(--cal-accent)",
    color: "#fff",
    border: "none",
    borderRadius: 14,
    fontSize: "1.1rem",
    fontWeight: 700,
    fontFamily: '"Pixelify Sans", sans-serif',
    cursor: "pointer",
    pointerEvents: "all",
    boxShadow: "0 4px 24px rgba(13,148,136,0.5)",
    letterSpacing: "0.02em",
  },
};

const styles = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-start",
    minHeight: "100vh",
    width: "100%",
    padding: "24px 16px 40px",
    boxSizing: "border-box",
    overflowY: "auto",
  },
  content: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    maxWidth: 560,
    gap: 20,
  },
  header: { textAlign: "center", width: "100%" },
  changeDestBtn: {
    padding: "7px 14px",
    border: "1px solid var(--border-col)",
    borderRadius: 8,
    background: "transparent",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: "0.82rem",
    marginBottom: 10,
  },
  title: {
    fontSize: "1.8rem",
    fontWeight: 900,
    fontFamily: '"Pixelify Sans", sans-serif',
    color: "var(--white)",
  },
  subtitle: { fontSize: "0.9rem", color: "var(--text-muted)", marginTop: 4 },
  dots: { display: "flex", gap: 6, alignItems: "center", justifyContent: "center" },
  dot:  { height: 8, borderRadius: 4, transition: "all 0.3s ease" },
  cardWrap: { width: "100%", overflow: "hidden" },
  card: {
    background: "var(--bg-card)",
    border: "1px solid var(--border-col)",
    borderRadius: 16,
    padding: "24px 24px 20px",
    width: "100%",
    boxSizing: "border-box",
  },
  stepInner:  { display: "flex", flexDirection: "column", gap: 14, width: "100%" },
  stepLabel:  { fontSize: "0.73rem", color: "var(--cal-accent)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" },
  stepTitle:  { fontSize: "1.15rem", fontWeight: 700, fontFamily: '"Pixelify Sans", sans-serif', color: "var(--white)" },
  stepHint:   { fontSize: "0.83rem", color: "var(--text-muted)", marginTop: -8 },
  input: {
    width: "100%",
    padding: "14px 16px",
    borderRadius: 10,
    border: "1px solid var(--border-col)",
    background: "var(--bg-input)",
    color: "var(--white)",
    fontSize: "1rem",
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  },
  dateDisplayBtn: {
    width: "100%",
    padding: "14px 16px",
    borderRadius: 10,
    border: "1px solid var(--border-col)",
    background: "var(--bg-card)",
    color: "var(--white)",
    fontSize: "0.95rem",
    textAlign: "left",
    cursor: "pointer",
    fontFamily: '"Pixelify Sans", sans-serif',
  },
  calCard: {
    border: "1px solid var(--border-col)",
    borderRadius: 12,
    padding: 12,
    background: "var(--bg-card)",
    marginTop: 4,
    fontSize: "1rem",
  },
  tagGrid: { display: "flex", flexWrap: "wrap", gap: 8, width: "100%" },
  tag: {
    padding: "8px 14px",
    borderRadius: 20,
    cursor: "pointer",
    fontSize: "0.88rem",
    fontFamily: "inherit",
    transition: "all 0.15s",
  },
  tagRank: {
    position: "absolute",
    top: -6, right: -6,
    background: "#fff",
    color: "var(--cal-accent)",
    borderRadius: "50%",
    width: 18, height: 18,
    fontSize: "0.62rem",
    fontWeight: 900,
    display: "flex", alignItems: "center", justifyContent: "center",
    lineHeight: 1,
    boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
  },
  counterBtn: {
    width: 38, height: 38,
    borderRadius: "50%",
    border: "1px solid var(--border-col)",
    background: "var(--bg-card)",
    color: "var(--white)",
    fontSize: "1.3rem",
    cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 0, flexShrink: 0,
  },
  textarea: {
    width: "100%",
    padding: "14px 16px",
    borderRadius: 10,
    border: "1px solid var(--border-col)",
    background: "var(--bg-input)",
    color: "var(--white)",
    fontSize: "1rem",
    fontFamily: "inherit",
    resize: "vertical",
    outline: "none",
    boxSizing: "border-box",
    lineHeight: 1.6,
  },
  readyBox: {
    background: "rgba(13,148,136,0.1)",
    border: "1px solid var(--cal-accent)",
    borderRadius: 12,
    padding: "14px 18px",
  },
  readyTitle: { fontSize: "1rem", fontWeight: 700, fontFamily: '"Pixelify Sans", sans-serif', color: "var(--cal-accent-fg)", marginBottom: 5 },
  readyText:  { fontSize: "0.88rem", color: "var(--text-muted)", lineHeight: 1.6 },
  navRow:     { display: "flex", alignItems: "center", width: "100%", gap: 12 },
  backBtn: {
    padding: "12px 20px",
    borderRadius: 10,
    border: "1px solid var(--border-col)",
    background: "transparent",
    color: "var(--white)",
    fontSize: "1rem",
    cursor: "pointer",
    fontFamily: '"Pixelify Sans", sans-serif',
  },
  nextBtn: {
    padding: "12px 28px",
    borderRadius: 10,
    border: "none",
    background: "var(--cal-accent)",
    color: "#fff",
    fontSize: "1rem",
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: '"Pixelify Sans", sans-serif',
    display: "flex", alignItems: "center", gap: 8,
  },
  errBox: {
    background: "rgba(255,100,100,0.12)",
    border: "1px solid rgba(255,100,100,0.35)",
    borderRadius: 10,
    padding: "10px 16px",
    color: "var(--white)",
    width: "100%",
    boxSizing: "border-box",
    fontSize: "0.88rem",
  },
  loadingNote: {
    color: "var(--text-muted)",
    fontSize: "0.85rem",
    textAlign: "center",
    lineHeight: 1.5,
  },
  divider: {
    width: "100%",
    height: 1,
    background: "var(--border-col)",
    margin: "4px 0",
  },
};
