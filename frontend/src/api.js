import axios from "axios";

function resolveApiBaseUrl() {
  const envBaseUrl = import.meta.env.VITE_API_BASE_URL;
  if (envBaseUrl) return envBaseUrl.replace(/\/$/, "");

  if (typeof window === "undefined") return "http://127.0.0.1:8000";

  if (window.location.protocol === "file:") {
    // Electron production/file:// app
    return "http://127.0.0.1:8000";
  }

  const host = window.location.hostname || "127.0.0.1";
  return `http://${host}:8000`;
}

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 90000, // AI generation can take a while
});

export default api;
