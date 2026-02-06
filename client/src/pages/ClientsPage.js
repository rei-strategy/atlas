import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { useTimezone } from '../hooks/useTimezone';

const API_BASE = '/api';

const COMMUNICATION_OPTIONS = ['Email', 'Phone', 'Text', 'Video Call'];
const TRAVEL_PREFERENCE_OPTIONS = [
  'Disney', 'Cruises', 'Luxury', 'Budget', 'Adventure',
  'Beach', 'All-Inclusive', 'Family', 'Honeymoon', 'Group Travel',
  'Europe', 'Caribbean', 'Asia', 'Domestic'
];

function ClientFormModal({ isOpen, onClose, onSaved, client, token, users = [] }) {
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
    contactConsent: true,
    assignedUserId: ''
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
        contactConsent: client.contactConsent !== false,
        assignedUserId: client.assignedUserId || ''
      });
    } else {
      setForm({
        firstName: '', lastName: '', email: '', phone: '',
        city: '', state: '', country: '',
        preferredCommunication: '',
        travelPreferences: [],
        notes: '',
        marketingOptIn: false,
        contactConsent: true,
        assignedUserId: ''
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

function CsvImportModal({ isOpen, onClose, onImported, token }) {
  const { addToast } = useToast();
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [importResult, setImportResult] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = React.useRef(null);

  const resetState = () => {
    setFile(null);
    setValidationErrors([]);
    setImportResult(null);
    setLoading(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith('.csv') || droppedFile.type === 'text/csv') {
        setFile(droppedFile);
        setValidationErrors([]);
        setImportResult(null);
      } else {
        addToast('Please upload a CSV file', 'error');
      }
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setValidationErrors([]);
      setImportResult(null);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await fetch('/api/clients/import/template', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'client-import-template.csv';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      addToast('Failed to download template', 'error');
    }
  };

  const handleImport = async () => {
    if (!file) {
      addToast('Please select a CSV file', 'error');
      return;
    }

    setLoading(true);
    setValidationErrors([]);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/clients/import', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.validationErrors) {
          setValidationErrors(data.validationErrors);
        } else {
          addToast(data.error || 'Import failed', 'error');
        }
        return;
      }

      setImportResult(data);
      addToast(`Successfully imported ${data.imported} clients`, 'success');
      onImported(data.imported);
    } catch (err) {
      addToast('Failed to import CSV file', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Import Clients from CSV</h2>
          <button className="modal-close-btn" onClick={handleClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          {importResult ? (
            <div className="import-success">
              <div className="success-icon" style={{ fontSize: '48px', marginBottom: 'var(--spacing-md)' }}>
                {importResult.validationErrors ? '⚠️' : '✓'}
              </div>
              <h3 style={{ color: importResult.validationErrors ? 'var(--color-warning)' : 'var(--color-success)', marginBottom: 'var(--spacing-sm)' }}>
                {importResult.validationErrors ? 'Partial Import Complete' : 'Import Complete!'}
              </h3>
              <p>{importResult.imported} client{importResult.imported !== 1 ? 's' : ''} imported successfully.</p>
              {importResult.validationErrors && (
                <div style={{ marginTop: 'var(--spacing-md)', textAlign: 'left' }}>
                  <h4 style={{ color: 'var(--color-danger)', marginBottom: 'var(--spacing-sm)' }}>
                    {importResult.validationErrors.length} row{importResult.validationErrors.length !== 1 ? 's' : ''} failed:
                  </h4>
                  <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius)', padding: 'var(--spacing-sm)' }}>
                    {importResult.validationErrors.map((err, idx) => (
                      <div key={idx} style={{ padding: 'var(--spacing-xs) 0', borderBottom: idx < importResult.validationErrors.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                        <strong>Row {err.row}:</strong>{' '}
                        <span style={{ color: 'var(--color-danger)' }}>{err.errors.join(', ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button className="btn btn-primary" style={{ marginTop: 'var(--spacing-lg)' }} onClick={handleClose}>
                Done
              </button>
            </div>
          ) : (
            <>
              <div className="import-instructions" style={{ marginBottom: 'var(--spacing-lg)' }}>
                <p style={{ marginBottom: 'var(--spacing-sm)' }}>
                  Upload a CSV file with client data. The file should include columns for:
                </p>
                <ul style={{ marginLeft: 'var(--spacing-lg)', marginBottom: 'var(--spacing-md)', color: 'var(--color-text-secondary)' }}>
                  <li><strong>first_name</strong> (required)</li>
                  <li><strong>last_name</strong> (required)</li>
                  <li>email, phone, city, state, country</li>
                  <li>preferred_communication, notes</li>
                  <li>marketing_opt_in, contact_consent (true/false)</li>
                </ul>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={handleDownloadTemplate}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}
                >
                  ⬇ Download Template
                </button>
              </div>

              <div
                className={`dropzone ${dragActive ? 'dropzone-active' : ''} ${file ? 'dropzone-has-file' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '2px dashed var(--color-border)',
                  borderRadius: 'var(--border-radius)',
                  padding: 'var(--spacing-xl)',
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: dragActive ? 'var(--color-primary-light, #f0f7ff)' : 'var(--color-bg-secondary)',
                  transition: 'all 0.2s ease'
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                {file ? (
                  <div>
                    <div style={{ fontSize: '24px', marginBottom: 'var(--spacing-sm)' }}>📄</div>
                    <p style={{ fontWeight: '500' }}>{file.name}</p>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ marginTop: 'var(--spacing-sm)' }}
                      onClick={(e) => { e.stopPropagation(); setFile(null); }}
                    >
                      Choose Different File
                    </button>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '24px', marginBottom: 'var(--spacing-sm)' }}>📤</div>
                    <p>Drag and drop your CSV file here</p>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                      or click to browse
                    </p>
                  </div>
                )}
              </div>

              {validationErrors.length > 0 && (
                <div className="validation-errors" style={{ marginTop: 'var(--spacing-lg)' }}>
                  <h4 style={{ color: 'var(--color-danger)', marginBottom: 'var(--spacing-sm)' }}>
                    Validation Errors ({validationErrors.length} row{validationErrors.length !== 1 ? 's' : ''})
                  </h4>
                  <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius)', padding: 'var(--spacing-sm)' }}>
                    {validationErrors.map((err, idx) => (
                      <div key={idx} style={{ padding: 'var(--spacing-xs) 0', borderBottom: idx < validationErrors.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                        <strong>Row {err.row}:</strong>{' '}
                        <span style={{ color: 'var(--color-text-secondary)' }}>
                          {err.data.firstName} {err.data.lastName}
                        </span>
                        <ul style={{ marginLeft: 'var(--spacing-lg)', marginTop: 'var(--spacing-xs)', color: 'var(--color-danger)' }}>
                          {err.errors.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <p style={{ marginTop: 'var(--spacing-sm)', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                    Please fix these errors in your CSV file and try again.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
        {!importResult && (
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={handleClose}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleImport}
              disabled={!file || loading}
            >
              {loading ? 'Importing...' : 'Import Clients'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ClientDetail({ client, onBack, onEdit, onDelete, token }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [tripCount, setTripCount] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const { addToast } = useToast();

  // Fetch associated trips count when delete modal opens
  useEffect(() => {
    if (showDeleteConfirm && client) {
      fetch(`/api/trips?clientId=${client.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          setTripCount(data.trips ? data.trips.length : 0);
        })
        .catch(() => setTripCount(0));
    }
  }, [showDeleteConfirm, client, token]);

  const handleDeleteConfirm = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete client');
      }
      addToast('Client deleted successfully', 'success');
      onDelete(client.id);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (!client) return null;

  return (
    <div className="client-detail">
      <div className="detail-header">
        <button className="btn btn-outline btn-sm" onClick={onBack}>
          ← Back to Clients
        </button>
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
          <button className="btn btn-primary btn-sm" onClick={() => onEdit(client)}>
            Edit Client
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => setShowDeleteConfirm(true)}>
            Delete Client
          </button>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Delete Client</h2>
              <button className="modal-close-btn" onClick={() => setShowDeleteConfirm(false)} aria-label="Close">×</button>
            </div>
            <div className="modal-body">
              <div className="delete-warning">
                <p style={{ marginBottom: 'var(--spacing-md)', fontWeight: '500' }}>
                  Are you sure you want to delete <strong>{client.firstName} {client.lastName}</strong>?
                </p>
                {tripCount > 0 && (
                  <div className="warning-box" style={{ padding: 'var(--spacing-md)', backgroundColor: 'var(--color-warning-bg, #fef3c7)', borderRadius: 'var(--border-radius)', marginBottom: 'var(--spacing-md)' }}>
                    <p style={{ color: 'var(--color-warning-text, #92400e)', margin: 0 }}>
                      ⚠️ This client has <strong>{tripCount} associated trip{tripCount !== 1 ? 's' : ''}</strong>.
                      Deleting this client may affect related trip records.
                    </p>
                  </div>
                )}
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                  This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDeleteConfirm} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Delete Client'}
              </button>
            </div>
          </div>
        </div>
      )}

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
  const { formatDate } = useTimezone();
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [plannerFilter, setPlannerFilter] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editClient, setEditClient] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);
  const [notFound, setNotFound] = useState(false);
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalClients, setTotalClients] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [pageSize] = useState(10);

  // Fetch users for planner filter dropdown
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch(`${API_BASE}/users`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok) {
          // Filter to only planners and admins who can be assigned to clients
          setUsers(data.users.filter(u => ['admin', 'planner'].includes(u.role)));
        }
      } catch (err) {
        console.error('Failed to load users:', err);
      }
    };
    fetchUsers();
  }, [token]);

  const fetchClients = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (plannerFilter) params.set('assignedTo', plannerFilter);
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);
      params.set('page', currentPage.toString());
      params.set('limit', pageSize.toString());
      const res = await fetch(`${API_BASE}/clients?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setClients(data.clients);
        setTotalClients(data.total);
        setTotalPages(data.totalPages);
      }
    } catch (err) {
      console.error('Failed to load clients:', err);
    } finally {
      setLoading(false);
    }
  }, [token, search, plannerFilter, sortBy, sortOrder, currentPage, pageSize]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, plannerFilter]);

  // Handle URL parameter for direct navigation to a client
  useEffect(() => {
    if (urlClientId && token && !selectedClient && !notFound) {
      // Fetch the specific client by ID
      fetch(`${API_BASE}/clients/${urlClientId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => {
          if (!res.ok) {
            setNotFound(true);
            return null;
          }
          return res.json();
        })
        .then(data => {
          if (data && data.client) {
            setSelectedClient(data.client);
          } else if (data === null) {
            setNotFound(true);
          }
        })
        .catch(err => {
          console.error('Failed to load client:', err);
          setNotFound(true);
        });
    }
  }, [urlClientId, token, selectedClient, notFound]);

  const handleClientSaved = (savedClient) => {
    // For new clients, refresh the list to get accurate pagination
    const isNewClient = !clients.find(c => c.id === savedClient.id);
    if (isNewClient) {
      fetchClients();
    } else {
      setClients(prev => prev.map(c => c.id === savedClient.id ? savedClient : c));
    }
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

  const handleClearFilters = () => {
    setSearch('');
    setPlannerFilter('');
  };

  const handleImportComplete = (count) => {
    // Refresh the client list after import
    fetchClients();
    setShowImportModal(false);
  };

  const handleDeleteClient = (deletedId) => {
    setClients(prev => prev.filter(c => c.id !== deletedId));
    setSelectedClient(null);
    navigate('/clients');
  };

  const hasActiveFilters = search !== '' || plannerFilter !== '';

  // Handle column header click for sorting
  const handleSort = (column) => {
    if (sortBy === column) {
      // Toggle order if clicking same column
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to ascending
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  // Render sort indicator for a column
  const renderSortIndicator = (column) => {
    if (sortBy !== column) {
      return <span className="sort-indicator sort-inactive">⇅</span>;
    }
    return (
      <span className="sort-indicator sort-active">
        {sortOrder === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  // Not found view
  if (notFound) {
    return (
      <div className="page-container">
        <div className="page-empty-state">
          <div className="empty-state-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4" />
              <circle cx="12" cy="16" r="1" fill="currentColor" />
            </svg>
          </div>
          <h3 className="empty-state-title">Client Not Found</h3>
          <p className="empty-state-description">
            This client may have been deleted or you don't have permission to view it.
          </p>
          <button
            className="btn btn-primary"
            style={{ marginTop: 'var(--spacing-md)' }}
            onClick={() => { setNotFound(false); navigate('/clients'); }}
          >
            ← Back to Clients
          </button>
        </div>
      </div>
    );
  }

  // Detail view
  if (selectedClient) {
    return (
      <div className="page-container">
        <ClientDetail
          client={selectedClient}
          onBack={() => { setSelectedClient(null); navigate('/clients'); }}
          onEdit={handleEditClient}
          onDelete={handleDeleteClient}
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
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
          <button className="btn btn-outline" onClick={() => setShowImportModal(true)}>
            ⬆ Import CSV
          </button>
          <button className="btn btn-primary" onClick={handleCreateClient}>
            + Add Client
          </button>
        </div>
      </div>

      <div className="filter-bar" style={{ display: 'flex', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1', minWidth: '200px' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search clients by name, email, phone, or city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={{ minWidth: '180px' }}>
          <select
            className="form-input"
            value={plannerFilter}
            onChange={(e) => setPlannerFilter(e.target.value)}
            aria-label="Filter by planner"
          >
            <option value="">All Planners</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>
                {user.firstName} {user.lastName}
              </option>
            ))}
          </select>
        </div>
        {hasActiveFilters && (
          <button
            className="btn btn-outline btn-sm"
            onClick={handleClearFilters}
            style={{ whiteSpace: 'nowrap' }}
          >
            Clear Filters
          </button>
        )}
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
                <th className="sortable-header" onClick={() => handleSort('name')}>
                  Name {renderSortIndicator('name')}
                </th>
                <th>Email</th>
                <th>Phone</th>
                <th className="sortable-header" onClick={() => handleSort('planner')}>
                  Planner {renderSortIndicator('planner')}
                </th>
                <th>Location</th>
                <th className="sortable-header" onClick={() => handleSort('activity')}>
                  Last Activity {renderSortIndicator('activity')}
                </th>
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
                  <td>{client.assignedUserName || '—'}</td>
                  <td>{[client.city, client.state, client.country].filter(Boolean).join(', ') || '—'}</td>
                  <td>{formatDate(client.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="pagination-controls" style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 'var(--spacing-md)',
              borderTop: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-bg-secondary)'
            }}>
              <div className="pagination-info" style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                Showing {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, totalClients)} of {totalClients} clients
              </div>
              <div className="pagination-buttons" style={{ display: 'flex', gap: 'var(--spacing-xs)', alignItems: 'center' }}>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  title="First page"
                >
                  ««
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  title="Previous page"
                >
                  ‹ Prev
                </button>
                <span style={{ padding: '0 var(--spacing-md)', fontSize: '0.875rem', fontWeight: '500' }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  title="Next page"
                >
                  Next ›
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  title="Last page"
                >
                  »»
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <ClientFormModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditClient(null); }}
        onSaved={handleClientSaved}
        client={editClient}
        token={token}
      />
      <CsvImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImported={handleImportComplete}
        token={token}
      />
    </div>
  );
}
