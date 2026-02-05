const express = require('express');
const { getDb } = require('../config/database');
const { authenticate, tenantScope } = require('../middleware/auth');

const router = express.Router();

// All search routes require authentication and tenant scope
router.use(authenticate);
router.use(tenantScope);

/**
 * GET /api/search?q=searchTerm
 * Global search across clients, trips, and bookings
 * Results are grouped by entity type
 */
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { q } = req.query;

    if (!q || q.trim().length === 0) {
      return res.json({
        results: {
          clients: [],
          trips: [],
          bookings: []
        },
        total: 0
      });
    }

    const searchTerm = `%${q.trim()}%`;
    const agencyId = req.agencyId;

    // Search clients by name, email, phone
    const clients = db.prepare(`
      SELECT id, first_name, last_name, email, phone
      FROM clients
      WHERE agency_id = ?
        AND (
          first_name LIKE ? OR
          last_name LIKE ? OR
          (first_name || ' ' || last_name) LIKE ? OR
          email LIKE ? OR
          phone LIKE ?
        )
      ORDER BY first_name, last_name
      LIMIT 10
    `).all(agencyId, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);

    // Search trips by name, destination, or client name
    const trips = db.prepare(`
      SELECT t.id, t.name, t.destination, t.stage, t.travel_start_date,
        c.first_name as client_first_name, c.last_name as client_last_name
      FROM trips t
      LEFT JOIN clients c ON t.client_id = c.id
      WHERE t.agency_id = ?
        AND (
          t.name LIKE ? OR
          t.destination LIKE ? OR
          (c.first_name || ' ' || c.last_name) LIKE ?
        )
      ORDER BY t.created_at DESC
      LIMIT 10
    `).all(agencyId, searchTerm, searchTerm, searchTerm);

    // Search bookings by confirmation number, supplier name
    const bookings = db.prepare(`
      SELECT b.id, b.trip_id, b.booking_type, b.supplier_name, b.confirmation_number, b.status,
        t.name as trip_name, t.destination as trip_destination
      FROM bookings b
      LEFT JOIN trips t ON b.trip_id = t.id
      WHERE b.agency_id = ?
        AND (
          b.confirmation_number LIKE ? OR
          b.supplier_name LIKE ?
        )
      ORDER BY b.created_at DESC
      LIMIT 10
    `).all(agencyId, searchTerm, searchTerm);

    // Format results
    const formattedClients = clients.map(c => ({
      id: c.id,
      type: 'client',
      name: `${c.first_name} ${c.last_name}`,
      email: c.email,
      phone: c.phone
    }));

    const formattedTrips = trips.map(t => ({
      id: t.id,
      type: 'trip',
      name: t.name,
      destination: t.destination,
      stage: t.stage,
      travelStartDate: t.travel_start_date,
      clientName: t.client_first_name ? `${t.client_first_name} ${t.client_last_name}` : null
    }));

    const formattedBookings = bookings.map(b => ({
      id: b.id,
      tripId: b.trip_id,
      type: 'booking',
      bookingType: b.booking_type,
      supplierName: b.supplier_name,
      confirmationNumber: b.confirmation_number,
      status: b.status,
      tripName: b.trip_name,
      tripDestination: b.trip_destination
    }));

    const total = formattedClients.length + formattedTrips.length + formattedBookings.length;

    res.json({
      results: {
        clients: formattedClients,
        trips: formattedTrips,
        bookings: formattedBookings
      },
      total
    });
  } catch (error) {
    console.error('[ERROR] Search failed:', error.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
