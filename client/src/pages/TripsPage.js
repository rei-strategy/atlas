import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

const API_BASE = '/api';

const STAGE_LABELS = {
  inquiry: 'Inquiry',
  quoted: 'Quoted/Planning',
  booked: 'Booked',
  final_payment_pending: 'Final Payment Pending',
  traveling: 'Traveling',
  completed: 'Completed',
  canceled: 'Canceled',
  archived: 'Archived'
};

const STAGE_COLORS = {
  inquiry: 'status-info',
  quoted: 'status-warning',
  booked: 'status-success',
  final_payment_pending: 'status-warning',
  traveling: 'status-info',
  completed: 'status-success',
  canceled: 'status-error',
  archived: 'status-neutral'
};

const STAGE_ORDER = ['inquiry', 'quoted', 'booked', 'final_payment_pending', 'traveling', 'completed', 'canceled', 'archived'];

function TripFormModal({ isOpen, onClose, onSaved, trip, token }) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({
    clientId: '', name: '', destination: '', description: '',
    travelStartDate: '', travelEndDate: ''
  });

  useEffect(() => {
    if (isOpen && token) {
      fetch(`${API_BASE}/clients`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(r => r.json())
        .then(data => { if (data.clients) setClients(data.clients); })
        .catch(() => {});
    }
  }, [isOpen, token]);

  useEffect(() => {
    if (trip) {
      setForm({
        clientId: trip.clientId || '',
        name: trip.name || '',
        destination: trip.destination || '',
        description: trip.description || '',
        travelStartDate: trip.travelStartDate || '',
        travelEndDate: trip.travelEndDate || ''
      });
    } else {
      setForm({
        clientId: '', name: '', destination: '', description: '',
        travelStartDate: '', travelEndDate: ''
      });
    }
    setError('');
  }, [trip, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.name.trim()) {
      setError('Trip name is required');
      return;
    }

    setLoading(true);
    try {
      const isEdit = !!trip;
      const url = isEdit ? `${API_BASE}/trips/${trip.id}` : `${API_BASE}/trips`;
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
        throw new Error(data.error || 'Failed to save trip');
      }

      addToast(isEdit ? 'Trip updated successfully' : 'Trip created successfully', 'success');
      onSaved(data.trip);
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
          <h2 className="modal-title">{trip ? 'Edit Trip' : 'Create Trip'}</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="auth-error">{error}</div>}

            <div className="form-group">
              <label className="form-label" htmlFor="clientId">Client</label>
              <select
                id="clientId"
                name="clientId"
                className="form-input"
                value={form.clientId}
                onChange={handleChange}
              >
                <option value="">Select a client...</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.firstName} {c.lastName}{c.email ? ` (${c.email})` : ''}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="tripName">Trip Name *</label>
              <input
                id="tripName"
                name="name"
                className="form-input"
                value={form.name}
                onChange={handleChange}
                placeholder="e.g., Caribbean Cruise 2026"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="destination">Destination</label>
              <input
                id="destination"
                name="destination"
                className="form-input"
                value={form.destination}
                onChange={handleChange}
                placeholder="e.g., Western Caribbean"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                className="form-input form-textarea"
                value={form.description}
                onChange={handleChange}
                placeholder="Trip details and notes..."
                rows={3}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="travelStartDate">Travel Start Date</label>
                <input
                  id="travelStartDate"
                  name="travelStartDate"
                  type="date"
                  className="form-input"
                  value={form.travelStartDate}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="travelEndDate">Travel End Date</label>
                <input
                  id="travelEndDate"
                  name="travelEndDate"
                  type="date"
                  className="form-input"
                  value={form.travelEndDate}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : (trip ? 'Save Changes' : 'Create Trip')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TripDetail({ trip, onBack, onEdit, onStageChange, token }) {
  if (!trip) return null;

  return (
    <div className="trip-detail">
      <div className="detail-header">
        <button className="btn btn-outline btn-sm" onClick={onBack}>
          ← Back to Trips
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => onEdit(trip)}>
          Edit Trip
        </button>
      </div>

      <div className="detail-card">
        <div className="detail-card-header">
          <div>
            <h2 className="detail-name">{trip.name}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
              <span className={`status-badge ${STAGE_COLORS[trip.stage]}`}>
                {STAGE_LABELS[trip.stage]}
              </span>
              {trip.clientName && (
                <span className="detail-meta">Client: {trip.clientName}</span>
              )}
              {trip.assignedUserName && (
                <span className="detail-meta">Planner: {trip.assignedUserName}</span>
              )}
            </div>
          </div>
        </div>

        <div className="detail-sections">
          <div className="detail-section">
            <h3 className="detail-section-title">Trip Details</h3>
            <div className="detail-grid">
              <div className="detail-field">
                <span className="detail-field-label">Destination</span>
                <span className="detail-field-value">{trip.destination || '—'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Travel Start</span>
                <span className="detail-field-value">{trip.travelStartDate ? new Date(trip.travelStartDate).toLocaleDateString() : '—'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Travel End</span>
                <span className="detail-field-value">{trip.travelEndDate ? new Date(trip.travelEndDate).toLocaleDateString() : '—'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Stage</span>
                <span className={`status-badge ${STAGE_COLORS[trip.stage]}`}>
                  {STAGE_LABELS[trip.stage]}
                </span>
              </div>
            </div>
          </div>

          {trip.description && (
            <div className="detail-section">
              <h3 className="detail-section-title">Description</h3>
              <p className="detail-notes">{trip.description}</p>
            </div>
          )}

          <div className="detail-section">
            <h3 className="detail-section-title">Stage Transition</h3>
            <div className="stage-buttons">
              {STAGE_ORDER.map(stage => (
                <button
                  key={stage}
                  className={`btn btn-sm ${trip.stage === stage ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => onStageChange(trip.id, stage)}
                  disabled={trip.stage === stage}
                >
                  {STAGE_LABELS[stage]}
                </button>
              ))}
            </div>
          </div>

          <div className="detail-section">
            <h3 className="detail-section-title">Dates & Deadlines</h3>
            <div className="detail-grid">
              <div className="detail-field">
                <span className="detail-field-label">Final Payment Deadline</span>
                <span className="detail-field-value">{trip.finalPaymentDeadline ? new Date(trip.finalPaymentDeadline).toLocaleDateString() : '—'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Insurance Cutoff</span>
                <span className="detail-field-value">{trip.insuranceCutoffDate ? new Date(trip.insuranceCutoffDate).toLocaleDateString() : '—'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Check-in Date</span>
                <span className="detail-field-value">{trip.checkinDate ? new Date(trip.checkinDate).toLocaleDateString() : '—'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Locked</span>
                <span className={`status-badge ${trip.isLocked ? 'status-warning' : 'status-neutral'}`}>
                  {trip.isLocked ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TripsPage() {
  const { token } = useAuth();
  const { addToast } = useToast();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editTrip, setEditTrip] = useState(null);
  const [selectedTrip, setSelectedTrip] = useState(null);

  const fetchTrips = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (stageFilter) params.set('stage', stageFilter);
      const res = await fetch(`${API_BASE}/trips?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setTrips(data.trips);
      }
    } catch (err) {
      console.error('Failed to load trips:', err);
    } finally {
      setLoading(false);
    }
  }, [token, search, stageFilter]);

  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

  const handleTripSaved = (savedTrip) => {
    setTrips(prev => {
      const existing = prev.find(t => t.id === savedTrip.id);
      if (existing) {
        return prev.map(t => t.id === savedTrip.id ? savedTrip : t);
      }
      return [savedTrip, ...prev];
    });
    if (selectedTrip && selectedTrip.id === savedTrip.id) {
      setSelectedTrip(savedTrip);
    }
  };

  const handleStageChange = async (tripId, newStage) => {
    try {
      const res = await fetch(`${API_BASE}/trips/${tripId}/stage`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ stage: newStage })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to change stage');
      }

      addToast(`Stage changed to ${STAGE_LABELS[newStage]}`, 'success');
      handleTripSaved(data.trip);
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleCreateTrip = () => {
    setEditTrip(null);
    setShowModal(true);
  };

  const handleEditTrip = (trip) => {
    setEditTrip(trip);
    setShowModal(true);
  };

  const handleViewTrip = (trip) => {
    setSelectedTrip(trip);
  };

  // Detail view
  if (selectedTrip) {
    return (
      <div className="page-container">
        <TripDetail
          trip={selectedTrip}
          onBack={() => setSelectedTrip(null)}
          onEdit={handleEditTrip}
          onStageChange={handleStageChange}
          token={token}
        />
        <TripFormModal
          isOpen={showModal}
          onClose={() => { setShowModal(false); setEditTrip(null); }}
          onSaved={handleTripSaved}
          trip={editTrip}
          token={token}
        />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Trips</h1>
          <p className="page-subtitle">Manage trips and their lifecycle.</p>
        </div>
        <button className="btn btn-primary" onClick={handleCreateTrip}>
          + Create Trip
        </button>
      </div>

      <div style={{ display: 'flex', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
        <input
          type="text"
          className="form-input"
          placeholder="Search trips by name, destination, or client..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        <select
          className="form-input"
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          style={{ width: '200px' }}
        >
          <option value="">All Stages</option>
          {STAGE_ORDER.map(stage => (
            <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="loading-screen" style={{ minHeight: '200px' }}>
          <div className="loading-spinner" />
          <p>Loading trips...</p>
        </div>
      ) : trips.length === 0 ? (
        <div className="page-empty-state">
          <div className="empty-state-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <h3 className="empty-state-title">No trips yet</h3>
          <p className="empty-state-description">Create your first trip to start managing the travel lifecycle.</p>
          <button className="btn btn-primary" style={{ marginTop: 'var(--spacing-md)' }} onClick={handleCreateTrip}>
            + Create Your First Trip
          </button>
        </div>
      ) : (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Trip Name</th>
                <th>Client</th>
                <th>Destination</th>
                <th>Stage</th>
                <th>Travel Dates</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {trips.map(trip => (
                <tr
                  key={trip.id}
                  className="data-table-row-clickable"
                  onClick={() => handleViewTrip(trip)}
                >
                  <td><span className="table-user-name">{trip.name}</span></td>
                  <td>{trip.clientName || '—'}</td>
                  <td>{trip.destination || '—'}</td>
                  <td>
                    <span className={`status-badge ${STAGE_COLORS[trip.stage]}`}>
                      {STAGE_LABELS[trip.stage]}
                    </span>
                  </td>
                  <td>
                    {trip.travelStartDate && trip.travelEndDate
                      ? `${new Date(trip.travelStartDate).toLocaleDateString()} - ${new Date(trip.travelEndDate).toLocaleDateString()}`
                      : trip.travelStartDate
                      ? new Date(trip.travelStartDate).toLocaleDateString()
                      : '—'}
                  </td>
                  <td>{new Date(trip.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TripFormModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditTrip(null); }}
        onSaved={handleTripSaved}
        trip={editTrip}
        token={token}
      />
    </div>
  );
}
