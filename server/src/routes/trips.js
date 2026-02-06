const express = require('express');
const { getDb } = require('../config/database');
const { authenticate, tenantScope } = require('../middleware/auth');
const { createNotificationsForUsers, generateEventKey } = require('../services/notificationService');

const router = express.Router();

// All trip routes require authentication and tenant scope
router.use(authenticate);
router.use(tenantScope);

const VALID_STAGES = ['inquiry', 'quoted', 'booked', 'final_payment_pending', 'traveling', 'completed', 'canceled', 'archived'];

/**
 * GET /api/trips
 * List all trips for the agency with optional filters
 */
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { search, stage, clientId, assignedTo, dateFrom, dateTo, sortBy = 'created_at', sortOrder = 'desc' } = req.query;

    let query = `
      SELECT t.*,
        c.first_name as client_first_name, c.last_name as client_last_name,
        u.first_name as assigned_first_name, u.last_name as assigned_last_name
      FROM trips t
      LEFT JOIN clients c ON t.client_id = c.id
      LEFT JOIN users u ON t.assigned_user_id = u.id
      WHERE t.agency_id = ?
    `;
    const params = [req.agencyId];

    if (search) {
      query += ` AND (t.name LIKE ? OR t.destination LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (stage) {
      query += ` AND t.stage = ?`;
      params.push(stage);
    }

    if (clientId) {
      query += ` AND t.client_id = ?`;
      params.push(clientId);
    }

    if (assignedTo) {
      query += ` AND t.assigned_user_id = ?`;
      params.push(assignedTo);
    }

    // Date range filter - filters on travel_start_date
    if (dateFrom) {
      query += ` AND t.travel_start_date >= ?`;
      params.push(dateFrom);
    }

    if (dateTo) {
      query += ` AND t.travel_start_date <= ?`;
      params.push(dateTo);
    }

    const allowedSortCols = ['name', 'destination', 'stage', 'travel_start_date', 'travel_end_date', 'created_at', 'updated_at'];
    const safeSortBy = allowedSortCols.includes(sortBy) ? sortBy : 'created_at';
    const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';
    query += ` ORDER BY t.${safeSortBy} ${safeSortOrder}`;

    const trips = db.prepare(query).all(...params);

    res.json({
      trips: trips.map(t => formatTrip(t)),
      total: trips.length
    });
  } catch (error) {
    console.error('[ERROR] List trips failed:', error.message);
    res.status(500).json({ error: 'Failed to list trips' });
  }
});

/**
 * GET /api/trips/:id
 * Get a single trip by ID
 */
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const trip = db.prepare(`
      SELECT t.*,
        c.first_name as client_first_name, c.last_name as client_last_name, c.email as client_email,
        u.first_name as assigned_first_name, u.last_name as assigned_last_name
      FROM trips t
      LEFT JOIN clients c ON t.client_id = c.id
      LEFT JOIN users u ON t.assigned_user_id = u.id
      WHERE t.id = ? AND t.agency_id = ?
    `).get(req.params.id, req.agencyId);

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    res.json({ trip: formatTrip(trip) });
  } catch (error) {
    console.error('[ERROR] Get trip failed:', error.message);
    res.status(500).json({ error: 'Failed to get trip' });
  }
});

/**
 * POST /api/trips
 * Create a new trip
 */
router.post('/', (req, res) => {
  try {
    const {
      clientId, name, destination, description,
      travelStartDate, travelEndDate,
      finalPaymentDeadline, insuranceCutoffDate, checkinDate,
      assignedUserId
    } = req.body;

    // Validation
    if (!name) {
      return res.status(400).json({ error: 'Trip name is required' });
    }

    const db = getDb();

    // Verify client exists if provided
    if (clientId) {
      const client = db.prepare('SELECT id FROM clients WHERE id = ? AND agency_id = ?').get(clientId, req.agencyId);
      if (!client) {
        return res.status(404).json({ error: 'Client not found' });
      }
    }

    const result = db.prepare(`
      INSERT INTO trips (
        agency_id, client_id, assigned_user_id, name, destination, description,
        stage, is_locked,
        travel_start_date, travel_end_date,
        final_payment_deadline, insurance_cutoff_date, checkin_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      clientId || null,
      assignedUserId || req.user.id,
      name,
      destination || null,
      description || null,
      'inquiry',
      0,
      travelStartDate || null,
      travelEndDate || null,
      finalPaymentDeadline || null,
      insuranceCutoffDate || null,
      checkinDate || null
    );

    const tripId = result.lastInsertRowid;

    // Fetch the created trip with joins
    const trip = db.prepare(`
      SELECT t.*,
        c.first_name as client_first_name, c.last_name as client_last_name,
        u.first_name as assigned_first_name, u.last_name as assigned_last_name
      FROM trips t
      LEFT JOIN clients c ON t.client_id = c.id
      LEFT JOIN users u ON t.assigned_user_id = u.id
      WHERE t.id = ? AND t.agency_id = ?
    `).get(tripId, req.agencyId);

    // NEW INQUIRY: Create urgent notification for all agency users (admins and planners)
    // Uses deduplication to prevent duplicate notifications for the same inquiry
    const clientName = trip.client_first_name ? `${trip.client_first_name} ${trip.client_last_name}` : 'Unknown Client';
    const agencyUsers = db.prepare(`
      SELECT id FROM users WHERE agency_id = ? AND is_active = 1 AND role IN ('admin', 'planner')
    `).all(req.agencyId);

    const eventKeyPrefix = generateEventKey('new_inquiry', 'trip', tripId);
    const notifResult = createNotificationsForUsers({
      agencyId: req.agencyId,
      userIds: agencyUsers.map(u => u.id),
      type: 'urgent',
      title: 'New Inquiry',
      message: `New inquiry "${trip.name}" for ${clientName}${destination ? ` to ${destination}` : ''}`,
      entityType: 'trip',
      entityId: tripId,
      eventKeyPrefix
    });
    console.log(`[NOTIFICATION] New inquiry trip ${tripId}: ${notifResult.created} created, ${notifResult.duplicates} duplicates prevented`);

    res.status(201).json({
      message: 'Trip created successfully',
      trip: formatTrip(trip)
    });
  } catch (error) {
    console.error('[ERROR] Create trip failed:', error.message);
    res.status(500).json({ error: 'Failed to create trip' });
  }
});

/**
 * PUT /api/trips/:id
 * Update a trip
 */
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const tripId = req.params.id;

    const existing = db.prepare('SELECT * FROM trips WHERE id = ? AND agency_id = ?').get(tripId, req.agencyId);
    if (!existing) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const {
      clientId, name, destination, description,
      travelStartDate, travelEndDate,
      finalPaymentDeadline, insuranceCutoffDate, checkinDate,
      assignedUserId
    } = req.body;

    db.prepare(`
      UPDATE trips SET
        client_id = COALESCE(?, client_id),
        assigned_user_id = COALESCE(?, assigned_user_id),
        name = COALESCE(?, name),
        destination = ?,
        description = ?,
        travel_start_date = ?,
        travel_end_date = ?,
        final_payment_deadline = ?,
        insurance_cutoff_date = ?,
        checkin_date = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND agency_id = ?
    `).run(
      clientId || null,
      assignedUserId || null,
      name || null,
      destination !== undefined ? destination : existing.destination,
      description !== undefined ? description : existing.description,
      travelStartDate !== undefined ? travelStartDate : existing.travel_start_date,
      travelEndDate !== undefined ? travelEndDate : existing.travel_end_date,
      finalPaymentDeadline !== undefined ? finalPaymentDeadline : existing.final_payment_deadline,
      insuranceCutoffDate !== undefined ? insuranceCutoffDate : existing.insurance_cutoff_date,
      checkinDate !== undefined ? checkinDate : existing.checkin_date,
      tripId,
      req.agencyId
    );

    const trip = db.prepare(`
      SELECT t.*,
        c.first_name as client_first_name, c.last_name as client_last_name,
        u.first_name as assigned_first_name, u.last_name as assigned_last_name
      FROM trips t
      LEFT JOIN clients c ON t.client_id = c.id
      LEFT JOIN users u ON t.assigned_user_id = u.id
      WHERE t.id = ? AND t.agency_id = ?
    `).get(tripId, req.agencyId);

    res.json({
      message: 'Trip updated successfully',
      trip: formatTrip(trip)
    });
  } catch (error) {
    console.error('[ERROR] Update trip failed:', error.message);
    res.status(500).json({ error: 'Failed to update trip' });
  }
});

/**
 * PUT /api/trips/:id/stage
 * Update trip stage (lifecycle transition)
 */
router.put('/:id/stage', (req, res) => {
  try {
    const db = getDb();
    const tripId = req.params.id;
    const { stage } = req.body;

    if (!stage || !VALID_STAGES.includes(stage)) {
      return res.status(400).json({ error: 'Invalid stage. Valid stages: ' + VALID_STAGES.join(', ') });
    }

    const existing = db.prepare('SELECT * FROM trips WHERE id = ? AND agency_id = ?').get(tripId, req.agencyId);
    if (!existing) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const oldStage = existing.stage;

    db.prepare(`
      UPDATE trips SET stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND agency_id = ?
    `).run(stage, tripId, req.agencyId);

    // Log the stage transition in audit_logs
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      req.user.id,
      'stage_change',
      'trip',
      tripId,
      JSON.stringify({ from: oldStage, to: stage }),
      tripId
    );

    // Record the change in trip_change_records
    db.prepare(`
      INSERT INTO trip_change_records (trip_id, changed_by, field_changed, old_value, new_value)
      VALUES (?, ?, ?, ?, ?)
    `).run(tripId, req.user.id, 'stage', oldStage, stage);

    // Generate system tasks based on stage transitions
    const tasksByStage = {
      quoted: { title: 'Follow up on quote', description: 'Follow up with client on the trip quote', category: 'follow_up', daysOut: 3 },
      booked: { title: 'Confirm booking details', description: 'Verify all booking confirmations received', category: 'internal', daysOut: 1 },
      final_payment_pending: { title: 'Collect final payment', description: 'Final payment is due - follow up with client', category: 'payment', daysOut: 7 },
      traveling: { title: 'Send bon voyage message', description: 'Send trip documents and bon voyage message to client', category: 'client_request', daysOut: 0 },
      completed: { title: 'Request trip feedback', description: 'Send feedback request to client and follow up on commission', category: 'follow_up', daysOut: 3 }
    };

    if (tasksByStage[stage]) {
      const taskDef = tasksByStage[stage];
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + taskDef.daysOut);
      db.prepare(`
        INSERT INTO tasks (agency_id, trip_id, assigned_user_id, title, description, due_date, status, priority, category, is_system_generated, source_event)
        VALUES (?, ?, ?, ?, ?, ?, 'open', 'normal', ?, 1, ?)
      `).run(
        req.agencyId,
        tripId,
        existing.assigned_user_id || req.user.id,
        taskDef.title,
        taskDef.description,
        dueDate.toISOString().split('T')[0],
        taskDef.category,
        `stage_change:${oldStage}:${stage}`
      );
    }

    // Queue emails based on stage-change templates
    // Map stage to trigger config values (transition targets)
    const stageToTrigger = {
      'booked': 'booking_confirmed',
      'quoted': 'quote_sent',
      'final_payment_pending': 'final_payment_due',
      'traveling': 'trip_started',
      'completed': 'trip_completed'
    };

    const triggerEvent = stageToTrigger[stage];
    if (triggerEvent) {
      // Get trip with client info for email queue
      const tripForEmail = db.prepare(`
        SELECT t.*, c.id as c_id, c.first_name as cf, c.last_name as cl, c.email as ce
        FROM trips t
        LEFT JOIN clients c ON t.client_id = c.id
        WHERE t.id = ? AND t.agency_id = ?
      `).get(tripId, req.agencyId);

      // Find matching email templates with stage_change trigger and matching trip type
      const matchingTemplates = db.prepare(`
        SELECT * FROM email_templates
        WHERE agency_id = ?
          AND trigger_type = 'stage_change'
          AND is_active = 1
          AND (trip_type = 'all' OR trip_type = 'general')
      `).all(req.agencyId);

      // Queue each matching template
      for (const template of matchingTemplates) {
        // Parse trigger_config to check for specific stage match
        let triggerConfig = {};
        try {
          triggerConfig = JSON.parse(template.trigger_config || '{}');
        } catch (e) {
          // Keep empty config
        }

        // If trigger_config specifies a stage, check if it matches
        // If no specific stage configured, queue for all stage_change triggers
        const configuredStage = triggerConfig.onStage || triggerConfig.stage;
        if (configuredStage && configuredStage !== stage && configuredStage !== triggerEvent) {
          continue; // Skip if doesn't match
        }

        db.prepare(`
          INSERT INTO email_queue (
            agency_id, template_id, trip_id, client_id,
            status, requires_approval, scheduled_send_date
          ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          req.agencyId,
          template.id,
          tripId,
          tripForEmail?.c_id || null,
          template.requires_approval ? 'pending' : 'pending',
          template.requires_approval ? 1 : 0
        );

        console.log(`[EMAIL] Queued template "${template.name}" for trip ${tripId} on stage change to ${stage}`);
      }
    }

    // Fetch updated trip
    const trip = db.prepare(`
      SELECT t.*,
        c.first_name as client_first_name, c.last_name as client_last_name,
        u.first_name as assigned_first_name, u.last_name as assigned_last_name
      FROM trips t
      LEFT JOIN clients c ON t.client_id = c.id
      LEFT JOIN users u ON t.assigned_user_id = u.id
      WHERE t.id = ? AND t.agency_id = ?
    `).get(tripId, req.agencyId);

    res.json({
      message: `Trip stage changed from ${oldStage} to ${stage}`,
      trip: formatTrip(trip),
      previousStage: oldStage,
      newStage: stage
    });
  } catch (error) {
    console.error('[ERROR] Update trip stage failed:', error.message);
    res.status(500).json({ error: 'Failed to update trip stage' });
  }
});

/**
 * DELETE /api/trips/:id
 * Delete a trip
 */
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const tripId = req.params.id;

    const existing = db.prepare('SELECT id FROM trips WHERE id = ? AND agency_id = ?').get(tripId, req.agencyId);
    if (!existing) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    db.prepare('DELETE FROM trips WHERE id = ? AND agency_id = ?').run(tripId, req.agencyId);

    res.json({ message: 'Trip deleted successfully', deletedId: tripId });
  } catch (error) {
    console.error('[ERROR] Delete trip failed:', error.message);
    res.status(500).json({ error: 'Failed to delete trip' });
  }
});

function formatTrip(t) {
  return {
    id: t.id,
    clientId: t.client_id,
    clientName: t.client_first_name ? `${t.client_first_name} ${t.client_last_name}` : null,
    clientEmail: t.client_email || null,
    assignedUserId: t.assigned_user_id,
    assignedUserName: t.assigned_first_name ? `${t.assigned_first_name} ${t.assigned_last_name}` : null,
    name: t.name,
    destination: t.destination,
    description: t.description,
    stage: t.stage,
    isLocked: !!t.is_locked,
    lockReason: t.lock_reason,
    travelStartDate: t.travel_start_date,
    travelEndDate: t.travel_end_date,
    finalPaymentDeadline: t.final_payment_deadline,
    insuranceCutoffDate: t.insurance_cutoff_date,
    checkinDate: t.checkin_date,
    createdAt: t.created_at,
    updatedAt: t.updated_at
  };
}

module.exports = router;
