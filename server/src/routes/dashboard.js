const express = require('express');
const { authenticate, tenantScope, authorize } = require('../middleware/auth');
const { getAtRiskPayments } = require('../services/paymentDeadlineService');
const { getDb } = require('../config/database');

const router = express.Router();

// Apply authentication and tenant scope to all routes
router.use(authenticate);
router.use(tenantScope);

/**
 * GET /api/dashboard/at-risk-payments
 * Get at-risk payments for the dashboard
 * Returns overdue payments and payments due within the next 7 days
 * Accessible to admin and planner roles only
 */
router.get('/at-risk-payments', authorize('admin', 'planner', 'planner_advisor'), (req, res) => {
  try {
    const daysAhead = parseInt(req.query.daysAhead) || 7;
    const result = getAtRiskPayments(req.agencyId, daysAhead);

    res.json(result);
  } catch (error) {
    console.error('[ERROR] Get at-risk payments failed:', error.message);
    res.status(500).json({ error: 'Failed to get at-risk payments' });
  }
});

/**
 * GET /api/dashboard/commission-pipeline
 * Get commission pipeline overview for the dashboard
 * Returns totals by status: expected, submitted, paid
 * Accessible to admin and planner roles only
 */
router.get('/commission-pipeline', authorize('admin', 'planner', 'planner_advisor'), (req, res) => {
  try {
    const db = getDb();

    // Get commission totals grouped by status
    const pipeline = db.prepare(`
      SELECT
        commission_status,
        COUNT(*) as booking_count,
        SUM(commission_amount_expected) as total_expected,
        SUM(COALESCE(commission_amount_received, 0)) as total_received
      FROM bookings
      WHERE agency_id = ?
        AND commission_amount_expected > 0
        AND status != 'canceled'
      GROUP BY commission_status
    `).all(req.agencyId);

    // Build pipeline object with all statuses
    const pipelineData = {
      expected: { count: 0, amount: 0 },
      submitted: { count: 0, amount: 0 },
      paid: { count: 0, amount: 0 }
    };

    pipeline.forEach(row => {
      if (pipelineData[row.commission_status]) {
        pipelineData[row.commission_status] = {
          count: row.booking_count,
          amount: row.total_expected || 0
        };
      }
    });

    // Calculate totals
    const totalBookings = pipelineData.expected.count + pipelineData.submitted.count + pipelineData.paid.count;
    const totalExpected = pipelineData.expected.amount + pipelineData.submitted.amount + pipelineData.paid.amount;

    // Get actual received amount for paid commissions
    const paidReceived = db.prepare(`
      SELECT SUM(COALESCE(commission_amount_received, commission_amount_expected)) as total
      FROM bookings
      WHERE agency_id = ?
        AND commission_status = 'paid'
        AND commission_amount_expected > 0
        AND status != 'canceled'
    `).get(req.agencyId);

    const totalReceived = paidReceived?.total || 0;
    const outstanding = totalExpected - totalReceived;

    res.json({
      pipeline: pipelineData,
      summary: {
        totalBookings,
        totalExpected,
        totalReceived,
        outstanding
      }
    });
  } catch (error) {
    console.error('[ERROR] Get commission pipeline failed:', error.message);
    res.status(500).json({ error: 'Failed to get commission pipeline' });
  }
});

/**
 * GET /api/dashboard/recent-items
 * Get recently accessed/updated clients and trips for quick access
 * Returns most recently updated items for quick navigation
 */
router.get('/recent-items', authorize('admin', 'planner', 'planner_advisor'), (req, res) => {
  try {
    const db = getDb();
    const limit = Math.min(10, parseInt(req.query.limit) || 5);

    // Get recent clients (by updated_at for recent activity)
    const recentClients = db.prepare(`
      SELECT
        id,
        first_name,
        last_name,
        email,
        city,
        updated_at
      FROM clients
      WHERE agency_id = ?
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(req.agencyId, limit);

    // Get recent trips (by updated_at for recent activity)
    const recentTrips = db.prepare(`
      SELECT
        t.id,
        t.name,
        t.destination,
        t.stage,
        t.updated_at,
        c.first_name as client_first_name,
        c.last_name as client_last_name
      FROM trips t
      LEFT JOIN clients c ON t.client_id = c.id
      WHERE t.agency_id = ?
      ORDER BY t.updated_at DESC
      LIMIT ?
    `).all(req.agencyId, limit);

    // Format the response
    const clients = recentClients.map(c => ({
      id: c.id,
      type: 'client',
      name: `${c.first_name} ${c.last_name}`,
      email: c.email,
      city: c.city,
      updatedAt: c.updated_at
    }));

    const trips = recentTrips.map(t => ({
      id: t.id,
      type: 'trip',
      name: t.name,
      destination: t.destination,
      stage: t.stage,
      clientName: t.client_first_name && t.client_last_name
        ? `${t.client_first_name} ${t.client_last_name}`
        : null,
      updatedAt: t.updated_at
    }));

    res.json({
      clients,
      trips
    });
  } catch (error) {
    console.error('[ERROR] Get recent items failed:', error.message);
    res.status(500).json({ error: 'Failed to get recent items' });
  }
});

module.exports = router;
