import React from 'react';
import { useAuth } from '../context/AuthContext';
import GlobalSearch from './GlobalSearch';
import NotificationBell from './NotificationBell';

export default function TopBar({ onMenuToggle }) {
  const { user, agency, logout } = useAuth();

  return (
    <header className="topbar" role="banner">
      <div className="topbar-left">
        <button
          className="topbar-menu-btn"
          onClick={onMenuToggle}
          aria-label="Toggle navigation menu"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 5H17M3 10H17M3 15H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        {agency && <span className="topbar-agency-name">{agency.name}</span>}
      </div>

      <div className="topbar-center">
        <GlobalSearch />
      </div>

      <div className="topbar-right">
        <NotificationBell />
        <span className="topbar-user-info">
          <span className="topbar-user-name">{user?.firstName} {user?.lastName}</span>
          <span className="topbar-role-badge">{user?.role}</span>
        </span>
        <button className="btn btn-outline btn-sm" onClick={logout}>
          Sign out
        </button>
      </div>
    </header>
  );
}
