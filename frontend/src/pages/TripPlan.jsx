import { useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useIsDarkMode } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import api from "../api";

const TABS = ["Overview", "Hotels", "Experiences", "Food", "Transportation", "Itinerary", "Budget"];

// Inject custom scrollbar styles once
const scrollbarCSS = `
  .trip-scroll::-webkit-scrollbar {
    width: 6px;
  }
  .trip-scroll::-webkit-scrollbar-track {
    background: rgba(255,255,255,0.04);
    border-radius: 99px;
    margin: 12px 0;
  }
  .trip-scroll::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, #0d9488 0%, #8b5cf6 100%);
    border-radius: 99px;
    min-height: 40px;
  }
  .trip-scroll::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(180deg, #14b8a6 0%, #a78bfa 100%);
  }
  .trip-scroll {
    scrollbar-width: thin;
    scrollbar-color: #0d9488 rgba(255,255,255,0.04);
  }
  .trip-tab-btn:focus,
  .trip-tab-btn:focus-visible,
  .trip-tab-btn:active {
    outline: none !important;
    box-shadow: none !important;
  }
`;

export default function TripPlan() {
  const loc = useLocation();
  const nav = useNavigate();
  const plan = loc.state?.plan;
  const isDarkMode = useIsDarkMode();
  const prefs = loc.state?.preferences;

  const [activeTab, setActiveTab] = useState("Overview");
  const { isLoggedIn } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  async function handleSave() {
    if (!isLoggedIn) { nav("/auth"); return; }
    setSaving(true);
    setSaveErr("");
    try {
      const dest = prefs?.destination || "Trip";
      const origin = prefs?.origin || "";
      await api.post("/trips", {
        title: `${origin ? origin + " → " : ""}${dest}`,
        origin: origin,
        destination: dest,
        start_date: prefs?.start_date || "",
        end_date: prefs?.end_date || "",
        plan: plan,
        prefs: prefs || {},
      });
      setSaved(true);
    } catch (e) {
      setSaveErr(e?.response?.data?.detail || "Failed to save trip.");
    } finally {
      setSaving(false);
    }
  }

  if (!plan) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyText}>No trip plan found.</div>
        <button style={styles.backBtn} onClick={() => nav("/")}>← Plan a New Trip</button>
      </div>
    );
  }

  return (
    <>
      <style>{scrollbarCSS}</style>
      <div className="trip-scroll" style={styles.wrap}>
        <div style={styles.content}>

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} style={styles.header}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <button style={styles.newTripBtn} onClick={() => nav("/")}>← New Trip</button>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {isLoggedIn && (
                  <button style={{ ...styles.newTripBtn, color: "var(--text-muted)" }} onClick={() => nav("/my-trips")}>
                    My Trips
                  </button>
                )}
                <button
                  style={{
                    ...styles.newTripBtn,
                    background: saved ? "rgba(13,148,136,0.15)" : "var(--cal-accent)",
                    border: saved ? "1px solid var(--cal-accent)" : "none",
                    color: "#fff",
                    opacity: saving ? 0.6 : 1,
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                  onClick={handleSave}
                  disabled={saving || saved}
                >
                  {saved ? "✓ Saved!" : saving ? "Saving…" : isLoggedIn ? "Save Trip" : "Save Trip"}
                </button>
              </div>
            </div>
            {saveErr && (
              <div style={{ fontSize: 12, color: "#f87171", marginBottom: 6 }}>{saveErr}</div>
            )}
            <div style={styles.destination}>{prefs?.destination || "Your Trip"}</div>
            <div style={styles.dateRow}>
              {prefs?.start_date} → {prefs?.end_date} · {prefs?.group_size} traveler{prefs?.group_size !== 1 ? "s" : ""} · {prefs?.budget?.toLocaleString()} {prefs?.currency}
              <span style={{
                marginLeft: 6,
                padding: "2px 8px",
                borderRadius: 999,
                fontSize: "0.72rem",
                fontWeight: 700,
                background: prefs?.budget_type === "per_person" ? "rgba(13,148,136,0.15)" : "rgba(139,92,246,0.15)",
                color: prefs?.budget_type === "per_person" ? "#0d9488" : "#8b5cf6",
                border: `1px solid ${prefs?.budget_type === "per_person" ? "rgba(13,148,136,0.35)" : "rgba(139,92,246,0.35)"}`,
                verticalAlign: "middle",
              }}>
                {prefs?.budget_type === "per_person" ? "per person" : "total"}
              </span>
            </div>
          </motion.div>


          <div style={styles.pricingWarning}>
            <span style={styles.pricingWarningIcon}>⚠️</span>
            <span style={styles.pricingWarningText}>
              Budget and pricing figures are rough estimates and may vary based on factors
            </span>
          </div>



          {/* Tab Bar — evenly spaced */}
          <div style={styles.tabBar}>
            {TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                className="trip-tab-btn"
                onClick={() => setActiveTab(tab)}
                style={{
                  ...styles.tabBtn,
                  borderBottom: activeTab === tab ? "2px solid var(--cal-accent)" : "2px solid transparent",
                  color: activeTab === tab
                    ? (isDarkMode ? "#ffffff" : "#0f172a")
                    : (isDarkMode ? "rgba(255,255,255,0.35)" : "rgba(15,23,42,0.35)"),
                  fontWeight: activeTab === tab ? 700 : 400,
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              style={{ width: "100%" }}
            >
              {activeTab === "Overview"    && <TabOverview plan={plan} prefs={prefs} />}
              {activeTab === "Hotels"      && <TabHotels hotels={plan.hotels || []} currency={prefs?.currency} />}
              {activeTab === "Experiences"  && <TabActivities activities={plan.activities || []} currency={prefs?.currency} />}
              {activeTab === "Food"        && <TabFood foodSpots={plan.food_spots || []} destination={prefs?.destination} />}
              {activeTab === "Transportation" && <TabTransportation options={plan.transportation_options || []} currency={prefs?.currency} origin={prefs?.origin} destination={prefs?.destination} overrideNote={plan._transport_override} />}
              {activeTab === "Itinerary"   && <TabItinerary itinerary={plan.itinerary || []} currency={prefs?.currency} />}
              {activeTab === "Budget"      && <TabBudget budget={plan.budget_breakdown} prefs={prefs} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}

function placeCategoryStyle(category = "") {
  const c = category.toLowerCase();
  if (c.includes("park") || c.includes("nature") || c.includes("garden") || c.includes("hike"))
    return { color: "#4ade80", bg: "rgba(74,222,128,0.1)", border: "rgba(74,222,128,0.3)" };
  if (c.includes("museum") || c.includes("gallery") || c.includes("art") || c.includes("cultural") || c.includes("culture"))
    return { color: "#a78bfa", bg: "rgba(167,139,250,0.1)", border: "rgba(167,139,250,0.3)" };
  if (c.includes("market") || c.includes("shop") || c.includes("bazaar"))
    return { color: "#fbbf24", bg: "rgba(251,191,36,0.1)", border: "rgba(251,191,36,0.3)" };
  if (c.includes("beach") || c.includes("waterfront") || c.includes("harbour") || c.includes("lake"))
    return { color: "#38bdf8", bg: "rgba(56,189,248,0.1)", border: "rgba(56,189,248,0.3)" };
  if (c.includes("view") || c.includes("lookout") || c.includes("observation"))
    return { color: "#0d9488", bg: "rgba(13,148,136,0.1)", border: "rgba(13,148,136,0.3)" };
  if (c.includes("night") || c.includes("bar") || c.includes("entertainment") || c.includes("club"))
    return { color: "#f472b6", bg: "rgba(244,114,182,0.1)", border: "rgba(244,114,182,0.3)" };
  if (c.includes("historic") || c.includes("monument") || c.includes("temple") || c.includes("castle"))
    return { color: "#fb923c", bg: "rgba(251,146,60,0.1)", border: "rgba(251,146,60,0.3)" };
  return { color: "var(--text-muted)", bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.15)" };
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function TabOverview({ plan, prefs }) {
  const destination = prefs?.destination || "";
  const mapsSearch = (q) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

  return (
    <div style={styles.tabContent}>

      {plan.recommended_places?.length > 0 && (
        <Card title="🗺️ Recommended Places">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {plan.recommended_places.map((p, i) => {
              const { color, bg, border } = placeCategoryStyle(p.category);
              return (
                <a
                  key={i}
                  href={mapsSearch(`${p.name} ${destination}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex", flexDirection: "column", gap: 6,
                    padding: "12px 14px", borderRadius: 12,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid var(--border-col)",
                    textDecoration: "none", cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
                  onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: "0.9rem" }}>{p.name}</span>
                    {p.category && (
                      <span style={{
                        fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase",
                        letterSpacing: "0.05em", padding: "2px 8px", borderRadius: 999,
                        background: bg, border: `1px solid ${border}`, color, flexShrink: 0,
                      }}>{p.category}</span>
                    )}
                  </div>
                  {p.why && (
                    <span style={{ color: "var(--text-muted)", fontSize: "0.78rem", lineHeight: 1.45 }}>{p.why}</span>
                  )}
                  <span style={{ color: "#0d9488", fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.02em" }}>
                    Find on Maps ↗
                  </span>
                </a>
              );
            })}
          </div>
        </Card>
      )}


      {plan.local_tips?.length > 0 && (
        <Card title="💡 Local Tips">
          <ul style={styles.tipList}>
            {plan.local_tips.map((t, i) => (
              <li key={i} style={styles.tipItem}>{t}</li>
            ))}
          </ul>
        </Card>
      )}



      {prefs?.additional_notes && (
        <Card title="📝 Your Notes, Applied">
          <p style={styles.noteText}>
            We actively used your note to tailor hotels, activities, food picks, and itinerary recommendations:
          </p>
          <p style={{ ...styles.noteText, marginTop: 8, fontStyle: "italic" }}>“{prefs.additional_notes}”</p>
        </Card>
      )}

      {plan.weather_note && (
        <Card title="🌤️ Weather">
          <ul style={{ margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 6 }}>
            {plan.weather_note
              .split(/(?<=[.!?])\s+/)
              .map(s => s.trim())
              .filter(Boolean)
              .map((s, i) => (
                <li key={i} style={{ color: "var(--white)", fontSize: "0.9rem", lineHeight: 1.6 }}>{s}</li>
              ))}
          </ul>
        </Card>
      )}

      {plan.currency_note && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "10px 14px", borderRadius: 10,
          background: "rgba(56,189,248,0.08)",
          border: "1px solid rgba(56,189,248,0.25)",
          width: "100%", boxSizing: "border-box",
        }}>
          <span style={{ fontSize: "1rem", lineHeight: 1.4, flexShrink: 0 }}>💱</span>
          <span style={{ color: "var(--white)", fontSize: "0.84rem", lineHeight: 1.55 }}>{plan.currency_note}</span>
        </div>
      )}
    </div>
  );
}

function buildSearchUrl(name, location = "") {
  const query = encodeURIComponent([name, location].filter(Boolean).join(" "));
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function normalizeResourceUrl(url, fallbackName, fallbackLocation) {
  if (typeof url === "string" && /^https?:\/\//i.test(url.trim())) return url.trim();
  return buildSearchUrl(fallbackName, fallbackLocation);
}

function ResourceLink({ href, label = "Open link" }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={styles.linkBtn}>
      🔗 {label}
    </a>
  );
}

// ─── Hotels Tab ───────────────────────────────────────────────────────────────
function TabHotels({ hotels, currency }) {
  if (!hotels.length) return <EmptyState>No hotel recommendations available.</EmptyState>;
  return (
    <div style={styles.tabContent}>
      {hotels.map((h, i) => (
        <Card key={i}>
          <div style={styles.hotelHeader}>
            <div>
              <div style={styles.hotelName}>{h.name}</div>
              <div style={styles.hotelType}>{h.type}</div>
            </div>
            <div style={styles.priceTag}>
              <div style={styles.priceAmount}>{currency} {h.price_per_night?.toLocaleString?.() ?? h.price_per_night}</div>
              <div style={styles.priceLabel}>/ night</div>
            </div>
          </div>
          {h.stars && <Stars count={h.stars} />}
          <div style={styles.hotelLocation}>📍 {h.location}</div>
          <p style={styles.hotelWhy}>{h.why}</p>
          <div style={{ marginTop: 10 }}>
            <ResourceLink href={buildSearchUrl(h.name, h.location)} label="Find on Maps" />
          </div>
          {h.amenities?.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {h.amenities.map((a, j) => <Pill key={j} small>{a}</Pill>)}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// ─── Activities Tab ───────────────────────────────────────────────────────────
function TabActivities({ activities, currency }) {
  if (!activities.length) return <EmptyState>No activities available.</EmptyState>;
  return (
    <div style={styles.tabContent}>
      {activities.map((a, i) => (
        <Card key={i}>
          <div style={styles.activityHeader}>
            <div style={styles.activityName}>{a.name}</div>
            <Pill accent>{a.category}</Pill>
          </div>
          <p style={styles.activityDesc}>{a.description}</p>
          <div style={styles.activityMeta}>
            <span>⏱️ {a.duration}</span>
            <span>💰 {a.cost_per_person > 0 ? `${currency} ${a.cost_per_person?.toLocaleString?.() ?? a.cost_per_person} / person` : "Free"}</span>
            <span>🕐 Best: {a.best_time}</span>
          </div>
          <div style={{ marginTop: 10 }}>
            <ResourceLink href={buildSearchUrl(a.name)} label="Find on Maps" />
          </div>
          {a.tags?.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {a.tags.map((t, j) => <Pill key={j} small>{t}</Pill>)}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}


// ─── Food Tab ─────────────────────────────────────────────────────────────────
function TabFood({ foodSpots, destination }) {
  if (!foodSpots.length) return <EmptyState>No food recommendations available.</EmptyState>;
  return (
    <div style={styles.tabContent}>
      {foodSpots.map((spot, i) => {
        const price = spot.avg_price || spot.price_level || null;
        const mapsUrl = buildSearchUrl(spot.name, spot.neighborhood || destination);
        return (
          <Card key={i}>
            {/* Name + price */}
            <div style={styles.activityHeader}>
              <div style={styles.activityName}>{spot.name}</div>
              {price && (
                <span style={{
                  fontSize: "0.78rem", fontWeight: 700, color: "#0d9488",
                  whiteSpace: "nowrap", background: "rgba(13,148,136,0.12)",
                  border: "1px solid rgba(13,148,136,0.28)",
                  borderRadius: 999, padding: "3px 10px", flexShrink: 0,
                }}>
                  {price}
                </span>
              )}
            </div>

            {/* Popular dish highlight */}
            {spot.popular_dish && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                margin: "6px 0 10px",
                padding: "5px 12px", borderRadius: 8,
                background: "rgba(139,92,246,0.1)",
                border: "1px solid rgba(139,92,246,0.25)",
              }}>
                <span style={{ fontSize: "0.78rem", color: "rgba(167,139,250,0.7)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Must Order</span>
                <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "#a78bfa" }}>🍴 {spot.popular_dish}</span>
              </div>
            )}

            {/* Description */}
            <p style={styles.activityDesc}>{spot.why_popular}</p>

            {/* Critic quote */}
            {spot.review_summary && (
              <p style={{
                margin: "8px 0 12px", fontStyle: "italic",
                fontSize: "0.84rem", color: "var(--text-secondary)",
                borderLeft: "2px solid rgba(13,148,136,0.45)", paddingLeft: 10,
              }}>
                "{spot.review_summary}"
              </p>
            )}

            {/* Meta row */}
            <div style={styles.activityMeta}>
              <span>🍽️ {spot.cuisine}</span>
              <span>📍 {spot.neighborhood}</span>
            </div>

            <div style={{ marginTop: 10 }}>
              <ResourceLink href={mapsUrl} label="Find on Maps" />
            </div>
          </Card>
        );
      })}
    </div>
  );
}



// ─── Transportation Tab ───────────────────────────────────────────────────────
function TabTransportation({ options, currency, origin, destination, overrideNote }) {
  if (!options.length) return <EmptyState>No transportation options available.</EmptyState>;
  return (
    <div style={styles.tabContent}>
      {overrideNote && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderRadius: 10,
          background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)", marginBottom: 4 }}>
          <span style={{ fontSize: "1rem", flexShrink: 0 }}>⚠️</span>
          <span style={{ fontSize: "0.85rem", color: "var(--white)", lineHeight: 1.5 }}>{overrideNote}</span>
        </div>
      )}
      {(origin || destination) && (
        <Card>
          <p style={styles.noteText}>From <strong>{origin || "your location"}</strong> to <strong>{destination || "your destination"}</strong></p>
        </Card>
      )}
      {options.map((opt, i) => {
        const typeStr = opt.type || opt.mode || "";
        const cabinStr = opt.cabin || opt.class || "";
        const modeIcon = /train|rail|euro|shinkansen/i.test(typeStr) ? "🚄"
          : /bus|coach/i.test(typeStr) ? "🚌"
          : /car|drive|rental/i.test(typeStr) ? "🚗"
          : /ferry|boat|ship/i.test(typeStr) ? "⛴️"
          : "✈️";
        const cabinColor = /first/i.test(cabinStr) ? "#f59e0b"
          : /business/i.test(cabinStr) ? "#8b5cf6"
          : /premium/i.test(cabinStr) ? "#3b82f6"
          : "var(--text-muted)";

        // Support both new structured priceEstimate and legacy estimated_cost_per_group
        const pe = opt.priceEstimate;
        const priceCurrency = pe?.currency || currency;
        const priceDisplay = pe
          ? `${priceCurrency} ${pe.min?.toLocaleString()} – ${pe.max?.toLocaleString()}`
          : opt.estimated_cost_per_group != null
            ? `${currency} ${Number(opt.estimated_cost_per_group).toLocaleString()}`
            : null;
        const confidence = pe?.confidence;
        const confidenceColor = confidence === "high" ? "#4ade80"
          : confidence === "medium" ? "#f59e0b"
          : "#f87171";

        const notesList = Array.isArray(opt.notes)
          ? opt.notes
          : opt.notes ? [opt.notes] : [];

        return (
          <Card key={i}>
            {/* Header: type + price range */}
            <div style={styles.activityHeader}>
              <div style={styles.activityName}>{modeIcon} {typeStr}</div>
              {priceDisplay && (
                <span style={{
                  fontSize: "0.85rem", fontWeight: 700, padding: "4px 12px", borderRadius: 999,
                  background: "rgba(13,148,136,0.12)", border: "1px solid rgba(13,148,136,0.35)",
                  color: "var(--cal-accent)", whiteSpace: "nowrap",
                }}>
                  Est. {priceDisplay}
                </span>
              )}
            </div>

            {/* Cabin badge + duration + confidence */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              {cabinStr && (
                <span style={{
                  fontSize: "0.78rem", fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                  background: `${cabinColor}18`, border: `1px solid ${cabinColor}55`, color: cabinColor,
                }}>
                  {cabinStr}
                </span>
              )}
              {(opt.durationEstimate || opt.duration) && (
                <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                  ⏱️ {opt.durationEstimate || opt.duration}
                </span>
              )}
              {confidence && (
                <span style={{ fontSize: "0.75rem", color: confidenceColor, fontWeight: 600 }}>
                  ● {confidence} confidence
                </span>
              )}
            </div>

            {/* Why */}
            {opt.why && <p style={{ ...styles.activityDesc, marginBottom: 8 }}>{opt.why}</p>}

            {/* Notes list */}
            {notesList.length > 0 && (
              <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 3 }}>
                {notesList.map((n, j) => (
                  <li key={j} style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic", lineHeight: 1.5 }}>
                    {n}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}




// ─── Itinerary Tab ────────────────────────────────────────────────────────────
function TabItinerary({ itinerary, currency }) {
  const [openDay, setOpenDay] = useState(0);
  if (!itinerary.length) return <EmptyState>No itinerary available.</EmptyState>;
  return (
    <div style={styles.tabContent}>
      {itinerary.map((day, i) => (
        <div key={i} style={styles.dayCard}>
          <button
            type="button"
            style={styles.dayHeader}
            onClick={() => setOpenDay(openDay === i ? -1 : i)}
          >
            <div style={styles.dayNum}>Day {day.day}</div>
            <div style={styles.dayTheme}>{day.theme}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {day.estimated_daily_cost != null && (
                <span style={styles.dayCost}>~{currency} {day.estimated_daily_cost?.toLocaleString?.() ?? day.estimated_daily_cost}</span>
              )}
              <span style={styles.dayChevron}>{openDay === i ? "▲" : "▼"}</span>
            </div>
          </button>

          <AnimatePresence initial={false}>
            {openDay === i && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                style={{ overflow: "hidden" }}
              >
                <div style={styles.dayBody}>
                  {day.date && <div style={styles.dayDate}>{day.date}</div>}
                  {[
                    { time: "🌅 Morning",   text: day.morning },
                    { time: "☀️ Afternoon", text: day.afternoon },
                    { time: "🌙 Evening",   text: day.evening },
                  ].map(({ time, text }) => text && (
                    <div key={time} style={styles.daySlot}>
                      <div style={styles.daySlotLabel}>{time}</div>
                      <div style={styles.daySlotText}>{text}</div>
                    </div>
                  ))}
                  {day.meals && (
                    <div style={styles.mealsRow}>
                      {[
                        ["☕ Breakfast", day.meals.breakfast],
                        ["🥗 Lunch",    day.meals.lunch],
                        ["🍷 Dinner",   day.meals.dinner],
                      ].filter(([, v]) => v).map(([label, val]) => (
                        <div key={label} style={styles.mealItem}>
                          <div style={styles.mealLabel}>{label}</div>
                          <div style={styles.mealText}>{val}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

// ─── Budget Tab ───────────────────────────────────────────────────────────────
function budgetMathNote(key, value, currency, nights, groupSize) {
  const fmt = (n) => Math.round(n).toLocaleString();
  const g = groupSize || 1;
  const n = nights || 1;
  const perPerson = value / g;
  switch (key) {
    case "hotels":
      return `${currency} ${fmt(perPerson / n)} /person/night × ${n} nights × ${g} traveler${g !== 1 ? "s" : ""}`;
    case "activities":
      return `${currency} ${fmt(perPerson)} /person × ${g} traveler${g !== 1 ? "s" : ""}`;
    case "food":
      return `${currency} ${fmt(perPerson / n)} /person/day × ${g} traveler${g !== 1 ? "s" : ""} × ${n} days`;
    case "transport":
      return `${currency} ${fmt(perPerson)} /person (midpoint) × ${g} traveler${g !== 1 ? "s" : ""}`;
    case "shopping":
      return `${currency} ${fmt(perPerson / n)} /person/day × ${g} traveler${g !== 1 ? "s" : ""} × ${n} nights`;
    default: return null;
  }
}

function BudgetRow({ item, total, currency, nights, groupSize, perPersonMode, transportMode }) {
  const [hovered, setHovered] = useState(false);
  const pct = Math.round((item.value / total) * 100);
  const perPersonVal = Math.round(item.value / groupSize);
  const primaryVal = perPersonMode ? perPersonVal : item.value;
  const secondaryVal = perPersonMode ? item.value : (groupSize > 1 ? perPersonVal : null);
  const secondaryLabel = perPersonMode ? `${currency} ${item.value.toLocaleString()} total` : `${currency} ${perPersonVal.toLocaleString()} /person`;
  const note = budgetMathNote(item.key, item.value, currency, nights, groupSize);

  const hasRange = item.key === "transport" && item.range?.min != null && item.range?.max != null && item.range.min !== item.range.max;
  const bd = item.breakdown;

  return (
    <div
      style={{ ...styles.budgetRow, position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={styles.budgetRowLabel}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {item.label}
          {note && <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", opacity: 0.6 }}>ⓘ</span>}
        </span>
        <div style={{ textAlign: "right" }}>
          {hasRange ? (
            <>
              <div style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>
                {currency} {Math.round(item.range.min).toLocaleString()} – {Math.round(item.range.max).toLocaleString()}
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.72rem", opacity: 0.55 }}>
                est. midpoint {currency} {primaryVal.toLocaleString()}
              </div>
            </>
          ) : (
            <>
              <div style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>
                {currency} {primaryVal.toLocaleString()}
              </div>
              {secondaryVal != null && (
                <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", opacity: 0.55 }}>
                  {secondaryLabel}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <div style={styles.barTrack}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{ ...styles.barFill, background: item.color }}
        />
      </div>
      <div style={styles.barPct}>{pct}%</div>
      {hovered && note && (
        <div style={{
          position: "absolute", left: 0, top: "100%", zIndex: 20,
          background: "var(--bg-card)", border: "1px solid var(--border-col)",
          borderRadius: 8, padding: "6px 12px",
          fontSize: "0.78rem", color: "var(--text-muted)",
          whiteSpace: "nowrap", marginTop: 4,
          boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
          pointerEvents: "none",
        }}>
          {note}
        </div>
      )}
      {hasRange && bd && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {bd.international?.min != null && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "var(--text-muted)" }}>
              <span>
                {transportMode === "own_car" ? "⛽ Fuel & tolls (round-trip)" :
                 transportMode === "car_rental" ? "🚗 Rental + fuel" :
                 transportMode === "bus_train" ? "🚌 Bus / Train (round-trip)" :
                 "✈️ Flights (round-trip)"}
              </span>
              <span>{currency} {Math.round(bd.international.min).toLocaleString()} – {Math.round(bd.international.max).toLocaleString()}</span>
            </div>
          )}
          {bd.local > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "var(--text-muted)" }}>
              <span>🚌 Local transport</span>
              <span>{currency} {Math.round(bd.local).toLocaleString()}</span>
            </div>
          )}
          {bd.international?.note && (
            <div style={{
              marginTop: 2, padding: "5px 9px", borderRadius: 6,
              background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)",
              fontSize: "0.74rem", color: "var(--text-muted)", lineHeight: 1.45,
            }}>
              💡 {bd.international.note}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TabBudget({ budget, prefs }) {
  if (!budget) return <EmptyState>No budget breakdown available.</EmptyState>;

  const total = budget.grand_total || 1;
  const nights = (() => {
    try {
      const d1 = new Date(prefs?.start_date);
      const d2 = new Date(prefs?.end_date);
      return Math.max(1, Math.round((d2 - d1) / 86400000));
    } catch { return 1; }
  })();
  const groupSize = prefs?.group_size ?? 1;

  const perPersonMode = prefs?.budget_type === "per_person";
  const grandTotal = budget.grand_total ?? 0;
  const grandPerPerson = Math.round(grandTotal / groupSize);

  const enteredTotal = prefs?.budget
    ? (perPersonMode ? prefs.budget * groupSize : prefs.budget)
    : null;
  const isWithinBudget = enteredTotal != null ? grandTotal <= enteredTotal : isWithinBudget;

  const items = [
    { key: "hotels",   label: "🏨 Hotels",         value: budget.hotels_total,        color: "#0d9488" },
    { key: "activities", label: "🎭 Experiences & Attractions", value: budget.activities_total, color: "#8b5cf6" },
    { key: "food",     label: "🍽️ Food",            value: budget.food_total,          color: "#f59e0b" },
    { key: "transport",label: "🚗 Transportation",   value: budget.transport_total,     color: "#3b82f6",
      range: budget.transport_range, breakdown: budget.transport_breakdown },
    { key: "shopping", label: "🛍️ Shopping, Miscellaneous & Incidentals", value: budget.shopping_misc_total, color: "#ec4899" },
  ].filter((i) => i.value > 0);

  const PRIORITY_LABELS = {
    hotels: "🏨 Hotels", activities: "🎭 Experiences & Attractions", food: "🍽️ Food & Dining",
    transport: "🚗 Transportation", shopping: "🛍️ Shopping", entertainment: "🎵 Entertainment",
  };
  const ACTIVITY_LABELS = {
    outdoor: "🏔️ Outdoor", cultural: "🏛️ Cultural", food_tours: "🍜 Food Tours",
    nightlife: "🎵 Nightlife", wellness: "🧘 Wellness", art: "🎨 Art & Museums",
    beach: "🏖️ Beach", nature: "🌿 Nature", adventure: "🏄 Adventure",
    sightseeing: "📸 Sightseeing", shopping: "🛒 Shopping", family: "👨‍👩‍👧 Family Friendly",
  };

  const hasPriorities = prefs?.budget_priorities?.length > 0;
  const hasActivityPrefs = prefs?.activity_preferences?.length > 0;

  return (
    <div style={styles.tabContent}>

      {(hasPriorities || hasActivityPrefs) && (
        <Card title="🎯 Your Preferences">
          {hasPriorities && (
            <div style={{ marginBottom: hasActivityPrefs ? 14 : 0 }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                Investment Priorities
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {prefs.budget_priorities.map((p, i) => {
                  const rankColors = ["#0d9488","#8b5cf6","#f59e0b","#3b82f6","#ec4899","#94a3b8"];
                  const col = rankColors[i] ?? "#94a3b8";
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "5px 12px", borderRadius: 999,
                      background: `${col}18`,
                      border: `1px solid ${col}55`,
                    }}>
                      <span style={{ fontSize: "0.7rem", fontWeight: 800, color: col }}>#{i + 1}</span>
                      <span style={{ fontSize: "0.82rem", color: "var(--white)", fontWeight: 600 }}>
                        {PRIORITY_LABELS[p] ?? p}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {hasActivityPrefs && (
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                Activity Preferences
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {prefs.activity_preferences.map((a, i) => (
                  <span key={i} style={{
                    fontSize: "0.8rem", padding: "4px 12px", borderRadius: 999,
                    background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)",
                    color: "#fbbf24", fontWeight: 500,
                  }}>{ACTIVITY_LABELS[a] ?? a}</span>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      <Card title="Budget Breakdown">
        <div style={styles.budgetSummary}>
          <div style={{ display: "flex", gap: 24, alignItems: "flex-end", flexWrap: "wrap" }}>
            {perPersonMode ? (
              <>
                <div>
                  <div style={styles.budgetTotal}>{prefs?.currency} {grandPerPerson.toLocaleString()}</div>
                  <div style={styles.budgetLabel}>Per person</div>
                </div>
                <div>
                  <div style={{ ...styles.budgetTotal, fontSize: "1.3rem", color: "var(--text-secondary)" }}>
                    {prefs?.currency} {grandTotal.toLocaleString()}
                  </div>
                  <div style={styles.budgetLabel}>Total · {groupSize} travelers</div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div style={styles.budgetTotal}>{prefs?.currency} {grandTotal.toLocaleString()}</div>
                  <div style={styles.budgetLabel}>Total · {groupSize} traveler{groupSize !== 1 ? "s" : ""}</div>
                </div>
                {groupSize > 1 && (
                  <div>
                    <div style={{ ...styles.budgetTotal, fontSize: "1.3rem", color: "var(--text-secondary)" }}>
                      {prefs?.currency} {grandPerPerson.toLocaleString()}
                    </div>
                    <div style={styles.budgetLabel}>Per person</div>
                  </div>
                )}
              </>
            )}
          </div>
          <div style={{
            ...styles.budgetBadge,
            background: isWithinBudget ? "rgba(13,148,136,0.15)" : "rgba(239,68,68,0.15)",
            border: `1px solid ${isWithinBudget ? "var(--cal-accent)" : "#ef4444"}`,
            color: isWithinBudget ? "var(--cal-accent-fg)" : "#fca5a5",
          }}>
            {isWithinBudget ? "✅ Within Budget" : "⚠️ Over Budget"}
          </div>
        </div>

        {items.map((item) => (
          <BudgetRow key={item.key} item={item} total={total} currency={prefs?.currency} nights={nights} groupSize={groupSize} perPersonMode={perPersonMode} transportMode={prefs?.transport_mode} />
        ))}

        {budget.savings_tip && (
          <div style={styles.savingsTip}>
            <span style={{ fontWeight: 700 }}>💡 Tip: </span>{budget.savings_tip}
          </div>
        )}
      </Card>

      {prefs?.budget && (
        <Card title="Budget vs. Estimate">
          {(() => {
            const groupSize = prefs.group_size ?? 1;
            const enteredTotal = prefs.budget_type === "per_person"
              ? prefs.budget * groupSize
              : prefs.budget;
            const enteredPerPerson = prefs.budget_type === "per_person"
              ? prefs.budget
              : prefs.budget / groupSize;
            const estimateTotal = budget.grand_total ?? 0;
            const estimatePerPerson = estimateTotal / groupSize;
            const diff = enteredTotal - estimateTotal;
            return (
              <div style={styles.budgetCompare}>
                <CompareRow label="Your Budget (total)" value={enteredTotal} currency={prefs.currency} color="var(--cal-accent)" />
                {groupSize > 1 && <CompareRow label="Your Budget (per person)" value={Math.round(enteredPerPerson)} currency={prefs.currency} color="var(--cal-accent)" dim />}
                <div style={styles.divider} />
                <CompareRow label="AI Estimate (total)" value={estimateTotal} currency={prefs.currency} color={isWithinBudget ? "#10b981" : "#ef4444"} />
                {groupSize > 1 && <CompareRow label="AI Estimate (per person)" value={Math.round(estimatePerPerson)} currency={prefs.currency} color={isWithinBudget ? "#10b981" : "#ef4444"} dim />}
                <div style={styles.divider} />
                <CompareRow
                  label={diff >= 0 ? "Remaining" : "Overage"}
                  value={Math.abs(Math.round(diff))}
                  currency={prefs.currency}
                  color={diff >= 0 ? "#10b981" : "#ef4444"}
                />
              </div>
            );
          })()}
          {(() => {
            const enteredTotal = prefs.budget_type === "per_person"
              ? prefs.budget * (prefs.group_size ?? 1)
              : prefs.budget;
            const diff = enteredTotal - (budget.grand_total ?? 0);
            const pct = enteredTotal > 0 ? Math.abs(diff) / enteredTotal : 0;
            if (pct < 0.08) return null;
            const isUnder = diff > 0;

            const categoryNames = { hotels: "Hotels", activities: "Activities", food: "Food & Dining", transport: "Transportation", shopping: "Shopping & Misc" };
            const userPriorities = new Set((prefs?.budget_priorities || []).map(p => p.toLowerCase()));
            const nonPriority = Object.entries(categoryNames)
              .filter(([key]) => !userPriorities.has(key))
              .map(([, name]) => name);
            const upgradeTargets = nonPriority.length > 0
              ? nonPriority.slice(0, 3).join(", ")
              : "other categories";

            return (
              <div style={{
                marginTop: 14, padding: "10px 14px", borderRadius: 10,
                background: isUnder ? "rgba(56,189,248,0.08)" : "rgba(239,68,68,0.08)",
                border: `1px solid ${isUnder ? "rgba(56,189,248,0.3)" : "rgba(239,68,68,0.3)"}`,
                fontSize: "0.84rem", color: "var(--white)", lineHeight: 1.55,
              }}>
                {isUnder ? (
                  <>
                    <span style={{ fontWeight: 700, color: "#38bdf8" }}>ℹ️ Budget not fully used: </span>
                    You have <strong>{prefs.currency} {Math.round(diff).toLocaleString()}</strong> remaining. Consider allocating more toward <strong>{upgradeTargets}</strong> — there's room to upgrade.
                  </>
                ) : (
                  <>
                    <span style={{ fontWeight: 700, color: "#f87171" }}>⚠️ Over your budget: </span>
                    This plan exceeds your budget by <strong>{prefs.currency} {Math.round(Math.abs(diff)).toLocaleString()}</strong>. Consider trimming <strong>{upgradeTargets}</strong> to stay within budget.
                  </>
                )}
              </div>
            );
          })()}
        </Card>
      )}
    </div>
  );
}

// ─── Small Reusable Components ────────────────────────────────────────────────
function Card({ title, children }) {
  return (
    <div style={styles.card}>
      {title && <div style={styles.cardTitle}>{title}</div>}
      {children}
    </div>
  );
}

function SectionRow({ children }) {
  return <div style={styles.sectionRow}>{children}</div>;
}

function Pill({ children, accent, small }) {
  return (
    <span style={{
      ...styles.pill,
      fontSize: small ? "0.75rem" : "0.85rem",
      padding: small ? "3px 10px" : "5px 12px",
      background: accent ? "rgba(13,148,136,0.18)" : "var(--bg-card)",
      border: `1px solid ${accent ? "var(--cal-accent)" : "var(--border-col)"}`,
      color: accent ? "var(--cal-accent-fg)" : "var(--white)",
    }}>
      {children}
    </span>
  );
}

function Stars({ count }) {
  return (
    <div style={{ fontSize: "1rem", marginBottom: 4 }}>
      {"★".repeat(Math.round(count))}{"☆".repeat(Math.max(0, 5 - Math.round(count)))}
      <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginLeft: 6 }}>{count} stars</span>
    </div>
  );
}

function EmptyState({ children }) {
  return <div style={styles.emptyState}>{children}</div>;
}

function CompareRow({ label, value, currency, color, dim }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: dim ? "3px 0" : "6px 0", opacity: dim ? 0.65 : 1 }}>
      <span style={{ color: "var(--text-muted)", fontSize: dim ? "0.8rem" : "0.9rem" }}>{label}</span>
      <span style={{ color, fontWeight: dim ? 500 : 700, fontFamily: dim ? "inherit" : '"Pixelify Sans", sans-serif', fontSize: dim ? "0.85rem" : "1rem" }}>
        {currency} {value?.toLocaleString?.() ?? value}
      </span>
    </div>
  );
}

const styles = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    height: "calc(100vh - 32px)",  // subtract TitleBar height
    width: "100%",
    padding: "16px 16px 40px",
    boxSizing: "border-box",
    overflowY: "scroll",
    overflowX: "hidden",
},
  content: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    maxWidth: 860,
    gap: 16,
  },
  header: {
    width: "100%",
    textAlign: "center",
  },
  newTripBtn: {
    padding: "8px 16px",
    border: "1px solid var(--border-col)",
    borderRadius: 8,
    background: "transparent",
    color: "var(--white)",
    cursor: "pointer",
    fontSize: "0.85rem",
    marginBottom: 12,
  },
  destination: {
    fontSize: "2.4rem",
    fontWeight: 900,
    fontFamily: '"Pixelify Sans", sans-serif',
    color: "var(--white)",
  },
  dateRow: {
    fontSize: "0.85rem",
    color: "var(--text-muted)",
    marginTop: 4,
  },
  pricingWarning: {
    width: "100%",
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(154, 100, 7, 0.5)",
    background: "rgba(245, 158, 11, 0.12)",
    color: "#90710f",
    boxSizing: "border-box",
  },
  pricingWarningIcon: {
    lineHeight: 1.2,
    marginTop: 1,
  },
  pricingWarningText: {
    fontSize: "0.84rem",
    lineHeight: 1.45,
  },
  tabBar: {
    display: "flex",
    justifyContent: "space-between", // evenly spaced tabs
    width: "100%",
    overflowX: "auto",
    borderBottom: "1px solid var(--border-col)",
  },
  tabBtn: {
    flex: 1,
    padding: "12px 8px",
    background: "transparent",
    border: "none",
    borderRadius: 0,
    cursor: "pointer",
    fontFamily: '"Pixelify Sans", sans-serif',
    fontSize: "1.05rem",        // bigger
    letterSpacing: "0.03em",    // slightly spaced
    transition: "color 0.2s, border-color 0.2s",
    outline: "none",
    boxShadow: "none",
    whiteSpace: "nowrap",
    textAlign: "center",
},
  tabContent: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    width: "100%",
    paddingTop: 4,
  },
  card: {
    background: "var(--bg-card)",
    border: "1px solid var(--border-col)",
    borderRadius: 14,
    padding: "18px 20px",
    width: "100%",
    boxSizing: "border-box",
  },
  cardTitle: {
    fontSize: "1rem",
    fontWeight: 700,
    fontFamily: '"Pixelify Sans", sans-serif',
    color: "var(--white)",
    marginBottom: 12,
  },
  sectionRow: {
    display: "flex",
    gap: 14,
    width: "100%",
    flexWrap: "wrap",
  },
  pill: {
    borderRadius: 20,
    display: "inline-block",
    lineHeight: 1.4,
  },
  linkBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: "0.82rem",
    color: "var(--cal-accent-fg)",
    textDecoration: "none",
    border: "1px solid var(--cal-accent)",
    borderRadius: 999,
    padding: "5px 10px",
  },
  overviewText: {
    color: "var(--white)",
    lineHeight: 1.7,
    fontSize: "0.95rem",
    margin: 0,
  },
  tipList: {
    margin: 0,
    padding: "0 0 0 18px",
  },
  tipItem: {
    color: "var(--white)",
    fontSize: "0.9rem",
    lineHeight: 1.7,
    marginBottom: 4,
  },
  noteText: {
    color: "var(--white)",
    fontSize: "0.9rem",
    lineHeight: 1.6,
    margin: 0,
  },
  hotelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  hotelName: {
    fontSize: "1.1rem",
    fontWeight: 700,
    fontFamily: '"Pixelify Sans", sans-serif',
    color: "var(--white)",
  },
  hotelType: {
    fontSize: "0.8rem",
    color: "var(--text-muted)",
    marginTop: 2,
    textTransform: "capitalize",
  },
  priceTag: {
    textAlign: "right",
    flexShrink: 0,
    marginLeft: 12,
  },
  priceAmount: {
    fontSize: "0.92rem",
    fontWeight: 500,
    color: "var(--text-secondary)",
  },
  priceLabel: {
    fontSize: "0.72rem",
    color: "var(--text-muted)",
  },
  hotelLocation: {
    fontSize: "0.85rem",
    color: "var(--text-muted)",
    marginBottom: 6,
  },
  hotelWhy: {
    fontSize: "0.9rem",
    color: "var(--white)",
    lineHeight: 1.6,
    margin: 0,
  },
  activityHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  activityName: {
    fontSize: "1.05rem",
    fontWeight: 700,
    fontFamily: '"Pixelify Sans", sans-serif',
    color: "var(--white)",
  },
  activityDesc: {
    fontSize: "0.9rem",
    color: "var(--white)",
    lineHeight: 1.6,
    margin: "0 0 10px",
  },
  activityMeta: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    fontSize: "0.82rem",
    color: "var(--text-muted)",
  },
  dayCard: {
    background: "var(--bg-card)",
    border: "1px solid var(--border-col)",
    borderRadius: 14,
    overflow: "hidden",
    width: "100%",
  },
  dayHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    padding: "14px 18px",
    background: "transparent",
    border: "none",
    borderRadius: 0,
    cursor: "pointer",
    color: "var(--white)",
    textAlign: "left",
  },
  dayNum: {
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "var(--cal-accent)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    flexShrink: 0,
    minWidth: 40,
  },
  dayTheme: {
    fontSize: "1rem",
    fontWeight: 700,
    fontFamily: '"Pixelify Sans", sans-serif',
    flex: 1,
    color: "var(--white)",
  },
  dayCost: {
    fontSize: "0.8rem",
    color: "var(--text-muted)",
  },
  dayChevron: {
    fontSize: "0.7rem",
    color: "var(--text-muted)",
  },
  dayBody: {
    padding: "4px 18px 16px",
    borderTop: "1px solid var(--border-col)",
  },
  dayDate: {
    fontSize: "0.8rem",
    color: "var(--text-muted)",
    marginBottom: 10,
    marginTop: 10,
  },
  daySlot: {
    marginBottom: 12,
  },
  daySlotLabel: {
    fontSize: "0.78rem",
    fontWeight: 700,
    color: "var(--cal-accent)",
    marginBottom: 4,
  },
  daySlotText: {
    fontSize: "0.9rem",
    color: "var(--white)",
    lineHeight: 1.6,
  },
  mealsRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 12,
    paddingTop: 12,
    borderTop: "1px solid var(--border-col)",
  },
  mealItem: {
    flex: "1 1 120px",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 8,
    padding: "8px 12px",
  },
  mealLabel: {
    fontSize: "0.72rem",
    fontWeight: 700,
    color: "var(--text-muted)",
    marginBottom: 3,
  },
  mealText: {
    fontSize: "0.85rem",
    color: "var(--white)",
    lineHeight: 1.4,
  },
  budgetSummary: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  budgetTotal: {
    fontSize: "1.8rem",
    fontWeight: 900,
    fontFamily: '"Pixelify Sans", sans-serif',
    color: "var(--white)",
  },
  budgetLabel: {
    fontSize: "0.78rem",
    color: "var(--text-muted)",
    marginTop: 2,
  },
  budgetBadge: {
    padding: "8px 14px",
    borderRadius: 20,
    fontSize: "0.85rem",
    fontWeight: 700,
  },
  budgetRow: {
    marginBottom: 14,
  },
  budgetRowLabel: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "0.88rem",
    color: "var(--white)",
    marginBottom: 5,
  },
  barTrack: {
    height: 8,
    background: "rgba(255,255,255,0.08)",
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 4,
  },
  barPct: {
    fontSize: "0.72rem",
    color: "var(--text-muted)",
    textAlign: "right",
    marginTop: 2,
  },
  savingsTip: {
    marginTop: 14,
    padding: "10px 14px",
    background: "rgba(13,148,136,0.1)",
    border: "1px solid var(--cal-accent)",
    borderRadius: 8,
    fontSize: "0.88rem",
    color: "var(--white)",
    lineHeight: 1.6,
  },
  budgetCompare: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  divider: {
    height: 1,
    background: "var(--border-col)",
    margin: "4px 0",
  },
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    gap: 16,
  },
  emptyText: {
    color: "var(--text-muted)",
    fontSize: "1.1rem",
  },
  emptyState: {
    padding: "32px 16px",
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: "0.95rem",
  },
  backBtn: {
    padding: "12px 24px",
    border: "1px solid var(--border-col)",
    borderRadius: 10,
    background: "transparent",
    color: "var(--white)",
    cursor: "pointer",
    fontFamily: '"Pixelify Sans", sans-serif',
    fontSize: "1rem",
  },
};