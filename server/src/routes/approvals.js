const express = require('express');
const { getDb } = require('../config/database');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');

const router = express.Router();

// All approval routes require authentication and tenant scoping
router.use(authenticate, tenantScope);

/**
 * GET /api/approvals
 * List approval requests (admins see all pending, others see their own)
 */
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const isAdmin = req.user.role === 'admin';
    const { status = 'pending' } = req.query;

    let query = `
      SELECT
        ar.*,
        requester.first_name as requester_first_name,
        requester.last_name as requester_last_name,
        requester.email as requester_email,
        approver.first_name as approver_first_name,
        approver.last_name as approver_last_name
      FROM approval_requests ar
      LEFT JOIN users requester ON ar.requested_by = requester.id
      LEFT JOIN users approver ON ar.approved_by = approver.id
      WHERE ar.agency_id = ?
    `;
    const params = [req.agencyId];

    if (!isAdmin) {
      // Non-admins only see their own requests
      query += ' AND ar.requested_by = ?';
      params.push(req.user.id);
    }

    if (status !== 'all') {
      query += ' AND ar.status = ?';
      params.push(status);
    }

    query += ' ORDER BY ar.created_at DESC';

    const requests = db.prepare(query).all(...params);

    res.json({
      approvalRequests: requests.map(formatApprovalRequest),
      count: requests.length
    });
  } catch (error) {
    console.error('[ERROR] List approvals failed:', error.message);
    res.status(500).json({ error: 'Failed to list approval requests' });
  }
});

/**
 * GET /api/approvals/:id
 * Get single approval request
 */
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const request = db.prepare(`
      SELECT
        ar.*,
        requester.first_name as requester_first_name,
        requester.last_name as requester_last_name,
        requester.email as requester_email,
        approver.first_name as approver_first_name,
        approver.last_name as approver_last_name
      FROM approval_requests ar
      LEFT JOIN users requester ON ar.requested_by = requester.id
      LEFT JOIN users approver ON ar.approved_by = approver.id
      WHERE ar.id = ? AND ar.agency_id = ?
    `).get(id, req.agencyId);

    if (!request) {
      return res.status(404).json({ error: 'Approval request not found' });
    }

    // Non-admins can only view their own requests
    if (req.user.role !== 'admin' && request.requested_by !== req.user.id) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    res.json({ approvalRequest: formatApprovalRequest(request) });
  } catch (error) {
    console.error('[ERROR] Get approval failed:', error.message);
    res.status(500).json({ error: 'Failed to get approval request' });
  }
});

/**
 * POST /api/approvals
 * Create a new approval request
 */
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { actionType, entityType, entityId, reason } = req.body;

    if (!actionType || !entityType || !entityId) {
      return res.status(400).json({
        error: 'Required fields: actionType, entityType, entityId'
      });
    }

    // Check if there's already a pending request for this action
    const existingPending = db.prepare(`
      SELECT id FROM approval_requests
      WHERE agency_id = ? AND entity_type = ? AND entity_id = ?
        AND action_type = ? AND status = 'pending'
    `).get(req.agencyId, entityType, entityId, actionType);

    if (existingPending) {
      return res.status(409).json({
        error: 'An approval request for this action is already pending',
        existingRequestId: existingPending.id
      });
    }

    const result = db.prepare(`
      INSERT INTO approval_requests (agency_id, requested_by, action_type, entity_type, entity_id, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.agencyId, req.user.id, actionType, entityType, entityId, reason || null);

    const requestId = result.lastInsertRowid;

    // Create audit log
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      req.user.id,
      'create_approval_request',
      'approval_request',
      requestId,
      JSON.stringify({ actionType, entityType, entityId, reason })
    );

    // Create notification for admins
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
        'New Approval Request',
        `${req.user.firstName || req.user.email} requested approval to ${actionType.replace(/_/g, ' ')}`,
        'approval_request',
        requestId
      );
    }

    const request = db.prepare(`
      SELECT ar.*, u.first_name as requester_first_name, u.last_name as requester_last_name
      FROM approval_requests ar
      LEFT JOIN users u ON ar.requested_by = u.id
      WHERE ar.id = ?
    `).get(requestId);

    res.status(201).json({
      message: 'Approval request created',
      approvalRequest: formatApprovalRequest(request)
    });
  } catch (error) {
    console.error('[ERROR] Create approval failed:', error.message);
    res.status(500).json({ error: 'Failed to create approval request' });
  }
});

/**
 * PUT /api/approvals/:id/approve
 * Approve a request (Admin only)
 */
router.put('/:id/approve', authorize('admin'), (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { responseNote } = req.body;

    const request = db.prepare(
      'SELECT * FROM approval_requests WHERE id = ? AND agency_id = ?'
    ).get(id, req.agencyId);

    if (!request) {
      return res.status(404).json({ error: 'Approval request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'This request has already been processed' });
    }

    // Update the approval request
    db.prepare(`
      UPDATE approval_requests
      SET status = 'approved',
          approved_by = ?,
          response_note = ?,
          resolved_at = datetime('now')
      WHERE id = ?
    `).run(req.user.id, responseNote || null, id);

    // Execute the approved action
    const actionResult = executeApprovedAction(db, request, req);

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      req.user.id,
      'approve_request',
      'approval_request',
      id,
      JSON.stringify({ actionType: request.action_type, entityType: request.entity_type, entityId: request.entity_id, responseNote })
    );

    // Notify the requester
    db.prepare(`
      INSERT INTO notifications (agency_id, user_id, type, title, message, entity_type, entity_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      request.requested_by,
      'normal',
      'Request Approved',
      `Your request to ${request.action_type.replace(/_/g, ' ')} has been approved`,
      request.entity_type,
      request.entity_id
    );

    res.json({
      message: 'Request approved and action executed',
      approvalRequest: formatApprovalRequest(
        db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(id)
      ),
      actionResult
    });
  } catch (error) {
    console.error('[ERROR] Approve request failed:', error.message);
    res.status(500).json({ error: 'Failed to approve request' });
  }
});

/**
 * PUT /api/approvals/:id/deny
 * Deny a request (Admin only)
 */
router.put('/:id/deny', authorize('admin'), (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { responseNote } = req.body;

    const request = db.prepare(
      'SELECT * FROM approval_requests WHERE id = ? AND agency_id = ?'
    ).get(id, req.agencyId);

    if (!request) {
      return res.status(404).json({ error: 'Approval request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'This request has already been processed' });
    }

    db.prepare(`
      UPDATE approval_requests
      SET status = 'denied',
          approved_by = ?,
          response_note = ?,
          resolved_at = datetime('now')
      WHERE id = ?
    `).run(req.user.id, responseNote || null, id);

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      req.user.id,
      'deny_request',
      'approval_request',
      id,
      JSON.stringify({ actionType: request.action_type, entityType: request.entity_type, entityId: request.entity_id, responseNote })
    );

    // Notify the requester
    db.prepare(`
      INSERT INTO notifications (agency_id, user_id, type, title, message, entity_type, entity_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      request.requested_by,
      'normal',
      'Request Denied',
      `Your request to ${request.action_type.replace(/_/g, ' ')} has been denied${responseNote ? ': ' + responseNote : ''}`,
      request.entity_type,
      request.entity_id
    );

    res.json({
      message: 'Request denied',
      approvalRequest: formatApprovalRequest(
        db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(id)
      )
    });
  } catch (error) {
    console.error('[ERROR] Deny request failed:', error.message);
    res.status(500).json({ error: 'Failed to deny request' });
  }
});

/**
 * Execute the approved action based on action_type
 */
function executeApprovedAction(db, request, req) {
  const { action_type, entity_type, entity_id, agency_id } = request;

  switch (action_type) {
    case 'confirm_booking':
      // Change booking status to 'booked'
      db.prepare(`
        UPDATE bookings SET status = 'booked', updated_at = datetime('now')
        WHERE id = ? AND agency_id = ?
      `).run(entity_id, agency_id);
      return { bookingId: entity_id, newStatus: 'booked' };

    case 'mark_payment_received':
      // Change payment status to paid_in_full
      db.prepare(`
        UPDATE bookings SET payment_status = 'paid_in_full', updated_at = datetime('now')
        WHERE id = ? AND agency_id = ?
      `).run(entity_id, agency_id);
      return { bookingId: entity_id, newPaymentStatus: 'paid_in_full' };

    case 'change_commission_status':
      // Get the requested new status from the reason field (JSON)
      try {
        const params = JSON.parse(request.reason || '{}');
        if (params.newStatus) {
          db.prepare(`
            UPDATE bookings SET commission_status = ?, updated_at = datetime('now')
            WHERE id = ? AND agency_id = ?
          `).run(params.newStatus, entity_id, agency_id);
          return { bookingId: entity_id, newCommissionStatus: params.newStatus };
        }
      } catch (e) {
        console.error('Failed to parse approval reason:', e);
      }
      return { error: 'Could not determine new commission status' };

    case 'stage_change':
      // Execute the approved stage change for a trip
      try {
        const params = JSON.parse(request.reason || '{}');
        const { fromStage, toStage } = params;

        if (!fromStage || !toStage) {
          return { error: 'Missing stage information in approval request' };
        }

        // Get current trip state
        const trip = db.prepare('SELECT * FROM trips WHERE id = ? AND agency_id = ?').get(entity_id, agency_id);
        if (!trip) {
          return { error: 'Trip not found' };
        }

        // Verify the trip is still at the expected stage
        if (trip.stage !== fromStage) {
          return {
            error: `Trip stage has changed since approval was requested. Expected ${fromStage}, found ${trip.stage}`,
            currentStage: trip.stage,
            expectedStage: fromStage
          };
        }

        // Perform the stage change
        db.prepare(`
          UPDATE trips SET stage = ?, updated_at = datetime('now')
          WHERE id = ? AND agency_id = ?
        `).run(toStage, entity_id, agency_id);

        // Log the stage transition in audit_logs
        db.prepare(`
          INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          agency_id,
          req.user.id,
          'stage_change',
          'trip',
          entity_id,
          JSON.stringify({ from: fromStage, to: toStage, approvedBy: req.user.id, approvalRequestId: request.id }),
          entity_id
        );

        // Record the change in trip_change_records
        db.prepare(`
          INSERT INTO trip_change_records (trip_id, changed_by, field_changed, old_value, new_value)
          VALUES (?, ?, ?, ?, ?)
        `).run(entity_id, req.user.id, 'stage', fromStage, toStage);

        return {
          tripId: entity_id,
          fromStage,
          toStage,
          message: `Trip stage changed from ${fromStage} to ${toStage}`
        };
      } catch (e) {
        console.error('Failed to execute stage change:', e);
        return { error: 'Failed to execute stage change: ' + e.message };
      }

    case 'reopen_trip':
      // Reopen a completed or canceled trip
      try {
        const params = JSON.parse(request.reason || '{}');
        const { fromStage, toStage, reason: reopenReason, tripName } = params;

        if (!fromStage || !toStage) {
          return { error: 'Missing stage information in approval request' };
        }

        // Get current trip state
        const trip = db.prepare('SELECT * FROM trips WHERE id = ? AND agency_id = ?').get(entity_id, agency_id);
        if (!trip) {
          return { error: 'Trip not found' };
        }

        // Verify the trip is still at the expected closed stage
        if (trip.stage !== fromStage) {
          return {
            error: `Trip stage has changed since approval was requested. Expected ${fromStage}, found ${trip.stage}`,
            currentStage: trip.stage,
            expectedStage: fromStage
          };
        }

        // Perform the stage change (reopen)
        db.prepare(`
          UPDATE trips SET stage = ?, updated_at = datetime('now')
          WHERE id = ? AND agency_id = ?
        `).run(toStage, entity_id, agency_id);

        // Log the reopen action in audit_logs
        db.prepare(`
          INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          agency_id,
          req.user.id,
          'trip_reopened',
          'trip',
          entity_id,
          JSON.stringify({
            fromStage,
            toStage,
            reason: reopenReason,
            approvalRequestId: request.id,
            approvedBy: req.user.id,
            approverName: `${req.user.firstName} ${req.user.lastName}`,
            tripName
          }),
          entity_id
        );

        // Record the change in trip_change_records
        db.prepare(`
          INSERT INTO trip_change_records (trip_id, changed_by, field_changed, old_value, new_value)
          VALUES (?, ?, ?, ?, ?)
        `).run(entity_id, req.user.id, 'stage', fromStage, toStage);

        return {
          tripId: entity_id,
          fromStage,
          toStage,
          reason: reopenReason,
          message: `Trip "${tripName}" reopened from ${fromStage} to ${toStage}`
        };
      } catch (e) {
        console.error('Failed to reopen trip:', e);
        return { error: 'Failed to reopen trip: ' + e.message };
      }

    case 'modify_locked_trip':
      // Apply the proposed changes to the locked trip
      try {
        const params = JSON.parse(request.reason || '{}');
        const { proposedChanges, changeReason } = params;

        if (!proposedChanges) {
          return { error: 'No proposed changes found in approval request' };
        }

        // Get current trip
        const trip = db.prepare('SELECT * FROM trips WHERE id = ? AND agency_id = ?').get(entity_id, agency_id);
        if (!trip) {
          return { error: 'Trip not found' };
        }

        // Build update query dynamically based on proposed changes
        const updates = [];
        const updateValues = [];
        const changeRecords = [];

        if (proposedChanges.destination) {
          updates.push('destination = ?');
          updateValues.push(proposedChanges.destination.new);
          changeRecords.push({ field: 'destination', old: proposedChanges.destination.old, new: proposedChanges.destination.new });
        }
        if (proposedChanges.travelStartDate) {
          updates.push('travel_start_date = ?');
          updateValues.push(proposedChanges.travelStartDate.new);
          changeRecords.push({ field: 'travelStartDate', old: proposedChanges.travelStartDate.old, new: proposedChanges.travelStartDate.new });
        }
        if (proposedChanges.travelEndDate) {
          updates.push('travel_end_date = ?');
          updateValues.push(proposedChanges.travelEndDate.new);
          changeRecords.push({ field: 'travelEndDate', old: proposedChanges.travelEndDate.old, new: proposedChanges.travelEndDate.new });
        }
        if (proposedChanges.finalPaymentDeadline) {
          updates.push('final_payment_deadline = ?');
          updateValues.push(proposedChanges.finalPaymentDeadline.new);
          changeRecords.push({ field: 'finalPaymentDeadline', old: proposedChanges.finalPaymentDeadline.old, new: proposedChanges.finalPaymentDeadline.new });
        }
        if (proposedChanges.insuranceCutoffDate) {
          updates.push('insurance_cutoff_date = ?');
          updateValues.push(proposedChanges.insuranceCutoffDate.new);
          changeRecords.push({ field: 'insuranceCutoffDate', old: proposedChanges.insuranceCutoffDate.old, new: proposedChanges.insuranceCutoffDate.new });
        }
        if (proposedChanges.checkinDate) {
          updates.push('checkin_date = ?');
          updateValues.push(proposedChanges.checkinDate.new);
          changeRecords.push({ field: 'checkinDate', old: proposedChanges.checkinDate.old, new: proposedChanges.checkinDate.new });
        }

        if (updates.length === 0) {
          return { error: 'No valid changes to apply' };
        }

        updates.push("updated_at = datetime('now')");

        // Apply the changes
        db.prepare(`
          UPDATE trips SET ${updates.join(', ')}
          WHERE id = ? AND agency_id = ?
        `).run(...updateValues, entity_id, agency_id);

        // Record each change in trip_change_records
        for (const change of changeRecords) {
          db.prepare(`
            INSERT INTO trip_change_records (trip_id, changed_by, field_changed, old_value, new_value)
            VALUES (?, ?, ?, ?, ?)
          `).run(entity_id, req.user.id, change.field, change.old || '', change.new || '');
        }

        // Create audit log for the approved locked trip modification
        db.prepare(`
          INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          agency_id,
          req.user.id,
          'locked_trip_modified',
          'trip',
          entity_id,
          JSON.stringify({
            approvalRequestId: request.id,
            changeReason,
            changes: changeRecords.map(c => ({ field: c.field, from: c.old, to: c.new }))
          }),
          entity_id
        );

        return {
          tripId: entity_id,
          changesApplied: changeRecords.map(c => c.field),
          changeReason
        };
      } catch (e) {
        console.error('Failed to apply locked trip changes:', e);
        return { error: 'Failed to apply changes: ' + e.message };
      }

    default:
      return { message: 'No automatic action defined for this type' };
  }
}

function formatApprovalRequest(r) {
  return {
    id: r.id,
    agencyId: r.agency_id,
    requestedBy: r.requested_by,
    requesterName: r.requester_first_name && r.requester_last_name
      ? `${r.requester_first_name} ${r.requester_last_name}`
      : null,
    requesterEmail: r.requester_email,
    approvedBy: r.approved_by,
    approverName: r.approver_first_name && r.approver_last_name
      ? `${r.approver_first_name} ${r.approver_last_name}`
      : null,
    actionType: r.action_type,
    entityType: r.entity_type,
    entityId: r.entity_id,
    status: r.status,
    reason: r.reason,
    responseNote: r.response_note,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at
  };
}

module.exports = router;
