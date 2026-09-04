import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { getToken, logout as authLogout } from '../Services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!getToken());

  const login = useCallback(() => setIsAuthenticated(true), []);
  const logout = useCallback(() => {
    authLogout();
    setIsAuthenticated(false);
  }, []);

  // Sync with localStorage changes from other tabs
  useEffect(() => {
    const onStorage = () => setIsAuthenticated(!!getToken());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}