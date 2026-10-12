// Clean display names for login sessions ("Chrome · Windows").
//
// Prefers the structured User-Agent Client Hints API (Chromium) and falls
// back to UA-regex parsing (Firefox/Safari/older browsers) — same result
// either way, so every device shows a proper name.
function parseUserAgent(ua = "") {
  const s = ua || "";
  const browser =
    /edg\/[\d.]+/i.test(s) ? "Edge" :
    /opr\/|opera/i.test(s) ? "Opera" :
    /chrome\/[\d.]+/i.test(s) && !/edg/i.test(s) ? "Chrome" :
    /firefox\/[\d.]+/i.test(s) ? "Firefox" :
    /safari\/[\d.]+/i.test(s) && !/chrome/i.test(s) ? "Safari" : null;
  const os =
    /android/i.test(s) ? "Android" :
    /iphone|ipad|ipod/i.test(s) ? "iOS" :
    /windows/i.test(s) ? "Windows" :
    /mac os/i.test(s) ? "macOS" :
    /linux/i.test(s) ? "Linux" : null;
  return { browser, os };
}

// Best-effort exact device model ("Vivo V40", "Pixel 8").
//
// Works ONLY on Android Chromium browsers (Chrome/Edge/Opera) via the
// high-entropy Client Hints API. Everywhere else the model is hidden by
// the platform — desktops return "", and iPhones NEVER expose it on the
// web (Apple blocks model detection in every iOS browser). Null = unknown.
async function getDeviceModel() {
  try {
    const data = typeof navigator !== "undefined" ? navigator.userAgentData : null;
    if (!data?.mobile || typeof data.getHighEntropyValues !== "function") return null;
    const hi = await Promise.race([
      data.getHighEntropyValues(["model"]),
      new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
    const model = (hi?.model || "").trim();
    return model || null;
  } catch {
    return null;
  }
}

// Async: exact model on Android, "Browser · OS" everywhere else.
export async function getDeviceName() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const parsed = parseUserAgent(ua);
  try {
    const data = typeof navigator !== "undefined" ? navigator.userAgentData : null;
    if (data) {
      const brands = Array.isArray(data.brands) ? data.brands : [];
      const hit = brands.find((b) => b && /chrome/i.test(b.brand || "") && !/chromium/i.test(b.brand || ""))
        || brands.find((b) => b && !/not/i.test(b.brand || "") && !/chromium/i.test(b.brand || ""));
      const browser = ((hit?.brand || "").replace(/\s+mobile$/i, "").trim() || parsed.browser || null);
      const platform = ((data.platform || "").trim() || parsed.os || null);
      // Prefer the exact hardware model when the platform reveals it.
      const model = await getDeviceModel();
      if (model) {
        return [model, browser].filter(Boolean).join(" · ");
      }
      if (browser || platform) {
        return [browser, platform].filter(Boolean).join(" · ") || "Unknown device";
      }
    }
  } catch {
    // Fall through to UA parsing.
  }
  const { browser, os } = parsed;
  return [browser, os].filter(Boolean).join(" · ") || "Unknown device";
}

export function parseDevice(ua = "") {
  const { browser, os } = parseUserAgent(ua);
  const name = [browser, os].filter(Boolean).join(" · ") || "Unknown device";
  return { name, isMobile: /mobile|android|iphone|ipod/i.test(ua || "") };
}
