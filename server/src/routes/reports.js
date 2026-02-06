const express = require('express');
const { getDb } = require('../config/database');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');

const router = express.Router();

// Apply authentication and tenant scope to all routes
router.use(authenticate);
router.use(tenantScope);

/**
 * GET /api/reports/bookings
 * Bookings report with date range filtering
 * Accessible to admin and planner roles only
 */
router.get('/bookings', authorize('admin', 'planner'), (req, res) => {
  try {
    const db = getDb();
    const { startDate, endDate } = req.query;

    let bookingsQuery = `
      SELECT
        b.id, b.booking_type, b.supplier_name, b.confirmation_number,
        b.total_cost, b.status, b.commission_amount_expected,
        b.created_at,
        t.id as trip_id, t.name as trip_name,
        c.first_name as client_first_name, c.last_name as client_last_name
      FROM bookings b
      JOIN trips t ON b.trip_id = t.id
      JOIN clients c ON t.client_id = c.id
      WHERE b.agency_id = ?
    `;
    const params = [req.agencyId];

    if (startDate) {
      bookingsQuery += ' AND b.created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      bookingsQuery += ' AND b.created_at <= ?';
      params.push(endDate + ' 23:59:59');
    }

    bookingsQuery += ' ORDER BY b.created_at DESC';

    const bookings = db.prepare(bookingsQuery).all(...params);

    // Calculate summary
    const summary = {
      totalBookings: bookings.length,
      totalValue: bookings.reduce((sum, b) => sum + (b.total_cost || 0), 0),
      avgValue: bookings.length > 0
        ? bookings.reduce((sum, b) => sum + (b.total_cost || 0), 0) / bookings.length
        : 0,
      totalCommission: bookings.reduce((sum, b) => sum + (b.commission_amount_expected || 0), 0)
    };

    // Group by type
    const byTypeMap = {};
    bookings.forEach(b => {
      if (!byTypeMap[b.booking_type]) {
        byTypeMap[b.booking_type] = {
          type: b.booking_type,
          count: 0,
          totalValue: 0,
          commissionExpected: 0
        };
      }
      byTypeMap[b.booking_type].count++;
      byTypeMap[b.booking_type].totalValue += b.total_cost || 0;
      byTypeMap[b.booking_type].commissionExpected += b.commission_amount_expected || 0;
    });

    res.json({
      summary,
      byType: Object.values(byTypeMap),
      bookings: bookings.map(b => ({
        id: b.id,
        bookingType: b.booking_type,
        supplierName: b.supplier_name,
        confirmationNumber: b.confirmation_number,
        totalCost: b.total_cost,
        status: b.status,
        commissionExpected: b.commission_amount_expected,
        createdAt: b.created_at,
        tripId: b.trip_id,
        tripName: b.trip_name,
        clientName: `${b.client_first_name} ${b.client_last_name}`
      })),
      dateRange: { startDate, endDate }
    });
  } catch (error) {
    console.error('[ERROR] Bookings report failed:', error.message);
    res.status(500).json({ error: 'Failed to generate bookings report' });
  }
});

/**
 * GET /api/reports/revenue
 * Revenue report with date range filtering
 * Accessible to admin and planner roles only
 */
router.get('/revenue', authorize('admin', 'planner'), (req, res) => {
  try {
    const db = getDb();
    const { startDate, endDate } = req.query;

    let revenueQuery = `
      SELECT
        b.id, b.total_cost, b.commission_amount_expected, b.commission_amount_received,
        b.commission_status, b.created_at,
        strftime('%Y-%m', b.created_at) as month
      FROM bookings b
      WHERE b.agency_id = ?
    `;
    const params = [req.agencyId];

    if (startDate) {
      revenueQuery += ' AND b.created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      revenueQuery += ' AND b.created_at <= ?';
      params.push(endDate + ' 23:59:59');
    }

    revenueQuery += ' ORDER BY b.created_at DESC';

    const bookings = db.prepare(revenueQuery).all(...params);

    // Calculate summary
    const summary = {
      totalRevenue: bookings.reduce((sum, b) => sum + (b.total_cost || 0), 0),
      commissionEarned: bookings
        .filter(b => b.commission_status === 'paid')
        .reduce((sum, b) => sum + (b.commission_amount_received || b.commission_amount_expected || 0), 0),
      commissionPending: bookings
        .filter(b => b.commission_status !== 'paid')
        .reduce((sum, b) => sum + (b.commission_amount_expected || 0), 0)
    };

    // Group by month
    const byMonthMap = {};
    bookings.forEach(b => {
      if (!byMonthMap[b.month]) {
        byMonthMap[b.month] = {
          month: b.month,
          bookingCount: 0,
          revenue: 0,
          commission: 0
        };
      }
      byMonthMap[b.month].bookingCount++;
      byMonthMap[b.month].revenue += b.total_cost || 0;
      byMonthMap[b.month].commission += b.commission_amount_expected || 0;
    });

    // Sort months chronologically
    const byMonth = Object.values(byMonthMap).sort((a, b) => a.month.localeCompare(b.month));

    res.json({
      summary,
      byMonth,
      dateRange: { startDate, endDate }
    });
  } catch (error) {
    console.error('[ERROR] Revenue report failed:', error.message);
    res.status(500).json({ error: 'Failed to generate revenue report' });
  }
});

/**
 * GET /api/reports/trips
 * Trips report with date range filtering
 * Accessible to admin and planner roles only
 */
router.get('/trips', authorize('admin', 'planner'), (req, res) => {
  try {
    const db = getDb();
    const { startDate, endDate } = req.query;

    let tripsQuery = `
      SELECT
        t.id, t.name, t.destination, t.stage, t.created_at,
        c.first_name as client_first_name, c.last_name as client_last_name
      FROM trips t
      JOIN clients c ON t.client_id = c.id
      WHERE t.agency_id = ?
    `;
    const params = [req.agencyId];

    if (startDate) {
      tripsQuery += ' AND t.created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      tripsQuery += ' AND t.created_at <= ?';
      params.push(endDate + ' 23:59:59');
    }

    tripsQuery += ' ORDER BY t.created_at DESC';

    const trips = db.prepare(tripsQuery).all(...params);

    // Calculate summary
    const summary = {
      totalTrips: trips.length,
      confirmedTrips: trips.filter(t => t.stage === 'booked' || t.stage === 'completed').length,
      inProgressTrips: trips.filter(t =>
        t.stage === 'inquiry' || t.stage === 'quoting' || t.stage === 'pending_approval'
      ).length
    };

    // Group by stage
    const byStageMap = {};
    trips.forEach(t => {
      if (!byStageMap[t.stage]) {
        byStageMap[t.stage] = {
          stage: t.stage,
          count: 0
        };
      }
      byStageMap[t.stage].count++;
    });

    // Calculate percentages
    const byStage = Object.values(byStageMap).map(s => ({
      ...s,
      percentage: trips.length > 0 ? ((s.count / trips.length) * 100).toFixed(1) : 0
    }));

    res.json({
      summary,
      byStage,
      trips: trips.map(t => ({
        id: t.id,
        name: t.name,
        destination: t.destination,
        stage: t.stage,
        createdAt: t.created_at,
        clientName: `${t.client_first_name} ${t.client_last_name}`
      })),
      dateRange: { startDate, endDate }
    });
  } catch (error) {
    console.error('[ERROR] Trips report failed:', error.message);
    res.status(500).json({ error: 'Failed to generate trips report' });
  }
});

/**
 * GET /api/reports/conversion
 * Trip conversion report - inquiry to booked conversion rates
 * Shows which trips converted from inquiry to booked stage vs stayed inquiry/canceled
 * Accessible to admin and planner roles only
 */
router.get('/conversion', authorize('admin', 'planner'), (req, res) => {
  try {
    const db = getDb();
    const { startDate, endDate } = req.query;

    // Get all trips created in the date range
    // Consider a trip "converted" if it has reached booked, final_payment_pending, traveling, or completed stages
    // Consider a trip "not converted" if it's still in inquiry, quoting, pending_approval, or was canceled
    let tripsQuery = `
      SELECT
        t.id, t.name, t.destination, t.stage, t.created_at, t.updated_at,
        c.first_name as client_first_name, c.last_name as client_last_name,
        strftime('%Y-%m', t.created_at) as month
      FROM trips t
      JOIN clients c ON t.client_id = c.id
      WHERE t.agency_id = ?
    `;
    const params = [req.agencyId];

    if (startDate) {
      tripsQuery += ' AND t.created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      tripsQuery += ' AND t.created_at <= ?';
      params.push(endDate + ' 23:59:59');
    }

    tripsQuery += ' ORDER BY t.created_at DESC';

    const trips = db.prepare(tripsQuery).all(...params);

    // Define which stages count as "converted" (reached booking)
    const convertedStages = ['booked', 'final_payment_pending', 'traveling', 'completed'];
    // Stages that are still in progress (may still convert)
    const inProgressStages = ['inquiry', 'quoting', 'pending_approval', 'quoted'];
    // Stages that are closed without converting
    const notConvertedStages = ['canceled', 'archived'];

    // Categorize trips
    const convertedTrips = trips.filter(t => convertedStages.includes(t.stage));
    const inProgressTrips = trips.filter(t => inProgressStages.includes(t.stage));
    const notConvertedTrips = trips.filter(t => notConvertedStages.includes(t.stage));

    // Calculate conversion rate (converted / (converted + not converted))
    // In-progress trips are excluded from the rate calculation since they haven't finalized
    const closedTrips = convertedTrips.length + notConvertedTrips.length;
    const conversionRate = closedTrips > 0
      ? ((convertedTrips.length / closedTrips) * 100).toFixed(1)
      : null;

    // Summary
    const summary = {
      totalTrips: trips.length,
      converted: convertedTrips.length,
      inProgress: inProgressTrips.length,
      notConverted: notConvertedTrips.length,
      conversionRate: conversionRate !== null ? parseFloat(conversionRate) : null,
      closedTrips
    };

    // Group by month for trend analysis
    const byMonthMap = {};
    trips.forEach(t => {
      if (!byMonthMap[t.month]) {
        byMonthMap[t.month] = {
          month: t.month,
          total: 0,
          converted: 0,
          inProgress: 0,
          notConverted: 0
        };
      }
      byMonthMap[t.month].total++;
      if (convertedStages.includes(t.stage)) {
        byMonthMap[t.month].converted++;
      } else if (inProgressStages.includes(t.stage)) {
        byMonthMap[t.month].inProgress++;
      } else {
        byMonthMap[t.month].notConverted++;
      }
    });

    // Calculate conversion rate per month and sort
    const byMonth = Object.values(byMonthMap)
      .map(m => {
        const closed = m.converted + m.notConverted;
        return {
          ...m,
          conversionRate: closed > 0
            ? parseFloat(((m.converted / closed) * 100).toFixed(1))
            : null
        };
      })
      .sort((a, b) => a.month.localeCompare(b.month));

    // Break down by stage
    const byStage = {};
    trips.forEach(t => {
      if (!byStage[t.stage]) {
        byStage[t.stage] = { stage: t.stage, count: 0 };
      }
      byStage[t.stage].count++;
    });

    res.json({
      summary,
      byMonth,
      byStage: Object.values(byStage),
      trips: trips.map(t => ({
        id: t.id,
        name: t.name,
        destination: t.destination,
        stage: t.stage,
        status: convertedStages.includes(t.stage) ? 'converted' :
                inProgressStages.includes(t.stage) ? 'in_progress' : 'not_converted',
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        clientName: `${t.client_first_name} ${t.client_last_name}`
      })),
      dateRange: { startDate, endDate }
    });
  } catch (error) {
    console.error('[ERROR] Conversion report failed:', error.message);
    res.status(500).json({ error: 'Failed to generate conversion report' });
  }
});

module.exports = router;
