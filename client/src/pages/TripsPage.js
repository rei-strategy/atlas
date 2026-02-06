import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { useTimezone } from '../hooks/useTimezone';
import Modal from '../components/Modal';

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

const BOOKING_TYPES = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'cruise', label: 'Cruise' },
  { value: 'resort', label: 'Resort' },
  { value: 'tour', label: 'Tour' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'other', label: 'Other' }
];

const BOOKING_STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'booked', label: 'Booked' },
  { value: 'canceled', label: 'Canceled' }
];

const PAYMENT_STATUSES = [
  { value: 'deposit_paid', label: 'Deposit Paid' },
  { value: 'final_due', label: 'Final Due' },
  { value: 'paid_in_full', label: 'Paid in Full' }
];

const BOOKING_STATUS_COLORS = {
  planned: 'status-neutral',
  quoted: 'status-warning',
  booked: 'status-success',
  canceled: 'status-error'
};

const PAYMENT_STATUS_COLORS = {
  deposit_paid: 'status-warning',
  final_due: 'status-error',
  paid_in_full: 'status-success'
};

const COMMISSION_STATUS_COLORS = {
  expected: 'status-info',
  submitted: 'status-warning',
  paid: 'status-success'
};

const PASSPORT_STATUSES = [
  { value: 'yes', label: 'Valid Passport' },
  { value: 'no', label: 'No Passport' },
  { value: 'unknown', label: 'Unknown' }
];

const PASSPORT_STATUS_COLORS = {
  yes: 'status-success',
  no: 'status-error',
  unknown: 'status-warning'
};

function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '$0.00';
  return '$' + Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Check if a booking's payment is overdue
function isPaymentOverdue(booking) {
  if (!booking.finalPaymentDueDate) return false;
  if (booking.paymentStatus === 'paid_in_full') return false;
  const today = new Date().toISOString().split('T')[0];
  return booking.finalPaymentDueDate < today;
}

function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/* =================== TRIP FORM MODAL =================== */
function TripFormModal({ isOpen, onClose, onSaved, trip, token }) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [clients, setClients] = useState([]);
  const [showChangeReason, setShowChangeReason] = useState(false);
  const [form, setForm] = useState({
    clientId: '', name: '', destination: '', description: '',
    travelStartDate: '', travelEndDate: '', changeReason: ''
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
        travelEndDate: trip.travelEndDate || '',
        changeReason: ''
      });
      // Show change reason field if trip is locked
      setShowChangeReason(trip.isLocked || false);
    } else {
      setForm({
        clientId: '', name: '', destination: '', description: '',
        travelStartDate: '', travelEndDate: '', changeReason: ''
      });
      setShowChangeReason(false);
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

      // Handle 202 Accepted - approval request created
      if (res.status === 202 && data.approvalRequired) {
        addToast('Changes require admin approval. Request submitted.', 'info');
        onClose();
        return;
      }

      // Handle 400 - reason required for locked trip
      if (res.status === 400 && data.requiresApproval) {
        setError('Please provide a reason for changing this locked trip.');
        setShowChangeReason(true);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        // Handle locked trip error with more detail
        if (res.status === 403 && data.lockedFields) {
          throw new Error(`Trip is locked. Cannot modify: ${data.lockedFields.join(', ')}. ${data.lockReason || ''}`);
        }
        throw new Error(data.error || data.message || 'Failed to save trip');
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

            {/* Change reason for locked trips */}
            {showChangeReason && trip?.isLocked && (
              <div style={{
                marginTop: '1rem',
                padding: '1rem',
                background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                borderRadius: '8px',
                border: '1px solid var(--color-warning, #f59e0b)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>🔒</span>
                  <span style={{ fontWeight: 600, color: '#92400e' }}>This trip is locked</span>
                </div>
                <p style={{ fontSize: '0.875rem', color: '#a16207', marginBottom: '0.75rem' }}>
                  Changes to locked trip fields require admin approval. Please provide a reason for your changes.
                </p>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="changeReason">Reason for Change *</label>
                  <textarea
                    id="changeReason"
                    name="changeReason"
                    className="form-input form-textarea"
                    value={form.changeReason}
                    onChange={handleChange}
                    placeholder="Explain why these changes are needed..."
                    rows={2}
                    required
                    style={{ background: '#fff' }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : (trip?.isLocked && showChangeReason ? 'Request Changes' : (trip ? 'Save Changes' : 'Create Trip'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =================== BOOKING FORM MODAL =================== */
function BookingFormModal({ isOpen, onClose, onSaved, booking, tripId, token }) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    bookingType: 'hotel',
    supplierName: '',
    status: 'planned',
    confirmationNumber: '',
    bookingDate: '',
    travelStartDate: '',
    travelEndDate: '',
    totalCost: '',
    depositAmount: '',
    depositPaid: false,
    finalPaymentAmount: '',
    finalPaymentDueDate: '',
    paymentStatus: 'deposit_paid',
    commissionRate: '',
    commissionAmountExpected: '',
    supplierNotes: '',
    inclusionsExclusions: '',
    cancellationRules: ''
  });

  useEffect(() => {
    if (booking) {
      setForm({
        bookingType: booking.bookingType || 'hotel',
        supplierName: booking.supplierName || '',
        status: booking.status || 'planned',
        confirmationNumber: booking.confirmationNumber || '',
        bookingDate: booking.bookingDate || '',
        travelStartDate: booking.travelStartDate || '',
        travelEndDate: booking.travelEndDate || '',
        totalCost: booking.totalCost || '',
        depositAmount: booking.depositAmount || '',
        depositPaid: booking.depositPaid || false,
        finalPaymentAmount: booking.finalPaymentAmount || '',
        finalPaymentDueDate: booking.finalPaymentDueDate || '',
        paymentStatus: booking.paymentStatus || 'deposit_paid',
        commissionRate: booking.commissionRate || '',
        commissionAmountExpected: booking.commissionAmountExpected || '',
        supplierNotes: booking.supplierNotes || '',
        inclusionsExclusions: booking.inclusionsExclusions || '',
        cancellationRules: booking.cancellationRules || ''
      });
    } else {
      setForm({
        bookingType: 'hotel',
        supplierName: '',
        status: 'planned',
        confirmationNumber: '',
        bookingDate: '',
        travelStartDate: '',
        travelEndDate: '',
        totalCost: '',
        depositAmount: '',
        depositPaid: false,
        finalPaymentAmount: '',
        finalPaymentDueDate: '',
        paymentStatus: 'deposit_paid',
        commissionRate: '',
        commissionAmountExpected: '',
        supplierNotes: '',
        inclusionsExclusions: '',
        cancellationRules: ''
      });
    }
    setError('');
  }, [booking, isOpen]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  // Auto-calculate commission amount when rate or total cost changes
  const handleFinancialChange = (e) => {
    const { name, value } = e.target;
    const newForm = { ...form, [name]: value };

    // Auto-calculate expected commission from rate & total cost
    if ((name === 'commissionRate' || name === 'totalCost') && newForm.commissionRate && newForm.totalCost) {
      const rate = parseFloat(newForm.commissionRate) || 0;
      const total = parseFloat(newForm.totalCost) || 0;
      newForm.commissionAmountExpected = ((rate / 100) * total).toFixed(2);
    }

    setForm(newForm);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.bookingType) {
      setError('Booking type is required');
      return;
    }

    setLoading(true);
    try {
      const isEdit = !!booking;
      const url = isEdit
        ? `${API_BASE}/trips/${tripId}/bookings/${booking.id}`
        : `${API_BASE}/trips/${tripId}/bookings`;
      const method = isEdit ? 'PUT' : 'POST';

      const payload = {
        ...form,
        totalCost: form.totalCost ? parseFloat(form.totalCost) : 0,
        depositAmount: form.depositAmount ? parseFloat(form.depositAmount) : 0,
        finalPaymentAmount: form.finalPaymentAmount ? parseFloat(form.finalPaymentAmount) : 0,
        commissionRate: form.commissionRate ? parseFloat(form.commissionRate) : 0,
        commissionAmountExpected: form.commissionAmountExpected ? parseFloat(form.commissionAmountExpected) : 0
      };

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save booking');
      }

      addToast(isEdit ? 'Booking updated successfully' : 'Booking created successfully', 'success');
      onSaved(data.booking);
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
      <div className="modal-content modal-lg" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflow: 'auto' }}>
        <div className="modal-header">
          <h2 className="modal-title">{booking ? 'Edit Booking' : 'Add Booking'}</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="auth-error">{error}</div>}

            {/* Booking Type & Status */}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="bookingType">Booking Type *</label>
                <select
                  id="bookingType"
                  name="bookingType"
                  className="form-input"
                  value={form.bookingType}
                  onChange={handleChange}
                  required
                >
                  {BOOKING_TYPES.map(bt => (
                    <option key={bt.value} value={bt.value}>{bt.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="bookingStatus">Booking Status</label>
                <select
                  id="bookingStatus"
                  name="status"
                  className="form-input"
                  value={form.status}
                  onChange={handleChange}
                >
                  {BOOKING_STATUSES.map(bs => (
                    <option key={bs.value} value={bs.value}>{bs.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Supplier & Confirmation */}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="supplierName">Supplier/Vendor</label>
                <input
                  id="supplierName"
                  name="supplierName"
                  className="form-input"
                  value={form.supplierName}
                  onChange={handleChange}
                  placeholder="e.g., Royal Caribbean, Marriott"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="confirmationNumber">Confirmation Number</label>
                <input
                  id="confirmationNumber"
                  name="confirmationNumber"
                  className="form-input"
                  value={form.confirmationNumber}
                  onChange={handleChange}
                  placeholder="e.g., ABC12345"
                />
              </div>
            </div>

            {/* Dates */}
            <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="bookingDate">Booking Date</label>
                <input
                  id="bookingDate"
                  name="bookingDate"
                  type="date"
                  className="form-input"
                  value={form.bookingDate}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="bkTravelStart">Travel Start</label>
                <input
                  id="bkTravelStart"
                  name="travelStartDate"
                  type="date"
                  className="form-input"
                  value={form.travelStartDate}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="bkTravelEnd">Travel End</label>
                <input
                  id="bkTravelEnd"
                  name="travelEndDate"
                  type="date"
                  className="form-input"
                  value={form.travelEndDate}
                  onChange={handleChange}
                />
              </div>
            </div>

            {/* Financial Section */}
            <div className="detail-section" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.5rem' }}>
              <h3 className="detail-section-title" style={{ fontSize: '0.9375rem', marginBottom: '1rem' }}>Financial Details</h3>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="totalCost">Total Cost ($)</label>
                  <input
                    id="totalCost"
                    name="totalCost"
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-input"
                    value={form.totalCost}
                    onChange={handleFinancialChange}
                    placeholder="0.00"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="depositAmount">Deposit Amount ($)</label>
                  <input
                    id="depositAmount"
                    name="depositAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-input"
                    value={form.depositAmount}
                    onChange={handleChange}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="finalPaymentAmount">Final Payment Amount ($)</label>
                  <input
                    id="finalPaymentAmount"
                    name="finalPaymentAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-input"
                    value={form.finalPaymentAmount}
                    onChange={handleChange}
                    placeholder="0.00"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="finalPaymentDueDate">Final Payment Due Date</label>
                  <input
                    id="finalPaymentDueDate"
                    name="finalPaymentDueDate"
                    type="date"
                    className="form-input"
                    value={form.finalPaymentDueDate}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="paymentStatus">Payment Status</label>
                  <select
                    id="paymentStatus"
                    name="paymentStatus"
                    className="form-input"
                    value={form.paymentStatus}
                    onChange={handleChange}
                  >
                    {PAYMENT_STATUSES.map(ps => (
                      <option key={ps.value} value={ps.value}>{ps.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '0.375rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      name="depositPaid"
                      checked={form.depositPaid}
                      onChange={handleChange}
                      style={{ width: '18px', height: '18px' }}
                    />
                    <span className="form-label" style={{ marginBottom: 0 }}>Deposit Paid</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Commission Section */}
            <div className="detail-section" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.5rem' }}>
              <h3 className="detail-section-title" style={{ fontSize: '0.9375rem', marginBottom: '1rem' }}>Commission</h3>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="commissionRate">Commission Rate (%)</label>
                  <input
                    id="commissionRate"
                    name="commissionRate"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    className="form-input"
                    value={form.commissionRate}
                    onChange={handleFinancialChange}
                    placeholder="e.g., 10"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="commissionAmountExpected">Expected Commission ($)</label>
                  <input
                    id="commissionAmountExpected"
                    name="commissionAmountExpected"
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-input"
                    value={form.commissionAmountExpected}
                    onChange={handleChange}
                    placeholder="Auto-calculated or manual"
                  />
                </div>
              </div>
            </div>

            {/* Notes Section */}
            <div className="detail-section" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.5rem' }}>
              <h3 className="detail-section-title" style={{ fontSize: '0.9375rem', marginBottom: '1rem' }}>Notes</h3>
              <div className="form-group">
                <label className="form-label" htmlFor="supplierNotes">Supplier Notes</label>
                <textarea
                  id="supplierNotes"
                  name="supplierNotes"
                  className="form-input form-textarea"
                  value={form.supplierNotes}
                  onChange={handleChange}
                  placeholder="Notes about this supplier..."
                  rows={2}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="inclusionsExclusions">What's Included/Excluded</label>
                <textarea
                  id="inclusionsExclusions"
                  name="inclusionsExclusions"
                  className="form-input form-textarea"
                  value={form.inclusionsExclusions}
                  onChange={handleChange}
                  placeholder="Inclusions and exclusions..."
                  rows={2}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="cancellationRules">Change/Cancellation Rules</label>
                <textarea
                  id="cancellationRules"
                  name="cancellationRules"
                  className="form-input form-textarea"
                  value={form.cancellationRules}
                  onChange={handleChange}
                  placeholder="Cancellation policy details..."
                  rows={2}
                />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : (booking ? 'Save Changes' : 'Add Booking')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =================== COMMISSION STATUS MODAL =================== */
const COMMISSION_STATUS_OPTIONS = [
  { value: 'expected', label: 'Expected', description: 'Commission is expected from this booking' },
  { value: 'submitted', label: 'Submitted', description: 'Commission claim has been submitted to supplier' },
  { value: 'paid', label: 'Paid', description: 'Commission has been received' }
];

function CommissionStatusModal({ isOpen, onClose, onSaved, booking, tripId, token, isAdmin }) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    commissionStatus: '',
    commissionAmountReceived: '',
    commissionReceivedDate: '',
    commissionPaymentReference: '',
    commissionVarianceNote: ''
  });

  useEffect(() => {
    if (booking) {
      setForm({
        commissionStatus: booking.commissionStatus || 'expected',
        commissionAmountReceived: booking.commissionAmountReceived || '',
        commissionReceivedDate: booking.commissionReceivedDate || '',
        commissionPaymentReference: booking.commissionPaymentReference || '',
        commissionVarianceNote: booking.commissionVarianceNote || ''
      });
    }
    setError('');
  }, [booking, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate: if changing to paid, amount received is required
    if (form.commissionStatus === 'paid' && !form.commissionAmountReceived) {
      setError('Amount received is required when marking commission as paid');
      return;
    }

    setLoading(true);
    try {
      // Use the commission-specific endpoint
      const res = await fetch(`${API_BASE}/trips/${tripId}/bookings/${booking.id}/commission`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          commissionStatus: form.commissionStatus,
          commissionAmountReceived: form.commissionAmountReceived ? parseFloat(form.commissionAmountReceived) : null,
          commissionReceivedDate: form.commissionReceivedDate || null,
          commissionPaymentReference: form.commissionPaymentReference || null,
          commissionVarianceNote: form.commissionVarianceNote || null
        })
      });

      const data = await res.json();

      if (res.status === 202) {
        // Approval required (non-admin user)
        addToast('Commission status change requires admin approval. Request submitted.', 'info');
        onClose();
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update commission status');
      }

      addToast('Commission status updated successfully', 'success');
      onSaved(data.booking);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !booking) return null;

  const currentStatus = booking.commissionStatus || 'expected';
  const newStatus = form.commissionStatus;
  const showPaymentFields = newStatus === 'paid';
  const statusChanged = newStatus !== currentStatus;

  // Calculate variance if amount received differs from expected
  const variance = form.commissionAmountReceived && booking.commissionAmountExpected
    ? parseFloat(form.commissionAmountReceived) - booking.commissionAmountExpected
    : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-md" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Update Commission Status</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="auth-error">{error}</div>}

            {/* Current Commission Info */}
            <div style={{
              marginBottom: '1.25rem',
              padding: '1rem',
              background: 'var(--bg-secondary, #f8f9fa)',
              borderRadius: '8px',
              border: '1px solid var(--border-color)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Booking</span>
                <span style={{ fontWeight: 600 }}>
                  {BOOKING_TYPES.find(bt => bt.value === booking.bookingType)?.label || booking.bookingType}
                  {booking.supplierName ? ` — ${booking.supplierName}` : ''}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Expected Amount</span>
                <span style={{ fontWeight: 700, color: 'var(--color-info, #1a56db)' }}>
                  {formatCurrency(booking.commissionAmountExpected)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Current Status</span>
                <span className={`status-badge ${COMMISSION_STATUS_COLORS[currentStatus]}`}>
                  {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}
                </span>
              </div>
            </div>

            {/* Commission Status Selector */}
            <div className="form-group">
              <label className="form-label">New Commission Status</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {COMMISSION_STATUS_OPTIONS.map(option => (
                  <label
                    key={option.value}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.75rem',
                      padding: '0.75rem',
                      border: form.commissionStatus === option.value
                        ? '2px solid var(--color-primary, #1a56db)'
                        : '1px solid var(--border-color)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: form.commissionStatus === option.value
                        ? 'var(--color-primary-light, #eff6ff)'
                        : 'transparent'
                    }}
                  >
                    <input
                      type="radio"
                      name="commissionStatus"
                      value={option.value}
                      checked={form.commissionStatus === option.value}
                      onChange={handleChange}
                      style={{ marginTop: '0.125rem' }}
                    />
                    <div>
                      <div style={{ fontWeight: 500 }}>{option.label}</div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                        {option.description}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Payment Fields (shown when status is "paid") */}
            {showPaymentFields && (
              <div style={{
                marginTop: '1rem',
                paddingTop: '1rem',
                borderTop: '1px solid var(--border-color)'
              }}>
                <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9375rem' }}>Payment Details</h4>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="commissionAmountReceived">Amount Received ($) *</label>
                    <input
                      id="commissionAmountReceived"
                      name="commissionAmountReceived"
                      type="number"
                      step="0.01"
                      min="0"
                      className="form-input"
                      value={form.commissionAmountReceived}
                      onChange={handleChange}
                      placeholder={booking.commissionAmountExpected?.toString() || '0.00'}
                      required
                    />
                    {variance !== null && variance !== 0 && (
                      <p style={{
                        fontSize: '0.8125rem',
                        marginTop: '0.25rem',
                        color: variance > 0 ? 'var(--color-success, #059669)' : 'var(--color-error, #dc2626)'
                      }}>
                        {variance > 0 ? '+' : ''}{formatCurrency(variance)} {variance > 0 ? 'over' : 'under'} expected
                      </p>
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="commissionReceivedDate">Date Received</label>
                    <input
                      id="commissionReceivedDate"
                      name="commissionReceivedDate"
                      type="date"
                      className="form-input"
                      value={form.commissionReceivedDate}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="commissionPaymentReference">Payment Reference</label>
                  <input
                    id="commissionPaymentReference"
                    name="commissionPaymentReference"
                    className="form-input"
                    value={form.commissionPaymentReference}
                    onChange={handleChange}
                    placeholder="e.g., Check #1234, EFT Reference, etc."
                  />
                </div>

                {variance !== null && variance !== 0 && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="commissionVarianceNote">Variance Note</label>
                    <textarea
                      id="commissionVarianceNote"
                      name="commissionVarianceNote"
                      className="form-input form-textarea"
                      value={form.commissionVarianceNote}
                      onChange={handleChange}
                      placeholder="Explain why the amount received differs from expected..."
                      rows={2}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Approval warning for non-admins */}
            {!isAdmin && statusChanged && (
              <div style={{
                marginTop: '1rem',
                padding: '0.75rem',
                background: 'var(--color-warning-light, #fef3c7)',
                border: '1px solid var(--color-warning, #f59e0b)',
                borderRadius: '8px',
                fontSize: '0.875rem'
              }}>
                <strong>Note:</strong> Commission status changes require admin approval.
                Your request will be submitted for review.
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !statusChanged}
            >
              {loading ? 'Saving...' : (isAdmin ? 'Update Status' : 'Request Change')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =================== BOOKINGS TAB =================== */
function BookingsTab({ tripId, token }) {
  const { addToast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [bookings, setBookings] = useState([]);
  const [totals, setTotals] = useState({});
  const [loading, setLoading] = useState(true);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [editBooking, setEditBooking] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showCommissionModal, setShowCommissionModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [bookingToDelete, setBookingToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchBookings = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/trips/${tripId}/bookings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setBookings(data.bookings || []);
        setTotals(data.totals || {});
      }
    } catch (err) {
      console.error('Failed to load bookings:', err);
    } finally {
      setLoading(false);
    }
  }, [tripId, token]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const handleBookingSaved = (savedBooking) => {
    fetchBookings();
    setSelectedBooking(null);
  };

  const handleDeleteBookingClick = (booking) => {
    setBookingToDelete(booking);
    setShowDeleteConfirm(true);
  };

  const handleDeleteBookingConfirm = async () => {
    if (!bookingToDelete) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`${API_BASE}/trips/${tripId}/bookings/${bookingToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete booking');
      }
      addToast('Booking deleted successfully', 'success');
      setShowDeleteConfirm(false);
      setBookingToDelete(null);
      fetchBookings();
      setSelectedBooking(null);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen" style={{ minHeight: '120px' }}>
        <div className="loading-spinner" />
        <p>Loading bookings...</p>
      </div>
    );
  }

  // Booking detail view
  if (selectedBooking) {
    const b = selectedBooking;
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <button className="btn btn-outline btn-sm" onClick={() => setSelectedBooking(null)}>
            ← Back to Bookings
          </button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-primary btn-sm" onClick={() => { setEditBooking(b); setShowBookingModal(true); }}>
              Edit
            </button>
            <button className="btn btn-sm" style={{ background: 'var(--color-error)', color: '#fff', border: 'none' }}
              onClick={() => handleDeleteBookingClick(b)}>
              Delete
            </button>
          </div>
        </div>

        <div className="detail-card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.125rem' }}>
              {BOOKING_TYPES.find(bt => bt.value === b.bookingType)?.label || b.bookingType}
              {b.supplierName ? ` — ${b.supplierName}` : ''}
            </h3>
            <span className={`status-badge ${BOOKING_STATUS_COLORS[b.status]}`}>
              {BOOKING_STATUSES.find(bs => bs.value === b.status)?.label || b.status}
            </span>
          </div>

          <div className="detail-grid">
            <div className="detail-field">
              <span className="detail-field-label">Confirmation #</span>
              <span className="detail-field-value">{b.confirmationNumber || '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-field-label">Booking Date</span>
              <span className="detail-field-value">{formatDate(b.bookingDate)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-field-label">Travel Start</span>
              <span className="detail-field-value">{formatDate(b.travelStartDate)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-field-label">Travel End</span>
              <span className="detail-field-value">{formatDate(b.travelEndDate)}</span>
            </div>
          </div>

          {/* Financial Details */}
          <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '1rem', paddingTop: '1rem' }}>
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9375rem', color: 'var(--text-secondary)' }}>Financial Details</h4>
            <div className="detail-grid">
              <div className="detail-field">
                <span className="detail-field-label">Total Cost</span>
                <span className="detail-field-value" style={{ fontWeight: 600 }}>{formatCurrency(b.totalCost)}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Deposit Amount</span>
                <span className="detail-field-value">{formatCurrency(b.depositAmount)}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Deposit Paid</span>
                <span className={`status-badge ${b.depositPaid ? 'status-success' : 'status-warning'}`}>
                  {b.depositPaid ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Final Payment</span>
                <span className="detail-field-value">{formatCurrency(b.finalPaymentAmount)}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Final Payment Due</span>
                <span className={`detail-field-value ${isPaymentOverdue(b) ? 'payment-overdue' : ''}`}>
                  {formatDate(b.finalPaymentDueDate)}
                  {isPaymentOverdue(b) && <span className="overdue-badge">OVERDUE</span>}
                </span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Payment Status</span>
                <span className={`status-badge ${PAYMENT_STATUS_COLORS[b.paymentStatus]} ${isPaymentOverdue(b) ? 'status-overdue' : ''}`}>
                  {PAYMENT_STATUSES.find(ps => ps.value === b.paymentStatus)?.label || b.paymentStatus}
                  {isPaymentOverdue(b) && ' (Overdue)'}
                </span>
              </div>
            </div>
          </div>

          {/* Commission Details */}
          <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '1rem', paddingTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.9375rem', color: 'var(--text-secondary)' }}>Commission</h4>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => setShowCommissionModal(true)}
                style={{ fontSize: '0.75rem', padding: '0.375rem 0.75rem' }}
              >
                Update Status
              </button>
            </div>
            <div className="detail-grid">
              <div className="detail-field">
                <span className="detail-field-label">Commission Rate</span>
                <span className="detail-field-value">{b.commissionRate ? `${b.commissionRate}%` : '—'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Expected Amount</span>
                <span className="detail-field-value" style={{ fontWeight: 600 }}>{formatCurrency(b.commissionAmountExpected)}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Commission Status</span>
                <span className={`status-badge ${COMMISSION_STATUS_COLORS[b.commissionStatus]}`}>
                  {b.commissionStatus ? b.commissionStatus.charAt(0).toUpperCase() + b.commissionStatus.slice(1) : 'Expected'}
                </span>
              </div>
              {b.commissionAmountReceived != null && b.commissionAmountReceived > 0 && (
                <div className="detail-field">
                  <span className="detail-field-label">Amount Received</span>
                  <span className="detail-field-value" style={{ fontWeight: 600, color: 'var(--color-success, #059669)' }}>
                    {formatCurrency(b.commissionAmountReceived)}
                  </span>
                </div>
              )}
              {/* Variance Flag - shown when received differs from expected */}
              {b.commissionAmountReceived != null && b.commissionAmountExpected != null &&
               b.commissionAmountReceived !== b.commissionAmountExpected && (
                <div className="detail-field">
                  <span className="detail-field-label">Variance</span>
                  {(() => {
                    const variance = b.commissionAmountReceived - b.commissionAmountExpected;
                    const isUnderpaid = variance < 0;
                    const isOverpaid = variance > 0;
                    return (
                      <span
                        className={`status-badge ${isUnderpaid ? 'status-error' : 'status-success'}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}
                      >
                        {isUnderpaid ? '⚠️ Underpaid' : '✓ Overpaid'}
                        <span style={{ fontWeight: 600 }}>
                          ({isOverpaid ? '+' : ''}{formatCurrency(variance)})
                        </span>
                      </span>
                    );
                  })()}
                </div>
              )}
              {b.commissionReceivedDate && (
                <div className="detail-field">
                  <span className="detail-field-label">Date Received</span>
                  <span className="detail-field-value">{formatDate(b.commissionReceivedDate)}</span>
                </div>
              )}
              {b.commissionPaymentReference && (
                <div className="detail-field">
                  <span className="detail-field-label">Payment Reference</span>
                  <span className="detail-field-value">{b.commissionPaymentReference}</span>
                </div>
              )}
              {b.commissionVarianceNote && (
                <div className="detail-field" style={{ gridColumn: '1 / -1' }}>
                  <span className="detail-field-label">Variance Note</span>
                  <span className="detail-field-value">{b.commissionVarianceNote}</span>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          {(b.supplierNotes || b.inclusionsExclusions || b.cancellationRules) && (
            <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '1rem', paddingTop: '1rem' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9375rem', color: 'var(--text-secondary)' }}>Notes</h4>
              {b.supplierNotes && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <span className="detail-field-label" style={{ display: 'block', marginBottom: '0.25rem' }}>Supplier Notes</span>
                  <p className="detail-notes">{b.supplierNotes}</p>
                </div>
              )}
              {b.inclusionsExclusions && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <span className="detail-field-label" style={{ display: 'block', marginBottom: '0.25rem' }}>Inclusions/Exclusions</span>
                  <p className="detail-notes">{b.inclusionsExclusions}</p>
                </div>
              )}
              {b.cancellationRules && (
                <div>
                  <span className="detail-field-label" style={{ display: 'block', marginBottom: '0.25rem' }}>Cancellation Rules</span>
                  <p className="detail-notes">{b.cancellationRules}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <BookingFormModal
          isOpen={showBookingModal}
          onClose={() => { setShowBookingModal(false); setEditBooking(null); }}
          onSaved={handleBookingSaved}
          booking={editBooking}
          tripId={tripId}
          token={token}
        />

        <CommissionStatusModal
          isOpen={showCommissionModal}
          onClose={() => setShowCommissionModal(false)}
          onSaved={(updatedBooking) => {
            setSelectedBooking(updatedBooking);
            fetchBookings();
          }}
          booking={selectedBooking}
          tripId={tripId}
          token={token}
          isAdmin={isAdmin}
        />

        {/* Delete Booking Confirmation Modal (Detail View) */}
        {showDeleteConfirm && bookingToDelete && (
          <div className="modal-overlay" onClick={() => { setShowDeleteConfirm(false); setBookingToDelete(null); }}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title" style={{ color: 'var(--color-error, #dc2626)' }}>
                  Delete Booking
                </h2>
                <button
                  className="modal-close-btn"
                  onClick={() => { setShowDeleteConfirm(false); setBookingToDelete(null); }}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                <div style={{
                  background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                  border: '1px solid var(--color-error, #dc2626)',
                  borderRadius: '8px',
                  padding: '1rem 1.25rem',
                  marginBottom: '1rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>⚠️</span>
                    <span style={{ fontWeight: 600, color: '#991b1b' }}>Warning: This action cannot be undone</span>
                  </div>
                  <p style={{ fontSize: '0.875rem', color: '#b91c1c', marginBottom: 0 }}>
                    You are about to delete the booking for <strong>"{bookingToDelete.supplierName || 'Unknown Supplier'}"</strong>.
                  </p>
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  This will remove all booking details including payment and commission tracking for this booking.
                </p>
              </div>
              <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <button
                  className="btn btn-outline"
                  onClick={() => { setShowDeleteConfirm(false); setBookingToDelete(null); }}
                  disabled={deleteLoading}
                >
                  Cancel
                </button>
                <button
                  className="btn"
                  style={{
                    background: 'var(--color-error, #dc2626)',
                    color: '#fff',
                    border: 'none'
                  }}
                  onClick={handleDeleteBookingConfirm}
                  disabled={deleteLoading}
                >
                  {deleteLoading ? 'Deleting...' : 'Delete Booking'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Totals Summary */}
      {bookings.length > 0 && (
        <div className="booking-totals-bar" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '0.75rem',
          marginBottom: '1rem',
          padding: '1rem',
          background: 'var(--bg-secondary, #f8f9fa)',
          borderRadius: '8px',
          border: '1px solid var(--border-color)'
        }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Cost</div>
            <div style={{ fontSize: '1.125rem', fontWeight: 700 }}>{formatCurrency(totals.totalCost)}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Deposits</div>
            <div style={{ fontSize: '1.125rem', fontWeight: 700 }}>{formatCurrency(totals.totalDeposit)}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Final Payments</div>
            <div style={{ fontSize: '1.125rem', fontWeight: 700 }}>{formatCurrency(totals.totalFinalPayment)}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Commission Expected</div>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-info, #1a56db)' }}>{formatCurrency(totals.totalCommissionExpected)}</div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0 }}>Bookings ({bookings.length})</h3>
        <button className="btn btn-primary btn-sm" onClick={() => { setEditBooking(null); setShowBookingModal(true); }}>
          + Add Booking
        </button>
      </div>

      {bookings.length === 0 ? (
        <div className="page-empty-state" style={{ padding: '2rem' }}>
          <h3 className="empty-state-title">No bookings yet</h3>
          <p className="empty-state-description">Add bookings to track hotels, cruises, tours, and other travel arrangements.</p>
          <button className="btn btn-primary" style={{ marginTop: 'var(--spacing-md)' }} onClick={() => { setEditBooking(null); setShowBookingModal(true); }}>
            + Add First Booking
          </button>
        </div>
      ) : (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Supplier</th>
                <th>Status</th>
                <th>Total Cost</th>
                <th>Payment</th>
                <th>Commission</th>
                <th>Dates</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map(b => (
                <tr key={b.id} className="data-table-row-clickable" onClick={() => setSelectedBooking(b)}>
                  <td>
                    <span className="table-user-name">
                      {BOOKING_TYPES.find(bt => bt.value === b.bookingType)?.label || b.bookingType}
                    </span>
                    {b.confirmationNumber && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>#{b.confirmationNumber}</div>}
                  </td>
                  <td>{b.supplierName || '—'}</td>
                  <td>
                    <span className={`status-badge ${BOOKING_STATUS_COLORS[b.status]}`}>
                      {BOOKING_STATUSES.find(bs => bs.value === b.status)?.label || b.status}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{formatCurrency(b.totalCost)}</td>
                  <td>
                    <span className={`status-badge ${PAYMENT_STATUS_COLORS[b.paymentStatus]}`}>
                      {PAYMENT_STATUSES.find(ps => ps.value === b.paymentStatus)?.label || b.paymentStatus}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge ${COMMISSION_STATUS_COLORS[b.commissionStatus]}`}>
                      {b.commissionStatus ? b.commissionStatus.charAt(0).toUpperCase() + b.commissionStatus.slice(1) : '—'}
                    </span>
                    {b.commissionAmountExpected > 0 && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{formatCurrency(b.commissionAmountExpected)}</div>
                    )}
                  </td>
                  <td style={{ fontSize: '0.8125rem' }}>
                    {formatDate(b.travelStartDate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BookingFormModal
        isOpen={showBookingModal}
        onClose={() => { setShowBookingModal(false); setEditBooking(null); }}
        onSaved={handleBookingSaved}
        booking={editBooking}
        tripId={tripId}
        token={token}
      />

      {/* Delete Booking Confirmation Modal */}
      {showDeleteConfirm && bookingToDelete && (
        <div className="modal-overlay" onClick={() => { setShowDeleteConfirm(false); setBookingToDelete(null); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ color: 'var(--color-error, #dc2626)' }}>
                Delete Booking
              </h2>
              <button
                className="modal-close-btn"
                onClick={() => { setShowDeleteConfirm(false); setBookingToDelete(null); }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div style={{
                background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                border: '1px solid var(--color-error, #dc2626)',
                borderRadius: '8px',
                padding: '1rem 1.25rem',
                marginBottom: '1rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>⚠️</span>
                  <span style={{ fontWeight: 600, color: '#991b1b' }}>Warning: This action cannot be undone</span>
                </div>
                <p style={{ fontSize: '0.875rem', color: '#b91c1c', marginBottom: 0 }}>
                  You are about to delete the booking for <strong>"{bookingToDelete.supplierName || 'Unknown Supplier'}"</strong>.
                </p>
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                This will remove all booking details including payment and commission tracking for this booking.
              </p>
            </div>
            <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
              <button
                className="btn btn-outline"
                onClick={() => { setShowDeleteConfirm(false); setBookingToDelete(null); }}
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button
                className="btn"
                style={{
                  background: 'var(--color-error, #dc2626)',
                  color: '#fff',
                  border: 'none'
                }}
                onClick={handleDeleteBookingConfirm}
                disabled={deleteLoading}
              >
                {deleteLoading ? 'Deleting...' : 'Delete Booking'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =================== COMMISSIONS TAB =================== */
function CommissionsTab({ tripId, token }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showCommissionModal, setShowCommissionModal] = useState(false);

  const fetchCommissions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/trips/${tripId}/bookings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setBookings(data.bookings || []);
      }
    } catch (err) {
      console.error('Failed to load commissions:', err);
    } finally {
      setLoading(false);
    }
  }, [tripId, token]);

  useEffect(() => {
    fetchCommissions();
  }, [fetchCommissions]);

  if (loading) {
    return (
      <div className="loading-screen" style={{ minHeight: '120px' }}>
        <div className="loading-spinner" />
        <p>Loading commissions...</p>
      </div>
    );
  }

  const commissionsData = bookings.filter(b => b.commissionAmountExpected > 0 || b.commissionStatus !== 'expected');
  const totalExpected = commissionsData.reduce((sum, b) => sum + (b.commissionAmountExpected || 0), 0);
  const totalReceived = commissionsData.reduce((sum, b) => sum + (b.commissionAmountReceived || 0), 0);
  const pendingCount = commissionsData.filter(b => b.commissionStatus !== 'paid').length;

  return (
    <div>
      {/* Summary cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '0.75rem',
        marginBottom: '1rem'
      }}>
        <div style={{ padding: '1rem', background: 'var(--bg-secondary, #f8f9fa)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Expected</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-info, #1a56db)' }}>{formatCurrency(totalExpected)}</div>
        </div>
        <div style={{ padding: '1rem', background: 'var(--bg-secondary, #f8f9fa)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Received</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-success, #059669)' }}>{formatCurrency(totalReceived)}</div>
        </div>
        <div style={{ padding: '1rem', background: 'var(--bg-secondary, #f8f9fa)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Pending</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: pendingCount > 0 ? 'var(--color-warning, #f59e0b)' : 'var(--color-success, #059669)' }}>{pendingCount}</div>
        </div>
      </div>

      {commissionsData.length === 0 ? (
        <div className="page-empty-state" style={{ padding: '2rem' }}>
          <h3 className="empty-state-title">No commission data</h3>
          <p className="empty-state-description">Commission data will appear here once bookings with commission rates are created.</p>
        </div>
      ) : (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Booking</th>
                <th>Supplier</th>
                <th>Rate</th>
                <th>Expected</th>
                <th>Received</th>
                <th>Variance</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {commissionsData.map(b => {
                const hasVariance = b.commissionAmountReceived != null && b.commissionAmountExpected != null &&
                                   b.commissionAmountReceived !== b.commissionAmountExpected;
                const variance = hasVariance ? (b.commissionAmountReceived - b.commissionAmountExpected) : null;
                const isUnderpaid = variance !== null && variance < 0;
                const isOverpaid = variance !== null && variance > 0;

                return (
                <tr key={b.id}>
                  <td>
                    <span className="table-user-name">
                      {BOOKING_TYPES.find(bt => bt.value === b.bookingType)?.label || b.bookingType}
                    </span>
                  </td>
                  <td>{b.supplierName || '—'}</td>
                  <td>{b.commissionRate ? `${b.commissionRate}%` : '—'}</td>
                  <td style={{ fontWeight: 600 }}>{formatCurrency(b.commissionAmountExpected)}</td>
                  <td style={{ color: b.commissionAmountReceived > 0 ? 'var(--color-success, #059669)' : 'inherit' }}>
                    {b.commissionAmountReceived != null && b.commissionAmountReceived > 0 ? formatCurrency(b.commissionAmountReceived) : '—'}
                  </td>
                  <td>
                    {hasVariance ? (
                      <span
                        className={`status-badge ${isUnderpaid ? 'status-error' : 'status-success'}`}
                        title={b.commissionVarianceNote || ''}
                      >
                        {isUnderpaid ? '⚠️ Underpaid' : '✓ Overpaid'}
                        <span style={{ marginLeft: '0.25rem', fontWeight: 600 }}>
                          ({isOverpaid ? '+' : ''}{formatCurrency(variance)})
                        </span>
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)' }}>—</span>
                    )}
                  </td>
                  <td>
                    <span className={`status-badge ${COMMISSION_STATUS_COLORS[b.commissionStatus]}`}>
                      {b.commissionStatus ? b.commissionStatus.charAt(0).toUpperCase() + b.commissionStatus.slice(1) : 'Expected'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => { setSelectedBooking(b); setShowCommissionModal(true); }}
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                    >
                      Update
                    </button>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )}

      <CommissionStatusModal
        isOpen={showCommissionModal}
        onClose={() => { setShowCommissionModal(false); setSelectedBooking(null); }}
        onSaved={(updatedBooking) => {
          fetchCommissions();
          setSelectedBooking(null);
        }}
        booking={selectedBooking}
        tripId={tripId}
        token={token}
        isAdmin={isAdmin}
      />
    </div>
  );
}

/* =================== TRAVELER FORM MODAL =================== */
function TravelerFormModal({ isOpen, onClose, onSaved, traveler, tripId, token }) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    fullLegalName: '',
    dateOfBirth: '',
    passportStatus: 'unknown',
    passportExpiration: '',
    specialNeeds: '',
    relationshipToClient: ''
  });

  useEffect(() => {
    if (traveler) {
      setForm({
        fullLegalName: traveler.fullLegalName || '',
        dateOfBirth: traveler.dateOfBirth || '',
        passportStatus: traveler.passportStatus || 'unknown',
        passportExpiration: traveler.passportExpiration || '',
        specialNeeds: traveler.specialNeeds || '',
        relationshipToClient: traveler.relationshipToClient || ''
      });
    } else {
      setForm({
        fullLegalName: '',
        dateOfBirth: '',
        passportStatus: 'unknown',
        passportExpiration: '',
        specialNeeds: '',
        relationshipToClient: ''
      });
    }
    setError('');
  }, [traveler, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.fullLegalName.trim()) {
      setError('Full legal name is required');
      return;
    }

    setLoading(true);
    try {
      const isEdit = !!traveler;
      const url = isEdit
        ? `${API_BASE}/trips/${tripId}/travelers/${traveler.id}`
        : `${API_BASE}/trips/${tripId}/travelers`;
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
        throw new Error(data.error || 'Failed to save traveler');
      }

      addToast(isEdit ? 'Traveler updated successfully' : 'Traveler added successfully', 'success');
      onSaved(data.traveler);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const derivedAge = calculateAge(form.dateOfBirth);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{traveler ? 'Edit Traveler' : 'Add Traveler'}</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="auth-error">{error}</div>}

            <div className="form-group">
              <label className="form-label" htmlFor="fullLegalName">Full Legal Name *</label>
              <input
                id="fullLegalName"
                name="fullLegalName"
                className="form-input"
                value={form.fullLegalName}
                onChange={handleChange}
                placeholder="e.g., John Michael Smith"
                required
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Enter name exactly as it appears on travel documents
              </p>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="dateOfBirth">Date of Birth</label>
                <input
                  id="dateOfBirth"
                  name="dateOfBirth"
                  type="date"
                  className="form-input"
                  value={form.dateOfBirth}
                  onChange={handleChange}
                />
                {derivedAge !== null && (
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    Age: <strong>{derivedAge} years old</strong>
                  </p>
                )}
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="relationshipToClient">Relationship to Client</label>
                <input
                  id="relationshipToClient"
                  name="relationshipToClient"
                  className="form-input"
                  value={form.relationshipToClient}
                  onChange={handleChange}
                  placeholder="e.g., Spouse, Child, Friend"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="passportStatus">Passport Status</label>
                <select
                  id="passportStatus"
                  name="passportStatus"
                  className="form-input"
                  value={form.passportStatus}
                  onChange={handleChange}
                >
                  {PASSPORT_STATUSES.map(ps => (
                    <option key={ps.value} value={ps.value}>{ps.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="passportExpiration">Passport Expiration</label>
                <input
                  id="passportExpiration"
                  name="passportExpiration"
                  type="date"
                  className="form-input"
                  value={form.passportExpiration}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="specialNeeds">Special Needs</label>
              <textarea
                id="specialNeeds"
                name="specialNeeds"
                className="form-input form-textarea"
                value={form.specialNeeds}
                onChange={handleChange}
                placeholder="Dietary restrictions, mobility requirements, medical notes, etc."
                rows={3}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : (traveler ? 'Save Changes' : 'Add Traveler')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =================== TRAVELERS TAB =================== */
function TravelersTab({ tripId, token }) {
  const { addToast } = useToast();
  const [travelers, setTravelers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTravelerModal, setShowTravelerModal] = useState(false);
  const [editTraveler, setEditTraveler] = useState(null);
  const [selectedTraveler, setSelectedTraveler] = useState(null);

  const fetchTravelers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/trips/${tripId}/travelers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setTravelers(data.travelers || []);
      }
    } catch (err) {
      console.error('Failed to load travelers:', err);
    } finally {
      setLoading(false);
    }
  }, [tripId, token]);

  useEffect(() => {
    fetchTravelers();
  }, [fetchTravelers]);

  const handleTravelerSaved = (savedTraveler) => {
    fetchTravelers();
    setSelectedTraveler(null);
  };

  const handleDeleteTraveler = async (travelerId) => {
    if (!window.confirm('Are you sure you want to remove this traveler? This action cannot be undone.')) return;
    try {
      const res = await fetch(`${API_BASE}/trips/${tripId}/travelers/${travelerId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove traveler');
      }
      addToast('Traveler removed successfully', 'success');
      fetchTravelers();
      setSelectedTraveler(null);
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  if (loading) {
    return (
      <div className="loading-screen" style={{ minHeight: '120px' }}>
        <div className="loading-spinner" />
        <p>Loading travelers...</p>
      </div>
    );
  }

  // Traveler detail view
  if (selectedTraveler) {
    const t = selectedTraveler;
    const age = calculateAge(t.dateOfBirth);
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <button className="btn btn-outline btn-sm" onClick={() => setSelectedTraveler(null)}>
            ← Back to Travelers
          </button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-primary btn-sm" onClick={() => { setEditTraveler(t); setShowTravelerModal(true); }}>
              Edit
            </button>
            <button className="btn btn-sm" style={{ background: 'var(--color-error)', color: '#fff', border: 'none' }}
              onClick={() => handleDeleteTraveler(t.id)}>
              Remove
            </button>
          </div>
        </div>

        <div className="detail-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1.25rem 0', fontSize: '1.125rem' }}>{t.fullLegalName}</h3>

          <div className="detail-grid">
            <div className="detail-field">
              <span className="detail-field-label">Date of Birth</span>
              <span className="detail-field-value">{formatDate(t.dateOfBirth)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-field-label">Age</span>
              <span className="detail-field-value" style={{ fontWeight: 600 }}>{age !== null ? `${age} years old` : '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-field-label">Relationship to Client</span>
              <span className="detail-field-value">{t.relationshipToClient || '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-field-label">Passport Status</span>
              <span className={`status-badge ${PASSPORT_STATUS_COLORS[t.passportStatus]}`}>
                {PASSPORT_STATUSES.find(ps => ps.value === t.passportStatus)?.label || t.passportStatus}
              </span>
            </div>
            <div className="detail-field">
              <span className="detail-field-label">Passport Expiration</span>
              <span className="detail-field-value">{formatDate(t.passportExpiration)}</span>
            </div>
          </div>

          {t.specialNeeds && (
            <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '1rem', paddingTop: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9375rem', color: 'var(--text-secondary)' }}>Special Needs</h4>
              <p className="detail-notes">{t.specialNeeds}</p>
            </div>
          )}
        </div>

        <TravelerFormModal
          isOpen={showTravelerModal}
          onClose={() => { setShowTravelerModal(false); setEditTraveler(null); }}
          onSaved={handleTravelerSaved}
          traveler={editTraveler}
          tripId={tripId}
          token={token}
        />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0 }}>Travelers ({travelers.length})</h3>
        <button className="btn btn-primary btn-sm" onClick={() => { setEditTraveler(null); setShowTravelerModal(true); }}>
          + Add Traveler
        </button>
      </div>

      {travelers.length === 0 ? (
        <div className="page-empty-state" style={{ padding: '2rem' }}>
          <div className="empty-state-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87" />
              <path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
          </div>
          <h3 className="empty-state-title">No travelers yet</h3>
          <p className="empty-state-description">Add travelers to track passenger information, passport details, and special needs.</p>
          <button className="btn btn-primary" style={{ marginTop: 'var(--spacing-md)' }} onClick={() => { setEditTraveler(null); setShowTravelerModal(true); }}>
            + Add First Traveler
          </button>
        </div>
      ) : (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Full Legal Name</th>
                <th>Age</th>
                <th>Passport Status</th>
                <th>Relationship</th>
                <th>Special Needs</th>
              </tr>
            </thead>
            <tbody>
              {travelers.map(t => {
                const age = calculateAge(t.dateOfBirth);
                return (
                  <tr key={t.id} className="data-table-row-clickable" onClick={() => setSelectedTraveler(t)}>
                    <td><span className="table-user-name">{t.fullLegalName}</span></td>
                    <td>{age !== null ? `${age} yrs` : '—'}</td>
                    <td>
                      <span className={`status-badge ${PASSPORT_STATUS_COLORS[t.passportStatus]}`}>
                        {PASSPORT_STATUSES.find(ps => ps.value === t.passportStatus)?.label || t.passportStatus}
                      </span>
                    </td>
                    <td>{t.relationshipToClient || '—'}</td>
                    <td>{t.specialNeeds ? '✓' : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <TravelerFormModal
        isOpen={showTravelerModal}
        onClose={() => { setShowTravelerModal(false); setEditTraveler(null); }}
        onSaved={handleTravelerSaved}
        traveler={editTraveler}
        tripId={tripId}
        token={token}
      />
    </div>
  );
}

/* =================== DOCUMENT TYPES =================== */
const DOCUMENT_TYPES = [
  { value: 'contract', label: 'Contract' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'itinerary', label: 'Itinerary' },
  { value: 'confirmation', label: 'Confirmation' },
  { value: 'authorization', label: 'Authorization' },
  { value: 'feedback', label: 'Feedback' },
  { value: 'other', label: 'Other' }
];

/* =================== DOCUMENT UPLOAD MODAL =================== */
function DocumentUploadModal({ isOpen, onClose, onUploaded, tripId, token }) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [form, setForm] = useState({
    documentType: 'other',
    isSensitive: false,
    isClientVisible: false
  });
  const fileInputRef = React.useRef();

  useEffect(() => {
    if (isOpen) {
      setSelectedFile(null);
      setForm({ documentType: 'other', isSensitive: false, isClientVisible: false });
      setError('');
    }
  }, [isOpen]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Check file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        return;
      }
      setSelectedFile(file);
      setError('');
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!selectedFile) {
      setError('Please select a file to upload');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('documentType', form.documentType);
      formData.append('isSensitive', form.isSensitive.toString());
      formData.append('isClientVisible', form.isClientVisible.toString());

      const res = await fetch(`${API_BASE}/trips/${tripId}/documents`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload document');
      }

      addToast('Document uploaded successfully', 'success');
      onUploaded(data.document);
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
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Upload Document</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="auth-error">{error}</div>}

            <div className="form-group">
              <label className="form-label">Select File *</label>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                style={{ display: 'none' }}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png,.gif"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '2px dashed var(--border-color)',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: selectedFile ? 'var(--bg-secondary, #f8f9fa)' : 'transparent'
                }}
              >
                {selectedFile ? (
                  <div>
                    <span style={{ fontWeight: 600 }}>{selectedFile.name}</span>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                      </svg>
                    </div>
                    <span style={{ color: 'var(--color-primary, #1a56db)', fontWeight: 500 }}>Click to select a file</span>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      PDF, Word, Excel, images, or text (max 10MB)
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="documentType">Document Type</label>
              <select
                id="documentType"
                name="documentType"
                className="form-input"
                value={form.documentType}
                onChange={handleChange}
              >
                {DOCUMENT_TYPES.map(dt => (
                  <option key={dt.value} value={dt.value}>{dt.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  name="isClientVisible"
                  checked={form.isClientVisible}
                  onChange={handleChange}
                  style={{ width: '18px', height: '18px' }}
                />
                <span>Visible to client (in customer portal)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  name="isSensitive"
                  checked={form.isSensitive}
                  onChange={handleChange}
                  style={{ width: '18px', height: '18px' }}
                />
                <span>Sensitive document (passport, ID, etc.)</span>
              </label>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading || !selectedFile}>
              {loading ? 'Uploading...' : 'Upload Document'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =================== DOCUMENTS TAB =================== */
function DocumentsTab({ tripId, token }) {
  const { addToast } = useToast();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/trips/${tripId}/documents`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setDocuments(data.documents || []);
      }
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoading(false);
    }
  }, [tripId, token]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleDocumentUploaded = (doc) => {
    setDocuments(prev => [doc, ...prev]);
  };

  const handleDownload = async (doc) => {
    try {
      const res = await fetch(`${API_BASE}/trips/${tripId}/documents/${doc.id}/download`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to download');
      }

      // Check if response is JSON (metadata-only) or file
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await res.json();
        addToast(data.message || 'File is metadata-only', 'info');
        return;
      }

      // Download the file
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Are you sure you want to delete "${doc.fileName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/trips/${tripId}/documents/${doc.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete document');
      }

      addToast('Document deleted successfully', 'success');
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleToggleVisibility = async (doc) => {
    try {
      const res = await fetch(`${API_BASE}/trips/${tripId}/documents/${doc.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isClientVisible: !doc.isClientVisible })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update document');
      }

      const data = await res.json();
      addToast(`Document ${data.document.isClientVisible ? 'visible' : 'hidden'} to client`, 'success');
      setDocuments(prev => prev.map(d => d.id === doc.id ? data.document : d));
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  if (loading) {
    return (
      <div className="loading-screen" style={{ minHeight: '120px' }}>
        <div className="loading-spinner" />
        <p>Loading documents...</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0 }}>Documents ({documents.length})</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setShowUploadModal(true)}>
          + Upload Document
        </button>
      </div>

      {documents.length === 0 ? (
        <div className="page-empty-state" style={{ padding: '2rem' }}>
          <div className="empty-state-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </div>
          <h3 className="empty-state-title">No documents yet</h3>
          <p className="empty-state-description">Upload contracts, invoices, itineraries, and other trip documents.</p>
          <button className="btn btn-primary" style={{ marginTop: 'var(--spacing-md)' }} onClick={() => setShowUploadModal(true)}>
            + Upload First Document
          </button>
        </div>
      ) : (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>File Name</th>
                <th>Type</th>
                <th>Visibility</th>
                <th>Uploaded By</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map(doc => (
                <tr key={doc.id}>
                  <td>
                    <span className="table-user-name">{doc.fileName}</span>
                    {doc.isSensitive && (
                      <span className="status-badge status-warning" style={{ marginLeft: '0.5rem', fontSize: '0.625rem' }}>
                        SENSITIVE
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="status-badge status-neutral">
                      {DOCUMENT_TYPES.find(dt => dt.value === doc.documentType)?.label || doc.documentType}
                    </span>
                  </td>
                  <td>
                    <button
                      className={`status-badge ${doc.isClientVisible ? 'status-success' : 'status-neutral'}`}
                      onClick={() => handleToggleVisibility(doc)}
                      style={{ cursor: 'pointer', border: 'none' }}
                      title={doc.isClientVisible ? 'Click to hide from client' : 'Click to make visible to client'}
                    >
                      {doc.isClientVisible ? 'Client Visible' : 'Internal Only'}
                    </button>
                  </td>
                  <td>{doc.uploaderName || '—'}</td>
                  <td>{formatDate(doc.createdAt)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => handleDownload(doc)}
                        title="Download"
                      >
                        ⬇
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() => handleDelete(doc)}
                        style={{ background: 'var(--color-error)', color: '#fff', border: 'none' }}
                        title="Delete"
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DocumentUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploaded={handleDocumentUploaded}
        tripId={tripId}
        token={token}
      />
    </div>
  );
}

/* =================== TRIP DETAIL =================== */
function TripDetail({ trip, onBack, onEdit, onStageChange, onDelete, token }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePreview, setDeletePreview] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  if (!trip) return null;

  const handleDeleteClick = async () => {
    setDeleteLoading(true);
    try {
      // Fetch delete preview to show in confirmation modal
      const res = await fetch(`${API_BASE}/trips/${trip.id}/delete-preview`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDeletePreview(data);
        setShowDeleteModal(true);
      } else {
        console.error('Failed to get delete preview');
      }
    } catch (err) {
      console.error('Error fetching delete preview:', err);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    setDeleteLoading(true);
    try {
      const res = await fetch(`${API_BASE}/trips/${trip.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setShowDeleteModal(false);
        onDelete(trip.id);
      } else {
        console.error('Failed to delete trip');
      }
    } catch (err) {
      console.error('Error deleting trip:', err);
    } finally {
      setDeleteLoading(false);
    }
  };

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'travelers', label: 'Travelers' },
    { id: 'bookings', label: 'Bookings' },
    { id: 'documents', label: 'Documents' },
    { id: 'commissions', label: 'Commissions' }
  ];

  return (
    <div className="trip-detail">
      <div className="detail-header">
        <button className="btn btn-outline btn-sm" onClick={onBack}>
          ← Back to Trips
        </button>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {trip.isLocked ? (
            <button
              className="btn btn-sm"
              disabled
              style={{
                background: 'var(--color-warning, #f59e0b)',
                color: '#fff',
                border: 'none',
                opacity: 0.8,
                cursor: 'not-allowed'
              }}
              title={trip.lockReason || 'Trip is locked'}
            >
              🔒 Trip Locked
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => onEdit(trip)}>
              Edit Trip
            </button>
          )}
          <button
            className="btn btn-sm"
            style={{
              background: 'var(--color-error, #dc2626)',
              color: '#fff',
              border: 'none'
            }}
            onClick={handleDeleteClick}
            disabled={deleteLoading}
          >
            {deleteLoading ? 'Loading...' : 'Delete Trip'}
          </button>
        </div>
      </div>

      {/* Locked Trip Banner */}
      {trip.isLocked && (
        <div style={{
          background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
          border: '1px solid var(--color-warning, #f59e0b)',
          borderRadius: '8px',
          padding: '1rem 1.25rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.75rem'
        }}>
          <span style={{ fontSize: '1.5rem' }}>🔒</span>
          <div>
            <div style={{ fontWeight: 600, color: '#92400e', marginBottom: '0.25rem' }}>
              Trip is Locked
            </div>
            <div style={{ fontSize: '0.875rem', color: '#a16207' }}>
              {trip.lockReason || 'Core fields (dates, destination, pricing) cannot be edited because this trip is booked with complete payments. Contact an admin to unlock if changes are required.'}
            </div>
          </div>
        </div>
      )}

      <div className="detail-card">
        <div className="detail-card-header">
          <div>
            <h2 className="detail-name">
              {trip.isLocked && <span style={{ marginRight: '0.5rem' }}>🔒</span>}
              {trip.name}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
              <span className={`status-badge ${STAGE_COLORS[trip.stage]}`}>
                {STAGE_LABELS[trip.stage]}
              </span>
              {trip.isLocked && (
                <span className="status-badge status-warning">Locked</span>
              )}
              {trip.clientName && (
                <span className="detail-meta">Client: {trip.clientName}</span>
              )}
              {trip.assignedUserName && (
                <span className="detail-meta">Planner: {trip.assignedUserName}</span>
              )}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="trip-tabs" style={{
          display: 'flex',
          borderBottom: '2px solid var(--border-color)',
          marginBottom: '1.25rem',
          gap: '0'
        }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`trip-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '0.75rem 1.25rem',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: activeTab === tab.id ? 600 : 400,
                color: activeTab === tab.id ? 'var(--color-primary, #1a56db)' : 'var(--text-secondary)',
                borderBottom: activeTab === tab.id ? '2px solid var(--color-primary, #1a56db)' : '2px solid transparent',
                marginBottom: '-2px',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
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
                  <span className="detail-field-value">{formatDate(trip.travelStartDate)}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-field-label">Travel End</span>
                  <span className="detail-field-value">{formatDate(trip.travelEndDate)}</span>
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
                  <span className="detail-field-value">{formatDate(trip.finalPaymentDeadline)}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-field-label">Insurance Cutoff</span>
                  <span className="detail-field-value">{formatDate(trip.insuranceCutoffDate)}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-field-label">Check-in Date</span>
                  <span className="detail-field-value">{formatDate(trip.checkinDate)}</span>
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
        )}

        {activeTab === 'travelers' && (
          <TravelersTab tripId={trip.id} token={token} />
        )}

        {activeTab === 'bookings' && (
          <BookingsTab tripId={trip.id} token={token} />
        )}

        {activeTab === 'documents' && (
          <DocumentsTab tripId={trip.id} token={token} />
        )}

        {activeTab === 'commissions' && (
          <CommissionsTab tripId={trip.id} token={token} />
        )}
      </div>

      {/* Delete Confirmation Modal - Keyboard Accessible */}
      <Modal
        isOpen={showDeleteModal && !!deletePreview}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Trip"
      >
        <Modal.Header onClose={() => setShowDeleteModal(false)}>
          <h2 className="modal-title" id="modal-title" style={{ color: 'var(--color-error, #dc2626)' }}>
            Delete Trip
          </h2>
        </Modal.Header>
        <Modal.Body>
          <div style={{
            background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
            border: '1px solid var(--color-error, #dc2626)',
            borderRadius: '8px',
            padding: '1rem 1.25rem',
            marginBottom: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '1.25rem' }} aria-hidden="true">⚠️</span>
              <span style={{ fontWeight: 600, color: '#991b1b' }}>Warning: This action cannot be undone</span>
            </div>
            <p style={{ fontSize: '0.875rem', color: '#b91c1c', marginBottom: 0 }}>
              You are about to permanently delete <strong>"{deletePreview?.tripName}"</strong> and all its related data.
            </p>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              The following related data will be deleted:
            </h4>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              {deletePreview?.relatedData?.bookings > 0 && (
                <li><strong>{deletePreview.relatedData.bookings}</strong> booking(s)</li>
              )}
              {deletePreview?.relatedData?.travelers > 0 && (
                <li><strong>{deletePreview.relatedData.travelers}</strong> traveler(s)</li>
              )}
              {deletePreview?.relatedData?.documents > 0 && (
                <li><strong>{deletePreview.relatedData.documents}</strong> document(s)</li>
              )}
              {deletePreview?.relatedData?.tasks > 0 && (
                <li><strong>{deletePreview.relatedData.tasks}</strong> task(s) will be unlinked</li>
              )}
              {deletePreview?.relatedData?.bookings === 0 &&
               deletePreview?.relatedData?.travelers === 0 &&
               deletePreview?.relatedData?.documents === 0 &&
               deletePreview?.relatedData?.tasks === 0 && (
                <li>No related data found</li>
              )}
            </ul>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button
            className="btn btn-outline"
            onClick={() => setShowDeleteModal(false)}
            disabled={deleteLoading}
          >
            Cancel
          </button>
          <button
            className="btn"
            style={{
              background: 'var(--color-error, #dc2626)',
              color: '#fff',
              border: 'none'
            }}
            onClick={handleConfirmDelete}
            disabled={deleteLoading}
          >
            {deleteLoading ? 'Deleting...' : 'Delete Trip'}
          </button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

/* =================== TRIPS PAGE =================== */
export default function TripsPage() {
  const { token } = useAuth();
  const { id: urlTripId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { addToast } = useToast();
  const { formatDate } = useTimezone();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  // Initialize filter states from URL search params for persistence
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [stageFilter, setStageFilter] = useState(() => searchParams.get('stage') || '');
  const [plannerFilter, setPlannerFilter] = useState(() => searchParams.get('planner') || '');
  const [clientFilter, setClientFilter] = useState(() => searchParams.get('client') || '');
  const [dateFromFilter, setDateFromFilter] = useState(() => searchParams.get('dateFrom') || '');
  const [dateToFilter, setDateToFilter] = useState(() => searchParams.get('dateTo') || '');
  const [showModal, setShowModal] = useState(false);
  const [editTrip, setEditTrip] = useState(null);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [tripNotFound, setTripNotFound] = useState(false);
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalTrips, setTotalTrips] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [pageSize] = useState(10);

  // Sync filter state to URL search params for persistence during navigation
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (stageFilter) params.set('stage', stageFilter);
    if (plannerFilter) params.set('planner', plannerFilter);
    if (clientFilter) params.set('client', clientFilter);
    if (dateFromFilter) params.set('dateFrom', dateFromFilter);
    if (dateToFilter) params.set('dateTo', dateToFilter);
    setSearchParams(params, { replace: true });
  }, [search, stageFilter, plannerFilter, clientFilter, dateFromFilter, dateToFilter, setSearchParams]);

  // Fetch users and clients for filters
  useEffect(() => {
    if (!token) return;
    // Fetch users
    fetch(`${API_BASE}/users`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => { if (data.users) setUsers(data.users); })
      .catch(() => {});
    // Fetch clients
    fetch(`${API_BASE}/clients`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => { if (data.clients) setClients(data.clients); })
      .catch(() => {});
  }, [token]);

  const fetchTrips = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (stageFilter) params.set('stage', stageFilter);
      if (plannerFilter) params.set('assignedTo', plannerFilter);
      if (clientFilter) params.set('clientId', clientFilter);
      if (dateFromFilter) params.set('dateFrom', dateFromFilter);
      if (dateToFilter) params.set('dateTo', dateToFilter);
      params.set('page', currentPage.toString());
      params.set('limit', pageSize.toString());
      const res = await fetch(`${API_BASE}/trips?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setTrips(data.trips);
        setTotalTrips(data.total);
        setTotalPages(data.totalPages);
      }
    } catch (err) {
      console.error('Failed to load trips:', err);
    } finally {
      setLoading(false);
    }
  }, [token, search, stageFilter, plannerFilter, clientFilter, dateFromFilter, dateToFilter, currentPage, pageSize]);

  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, stageFilter, plannerFilter, clientFilter, dateFromFilter, dateToFilter]);

  // Handle URL parameter for direct navigation to a trip
  useEffect(() => {
    if (urlTripId && token && !selectedTrip && !tripNotFound) {
      // Fetch the specific trip by ID
      fetch(`${API_BASE}/trips/${urlTripId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => {
          if (!res.ok) {
            setTripNotFound(true);
            return null;
          }
          return res.json();
        })
        .then(data => {
          if (data && data.trip) {
            setSelectedTrip(data.trip);
          } else if (data === null) {
            setTripNotFound(true);
          }
        })
        .catch(err => {
          console.error('Failed to load trip:', err);
          setTripNotFound(true);
        });
    }
  }, [urlTripId, token, selectedTrip, tripNotFound]);

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
    // Show confirmation dialog for cancellation
    if (newStage === 'canceled') {
      const tripName = selectedTrip?.name || trips.find(t => t.id === tripId)?.name || 'this trip';
      const confirmed = window.confirm(
        `Are you sure you want to cancel "${tripName}"?\n\n` +
        `This will:\n` +
        `• Mark the trip as Canceled\n` +
        `• Cancel all associated bookings\n` +
        `• The trip will be hidden from active views\n\n` +
        `This action can be undone by changing the stage back.`
      );
      if (!confirmed) {
        return;
      }
    }

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

  const handleDeleteTrip = (tripId) => {
    // Remove trip from list
    setTrips(prev => prev.filter(t => t.id !== tripId));
    // Clear selection and navigate back
    setSelectedTrip(null);
    addToast('Trip deleted successfully', 'success');
    navigate('/trips');
  };

  const handleViewTrip = (trip) => {
    setSelectedTrip(trip);
    navigate(`/trips/${trip.id}`);
  };

  // Trip not found view
  if (tripNotFound) {
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
          <h3 className="empty-state-title">Trip Not Found</h3>
          <p className="empty-state-description">
            This trip may have been deleted or you don't have permission to view it.
          </p>
          <button
            className="btn btn-primary"
            style={{ marginTop: 'var(--spacing-md)' }}
            onClick={() => { setTripNotFound(false); navigate('/trips'); }}
          >
            ← Back to Trips
          </button>
        </div>
      </div>
    );
  }

  // Detail view
  if (selectedTrip) {
    return (
      <div className="page-container">
        <TripDetail
          trip={selectedTrip}
          onBack={() => { setSelectedTrip(null); navigate(`/trips?${searchParams.toString()}`); }}
          onEdit={handleEditTrip}
          onStageChange={handleStageChange}
          onDelete={handleDeleteTrip}
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
        {/* Row 1: Search and Stage filter */}
        <div style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
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
            aria-label="Filter by stage"
          >
            <option value="">All Stages</option>
            {STAGE_ORDER.map(stage => (
              <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>
            ))}
          </select>
        </div>
        {/* Row 2: Additional filters */}
        <div style={{ display: 'flex', gap: 'var(--spacing-md)', flexWrap: 'wrap' }}>
          <select
            className="form-input"
            value={plannerFilter}
            onChange={(e) => setPlannerFilter(e.target.value)}
            style={{ width: '200px' }}
            aria-label="Filter by planner"
          >
            <option value="">All Planners</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
            ))}
          </select>
          <select
            className="form-input"
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            style={{ width: '200px' }}
            aria-label="Filter by client"
          >
            <option value="">All Clients</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
            ))}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
            <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Travel dates:</label>
            <input
              type="date"
              className="form-input"
              value={dateFromFilter}
              onChange={(e) => setDateFromFilter(e.target.value)}
              style={{ width: '150px' }}
              aria-label="Filter by date from"
            />
            <span style={{ color: 'var(--text-secondary)' }}>to</span>
            <input
              type="date"
              className="form-input"
              value={dateToFilter}
              onChange={(e) => setDateToFilter(e.target.value)}
              style={{ width: '150px' }}
              aria-label="Filter by date to"
            />
          </div>
          {(stageFilter || plannerFilter || clientFilter || dateFromFilter || dateToFilter) && (
            <button
              className="btn btn-outline btn-sm"
              onClick={() => {
                setStageFilter('');
                setPlannerFilter('');
                setClientFilter('');
                setDateFromFilter('');
                setDateToFilter('');
              }}
              style={{ marginLeft: 'auto' }}
            >
              Clear Filters
            </button>
          )}
        </div>
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
                      ? `${formatDate(trip.travelStartDate)} - ${formatDate(trip.travelEndDate)}`
                      : formatDate(trip.travelStartDate)}
                  </td>
                  <td>{formatDate(trip.createdAt)}</td>
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
                Showing {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, totalTrips)} of {totalTrips} trips
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
