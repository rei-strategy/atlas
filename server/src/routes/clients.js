const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { getDb } = require('../config/database');
const { authenticate, tenantScope } = require('../middleware/auth');

// Configure multer for CSV file uploads (in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

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
    const allowedSortCols = ['first_name', 'last_name', 'email', 'created_at', 'updated_at', 'name', 'planner', 'activity'];
    const safeSortBy = allowedSortCols.includes(sortBy) ? sortBy : 'created_at';
    const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

    // Handle composite and custom sort columns
    let orderClause;
    if (safeSortBy === 'name') {
      orderClause = `c.last_name ${safeSortOrder}, c.first_name ${safeSortOrder}`;
    } else if (safeSortBy === 'planner') {
      orderClause = `u.last_name ${safeSortOrder}, u.first_name ${safeSortOrder}`;
    } else if (safeSortBy === 'activity') {
      orderClause = `c.updated_at ${safeSortOrder}`;
    } else {
      orderClause = `c.${safeSortBy} ${safeSortOrder}`;
    }
    query += ` ORDER BY ${orderClause}`;

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

/**
 * POST /api/clients/import
 * Import clients from CSV file
 *
 * Expected CSV columns (case-insensitive, with common variations):
 * - first_name / firstName / first name
 * - last_name / lastName / last name
 * - email
 * - phone
 * - city
 * - state
 * - country
 * - preferred_communication / preferredCommunication
 * - notes
 * - marketing_opt_in / marketingOptIn (true/false, yes/no, 1/0)
 * - contact_consent / contactConsent (true/false, yes/no, 1/0)
 */
router.post('/import', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file provided' });
    }

    const db = getDb();
    const csvContent = req.file.buffer.toString('utf-8');

    // Parse CSV
    let records;
    try {
      records = parse(csvContent, {
        columns: true, // Use first row as headers
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true
      });
    } catch (parseError) {
      return res.status(400).json({
        error: 'Invalid CSV format',
        details: parseError.message
      });
    }

    if (records.length === 0) {
      return res.status(400).json({ error: 'CSV file is empty or has no data rows' });
    }

    // Normalize column names to handle common variations
    const normalizeColumn = (col) => {
      return col.toLowerCase().replace(/[_\s]/g, '');
    };

    const columnMap = {
      'firstname': 'firstName',
      'lastname': 'lastName',
      'email': 'email',
      'phone': 'phone',
      'city': 'city',
      'state': 'state',
      'country': 'country',
      'preferredcommunication': 'preferredCommunication',
      'notes': 'notes',
      'marketingoptin': 'marketingOptIn',
      'contactconsent': 'contactConsent'
    };

    // Parse boolean values
    const parseBoolean = (value) => {
      if (!value) return false;
      const v = value.toString().toLowerCase().trim();
      return ['true', 'yes', '1', 'y'].includes(v);
    };

    // Process records and validate
    const validationErrors = [];
    const clientsToInsert = [];
    const existingEmails = new Set();

    // Get existing emails in agency
    const existingClients = db.prepare(
      'SELECT email FROM clients WHERE agency_id = ? AND email IS NOT NULL'
    ).all(req.agencyId);
    existingClients.forEach(c => existingEmails.add(c.email.toLowerCase()));

    records.forEach((record, index) => {
      const rowNum = index + 2; // +2 because row 1 is header, and 0-indexed
      const rowErrors = [];

      // Map CSV columns to client fields
      const clientData = {};
      Object.keys(record).forEach(col => {
        const normalizedCol = normalizeColumn(col);
        if (columnMap[normalizedCol]) {
          clientData[columnMap[normalizedCol]] = record[col];
        }
      });

      // Validate required fields
      if (!clientData.firstName || !clientData.firstName.trim()) {
        rowErrors.push('First name is required');
      }
      if (!clientData.lastName || !clientData.lastName.trim()) {
        rowErrors.push('Last name is required');
      }

      // Check email uniqueness
      if (clientData.email && clientData.email.trim()) {
        const email = clientData.email.trim().toLowerCase();
        if (existingEmails.has(email)) {
          rowErrors.push(`Email "${clientData.email}" already exists`);
        } else {
          // Add to set to prevent duplicates within the CSV
          existingEmails.add(email);
        }
      }

      if (rowErrors.length > 0) {
        validationErrors.push({
          row: rowNum,
          errors: rowErrors,
          data: { firstName: clientData.firstName, lastName: clientData.lastName, email: clientData.email }
        });
      } else {
        clientsToInsert.push({
          firstName: clientData.firstName.trim(),
          lastName: clientData.lastName.trim(),
          email: clientData.email ? clientData.email.trim() : null,
          phone: clientData.phone ? clientData.phone.trim() : null,
          city: clientData.city ? clientData.city.trim() : null,
          state: clientData.state ? clientData.state.trim() : null,
          country: clientData.country ? clientData.country.trim() : null,
          preferredCommunication: clientData.preferredCommunication ? clientData.preferredCommunication.trim() : null,
          notes: clientData.notes ? clientData.notes.trim() : null,
          marketingOptIn: parseBoolean(clientData.marketingOptIn),
          contactConsent: parseBoolean(clientData.contactConsent)
        });
      }
    });

    // If there are validation errors, return them without importing
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'CSV validation failed',
        validationErrors,
        totalRows: records.length,
        validRows: clientsToInsert.length,
        errorRows: validationErrors.length
      });
    }

    // Insert all valid clients
    const insertStmt = db.prepare(`
      INSERT INTO clients (
        agency_id, assigned_user_id, first_name, last_name, email, phone,
        city, state, country, preferred_communication, travel_preferences,
        notes, marketing_opt_in, contact_consent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertedClients = [];
    const insertTransaction = db.transaction((clients) => {
      for (const client of clients) {
        const result = insertStmt.run(
          req.agencyId,
          req.user.id, // Assign to importing user
          client.firstName,
          client.lastName,
          client.email,
          client.phone,
          client.city,
          client.state,
          client.country,
          client.preferredCommunication,
          null, // travel_preferences (not in CSV)
          client.notes,
          client.marketingOptIn ? 1 : 0,
          client.contactConsent ? 1 : 0
        );
        insertedClients.push({
          id: result.lastInsertRowid,
          firstName: client.firstName,
          lastName: client.lastName,
          email: client.email
        });
      }
    });

    insertTransaction(clientsToInsert);

    console.log(`[INFO] CSV import: ${insertedClients.length} clients imported for agency ${req.agencyId}`);

    res.status(201).json({
      message: 'CSV import completed successfully',
      imported: insertedClients.length,
      clients: insertedClients
    });
  } catch (error) {
    console.error('[ERROR] CSV import failed:', error.message);
    res.status(500).json({ error: 'Failed to import clients from CSV' });
  }
});

/**
 * GET /api/clients/import/template
 * Download a CSV template for client import
 */
router.get('/import/template', (req, res) => {
  const csvTemplate = 'first_name,last_name,email,phone,city,state,country,preferred_communication,notes,marketing_opt_in,contact_consent\nJohn,Doe,john.doe@example.com,555-123-4567,New York,NY,USA,Email,Sample notes,true,true\nJane,Smith,jane.smith@example.com,555-987-6543,Los Angeles,CA,USA,Phone,Another note,false,true\n';

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="client-import-template.csv"');
  res.send(csvTemplate);
});

module.exports = router;
