import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGeneration } from "../contexts/GenerationContext";
import { DayPicker } from "react-day-picker";
import { AnimatePresence, motion, Reorder } from "framer-motion";
import { ComposableMap, Geographies, Geography, ZoomableGroup, Marker as MapMarker } from "react-simple-maps";
import "react-day-picker/dist/style.css";
import api from "../api";
import { useIsDarkMode, useTheme } from "../contexts/ThemeContext";
import ThemeToggle from "../components/ThemeToggle";
import { useIsMobile } from "../hooks/useIsMobile";

// ─── City name normalizer ─────────────────────────────────────────────────────
function formatCityFromNominatim(item) {
  const a = item.address || {};
  const city = a.city || a.town || a.village || a.municipality || a.suburb || item.display_name.split(",")[0].trim();
  const state = a.state || a.province || "";
  const country = a.country || "";
  if (state && country) return `${city}, ${state}, ${country}`;
  if (country) return `${city}, ${country}`;
  return city;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TOTAL_STEPS = 2;

const BUDGET_PRIORITIES = [
  { id: "hotels",        label: "🏨 Hotels" },
  { id: "activities",    label: "🎭 Experiences & Attractions" },
  { id: "food",          label: "🍽️ Food & Dining" },
  { id: "transport",     label: "🚗 Transportation" },
  { id: "shopping",      label: "🛍️ Shopping" },
  { id: "entertainment", label: "🎵 Entertainment" },
];

const ACTIVITY_TAGS = [
  { id: "nature",           label: "🌲 Nature" },
  { id: "culture_history",  label: "🏛️ Culture & History" },
  { id: "foodie",           label: "🍜 Foodie" },
  { id: "art",              label: "🎨 Art & Museums" },
  { id: "nightlife",        label: "🎉 Nightlife" },
  { id: "wellness",         label: "🧘 Relaxed & Wellness" },
  { id: "beach",            label: "🏖️ Beach & Water" },
  { id: "shopping",         label: "🛍️ Shopping" },
  { id: "family",           label: "👨‍👩‍👧 Family Friendly" },
  { id: "sightseeing",      label: "📸 Iconic Sightseeing" },
  { id: "luxury",           label: "💎 Luxury" },
];

const TRIP_TYPES = [
  { id: "solo",    label: "🧍 Solo" },
  { id: "couple",  label: "💑 Couple" },
  { id: "friends", label: "👯 Friends" },
  { id: "family",  label: "👨‍👩‍👧 Family" },
];

const CURRENCIES = ["CAD", "USD", "EUR", "JPY", "KRW"];




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

function haversineKm([lat1, lon1], [lat2, lon2]) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) result.push([arr[i], ...p]);
  }
  return result;
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

// ─── Location Input (origin, dropdown-only) ──────────────────────────────────
function LocationInput({ value, onChange, placeholder, inputStyle: style, isDarkMode }) {
  const [query, setQuery] = useState(value || "");
  const [confirmed, setConfirmed] = useState(!!value);
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
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1`,
          { headers: { "Accept-Language": "en" } }
        );
        setSuggestions(await res.json());
      } catch { setSuggestions([]); }
      finally { setLoading(false); }
    }, 350);
  }, []);

  const pick = (item) => {
    const name = formatCityFromNominatim(item);
    setQuery(name);
    setConfirmed(true);
    onChange(name);
    setSuggestions([]);
  };

  const handleEdit = (val) => {
    setQuery(val);
    setConfirmed(false);
    onChange("");
    search(val);
  };

  const listBg     = isDarkMode ? "rgba(36,36,36,0.97)" : "rgba(255,249,240,0.98)";
  const listBorder = isDarkMode ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(168,207,223,0.3)";
  const hoverBg    = isDarkMode ? "rgba(13,148,136,0.18)" : "rgba(168,207,223,0.2)";
  const textColor  = isDarkMode ? "rgba(255,255,255,0.88)" : "rgba(51,68,85,0.9)";
  const borderColor = confirmed ? "1px solid #0d9488" : style?.border;

  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <input
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => handleEdit(e.target.value)}
          style={{ ...style, border: borderColor }}
        />
        <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: "0.85rem", pointerEvents: "none" }}>
          {loading ? "⏳" : confirmed ? "✓" : ""}
        </span>
      </div>
      <AnimatePresence>
        {suggestions.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
            style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
              background: listBg, border: listBorder,
              backdropFilter: "blur(20px)", borderRadius: 10, padding: "6px 0",
              margin: 0, listStyle: "none", zIndex: 2000,
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
          >
            {suggestions.map((s) => (
              <li key={s.place_id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", cursor: "pointer", borderRadius: 6, margin: "0 4px", transition: "background 0.15s" }}
                onMouseEnter={(e) => e.currentTarget.style.background = hoverBg}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                <span style={{ fontSize: "0.9rem" }}>
                  {s.type === "country" ? "🌍" : s.addresstype === "city" || s.type === "city" ? "🏙️" : "📍"}
                </span>
                <span style={{ fontSize: "0.88rem", color: textColor, lineHeight: 1.3 }}>
                  {formatCityFromNominatim(s)}
                </span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
      {!confirmed && query.length > 0 && !loading && suggestions.length === 0 && (
        <div style={{ fontSize: "0.78rem", color: "#f87171", marginTop: 4 }}>
          Please select a location from the dropdown.
        </div>
      )}
    </div>
  );
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
    const name = isCountry
      ? (item.address?.country || item.display_name.split(",")[0].trim())
      : formatCityFromNominatim(item);
    onSelect({
      name,
      coords: [parseFloat(item.lat), parseFloat(item.lon)],
      type: isCountry ? "country" : "city",
      countryName: isCountry ? name : item.address?.country,
    });
    setQuery(name);
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
              background: isDarkMode ? "rgba(36,36,36,0.97)" : "rgba(255,249,240,0.98)",
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
                  {s.type === "country" || s.addresstype === "country"
                    ? (s.address?.country || s.display_name.split(",")[0].trim())
                    : formatCityFromNominatim(s)}
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

// tier 1 = always visible, tier 2 = zoom >= 2.8, tier 3 = zoom >= 4.5
const MAJOR_CITIES = [
  // ── Tier 1: global megacities ──────────────────────────────────────────────
  { name: "New York",        coords: [40.7128,  -74.0060],  tier: 1 },
  { name: "London",          coords: [51.5074,   -0.1278],  tier: 1 },
  { name: "Paris",           coords: [48.8566,    2.3522],  tier: 1 },
  { name: "Tokyo",           coords: [35.6762,  139.6503],  tier: 1 },
  { name: "Beijing",         coords: [39.9042,  116.4074],  tier: 1 },
  { name: "Mumbai",          coords: [19.0760,   72.8777],  tier: 1 },
  { name: "São Paulo",       coords: [-23.5505,  -46.6333], tier: 1 },
  { name: "Mexico City",     coords: [19.4326,  -99.1332],  tier: 1 },
  { name: "Cairo",           coords: [30.0444,   31.2357],  tier: 1 },
  { name: "Dubai",           coords: [25.2048,   55.2708],  tier: 1 },
  { name: "Sydney",          coords: [-33.8688,  151.2093], tier: 1 },
  { name: "Moscow",          coords: [55.7558,   37.6173],  tier: 1 },
  { name: "Buenos Aires",    coords: [-34.6037,  -58.3816], tier: 1 },
  { name: "Lagos",           coords: [6.5244,     3.3792],  tier: 1 },
  { name: "Seoul",           coords: [37.5665,  126.9780],  tier: 1 },

  // ── Tier 2: major regional cities ─────────────────────────────────────────
  { name: "Los Angeles",     coords: [34.0522,  -118.2437], tier: 2 },
  { name: "Chicago",         coords: [41.8781,   -87.6298], tier: 2 },
  { name: "Toronto",         coords: [43.6532,   -79.3832], tier: 2 },
  { name: "Vancouver",       coords: [49.2827,  -123.1207], tier: 2 },
  { name: "Miami",           coords: [25.7617,   -80.1918], tier: 2 },
  { name: "Bogotá",          coords: [4.7110,    -74.0721], tier: 2 },
  { name: "Lima",            coords: [-12.0464,  -77.0428], tier: 2 },
  { name: "Santiago",        coords: [-33.4489,  -70.6693], tier: 2 },
  { name: "Madrid",          coords: [40.4168,    -3.7038], tier: 2 },
  { name: "Rome",            coords: [41.9028,   12.4964],  tier: 2 },
  { name: "Berlin",          coords: [52.5200,   13.4050],  tier: 2 },
  { name: "Amsterdam",       coords: [52.3676,    4.9041],  tier: 2 },
  { name: "Lisbon",          coords: [38.7223,    -9.1393], tier: 2 },
  { name: "Athens",          coords: [37.9838,   23.7275],  tier: 2 },
  { name: "Istanbul",        coords: [41.0082,   28.9784],  tier: 2 },
  { name: "Tel Aviv",        coords: [32.0853,   34.7818],  tier: 2 },
  { name: "Riyadh",          coords: [24.7136,   46.6753],  tier: 2 },
  { name: "Tehran",          coords: [35.6892,   51.3890],  tier: 2 },
  { name: "Delhi",           coords: [28.6139,   77.2090],  tier: 2 },
  { name: "Bangkok",         coords: [13.7563,  100.5018],  tier: 2 },
  { name: "Singapore",       coords: [1.3521,   103.8198],  tier: 2 },
  { name: "Hong Kong",       coords: [22.3193,  114.1694],  tier: 2 },
  { name: "Osaka",           coords: [34.6937,  135.5023],  tier: 2 },
  { name: "Jakarta",         coords: [-6.2088,  106.8456],  tier: 2 },
  { name: "Melbourne",       coords: [-37.8136,  144.9631], tier: 2 },
  { name: "Auckland",        coords: [-36.8509,  174.7645], tier: 2 },
  { name: "Nairobi",         coords: [-1.2921,   36.8219],  tier: 2 },
  { name: "Cape Town",       coords: [-33.9249,  18.4241],  tier: 2 },
  { name: "Johannesburg",    coords: [-26.2041,  28.0473],  tier: 2 },
  { name: "Baku",            coords: [40.4093,   49.8671],  tier: 2 },

  // ── Tier 3: smaller / regional cities ─────────────────────────────────────
  { name: "San Francisco",   coords: [37.7749,  -122.4194], tier: 3 },
  { name: "Seattle",         coords: [47.6062,  -122.3321], tier: 3 },
  { name: "Boston",          coords: [42.3601,   -71.0589], tier: 3 },
  { name: "Houston",         coords: [29.7604,   -95.3698], tier: 3 },
  { name: "Atlanta",         coords: [33.7490,   -84.3880], tier: 3 },
  { name: "Montreal",        coords: [45.5017,   -73.5673], tier: 3 },
  { name: "Calgary",         coords: [51.0447,  -114.0719], tier: 3 },
  { name: "Caracas",         coords: [10.4806,   -66.9036], tier: 3 },
  { name: "Montevideo",      coords: [-34.9011,  -56.1645], tier: 3 },
  { name: "Barcelona",       coords: [41.3851,    2.1734],  tier: 3 },
  { name: "Munich",          coords: [48.1351,   11.5820],  tier: 3 },
  { name: "Hamburg",         coords: [53.5753,    9.9929],  tier: 3 },
  { name: "Vienna",          coords: [48.2082,   16.3738],  tier: 3 },
  { name: "Prague",          coords: [50.0755,   14.4378],  tier: 3 },
  { name: "Budapest",        coords: [47.4979,   19.0402],  tier: 3 },
  { name: "Warsaw",          coords: [52.2297,   21.0122],  tier: 3 },
  { name: "Stockholm",       coords: [59.3293,   18.0686],  tier: 3 },
  { name: "Copenhagen",      coords: [55.6761,   12.5683],  tier: 3 },
  { name: "Oslo",            coords: [59.9139,   10.7522],  tier: 3 },
  { name: "Helsinki",        coords: [60.1699,   24.9384],  tier: 3 },
  { name: "Brussels",        coords: [50.8503,    4.3517],  tier: 3 },
  { name: "Zurich",          coords: [47.3769,    8.5417],  tier: 3 },
  { name: "Dublin",          coords: [53.3498,   -6.2603],  tier: 3 },
  { name: "Edinburgh",       coords: [55.9533,   -3.1883],  tier: 3 },
  { name: "Bucharest",       coords: [44.4268,   26.1025],  tier: 3 },
  { name: "Belgrade",        coords: [44.8176,   20.4569],  tier: 3 },
  { name: "Tashkent",        coords: [41.2995,   69.2401],  tier: 3 },
  { name: "Almaty",          coords: [43.2389,   76.8897],  tier: 3 },
  { name: "Casablanca",      coords: [33.5731,   -7.5898],  tier: 3 },
  { name: "Tunis",           coords: [36.8065,   10.1815],  tier: 3 },
  { name: "Addis Ababa",     coords: [9.0320,    38.7469],  tier: 3 },
  { name: "Accra",           coords: [5.6037,    -0.1870],  tier: 3 },
  { name: "Dar es Salaam",   coords: [-6.7924,   39.2083],  tier: 3 },
  { name: "Kinshasa",        coords: [-4.3217,   15.3222],  tier: 3 },
  { name: "Doha",            coords: [25.2854,   51.5310],  tier: 3 },
  { name: "Amman",           coords: [31.9454,   35.9284],  tier: 3 },
  { name: "Beirut",          coords: [33.8938,   35.5018],  tier: 3 },
  { name: "Karachi",         coords: [24.8607,   67.0011],  tier: 3 },
  { name: "Dhaka",           coords: [23.8103,   90.4125],  tier: 3 },
  { name: "Colombo",         coords: [6.9271,    79.8612],  tier: 3 },
  { name: "Kathmandu",       coords: [27.7172,   85.3240],  tier: 3 },
  { name: "Kuala Lumpur",    coords: [3.1390,   101.6869],  tier: 3 },
  { name: "Manila",          coords: [14.5995,  120.9842],  tier: 3 },
  { name: "Taipei",          coords: [25.0330,  121.5654],  tier: 3 },
  { name: "Shanghai",        coords: [31.2304,  121.4737],  tier: 3 },
  { name: "Hanoi",           coords: [21.0285,  105.8542],  tier: 3 },
  { name: "Ho Chi Minh",     coords: [10.8231,  106.6297],  tier: 3 },
  { name: "Perth",           coords: [-31.9505,  115.8605], tier: 3 },
  { name: "Brisbane",        coords: [-27.4698,  153.0251], tier: 3 },

  // ── East Asia (China) ──────────────────────────────────────────────────────
  { name: "Guangzhou",       coords: [23.1291,  113.2644],  tier: 3 },
  { name: "Shenzhen",        coords: [22.5431,  114.0579],  tier: 3 },
  { name: "Chengdu",         coords: [30.5728,  104.0668],  tier: 3 },
  { name: "Xi'an",           coords: [34.3416,  108.9398],  tier: 3 },
  { name: "Hangzhou",        coords: [30.2741,  120.1551],  tier: 3 },
  { name: "Chongqing",       coords: [29.4316,  106.9123],  tier: 3 },
  { name: "Nanjing",         coords: [32.0603,  118.7969],  tier: 3 },
  { name: "Harbin",          coords: [45.8038,  126.5349],  tier: 3 },
  { name: "Qingdao",         coords: [36.0671,  120.3826],  tier: 3 },
  { name: "Kunming",         coords: [25.0458,  102.7097],  tier: 3 },

  // ── East Asia (Japan) ──────────────────────────────────────────────────────
  { name: "Kyoto",           coords: [35.0116,  135.7681],  tier: 3 },
  { name: "Fukuoka",         coords: [33.5904,  130.4017],  tier: 3 },
  { name: "Sapporo",         coords: [43.0618,  141.3545],  tier: 3 },
  { name: "Nagoya",          coords: [35.1815,  136.9066],  tier: 3 },
  { name: "Hiroshima",       coords: [34.3853,  132.4553],  tier: 3 },

  // ── East Asia (South Korea & Mongolia) ────────────────────────────────────
  { name: "Busan",           coords: [35.1796,  129.0756],  tier: 3 },
  { name: "Ulaanbaatar",     coords: [47.8864,  106.9057],  tier: 3 },

  // ── Southeast Asia ─────────────────────────────────────────────────────────
  { name: "Yangon",          coords: [16.8661,   96.1951],  tier: 3 },
  { name: "Phnom Penh",      coords: [11.5564,  104.9282],  tier: 3 },
  { name: "Chiang Mai",      coords: [18.7883,   98.9853],  tier: 3 },
  { name: "Penang",          coords: [5.4141,   100.3288],  tier: 3 },
  { name: "Bali",            coords: [-8.6705,  115.2126],  tier: 3 },
];

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json";

// ─── Map Phase ────────────────────────────────────────────────────────────────
function MapPhase({ onConfirm, initialIsMultiDest = false, initialMultiDests = [] }) {
  const isDarkMode = useIsDarkMode();
  const isMobile = useIsMobile();
  const mapBg = isDarkMode ? "#0d1424" : "#b8dce8";
  const cityPingColor = isDarkMode ? "#3b82f6" : "#0d6b8a";

  const [isMultiDest, setIsMultiDest] = useState(initialIsMultiDest);
  const [multiDests, setMultiDests] = useState(initialMultiDests);
  const [multiDestHint, setMultiDestHint] = useState("");

  const toggleMultiDestItem = useCallback((dest) => {
    setMultiDests((prev) => {
      const exists = prev.find((d) => d.name === dest.name);
      if (exists) return prev.filter((d) => d.name !== dest.name);
      if (prev.length >= 5) return prev;
      return [...prev, dest];
    });
  }, []);

  const [selected, setSelected] = useState(null);
  const [position, setPosition] = useState({ coordinates: [0, 20], zoom: 1.8 });
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [focusedRecommendation, setFocusedRecommendation] = useState(null);
  const [recommendationCountry, setRecommendationCountry] = useState(null);
  const [cityRecommendations, setCityRecommendations] = useState(EMPTY_RECOMMENDATIONS);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationError, setRecommendationError] = useState("");
  const [hoveredCountry, setHoveredCountry] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const constrain = (pos) => {
    const vw = 360 / Math.max(1, pos.zoom);
    const vh = 180 / Math.max(1, pos.zoom);
    return {
      coordinates: [
        Math.max(-180 + vw / 2, Math.min(180 - vw / 2, pos.coordinates[0])),
        Math.max(-85 + vh / 2, Math.min(85 - vh / 2, pos.coordinates[1])),
      ],
      zoom: Math.max(1.8, Math.min(40, pos.zoom)),
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
      const dest = { name, coords: data[0] ? [parseFloat(data[0].lat), parseFloat(data[0].lon)] : [0, 0], type: "country", countryName: name };
      if (isMultiDest) {
        setMultiDestHint(`Pick a specific city in ${name} — use the search bar or click a city pin`);
        setTimeout(() => setMultiDestHint(""), 3500);
      } else {
        setSelected(dest);
        setRecommendationCountry(normalizeCountryName(name));
        setShowRecommendations(false);
        setFocusedRecommendation(null);
        setCityRecommendations([]);
        setRecommendationError("");
      }
    } catch {
      if (isMultiDest) {
        setMultiDestHint(`Pick a specific city — use the search bar or click a city pin`);
        setTimeout(() => setMultiDestHint(""), 3500);
      } else {
        setSelected({ name, coords: [0, 0], type: "country", countryName: name });
        setRecommendationCountry(normalizeCountryName(name));
        setShowRecommendations(false);
        setFocusedRecommendation(null);
        setCityRecommendations([]);
        setRecommendationError("");
      }
    }
  }, [isMultiDest, toggleMultiDestItem]);

  const handleSearchSelect = useCallback(({ name, coords, type, countryName }) => {
    const shortName = type === "city" ? name.split(",")[0].trim() : name;
    const dest = { name: shortName, coords, type, countryName };
    if (isMultiDest) {
      if (type === "country") {
        setMultiDestHint(`Pick a specific city in ${shortName} — use the search bar or click a city pin`);
        setTimeout(() => setMultiDestHint(""), 3500);
        setPosition(constrain({ coordinates: [coords[1], coords[0]], zoom: 5 }));
        return;
      }
      toggleMultiDestItem(dest);
      setPosition(constrain({ coordinates: [coords[1], coords[0]], zoom: 5 }));
    } else {
      setSelected(dest);
      setRecommendationCountry(type === "country" ? normalizeCountryName(countryName || "") : null);
      setShowRecommendations(false);
      setFocusedRecommendation(null);
      setCityRecommendations([]);
      setRecommendationError("");
      setPosition(constrain({ coordinates: [coords[1], coords[0]], zoom: 5 }));
    }
  }, [isMultiDest, toggleMultiDestItem]);



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
        attractions: Array.isArray(city.attractions) ? city.attractions : [],
        vibe: city.vibe || "",
        best_for: city.best_for || "",
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





  const handleZoom = (factor) =>
    setPosition((prev) => constrain({ ...prev, zoom: prev.zoom * factor }));

  const mapRef = useRef(null);
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const handler = (e) => { if (e.ctrlKey) e.preventDefault(); };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const handleMapMouseMove = useCallback((e) => {
    if (!mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  return (
    <div ref={mapRef} style={{ ...mapStyles.wrap, background: mapBg }}
      onMouseMove={handleMapMouseMove}
      onMouseLeave={() => setHoveredCountry(null)}
    >
      <ComposableMap projection="geoMercator" projectionConfig={{ scale: 145 }}
        style={{ width: "100%", height: "100%", background: mapBg, shapeRendering: "geometricPrecision" }}
      >
        <ZoomableGroup center={position.coordinates} zoom={position.zoom}
          onMoveEnd={(pos) => setPosition(constrain(pos))} minZoom={1.8} maxZoom={40}
          filterZoomEvent={(e) => !e.button}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) => geographies.map((geo) => (
              <Geography key={geo.rsmKey} geography={geo}
                onClick={() => handleCountryClick(geo)}
                onMouseEnter={() => setHoveredCountry(geo.properties.name || null)}
                onMouseLeave={() => setHoveredCountry(null)}
                style={{
                  default: isDarkMode
                    ? { fill: "#1a2640", stroke: "rgba(100,160,255,0.9)", strokeWidth: 0.2 / position.zoom, outline: "none" }
                    : { fill: "#dff0f5", stroke: "#3a7a9c", strokeWidth: 0.2 / position.zoom, outline: "none" },
                  hover:   { fill: "rgba(59,130,246,0.55)", stroke: "#3b82f6", strokeWidth: 0.35 / position.zoom, outline: "none", cursor: "pointer" },
                  pressed: { fill: "#0d9488", outline: "none" },
                }}
              />
            ))}
          </Geographies>

          {CONTINENTS.map((c) => (
            <MapMarker key={c.name} coordinates={c.coords}>
              <text textAnchor="middle" style={{
                fontFamily: '"Pixelify Sans", sans-serif',
                fontSize: `${(isMobile ? 30 : 14) / position.zoom}px`,
                fill: isDarkMode ? "rgba(255,255,255,0.75)" : "rgba(70,100,130,0.6)",
                fontWeight: 900, letterSpacing: "0.15em", pointerEvents: "none", userSelect: "none",
              }}>{c.name}</text>
            </MapMarker>
          ))}

          {MAJOR_CITIES.filter((city) =>
            city.tier === 1 ||
            (city.tier === 2 && position.zoom >= 2.8) ||
            (city.tier === 3 && position.zoom >= 4.5)
          ).map((city) => {
            // Labels appear at different zoom thresholds per tier to avoid crowding
            const showLabel =
              (city.tier === 1 && position.zoom >= 2.2) ||
              (city.tier === 2 && position.zoom >= 3.5) ||
              (city.tier === 3 && position.zoom >= 6.0);
            return (
              <MapMarker key={city.name} coordinates={[city.coords[1], city.coords[0]]}
                onClick={() => {
                  if (isMultiDest) {
                    toggleMultiDestItem({ name: city.name, coords: city.coords, type: "city" });
                  } else {
                    onConfirm({ name: city.name, coords: city.coords });
                  }
                }}
                style={{ cursor: "pointer" }}
              >
                <title>{city.name}</title>
                <circle r={2.6 / position.zoom} fill={cityPingColor} fillOpacity={0.92} />
                <circle r={5.2 / position.zoom} fill={cityPingColor} fillOpacity={isDarkMode ? 0.2 : 0.3} />
                {showLabel && (
                  <text y={-(isMobile ? 22 : 7) / position.zoom} textAnchor="middle" style={{
                    fontFamily: '"Pixelify Sans", sans-serif',
                    fontSize: `${(isMobile ? 22 : 10) / position.zoom}px`,
                    fill: isDarkMode ? "rgba(255,255,255,0.8)" : "rgba(51,68,85,0.85)",
                    fontWeight: 700, pointerEvents: "none", userSelect: "none",
                  }}>{city.name}</text>
                )}
              </MapMarker>
            );
          })}

          {!isMultiDest && selected && (
            <MapMarker coordinates={[selected.coords[1], selected.coords[0]]}>
              <circle r={5 / position.zoom} fill="#0d9488" stroke="#fff" strokeWidth={1.5 / position.zoom} />
              <circle r={11 / position.zoom} fill="#0d9488" fillOpacity={0.25} />
            </MapMarker>
          )}

          {isMultiDest && multiDests.map((dest, i) => (
            <MapMarker key={dest.name} coordinates={[dest.coords[1], dest.coords[0]]}>
              <circle r={12 / position.zoom} fill="#0d9488" fillOpacity={0.22} />
              <circle r={7 / position.zoom} fill="#0d9488" stroke="#fff" strokeWidth={1.5 / position.zoom} />
              <text
                y={`${2.5 / position.zoom}`}
                textAnchor="middle"
                style={{
                  fontSize: `${8 / position.zoom}px`,
                  fill: "#fff", fontWeight: 900,
                  pointerEvents: "none", userSelect: "none",
                  fontFamily: "system-ui, sans-serif",
                }}
              >{i + 1}</text>
            </MapMarker>
          ))}
        </ZoomableGroup>
      </ComposableMap>

      {/* Search overlay */}
      <div style={mapStyles.topOverlay}>
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          style={{
            ...mapStyles.titleCard,
            padding: isMobile ? "10px 14px 10px" : "20px 24px 16px",
            gap: isMobile ? 4 : 6,
            background: isDarkMode ? "rgba(36,36,36,0.88)" : "rgba(255,249,240,0.95)",
            border: isDarkMode ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(168,207,223,0.3)",
            boxShadow: isDarkMode ? "0 8px 40px rgba(0,0,0,0.5)" : "0 4px 16px rgba(168,207,223,0.15)",
          }}
        >
          {!isMobile && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={mapStyles.appName}>✈️ Trip Planner AI</div>
            </div>
          )}
          <div style={{
            ...mapStyles.heroTitle,
            fontSize: isMobile ? "1.25rem" : "1.9rem",
            color: isDarkMode ? "#fff" : "#334455",
          }}>
            Where do you want to go?
          </div>
          {!isMobile && (
            <div style={{ ...mapStyles.heroHint, color: isDarkMode ? "rgba(255,255,255,0.45)" : "rgba(100,120,140,0.6)" }}>
              Search or click a country on the map
            </div>
          )}
          <MapSearchBar onSelect={handleSearchSelect} isDarkMode={isDarkMode} />

          {/* Multi-city toggle */}
          <button
            type="button"
            onClick={() => {
              setIsMultiDest((prev) => !prev);
              setMultiDests([]);
              setSelected(null);
              setShowRecommendations(false);
              setFocusedRecommendation(null);
              setCityRecommendations([]);
              setRecommendationError("");
            }}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "none", border: "none", cursor: "pointer", padding: "4px 2px",
              color: isDarkMode ? "rgba(255,255,255,0.6)" : "rgba(80,110,130,0.85)",
              fontSize: "0.82rem", fontFamily: '"Pixelify Sans", sans-serif', fontWeight: 600,
              textAlign: "left",
            }}
          >
            <span style={{
              width: 18, height: 18, borderRadius: 5, flexShrink: 0,
              border: `2px solid ${isMultiDest ? "#0d9488" : isDarkMode ? "rgba(255,255,255,0.3)" : "rgba(100,140,160,0.4)"}`,
              background: isMultiDest ? "#0d9488" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s",
            }}>
              {isMultiDest && <span style={{ color: "#fff", fontSize: 12, lineHeight: 1, fontWeight: 900 }}>✓</span>}
            </span>
            Multi-city trip
            {isMultiDest && (
              <span style={{
                marginLeft: 2,
                color: isDarkMode ? "rgba(255,255,255,0.35)" : "rgba(100,120,140,0.55)",
                fontSize: "0.76rem", fontWeight: 400,
              }}>
                {multiDests.length}/5 selected
              </span>
            )}
          </button>

          {/* Hint shown when user clicks a country in multi-dest mode */}
          <AnimatePresence>
            {isMultiDest && multiDestHint && (
              <motion.div
                key="mdHint"
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                style={{
                  fontSize: "0.78rem", color: "#f59e0b",
                  background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)",
                  borderRadius: 8, padding: "6px 10px",
                }}
              >
                ⚠️ {multiDestHint}
              </motion.div>
            )}
          </AnimatePresence>

          </motion.div>
      </div>

      {/* Zoom controls — bottom right */}
      <div style={{
        position: "absolute", bottom: 32, right: 24, zIndex: 1000,
        display: "flex", flexDirection: "column", gap: 6,
      }}>
        {[{ label: "+", delta: 1.5 }, { label: "−", delta: 1 / 1.5 }].map(({ label, delta }) => (
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

      {/* Bottom CTA — multi-dest mode */}
      <AnimatePresence>
        {isMultiDest && multiDests.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}
            style={mapStyles.bottomOverlay}
          >
            <div style={{
              display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8,
              maxWidth: "min(680px, 92vw)", pointerEvents: "all",
            }}>
              {multiDests.map((dest, i) => (
                <div key={dest.name} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "rgba(36,36,36,0.9)", backdropFilter: "blur(16px)",
                  border: "1px solid rgba(13,148,136,0.5)", borderRadius: 24,
                  padding: "6px 12px 6px 8px", boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
                }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: "50%",
                    background: "#0d9488", color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.72rem", fontWeight: 900, flexShrink: 0,
                  }}>{i + 1}</span>
                  <span style={{ color: "#fff", fontSize: "0.88rem", fontWeight: 600, whiteSpace: "nowrap" }}>{dest.name}</span>
                  <button type="button" onClick={() => toggleMultiDestItem(dest)} style={{
                    background: "transparent", border: "none", color: "rgba(255,255,255,0.4)",
                    cursor: "pointer", padding: "0 0 0 2px", fontSize: "0.8rem", lineHeight: 1,
                  }}>✕</button>
                </div>
              ))}
            </div>
            {multiDests.length < 2 && (
              <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.45)", pointerEvents: "none" }}>
                Select at least 2 destinations
              </div>
            )}
            {multiDests.length >= 2 && (
              <motion.button type="button" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                style={mapStyles.ctaBtn} onClick={() => onConfirm(multiDests)}
              >Plan Multi-City Trip →</motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom CTA — single-dest mode */}
      <AnimatePresence>
        {!isMultiDest && selected && (
          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}
            style={mapStyles.bottomOverlay}
          >
            <div style={mapStyles.selectedChip}>
              <span>📍</span>
              <span style={{
                ...mapStyles.selectedName,
                fontSize: isMobile ? "1.15rem" : "0.95rem",
              }}>{selected.name}</span>
              <button type="button" style={mapStyles.clearBtn} onClick={() => {
                setSelected(null);
                setShowRecommendations(false);
                setFocusedRecommendation(null);
                setRecommendationCountry(null);
                setCityRecommendations([]);
                setRecommendationError("");
              }}>✕</button>
            </div>
            {selected.type === "country" && !recommendationLoading && (
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
              >
                {showRecommendations ? "Hide city recommendations" : "Recommend a city"}
              </button>
            )}
            {showRecommendations && (
              <div style={mapStyles.recommendPanel}>
                {recommendationLoading ? (
                  <CityLoadingOverlay />
                ) : (
                <>
                <div style={mapStyles.recommendTitle}>Top 5 cities in {recommendationCountry}</div>
                {recommendationError && <div style={mapStyles.recommendError}>{recommendationError}</div>}
                {!recommendationError && cityRecommendations.length === 0 && (
                  <div style={mapStyles.recommendHint}>No recommendations available.</div>
                )}
                <div style={mapStyles.recommendList}>
                  {cityRecommendations.map((city) => (
                    <button
                      key={city.name}
                      type="button"
                      onClick={() => {
                        if (isMultiDest) {
                          toggleMultiDestItem({ name: city.name, coords: city.coords, type: "city", countryName: recommendationCountry });
                          setPosition(constrain({ coordinates: [city.coords[1], city.coords[0]], zoom: 4.8 }));
                        } else {
                          setFocusedRecommendation(city);
                          setSelected({ name: city.name, coords: city.coords, type: "city", countryName: recommendationCountry });
                          setPosition(constrain({ coordinates: [city.coords[1], city.coords[0]], zoom: 4.8 }));
                        }
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
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {focusedRecommendation.vibe && (
                        <div style={mapStyles.cityBulletRow}>
                          <span style={mapStyles.cityBulletIcon}>✨</span>
                          <span style={mapStyles.cityBulletText}><strong>Vibe:</strong> {focusedRecommendation.vibe}</span>
                        </div>
                      )}
                      {focusedRecommendation.best_for && (
                        <div style={mapStyles.cityBulletRow}>
                          <span style={mapStyles.cityBulletIcon}>🎯</span>
                          <span style={mapStyles.cityBulletText}><strong>Best for:</strong> {focusedRecommendation.best_for}</span>
                        </div>
                      )}
                      {focusedRecommendation.attractions.length > 0 && (
                        <div style={mapStyles.cityBulletRow}>
                          <span style={mapStyles.cityBulletIcon}>📍</span>
                          <span style={mapStyles.cityBulletText}>
                            <strong>Top attractions:</strong>{" "}
                            {focusedRecommendation.attractions.map((a, i) => (
                              <span key={i}>
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a + " " + focusedRecommendation.name)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: "#7ee7d6", textDecoration: "underline", textDecorationColor: "rgba(126,231,214,0.4)", cursor: "pointer" }}
                                >{a}</a>
                                {i < focusedRecommendation.attractions.length - 1 && <span style={{ opacity: 0.5 }}> · </span>}
                              </span>
                            ))}
                          </span>
                        </div>
                      )}
                      <div style={mapStyles.cityBulletRow}>
                        <span style={mapStyles.cityBulletIcon}>🗺️</span>
                        <span style={mapStyles.cityBulletText}>{focusedRecommendation.description}</span>
                      </div>
                    </div>
                  </div>
                )}
                </>
                )}
              </div>
            )}
            <motion.button type="button" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
              style={mapStyles.ctaBtn} onClick={() => onConfirm(selected)}
            >Plan this trip →</motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Country name tooltip — desktop hover only */}
      {hoveredCountry && !isMobile && (() => {
        const SHORT_NAMES = {
          "United States of America": "United States",
          "Russian Federation": "Russia",
          "United Kingdom of Great Britain and Northern Ireland": "United Kingdom",
          "Democratic Republic of the Congo": "DR Congo",
          "Republic of the Congo": "Congo",
          "Central African Republic": "Central Africa",
          "Dominican Republic": "Dominican Rep.",
          "Bosnia and Herzegovina": "Bosnia & Herzegovina",
          "Trinidad and Tobago": "Trinidad & Tobago",
          "Saint Vincent and the Grenadines": "St. Vincent",
          "Micronesia (Federated States of)": "Micronesia",
          "Iran (Islamic Republic of)": "Iran",
          "Korea (Republic of)": "South Korea",
          "Korea (Democratic People's Republic of)": "North Korea",
          "Tanzania, United Republic of": "Tanzania",
          "Syrian Arab Republic": "Syria",
          "Lao People's Democratic Republic": "Laos",
          "Venezuela (Bolivarian Republic of)": "Venezuela",
          "Bolivia (Plurinational State of)": "Bolivia",
        };
        const displayName = SHORT_NAMES[hoveredCountry] ?? hoveredCountry;
        return (
          <div style={{
            position: "absolute",
            left: Math.min(tooltipPos.x + 14, (mapRef.current?.offsetWidth ?? 9999) - 160),
            top: Math.max(tooltipPos.y - 36, 8),
            background: isDarkMode ? "rgba(10,10,24,0.92)" : "rgba(255,249,240,0.96)",
            color: isDarkMode ? "rgba(220,235,255,0.92)" : "#334455",
            border: isDarkMode ? "1px solid rgba(255,255,255,0.14)" : "1px solid rgba(168,207,223,0.5)",
            borderRadius: 8,
            padding: "5px 12px",
            fontSize: "0.82rem",
            fontWeight: 700,
            fontFamily: '"Pixelify Sans", sans-serif',
            pointerEvents: "none",
            zIndex: 500,
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
            whiteSpace: "nowrap",
            letterSpacing: "0.02em",
          }}>
            {displayName}
          </div>
        );
      })()}
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
function StepBox({ children, onBack, backLabel = "← Back", onAltBack, altBackLabel, onNext, onSubmit, loading, err, isLast, streamChars = 0 }) {
  const isDarkMode = useIsDarkMode();
  const isMobile = useIsMobile();
  const borderColor = isDarkMode ? "rgba(255,255,255,0.12)" : "rgba(168,207,223,0.35)";
  const isGenerating = loading && isLast;

  if (isGenerating) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", padding: "12px 0 20px" }}>
        <GeneratingOverlay chars={streamChars} />
      </div>
    );
  }

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
      overflow: "visible",
    }}>
      {/* Content area */}
      <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "14px 16px 8px" : "18px 22px 8px" }}>
        {children}
      </div>

      {/* Error */}
      {!isGenerating && err && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ ...styles.errBox, margin: isMobile ? "0 16px 0" : "0 22px 0", flexShrink: 0 }}
        >{err}</motion.div>
      )}

      {/* Nav bar — hidden while generating */}
      {!isGenerating && (
        <div style={{
          display: "flex",
          alignItems: "center",
          flexWrap: isMobile ? "wrap" : "nowrap",
          gap: isMobile ? 8 : 12,
          padding: isMobile ? "12px 16px 14px" : "14px 22px 16px",
          borderTop: `1px solid ${borderColor}`,
          flexShrink: 0,
          marginTop: 8,
        }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <motion.button
              type="button"
              whileHover={{ scale: 1.03, background: isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(168,207,223,0.2)" }}
              whileTap={{ scale: 0.97 }}
              style={{
                ...styles.backBtn,
                padding: isMobile ? "11px 18px" : "13px 26px",
                fontSize: isMobile ? "0.9rem" : "1rem",
              }}
              onClick={onBack}
              disabled={loading}
            >
              {backLabel}
            </motion.button>
            {onAltBack && (
              <motion.button
                type="button"
                whileHover={{ scale: 1.03, background: isDarkMode ? "rgba(13,148,136,0.12)" : "rgba(13,148,136,0.08)" }}
                whileTap={{ scale: 0.97 }}
                style={{
                  ...styles.backBtn,
                  padding: isMobile ? "11px 18px" : "13px 26px",
                  fontSize: isMobile ? "0.9rem" : "1rem",
                  border: "1px solid rgba(13,148,136,0.4)",
                  color: isDarkMode ? "#7ee7d6" : "#0d6b5e",
                }}
                onClick={onAltBack}
                disabled={loading}
              >
                {altBackLabel}
              </motion.button>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }} />
          {isLast ? (
            <motion.button
              type="button"
              whileHover={{ scale: 1.04, boxShadow: "0 8px 32px rgba(13,148,136,0.6)" }}
              whileTap={{ scale: 0.97 }}
              style={{
                ...styles.generateBtn,
                ...(isMobile && {
                  width: "100%",
                  padding: "14px 20px",
                  fontSize: "1rem",
                  justifyContent: "center",
                }),
              }}
              onClick={onSubmit}
              disabled={loading}
            >
              ✈️ Generate My Trip Plan
            </motion.button>
          ) : (
            <motion.button
              type="button"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              style={{
                ...styles.nextBtn,
                padding: isMobile ? "11px 22px" : "13px 30px",
              }}
              onClick={onNext}
              disabled={loading}
            >
              Next →
            </motion.button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Wizard ───────────────────────────────────────────────────────────────────
export default function Wizard() {
  const [mapDone, setMapDone]         = useState(false);
  const [origin, setOrigin]           = useState("");
  const [destination, setDestination] = useState("");
  const [destinations, setDestinations] = useState([]); // multi-dest array (empty = single-dest)
  const [autoDistribute, setAutoDistribute] = useState(true);
  // Array of city names, one per night — allows Osaka→Fukuoka→Osaka patterns
  const [dayAssignments, setDayAssignments] = useState([]);

  const [step, setStep]           = useState(0);
  const [direction, setDirection] = useState(1);
  const prevStepRef               = useRef(0);

  const [dateRange, setDateRange] = useState({ from: undefined, to: undefined });

  // Re-distribute nights equally whenever destinations or date range changes
  useEffect(() => {
    const totalNights = dateRange.from && dateRange.to
      ? Math.round((dateRange.to - dateRange.from) / (1000 * 60 * 60 * 24))
      : 0;
    if (destinations.length < 2 || totalNights <= 0) {
      setDayAssignments((prev) => prev.length === 0 ? prev : []);
      return;
    }
    const base = Math.floor(totalNights / destinations.length);
    const extra = totalNights % destinations.length;
    const init = [];
    destinations.forEach((d, i) => {
      for (let n = 0; n < base + (i < extra ? 1 : 0); n++) init.push(d.name);
    });
    setDayAssignments((prev) => {
      if (prev.length === init.length && prev.every((c, j) => c === init[j])) return prev;
      return init;
    });
  }, [destinations, dateRange.from, dateRange.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showCal, setShowCal]     = useState(false);
  const [calMonth, setCalMonth]   = useState(() => { const d = new Date(); d.setDate(1); return d; });

  const [budget, setBudget]       = useState("");
  const [budgetType, setBudgetType] = useState("total");
  const [currency, setCurrency]   = useState("CAD");
  const [transportMode, setTransportMode] = useState("flight");
  const [budgetPriorities, setBudgetPriorities] = useState(BUDGET_PRIORITIES.map(p => p.id));
  const [activityPrefs, setActivityPrefs]       = useState([]);
  const [tripType, setTripType]   = useState("solo");
  const [groupSize, setGroupSize] = useState(1);
  const [notes, setNotes]         = useState("");
  const { isGenerating, streamChars, genError, startGeneration, clearError } = useGeneration();
  const loading = isGenerating;
  const [err, setErr] = useState("");

  const toggleTag = (list, setList, id) =>
    setList((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const goTo = (next) => {
    setDirection(next > prevStepRef.current ? 1 : -1);
    prevStepRef.current = next;
    setStep(next);
  };

  const validateStep = () => {
    if (step === 0) {
      if (!origin.trim()) { setErr("Please tell us where you are traveling from."); return false; }
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

  const handleNewTrip = () => {
    setErr("");
    setDestinations([]);
    setDestination("");
    setMapDone(false);
    prevStepRef.current = 0;
  };

const handleSubmit = () => {
  setErr("");
  clearError();
  const payload = {
    origin: origin.trim(),
    destination: destination.trim(),
    start_date: toYYYYMMDD(dateRange.from),
    end_date: toYYYYMMDD(dateRange.to),
    budget: Number(budget), currency, budget_type: budgetType,
    budget_priorities: budgetPriorities,
    activity_preferences: activityPrefs,
    trip_type: tripType, group_size: Number(groupSize),
    transport_mode: transportMode,
    additional_notes: notes.trim() || null,
    ...(destinations.length > 1 && { destinations: destinations.map((d) => d.name) }),
    ...(destinations.length > 1 && {
      auto_distribute_days: autoDistribute,
      day_assignments: autoDistribute ? null : dayAssignments,
    }),
  };
  startGeneration(payload);
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
          <MapPhase
            initialIsMultiDest={destinations.length > 1}
            initialMultiDests={destinations.length > 1 ? destinations : []}
            onConfirm={(sel) => {
              if (Array.isArray(sel)) {
                setDestinations(sel);
                setDestination(sel.map((d) => d.name).join(" → "));
              } else {
                setDestinations([]);
                setDestination(sel.name);
              }
              setMapDone(true);
            }}
          />
          {isGenerating && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
              style={{
                position: "absolute", inset: 0, zIndex: 2000,
                background: "rgba(10, 16, 30, 0.82)",
                backdropFilter: "blur(6px)",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 20,
              }}
            >
              <GeneratingOverlay chars={streamChars} />
              <div style={{ fontSize: "0.8rem", color: "rgba(180,210,255,0.5)", marginTop: -8 }}>
                You can browse while we finish generating your trip
              </div>
            </motion.div>
          )}
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
                  onBack={handleBack}
                  backLabel={destinations.length > 1 ? "← Edit Route" : "← Back to Map"}
                  onAltBack={destinations.length > 1 ? handleNewTrip : undefined}
                  altBackLabel="🗺️ New Trip"
                  onNext={handleNext} loading={loading} err={err || genError}
                >
                  <StepDatesAndBudget
                    dateRange={dateRange} setDateRange={setDateRange}
                    showCal={showCal} setShowCal={setShowCal}
                    calMonth={calMonth} setCalMonth={setCalMonth}
                    origin={origin} setOrigin={setOrigin}
                    destination={destination}
                    destinations={destinations} setDestinations={setDestinations}
                    autoDistribute={autoDistribute} setAutoDistribute={setAutoDistribute}
                    dayAssignments={dayAssignments} setDayAssignments={setDayAssignments}
                    budget={budget} setBudget={setBudget}
                    budgetType={budgetType} setBudgetType={setBudgetType}
                    groupSize={groupSize} setGroupSize={setGroupSize}
                    currency={currency} setCurrency={setCurrency}
                    transportMode={transportMode} setTransportMode={setTransportMode}
                    tripType={tripType} setTripType={setTripType}
                  />
                </StepBox>
              )}
              {step === 1 && (
                <StepBox onBack={handleBack} onSubmit={handleSubmit} loading={loading} err={err || genError} isLast streamChars={streamChars}>
                  <StepPreferencesAndDetails
                    budgetPriorities={budgetPriorities}
                    setBudgetPriorities={setBudgetPriorities}
                    activityPrefs={activityPrefs}
                    toggleActivity={(id) => toggleTag(activityPrefs, setActivityPrefs, id)}
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


const TRANSPORT_MODES = [
  { id: "flight",     label: "✈️ Flight",      hint: "Round-trip airfare included" },
  { id: "own_car",    label: "🚗 Own Car",      hint: "Gas, tolls & parking only" },
  { id: "car_rental", label: "🚙 Car Rental",   hint: "Rental + gas costs included" },
  { id: "bus_train",  label: "🚌 Bus / Train",  hint: "Ticket cost included" },
];

// ─── Transport feasibility classifier ────────────────────────────────────────
function getLandmass(str = "") {
  const s = str.toLowerCase();
  // Island nations / landmasses that require flight to reach
  if (/\bjapan\b|tokyo|osaka|kyoto|hiroshima|sapporo|nagoya|fukuoka/.test(s))            return "japan";
  if (/\buk\b|united kingdom|england|scotland|wales|northern ireland|london|manchester|edinburgh|glasgow/.test(s)) return "uk";
  if (/\bireland\b|dublin|cork/.test(s))                                                  return "ireland";
  if (/\biceland\b|reykjavik/.test(s))                                                    return "iceland";
  if (/\baustralia\b|sydney|melbourne|brisbane|perth|adelaide|canberra/.test(s))          return "australia";
  if (/new zealand|auckland|wellington|christchurch/.test(s))                             return "new_zealand";
  if (/philippines|manila|cebu|davao/.test(s))                                            return "philippines";
  if (/indonesia|jakarta|bali|surabaya|bandung/.test(s))                                  return "indonesia";
  if (/\bsri lanka\b|colombo/.test(s))                                                    return "sri_lanka";
  if (/maldives|mauritius|seychelles|reunion/.test(s))                                    return "indian_ocean_islands";
  if (/\bcuba\b|havana|jamaica|kingston|barbados|trinidad|bahamas|nassau|haiti|port.au.prince|dominican|santo domingo|martinique|guadeloupe/.test(s)) return "caribbean";
  if (/\bhawaii\b|honolulu/.test(s))                                                      return "hawaii";
  if (/\btaiwan\b|taipei|kaohsiung/.test(s))                                              return "taiwan";
  if (/\bmadagascar\b/.test(s))                                                           return "madagascar";
  if (/\bsingapore\b/.test(s))                                                            return "singapore"; // city-state island

  // Americas (North + South, connected by Panama)
  if (/canada|ontario|british columbia|alberta|quebec|manitoba|saskatchewan|nova scotia|new brunswick|toronto|vancouver|montreal|calgary|ottawa|edmonton|winnipeg/.test(s)) return "americas";
  if (/united states|usa|\bu\.s\.a\b|new york|los angeles|chicago|houston|miami|seattle|boston|atlanta|denver|dallas|phoenix|san francisco|san diego|portland|las vegas/.test(s)) return "americas";
  if (/mexico|guadalajara|monterrey|cancun/.test(s))                                      return "americas";
  if (/brazil|argentina|colombia|peru|chile|venezuela|ecuador|bolivia|uruguay|paraguay|sao paulo|rio de janeiro|buenos aires|bogota|lima|santiago/.test(s)) return "americas";
  if (/costa rica|panama|guatemala|honduras|el salvador|nicaragua|belize/.test(s))        return "americas";

  // Afro-Eurasia (Europe + Asia mainland + Africa — all connected by land)
  if (/france|germany|spain|italy|portugal|netherlands|belgium|switzerland|austria|denmark|sweden|norway|finland|poland|czech|hungary|romania|bulgaria|greece|turkey|ukraine|serbia|croatia|slovakia|albania|lithuania|latvia|estonia|slovenia|luxembourg|malta/.test(s)) return "afro_eurasia";
  if (/paris|berlin|madrid|rome|amsterdam|barcelona|vienna|zurich|oslo|stockholm|helsinki|copenhagen|warsaw|athens|lisbon|brussels|budapest|prague|bucharest|sofia|zagreb/.test(s)) return "afro_eurasia";
  if (/russia|moscow|saint petersburg|novosibirsk/.test(s))                               return "afro_eurasia";
  if (/china|beijing|shanghai|guangzhou|shenzhen|chengdu|wuhan|hong kong|macau/.test(s)) return "afro_eurasia";
  if (/india|mumbai|delhi|bangalore|hyderabad|chennai|kolkata/.test(s))                   return "afro_eurasia";
  if (/south korea|north korea|seoul|busan/.test(s))                                     return "afro_eurasia"; // peninsula, connected via N.Korea
  if (/vietnam|thailand|myanmar|cambodia|laos|malaysia|kuala lumpur|hanoi|ho chi minh|bangkok/.test(s)) return "afro_eurasia";
  if (/bangladesh|pakistan|afghanistan|nepal|bhutan|mongolia|kazakhstan|uzbekistan|kyrgyzstan|tajikistan|turkmenistan|azerbaijan|georgia|armenia/.test(s)) return "afro_eurasia";
  if (/dubai|abu dhabi|uae|saudi arabia|riyadh|qatar|doha|kuwait|bahrain|oman|muscat|iran|tehran|iraq|baghdad|jordan|amman|lebanon|beirut|israel|tel aviv|jerusalem/.test(s)) return "afro_eurasia";
  if (/kenya|nairobi|nigeria|lagos|ethiopia|addis ababa|ghana|accra|tanzania|dar es salaam|south africa|johannesburg|cape town|morocco|casablanca|egypt|cairo|algeria|tunisia|senegal|dakar|ivory coast|abidjan|cameroon|uganda|rwanda|zimbabwe|zambia|mozambique/.test(s)) return "afro_eurasia";

  return "unknown";
}

// Returns set of mode IDs that should be disabled for this route
function getDisabledModes(originStr, destStr) {
  if (!originStr || !destStr) return new Set();
  const oLM = getLandmass(originStr);
  const dLM = getLandmass(destStr);
  if (oLM === "unknown" || dLM === "unknown") return new Set(); // can't determine — don't restrict

  // Same landmass: everything is allowed
  if (oLM === dLM) return new Set();

  // Landmasses that are standalone islands/continents — always need flight
  const alwaysIsland = new Set(["japan","uk","ireland","iceland","australia","new_zealand",
    "philippines","indonesia","sri_lanka","indian_ocean_islands","caribbean","hawaii","taiwan","madagascar"]);

  // Singapore is technically reachable by land/bridge from Malaysia (afro_eurasia) but not from Americas
  const oIsIsland = alwaysIsland.has(oLM) || oLM === "singapore";
  const dIsIsland = alwaysIsland.has(dLM) || dLM === "singapore";

  // Singapore ↔ Malaysia (afro_eurasia): allow all (bridge/causeway)
  if ((oLM === "singapore" && dLM === "afro_eurasia") || (oLM === "afro_eurasia" && dLM === "singapore")) {
    return new Set(); // Johor–Singapore causeway — drivable
  }

  // UK ↔ continental Europe: ferry/chunnel exists, allow bus_train; disable own_car/car_rental
  if ((oLM === "uk" && dLM === "afro_eurasia") || (oLM === "afro_eurasia" && dLM === "uk")) {
    return new Set(["own_car", "car_rental"]);
  }

  // Ireland ↔ UK: ferry, allow bus_train; disable own_car/car_rental
  if ((oLM === "ireland" && dLM === "uk") || (oLM === "uk" && dLM === "ireland")) {
    return new Set(["own_car", "car_rental"]);
  }

  // Any other cross-landmass: flight only
  if (oIsIsland || dIsIsland || oLM !== dLM) {
    return new Set(["own_car", "car_rental", "bus_train"]);
  }

  return new Set();
}

function StepDatesAndBudget({
  origin, setOrigin, destination, destinations = [], setDestinations,
  autoDistribute, setAutoDistribute, dayAssignments, setDayAssignments,
  dateRange, setDateRange, showCal, setShowCal, calMonth, setCalMonth,
  budget, setBudget, budgetType, setBudgetType, groupSize, setGroupSize, currency, setCurrency,
  transportMode, setTransportMode, tripType, setTripType,
}) {
  const isDarkMode = useIsDarkMode();
  const isMultiDestTrip = destinations.length > 1;

  // City palette state for painting mode
  const [activeCity, setActiveCity] = useState(() => destinations[0]?.name ?? "");
  const isPainting = useRef(false);

  // Reset active city if destinations change and current active no longer exists
  useEffect(() => {
    if (destinations.length > 0 && !destinations.some((d) => d.name === activeCity)) {
      setActiveCity(destinations[0].name);
    }
  }, [destinations]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear paint flag when mouse is released anywhere on page
  useEffect(() => {
    const onUp = () => { isPainting.current = false; };
    document.addEventListener("mouseup", onUp);
    return () => document.removeEventListener("mouseup", onUp);
  }, []);

  const assignDayToActiveCity = useCallback((day) => {
    if (!dateRange.from || !dateRange.to) return;
    const idx = Math.round((day.getTime() - dateRange.from.getTime()) / 86400000);
    if (idx < 0 || idx >= dayAssignments.length) return;
    setDayAssignments((prev) => {
      if (prev[idx] === activeCity) return prev;
      const next = [...prev];
      next[idx] = activeCity;
      return next;
    });
  }, [dateRange.from, dateRange.to, dayAssignments.length, activeCity, setDayAssignments]);

  // Build per-city date arrays for DayPicker modifiers
  const cityModifiers = useMemo(() => {
    if (!dateRange.from || dayAssignments.length === 0) return {};
    const result = {};
    destinations.forEach((dest) => { result[`city__${dest.name}`] = []; });
    dayAssignments.forEach((city, i) => {
      const date = new Date(dateRange.from.getTime() + i * 86400000);
      const key = `city__${city}`;
      if (result[key]) result[key].push(date);
    });
    return result;
  }, [dateRange.from, dayAssignments, destinations]);

  const cityModifierStyles = useMemo(() => {
    const result = {};
    destinations.forEach((dest, i) => {
      result[`city__${dest.name}`] = {
        backgroundColor: RANK_COLORS[i] ?? "#94a3b8",
        color: "#fff",
        borderRadius: "6px",
        fontWeight: 700,
      };
    });
    return result;
  }, [destinations]);

  const [optimizing, setOptimizing] = useState(false);
  const [isOptimized, setIsOptimized] = useState(false);
  const handleOptimize = async () => {
    if (!origin.trim() || destinations.length < 2) return;
    setOptimizing(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(origin)}&format=json&limit=1`,
        { headers: { "Accept-Language": "en" } }
      );
      const data = await res.json();
      if (!data[0]) return;
      const oCoords = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      let bestPerm = destinations;
      let bestDist = Infinity;
      for (const perm of permutations(destinations)) {
        let dist = haversineKm(oCoords, perm[0].coords);
        for (let j = 0; j < perm.length - 1; j++) dist += haversineKm(perm[j].coords, perm[j + 1].coords);
        dist += haversineKm(perm[perm.length - 1].coords, oCoords);
        if (dist < bestDist) { bestDist = dist; bestPerm = perm; }
      }
      setDestinations(bestPerm);
      setIsOptimized(true);
    } catch {
      // fail silently
    } finally {
      setOptimizing(false);
    }
  };

  const disabledModes = getDisabledModes(origin, destination);

  const handleTripTypeSelect = (next) => {
    setTripType(next);
    setGroupSize(next === "solo" ? 1 : 2);
  };

  // Auto-switch to flight if current mode becomes disabled
  useEffect(() => {
    if (disabledModes.has(transportMode)) setTransportMode("flight");
  }, [disabledModes, transportMode, setTransportMode]);
  const inputBg     = isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(168,207,223,0.12)";
  const panelBorder = isDarkMode ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(168,207,223,0.35)";

  const tripDays = dateRange.from && dateRange.to
    ? Math.round((dateRange.to - dateRange.from) / (1000 * 60 * 60 * 24))
    : null;
  const minDaysPerCity = 2;
  const idealDaysPerCity = 3;
  const paceTooTight = isMultiDestTrip && tripDays !== null && tripDays < destinations.length * minDaysPerCity;

  const numBudget = Number(budget) || 0;
  const numGroup  = Number(groupSize) || 1;
  const equivalentLabel = (() => {
    if (!numBudget) return null;
    if (budgetType === "per_person" && numGroup > 1)
      return `= ${currency} ${(numBudget * numGroup).toLocaleString()} total for ${numGroup} people`;
    if (budgetType === "total" && numGroup > 1)
      return `= ${currency} ${(numBudget / numGroup).toLocaleString(undefined, { maximumFractionDigits: 0 })} per person`;
    return null;
  })();

  const handleDateSelect = (_range, selectedDay) => {
    if (!selectedDay) return;
    if (!dateRange.from || dateRange.to) { setDateRange({ from: selectedDay, to: undefined }); return; }
    const from = dateRange.from;
    const to   = selectedDay >= from ? selectedDay : from;
    const nfrom = selectedDay >= from ? from : selectedDay;
    setDateRange({ from: nfrom, to });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 4 }}>
      <style>{`
        .calendar-picker .rdp { margin: 0; width: 100%; }
        .calendar-picker .rdp-month { width: 100%; }
        .calendar-picker .rdp-table { width: 100%; border-collapse: collapse; }
        .calendar-picker .rdp-cell, .calendar-picker .rdp-head_cell { padding: 1px; text-align: center; }
        .calendar-picker .rdp-day { height: 34px; width: 100%; max-width: 100%; font-size: 0.88rem; border-radius: 6px; }
        .calendar-picker .rdp-caption { padding: 2px 0; margin-bottom: 2px; }
        .calendar-picker .rdp-head_cell { font-size: 0.82rem; }
        .calendar-picker .rdp-caption_label { font-size: 0.95rem; padding-left: 10px; }
      `}</style>

      <div style={styles.stepLabel}>Step 1 of 2</div>

      {/* Route ordering — only shown for multi-destination trips */}
      {isMultiDestTrip && (
        <div style={{
          background: isDarkMode ? "rgba(13,148,136,0.06)" : "rgba(13,148,136,0.05)",
          border: isDarkMode ? "1px solid rgba(13,148,136,0.25)" : "1px solid rgba(13,148,136,0.2)",
          borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ ...styles.stepTitle, margin: 0 }}>🗺️ Trip Route</div>
              <AnimatePresence>
                {isOptimized && (
                  <motion.div
                    key="optimized-badge"
                    initial={{ opacity: 0, scale: 0.75 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.75 }}
                    transition={{ type: "spring", stiffness: 400, damping: 22 }}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      background: "rgba(13,148,136,0.15)",
                      border: "1px solid rgba(13,148,136,0.4)",
                      borderRadius: 20, padding: "3px 10px",
                      fontSize: "0.72rem", fontWeight: 700,
                      color: isDarkMode ? "#7ee7d6" : "#0d6b5e",
                      fontFamily: '"Pixelify Sans", sans-serif',
                      letterSpacing: "0.03em",
                    }}
                  >
                    ✓ Optimized
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button
              type="button"
              onClick={handleOptimize}
              disabled={optimizing || !origin.trim()}
              title={!origin.trim() ? "Fill in your departure city first" : "Sort by shortest travel distance from your origin"}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 8,
                border: "1px solid rgba(13,148,136,0.4)",
                background: isDarkMode ? "rgba(13,148,136,0.12)" : "rgba(13,148,136,0.08)",
                color: isDarkMode ? "#7ee7d6" : "#0d6b5e",
                cursor: optimizing || !origin.trim() ? "not-allowed" : "pointer",
                opacity: !origin.trim() ? 0.5 : 1,
                fontSize: "0.8rem", fontWeight: 700,
                fontFamily: '"Pixelify Sans", sans-serif',
                transition: "opacity 0.15s",
              }}
            >
              {optimizing ? "⏳ Optimizing…" : "✨ Optimize Order"}
            </button>
          </div>
          <Reorder.Group
            axis="y"
            values={destinations}
            onReorder={(next) => { setDestinations(next); setIsOptimized(false); }}
            style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 5 }}
          >
            {destinations.map((dest, i) => (
              <Reorder.Item
                key={dest.name}
                value={dest}
                style={{ listStyle: "none" }}
                initial={false}
                animate={{ scale: 1, boxShadow: "0px 0px 0px rgba(0,0,0,0)" }}
                whileDrag={{ scale: 1.03, boxShadow: "0px 10px 28px rgba(0,0,0,0.28)" }}
                transition={{ duration: 0.15 }}
              >
                <div style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "9px 12px", borderRadius: 11,
                  background: "var(--bg-card)", border: "1px solid var(--border-col)",
                  cursor: "grab", userSelect: "none",
                }}>
                  <div style={{
                    minWidth: 26, height: 26, borderRadius: "50%",
                    background: RANK_COLORS[i] ?? "#94a3b8",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.78rem", fontWeight: 900, color: "#fff", flexShrink: 0,
                    fontFamily: '"Pixelify Sans", sans-serif',
                  }}>{i + 1}</div>
                  <span style={{ flex: 1, fontSize: "0.9rem", color: "var(--white)", fontWeight: 500 }}>{dest.name}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: "1rem", opacity: 0.4 }}>⠿</span>
                </div>
              </Reorder.Item>
            ))}
          </Reorder.Group>
          {/* ── Day allocation ── */}
          {tripDays > 0 && (
            <div style={{
              borderTop: isDarkMode ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(168,207,223,0.25)",
              paddingTop: 10, display: "flex", flexDirection: "column", gap: 8,
            }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                Day Distribution
              </div>

              {/* Mode toggle */}
              <div style={{ display: "flex", borderRadius: 10, overflow: "hidden", border: isDarkMode ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(168,207,223,0.35)" }}>
                {[
                  { id: true,  label: "✨ Agent decides" },
                  { id: false, label: "📅 My schedule" },
                ].map(({ id, label }) => (
                  <button key={String(id)} type="button" onClick={() => setAutoDistribute(id)} style={{
                    flex: 1, padding: "8px 6px",
                    background: autoDistribute === id ? "var(--cal-accent)" : "transparent",
                    color: autoDistribute === id ? "#fff" : isDarkMode ? "rgba(255,255,255,0.5)" : "rgba(100,120,140,0.7)",
                    border: "none", cursor: "pointer",
                    fontSize: "0.82rem", fontWeight: 700,
                    fontFamily: '"Pixelify Sans", sans-serif',
                    transition: "background 0.2s, color 0.2s",
                  }}>{label}</button>
                ))}
              </div>

              {autoDistribute ? (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                  borderRadius: 9, fontSize: "0.8rem", color: "var(--text-muted)",
                  background: isDarkMode ? "rgba(13,148,136,0.06)" : "rgba(13,148,136,0.05)",
                  border: isDarkMode ? "1px solid rgba(13,148,136,0.2)" : "1px solid rgba(13,148,136,0.15)",
                }}>
                  <span style={{ fontSize: "1rem" }}>✨</span>
                  <span>The agent will optimally distribute <strong style={{ color: "var(--white)" }}>{tripDays} night{tripDays !== 1 ? "s" : ""}</strong> across {destinations.length} cities.</span>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {/* City palette — pick a city then paint days in the calendar */}
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {destinations.map((dest, i) => {
                      const isActive = activeCity === dest.name;
                      const color = RANK_COLORS[i] ?? "#94a3b8";
                      const count = dayAssignments.filter((c) => c === dest.name).length;
                      return (
                        <button key={dest.name} type="button" onClick={() => setActiveCity(dest.name)} style={{
                          display: "flex", alignItems: "center", gap: 5,
                          padding: "5px 10px 5px 8px", borderRadius: 20,
                          background: isActive ? color : "transparent",
                          border: `2px solid ${color}`,
                          color: isActive ? "#fff" : (isDarkMode ? "rgba(255,255,255,0.78)" : "rgba(50,70,90,0.85)"),
                          cursor: "pointer", fontWeight: 700, fontSize: "0.8rem",
                          fontFamily: '"Pixelify Sans", sans-serif', transition: "all 0.15s",
                        }}>
                          <span style={{
                            width: 8, height: 8, borderRadius: "50%", flexShrink: 0, display: "inline-block",
                            background: isActive ? "rgba(255,255,255,0.85)" : color,
                          }} />
                          {dest.name}
                          <span style={{
                            marginLeft: 2, borderRadius: 20, padding: "1px 6px",
                            background: isActive ? "rgba(255,255,255,0.2)" : `${color}30`,
                            color: isActive ? "#fff" : color,
                            fontSize: "0.68rem", fontWeight: 900,
                          }}>{count}n</span>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                    Select a city, then <strong style={{ color: "var(--white)" }}>click or drag</strong> days in the calendar →
                  </div>
                </div>
              )}
            </div>
          )}

          <AnimatePresence>
            {paceTooTight && (
              <motion.div
                key="pace-warn"
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 8,
                  padding: "9px 12px", borderRadius: 9,
                  background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)",
                }}
              >
                <span style={{ fontSize: "0.85rem", flexShrink: 0, marginTop: 1 }}>⚠️</span>
                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.55 }}>
                  <span style={{ fontWeight: 700, color: "#f59e0b" }}>
                    {tripDays} day{tripDays !== 1 ? "s" : ""} for {destinations.length} cities is too rushed.
                  </span>{" "}
                  Recommend at least{" "}
                  <span style={{ fontWeight: 700, color: "var(--white)" }}>
                    {destinations.length * minDaysPerCity} days
                  </span>{" "}
                  ({destinations.length} × {minDaysPerCity} min), ideally{" "}
                  <span style={{ fontWeight: 700, color: "var(--white)" }}>
                    {destinations.length * idealDaysPerCity} days
                  </span>{" "}
                  ({destinations.length} × {idealDaysPerCity} days per city).
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: -2 }}>
            Optimize finds the shortest route from your departure city.
          </div>
        </div>
      )}

      {/* Three-column layout — collapses to single column on mobile via .rsp-3col */}
      <div className="rsp-3col">

        {/* ── LEFT COLUMN: origin + transport + budget ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Origin */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={styles.stepTitle}>Where are you traveling from?</div>
            <LocationInput
              value={origin}
              onChange={setOrigin}
              placeholder="e.g. Toronto, Canada"
              inputStyle={{ ...styles.input, background: inputBg, border: panelBorder }}
              isDarkMode={isDarkMode}
            />
            <div style={styles.stepHint}>Select a location from the dropdown to confirm.</div>
          </div>

          {/* Transport mode */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={styles.stepTitle}>How are you getting there?</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 7 }}>
              {TRANSPORT_MODES.map(({ id, label, hint }) => {
                const sel = transportMode === id;
                const disabled = disabledModes.has(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => !disabled && setTransportMode(id)}
                    disabled={disabled}
                    title={disabled ? "Not available for this route" : undefined}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3,
                      padding: "10px 12px", borderRadius: 10, textAlign: "left",
                      cursor: disabled ? "not-allowed" : "pointer",
                      opacity: disabled ? 0.38 : 1,
                      background: sel ? "rgba(13,148,136,0.12)" : inputBg,
                      border: `1px solid ${sel ? "var(--cal-accent)" : panelBorder.replace("1px solid ", "")}`,
                      transition: "all 0.15s",
                    }}
                  >
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

        </div>

        {/* ── MIDDLE COLUMN: budget + trip type + travelers ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Budget */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={styles.stepTitle}>Budget</div>
            <div style={{ display: "flex", borderRadius: 10, overflow: "hidden", border: panelBorder }}>
              {[
                { id: "per_person", label: "Per Person" },
                { id: "total",      label: "Total for Group" },
              ].map(({ id, label }) => (
                <button key={id} type="button" onClick={() => setBudgetType(id)} style={{
                  flex: 1, padding: "9px 6px",
                  background: budgetType === id ? "var(--cal-accent)" : "transparent",
                  color: budgetType === id ? "#fff" : isDarkMode ? "rgba(255,255,255,0.5)" : "rgba(100,120,140,0.7)",
                  border: "none", cursor: "pointer",
                  fontSize: "0.8rem", fontWeight: 700,
                  fontFamily: '"Pixelify Sans", sans-serif',
                  transition: "background 0.2s, color 0.2s",
                }}>{label}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                style={{ ...styles.input, background: inputBg, border: panelBorder, flex: "0 0 78px", padding: "12px 6px" }}
              >{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
              <input type="number" min="1"
                placeholder={budgetType === "per_person" ? "e.g. 1500" : "e.g. 3000"}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                style={{ ...styles.input, background: inputBg, border: panelBorder, flex: 1 }}
              />
            </div>
            {equivalentLabel && (
              <div style={{ fontSize: "0.78rem", color: "var(--cal-accent)", fontWeight: 600 }}>{equivalentLabel}</div>
            )}
            <div style={styles.stepHint}>Hotels, food, activities, transport — all included</div>
          </div>

          {/* Trip type */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={styles.stepTitle}>Trip type</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {TRIP_TYPES.map((tt) => (
                <Tag key={tt.id} label={tt.label} selected={tripType === tt.id} onClick={() => handleTripTypeSelect(tt.id)} />
              ))}
            </div>
          </div>

          {/* Number of travelers */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={styles.stepTitle}>Number of travelers</div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <button type="button" style={styles.counterBtn} onClick={() => {
                const next = Math.max(1, groupSize - 1);
                setGroupSize(next);
                if (next === 1) setTripType("solo");
              }}>−</button>
              <span style={{ fontSize: "1.5rem", fontFamily: '"Pixelify Sans", sans-serif', minWidth: 28, textAlign: "center" }}>{groupSize}</span>
              <button type="button" style={styles.counterBtn} onClick={() => {
                const next = Math.min(20, groupSize + 1);
                setGroupSize(next);
                if (next === 2 && tripType === "solo") setTripType("friends");
              }}>+</button>
              <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>{groupSize === 1 ? "traveler" : "travelers"}</span>
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN: calendar ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={styles.stepTitle}>When are you traveling?</div>
          {dateRange?.from && (
            <div style={{ fontSize: "0.82rem", color: "var(--cal-accent)", fontWeight: 600 }}>
              📅 {formatDateRange(dateRange)}
              {!autoDistribute && isMultiDestTrip && (
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 400, marginLeft: 8 }}>
                  — click or drag to paint
                </span>
              )}
            </div>
          )}
          <div
            className="calendar-picker"
            style={{ ...styles.calCard, background: inputBg, border: panelBorder, padding: "8px 10px" }}
            onMouseDown={() => { if (!autoDistribute && isMultiDestTrip) isPainting.current = true; }}
            onMouseUp={() => { isPainting.current = false; }}
          >
            {!autoDistribute && isMultiDestTrip && dateRange.from && dateRange.to ? (
              <DayPicker
                month={calMonth}
                onMonthChange={setCalMonth}
                disabled={[
                  { before: dateRange.from },
                  { after: new Date(dateRange.to.getTime() - 86400000) },
                ]}
                modifiers={cityModifiers}
                modifiersStyles={cityModifierStyles}
                onDayClick={assignDayToActiveCity}
                onDayMouseEnter={(day) => { if (isPainting.current) assignDayToActiveCity(day); }}
                showOutsideDays
              />
            ) : (
              <DayPicker mode="range" selected={dateRange} onSelect={handleDateSelect}
                month={calMonth} onMonthChange={setCalMonth}
                disabled={{ before: new Date() }} showOutsideDays
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}




const RANK_COLORS = ["#0d9488", "#8b5cf6", "#f59e0b", "#3b82f6", "#ec4899", "#94a3b8"];

function StepPreferencesAndDetails({
  budgetPriorities, setBudgetPriorities, activityPrefs, toggleActivity, notes, setNotes,
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 6 }}>
      <div style={styles.stepLabel}>Step 2 of 2</div>

      {/* Two-column layout */}
      <div className="rsp-2col">

        {/* ── LEFT: priorities ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={styles.stepTitle}>Rank your investment priorities</div>
            <div style={styles.stepHint}>Drag to reorder — #1 gets the largest budget share</div>
          </div>
          <Reorder.Group
            axis="y" values={budgetPriorities} onReorder={setBudgetPriorities}
            style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 5 }}
          >
            {budgetPriorities.map((id, index) => {
              const item = BUDGET_PRIORITIES.find(p => p.id === id);
              const rankColor = RANK_COLORS[index] ?? "#94a3b8";
              return (
                <Reorder.Item key={id} value={id} style={{ listStyle: "none" }}
                  initial={false}
                  animate={{ scale: 1, boxShadow: "0px 0px 0px rgba(0,0,0,0)" }}
                  whileDrag={{ scale: 1.03, boxShadow: "0px 10px 28px rgba(0,0,0,0.28)" }}
                  transition={{ duration: 0.15 }}
                >
                  <div style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "9px 12px", borderRadius: 11,
                    background: "var(--bg-card)", border: "1px solid var(--border-col)",
                    cursor: "grab", userSelect: "none",
                  }}>
                    <div style={{
                      minWidth: 26, height: 26, borderRadius: "50%",
                      background: rankColor, display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "0.78rem", fontWeight: 900, color: "#fff", flexShrink: 0,
                      fontFamily: '"Pixelify Sans", sans-serif',
                    }}>{index + 1}</div>
                    <span style={{ flex: 1, fontSize: "0.9rem", color: "var(--white)", fontWeight: 500 }}>{item?.label}</span>
                    <span style={{ color: "var(--text-muted)", fontSize: "1rem", opacity: 0.4 }}>⠿</span>
                  </div>
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
        </div>

        {/* ── RIGHT: vibe + notes ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={styles.stepTitle}>Choose your trip vibe</div>
            <div style={styles.stepHint}>Pick the styles you want the itinerary to focus on.</div>
          </div>
          <div style={styles.tagGrid}>
            {ACTIVITY_TAGS.map((t) => (
              <Tag key={t.id} label={t.label} selected={activityPrefs.includes(t.id)} onClick={() => toggleActivity(t.id)} />
            ))}
          </div>

          <div>
            <div style={styles.stepTitle}>Anything specific you want to do?</div>
            <div style={styles.stepHint}>Restaurants, landmarks, dietary needs, accessibility…</div>
          </div>
          <textarea
            placeholder="e.g. I love sushi, want to visit temples, need wheelchair access…"
            value={notes} onChange={(e) => setNotes(e.target.value)}
            style={styles.textarea} rows={4}
          />
        </div>
      </div>
    </div>
  );
}

function CityLoadingOverlay() {
  const msgs = [
    "Scouting the top cities...",
    "Reading travel guides...",
    "Checking local hotspots...",
    "Almost there...",
  ];
  const [msgIdx, setMsgIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setMsgIdx((i) => (i + 1) % msgs.length), 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "18px 12px 14px", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <motion.span
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          style={{ fontSize: "1.3rem", display: "inline-block", opacity: 0.7 }}
        >⚙️</motion.span>
        <motion.div
          animate={{ y: [0, -8, 0], rotate: [0, -4, 4, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          style={{ fontSize: "2.8rem", lineHeight: 1, filter: "drop-shadow(0 0 12px rgba(13,148,136,0.55))" }}
        >🤖</motion.div>
        <motion.span
          animate={{ rotate: -360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          style={{ fontSize: "1.3rem", display: "inline-block", opacity: 0.7 }}
        >⚙️</motion.span>
      </div>

      <div style={{ height: 22, display: "flex", alignItems: "center", overflow: "hidden" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={msgIdx}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
            style={{ fontSize: "0.82rem", color: "var(--white)", fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}
          >
            {msgs[msgIdx]}
          </motion.div>
        </AnimatePresence>
      </div>

      <div style={{ display: "flex", gap: 4 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            animate={{ scaleY: [0.4, 1.4, 0.4], opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
            style={{ width: 5, height: 16, borderRadius: 3, background: "var(--cal-accent)", transformOrigin: "center" }}
          />
        ))}
      </div>
    </div>
  );
}

function GeneratingOverlay({ chars = 0 }) {
  const msgs = [
    "Researching the best hotels for you...",
    "Mapping out your day-by-day itinerary...",
    "Hunting down top restaurants...",
    "Crunching the numbers on your budget...",
    "Discovering local hidden gems...",
    "Scouting activities that match your style...",
    "Finalizing your perfect trip plan...",
  ];
  const [msgIdx, setMsgIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setMsgIdx((i) => (i + 1) % msgs.length), 2800);
    return () => clearInterval(t);
  }, []);

  const pct = Math.min(98, Math.round((chars / 8000) * 100));

  const STEPS = [
    { icon: "🏨", label: "Hotels" },
    { icon: "🎭", label: "Activities" },
    { icon: "🍽️", label: "Food" },
    { icon: "📅", label: "Itinerary" },
    { icon: "💰", label: "Budget" },
  ];
  const activeStep = Math.min(STEPS.length - 1, Math.floor((pct / 98) * STEPS.length));

  const SIZE = 420;
  const R = SIZE / 2 - 8;
  const CIRC = 2 * Math.PI * R;
  const dashOffset = chars > 0 ? CIRC * (1 - pct / 100) : CIRC;

  return (
    <div style={{ position: "relative", width: SIZE, height: SIZE }}>

      {/* Circle body */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        background: "var(--bg-card)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1.5px solid var(--border-col)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        overflow: "hidden",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 16,
      }}>

        {/* Robot + orbiting dots */}
        <div style={{ position: "relative", width: 120, height: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={i}
              animate={{ rotate: 360 }}
              transition={{ duration: 3 + i * 0.8, repeat: Infinity, ease: "linear", delay: i * 0.4 }}
              style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-start", justifyContent: "center" }}
            >
              <motion.div
                animate={{ scale: [0.7, 1.2, 0.7], opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
                style={{
                  width: 8, height: 8, borderRadius: "50%", marginTop: i * 6,
                  background: i % 2 === 0 ? "var(--cal-accent)" : "rgba(255,255,255,0.4)",
                }}
              />
            </motion.div>
          ))}
          <motion.div
            animate={{ scale: [1, 1.18, 1], opacity: [0.15, 0.35, 0.15] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            style={{ position: "absolute", inset: 10, borderRadius: "50%", border: "2px solid var(--cal-accent)" }}
          />
          <motion.div
            animate={{ y: [0, -8, 0], rotate: [0, -3, 3, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            style={{ fontSize: "4rem", lineHeight: 1, filter: "drop-shadow(0 0 16px rgba(13,148,136,0.6))", zIndex: 1 }}
          >🤖</motion.div>
        </div>

        {/* Percentage */}
        <motion.div
          key={pct}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          style={{ fontSize: "2.2rem", fontWeight: 800, fontFamily: '"Pixelify Sans", sans-serif', color: "var(--cal-accent)", lineHeight: 1, marginTop: -4 }}
        >
          {chars > 0 ? `${pct}%` : "—"}
        </motion.div>

        {/* Rotating message */}
        <div style={{ height: 24, display: "flex", alignItems: "center", overflow: "hidden" }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={msgIdx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              style={{ fontSize: "0.88rem", color: "var(--white)", fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}
            >
              {msgs[msgIdx]}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Step indicators */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {STEPS.map((s, i) => {
            const done = i < activeStep;
            const active = i === activeStep;
            return (
              <motion.div
                key={s.label}
                animate={active ? { scale: [1, 1.15, 1] } : {}}
                transition={{ duration: 1, repeat: Infinity }}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, opacity: done ? 1 : active ? 1 : 0.3 }}
              >
                <div style={{ fontSize: "1.1rem", filter: active ? "drop-shadow(0 0 6px rgba(13,148,136,0.8))" : "none" }}>{s.icon}</div>
                <div style={{ fontSize: "0.6rem", fontWeight: 700, color: done ? "var(--cal-accent)" : active ? "var(--white)" : "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {done ? "✓" : s.label}
                </div>
              </motion.div>
            );
          })}
        </div>

      </div>

      {/* SVG arc progress ring */}
      <svg
        width={SIZE} height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{ position: "absolute", inset: 0, zIndex: 3, transform: "rotate(-90deg)", pointerEvents: "none" }}
      >
        <defs>
          <linearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0d9488" />
            <stop offset="100%" stopColor="#0891b2" />
          </linearGradient>
        </defs>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={3} />
        <motion.circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          fill="none" stroke="url(#arcGrad)" strokeWidth={4} strokeLinecap="round"
          strokeDasharray={CIRC}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ ease: "easeOut", duration: 0.6 }}
        />
      </svg>

    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const mapStyles = {
  wrap: { position: "relative", width: "100%", height: "100%", overflow: "hidden" },
  topOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 1000,
    display: "flex", justifyContent: "center",
    padding: "64px 16px 0", pointerEvents: "none",
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
    position: "absolute", bottom: "max(28px, env(safe-area-inset-bottom, 28px))", left: 0, right: 0, zIndex: 1000,
    display: "flex", flexDirection: "column", alignItems: "center", gap: 12, pointerEvents: "none",
  },
  selectedChip: {
    display: "flex", alignItems: "center", gap: 8,
    background: "rgba(36,36,36,0.9)", backdropFilter: "blur(16px)",
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
  cityInfoStyle: { color: "#7ee7d6", fontSize: "0.88rem", marginBottom: 2 },
  cityBulletRow: { display: "flex", alignItems: "flex-start", gap: 8 },
  cityBulletIcon: { fontSize: "0.95rem", flexShrink: 0, marginTop: 1 },
  cityBulletText: { fontSize: "0.86rem", color: "rgba(255,255,255,0.88)", lineHeight: 1.5 },
};

const styles = {
  wrap: {
  display: "flex", flexDirection: "column", alignItems: "center",
  height: "100vh",
  width: "100%",
  padding: "20px 16px max(env(safe-area-inset-bottom, 0px) + 32px, 64px)",
  boxSizing: "border-box",
  overflowY: "auto",
  overflowX: "hidden",
},
content: {
  display: "flex", flexDirection: "column", alignItems: "center",
  width: "100%", maxWidth: 1020,
  gap: 12,
  flexShrink: 0,
},
  header: { textAlign: "center", width: "100%", flexShrink: 0 },
  title: { fontSize: "1.8rem", fontWeight: 900, fontFamily: '"Pixelify Sans", sans-serif', color: "var(--white)" },
  subtitle: { fontSize: "0.9rem", color: "var(--text-muted)", marginTop: 2 },
  dots: { display: "flex", gap: 6, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  dot: { height: 8, borderRadius: 4, transition: "all 0.3s ease" },
  // cardWrap grows to fill remaining height so StepBox gets the space it needs
  cardWrap: { width: "100%", minHeight: 0, overflow: "visible", marginBottom: 8 },
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
  calCard: { borderRadius: 12, padding: 4, marginTop: 2 },
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
    padding: "13px 26px", borderRadius: 12,
    border: "1px solid var(--border-col)", background: "transparent",
    color: "var(--white)", fontSize: "1rem", cursor: "pointer",
    fontFamily: '"Pixelify Sans", sans-serif', flexShrink: 0,
    transition: "background 0.2s, border-color 0.2s",
  },
  nextBtn: {
    padding: "13px 30px", borderRadius: 12, border: "none",
    background: "var(--cal-accent)", color: "#fff",
    fontSize: "1rem", fontWeight: 700, cursor: "pointer",
    fontFamily: '"Pixelify Sans", sans-serif',
    display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
    boxShadow: "0 4px 18px rgba(13,148,136,0.4)",
  },
  generateBtn: {
    padding: "15px 40px", borderRadius: 14, border: "none",
    background: "linear-gradient(135deg, #0d9488 0%, #0891b2 100%)",
    color: "#fff", fontSize: "1.1rem", fontWeight: 700, cursor: "pointer",
    fontFamily: '"Pixelify Sans", sans-serif',
    display: "flex", alignItems: "center", gap: 10,
    boxShadow: "0 6px 24px rgba(13,148,136,0.5)",
    letterSpacing: "0.02em",
  },
  errBox: {
    background: "rgba(255,100,100,0.12)", border: "1px solid rgba(255,100,100,0.35)",
    borderRadius: 10, padding: "10px 16px",
    color: "var(--white)", boxSizing: "border-box", fontSize: "0.88rem",
  },
  loadingNote: { color: "var(--text-muted)", fontSize: "0.82rem", textAlign: "center", lineHeight: 1.5 },
  divider: { width: "100%", height: 1, background: "var(--border-col)", margin: "2px 0" },
};
