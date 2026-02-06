const express = require('express');
const { getDb } = require('../config/database');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');

const router = express.Router();

// Apply authentication and tenant scope to all routes
router.use(authenticate);
router.use(tenantScope);

/**
 * GET /api/commissions
 * List all commission data for the agency
 * Accessible to admin and planner roles only
 * Marketing role cannot access financial/commission data per spec
 */
router.get('/', authorize('admin', 'planner'), (req, res) => {
  try {
    const db = getDb();
    const { status, startDate, endDate, bookingId } = req.query;

    let query = `
      SELECT
        b.id, b.confirmation_number, b.booking_type, b.supplier_name,
        b.commission_rate, b.commission_amount_expected, b.commission_status,
        b.commission_amount_received, b.commission_received_date,
        b.commission_payment_reference, b.commission_variance_note,
        b.total_cost, b.status as booking_status,
        t.id as trip_id, t.name as trip_name, t.destination,
        c.id as client_id, c.first_name as client_first_name, c.last_name as client_last_name
      FROM bookings b
      JOIN trips t ON b.trip_id = t.id
      JOIN clients c ON t.client_id = c.id
      WHERE b.agency_id = ?
    `;
    const params = [req.agencyId];

    // Filter by commission status
    if (status) {
      query += ' AND b.commission_status = ?';
      params.push(status);
    }

    // Filter by booking ID
    if (bookingId) {
      query += ' AND b.id = ?';
      params.push(bookingId);
    }

    // Filter by date range (based on booking created_at)
    if (startDate) {
      query += ' AND b.created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND b.created_at <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY b.created_at DESC';

    const commissions = db.prepare(query).all(...params);

    // Calculate totals
    const totals = commissions.reduce((acc, c) => {
      acc.totalExpected += c.commission_amount_expected || 0;
      acc.totalReceived += c.commission_amount_received || 0;
      return acc;
    }, { totalExpected: 0, totalReceived: 0 });

    res.json({
      commissions: commissions.map(c => ({
        id: c.id,
        confirmationNumber: c.confirmation_number,
        bookingType: c.booking_type,
        supplierName: c.supplier_name,
        commissionRate: c.commission_rate,
        commissionAmountExpected: c.commission_amount_expected,
        commissionStatus: c.commission_status,
        commissionAmountReceived: c.commission_amount_received,
        commissionReceivedDate: c.commission_received_date,
        commissionPaymentReference: c.commission_payment_reference,
        commissionVarianceNote: c.commission_variance_note,
        totalCost: c.total_cost,
        bookingStatus: c.booking_status,
        tripId: c.trip_id,
        tripName: c.trip_name,
        destination: c.destination,
        clientId: c.client_id,
        clientName: `${c.client_first_name} ${c.client_last_name}`
      })),
      totals: {
        totalExpected: totals.totalExpected,
        totalReceived: totals.totalReceived,
        outstanding: totals.totalExpected - totals.totalReceived
      },
      count: commissions.length
    });
  } catch (error) {
    console.error('[ERROR] List commissions failed:', error.message);
    res.status(500).json({ error: 'Failed to list commissions' });
  }
});

/**
 * GET /api/commissions/summary
 * Get commission summary statistics
 * Accessible to admin and planner roles only
 */
router.get('/summary', authorize('admin', 'planner'), (req, res) => {
  try {
    const db = getDb();

    const summary = db.prepare(`
      SELECT
        commission_status,
        COUNT(*) as count,
        SUM(commission_amount_expected) as total_expected,
        SUM(commission_amount_received) as total_received
      FROM bookings
      WHERE agency_id = ?
      GROUP BY commission_status
    `).all(req.agencyId);

    const overallTotals = db.prepare(`
      SELECT
        SUM(commission_amount_expected) as total_expected,
        SUM(commission_amount_received) as total_received,
        COUNT(*) as total_bookings
      FROM bookings
      WHERE agency_id = ?
    `).get(req.agencyId);

    res.json({
      byStatus: summary.map(s => ({
        status: s.commission_status,
        count: s.count,
        totalExpected: s.total_expected || 0,
        totalReceived: s.total_received || 0
      })),
      totals: {
        totalExpected: overallTotals.total_expected || 0,
        totalReceived: overallTotals.total_received || 0,
        outstanding: (overallTotals.total_expected || 0) - (overallTotals.total_received || 0),
        totalBookings: overallTotals.total_bookings || 0
      }
    });
  } catch (error) {
    console.error('[ERROR] Get commission summary failed:', error.message);
    res.status(500).json({ error: 'Failed to get commission summary' });
  }
});

/**
 * GET /api/commissions/variance
 * Commission variance report - shows expected vs actual amounts with variance indicators
 * Only includes bookings where commission has been received (paid status)
 * Accessible to admin and planner roles only
 */
router.get('/variance', authorize('admin', 'planner'), (req, res) => {
  try {
    const db = getDb();
    const { varianceType, minVariance, startDate, endDate } = req.query;

    // Query for bookings with commission data (both expected and received)
    let query = `
      SELECT
        b.id, b.confirmation_number, b.booking_type, b.supplier_name,
        b.commission_rate, b.commission_amount_expected, b.commission_status,
        b.commission_amount_received, b.commission_received_date,
        b.commission_payment_reference, b.commission_variance_note,
        b.total_cost, b.status as booking_status,
        t.id as trip_id, t.name as trip_name, t.destination,
        c.id as client_id, c.first_name as client_first_name, c.last_name as client_last_name,
        (b.commission_amount_received - b.commission_amount_expected) as variance_amount
      FROM bookings b
      JOIN trips t ON b.trip_id = t.id
      JOIN clients c ON t.client_id = c.id
      WHERE b.agency_id = ?
        AND b.commission_amount_expected IS NOT NULL
        AND b.commission_amount_received IS NOT NULL
    `;
    const params = [req.agencyId];

    // Filter by variance type (underpaid, overpaid, or all with variance)
    if (varianceType === 'underpaid') {
      query += ' AND b.commission_amount_received < b.commission_amount_expected';
    } else if (varianceType === 'overpaid') {
      query += ' AND b.commission_amount_received > b.commission_amount_expected';
    } else if (varianceType === 'any') {
      query += ' AND b.commission_amount_received != b.commission_amount_expected';
    }

    // Filter by minimum variance amount (absolute value)
    if (minVariance) {
      query += ' AND ABS(b.commission_amount_received - b.commission_amount_expected) >= ?';
      params.push(parseFloat(minVariance));
    }

    // Filter by date range (based on commission received date)
    if (startDate) {
      query += ' AND b.commission_received_date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND b.commission_received_date <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY ABS(b.commission_amount_received - b.commission_amount_expected) DESC';

    const commissions = db.prepare(query).all(...params);

    // Calculate totals
    const totals = commissions.reduce((acc, c) => {
      const expected = c.commission_amount_expected || 0;
      const received = c.commission_amount_received || 0;
      const variance = received - expected;

      acc.totalExpected += expected;
      acc.totalReceived += received;
      acc.totalVariance += variance;

      if (variance < 0) {
        acc.underpaidCount++;
        acc.underpaidAmount += Math.abs(variance);
      } else if (variance > 0) {
        acc.overpaidCount++;
        acc.overpaidAmount += variance;
      } else {
        acc.exactCount++;
      }

      return acc;
    }, {
      totalExpected: 0,
      totalReceived: 0,
      totalVariance: 0,
      underpaidCount: 0,
      underpaidAmount: 0,
      overpaidCount: 0,
      overpaidAmount: 0,
      exactCount: 0
    });

    res.json({
      commissions: commissions.map(c => {
        const variance = (c.commission_amount_received || 0) - (c.commission_amount_expected || 0);
        return {
          id: c.id,
          confirmationNumber: c.confirmation_number,
          bookingType: c.booking_type,
          supplierName: c.supplier_name,
          commissionRate: c.commission_rate,
          commissionAmountExpected: c.commission_amount_expected,
          commissionAmountReceived: c.commission_amount_received,
          varianceAmount: variance,
          varianceType: variance < 0 ? 'underpaid' : variance > 0 ? 'overpaid' : 'exact',
          variancePercent: c.commission_amount_expected ?
            ((variance / c.commission_amount_expected) * 100).toFixed(2) : 0,
          commissionReceivedDate: c.commission_received_date,
          commissionPaymentReference: c.commission_payment_reference,
          commissionVarianceNote: c.commission_variance_note,
          totalCost: c.total_cost,
          bookingStatus: c.booking_status,
          tripId: c.trip_id,
          tripName: c.trip_name,
          destination: c.destination,
          clientId: c.client_id,
          clientName: `${c.client_first_name} ${c.client_last_name}`
        };
      }),
      summary: {
        totalExpected: totals.totalExpected,
        totalReceived: totals.totalReceived,
        netVariance: totals.totalVariance,
        underpaidCount: totals.underpaidCount,
        underpaidAmount: totals.underpaidAmount,
        overpaidCount: totals.overpaidCount,
        overpaidAmount: totals.overpaidAmount,
        exactCount: totals.exactCount
      },
      count: commissions.length
    });
  } catch (error) {
    console.error('[ERROR] Get commission variance report failed:', error.message);
    res.status(500).json({ error: 'Failed to get commission variance report' });
  }
});

module.exports = router;
