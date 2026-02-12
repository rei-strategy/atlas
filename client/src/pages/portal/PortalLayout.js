import React from 'react';
import { usePortalAuth } from '../../context/PortalAuthContext';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import Icon from '../../components/Icon';

export default function PortalLayout({ children }) {
  const { customer, agency, logout } = usePortalAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/portal/login');
  };

  const navItems = [
    { path: '/portal/dashboard', label: 'My Trips', icon: 'plane' },
  ];

  return (
    <div className="portal-layout">
      <header className="portal-header" role="banner">
        <div className="portal-header-left">
          <Link to="/portal/dashboard" className="portal-brand">
            <img src="/brand/atlas-icon.png" alt="Atlas" width="32" height="32" />
            <span className="portal-brand-name">
              {agency?.name || 'Atlas'} <span className="portal-badge">Portal</span>
            </span>
          </Link>
        </div>

        <nav className="portal-nav" role="navigation" aria-label="Portal navigation">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`portal-nav-link ${location.pathname === item.path ? 'active' : ''}`}
              aria-current={location.pathname === item.path ? 'page' : undefined}
            >
              <span className="portal-nav-icon" aria-hidden="true">
                <Icon name={item.icon} size={14} />
              </span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="portal-header-right">
          <span className="portal-user-name">{customer?.clientName || customer?.email}</span>
          <button onClick={handleLogout} className="portal-logout-btn">
            Sign Out
          </button>
        </div>
      </header>

      <main className="portal-main" role="main" id="portal-main-content">
        {children}
      </main>
    </div>
  );
}
