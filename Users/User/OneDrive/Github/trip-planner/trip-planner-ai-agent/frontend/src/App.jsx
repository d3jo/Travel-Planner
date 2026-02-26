import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { ThemeProvider } from "./contexts/ThemeContext";
import TitleBar from "./components/TitleBar";
import PageTransition from "./components/PageTransition";
import Wizard from "./pages/Wizard";
import TripPlan from "./pages/TripPlan";

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <div style={{ overflow: "hidden", width: "100%" }}>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<PageTransition><Wizard /></PageTransition>} />
          <Route path="/plan" element={<PageTransition><TripPlan /></PageTransition>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <TitleBar />
        <AnimatedRoutes />
      </ThemeProvider>
    </BrowserRouter>
  );
}
