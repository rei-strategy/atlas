import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { useTimezone } from '../hooks/useTimezone';

const API_BASE = '/api';

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
  const [isEditing, setIsEditing] = useState(false);

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
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
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
      admin: '#dc2626',
      planner: '#2563eb',
      support: '#059669',
      marketing: '#d97706'
    };
    return colors[role] || '#6b7280';
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">My Profile</h1>
        </div>
        <div className="dashboard-card">
          <div className="dashboard-card-body">
            <p className="dashboard-empty-state">Loading profile...</p>
          </div>
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
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="firstName">First Name *</label>
                    <input
                      id="firstName"
                      type="text"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleChange}
                      placeholder="First name"
                      required
                      autoFocus
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="lastName">Last Name *</label>
                    <input
                      id="lastName"
                      type="text"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleChange}
                      placeholder="Last name"
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="email">Email Address *</label>
                  <input
                    id="email"
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="email@example.com"
                    required
                  />
                  <span className="form-hint">This is used for logging in.</span>
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleCancel}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
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
      </div>
    </div>
  );
}
