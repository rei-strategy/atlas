const express = require('express');
const { getDb } = require('../config/database');
const { authenticate, tenantScope } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

// All traveler routes require authentication and tenant scope
router.use(authenticate);
router.use(tenantScope);

/**
 * GET /api/trips/:tripId/travelers
 * List all travelers for a trip
 */
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { tripId } = req.params;

    // Verify trip belongs to this agency
    const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND agency_id = ?').get(tripId, req.agencyId);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const travelers = db.prepare(
      'SELECT * FROM travelers WHERE trip_id = ? ORDER BY created_at ASC'
    ).all(tripId);

    res.json({
      travelers: travelers.map(t => formatTraveler(t)),
      total: travelers.length
    });
  } catch (error) {
    console.error('[ERROR] List travelers failed:', error.message);
    res.status(500).json({ error: 'Failed to list travelers' });
  }
});

/**
 * GET /api/trips/:tripId/travelers/:id
 * Get a single traveler
 */
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const { tripId, id } = req.params;

    const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND agency_id = ?').get(tripId, req.agencyId);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const traveler = db.prepare('SELECT * FROM travelers WHERE id = ? AND trip_id = ?').get(id, tripId);
    if (!traveler) {
      return res.status(404).json({ error: 'Traveler not found' });
    }

    res.json({ traveler: formatTraveler(traveler) });
  } catch (error) {
    console.error('[ERROR] Get traveler failed:', error.message);
    res.status(500).json({ error: 'Failed to get traveler' });
  }
});

/**
 * POST /api/trips/:tripId/travelers
 * Add a traveler to a trip
 */
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { tripId } = req.params;

    const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND agency_id = ?').get(tripId, req.agencyId);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const { fullLegalName, dateOfBirth, passportStatus, passportExpiration, specialNeeds, relationshipToClient } = req.body;

    if (!fullLegalName) {
      return res.status(400).json({ error: 'Full legal name is required' });
    }

    const result = db.prepare(`
      INSERT INTO travelers (trip_id, full_legal_name, date_of_birth, passport_status, passport_expiration, special_needs, relationship_to_client)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      tripId,
      fullLegalName,
      dateOfBirth || null,
      passportStatus || 'unknown',
      passportExpiration || null,
      specialNeeds || null,
      relationshipToClient || null
    );

    const traveler = db.prepare('SELECT * FROM travelers WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      message: 'Traveler added successfully',
      traveler: formatTraveler(traveler)
    });
  } catch (error) {
    console.error('[ERROR] Add traveler failed:', error.message);
    res.status(500).json({ error: 'Failed to add traveler' });
  }
});

/**
 * PUT /api/trips/:tripId/travelers/:id
 * Update a traveler
 */
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const { tripId, id } = req.params;

    const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND agency_id = ?').get(tripId, req.agencyId);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const existing = db.prepare('SELECT * FROM travelers WHERE id = ? AND trip_id = ?').get(id, tripId);
    if (!existing) {
      return res.status(404).json({ error: 'Traveler not found' });
    }

    const { fullLegalName, dateOfBirth, passportStatus, passportExpiration, specialNeeds, relationshipToClient } = req.body;

    db.prepare(`
      UPDATE travelers SET
        full_legal_name = COALESCE(?, full_legal_name),
        date_of_birth = ?,
        passport_status = COALESCE(?, passport_status),
        passport_expiration = ?,
        special_needs = ?,
        relationship_to_client = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND trip_id = ?
    `).run(
      fullLegalName || null,
      dateOfBirth !== undefined ? dateOfBirth : existing.date_of_birth,
      passportStatus || null,
      passportExpiration !== undefined ? passportExpiration : existing.passport_expiration,
      specialNeeds !== undefined ? specialNeeds : existing.special_needs,
      relationshipToClient !== undefined ? relationshipToClient : existing.relationship_to_client,
      id,
      tripId
    );

    const updated = db.prepare('SELECT * FROM travelers WHERE id = ?').get(id);

    res.json({
      message: 'Traveler updated successfully',
      traveler: formatTraveler(updated)
    });
  } catch (error) {
    console.error('[ERROR] Update traveler failed:', error.message);
    res.status(500).json({ error: 'Failed to update traveler' });
  }
});

/**
 * DELETE /api/trips/:tripId/travelers/:id
 * Remove a traveler from trip
 */
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const { tripId, id } = req.params;

    const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND agency_id = ?').get(tripId, req.agencyId);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const existing = db.prepare('SELECT id FROM travelers WHERE id = ? AND trip_id = ?').get(id, tripId);
    if (!existing) {
      return res.status(404).json({ error: 'Traveler not found' });
    }

    db.prepare('DELETE FROM travelers WHERE id = ? AND trip_id = ?').run(id, tripId);

    res.json({ message: 'Traveler removed successfully', deletedId: id });
  } catch (error) {
    console.error('[ERROR] Delete traveler failed:', error.message);
    res.status(500).json({ error: 'Failed to remove traveler' });
  }
});

function formatTraveler(t) {
  return {
    id: t.id,
    tripId: t.trip_id,
    fullLegalName: t.full_legal_name,
    dateOfBirth: t.date_of_birth,
    passportStatus: t.passport_status,
    passportExpiration: t.passport_expiration,
    specialNeeds: t.special_needs,
    relationshipToClient: t.relationship_to_client,
    createdAt: t.created_at,
    updatedAt: t.updated_at
  };
}

module.exports = router;
