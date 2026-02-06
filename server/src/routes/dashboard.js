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

/**
 * GET /api/dashboard/planner-performance
 * Get performance metrics per planner (ADMIN ONLY)
 * Returns trip counts, conversion rates, and revenue per planner
 */
router.get('/planner-performance', authorize('admin'), (req, res) => {
  try {
    const db = getDb();

    // Get all planners in this agency
    const planners = db.prepare(`
      SELECT id, first_name, last_name, email, role
      FROM users
      WHERE agency_id = ?
        AND role IN ('admin', 'planner', 'planner_advisor')
      ORDER BY last_name, first_name
    `).all(req.agencyId);

    // Get trip counts by stage per planner
    const tripStats = db.prepare(`
      SELECT
        assigned_user_id,
        stage,
        COUNT(*) as count
      FROM trips
      WHERE agency_id = ?
        AND assigned_user_id IS NOT NULL
      GROUP BY assigned_user_id, stage
    `).all(req.agencyId);

    // Get booking revenue per planner
    const revenueStats = db.prepare(`
      SELECT
        t.assigned_user_id,
        SUM(b.total_cost) as total_revenue,
        SUM(b.commission_amount_expected) as total_commission
      FROM bookings b
      JOIN trips t ON b.trip_id = t.id
      WHERE t.agency_id = ?
        AND t.assigned_user_id IS NOT NULL
        AND b.status != 'canceled'
      GROUP BY t.assigned_user_id
    `).all(req.agencyId);

    // Build performance data per planner
    const performance = planners.map(planner => {
      // Get trips for this planner
      const plannerTrips = tripStats.filter(s => s.assigned_user_id === planner.id);

      // Calculate stage counts
      const stageCounts = {
        inquiry: 0,
        quoted: 0,
        booked: 0,
        final_payment_pending: 0,
        traveling: 0,
        completed: 0,
        canceled: 0,
        archived: 0
      };

      plannerTrips.forEach(s => {
        if (stageCounts.hasOwnProperty(s.stage)) {
          stageCounts[s.stage] = s.count;
        }
      });

      // Calculate totals
      const totalTrips = Object.values(stageCounts).reduce((a, b) => a + b, 0);
      const activeTrips = stageCounts.inquiry + stageCounts.quoted + stageCounts.booked +
                          stageCounts.final_payment_pending + stageCounts.traveling;
      const completedTrips = stageCounts.completed;

      // Conversion rate: completed trips / (completed + canceled)
      const totalClosed = completedTrips + stageCounts.canceled;
      const conversionRate = totalClosed > 0 ? (completedTrips / totalClosed) * 100 : null;

      // Revenue for this planner
      const plannerRevenue = revenueStats.find(r => r.assigned_user_id === planner.id);

      return {
        id: planner.id,
        name: `${planner.first_name} ${planner.last_name}`,
        email: planner.email,
        role: planner.role,
        trips: {
          total: totalTrips,
          active: activeTrips,
          completed: completedTrips,
          canceled: stageCounts.canceled,
          byStage: stageCounts
        },
        conversionRate: conversionRate !== null ? Math.round(conversionRate * 10) / 10 : null,
        revenue: {
          total: plannerRevenue?.total_revenue || 0,
          commission: plannerRevenue?.total_commission || 0
        }
      };
    });

    // Calculate agency-wide totals
    const agencyTotals = {
      totalTrips: performance.reduce((sum, p) => sum + p.trips.total, 0),
      activeTrips: performance.reduce((sum, p) => sum + p.trips.active, 0),
      completedTrips: performance.reduce((sum, p) => sum + p.trips.completed, 0),
      canceledTrips: performance.reduce((sum, p) => sum + p.trips.canceled, 0),
      totalRevenue: performance.reduce((sum, p) => sum + p.revenue.total, 0),
      totalCommission: performance.reduce((sum, p) => sum + p.revenue.commission, 0)
    };

    const agencyConversion = (agencyTotals.completedTrips + agencyTotals.canceledTrips) > 0
      ? (agencyTotals.completedTrips / (agencyTotals.completedTrips + agencyTotals.canceledTrips)) * 100
      : null;
    agencyTotals.conversionRate = agencyConversion !== null ? Math.round(agencyConversion * 10) / 10 : null;

    res.json({
      planners: performance,
      totals: agencyTotals
    });
  } catch (error) {
    console.error('[ERROR] Get planner performance failed:', error.message);
    res.status(500).json({ error: 'Failed to get planner performance' });
  }
});

module.exports = router;
