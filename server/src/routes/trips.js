const express = require('express');
const multer = require('multer');
const { getDb } = require('../config/database');
const { authenticate, tenantScope } = require('../middleware/auth');
const { createNotificationsForUsers, generateEventKey } = require('../services/notificationService');

const router = express.Router();

// Configure multer for CSV upload (memory storage for parsing)
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

// All trip routes require authentication and tenant scope
router.use(authenticate);
router.use(tenantScope);

const VALID_STAGES = ['inquiry', 'quoted', 'booked', 'final_payment_pending', 'traveling', 'completed', 'canceled', 'archived'];

/**
 * GET /api/trips
 * List all trips for the agency with optional filters and pagination
 */
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const {
      search,
      stage,
      clientId,
      assignedTo,
      dateFrom,
      dateTo,
      showInactive, // If 'true', include canceled and archived trips; otherwise exclude by default
      sortBy = 'created_at',
      sortOrder = 'desc',
      page = '1',
      limit = '10'
    } = req.query;

    // Parse pagination params
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (pageNum - 1) * limitNum;

    let baseQuery = `
      FROM trips t
      LEFT JOIN clients c ON t.client_id = c.id
      LEFT JOIN users u ON t.assigned_user_id = u.id
      WHERE t.agency_id = ?
    `;
    const params = [req.agencyId];

    if (search) {
      baseQuery += ` AND (t.name LIKE ? OR t.destination LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (stage) {
      // When stage is explicitly set, filter to that stage
      baseQuery += ` AND t.stage = ?`;
      params.push(stage);
    } else if (showInactive !== 'true') {
      // By default, exclude canceled and archived trips unless explicitly requested
      // EXCEPTION: When searching, include archived trips (they should remain searchable)
      // but still exclude canceled trips from search results
      if (search) {
        baseQuery += ` AND t.stage != 'canceled'`;
      } else {
        baseQuery += ` AND t.stage NOT IN ('canceled', 'archived')`;
      }
    }

    if (clientId) {
      baseQuery += ` AND t.client_id = ?`;
      params.push(clientId);
    }

    if (assignedTo) {
      baseQuery += ` AND t.assigned_user_id = ?`;
      params.push(assignedTo);
    }

    // Date range filter - filters on travel_start_date
    if (dateFrom) {
      baseQuery += ` AND t.travel_start_date >= ?`;
      params.push(dateFrom);
    }

    if (dateTo) {
      baseQuery += ` AND t.travel_start_date <= ?`;
      params.push(dateTo);
    }

    // Get total count first
    const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
    const countResult = db.prepare(countQuery).get(...params);
    const total = countResult.total;

    const allowedSortCols = ['name', 'destination', 'stage', 'travel_start_date', 'travel_end_date', 'created_at', 'updated_at'];
    const safeSortBy = allowedSortCols.includes(sortBy) ? sortBy : 'created_at';
    const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

    // Build final query with pagination
    const selectQuery = `
      SELECT t.*,
        c.first_name as client_first_name, c.last_name as client_last_name,
        u.first_name as assigned_first_name, u.last_name as assigned_last_name
      ${baseQuery}
      ORDER BY t.${safeSortBy} ${safeSortOrder}
      LIMIT ? OFFSET ?
    `;
    const paginatedParams = [...params, limitNum, offset];
    const trips = db.prepare(selectQuery).all(...paginatedParams);

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limitNum);

    res.json({
      trips: trips.map(t => formatTrip(t)),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1
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

// Core fields that are locked when trip is locked (cannot be edited)
const LOCKED_FIELDS = ['destination', 'travelStartDate', 'travelEndDate', 'finalPaymentDeadline', 'insuranceCutoffDate', 'checkinDate'];

/**
 * Helper: Check if trip should be auto-locked
 * Trip should be locked when stage is 'booked' or beyond, and all bookings are paid_in_full
 */
function shouldTripBeLocked(db, tripId, stage) {
  // Only lock after booked stage (including final_payment_pending, traveling, completed)
  const lockableStages = ['booked', 'final_payment_pending', 'traveling', 'completed'];
  if (!lockableStages.includes(stage)) {
    return { locked: false, reason: null };
  }

  // Check if all bookings have payment_status = 'paid_in_full'
  const bookings = db.prepare(`
    SELECT id, payment_status FROM bookings
    WHERE trip_id = ? AND status != 'canceled'
  `).all(tripId);

  // If no bookings, don't lock
  if (bookings.length === 0) {
    return { locked: false, reason: null };
  }

  const allPaid = bookings.every(b => b.payment_status === 'paid_in_full');

  if (allPaid) {
    return {
      locked: true,
      reason: 'Trip is booked with all payments complete. Core fields are locked to protect confirmed arrangements.'
    };
  }

  return { locked: false, reason: null };
}

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
      assignedUserId,
      changeReason // Required when requesting changes to locked fields
    } = req.body;

    const isAdmin = req.user.role === 'admin';

    // Check if trip is locked and user is trying to edit locked fields
    if (existing.is_locked) {
      const attemptedLockedFieldChanges = [];
      const proposedChanges = {};

      if (destination !== undefined && destination !== existing.destination) {
        attemptedLockedFieldChanges.push('destination');
        proposedChanges.destination = { old: existing.destination, new: destination };
      }
      if (travelStartDate !== undefined && travelStartDate !== existing.travel_start_date) {
        attemptedLockedFieldChanges.push('travel start date');
        proposedChanges.travelStartDate = { old: existing.travel_start_date, new: travelStartDate };
      }
      if (travelEndDate !== undefined && travelEndDate !== existing.travel_end_date) {
        attemptedLockedFieldChanges.push('travel end date');
        proposedChanges.travelEndDate = { old: existing.travel_end_date, new: travelEndDate };
      }
      if (finalPaymentDeadline !== undefined && finalPaymentDeadline !== existing.final_payment_deadline) {
        attemptedLockedFieldChanges.push('final payment deadline');
        proposedChanges.finalPaymentDeadline = { old: existing.final_payment_deadline, new: finalPaymentDeadline };
      }
      if (insuranceCutoffDate !== undefined && insuranceCutoffDate !== existing.insurance_cutoff_date) {
        attemptedLockedFieldChanges.push('insurance cutoff date');
        proposedChanges.insuranceCutoffDate = { old: existing.insurance_cutoff_date, new: insuranceCutoffDate };
      }
      if (checkinDate !== undefined && checkinDate !== existing.checkin_date) {
        attemptedLockedFieldChanges.push('check-in date');
        proposedChanges.checkinDate = { old: existing.checkin_date, new: checkinDate };
      }

      if (attemptedLockedFieldChanges.length > 0) {
        // If admin, allow the change but still log it
        if (isAdmin) {
          // Admin can bypass lock - record the override
          db.prepare(`
            INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            req.agencyId,
            req.user.id,
            'locked_trip_override',
            'trip',
            tripId,
            JSON.stringify({
              reason: changeReason || 'Admin override (no reason provided)',
              changes: proposedChanges,
              lockReason: existing.lock_reason
            }),
            tripId
          );

          // Record each field change in trip_change_records
          for (const [field, change] of Object.entries(proposedChanges)) {
            db.prepare(`
              INSERT INTO trip_change_records (trip_id, changed_by, field_changed, old_value, new_value)
              VALUES (?, ?, ?, ?, ?)
            `).run(tripId, req.user.id, field, change.old || '', change.new || '');
          }
          // Continue to allow the update below
        } else {
          // Non-admin must provide a reason and request approval
          if (!changeReason || changeReason.trim() === '') {
            return res.status(400).json({
              error: 'Reason required',
              message: 'Changes to locked trips require a reason. Please provide changeReason in your request.',
              lockedFields: attemptedLockedFieldChanges,
              requiresApproval: true
            });
          }

          // Check if there's already a pending approval for this trip's locked fields
          const existingPending = db.prepare(`
            SELECT id FROM approval_requests
            WHERE agency_id = ? AND entity_type = 'trip' AND entity_id = ?
              AND action_type = 'modify_locked_trip' AND status = 'pending'
          `).get(req.agencyId, tripId);

          if (existingPending) {
            return res.status(202).json({
              message: 'An approval request to modify this locked trip is already pending',
              approvalRequired: true,
              approvalRequestId: existingPending.id,
              lockedFields: attemptedLockedFieldChanges
            });
          }

          // Create approval request for locked field changes
          const result = db.prepare(`
            INSERT INTO approval_requests (agency_id, requested_by, action_type, entity_type, entity_id, reason)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            req.agencyId,
            req.user.id,
            'modify_locked_trip',
            'trip',
            tripId,
            JSON.stringify({ changeReason, proposedChanges, tripName: existing.name })
          );

          const requestId = result.lastInsertRowid;

          // Create notifications for admins
          const admins = db.prepare(
            "SELECT id FROM users WHERE agency_id = ? AND role = 'admin' AND is_active = 1"
          ).all(req.agencyId);

          for (const admin of admins) {
            db.prepare(`
              INSERT INTO notifications (agency_id, user_id, type, title, message, entity_type, entity_id)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
              req.agencyId,
              admin.id,
              'normal',
              'Locked Trip Change Request',
              `${req.user.firstName || req.user.email} requests to modify locked trip "${existing.name}": ${changeReason}`,
              'approval_request',
              requestId
            );
          }

          // Log the approval request creation
          db.prepare(`
            INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            req.agencyId,
            req.user.id,
            'create_approval_request',
            'approval_request',
            requestId,
            JSON.stringify({
              action: 'modify_locked_trip',
              tripId,
              tripName: existing.name,
              changeReason,
              proposedChanges
            }),
            tripId
          );

          return res.status(202).json({
            message: 'Changes to locked trips require admin approval. An approval request has been created.',
            approvalRequired: true,
            approvalRequestId: requestId,
            lockedFields: attemptedLockedFieldChanges,
            proposedChanges
          });
        }
      }
    }

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
 * Financial stage transitions require admin approval for non-admins
 */
router.put('/:id/stage', (req, res) => {
  try {
    const db = getDb();
    const tripId = req.params.id;
    const { stage, reason } = req.body;

    if (!stage || !VALID_STAGES.includes(stage)) {
      return res.status(400).json({ error: 'Invalid stage. Valid stages: ' + VALID_STAGES.join(', ') });
    }

    const existing = db.prepare('SELECT * FROM trips WHERE id = ? AND agency_id = ?').get(tripId, req.agencyId);
    if (!existing) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const oldStage = existing.stage;

    // Define financial stage transitions that require admin approval
    const financialTransitions = [
      { from: 'quoted', to: 'booked' },        // Committing to booking
      { from: 'booked', to: 'final_payment_pending' },  // Payment stage
      { from: 'final_payment_pending', to: 'traveling' }  // Confirming trip is paid
    ];

    // Reopening completed or canceled trips always requires admin approval
    const closedStages = ['completed', 'canceled'];
    const isReopeningClosedTrip = closedStages.includes(oldStage) && !closedStages.includes(stage) && stage !== 'archived';

    const isFinancialTransition = financialTransitions.some(
      t => t.from === oldStage && t.to === stage
    );
    const isAdmin = req.user.role === 'admin';

    // Reopening closed trips ALWAYS requires admin approval (even for admins submitting)
    // This ensures there's always an audit trail with reason
    if (isReopeningClosedTrip && !isAdmin) {
      // Non-admin requesting to reopen - create approval request
      const existingPending = db.prepare(`
        SELECT id FROM approval_requests
        WHERE agency_id = ? AND entity_type = 'trip' AND entity_id = ?
          AND action_type = 'reopen_trip' AND status = 'pending'
      `).get(req.agencyId, tripId);

      if (existingPending) {
        return res.status(409).json({
          error: 'An approval request to reopen this trip is already pending',
          approvalRequired: true,
          approvalRequestId: existingPending.id
        });
      }

      if (!reason || reason.trim() === '') {
        return res.status(400).json({
          error: 'Reason required',
          message: 'Reopening a completed or canceled trip requires a reason.',
          requiresApproval: true,
          currentStage: oldStage
        });
      }

      // Create approval request
      const result = db.prepare(`
        INSERT INTO approval_requests (agency_id, requested_by, action_type, entity_type, entity_id, reason)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        req.agencyId,
        req.user.id,
        'reopen_trip',
        'trip',
        tripId,
        JSON.stringify({
          fromStage: oldStage,
          toStage: stage,
          reason: reason,
          tripName: existing.name
        })
      );

      const requestId = result.lastInsertRowid;

      // Notify admins
      const admins = db.prepare(
        "SELECT id FROM users WHERE agency_id = ? AND role = 'admin' AND is_active = 1"
      ).all(req.agencyId);

      for (const admin of admins) {
        db.prepare(`
          INSERT INTO notifications (agency_id, user_id, type, title, message, entity_type, entity_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          req.agencyId,
          admin.id,
          'urgent',
          'Trip Reopen Request',
          `${req.user.firstName || req.user.email} requested to reopen ${oldStage} trip "${existing.name}": ${reason}`,
          'approval_request',
          requestId
        );
      }

      // Log the request
      db.prepare(`
        INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.agencyId,
        req.user.id,
        'create_approval_request',
        'approval_request',
        requestId,
        JSON.stringify({ actionType: 'reopen_trip', fromStage: oldStage, toStage: stage, reason, tripId }),
        tripId
      );

      return res.status(202).json({
        message: `Reopening ${oldStage} trips requires admin approval. Your request has been submitted.`,
        approvalRequired: true,
        approvalRequestId: requestId,
        currentStage: oldStage,
        requestedStage: stage
      });
    }

    // Admin reopening a closed trip - allowed but must provide reason
    if (isReopeningClosedTrip && isAdmin) {
      if (!reason || reason.trim() === '') {
        return res.status(400).json({
          error: 'Reason required',
          message: 'Reopening a completed or canceled trip requires a reason for audit purposes.',
          currentStage: oldStage
        });
      }

      // Log the admin-approved reopen with reason
      db.prepare(`
        INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.agencyId,
        req.user.id,
        'trip_reopened',
        'trip',
        tripId,
        JSON.stringify({
          fromStage: oldStage,
          toStage: stage,
          reason: reason,
          approvedBy: req.user.id,
          approverName: `${req.user.firstName} ${req.user.lastName}`
        }),
        tripId
      );
      // Continue to update the stage below
    }

    // Non-admins require approval for financial stage transitions
    if (isFinancialTransition && !isAdmin) {
      // Check if there's already a pending approval for this stage change
      const existingPending = db.prepare(`
        SELECT id FROM approval_requests
        WHERE agency_id = ? AND entity_type = 'trip' AND entity_id = ?
          AND action_type = 'stage_change' AND status = 'pending'
      `).get(req.agencyId, tripId);

      if (existingPending) {
        return res.status(409).json({
          error: 'An approval request for this stage transition is already pending',
          approvalRequired: true,
          approvalRequestId: existingPending.id
        });
      }

      // Create approval request for the financial stage transition
      const result = db.prepare(`
        INSERT INTO approval_requests (agency_id, requested_by, action_type, entity_type, entity_id, reason)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        req.agencyId,
        req.user.id,
        'stage_change',
        'trip',
        tripId,
        JSON.stringify({
          fromStage: oldStage,
          toStage: stage,
          reason: reason || 'Financial stage transition requires approval'
        })
      );

      const requestId = result.lastInsertRowid;

      // Create notifications for admins
      const admins = db.prepare(
        "SELECT id FROM users WHERE agency_id = ? AND role = 'admin' AND is_active = 1"
      ).all(req.agencyId);

      for (const admin of admins) {
        db.prepare(`
          INSERT INTO notifications (agency_id, user_id, type, title, message, entity_type, entity_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          req.agencyId,
          admin.id,
          'urgent',
          'Stage Change Approval Required',
          `${req.user.firstName || req.user.email} requested to change trip "${existing.name}" from ${oldStage} to ${stage}`,
          'approval_request',
          requestId
        );
      }

      // Log the approval request creation in audit
      db.prepare(`
        INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.agencyId,
        req.user.id,
        'create_approval_request',
        'approval_request',
        requestId,
        JSON.stringify({ actionType: 'stage_change', fromStage: oldStage, toStage: stage, tripId }),
        tripId
      );

      return res.status(202).json({
        message: 'Financial stage transitions require admin approval. Your request has been submitted.',
        approvalRequired: true,
        approvalRequestId: requestId,
        currentStage: oldStage,
        requestedStage: stage
      });
    }

    // Check if trip should be auto-locked after stage transition
    const lockCheck = shouldTripBeLocked(db, tripId, stage);

    // Update stage and potentially lock the trip
    if (lockCheck.locked) {
      db.prepare(`
        UPDATE trips SET stage = ?, is_locked = 1, lock_reason = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND agency_id = ?
      `).run(stage, lockCheck.reason, tripId, req.agencyId);
    } else {
      db.prepare(`
        UPDATE trips SET stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND agency_id = ?
      `).run(stage, tripId, req.agencyId);
    }

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

    // Handle trip cancellation - update all bookings to canceled status
    if (stage === 'canceled') {
      // Get all non-canceled bookings for this trip
      const bookingsToCancel = db.prepare(`
        SELECT id FROM bookings WHERE trip_id = ? AND status != 'canceled'
      `).all(tripId);

      if (bookingsToCancel.length > 0) {
        // Update all bookings to canceled status
        db.prepare(`
          UPDATE bookings SET status = 'canceled', updated_at = datetime('now')
          WHERE trip_id = ? AND status != 'canceled'
        `).run(tripId);

        // Log the booking cancellations
        db.prepare(`
          INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          req.agencyId,
          req.user.id,
          'bookings_canceled',
          'trip',
          tripId,
          JSON.stringify({
            reason: 'Trip canceled',
            bookingsCanceled: bookingsToCancel.length,
            bookingIds: bookingsToCancel.map(b => b.id)
          }),
          tripId
        );
      }
    }

    // Fetch agency workflow timing settings
    const agencySettings = db.prepare(`
      SELECT quote_followup_days, booking_confirmation_days, final_payment_reminder_days,
             travel_reminder_days, feedback_request_days
      FROM agencies WHERE id = ?
    `).get(req.agencyId);

    // Use agency settings or defaults
    const timingSettings = {
      quoteFollowupDays: agencySettings?.quote_followup_days ?? 3,
      bookingConfirmationDays: agencySettings?.booking_confirmation_days ?? 1,
      finalPaymentReminderDays: agencySettings?.final_payment_reminder_days ?? 7,
      travelReminderDays: agencySettings?.travel_reminder_days ?? 0,
      feedbackRequestDays: agencySettings?.feedback_request_days ?? 3
    };

    // Generate system tasks based on stage transitions using agency timing settings
    const tasksByStage = {
      quoted: { title: 'Follow up on quote', description: 'Follow up with client on the trip quote', category: 'follow_up', daysOut: timingSettings.quoteFollowupDays },
      booked: { title: 'Confirm booking details', description: 'Verify all booking confirmations received', category: 'internal', daysOut: timingSettings.bookingConfirmationDays },
      final_payment_pending: { title: 'Collect final payment', description: 'Final payment is due - follow up with client', category: 'payment', daysOut: timingSettings.finalPaymentReminderDays },
      traveling: { title: 'Send bon voyage message', description: 'Send trip documents and bon voyage message to client', category: 'client_request', daysOut: timingSettings.travelReminderDays },
      completed: { title: 'Request trip feedback', description: 'Send feedback request to client and follow up on commission', category: 'follow_up', daysOut: timingSettings.feedbackRequestDays }
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

    // Create commission follow-up task when trip is completed
    if (stage === 'completed') {
      // Find all bookings with expected commissions that haven't been submitted/paid
      const pendingCommissions = db.prepare(`
        SELECT id, supplier_name, booking_type, commission_amount_expected, commission_status
        FROM bookings
        WHERE trip_id = ? AND status != 'canceled'
          AND commission_status = 'expected'
          AND commission_amount_expected > 0
      `).all(tripId);

      if (pendingCommissions.length > 0) {
        // Build description listing each booking
        const bookingList = pendingCommissions.map(b => {
          const supplier = b.supplier_name || b.booking_type || 'Unknown';
          const amount = b.commission_amount_expected ? `$${b.commission_amount_expected.toLocaleString()}` : 'TBD';
          return `- ${supplier}: ${amount}`;
        }).join('\n');

        const totalExpected = pendingCommissions.reduce((sum, b) => sum + (b.commission_amount_expected || 0), 0);
        const totalStr = `$${totalExpected.toLocaleString()}`;

        const commissionDueDate = new Date();
        commissionDueDate.setDate(commissionDueDate.getDate() + 7); // 7 days after trip completion

        db.prepare(`
          INSERT INTO tasks (agency_id, trip_id, assigned_user_id, title, description, due_date, status, priority, category, is_system_generated, source_event)
          VALUES (?, ?, ?, ?, ?, ?, 'open', 'normal', 'commission', 1, 'commission_followup')
        `).run(
          req.agencyId,
          tripId,
          existing.assigned_user_id || req.user.id,
          `Submit commissions for ${existing.name}`,
          `Trip "${existing.name}" is complete. Submit the following commissions (total: ${totalStr}):\n\n${bookingList}\n\nMark each booking's commission as submitted once you've sent the request to the supplier.`,
          commissionDueDate.toISOString().split('T')[0]
        );

        console.log(`[COMMISSION_TASK] Created commission follow-up task for trip ${tripId} with ${pendingCommissions.length} pending commissions`);
      }
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
 * PUT /api/trips/:id/lock
 * Check and update trip lock status (recalculate based on current bookings)
 * Called when booking payment status changes
 */
router.put('/:id/lock', (req, res) => {
  try {
    const db = getDb();
    const tripId = req.params.id;

    const existing = db.prepare('SELECT * FROM trips WHERE id = ? AND agency_id = ?').get(tripId, req.agencyId);
    if (!existing) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // Check if trip should be locked
    const lockCheck = shouldTripBeLocked(db, tripId, existing.stage);

    // Update lock status
    db.prepare(`
      UPDATE trips SET is_locked = ?, lock_reason = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND agency_id = ?
    `).run(
      lockCheck.locked ? 1 : 0,
      lockCheck.reason,
      tripId,
      req.agencyId
    );

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
      message: lockCheck.locked ? 'Trip is now locked' : 'Trip is unlocked',
      trip: formatTrip(trip),
      lockStatus: {
        isLocked: lockCheck.locked,
        reason: lockCheck.reason
      }
    });
  } catch (error) {
    console.error('[ERROR] Update trip lock status failed:', error.message);
    res.status(500).json({ error: 'Failed to update trip lock status' });
  }
});

/**
 * PUT /api/trips/:id/unlock
 * Admin only - unlock a trip with reason logged
 */
router.put('/:id/unlock', (req, res) => {
  try {
    const db = getDb();
    const tripId = req.params.id;
    const { reason } = req.body;

    // Only admins can force-unlock trips
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Only admins can unlock trips',
        message: 'Please contact an administrator to unlock this trip.'
      });
    }

    const existing = db.prepare('SELECT * FROM trips WHERE id = ? AND agency_id = ?').get(tripId, req.agencyId);
    if (!existing) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    if (!existing.is_locked) {
      return res.status(400).json({ error: 'Trip is not locked' });
    }

    // Unlock the trip
    db.prepare(`
      UPDATE trips SET is_locked = 0, lock_reason = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND agency_id = ?
    `).run(tripId, req.agencyId);

    // Log the unlock action in audit_logs
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      req.user.id,
      'trip_unlocked',
      'trip',
      tripId,
      JSON.stringify({ reason: reason || 'No reason provided', previousLockReason: existing.lock_reason }),
      tripId
    );

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
      message: 'Trip unlocked successfully',
      trip: formatTrip(trip)
    });
  } catch (error) {
    console.error('[ERROR] Unlock trip failed:', error.message);
    res.status(500).json({ error: 'Failed to unlock trip' });
  }
});

/**
 * GET /api/trips/:id/delete-preview
 * Preview what will be affected if this trip is deleted
 */
router.get('/:id/delete-preview', (req, res) => {
  try {
    const db = getDb();
    const tripId = req.params.id;

    const existing = db.prepare('SELECT id, name FROM trips WHERE id = ? AND agency_id = ?').get(tripId, req.agencyId);
    if (!existing) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // Count related data that will be deleted (CASCADE)
    const bookingsCount = db.prepare('SELECT COUNT(*) as count FROM bookings WHERE trip_id = ?').get(tripId).count;
    const travelersCount = db.prepare('SELECT COUNT(*) as count FROM travelers WHERE trip_id = ?').get(tripId).count;
    const documentsCount = db.prepare('SELECT COUNT(*) as count FROM documents WHERE trip_id = ?').get(tripId).count;

    // Count related data that will be unlinked (SET NULL)
    const tasksCount = db.prepare('SELECT COUNT(*) as count FROM tasks WHERE trip_id = ?').get(tripId).count;

    res.json({
      tripId,
      tripName: existing.name,
      relatedData: {
        bookings: bookingsCount,
        travelers: travelersCount,
        documents: documentsCount,
        tasks: tasksCount
      },
      cascade: {
        willDelete: ['bookings', 'travelers', 'documents', 'trip_change_records'],
        willUnlink: ['tasks', 'email_queue', 'audit_logs']
      }
    });
  } catch (error) {
    console.error('[ERROR] Delete preview failed:', error.message);
    res.status(500).json({ error: 'Failed to generate delete preview' });
  }
});

/**
 * DELETE /api/trips/:id
 * Delete a trip with cascade handling
 */
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const tripId = req.params.id;

    const existing = db.prepare('SELECT id, name FROM trips WHERE id = ? AND agency_id = ?').get(tripId, req.agencyId);
    if (!existing) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // Get counts before deletion for response
    const bookingsCount = db.prepare('SELECT COUNT(*) as count FROM bookings WHERE trip_id = ?').get(tripId).count;
    const travelersCount = db.prepare('SELECT COUNT(*) as count FROM travelers WHERE trip_id = ?').get(tripId).count;
    const documentsCount = db.prepare('SELECT COUNT(*) as count FROM documents WHERE trip_id = ?').get(tripId).count;
    const tasksCount = db.prepare('SELECT COUNT(*) as count FROM tasks WHERE trip_id = ?').get(tripId).count;

    // Log the deletion in audit_logs before deletion (while trip still exists)
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      req.user.id,
      'delete_trip',
      'trip',
      tripId,
      JSON.stringify({
        tripName: existing.name,
        deletedRelatedData: {
          bookings: bookingsCount,
          travelers: travelersCount,
          documents: documentsCount,
          tasksUnlinked: tasksCount
        }
      })
    );

    // Delete the trip - CASCADE will handle related data
    db.prepare('DELETE FROM trips WHERE id = ? AND agency_id = ?').run(tripId, req.agencyId);

    res.json({
      message: 'Trip deleted successfully',
      deletedId: tripId,
      tripName: existing.name,
      deletedRelatedData: {
        bookings: bookingsCount,
        travelers: travelersCount,
        documents: documentsCount,
        tasksUnlinked: tasksCount
      }
    });
  } catch (error) {
    console.error('[ERROR] Delete trip failed:', error.message);
    res.status(500).json({ error: 'Failed to delete trip' });
  }
});

/**
 * POST /api/trips/:id/duplicate
 * Duplicate a trip as a template for repeat bookings
 * Copies trip details, optionally travelers and bookings
 */
router.post('/:id/duplicate', (req, res) => {
  try {
    const db = getDb();
    const tripId = req.params.id;
    const {
      includeTravelers = true,  // Whether to copy travelers
      includeBookings = false,  // Whether to copy bookings (default false as they'd need new dates)
      newName,                  // Optional custom name for the duplicate
      newClientId               // Optional different client for the duplicate
    } = req.body;

    // Get the original trip
    const original = db.prepare('SELECT * FROM trips WHERE id = ? AND agency_id = ?').get(tripId, req.agencyId);
    if (!original) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // Determine client for new trip (use provided or same as original)
    const clientId = newClientId || original.client_id;

    // Verify client exists if different from original
    if (newClientId && newClientId !== original.client_id) {
      const client = db.prepare('SELECT id FROM clients WHERE id = ? AND agency_id = ?').get(newClientId, req.agencyId);
      if (!client) {
        return res.status(404).json({ error: 'Specified client not found' });
      }
    }

    // Create the duplicate trip
    const duplicateName = newName || `Copy of ${original.name}`;

    const result = db.prepare(`
      INSERT INTO trips (
        agency_id, client_id, assigned_user_id, name, destination, description,
        stage, is_locked,
        travel_start_date, travel_end_date,
        final_payment_deadline, insurance_cutoff_date, checkin_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      clientId,
      req.user.id,  // Assign to current user
      duplicateName,
      original.destination,
      original.description,
      'inquiry',    // Always start as inquiry
      0,            // Not locked
      original.travel_start_date,
      original.travel_end_date,
      original.final_payment_deadline,
      original.insurance_cutoff_date,
      original.checkin_date
    );

    const newTripId = result.lastInsertRowid;
    let travelersCopied = 0;
    let bookingsCopied = 0;

    // Copy travelers if requested
    if (includeTravelers) {
      const travelers = db.prepare('SELECT * FROM travelers WHERE trip_id = ?').all(tripId);
      for (const traveler of travelers) {
        db.prepare(`
          INSERT INTO travelers (
            trip_id, full_legal_name, date_of_birth,
            passport_status, passport_expiration,
            special_needs, relationship_to_client
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          newTripId,
          traveler.full_legal_name,
          traveler.date_of_birth,
          traveler.passport_status,
          traveler.passport_expiration,
          traveler.special_needs,
          traveler.relationship_to_client
        );
        travelersCopied++;
      }
    }

    // Copy bookings if requested (with reset statuses)
    if (includeBookings) {
      const bookings = db.prepare('SELECT * FROM bookings WHERE trip_id = ?').all(tripId);
      for (const booking of bookings) {
        db.prepare(`
          INSERT INTO bookings (
            agency_id, trip_id, booking_type, supplier_name,
            travel_start_date, travel_end_date,
            status, payment_status,
            total_cost, deposit_amount, final_payment_amount, final_payment_due_date,
            commission_amount_expected, commission_rate,
            supplier_notes, inclusions_exclusions, cancellation_rules
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          req.agencyId,
          newTripId,
          booking.booking_type,
          booking.supplier_name,
          booking.travel_start_date,
          booking.travel_end_date,
          'planned',      // Reset status
          'deposit_paid', // Reset payment status to initial
          booking.total_cost,
          booking.deposit_amount,
          booking.final_payment_amount,
          booking.final_payment_due_date,
          booking.commission_amount_expected,
          booking.commission_rate,
          booking.supplier_notes,
          booking.inclusions_exclusions,
          booking.cancellation_rules
        );
        bookingsCopied++;
      }
    }

    // Create audit log for duplication
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      req.user.id,
      'trip_duplicated',
      'trip',
      newTripId,
      JSON.stringify({
        sourceTrip: tripId,
        sourceTripName: original.name,
        newTripName: duplicateName,
        travelersCopied,
        bookingsCopied,
        includeTravelers,
        includeBookings
      }),
      newTripId
    );

    // Fetch the new trip with joins
    const newTrip = db.prepare(`
      SELECT t.*,
        c.first_name as client_first_name, c.last_name as client_last_name,
        u.first_name as assigned_first_name, u.last_name as assigned_last_name
      FROM trips t
      LEFT JOIN clients c ON t.client_id = c.id
      LEFT JOIN users u ON t.assigned_user_id = u.id
      WHERE t.id = ? AND t.agency_id = ?
    `).get(newTripId, req.agencyId);

    res.status(201).json({
      message: 'Trip duplicated successfully',
      trip: formatTrip(newTrip),
      duplicatedFrom: {
        id: tripId,
        name: original.name
      },
      copiedData: {
        travelers: travelersCopied,
        bookings: bookingsCopied
      }
    });
  } catch (error) {
    console.error('[ERROR] Duplicate trip failed:', error.message);
    res.status(500).json({ error: 'Failed to duplicate trip' });
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

// ============================================
// Acknowledgments Routes
// ============================================

/**
 * GET /api/trips/:id/acknowledgments
 * Get all acknowledgments for a trip (planner view)
 */
router.get('/:id/acknowledgments', (req, res) => {
  try {
    const db = getDb();
    const tripId = req.params.id;

    // Verify trip exists and belongs to agency
    const trip = db.prepare(
      'SELECT id FROM trips WHERE id = ? AND agency_id = ?'
    ).get(tripId, req.agencyId);

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const acknowledgments = db.prepare(`
      SELECT a.*,
        c.first_name || ' ' || c.last_name as client_name,
        u.first_name || ' ' || u.last_name as created_by_name
      FROM acknowledgments a
      LEFT JOIN clients c ON a.client_id = c.id
      LEFT JOIN users u ON a.created_by = u.id
      WHERE a.trip_id = ? AND a.agency_id = ?
      ORDER BY a.created_at DESC
    `).all(tripId, req.agencyId);

    res.json({
      acknowledgments: acknowledgments.map(a => ({
        id: a.id,
        title: a.title,
        description: a.description,
        type: a.acknowledgment_type,
        documentId: a.document_id,
        isAcknowledged: !!a.is_acknowledged,
        acknowledgedAt: a.acknowledged_at,
        clientName: a.client_name,
        createdByName: a.created_by_name,
        createdAt: a.created_at
      }))
    });
  } catch (error) {
    console.error('[ERROR] Get trip acknowledgments failed:', error.message);
    res.status(500).json({ error: 'Failed to get acknowledgments' });
  }
});

/**
 * POST /api/trips/:id/acknowledgments
 * Create a new acknowledgment request for a trip (planner creates it)
 */
router.post('/:id/acknowledgments', (req, res) => {
  try {
    const db = getDb();
    const tripId = req.params.id;

    // Verify trip exists
    const trip = db.prepare(
      'SELECT id, client_id FROM trips WHERE id = ? AND agency_id = ?'
    ).get(tripId, req.agencyId);

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const { title, description, type, documentId } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const validTypes = ['info', 'document', 'itinerary', 'booking', 'payment', 'terms'];
    const ackType = validTypes.includes(type) ? type : 'info';

    const result = db.prepare(`
      INSERT INTO acknowledgments (agency_id, trip_id, client_id, document_id, title, description, acknowledgment_type, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      tripId,
      trip.client_id,
      documentId || null,
      title,
      description || null,
      ackType,
      req.userId
    );

    // Log in audit
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id, client_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      req.userId,
      'acknowledgment_created',
      'acknowledgment',
      result.lastInsertRowid,
      JSON.stringify({ title, type: ackType }),
      tripId,
      trip.client_id
    );

    const ack = db.prepare('SELECT * FROM acknowledgments WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      message: 'Acknowledgment request created',
      acknowledgment: {
        id: ack.id,
        title: ack.title,
        description: ack.description,
        type: ack.acknowledgment_type,
        isAcknowledged: false,
        createdAt: ack.created_at
      }
    });
  } catch (error) {
    console.error('[ERROR] Create acknowledgment failed:', error.message);
    res.status(500).json({ error: 'Failed to create acknowledgment' });
  }
});

/**
 * DELETE /api/trips/:tripId/acknowledgments/:id
 * Delete an acknowledgment (planner only, only if not yet acknowledged)
 */
router.delete('/:tripId/acknowledgments/:id', (req, res) => {
  try {
    const db = getDb();
    const { tripId, id } = req.params;

    const ack = db.prepare(
      'SELECT * FROM acknowledgments WHERE id = ? AND trip_id = ? AND agency_id = ?'
    ).get(id, tripId, req.agencyId);

    if (!ack) {
      return res.status(404).json({ error: 'Acknowledgment not found' });
    }

    if (ack.is_acknowledged) {
      return res.status(400).json({ error: 'Cannot delete an acknowledgment that has already been confirmed' });
    }

    db.prepare('DELETE FROM acknowledgments WHERE id = ?').run(id);

    res.json({ message: 'Acknowledgment deleted' });
  } catch (error) {
    console.error('[ERROR] Delete acknowledgment failed:', error.message);
    res.status(500).json({ error: 'Failed to delete acknowledgment' });
  }
});

/**
 * POST /api/trips/import
 * Import trips from CSV file
 * Expected CSV columns: name, destination, clientEmail, travelStartDate, travelEndDate, description
 */
router.post('/import', csvUpload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const db = getDb();
    const csvContent = req.file.buffer.toString('utf-8');

    // Parse CSV
    const lines = csvContent.split('\n').map(line => line.trim()).filter(line => line);
    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV file must have a header row and at least one data row' });
    }

    // Parse header
    const header = parseCSVLine(lines[0]);
    const headerLower = header.map(h => h.toLowerCase().trim());

    // Validate required columns
    const nameIndex = headerLower.findIndex(h => h === 'name' || h === 'trip name' || h === 'tripname');
    if (nameIndex === -1) {
      return res.status(400).json({
        error: 'CSV must have a "name" column',
        validColumns: ['name', 'destination', 'clientEmail', 'travelStartDate', 'travelEndDate', 'description']
      });
    }

    // Find other column indices
    const destIndex = headerLower.findIndex(h => h === 'destination' || h === 'dest');
    const clientEmailIndex = headerLower.findIndex(h => h === 'clientemail' || h === 'client_email' || h === 'client email' || h === 'email');
    const startDateIndex = headerLower.findIndex(h => h === 'travelstartdate' || h === 'travel_start_date' || h === 'start date' || h === 'startdate');
    const endDateIndex = headerLower.findIndex(h => h === 'travelenddate' || h === 'travel_end_date' || h === 'end date' || h === 'enddate');
    const descIndex = headerLower.findIndex(h => h === 'description' || h === 'desc' || h === 'notes');

    const results = {
      imported: 0,
      errors: [],
      trips: []
    };

    // Process data rows
    for (let i = 1; i < lines.length; i++) {
      const rowNum = i + 1;
      const values = parseCSVLine(lines[i]);

      // Skip empty rows
      if (values.length === 0 || values.every(v => !v.trim())) {
        continue;
      }

      const name = values[nameIndex]?.trim();
      if (!name) {
        results.errors.push({ row: rowNum, error: 'Missing trip name' });
        continue;
      }

      // Get other fields
      const destination = destIndex >= 0 ? values[destIndex]?.trim() || null : null;
      const clientEmail = clientEmailIndex >= 0 ? values[clientEmailIndex]?.trim() || null : null;
      const travelStartDate = startDateIndex >= 0 ? parseDate(values[startDateIndex]?.trim()) : null;
      const travelEndDate = endDateIndex >= 0 ? parseDate(values[endDateIndex]?.trim()) : null;
      const description = descIndex >= 0 ? values[descIndex]?.trim() || null : null;

      // Look up client by email if provided
      let clientId = null;
      if (clientEmail) {
        const client = db.prepare('SELECT id FROM clients WHERE email = ? AND agency_id = ?').get(clientEmail, req.agencyId);
        if (client) {
          clientId = client.id;
        } else {
          results.errors.push({ row: rowNum, warning: `Client with email "${clientEmail}" not found, trip created without client` });
        }
      }

      try {
        // Insert trip
        const result = db.prepare(`
          INSERT INTO trips (
            agency_id, client_id, assigned_user_id, name, destination, description,
            stage, is_locked, travel_start_date, travel_end_date
          ) VALUES (?, ?, ?, ?, ?, ?, 'inquiry', 0, ?, ?)
        `).run(
          req.agencyId,
          clientId,
          req.user.id,
          name,
          destination,
          description,
          travelStartDate,
          travelEndDate
        );

        const tripId = result.lastInsertRowid;
        results.imported++;
        results.trips.push({ id: tripId, name, row: rowNum });
      } catch (err) {
        results.errors.push({ row: rowNum, error: err.message });
      }
    }

    // Create audit log
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      req.user.id,
      'csv_import',
      'trip',
      null,
      JSON.stringify({
        fileName: req.file.originalname,
        imported: results.imported,
        errors: results.errors.length
      })
    );

    res.json({
      message: `Imported ${results.imported} trips`,
      imported: results.imported,
      errors: results.errors,
      trips: results.trips
    });
  } catch (error) {
    console.error('[ERROR] CSV import failed:', error.message);
    res.status(500).json({ error: 'Failed to import CSV', message: error.message });
  }
});

// Helper function to parse CSV line (handles quoted fields)
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

// Helper function to parse date strings
function parseDate(dateStr) {
  if (!dateStr) return null;

  // Try ISO format first (YYYY-MM-DD)
  const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) return dateStr;

  // Try MM/DD/YYYY format
  const usMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    return `${usMatch[3]}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`;
  }

  // Try DD/MM/YYYY format (assume if day > 12)
  const euMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (euMatch && parseInt(euMatch[1]) > 12) {
    return `${euMatch[3]}-${euMatch[2].padStart(2, '0')}-${euMatch[1].padStart(2, '0')}`;
  }

  return null;
}

module.exports = router;
