import axios from "axios";
import { HTTP_TIMEOUT_MS, STORAGE_KEYS } from "../constants";
import { installHttpInterceptors } from "./connectionMonitor";

// Single shared HTTP client: auth header, expiry logout and timeout.
// All Services must use this instead of raw axios.
export const http = axios.create({ timeout: HTTP_TIMEOUT_MS, withCredentials: true });

// Install RTT measurement interceptors so we can estimate downlink
// from actual API response times (works with DevTools throttling,
// unlike navigator.connection.downlink which is unsupported in most browsers).
installHttpInterceptors(http);

http.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    if (status === 429 || status === 423) {
      // Tag it so components can start a countdown timer.
      // Backend sends { message, retryAfterSeconds } + Retry-After header.
      // 429 = per-IP rate limit, 423 = per-account tiered lockout.
      const data = error.response?.data || {};
      const fromBody = Number(data?.retryAfterSeconds);
      const headers = error.response?.headers || {};
      const fromHeader = Number(headers["retry-after"] ?? headers["Retry-After"]);
      const retryAfter =
        Number.isFinite(fromBody) && fromBody > 0
          ? Math.ceil(fromBody)
          : Number.isFinite(fromHeader) && fromHeader > 0
            ? Math.ceil(fromHeader)
            : 60;
      error.rateLimit = {
        retryAfterSeconds: retryAfter,
        message: data?.message || `Too many attempts. Try again in ${retryAfter}s.`,
      };
      return Promise.reject(error);
    }
    if ((status === 401 || status === 403) && localStorage.getItem(STORAGE_KEYS.USER)) {
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER);
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);
