const express = require('express');
const { getDb } = require('../config/database');
const { authenticate, tenantScope } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

// All booking routes require authentication and tenant scope
router.use(authenticate);
router.use(tenantScope);

const VALID_BOOKING_TYPES = ['hotel', 'cruise', 'resort', 'tour', 'insurance', 'transfer', 'other'];
const VALID_STATUSES = ['planned', 'quoted', 'booked', 'canceled'];
const VALID_PAYMENT_STATUSES = ['deposit_paid', 'final_due', 'paid_in_full'];
const VALID_COMMISSION_STATUSES = ['expected', 'submitted', 'paid'];

/**
 * GET /api/trips/:tripId/bookings
 * List all bookings for a trip
 */
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { tripId } = req.params;

    // Verify trip exists and belongs to agency
    const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND agency_id = ?').get(tripId, req.agencyId);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const bookings = db.prepare(`
      SELECT * FROM bookings
      WHERE trip_id = ? AND agency_id = ?
      ORDER BY created_at DESC
    `).all(tripId, req.agencyId);

    // Calculate totals (exclude canceled bookings from commission totals)
    const totals = bookings.reduce((acc, b) => {
      // Include all bookings in cost totals
      acc.totalCost += b.total_cost || 0;
      acc.totalDeposit += b.deposit_amount || 0;
      acc.totalFinalPayment += b.final_payment_amount || 0;

      // Only include non-canceled bookings in commission totals
      if (b.status !== 'canceled') {
        acc.totalCommissionExpected += b.commission_amount_expected || 0;
        acc.totalCommissionReceived += (b.commission_amount_received || 0);
      }
      return acc;
    }, { totalCost: 0, totalDeposit: 0, totalFinalPayment: 0, totalCommissionExpected: 0, totalCommissionReceived: 0 });

    res.json({
      bookings: bookings.map(b => formatBooking(b)),
      totals,
      count: bookings.length
    });
  } catch (error) {
    console.error('[ERROR] List bookings failed:', error.message);
    res.status(500).json({ error: 'Failed to list bookings' });
  }
});

/**
 * GET /api/trips/:tripId/bookings/:id
 * Get a single booking
 */
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const { tripId, id } = req.params;

    const booking = db.prepare(`
      SELECT * FROM bookings
      WHERE id = ? AND trip_id = ? AND agency_id = ?
    `).get(id, tripId, req.agencyId);

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json({ booking: formatBooking(booking) });
  } catch (error) {
    console.error('[ERROR] Get booking failed:', error.message);
    res.status(500).json({ error: 'Failed to get booking' });
  }
});

/**
 * POST /api/trips/:tripId/bookings
 * Create a new booking within a trip
 */
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { tripId } = req.params;

    // Verify trip exists and belongs to agency
    const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND agency_id = ?').get(tripId, req.agencyId);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const {
      bookingType, supplierName, status, confirmationNumber,
      bookingDate, travelStartDate, travelEndDate,
      totalCost, depositAmount, depositPaid, finalPaymentAmount, finalPaymentDueDate,
      paymentStatus,
      commissionRate, commissionAmountExpected, commissionStatus,
      supplierNotes, inclusionsExclusions, cancellationRules
    } = req.body;

    // Validation
    if (!bookingType || !VALID_BOOKING_TYPES.includes(bookingType)) {
      return res.status(400).json({ error: 'Valid booking type is required: ' + VALID_BOOKING_TYPES.join(', ') });
    }

    const bookingStatus = status && VALID_STATUSES.includes(status) ? status : 'planned';
    const payStatus = paymentStatus && VALID_PAYMENT_STATUSES.includes(paymentStatus) ? paymentStatus : 'deposit_paid';
    const commStatus = commissionStatus && VALID_COMMISSION_STATUSES.includes(commissionStatus) ? commissionStatus : 'expected';

    const result = db.prepare(`
      INSERT INTO bookings (
        trip_id, agency_id, booking_type, supplier_name, status, confirmation_number,
        booking_date, travel_start_date, travel_end_date,
        total_cost, deposit_amount, deposit_paid, final_payment_amount, final_payment_due_date,
        payment_status,
        commission_amount_expected, commission_rate, commission_status,
        supplier_notes, inclusions_exclusions, cancellation_rules
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tripId,
      req.agencyId,
      bookingType,
      supplierName || null,
      bookingStatus,
      confirmationNumber || null,
      bookingDate || null,
      travelStartDate || null,
      travelEndDate || null,
      totalCost || 0,
      depositAmount || 0,
      depositPaid ? 1 : 0,
      finalPaymentAmount || 0,
      finalPaymentDueDate || null,
      payStatus,
      commissionAmountExpected || 0,
      commissionRate || 0,
      commStatus,
      supplierNotes || null,
      inclusionsExclusions || null,
      cancellationRules || null
    );

    const bookingId = result.lastInsertRowid;

    // Log creation in audit_logs
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id, booking_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      req.user.id,
      'create',
      'booking',
      bookingId,
      JSON.stringify({ bookingType, supplierName, totalCost, commissionRate, commissionAmountExpected }),
      tripId,
      bookingId
    );

    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);

    res.status(201).json({
      message: 'Booking created successfully',
      booking: formatBooking(booking)
    });
  } catch (error) {
    console.error('[ERROR] Create booking failed:', error.message);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

/**
 * PUT /api/trips/:tripId/bookings/:id
 * Update a booking
 * Restricted actions (confirm booking, mark payment, change commission) require admin or approval
 */
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const { tripId, id } = req.params;
    const isAdmin = req.user.role === 'admin';

    const existing = db.prepare('SELECT * FROM bookings WHERE id = ? AND trip_id = ? AND agency_id = ?').get(id, tripId, req.agencyId);
    if (!existing) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const {
      bookingType, supplierName, status, confirmationNumber,
      bookingDate, travelStartDate, travelEndDate,
      totalCost, depositAmount, depositPaid, finalPaymentAmount, finalPaymentDueDate,
      paymentStatus,
      commissionRate, commissionAmountExpected, commissionStatus,
      commissionAmountReceived, commissionReceivedDate, commissionPaymentReference, commissionVarianceNote,
      supplierNotes, inclusionsExclusions, cancellationRules
    } = req.body;

    // Validate enums if provided
    if (bookingType && !VALID_BOOKING_TYPES.includes(bookingType)) {
      return res.status(400).json({ error: 'Invalid booking type' });
    }
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid booking status' });
    }
    if (paymentStatus && !VALID_PAYMENT_STATUSES.includes(paymentStatus)) {
      return res.status(400).json({ error: 'Invalid payment status' });
    }
    if (commissionStatus && !VALID_COMMISSION_STATUSES.includes(commissionStatus)) {
      return res.status(400).json({ error: 'Invalid commission status' });
    }

    // Check for restricted actions that require admin approval
    const restrictedChanges = [];

    // Confirming a booking (status change to 'booked')
    if (status === 'booked' && existing.status !== 'booked') {
      restrictedChanges.push({ action: 'confirm_booking', reason: 'Confirm booking' });
    }

    // Marking payment as paid_in_full
    if (paymentStatus === 'paid_in_full' && existing.payment_status !== 'paid_in_full') {
      restrictedChanges.push({ action: 'mark_payment_received', reason: 'Mark payment as paid in full' });
    }

    // Changing commission status
    if (commissionStatus && commissionStatus !== existing.commission_status) {
      restrictedChanges.push({
        action: 'change_commission_status',
        reason: JSON.stringify({ newStatus: commissionStatus, oldStatus: existing.commission_status })
      });
    }

    // If non-admin and there are restricted changes, create approval request
    if (!isAdmin && restrictedChanges.length > 0) {
      // Create approval request for the first restricted action
      const restrictedAction = restrictedChanges[0];

      // Check if there's already a pending approval for this booking
      const existingPending = db.prepare(`
        SELECT id FROM approval_requests
        WHERE agency_id = ? AND entity_type = 'booking' AND entity_id = ?
          AND action_type = ? AND status = 'pending'
      `).get(req.agencyId, id, restrictedAction.action);

      if (existingPending) {
        return res.status(202).json({
          message: 'An approval request for this action is already pending',
          approvalRequired: true,
          approvalRequestId: existingPending.id,
          restrictedAction: restrictedAction.action
        });
      }

      // Create new approval request
      const result = db.prepare(`
        INSERT INTO approval_requests (agency_id, requested_by, action_type, entity_type, entity_id, reason)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(req.agencyId, req.user.id, restrictedAction.action, 'booking', id, restrictedAction.reason);

      const requestId = result.lastInsertRowid;

      // Create notifications for admins
      const admins = db.prepare(
        "SELECT id FROM users WHERE agency_id = ? AND role = 'admin' AND is_active = 1"
      ).all(req.agencyId);

      for (const admin of admins) {
        db.prepare(`
          INSERT INTO notifications (agency_id, user_id, type, title, message, entity_type, entity_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          req.agencyId,
          admin.id,
          'normal',
          'Approval Required',
          `${req.user.firstName || req.user.email} requests to ${restrictedAction.action.replace(/_/g, ' ')}`,
          'approval_request',
          requestId
        );
      }

      // Log the approval request creation
      db.prepare(`
        INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, booking_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.agencyId,
        req.user.id,
        'create_approval_request',
        'approval_request',
        requestId,
        JSON.stringify({ action: restrictedAction.action, bookingId: id }),
        id
      );

      return res.status(202).json({
        message: 'This action requires admin approval. An approval request has been created.',
        approvalRequired: true,
        approvalRequestId: requestId,
        restrictedAction: restrictedAction.action,
        booking: formatBooking(existing)
      });
    }

    // When canceling a booking, set commission_amount_expected to 0
    // The commission tracking should no longer expect this amount
    let effectiveCommissionExpected = commissionAmountExpected;
    if (status === 'canceled' && existing.status !== 'canceled') {
      effectiveCommissionExpected = 0;
    }

    db.prepare(`
      UPDATE bookings SET
        booking_type = COALESCE(?, booking_type),
        supplier_name = ?,
        status = COALESCE(?, status),
        confirmation_number = ?,
        booking_date = ?,
        travel_start_date = ?,
        travel_end_date = ?,
        total_cost = COALESCE(?, total_cost),
        deposit_amount = COALESCE(?, deposit_amount),
        deposit_paid = COALESCE(?, deposit_paid),
        final_payment_amount = COALESCE(?, final_payment_amount),
        final_payment_due_date = ?,
        payment_status = COALESCE(?, payment_status),
        commission_amount_expected = COALESCE(?, commission_amount_expected),
        commission_rate = COALESCE(?, commission_rate),
        commission_status = COALESCE(?, commission_status),
        commission_amount_received = ?,
        commission_received_date = ?,
        commission_payment_reference = ?,
        commission_variance_note = ?,
        supplier_notes = ?,
        inclusions_exclusions = ?,
        cancellation_rules = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND trip_id = ? AND agency_id = ?
    `).run(
      bookingType || null,
      supplierName !== undefined ? supplierName : existing.supplier_name,
      status || null,
      confirmationNumber !== undefined ? confirmationNumber : existing.confirmation_number,
      bookingDate !== undefined ? bookingDate : existing.booking_date,
      travelStartDate !== undefined ? travelStartDate : existing.travel_start_date,
      travelEndDate !== undefined ? travelEndDate : existing.travel_end_date,
      totalCost !== undefined ? totalCost : null,
      depositAmount !== undefined ? depositAmount : null,
      depositPaid !== undefined ? (depositPaid ? 1 : 0) : null,
      finalPaymentAmount !== undefined ? finalPaymentAmount : null,
      finalPaymentDueDate !== undefined ? finalPaymentDueDate : existing.final_payment_due_date,
      paymentStatus || null,
      effectiveCommissionExpected !== undefined ? effectiveCommissionExpected : null,
      commissionRate !== undefined ? commissionRate : null,
      commissionStatus || null,
      commissionAmountReceived !== undefined ? commissionAmountReceived : existing.commission_amount_received,
      commissionReceivedDate !== undefined ? commissionReceivedDate : existing.commission_received_date,
      commissionPaymentReference !== undefined ? commissionPaymentReference : existing.commission_payment_reference,
      commissionVarianceNote !== undefined ? commissionVarianceNote : existing.commission_variance_note,
      supplierNotes !== undefined ? supplierNotes : existing.supplier_notes,
      inclusionsExclusions !== undefined ? inclusionsExclusions : existing.inclusions_exclusions,
      cancellationRules !== undefined ? cancellationRules : existing.cancellation_rules,
      id,
      tripId,
      req.agencyId
    );

    // Log update in audit_logs
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id, booking_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      req.user.id,
      'update',
      'booking',
      id,
      JSON.stringify({ bookingType, status, totalCost, paymentStatus, commissionStatus }),
      tripId,
      id
    );

    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);

    // Check if we need to update trip lock status (when payment status changes)
    if (paymentStatus && paymentStatus !== existing.payment_status) {
      // Recalculate trip lock status
      const trip = db.prepare('SELECT * FROM trips WHERE id = ? AND agency_id = ?').get(tripId, req.agencyId);
      if (trip) {
        const lockableStages = ['booked', 'final_payment_pending', 'traveling', 'completed'];
        if (lockableStages.includes(trip.stage)) {
          // Check if all bookings are now paid in full
          const allBookings = db.prepare(`
            SELECT id, payment_status FROM bookings
            WHERE trip_id = ? AND status != 'canceled'
          `).all(tripId);

          const allPaid = allBookings.every(b => b.payment_status === 'paid_in_full');

          if (allPaid && !trip.is_locked) {
            // Lock the trip
            db.prepare(`
              UPDATE trips SET is_locked = 1, lock_reason = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND agency_id = ?
            `).run(
              'Trip is booked with all payments complete. Core fields are locked to protect confirmed arrangements.',
              tripId,
              req.agencyId
            );
            console.log(`[LOCK] Trip ${tripId} auto-locked after all bookings paid in full`);
          }
        }
      }
    }

    res.json({
      message: 'Booking updated successfully',
      booking: formatBooking(booking)
    });
  } catch (error) {
    console.error('[ERROR] Update booking failed:', error.message);
    res.status(500).json({ error: 'Failed to update booking' });
  }
});

/**
 * PUT /api/trips/:tripId/bookings/:id/commission
 * Update commission fields on a booking
 */
router.put('/:id/commission', (req, res) => {
  try {
    const db = getDb();
    const { tripId, id } = req.params;

    const existing = db.prepare('SELECT * FROM bookings WHERE id = ? AND trip_id = ? AND agency_id = ?').get(id, tripId, req.agencyId);
    if (!existing) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const {
      commissionStatus, commissionAmountReceived,
      commissionReceivedDate, commissionPaymentReference, commissionVarianceNote
    } = req.body;

    if (commissionStatus && !VALID_COMMISSION_STATUSES.includes(commissionStatus)) {
      return res.status(400).json({ error: 'Invalid commission status' });
    }

    db.prepare(`
      UPDATE bookings SET
        commission_status = COALESCE(?, commission_status),
        commission_amount_received = COALESCE(?, commission_amount_received),
        commission_received_date = COALESCE(?, commission_received_date),
        commission_payment_reference = COALESCE(?, commission_payment_reference),
        commission_variance_note = COALESCE(?, commission_variance_note),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND trip_id = ? AND agency_id = ?
    `).run(
      commissionStatus || null,
      commissionAmountReceived !== undefined ? commissionAmountReceived : null,
      commissionReceivedDate || null,
      commissionPaymentReference || null,
      commissionVarianceNote || null,
      id,
      tripId,
      req.agencyId
    );

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id, booking_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      req.user.id,
      'commission_update',
      'booking',
      id,
      JSON.stringify({ commissionStatus, commissionAmountReceived, commissionReceivedDate }),
      tripId,
      id
    );

    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);

    res.json({
      message: 'Commission updated successfully',
      booking: formatBooking(booking)
    });
  } catch (error) {
    console.error('[ERROR] Update commission failed:', error.message);
    res.status(500).json({ error: 'Failed to update commission' });
  }
});

/**
 * DELETE /api/trips/:tripId/bookings/:id
 * Delete a booking
 */
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const { tripId, id } = req.params;

    const existing = db.prepare('SELECT * FROM bookings WHERE id = ? AND trip_id = ? AND agency_id = ?').get(id, tripId, req.agencyId);
    if (!existing) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Audit log BEFORE delete (to capture booking_id reference)
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id, booking_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(
      req.agencyId,
      req.user.id,
      'delete',
      'booking',
      id,
      JSON.stringify({ bookingType: existing.booking_type, supplierName: existing.supplier_name, bookingId: id }),
      tripId
    );

    db.prepare('DELETE FROM bookings WHERE id = ? AND trip_id = ? AND agency_id = ?').run(id, tripId, req.agencyId);

    res.json({ message: 'Booking deleted successfully', deletedId: Number(id) });
  } catch (error) {
    console.error('[ERROR] Delete booking failed:', error.message);
    res.status(500).json({ error: 'Failed to delete booking' });
  }
});

function formatBooking(b) {
  return {
    id: b.id,
    tripId: b.trip_id,
    agencyId: b.agency_id,
    bookingType: b.booking_type,
    supplierName: b.supplier_name,
    status: b.status,
    confirmationNumber: b.confirmation_number,
    bookingDate: b.booking_date,
    travelStartDate: b.travel_start_date,
    travelEndDate: b.travel_end_date,
    totalCost: b.total_cost,
    depositAmount: b.deposit_amount,
    depositPaid: !!b.deposit_paid,
    finalPaymentAmount: b.final_payment_amount,
    finalPaymentDueDate: b.final_payment_due_date,
    paymentStatus: b.payment_status,
    commissionAmountExpected: b.commission_amount_expected,
    commissionRate: b.commission_rate,
    commissionStatus: b.commission_status,
    commissionAmountReceived: b.commission_amount_received,
    commissionReceivedDate: b.commission_received_date,
    commissionPaymentReference: b.commission_payment_reference,
    commissionVarianceNote: b.commission_variance_note,
    supplierNotes: b.supplier_notes,
    inclusionsExclusions: b.inclusions_exclusions,
    cancellationRules: b.cancellation_rules,
    createdAt: b.created_at,
    updatedAt: b.updated_at
  };
}

module.exports = router;
