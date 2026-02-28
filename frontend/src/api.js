import axios from "axios";

const defaultApiBaseUrl = "http://127.0.0.1:8000";
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || defaultApiBaseUrl).replace(/\/$/, "");

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 90000, // AI generation can take a while
});

export default api;
