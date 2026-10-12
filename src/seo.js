// ── NetWorld SEO single source of truth ─────────────────────────────────────
// Static tags live in public/index.html (crawlers without JS).
// This module drives per-route titles/meta at runtime (see components/Seo.jsx).
//
// SITE_URL resolves in this order:
//   1. REACT_APP_SITE_URL build env (e.g. https://networld.com) — set this
//      once the production domain is known and rebuild.
//   2. window.location.origin — correct automatically on any host.
// Canonical + og:url always use the resolved absolute URL.

// eslint-disable-next-line no-undef
const ENV_URL = (typeof process !== "undefined" && process.env?.REACT_APP_SITE_URL) || "";
export const SITE_URL = (
  ENV_URL ||
  (typeof window !== "undefined" ? window.location.origin : "")
).replace(/\/+$/, "");

const BASE_KEYWORDS =
  "networld, family relations, indian relations, relationship manager, contact manager, connections, find people, relation names";

export const DEFAULT_SEO = Object.freeze({
  title: "NetWorld — Manage Family Relations, Connections & Contacts",
  description:
    "NetWorld helps you manage family relations, connections and contacts. Find people, track relationships across English and Indian naming, and stay connected.",
  keywords: BASE_KEYWORDS,
  robots: "index, follow",
});

// Public auth pages — indexable, each with a unique title + description.
export const ROUTE_SEO = Object.freeze({
  "/login": {
    title: "Login | NetWorld — Relations & Connections",
    description:
      "Log in to NetWorld to manage your family relations, connections and contacts, and discover people around you.",
    keywords: `${BASE_KEYWORDS}, login, sign in`,
    robots: "index, follow",
  },
  "/register": {
    title: "Create Account | NetWorld — Relations & Connections",
    description:
      "Create your free NetWorld account with email OTP verification. Manage relations, connections and contacts in one place.",
    keywords: `${BASE_KEYWORDS}, register, sign up, create account`,
    robots: "index, follow",
  },
  "/forgot-password": {
    title: "Reset Password | NetWorld",
    description:
      "Forgot your NetWorld password? Verify your email with a one-time code and set a new password in seconds.",
    keywords: `${BASE_KEYWORDS}, forgot password, reset password`,
    robots: "index, follow",
  },
});

// Everything else (contacts, profile, discover…) requires login —
// crawlers can't reach it, so keep it out of the index.
export const APP_SEO = Object.freeze({
  title: "NetWorld — Relations & Connections",
  description:
    "NetWorld helps you manage family relations, connections and contacts in one place.",
  keywords: BASE_KEYWORDS,
  robots: "noindex, nofollow",
});

export function seoForPath(pathname) {
  return ROUTE_SEO[pathname] || APP_SEO;
}
