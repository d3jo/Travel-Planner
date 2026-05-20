import { useTheme } from "../contexts/ThemeContext";

export default function ThemeToggle({ position = "fixed" }) {
  const { isDark, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        position,
        top: position === "fixed" ? 14 : undefined,
        right: position === "fixed" ? 16 : undefined,
        zIndex: 9999,
        background: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
        border: isDark ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(0,0,0,0.12)",
        borderRadius: 999,
        padding: "6px 14px",
        cursor: "pointer",
        fontSize: "1.1rem",
        display: "flex",
        alignItems: "center",
        gap: 6,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        color: isDark ? "#fff" : "#334455",
        fontFamily: "inherit",
        fontWeight: 600,
        fontSize: "0.82rem",
        whiteSpace: "nowrap",
        boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
        transition: "background 0.2s, border 0.2s",
      }}
    >
      {isDark ? "☀️" : "🌙"}
      <span>{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}
