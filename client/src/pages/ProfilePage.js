import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { useTimezone } from '../hooks/useTimezone';
import LoadingButton from '../components/LoadingButton';
import API_BASE from '../utils/apiBase';

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Notification preference types with labels and descriptions
const NOTIFICATION_TYPES = [
  { key: 'taskAssigned', label: 'Task Assigned', description: 'When a task is assigned to you' },
  { key: 'taskDue', label: 'Task Due Reminders', description: 'Reminders for upcoming task deadlines' },
  { key: 'paymentReminder', label: 'Payment Reminders', description: 'Alerts for upcoming client payment deadlines' },
  { key: 'commissionUpdate', label: 'Commission Updates', description: 'When commission status changes' },
  { key: 'tripStageChange', label: 'Trip Stage Changes', description: 'When a trip moves to a new stage' },
  { key: 'approvalRequired', label: 'Approval Requests', description: 'When an action requires your approval' },
  { key: 'approvalResolved', label: 'Approval Resolved', description: 'When your approval request is resolved' },
  { key: 'documentUploaded', label: 'Document Uploads', description: 'When documents are uploaded to your trips' },
  { key: 'clientMessage', label: 'Client Messages', description: 'When clients send messages or feedback' }
];

export default function ProfilePage() {
  const { user, token } = useAuth();
  const { showToast } = useToast();
  const { formatDate } = useTimezone();

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isEditing, setIsEditing] = useState(false);

  // Validate individual field
  const validateField = (name, value) => {
    switch (name) {
      case 'email':
        if (!value || !value.trim()) {
          return 'Email is required';
        }
        if (!EMAIL_REGEX.test(value.trim())) {
          return 'Please enter a valid email address';
        }
        return '';
      case 'firstName':
        if (!value || !value.trim()) {
          return 'First name is required';
        }
        return '';
      case 'lastName':
        if (!value || !value.trim()) {
          return 'Last name is required';
        }
        return '';
      default:
        return '';
    }
  };

  // Validate all fields
  const validateAllFields = () => {
    const errors = {};
    const fields = ['firstName', 'lastName', 'email'];
    fields.forEach(field => {
      const error = validateField(field, formData[field]);
      if (error) {
        errors[field] = error;
      }
    });
    return errors;
  };

  // Fetch current user profile
  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (res.ok && data.user) {
        setFormData({
          firstName: data.user.firstName || '',
          lastName: data.user.lastName || '',
          email: data.user.email || ''
        });
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
      setError('Failed to load profile information');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');

    // Real-time validation for touched fields
    if (touched[name]) {
      const fieldError = validateField(name, value);
      setFieldErrors(prev => ({ ...prev, [name]: fieldError }));
    }
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    setTouched(prev => ({ ...prev, [name]: true }));

    // Validate on blur
    const fieldError = validateField(name, value);
    setFieldErrors(prev => ({ ...prev, [name]: fieldError }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate all fields on submit
    const errors = validateAllFields();
    setFieldErrors(errors);

    // Mark all fields as touched
    setTouched({
      firstName: true,
      lastName: true,
      email: true
    });

    // If there are any errors, don't submit
    if (Object.keys(errors).length > 0) {
      setError('Please fix the errors below before submitting');
      return;
    }

    setSaving(true);

    try {
      const res = await fetch(`${API_BASE}/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update profile');
      }

      showToast('Profile updated successfully!', 'success');
      setIsEditing(false);
      setFieldErrors({});
      setTouched({});
      // Refresh profile data
      fetchProfile();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset form to original values
    setFormData({
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      email: user?.email || ''
    });
    setIsEditing(false);
    setError('');
    setFieldErrors({});
    setTouched({});
  };

  const getRoleLabel = (role) => {
    const labels = {
      admin: 'Administrator',
      planner: 'Planner / Advisor',
      support: 'Support / Assistant',
      marketing: 'Marketing'
    };
    return labels[role] || role;
  };

  const getRoleColor = (role) => {
    const colors = {
      admin: 'var(--color-primary)',
      planner: 'var(--color-success)',
      support: 'var(--color-muted)',
      marketing: 'var(--color-warning)'
    };
    return colors[role] || 'var(--color-text-secondary)';
  };

  // Notification Preferences Component
  const NotificationPreferencesCard = () => {
    const [preferences, setPreferences] = useState({});
    const [loadingPrefs, setLoadingPrefs] = useState(true);
    const [savingPrefs, setSavingPrefs] = useState(false);

    // Fetch current preferences
    useEffect(() => {
      const fetchPreferences = async () => {
        try {
          const res = await fetch(`${API_BASE}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const data = await res.json();

          if (res.ok && data.user?.notificationPreferences) {
            // Initialize with defaults for any missing keys
            const prefs = { ...data.user.notificationPreferences };
            NOTIFICATION_TYPES.forEach(type => {
              if (prefs[type.key] === undefined) {
                prefs[type.key] = true; // Default to enabled
              }
            });
            setPreferences(prefs);
          } else {
            // Set all to true by default
            const defaultPrefs = {};
            NOTIFICATION_TYPES.forEach(type => {
              defaultPrefs[type.key] = true;
            });
            setPreferences(defaultPrefs);
          }
        } catch (err) {
          console.error('Failed to load notification preferences:', err);
        } finally {
          setLoadingPrefs(false);
        }
      };

      fetchPreferences();
    }, []);

    const handleToggle = (key) => {
      setPreferences(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSave = async () => {
      setSavingPrefs(true);
      try {
        const res = await fetch(`${API_BASE}/auth/notification-preferences`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ preferences })
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Failed to save preferences');
        }

        showToast('Notification preferences saved!', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        setSavingPrefs(false);
      }
    };

    if (loadingPrefs) {
      return (
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h3>Email Notification Preferences</h3>
          </div>
          <div className="dashboard-card-body">
            <p className="dashboard-empty-state">Loading preferences...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="dashboard-card">
        <div className="dashboard-card-header">
          <h3>Email Notification Preferences</h3>
        </div>
        <div className="dashboard-card-body">
          <p className="settings-description" style={{ marginBottom: '16px' }}>
            Choose which types of email notifications you want to receive. These settings affect email delivery only -
            you'll still see in-app notifications regardless of these preferences.
          </p>

          <div className="notification-prefs-list">
            {NOTIFICATION_TYPES.map(type => (
              <div key={type.key} className="notification-pref-item">
                <div className="notification-pref-info">
                  <span className="notification-pref-label">{type.label}</span>
                  <span className="notification-pref-desc">{type.description}</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={preferences[type.key] || false}
                    onChange={() => handleToggle(type.key)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            ))}
          </div>

          <div className="form-actions" style={{ marginTop: '20px' }}>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={savingPrefs}
            >
              {savingPrefs ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">My Profile</h1>
        </div>
        <div className="loading-screen" style={{ minHeight: '200px' }}>
          <div className="loading-spinner" />
          <p>Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">My Profile</h1>
        <p className="page-subtitle">View and manage your account information.</p>
      </div>

      <div className="profile-grid">
        {/* Profile Card */}
        <div className="dashboard-card">
          <div className="dashboard-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Profile Information</h3>
            {!isEditing && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setIsEditing(true)}
              >
                Edit Profile
              </button>
            )}
          </div>
          <div className="dashboard-card-body">
            {error && <div className="form-error">{error}</div>}

            {isEditing ? (
              <form onSubmit={handleSubmit} className="profile-form">
                <fieldset disabled={saving} style={{ border: 'none', padding: 0, margin: 0 }}>
                <div className="form-row">
                  <div className={`form-group ${fieldErrors.firstName && touched.firstName ? 'form-group-error' : ''}`}>
                    <label htmlFor="firstName">First Name *</label>
                    <input
                      id="firstName"
                      type="text"
                      name="firstName"
                      className={fieldErrors.firstName && touched.firstName ? 'form-input-error' : ''}
                      value={formData.firstName}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      placeholder="First name"
                      autoFocus
                      aria-invalid={!!(fieldErrors.firstName && touched.firstName)}
                      aria-describedby={fieldErrors.firstName && touched.firstName ? 'firstName-error' : undefined}
                    />
                    {fieldErrors.firstName && touched.firstName && (
                      <span id="firstName-error" className="form-error-message">{fieldErrors.firstName}</span>
                    )}
                  </div>
                  <div className={`form-group ${fieldErrors.lastName && touched.lastName ? 'form-group-error' : ''}`}>
                    <label htmlFor="lastName">Last Name *</label>
                    <input
                      id="lastName"
                      type="text"
                      name="lastName"
                      className={fieldErrors.lastName && touched.lastName ? 'form-input-error' : ''}
                      value={formData.lastName}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      placeholder="Last name"
                      aria-invalid={!!(fieldErrors.lastName && touched.lastName)}
                      aria-describedby={fieldErrors.lastName && touched.lastName ? 'lastName-error' : undefined}
                    />
                    {fieldErrors.lastName && touched.lastName && (
                      <span id="lastName-error" className="form-error-message">{fieldErrors.lastName}</span>
                    )}
                  </div>
                </div>

                <div className={`form-group ${fieldErrors.email && touched.email ? 'form-group-error' : ''}`}>
                  <label htmlFor="email">Email Address *</label>
                  <input
                    id="email"
                    type="email"
                    name="email"
                    className={fieldErrors.email && touched.email ? 'form-input-error' : ''}
                    value={formData.email}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="email@example.com"
                    aria-invalid={!!(fieldErrors.email && touched.email)}
                    aria-describedby={fieldErrors.email && touched.email ? 'email-error' : undefined}
                  />
                  {fieldErrors.email && touched.email && (
                    <span id="email-error" className="form-error-message">{fieldErrors.email}</span>
                  )}
                  <span className="form-hint">This is used for logging in.</span>
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleCancel}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <LoadingButton
                    type="submit"
                    className="btn btn-primary"
                    loading={saving}
                    loadingText="Saving..."
                  >
                    Save Changes
                  </LoadingButton>
                </div>
                </fieldset>
              </form>
            ) : (
              <div className="profile-view">
                <div className="profile-header">
                  <div className="profile-avatar-large">
                    {formData.firstName?.[0]}{formData.lastName?.[0]}
                  </div>
                  <div className="profile-name-section">
                    <h2>{formData.firstName} {formData.lastName}</h2>
                    <p className="profile-email">{formData.email}</p>
                  </div>
                </div>

                <div className="profile-details">
                  <div className="profile-detail-row">
                    <span className="profile-detail-label">Role</span>
                    <span
                      className="role-badge"
                      style={{
                        backgroundColor: `${getRoleColor(user?.role)}15`,
                        color: getRoleColor(user?.role),
                        border: `1px solid ${getRoleColor(user?.role)}30`
                      }}
                    >
                      {getRoleLabel(user?.role)}
                    </span>
                  </div>
                  <div className="profile-detail-row">
                    <span className="profile-detail-label">Member Since</span>
                    <span className="profile-detail-value">{formatDate(user?.createdAt)}</span>
                  </div>
                  <div className="profile-detail-row">
                    <span className="profile-detail-label">User ID</span>
                    <span className="profile-detail-value">#{user?.id}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Account Status Card */}
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h3>Account Status</h3>
          </div>
          <div className="dashboard-card-body">
            <div className="status-info">
              <div className="status-item">
                <span className="status-icon status-active-icon">✓</span>
                <span>Account Active</span>
              </div>
              <div className="status-item">
                <span className="status-icon">🔐</span>
                <span>Password Set</span>
              </div>
            </div>
            <div className="form-info-box" style={{ marginTop: '16px' }}>
              <span className="info-icon">ℹ️</span>
              <span>Contact an administrator to change your password or role.</span>
            </div>
          </div>
        </div>

        {/* Notification Preferences Card */}
        <NotificationPreferencesCard />
      </div>
    </div>
  );
}
