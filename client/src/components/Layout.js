import React from 'react';
import { useAuth } from '../context/AuthContext';
import Sidebar from './Sidebar';

export default function Layout({ children }) {
  const { user, agency, logout } = useAuth();

  return (
    <div className="app-layout">
      <header className="app-header" role="banner">
        <div className="app-header-left">
          <img className="app-logo" src="/brand/atlas-icon.png" alt="Atlas" width="32" height="32" />
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
