/**
 * Payment Deadline Service
 * Generates urgent notifications for bookings with payments due within 48 hours
 */

const { getDb } = require('../config/database');
const { createNotification, generateEventKey } = require('./notificationService');

/**
 * Check for bookings with payments due within the specified hours
 * and create urgent notifications for agency admins and planners
 *
 * @param {number} [hoursThreshold=48] - Hours threshold for urgent notifications
 * @returns {Object} - { checked: number, notificationsCreated: number }
 */
function checkUrgentPaymentDeadlines(hoursThreshold = 48) {
  const db = getDb();

  // Calculate the deadline threshold (current time + hours)
  const now = new Date();
  const threshold = new Date(now.getTime() + hoursThreshold * 60 * 60 * 1000);
  const thresholdStr = threshold.toISOString().split('T')[0]; // YYYY-MM-DD format
  const todayStr = now.toISOString().split('T')[0];

  console.log(`[PAYMENT_DEADLINE] Checking for payments due between ${todayStr} and ${thresholdStr}`);

  // Find bookings with final_payment_due_date within threshold
  // that haven't been paid in full
  const urgentBookings = db.prepare(`
    SELECT
      b.id as booking_id,
      b.trip_id,
      b.agency_id,
      b.supplier_name,
      b.booking_type,
      b.confirmation_number,
      b.final_payment_due_date,
      b.final_payment_amount,
      b.payment_status,
      t.name as trip_name,
      t.assigned_user_id,
      c.first_name || ' ' || c.last_name as client_name
    FROM bookings b
    JOIN trips t ON b.trip_id = t.id
    LEFT JOIN clients c ON t.client_id = c.id
    WHERE b.final_payment_due_date IS NOT NULL
      AND b.final_payment_due_date >= ?
      AND b.final_payment_due_date <= ?
      AND b.payment_status != 'paid_in_full'
      AND b.status != 'canceled'
  `).all(todayStr, thresholdStr);

  console.log(`[PAYMENT_DEADLINE] Found ${urgentBookings.length} bookings with urgent payment deadlines`);

  let notificationsCreated = 0;

  for (const booking of urgentBookings) {
    // Get admin users for this agency
    const admins = db.prepare(`
      SELECT id FROM users
      WHERE agency_id = ? AND role = 'admin' AND is_active = 1
    `).all(booking.agency_id);

    // Also notify the assigned planner if different from admins
    let usersToNotify = admins.map(a => a.id);
    if (booking.assigned_user_id && !usersToNotify.includes(booking.assigned_user_id)) {
      usersToNotify.push(booking.assigned_user_id);
    }

    // Calculate days until due
    const dueDate = new Date(booking.final_payment_due_date);
    const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
    const hoursUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60));

    // Determine urgency level text
    let urgencyText;
    if (hoursUntilDue <= 24) {
      urgencyText = 'due in less than 24 hours';
    } else if (daysUntilDue <= 1) {
      urgencyText = 'due tomorrow';
    } else {
      urgencyText = `due in ${daysUntilDue} days`;
    }

    // Format the message
    const supplierDisplay = booking.supplier_name || booking.booking_type || 'Booking';
    const amountDisplay = booking.final_payment_amount
      ? `$${booking.final_payment_amount.toLocaleString()}`
      : 'amount pending';

    const title = `Urgent: Payment ${urgencyText}`;
    const message = `Final payment of ${amountDisplay} for ${supplierDisplay} (${booking.trip_name}${booking.client_name ? ` - ${booking.client_name}` : ''}) is ${urgencyText}. Due date: ${booking.final_payment_due_date}${booking.confirmation_number ? `. Confirmation: ${booking.confirmation_number}` : ''}.`;

    // Create notifications for each user
    for (const userId of usersToNotify) {
      // Use event key for deduplication (one notification per booking per day per user)
      const eventKey = generateEventKey(
        'payment_due_urgent',
        'booking',
        booking.booking_id,
        `${todayStr}:user:${userId}`
      );

      const result = createNotification({
        agencyId: booking.agency_id,
        userId,
        type: 'urgent',
        title,
        message,
        entityType: 'booking',
        entityId: booking.booking_id,
        eventKey
      });

      if (result.created) {
        notificationsCreated++;
        console.log(`[PAYMENT_DEADLINE] Created urgent notification for user ${userId}, booking ${booking.booking_id}`);
      }
    }
  }

  return {
    checked: urgentBookings.length,
    notificationsCreated
  };
}

/**
 * Get bookings with payment due within specified hours for a specific agency
 *
 * @param {number} agencyId - Agency ID
 * @param {number} [hoursThreshold=48] - Hours threshold
 * @returns {Array} - Array of booking objects with payment deadline info
 */
function getUrgentPaymentDeadlines(agencyId, hoursThreshold = 48) {
  const db = getDb();

  const now = new Date();
  const threshold = new Date(now.getTime() + hoursThreshold * 60 * 60 * 1000);
  const thresholdStr = threshold.toISOString().split('T')[0];
  const todayStr = now.toISOString().split('T')[0];

  const bookings = db.prepare(`
    SELECT
      b.id as bookingId,
      b.trip_id as tripId,
      b.supplier_name as supplierName,
      b.booking_type as bookingType,
      b.confirmation_number as confirmationNumber,
      b.final_payment_due_date as finalPaymentDueDate,
      b.final_payment_amount as finalPaymentAmount,
      b.payment_status as paymentStatus,
      t.name as tripName,
      c.first_name || ' ' || c.last_name as clientName
    FROM bookings b
    JOIN trips t ON b.trip_id = t.id
    LEFT JOIN clients c ON t.client_id = c.id
    WHERE b.agency_id = ?
      AND b.final_payment_due_date IS NOT NULL
      AND b.final_payment_due_date >= ?
      AND b.final_payment_due_date <= ?
      AND b.payment_status != 'paid_in_full'
      AND b.status != 'canceled'
    ORDER BY b.final_payment_due_date ASC
  `).all(agencyId, todayStr, thresholdStr);

  return bookings.map(b => {
    const dueDate = new Date(b.finalPaymentDueDate);
    const hoursUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60));
    return {
      ...b,
      hoursUntilDue,
      isUrgent: hoursUntilDue <= 24
    };
  });
}

module.exports = {
  checkUrgentPaymentDeadlines,
  getUrgentPaymentDeadlines
};
