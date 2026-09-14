import { http } from "./https";
import { STORAGE_KEYS } from "../constants";
import { API_BASE } from "./apiBase";

function persistSession(data) {
  if (!data) return;
  if (data.token) localStorage.setItem(STORAGE_KEYS.TOKEN, data.token);
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data));
}

export const register = async (username, email, phone, password, fullName, gender, birthDate) => {
  const { data } = await http.post(`${API_BASE}/auth/register`,
    { username, email, phone, password, fullName, gender, birthDate });
  persistSession(data);
  return data;
};

export const login = async (identifier, password) => {
  const { data } = await http.post(`${API_BASE}/auth/login`,
    { identifier, password });
  persistSession(data);
  return data;
};


export const updateProfile = async (profileData) => {
  const { data } = await http.put(`${API_BASE}/auth/me`, profileData);
  persistSession(data);
  return data;
};

export const fetchUser = async () => {
  const { data } = await http.get(`${API_BASE}/auth/me`);
  persistSession(data);
  return data;
};


// Corrupt storage must never crash the app — fall back to empty session.
export const getUser = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.USER) || "{}");
  } catch {
    return {};
  }
};
export const getToken = () => localStorage.getItem(STORAGE_KEYS.TOKEN);
export const logout = () => {
  localStorage.removeItem(STORAGE_KEYS.TOKEN);
  localStorage.removeItem(STORAGE_KEYS.USER);
};
