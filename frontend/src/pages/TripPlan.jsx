import { useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useIsDarkMode } from "../contexts/ThemeContext";
import ThemeToggle from "../components/ThemeToggle";

const TABS = ["Overview", "Hotels", "Activities", "Food", "Transportation", "Itinerary", "Budget"];

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
      <ThemeToggle />
      <div className="trip-scroll" style={styles.wrap}>
        <div style={styles.content}>

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} style={styles.header}>
            <button style={styles.newTripBtn} onClick={() => nav("/")}>← New Trip</button>
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
              {activeTab === "Activities"  && <TabActivities activities={plan.activities || []} currency={prefs?.currency} />}
              {activeTab === "Food"        && <TabFood foodSpots={plan.food_spots || []} destination={prefs?.destination} />}
              {activeTab === "Transportation" && <TabTransportation options={plan.transportation_options || []} currency={prefs?.currency} origin={prefs?.origin} destination={prefs?.destination} />}
              {activeTab === "Itinerary"   && <TabItinerary itinerary={plan.itinerary || []} currency={prefs?.currency} />}
              {activeTab === "Budget"      && <TabBudget budget={plan.budget_breakdown} prefs={prefs} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function TabOverview({ plan, prefs }) {
  const destination = prefs?.destination || "";
  const mapsSearch = (q) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

  return (
    <div style={styles.tabContent}>

      {plan.best_neighborhoods?.length > 0 && (
        <Card title="📍 Best Neighborhoods">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {plan.best_neighborhoods.map((n, i) => (
              <a
                key={i}
                href={mapsSearch(`${n} ${destination}`)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex", flexDirection: "column", gap: 4,
                  padding: "10px 14px", borderRadius: 12,
                  background: "rgba(13,148,136,0.08)",
                  border: "1px solid rgba(13,148,136,0.25)",
                  textDecoration: "none", cursor: "pointer",
                  transition: "background 0.15s", minWidth: 130,
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(13,148,136,0.16)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(13,148,136,0.08)"}
              >
                <span style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: "0.88rem" }}>
                  📍 {n}
                </span>
                <span style={{ color: "#0d9488", fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.02em" }}>
                  Find on Maps ↗
                </span>
              </a>
            ))}
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

      {(plan.weather_note || plan.currency_note) && (
        <SectionRow>
          {plan.weather_note && (
            <Card title="🌤️ Weather">
              <p style={styles.noteText}>{plan.weather_note}</p>
            </Card>
          )}
          {plan.currency_note && (
            <Card title="💱 Currency">
              <p style={styles.noteText}>{plan.currency_note}</p>
            </Card>
          )}
        </SectionRow>
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
function TabTransportation({ options, currency, origin, destination }) {
  if (!options.length) return <EmptyState>No transportation options available.</EmptyState>;
  return (
    <div style={styles.tabContent}>
      {(origin || destination) && (
        <Card>
          <p style={styles.noteText}>From <strong>{origin || "your location"}</strong> to <strong>{destination || "your destination"}</strong></p>
        </Card>
      )}
      {options.map((opt, i) => (
        <Card key={i}>
          <div style={styles.activityHeader}>
            <div style={styles.activityName}>🚗 {opt.mode}</div>
            <Pill accent>Est. {currency} {opt.estimated_cost_per_group?.toLocaleString?.() ?? opt.estimated_cost_per_group}</Pill>
          </div>
          <div style={styles.activityMeta}>
            <span>⏱️ {opt.duration}</span>
          </div>
          <p style={styles.activityDesc}>{opt.why}</p>
          {opt.notes && <p style={{ ...styles.noteText, marginTop: 6 }}>{opt.notes}</p>}
        </Card>
      ))}
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
function TabBudget({ budget, prefs }) {
  if (!budget) return <EmptyState>No budget breakdown available.</EmptyState>;

  const total = budget.grand_total || 1;
  const items = [
    { label: "🏨 Hotels",         value: budget.hotels_total,        color: "#0d9488" },
    { label: "🎭 Activities",      value: budget.activities_total,    color: "#8b5cf6" },
    { label: "🍽️ Food",            value: budget.food_total,          color: "#f59e0b" },
    { label: "🚗 Transport",       value: budget.transport_total,     color: "#3b82f6" },
    { label: "🛍️ Shopping, Miscellaneous & Incidentals", value: budget.shopping_misc_total, color: "#ec4899" },
  ].filter((i) => i.value > 0);

  return (
    <div style={styles.tabContent}>
      <Card title="Budget Breakdown">
        <div style={styles.budgetSummary}>
          <div style={{ display: "flex", gap: 24, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <div style={styles.budgetTotal}>{prefs?.currency} {budget.grand_total?.toLocaleString?.() ?? budget.grand_total}</div>
              <div style={styles.budgetLabel}>Total · {prefs?.group_size ?? 1} traveler{(prefs?.group_size ?? 1) !== 1 ? "s" : ""}</div>
            </div>
            {prefs?.group_size > 1 && (
              <div>
                <div style={{ ...styles.budgetTotal, fontSize: "1.3rem", color: "var(--text-secondary)" }}>
                  {prefs?.currency} {Math.round((budget.grand_total ?? 0) / prefs.group_size).toLocaleString()}
                </div>
                <div style={styles.budgetLabel}>Per person</div>
              </div>
            )}
          </div>
          <div style={{
            ...styles.budgetBadge,
            background: budget.within_budget ? "rgba(13,148,136,0.15)" : "rgba(239,68,68,0.15)",
            border: `1px solid ${budget.within_budget ? "var(--cal-accent)" : "#ef4444"}`,
            color: budget.within_budget ? "var(--cal-accent-fg)" : "#fca5a5",
          }}>
            {budget.within_budget ? "✅ Within Budget" : "⚠️ Over Budget"}
          </div>
        </div>

        {items.map((item) => {
          const pct = Math.round((item.value / total) * 100);
          return (
            <div key={item.label} style={styles.budgetRow}>
              <div style={styles.budgetRowLabel}>
                <span>{item.label}</span>
                <span style={{ color: "var(--text-muted)" }}>{prefs?.currency} {item.value?.toLocaleString?.() ?? item.value}</span>
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
            </div>
          );
        })}

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
                <CompareRow label="AI Estimate (total)" value={estimateTotal} currency={prefs.currency} color={budget.within_budget ? "#10b981" : "#ef4444"} />
                {groupSize > 1 && <CompareRow label="AI Estimate (per person)" value={Math.round(estimatePerPerson)} currency={prefs.currency} color={budget.within_budget ? "#10b981" : "#ef4444"} dim />}
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