import closeIcon from "../assets/close-icon.png";
import shrinkIcon from "../assets/shrink-icon.png";
import { useTheme } from "../contexts/ThemeContext";

export default function TitleBar() {
  if (typeof window === "undefined" || !window.electron) return null;

  const { close, minimize } = window.electron;
  const { isDark, toggle } = useTheme();

  const barHeight = 56;

  return (
    <>
      <div style={{ ...styles.bar, height: barHeight }}>
        {/* Theme toggle — top left, no-drag */}
        <button
          type="button"
          style={styles.themeBtn}
          onClick={toggle}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          aria-label="Toggle theme"
        >
          {isDark ? "☀️" : "🌙"}
        </button>

        {/* Drag region fills the middle */}
        <div style={styles.dragRegion} />

        {/* Window controls — top right */}
        <div style={styles.winControls}>
          <button
            type="button"
            style={styles.btn}
            onClick={minimize}
            title="Minimize"
            aria-label="Minimize"
          >
            <img src={shrinkIcon} alt="" style={styles.icon} />
          </button>
          <button
            type="button"
            style={styles.btn}
            onClick={close}
            title="Close"
            aria-label="Close"
          >
            <img src={closeIcon} alt="" style={styles.icon} />
          </button>
        </div>
      </div>
      <div style={{ height: barHeight, flexShrink: 0 }} aria-hidden="true" />
    </>
  );
}

const styles = {
  bar: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "transparent",
    WebkitAppRegion: "drag",
    zIndex: 9999,
  },
  dragRegion: {
    flex: 1,
    alignSelf: "stretch",
    WebkitAppRegion: "drag",
  },
  themeBtn: {
    width: 56,
    height: 56,
    padding: 0,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: "1.8rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    WebkitAppRegion: "no-drag",
    position: "relative",
    zIndex: 1,
    flexShrink: 0,
  },
  winControls: {
    display: "flex",
    alignItems: "stretch",
    WebkitAppRegion: "no-drag",
    position: "relative",
    zIndex: 1,
    flexShrink: 0,
  },
  btn: {
    width: 56,
    height: 56,
    padding: 0,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    width: 28,
    height: 28,
    objectFit: "contain",
  },
};
