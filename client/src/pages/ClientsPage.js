import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

const API_BASE = '/api';

const COMMUNICATION_OPTIONS = ['Email', 'Phone', 'Text', 'Video Call'];
const TRAVEL_PREFERENCE_OPTIONS = [
  'Disney', 'Cruises', 'Luxury', 'Budget', 'Adventure',
  'Beach', 'All-Inclusive', 'Family', 'Honeymoon', 'Group Travel',
  'Europe', 'Caribbean', 'Asia', 'Domestic'
];

function ClientFormModal({ isOpen, onClose, onSaved, client, token }) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    city: '', state: '', country: '',
    preferredCommunication: '',
    travelPreferences: [],
    notes: '',
    marketingOptIn: false,
    contactConsent: true
  });

  useEffect(() => {
    if (client) {
      setForm({
        firstName: client.firstName || '',
        lastName: client.lastName || '',
        email: client.email || '',
        phone: client.phone || '',
        city: client.city || '',
        state: client.state || '',
        country: client.country || '',
        preferredCommunication: client.preferredCommunication || '',
        travelPreferences: client.travelPreferences || [],
        notes: client.notes || '',
        marketingOptIn: !!client.marketingOptIn,
        contactConsent: client.contactConsent !== false
      });
    } else {
      setForm({
        firstName: '', lastName: '', email: '', phone: '',
        city: '', state: '', country: '',
        preferredCommunication: '',
        travelPreferences: [],
        notes: '',
        marketingOptIn: false,
        contactConsent: true
      });
    }
    setError('');
  }, [client, isOpen]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleTravelPref = (pref) => {
    setForm(prev => ({
      ...prev,
      travelPreferences: prev.travelPreferences.includes(pref)
        ? prev.travelPreferences.filter(p => p !== pref)
        : [...prev.travelPreferences, pref]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('First name and last name are required');
      return;
    }

    setLoading(true);
    try {
      const isEdit = !!client;
      const url = isEdit ? `${API_BASE}/clients/${client.id}` : `${API_BASE}/clients`;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(form)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save client');
      }

      addToast(isEdit ? 'Client updated successfully' : 'Client created successfully', 'success');
      onSaved(data.client);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{client ? 'Edit Client' : 'Create Client'}</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="auth-error">{error}</div>}

            <h3 className="form-section-title">Personal Information</h3>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="firstName">First Name *</label>
                <input
                  id="firstName"
                  name="firstName"
                  className="form-input"
                  value={form.firstName}
                  onChange={handleChange}
                  placeholder="First name"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="lastName">Last Name *</label>
                <input
                  id="lastName"
                  name="lastName"
                  className="form-input"
                  value={form.lastName}
                  onChange={handleChange}
                  placeholder="Last name"
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className="form-input"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="email@example.com"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="phone">Phone</label>
                <input
                  id="phone"
                  name="phone"
                  className="form-input"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="(555) 555-1234"
                />
              </div>
            </div>

            <h3 className="form-section-title">Location</h3>
            <div className="form-row-3">
              <div className="form-group">
                <label className="form-label" htmlFor="city">City</label>
                <input
                  id="city"
                  name="city"
                  className="form-input"
                  value={form.city}
                  onChange={handleChange}
                  placeholder="City"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="state">State</label>
                <input
                  id="state"
                  name="state"
                  className="form-input"
                  value={form.state}
                  onChange={handleChange}
                  placeholder="State"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="country">Country</label>
                <input
                  id="country"
                  name="country"
                  className="form-input"
                  value={form.country}
                  onChange={handleChange}
                  placeholder="Country"
                />
              </div>
            </div>

            <h3 className="form-section-title">Communication & Preferences</h3>
            <div className="form-group">
              <label className="form-label" htmlFor="preferredCommunication">Preferred Communication</label>
              <select
                id="preferredCommunication"
                name="preferredCommunication"
                className="form-input"
                value={form.preferredCommunication}
                onChange={handleChange}
              >
                <option value="">Select preferred method...</option>
                {COMMUNICATION_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Travel Preferences</label>
              <div className="chip-group">
                {TRAVEL_PREFERENCE_OPTIONS.map(pref => (
                  <button
                    type="button"
                    key={pref}
                    className={`chip ${form.travelPreferences.includes(pref) ? 'chip-active' : ''}`}
                    onClick={() => handleTravelPref(pref)}
                  >
                    {pref}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                name="notes"
                className="form-input form-textarea"
                value={form.notes}
                onChange={handleChange}
                placeholder="Relationship context, anniversaries, repeat preferences..."
                rows={3}
              />
            </div>

            <h3 className="form-section-title">Consent</h3>
            <div className="checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="marketingOptIn"
                  checked={form.marketingOptIn}
                  onChange={handleChange}
                />
                <span>Marketing opt-in (allow marketing communications)</span>
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="contactConsent"
                  checked={form.contactConsent}
                  onChange={handleChange}
                />
                <span>Contact consent (allow general contact)</span>
              </label>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : (client ? 'Save Changes' : 'Create Client')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ClientDetail({ client, onBack, onEdit, token }) {
  if (!client) return null;

  return (
    <div className="client-detail">
      <div className="detail-header">
        <button className="btn btn-outline btn-sm" onClick={onBack}>
          ← Back to Clients
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => onEdit(client)}>
          Edit Client
        </button>
      </div>

      <div className="detail-card">
        <div className="detail-card-header">
          <div className="detail-avatar">
            {client.firstName[0]}{client.lastName[0]}
          </div>
          <div>
            <h2 className="detail-name">{client.firstName} {client.lastName}</h2>
            {client.assignedUserName && (
              <p className="detail-meta">Assigned to: {client.assignedUserName}</p>
            )}
          </div>
        </div>

        <div className="detail-sections">
          <div className="detail-section">
            <h3 className="detail-section-title">Contact Information</h3>
            <div className="detail-grid">
              <div className="detail-field">
                <span className="detail-field-label">Email</span>
                <span className="detail-field-value">{client.email || '—'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Phone</span>
                <span className="detail-field-value">{client.phone || '—'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Preferred Communication</span>
                <span className="detail-field-value">{client.preferredCommunication || '—'}</span>
              </div>
            </div>
          </div>

          <div className="detail-section">
            <h3 className="detail-section-title">Location</h3>
            <div className="detail-grid">
              <div className="detail-field">
                <span className="detail-field-label">City</span>
                <span className="detail-field-value">{client.city || '—'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">State</span>
                <span className="detail-field-value">{client.state || '—'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Country</span>
                <span className="detail-field-value">{client.country || '—'}</span>
              </div>
            </div>
          </div>

          <div className="detail-section">
            <h3 className="detail-section-title">Travel Preferences</h3>
            {client.travelPreferences && client.travelPreferences.length > 0 ? (
              <div className="chip-group">
                {client.travelPreferences.map(pref => (
                  <span key={pref} className="chip chip-active chip-readonly">{pref}</span>
                ))}
              </div>
            ) : (
              <p className="text-secondary">No travel preferences set</p>
            )}
          </div>

          <div className="detail-section">
            <h3 className="detail-section-title">Notes</h3>
            <p className="detail-notes">{client.notes || 'No notes'}</p>
          </div>

          <div className="detail-section">
            <h3 className="detail-section-title">Consent & Marketing</h3>
            <div className="detail-grid">
              <div className="detail-field">
                <span className="detail-field-label">Marketing Opt-in</span>
                <span className={`status-badge ${client.marketingOptIn ? 'status-success' : 'status-neutral'}`}>
                  {client.marketingOptIn ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Contact Consent</span>
                <span className={`status-badge ${client.contactConsent ? 'status-success' : 'status-neutral'}`}>
                  {client.contactConsent ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ClientsPage() {
  const { token } = useAuth();
  const { id: urlClientId } = useParams();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editClient, setEditClient] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);

  const fetchClients = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const res = await fetch(`${API_BASE}/clients?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setClients(data.clients);
      }
    } catch (err) {
      console.error('Failed to load clients:', err);
    } finally {
      setLoading(false);
    }
  }, [token, search]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // Handle URL parameter for direct navigation to a client
  useEffect(() => {
    if (urlClientId && token && !selectedClient) {
      // Fetch the specific client by ID
      fetch(`${API_BASE}/clients/${urlClientId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data.client) {
            setSelectedClient(data.client);
          }
        })
        .catch(err => console.error('Failed to load client:', err));
    }
  }, [urlClientId, token, selectedClient]);

  const handleClientSaved = (savedClient) => {
    setClients(prev => {
      const existing = prev.find(c => c.id === savedClient.id);
      if (existing) {
        return prev.map(c => c.id === savedClient.id ? savedClient : c);
      }
      return [savedClient, ...prev];
    });
    // Update detail view if currently selected
    if (selectedClient && selectedClient.id === savedClient.id) {
      setSelectedClient(savedClient);
    }
  };

  const handleCreateClient = () => {
    setEditClient(null);
    setShowModal(true);
  };

  const handleEditClient = (client) => {
    setEditClient(client);
    setShowModal(true);
  };

  const handleViewClient = (client) => {
    setSelectedClient(client);
    navigate(`/clients/${client.id}`);
  };

  // Detail view
  if (selectedClient) {
    return (
      <div className="page-container">
        <ClientDetail
          client={selectedClient}
          onBack={() => { setSelectedClient(null); navigate('/clients'); }}
          onEdit={handleEditClient}
          token={token}
        />
        <ClientFormModal
          isOpen={showModal}
          onClose={() => { setShowModal(false); setEditClient(null); }}
          onSaved={handleClientSaved}
          client={editClient}
          token={token}
        />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Clients</h1>
          <p className="page-subtitle">Manage your clients and their information.</p>
        </div>
        <button className="btn btn-primary" onClick={handleCreateClient}>
          + Add Client
        </button>
      </div>

      <div className="search-bar" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <input
          type="text"
          className="form-input"
          placeholder="Search clients by name, email, phone, or city..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading-screen" style={{ minHeight: '200px' }}>
          <div className="loading-spinner" />
          <p>Loading clients...</p>
        </div>
      ) : clients.length === 0 ? (
        <div className="page-empty-state">
          <div className="empty-state-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <h3 className="empty-state-title">No clients yet</h3>
          <p className="empty-state-description">Add your first client to get started managing your travel business.</p>
          <button className="btn btn-primary" style={{ marginTop: 'var(--spacing-md)' }} onClick={handleCreateClient}>
            + Add Your First Client
          </button>
        </div>
      ) : (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Location</th>
                <th>Preferred Contact</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(client => (
                <tr
                  key={client.id}
                  className="data-table-row-clickable"
                  onClick={() => handleViewClient(client)}
                >
                  <td>
                    <div className="table-user-cell">
                      <div className="table-avatar">
                        {client.firstName[0]}{client.lastName[0]}
                      </div>
                      <span className="table-user-name">{client.firstName} {client.lastName}</span>
                    </div>
                  </td>
                  <td>{client.email || '—'}</td>
                  <td>{client.phone || '—'}</td>
                  <td>{[client.city, client.state, client.country].filter(Boolean).join(', ') || '—'}</td>
                  <td>{client.preferredCommunication || '—'}</td>
                  <td>{new Date(client.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ClientFormModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditClient(null); }}
        onSaved={handleClientSaved}
        client={editClient}
        token={token}
      />
    </div>
  );
}
