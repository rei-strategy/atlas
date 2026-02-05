import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
        <rect x="2" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="11" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="2" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="11" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
    roles: ['admin', 'planner_advisor', 'support_assistant', 'marketing']
  },
  {
    path: '/clients',
    label: 'Clients',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
        <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M3 17.5C3 14.4624 5.46243 12 8.5 12H11.5C14.5376 12 17 14.4624 17 17.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    roles: ['admin', 'planner_advisor', 'support_assistant', 'marketing']
  },
  {
    path: '/trips',
    label: 'Trips',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
        <path d="M10 2L13 8H17L14 12L15 18L10 15L5 18L6 12L3 8H7L10 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
    roles: ['admin', 'planner_advisor', 'support_assistant']
  },
  {
    path: '/tasks',
    label: 'Tasks',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
        <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M7 10L9 12L13 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    roles: ['admin', 'planner_advisor', 'support_assistant']
  },
  {
    path: '/commissions',
    label: 'Commissions',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
        <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M10 6V14M7.5 8.5H11.5C12.3284 8.5 13 9.17157 13 10C13 10.8284 12.3284 11.5 11.5 11.5H7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    roles: ['admin', 'planner_advisor']
  },
  {
    path: '/reports',
    label: 'Reports',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
        <path d="M3 17V7L7 3H15C16.1046 3 17 3.89543 17 5V17H3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M7 3V7H3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M7 12H13M7 15H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    roles: ['admin', 'planner_advisor']
  },
  {
    path: '/email-templates',
    label: 'Email Templates',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
        <rect x="2" y="4" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M2 6L10 11L18 6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
    roles: ['admin', 'planner_advisor']
  },
  {
    path: '/settings',
    label: 'Settings',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
        <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M10 2V4M10 16V18M18 10H16M4 10H2M15.66 4.34L14.24 5.76M5.76 14.24L4.34 15.66M15.66 15.66L14.24 14.24M5.76 5.76L4.34 4.34" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    roles: ['admin']
  }
];

function Sidebar({ isOpen, onClose }) {
  const { user } = useAuth();
  const location = useLocation();
  const userRole = user?.role || 'planner_advisor';

  const filteredItems = navItems.filter(item =>
    item.roles.includes(userRole)
  );

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div className="sidebar-overlay" onClick={onClose} aria-hidden="true" />
      )}

      <aside
        className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}
        aria-label="Main navigation sidebar"
      >
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <svg width="28" height="28" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
              <rect width="40" height="40" rx="8" fill="var(--color-primary)" />
              <path d="M12 28L20 12L28 28H12Z" fill="white" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
              <circle cx="20" cy="22" r="2" fill="var(--color-primary)" />
            </svg>
            <span className="sidebar-brand-text">Atlas</span>
          </div>
          <button className="sidebar-close-btn" onClick={onClose} aria-label="Close navigation">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
              <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <nav className="sidebar-nav" role="navigation" aria-label="Main menu">
          <ul className="sidebar-nav-list" role="list">
            {filteredItems.map(item => {
              const isActive = location.pathname === item.path ||
                (item.path !== '/dashboard' && location.pathname.startsWith(item.path + '/'));
              return (
                <li key={item.path} role="listitem">
                  <NavLink
                    to={item.path}
                    className={({ isActive: routerActive }) =>
                      `sidebar-nav-link ${routerActive || isActive ? 'sidebar-nav-link-active' : ''}`
                    }
                    aria-current={isActive || location.pathname === item.path ? 'page' : undefined}
                    onClick={() => {
                      // Close sidebar on mobile when navigating
                      if (window.innerWidth < 1024) {
                        onClose();
                      }
                    }}
                  >
                    <span className="sidebar-nav-icon" aria-hidden="true">{item.icon}</span>
                    <span className="sidebar-nav-label">{item.label}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user-badge">
            <span className="sidebar-user-role">{userRole.replace('_', ' ')}</span>
          </div>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
export { navItems };
