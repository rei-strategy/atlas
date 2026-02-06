import React, { useState, useEffect } from 'react';
import { usePortalAuth } from '../../context/PortalAuthContext';
import { useParams, Link } from 'react-router-dom';

export default function PortalTripDetailPage() {
  const { id } = useParams();
  const { token } = usePortalAuth();
  const [trip, setTrip] = useState(null);
  const [travelers, setTravelers] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  // Traveler form state
  const [showTravelerForm, setShowTravelerForm] = useState(false);
  const [travelerForm, setTravelerForm] = useState({
    fullLegalName: '',
    dateOfBirth: '',
    passportStatus: 'unknown',
    passportExpiration: '',
    specialNeeds: '',
    relationshipToClient: ''
  });
  const [travelerSubmitting, setTravelerSubmitting] = useState(false);
  const [travelerMessage, setTravelerMessage] = useState('');

  // Document upload state
  const [showDocUpload, setShowDocUpload] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [docForm, setDocForm] = useState({ documentType: 'other' });
  const [docSubmitting, setDocSubmitting] = useState(false);
  const [docMessage, setDocMessage] = useState('');
  const fileInputRef = React.useRef();

  // Helper to check if a payment is overdue
  const isPaymentOverdue = (booking) => {
    if (!booking.finalPaymentDueDate) return false;
    if (booking.paymentStatus === 'paid_in_full') return false;
    const today = new Date().toISOString().split('T')[0];
    return booking.finalPaymentDueDate < today;
  };

  useEffect(() => {
    fetchTripDetails();
  }, [id]);

  const fetchTripDetails = async () => {
    try {
      const res = await fetch(`/api/portal/trips/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load trip details');
      const data = await res.json();
      setTrip(data.trip);
      setTravelers(data.travelers || []);
      setBookings(data.bookings || []);
      setDocuments(data.documents || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'TBD';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  };

  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const handleTravelerSubmit = async (e) => {
    e.preventDefault();
    setTravelerSubmitting(true);
    setTravelerMessage('');

    try {
      const res = await fetch(`/api/portal/trips/${id}/travelers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(travelerForm)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit traveler');

      setTravelers([...travelers, data.traveler]);
      setTravelerForm({
        fullLegalName: '', dateOfBirth: '', passportStatus: 'unknown',
        passportExpiration: '', specialNeeds: '', relationshipToClient: ''
      });
      setShowTravelerForm(false);
      setTravelerMessage('Traveler information submitted successfully!');
    } catch (err) {
      setTravelerMessage('Error: ' + err.message);
    } finally {
      setTravelerSubmitting(false);
    }
  };

  const handleDocUpload = async (e) => {
    e.preventDefault();

    if (!selectedFile) {
      setDocMessage('Error: Please select a file to upload');
      return;
    }

    setDocSubmitting(true);
    setDocMessage('');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('documentType', docForm.documentType);

      const res = await fetch(`/api/portal/trips/${id}/documents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to upload document');

      setDocuments([...documents, data.document]);
      setSelectedFile(null);
      setDocForm({ documentType: 'other' });
      setShowDocUpload(false);
      setDocMessage('Document uploaded successfully!');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setDocMessage('Error: ' + err.message);
    } finally {
      setDocSubmitting(false);
    }
  };

  const getStageLabel = (stage) => {
    const labels = {
      inquiry: 'Inquiry', quoted: 'Planning', booked: 'Booked',
      final_payment_pending: 'Payment Pending', traveling: 'Traveling', completed: 'Completed'
    };
    return labels[stage] || stage;
  };

  const getPaymentLabel = (status) => {
    const labels = {
      deposit_paid: 'Deposit Paid', final_due: 'Final Payment Due', paid_in_full: 'Paid in Full'
    };
    return labels[status] || status;
  };

  if (loading) {
    return (
      <div className="portal-page">
        <div className="portal-loading">
          <div className="loading-spinner" />
          <p>Loading trip details...</p>
        </div>
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="portal-page">
        <div className="portal-error">{error || 'Trip not found'}</div>
        <Link to="/portal/dashboard" className="portal-back-link">← Back to My Trips</Link>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'travelers', label: `Travelers (${travelers.length})` },
    { id: 'bookings', label: `Bookings (${bookings.length})` },
    { id: 'documents', label: `Documents (${documents.length})` }
  ];

  return (
    <div className="portal-page">
      <Link to="/portal/dashboard" className="portal-back-link">← Back to My Trips</Link>

      <div className="portal-trip-header">
        <div>
          <h1>{trip.name}</h1>
          {trip.destination && <p className="portal-trip-destination-large">📍 {trip.destination}</p>}
        </div>
        <span className="portal-stage-badge-large">{getStageLabel(trip.stage)}</span>
      </div>

      <div className="portal-trip-dates-bar">
        <div className="portal-date-item">
          <span className="portal-date-label">Departure</span>
          <span className="portal-date-value">{formatDate(trip.travelStartDate)}</span>
        </div>
        <div className="portal-date-item">
          <span className="portal-date-label">Return</span>
          <span className="portal-date-value">{formatDate(trip.travelEndDate)}</span>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="portal-tabs" role="tablist">
        {tabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`portal-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="portal-tab-content" role="tabpanel">
          {trip.description && (
            <div className="portal-section">
              <h2>Trip Details</h2>
              <p>{trip.description}</p>
            </div>
          )}
          <div className="portal-section">
            <h2>Quick Summary</h2>
            <div className="portal-summary-grid">
              <div className="portal-summary-card">
                <span className="portal-summary-label">Travelers</span>
                <span className="portal-summary-value">{travelers.length}</span>
              </div>
              <div className="portal-summary-card">
                <span className="portal-summary-label">Bookings</span>
                <span className="portal-summary-value">{bookings.length}</span>
              </div>
              <div className="portal-summary-card">
                <span className="portal-summary-label">Documents</span>
                <span className="portal-summary-value">{documents.length}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Travelers Tab */}
      {activeTab === 'travelers' && (
        <div className="portal-tab-content" role="tabpanel">
          {travelerMessage && (
            <div className={`portal-message ${travelerMessage.startsWith('Error') ? 'error' : 'success'}`}>
              {travelerMessage}
            </div>
          )}

          <div className="portal-section-header">
            <h2>Travelers</h2>
            <button
              className="portal-add-btn"
              onClick={() => setShowTravelerForm(!showTravelerForm)}
            >
              {showTravelerForm ? 'Cancel' : '+ Add Traveler'}
            </button>
          </div>

          {showTravelerForm && (
            <form onSubmit={handleTravelerSubmit} className="portal-form">
              <div className="portal-form-grid">
                <div className="portal-form-group">
                  <label htmlFor="travelerName">Full Legal Name *</label>
                  <input
                    id="travelerName"
                    type="text"
                    value={travelerForm.fullLegalName}
                    onChange={(e) => setTravelerForm({ ...travelerForm, fullLegalName: e.target.value })}
                    required
                    placeholder="As it appears on passport/ID"
                  />
                </div>
                <div className="portal-form-group">
                  <label htmlFor="travelerDob">Date of Birth</label>
                  <input
                    id="travelerDob"
                    type="date"
                    value={travelerForm.dateOfBirth}
                    onChange={(e) => setTravelerForm({ ...travelerForm, dateOfBirth: e.target.value })}
                  />
                </div>
                <div className="portal-form-group">
                  <label htmlFor="passportStatus">Passport Status</label>
                  <select
                    id="passportStatus"
                    value={travelerForm.passportStatus}
                    onChange={(e) => setTravelerForm({ ...travelerForm, passportStatus: e.target.value })}
                  >
                    <option value="unknown">Not Sure</option>
                    <option value="yes">Valid Passport</option>
                    <option value="no">No Passport</option>
                  </select>
                </div>
                <div className="portal-form-group">
                  <label htmlFor="passportExp">Passport Expiration</label>
                  <input
                    id="passportExp"
                    type="date"
                    value={travelerForm.passportExpiration}
                    onChange={(e) => setTravelerForm({ ...travelerForm, passportExpiration: e.target.value })}
                  />
                </div>
                <div className="portal-form-group full-width">
                  <label htmlFor="specialNeeds">Special Needs / Dietary / Medical</label>
                  <textarea
                    id="specialNeeds"
                    value={travelerForm.specialNeeds}
                    onChange={(e) => setTravelerForm({ ...travelerForm, specialNeeds: e.target.value })}
                    placeholder="Dietary restrictions, mobility needs, medical conditions, etc."
                    rows="2"
                  />
                </div>
                <div className="portal-form-group">
                  <label htmlFor="relationship">Relationship to You</label>
                  <input
                    id="relationship"
                    type="text"
                    value={travelerForm.relationshipToClient}
                    onChange={(e) => setTravelerForm({ ...travelerForm, relationshipToClient: e.target.value })}
                    placeholder="e.g., Spouse, Child, Friend"
                  />
                </div>
              </div>
              <div className="portal-form-actions">
                <button type="submit" className="portal-submit-btn" disabled={travelerSubmitting}>
                  {travelerSubmitting ? 'Submitting...' : 'Submit Traveler Info'}
                </button>
              </div>
            </form>
          )}

          {travelers.length === 0 && !showTravelerForm ? (
            <div className="portal-empty-section">
              <p>No travelers added yet. Click "Add Traveler" to provide traveler information.</p>
            </div>
          ) : (
            <div className="portal-travelers-list">
              {travelers.map(t => (
                <div key={t.id} className="portal-traveler-card">
                  <div className="portal-traveler-name">{t.fullLegalName}</div>
                  <div className="portal-traveler-details">
                    {t.dateOfBirth && <span>DOB: {formatDate(t.dateOfBirth)}</span>}
                    {t.passportStatus && t.passportStatus !== 'unknown' && (
                      <span>Passport: {t.passportStatus === 'yes' ? '✅ Valid' : '❌ None'}</span>
                    )}
                    {t.passportExpiration && <span>Expires: {formatDate(t.passportExpiration)}</span>}
                    {t.relationshipToClient && <span>Relationship: {t.relationshipToClient}</span>}
                  </div>
                  {t.specialNeeds && (
                    <div className="portal-traveler-needs">Special needs: {t.specialNeeds}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bookings Tab */}
      {activeTab === 'bookings' && (
        <div className="portal-tab-content" role="tabpanel">
          <h2>Bookings & Payment Status</h2>

          {/* Payment Summary */}
          {bookings.length > 0 && (
            <div className="portal-payment-summary">
              <h3>Payment Summary</h3>
              <div className="portal-payment-grid">
                <div className="portal-payment-card">
                  <span className="portal-payment-label">Total Trip Cost</span>
                  <span className="portal-payment-value">{formatCurrency(bookings.reduce((sum, b) => sum + (b.totalCost || 0), 0))}</span>
                </div>
                <div className="portal-payment-card">
                  <span className="portal-payment-label">Deposits Due</span>
                  <span className="portal-payment-value">{formatCurrency(bookings.reduce((sum, b) => sum + (b.depositAmount || 0), 0))}</span>
                  <span className="portal-payment-status">
                    {bookings.filter(b => b.depositPaid).length} of {bookings.length} paid
                  </span>
                </div>
                <div className="portal-payment-card">
                  <span className="portal-payment-label">Final Payments Due</span>
                  <span className="portal-payment-value">{formatCurrency(bookings.reduce((sum, b) => sum + (b.finalPaymentAmount || 0), 0))}</span>
                  <span className="portal-payment-status">
                    {bookings.filter(b => b.paymentStatus === 'paid_in_full').length} of {bookings.length} complete
                  </span>
                </div>
              </div>
            </div>
          )}

          {bookings.length === 0 ? (
            <div className="portal-empty-section">
              <p>No bookings have been added to this trip yet.</p>
            </div>
          ) : (
            <div className="portal-bookings-list">
              {bookings.map(b => (
                <div key={b.id} className="portal-booking-card">
                  <div className="portal-booking-header">
                    <span className="portal-booking-type">{b.bookingType}</span>
                    <span className={`portal-booking-status status-${b.status}`}>{b.status}</span>
                  </div>
                  {b.supplierName && <div className="portal-booking-supplier">{b.supplierName}</div>}
                  {b.confirmationNumber && (
                    <div className="portal-booking-confirmation">Confirmation: {b.confirmationNumber}</div>
                  )}
                  <div className="portal-booking-dates">
                    {formatDate(b.travelStartDate)} - {formatDate(b.travelEndDate)}
                  </div>

                  {/* Payment Details Section */}
                  <div className="portal-booking-payment-details">
                    <div className="portal-payment-row">
                      <span className="portal-payment-item-label">Total Cost:</span>
                      <span className="portal-payment-item-value">{formatCurrency(b.totalCost)}</span>
                    </div>
                    {b.depositAmount > 0 && (
                      <div className="portal-payment-row">
                        <span className="portal-payment-item-label">Deposit:</span>
                        <span className="portal-payment-item-value">
                          {formatCurrency(b.depositAmount)}
                          <span className={`portal-payment-badge ${b.depositPaid ? 'paid' : 'due'}`}>
                            {b.depositPaid ? '✓ Paid' : 'Due'}
                          </span>
                        </span>
                      </div>
                    )}
                    {b.finalPaymentAmount > 0 && (
                      <div className="portal-payment-row">
                        <span className="portal-payment-item-label">Final Payment:</span>
                        <span className="portal-payment-item-value">
                          {formatCurrency(b.finalPaymentAmount)}
                          <span className={`portal-payment-badge ${b.paymentStatus === 'paid_in_full' ? 'paid' : 'due'}`}>
                            {b.paymentStatus === 'paid_in_full' ? '✓ Paid' : 'Due'}
                          </span>
                        </span>
                      </div>
                    )}
                    {b.finalPaymentDueDate && b.paymentStatus !== 'paid_in_full' && (
                      <div className={`portal-payment-row portal-payment-due-date ${isPaymentOverdue(b) ? 'overdue' : ''}`}>
                        <span className="portal-payment-item-label">Due Date:</span>
                        <span className={`portal-payment-item-value ${isPaymentOverdue(b) ? 'portal-overdue-date' : 'portal-due-date-highlight'}`}>
                          {formatDate(b.finalPaymentDueDate)}
                          {isPaymentOverdue(b) && <span className="portal-overdue-badge">OVERDUE</span>}
                        </span>
                      </div>
                    )}
                    <div className="portal-payment-row portal-payment-overall">
                      <span className="portal-payment-item-label">Status:</span>
                      <span className={`portal-payment-status-badge ${b.paymentStatus}`}>
                        {getPaymentLabel(b.paymentStatus)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Documents Tab */}
      {activeTab === 'documents' && (
        <div className="portal-tab-content" role="tabpanel">
          {docMessage && (
            <div className={`portal-message ${docMessage.startsWith('Error') ? 'error' : 'success'}`}>
              {docMessage}
            </div>
          )}

          <div className="portal-section-header">
            <h2>Documents</h2>
            <button
              className="portal-add-btn"
              onClick={() => setShowDocUpload(!showDocUpload)}
            >
              {showDocUpload ? 'Cancel' : '+ Upload Document'}
            </button>
          </div>

          {showDocUpload && (
            <form onSubmit={handleDocUpload} className="portal-form">
              <div className="portal-form-grid">
                <div className="portal-form-group" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="docFile">Select File *</label>
                  <input
                    ref={fileInputRef}
                    id="docFile"
                    type="file"
                    onChange={(e) => setSelectedFile(e.target.files[0])}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png,.gif"
                    required
                    style={{ padding: '8px', border: '1px solid var(--border-color)', borderRadius: '4px', width: '100%' }}
                  />
                  {selectedFile && (
                    <div style={{ marginTop: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                      Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </div>
                  )}
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Allowed: PDF, Word, Excel, images, text files (max 10MB)
                  </p>
                </div>
                <div className="portal-form-group">
                  <label htmlFor="docType">Document Type</label>
                  <select
                    id="docType"
                    value={docForm.documentType}
                    onChange={(e) => setDocForm({ ...docForm, documentType: e.target.value })}
                  >
                    <option value="other">Other</option>
                    <option value="authorization">Authorization Form</option>
                    <option value="insurance">Insurance</option>
                    <option value="confirmation">Confirmation</option>
                  </select>
                </div>
              </div>
              <div className="portal-form-actions">
                <button type="submit" className="portal-submit-btn" disabled={docSubmitting || !selectedFile}>
                  {docSubmitting ? 'Uploading...' : 'Upload Document'}
                </button>
              </div>
            </form>
          )}

          {documents.length === 0 && !showDocUpload ? (
            <div className="portal-empty-section">
              <p>No documents available for this trip yet.</p>
            </div>
          ) : (
            <div className="portal-documents-list">
              {documents.map(d => (
                <div key={d.id} className="portal-document-card">
                  <div className="portal-doc-icon" aria-hidden="true">📄</div>
                  <div className="portal-doc-info">
                    <span className="portal-doc-name">{d.fileName}</span>
                    <span className="portal-doc-type">{d.documentType}</span>
                  </div>
                  <span className="portal-doc-date">{formatDate(d.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
