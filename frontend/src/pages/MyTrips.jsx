import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import api from "../api";

function formatDate(str) {
  if (!str) return "";
  try {
    return new Date(str).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch { return str; }
}

export default function MyTrips() {
  const { isLoggedIn, user, logout } = useAuth();
  const navigate = useNavigate();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!isLoggedIn) { navigate("/auth", { replace: true }); return; }
    fetchTrips();
  }, [isLoggedIn]);

  async function fetchTrips() {
    setLoading(true);
    setErr("");
    try {
      const res = await api.get("/trips");
      setTrips(res.data);
    } catch (e) {
      setErr("Failed to load trips.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    setDeleting(id);
    try {
      await api.delete(`/trips/${id}`);
      setTrips((t) => t.filter((x) => x.id !== id));
    } catch {
      setErr("Failed to delete trip.");
    } finally {
      setDeleting(null);
    }
  }

  async function handleOpen(id) {
    try {
      const res = await api.get(`/trips/${id}`);
      navigate("/plan", { state: { plan: res.data.plan, preferences: res.data.prefs } });
    } catch {
      setErr("Failed to load trip.");
    }
  }

  const cardStyle = {
    background: "var(--bg-card-solid)",
    border: "1px solid var(--border-col)",
    borderRadius: 16,
    padding: "20px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    cursor: "pointer",
    transition: "border-color 0.2s, transform 0.15s",
    position: "relative",
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg-app)",
      padding: "76px clamp(16px, 4vw, 24px) max(env(safe-area-inset-bottom, 0px) + 24px, 40px)",
    }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 14,
              padding: "0 0 16px 0",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            ← Back
          </button>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: "clamp(22px, 6vw, 28px)", fontWeight: 800, color: "var(--white)", fontFamily: '"Pixelify Sans", sans-serif' }}>My Trips</h1>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
                Saved by {user?.username}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={() => navigate("/")}
                style={{
                  padding: "10px 18px",
                  minHeight: 44,
                  borderRadius: 10,
                  border: "1px solid var(--border-col)",
                  background: "var(--bg-card)",
                  color: "var(--white)",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                + New Trip
              </button>
              <button
                onClick={logout}
                style={{
                  padding: "10px 18px",
                  minHeight: 44,
                  borderRadius: 10,
                  border: "1px solid var(--border-col)",
                  background: "transparent",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>

        {err && (
          <div style={{
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.35)",
            borderRadius: 10,
            padding: "10px 14px",
            color: "#f87171",
            fontSize: 13,
            marginBottom: 20,
          }}>
            {err}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", paddingTop: 60, fontSize: 15 }}>
            Loading your trips…
          </div>
        ) : trips.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              textAlign: "center",
              paddingTop: 80,
              color: "var(--text-muted)",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}>🗺️</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: "var(--white)" }}>No saved trips yet</div>
            <div style={{ fontSize: 14, marginBottom: 24 }}>Generate a trip plan and save it to see it here.</div>
            <button
              onClick={() => navigate("/")}
              style={{
                padding: "10px 24px",
                borderRadius: 12,
                border: "none",
                background: "var(--cal-accent)",
                color: "#fff",
                fontWeight: 700,
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              Plan a Trip
            </button>
          </motion.div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <AnimatePresence>
              {trips.map((trip, i) => (
                <motion.div
                  key={trip.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: i * 0.04 }}
                  style={cardStyle}
                  onClick={() => handleOpen(trip.id)}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--cal-accent)"}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border-col)"}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: "var(--white)", marginBottom: 4 }}>
                        {trip.title}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                        {trip.origin} → {trip.destination}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(trip.id); }}
                      disabled={deleting === trip.id}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--text-muted)",
                        fontSize: 18,
                        padding: "6px 10px",
                        borderRadius: 6,
                        lineHeight: 1,
                        minWidth: 44,
                        minHeight: 44,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      title="Delete trip"
                    >
                      {deleting === trip.id ? "…" : "×"}
                    </button>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {formatDate(trip.start_date)} – {formatDate(trip.end_date)}
                    <span style={{ marginLeft: 12, opacity: 0.6 }}>
                      Saved {formatDate(trip.created_at)}
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
