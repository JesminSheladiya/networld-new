import { http } from "./https";

const BASE = process.env.REACT_APP_API_URL?.replace("/api/contacts", "/api") || "http://localhost:8080/api";
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080/api/contacts";

export const api = {
  connections: (search) =>
    http.get(`${BASE}/user-relations/connections`, {
      params: search && search.trim() ? { query: search.trim() } : {},
    }),
  connectionsPaged: (page, size, search) =>
    http.get(`${BASE}/user-relations/connections/paged`, {
      params: { page, size, ...(search && search.trim() ? { query: search.trim() } : {}) },
    }),
  relations: () => http.get(`${API_URL}/relations`),
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