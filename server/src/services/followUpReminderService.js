/**
 * Follow-Up Reminder Service
 * Generates normal-priority notifications for follow-ups and reminders
 *
 * Normal priority scenarios:
 * - Quote follow-up (trip in "quoted" stage for > 3 days)
 * - Client birthday/anniversary reminders
 * - Upcoming tasks (tasks due within 7 days)
 * - Post-trip feedback reminder (trip completed but no feedback)
 * - Commission follow-up (trip completed > 30 days, commission still "expected")
 */

const { getDb } = require('../config/database');
const { createNotification, generateEventKey } = require('./notificationService');

/**
 * Check for quotes that need follow-up (in quoted stage for > 3 days)
 * Creates normal-priority notifications for the assigned planner
 *
 * @param {number} [daysThreshold=3] - Days in quoted stage before follow-up
 * @returns {Object} - { checked: number, notificationsCreated: number }
 */
function checkQuoteFollowUps(daysThreshold = 3) {
  const db = getDb();

  // Calculate the threshold date
  const now = new Date();
  const threshold = new Date(now.getTime() - daysThreshold * 24 * 60 * 60 * 1000);
  const thresholdStr = threshold.toISOString().split('T')[0];
  const todayStr = now.toISOString().split('T')[0];

  console.log(`[FOLLOW_UP] Checking for quotes in quoted stage since before ${thresholdStr}`);

  // Find trips in "quoted" stage that haven't been updated in X days
  const staleQuotes = db.prepare(`
    SELECT
      t.id as trip_id,
      t.agency_id,
      t.name as trip_name,
      t.destination,
      t.updated_at,
      t.assigned_user_id,
      c.first_name || ' ' || c.last_name as client_name,
      c.email as client_email,
      c.phone as client_phone
    FROM trips t
    LEFT JOIN clients c ON t.client_id = c.id
    WHERE t.stage = 'quoted'
      AND t.updated_at < ?
  `).all(thresholdStr);

  console.log(`[FOLLOW_UP] Found ${staleQuotes.length} quotes needing follow-up`);

  let notificationsCreated = 0;

  for (const trip of staleQuotes) {
    // Notify the assigned planner
    if (!trip.assigned_user_id) continue;

    const daysSinceUpdate = Math.ceil((now - new Date(trip.updated_at)) / (1000 * 60 * 60 * 24));

    const title = 'Follow-up Reminder: Quote Pending';
    const message = `Trip "${trip.trip_name}"${trip.client_name ? ` for ${trip.client_name}` : ''}${trip.destination ? ` to ${trip.destination}` : ''} has been in "quoted" stage for ${daysSinceUpdate} days. Consider following up with the client.${trip.client_email ? ` Email: ${trip.client_email}` : ''}${trip.client_phone ? ` Phone: ${trip.client_phone}` : ''}`;

    // Use event key for deduplication (one notification per trip per day per user)
    const eventKey = generateEventKey(
      'quote_followup',
      'trip',
      trip.trip_id,
      `${todayStr}:user:${trip.assigned_user_id}`
    );

    const result = createNotification({
      agencyId: trip.agency_id,
      userId: trip.assigned_user_id,
      type: 'normal',
      title,
      message,
      entityType: 'trip',
      entityId: trip.trip_id,
      eventKey
    });

    if (result.created) {
      notificationsCreated++;
      console.log(`[FOLLOW_UP] Created quote follow-up notification for user ${trip.assigned_user_id}, trip ${trip.trip_id}`);
    }
  }

  return {
    checked: staleQuotes.length,
    notificationsCreated
  };
}

/**
 * Check for upcoming tasks and create reminder notifications
 *
 * @param {number} [daysAhead=7] - Days ahead to look for tasks
 * @returns {Object} - { checked: number, notificationsCreated: number }
 */
function checkUpcomingTaskReminders(daysAhead = 7) {
  const db = getDb();

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  const futureStr = futureDate.toISOString().split('T')[0];

  console.log(`[FOLLOW_UP] Checking for tasks due between ${todayStr} and ${futureStr}`);

  // Find open tasks due within the threshold
  const upcomingTasks = db.prepare(`
    SELECT
      tk.id as task_id,
      tk.agency_id,
      tk.trip_id,
      tk.assigned_user_id,
      tk.title as task_title,
      tk.due_date,
      tk.priority,
      t.name as trip_name
    FROM tasks tk
    LEFT JOIN trips t ON tk.trip_id = t.id
    WHERE tk.status = 'open'
      AND tk.due_date >= ?
      AND tk.due_date <= ?
      AND tk.priority = 'normal'
  `).all(todayStr, futureStr);

  console.log(`[FOLLOW_UP] Found ${upcomingTasks.length} upcoming tasks`);

  let notificationsCreated = 0;

  for (const task of upcomingTasks) {
    if (!task.assigned_user_id) continue;

    const dueDate = new Date(task.due_date);
    const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

    const title = 'Task Reminder';
    const message = `Task "${task.task_title}"${task.trip_name ? ` for trip "${task.trip_name}"` : ''} is due ${daysUntilDue === 0 ? 'today' : daysUntilDue === 1 ? 'tomorrow' : `in ${daysUntilDue} days`} (${task.due_date}).`;

    // Use event key for deduplication
    const eventKey = generateEventKey(
      'task_reminder',
      'task',
      task.task_id,
      `${todayStr}:user:${task.assigned_user_id}`
    );

    const result = createNotification({
      agencyId: task.agency_id,
      userId: task.assigned_user_id,
      type: 'normal',
      title,
      message,
      entityType: 'task',
      entityId: task.task_id,
      eventKey
    });

    if (result.created) {
      notificationsCreated++;
      console.log(`[FOLLOW_UP] Created task reminder for user ${task.assigned_user_id}, task ${task.task_id}`);
    }
  }

  return {
    checked: upcomingTasks.length,
    notificationsCreated
  };
}

/**
 * Check for completed trips that need feedback follow-up
 * (completed > 7 days ago but no feedback received)
 *
 * @param {number} [daysAfterCompletion=7] - Days after completion before reminder
 * @returns {Object} - { checked: number, notificationsCreated: number }
 */
function checkFeedbackReminders(daysAfterCompletion = 7) {
  const db = getDb();

  const now = new Date();
  const threshold = new Date(now.getTime() - daysAfterCompletion * 24 * 60 * 60 * 1000);
  const thresholdStr = threshold.toISOString().split('T')[0];
  const todayStr = now.toISOString().split('T')[0];

  console.log(`[FOLLOW_UP] Checking for completed trips without feedback completed before ${thresholdStr}`);

  // Find completed trips without feedback (check trip_feedback table)
  const tripsNeedingFeedback = db.prepare(`
    SELECT
      t.id as trip_id,
      t.agency_id,
      t.name as trip_name,
      t.destination,
      t.assigned_user_id,
      t.updated_at,
      c.first_name || ' ' || c.last_name as client_name
    FROM trips t
    LEFT JOIN clients c ON t.client_id = c.id
    LEFT JOIN trip_feedback f ON t.id = f.trip_id
    WHERE t.stage = 'completed'
      AND t.updated_at < ?
      AND f.id IS NULL
  `).all(thresholdStr);

  console.log(`[FOLLOW_UP] Found ${tripsNeedingFeedback.length} trips needing feedback follow-up`);

  let notificationsCreated = 0;

  for (const trip of tripsNeedingFeedback) {
    if (!trip.assigned_user_id) continue;

    const daysSinceCompletion = Math.ceil((now - new Date(trip.updated_at)) / (1000 * 60 * 60 * 24));

    const title = 'Feedback Reminder';
    const message = `Trip "${trip.trip_name}"${trip.client_name ? ` for ${trip.client_name}` : ''} was completed ${daysSinceCompletion} days ago. Consider reaching out to request client feedback.`;

    const eventKey = generateEventKey(
      'feedback_reminder',
      'trip',
      trip.trip_id,
      `${todayStr}:user:${trip.assigned_user_id}`
    );

    const result = createNotification({
      agencyId: trip.agency_id,
      userId: trip.assigned_user_id,
      type: 'normal',
      title,
      message,
      entityType: 'trip',
      entityId: trip.trip_id,
      eventKey
    });

    if (result.created) {
      notificationsCreated++;
      console.log(`[FOLLOW_UP] Created feedback reminder for user ${trip.assigned_user_id}, trip ${trip.trip_id}`);
    }
  }

  return {
    checked: tripsNeedingFeedback.length,
    notificationsCreated
  };
}

/**
 * Check for commissions that need follow-up
 * (trip completed > 30 days, commission still "expected")
 *
 * @param {number} [daysAfterCompletion=30] - Days after trip completion before reminder
 * @returns {Object} - { checked: number, notificationsCreated: number }
 */
function checkCommissionFollowUps(daysAfterCompletion = 30) {
  const db = getDb();

  const now = new Date();
  const threshold = new Date(now.getTime() - daysAfterCompletion * 24 * 60 * 60 * 1000);
  const thresholdStr = threshold.toISOString().split('T')[0];
  const todayStr = now.toISOString().split('T')[0];

  console.log(`[FOLLOW_UP] Checking for commission follow-ups (completed before ${thresholdStr})`);

  // Find bookings with expected commissions for completed trips
  const bookingsNeedingFollowUp = db.prepare(`
    SELECT
      b.id as booking_id,
      b.trip_id,
      b.agency_id,
      b.supplier_name,
      b.commission_amount_expected,
      t.name as trip_name,
      t.assigned_user_id,
      t.updated_at,
      c.first_name || ' ' || c.last_name as client_name
    FROM bookings b
    JOIN trips t ON b.trip_id = t.id
    LEFT JOIN clients c ON t.client_id = c.id
    WHERE t.stage = 'completed'
      AND t.updated_at < ?
      AND b.commission_status = 'expected'
      AND b.commission_amount_expected > 0
      AND b.status != 'canceled'
  `).all(thresholdStr);

  console.log(`[FOLLOW_UP] Found ${bookingsNeedingFollowUp.length} bookings needing commission follow-up`);

  let notificationsCreated = 0;

  // Group by trip to avoid multiple notifications per trip
  const tripGroups = {};
  for (const booking of bookingsNeedingFollowUp) {
    if (!tripGroups[booking.trip_id]) {
      tripGroups[booking.trip_id] = {
        ...booking,
        totalExpected: 0,
        suppliers: []
      };
    }
    tripGroups[booking.trip_id].totalExpected += booking.commission_amount_expected;
    tripGroups[booking.trip_id].suppliers.push(booking.supplier_name || 'Unknown supplier');
  }

  for (const tripId in tripGroups) {
    const group = tripGroups[tripId];
    if (!group.assigned_user_id) continue;

    const daysSinceCompletion = Math.ceil((now - new Date(group.updated_at)) / (1000 * 60 * 60 * 24));

    const title = 'Commission Follow-up Reminder';
    const message = `Trip "${group.trip_name}"${group.client_name ? ` for ${group.client_name}` : ''} was completed ${daysSinceCompletion} days ago. $${group.totalExpected.toFixed(2)} in commission is still pending from: ${group.suppliers.join(', ')}. Consider submitting commission requests.`;

    const eventKey = generateEventKey(
      'commission_followup',
      'trip',
      tripId,
      `${todayStr}:user:${group.assigned_user_id}`
    );

    const result = createNotification({
      agencyId: group.agency_id,
      userId: group.assigned_user_id,
      type: 'normal',
      title,
      message,
      entityType: 'trip',
      entityId: parseInt(tripId),
      eventKey
    });

    if (result.created) {
      notificationsCreated++;
      console.log(`[FOLLOW_UP] Created commission follow-up for user ${group.assigned_user_id}, trip ${tripId}`);
    }
  }

  return {
    checked: bookingsNeedingFollowUp.length,
    notificationsCreated
  };
}

/**
 * Run all follow-up checks and create appropriate notifications
 *
 * @returns {Object} - Summary of all checks and notifications created
 */
function checkAllFollowUps() {
  console.log('[FOLLOW_UP] Starting follow-up check for all agencies...');

  const quoteResult = checkQuoteFollowUps(3);
  const taskResult = checkUpcomingTaskReminders(7);
  const feedbackResult = checkFeedbackReminders(7);
  const commissionResult = checkCommissionFollowUps(30);

  const summary = {
    quoteFollowUps: quoteResult,
    taskReminders: taskResult,
    feedbackReminders: feedbackResult,
    commissionFollowUps: commissionResult,
    totalNotificationsCreated: quoteResult.notificationsCreated + taskResult.notificationsCreated +
      feedbackResult.notificationsCreated + commissionResult.notificationsCreated
  };

  console.log(`[FOLLOW_UP] Complete. Total notifications created: ${summary.totalNotificationsCreated}`);

  return summary;
}

/**
 * Get follow-up items for a specific agency
 *
 * @param {number} agencyId - Agency ID
 * @returns {Object} - { quotes: [], tasks: [], feedbackNeeded: [], commissionsNeeded: [] }
 */
function getFollowUpItems(agencyId) {
  const db = getDb();
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // Get stale quotes (quoted > 3 days)
  const quotesThreshold = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const quotes = db.prepare(`
    SELECT
      t.id as tripId,
      t.name as tripName,
      t.destination,
      t.updated_at as lastUpdated,
      c.first_name || ' ' || c.last_name as clientName
    FROM trips t
    LEFT JOIN clients c ON t.client_id = c.id
    WHERE t.agency_id = ?
      AND t.stage = 'quoted'
      AND t.updated_at < ?
    ORDER BY t.updated_at ASC
  `).all(agencyId, quotesThreshold.toISOString().split('T')[0]);

  // Get upcoming tasks (7 days)
  const futureDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const tasks = db.prepare(`
    SELECT
      tk.id as taskId,
      tk.title,
      tk.due_date as dueDate,
      tk.priority,
      t.name as tripName
    FROM tasks tk
    LEFT JOIN trips t ON tk.trip_id = t.id
    WHERE tk.agency_id = ?
      AND tk.status = 'open'
      AND tk.due_date >= ?
      AND tk.due_date <= ?
    ORDER BY tk.due_date ASC
  `).all(agencyId, todayStr, futureDate.toISOString().split('T')[0]);

  // Get trips needing feedback
  const feedbackThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const feedbackNeeded = db.prepare(`
    SELECT
      t.id as tripId,
      t.name as tripName,
      t.updated_at as completedAt,
      c.first_name || ' ' || c.last_name as clientName
    FROM trips t
    LEFT JOIN clients c ON t.client_id = c.id
    LEFT JOIN trip_feedback f ON t.id = f.trip_id
    WHERE t.agency_id = ?
      AND t.stage = 'completed'
      AND t.updated_at < ?
      AND f.id IS NULL
    ORDER BY t.updated_at ASC
  `).all(agencyId, feedbackThreshold.toISOString().split('T')[0]);

  // Get commissions needing follow-up
  const commissionThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const commissionsNeeded = db.prepare(`
    SELECT
      b.id as bookingId,
      b.supplier_name as supplierName,
      b.commission_amount_expected as expectedAmount,
      t.id as tripId,
      t.name as tripName,
      c.first_name || ' ' || c.last_name as clientName
    FROM bookings b
    JOIN trips t ON b.trip_id = t.id
    LEFT JOIN clients c ON t.client_id = c.id
    WHERE t.agency_id = ?
      AND t.stage = 'completed'
      AND t.updated_at < ?
      AND b.commission_status = 'expected'
      AND b.commission_amount_expected > 0
      AND b.status != 'canceled'
    ORDER BY b.commission_amount_expected DESC
  `).all(agencyId, commissionThreshold.toISOString().split('T')[0]);

  return {
    quotes,
    tasks,
    feedbackNeeded,
    commissionsNeeded,
    totals: {
      quotes: quotes.length,
      tasks: tasks.length,
      feedbackNeeded: feedbackNeeded.length,
      commissionsNeeded: commissionsNeeded.length
    }
  };
}

module.exports = {
  checkQuoteFollowUps,
  checkUpcomingTaskReminders,
  checkFeedbackReminders,
  checkCommissionFollowUps,
  checkAllFollowUps,
  getFollowUpItems
};
