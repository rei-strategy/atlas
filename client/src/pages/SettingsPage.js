import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE = '/api';

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
        <div className="dashboard-card">
          <div className="dashboard-card-body">
            <p className="dashboard-empty-state">Agency settings management coming soon.</p>
          </div>
        </div>
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
