import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:8000",
  timeout: 90000, // AI generation can take a while
});

export default api;
