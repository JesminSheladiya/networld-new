// ── NetWorld app-wide constants (single source of truth) ────────────────────
// Nothing here is secret: storage keys, timeouts, breakpoints and palettes.
// Secrets (API host) come from REACT_APP_* env vars — see Services/apiBase.js.

// localStorage keys
export const STORAGE_KEYS = Object.freeze({
  TOKEN: "token",
  USER: "user",
  RELATION_FORMAT: "nw-relation-format",
});

// Cross-tab auth broadcast channel
export const AUTH_CHANNEL = "networld-auth";

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

// Contacts pagination
export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = ["10", "20", "50", "100"];

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
