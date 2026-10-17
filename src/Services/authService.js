import { http } from "./https";
import { STORAGE_KEYS } from "../constants";
import { API_BASE } from "./apiBase";
import { getDeviceName } from "../utils/deviceUtils";

function persistSession(data) {
  if (!data) return;
  // JWT is stored in the server-issued HttpOnly cookie, never in JS-readable
  // localStorage. Keep only the non-sensitive user profile locally.
  localStorage.removeItem(STORAGE_KEYS.TOKEN);
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data));
}

export const register = async (username, email, phone, password, fullName, gender, birthDate, occupation) => {
  const { data } = await http.post(`${API_BASE}/auth/register`,
    { username, email, phone, password, fullName, gender, birthDate, occupation, deviceName: await getDeviceName() });
  persistSession(data);
  return data;
};

export const requestOtp = async (email) => {
  const { data } = await http.post(`${API_BASE}/auth/request-otp`, { email });
  return data;
};

export const verifyOtp = async (email, otp) => {
  const { data } = await http.post(`${API_BASE}/auth/verify-otp`, { email, otp });
  return data;
};

export const resendOtp = async (email) => {
  const { data } = await http.post(`${API_BASE}/auth/resend-otp`, { email });
  return data;
};

export const forgotRequest = async (email) => {
  const { data } = await http.post(`${API_BASE}/auth/forgot-password/request`, { email });
  return data;
};

export const forgotReset = async (email, otp, newPassword) => {
  const { data } = await http.post(`${API_BASE}/auth/forgot-password/reset`, { email, otp, newPassword });
  return data;
};

export const login = async (identifier, password) => {
  const { data } = await http.post(`${API_BASE}/auth/login`,
    { identifier, password, deviceName: await getDeviceName() });
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

export const deleteAccount = async (otp) => {
  const { data } = await http.delete(`${API_BASE}/auth/me`, { data: { otp } });
  return data;
};

export const requestDeleteOtp = async () => {
  const { data } = await http.post(`${API_BASE}/auth/delete-account/request`, {});
  return data;
};

export const getSessions = async () => {
  const { data } = await http.get(`${API_BASE}/auth/sessions`);
  return data;
};

export const revokeSession = async (id) => {
  const { data } = await http.delete(`${API_BASE}/auth/sessions/${id}`);
  return data;
};

export const revokeAllSessions = async () => {
  const { data } = await http.delete(`${API_BASE}/auth/sessions`);
  return data;
};

export const checkUsernameAvailable = async (username) => {
  const { data } = await http.get(`${API_BASE}/auth/username-available`, {
    params: { username },
  });
  return data;
};

export const checkEmailAvailable = async (email) => {
  const { data } = await http.get(`${API_BASE}/auth/email-available`, {
    params: { email },
  });
  return data;
};

export const checkPhoneAvailable = async (phone) => {
  const { data } = await http.get(`${API_BASE}/auth/phone-available`, {
    params: { phone },
  });
  return data;
};

export const suggestUsernames = async (base, limit = 5) => {
  const { data } = await http.get(`${API_BASE}/auth/username-suggestions`, {
    params: { base, limit },
  });
  return data;
};

export const getUsernameChangeInfo = async () => {
  const { data } = await http.get(`${API_BASE}/auth/username-change-info`);
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
export const getToken = () => null;
export const logout = () => {
  try {
    http.post(`${API_BASE}/auth/logout`, {}).catch(() => {});
  } catch { /* ignore — local wipe below always runs */ }
  localStorage.removeItem(STORAGE_KEYS.TOKEN);
  localStorage.removeItem(STORAGE_KEYS.USER);
};
