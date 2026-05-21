import closeIcon from "../assets/close-icon.png";
import shrinkIcon from "../assets/shrink-icon.png";
import { useTheme } from "../contexts/ThemeContext";

export default function TitleBar() {
  const { isDark, toggle } = useTheme();
  const hasElectronWindowControls = typeof window !== "undefined" && Boolean(window.electron);

  const handleMinimize = () => {
    if (!hasElectronWindowControls) return;
    window.electron.minimize();
  };

  const handleClose = () => {
    if (!hasElectronWindowControls) return;
    window.electron.close();
  };

  const barHeight = 56;

  return (
    <>
      <div
        style={{
          ...styles.bar,
          height: barHeight,
          WebkitAppRegion: hasElectronWindowControls ? "drag" : "initial",
        }}
      >
        <div
          style={{
            ...styles.dragRegion,
            WebkitAppRegion: hasElectronWindowControls ? "drag" : "initial",
          }}
        />

        {hasElectronWindowControls ? (
          <div style={styles.winControls}>
            <button
              type="button"
              style={styles.btn}
              onClick={handleMinimize}
              title="Minimize"
              aria-label="Minimize"
            >
              <img src={shrinkIcon} alt="" style={styles.icon} />
            </button>
            <button
              type="button"
              style={styles.btn}
              onClick={handleClose}
              title="Close"
              aria-label="Close"
            >
              <img src={closeIcon} alt="" style={styles.icon} />
            </button>
          </div>
        ) : (
          <div style={styles.rightSpacer} aria-hidden="true" />
        )}
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
    zIndex: 9999,
  },
  dragRegion: {
    flex: 1,
    alignSelf: "stretch",
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
  rightSpacer: {
    width: 56,
    height: 56,
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
