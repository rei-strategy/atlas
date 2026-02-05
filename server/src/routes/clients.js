const express = require('express');
const { getDb } = require('../config/database');
const { authenticate, tenantScope } = require('../middleware/auth');

const router = express.Router();

// All client routes require authentication and tenant scope
router.use(authenticate);
router.use(tenantScope);

/**
 * GET /api/clients
 * List all clients for the agency with optional search/filter
 */
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { search, assignedTo, sortBy = 'created_at', sortOrder = 'desc' } = req.query;

    let query = `
      SELECT c.*, u.first_name as assigned_first_name, u.last_name as assigned_last_name
      FROM clients c
      LEFT JOIN users u ON c.assigned_user_id = u.id
      WHERE c.agency_id = ?
    `;
    const params = [req.agencyId];

    if (search) {
      query += ` AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ? OR c.phone LIKE ? OR c.city LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (assignedTo) {
      query += ` AND c.assigned_user_id = ?`;
      params.push(assignedTo);
    }

    // Validate sort columns to prevent injection
    const allowedSortCols = ['first_name', 'last_name', 'email', 'created_at', 'updated_at'];
    const safeSortBy = allowedSortCols.includes(sortBy) ? sortBy : 'created_at';
    const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';
    query += ` ORDER BY c.${safeSortBy} ${safeSortOrder}`;

    const clients = db.prepare(query).all(...params);

    res.json({
      clients: clients.map(c => ({
        id: c.id,
        firstName: c.first_name,
        lastName: c.last_name,
        email: c.email,
        phone: c.phone,
        city: c.city,
        state: c.state,
        country: c.country,
        preferredCommunication: c.preferred_communication,
        travelPreferences: c.travel_preferences ? JSON.parse(c.travel_preferences) : [],
        notes: c.notes,
        marketingOptIn: !!c.marketing_opt_in,
        contactConsent: !!c.contact_consent,
        assignedUserId: c.assigned_user_id,
        assignedUserName: c.assigned_first_name ? `${c.assigned_first_name} ${c.assigned_last_name}` : null,
        createdAt: c.created_at,
        updatedAt: c.updated_at
      })),
      total: clients.length
    });
  } catch (error) {
    console.error('[ERROR] List clients failed:', error.message);
    res.status(500).json({ error: 'Failed to list clients' });
  }
});

/**
 * GET /api/clients/:id
 * Get a single client by ID
 */
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const client = db.prepare(`
      SELECT c.*, u.first_name as assigned_first_name, u.last_name as assigned_last_name
      FROM clients c
      LEFT JOIN users u ON c.assigned_user_id = u.id
      WHERE c.id = ? AND c.agency_id = ?
    `).get(req.params.id, req.agencyId);

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json({
      client: {
        id: client.id,
        firstName: client.first_name,
        lastName: client.last_name,
        email: client.email,
        phone: client.phone,
        city: client.city,
        state: client.state,
        country: client.country,
        preferredCommunication: client.preferred_communication,
        travelPreferences: client.travel_preferences ? JSON.parse(client.travel_preferences) : [],
        notes: client.notes,
        marketingOptIn: !!client.marketing_opt_in,
        contactConsent: !!client.contact_consent,
        assignedUserId: client.assigned_user_id,
        assignedUserName: client.assigned_first_name ? `${client.assigned_first_name} ${client.assigned_last_name}` : null,
        createdAt: client.created_at,
        updatedAt: client.updated_at
      }
    });
  } catch (error) {
    console.error('[ERROR] Get client failed:', error.message);
    res.status(500).json({ error: 'Failed to get client' });
  }
});

/**
 * POST /api/clients
 * Create a new client
 */
router.post('/', (req, res) => {
  try {
    const {
      firstName, lastName, email, phone,
      city, state, country,
      preferredCommunication, travelPreferences,
      notes, marketingOptIn, contactConsent,
      assignedUserId
    } = req.body;

    // Validation
    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'First name and last name are required' });
    }

    const db = getDb();

    // Check email uniqueness within agency if email is provided
    if (email) {
      const existing = db.prepare(
        'SELECT id FROM clients WHERE email = ? AND agency_id = ?'
      ).get(email, req.agencyId);
      if (existing) {
        return res.status(409).json({ error: 'A client with this email already exists' });
      }
    }

    const result = db.prepare(`
      INSERT INTO clients (
        agency_id, assigned_user_id, first_name, last_name, email, phone,
        city, state, country, preferred_communication, travel_preferences,
        notes, marketing_opt_in, contact_consent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      assignedUserId || req.user.id,
      firstName,
      lastName,
      email || null,
      phone || null,
      city || null,
      state || null,
      country || null,
      preferredCommunication || null,
      travelPreferences ? JSON.stringify(travelPreferences) : null,
      notes || null,
      marketingOptIn ? 1 : 0,
      contactConsent ? 1 : 0
    );

    const clientId = result.lastInsertRowid;

    // Fetch the created client
    const client = db.prepare(`
      SELECT c.*, u.first_name as assigned_first_name, u.last_name as assigned_last_name
      FROM clients c
      LEFT JOIN users u ON c.assigned_user_id = u.id
      WHERE c.id = ? AND c.agency_id = ?
    `).get(clientId, req.agencyId);

    res.status(201).json({
      message: 'Client created successfully',
      client: {
        id: client.id,
        firstName: client.first_name,
        lastName: client.last_name,
        email: client.email,
        phone: client.phone,
        city: client.city,
        state: client.state,
        country: client.country,
        preferredCommunication: client.preferred_communication,
        travelPreferences: client.travel_preferences ? JSON.parse(client.travel_preferences) : [],
        notes: client.notes,
        marketingOptIn: !!client.marketing_opt_in,
        contactConsent: !!client.contact_consent,
        assignedUserId: client.assigned_user_id,
        assignedUserName: client.assigned_first_name ? `${client.assigned_first_name} ${client.assigned_last_name}` : null,
        createdAt: client.created_at,
        updatedAt: client.updated_at
      }
    });
  } catch (error) {
    console.error('[ERROR] Create client failed:', error.message);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

/**
 * PUT /api/clients/:id
 * Update an existing client
 */
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const clientId = req.params.id;

    // Verify client exists and belongs to agency
    const existing = db.prepare(
      'SELECT id FROM clients WHERE id = ? AND agency_id = ?'
    ).get(clientId, req.agencyId);

    if (!existing) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const {
      firstName, lastName, email, phone,
      city, state, country,
      preferredCommunication, travelPreferences,
      notes, marketingOptIn, contactConsent,
      assignedUserId
    } = req.body;

    // Check email uniqueness if email changed
    if (email) {
      const emailConflict = db.prepare(
        'SELECT id FROM clients WHERE email = ? AND agency_id = ? AND id != ?'
      ).get(email, req.agencyId, clientId);
      if (emailConflict) {
        return res.status(409).json({ error: 'A client with this email already exists' });
      }
    }

    db.prepare(`
      UPDATE clients SET
        first_name = COALESCE(?, first_name),
        last_name = COALESCE(?, last_name),
        email = ?,
        phone = ?,
        city = ?,
        state = ?,
        country = ?,
        preferred_communication = ?,
        travel_preferences = ?,
        notes = ?,
        marketing_opt_in = ?,
        contact_consent = ?,
        assigned_user_id = COALESCE(?, assigned_user_id),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND agency_id = ?
    `).run(
      firstName || null,
      lastName || null,
      email !== undefined ? email : null,
      phone !== undefined ? phone : null,
      city !== undefined ? city : null,
      state !== undefined ? state : null,
      country !== undefined ? country : null,
      preferredCommunication !== undefined ? preferredCommunication : null,
      travelPreferences ? JSON.stringify(travelPreferences) : null,
      notes !== undefined ? notes : null,
      marketingOptIn !== undefined ? (marketingOptIn ? 1 : 0) : 0,
      contactConsent !== undefined ? (contactConsent ? 1 : 0) : 0,
      assignedUserId || null,
      clientId,
      req.agencyId
    );

    // Fetch updated client
    const client = db.prepare(`
      SELECT c.*, u.first_name as assigned_first_name, u.last_name as assigned_last_name
      FROM clients c
      LEFT JOIN users u ON c.assigned_user_id = u.id
      WHERE c.id = ? AND c.agency_id = ?
    `).get(clientId, req.agencyId);

    res.json({
      message: 'Client updated successfully',
      client: {
        id: client.id,
        firstName: client.first_name,
        lastName: client.last_name,
        email: client.email,
        phone: client.phone,
        city: client.city,
        state: client.state,
        country: client.country,
        preferredCommunication: client.preferred_communication,
        travelPreferences: client.travel_preferences ? JSON.parse(client.travel_preferences) : [],
        notes: client.notes,
        marketingOptIn: !!client.marketing_opt_in,
        contactConsent: !!client.contact_consent,
        assignedUserId: client.assigned_user_id,
        assignedUserName: client.assigned_first_name ? `${client.assigned_first_name} ${client.assigned_last_name}` : null,
        createdAt: client.created_at,
        updatedAt: client.updated_at
      }
    });
  } catch (error) {
    console.error('[ERROR] Update client failed:', error.message);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

/**
 * DELETE /api/clients/:id
 * Delete a client (with cascade handling)
 */
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const clientId = req.params.id;

    const existing = db.prepare(
      'SELECT id FROM clients WHERE id = ? AND agency_id = ?'
    ).get(clientId, req.agencyId);

    if (!existing) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Check for associated trips
    const tripCount = db.prepare(
      'SELECT COUNT(*) as count FROM trips WHERE client_id = ? AND agency_id = ?'
    ).get(clientId, req.agencyId);

    db.prepare('DELETE FROM clients WHERE id = ? AND agency_id = ?').run(clientId, req.agencyId);

    res.json({
      message: 'Client deleted successfully',
      deletedId: clientId,
      associatedTrips: tripCount.count
    });
  } catch (error) {
    console.error('[ERROR] Delete client failed:', error.message);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

module.exports = router;
