import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { getToken, getUser, logout as authLogout } from '../Services/authService';
import { fetchUser as fetchUserApi } from '../Services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!getToken());
  const [user, setUser] = useState(() => getUser());
  const pollIntervalRef = useRef(null);
  const broadcastChannelRef = useRef(null);

  const login = useCallback(() => {
    setIsAuthenticated(true);
    setUser(getUser());
  }, []);

  const updateUser = useCallback(async () => {
    try {
      const freshUser = await fetchUserApi();
      setUser(freshUser);
      return freshUser;
    } catch (e) {
      setUser(getUser());
    }
  }, []);

  const logout = useCallback(() => {
    authLogout();
    localStorage.removeItem("nw-relation-format");
    setIsAuthenticated(false);
    setUser({});
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.close();
      broadcastChannelRef.current = null;
    }
  }, []);

  // BroadcastChannel for instant cross-tab communication (same browser)
  useEffect(() => {
    if (typeof BroadcastChannel !== 'undefined') {
      broadcastChannelRef.current = new BroadcastChannel('networld-auth');
      broadcastChannelRef.current.onmessage = (event) => {
        if (event.data?.type === 'USER_UPDATED') {
          setUser(event.data.user);
          setIsAuthenticated(true);
        } else if (event.data?.type === 'LOGOUT') {
          setIsAuthenticated(false);
          setUser({});
        }
      };
    }
    return () => {
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
      }
    };
  }, []);

  // Polling for fresh user data (works across all devices/browsers)
  useEffect(() => {
    if (!isAuthenticated) return;

    const poll = async () => {
      try {
        const freshUser = await fetchUserApi();
        setUser(freshUser);
      } catch (e) {
        // Ignore polling errors - token might be expired
        if (e.response?.status === 401 || e.response?.status === 403) {
          setIsAuthenticated(false);
          setUser({});
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
        }
      }
    };

    // Initial fetch
    poll();

    // Poll every 30 seconds
    pollIntervalRef.current = setInterval(poll, 30000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [isAuthenticated]);

  // Sync with localStorage changes from other tabs (fallback)
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === 'user' || event.key === 'token') {
        setIsAuthenticated(!!getToken());
        setUser(getUser());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const broadcastUserUpdate = useCallback((userData) => {
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({ type: 'USER_UPDATED', user: userData });
    }
  }, []);

  const broadcastLogout = useCallback(() => {
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({ type: 'LOGOUT' });
    }
  }, []);

  return (
    <AuthContext.Provider value={{ 
      isAuthenticated, 
      login, 
      logout, 
      user, 
      updateUser,
      broadcastUserUpdate,
      broadcastLogout
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}