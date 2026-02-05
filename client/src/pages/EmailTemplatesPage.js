import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

const API_BASE = '/api';

const TRIP_TYPE_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'cruise', label: 'Cruise' },
  { value: 'disney', label: 'Disney' },
  { value: 'all', label: 'All Types' }
];

const TRIGGER_TYPE_OPTIONS = [
  { value: 'manual', label: 'Manual Send' },
  { value: 'stage_change', label: 'Trip Stage Change' },
  { value: 'date_relative', label: 'Date-Based (Relative)' }
];

const TEMPLATE_VARIABLES = [
  { var: '{{clientFirstName}}', desc: 'Client first name' },
  { var: '{{clientLastName}}', desc: 'Client last name' },
  { var: '{{clientEmail}}', desc: 'Client email' },
  { var: '{{tripName}}', desc: 'Trip name' },
  { var: '{{tripDestination}}', desc: 'Trip destination' },
  { var: '{{travelStartDate}}', desc: 'Travel start date' },
  { var: '{{travelEndDate}}', desc: 'Travel end date' },
  { var: '{{agencyName}}', desc: 'Your agency name' },
  { var: '{{plannerName}}', desc: 'Assigned planner name' }
];

function TemplateFormModal({ isOpen, onClose, onSaved, template, token }) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    subject: '',
    body: '',
    tripType: 'general',
    triggerType: 'manual',
    triggerConfig: {},
    requiresApproval: false,
    isActive: true
  });

  useEffect(() => {
    if (template) {
      setForm({
        name: template.name || '',
        subject: template.subject || '',
        body: template.body || '',
        tripType: template.tripType || 'general',
        triggerType: template.triggerType || 'manual',
        triggerConfig: template.triggerConfig || {},
        requiresApproval: !!template.requiresApproval,
        isActive: template.isActive !== false
      });
    } else {
      setForm({
        name: '',
        subject: '',
        body: '',
        tripType: 'general',
        triggerType: 'manual',
        triggerConfig: {},
        requiresApproval: false,
        isActive: true
      });
    }
    setError('');
  }, [template, isOpen]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const insertVariable = (variable) => {
    const textarea = document.getElementById('templateBody');
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = form.body;
      const newText = text.substring(0, start) + variable + text.substring(end);
      setForm(prev => ({ ...prev, body: newText }));
      // Reset cursor position after React re-render
      setTimeout(() => {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + variable.length;
      }, 0);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.name.trim()) {
      setError('Template name is required');
      return;
    }

    if (!form.subject.trim()) {
      setError('Email subject is required');
      return;
    }

    if (!form.body.trim()) {
      setError('Email body is required');
      return;
    }

    setLoading(true);
    try {
      const isEdit = !!template;
      const url = isEdit ? `${API_BASE}/email-templates/${template.id}` : `${API_BASE}/email-templates`;
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
        throw new Error(data.error || 'Failed to save template');
      }

      addToast(isEdit ? 'Template updated successfully' : 'Template created successfully', 'success');
      if (data.versionIncremented) {
        addToast(`Template version updated to v${data.template.version}`, 'info');
      }
      onSaved(data.template);
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
      <div className="modal-content modal-xl" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{template ? 'Edit Template' : 'Create Template'}</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="auth-error">{error}</div>}

            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label" htmlFor="name">Template Name *</label>
                <input
                  id="name"
                  name="name"
                  className="form-input"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="e.g., Booking Confirmation"
                  required
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label" htmlFor="tripType">Trip Type</label>
                <select
                  id="tripType"
                  name="tripType"
                  className="form-input"
                  value={form.tripType}
                  onChange={handleChange}
                >
                  {TRIP_TYPE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label" htmlFor="triggerType">Trigger Type</label>
                <select
                  id="triggerType"
                  name="triggerType"
                  className="form-input"
                  value={form.triggerType}
                  onChange={handleChange}
                >
                  {TRIGGER_TYPE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 'var(--spacing-md)' }}>
                <label className="checkbox-label" style={{ marginBottom: 'var(--spacing-sm)' }}>
                  <input
                    type="checkbox"
                    name="requiresApproval"
                    checked={form.requiresApproval}
                    onChange={handleChange}
                  />
                  <span>Requires Admin Approval</span>
                </label>
                <label className="checkbox-label" style={{ marginBottom: 'var(--spacing-sm)' }}>
                  <input
                    type="checkbox"
                    name="isActive"
                    checked={form.isActive}
                    onChange={handleChange}
                  />
                  <span>Active</span>
                </label>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="subject">Email Subject *</label>
              <input
                id="subject"
                name="subject"
                className="form-input"
                value={form.subject}
                onChange={handleChange}
                placeholder="e.g., Your {{tripDestination}} Trip is Confirmed!"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="templateBody">Email Body *</label>
              <div className="template-variables-bar">
                <span className="template-variables-label">Insert variable:</span>
                {TEMPLATE_VARIABLES.slice(0, 5).map(v => (
                  <button
                    key={v.var}
                    type="button"
                    className="btn btn-xs btn-outline"
                    onClick={() => insertVariable(v.var)}
                    title={v.desc}
                  >
                    {v.var.replace(/[{}]/g, '')}
                  </button>
                ))}
                <span className="template-variables-more" title={TEMPLATE_VARIABLES.slice(5).map(v => `${v.var} - ${v.desc}`).join('\n')}>
                  +{TEMPLATE_VARIABLES.length - 5} more
                </span>
              </div>
              <textarea
                id="templateBody"
                name="body"
                className="form-input form-textarea"
                value={form.body}
                onChange={handleChange}
                placeholder="Dear {{clientFirstName}},&#10;&#10;We are excited to confirm your upcoming trip to {{tripDestination}}!&#10;&#10;Best regards,&#10;{{plannerName}}"
                rows={12}
                required
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : (template ? 'Save Changes' : 'Create Template')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TemplatePreviewModal({ isOpen, onClose, template, token }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && template) {
      fetchPreview();
    }
  }, [isOpen, template]);

  const fetchPreview = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/email-templates/${template.id}/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({})
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to load preview');
      }

      setPreview(data);
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
          <h2 className="modal-title">Template Preview</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div className="loading-screen" style={{ minHeight: '200px' }}>
              <div className="loading-spinner" />
              <p>Loading preview...</p>
            </div>
          ) : error ? (
            <div className="auth-error">{error}</div>
          ) : preview ? (
            <div className="template-preview">
              <div className="preview-section">
                <h4 className="preview-label">Subject</h4>
                <div className="preview-content preview-subject">{preview.preview.subject}</div>
              </div>
              <div className="preview-section">
                <h4 className="preview-label">Body</h4>
                <div className="preview-content preview-body">{preview.preview.body}</div>
              </div>
              <div className="preview-section">
                <h4 className="preview-label">Sample Data Used</h4>
                <div className="preview-sample-data">
                  {Object.entries(preview.sampleData).map(([key, value]) => (
                    <span key={key} className="sample-data-item">
                      <strong>{key}:</strong> {value}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function TemplateDetail({ template, onBack, onEdit, onPreview, onToggleActive, token }) {
  if (!template) return null;

  return (
    <div className="template-detail">
      <div className="detail-header">
        <button className="btn btn-outline btn-sm" onClick={onBack}>
          ← Back to Templates
        </button>
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
          <button className="btn btn-outline btn-sm" onClick={() => onPreview(template)}>
            Preview
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => onToggleActive(template)}>
            {template.isActive ? 'Deactivate' : 'Activate'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => onEdit(template)}>
            Edit Template
          </button>
        </div>
      </div>

      <div className="detail-card">
        <div className="detail-card-header">
          <div className="template-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <div>
            <h2 className="detail-name">{template.name}</h2>
            <div className="template-badges">
              <span className={`status-badge ${template.isActive ? 'status-success' : 'status-neutral'}`}>
                {template.isActive ? 'Active' : 'Inactive'}
              </span>
              <span className="status-badge status-info">v{template.version}</span>
              <span className="status-badge status-neutral">{TRIP_TYPE_OPTIONS.find(t => t.value === template.tripType)?.label || template.tripType}</span>
              <span className="status-badge status-neutral">{TRIGGER_TYPE_OPTIONS.find(t => t.value === template.triggerType)?.label || template.triggerType}</span>
              {template.requiresApproval && (
                <span className="status-badge status-warning">Requires Approval</span>
              )}
            </div>
          </div>
        </div>

        <div className="detail-sections">
          <div className="detail-section">
            <h3 className="detail-section-title">Subject</h3>
            <p className="template-subject-preview">{template.subject}</p>
          </div>

          <div className="detail-section">
            <h3 className="detail-section-title">Body</h3>
            <pre className="template-body-preview">{template.body}</pre>
          </div>

          <div className="detail-section">
            <h3 className="detail-section-title">Configuration</h3>
            <div className="detail-grid">
              <div className="detail-field">
                <span className="detail-field-label">Trip Type</span>
                <span className="detail-field-value">{TRIP_TYPE_OPTIONS.find(t => t.value === template.tripType)?.label || template.tripType}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Trigger Type</span>
                <span className="detail-field-value">{TRIGGER_TYPE_OPTIONS.find(t => t.value === template.triggerType)?.label || template.triggerType}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Requires Approval</span>
                <span className={`status-badge ${template.requiresApproval ? 'status-warning' : 'status-neutral'}`}>
                  {template.requiresApproval ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Version</span>
                <span className="detail-field-value">v{template.version}</span>
              </div>
            </div>
          </div>

          <div className="detail-section">
            <h3 className="detail-section-title">Timestamps</h3>
            <div className="detail-grid">
              <div className="detail-field">
                <span className="detail-field-label">Created</span>
                <span className="detail-field-value">{new Date(template.createdAt).toLocaleString()}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Last Updated</span>
                <span className="detail-field-value">{new Date(template.updatedAt).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EmailTemplatesPage() {
  const { token } = useAuth();
  const { addToast } = useToast();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTripType, setFilterTripType] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [editTemplate, setEditTemplate] = useState(null);
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterTripType) params.set('tripType', filterTripType);
      if (filterActive) params.set('isActive', filterActive);

      const res = await fetch(`${API_BASE}/email-templates?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setTemplates(data.templates);
      }
    } catch (err) {
      console.error('Failed to load templates:', err);
    } finally {
      setLoading(false);
    }
  }, [token, search, filterTripType, filterActive]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleTemplateSaved = (savedTemplate) => {
    setTemplates(prev => {
      const existing = prev.find(t => t.id === savedTemplate.id);
      if (existing) {
        return prev.map(t => t.id === savedTemplate.id ? savedTemplate : t);
      }
      return [savedTemplate, ...prev];
    });
    if (selectedTemplate && selectedTemplate.id === savedTemplate.id) {
      setSelectedTemplate(savedTemplate);
    }
  };

  const handleCreateTemplate = () => {
    setEditTemplate(null);
    setShowModal(true);
  };

  const handleEditTemplate = (template) => {
    setEditTemplate(template);
    setShowModal(true);
  };

  const handlePreviewTemplate = (template) => {
    setPreviewTemplate(template);
    setShowPreviewModal(true);
  };

  const handleViewTemplate = (template) => {
    setSelectedTemplate(template);
  };

  const handleToggleActive = async (template) => {
    try {
      const res = await fetch(`${API_BASE}/email-templates/${template.id}/toggle-active`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to toggle template status');
      }

      addToast(data.message, 'success');
      handleTemplateSaved(data.template);
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDeleteTemplate = async (template) => {
    if (!window.confirm(`Are you sure you want to delete the template "${template.name}"?`)) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/email-templates/${template.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete template');
      }

      addToast('Template deleted successfully', 'success');
      setTemplates(prev => prev.filter(t => t.id !== template.id));
      if (selectedTemplate && selectedTemplate.id === template.id) {
        setSelectedTemplate(null);
      }
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  // Detail view
  if (selectedTemplate) {
    return (
      <div className="page-container">
        <TemplateDetail
          template={selectedTemplate}
          onBack={() => setSelectedTemplate(null)}
          onEdit={handleEditTemplate}
          onPreview={handlePreviewTemplate}
          onToggleActive={handleToggleActive}
          token={token}
        />
        <TemplateFormModal
          isOpen={showModal}
          onClose={() => { setShowModal(false); setEditTemplate(null); }}
          onSaved={handleTemplateSaved}
          template={editTemplate}
          token={token}
        />
        <TemplatePreviewModal
          isOpen={showPreviewModal}
          onClose={() => { setShowPreviewModal(false); setPreviewTemplate(null); }}
          template={previewTemplate}
          token={token}
        />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Email Templates</h1>
          <p className="page-subtitle">Create and manage automated email templates for client communications.</p>
        </div>
        <button className="btn btn-primary" onClick={handleCreateTemplate}>
          + New Template
        </button>
      </div>

      <div className="filter-bar" style={{ display: 'flex', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)', flexWrap: 'wrap' }}>
        <input
          type="text"
          className="form-input"
          placeholder="Search templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: '200px' }}
        />
        <select
          className="form-input"
          value={filterTripType}
          onChange={(e) => setFilterTripType(e.target.value)}
          style={{ width: '150px' }}
        >
          <option value="">All Trip Types</option>
          {TRIP_TYPE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          className="form-input"
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value)}
          style={{ width: '130px' }}
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {loading ? (
        <div className="loading-screen" style={{ minHeight: '200px' }}>
          <div className="loading-spinner" />
          <p>Loading templates...</p>
        </div>
      ) : templates.length === 0 ? (
        <div className="page-empty-state">
          <div className="empty-state-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <h3 className="empty-state-title">No email templates yet</h3>
          <p className="empty-state-description">Create email templates to automate client communications for bookings, reminders, and more.</p>
          <button className="btn btn-primary" style={{ marginTop: 'var(--spacing-md)' }} onClick={handleCreateTemplate}>
            + Create Your First Template
          </button>
        </div>
      ) : (
        <div className="templates-grid">
          {templates.map(template => (
            <div
              key={template.id}
              className="template-card"
              onClick={() => handleViewTemplate(template)}
            >
              <div className="template-card-header">
                <div className="template-card-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </div>
                <div className="template-card-badges">
                  <span className={`status-badge status-sm ${template.isActive ? 'status-success' : 'status-neutral'}`}>
                    {template.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <span className="status-badge status-sm status-info">v{template.version}</span>
                </div>
              </div>
              <h3 className="template-card-name">{template.name}</h3>
              <p className="template-card-subject">{template.subject}</p>
              <div className="template-card-meta">
                <span>{TRIP_TYPE_OPTIONS.find(t => t.value === template.tripType)?.label || template.tripType}</span>
                <span>•</span>
                <span>{TRIGGER_TYPE_OPTIONS.find(t => t.value === template.triggerType)?.label || template.triggerType}</span>
              </div>
              <div className="template-card-actions" onClick={e => e.stopPropagation()}>
                <button
                  className="btn btn-xs btn-outline"
                  onClick={() => handlePreviewTemplate(template)}
                >
                  Preview
                </button>
                <button
                  className="btn btn-xs btn-outline"
                  onClick={() => handleEditTemplate(template)}
                >
                  Edit
                </button>
                <button
                  className="btn btn-xs btn-outline btn-danger"
                  onClick={() => handleDeleteTemplate(template)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <TemplateFormModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditTemplate(null); }}
        onSaved={handleTemplateSaved}
        template={editTemplate}
        token={token}
      />

      <TemplatePreviewModal
        isOpen={showPreviewModal}
        onClose={() => { setShowPreviewModal(false); setPreviewTemplate(null); }}
        template={previewTemplate}
        token={token}
      />
    </div>
  );
}
