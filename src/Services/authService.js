import axios from "axios";
import { API_BASE } from "./apiBase";


axios.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const register = async (username, email, phone, password, fullName, gender) => {
  const { data } = await axios.post(`${API_BASE}/auth/register`,
    { username, email, phone, password, fullName, gender }); 
  if (data.token) {
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data));
  }
  return data;
};

export const login = async (identifier, password) => {
  const { data } = await axios.post(`${API_BASE}/auth/login`,
    { identifier, password });
  if (data.token) {
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data));
  }
  return data;
};


export const updateProfile = async (profileData) => {
  const { data } = await axios.put(`${API_BASE}/auth/me`, profileData);
  if (data.token) {
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data));
  }
  return data;
};


export const getUser = () => JSON.parse(localStorage.getItem("user") || "{}");
export const getToken = () => localStorage.getItem("token");
export const logout = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
};

