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

const CURRENCIES = ["USD", "EUR","CAD", "JPY", "KRW"];




const EMPTY_RECOMMENDATIONS = [];

function normalizeCountryName(name = "") {
  const cleaned = name.trim();
  const aliases = {
    "United States": "United States of America",
    USA: "United States of America",
    "U.S.A.": "United States of America",
  };
  return aliases[cleaned] || cleaned;
}

function cityPhotoUrls(cityName, countryName) {
  const query = encodeURIComponent(`${cityName} ${countryName} travel`);
  return [
    `https://source.unsplash.com/640x420/?${query}&sig=1`,
    `https://source.unsplash.com/640x420/?${query}&sig=2`,
  ];
}






// ─── Helpers ──────────────────────────────────────────────────────────────────
function pad2(n) { return String(n).padStart(2, "0"); }
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

// ─── Map Search Bar ───────────────────────────────────────────────────────────
function MapSearchBar({ onSelect, isDarkMode = true }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);

  const search = useCallback((q) => {
    if (!q.trim() || q.length < 2) { setSuggestions([]); return; }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=1`,
          { headers: { "Accept-Language": "en" } }
        );
        setSuggestions(await res.json());
      } catch { setSuggestions([]); }
      finally { setLoading(false); }
    }, 350);
  }, []);

  const pickSuggestion = (item) => {
    const isCountry = item.type === "country" || item.addresstype === "country";
    const primary = item.display_name.split(",").slice(0, 2).join(",").trim();
    onSelect({
      name: primary,
      coords: [parseFloat(item.lat), parseFloat(item.lon)],
      type: isCountry ? "country" : "city",
      countryName: isCountry ? item.display_name.split(",")[0].trim() : item.address?.country,
    });
    setQuery(primary);
    setSuggestions([]);
  };

  return (
    <div style={mapStyles.searchWrap}>
      <div style={{
        ...mapStyles.searchRow,
        background: isDarkMode ? "rgba(255,255,255,0.07)" : "rgba(168,207,223,0.15)",
        border: isDarkMode ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(168,207,223,0.4)",
      }}>
        <span style={mapStyles.searchIcon}>🔍</span>
        <input type="text" placeholder="Search destination…" value={query}
          onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
          style={{ ...mapStyles.searchInput, color: isDarkMode ? "#fff" : "#334455" }}
          autoFocus
        />
        {loading && <span style={mapStyles.searchSpinner}>⏳</span>}
      </div>
      <AnimatePresence>
        {suggestions.length > 0 && (
          <motion.ul initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
            style={{
              ...mapStyles.suggestionList,
              background: isDarkMode ? "rgba(12,12,20,0.96)" : "rgba(255,249,240,0.98)",
              border: isDarkMode ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(168,207,223,0.3)",
            }}
          >
            {suggestions.map((s) => (
              <li key={s.place_id} style={mapStyles.suggestionItem}
                onMouseEnter={(e) => e.currentTarget.style.background = isDarkMode ? "rgba(13,148,136,0.18)" : "rgba(168,207,223,0.2)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                onClick={() => pickSuggestion(s)}
              >
                <span style={mapStyles.suggestionIcon}>
                  {s.type === "country" ? "🌍" : s.type === "city" || s.addresstype === "city" ? "🏙️" : "📍"}
                </span>
                <span style={{ ...mapStyles.suggestionText, color: isDarkMode ? "rgba(255,255,255,0.88)" : "rgba(51,68,85,0.8)" }}>
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

// ─── Map Data ─────────────────────────────────────────────────────────────────
const CONTINENTS = [
  { name: "NORTH AMERICA", coords: [-100, 50] },
  { name: "SOUTH AMERICA", coords: [-58, -13] },
  { name: "EUROPE",        coords: [15, 48] },
  { name: "AFRICA",        coords: [20, 13] },
  { name: "ASIA",          coords: [100, 50] },
  { name: "AUSTRALIA",     coords: [133, -27] },
];

const MAJOR_CITIES = [
  { name: "New York",     coords: [40.7128, -74.0060] },
  { name: "Los Angeles",  coords: [34.0522, -118.2437] },
  { name: "Chicago",      coords: [41.8781, -87.6298] },
  { name: "Mexico City",  coords: [19.4326, -99.1332] },
  { name: "Toronto",      coords: [43.6532, -79.3832] },
  { name: "Bogotá",       coords: [4.7110, -74.0721] },
  { name: "Lima",         coords: [-12.0464, -77.0428] },
  { name: "Buenos Aires", coords: [-34.6037, -58.3816] },
  { name: "São Paulo",    coords: [-23.5505, -46.6333] },
  { name: "London",       coords: [51.5074, -0.1278] },
  { name: "Paris",        coords: [48.8566, 2.3522] },
  { name: "Madrid",       coords: [40.4168, -3.7038] },
  { name: "Rome",         coords: [41.9028, 12.4964] },
  { name: "Berlin",       coords: [52.5200, 13.4050] },
  { name: "Istanbul",     coords: [41.0082, 28.9784] },
  { name: "Cairo",        coords: [30.0444, 31.2357] },
  { name: "Lagos",        coords: [6.5244, 3.3792] },
  { name: "Nairobi",      coords: [-1.2921, 36.8219] },
  { name: "Cape Town",    coords: [-33.9249, 18.4241] },
  { name: "Dubai",        coords: [25.2048, 55.2708] },
  { name: "Mumbai",       coords: [19.0760, 72.8777] },
  { name: "Delhi",        coords: [28.6139, 77.2090] },
  { name: "Bangkok",      coords: [13.7563, 100.5018] },
  { name: "Singapore",    coords: [1.3521, 103.8198] },
  { name: "Tokyo",        coords: [35.6762, 139.6503] },
  { name: "Seoul",        coords: [37.5665, 126.9780] },
  { name: "Beijing",      coords: [39.9042, 116.4074] },
  { name: "Sydney",       coords: [-33.8688, 151.2093] },
  { name: "Melbourne",    coords: [-37.8136, 144.9631] },
  { name: "Auckland",     coords: [-36.8509, 174.7645] },
  { name: "Vancouver",    coords: [49.2827, -123.1207] },
  { name: "Miami",        coords: [25.7617, -80.1918] },
  { name: "Santiago",     coords: [-33.4489, -70.6693] },
  { name: "Lisbon",       coords: [38.7223, -9.1393] },
  { name: "Amsterdam",    coords: [52.3676, 4.9041] },
  { name: "Athens",       coords: [37.9838, 23.7275] },
  { name: "Johannesburg", coords: [-26.2041, 28.0473] },
  { name: "Jakarta",      coords: [-6.2088, 106.8456] },
  { name: "Hong Kong",    coords: [22.3193, 114.1694] },
  { name: "Osaka",        coords: [34.6937, 135.5023] },
  { name: "Moscow",       coords: [55.7558, 37.6173] },
  { name: "Tehran",       coords: [35.6892, 51.3890] },
  { name: "Riyadh",       coords: [24.7136, 46.6753] },
  { name: "Tel Aviv",     coords: [32.0853, 34.7818] },
  { name: "Baku",         coords: [40.4093, 49.8671] },
  { name: "Tashkent",     coords: [41.2995, 69.2401] },
  { name: "Almaty",       coords: [43.2389, 76.8897] },
];

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// ─── Map Phase ────────────────────────────────────────────────────────────────
function MapPhase({ onConfirm }) {
  const isDarkMode = useIsDarkMode();
  const mapBg = isDarkMode ? "#0f111a" : "#E8F4F8";

  const [selected, setSelected] = useState(null);
  const [position, setPosition] = useState({ coordinates: [0, 20], zoom: 1.8 });
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [focusedRecommendation, setFocusedRecommendation] = useState(null);
  const [recommendationCountry, setRecommendationCountry] = useState(null);
  const [cityRecommendations, setCityRecommendations] = useState(EMPTY_RECOMMENDATIONS);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationError, setRecommendationError] = useState("");

  const constrain = (pos) => {
    const vw = 360 / Math.max(1, pos.zoom);
    const vh = 180 / Math.max(1, pos.zoom);
    return {
      coordinates: [
        Math.max(-180 + vw / 2, Math.min(180 - vw / 2, pos.coordinates[0])),
        Math.max(-85 + vh / 2, Math.min(85 - vh / 2, pos.coordinates[1])),
      ],
      zoom: Math.max(1.8, Math.min(12, pos.zoom)),
    };
  };

  const handleCountryClick = useCallback(async (geo) => {
    const name = geo.properties.name;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)}&format=json&limit=1`,
        { headers: { "Accept-Language": "en" } }
      );
      const data = await res.json();
      setSelected({ name, coords: data[0] ? [parseFloat(data[0].lat), parseFloat(data[0].lon)] : [0, 0], type: "country", countryName: name });
      setRecommendationCountry(normalizeCountryName(name));
      setShowRecommendations(false);
      setFocusedRecommendation(null);
      setCityRecommendations([]);
      setRecommendationError("");
    } catch {
      setSelected({ name, coords: [0, 0], type: "country", countryName: name });
      setRecommendationCountry(normalizeCountryName(name));
      setShowRecommendations(false);
      setFocusedRecommendation(null);
      setCityRecommendations([]);
      setRecommendationError("");
    }
  }, []);

  const handleSearchSelect = useCallback(({ name, coords, type, countryName }) => {
    setSelected({ name, coords, type, countryName });
    setRecommendationCountry(type === "country" ? normalizeCountryName(countryName || "") : null);
    setShowRecommendations(false);
    setFocusedRecommendation(null);
    setCityRecommendations([]);
    setRecommendationError("");
    setPosition(constrain({ coordinates: [coords[1], coords[0]], zoom: 5 }));
  }, []);



  const fetchRecommendations = useCallback(async (countryName) => {
    if (!countryName) return;
    setRecommendationLoading(true);
    setRecommendationError("");
    setFocusedRecommendation(null);
    try {
      const response = await api.post("/recommend-cities", { country: countryName, limit: 5 });
      const items = Array.isArray(response?.data?.cities) ? response.data.cities : [];
      const normalized = items.slice(0, 5).map((city) => ({
        name: city.name,
        coords: [Number(city.lat) || 0, Number(city.lon) || 0],
        style: city.style_fit || "Great for diverse travel styles.",
        description: city.description || "A memorable destination with standout local experiences.",
        photos: cityPhotoUrls(city.name, countryName),
      }));
      setCityRecommendations(normalized);
      if (!normalized.length) {
        setRecommendationError("No recommendations were returned for this country yet.");
      }
    } catch (error) {
      setCityRecommendations([]);
      setRecommendationError(error?.response?.data?.detail || "Could not generate recommendations right now.");
    } finally {
      setRecommendationLoading(false);
    }
  }, []);





  const handleZoom = (delta) =>
    setPosition((prev) => constrain({ ...prev, zoom: prev.zoom + delta }));

  return (
    <div style={{ ...mapStyles.wrap, background: mapBg }}>
      <ComposableMap projection="geoMercator" projectionConfig={{ scale: 145 }}
        style={{ width: "100%", height: "100%", background: mapBg }}
      >
        <ZoomableGroup center={position.coordinates} zoom={position.zoom}
          onMoveEnd={(pos) => setPosition(constrain(pos))} minZoom={1.8} maxZoom={12}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) => geographies.map((geo) => (
              <Geography key={geo.rsmKey} geography={geo} onClick={() => handleCountryClick(geo)}
                style={{
                  default: isDarkMode
                    ? { fill: "#2a2f45", stroke: "#3e4a6e", strokeWidth: 0.4, outline: "none" }
                    : { fill: "#A8CFDF", stroke: "#8AB5C8", strokeWidth: 0.4, outline: "none" },
                  hover:   { fill: "rgba(13,148,136,0.65)", stroke: "#0d9488", strokeWidth: 0.6, outline: "none", cursor: "pointer" },
                  pressed: { fill: "#0d9488", outline: "none" },
                }}
              />
            ))}
          </Geographies>

          {CONTINENTS.map((c) => (
            <MapMarker key={c.name} coordinates={c.coords}>
              <text textAnchor="middle" style={{
                fontFamily: '"Pixelify Sans", sans-serif',
                fontSize: `${14 / position.zoom}px`,
                fill: isDarkMode ? "rgba(255,255,255,0.75)" : "rgba(70,100,130,0.6)",
                fontWeight: 900, letterSpacing: "0.15em", pointerEvents: "none", userSelect: "none",
              }}>{c.name}</text>
            </MapMarker>
          ))}

          {MAJOR_CITIES.map((city) => (
            <MapMarker key={city.name} coordinates={[city.coords[1], city.coords[0]]}
              onClick={() => onConfirm({ name: city.name, coords: city.coords })}
              style={{ cursor: "pointer" }}
            >
              <title>{city.name}</title>
              <circle r={2.6 / position.zoom} fill="#38bdf8" fillOpacity={0.92} />
              <circle r={5.2 / position.zoom} fill="#38bdf8" fillOpacity={0.2} />
              {position.zoom >= 2.2 && (
                <text y={-7 / position.zoom} textAnchor="middle" style={{
                  fontFamily: '"Pixelify Sans", sans-serif',
                  fontSize: `${10 / position.zoom}px`,
                  fill: isDarkMode ? "rgba(255,255,255,0.8)" : "rgba(51,68,85,0.85)",
                  fontWeight: 700, pointerEvents: "none", userSelect: "none",
                }}>{city.name}</text>
              )}
            </MapMarker>
          ))}

          {selected && (
            <MapMarker coordinates={[selected.coords[1], selected.coords[0]]}>
              <circle r={5 / position.zoom} fill="#0d9488" stroke="#fff" strokeWidth={1.5 / position.zoom} />
              <circle r={11 / position.zoom} fill="#0d9488" fillOpacity={0.25} />
            </MapMarker>
          )}
        </ZoomableGroup>
      </ComposableMap>

      {/* Search overlay */}
      <div style={mapStyles.topOverlay}>
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          style={{
            ...mapStyles.titleCard,
            background: isDarkMode ? "rgba(10,10,18,0.82)" : "rgba(255,249,240,0.95)",
            border: isDarkMode ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(168,207,223,0.3)",
            boxShadow: isDarkMode ? "0 8px 40px rgba(0,0,0,0.5)" : "0 4px 16px rgba(168,207,223,0.15)",
          }}
        >
          <div style={mapStyles.appName}>✈️ Trip Planner AI</div>
          <div style={{ ...mapStyles.heroTitle, color: isDarkMode ? "#fff" : "#334455" }}>Where do you want to go?</div>
          <div style={{ ...mapStyles.heroHint, color: isDarkMode ? "rgba(255,255,255,0.45)" : "rgba(100,120,140,0.6)" }}>
            Search or click a country on the map
          </div>
          <MapSearchBar onSelect={handleSearchSelect} isDarkMode={isDarkMode} />
        </motion.div>
      </div>

      {/* Zoom controls — bottom right */}
      <div style={{
        position: "absolute", bottom: 32, right: 24, zIndex: 1000,
        display: "flex", flexDirection: "column", gap: 6,
      }}>
        {[{ label: "+", delta: 1.2 }, { label: "−", delta: -1.2 }].map(({ label, delta }) => (
          <button key={label} type="button" onClick={() => handleZoom(delta)} style={{
            width: 40, height: 40,
            background: isDarkMode ? "rgba(10,10,18,0.88)" : "rgba(255,249,240,0.96)",
            border: isDarkMode ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(168,207,223,0.5)",
            borderRadius: 10, cursor: "pointer",
            color: isDarkMode ? "#fff" : "#334455",
            fontSize: "1.3rem", fontWeight: 700, lineHeight: 1,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 12px rgba(0,0,0,0.28)",
          }}>{label}</button>
        ))}
      </div>

      {/* Bottom CTA */}
      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}
            style={mapStyles.bottomOverlay}
          >
            <div style={mapStyles.selectedChip}>
              <span>📍</span>
              <span style={mapStyles.selectedName}>{selected.name}</span>
              <button type="button" style={mapStyles.clearBtn} onClick={() => {
                setSelected(null);
                setShowRecommendations(false);
                setFocusedRecommendation(null);
                setRecommendationCountry(null);
                setCityRecommendations([]);
                setRecommendationError("");
              }}>✕</button>
            </div>
            {selected.type === "country" && (
              <button
                type="button"
                onClick={async () => {
                  if (showRecommendations) {
                    setShowRecommendations(false);
                    return;
                  }
                  setShowRecommendations(true);
                  await fetchRecommendations(recommendationCountry);
                }}
                style={mapStyles.recommendBtn}
                disabled={recommendationLoading}
              >
                {recommendationLoading ? "Generating city recommendations..." : showRecommendations ? "Hide city recommendations" : "Recommend a city"}
              </button>
            )}
            {showRecommendations && (
              <div style={mapStyles.recommendPanel}>
                <div style={mapStyles.recommendTitle}>Top 5 cities in {recommendationCountry}</div>
                {recommendationError && <div style={mapStyles.recommendError}>{recommendationError}</div>}
                {!recommendationError && cityRecommendations.length === 0 && !recommendationLoading && (
                  <div style={mapStyles.recommendHint}>No recommendations available.</div>
                )}
                <div style={mapStyles.recommendList}>
                  {cityRecommendations.map((city) => (
                    <button
                      key={city.name}
                      type="button"
                      onClick={() => {
                        setFocusedRecommendation(city);
                        setSelected({ name: city.name, coords: city.coords, type: "city", countryName: recommendationCountry });
                        setPosition(constrain({ coordinates: [city.coords[1], city.coords[0]], zoom: 4.8 }));
                      }}
                      style={mapStyles.recommendCityBtn}
                    >
                      {city.name}
                    </button>
                  ))}
                </div>
                {focusedRecommendation && (
                  <div style={mapStyles.cityInfoCard}>
                    <div style={mapStyles.cityInfoHeader}>{focusedRecommendation.name}</div>
                    <div style={mapStyles.cityInfoStyle}>{focusedRecommendation.style}</div>
                    <div style={mapStyles.cityInfoDesc}>{focusedRecommendation.description}</div>
                    <div style={mapStyles.cityPhotoGrid}>
                      {focusedRecommendation.photos.map((src, idx) => (
                        <img key={`${focusedRecommendation.name}-${idx}`} src={src} alt={`${focusedRecommendation.name} view ${idx + 1}`} style={mapStyles.cityPhoto} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <motion.button type="button" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
              style={mapStyles.ctaBtn} onClick={() => onConfirm(selected)}
            >Plan this trip →</motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────────
function Tag({ label, selected: sel, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{
      ...styles.tag,
      background: sel ? "var(--cal-accent)" : "var(--bg-card)",
      border:     sel ? "1px solid var(--cal-accent)" : "1px solid var(--border-col)",
      color:      sel ? "#fff" : "var(--white)",
      fontWeight: sel ? 700 : 400,
    }}>{label}</button>
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

// ─── StepBox — unified shell for all 3 steps ─────────────────────────────────
// Constrains height to viewport, scrolls content internally, nav bar always visible
function StepBox({ children, onBack, backLabel = "← Back", onNext, onSubmit, loading, err, isLast }) {
  const isDarkMode = useIsDarkMode();
  const borderColor = isDarkMode ? "rgba(255,255,255,0.12)" : "rgba(168,207,223,0.35)";

  return (
    <div style={{
      background: isDarkMode ? "rgba(10,10,18,0.74)" : "rgba(255,249,240,0.95)",
      border: `1px solid ${borderColor}`,
      borderRadius: 16,
      width: "100%",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      minHeight: 0,
      overflow: "visible",   // remove maxHeight entirely
    }}>
      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px 8px" }}>
        {children}
      </div>

      {/* Error (inside box, above nav) */}
      {err && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ ...styles.errBox, margin: "0 22px 0", flexShrink: 0 }}
        >{err}</motion.div>
      )}

      {/* Nav bar — sticky at bottom of box */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 22px 14px",
        borderTop: `1px solid ${borderColor}`,
        flexShrink: 0,
        marginTop: 8,
      }}>
        <button type="button" style={styles.backBtn} onClick={onBack} disabled={loading}>
          {backLabel}
        </button>
        <div style={{ flex: 1 }} />
        {isLast ? (
          <button type="button"
            style={{ ...styles.nextBtn, minWidth: 200, justifyContent: "center" }}
            onClick={onSubmit} disabled={loading}
          >
            {loading ? <><LoadingDots /> Generating…</> : "✈️ Generate My Trip Plan"}
          </button>
        ) : (
          <button type="button" style={styles.nextBtn} onClick={onNext} disabled={loading}>
            Next →
          </button>
        )}
      </div>

      {loading && (
        <div style={{ ...styles.loadingNote, padding: "0 22px 10px", flexShrink: 0 }}>
          AI is crafting your personalized plan. This may take 15–30 seconds…
        </div>
      )}
    </div>
  );
}

// ─── Wizard ───────────────────────────────────────────────────────────────────
export default function Wizard() {
  const nav = useNavigate();

  const [mapDone, setMapDone]         = useState(false);
  const [destination, setDestination] = useState("");

  const [step, setStep]           = useState(0);
  const [direction, setDirection] = useState(1);
  const prevStepRef               = useRef(0);

  const [dateRange, setDateRange] = useState({ from: undefined, to: undefined });
  const [showCal, setShowCal]     = useState(false);
  const [calMonth, setCalMonth]   = useState(() => { const d = new Date(); d.setDate(1); return d; });

  const [budget, setBudget]       = useState("");
  const [currency, setCurrency]   = useState("USD");
  const [budgetPriorities, setBudgetPriorities] = useState([]);
  const [activityPrefs, setActivityPrefs]       = useState([]);
  const [tripType, setTripType]   = useState("solo");
  const [groupSize, setGroupSize] = useState(1);
  const [notes, setNotes]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState("");

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
  const handleBack = () => {
    setErr("");
    if (step === 0) { setMapDone(false); prevStepRef.current = 0; }
    else goTo(step - 1);
  };

const handleSubmit = async () => {
  setErr(""); setLoading(true);
  try {
    const payload = {
      destination: destination.trim(),
      start_date: toYYYYMMDD(dateRange.from),
      end_date: toYYYYMMDD(dateRange.to),
      budget: Number(budget), currency,
      budget_priorities: budgetPriorities,
      activity_preferences: activityPrefs,
      trip_type: tripType, group_size: Number(groupSize),
      additional_notes: notes.trim() || null,
    };
    const res = await api.post("/plan", payload);
    nav("/plan", { state: { plan: res.data, preferences: payload } });
  } catch (e) {
    const detail = e?.response?.data?.detail;
    if (detail) {
      setErr(detail);
    } else if (e?.code === "ERR_NETWORK") {
      setErr("Cannot reach the API server. Make sure backend is running and VITE_API_BASE_URL points to it.");
    } else {
      setErr(e?.message || "Failed to generate trip plan.");
    }
  } finally { setLoading(false); }
};


  const stepVariants = {
    enter:  (d) => ({ x: d * 60, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit:   (d) => ({ x: d * -60, opacity: 0 }),
  };

  if (!mapDone) {
    return (
      <AnimatePresence>
        <motion.div key="map" initial={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.5 }} style={{ position: "absolute", inset: 0 }}
        >
          <MapPhase onConfirm={(sel) => { setDestination(sel.name); setMapDone(true); }} />
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <motion.div key="form" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }} style={styles.wrap}
    >
      <div style={styles.content}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.title}>📍 {destination}</div>
          <div style={styles.subtitle}>Now let's fill in the details</div>
        </div>

        <StepDots step={step} />

        <div style={styles.cardWrap}>
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div key={step} custom={direction} variants={stepVariants}
              initial="enter" animate="center" exit="exit"
              transition={{ duration: 0.28, ease: "easeInOut" }}
              style={{ width: "100%" }}
            >
              {step === 0 && (
                <StepBox
                  onBack={handleBack} backLabel="← Back to Map"
                  onNext={handleNext} loading={loading} err={err}
                >
                  <StepDatesAndBudget
                    dateRange={dateRange} setDateRange={setDateRange}
                    showCal={showCal} setShowCal={setShowCal}
                    calMonth={calMonth} setCalMonth={setCalMonth}
                    budget={budget} setBudget={setBudget}
                    currency={currency} setCurrency={setCurrency}
                  />
                </StepBox>
              )}
              {step === 1 && (
                <StepBox onBack={handleBack} onNext={handleNext} loading={loading} err={err}>
                  <StepPreferences
                    budgetPriorities={budgetPriorities}
                    togglePriority={(id) => toggleTag(budgetPriorities, setBudgetPriorities, id)}
                    activityPrefs={activityPrefs}
                    toggleActivity={(id) => toggleTag(activityPrefs, setActivityPrefs, id)}
                  />
                </StepBox>
              )}
              {step === 2 && (
                <StepBox onBack={handleBack} onSubmit={handleSubmit} loading={loading} err={err} isLast>
                  <StepTripDetails
                    tripType={tripType} setTripType={setTripType}
                    groupSize={groupSize} setGroupSize={setGroupSize}
                    notes={notes} setNotes={setNotes}
                  />
                </StepBox>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Step Content ─────────────────────────────────────────────────────────────

function StepDatesAndBudget({
  dateRange, setDateRange, showCal, setShowCal, calMonth, setCalMonth,
  budget, setBudget, currency, setCurrency,
}) {
  const isDarkMode = useIsDarkMode();
  const inputBg     = isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(168,207,223,0.12)";
  const panelBorder = isDarkMode ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(168,207,223,0.35)";

  const handleDateSelect = (_range, selectedDay) => {
    if (!selectedDay) return;
    if (!dateRange.from || dateRange.to) { setDateRange({ from: selectedDay, to: undefined }); return; }
    const from = dateRange.from;
    const to   = selectedDay >= from ? selectedDay : from;
    const nfrom = selectedDay >= from ? from : selectedDay;
    setDateRange({ from: nfrom, to });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 6 }}>
      <div style={styles.stepLabel}>Step 1 of 3</div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1fr)", gap: 18 }}>
        {/* Left: calendar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={styles.stepTitle}>When are you traveling?</div>
          <button type="button"
            style={{ ...styles.dateDisplayBtn, background: inputBg, border: panelBorder }}
            onClick={() => setShowCal((v) => !v)}
          >📅 {formatDateRange(dateRange)}</button>
          <AnimatePresence>
            {showCal && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22 }}
                style={{ overflow: "hidden" }}
              >
                <div className="calendar-picker" style={{
                  ...styles.calCard, background: inputBg, border: panelBorder, fontSize: "0.88rem",
                }}>
                  <DayPicker mode="range" selected={dateRange} onSelect={handleDateSelect}
                    month={calMonth} onMonthChange={setCalMonth}
                    disabled={{ before: new Date() }} showOutsideDays
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {/* Right: budget */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={styles.stepTitle}>Total budget?</div>
          <div style={{ display: "flex", gap: 8 }}>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}
              style={{ ...styles.input, background: inputBg, border: panelBorder, flex: "0 0 78px", padding: "12px 6px" }}
            >{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <input type="number" min="1" placeholder="e.g. 3000" value={budget}
              onChange={(e) => setBudget(e.target.value)}
              style={{ ...styles.input, background: inputBg, border: panelBorder, flex: 1 }}
            />
          </div>
          <div style={styles.stepHint}>Hotels, food, activities, transport — all included</div>
        </div>
      </div>
    </div>
  );
}

function StepPreferences({ budgetPriorities, togglePriority, activityPrefs, toggleActivity }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 6 }}>
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
      <div style={styles.stepTitle}>What activities do you enjoy?</div>
      <div style={styles.tagGrid}>
        {ACTIVITY_TAGS.map((t) => (
          <Tag key={t.id} label={t.label} selected={activityPrefs.includes(t.id)} onClick={() => toggleActivity(t.id)} />
        ))}
      </div>
    </div>
  );
}

function StepTripDetails({ tripType, setTripType, groupSize, setGroupSize, notes, setNotes }) {
    const handleTripTypeSelect = (nextTripType) => {
    setTripType(nextTripType);
    setGroupSize(nextTripType === "solo" ? 1 : 2);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 6 }}>
      <div style={styles.stepLabel}>Step 3 of 3</div>
      <div style={styles.stepTitle}>Trip type</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {TRIP_TYPES.map((tt) => (
          <Tag key={tt.id} label={tt.label} selected={tripType === tt.id} onClick={() => handleTripTypeSelect(tt.id)} />
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
      <textarea placeholder="e.g. I love sushi, want to visit temples, need wheelchair access…"
        value={notes} onChange={(e) => setNotes(e.target.value)}
        style={styles.textarea} rows={3}
      />
      <div style={styles.readyBox}>
        <div style={styles.readyTitle}>You're all set! 🎉</div>
        <div style={styles.readyText}>
          Hit Generate below — our AI will craft hotels, activities, a day-by-day itinerary, and budget breakdown just for you.
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
  wrap: { position: "relative", width: "100%", height: "100%", overflow: "hidden" },
  topOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 1000,
    display: "flex", justifyContent: "center",
    padding: "72px 20px 0", pointerEvents: "none",
  },
  titleCard: {
    backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
    borderRadius: 20, padding: "20px 24px 16px",
    maxWidth: 520, width: "100%",
    display: "flex", flexDirection: "column", gap: 6, pointerEvents: "all",
  },
  appName: { fontSize: "0.8rem", fontWeight: 700, color: "var(--cal-accent)", textTransform: "uppercase", letterSpacing: "0.1em" },
  heroTitle: { fontSize: "1.9rem", fontWeight: 900, fontFamily: '"Pixelify Sans", sans-serif', lineHeight: 1.2 },
  heroHint: { fontSize: "0.82rem", marginBottom: 6 },
  searchWrap: { position: "relative", width: "100%" },
  searchRow: { display: "flex", alignItems: "center", gap: 8, borderRadius: 12, padding: "10px 14px" },
  searchIcon: { fontSize: "1rem", flexShrink: 0 },
  searchInput: { flex: 1, background: "transparent", border: "none", outline: "none", fontSize: "1rem", fontFamily: "inherit" },
  searchSpinner: { fontSize: "0.85rem", flexShrink: 0 },
  suggestionList: {
    position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
    backdropFilter: "blur(20px)", borderRadius: 12, padding: "6px 0",
    margin: 0, listStyle: "none", zIndex: 2000, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
  },
  suggestionItem: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "9px 14px", cursor: "pointer", transition: "background 0.15s",
    borderRadius: 8, margin: "0 4px",
  },
  suggestionIcon: { fontSize: "1rem", flexShrink: 0 },
  suggestionText: { fontSize: "0.9rem", lineHeight: 1.3 },
  bottomOverlay: {
    position: "absolute", bottom: 28, left: 0, right: 0, zIndex: 1000,
    display: "flex", flexDirection: "column", alignItems: "center", gap: 12, pointerEvents: "none",
  },
  selectedChip: {
    display: "flex", alignItems: "center", gap: 8,
    background: "rgba(10,10,18,0.85)", backdropFilter: "blur(16px)",
    border: "1px solid rgba(13,148,136,0.5)", borderRadius: 24, padding: "8px 16px",
    pointerEvents: "all", boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
  },
  selectedName: {
    color: "#fff", fontSize: "0.95rem", fontWeight: 600,
    maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  clearBtn: { background: "transparent", border: "none", color: "rgba(255,255,255,0.45)", cursor: "pointer", padding: "0 0 0 4px", fontSize: "0.85rem" },
  ctaBtn: {
    padding: "14px 36px", background: "var(--cal-accent)", color: "#fff",
    border: "none", borderRadius: 14, fontSize: "1.1rem", fontWeight: 700,
    fontFamily: '"Pixelify Sans", sans-serif', cursor: "pointer",
    pointerEvents: "all", boxShadow: "0 4px 24px rgba(13,148,136,0.5)", letterSpacing: "0.02em",
  },
  recommendBtn: {
    padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(10,10,18,0.85)", color: "#fff", cursor: "pointer", pointerEvents: "all",
    fontSize: "0.9rem", fontWeight: 700,
  },
  recommendPanel: {
    width: "min(760px, 92vw)", background: "rgba(10,10,18,0.88)", border: "1px solid rgba(255,255,255,0.16)",
    borderRadius: 14, padding: 14, pointerEvents: "all", color: "#fff", display: "flex", flexDirection: "column", gap: 10,
  },
  recommendTitle: { fontSize: "0.95rem", fontWeight: 700 },
  recommendError: { color: "#fda4af", fontSize: "0.84rem" },
  recommendHint: { color: "rgba(255,255,255,0.75)", fontSize: "0.84rem" },
  recommendList: { display: "flex", flexWrap: "wrap", gap: 8 },
  recommendCityBtn: {
    background: "rgba(13,148,136,0.2)", color: "#fff", border: "1px solid rgba(13,148,136,0.5)",
    padding: "8px 12px", borderRadius: 999, cursor: "pointer", fontWeight: 600,
  },
  cityInfoCard: {
    borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6,
  },
  cityInfoHeader: { fontFamily: '"Pixelify Sans", sans-serif', fontSize: "1.2rem", fontWeight: 700 },
  cityInfoStyle: { color: "#7ee7d6", fontSize: "0.9rem" },
  cityInfoDesc: { color: "rgba(255,255,255,0.86)", fontSize: "0.86rem", lineHeight: 1.4 },
  cityPhotoGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 },
  cityPhoto: { width: "100%", height: 120, objectFit: "cover", borderRadius: 8 },
};

const styles = {
  wrap: {
  display: "flex", flexDirection: "column", alignItems: "center",
  minHeight: "100vh",
  width: "100%",
  padding: "20px 16px 80px",  // increased bottom padding from 16px to 80px
  boxSizing: "border-box",
  overflow: "visible",
},
content: {
  display: "flex", flexDirection: "column", alignItems: "center",
  width: "100%", maxWidth: 860,
  gap: 12,
  minHeight: 0,              // remove height: "100%"
},
  header: { textAlign: "center", width: "100%", flexShrink: 0 },
  title: { fontSize: "1.8rem", fontWeight: 900, fontFamily: '"Pixelify Sans", sans-serif', color: "var(--white)" },
  subtitle: { fontSize: "0.9rem", color: "var(--text-muted)", marginTop: 2 },
  dots: { display: "flex", gap: 6, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  dot: { height: 8, borderRadius: 4, transition: "all 0.3s ease" },
  // cardWrap grows to fill remaining height so StepBox gets the space it needs
  cardWrap: { width: "100%", minHeight: 0, overflow: "visible" },  // remove flex: 1
  stepLabel: { fontSize: "0.73rem", color: "var(--cal-accent)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" },
  stepTitle: { fontSize: "1.1rem", fontWeight: 700, fontFamily: '"Pixelify Sans", sans-serif', color: "var(--white)" },
  stepHint:  { fontSize: "0.83rem", color: "var(--text-muted)", marginTop: -6 },
  input: {
    width: "100%", padding: "12px 14px", borderRadius: 10,
    border: "1px solid var(--border-col)", background: "var(--bg-input)",
    color: "var(--white)", fontSize: "1rem", fontFamily: "inherit",
    outline: "none", boxSizing: "border-box",
  },
  dateDisplayBtn: {
    width: "100%", padding: "12px 14px", borderRadius: 10,
    color: "var(--white)", fontSize: "0.92rem", textAlign: "left",
    cursor: "pointer", fontFamily: '"Pixelify Sans", sans-serif',
  },
  calCard: { borderRadius: 12, padding: 8, marginTop: 4 },
  tagGrid: { display: "flex", flexWrap: "wrap", gap: 8 },
  tag: { padding: "8px 14px", borderRadius: 20, cursor: "pointer", fontSize: "0.88rem", fontFamily: "inherit", transition: "all 0.15s" },
  tagRank: {
    position: "absolute", top: -6, right: -6,
    background: "#fff", color: "var(--cal-accent)", borderRadius: "50%",
    width: 18, height: 18, fontSize: "0.62rem", fontWeight: 900,
    display: "flex", alignItems: "center", justifyContent: "center",
    lineHeight: 1, boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
  },
  counterBtn: {
    width: 38, height: 38, borderRadius: "50%",
    border: "1px solid var(--border-col)", background: "var(--bg-card)",
    color: "var(--white)", fontSize: "1.3rem", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 0, flexShrink: 0,
  },
  textarea: {
    width: "100%", padding: "12px 14px", borderRadius: 10,
    border: "1px solid var(--border-col)", background: "var(--bg-input)",
    color: "var(--white)", fontSize: "1rem", fontFamily: "inherit",
    resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.6,
  },
  readyBox: { background: "rgba(13,148,136,0.1)", border: "1px solid var(--cal-accent)", borderRadius: 12, padding: "14px 18px" },
  readyTitle: { fontSize: "1rem", fontWeight: 700, fontFamily: '"Pixelify Sans", sans-serif', color: "var(--cal-accent-fg)", marginBottom: 5 },
  readyText: { fontSize: "0.88rem", color: "var(--text-muted)", lineHeight: 1.6 },
  backBtn: {
    padding: "10px 18px", borderRadius: 10,
    border: "1px solid var(--border-col)", background: "transparent",
    color: "var(--white)", fontSize: "0.95rem", cursor: "pointer",
    fontFamily: '"Pixelify Sans", sans-serif', flexShrink: 0,
  },
  nextBtn: {
    padding: "10px 24px", borderRadius: 10, border: "none",
    background: "var(--cal-accent)", color: "#fff",
    fontSize: "0.95rem", fontWeight: 700, cursor: "pointer",
    fontFamily: '"Pixelify Sans", sans-serif',
    display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
  },
  errBox: {
    background: "rgba(255,100,100,0.12)", border: "1px solid rgba(255,100,100,0.35)",
    borderRadius: 10, padding: "10px 16px",
    color: "var(--white)", boxSizing: "border-box", fontSize: "0.88rem",
  },
  loadingNote: { color: "var(--text-muted)", fontSize: "0.82rem", textAlign: "center", lineHeight: 1.5 },
  divider: { width: "100%", height: 1, background: "var(--border-col)", margin: "2px 0" },
};
