const express = require('express');
const { authenticate, tenantScope, authorize } = require('../middleware/auth');
const { getAtRiskPayments } = require('../services/paymentDeadlineService');

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

module.exports = router;
