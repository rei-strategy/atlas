import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

const API_BASE = '/api';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [agency, setAgency] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('atlas_token'));
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  const clearAuth = useCallback((wasExpired = false) => {
    setUser(null);
    setAgency(null);
    setToken(null);
    localStorage.removeItem('atlas_token');
    if (wasExpired) {
      setSessionExpired(true);
    }
  }, []);

  const clearSessionExpiredMessage = useCallback(() => {
    setSessionExpired(false);
  }, []);

  // Handle session expiration - call this when an API returns TOKEN_EXPIRED
  const handleSessionExpired = useCallback(() => {
    clearAuth(true);
  }, [clearAuth]);

  // Verify token on mount
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => {
        if (!res.ok) throw new Error('Invalid token');
        return res.json();
      })
      .then(data => {
        setUser(data.user);
        setAgency(data.agency);
      })
      .catch(() => {
        clearAuth();
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token, clearAuth]);

  const login = async (email, password) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }

    localStorage.setItem('atlas_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const register = async ({ email, password, firstName, lastName, agencyName }) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, firstName, lastName, agencyName })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    localStorage.setItem('atlas_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const logout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (e) {
      // Ignore logout errors
    }
    clearAuth();
  };

  // Helper function to make authenticated API calls with automatic token expiration handling
  const authFetch = useCallback(async (url, options = {}) => {
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    };

    const res = await fetch(url, { ...options, headers });

    // Check for token expiration
    if (res.status === 401) {
      const data = await res.clone().json().catch(() => ({}));
      if (data.code === 'TOKEN_EXPIRED') {
        handleSessionExpired();
        throw new Error('Session expired');
      }
    }

    return res;
  }, [token, handleSessionExpired]);

  const value = {
    user,
    agency,
    token,
    loading,
    isAuthenticated: !!user,
    sessionExpired,
    login,
    register,
    logout,
    handleSessionExpired,
    clearSessionExpiredMessage,
    authFetch
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
