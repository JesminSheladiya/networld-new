// Backend host resolver.
//
// The dev server prints "On Your Network" URLs (e.g. http://192.168.1.5:3000)
// so phones can open the site — but REACT_APP_API_URL points at
// "localhost:8080", which on a phone means the phone itself, so every
// API call (login included) fails there.
//
// Fix: whenever the page is opened via a LAN IP, talk to the backend on
// that same host (port stays 8080). Works for any current/future DHCP IP
// with zero .env changes.
const ENV_URL =
  process.env.REACT_APP_API_URL || "http://localhost:8080/api/contacts";

function resolveLanUrl(url) {
  try {
    const parsed = new URL(url);
    const pageHost =
      typeof window !== "undefined" ? window.location.hostname : "";
    const isLocal = (h) => h === "localhost" || h === "127.0.0.1";
    if (isLocal(parsed.hostname) && pageHost && !isLocal(pageHost)) {
      parsed.hostname = pageHost;
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

export const CONTACTS_URL = resolveLanUrl(ENV_URL);
export const API_BASE = CONTACTS_URL.replace(/\/api\/contacts.*/, "/api");
