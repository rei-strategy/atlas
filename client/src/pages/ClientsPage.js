import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useBlocker } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { useTimezone } from '../hooks/useTimezone';
import { fetchWithTimeout, isTimeoutError, isNetworkError, getNetworkErrorMessage } from '../utils/apiErrors';
import { FIELD_LIMITS, validateMaxLength, getCharacterCount, isApproachingLimit } from '../utils/validation';
import { useFormDraft } from '../hooks/useFormDraft';
import { generateIdempotencyKey } from '../utils/idempotency';
import Breadcrumb from '../components/Breadcrumb';
import UnsavedChangesDialog from '../components/UnsavedChangesDialog';
import LoadingButton from '../components/LoadingButton';

const API_BASE = '/api';
const REQUEST_TIMEOUT = 30000; // 30 seconds

const COMMUNICATION_OPTIONS = ['Email', 'Phone', 'Text', 'Video Call'];
const TRAVEL_PREFERENCE_OPTIONS = [
  'Disney', 'Cruises', 'Luxury', 'Budget', 'Adventure',
  'Beach', 'All-Inclusive', 'Family', 'Honeymoon', 'Group Travel',
  'Europe', 'Caribbean', 'Asia', 'Domestic'
];

function ClientFormModal({ isOpen, onClose, onSaved, client, token, users = [], onDirtyChange }) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [loadingElapsed, setLoadingElapsed] = useState(0);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictData, setConflictData] = useState(null);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const abortControllerRef = useRef(null);
  const loadingStartRef = useRef(null);
  const [draftChecked, setDraftChecked] = useState(false);
  // Generate new idempotency key when modal opens to prevent duplicate submissions on back/resubmit
  const idempotencyKey = useMemo(() => isOpen ? generateIdempotencyKey() : null, [isOpen]);
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    city: '', state: '', country: '',
    preferredCommunication: '',
    travelPreferences: [],
    notes: '',
    marketingOptIn: false,
    contactConsent: true,
    assignedUserId: '',
    updatedAt: null // For optimistic locking
  });

  // Validation function for individual fields
  const validateField = (name, value) => {
    switch (name) {
      case 'firstName':
        if (!value || !value.trim()) {
          return 'First name is required';
        }
        if (value.trim().length < 2) {
          return 'First name must be at least 2 characters';
        }
        if (value.length > FIELD_LIMITS.name) {
          return `First name must be ${FIELD_LIMITS.name} characters or less`;
        }
        return '';
      case 'lastName':
        if (!value || !value.trim()) {
          return 'Last name is required';
        }
        if (value.trim().length < 2) {
          return 'Last name must be at least 2 characters';
        }
        if (value.length > FIELD_LIMITS.name) {
          return `Last name must be ${FIELD_LIMITS.name} characters or less`;
        }
        return '';
      case 'email':
        if (value && value.trim()) {
          if (value.length > FIELD_LIMITS.email) {
            return `Email must be ${FIELD_LIMITS.email} characters or less`;
          }
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(value.trim())) {
            return 'Please enter a valid email address';
          }
        }
        return '';
      case 'phone':
        if (value && value.trim()) {
          if (value.length > FIELD_LIMITS.phone) {
            return `Phone must be ${FIELD_LIMITS.phone} characters or less`;
          }
          // Extract digits for validation
          const digits = value.replace(/\D/g, '');
          // Check for letters (a-z, A-Z) - phone numbers shouldn't have letters
          const hasLetters = /[a-zA-Z]/.test(value);
          if (hasLetters) {
            return 'Phone number should only contain digits and formatting characters';
          }
          // Require minimum 7 digits for valid phone number
          // Accepts: (555) 123-4567, 555-123-4567, +1-555-123-4567, +44 20 7946 0958
          if (digits.length < 7) {
            return 'Phone number must have at least 7 digits';
          }
          // Maximum 15 digits (E.164 international standard)
          if (digits.length > 15) {
            return 'Phone number cannot exceed 15 digits';
          }
        }
        return '';
      case 'city':
        if (value && value.length > FIELD_LIMITS.city) {
          return `City must be ${FIELD_LIMITS.city} characters or less`;
        }
        return '';
      case 'state':
        if (value && value.length > FIELD_LIMITS.state) {
          return `State must be ${FIELD_LIMITS.state} characters or less`;
        }
        return '';
      case 'country':
        if (value && value.length > FIELD_LIMITS.country) {
          return `Country must be ${FIELD_LIMITS.country} characters or less`;
        }
        return '';
      case 'notes':
        if (value && value.length > FIELD_LIMITS.notes) {
          return `Notes must be ${FIELD_LIMITS.notes} characters or less`;
        }
        return '';
      default:
        return '';
    }
  };

  // Validate all fields and return errors object
  const validateAllFields = () => {
    const errors = {};
    const fieldsToValidate = ['firstName', 'lastName', 'email', 'phone', 'city', 'state', 'country', 'notes'];
    fieldsToValidate.forEach(field => {
      const error = validateField(field, form[field]);
      if (error) {
        errors[field] = error;
      }
    });
    return errors;
  };

  // Form draft persistence hook
  const {
    draftRestored,
    draftAge,
    isDirty,
    loadExistingDraft,
    saveFormDraft,
    clearFormDraft,
    dismissDraftNotification
  } = useFormDraft('client', client?.id || null, client, {
    enabled: isOpen, // Only enable when modal is open
    contentFields: ['firstName', 'lastName', 'email', 'phone', 'city', 'state', 'country', 'notes']
  });

  // Notify parent of dirty state changes for navigation blocking
  useEffect(() => {
    if (onDirtyChange) {
      onDirtyChange(isDirty && isOpen);
    }
  }, [isDirty, isOpen, onDirtyChange]);

  useEffect(() => {
    if (!isOpen) {
      setDraftChecked(false);
      return;
    }

    if (client) {
      // Edit mode - load client data, then check for draft
      const baseForm = {
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
        assignedUserId: client.assignedUserId || '',
        updatedAt: client.updatedAt || null
      };

      // Check for saved draft when editing
      if (!draftChecked) {
        const savedDraft = loadExistingDraft();
        if (savedDraft) {
          // Merge draft with base form, preserving updatedAt for conflict detection
          setForm({ ...savedDraft, updatedAt: client.updatedAt || null });
        } else {
          setForm(baseForm);
        }
        setDraftChecked(true);
      }
    } else {
      // Create mode - check for saved draft
      if (!draftChecked) {
        const savedDraft = loadExistingDraft();
        if (savedDraft) {
          setForm({ ...savedDraft, updatedAt: null });
        } else {
          setForm({
            firstName: '', lastName: '', email: '', phone: '',
            city: '', state: '', country: '',
            preferredCommunication: '',
            travelPreferences: [],
            notes: '',
            marketingOptIn: false,
            contactConsent: true,
            assignedUserId: '',
            updatedAt: null
          });
        }
        setDraftChecked(true);
      }
    }
    setError('');
    setFieldErrors({});
    setTouched({});
    setShowConflictModal(false);
    setConflictData(null);
  }, [client, isOpen, draftChecked, loadExistingDraft]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;
    const newForm = {
      ...form,
      [name]: newValue
    };
    setForm(newForm);

    // Save draft on every change (debounced)
    saveFormDraft(newForm);

    // Clear field error when user starts typing (real-time validation)
    if (touched[name]) {
      const fieldError = validateField(name, newValue);
      setFieldErrors(prev => ({
        ...prev,
        [name]: fieldError
      }));
    }
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    setTouched(prev => ({ ...prev, [name]: true }));

    // Validate on blur
    const fieldError = validateField(name, value);
    setFieldErrors(prev => ({
      ...prev,
      [name]: fieldError
    }));
  };

  const handleTravelPref = (pref) => {
    const newPrefs = form.travelPreferences.includes(pref)
      ? form.travelPreferences.filter(p => p !== pref)
      : [...form.travelPreferences, pref];
    const newForm = {
      ...form,
      travelPreferences: newPrefs
    };
    setForm(newForm);

    // Save draft when travel preferences change
    saveFormDraft(newForm);
  };

  // Track loading elapsed time
  useEffect(() => {
    if (!loading) {
      setLoadingElapsed(0);
      return;
    }
    loadingStartRef.current = Date.now();
    const interval = setInterval(() => {
      setLoadingElapsed(Date.now() - loadingStartRef.current);
    }, 1000);
    return () => clearInterval(interval);
  }, [loading]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setLoading(false);
      setError('Request cancelled');
      addToast('Request cancelled', 'info');
    }
  };

  // Handle attempting to close modal - show warning if unsaved changes
  const handleAttemptClose = () => {
    if (isDirty) {
      setShowUnsavedWarning(true);
    } else {
      onClose();
    }
  };

  // Confirm leaving with unsaved changes
  const handleConfirmLeave = () => {
    setShowUnsavedWarning(false);
    clearFormDraft();
    onClose();
  };

  // Stay on form (cancel leaving)
  const handleCancelLeave = () => {
    setShowUnsavedWarning(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Prevent double-click submission
    if (submittingRef.current || loading) {
      return;
    }
    submittingRef.current = true;

    setError('');

    // Validate all fields on submit
    const errors = validateAllFields();
    setFieldErrors(errors);

    // Mark all required fields as touched
    setTouched({
      firstName: true,
      lastName: true,
      email: true,
      phone: true
    });

    // If there are any errors, don't submit
    if (Object.keys(errors).length > 0) {
      setError('Please fix the errors below before submitting');
      submittingRef.current = false;
      return;
    }

    // Create abort controller for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setLoadingElapsed(0);

    try {
      const isEdit = !!client;
      const url = isEdit ? `${API_BASE}/clients/${client.id}` : `${API_BASE}/clients`;
      const method = isEdit ? 'PUT' : 'POST';

      // Include updatedAt for optimistic locking on edits
      const requestBody = isEdit ? { ...form } : { ...form, updatedAt: undefined };

      const res = await fetchWithTimeout(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey })
        },
        body: JSON.stringify(requestBody),
        timeout: REQUEST_TIMEOUT,
        signal: controller.signal
      });

      const data = await res.json();

      // Handle concurrent edit conflict
      if (res.status === 409 && data.code === 'CONCURRENT_EDIT_CONFLICT') {
        setConflictData({
          message: data.error,
          serverUpdatedAt: data.serverUpdatedAt,
          clientUpdatedAt: data.clientUpdatedAt
        });
        setShowConflictModal(true);
        setLoading(false);
        abortControllerRef.current = null;
        submittingRef.current = false;
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save client');
      }

      // Clear draft on successful save
      clearFormDraft();

      addToast(isEdit ? 'Client updated successfully' : 'Client created successfully', 'success');
      onSaved(data.client);
      onClose();
    } catch (err) {
      // Don't show error if request was intentionally cancelled
      if (err.name === 'AbortError' && !err.isTimeout) {
        return;
      }

      if (isTimeoutError(err)) {
        setError('The request took too long. Please check your connection and try again.');
        addToast('Request timed out', 'error');
      } else if (isNetworkError(err)) {
        setError(getNetworkErrorMessage(err));
        addToast('Connection problem', 'error');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
      submittingRef.current = false;
    }
  };

  // Handle conflict resolution - reload and retry
  const handleRefreshAndRetry = async () => {
    try {
      // Fetch the latest version of the client
      const res = await fetch(`${API_BASE}/clients/${client.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();

      if (res.ok && data.client) {
        // Update the form with the latest data from server
        setForm(prev => ({
          ...prev,
          updatedAt: data.client.updatedAt
        }));
        setShowConflictModal(false);
        setConflictData(null);
        addToast('Refreshed with latest data. Your other changes are preserved - review and save again.', 'info');
      }
    } catch (err) {
      addToast('Failed to refresh data', 'error');
    }
  };

  const handleDiscardChanges = () => {
    setShowConflictModal(false);
    setConflictData(null);
    onClose();
  };

  const showSlowWarning = loading && loadingElapsed >= 10000;
  const showTimeoutWarning = loading && loadingElapsed >= 25000;

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleAttemptClose}>
      <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{client ? 'Edit Client' : 'Create Client'}</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="auth-error">{error}</div>}

            {/* Draft restored notification */}
            {draftRestored && (
              <div className="draft-restored-banner">
                <span className="draft-restored-icon">&#128190;</span>
                <span className="draft-restored-text">
                  Draft restored from {draftAge || 'a previous session'}
                </span>
                <button
                  type="button"
                  className="draft-restored-dismiss"
                  onClick={dismissDraftNotification}
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
            )}

            <fieldset disabled={loading} style={{ border: 'none', padding: 0, margin: 0 }}>
            <h3 className="form-section-title">Personal Information</h3>
            <div className="form-row">
              <div className={`form-group ${fieldErrors.firstName && touched.firstName ? 'form-group-error' : ''}`}>
                <label className="form-label" htmlFor="firstName">First Name *</label>
                <input
                  id="firstName"
                  name="firstName"
                  className={`form-input ${fieldErrors.firstName && touched.firstName ? 'form-input-error' : ''}`}
                  value={form.firstName}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="First name"
                  maxLength={FIELD_LIMITS.name}
                  aria-invalid={!!(fieldErrors.firstName && touched.firstName)}
                  aria-describedby={fieldErrors.firstName && touched.firstName ? 'firstName-error' : undefined}
                />
                {fieldErrors.firstName && touched.firstName && (
                  <span id="firstName-error" className="form-error-message">{fieldErrors.firstName}</span>
                )}
              </div>
              <div className={`form-group ${fieldErrors.lastName && touched.lastName ? 'form-group-error' : ''}`}>
                <label className="form-label" htmlFor="lastName">Last Name *</label>
                <input
                  id="lastName"
                  name="lastName"
                  className={`form-input ${fieldErrors.lastName && touched.lastName ? 'form-input-error' : ''}`}
                  value={form.lastName}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="Last name"
                  maxLength={FIELD_LIMITS.name}
                  aria-invalid={!!(fieldErrors.lastName && touched.lastName)}
                  aria-describedby={fieldErrors.lastName && touched.lastName ? 'lastName-error' : undefined}
                />
                {fieldErrors.lastName && touched.lastName && (
                  <span id="lastName-error" className="form-error-message">{fieldErrors.lastName}</span>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className={`form-group ${fieldErrors.email && touched.email ? 'form-group-error' : ''}`}>
                <label className="form-label" htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className={`form-input ${fieldErrors.email && touched.email ? 'form-input-error' : ''}`}
                  value={form.email}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="email@example.com"
                  maxLength={FIELD_LIMITS.email}
                  aria-invalid={!!(fieldErrors.email && touched.email)}
                  aria-describedby={fieldErrors.email && touched.email ? 'email-error' : undefined}
                />
                {fieldErrors.email && touched.email && (
                  <span id="email-error" className="form-error-message">{fieldErrors.email}</span>
                )}
              </div>
              <div className={`form-group ${fieldErrors.phone && touched.phone ? 'form-group-error' : ''}`}>
                <label className="form-label" htmlFor="phone">Phone</label>
                <input
                  id="phone"
                  name="phone"
                  className={`form-input ${fieldErrors.phone && touched.phone ? 'form-input-error' : ''}`}
                  value={form.phone}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="(555) 555-1234"
                  maxLength={FIELD_LIMITS.phone}
                  aria-invalid={!!(fieldErrors.phone && touched.phone)}
                  aria-describedby={fieldErrors.phone && touched.phone ? 'phone-error' : undefined}
                />
                {fieldErrors.phone && touched.phone && (
                  <span id="phone-error" className="form-error-message">{fieldErrors.phone}</span>
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="assignedUserId">Assigned Planner</label>
              <select
                id="assignedUserId"
                name="assignedUserId"
                className="form-input"
                value={form.assignedUserId}
                onChange={handleChange}
              >
                <option value="">Select planner (defaults to you)</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.firstName} {user.lastName} ({user.role})
                  </option>
                ))}
              </select>
            </div>

            <h3 className="form-section-title">Location</h3>
            <div className="form-row-3">
              <div className={`form-group ${fieldErrors.city && touched.city ? 'form-group-error' : ''}`}>
                <label className="form-label" htmlFor="city">City</label>
                <input
                  id="city"
                  name="city"
                  className={`form-input ${fieldErrors.city && touched.city ? 'form-input-error' : ''}`}
                  value={form.city}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="City"
                  maxLength={FIELD_LIMITS.city}
                />
                {fieldErrors.city && touched.city && (
                  <span className="form-error-message">{fieldErrors.city}</span>
                )}
              </div>
              <div className={`form-group ${fieldErrors.state && touched.state ? 'form-group-error' : ''}`}>
                <label className="form-label" htmlFor="state">State</label>
                <input
                  id="state"
                  name="state"
                  className={`form-input ${fieldErrors.state && touched.state ? 'form-input-error' : ''}`}
                  value={form.state}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="State"
                  maxLength={FIELD_LIMITS.state}
                />
                {fieldErrors.state && touched.state && (
                  <span className="form-error-message">{fieldErrors.state}</span>
                )}
              </div>
              <div className={`form-group ${fieldErrors.country && touched.country ? 'form-group-error' : ''}`}>
                <label className="form-label" htmlFor="country">Country</label>
                <input
                  id="country"
                  name="country"
                  className={`form-input ${fieldErrors.country && touched.country ? 'form-input-error' : ''}`}
                  value={form.country}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="Country"
                  maxLength={FIELD_LIMITS.country}
                />
                {fieldErrors.country && touched.country && (
                  <span className="form-error-message">{fieldErrors.country}</span>
                )}
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

            <div className={`form-group ${fieldErrors.notes && touched.notes ? 'form-group-error' : ''}`}>
              <label className="form-label" htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                name="notes"
                className={`form-input form-textarea ${fieldErrors.notes && touched.notes ? 'form-input-error' : ''}`}
                value={form.notes}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="Relationship context, anniversaries, repeat preferences..."
                rows={3}
                maxLength={FIELD_LIMITS.notes}
              />
              <div className="form-field-footer">
                {fieldErrors.notes && touched.notes && (
                  <span className="form-error-message">{fieldErrors.notes}</span>
                )}
                <span className={`character-count ${isApproachingLimit(form.notes, FIELD_LIMITS.notes) ? 'character-count-warning' : ''}`}>
                  {getCharacterCount(form.notes, FIELD_LIMITS.notes)}
                </span>
              </div>
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
            </fieldset>
          </div>

          <div className="modal-footer" style={{ flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
            {/* Slow/timeout warning */}
            {showSlowWarning && (
              <div
                className={`loading-slow-warning ${showTimeoutWarning ? 'loading-timeout-warning' : ''}`}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {showTimeoutWarning ? (
                  <>
                    <span>This is taking longer than expected ({Math.floor(loadingElapsed / 1000)}s)</span>
                  </>
                ) : (
                  <span>Still working... ({Math.floor(loadingElapsed / 1000)}s)</span>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'flex-end', width: '100%' }}>
              {loading && showSlowWarning ? (
                <button type="button" className="btn btn-outline" onClick={handleCancel}>
                  Cancel Request
                </button>
              ) : (
                <button type="button" className="btn btn-outline" onClick={handleAttemptClose} disabled={loading}>
                  Cancel
                </button>
              )}
              <LoadingButton
                type="submit"
                className="btn btn-primary"
                loading={loading}
                loadingText="Saving..."
              >
                {client ? 'Save Changes' : 'Create Client'}
              </LoadingButton>
            </div>
            {isDirty && (
              <div className="form-dirty-indicator-text" style={{ marginTop: 'var(--spacing-xs)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                <span style={{ color: 'var(--color-warning)' }}>*</span> You have unsaved changes
              </div>
            )}
          </div>
        </form>

        {/* Concurrent Edit Conflict Modal */}
        {showConflictModal && (
          <div className="modal-overlay" onClick={() => setShowConflictModal(false)} style={{ zIndex: 1001 }}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">
                  <span style={{ marginRight: 'var(--spacing-sm)', color: 'var(--color-warning)' }}>⚠️</span>
                  Edit Conflict Detected
                </h2>
                <button className="modal-close-btn" onClick={() => setShowConflictModal(false)} aria-label="Close">×</button>
              </div>
              <div className="modal-body">
                <div style={{ padding: 'var(--spacing-md)', backgroundColor: 'var(--color-warning-bg, #fef3c7)', borderRadius: 'var(--border-radius)', marginBottom: 'var(--spacing-lg)' }}>
                  <p style={{ margin: 0, color: 'var(--color-warning-text, #92400e)' }}>
                    {conflictData?.message || 'This record has been modified by another user since you opened it.'}
                  </p>
                </div>
                <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-md)' }}>
                  To avoid overwriting their changes, you can:
                </p>
                <ul style={{ color: 'var(--color-text-secondary)', marginLeft: 'var(--spacing-lg)', marginBottom: 'var(--spacing-lg)' }}>
                  <li><strong>Refresh</strong> - Load the latest version and keep your unsaved changes to review</li>
                  <li><strong>Discard</strong> - Close without saving and start over</li>
                </ul>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={handleDiscardChanges}>
                  Discard Changes
                </button>
                <button type="button" className="btn btn-primary" onClick={handleRefreshAndRetry}>
                  Refresh & Review
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Unsaved Changes Warning Modal */}
        {showUnsavedWarning && (
          <div className="modal-overlay" onClick={handleCancelLeave} style={{ zIndex: 1002 }}>
            <div className="modal-content unsaved-changes-dialog" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">
                  <span className="unsaved-warning-icon">&#9888;</span>
                  {' '}Unsaved Changes
                </h2>
              </div>
              <div className="modal-body">
                <p style={{ margin: 0 }}>
                  You have unsaved changes. Are you sure you want to leave? Your changes will be lost.
                </p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCancelLeave}
                  autoFocus
                >
                  Stay on Page
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-danger"
                  onClick={handleConfirmLeave}
                >
                  Leave Page
                </button>
              </div>
            </div>
          </div>
        )}
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

function ClientDetail({ client, onBack, onEdit, onDelete, token, onNavigateToTrip }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [trips, setTrips] = useState([]);
  const [tripsLoading, setTripsLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState('info');
  const { addToast } = useToast();
  const deletingRef = useRef(false); // Prevent rapid delete clicks

  // Portal access state
  const [portalStatus, setPortalStatus] = useState(null);
  const [portalLoading, setPortalLoading] = useState(true);
  const [showPortalModal, setShowPortalModal] = useState(false);
  const [portalForm, setPortalForm] = useState({ email: '', password: '' });
  const [portalFormLoading, setPortalFormLoading] = useState(false);
  const [portalToggling, setPortalToggling] = useState(false);

  // Communications state
  const [emails, setEmails] = useState([]);
  const [emailsLoading, setEmailsLoading] = useState(true);

  // Fetch associated trips when client loads
  useEffect(() => {
    if (client) {
      setTripsLoading(true);
      fetch(`/api/trips?clientId=${client.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          setTrips(data.trips || []);
        })
        .catch(() => setTrips([]))
        .finally(() => setTripsLoading(false));
    }
  }, [client, token]);

  // Fetch portal access status
  useEffect(() => {
    if (client) {
      setPortalLoading(true);
      fetch(`/api/clients/${client.id}/portal`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          setPortalStatus(data);
        })
        .catch(() => setPortalStatus(null))
        .finally(() => setPortalLoading(false));
    }
  }, [client, token]);

  // Fetch email history for client
  useEffect(() => {
    if (client) {
      setEmailsLoading(true);
      fetch(`/api/email-templates/queue/list?clientId=${client.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          setEmails(data.queue || []);
        })
        .catch(() => setEmails([]))
        .finally(() => setEmailsLoading(false));
    }
  }, [client, token]);

  // Handle creating portal access
  const handleCreatePortalAccess = async (e) => {
    e.preventDefault();
    if (!portalForm.password || portalForm.password.length < 6) {
      addToast('Password must be at least 6 characters', 'error');
      return;
    }

    setPortalFormLoading(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/portal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: portalForm.email || client.email,
          password: portalForm.password
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create portal access');
      }
      addToast('Portal access enabled successfully', 'success');
      setPortalStatus({ ...portalStatus, hasPortalAccess: true, portalAccount: data.portalAccount });
      setShowPortalModal(false);
      setPortalForm({ email: '', password: '' });
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setPortalFormLoading(false);
    }
  };

  // Handle toggling portal access (enable/disable)
  const handleTogglePortalAccess = async (enable) => {
    setPortalToggling(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/portal`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isActive: enable })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update portal access');
      }
      addToast(enable ? 'Portal access enabled' : 'Portal access disabled', 'success');
      setPortalStatus({ ...portalStatus, portalAccount: data.portalAccount });
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setPortalToggling(false);
    }
  };

  const handleDeleteConfirm = async () => {
    // Prevent rapid delete clicks
    if (deletingRef.current || deleting) {
      return;
    }
    deletingRef.current = true;
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
      deletingRef.current = false;
      setShowDeleteConfirm(false);
    }
  };

  const getStageColor = (stage) => {
    const colors = {
      inquiry: 'status-info',
      quoted: 'status-warning',
      booked: 'status-success',
      traveling: 'status-primary',
      completed: 'status-neutral',
      canceled: 'status-danger',
      archived: 'status-neutral'
    };
    return colors[stage] || 'status-neutral';
  };

  if (!client) return null;

  const breadcrumbItems = [
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'Clients', path: '/clients' },
    { label: `${client.firstName} ${client.lastName}` }
  ];

  return (
    <div className="client-detail">
      <Breadcrumb items={breadcrumbItems} />
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
                {trips.length > 0 && (
                  <div className="warning-box" style={{ padding: 'var(--spacing-md)', backgroundColor: 'var(--color-warning-bg, #fef3c7)', borderRadius: 'var(--border-radius)', marginBottom: 'var(--spacing-md)' }}>
                    <p style={{ color: 'var(--color-warning-text, #92400e)', margin: 0 }}>
                      ⚠️ This client has <strong>{trips.length} associated trip{trips.length !== 1 ? 's' : ''}</strong>.
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

        {/* Tabs for Info, Trips, and Portal */}
        <div className="detail-tabs client-detail-tabs" style={{ borderBottom: '1px solid var(--color-border)', marginBottom: 'var(--spacing-lg)' }}>
          <button
            className={`detail-tab ${activeTab === 'info' ? 'detail-tab-active' : ''}`}
            onClick={() => setActiveTab('info')}
            style={{
              padding: 'var(--spacing-sm) var(--spacing-md)',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'info' ? '2px solid var(--color-primary)' : '2px solid transparent',
              color: activeTab === 'info' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              fontWeight: activeTab === 'info' ? '600' : '400',
              cursor: 'pointer',
              marginRight: 'var(--spacing-md)'
            }}
          >
            Info
          </button>
          <button
            className={`detail-tab ${activeTab === 'trips' ? 'detail-tab-active' : ''}`}
            onClick={() => setActiveTab('trips')}
            style={{
              padding: 'var(--spacing-sm) var(--spacing-md)',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'trips' ? '2px solid var(--color-primary)' : '2px solid transparent',
              color: activeTab === 'trips' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              fontWeight: activeTab === 'trips' ? '600' : '400',
              cursor: 'pointer',
              marginRight: 'var(--spacing-md)'
            }}
          >
            Trips ({trips.length})
          </button>
          <button
            className={`detail-tab ${activeTab === 'portal' ? 'detail-tab-active' : ''}`}
            onClick={() => setActiveTab('portal')}
            style={{
              padding: 'var(--spacing-sm) var(--spacing-md)',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'portal' ? '2px solid var(--color-primary)' : '2px solid transparent',
              color: activeTab === 'portal' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              fontWeight: activeTab === 'portal' ? '600' : '400',
              cursor: 'pointer'
            }}
          >
            Portal Access
          </button>
          <button
            className={`detail-tab ${activeTab === 'communications' ? 'detail-tab-active' : ''}`}
            onClick={() => setActiveTab('communications')}
            style={{
              padding: 'var(--spacing-sm) var(--spacing-md)',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === 'communications' ? '2px solid var(--color-primary)' : '2px solid transparent',
              color: activeTab === 'communications' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              fontWeight: activeTab === 'communications' ? '600' : '400',
              cursor: 'pointer'
            }}
          >
            Communications
          </button>
        </div>

        <div className="client-tab-content">
          {activeTab === 'info' && (
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
        )}

        {activeTab === 'trips' && (
          <div className="client-trips-section">
            {tripsLoading ? (
              <div className="loading-screen" style={{ minHeight: '100px' }}>
                <div className="loading-spinner" />
                <p>Loading trips...</p>
              </div>
            ) : trips.length === 0 ? (
              <div className="empty-state-small" style={{ padding: 'var(--spacing-xl)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                <p>No trips found for this client.</p>
              </div>
            ) : (
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Trip Name</th>
                      <th>Destination</th>
                      <th>Stage</th>
                      <th>Dates</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trips.map(trip => (
                      <tr
                        key={trip.id}
                        className="data-table-row-clickable"
                        onClick={() => onNavigateToTrip(trip.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <span style={{ fontWeight: '500', color: 'var(--color-primary)' }}>
                            {trip.name}
                          </span>
                        </td>
                        <td>{trip.destination || '—'}</td>
                        <td>
                          <span className={`status-badge ${getStageColor(trip.stage)}`}>
                            {trip.stage}
                          </span>
                        </td>
                        <td>
                          {trip.startDate && trip.endDate
                            ? `${new Date(trip.startDate).toLocaleDateString()} - ${new Date(trip.endDate).toLocaleDateString()}`
                            : trip.startDate
                              ? new Date(trip.startDate).toLocaleDateString()
                              : '—'
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'portal' && (
          <div className="portal-access-section">
            {portalLoading ? (
              <div className="loading-screen" style={{ minHeight: '100px' }}>
                <div className="loading-spinner" />
                <p>Loading portal status...</p>
              </div>
            ) : !portalStatus?.hasPortalAccess ? (
              <div className="detail-section">
                <h3 className="detail-section-title">Customer Portal Access</h3>
                <div style={{ padding: 'var(--spacing-lg)', backgroundColor: 'var(--color-bg-secondary)', borderRadius: 'var(--border-radius)', textAlign: 'center' }}>
                  <div style={{ fontSize: '48px', marginBottom: 'var(--spacing-md)' }}>🔒</div>
                  <p style={{ marginBottom: 'var(--spacing-md)', color: 'var(--color-text-secondary)' }}>
                    This client does not have portal access enabled.
                  </p>
                  <p style={{ marginBottom: 'var(--spacing-lg)', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                    Enable portal access to allow {client.firstName} to view their trips, submit traveler information, and access documents online.
                  </p>
                  <button className="btn btn-primary" onClick={() => {
                    setPortalForm({ email: client.email || '', password: '' });
                    setShowPortalModal(true);
                  }}>
                    Enable Portal Access
                  </button>
                </div>
              </div>
            ) : (
              <div className="detail-section">
                <h3 className="detail-section-title">Customer Portal Access</h3>
                <div style={{ padding: 'var(--spacing-lg)', backgroundColor: 'var(--color-bg-secondary)', borderRadius: 'var(--border-radius)' }}>
                  <div className="detail-grid">
                    <div className="detail-field">
                      <span className="detail-field-label">Status</span>
                      <span className={`status-badge ${portalStatus.portalAccount.isActive ? 'status-success' : 'status-danger'}`}>
                        {portalStatus.portalAccount.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    <div className="detail-field">
                      <span className="detail-field-label">Portal Email</span>
                      <span className="detail-field-value">{portalStatus.portalAccount.email}</span>
                    </div>
                    <div className="detail-field">
                      <span className="detail-field-label">Created</span>
                      <span className="detail-field-value">
                        {new Date(portalStatus.portalAccount.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div style={{ marginTop: 'var(--spacing-lg)', paddingTop: 'var(--spacing-md)', borderTop: '1px solid var(--color-border)' }}>
                    <p style={{ marginBottom: 'var(--spacing-md)', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                      {portalStatus.portalAccount.isActive
                        ? 'The customer can log in to the portal at /portal/login to view their trips and documents.'
                        : 'Portal access is currently disabled. The customer cannot log in until you re-enable access.'
                      }
                    </p>
                    {portalStatus.portalAccount.isActive ? (
                      <button
                        className="btn btn-danger"
                        onClick={() => handleTogglePortalAccess(false)}
                        disabled={portalToggling}
                      >
                        {portalToggling ? 'Disabling...' : 'Disable Portal Access'}
                      </button>
                    ) : (
                      <button
                        className="btn btn-success"
                        onClick={() => handleTogglePortalAccess(true)}
                        disabled={portalToggling}
                        style={{ backgroundColor: 'var(--color-success)', color: 'white' }}
                      >
                        {portalToggling ? 'Enabling...' : 'Enable Portal Access'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'communications' && (
          <div className="communications-section">
            {emailsLoading ? (
              <div className="loading-screen" style={{ minHeight: '100px' }}>
                <div className="loading-spinner" />
                <p>Loading email history...</p>
              </div>
            ) : emails.length === 0 ? (
              <div className="page-empty-state" style={{ padding: '2rem' }}>
                <div className="empty-state-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </div>
                <h3 className="empty-state-title">No emails sent yet</h3>
                <p className="empty-state-description">Email communications for this client will appear here.</p>
              </div>
            ) : (
              <div className="detail-section">
                <h3 className="detail-section-title">Email History ({emails.length})</h3>
                <div className="data-table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Template</th>
                        <th>Subject</th>
                        <th>Trip</th>
                        <th>Status</th>
                        <th>Sent/Scheduled</th>
                      </tr>
                    </thead>
                    <tbody>
                      {emails.map(email => (
                        <tr key={email.id}>
                          <td>
                            <span className="table-user-name">{email.templateName || 'Custom Email'}</span>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.875rem' }}>{email.templateSubject || '—'}</span>
                          </td>
                          <td>
                            {email.tripName ? (
                              <span style={{ fontSize: '0.875rem' }}>{email.tripName}</span>
                            ) : '—'}
                          </td>
                          <td>
                            <span className={`status-badge ${
                              email.status === 'sent' ? 'status-success' :
                              email.status === 'approved' ? 'status-info' :
                              email.status === 'pending' ? 'status-warning' :
                              email.status === 'failed' ? 'status-danger' : 'status-neutral'
                            }`}>
                              {email.status}
                            </span>
                          </td>
                          <td>
                            {email.sentAt
                              ? new Date(email.sentAt).toLocaleString()
                              : email.scheduledSendDate
                                ? `Scheduled: ${new Date(email.scheduledSendDate).toLocaleString()}`
                                : '—'
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
        </div>

        {/* Portal Access Creation Modal */}
        {showPortalModal && (
          <div className="modal-overlay" onClick={() => setShowPortalModal(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">Enable Portal Access</h2>
                <button className="modal-close-btn" onClick={() => setShowPortalModal(false)} aria-label="Close">×</button>
              </div>
              <form onSubmit={handleCreatePortalAccess}>
                <div className="modal-body">
                  <p style={{ marginBottom: 'var(--spacing-lg)', color: 'var(--color-text-secondary)' }}>
                    Create a portal login for <strong>{client.firstName} {client.lastName}</strong> so they can access their travel information online.
                  </p>

                  <div className="form-group">
                    <label className="form-label" htmlFor="portalEmail">Portal Login Email</label>
                    <input
                      id="portalEmail"
                      type="email"
                      className="form-input"
                      value={portalForm.email}
                      onChange={(e) => setPortalForm(prev => ({ ...prev, email: e.target.value }))}
                      placeholder={client.email || 'Enter email address'}
                      required
                    />
                    <p className="form-hint">This email will be used for portal login</p>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="portalPassword">Temporary Password *</label>
                    <input
                      id="portalPassword"
                      type="text"
                      className="form-input"
                      value={portalForm.password}
                      onChange={(e) => setPortalForm(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="Create a temporary password"
                      minLength={6}
                      required
                    />
                    <p className="form-hint">Must be at least 6 characters. Share this with the client to get started.</p>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline" onClick={() => setShowPortalModal(false)} disabled={portalFormLoading}>
                    Cancel
                  </button>
                  <LoadingButton
                    type="submit"
                    className="btn btn-primary"
                    loading={portalFormLoading}
                    loadingText="Creating..."
                  >
                    Create Portal Access
                  </LoadingButton>
                </div>
              </form>
            </div>
          </div>
        )}
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
  // Track form dirty state for navigation blocking
  const [formIsDirty, setFormIsDirty] = useState(false);

  // Block navigation when form has unsaved changes
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      formIsDirty && currentLocation.pathname !== nextLocation.pathname
  );

  // Handle navigation confirmation
  const handleConfirmNavigation = () => {
    if (blocker.state === 'blocked') {
      blocker.proceed();
    }
  };

  const handleCancelNavigation = () => {
    if (blocker.state === 'blocked') {
      blocker.reset();
    }
  };

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
          onNavigateToTrip={(tripId) => navigate(`/trips/${tripId}`)}
        />
        <ClientFormModal
          isOpen={showModal}
          onClose={() => { setShowModal(false); setEditClient(null); }}
          onSaved={handleClientSaved}
          client={editClient}
          token={token}
          users={users}
          onDirtyChange={setFormIsDirty}
        />
        {/* Navigation blocker dialog for unsaved changes */}
        <UnsavedChangesDialog
          isOpen={blocker.state === 'blocked'}
          onStay={handleCancelNavigation}
          onLeave={handleConfirmNavigation}
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
          <button className="btn btn-outline" onClick={() => {
            // Build URL with current filters
            const params = new URLSearchParams();
            if (search) params.set('search', search);
            if (plannerFilter) params.set('assignedTo', plannerFilter);
            const url = `${API_BASE}/clients/export?${params}`;
            // Create temporary link to download
            const link = document.createElement('a');
            link.href = url;
            link.download = 'clients-export.csv';
            // Fetch with auth header and trigger download
            fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
              .then(res => res.blob())
              .then(blob => {
                const blobUrl = window.URL.createObjectURL(blob);
                link.href = blobUrl;
                document.body.appendChild(link);
                link.click();
                window.URL.revokeObjectURL(blobUrl);
                document.body.removeChild(link);
              });
          }}>
            ⬇ Export CSV
          </button>
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
        users={users}
        onDirtyChange={setFormIsDirty}
      />
      <CsvImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImported={handleImportComplete}
        token={token}
      />
      {/* Navigation blocker dialog for unsaved changes */}
      <UnsavedChangesDialog
        isOpen={blocker.state === 'blocked'}
        onStay={handleCancelNavigation}
        onLeave={handleConfirmNavigation}
      />
    </div>
  );
}
