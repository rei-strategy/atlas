import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import API_BASE from '../utils/apiBase';

const PortalAuthContext = createContext(null);

export function PortalAuthProvider({ children }) {
  const [customer, setCustomer] = useState(null);
  const [agency, setAgency] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('atlas_portal_token'));
  const [loading, setLoading] = useState(true);

  const clearAuth = useCallback(() => {
    setCustomer(null);
    setAgency(null);
    setToken(null);
    localStorage.removeItem('atlas_portal_token');
  }, []);

  // Verify token on mount
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    fetch(`${API_BASE}/portal/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => {
        if (!res.ok) throw new Error('Invalid token');
        return res.json();
      })
      .then(data => {
        setCustomer(data.customer);
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
    const res = await fetch(`${API_BASE}/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }

    localStorage.setItem('atlas_portal_token', data.token);
    setToken(data.token);
    setCustomer(data.customer);
    return data;
  };

  const logout = async () => {
    clearAuth();
  };

  const value = {
    customer,
    agency,
    token,
    loading,
    isAuthenticated: !!customer,
    login,
    logout
  };

  return <PortalAuthContext.Provider value={value}>{children}</PortalAuthContext.Provider>;
}

export function usePortalAuth() {
  const context = useContext(PortalAuthContext);
  if (!context) {
    throw new Error('usePortalAuth must be used within a PortalAuthProvider');
  }
  return context;
}

export default PortalAuthContext;
