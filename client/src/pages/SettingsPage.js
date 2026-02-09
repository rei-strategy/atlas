import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { useTimezone } from '../hooks/useTimezone';
import { useModalAccessibility } from '../hooks/useModalAccessibility';
import LoadingButton from '../components/LoadingButton';

const API_BASE = '/api';

// Audit Log Action Filter Options
const APPROVAL_ACTIONS = [
  { value: 'create_approval_request', label: 'Created Approval Request' },
  { value: 'approve_request', label: 'Approved Request' },
  { value: 'deny_request', label: 'Denied Request' }
];

// All audit log actions
const ALL_ACTIONS = [
  { value: 'create_approval_request', label: 'Created Approval Request', category: 'Approvals' },
  { value: 'approve_request', label: 'Approved Request', category: 'Approvals' },
  { value: 'deny_request', label: 'Denied Request', category: 'Approvals' },
  { value: 'create_user', label: 'Created User', category: 'Users' },
  { value: 'update_user', label: 'Updated User', category: 'Users' },
  { value: 'deactivate_user', label: 'Deactivated User', category: 'Users' },
  { value: 'create_booking', label: 'Created Booking', category: 'Bookings' },
  { value: 'update_booking', label: 'Updated Booking', category: 'Bookings' },
  { value: 'delete_booking', label: 'Deleted Booking', category: 'Bookings' },
  { value: 'update_commission_status', label: 'Updated Commission', category: 'Bookings' },
  { value: 'stage_change', label: 'Changed Trip Stage', category: 'Trips' },
  { value: 'create_task', label: 'Created Task', category: 'Tasks' },
  { value: 'complete_task', label: 'Completed Task', category: 'Tasks' },
  { value: 'update_task', label: 'Updated Task', category: 'Tasks' },
  { value: 'delete_task', label: 'Deleted Task', category: 'Tasks' },
  { value: 'upload_document', label: 'Uploaded Document', category: 'Documents' },
  { value: 'update_settings', label: 'Updated Settings', category: 'Settings' },
  { value: 'create_email_template', label: 'Created Email Template', category: 'Email' },
  { value: 'update_email_template', label: 'Updated Email Template', category: 'Email' },
  { value: 'delete_email_template', label: 'Deleted Email Template', category: 'Email' }
];

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

// Predefined brand colors (calm, pastel-leaning)
const BRAND_COLORS = [
  '#7DA7C7', // Primary Blue
  '#6A93B2', // Primary Dark
  '#A5C0D6', // Primary Light
  '#A9C7B6', // Sage Green
  '#C6C8D1', // Lavender Gray
  '#E9E4DE', // Warm Neutral Beige
  '#C9BFAE', // Soft Warm Accent
  '#B6A7B3', // Muted Mauve
  '#2F3A45', // Deep Slate
];

// Workflow Timing Settings Form Component
function WorkflowSettingsForm({ token, isAdmin }) {
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    deadlineReminderDays: 7,
    quoteFollowupDays: 3,
    bookingConfirmationDays: 1,
    finalPaymentReminderDays: 7,
    travelReminderDays: 0,
    feedbackRequestDays: 3
  });
  const [error, setError] = useState('');

  // Fetch current workflow settings
  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/settings/agency`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.agency) {
        setFormData({
          deadlineReminderDays: data.agency.deadlineReminderDays ?? 7,
          quoteFollowupDays: data.agency.quoteFollowupDays ?? 3,
          bookingConfirmationDays: data.agency.bookingConfirmationDays ?? 1,
          finalPaymentReminderDays: data.agency.finalPaymentReminderDays ?? 7,
          travelReminderDays: data.agency.travelReminderDays ?? 0,
          feedbackRequestDays: data.agency.feedbackRequestDays ?? 3
        });
      }
    } catch (err) {
      console.error('Failed to load workflow settings:', err);
      setError('Failed to load workflow settings');
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isAdmin) {
      setError('Only administrators can update workflow settings');
      return;
    }

    setError('');
    setSaving(true);

    try {
      // First get the current full settings
      const getRes = await fetch(`${API_BASE}/settings/agency`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const current = await getRes.json();

      // Merge workflow settings with existing settings
      const res = await fetch(`${API_BASE}/settings/agency`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: current.agency.name,
          logoUrl: current.agency.logoUrl,
          primaryColor: current.agency.primaryColor,
          emailSignature: current.agency.emailSignature,
          defaultCommissionRate: current.agency.defaultCommissionRate,
          timezone: current.agency.timezone,
          deadlineReminderDays: parseInt(formData.deadlineReminderDays, 10),
          quoteFollowupDays: parseInt(formData.quoteFollowupDays, 10),
          bookingConfirmationDays: parseInt(formData.bookingConfirmationDays, 10),
          finalPaymentReminderDays: parseInt(formData.finalPaymentReminderDays, 10),
          travelReminderDays: parseInt(formData.travelReminderDays, 10),
          feedbackRequestDays: parseInt(formData.feedbackRequestDays, 10)
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save workflow settings');
      }

      showToast('Workflow settings saved successfully!', 'success');
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
          <p className="dashboard-empty-state">Loading workflow settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-card">
      <div className="dashboard-card-header">
        <h3>Task & Reminder Timing</h3>
      </div>
      <div className="dashboard-card-body">
        {error && <div className="form-error">{error}</div>}

        <p className="settings-description">
          Configure when automatic tasks and reminders are generated during the trip lifecycle.
          These settings apply to all new trips created in your agency.
        </p>

        <form onSubmit={handleSubmit} className="workflow-settings-form">
          {/* Quote Follow-up Days */}
          <div className="form-group">
            <label htmlFor="quoteFollowupDays">Quote Follow-up Reminder</label>
            <div className="input-with-suffix">
              <input
                id="quoteFollowupDays"
                type="number"
                name="quoteFollowupDays"
                value={formData.quoteFollowupDays}
                onChange={handleChange}
                min="0"
                max="365"
                disabled={!isAdmin}
              />
              <span className="input-suffix">days after quote sent</span>
            </div>
            <span className="form-hint">When to remind planners to follow up on sent quotes.</span>
          </div>

          {/* Booking Confirmation Days */}
          <div className="form-group">
            <label htmlFor="bookingConfirmationDays">Booking Confirmation Task</label>
            <div className="input-with-suffix">
              <input
                id="bookingConfirmationDays"
                type="number"
                name="bookingConfirmationDays"
                value={formData.bookingConfirmationDays}
                onChange={handleChange}
                min="0"
                max="365"
                disabled={!isAdmin}
              />
              <span className="input-suffix">days after booking confirmed</span>
            </div>
            <span className="form-hint">When to verify booking confirmations are received.</span>
          </div>

          {/* Final Payment Reminder Days */}
          <div className="form-group">
            <label htmlFor="finalPaymentReminderDays">Final Payment Reminder</label>
            <div className="input-with-suffix">
              <input
                id="finalPaymentReminderDays"
                type="number"
                name="finalPaymentReminderDays"
                value={formData.finalPaymentReminderDays}
                onChange={handleChange}
                min="0"
                max="365"
                disabled={!isAdmin}
              />
              <span className="input-suffix">days to collect payment</span>
            </div>
            <span className="form-hint">Days given to collect final payment after stage change.</span>
          </div>

          {/* Travel Reminder Days */}
          <div className="form-group">
            <label htmlFor="travelReminderDays">Bon Voyage Message</label>
            <div className="input-with-suffix">
              <input
                id="travelReminderDays"
                type="number"
                name="travelReminderDays"
                value={formData.travelReminderDays}
                onChange={handleChange}
                min="0"
                max="365"
                disabled={!isAdmin}
              />
              <span className="input-suffix">days after travel starts</span>
            </div>
            <span className="form-hint">When to send bon voyage message. Use 0 for same day.</span>
          </div>

          {/* Feedback Request Days */}
          <div className="form-group">
            <label htmlFor="feedbackRequestDays">Feedback Request</label>
            <div className="input-with-suffix">
              <input
                id="feedbackRequestDays"
                type="number"
                name="feedbackRequestDays"
                value={formData.feedbackRequestDays}
                onChange={handleChange}
                min="0"
                max="365"
                disabled={!isAdmin}
              />
              <span className="input-suffix">days after trip completed</span>
            </div>
            <span className="form-hint">When to request post-trip feedback from clients.</span>
          </div>

          {/* Deadline Reminder Days */}
          <div className="form-group">
            <label htmlFor="deadlineReminderDays">General Deadline Reminders</label>
            <div className="input-with-suffix">
              <input
                id="deadlineReminderDays"
                type="number"
                name="deadlineReminderDays"
                value={formData.deadlineReminderDays}
                onChange={handleChange}
                min="0"
                max="365"
                disabled={!isAdmin}
              />
              <span className="input-suffix">days before deadline</span>
            </div>
            <span className="form-hint">Default reminder for approaching deadlines (insurance, check-in, etc.).</span>
          </div>

          {/* Save Button */}
          {isAdmin && (
            <div className="form-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Workflow Settings'}
              </button>
            </div>
          )}

          {!isAdmin && (
            <div className="form-info-box">
              <span className="info-icon">ℹ️</span>
              <span>Only administrators can modify workflow settings.</span>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

function AgencySettingsForm({ token, isAdmin, refreshAgency }) {
  const { showToast } = useToast();
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    logoUrl: '',
    primaryColor: '#7DA7C7',
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
          primaryColor: data.agency.primaryColor || '#7DA7C7',
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

      // Refresh agency data in AuthContext so timezone changes take effect immediately
      if (refreshAgency) {
        await refreshAgency();
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
                      placeholder="#2F3A45"
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

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function InviteUserModal({ isOpen, onClose, onSuccess, token }) {
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    role: 'planner',
    password: ''
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  // Modal accessibility: focus trapping, Escape key, focus restoration
  const { modalRef } = useModalAccessibility(isOpen, onClose);

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
      case 'password':
        if (!value) {
          return 'Password is required';
        }
        if (value.length < 6) {
          return 'Password must be at least 6 characters';
        }
        return '';
      default:
        return '';
    }
  };

  // Validate all fields
  const validateAllFields = () => {
    const errors = {};
    const fields = ['email', 'firstName', 'lastName', 'password'];
    fields.forEach(field => {
      const error = validateField(field, formData[field]);
      if (error) {
        errors[field] = error;
      }
    });
    return errors;
  };

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
      email: true,
      firstName: true,
      lastName: true,
      password: true
    });

    // If there are any errors, don't submit
    if (Object.keys(errors).length > 0) {
      setError('Please fix the errors below before submitting');
      return;
    }

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
        // Use detailed message for permission errors, otherwise use error field
        throw new Error(data.message || data.error || 'Failed to invite user');
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
    setFieldErrors({});
    setTouched({});
    setResult(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose} role="presentation">
      <div
        ref={modalRef}
        className="modal-content"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-user-modal-title"
      >
        <div className="modal-header">
          <h2 id="invite-user-modal-title">{result ? 'User Invited!' : 'Invite Team Member'}</h2>
          <button className="modal-close" onClick={handleClose} aria-label="Close dialog">&times;</button>
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
              <div className={`form-group ${fieldErrors.email && touched.email ? 'form-group-error' : ''}`}>
                <label htmlFor="invite-email">Email *</label>
                <input
                  id="invite-email"
                  type="email"
                  name="email"
                  className={fieldErrors.email && touched.email ? 'form-input-error' : ''}
                  value={formData.email}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="team@example.com"
                  autoFocus
                  aria-invalid={!!(fieldErrors.email && touched.email)}
                  aria-describedby={fieldErrors.email && touched.email ? 'invite-email-error' : undefined}
                />
                {fieldErrors.email && touched.email && (
                  <span id="invite-email-error" className="form-error-message">{fieldErrors.email}</span>
                )}
              </div>
              <div className="form-row">
                <div className={`form-group ${fieldErrors.firstName && touched.firstName ? 'form-group-error' : ''}`}>
                  <label htmlFor="invite-firstName">First Name *</label>
                  <input
                    id="invite-firstName"
                    type="text"
                    name="firstName"
                    className={fieldErrors.firstName && touched.firstName ? 'form-input-error' : ''}
                    value={formData.firstName}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="First name"
                    aria-invalid={!!(fieldErrors.firstName && touched.firstName)}
                    aria-describedby={fieldErrors.firstName && touched.firstName ? 'invite-firstName-error' : undefined}
                  />
                  {fieldErrors.firstName && touched.firstName && (
                    <span id="invite-firstName-error" className="form-error-message">{fieldErrors.firstName}</span>
                  )}
                </div>
                <div className={`form-group ${fieldErrors.lastName && touched.lastName ? 'form-group-error' : ''}`}>
                  <label htmlFor="invite-lastName">Last Name *</label>
                  <input
                    id="invite-lastName"
                    type="text"
                    name="lastName"
                    className={fieldErrors.lastName && touched.lastName ? 'form-input-error' : ''}
                    value={formData.lastName}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="Last name"
                    aria-invalid={!!(fieldErrors.lastName && touched.lastName)}
                    aria-describedby={fieldErrors.lastName && touched.lastName ? 'invite-lastName-error' : undefined}
                  />
                  {fieldErrors.lastName && touched.lastName && (
                    <span id="invite-lastName-error" className="form-error-message">{fieldErrors.lastName}</span>
                  )}
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
              <LoadingButton
                type="submit"
                className="btn btn-primary"
                loading={loading}
                loadingText="Inviting..."
              >
                Invite User
              </LoadingButton>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// Audit Logs Component
function AuditLogsTable({ token, isAdmin }) {
  const { formatDateTime } = useTimezone();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState({
    action: '',
    entityType: '',
    showApprovalsOnly: true
  });
  const limit = 20;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      let url;
      if (filters.showApprovalsOnly) {
        // Use the approvals endpoint
        url = `${API_BASE}/audit-logs/approvals?limit=${limit}&offset=${offset}`;
      } else {
        // Use the general endpoint with filters
        url = `${API_BASE}/audit-logs?limit=${limit}&offset=${offset}`;
        if (filters.action) {
          url += `&action=${encodeURIComponent(filters.action)}`;
        }
        if (filters.entityType) {
          url += `&entityType=${encodeURIComponent(filters.entityType)}`;
        }
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch audit logs');
      }

      setLogs(data.auditLogs || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, offset, filters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0);
  }, [filters.action, filters.entityType, filters.showApprovalsOnly]);

  const handleFilterChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const formatDetails = (details, action) => {
    if (!details || Object.keys(details).length === 0) {
      return '-';
    }

    // Format approval-specific details
    if (action.includes('approval') || action.includes('approve') || action.includes('deny')) {
      const parts = [];
      if (details.actionType) {
        parts.push(`Action: ${details.actionType.replace(/_/g, ' ')}`);
      }
      if (details.entityType) {
        parts.push(`Entity: ${details.entityType}`);
      }
      if (details.entityId) {
        parts.push(`ID: ${details.entityId}`);
      }
      if (details.responseNote) {
        parts.push(`Note: "${details.responseNote}"`);
      }
      if (details.reason) {
        parts.push(`Reason: ${details.reason}`);
      }
      return parts.length > 0 ? parts.join(', ') : '-';
    }

    // Default: show key-value pairs
    return Object.entries(details)
      .filter(([k, v]) => v !== null && v !== undefined && k !== 'raw')
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(', ') || '-';
  };

  const getActionBadgeClass = (action) => {
    if (action === 'approve_request') return 'action-badge action-approve';
    if (action === 'deny_request') return 'action-badge action-deny';
    if (action === 'create_approval_request') return 'action-badge action-create';
    if (action.includes('delete')) return 'action-badge action-delete';
    if (action.includes('create') || action.includes('upload')) return 'action-badge action-create';
    if (action.includes('update') || action.includes('change')) return 'action-badge action-update';
    return 'action-badge';
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="dashboard-card">
      <div className="dashboard-card-header">
        <h3>Audit Logs</h3>
      </div>
      <div className="dashboard-card-body">
        {error && <div className="form-error">{error}</div>}

        {/* Filters */}
        <div className="audit-log-filters">
          <div className="filter-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="showApprovalsOnly"
                checked={filters.showApprovalsOnly}
                onChange={handleFilterChange}
              />
              <span>Show approval actions only</span>
            </label>
          </div>

          {!filters.showApprovalsOnly && (
            <div className="filter-group">
              <label htmlFor="action-filter">Action Type</label>
              <select
                id="action-filter"
                name="action"
                value={filters.action}
                onChange={handleFilterChange}
              >
                <option value="">All Actions</option>
                <optgroup label="Approvals">
                  {ALL_ACTIONS.filter(a => a.category === 'Approvals').map(a => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Users">
                  {ALL_ACTIONS.filter(a => a.category === 'Users').map(a => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Bookings">
                  {ALL_ACTIONS.filter(a => a.category === 'Bookings').map(a => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Trips">
                  {ALL_ACTIONS.filter(a => a.category === 'Trips').map(a => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Tasks">
                  {ALL_ACTIONS.filter(a => a.category === 'Tasks').map(a => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Documents">
                  {ALL_ACTIONS.filter(a => a.category === 'Documents').map(a => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Settings">
                  {ALL_ACTIONS.filter(a => a.category === 'Settings').map(a => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Email Templates">
                  {ALL_ACTIONS.filter(a => a.category === 'Email').map(a => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </optgroup>
              </select>
            </div>
          )}

          {!filters.showApprovalsOnly && (
            <div className="filter-group">
              <label htmlFor="entity-filter">Entity Type</label>
              <select
                id="entity-filter"
                name="entityType"
                value={filters.entityType}
                onChange={handleFilterChange}
              >
                <option value="">All Entities</option>
                <option value="approval_request">Approval Request</option>
                <option value="user">User</option>
                <option value="booking">Booking</option>
                <option value="trip">Trip</option>
                <option value="task">Task</option>
                <option value="document">Document</option>
                <option value="email_template">Email Template</option>
                <option value="agency">Agency</option>
              </select>
            </div>
          )}
        </div>

        {/* Results */}
        {loading ? (
          <p className="dashboard-empty-state">Loading audit logs...</p>
        ) : logs.length === 0 ? (
          <p className="dashboard-empty-state">
            {filters.showApprovalsOnly
              ? 'No approval-related audit logs found. Create and resolve approval requests to see them here.'
              : 'No audit logs found matching your filters.'}
          </p>
        ) : (
          <>
            <div className="audit-log-count">
              Showing {logs.length} of {total} logs
            </div>
            <div className="table-responsive">
              <table className="data-table audit-logs-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id}>
                      <td className="timestamp-cell">
                        {formatDateTime(log.createdAt)}
                      </td>
                      <td>
                        <div className="user-name-cell">
                          {log.userName || log.userEmail || 'System'}
                        </div>
                      </td>
                      <td>
                        <span className={getActionBadgeClass(log.action)}>
                          {log.actionLabel}
                        </span>
                      </td>
                      <td>
                        <span className="entity-info">
                          {log.entityType?.replace(/_/g, ' ')}
                          {log.entityId && <span className="entity-id">#{log.entityId}</span>}
                        </span>
                      </td>
                      <td className="details-cell">
                        <span className="details-text">
                          {formatDetails(log.details, log.action)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={offset === 0}
                >
                  Previous
                </button>
                <span className="pagination-info">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setOffset(offset + limit)}
                  disabled={offset + limit >= total}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}

        {!isAdmin && (
          <div className="form-info-box" style={{ marginTop: '16px' }}>
            <span className="info-icon">ℹ️</span>
            <span>You are viewing your own actions only. Administrators can view all audit logs.</span>
          </div>
        )}
      </div>
    </div>
  );
}

function RoleBadge({ role }) {
  const roleColors = {
    admin: 'var(--color-primary)',
    planner: 'var(--color-success)',
    support: 'var(--color-muted)',
    marketing: 'var(--color-warning)'
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
        backgroundColor: `${roleColors[role] || 'var(--color-text-secondary)'}15`,
        color: roleColors[role] || 'var(--color-text-secondary)',
        border: `1px solid ${roleColors[role] || 'var(--color-text-secondary)'}30`
      }}
    >
      {roleLabels[role] || role}
    </span>
  );
}

// Role Selector component for admin role management
function RoleSelector({ userId, currentRole, currentUserId, token, onRoleChanged }) {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedRole, setSelectedRole] = useState(currentRole);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useToast();

  const roles = [
    { value: 'admin', label: 'Admin' },
    { value: 'planner', label: 'Planner' },
    { value: 'support', label: 'Support' },
    { value: 'marketing', label: 'Marketing' }
  ];

  // Can't change own role
  const isSelf = userId === currentUserId;

  const handleSave = async () => {
    if (selectedRole === currentRole) {
      setIsEditing(false);
      return;
    }

    setSaving(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/users/${userId}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ role: selectedRole })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to change role');
      }

      showToast(`Role changed to ${selectedRole}`, 'success');
      onRoleChanged();
      setIsEditing(false);
    } catch (err) {
      setError(err.message);
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setSelectedRole(currentRole);
    setIsEditing(false);
    setError('');
  };

  if (isSelf) {
    return <RoleBadge role={currentRole} />;
  }

  if (!isEditing) {
    return (
      <div className="role-editable">
        <RoleBadge role={currentRole} />
        <button
          className="btn-icon btn-edit-role"
          onClick={() => setIsEditing(true)}
          title="Change role"
          aria-label="Change role"
        >
          ✏️
        </button>
      </div>
    );
  }

  return (
    <div className="role-editor">
      <select
        value={selectedRole}
        onChange={(e) => setSelectedRole(e.target.value)}
        disabled={saving}
        className="role-select"
      >
        {roles.map(r => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
      <button
        className="btn btn-sm btn-primary"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? '...' : 'Save'}
      </button>
      <button
        className="btn btn-sm btn-secondary"
        onClick={handleCancel}
        disabled={saving}
      >
        ✕
      </button>
      {error && <span className="role-error">{error}</span>}
    </div>
  );
}

export default function SettingsPage() {
  const { user, token, refreshAgency } = useAuth();
  const { formatDate } = useTimezone();
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
        <button
          className={`settings-tab ${activeTab === 'workflow' ? 'active' : ''}`}
          onClick={() => setActiveTab('workflow')}
        >
          Workflow Timing
        </button>
        <button
          className={`settings-tab ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          Audit Logs
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
                        <td>
                          {isAdmin ? (
                            <RoleSelector
                              userId={u.id}
                              currentRole={u.role}
                              currentUserId={user?.id}
                              token={token}
                              onRoleChanged={fetchUsers}
                            />
                          ) : (
                            <RoleBadge role={u.role} />
                          )}
                        </td>
                        <td>
                          <span className={`status-indicator ${u.isActive ? 'status-active' : 'status-inactive'}`}>
                            {u.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>{formatDate(u.createdAt)}</td>
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
        <AgencySettingsForm token={token} isAdmin={isAdmin} refreshAgency={refreshAgency} />
      )}

      {activeTab === 'workflow' && (
        <WorkflowSettingsForm token={token} isAdmin={isAdmin} />
      )}

      {activeTab === 'audit' && (
        <AuditLogsTable token={token} isAdmin={isAdmin} />
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
