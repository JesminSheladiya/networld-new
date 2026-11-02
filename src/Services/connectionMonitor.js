// Connection quality monitor — measures actual network downlink speed.
//
// Page size is driven by downlink (Mbps), NOT by network type labels
// ("4g"/"5g" can be misleading: 4G can be fast, WiFi can be congested).
//
// Strategy:
//   • Prefer navigator.connection.downlink when available (Chromium mobile) —
//     this is the browser's own radio-based downlink estimate, in Mbps.
//   • Fall back to RTT-based estimation for Firefox, Safari, desktop Chrome.
//   • RTT IS affected by DevTools throttling — good for testing slow networks.
//   • navigator.connection is NOT affected by DevTools throttling.
//
// Page size tiers (downlink in Mbps) match backend NetworkPageSizeUtil:
//   < 0.5  -> 10 rows  (2G / very slow)
//   < 1.5  -> 20 rows  (3G)
//   < 5    -> 30 rows  (slow 4G)
//   < 20   -> 50 rows  (fast 4G)
//   >= 20  -> 100 rows (5G / fast WiFi)

const samples = [];
const MAX_SAMPLES = 10;

let lastRttMs = 0;

function recordRtt(rttMs) {
  lastRttMs = rttMs;
  samples.push(rttMs);
  if (samples.length > MAX_SAMPLES) samples.shift();
}

function getAvgRttMs() {
  if (samples.length === 0) return 0;
  return samples.reduce((a, b) => a + b, 0) / samples.length;
}

// Native browser downlink (Chromium mobile / Edge only).
// Returns null when not supported or unavailable.
function getNativeDownlinkMbps() {
  if (
    typeof navigator !== "undefined" &&
    navigator.connection &&
    typeof navigator.connection.downlink === "number" &&
    Number.isFinite(navigator.connection.downlink) &&
    navigator.connection.downlink > 0
  ) {
    return navigator.connection.downlink;
  }
  return null;
}

// RTT-based downlink estimation (fallback when native API unavailable).
// Radio RTT ranges (approx): 5G ~10-30ms, 4G ~30-100ms, 3G ~100-300ms,
// 2G ~300-1000ms. Server processing typically adds 50-150ms on top.
function estimateDownlinkMbpsFromRtt() {
  const rtt = getAvgRttMs();
  if (rtt === 0) {
    // No RTT measurements yet — conservative 3G-ish fallback so first
    // paint on slow networks doesn't request an oversized page.
    return 1.5;
  }
  if (rtt < 80) return 30;    // Very fast: 5G / WiFi (radio RTT ~10-30ms + server)
  if (rtt < 180) return 15;   // Fast: 4G / good WiFi (radio RTT ~30-100ms + server)
  if (rtt < 400) return 4;    // Slow 4G (radio RTT ~100-250ms + server)
  if (rtt < 1000) return 1;   // 3G (radio RTT ~250-850ms + server)
  return 0.3;                 // 2G / very slow
}

// Primary downlink estimate in Mbps. Prefers native API, falls back to RTT.
export function estimateDownlinkMbps() {
  const native = getNativeDownlinkMbps();
  if (native !== null) return native;
  return estimateDownlinkMbpsFromRtt();
}

// Network type label derived from downlink speed (for API compatibility only).
// Page sizing uses downlink, not this label.
export function getEffectiveType() {
  const downlink = estimateDownlinkMbps();
  if (downlink < 0.5) return "slow-2g";
  if (downlink < 1.5) return "2g";
  if (downlink < 5) return "3g";
  if (downlink < 20) return "4g";
  return "5g";
}

// Recommended maximum page size based on downlink speed (Mbps).
// Matches backend NetworkPageSizeUtil exactly.
export function getRecommendedPageSize(downlinkMbps = null) {
  const speed = downlinkMbps !== null ? downlinkMbps : estimateDownlinkMbps();
  if (speed < 0.5) return 10;
  if (speed < 1.5) return 20;
  if (speed < 5) return 30;
  if (speed < 20) return 50;
  return 100;
}

// Axios request/response interceptors to measure RTT on every API call.
// RTT reflects actual network conditions including server processing time.
export function installHttpInterceptors(http) {
  let requestId = 0;
  const pending = new Map(); // requestId → startTime

  http.interceptors.request.use(
    (config) => {
      const id = ++requestId;
      config.__rttId = id;
      pending.set(id, performance.now());
      return config;
    },
    (error) => Promise.reject(error)
  );

  http.interceptors.response.use(
    (response) => {
      const id = response.config?.__rttId;
      if (id && pending.has(id)) {
        const start = pending.get(id);
        pending.delete(id);
        recordRtt(performance.now() - start);
      }
      return response;
    },
    (error) => {
      const id = error.config?.__rttId;
      if (id && pending.has(id)) {
        const start = pending.get(id);
        pending.delete(id);
        recordRtt(performance.now() - start);
      }
      return Promise.reject(error);
    }
  );
}

export { recordRtt, getAvgRttMs };