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
 * Preview a template with sample data and agency branding
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

    // Fetch agency branding settings
    const agency = db.prepare(`
      SELECT name, logo_url, primary_color, email_signature
      FROM agencies WHERE id = ?
    `).get(req.agencyId);

    // Sample data for preview - now includes agency branding
    const sampleData = {
      clientFirstName: 'John',
      clientLastName: 'Smith',
      clientEmail: 'john.smith@example.com',
      tripName: 'Caribbean Dream Cruise',
      tripDestination: 'Western Caribbean',
      travelStartDate: '2026-03-15',
      travelEndDate: '2026-03-22',
      agencyName: agency?.name || 'Atlas Travel',
      plannerName: 'Sarah Johnson',
      // Agency branding placeholders
      agencyLogo: agency?.logo_url || '',
      agencyColor: agency?.primary_color || '#1a56db',
      agencySignature: agency?.email_signature || ''
    };

    // Simple variable replacement
    let previewSubject = template.subject;
    let previewBody = template.body;

    Object.entries(sampleData).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      previewSubject = previewSubject.replace(regex, value);
      previewBody = previewBody.replace(regex, value);
    });

    // Build agency branding object for frontend
    const branding = {
      name: agency?.name || 'Atlas Travel',
      logoUrl: agency?.logo_url || null,
      primaryColor: agency?.primary_color || '#1a56db',
      emailSignature: agency?.email_signature || null
    };

    res.json({
      preview: {
        subject: previewSubject,
        body: previewBody
      },
      sampleData,
      branding
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

/**
 * GET /api/email-templates/queue
 * Get the email queue for the agency
 */
router.get('/queue/list', (req, res) => {
  try {
    const db = getDb();
    const { status, tripId } = req.query;

    let query = `
      SELECT eq.*,
        et.name as template_name, et.subject as template_subject, et.body as template_body,
        t.name as trip_name, t.destination as trip_destination,
        t.travel_start_date, t.travel_end_date,
        c.first_name as client_first_name, c.last_name as client_last_name, c.email as client_email,
        u.first_name as approved_by_first_name, u.last_name as approved_by_last_name
      FROM email_queue eq
      LEFT JOIN email_templates et ON eq.template_id = et.id
      LEFT JOIN trips t ON eq.trip_id = t.id
      LEFT JOIN clients c ON eq.client_id = c.id
      LEFT JOIN users u ON eq.approved_by = u.id
      WHERE eq.agency_id = ?
    `;
    const params = [req.agencyId];

    if (status) {
      query += ` AND eq.status = ?`;
      params.push(status);
    }

    if (tripId) {
      query += ` AND eq.trip_id = ?`;
      params.push(tripId);
    }

    query += ` ORDER BY eq.created_at DESC`;

    const queueItems = db.prepare(query).all(...params);

    res.json({
      queue: queueItems.map(formatQueueItem),
      total: queueItems.length
    });
  } catch (error) {
    console.error('[ERROR] List email queue failed:', error.message);
    res.status(500).json({ error: 'Failed to list email queue' });
  }
});

/**
 * GET /api/email-templates/queue/:id
 * Get a single email queue item with populated content
 */
router.get('/queue/:queueId', (req, res) => {
  try {
    const db = getDb();
    const queueItem = db.prepare(`
      SELECT eq.*,
        et.name as template_name, et.subject as template_subject, et.body as template_body,
        t.name as trip_name, t.destination as trip_destination,
        t.travel_start_date, t.travel_end_date,
        c.first_name as client_first_name, c.last_name as client_last_name, c.email as client_email,
        u.first_name as approved_by_first_name, u.last_name as approved_by_last_name,
        a.name as agency_name,
        planner.first_name as planner_first_name, planner.last_name as planner_last_name
      FROM email_queue eq
      LEFT JOIN email_templates et ON eq.template_id = et.id
      LEFT JOIN trips t ON eq.trip_id = t.id
      LEFT JOIN clients c ON eq.client_id = c.id
      LEFT JOIN users u ON eq.approved_by = u.id
      LEFT JOIN agencies a ON eq.agency_id = a.id
      LEFT JOIN users planner ON t.assigned_user_id = planner.id
      WHERE eq.id = ? AND eq.agency_id = ?
    `).get(req.params.queueId, req.agencyId);

    if (!queueItem) {
      return res.status(404).json({ error: 'Email queue item not found' });
    }

    // Populate email content with actual data
    const populatedContent = populateEmailContent(queueItem);

    res.json({
      queueItem: {
        ...formatQueueItem(queueItem),
        populatedSubject: populatedContent.subject,
        populatedBody: populatedContent.body
      }
    });
  } catch (error) {
    console.error('[ERROR] Get email queue item failed:', error.message);
    res.status(500).json({ error: 'Failed to get email queue item' });
  }
});

function populateEmailContent(item) {
  const data = {
    clientFirstName: item.client_first_name || 'Valued Client',
    clientLastName: item.client_last_name || '',
    clientEmail: item.client_email || '',
    tripName: item.trip_name || 'Your Trip',
    tripDestination: item.trip_destination || 'your destination',
    travelStartDate: item.travel_start_date || 'TBD',
    travelEndDate: item.travel_end_date || 'TBD',
    agencyName: item.agency_name || 'Our Agency',
    plannerName: item.planner_first_name ? `${item.planner_first_name} ${item.planner_last_name || ''}`.trim() : 'Your Travel Planner'
  };

  let subject = item.template_subject || '';
  let body = item.template_body || '';

  Object.entries(data).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    subject = subject.replace(regex, value);
    body = body.replace(regex, value);
  });

  return { subject, body };
}

function formatQueueItem(item) {
  return {
    id: item.id,
    templateId: item.template_id,
    templateName: item.template_name,
    templateSubject: item.template_subject,
    tripId: item.trip_id,
    tripName: item.trip_name,
    tripDestination: item.trip_destination,
    clientId: item.client_id,
    clientName: item.client_first_name ? `${item.client_first_name} ${item.client_last_name}` : null,
    clientEmail: item.client_email,
    status: item.status,
    requiresApproval: !!item.requires_approval,
    approvedBy: item.approved_by,
    approvedByName: item.approved_by_first_name ? `${item.approved_by_first_name} ${item.approved_by_last_name}` : null,
    approvedAt: item.approved_at,
    sentAt: item.sent_at,
    scheduledSendDate: item.scheduled_send_date,
    createdAt: item.created_at
  };
}

/**
 * POST /api/email-templates/process-date-triggers
 * Process date-relative email triggers (call this periodically or manually)
 * Checks for trips with dates matching template trigger configurations
 */
router.post('/process-date-triggers', (req, res) => {
  try {
    const db = getDb();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // Get all active date_relative templates for this agency
    const templates = db.prepare(`
      SELECT * FROM email_templates
      WHERE agency_id = ?
        AND trigger_type = 'date_relative'
        AND is_active = 1
    `).all(req.agencyId);

    const queuedEmails = [];

    for (const template of templates) {
      let triggerConfig = {};
      try {
        triggerConfig = JSON.parse(template.trigger_config || '{}');
      } catch (e) {
        continue;
      }

      // Determine which date field to use and the offset
      const daysBeforeTravel = triggerConfig.daysBeforeTravel || triggerConfig.daysBefore;
      const daysAfterBooking = triggerConfig.daysAfterBooking || triggerConfig.daysAfter;

      if (daysBeforeTravel !== undefined) {
        // Find trips with travel_start_date = today + daysBeforeTravel
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + daysBeforeTravel);
        const targetDateStr = targetDate.toISOString().split('T')[0];

        const matchingTrips = db.prepare(`
          SELECT t.*, c.id as client_id
          FROM trips t
          LEFT JOIN clients c ON t.client_id = c.id
          WHERE t.agency_id = ?
            AND t.travel_start_date = ?
            AND t.stage NOT IN ('canceled', 'archived', 'completed')
            AND (? = 'all' OR ? = 'general')
        `).all(req.agencyId, targetDateStr, template.trip_type, template.trip_type);

        for (const trip of matchingTrips) {
          // Check if email already queued for this template/trip
          const existing = db.prepare(`
            SELECT id FROM email_queue
            WHERE template_id = ? AND trip_id = ? AND agency_id = ?
          `).get(template.id, trip.id, req.agencyId);

          if (!existing) {
            db.prepare(`
              INSERT INTO email_queue (
                agency_id, template_id, trip_id, client_id,
                status, requires_approval, scheduled_send_date
              ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            `).run(
              req.agencyId,
              template.id,
              trip.id,
              trip.client_id || null,
              template.requires_approval ? 'pending' : 'pending',
              template.requires_approval ? 1 : 0
            );

            queuedEmails.push({
              templateName: template.name,
              tripId: trip.id,
              tripName: trip.name,
              triggerReason: `${daysBeforeTravel} days before travel (${targetDateStr})`
            });

            console.log(`[EMAIL] Queued date-relative template "${template.name}" for trip ${trip.id} (${daysBeforeTravel} days before travel)`);
          }
        }
      }

      if (daysAfterBooking !== undefined) {
        // Find trips that were booked X days ago
        const bookingDate = new Date(today);
        bookingDate.setDate(bookingDate.getDate() - daysAfterBooking);
        const bookingDateStr = bookingDate.toISOString().split('T')[0];

        // Note: This requires a booking_date field. For now, we use created_at approximation
        const matchingTrips = db.prepare(`
          SELECT t.*, c.id as client_id
          FROM trips t
          LEFT JOIN clients c ON t.client_id = c.id
          WHERE t.agency_id = ?
            AND date(t.created_at) = ?
            AND t.stage NOT IN ('inquiry', 'canceled', 'archived')
            AND (? = 'all' OR ? = 'general')
        `).all(req.agencyId, bookingDateStr, template.trip_type, template.trip_type);

        for (const trip of matchingTrips) {
          const existing = db.prepare(`
            SELECT id FROM email_queue
            WHERE template_id = ? AND trip_id = ? AND agency_id = ?
          `).get(template.id, trip.id, req.agencyId);

          if (!existing) {
            db.prepare(`
              INSERT INTO email_queue (
                agency_id, template_id, trip_id, client_id,
                status, requires_approval, scheduled_send_date
              ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            `).run(
              req.agencyId,
              template.id,
              trip.id,
              trip.client_id || null,
              template.requires_approval ? 'pending' : 'pending',
              template.requires_approval ? 1 : 0
            );

            queuedEmails.push({
              templateName: template.name,
              tripId: trip.id,
              tripName: trip.name,
              triggerReason: `${daysAfterBooking} days after booking`
            });

            console.log(`[EMAIL] Queued date-relative template "${template.name}" for trip ${trip.id} (${daysAfterBooking} days after booking)`);
          }
        }
      }
    }

    res.json({
      message: `Processed date-relative triggers`,
      templatesChecked: templates.length,
      emailsQueued: queuedEmails.length,
      queuedEmails
    });
  } catch (error) {
    console.error('[ERROR] Process date triggers failed:', error.message);
    res.status(500).json({ error: 'Failed to process date triggers' });
  }
});

/**
 * POST /api/email-templates/queue
 * Add an email to the queue (manual queue - for testing or manual sends)
 */
router.post('/queue', (req, res) => {
  try {
    const { templateId, tripId, clientId, scheduledSendDate } = req.body;

    if (!templateId) {
      return res.status(400).json({ error: 'Template ID is required' });
    }

    const db = getDb();

    // Verify template exists and belongs to agency
    const template = db.prepare(`
      SELECT * FROM email_templates WHERE id = ? AND agency_id = ?
    `).get(templateId, req.agencyId);

    if (!template) {
      return res.status(404).json({ error: 'Email template not found' });
    }

    // If tripId provided, verify it exists
    if (tripId) {
      const trip = db.prepare(`
        SELECT id, client_id FROM trips WHERE id = ? AND agency_id = ?
      `).get(tripId, req.agencyId);

      if (!trip) {
        return res.status(404).json({ error: 'Trip not found' });
      }
    }

    // If clientId provided, verify it exists
    if (clientId) {
      const client = db.prepare(`
        SELECT id FROM clients WHERE id = ? AND agency_id = ?
      `).get(clientId, req.agencyId);

      if (!client) {
        return res.status(404).json({ error: 'Client not found' });
      }
    }

    const result = db.prepare(`
      INSERT INTO email_queue (
        agency_id, template_id, trip_id, client_id,
        status, requires_approval, scheduled_send_date
      ) VALUES (?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      req.agencyId,
      templateId,
      tripId || null,
      clientId || null,
      template.requires_approval ? 1 : 0,
      scheduledSendDate || null
    );

    const queueId = result.lastInsertRowid;

    // Fetch the created queue item
    const queueItem = db.prepare(`
      SELECT eq.*,
        et.name as template_name, et.subject as template_subject,
        t.name as trip_name,
        c.first_name as client_first_name, c.last_name as client_last_name, c.email as client_email
      FROM email_queue eq
      LEFT JOIN email_templates et ON eq.template_id = et.id
      LEFT JOIN trips t ON eq.trip_id = t.id
      LEFT JOIN clients c ON eq.client_id = c.id
      WHERE eq.id = ?
    `).get(queueId);

    // Log in audit logs
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      req.user.id,
      'queue_email',
      'email_queue',
      queueId,
      JSON.stringify({ templateName: template.name, tripId, clientId })
    );

    console.log(`[EMAIL] Manually queued email from template "${template.name}" (queue ID: ${queueId})`);

    res.status(201).json({
      message: 'Email queued successfully',
      queueItem: formatQueueItem(queueItem)
    });
  } catch (error) {
    console.error('[ERROR] Queue email failed:', error.message);
    res.status(500).json({ error: 'Failed to queue email' });
  }
});

/**
 * PUT /api/email-templates/queue/:queueId/approve
 * Approve a pending email in the queue (sends it)
 */
router.put('/queue/:queueId/approve', (req, res) => {
  try {
    const db = getDb();
    const queueId = req.params.queueId;

    const queueItem = db.prepare(`
      SELECT eq.*, et.name as template_name, et.subject as template_subject, et.body as template_body,
        c.email as client_email, c.first_name as client_first_name, c.last_name as client_last_name,
        t.name as trip_name, t.destination as trip_destination, t.travel_start_date, t.travel_end_date,
        a.name as agency_name,
        planner.first_name as planner_first_name, planner.last_name as planner_last_name
      FROM email_queue eq
      LEFT JOIN email_templates et ON eq.template_id = et.id
      LEFT JOIN clients c ON eq.client_id = c.id
      LEFT JOIN trips t ON eq.trip_id = t.id
      LEFT JOIN agencies a ON eq.agency_id = a.id
      LEFT JOIN users planner ON t.assigned_user_id = planner.id
      WHERE eq.id = ? AND eq.agency_id = ?
    `).get(queueId, req.agencyId);

    if (!queueItem) {
      return res.status(404).json({ error: 'Email queue item not found' });
    }

    if (queueItem.status !== 'pending') {
      return res.status(400).json({ error: `Cannot approve email with status: ${queueItem.status}` });
    }

    // Check if user has permission to approve (admin or planner)
    const canApprove = ['admin', 'planner', 'planner_advisor'].includes(req.user.role);
    if (!canApprove) {
      return res.status(403).json({ error: 'You do not have permission to approve emails' });
    }

    // Populate the email content
    const populatedContent = populateEmailContent(queueItem);

    // Update status to approved and mark as sent (simulated send - logs to console)
    db.prepare(`
      UPDATE email_queue SET
        status = 'sent',
        approved_by = ?,
        approved_at = datetime('now'),
        sent_at = datetime('now')
      WHERE id = ? AND agency_id = ?
    `).run(req.user.id, queueId, req.agencyId);

    // Log the simulated email to console (development mode)
    console.log('\n========================================');
    console.log('[EMAIL SENT - Development Mode]');
    console.log('----------------------------------------');
    console.log(`To: ${queueItem.client_email || 'No recipient'}`);
    console.log(`Subject: ${populatedContent.subject}`);
    console.log('----------------------------------------');
    console.log(populatedContent.body);
    console.log('========================================\n');

    // Log in audit logs
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      req.user.id,
      'approve_email',
      'email_queue',
      queueId,
      JSON.stringify({
        templateName: queueItem.template_name,
        recipientEmail: queueItem.client_email,
        subject: populatedContent.subject
      })
    );

    // Fetch updated queue item
    const updatedItem = db.prepare(`
      SELECT eq.*,
        et.name as template_name, et.subject as template_subject,
        t.name as trip_name,
        c.first_name as client_first_name, c.last_name as client_last_name, c.email as client_email,
        u.first_name as approved_by_first_name, u.last_name as approved_by_last_name
      FROM email_queue eq
      LEFT JOIN email_templates et ON eq.template_id = et.id
      LEFT JOIN trips t ON eq.trip_id = t.id
      LEFT JOIN clients c ON eq.client_id = c.id
      LEFT JOIN users u ON eq.approved_by = u.id
      WHERE eq.id = ?
    `).get(queueId);

    res.json({
      message: 'Email approved and sent successfully',
      queueItem: formatQueueItem(updatedItem)
    });
  } catch (error) {
    console.error('[ERROR] Approve email failed:', error.message);
    res.status(500).json({ error: 'Failed to approve email' });
  }
});

/**
 * PUT /api/email-templates/queue/:queueId/reject
 * Reject/cancel a pending email in the queue
 */
router.put('/queue/:queueId/reject', (req, res) => {
  try {
    const db = getDb();
    const queueId = req.params.queueId;
    const { reason } = req.body;

    const queueItem = db.prepare(`
      SELECT eq.*, et.name as template_name
      FROM email_queue eq
      LEFT JOIN email_templates et ON eq.template_id = et.id
      WHERE eq.id = ? AND eq.agency_id = ?
    `).get(queueId, req.agencyId);

    if (!queueItem) {
      return res.status(404).json({ error: 'Email queue item not found' });
    }

    if (queueItem.status !== 'pending') {
      return res.status(400).json({ error: `Cannot reject email with status: ${queueItem.status}` });
    }

    // Check if user has permission to reject (admin or planner)
    const canReject = ['admin', 'planner', 'planner_advisor'].includes(req.user.role);
    if (!canReject) {
      return res.status(403).json({ error: 'You do not have permission to reject emails' });
    }

    // Delete the queue item (rejected emails are removed)
    db.prepare('DELETE FROM email_queue WHERE id = ? AND agency_id = ?').run(queueId, req.agencyId);

    // Log in audit logs
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      req.user.id,
      'reject_email',
      'email_queue',
      queueId,
      JSON.stringify({
        templateName: queueItem.template_name,
        reason: reason || 'No reason provided'
      })
    );

    console.log(`[EMAIL] Rejected and removed email from queue (ID: ${queueId}, template: "${queueItem.template_name}")`);

    res.json({
      message: 'Email rejected and removed from queue',
      deletedId: parseInt(queueId)
    });
  } catch (error) {
    console.error('[ERROR] Reject email failed:', error.message);
    res.status(500).json({ error: 'Failed to reject email' });
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
