// Convert base64 string to data URL if needed
export function toDataUrl(base64, fallback = null) {
  if (!base64) return fallback;
  // Already a data URL or URL
  if (base64.startsWith('data:') || base64.startsWith('http')) return base64;
  // Assume JPEG if no format detectable
  return `data:image/jpeg;base64,${base64}`;
}

export function toCoverDataUrl(base64, fallback = null) {
  return toDataUrl(base64, fallback);
}