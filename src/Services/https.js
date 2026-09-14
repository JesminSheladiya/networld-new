import axios from "axios";
import { HTTP_TIMEOUT_MS, STORAGE_KEYS } from "../constants";

// Single shared HTTP client: auth header, expiry logout and timeout.
// All Services must use this instead of raw axios.
export const http = axios.create({ timeout: HTTP_TIMEOUT_MS });

http.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
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
    if ((status === 401 || status === 403) && localStorage.getItem(STORAGE_KEYS.TOKEN)) {
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER);
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);
