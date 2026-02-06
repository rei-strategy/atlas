import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

const API_BASE = '/api';

// Common timezones for travel industry
const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Dubai',
  'Australia/Sydney',
  'Pacific/Auckland'
];

// Predefined brand colors
const BRAND_COLORS = [
  '#1a56db', // Atlas Blue (default)
  '#2563eb', // Blue
  '#3b82f6', // Light Blue
  '#8b5cf6', // Purple
  '#a855f7', // Violet
  '#ec4899', // Pink
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#0891b2', // Dark Cyan
  '#6366f1', // Indigo
  '#64748b', // Slate
  '#374151', // Gray
];

function AgencySettingsForm({ token, isAdmin }) {
  const { showToast } = useToast();
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    logoUrl: '',
    primaryColor: '#1a56db',
    emailSignature: '',
    defaultCommissionRate: '',
    timezone: 'America/New_York'
  });
  const [error, setError] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [customColor, setCustomColor] = useState('');

  // Fetch current agency settings
  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/settings/agency`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.agency) {
        setFormData({
          name: data.agency.name || '',
          logoUrl: data.agency.logoUrl || '',
          primaryColor: data.agency.primaryColor || '#1a56db',
          emailSignature: data.agency.emailSignature || '',
          defaultCommissionRate: data.agency.defaultCommissionRate !== null ? String(data.agency.defaultCommissionRate) : '',
          timezone: data.agency.timezone || 'America/New_York'
        });
      }
    } catch (err) {
      console.error('Failed to load agency settings:', err);
      setError('Failed to load agency settings');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleColorSelect = (color) => {
    setFormData(prev => ({ ...prev, primaryColor: color }));
    setShowColorPicker(false);
  };

  const handleCustomColorSubmit = () => {
    if (/^#[0-9A-Fa-f]{6}$/.test(customColor)) {
      setFormData(prev => ({ ...prev, primaryColor: customColor }));
      setShowColorPicker(false);
      setCustomColor('');
    }
  };

  const handleLogoFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (PNG, JPG, GIF, etc.)');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError('Logo file must be less than 2MB');
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onload = (event) => {
      setFormData(prev => ({ ...prev, logoUrl: event.target.result }));
      setError('');
    };
    reader.onerror = () => {
      setError('Failed to read image file');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = async () => {
    if (!isAdmin) return;

    try {
      const res = await fetch(`${API_BASE}/settings/agency/logo`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        setFormData(prev => ({ ...prev, logoUrl: '' }));
        showToast('Logo removed successfully', 'success');
      }
    } catch (err) {
      setError('Failed to remove logo');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isAdmin) {
      setError('Only administrators can update agency settings');
      return;
    }

    setError('');
    setSaving(true);

    try {
      const res = await fetch(`${API_BASE}/settings/agency`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: formData.name,
          logoUrl: formData.logoUrl || null,
          primaryColor: formData.primaryColor,
          emailSignature: formData.emailSignature || null,
          defaultCommissionRate: formData.defaultCommissionRate ? parseFloat(formData.defaultCommissionRate) : null,
          timezone: formData.timezone
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save settings');
      }

      showToast('Agency settings saved successfully!', 'success');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="dashboard-card">
        <div className="dashboard-card-body">
          <p className="dashboard-empty-state">Loading agency settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-card">
      <div className="dashboard-card-header">
        <h3>Agency Branding</h3>
      </div>
      <div className="dashboard-card-body">
        {error && <div className="form-error">{error}</div>}

        <form onSubmit={handleSubmit} className="agency-settings-form">
          {/* Agency Name */}
          <div className="form-group">
            <label htmlFor="agency-name">Agency Name *</label>
            <input
              id="agency-name"
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Your Agency Name"
              required
              disabled={!isAdmin}
            />
            <span className="form-hint">This name appears in all client-facing communications.</span>
          </div>

          {/* Logo Upload */}
          <div className="form-group">
            <label>Agency Logo</label>
            <div className="logo-upload-section">
              {formData.logoUrl ? (
                <div className="logo-preview-container">
                  <img
                    src={formData.logoUrl}
                    alt="Agency logo preview"
                    className="logo-preview"
                  />
                  {isAdmin && (
                    <div className="logo-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={handleRemoveLogo}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className="logo-upload-placeholder"
                  onClick={() => isAdmin && fileInputRef.current?.click()}
                  role="button"
                  tabIndex={isAdmin ? 0 : -1}
                  onKeyDown={(e) => {
                    if (isAdmin && (e.key === 'Enter' || e.key === ' ')) {
                      fileInputRef.current?.click();
                    }
                  }}
                >
                  <div className="upload-icon">📷</div>
                  <span>{isAdmin ? 'Click to upload logo' : 'No logo uploaded'}</span>
                  <span className="upload-hint">PNG, JPG, GIF up to 2MB</span>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoFileChange}
                style={{ display: 'none' }}
                disabled={!isAdmin}
              />
            </div>
            <div className="form-group" style={{ marginTop: '12px' }}>
              <label htmlFor="logo-url">Or enter logo URL</label>
              <input
                id="logo-url"
                type="url"
                name="logoUrl"
                value={formData.logoUrl.startsWith('data:') ? '' : formData.logoUrl}
                onChange={handleChange}
                placeholder="https://example.com/logo.png"
                disabled={!isAdmin || formData.logoUrl.startsWith('data:')}
              />
            </div>
          </div>

          {/* Primary Brand Color */}
          <div className="form-group">
            <label>Primary Brand Color</label>
            <div className="color-picker-section">
              <div
                className="color-preview-box"
                style={{ backgroundColor: formData.primaryColor }}
                onClick={() => isAdmin && setShowColorPicker(!showColorPicker)}
                role="button"
                tabIndex={isAdmin ? 0 : -1}
                aria-label={`Current color: ${formData.primaryColor}`}
              >
                <span className="color-hex">{formData.primaryColor}</span>
              </div>

              {showColorPicker && isAdmin && (
                <div className="color-picker-dropdown">
                  <div className="color-grid">
                    {BRAND_COLORS.map(color => (
                      <button
                        key={color}
                        type="button"
                        className={`color-swatch ${formData.primaryColor === color ? 'selected' : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => handleColorSelect(color)}
                        aria-label={`Select color ${color}`}
                      />
                    ))}
                  </div>
                  <div className="custom-color-input">
                    <input
                      type="text"
                      placeholder="#000000"
                      value={customColor}
                      onChange={(e) => setCustomColor(e.target.value)}
                      pattern="^#[0-9A-Fa-f]{6}$"
                    />
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={handleCustomColorSubmit}
                      disabled={!/^#[0-9A-Fa-f]{6}$/.test(customColor)}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </div>
            <span className="form-hint">Used in client portal, email headers, and documents.</span>
          </div>

          {/* Email Signature */}
          <div className="form-group">
            <label htmlFor="email-signature">Default Email Signature</label>
            <textarea
              id="email-signature"
              name="emailSignature"
              value={formData.emailSignature}
              onChange={handleChange}
              placeholder="Best regards,&#10;Your Agency Name&#10;Phone: (555) 123-4567&#10;www.youragency.com"
              rows={5}
              disabled={!isAdmin}
            />
            <span className="form-hint">This signature will be appended to outgoing emails.</span>
          </div>

          {/* Default Commission Rate */}
          <div className="form-group">
            <label htmlFor="commission-rate">Default Commission Rate (%)</label>
            <input
              id="commission-rate"
              type="number"
              name="defaultCommissionRate"
              value={formData.defaultCommissionRate}
              onChange={handleChange}
              placeholder="10"
              min="0"
              max="100"
              step="0.1"
              disabled={!isAdmin}
            />
            <span className="form-hint">Applied to new bookings by default. Can be overridden per booking.</span>
          </div>

          {/* Timezone */}
          <div className="form-group">
            <label htmlFor="timezone">Timezone</label>
            <select
              id="timezone"
              name="timezone"
              value={formData.timezone}
              onChange={handleChange}
              disabled={!isAdmin}
            >
              {TIMEZONES.map(tz => (
                <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <span className="form-hint">Used for scheduling tasks and displaying dates.</span>
          </div>

          {/* Save Button */}
          {isAdmin && (
            <div className="form-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          )}

          {!isAdmin && (
            <div className="form-info-box">
              <span className="info-icon">ℹ️</span>
              <span>Only administrators can modify agency settings.</span>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

function InviteUserModal({ isOpen, onClose, onSuccess, token }) {
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    role: 'planner',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/users/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to invite user');
      }

      setResult(data);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({ email: '', firstName: '', lastName: '', role: 'planner', password: '' });
    setError('');
    setResult(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{result ? 'User Invited!' : 'Invite Team Member'}</h2>
          <button className="modal-close" onClick={handleClose} aria-label="Close modal">&times;</button>
        </div>

        {result ? (
          <div className="modal-body">
            <div className="invite-success">
              <div className="invite-success-icon">✓</div>
              <p><strong>{result.user.firstName} {result.user.lastName}</strong> has been invited as a <strong>{result.user.role}</strong>.</p>
              <div className="invite-credentials">
                <p className="invite-credentials-label">Login Credentials:</p>
                <p><strong>Email:</strong> {result.user.email}</p>
                <p><strong>Password:</strong> {result.temporaryPassword}</p>
              </div>
              <p className="invite-note">Share these credentials securely with the new team member.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={handleClose}>Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {error && <div className="form-error">{error}</div>}
              <div className="form-group">
                <label htmlFor="invite-email">Email *</label>
                <input
                  id="invite-email"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="team@example.com"
                  required
                  autoFocus
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="invite-firstName">First Name *</label>
                  <input
                    id="invite-firstName"
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    placeholder="First name"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="invite-lastName">Last Name *</label>
                  <input
                    id="invite-lastName"
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
                <label htmlFor="invite-role">Role *</label>
                <select
                  id="invite-role"
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  required
                >
                  <option value="planner">Planner / Advisor</option>
                  <option value="support">Support / Assistant</option>
                  <option value="marketing">Marketing</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="invite-password">Temporary Password</label>
                <input
                  id="invite-password"
                  type="text"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Leave blank for default (Welcome123!)"
                />
                <span className="form-hint">The new user will use this to log in initially.</span>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={handleClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Inviting...' : 'Invite User'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function RoleBadge({ role }) {
  const roleColors = {
    admin: '#dc2626',
    planner: '#2563eb',
    support: '#059669',
    marketing: '#d97706'
  };

  const roleLabels = {
    admin: 'Admin',
    planner: 'Planner',
    support: 'Support',
    marketing: 'Marketing'
  };

  return (
    <span
      className="role-badge"
      style={{
        backgroundColor: `${roleColors[role] || '#6b7280'}15`,
        color: roleColors[role] || '#6b7280',
        border: `1px solid ${roleColors[role] || '#6b7280'}30`
      }}
    >
      {roleLabels[role] || role}
    </span>
  );
}

export default function SettingsPage() {
  const { user, token } = useAuth();
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [activeTab, setActiveTab] = useState('team');

  const isAdmin = user?.role === 'admin';

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoadingUsers(false);
    }
  }, [token]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Manage agency settings and team members.</p>
      </div>

      <div className="settings-tabs">
        <button
          className={`settings-tab ${activeTab === 'team' ? 'active' : ''}`}
          onClick={() => setActiveTab('team')}
        >
          Team Members
        </button>
        <button
          className={`settings-tab ${activeTab === 'agency' ? 'active' : ''}`}
          onClick={() => setActiveTab('agency')}
        >
          Agency Settings
        </button>
      </div>

      {activeTab === 'team' && (
        <div className="dashboard-card">
          <div className="dashboard-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Team Members</h3>
            {isAdmin && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setShowInviteModal(true)}
              >
                + Invite User
              </button>
            )}
          </div>
          <div className="dashboard-card-body">
            {loadingUsers ? (
              <p className="dashboard-empty-state">Loading team members...</p>
            ) : users.length === 0 ? (
              <p className="dashboard-empty-state">No team members found.</p>
            ) : (
              <div className="team-list">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} className={!u.isActive ? 'inactive-row' : ''}>
                        <td>
                          <div className="user-name-cell">
                            <div className="user-avatar-sm">
                              {u.firstName?.[0]}{u.lastName?.[0]}
                            </div>
                            <span>{u.firstName} {u.lastName}</span>
                            {u.id === user?.id && <span className="you-badge">You</span>}
                          </div>
                        </td>
                        <td>{u.email}</td>
                        <td><RoleBadge role={u.role} /></td>
                        <td>
                          <span className={`status-indicator ${u.isActive ? 'status-active' : 'status-inactive'}`}>
                            {u.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'agency' && (
        <AgencySettingsForm token={token} isAdmin={isAdmin} />
      )}

      <InviteUserModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        onSuccess={fetchUsers}
        token={token}
      />
    </div>
  );
}
