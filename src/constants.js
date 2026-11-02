// ── NetWorld app-wide constants (single source of truth) ────────────────────
// Nothing here is secret: storage keys, timeouts, breakpoints and palettes.
// Secrets (API host) come from REACT_APP_* env vars — see Services/apiBase.js.
import { estimateDownlinkMbps } from "./Services/connectionMonitor";

// localStorage keys
export const STORAGE_KEYS = Object.freeze({
  TOKEN: "token",
  USER: "user",
  RELATION_FORMAT: "nw-relation-format",
});

// Cross-tab auth broadcast channel
export const AUTH_CHANNEL = "networld-auth";

// Set in sessionStorage right after a fresh registration — the relation
// language onboarding popup shows ONLY when this flag is present.
// Normal logins never set it, so they never trigger the popup.
export const JUST_REGISTERED_KEY = "nw-just-registered";

// HTTP
export const HTTP_TIMEOUT_MS = 15000;

// Search debounce (list + discover pages)
export const SEARCH_DEBOUNCE_MS = 350;

// Auth user refresh polling
export const USER_POLL_INTERVAL_MS = 30000;

// Responsive breakpoints (JS mirror of the CSS layout)
export const MQ_COMPACT = "(max-width: 1024px)"; // list/tablet layout
export const MQ_NARROW = "(max-width: 399px)"; // category dropdown layout
export const SMALL_SCREEN_PX = 390; // bottom-nav notch sizing

// Contacts pagination.
// Page size options include network-tier sizes (10/20/30/50/100) so the UI
// can offer the exact sizes the backend will allow for each network speed.
export const DEFAULT_PAGE_SIZE = 50;
export const PAGE_SIZE_OPTIONS = ["10", "20", "30", "50", "100", "200", "500", "1000"];
// Page size options for Suggestions/Requests (backend caps at 100)
export const PAGE_SIZE_OPTIONS_LIMITED = ["10", "20", "30", "50", "100"];

// Network-speed-based page size tiers (matches backend NetworkPageSizeUtil).
// Returns the maximum page size the backend will allow for the given downlink (Mbps):
//   < 0.5  -> 10  (2G / very slow)
//   < 1.5  -> 20  (3G)
//   < 5    -> 30  (slow 4G)
//   < 20   -> 50  (fast 4G)
//   >= 20  -> 100 (5G / fast WiFi)
export function getMaxPageSizeForDownlink(downlinkMbps) {
  if (downlinkMbps < 0.5) return 10;
  if (downlinkMbps < 1.5) return 20;
  if (downlinkMbps < 5) return 30;
  if (downlinkMbps < 20) return 50;
  return 100;
}

// Get recommended default page size based on current network conditions.
// Uses navigator.connection.downlink when available (Chromium mobile),
// otherwise falls back to RTT-based estimate from connectionMonitor.
// Returns a size from PAGE_SIZE_OPTIONS that the backend will not clamp down.
export function getNetworkAdjustedDefaultPageSize() {
  const downlink = estimateDownlinkMbps();
  const maxAllowed = getMaxPageSizeForDownlink(downlink);
  const options = PAGE_SIZE_OPTIONS.map(Number).sort((a, b) => a - b);
  for (let i = options.length - 1; i >= 0; i--) {
    if (options[i] <= maxAllowed) return options[i];
  }
  // No option fits under maxAllowed — return smallest option. Backend will
  // clamp down to the network-appropriate size (10, 20, or 30).
  return options[0];
}

export function pageSizeOptionsForTotal(total, options = PAGE_SIZE_OPTIONS) {
  const count = Number(total) || 0;
  const firstLargerOrEqual = options.find((size) => Number(size) >= count);
  return options.filter(
    (size) => Number(size) <= count || size === firstLargerOrEqual
  );
}
export const PAGE_SIZE_STORAGE_KEY = "nw-page-size-preferences";

// Keep the user's table size across reloads, separately for each account on
// shared/browser machines. Invalid or unavailable storage falls back safely.
// Saved preference is treated as a cap — never exceeded by the network-aware
// default, so slow networks always get fewer rows.
export function getPageSizePreference(accountKey = "anonymous") {
  try {
    const saved = JSON.parse(localStorage.getItem(PAGE_SIZE_STORAGE_KEY) || "{}");
    const value = Number(saved[accountKey]);
    const networkSize = getNetworkAdjustedDefaultPageSize();
    if (PAGE_SIZE_OPTIONS.includes(String(value))) {
      // User has a saved preference — respect it as a cap, but never exceed
      // what the current network can handle.
      return Math.min(value, networkSize);
    }
    // No saved preference — use network-adjusted default.
    return networkSize;
  } catch {
    return getNetworkAdjustedDefaultPageSize();
  }
}

export function setPageSizePreference(accountKey = "anonymous", value) {
  const size = Number(value);
  if (!PAGE_SIZE_OPTIONS.includes(String(size))) return;
  try {
    const saved = JSON.parse(localStorage.getItem(PAGE_SIZE_STORAGE_KEY) || "{}");
    localStorage.setItem(PAGE_SIZE_STORAGE_KEY, JSON.stringify({ ...saved, [accountKey]: size }));
  } catch { /* storage unavailable — current page still works */ }
}

// Profile bio (matches backend 200-char limit)
export const BIO_MAX_LENGTH = 200;

// Avatar fallback palette (initials background)
export const AVATAR_COLORS = Object.freeze([
  "#3b82f6",
  "#38bdf8",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
]);

// Deterministic palette pick from a display name
export function avatarColorFor(name = "", palette = AVATAR_COLORS) {
  const code = name ? name.charCodeAt(0) : 0;
  return palette[code % palette.length];
}

// Compact count formatting for tabs/chips/badges — raw 5-6 digit numbers
// break pill layouts, so 10000 renders as "10k+" (exact value stays in title).
export function formatCount(n) {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  if (v < 1000000) {
    const k = v / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1).replace(/\.0$/, "")}k+`;
  }
  const m = v / 1000000;
  return `${Number.isInteger(m) ? m : m.toFixed(1).replace(/\.0$/, "")}M+`;
}
