import { http } from "./https";
import { API_BASE as BASE, CONTACTS_URL as API_URL } from "./apiBase";

// Network info is sent with every paged request so the backend can adjust
// page size based on current connection quality.
//
// We estimate downlink from measured API RTT (via axios interceptors in
// https.js) instead of navigator.connection.downlink, because:
//   • navigator.connection is NOT supported in Firefox, Safari, desktop Chrome
//   • DevTools network throttling does NOT change navigator.connection.downlink
//   • RTT IS affected by DevTools throttling — slower network = higher RTT
import { estimateDownlinkMbps, getEffectiveType } from "./connectionMonitor";

const getNetworkParams = () => {
  const downlink = estimateDownlinkMbps();
  const effectiveType = getEffectiveType();
  return {
    downlink: String(downlink),
    effectiveType,
  };
};

export const api = {
  connections: (search) =>
    http.get(`${BASE}/user-relations/connections`, {
      params: search && search.trim() ? { query: search.trim() } : {},
    }),
  connectionsOf: (email, page = 0, size = 50, search, signal) =>
    http.get(`${BASE}/user-relations/connections/of`, {
      params: { email, page, size, ...(search && search.trim() ? { query: search.trim() } : {}) },
      ...(signal ? { signal } : {}),
    }),
  // Full single profile (covers included) for the detail screen — lists
  // never ship covers, so this 1-row fetch fills them on demand.
  profileOf: (email, signal) =>
    http.get(`${BASE}/user-relations/profile`, {
      params: { email },
      ...(signal ? { signal } : {}),
    }),
  // Preview on profile cards needs only the first few rows + total —
  // fetching the whole graph on 4G was the connections lag.
  connectionsPreviewOf: (email, signal) =>
    http.get(`${BASE}/user-relations/connections/of`, {
      params: { email, page: 0, size: 6 },
      ...(signal ? { signal } : {}),
    }),
  // includePhone: desktop (name/username/mobile search) vs mobile
  // (name/username only). undefined → server default (true = desktop).
  // signal: AbortSignal — callers abort stale in-flight requests on fast
  // typing/filter changes so the server stops doing discarded work.
  connectionsPaged: (page, size, search, category, relations, sort, includePhone, signal) =>
    http.get(`${BASE}/user-relations/connections/paged`, {
      params: {
        page, size,
        ...getNetworkParams(),
        ...(search && search.trim() ? { query: search.trim() } : {}),
        ...(category && category !== "all" ? { category } : {}),
        ...(relations && relations.length ? { relations: relations.join(",") } : {}),
        ...(sort ? { sort } : {}),
        ...(includePhone !== undefined ? { includePhone } : {}),
      },
      ...(signal ? { signal } : {}),
    }),
  connectionCounts: (search, includePhone, signal) =>
    http.get(`${BASE}/user-relations/connections/counts`, {
      params: {
        ...getNetworkParams(),
        ...(search && search.trim() ? { query: search.trim() } : {}),
        ...(includePhone !== undefined ? { includePhone } : {}),
      },
      ...(signal ? { signal } : {}),
    }),
  connectionRelations: (search, includePhone, signal) =>
    http.get(`${BASE}/user-relations/connections/relations`, {
      params: {
        ...getNetworkParams(),
        ...(search && search.trim() ? { query: search.trim() } : {}),
        ...(includePhone !== undefined ? { includePhone } : {}),
      },
      ...(signal ? { signal } : {}),
    }),
  relations: () => http.get(`${API_URL}/relations`),
  // Unfiltered display map (includes hidden engine rows) for chips/labels.
  relationsAll: () => http.get(`${API_URL}/relations/all`),
  usedUniqueRelations: () => http.get(`${BASE}/user-relations/used-unique-relations`),
  searchUsers: (q) => http.get(`${BASE}/user-relations/search-users?query=${encodeURIComponent(q)}`),
  send: (toEmail, relationId) => http.post(`${BASE}/user-relations/send`, { toEmail, relationId }),
  // Paged (default 50, max 100 server-side for suggestions/pending/sent;
  // contacts allows up to 1000): unbounded full lists shipped
  // 10k rows into the DOM. signal aborts stale in-flight requests.
  suggestions: (page = 0, size = 50, signal) =>
    http.get(`${BASE}/user-relations/suggestions`, {
      params: { page, size, ...getNetworkParams() },
      ...(signal ? { signal } : {}),
    }),
  // Badge total: does NOT trigger regen (the list endpoint does).
  suggestionsCount: () => http.get(`${BASE}/user-relations/suggestions/count`),
  suggestionsSend: (otherEmail, relationName) =>
    http.post(`${BASE}/user-relations/suggestions/send`, { otherEmail, relationName }),
  dismissSuggestion: (id) => http.delete(`${BASE}/user-relations/suggestions/${id}/dismiss`),
  pending: (page = 0, size = 50, signal) =>
    http.get(`${BASE}/user-relations/pending`, {
      params: { page, size, ...getNetworkParams() },
      ...(signal ? { signal } : {}),
    }),
  pendingCount: () => http.get(`${BASE}/user-relations/pending/count`),
  sent: (page = 0, size = 50, signal) =>
    http.get(`${BASE}/user-relations/sent`, {
      params: { page, size, ...getNetworkParams() },
      ...(signal ? { signal } : {}),
    }),
  sentCount: () => http.get(`${BASE}/user-relations/sent/count`),
  accept: (id) => http.post(`${BASE}/user-relations/${id}/accept`),
  decline: (id) => http.post(`${BASE}/user-relations/${id}/decline`),
  cancel: (id) => http.post(`${BASE}/user-relations/${id}/cancel`),
  updateRelation: (relationId, relationName) =>
    http.put(`${BASE}/user-relations/${relationId}/relation`, { relationName }),
  removeConnection: (relationId) =>
    http.delete(`${BASE}/user-relations/${relationId}/connection`),
};
