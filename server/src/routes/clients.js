const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { getDb } = require('../config/database');
const { authenticate, tenantScope } = require('../middleware/auth');
const { validateClientFields, formatValidationErrors } = require('../utils/validation');

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
 * List all clients for the agency with optional search/filter and pagination
 */
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const {
      search,
      assignedTo,
      sortBy = 'created_at',
      sortOrder = 'desc',
      page = '1',
      limit = '10'
    } = req.query;

    // Parse pagination params
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (pageNum - 1) * limitNum;

    let baseQuery = `
      FROM clients c
      LEFT JOIN users u ON c.assigned_user_id = u.id
      WHERE c.agency_id = ?
    `;
    const params = [req.agencyId];

    if (search) {
      baseQuery += ` AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ? OR c.phone LIKE ? OR c.city LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (assignedTo) {
      baseQuery += ` AND c.assigned_user_id = ?`;
      params.push(assignedTo);
    }

    // Get total count first
    const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
    const countResult = db.prepare(countQuery).get(...params);
    const total = countResult.total;

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

    // Build final query with pagination
    const selectQuery = `
      SELECT c.*, u.first_name as assigned_first_name, u.last_name as assigned_last_name
      ${baseQuery}
      ORDER BY ${orderClause}
      LIMIT ? OFFSET ?
    `;
    const paginatedParams = [...params, limitNum, offset];
    const clients = db.prepare(selectQuery).all(...paginatedParams);

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limitNum);

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
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1
    });
  } catch (error) {
    console.error('[ERROR] List clients failed:', error.message);
    res.status(500).json({ error: 'Failed to list clients' });
  }
});

/**
 * GET /api/clients/export
 * Export all clients to CSV file
 */
router.get('/export', (req, res) => {
  try {
    const db = getDb();
    const { search, assignedTo } = req.query;

    // Build query with same filters as list endpoint
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

    query += ` ORDER BY c.last_name, c.first_name`;

    const clients = db.prepare(query).all(...params);

    // Build CSV content
    const headers = [
      'id',
      'first_name',
      'last_name',
      'email',
      'phone',
      'city',
      'state',
      'country',
      'preferred_communication',
      'travel_preferences',
      'notes',
      'marketing_opt_in',
      'contact_consent',
      'assigned_planner',
      'created_at',
      'updated_at'
    ];

    // Escape CSV field values (handle commas, quotes, newlines)
    const escapeCSV = (value) => {
      if (value === null || value === undefined) return '';
      const strValue = String(value);
      // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
      if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
        return `"${strValue.replace(/"/g, '""')}"`;
      }
      return strValue;
    };

    let csvContent = headers.join(',') + '\n';

    for (const client of clients) {
      const travelPrefs = client.travel_preferences ? JSON.parse(client.travel_preferences).join('; ') : '';
      const assignedPlanner = client.assigned_first_name
        ? `${client.assigned_first_name} ${client.assigned_last_name}`
        : '';

      const row = [
        client.id,
        escapeCSV(client.first_name),
        escapeCSV(client.last_name),
        escapeCSV(client.email),
        escapeCSV(client.phone),
        escapeCSV(client.city),
        escapeCSV(client.state),
        escapeCSV(client.country),
        escapeCSV(client.preferred_communication),
        escapeCSV(travelPrefs),
        escapeCSV(client.notes),
        client.marketing_opt_in ? 'true' : 'false',
        client.contact_consent ? 'true' : 'false',
        escapeCSV(assignedPlanner),
        client.created_at,
        client.updated_at
      ];
      csvContent += row.join(',') + '\n';
    }

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="clients-export.csv"');
    res.send(csvContent);

    console.log(`[INFO] CSV export: ${clients.length} clients exported for agency ${req.agencyId}`);
  } catch (error) {
    console.error('[ERROR] CSV export failed:', error.message);
    res.status(500).json({ error: 'Failed to export clients to CSV' });
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

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && !emailRegex.test(email.trim())) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    // Max length validation
    const lengthErrors = validateClientFields(req.body);
    if (lengthErrors.length > 0) {
      return res.status(400).json({ error: formatValidationErrors(lengthErrors) });
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
 * Supports optimistic concurrency control via updatedAt field
 */
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const clientId = req.params.id;

    // Verify client exists and belongs to agency - include updated_at for conflict detection
    const existing = db.prepare(
      'SELECT id, updated_at FROM clients WHERE id = ? AND agency_id = ?'
    ).get(clientId, req.agencyId);

    if (!existing) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const {
      firstName, lastName, email, phone,
      city, state, country,
      preferredCommunication, travelPreferences,
      notes, marketingOptIn, contactConsent,
      assignedUserId,
      updatedAt // Client sends the updatedAt from when they loaded the record
    } = req.body;

    // Optimistic concurrency control: check if record was modified since client loaded it
    if (updatedAt && existing.updated_at !== updatedAt) {
      console.log(`[WARN] Concurrent edit conflict for client ${clientId}: client has ${updatedAt}, server has ${existing.updated_at}`);
      return res.status(409).json({
        error: 'This record has been modified by another user. Please refresh and try again.',
        code: 'CONCURRENT_EDIT_CONFLICT',
        serverUpdatedAt: existing.updated_at,
        clientUpdatedAt: updatedAt
      });
    }

    // Max length validation
    const lengthErrors = validateClientFields(req.body);
    if (lengthErrors.length > 0) {
      return res.status(400).json({ error: formatValidationErrors(lengthErrors) });
    }

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
router.post('/import', (req, res) => {
  upload.single('file')(req, res, (uploadError) => {
    if (uploadError) {
      return res.status(400).json({ error: uploadError.message || 'File upload failed' });
    }

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

    // If there are no valid rows at all, return error
    if (clientsToInsert.length === 0 && validationErrors.length > 0) {
      return res.status(400).json({
        error: 'CSV validation failed - no valid rows to import',
        validationErrors,
        totalRows: records.length,
        validRows: 0,
        errorRows: validationErrors.length
      });
    }

    // Insert valid clients (partial import - continue even if some rows had errors)
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

    // Build response with import results
    const response = {
      message: validationErrors.length > 0
        ? `Partial import: ${insertedClients.length} imported, ${validationErrors.length} failed`
        : 'CSV import completed successfully',
      imported: insertedClients.length,
      clients: insertedClients,
      totalRows: records.length
    };

    // Include validation errors if any (partial success)
    if (validationErrors.length > 0) {
      response.validationErrors = validationErrors;
      response.errorRows = validationErrors.length;
    }

    res.status(201).json(response);
    } catch (error) {
      console.error('[ERROR] CSV import failed:', error.message);
      res.status(500).json({ error: 'Failed to import clients from CSV' });
    }
  });
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

/**
 * GET /api/clients/:id/portal
 * Get portal access status for a client
 */
router.get('/:id/portal', (req, res) => {
  try {
    const db = getDb();
    const clientId = req.params.id;

    // Verify client exists and belongs to agency
    const client = db.prepare(
      'SELECT id, email FROM clients WHERE id = ? AND agency_id = ?'
    ).get(clientId, req.agencyId);

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Check for existing customer portal account
    const customer = db.prepare(
      'SELECT id, email, is_active, created_at FROM customers WHERE client_id = ? AND agency_id = ?'
    ).get(clientId, req.agencyId);

    res.json({
      clientId: parseInt(clientId),
      hasPortalAccess: !!customer,
      portalAccount: customer ? {
        id: customer.id,
        email: customer.email,
        isActive: !!customer.is_active,
        createdAt: customer.created_at
      } : null
    });
  } catch (error) {
    console.error('[ERROR] Get portal status failed:', error.message);
    res.status(500).json({ error: 'Failed to get portal status' });
  }
});

/**
 * POST /api/clients/:id/portal
 * Create portal access for a client (enables portal access)
 */
router.post('/:id/portal', (req, res) => {
  try {
    const db = getDb();
    const bcrypt = require('bcryptjs');
    const clientId = req.params.id;
    const { email, password } = req.body;

    // Verify client exists and belongs to agency
    const client = db.prepare(
      'SELECT id, email, first_name, last_name FROM clients WHERE id = ? AND agency_id = ?'
    ).get(clientId, req.agencyId);

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Check if customer account already exists for this client
    const existingByClient = db.prepare(
      'SELECT id FROM customers WHERE client_id = ? AND agency_id = ?'
    ).get(clientId, req.agencyId);

    if (existingByClient) {
      return res.status(409).json({ error: 'Portal account already exists for this client' });
    }

    // Use provided email or client's email
    const portalEmail = email || client.email;
    if (!portalEmail) {
      return res.status(400).json({ error: 'Email is required. Either provide an email or ensure client has an email on file.' });
    }

    // Check if email is already used by another customer
    const existingByEmail = db.prepare(
      'SELECT id FROM customers WHERE email = ?'
    ).get(portalEmail);

    if (existingByEmail) {
      return res.status(409).json({ error: 'This email is already registered for portal access' });
    }

    // Validate password
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);

    const result = db.prepare(
      'INSERT INTO customers (agency_id, client_id, email, password_hash, is_active) VALUES (?, ?, ?, ?, 1)'
    ).run(req.agencyId, clientId, portalEmail, passwordHash);

    const customer = db.prepare(
      'SELECT id, email, is_active, created_at FROM customers WHERE id = ?'
    ).get(result.lastInsertRowid);

    console.log(`[INFO] Portal access enabled for client ${clientId} by user ${req.user.id}`);

    res.status(201).json({
      message: 'Portal access enabled successfully',
      portalAccount: {
        id: customer.id,
        email: customer.email,
        isActive: !!customer.is_active,
        createdAt: customer.created_at
      }
    });
  } catch (error) {
    console.error('[ERROR] Create portal access failed:', error.message);
    res.status(500).json({ error: 'Failed to create portal access' });
  }
});

/**
 * PUT /api/clients/:id/portal
 * Toggle portal access for a client (enable/disable)
 */
router.put('/:id/portal', (req, res) => {
  try {
    const db = getDb();
    const clientId = req.params.id;
    const { isActive } = req.body;

    // Verify client exists and belongs to agency
    const client = db.prepare(
      'SELECT id FROM clients WHERE id = ? AND agency_id = ?'
    ).get(clientId, req.agencyId);

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Check for existing customer portal account
    const customer = db.prepare(
      'SELECT id, email, is_active FROM customers WHERE client_id = ? AND agency_id = ?'
    ).get(clientId, req.agencyId);

    if (!customer) {
      return res.status(404).json({ error: 'No portal account exists for this client. Create one first.' });
    }

    // Update is_active status
    const newStatus = isActive ? 1 : 0;
    db.prepare(
      'UPDATE customers SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(newStatus, customer.id);

    console.log(`[INFO] Portal access ${isActive ? 'enabled' : 'disabled'} for client ${clientId} by user ${req.user.id}`);

    res.json({
      message: isActive ? 'Portal access enabled' : 'Portal access disabled',
      portalAccount: {
        id: customer.id,
        email: customer.email,
        isActive: !!newStatus
      }
    });
  } catch (error) {
    console.error('[ERROR] Toggle portal access failed:', error.message);
    res.status(500).json({ error: 'Failed to update portal access' });
  }
});

/**
 * DELETE /api/clients/:id/portal
 * Remove portal access for a client (deletes customer account)
 */
router.delete('/:id/portal', (req, res) => {
  try {
    const db = getDb();
    const clientId = req.params.id;

    // Verify client exists and belongs to agency
    const client = db.prepare(
      'SELECT id FROM clients WHERE id = ? AND agency_id = ?'
    ).get(clientId, req.agencyId);

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Check for existing customer portal account
    const customer = db.prepare(
      'SELECT id FROM customers WHERE client_id = ? AND agency_id = ?'
    ).get(clientId, req.agencyId);

    if (!customer) {
      return res.status(404).json({ error: 'No portal account exists for this client' });
    }

    db.prepare('DELETE FROM customers WHERE id = ?').run(customer.id);

    console.log(`[INFO] Portal account deleted for client ${clientId} by user ${req.user.id}`);

    res.json({
      message: 'Portal account removed successfully',
      deletedCustomerId: customer.id
    });
  } catch (error) {
    console.error('[ERROR] Delete portal access failed:', error.message);
    res.status(500).json({ error: 'Failed to remove portal access' });
  }
});

module.exports = router;
