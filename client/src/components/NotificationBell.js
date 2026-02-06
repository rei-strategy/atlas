import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTimezone } from '../hooks/useTimezone';

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [urgentCount, setUrgentCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [snoozeMenuId, setSnoozeMenuId] = useState(null); // ID of notification showing snooze options
  const dropdownRef = useRef(null);
  const { token } = useAuth();
  const navigate = useNavigate();
  const { formatDate } = useTimezone();

  const fetchNotifications = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch('http://localhost:3001/api/notifications', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
        setUrgentCount(data.urgentCount || 0);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  }, [token]);

  // Fetch notifications on mount and every 30 seconds
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkRead = async (id) => {
    try {
      const response = await fetch(`http://localhost:3001/api/notifications/${id}/read`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        setNotifications(prev => prev.map(n =>
          n.id === id ? { ...n, isRead: true } : n
        ));
        setUnreadCount(prev => Math.max(0, prev - 1));
        // Check if it was urgent
        const notif = notifications.find(n => n.id === id);
        if (notif && notif.type === 'urgent' && !notif.isRead) {
          setUrgentCount(prev => Math.max(0, prev - 1));
        }
      }
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/notifications/read-all', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        setUnreadCount(0);
        setUrgentCount(0);
      }
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async (id, e) => {
    e.stopPropagation();
    try {
      const response = await fetch(`http://localhost:3001/api/notifications/${id}/dismiss`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const notif = notifications.find(n => n.id === id);
        setNotifications(prev => prev.filter(n => n.id !== id));
        if (notif && !notif.isRead) {
          setUnreadCount(prev => Math.max(0, prev - 1));
          if (notif.type === 'urgent') {
            setUrgentCount(prev => Math.max(0, prev - 1));
          }
        }
      }
    } catch (err) {
      console.error('Failed to dismiss notification:', err);
    }
  };

  const handleSnoozeClick = (id, e) => {
    e.stopPropagation();
    // Toggle snooze menu for this notification
    setSnoozeMenuId(snoozeMenuId === id ? null : id);
  };

  const handleSnooze = async (id, duration, e) => {
    e.stopPropagation();

    // Calculate snooze until time
    const now = new Date();
    let snoozeUntil;

    switch(duration) {
      case '1h':
        snoozeUntil = new Date(now.getTime() + 60 * 60 * 1000);
        break;
      case '3h':
        snoozeUntil = new Date(now.getTime() + 3 * 60 * 60 * 1000);
        break;
      case '1d':
        snoozeUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        break;
      case 'tomorrow':
        // Tomorrow at 9 AM
        snoozeUntil = new Date(now);
        snoozeUntil.setDate(snoozeUntil.getDate() + 1);
        snoozeUntil.setHours(9, 0, 0, 0);
        break;
      default:
        snoozeUntil = new Date(now.getTime() + 60 * 60 * 1000); // Default 1 hour
    }

    try {
      const response = await fetch(`http://localhost:3001/api/notifications/${id}/snooze`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ snoozeUntil: snoozeUntil.toISOString() })
      });

      if (response.ok) {
        // Remove from visible notifications (it will reappear when snooze expires)
        const notif = notifications.find(n => n.id === id);
        setNotifications(prev => prev.filter(n => n.id !== id));
        if (notif && !notif.isRead) {
          setUnreadCount(prev => Math.max(0, prev - 1));
          if (notif.type === 'urgent') {
            setUrgentCount(prev => Math.max(0, prev - 1));
          }
        }
        setSnoozeMenuId(null);
      }
    } catch (err) {
      console.error('Failed to snooze notification:', err);
    }
  };

  const handleNotificationClick = (notification) => {
    // Mark as read
    if (!notification.isRead) {
      handleMarkRead(notification.id);
    }

    // Navigate to entity if available
    if (notification.entityType && notification.entityId) {
      setIsOpen(false);
      switch (notification.entityType) {
        case 'trip':
          navigate(`/trips/${notification.entityId}`);
          break;
        case 'booking':
          // Booking navigation would need trip context
          navigate('/trips');
          break;
        case 'client':
          navigate(`/clients/${notification.entityId}`);
          break;
        case 'task':
          navigate('/tasks');
          break;
        case 'approval':
          navigate('/settings');
          break;
        default:
          break;
      }
    }
  };

  const formatTimeAgo = useCallback((dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateString);
  }, [formatDate]);

  return (
    <div className="notification-bell" ref={dropdownRef}>
      <button
        className={`notification-bell-btn ${urgentCount > 0 ? 'has-urgent' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M18 8C18 6.4087 17.3679 4.88258 16.2426 3.75736C15.1174 2.63214 13.5913 2 12 2C10.4087 2 8.88258 2.63214 7.75736 3.75736C6.63214 4.88258 6 6.4087 6 8C6 15 3 17 3 17H21C21 17 18 15 18 8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M13.73 21C13.5542 21.3031 13.3019 21.5547 12.9982 21.7295C12.6946 21.9044 12.3504 21.9965 12 21.9965C11.6496 21.9965 11.3054 21.9044 11.0018 21.7295C10.6982 21.5547 10.4458 21.3031 10.27 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {unreadCount > 0 && (
          <span className={`notification-badge ${urgentCount > 0 ? 'urgent' : ''}`}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="notification-dropdown" role="menu" aria-label="Notifications">
          <div className="notification-dropdown-header">
            <h3>Notifications</h3>
            {unreadCount > 0 && (
              <button
                className="btn btn-link btn-sm"
                onClick={handleMarkAllRead}
                disabled={loading}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="notification-empty">
                <p>No notifications</p>
              </div>
            ) : (
              notifications.map(notification => (
                <div
                  key={notification.id}
                  className={`notification-item ${!notification.isRead ? 'unread' : ''} ${notification.type === 'urgent' ? 'urgent' : ''}`}
                  onClick={() => handleNotificationClick(notification)}
                  role="menuitem"
                  tabIndex={0}
                  onKeyPress={(e) => e.key === 'Enter' && handleNotificationClick(notification)}
                >
                  <div className="notification-icon">
                    {notification.type === 'urgent' ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 9V13M12 17H12.01M10.29 3.86L1.82 18A2 2 0 003.54 21H20.46A2 2 0 0022.18 18L13.71 3.86A2 2 0 0010.29 3.86Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                        <path d="M12 16V12M12 8H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    )}
                  </div>
                  <div className="notification-content">
                    <div className="notification-title">{notification.title}</div>
                    {notification.message && (
                      <div className="notification-message">{notification.message}</div>
                    )}
                    <div className="notification-time">{formatTimeAgo(notification.createdAt)}</div>
                  </div>
                  <div className="notification-actions">
                    <button
                      className="notification-snooze"
                      onClick={(e) => handleSnoozeClick(notification.id, e)}
                      aria-label="Snooze notification"
                      title="Snooze"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                        <path d="M12 6V12L16 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    <button
                      className="notification-dismiss"
                      onClick={(e) => handleDismiss(notification.id, e)}
                      aria-label="Dismiss notification"
                      title="Dismiss"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                  {snoozeMenuId === notification.id && (
                    <div className="snooze-menu" onClick={(e) => e.stopPropagation()}>
                      <div className="snooze-menu-title">Snooze for:</div>
                      <button className="snooze-option" onClick={(e) => handleSnooze(notification.id, '1h', e)}>
                        1 hour
                      </button>
                      <button className="snooze-option" onClick={(e) => handleSnooze(notification.id, '3h', e)}>
                        3 hours
                      </button>
                      <button className="snooze-option" onClick={(e) => handleSnooze(notification.id, '1d', e)}>
                        1 day
                      </button>
                      <button className="snooze-option" onClick={(e) => handleSnooze(notification.id, 'tomorrow', e)}>
                        Tomorrow morning
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
