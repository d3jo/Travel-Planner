import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useIsDarkMode } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { useIsMobile } from "../hooks/useIsMobile";
import api from "../api";

const ACCOMMODATION_TAB_LABELS = { hotel: "Hotels", airbnb: "Stays", hostel: "Hostels", mixed: "Stays" };

function getTabs(nights, hotelLabel = "Hotels") {
  const scheduleTab = nights > 7 ? "Weekly Plan" : "Itinerary";
  return ["Overview", hotelLabel, "Experiences", "Food", "Transportation", scheduleTab, "Budget"];
}

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
  @media (max-width: 639px) {
    .trip-tab-btn {
      font-size: 0.82rem !important;
      padding: 10px 10px !important;
      min-width: max-content;
    }
  }
`;

export default function TripPlan() {
  const loc = useLocation();
  const nav = useNavigate();
  const { token } = useParams();
  const isSharedView = !!token;

  // Restore plan from sessionStorage if location state was lost during auth redirect
  const locPlan = loc.state?.plan ?? (() => {
    try { const s = sessionStorage.getItem("pendingPlan"); if (s) { sessionStorage.removeItem("pendingPlan"); return JSON.parse(s); } } catch { /* ignore */ }
    return null;
  })();
  const locPrefs = loc.state?.preferences ?? (() => {
    try { const s = sessionStorage.getItem("pendingPrefs"); if (s) { sessionStorage.removeItem("pendingPrefs"); return JSON.parse(s); } } catch { /* ignore */ }
    return null;
  })();

  const [sharedPlan, setSharedPlan] = useState(null);
  const [sharedPrefs, setSharedPrefs] = useState(null);
  const [sharedLoading, setSharedLoading] = useState(isSharedView);
  const [sharedError, setSharedError] = useState("");

  useEffect(() => {
    if (!token) return;
    setSharedLoading(true);
    api.get(`/shared/${token}`)
      .then(res => { setSharedPlan(res.data.plan); setSharedPrefs(res.data.prefs); })
      .catch(() => setSharedError("This trip link is invalid or has expired."))
      .finally(() => setSharedLoading(false));
  }, [token]);

  const plan = isSharedView ? sharedPlan : locPlan;
  const prefs = isSharedView ? sharedPrefs : locPrefs;

  const isDarkMode = useIsDarkMode();
  const isMobile = useIsMobile();

  const nights = (() => {
    try {
      const d1 = new Date(prefs?.start_date);
      const d2 = new Date(prefs?.end_date);
      return Math.max(1, Math.round((d2 - d1) / 86400000));
    } catch { return 1; }
  })();
  const hotelTabLabel = ACCOMMODATION_TAB_LABELS[prefs?.accommodation_type] || "Hotels";
  const TABS = getTabs(nights, hotelTabLabel);
  const [activeTab, setActiveTab] = useState("Overview");
  const { isLoggedIn } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedTripId, setSavedTripId] = useState(null);
  const [saveErr, setSaveErr] = useState("");
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [showSharePopover, setShowSharePopover] = useState(false);
  const [copied, setCopied] = useState(false);
  const sharePopoverRef = useRef(null);
  const shareBtnRef = useRef(null);

  useEffect(() => {
    if (!showSharePopover) return;
    function handleClick(e) {
      if (
        sharePopoverRef.current && !sharePopoverRef.current.contains(e.target) &&
        shareBtnRef.current && !shareBtnRef.current.contains(e.target)
      ) {
        setShowSharePopover(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSharePopover]);

  async function doSave() {
    const dest = prefs?.destination || "Trip";
    const origin = prefs?.origin || "";
    const res = await api.post("/trips", {
      title: `${origin ? origin + " → " : ""}${dest}`,
      origin,
      destination: dest,
      start_date: prefs?.start_date || "",
      end_date: prefs?.end_date || "",
      plan,
      prefs: prefs || {},
    });
    setSavedTripId(res.data.id);
    setSaved(true);
    return res.data.id;
  }

  function navToAuth() {
    try {
      if (locPlan) sessionStorage.setItem("pendingPlan", JSON.stringify(locPlan));
      if (locPrefs) sessionStorage.setItem("pendingPrefs", JSON.stringify(locPrefs));
    } catch { /* ignore */ }
    nav("/auth", { state: { returnTo: "/plan" } });
  }

  async function handleSave() {
    if (!isLoggedIn) { navToAuth(); return; }
    setSaving(true);
    setSaveErr("");
    try {
      await doSave();
    } catch (e) {
      if (e?.response?.status !== 401) {
        setSaveErr(e?.response?.data?.detail || "Failed to save trip.");
      }
      // 401: auth:expired event in api.js already redirects to /auth
    } finally {
      setSaving(false);
    }
  }

  async function handleShare() {
    if (!isLoggedIn) { navToAuth(); return; }
    setSharing(true);
    setSaveErr("");
    try {
      let tripId = savedTripId;
      if (!tripId) {
        tripId = await doSave();
      }
      const res = await api.post(`/trips/${tripId}/share`);
      setShareUrl(`${window.location.origin}/shared/${res.data.share_token}`);
      setShowSharePopover(true);
    } catch (e) {
      if (e?.response?.status !== 401) {
        setSaveErr(e?.response?.data?.detail || "Failed to share trip. Please try again.");
      }
      // 401: auth:expired event in api.js already redirects to /auth
    } finally {
      setSharing(false);
    }
  }

  async function handleCopyLink() {
    try { await navigator.clipboard.writeText(shareUrl); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (isSharedView && sharedLoading) {
    return (
      <div style={styles.empty}>
        <div style={{ ...styles.emptyText, fontSize: "1rem", opacity: 0.6 }}>Loading trip…</div>
      </div>
    );
  }

  if (isSharedView && sharedError) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyText}>{sharedError}</div>
        <button style={styles.backBtn} onClick={() => nav("/")}>← Plan a New Trip</button>
      </div>
    );
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
              <button style={{ ...styles.newTripBtn, minHeight: 44 }} onClick={() => nav("/")}>← New Trip</button>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", position: "relative" }}>
                {isLoggedIn && !isSharedView && (
                  <button style={{ ...styles.newTripBtn, color: "var(--text-muted)", minHeight: 44 }} onClick={() => nav("/my-trips")}>
                    My Trips
                  </button>
                )}
                {/* Share button */}
                {!isSharedView && (
                  <div style={{ position: "relative" }}>
                    <button
                      ref={shareBtnRef}
                      style={{
                        ...styles.newTripBtn,
                        minHeight: 44,
                        background: showSharePopover ? "rgba(139,92,246,0.15)" : "transparent",
                        border: showSharePopover ? "1px solid rgba(139,92,246,0.5)" : "1px solid var(--border)",
                        color: showSharePopover ? "#8b5cf6" : "var(--text-muted)",
                        opacity: sharing ? 0.6 : 1,
                        cursor: sharing ? "not-allowed" : "pointer",
                        display: "flex", alignItems: "center", gap: 6,
                      }}
                      onClick={handleShare}
                      disabled={sharing}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                      </svg>
                      {sharing ? "Sharing…" : "Share"}
                    </button>

                    {/* Share popover */}
                    <AnimatePresence>
                      {showSharePopover && (
                        <motion.div
                          ref={sharePopoverRef}
                          initial={{ opacity: 0, y: -6, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -6, scale: 0.97 }}
                          transition={{ duration: 0.15 }}
                          style={{
                            position: "absolute",
                            top: "calc(100% + 8px)",
                            right: 0,
                            width: isMobile ? "min(320px, 90vw)" : 340,
                            background: isDarkMode ? "rgba(18,18,28,0.98)" : "rgba(255,252,248,0.99)",
                            border: isDarkMode ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(168,207,223,0.5)",
                            borderRadius: 14,
                            padding: "14px 14px 12px",
                            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                            backdropFilter: "blur(16px)",
                            zIndex: 1000,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                            <span style={{ fontWeight: 700, fontSize: "0.88rem", color: isDarkMode ? "#fff" : "#334455" }}>
                              Share this trip
                            </span>
                            <button onClick={() => setShowSharePopover(false)} style={{ background: "none", border: "none", cursor: "pointer", color: isDarkMode ? "rgba(255,255,255,0.4)" : "rgba(100,120,140,0.6)", fontSize: "1.1rem", lineHeight: 1, padding: 0 }}>×</button>
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <input
                              readOnly
                              value={shareUrl}
                              onFocus={e => e.target.select()}
                              style={{
                                flex: 1,
                                padding: "7px 10px",
                                borderRadius: 8,
                                border: isDarkMode ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(168,207,223,0.5)",
                                background: isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                                color: isDarkMode ? "rgba(220,235,255,0.8)" : "#445566",
                                fontSize: "0.75rem",
                                outline: "none",
                                fontFamily: "monospace",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            />
                            <button
                              onClick={handleCopyLink}
                              style={{
                                padding: "7px 14px",
                                borderRadius: 8,
                                border: "none",
                                background: copied ? "rgba(13,148,136,0.85)" : "#8b5cf6",
                                color: "#fff",
                                fontSize: "0.8rem",
                                fontWeight: 700,
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                                transition: "background 0.15s",
                              }}
                            >
                              {copied ? "Copied!" : "Copy link"}
                            </button>
                          </div>
                          <div style={{ marginTop: 8, fontSize: "0.72rem", color: isDarkMode ? "rgba(255,255,255,0.35)" : "rgba(100,120,140,0.6)" }}>
                            Anyone with this link can view this trip.
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {!isSharedView && (
                  <button
                    style={{
                      ...styles.newTripBtn,
                      background: saved ? "rgba(13,148,136,0.15)" : "var(--cal-accent)",
                      border: saved ? "1px solid var(--cal-accent)" : "none",
                      color: "#fff",
                      opacity: saving ? 0.6 : 1,
                      cursor: saving ? "not-allowed" : "pointer",
                      minHeight: 44,
                    }}
                    onClick={handleSave}
                    disabled={saving || saved}
                  >
                    {saved ? "✓ Saved!" : saving ? "Saving…" : "Save Trip"}
                  </button>
                )}

                {isSharedView && (
                  <button
                    style={{ ...styles.newTripBtn, background: "var(--cal-accent)", border: "none", color: "#fff", minHeight: 44 }}
                    onClick={() => nav("/")}
                  >
                    Plan your own trip →
                  </button>
                )}
              </div>
            </div>
            {saveErr && (
              <div style={{ fontSize: 12, color: "#f87171", marginBottom: 6 }}>{saveErr}</div>
            )}
            <div style={{
              ...styles.destination,
              fontSize: "clamp(1.6rem, 5.5vw, 2.4rem)",
            }}>
              {prefs?.destination || "Your Trip"}
            </div>
            {prefs?.origin && (
              <div style={{ fontSize: "0.88rem", color: "var(--text-muted)", marginTop: -2, marginBottom: 2 }}>
                ✈️ {prefs.origin.split(",")[0]} → {prefs.destination?.split(" → ")[0]}
              </div>
            )}
            <div style={{ ...styles.dateRow, flexWrap: "wrap", lineHeight: 1.8 }}>
              {(() => {
                const fmt = (iso) => {
                  const [y, m, d] = iso.split("-");
                  return new Date(+y, +m - 1, +d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                };
                const s = prefs?.start_date; const e = prefs?.end_date;
                const year = s ? s.split("-")[0] : "";
                return s && e ? `${fmt(s)} – ${fmt(e)}, ${year}` : "";
              })()} · {prefs?.group_size} traveler{prefs?.group_size !== 1 ? "s" : ""} · {prefs?.budget?.toLocaleString()} {prefs?.currency}
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
                display: "inline-block",
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



          {/* Tab Bar — scrolls horizontally on mobile, invisible scrollbar */}
          <div style={{
            ...styles.tabBar,
            justifyContent: isMobile ? "flex-start" : "space-between",
          }}>
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
                  ...(isMobile && { flex: "0 0 auto" }),
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
              {activeTab === hotelTabLabel && <TabHotels hotels={plan.hotels || []} currency={prefs?.currency} cities={prefs?.destinations} accommodationType={prefs?.accommodation_type || "hotel"} />}
              {activeTab === "Experiences"  && <TabActivities activities={plan.activities || []} currency={prefs?.currency} cities={prefs?.destinations} />}
              {activeTab === "Food"        && <TabFood foodSpots={plan.food_spots || []} destination={prefs?.destination} cities={prefs?.destinations} />}
              {activeTab === "Transportation" && <TabTransportation options={plan.transportation_options || []} currency={prefs?.currency} origin={prefs?.origin} destination={prefs?.destination} overrideNote={plan._transport_override} groupSize={prefs?.group_size ?? 1} />}
              {activeTab === "Itinerary"   && <TabItinerary itinerary={plan.itinerary || []} currency={prefs?.currency} />}
              {activeTab === "Weekly Plan" && <TabWeeklyPlan weeklyPlan={plan.weekly_plan || []} destination={prefs?.destination} />}
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(220px, 100%), 1fr))", gap: 10 }}>
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
function groupByCity(items, cities) {
  if (!cities?.length) return null;
  const trimmed = cities.map((c) => c.trim());
  const lcMap = {};
  trimmed.forEach((c) => { lcMap[c.toLowerCase()] = c; });
  const groups = {};
  trimmed.forEach((c) => { groups[c] = []; });

  // Returns canonical city name if text contains or matches any known city
  const findMatch = (text) => {
    if (!text || typeof text !== "string") return null;
    const lc = text.toLowerCase().trim();
    if (lcMap[lc]) return lcMap[lc];
    const k = Object.keys(lcMap).find((k) => lc.includes(k) || k.includes(lc));
    return k ? lcMap[k] : null;
  };

  items.forEach((item) => {
    // Try explicit city field → neighborhood → location (hotels) as fallback
    const matched =
      findMatch(item.city) ||
      findMatch(item.neighborhood) ||
      findMatch(item.location);

    if (matched) { groups[matched].push(item); return; }
    // Truly unknown city — own group
    const raw = typeof item.city === "string" ? item.city.trim() : null;
    if (raw) { groups[raw] = groups[raw] || []; groups[raw].push(item); return; }
    // No city info at all — fall to first city
    groups[trimmed[0]].push(item);
  });

  return Object.entries(groups).filter(([, v]) => v.length > 0);
}

function CityHeader({ name }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      margin: "8px 0 4px", paddingBottom: 8,
      borderBottom: "1px solid var(--border-col)",
    }}>
      <span style={{ fontSize: "1.1rem" }}>📍</span>
      <span style={{
        fontFamily: '"Pixelify Sans", sans-serif',
        fontSize: "1.05rem", fontWeight: 700,
        color: "var(--cal-accent)",
      }}>{name}</span>
    </div>
  );
}

const ACCOM_META = {
  hotel:  { icon: "🏨", emptyMsg: "No hotel recommendations available.",  linkLabel: "Find on Maps",       buildLink: (name, loc) => buildSearchUrl(name, loc) },
  airbnb: { icon: "🏠", emptyMsg: "No stay recommendations available.",   linkLabel: "Search on Airbnb",   buildLink: (name, loc) => `https://www.airbnb.com/s/${encodeURIComponent(loc || name)}/homes` },
  hostel: { icon: "🛏️", emptyMsg: "No hostel recommendations available.", linkLabel: "Search on Hostelworld", buildLink: (name, loc) => `https://www.hostelworld.com/findabed.php/ChosenCity.${encodeURIComponent(loc || name)}` },
  mixed:  { icon: "🏠", emptyMsg: "No accommodation recommendations available.", linkLabel: "Find on Maps", buildLink: (name, loc) => buildSearchUrl(name, loc) },
};

function TabHotels({ hotels, currency, cities, accommodationType = "hotel" }) {
  const meta = ACCOM_META[accommodationType] || ACCOM_META.hotel;
  if (!hotels.length) return <EmptyState>{meta.emptyMsg}</EmptyState>;
  const groups = groupByCity(hotels, cities);
  const renderHotel = (h, i) => {
    const typeIcon = accommodationType === "airbnb" ? "🏠"
      : accommodationType === "hostel" ? "🛏️"
      : "🏨";
    return (
      <Card key={i}>
        <div style={styles.hotelHeader}>
          <div>
            <div style={styles.hotelName}>{typeIcon} {h.name}</div>
            <div style={styles.hotelType}>{h.type}</div>
          </div>
          <div style={styles.priceTag}>
            <div style={styles.priceAmount}>{currency} {h.price_per_night?.toLocaleString?.() ?? h.price_per_night}</div>
            <div style={styles.priceLabel}>/ night</div>
          </div>
        </div>
        {accommodationType === "hotel" && h.stars && <Stars count={h.stars} />}
        <div style={styles.hotelLocation}>📍 {h.location}</div>
        <p style={styles.hotelWhy}>{h.why}</p>
        <div style={{ marginTop: 10 }}>
          <ResourceLink href={meta.buildLink(h.name, h.location)} label={meta.linkLabel} />
        </div>
        {h.amenities?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {h.amenities.map((a, j) => <Pill key={j} small>{a}</Pill>)}
          </div>
        )}
      </Card>
    );
  };
  return (
    <div style={styles.tabContent}>
      {groups
        ? groups.map(([city, items]) => (
            <div key={city}>
              <CityHeader name={city} />
              {items.map(renderHotel)}
            </div>
          ))
        : hotels.map(renderHotel)}
    </div>
  );
}

// ─── Activities Tab ───────────────────────────────────────────────────────────
function TabActivities({ activities, currency, cities }) {
  if (!activities.length) return <EmptyState>No activities available.</EmptyState>;
  const groups = groupByCity(activities, cities);
  const renderActivity = (a, i) => (
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
  );
  return (
    <div style={styles.tabContent}>
      {groups
        ? groups.map(([city, items]) => (
            <div key={city}>
              <CityHeader name={city} />
              {items.map(renderActivity)}
            </div>
          ))
        : activities.map(renderActivity)}
    </div>
  );
}


// ─── Food Tab ─────────────────────────────────────────────────────────────────
function TabFood({ foodSpots, destination, cities }) {
  if (!foodSpots.length) return <EmptyState>No food recommendations available.</EmptyState>;

  const renderFoodSpot = (spot, i) => {
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
  };

  const groups = groupByCity(foodSpots, cities);

  return (
    <div style={styles.tabContent}>
      {groups
        ? groups.map(([city, items]) => (
            <div key={city}>
              <CityHeader name={city} />
              {items.map(renderFoodSpot)}
            </div>
          ))
        : foodSpots.map(renderFoodSpot)}
    </div>
  );
}



// ─── Transportation Tab ───────────────────────────────────────────────────────
function TabTransportation({ options, currency, origin, destination, overrideNote, groupSize = 1 }) {
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
          ? `${priceCurrency} ${Math.round(pe.min / groupSize).toLocaleString()} – ${Math.round(pe.max / groupSize).toLocaleString()}`
          : opt.estimated_cost_per_group != null
            ? `${currency} ${Math.round(Number(opt.estimated_cost_per_group) / groupSize).toLocaleString()}`
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
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                  <span style={{
                    fontSize: "0.85rem", fontWeight: 700, padding: "4px 12px", borderRadius: 999,
                    background: "rgba(13,148,136,0.12)", border: "1px solid rgba(13,148,136,0.35)",
                    color: "var(--cal-accent)", whiteSpace: "nowrap",
                  }}>
                    Est. {priceDisplay}
                  </span>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", paddingRight: 4 }}>
                    per person
                  </span>
                </div>
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




// ─── Weekly Plan Tab ──────────────────────────────────────────────────────────
function TabWeeklyPlan({ weeklyPlan, destination }) {
  if (!weeklyPlan.length) return <EmptyState>No weekly plan available.</EmptyState>;
  const mapsSearch = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q + " " + (destination || ""))}`;
  const weekColors = ["#0d9488", "#8b5cf6", "#f59e0b", "#3b82f6", "#ec4899", "#4ade80", "#fb923c", "#38bdf8"];

  return (
    <div style={styles.tabContent}>
      {weeklyPlan.map((week, i) => {
        const accent = weekColors[i % weekColors.length];
        return (
          <div key={i} style={{
            ...styles.card,
            borderLeft: `3px solid ${accent}`,
          }}>
            {/* Week header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <span style={{
                    fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase",
                    letterSpacing: "0.08em", color: accent,
                    background: `${accent}18`, border: `1px solid ${accent}44`,
                    borderRadius: 999, padding: "3px 10px",
                  }}>
                    Week {week.week}
                  </span>
                  {week.dates && (
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      {week.dates}
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize: "1.1rem", fontWeight: 700,
                  fontFamily: '"Pixelify Sans", sans-serif',
                  color: "var(--white)",
                }}>
                  {week.theme}
                </div>
              </div>
            </div>

            {/* Focus */}
            {week.focus && (
              <p style={{ margin: "0 0 12px", fontSize: "0.88rem", color: "var(--white)", lineHeight: 1.6 }}>
                {week.focus}
              </p>
            )}

            {/* Highlights */}
            {week.highlights?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
                  Highlights
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {week.highlights.map((h, j) => (
                    <a
                      key={j}
                      href={mapsSearch(h)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "flex", alignItems: "flex-start", gap: 8,
                        padding: "7px 10px", borderRadius: 8,
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid var(--border-col)",
                        textDecoration: "none",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
                      onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                    >
                      <span style={{ color: accent, fontSize: "0.78rem", flexShrink: 0, marginTop: 1 }}>▸</span>
                      <span style={{ fontSize: "0.88rem", color: "var(--white)", lineHeight: 1.45 }}>{h}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Excursions */}
            {week.suggested_excursions?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
                  Day Trips & Excursions
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {week.suggested_excursions.map((ex, j) => (
                    <a
                      key={j}
                      href={mapsSearch(ex)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "5px 12px", borderRadius: 999,
                        background: `${accent}12`, border: `1px solid ${accent}44`,
                        fontSize: "0.82rem", color: accent, textDecoration: "none",
                        fontWeight: 600, transition: "background 0.15s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = `${accent}22`}
                      onMouseLeave={e => e.currentTarget.style.background = `${accent}12`}
                    >
                      🗺️ {ex}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Pacing note */}
            {week.pacing_note && (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 8,
                padding: "8px 12px", borderRadius: 8,
                background: "rgba(56,189,248,0.06)",
                border: "1px solid rgba(56,189,248,0.18)",
              }}>
                <span style={{ fontSize: "0.78rem", flexShrink: 0 }}>💡</span>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.5 }}>{week.pacing_note}</span>
              </div>
            )}
          </div>
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
      return `${currency} ${fmt(perPerson)} /person (group flight total ÷ ${g} traveler${g !== 1 ? "s" : ""} + local)`;
    case "shopping":
      return `${currency} ${fmt(perPerson / n)} /person/day × ${g} traveler${g !== 1 ? "s" : ""} × ${n} nights`;
    default: return null;
  }
}

function BudgetRow({ item, total, currency, nights, groupSize, perPersonMode, transportMode }) {
  const [hovered, setHovered] = useState(false);
  const pct = Math.round((item.value / total) * 100);
  const perPersonVal = Math.round(item.value / groupSize);
  // transport uses pre-divided displayValue; other items divide here
  const primaryVal = item.displayValue != null ? item.displayValue : (perPersonMode ? perPersonVal : item.value);
  const mathNote = budgetMathNote(item.key, item.value, currency, nights, groupSize);

  const hasRange = item.range?.min != null && item.range?.max != null && item.range.min !== item.range.max;
  // range and breakdown are already pre-divided to the correct mode in TabBudget
  const dispRangeMin = hasRange ? item.range.min : null;
  const dispRangeMax = hasRange ? item.range.max : null;
  const bd = item.breakdown;

  // For transport, build tooltip from pre-processed per-person breakdown values
  const transportNote = item.key === "transport" && bd?.international
    ? (() => {
        const flMin = bd.international.min;
        const flMax = bd.international.max;
        const loc = bd.local || 0;
        const suffix = perPersonMode ? " /person" : " total";
        return loc > 0
          ? `${currency} ${flMin.toLocaleString()}–${flMax.toLocaleString()} flights + ${currency} ${loc.toLocaleString()} local${suffix}`
          : `${currency} ${flMin.toLocaleString()}–${flMax.toLocaleString()} flights${suffix}`;
      })()
    : null;

  return (
    <div
      style={{ ...styles.budgetRow, position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={styles.budgetRowLabel}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {item.label}
          {(transportNote || mathNote) && <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", opacity: 0.6 }}>ⓘ</span>}
        </span>
        <div style={{ textAlign: "right" }}>
          {hasRange ? (
            <>
              <div style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>
                {currency} {dispRangeMin.toLocaleString()} – {dispRangeMax.toLocaleString()}
                {perPersonMode && <span style={{ fontSize: "0.72rem", opacity: 0.65, marginLeft: 3 }}>/person</span>}
              </div>
            </>
          ) : (
            <div style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>
              {currency} {primaryVal.toLocaleString()}
              {perPersonMode && <span style={{ fontSize: "0.72rem", opacity: 0.65, marginLeft: 3 }}>/person</span>}
            </div>
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
      {hovered && (transportNote || mathNote) && (
        <div style={{
          position: "absolute", left: 0, top: "100%", zIndex: 20,
          background: "var(--bg-card)", border: "1px solid var(--border-col)",
          borderRadius: 8, padding: "6px 12px",
          fontSize: "0.78rem", color: "var(--text-muted)",
          whiteSpace: "nowrap", marginTop: 4,
          boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
          pointerEvents: "none",
        }}>
          {transportNote || mathNote}
        </div>
      )}
      {hasRange && bd && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {bd.international?.min != null && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "var(--text-muted)" }}>
              <span>
                {transportMode === "own_car" ? "⛽ Fuel & tolls" :
                 transportMode === "car_rental" ? "🚗 Rental + fuel" :
                 transportMode === "bus_train" ? "🚌 Bus / Train" :
                 "✈️ Flights"}{perPersonMode ? " (per person)" : " (total)"}
              </span>
              <span>{currency} {bd.international.min.toLocaleString()} – {bd.international.max.toLocaleString()}</span>
            </div>
          )}
          {bd.local > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "var(--text-muted)" }}>
              <span>🚌 Local transport</span>
              <span>{currency} {bd.local.toLocaleString()}</span>
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

  const nights = (() => {
    try {
      const d1 = new Date(prefs?.start_date);
      const d2 = new Date(prefs?.end_date);
      return Math.max(1, Math.round((d2 - d1) / 86400000));
    } catch { return 1; }
  })();
  const groupSize = prefs?.group_size ?? 1;

  const perPersonMode = prefs?.budget_type === "per_person";

  // Recompute transport total/range from breakdown.
  // international.min/max = TOTAL cost for the group. local = group total.
  let transportTotal = budget.transport_total || 0;  // always group total, used for grandTotal %
  let transportRange = null;
  let transportBreakdown = null;
  const tbd = budget.transport_breakdown;
  if (tbd?.international?.min != null && tbd?.international?.max != null) {
    const local = tbd.local || 0;
    const groupMin = Math.round(tbd.international.min + local);
    const groupMax = Math.round(tbd.international.max + local);
    transportTotal = Math.round((tbd.international.min + tbd.international.max) / 2 + local);
    // Pre-divide to correct display mode so BudgetRow doesn't need to
    const scale = perPersonMode ? 1 / groupSize : 1;
    transportRange = { min: Math.round(groupMin * scale), max: Math.round(groupMax * scale) };
    transportBreakdown = {
      international: {
        min: Math.round(tbd.international.min * scale),
        max: Math.round(tbd.international.max * scale),
        note: tbd.international.note,
      },
      local: Math.round(local * scale),
    };
  }

  const grandTotal = (budget.hotels_total || 0) + (budget.activities_total || 0) +
    (budget.food_total || 0) + transportTotal + (budget.shopping_misc_total || 0) || budget.grand_total || 0;
  const total = grandTotal || 1;
  const grandPerPerson = Math.round(grandTotal / groupSize);

  // Build per-category ranges and sum them for the grand range
  const scale = perPersonMode ? 1 / groupSize : 1;
  function catRange(rangeField, totalField) {
    const r = budget[rangeField];
    const t = budget[totalField] || 0;
    if (r?.min != null && r?.max != null && r.min !== r.max) {
      return { min: Math.round(r.min * scale), max: Math.round(r.max * scale) };
    }
    // Fallback: ±15% of total if range not provided
    const pp = Math.round(t * scale);
    return { min: Math.round(pp * 0.85), max: Math.round(pp * 1.15) };
  }
  const hotelsRange     = catRange("hotels_range",      "hotels_total");
  const activitiesRange = catRange("activities_range",  "activities_total");
  const foodRange       = catRange("food_range",        "food_total");
  const shoppingRange   = catRange("shopping_misc_range","shopping_misc_total");
  // Transport range already computed above (transportRange)
  const tRangeMin = transportRange ? transportRange.min : Math.round(Math.round(transportTotal * scale) * 0.9);
  const tRangeMax = transportRange ? transportRange.max : Math.round(Math.round(transportTotal * scale) * 1.1);

  const rangeMinPP = hotelsRange.min + activitiesRange.min + foodRange.min + tRangeMin + shoppingRange.min;
  const rangeMaxPP = hotelsRange.max + activitiesRange.max + foodRange.max + tRangeMax + shoppingRange.max;
  const rangeMin = perPersonMode ? rangeMinPP * groupSize : rangeMinPP;
  const rangeMax = perPersonMode ? rangeMaxPP * groupSize : rangeMaxPP;

  const enteredTotal = prefs?.budget
    ? (perPersonMode ? prefs.budget * groupSize : prefs.budget)
    : null;
  // Within budget if user's budget falls inside the summed category range
  const isWithinBudget = enteredTotal != null
    ? enteredTotal >= rangeMin && enteredTotal <= rangeMax
    : true;
  const isOverBudget = enteredTotal != null && enteredTotal < rangeMin;

  const accomIcon = { hotel: "🏨", airbnb: "🏠", hostel: "🛏️", mixed: "🏠" }[prefs?.accommodation_type] || "🏨";
  const accomLabel = ACCOMMODATION_TAB_LABELS[prefs?.accommodation_type] || "Hotels";

  const items = [
    { key: "hotels",   label: `${accomIcon} ${accomLabel}`,  value: budget.hotels_total,
      displayValue: Math.round((budget.hotels_total || 0) * scale), range: hotelsRange, color: "#0d9488" },
    { key: "activities", label: "🎭 Experiences & Attractions", value: budget.activities_total,
      displayValue: Math.round((budget.activities_total || 0) * scale), range: activitiesRange, color: "#8b5cf6" },
    { key: "food",     label: "🍽️ Food",            value: budget.food_total,
      displayValue: Math.round((budget.food_total || 0) * scale), range: foodRange, color: "#f59e0b" },
    { key: "transport",label: "🚗 Transportation",   value: transportTotal,             color: "#3b82f6",
      displayValue: perPersonMode ? Math.round(transportTotal / groupSize) : transportTotal,
      range: transportRange ?? { min: tRangeMin, max: tRangeMax }, breakdown: transportBreakdown },
    { key: "shopping", label: "🛍️ Shopping, Misc & Incidentals", value: budget.shopping_misc_total || 0,
      displayValue: Math.round((budget.shopping_misc_total || 0) * scale), range: shoppingRange, color: "#ec4899", alwaysShow: true },
  ].filter((i) => i.value > 0 || i.alwaysShow);

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
              <div>
                <div style={styles.budgetTotal}>{prefs?.currency} {rangeMinPP.toLocaleString()} – {rangeMaxPP.toLocaleString()}</div>
                <div style={styles.budgetLabel}>Est. per person</div>
              </div>
            ) : (
              <div>
                <div style={styles.budgetTotal}>{prefs?.currency} {rangeMin.toLocaleString()} – {rangeMax.toLocaleString()}</div>
                <div style={styles.budgetLabel}>Est. total · {groupSize} traveler{groupSize !== 1 ? "s" : ""}</div>
              </div>
            )}
          </div>
          <div style={{
            ...styles.budgetBadge,
            background: isWithinBudget ? "rgba(13,148,136,0.15)" : "rgba(239,68,68,0.15)",
            border: `1px solid ${isWithinBudget ? "var(--cal-accent)" : "#ef4444"}`,
            color: isWithinBudget ? "var(--cal-accent-fg)" : "#fca5a5",
          }}>
            {isWithinBudget ? "✅ Within Budget" : isOverBudget ? "⚠️ Over Budget" : "✅ Under Budget"}
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

      {prefs?.budget && (() => {
        const gs = prefs.group_size ?? 1;
        const entTotal = prefs.budget_type === "per_person" ? prefs.budget * gs : prefs.budget;
        const perPersonPerDay = entTotal / gs / Math.max(nights, 1);
        const estimateTotal = budget.grand_total ?? 0;
        const severely = estimateTotal > 0 && entTotal < estimateTotal * 0.5;
        const tooLow = perPersonPerDay < 30;
        if (!severely && !tooLow) return null;
        return (
          <div style={{
            padding: "14px 18px", borderRadius: 12,
            background: "rgba(239,68,68,0.1)",
            border: "1.5px solid rgba(239,68,68,0.5)",
            fontSize: "0.88rem", color: "var(--white)", lineHeight: 1.6,
          }}>
            <div style={{ fontWeight: 800, color: "#f87171", marginBottom: 6, fontSize: "0.95rem" }}>
              ⚠️ Budget Warning
            </div>
            {tooLow && (
              <div>Your budget works out to only <strong>{prefs.currency} {Math.round(perPersonPerDay)}/person/day</strong> — this is below the minimum needed for meals, transport, and accommodation in most destinations. Consider increasing your budget significantly.</div>
            )}
            {!tooLow && severely && (
              <div>Your entered budget of <strong>{prefs.currency} {entTotal.toLocaleString()}</strong> is less than half of the AI's realistic estimate of <strong>{prefs.currency} {estimateTotal.toLocaleString()}</strong>. This trip is likely not feasible at your current budget — consider raising it or shortening the trip.</div>
            )}
          </div>
        );
      })()}

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
            const estColor = isWithinBudget ? "#10b981" : "#ef4444";
            return (
              <div style={styles.budgetCompare}>
                {perPersonMode ? (
                  <>
                    <CompareRow label="Your Budget (per person)" value={Math.round(enteredPerPerson)} currency={prefs.currency} color="var(--cal-accent)" />
                    <div style={styles.divider} />
                    <CompareRow label="AI Estimate range (per person)" valueRange={[rangeMinPP, rangeMaxPP]} currency={prefs.currency} color={estColor} />
                  </>
                ) : (
                  <>
                    <CompareRow label="Your Budget (total)" value={enteredTotal} currency={prefs.currency} color="var(--cal-accent)" />
                    <div style={styles.divider} />
                    <CompareRow label="AI Estimate range (total)" valueRange={[rangeMin, rangeMax]} currency={prefs.currency} color={estColor} />
                  </>
                )}
              </div>
            );
          })()}
          {(() => {
            if (!prefs.budget) return null;
            const enteredBudgetPP = perPersonMode ? prefs.budget : prefs.budget / groupSize;

            if (enteredBudgetPP >= rangeMinPP && enteredBudgetPP <= rangeMaxPP) {
              return (
                <div style={{
                  marginTop: 14, padding: "10px 14px", borderRadius: 10,
                  background: "rgba(16,185,129,0.08)",
                  border: "1px solid rgba(16,185,129,0.3)",
                  fontSize: "0.84rem", color: "var(--white)", lineHeight: 1.55,
                }}>
                  <span style={{ fontWeight: 700, color: "#10b981" }}>✅ </span>
                  Your budget is within the estimated range — you're on track!
                </div>
              );
            }

            const isUnder = enteredBudgetPP < rangeMinPP;
            const diffPP = isUnder ? Math.round(rangeMinPP - enteredBudgetPP) : Math.round(enteredBudgetPP - rangeMaxPP);
            const diffTotal = Math.round(diffPP * groupSize);
            const diffLabel = perPersonMode
              ? `${prefs.currency} ${diffPP.toLocaleString()}/person`
              : `${prefs.currency} ${diffTotal.toLocaleString()}`;

            return (
              <div style={{
                marginTop: 14, padding: "10px 14px", borderRadius: 10,
                background: isUnder ? "rgba(239,68,68,0.08)" : "rgba(56,189,248,0.08)",
                border: `1px solid ${isUnder ? "rgba(239,68,68,0.3)" : "rgba(56,189,248,0.3)"}`,
                fontSize: "0.84rem", color: "var(--white)", lineHeight: 1.55,
              }}>
                {isUnder ? (
                  <>
                    <span style={{ fontWeight: 700, color: "#f87171" }}>⚠️ </span>
                    Your budget is around <strong>~{diffLabel} under</strong> the estimated trip cost.
                  </>
                ) : (
                  <>
                    <span style={{ fontWeight: 700, color: "#38bdf8" }}>ℹ️ </span>
                    Your budget is about <strong>~{diffLabel} over</strong> the estimated trip cost — there's room to upgrade.
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

function CompareRow({ label, value, valueRange, currency, color, dim }) {
  const display = valueRange
    ? `${currency} ${valueRange[0].toLocaleString()} – ${valueRange[1].toLocaleString()}`
    : `${currency} ${value?.toLocaleString?.() ?? value}`;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: dim ? "3px 0" : "6px 0", opacity: dim ? 0.65 : 1 }}>
      <span style={{ color: "var(--text-muted)", fontSize: dim ? "0.8rem" : "0.9rem" }}>{label}</span>
      <span style={{ color, fontWeight: dim ? 500 : 700, fontFamily: dim ? "inherit" : '"Pixelify Sans", sans-serif', fontSize: dim ? "0.85rem" : "1rem" }}>
        {display}
      </span>
    </div>
  );
}

const styles = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    height: "calc(100vh - 56px)",
    width: "100%",
    padding: "16px 16px max(env(safe-area-inset-bottom, 0px) + 16px, 40px)",
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
    marginBottom: 0,
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
    justifyContent: "space-between",
    width: "100%",
    overflowX: "auto",
    WebkitOverflowScrolling: "touch",
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
    fontSize: "1.05rem",
    letterSpacing: "0.03em",
    transition: "color 0.2s, border-color 0.2s",
    outline: "none",
    boxShadow: "none",
    whiteSpace: "nowrap",
    textAlign: "center",
    minHeight: 44,
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
    flexWrap: "wrap",
    gap: 8,
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
    alignItems: "flex-start",
    marginBottom: 8,
    gap: 8,
    flexWrap: "wrap",
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