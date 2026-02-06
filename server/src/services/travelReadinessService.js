/**
 * Travel Readiness Service
 * Generates urgent notifications for trips with travel within 48 hours that have incomplete items
 */

const { getDb } = require('../config/database');
const { createNotification, generateEventKey } = require('./notificationService');

/**
 * Check what items are incomplete for a trip
 *
 * @param {number} tripId - Trip ID
 * @returns {Object} - { isComplete: boolean, missingItems: string[] }
 */
function checkTripReadiness(tripId) {
  const db = getDb();
  const missingItems = [];

  // Get trip details
  const trip = db.prepare(`
    SELECT t.*, c.first_name || ' ' || c.last_name as client_name, c.email as client_email, c.phone as client_phone
    FROM trips t
    LEFT JOIN clients c ON t.client_id = c.id
    WHERE t.id = ?
  `).get(tripId);

  if (!trip) {
    return { isComplete: false, missingItems: ['Trip not found'] };
  }

  // Check for travelers with incomplete info
  const travelers = db.prepare(`
    SELECT * FROM travelers WHERE trip_id = ?
  `).all(tripId);

  if (travelers.length === 0) {
    missingItems.push('No travelers added to trip');
  } else {
    // Check each traveler for missing info
    for (const traveler of travelers) {
      const travelerName = traveler.full_legal_name || `Traveler ${traveler.id}`;

      // Check passport status
      if (traveler.passport_status === 'no') {
        missingItems.push(`${travelerName}: No passport`);
      } else if (traveler.passport_status === 'unknown') {
        missingItems.push(`${travelerName}: Passport status unknown`);
      } else if (traveler.passport_status === 'yes' && traveler.passport_expiration) {
        // Check if passport expires within 6 months of travel
        const travelDate = trip.travel_start_date ? new Date(trip.travel_start_date) : null;
        const passportExpiry = new Date(traveler.passport_expiration);
        if (travelDate) {
          const sixMonthsFromTravel = new Date(travelDate.getTime() + 180 * 24 * 60 * 60 * 1000);
          if (passportExpiry < sixMonthsFromTravel) {
            missingItems.push(`${travelerName}: Passport expires within 6 months of travel (${traveler.passport_expiration})`);
          }
        }
      }

      // Check date of birth
      if (!traveler.date_of_birth) {
        missingItems.push(`${travelerName}: Missing date of birth`);
      }
    }
  }

  // Check for bookings
  const bookings = db.prepare(`
    SELECT * FROM bookings WHERE trip_id = ? AND status != 'canceled'
  `).all(tripId);

  if (bookings.length === 0) {
    missingItems.push('No active bookings for trip');
  } else {
    // Check each booking for issues
    for (const booking of bookings) {
      const bookingDesc = booking.supplier_name || booking.booking_type || `Booking ${booking.id}`;

      // Check if booking is still in 'planned' status (not confirmed)
      if (booking.status === 'planned') {
        missingItems.push(`${bookingDesc}: Not yet booked (status: planned)`);
      } else if (booking.status === 'quoted') {
        missingItems.push(`${bookingDesc}: Awaiting confirmation (status: quoted)`);
      }

      // Check for missing confirmation number for booked items
      if (booking.status === 'booked' && !booking.confirmation_number) {
        missingItems.push(`${bookingDesc}: Missing confirmation number`);
      }

      // Check payment status
      if (booking.payment_status !== 'paid_in_full') {
        missingItems.push(`${bookingDesc}: Payment not complete (${booking.payment_status})`);
      }
    }
  }

  // Check client contact info
  if (!trip.client_email && !trip.client_phone) {
    missingItems.push('Client has no contact information');
  }

  return {
    isComplete: missingItems.length === 0,
    missingItems
  };
}

/**
 * Check for trips with travel within the specified hours and incomplete items
 * Creates urgent notifications for the assigned planner
 *
 * @param {number} [hoursThreshold=48] - Hours threshold for travel imminent
 * @returns {Object} - { checked: number, notificationsCreated: number, tripsWithIssues: number }
 */
function checkImminentTravelReadiness(hoursThreshold = 48) {
  const db = getDb();

  // Calculate the threshold
  const now = new Date();
  const threshold = new Date(now.getTime() + hoursThreshold * 60 * 60 * 1000);
  const thresholdStr = threshold.toISOString().split('T')[0]; // YYYY-MM-DD format
  const todayStr = now.toISOString().split('T')[0];

  console.log(`[TRAVEL_READINESS] Checking for trips traveling between ${todayStr} and ${thresholdStr}`);

  // Find trips with travel_start_date within threshold
  // that haven't been canceled or completed
  const imminentTrips = db.prepare(`
    SELECT
      t.id as trip_id,
      t.agency_id,
      t.name as trip_name,
      t.destination,
      t.travel_start_date,
      t.assigned_user_id,
      c.first_name || ' ' || c.last_name as client_name
    FROM trips t
    LEFT JOIN clients c ON t.client_id = c.id
    WHERE t.travel_start_date IS NOT NULL
      AND t.travel_start_date >= ?
      AND t.travel_start_date <= ?
      AND t.stage NOT IN ('canceled', 'archived', 'completed')
  `).all(todayStr, thresholdStr);

  console.log(`[TRAVEL_READINESS] Found ${imminentTrips.length} trips with travel within ${hoursThreshold} hours`);

  let notificationsCreated = 0;
  let tripsWithIssues = 0;

  for (const trip of imminentTrips) {
    // Check readiness for this trip
    const readiness = checkTripReadiness(trip.trip_id);

    if (!readiness.isComplete && readiness.missingItems.length > 0) {
      tripsWithIssues++;

      // Get admin users for this agency
      const admins = db.prepare(`
        SELECT id FROM users
        WHERE agency_id = ? AND role = 'admin' AND is_active = 1
      `).all(trip.agency_id);

      // Also notify the assigned planner if different from admins
      let usersToNotify = admins.map(a => a.id);
      if (trip.assigned_user_id && !usersToNotify.includes(trip.assigned_user_id)) {
        usersToNotify.push(trip.assigned_user_id);
      }

      // Calculate hours until travel
      const travelDate = new Date(trip.travel_start_date);
      const hoursUntilTravel = Math.ceil((travelDate - now) / (1000 * 60 * 60));

      // Determine urgency text
      let urgencyText;
      if (hoursUntilTravel <= 24) {
        urgencyText = 'traveling in less than 24 hours';
      } else {
        urgencyText = `traveling within ${Math.ceil(hoursUntilTravel / 24)} days`;
      }

      // Format the missing items as a bulleted list
      const missingItemsList = readiness.missingItems.slice(0, 5).map(item => `• ${item}`).join('\n');
      const additionalCount = readiness.missingItems.length > 5
        ? `\n...and ${readiness.missingItems.length - 5} more items`
        : '';

      const title = `URGENT: Travel Imminent - Incomplete Items`;
      const message = `Trip "${trip.trip_name}"${trip.client_name ? ` for ${trip.client_name}` : ''} is ${urgencyText}${trip.destination ? ` to ${trip.destination}` : ''}, but has incomplete items:\n\n${missingItemsList}${additionalCount}`;

      // Create notifications for each user
      for (const userId of usersToNotify) {
        // Use event key for deduplication (one notification per trip per day per user)
        const eventKey = generateEventKey(
          'travel_imminent_incomplete',
          'trip',
          trip.trip_id,
          `${todayStr}:user:${userId}`
        );

        const result = createNotification({
          agencyId: trip.agency_id,
          userId,
          type: 'urgent',
          title,
          message,
          entityType: 'trip',
          entityId: trip.trip_id,
          eventKey
        });

        if (result.created) {
          notificationsCreated++;
          console.log(`[TRAVEL_READINESS] Created urgent notification for user ${userId}, trip ${trip.trip_id}`);
        }
      }
    }
  }

  return {
    checked: imminentTrips.length,
    tripsWithIssues,
    notificationsCreated
  };
}

/**
 * Get trips with imminent travel and incomplete items for a specific agency
 *
 * @param {number} agencyId - Agency ID
 * @param {number} [hoursThreshold=48] - Hours threshold
 * @returns {Array} - Array of trip objects with readiness info
 */
function getImminentTripsWithIssues(agencyId, hoursThreshold = 48) {
  const db = getDb();

  const now = new Date();
  const threshold = new Date(now.getTime() + hoursThreshold * 60 * 60 * 1000);
  const thresholdStr = threshold.toISOString().split('T')[0];
  const todayStr = now.toISOString().split('T')[0];

  const trips = db.prepare(`
    SELECT
      t.id as tripId,
      t.name as tripName,
      t.destination,
      t.travel_start_date as travelStartDate,
      t.assigned_user_id as assignedUserId,
      c.first_name || ' ' || c.last_name as clientName
    FROM trips t
    LEFT JOIN clients c ON t.client_id = c.id
    WHERE t.agency_id = ?
      AND t.travel_start_date IS NOT NULL
      AND t.travel_start_date >= ?
      AND t.travel_start_date <= ?
      AND t.stage NOT IN ('canceled', 'archived', 'completed')
    ORDER BY t.travel_start_date ASC
  `).all(agencyId, todayStr, thresholdStr);

  const tripsWithIssues = [];

  for (const trip of trips) {
    const readiness = checkTripReadiness(trip.tripId);

    if (!readiness.isComplete && readiness.missingItems.length > 0) {
      const travelDate = new Date(trip.travelStartDate);
      const hoursUntilTravel = Math.ceil((travelDate - now) / (1000 * 60 * 60));

      tripsWithIssues.push({
        ...trip,
        hoursUntilTravel,
        isUrgent: hoursUntilTravel <= 24,
        missingItems: readiness.missingItems
      });
    }
  }

  return tripsWithIssues;
}

module.exports = {
  checkTripReadiness,
  checkImminentTravelReadiness,
  getImminentTripsWithIssues
};
