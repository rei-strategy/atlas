const express = require('express');
const { getDb } = require('../config/database');
const { authenticate, tenantScope } = require('../middleware/auth');
const { checkUrgentPaymentDeadlines, getUrgentPaymentDeadlines } = require('../services/paymentDeadlineService');
const { checkImminentTravelReadiness, getImminentTripsWithIssues } = require('../services/travelReadinessService');

const router = express.Router();

// All notification routes require authentication and tenant scope
router.use(authenticate);
router.use(tenantScope);

/**
 * GET /api/notifications
 * Get all notifications for the current user
 * Also triggers a check for urgent payment deadlines
 */
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { unreadOnly, limit = 50 } = req.query;

    // Check for urgent payment deadlines and create notifications if needed
    // This ensures users always see up-to-date urgent notifications
    try {
      checkUrgentPaymentDeadlines(48);
    } catch (err) {
      console.error('[WARN] Payment deadline check failed during notification fetch:', err.message);
    }

    // Check for imminent travel with incomplete items
    try {
      checkImminentTravelReadiness(48);
    } catch (err) {
      console.error('[WARN] Travel readiness check failed during notification fetch:', err.message);
    }

    let query = `
      SELECT * FROM notifications
      WHERE agency_id = ? AND user_id = ? AND is_dismissed = 0
    `;
    const params = [req.agencyId, req.user.id];

    if (unreadOnly === 'true') {
      query += ` AND is_read = 0`;
    }

    // Exclude snoozed notifications
    query += ` AND (snoozed_until IS NULL OR snoozed_until <= datetime('now'))`;

    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(parseInt(limit, 10));

    const notifications = db.prepare(query).all(...params);

    // Get unread count
    const unreadCount = db.prepare(`
      SELECT COUNT(*) as count FROM notifications
      WHERE agency_id = ? AND user_id = ? AND is_read = 0 AND is_dismissed = 0
        AND (snoozed_until IS NULL OR snoozed_until <= datetime('now'))
    `).get(req.agencyId, req.user.id).count;

    // Get urgent count
    const urgentCount = db.prepare(`
      SELECT COUNT(*) as count FROM notifications
      WHERE agency_id = ? AND user_id = ? AND is_read = 0 AND is_dismissed = 0 AND type = 'urgent'
        AND (snoozed_until IS NULL OR snoozed_until <= datetime('now'))
    `).get(req.agencyId, req.user.id).count;

    res.json({
      notifications: notifications.map(n => formatNotification(n)),
      unreadCount,
      urgentCount,
      total: notifications.length
    });
  } catch (error) {
    console.error('[ERROR] List notifications failed:', error.message);
    res.status(500).json({ error: 'Failed to list notifications' });
  }
});

/**
 * PUT /api/notifications/:id/read
 * Mark a notification as read
 */
router.put('/:id/read', (req, res) => {
  try {
    const db = getDb();
    const notifId = req.params.id;

    const existing = db.prepare(
      'SELECT id FROM notifications WHERE id = ? AND agency_id = ? AND user_id = ?'
    ).get(notifId, req.agencyId, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(notifId);

    res.json({ message: 'Notification marked as read', id: notifId });
  } catch (error) {
    console.error('[ERROR] Mark notification read failed:', error.message);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

/**
 * PUT /api/notifications/read-all
 * Mark all notifications as read
 */
router.put('/read-all', (req, res) => {
  try {
    const db = getDb();

    const result = db.prepare(`
      UPDATE notifications SET is_read = 1
      WHERE agency_id = ? AND user_id = ? AND is_read = 0
    `).run(req.agencyId, req.user.id);

    res.json({
      message: 'All notifications marked as read',
      updated: result.changes
    });
  } catch (error) {
    console.error('[ERROR] Mark all notifications read failed:', error.message);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

/**
 * PUT /api/notifications/:id/dismiss
 * Dismiss a notification
 */
router.put('/:id/dismiss', (req, res) => {
  try {
    const db = getDb();
    const notifId = req.params.id;

    const existing = db.prepare(
      'SELECT id FROM notifications WHERE id = ? AND agency_id = ? AND user_id = ?'
    ).get(notifId, req.agencyId, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    db.prepare('UPDATE notifications SET is_dismissed = 1 WHERE id = ?').run(notifId);

    res.json({ message: 'Notification dismissed', id: notifId });
  } catch (error) {
    console.error('[ERROR] Dismiss notification failed:', error.message);
    res.status(500).json({ error: 'Failed to dismiss notification' });
  }
});

/**
 * PUT /api/notifications/:id/snooze
 * Snooze a notification until a specified time
 */
router.put('/:id/snooze', (req, res) => {
  try {
    const db = getDb();
    const notifId = req.params.id;
    const { snoozeUntil } = req.body;

    if (!snoozeUntil) {
      return res.status(400).json({ error: 'snoozeUntil is required' });
    }

    const existing = db.prepare(
      'SELECT id FROM notifications WHERE id = ? AND agency_id = ? AND user_id = ?'
    ).get(notifId, req.agencyId, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    db.prepare('UPDATE notifications SET snoozed_until = ? WHERE id = ?').run(snoozeUntil, notifId);

    res.json({ message: 'Notification snoozed', id: notifId, snoozedUntil: snoozeUntil });
  } catch (error) {
    console.error('[ERROR] Snooze notification failed:', error.message);
    res.status(500).json({ error: 'Failed to snooze notification' });
  }
});

/**
 * GET /api/notifications/urgent-payments
 * Get bookings with payments due within 48 hours
 */
router.get('/urgent-payments', (req, res) => {
  try {
    const { hours = 48 } = req.query;
    const hoursThreshold = parseInt(hours, 10) || 48;

    const urgentPayments = getUrgentPaymentDeadlines(req.agencyId, hoursThreshold);

    res.json({
      urgentPayments,
      count: urgentPayments.length,
      threshold: hoursThreshold
    });
  } catch (error) {
    console.error('[ERROR] Get urgent payments failed:', error.message);
    res.status(500).json({ error: 'Failed to get urgent payments' });
  }
});

/**
 * POST /api/notifications/check-payment-deadlines
 * Trigger a check for urgent payment deadlines and generate notifications
 * (Admin only)
 */
router.post('/check-payment-deadlines', (req, res) => {
  try {
    // Only admins can trigger the check
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { hours = 48 } = req.body;
    const hoursThreshold = parseInt(hours, 10) || 48;

    const result = checkUrgentPaymentDeadlines(hoursThreshold);

    res.json({
      message: 'Payment deadline check completed',
      ...result
    });
  } catch (error) {
    console.error('[ERROR] Check payment deadlines failed:', error.message);
    res.status(500).json({ error: 'Failed to check payment deadlines' });
  }
});

/**
 * GET /api/notifications/imminent-travel
 * Get trips with travel within specified hours that have incomplete items
 */
router.get('/imminent-travel', (req, res) => {
  try {
    const { hours = 48 } = req.query;
    const hoursThreshold = parseInt(hours, 10) || 48;

    const tripsWithIssues = getImminentTripsWithIssues(req.agencyId, hoursThreshold);

    res.json({
      tripsWithIssues,
      count: tripsWithIssues.length,
      threshold: hoursThreshold
    });
  } catch (error) {
    console.error('[ERROR] Get imminent travel issues failed:', error.message);
    res.status(500).json({ error: 'Failed to get imminent travel issues' });
  }
});

/**
 * POST /api/notifications/check-travel-readiness
 * Trigger a check for imminent travel with incomplete items and generate notifications
 * (Admin only)
 */
router.post('/check-travel-readiness', (req, res) => {
  try {
    // Only admins can trigger the check
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { hours = 48 } = req.body;
    const hoursThreshold = parseInt(hours, 10) || 48;

    const result = checkImminentTravelReadiness(hoursThreshold);

    res.json({
      message: 'Travel readiness check completed',
      ...result
    });
  } catch (error) {
    console.error('[ERROR] Check travel readiness failed:', error.message);
    res.status(500).json({ error: 'Failed to check travel readiness' });
  }
});

function formatNotification(n) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    entityType: n.entity_type,
    entityId: n.entity_id,
    eventKey: n.event_key,
    isRead: !!n.is_read,
    isDismissed: !!n.is_dismissed,
    snoozedUntil: n.snoozed_until,
    createdAt: n.created_at
  };
}

module.exports = router;
