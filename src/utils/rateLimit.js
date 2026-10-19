// Shared 429 (rate-limit) + 423 (account lockout) helpers — backend sends:
// { message, error, retryAfterSeconds } + `Retry-After` header (seconds).
export function getRateLimitInfo(error) {
  const status = error?.response?.status;
  if (status !== 429 && status !== 423) return { limited: false, retryAfter: 0 };
  const data = error?.response?.data || {};
  const fromBody = Number(data?.retryAfterSeconds);
  const fromHeader =
    Number(error?.response?.headers?.["retry-after"]) ||
    Number(error?.response?.headers?.["Retry-After"]);
  const retryAfter = Number.isFinite(fromBody) && fromBody > 0
    ? Math.ceil(fromBody)
    : Number.isFinite(fromHeader) && fromHeader > 0
      ? Math.ceil(fromHeader)
      : 60;
  const message =
    data?.message ||
    `Too many attempts. Please try again in ${retryAfter} seconds.`;
  return { limited: true, retryAfter, message };
}

export function formatCountdown(seconds) {
  const s = Math.max(0, Math.ceil(Number(seconds) || 0));
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  if (s >= 60) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r === 0 ? `${m}m` : `${m}m ${r}s`;
  }
  return `${s}s`;
}

export function formatCountdownLong(seconds) {
  const s = Math.max(0, Math.ceil(Number(seconds) || 0));
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h} hour${h === 1 ? "" : "s"}${m ? ` ${m} minute${m === 1 ? "" : "s"}` : ""}`;
  }
  if (s >= 60) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m} minute${m === 1 ? "" : "s"}${r ? ` ${r} second${r === 1 ? "" : "s"}` : ""}`;
  }
  return `${s} second${s === 1 ? "" : "s"}`;
}
