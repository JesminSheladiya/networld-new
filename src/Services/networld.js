import { http } from "./https";
import { API_BASE as BASE, CONTACTS_URL as API_URL } from "./apiBase";

export const api = {
  connections: (search) =>
    http.get(`${BASE}/user-relations/connections`, {
      params: search && search.trim() ? { query: search.trim() } : {},
    }),
  connectionsPaged: (page, size, search, category, relations, sort) =>
    http.get(`${BASE}/user-relations/connections/paged`, {
      params: {
        page, size,
        ...(search && search.trim() ? { query: search.trim() } : {}),
        ...(category && category !== "all" ? { category } : {}),
        ...(relations && relations.length ? { relations: relations.join(",") } : {}),
        ...(sort ? { sort } : {}),
      },
    }),
  connectionCounts: (search) =>
    http.get(`${BASE}/user-relations/connections/counts`, {
      params: search && search.trim() ? { query: search.trim() } : {},
    }),
  connectionRelations: (search) =>
    http.get(`${BASE}/user-relations/connections/relations`, {
      params: search && search.trim() ? { query: search.trim() } : {},
    }),
  relations: () => http.get(`${API_URL}/relations`),
  // Unfiltered display map (includes hidden engine rows) for chips/labels.
  relationsAll: () => http.get(`${API_URL}/relations/all`),
  searchUsers: (q) => http.get(`${BASE}/user-relations/search-users?query=${encodeURIComponent(q)}`),
  send: (toEmail, relationId) => http.post(`${BASE}/user-relations/send`, { toEmail, relationId }),
  suggestions: () => http.get(`${BASE}/user-relations/suggestions`),
  suggestionsSend: (otherEmail, relationName) =>
    http.post(`${BASE}/user-relations/suggestions/send`, { otherEmail, relationName }),
  dismissSuggestion: (id) => http.delete(`${BASE}/user-relations/suggestions/${id}/dismiss`),
  pending: () => http.get(`${BASE}/user-relations/pending`),
  accept: (id) => http.post(`${BASE}/user-relations/${id}/accept`),
  decline: (id) => http.post(`${BASE}/user-relations/${id}/decline`),
  updateRelation: (relationId, relationName) =>
    http.put(`${BASE}/user-relations/${relationId}/relation`, { relationName }),
};