const express = require('express');
const { getDb } = require('../config/database');
const { authenticate, tenantScope } = require('../middleware/auth');

const router = express.Router();

// All email template routes require authentication and tenant scope
router.use(authenticate);
router.use(tenantScope);

const VALID_TRIP_TYPES = ['cruise', 'disney', 'general', 'all'];
const VALID_TRIGGER_TYPES = ['stage_change', 'date_relative', 'manual'];

/**
 * GET /api/email-templates
 * List all email templates for the agency with optional filters
 */
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { tripType, triggerType, isActive, search } = req.query;

    let query = `
      SELECT * FROM email_templates
      WHERE agency_id = ?
    `;
    const params = [req.agencyId];

    if (tripType) {
      query += ` AND trip_type = ?`;
      params.push(tripType);
    }

    if (triggerType) {
      query += ` AND trigger_type = ?`;
      params.push(triggerType);
    }

    if (isActive !== undefined) {
      query += ` AND is_active = ?`;
      params.push(isActive === 'true' ? 1 : 0);
    }

    if (search) {
      query += ` AND (name LIKE ? OR subject LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    query += ` ORDER BY name ASC`;

    const templates = db.prepare(query).all(...params);

    res.json({
      templates: templates.map(formatTemplate),
      total: templates.length
    });
  } catch (error) {
    console.error('[ERROR] List email templates failed:', error.message);
    res.status(500).json({ error: 'Failed to list email templates' });
  }
});

/**
 * GET /api/email-templates/:id
 * Get a single email template by ID
 */
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const template = db.prepare(`
      SELECT * FROM email_templates
      WHERE id = ? AND agency_id = ?
    `).get(req.params.id, req.agencyId);

    if (!template) {
      return res.status(404).json({ error: 'Email template not found' });
    }

    res.json({ template: formatTemplate(template) });
  } catch (error) {
    console.error('[ERROR] Get email template failed:', error.message);
    res.status(500).json({ error: 'Failed to get email template' });
  }
});

/**
 * GET /api/email-templates/:id/versions
 * Get all versions of a template (for versioning feature)
 */
router.get('/:id/versions', (req, res) => {
  try {
    const db = getDb();

    // First verify the template exists and belongs to this agency
    const template = db.prepare(`
      SELECT * FROM email_templates
      WHERE id = ? AND agency_id = ?
    `).get(req.params.id, req.agencyId);

    if (!template) {
      return res.status(404).json({ error: 'Email template not found' });
    }

    // For now, return just the current version. In a full implementation,
    // we would have a separate email_template_versions table
    res.json({
      versions: [{
        version: template.version,
        name: template.name,
        subject: template.subject,
        body: template.body,
        updatedAt: template.updated_at,
        isCurrent: true
      }],
      currentVersion: template.version
    });
  } catch (error) {
    console.error('[ERROR] Get template versions failed:', error.message);
    res.status(500).json({ error: 'Failed to get template versions' });
  }
});

/**
 * POST /api/email-templates
 * Create a new email template
 */
router.post('/', (req, res) => {
  try {
    const {
      name,
      subject,
      body,
      tripType = 'general',
      triggerType = 'manual',
      triggerConfig = {},
      requiresApproval = false,
      isActive = true
    } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Template name is required' });
    }

    if (!subject || !subject.trim()) {
      return res.status(400).json({ error: 'Email subject is required' });
    }

    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Email body is required' });
    }

    if (tripType && !VALID_TRIP_TYPES.includes(tripType)) {
      return res.status(400).json({ error: `Invalid trip type. Valid options: ${VALID_TRIP_TYPES.join(', ')}` });
    }

    if (triggerType && !VALID_TRIGGER_TYPES.includes(triggerType)) {
      return res.status(400).json({ error: `Invalid trigger type. Valid options: ${VALID_TRIGGER_TYPES.join(', ')}` });
    }

    const db = getDb();

    // Check for duplicate name within agency
    const existing = db.prepare(`
      SELECT id FROM email_templates WHERE name = ? AND agency_id = ?
    `).get(name.trim(), req.agencyId);

    if (existing) {
      return res.status(400).json({ error: 'A template with this name already exists' });
    }

    const result = db.prepare(`
      INSERT INTO email_templates (
        agency_id, name, subject, body,
        trip_type, trigger_type, trigger_config,
        requires_approval, is_active, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      req.agencyId,
      name.trim(),
      subject.trim(),
      body.trim(),
      tripType,
      triggerType,
      JSON.stringify(triggerConfig),
      requiresApproval ? 1 : 0,
      isActive ? 1 : 0
    );

    const templateId = result.lastInsertRowid;

    // Fetch the created template
    const template = db.prepare(`
      SELECT * FROM email_templates WHERE id = ? AND agency_id = ?
    `).get(templateId, req.agencyId);

    // Log the creation in audit logs
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      req.user.id,
      'create_email_template',
      'email_template',
      templateId,
      JSON.stringify({ name: name.trim(), tripType, triggerType })
    );

    res.status(201).json({
      message: 'Email template created successfully',
      template: formatTemplate(template)
    });
  } catch (error) {
    console.error('[ERROR] Create email template failed:', error.message);
    res.status(500).json({ error: 'Failed to create email template' });
  }
});

/**
 * PUT /api/email-templates/:id
 * Update an email template (creates new version)
 */
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const templateId = req.params.id;

    const existing = db.prepare(`
      SELECT * FROM email_templates WHERE id = ? AND agency_id = ?
    `).get(templateId, req.agencyId);

    if (!existing) {
      return res.status(404).json({ error: 'Email template not found' });
    }

    const {
      name,
      subject,
      body,
      tripType,
      triggerType,
      triggerConfig,
      requiresApproval,
      isActive
    } = req.body;

    // Validation
    if (tripType && !VALID_TRIP_TYPES.includes(tripType)) {
      return res.status(400).json({ error: `Invalid trip type. Valid options: ${VALID_TRIP_TYPES.join(', ')}` });
    }

    if (triggerType && !VALID_TRIGGER_TYPES.includes(triggerType)) {
      return res.status(400).json({ error: `Invalid trigger type. Valid options: ${VALID_TRIGGER_TYPES.join(', ')}` });
    }

    // Check for duplicate name if changing
    if (name && name.trim() !== existing.name) {
      const duplicate = db.prepare(`
        SELECT id FROM email_templates WHERE name = ? AND agency_id = ? AND id != ?
      `).get(name.trim(), req.agencyId, templateId);

      if (duplicate) {
        return res.status(400).json({ error: 'A template with this name already exists' });
      }
    }

    // Increment version on content changes
    let newVersion = existing.version;
    if ((subject && subject !== existing.subject) || (body && body !== existing.body)) {
      newVersion = existing.version + 1;
    }

    db.prepare(`
      UPDATE email_templates SET
        name = COALESCE(?, name),
        subject = COALESCE(?, subject),
        body = COALESCE(?, body),
        trip_type = COALESCE(?, trip_type),
        trigger_type = COALESCE(?, trigger_type),
        trigger_config = COALESCE(?, trigger_config),
        requires_approval = COALESCE(?, requires_approval),
        is_active = COALESCE(?, is_active),
        version = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND agency_id = ?
    `).run(
      name ? name.trim() : null,
      subject ? subject.trim() : null,
      body ? body.trim() : null,
      tripType || null,
      triggerType || null,
      triggerConfig ? JSON.stringify(triggerConfig) : null,
      requiresApproval !== undefined ? (requiresApproval ? 1 : 0) : null,
      isActive !== undefined ? (isActive ? 1 : 0) : null,
      newVersion,
      templateId,
      req.agencyId
    );

    // Fetch updated template
    const template = db.prepare(`
      SELECT * FROM email_templates WHERE id = ? AND agency_id = ?
    `).get(templateId, req.agencyId);

    // Log the update in audit logs
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      req.user.id,
      'update_email_template',
      'email_template',
      templateId,
      JSON.stringify({
        previousVersion: existing.version,
        newVersion,
        changes: {
          name: name !== existing.name ? { from: existing.name, to: name } : undefined,
          subject: subject !== existing.subject ? 'changed' : undefined,
          body: body !== existing.body ? 'changed' : undefined
        }
      })
    );

    res.json({
      message: 'Email template updated successfully',
      template: formatTemplate(template),
      versionIncremented: newVersion > existing.version
    });
  } catch (error) {
    console.error('[ERROR] Update email template failed:', error.message);
    res.status(500).json({ error: 'Failed to update email template' });
  }
});

/**
 * DELETE /api/email-templates/:id
 * Delete an email template
 */
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const templateId = req.params.id;

    const existing = db.prepare(`
      SELECT * FROM email_templates WHERE id = ? AND agency_id = ?
    `).get(templateId, req.agencyId);

    if (!existing) {
      return res.status(404).json({ error: 'Email template not found' });
    }

    // Check if template is used in email queue
    const inQueue = db.prepare(`
      SELECT COUNT(*) as count FROM email_queue WHERE template_id = ? AND agency_id = ?
    `).get(templateId, req.agencyId);

    if (inQueue.count > 0) {
      return res.status(400).json({
        error: 'Cannot delete template that is used in email queue',
        queueCount: inQueue.count
      });
    }

    db.prepare('DELETE FROM email_templates WHERE id = ? AND agency_id = ?').run(templateId, req.agencyId);

    // Log the deletion in audit logs
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      req.user.id,
      'delete_email_template',
      'email_template',
      templateId,
      JSON.stringify({ name: existing.name, version: existing.version })
    );

    res.json({ message: 'Email template deleted successfully', deletedId: templateId });
  } catch (error) {
    console.error('[ERROR] Delete email template failed:', error.message);
    res.status(500).json({ error: 'Failed to delete email template' });
  }
});

/**
 * POST /api/email-templates/:id/preview
 * Preview a template with sample data
 */
router.post('/:id/preview', (req, res) => {
  try {
    const db = getDb();
    const templateId = req.params.id;

    const template = db.prepare(`
      SELECT * FROM email_templates WHERE id = ? AND agency_id = ?
    `).get(templateId, req.agencyId);

    if (!template) {
      return res.status(404).json({ error: 'Email template not found' });
    }

    // Sample data for preview
    const sampleData = {
      clientFirstName: 'John',
      clientLastName: 'Smith',
      clientEmail: 'john.smith@example.com',
      tripName: 'Caribbean Dream Cruise',
      tripDestination: 'Western Caribbean',
      travelStartDate: '2026-03-15',
      travelEndDate: '2026-03-22',
      agencyName: 'Atlas Travel',
      plannerName: 'Sarah Johnson'
    };

    // Simple variable replacement
    let previewSubject = template.subject;
    let previewBody = template.body;

    Object.entries(sampleData).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      previewSubject = previewSubject.replace(regex, value);
      previewBody = previewBody.replace(regex, value);
    });

    res.json({
      preview: {
        subject: previewSubject,
        body: previewBody
      },
      sampleData
    });
  } catch (error) {
    console.error('[ERROR] Preview email template failed:', error.message);
    res.status(500).json({ error: 'Failed to preview email template' });
  }
});

/**
 * PUT /api/email-templates/:id/toggle-active
 * Toggle active status of a template
 */
router.put('/:id/toggle-active', (req, res) => {
  try {
    const db = getDb();
    const templateId = req.params.id;

    const existing = db.prepare(`
      SELECT * FROM email_templates WHERE id = ? AND agency_id = ?
    `).get(templateId, req.agencyId);

    if (!existing) {
      return res.status(404).json({ error: 'Email template not found' });
    }

    const newActiveStatus = existing.is_active ? 0 : 1;

    db.prepare(`
      UPDATE email_templates SET
        is_active = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND agency_id = ?
    `).run(newActiveStatus, templateId, req.agencyId);

    // Fetch updated template
    const template = db.prepare(`
      SELECT * FROM email_templates WHERE id = ? AND agency_id = ?
    `).get(templateId, req.agencyId);

    res.json({
      message: `Email template ${newActiveStatus ? 'activated' : 'deactivated'} successfully`,
      template: formatTemplate(template)
    });
  } catch (error) {
    console.error('[ERROR] Toggle email template active status failed:', error.message);
    res.status(500).json({ error: 'Failed to toggle email template active status' });
  }
});

function formatTemplate(t) {
  let triggerConfig = {};
  try {
    triggerConfig = JSON.parse(t.trigger_config || '{}');
  } catch (e) {
    // Keep empty object
  }

  return {
    id: t.id,
    name: t.name,
    subject: t.subject,
    body: t.body,
    tripType: t.trip_type,
    triggerType: t.trigger_type,
    triggerConfig,
    requiresApproval: !!t.requires_approval,
    isActive: !!t.is_active,
    version: t.version,
    createdAt: t.created_at,
    updatedAt: t.updated_at
  };
}

module.exports = router;
