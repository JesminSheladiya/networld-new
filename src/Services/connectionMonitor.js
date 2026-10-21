// Connection quality monitor: measures API round-trip time (RTT) and
// estimates downlink speed from it.
//
// Why RTT instead of navigator.connection.downlink:
//   • navigator.connection is NOT supported in Firefox, Safari, or desktop Chrome
//   • DevTools network throttling does NOT change navigator.connection.downlink
//   • RTT IS affected by DevTools throttling — slower network = slower responses = higher RTT
//
// We estimate downlink from RTT using rough thresholds. This is good enough
// for page-size decisions (20/30/50/100 per page).

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

// Estimate downlink (Mbps) from average RTT.
// Very rough mapping — only used for page-size bucketing.
function estimateDownlinkMbps() {
  const rtt = getAvgRttMs();
  if (rtt === 0) return 10; // No measurements yet — assume fast
  if (rtt < 100) return 10;   // Fast: 5G / WiFi
  if (rtt < 300) return 5;    // 4G
  if (rtt < 700) return 1.5;  // 3G
  if (rtt < 2000) return 0.5; // Slow 3G / 2G
  return 0.2;                 // Very slow
}

function getEffectiveType() {
  const downlink = estimateDownlinkMbps();
  if (downlink < 0.5) return "slow-2g";
  if (downlink < 1.5) return "2g";
  if (downlink < 5) return "3g";
  return "4g";
}

// Axios request/response interceptors to measure RTT on every call.
// We measure around each request so RTT reflects actual network conditions.
function installHttpInterceptors(http) {
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

export { recordRtt, getAvgRttMs, estimateDownlinkMbps, getEffectiveType, installHttpInterceptors };
