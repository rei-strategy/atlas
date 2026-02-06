/**
 * Deadline Task Service
 * Automatically generates tasks for approaching deadlines (final payment, travel dates, etc.)
 */

const { getDb } = require('../config/database');

/**
 * Check for trips with final payment deadlines approaching
 * and create reminder tasks
 *
 * @param {number} daysThreshold - Days before deadline to create task (default: 7)
 * @returns {Object} - { checked: number, tasksCreated: number }
 */
function checkFinalPaymentDeadlines(daysThreshold = 7) {
  const db = getDb();

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const thresholdDate = new Date(now.getTime() + daysThreshold * 24 * 60 * 60 * 1000);
  const thresholdStr = thresholdDate.toISOString().split('T')[0];

  console.log(`[DEADLINE_TASKS] Checking for final payment deadlines between ${todayStr} and ${thresholdStr}`);

  // Find trips with final_payment_deadline approaching that don't have open payment tasks
  const tripsWithDeadlines = db.prepare(`
    SELECT t.id as trip_id, t.agency_id, t.name as trip_name, t.final_payment_deadline,
           t.assigned_user_id, c.first_name || ' ' || c.last_name as client_name
    FROM trips t
    LEFT JOIN clients c ON t.client_id = c.id
    WHERE t.final_payment_deadline IS NOT NULL
      AND t.final_payment_deadline >= ?
      AND t.final_payment_deadline <= ?
      AND t.stage NOT IN ('canceled', 'archived', 'completed')
      AND NOT EXISTS (
        SELECT 1 FROM tasks
        WHERE trip_id = t.id
          AND is_system_generated = 1
          AND source_event = 'final_payment_deadline'
          AND status = 'open'
      )
  `).all(todayStr, thresholdStr);

  console.log(`[DEADLINE_TASKS] Found ${tripsWithDeadlines.length} trips with approaching final payment deadlines`);

  let tasksCreated = 0;

  for (const trip of tripsWithDeadlines) {
    const deadlineDate = new Date(trip.final_payment_deadline);
    const daysUntil = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));

    // Due date is 2 days before the deadline (or today if less than 2 days)
    const dueDate = new Date(deadlineDate.getTime() - 2 * 24 * 60 * 60 * 1000);
    const dueDateStr = dueDate < now
      ? todayStr
      : dueDate.toISOString().split('T')[0];

    db.prepare(`
      INSERT INTO tasks (agency_id, trip_id, assigned_user_id, title, description, due_date, status, priority, category, is_system_generated, source_event)
      VALUES (?, ?, ?, ?, ?, ?, 'open', ?, 'payment', 1, 'final_payment_deadline')
    `).run(
      trip.agency_id,
      trip.trip_id,
      trip.assigned_user_id,
      `Final payment due for ${trip.trip_name}`,
      `Final payment deadline for trip "${trip.trip_name}"${trip.client_name ? ` (${trip.client_name})` : ''} is ${trip.final_payment_deadline}. Please ensure payment is collected.`,
      dueDateStr,
      daysUntil <= 3 ? 'urgent' : 'normal'
    );

    tasksCreated++;
    console.log(`[DEADLINE_TASKS] Created final payment task for trip ${trip.trip_id}, due ${dueDateStr}`);
  }

  return { checked: tripsWithDeadlines.length, tasksCreated };
}

/**
 * Check for trips with travel dates approaching
 * and create pre-travel checklist tasks
 *
 * @param {number} daysThreshold - Days before travel to create task (default: 3)
 * @returns {Object} - { checked: number, tasksCreated: number }
 */
function checkTravelDateDeadlines(daysThreshold = 3) {
  const db = getDb();

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const thresholdDate = new Date(now.getTime() + daysThreshold * 24 * 60 * 60 * 1000);
  const thresholdStr = thresholdDate.toISOString().split('T')[0];

  console.log(`[DEADLINE_TASKS] Checking for travel dates between ${todayStr} and ${thresholdStr}`);

  // Find trips with travel_start_date approaching that don't have pre-travel tasks
  const tripsWithTravel = db.prepare(`
    SELECT t.id as trip_id, t.agency_id, t.name as trip_name, t.travel_start_date,
           t.assigned_user_id, c.first_name || ' ' || c.last_name as client_name
    FROM trips t
    LEFT JOIN clients c ON t.client_id = c.id
    WHERE t.travel_start_date IS NOT NULL
      AND t.travel_start_date >= ?
      AND t.travel_start_date <= ?
      AND t.stage NOT IN ('canceled', 'archived', 'completed', 'traveling')
      AND NOT EXISTS (
        SELECT 1 FROM tasks
        WHERE trip_id = t.id
          AND is_system_generated = 1
          AND source_event = 'pre_travel_checklist'
          AND status = 'open'
      )
  `).all(todayStr, thresholdStr);

  console.log(`[DEADLINE_TASKS] Found ${tripsWithTravel.length} trips with approaching travel dates`);

  let tasksCreated = 0;

  for (const trip of tripsWithTravel) {
    const travelDate = new Date(trip.travel_start_date);
    const daysUntil = Math.ceil((travelDate - now) / (1000 * 60 * 60 * 24));

    // Due date is 1 day before travel (or today if already within 1 day)
    const dueDate = new Date(travelDate.getTime() - 1 * 24 * 60 * 60 * 1000);
    const dueDateStr = dueDate < now
      ? todayStr
      : dueDate.toISOString().split('T')[0];

    db.prepare(`
      INSERT INTO tasks (agency_id, trip_id, assigned_user_id, title, description, due_date, status, priority, category, is_system_generated, source_event)
      VALUES (?, ?, ?, ?, ?, ?, 'open', ?, 'internal', 1, 'pre_travel_checklist')
    `).run(
      trip.agency_id,
      trip.trip_id,
      trip.assigned_user_id,
      `Pre-travel checklist for ${trip.trip_name}`,
      `Travel for "${trip.trip_name}"${trip.client_name ? ` (${trip.client_name})` : ''} begins ${trip.travel_start_date}. Verify all documents sent, bookings confirmed, and client prepared.`,
      dueDateStr,
      daysUntil <= 1 ? 'urgent' : 'normal'
    );

    tasksCreated++;
    console.log(`[DEADLINE_TASKS] Created pre-travel task for trip ${trip.trip_id}, due ${dueDateStr}`);
  }

  return { checked: tripsWithTravel.length, tasksCreated };
}

/**
 * Check for bookings with payment due dates approaching
 * and create payment reminder tasks
 *
 * @param {number} daysThreshold - Days before due date to create task (default: 7)
 * @returns {Object} - { checked: number, tasksCreated: number }
 */
function checkBookingPaymentDeadlines(daysThreshold = 7) {
  const db = getDb();

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const thresholdDate = new Date(now.getTime() + daysThreshold * 24 * 60 * 60 * 1000);
  const thresholdStr = thresholdDate.toISOString().split('T')[0];

  console.log(`[DEADLINE_TASKS] Checking for booking payment deadlines between ${todayStr} and ${thresholdStr}`);

  // Find bookings with final_payment_due_date approaching that don't have tasks
  const bookingsWithDeadlines = db.prepare(`
    SELECT b.id as booking_id, b.trip_id, b.agency_id, b.supplier_name, b.final_payment_due_date,
           b.final_payment_amount, t.name as trip_name, t.assigned_user_id,
           c.first_name || ' ' || c.last_name as client_name
    FROM bookings b
    JOIN trips t ON b.trip_id = t.id
    LEFT JOIN clients c ON t.client_id = c.id
    WHERE b.final_payment_due_date IS NOT NULL
      AND b.final_payment_due_date >= ?
      AND b.final_payment_due_date <= ?
      AND b.payment_status != 'paid_in_full'
      AND b.status != 'canceled'
      AND NOT EXISTS (
        SELECT 1 FROM tasks
        WHERE trip_id = b.trip_id
          AND is_system_generated = 1
          AND source_event = 'booking_payment_deadline:' || b.id
          AND status = 'open'
      )
  `).all(todayStr, thresholdStr);

  console.log(`[DEADLINE_TASKS] Found ${bookingsWithDeadlines.length} bookings with approaching payment deadlines`);

  let tasksCreated = 0;

  for (const booking of bookingsWithDeadlines) {
    const deadlineDate = new Date(booking.final_payment_due_date);
    const daysUntil = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));

    // Due date is 2 days before the deadline (or today if less than 2 days)
    const dueDate = new Date(deadlineDate.getTime() - 2 * 24 * 60 * 60 * 1000);
    const dueDateStr = dueDate < now
      ? todayStr
      : dueDate.toISOString().split('T')[0];

    const amountDisplay = booking.final_payment_amount
      ? ` ($${booking.final_payment_amount.toLocaleString()})`
      : '';
    const supplierDisplay = booking.supplier_name || 'booking';

    db.prepare(`
      INSERT INTO tasks (agency_id, trip_id, assigned_user_id, title, description, due_date, status, priority, category, is_system_generated, source_event)
      VALUES (?, ?, ?, ?, ?, ?, 'open', ?, 'payment', 1, ?)
    `).run(
      booking.agency_id,
      booking.trip_id,
      booking.assigned_user_id,
      `Payment due: ${supplierDisplay}${amountDisplay}`,
      `Final payment for ${supplierDisplay}${amountDisplay} is due ${booking.final_payment_due_date} for trip "${booking.trip_name}"${booking.client_name ? ` (${booking.client_name})` : ''}.`,
      dueDateStr,
      daysUntil <= 3 ? 'urgent' : 'normal',
      `booking_payment_deadline:${booking.booking_id}`
    );

    tasksCreated++;
    console.log(`[DEADLINE_TASKS] Created booking payment task for booking ${booking.booking_id}, due ${dueDateStr}`);
  }

  return { checked: bookingsWithDeadlines.length, tasksCreated };
}

/**
 * Run all deadline checks and create appropriate tasks
 *
 * @returns {Object} - Summary of all checks and tasks created
 */
function checkAllDeadlines() {
  console.log('[DEADLINE_TASKS] Starting deadline check for all agencies...');

  const paymentResult = checkFinalPaymentDeadlines(7);
  const travelResult = checkTravelDateDeadlines(3);
  const bookingPaymentResult = checkBookingPaymentDeadlines(7);

  const summary = {
    finalPaymentDeadlines: paymentResult,
    travelDates: travelResult,
    bookingPayments: bookingPaymentResult,
    totalTasksCreated: paymentResult.tasksCreated + travelResult.tasksCreated + bookingPaymentResult.tasksCreated
  };

  console.log(`[DEADLINE_TASKS] Complete. Total tasks created: ${summary.totalTasksCreated}`);

  return summary;
}

module.exports = {
  checkFinalPaymentDeadlines,
  checkTravelDateDeadlines,
  checkBookingPaymentDeadlines,
  checkAllDeadlines
};
