import React from 'react';
import { useAuth } from '../context/AuthContext';
import Sidebar from './Sidebar';

export default function Layout({ children }) {
  const { user, agency, logout } = useAuth();

  return (
    <div className="app-layout">
      <header className="app-header" role="banner">
        <div className="app-header-left">
          <div className="app-logo" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="40" height="40" rx="8" fill="var(--color-primary)" />
              <path d="M12 28L20 12L28 28H12Z" fill="white" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
              <circle cx="20" cy="22" r="2" fill="var(--color-primary)" />
            </svg>
          </div>
          <h1 className="app-brand">Atlas</h1>
          {agency && <span className="app-agency-name">{agency.name}</span>}
        </div>
        <div className="app-header-right">
          <span className="app-user-info">
            {user?.firstName} {user?.lastName}
            <span className="app-role-badge">{user?.role}</span>
          </span>
          <button className="btn btn-outline btn-sm" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <div className="app-body">
        <Sidebar />
        <main className="app-main" role="main" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
