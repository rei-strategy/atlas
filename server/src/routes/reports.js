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

/**
 * GET /api/reports/tasks
 * Task completion report - completion rates and timing
 * Shows task completion statistics, overdue tracking, and category breakdown
 * Accessible to admin and planner roles only
 */
router.get('/tasks', authorize('admin', 'planner'), (req, res) => {
  try {
    const db = getDb();
    const { startDate, endDate, category } = req.query;

    // Build query with filters
    let tasksQuery = `
      SELECT
        t.id, t.title, t.description, t.due_date, t.status, t.priority,
        t.category, t.is_system_generated, t.source_event,
        t.created_at, t.completed_at, t.updated_at,
        tr.id as trip_id, tr.name as trip_name,
        u.first_name as assigned_first_name, u.last_name as assigned_last_name
      FROM tasks t
      LEFT JOIN trips tr ON t.trip_id = tr.id
      LEFT JOIN users u ON t.assigned_user_id = u.id
      WHERE t.agency_id = ?
    `;
    const params = [req.agencyId];

    if (startDate) {
      tasksQuery += ' AND t.created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      tasksQuery += ' AND t.created_at <= ?';
      params.push(endDate + ' 23:59:59');
    }
    if (category && category !== 'all') {
      tasksQuery += ' AND t.category = ?';
      params.push(category);
    }

    tasksQuery += ' ORDER BY t.created_at DESC';

    const tasks = db.prepare(tasksQuery).all(...params);

    // Calculate statistics
    const today = new Date().toISOString().split('T')[0];

    // Categorize tasks
    const completedTasks = tasks.filter(t => t.status === 'completed');
    const openTasks = tasks.filter(t => t.status === 'open');
    const overdueTasks = tasks.filter(t =>
      (t.status === 'open' || t.status === 'overdue') && t.due_date < today
    );

    // Calculate average completion time for completed tasks (in days)
    let avgCompletionTime = null;
    const tasksWithCompletionTime = completedTasks.filter(t => t.completed_at && t.created_at);
    if (tasksWithCompletionTime.length > 0) {
      const totalDays = tasksWithCompletionTime.reduce((sum, t) => {
        const created = new Date(t.created_at);
        const completed = new Date(t.completed_at);
        const days = (completed - created) / (1000 * 60 * 60 * 24);
        return sum + days;
      }, 0);
      avgCompletionTime = parseFloat((totalDays / tasksWithCompletionTime.length).toFixed(1));
    }

    // Calculate completion rate
    const completionRate = tasks.length > 0
      ? parseFloat(((completedTasks.length / tasks.length) * 100).toFixed(1))
      : null;

    // Summary
    const summary = {
      totalTasks: tasks.length,
      completed: completedTasks.length,
      open: openTasks.length,
      overdue: overdueTasks.length,
      completionRate,
      avgCompletionTime
    };

    // Group by category
    const byCategoryMap = {};
    tasks.forEach(t => {
      const cat = t.category || 'internal';
      if (!byCategoryMap[cat]) {
        byCategoryMap[cat] = {
          category: cat,
          total: 0,
          completed: 0,
          open: 0,
          overdue: 0
        };
      }
      byCategoryMap[cat].total++;
      if (t.status === 'completed') {
        byCategoryMap[cat].completed++;
      } else {
        byCategoryMap[cat].open++;
        if (t.due_date < today) {
          byCategoryMap[cat].overdue++;
        }
      }
    });

    // Calculate completion rate per category
    const byCategory = Object.values(byCategoryMap).map(c => ({
      ...c,
      completionRate: c.total > 0
        ? parseFloat(((c.completed / c.total) * 100).toFixed(1))
        : null
    }));

    // Group by priority
    const byPriorityMap = {};
    tasks.forEach(t => {
      const pri = t.priority || 'normal';
      if (!byPriorityMap[pri]) {
        byPriorityMap[pri] = {
          priority: pri,
          total: 0,
          completed: 0,
          open: 0
        };
      }
      byPriorityMap[pri].total++;
      if (t.status === 'completed') {
        byPriorityMap[pri].completed++;
      } else {
        byPriorityMap[pri].open++;
      }
    });

    const byPriority = Object.values(byPriorityMap).map(p => ({
      ...p,
      completionRate: p.total > 0
        ? parseFloat(((p.completed / p.total) * 100).toFixed(1))
        : null
    }));

    // Get overdue tasks details
    const overdueDetails = overdueTasks.map(t => ({
      id: t.id,
      title: t.title,
      dueDate: t.due_date,
      daysOverdue: Math.floor((new Date(today) - new Date(t.due_date)) / (1000 * 60 * 60 * 24)),
      priority: t.priority,
      category: t.category,
      tripId: t.trip_id,
      tripName: t.trip_name,
      assignedTo: t.assigned_first_name && t.assigned_last_name
        ? `${t.assigned_first_name} ${t.assigned_last_name}`
        : null
    })).sort((a, b) => b.daysOverdue - a.daysOverdue);

    res.json({
      summary,
      byCategory,
      byPriority,
      overdueDetails,
      tasks: tasks.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        dueDate: t.due_date,
        status: t.status,
        priority: t.priority,
        category: t.category,
        isSystemGenerated: !!t.is_system_generated,
        sourceEvent: t.source_event,
        createdAt: t.created_at,
        completedAt: t.completed_at,
        tripId: t.trip_id,
        tripName: t.trip_name,
        assignedTo: t.assigned_first_name && t.assigned_last_name
          ? `${t.assigned_first_name} ${t.assigned_last_name}`
          : null
      })),
      dateRange: { startDate, endDate },
      categoryFilter: category || 'all'
    });
  } catch (error) {
    console.error('[ERROR] Task report failed:', error.message);
    res.status(500).json({ error: 'Failed to generate task report' });
  }
});

module.exports = router;
