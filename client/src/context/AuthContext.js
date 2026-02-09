import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import API_BASE from '../utils/apiBase';

const AuthContext = createContext(null);

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

  // Handle any 401 authentication error - can be called by any component
  const handleAuthError = useCallback((errorCode, errorMessage) => {
    if (errorCode === 'TOKEN_EXPIRED') {
      clearAuth(true); // Session expired - show specific message
    } else {
      // For other 401 errors (invalid token, corrupt token, etc.)
      // Clear auth and redirect - user will see "session expired" or can log in fresh
      clearAuth(true);
    }
  }, [clearAuth]);

  // Helper function to make authenticated API calls with automatic token expiration handling
  const authFetch = useCallback(async (url, options = {}) => {
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    };

    const res = await fetch(url, { ...options, headers });

    // Check for any authentication error (401)
    if (res.status === 401) {
      const data = await res.clone().json().catch(() => ({}));
      handleAuthError(data.code, data.error);
      const errorMsg = data.code === 'TOKEN_EXPIRED'
        ? 'Your session has expired. Please sign in again.'
        : 'Authentication required. Please sign in.';
      throw new Error(errorMsg);
    }

    return res;
  }, [token, handleAuthError]);

  // Refresh agency data (e.g., after updating settings)
  const refreshAgency = useCallback(async () => {
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        throw new Error('Failed to refresh agency data');
      }

      const data = await res.json();
      setAgency(data.agency);
      setUser(data.user);
    } catch (error) {
      console.error('Error refreshing agency:', error);
    }
  }, [token]);

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
    handleAuthError,
    clearSessionExpiredMessage,
    authFetch,
    refreshAgency
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
