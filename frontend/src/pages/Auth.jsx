import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import api from "../api";

export default function Auth() {
  const { login, isLoggedIn, getSavedUsername } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo || "/";
  const [tab, setTab] = useState("login");
  const [form, setForm] = useState({ username: "", email: "", password: "", remember: true });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLoggedIn) navigate(returnTo, { replace: true });
  }, [isLoggedIn]);

  useEffect(() => {
    const saved = getSavedUsername();
    if (saved) setForm((f) => ({ ...f, username: saved }));
  }, []);

  function set(field, val) {
    setForm((f) => ({ ...f, [field]: val }));
    setErr("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const endpoint = tab === "login" ? "/auth/login" : "/auth/register";
      const body = tab === "login"
        ? { username: form.username, password: form.password }
        : { username: form.username, email: form.email, password: form.password };

      const res = await api.post(endpoint, body);
      login(res.data.access_token, { username: res.data.username, email: res.data.email }, form.remember);
      navigate(returnTo, { replace: true });
    } catch (e) {
      setErr(e?.response?.data?.detail || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid var(--border-col)",
    background: "var(--bg-card)",
    color: "var(--white)",
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle = { fontSize: 13, color: "var(--text-muted)", marginBottom: 4, display: "block" };

  return (
    <div style={{
      height: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--bg-app)",
    }}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        style={{
          background: "var(--bg-card-solid)",
          border: "1px solid var(--border-col)",
          borderRadius: 20,
          padding: "36px 40px",
          width: 380,
          maxWidth: "90vw",
        }}
      >
        {/* Logo / brand */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 32, marginBottom: 6 }}>✈️</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--white)" }}>Travel Planner</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>Your AI trip assistant</div>
        </div>

        {/* Tab switcher */}
        <div style={{
          display: "flex",
          background: "var(--bg-card)",
          borderRadius: 12,
          padding: 4,
          marginBottom: 24,
          gap: 4,
        }}>
          {["login", "register"].map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setErr(""); }}
              style={{
                flex: 1,
                padding: "8px 0",
                borderRadius: 9,
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 14,
                transition: "all 0.2s",
                background: tab === t ? "var(--cal-accent)" : "transparent",
                color: tab === t ? "#fff" : "var(--text-muted)",
              }}
            >
              {t === "login" ? "Sign In" : "Register"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, x: tab === "login" ? -12 : 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ display: "flex", flexDirection: "column", gap: 16 }}
            >
              <div>
                <label style={labelStyle}>Username</label>
                <input
                  style={inputStyle}
                  value={form.username}
                  onChange={(e) => set("username", e.target.value)}
                  placeholder="your_username"
                  autoComplete="username"
                  required
                />
              </div>

              {tab === "register" && (
                <div>
                  <label style={labelStyle}>Email</label>
                  <input
                    style={inputStyle}
                    type="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="you@email.com"
                    autoComplete="email"
                    required
                  />
                </div>
              )}

              <div>
                <label style={labelStyle}>Password</label>
                <input
                  style={inputStyle}
                  type="password"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  placeholder={tab === "register" ? "At least 6 characters" : "••••••••"}
                  autoComplete={tab === "login" ? "current-password" : "new-password"}
                  required
                />
              </div>
            </motion.div>
          </AnimatePresence>

          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "var(--text-muted)" }}>
            <input
              type="checkbox"
              checked={form.remember}
              onChange={(e) => set("remember", e.target.checked)}
              style={{ accentColor: "var(--cal-accent)", width: 15, height: 15 }}
            />
            Remember me
          </label>

          {err && (
            <div style={{
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.35)",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 13,
              color: "#f87171",
            }}>
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "11px 0",
              borderRadius: 12,
              border: "none",
              background: loading ? "rgba(13,148,136,0.5)" : "var(--cal-accent)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 15,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "opacity 0.2s",
              marginTop: 4,
            }}
          >
            {loading ? "Please wait…" : tab === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
