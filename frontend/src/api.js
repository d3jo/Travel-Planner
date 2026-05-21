import axios from "axios";

const REQUEST_TIMEOUT_MS = 150000;

function normalizeBaseUrl(url) {
  if (url == null) return "";
  return String(url).trim().replace(/\/$/, "");
}

function isLocalHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function normalizeRequestPath(url) {
  if (typeof url !== "string") return url;
  return url.replace(/^\/+/, "");
}


function resolveApiBaseUrl() {
  const envBaseUrl = import.meta.env.VITE_API_BASE_URL;
  if (envBaseUrl) return normalizeBaseUrl(envBaseUrl);

  if (typeof window === "undefined") return "http://127.0.0.1:8000";

  const { hostname, protocol, origin } = window.location;

  // In hosted environments (non-localhost), backend is often reverse-proxied
  // on the same origin, sometimes under /api.
  if (!isLocalHost(hostname)) {
    return normalizeBaseUrl(origin);
  }

  const scheme = protocol === "https:" ? "https" : "http";
  return `${scheme}://${hostname}:8000`;
}

function getFallbackBaseUrls(primaryBaseUrl) {
  if (typeof window === "undefined") return ["http://127.0.0.1:8000"];

  const { hostname, protocol, origin } = window.location;
  const isHttps = protocol === "https:";

  const candidates = [
    normalizeBaseUrl(primaryBaseUrl),
    normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL),
    normalizeBaseUrl(`${origin}/api`),
    normalizeBaseUrl(origin),
    normalizeBaseUrl(`${isHttps ? "https" : "http"}://${hostname}:8000`),
    normalizeBaseUrl(`http://${hostname}:8000`),
    normalizeBaseUrl("http://localhost:8000"),
    normalizeBaseUrl("http://127.0.0.1:8000"),
  ];

  return [...new Set(candidates.filter(Boolean))];
}

let preferredBaseUrl = resolveApiBaseUrl();

async function requestWithFallback(config) {
  const candidateBases = getFallbackBaseUrls(preferredBaseUrl);
  let lastError;

  for (const baseURL of candidateBases) {
    try {
      const response = await axios.request({
        ...config,
        url: normalizeRequestPath(config.url),
        baseURL,
        timeout: REQUEST_TIMEOUT_MS,
      });
      preferredBaseUrl = baseURL;
      return response;
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
      const isRetryable = error?.code === "ERR_NETWORK" || !error?.response || status === 404;
      if (!isRetryable) throw error;
    }
  }

  throw lastError;
}

const api = {
  request: requestWithFallback,
  get: (url, config) => requestWithFallback({ ...config, method: "get", url }),
  post: (url, data, config) => requestWithFallback({ ...config, method: "post", url, data }),
  put: (url, data, config) => requestWithFallback({ ...config, method: "put", url, data }),
  patch: (url, data, config) => requestWithFallback({ ...config, method: "patch", url, data }),
  delete: (url, config) => requestWithFallback({ ...config, method: "delete", url }),
};

export default api;