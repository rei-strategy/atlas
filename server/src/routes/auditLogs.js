const express = require('express');
const { getDb } = require('../config/database');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');

const router = express.Router();

// All audit log routes require authentication and tenant scoping
router.use(authenticate, tenantScope);

/**
 * GET /api/audit-logs
 * List audit logs with optional filtering
 * Admin only - full access to all audit logs
 * Planners can see their own actions and entity-related logs
 */
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const isAdmin = req.user.role === 'admin';
    const {
      action,
      entityType,
      entityId,
      userId,
      startDate,
      endDate,
      limit = 50,
      offset = 0
    } = req.query;

    let query = `
      SELECT
        al.*,
        u.first_name as user_first_name,
        u.last_name as user_last_name,
        u.email as user_email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.agency_id = ?
    `;
    const params = [req.agencyId];

    // Non-admins can only see their own actions
    if (!isAdmin) {
      query += ' AND al.user_id = ?';
      params.push(req.user.id);
    }

    // Filter by specific action (e.g., 'approve_request', 'deny_request')
    if (action) {
      // Support comma-separated list of actions
      const actions = action.split(',').map(a => a.trim());
      if (actions.length > 1) {
        query += ` AND al.action IN (${actions.map(() => '?').join(',')})`;
        params.push(...actions);
      } else {
        query += ' AND al.action = ?';
        params.push(action);
      }
    }

    // Filter by entity type
    if (entityType) {
      query += ' AND al.entity_type = ?';
      params.push(entityType);
    }

    // Filter by entity ID
    if (entityId) {
      query += ' AND al.entity_id = ?';
      params.push(entityId);
    }

    // Filter by user who performed the action (admin only)
    if (userId && isAdmin) {
      query += ' AND al.user_id = ?';
      params.push(userId);
    }

    // Filter by date range
    if (startDate) {
      query += ' AND al.created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND al.created_at <= ?';
      params.push(endDate);
    }

    // Get total count for pagination
    const countQuery = query.replace(
      /SELECT[\s\S]+?FROM audit_logs/,
      'SELECT COUNT(*) as total FROM audit_logs'
    );
    const countResult = db.prepare(countQuery).get(...params);
    const total = countResult?.total || 0;

    // Add ordering and pagination
    query += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const logs = db.prepare(query).all(...params);

    res.json({
      auditLogs: logs.map(formatAuditLog),
      total,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10)
    });
  } catch (error) {
    console.error('[ERROR] List audit logs failed:', error.message);
    res.status(500).json({ error: 'Failed to list audit logs' });
  }
});

/**
 * GET /api/audit-logs/approvals
 * Convenience endpoint to get only approval-related logs
 * Returns logs for create_approval_request, approve_request, deny_request
 */
router.get('/approvals', (req, res) => {
  try {
    const db = getDb();
    const isAdmin = req.user.role === 'admin';
    const { limit = 50, offset = 0, startDate, endDate } = req.query;

    let query = `
      SELECT
        al.*,
        u.first_name as user_first_name,
        u.last_name as user_last_name,
        u.email as user_email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.agency_id = ?
        AND al.action IN ('create_approval_request', 'approve_request', 'deny_request')
    `;
    const params = [req.agencyId];

    // Non-admins can only see their own actions
    if (!isAdmin) {
      query += ' AND al.user_id = ?';
      params.push(req.user.id);
    }

    // Filter by date range
    if (startDate) {
      query += ' AND al.created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND al.created_at <= ?';
      params.push(endDate);
    }

    // Get total count
    const countQuery = query.replace(
      /SELECT[\s\S]+?FROM audit_logs/,
      'SELECT COUNT(*) as total FROM audit_logs'
    );
    const countResult = db.prepare(countQuery).get(...params);
    const total = countResult?.total || 0;

    // Add ordering and pagination
    query += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const logs = db.prepare(query).all(...params);

    res.json({
      auditLogs: logs.map(formatAuditLog),
      total,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10)
    });
  } catch (error) {
    console.error('[ERROR] List approval audit logs failed:', error.message);
    res.status(500).json({ error: 'Failed to list approval audit logs' });
  }
});

/**
 * GET /api/audit-logs/:id
 * Get single audit log entry
 */
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const isAdmin = req.user.role === 'admin';

    let query = `
      SELECT
        al.*,
        u.first_name as user_first_name,
        u.last_name as user_last_name,
        u.email as user_email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.id = ? AND al.agency_id = ?
    `;
    const params = [id, req.agencyId];

    // Non-admins can only view their own logs
    if (!isAdmin) {
      query += ' AND al.user_id = ?';
      params.push(req.user.id);
    }

    const log = db.prepare(query).get(...params);

    if (!log) {
      return res.status(404).json({ error: 'Audit log not found' });
    }

    res.json({ auditLog: formatAuditLog(log) });
  } catch (error) {
    console.error('[ERROR] Get audit log failed:', error.message);
    res.status(500).json({ error: 'Failed to get audit log' });
  }
});

/**
 * GET /api/audit-logs/actions/list
 * Get list of distinct action types for filtering
 */
router.get('/actions/list', (req, res) => {
  try {
    const db = getDb();

    const actions = db.prepare(`
      SELECT DISTINCT action FROM audit_logs
      WHERE agency_id = ?
      ORDER BY action
    `).all(req.agencyId);

    res.json({
      actions: actions.map(a => a.action)
    });
  } catch (error) {
    console.error('[ERROR] List action types failed:', error.message);
    res.status(500).json({ error: 'Failed to list action types' });
  }
});

/**
 * Format audit log for API response
 */
function formatAuditLog(log) {
  let parsedDetails = {};
  try {
    parsedDetails = log.details ? JSON.parse(log.details) : {};
  } catch (e) {
    parsedDetails = { raw: log.details };
  }

  return {
    id: log.id,
    agencyId: log.agency_id,
    userId: log.user_id,
    userName: log.user_first_name && log.user_last_name
      ? `${log.user_first_name} ${log.user_last_name}`
      : null,
    userEmail: log.user_email,
    action: log.action,
    actionLabel: formatActionLabel(log.action),
    entityType: log.entity_type,
    entityId: log.entity_id,
    details: parsedDetails,
    clientId: log.client_id,
    tripId: log.trip_id,
    bookingId: log.booking_id,
    createdAt: log.created_at
  };
}

/**
 * Convert action to human-readable label
 */
function formatActionLabel(action) {
  const labels = {
    // Approval-related actions
    'create_approval_request': 'Created Approval Request',
    'approve_request': 'Approved Request',
    'deny_request': 'Denied Request',
    // User actions
    'create_user': 'Created User',
    'update_user': 'Updated User',
    'deactivate_user': 'Deactivated User',
    // Booking actions
    'create_booking': 'Created Booking',
    'update_booking': 'Updated Booking',
    'delete_booking': 'Deleted Booking',
    'update_commission_status': 'Updated Commission Status',
    // Trip actions
    'stage_change': 'Changed Trip Stage',
    // Task actions
    'create_task': 'Created Task',
    'complete_task': 'Completed Task',
    'update_task': 'Updated Task',
    'delete_task': 'Deleted Task',
    // Document actions
    'upload_document': 'Uploaded Document',
    // Settings actions
    'update_settings': 'Updated Agency Settings',
    'upload_logo': 'Uploaded Agency Logo',
    'delete_logo': 'Deleted Agency Logo',
    // Email template actions
    'create_email_template': 'Created Email Template',
    'update_email_template': 'Updated Email Template',
    'delete_email_template': 'Deleted Email Template'
  };

  return labels[action] || action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

module.exports = router;
