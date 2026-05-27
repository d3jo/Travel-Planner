import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import { GenerationProvider } from "./contexts/GenerationContext";
import TitleBar from "./components/TitleBar";
import PageTransition from "./components/PageTransition";
import Wizard from "./pages/Wizard";
import TripPlan from "./pages/TripPlan";
import Auth from "./pages/Auth";
import MyTrips from "./pages/MyTrips";

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <div style={{ overflow: "visible", width: "100%" }}>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<PageTransition><Wizard /></PageTransition>} />
          <Route path="/plan" element={<PageTransition><TripPlan /></PageTransition>} />
          <Route path="/shared/:token" element={<PageTransition><TripPlan /></PageTransition>} />
          <Route path="/auth" element={<PageTransition><Auth /></PageTransition>} />
          <Route path="/my-trips" element={<PageTransition><MyTrips /></PageTransition>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <GenerationProvider>
            <TitleBar />
            <AnimatedRoutes />
          </GenerationProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
