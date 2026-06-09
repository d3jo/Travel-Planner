import closeIcon from "../assets/close-icon.png";
import shrinkIcon from "../assets/shrink-icon.png";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "../hooks/useIsMobile";

export default function TitleBar() {
  const { isDark, toggle } = useTheme();
  const { isLoggedIn, user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const hasElectronWindowControls = typeof window !== "undefined" && Boolean(window.electron);

  const handleMinimize = () => { if (hasElectronWindowControls) window.electron.minimize(); };
  const handleClose    = () => { if (hasElectronWindowControls) window.electron.close(); };

  const barHeight = 56;
  const noDrag = { WebkitAppRegion: "no-drag", flexShrink: 0, zIndex: 1 };

  return (
    <>
      <div style={{ ...styles.bar, height: barHeight, WebkitAppRegion: hasElectronWindowControls ? "drag" : "initial" }}>

        {/* Left: theme toggle */}
        <div style={{ ...noDrag, paddingLeft: 12 }}>
          <button
            type="button"
            onClick={toggle}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            style={{
              ...styles.themeBtn,
              padding: isMobile ? "10px 10px" : "10px 14px",
              gap: isMobile ? 4 : 6,
              minHeight: 44,
            }}
          >
            {isDark ? "☀️" : "🌙"}
            {!isMobile && (
              <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>{isDark ? "Light" : "Dark"}</span>
            )}
          </button>
        </div>

        {/* Middle: drag region */}
        <div style={{ flex: 1, alignSelf: "stretch", WebkitAppRegion: hasElectronWindowControls ? "drag" : "initial" }} />

        {/* Right: auth + window controls */}
        <div style={{ ...noDrag, display: "flex", alignItems: "center", gap: 8, paddingRight: 8 }}>
          {isLoggedIn ? (
            <button type="button" onClick={() => navigate("/my-trips")} style={{ ...styles.authBtn, width: 36, height: 36 }} title="My Trips">
              {user?.username?.slice(0, 1).toUpperCase() || "U"}
            </button>
          ) : (
            <button type="button" onClick={() => navigate("/auth")} style={{
              ...styles.authBtnOutline,
              padding: isMobile ? "6px 14px" : "6px 18px",
              fontSize: isMobile ? 13 : 14,
            }}>
              Sign In
            </button>
          )}

          {hasElectronWindowControls ? (
            <div style={{ display: "flex", alignItems: "stretch" }}>
              <button type="button" style={styles.winBtn} onClick={handleMinimize} title="Minimize" aria-label="Minimize">
                <img src={shrinkIcon} alt="" style={styles.icon} />
              </button>
              <button type="button" style={styles.winBtn} onClick={handleClose} title="Close" aria-label="Close">
                <img src={closeIcon} alt="" style={styles.icon} />
              </button>
            </div>
          ) : (
            <div style={{ width: 8 }} />
          )}
        </div>
      </div>
      <div style={{ height: barHeight, flexShrink: 0 }} aria-hidden="true" />
    </>
  );
}

const styles = {
  bar: {
    position: "fixed",
    top: 0, left: 0, right: 0,
    display: "flex",
    alignItems: "center",
    background: "transparent",
    zIndex: 9999,
  },
  themeBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "10px 14px",
    minHeight: 44,
    minWidth: 44,
    borderRadius: 999,
    border: "1px solid var(--border-col)",
    background: "var(--bg-card)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    color: "var(--white)",
    cursor: "pointer",
    fontSize: "1rem",
    fontFamily: '"Pixelify Sans", sans-serif',
    fontWeight: 600,
    whiteSpace: "nowrap",
    boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
    transition: "background 0.2s, border 0.2s",
  },
  authBtn: {
    width: 30, height: 30,
    borderRadius: "50%",
    background: "var(--cal-accent)",
    color: "#fff",
    border: "none",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  authBtnOutline: {
    padding: "6px 18px",
    borderRadius: 999,
    border: "1.5px solid #0d9488",
    background: "#0d9488",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: '"Pixelify Sans", sans-serif',
    letterSpacing: "0.02em",
    boxShadow: "0 2px 10px rgba(13,148,136,0.35)",
    transition: "background 0.2s, box-shadow 0.2s",
  },
  winBtn: {
    width: 44, height: 44,
    padding: 0,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    width: 24, height: 24,
    objectFit: "contain",
  },
};
