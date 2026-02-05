const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../config/database');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'atlas-dev-secret-change-in-production';
const JWT_EXPIRES_IN = '24h';

/**
 * Generate a customer-specific JWT token
 */
function generateCustomerToken(customer) {
  return jwt.sign(
    {
      id: customer.id,
      email: customer.email,
      role: 'customer',
      agency_id: customer.agency_id,
      client_id: customer.client_id
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Customer authentication middleware
 */
function authenticateCustomer(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'customer') {
      return res.status(403).json({ error: 'Portal access only. Use customer login.' });
    }
    req.customer = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * POST /api/portal/auth/login
 * Customer login for portal access
 */
router.post('/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const db = getDb();

    // Find customer by email
    const customer = db.prepare(
      'SELECT id, agency_id, client_id, email, password_hash, is_active FROM customers WHERE email = ?'
    ).get(email);

    if (!customer) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!customer.is_active) {
      return res.status(403).json({ error: 'Your portal access has been disabled. Please contact your travel planner.' });
    }

    // Verify password
    const validPassword = bcrypt.compareSync(password, customer.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Get client details
    const client = db.prepare(
      'SELECT id, first_name, last_name, email FROM clients WHERE id = ?'
    ).get(customer.client_id);

    // Get agency info
    const agency = db.prepare(
      'SELECT id, name, logo_url, primary_color FROM agencies WHERE id = ?'
    ).get(customer.agency_id);

    const token = generateCustomerToken(customer);

    res.json({
      message: 'Login successful',
      token,
      customer: {
        id: customer.id,
        email: customer.email,
        clientId: customer.client_id,
        clientName: client ? `${client.first_name} ${client.last_name}` : null,
        agencyId: customer.agency_id,
        agencyName: agency ? agency.name : null
      }
    });
  } catch (error) {
    console.error('[ERROR] Customer login failed:', error.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/portal/auth/register
 * Create a customer portal account (called by planner or self-registration)
 */
router.post('/auth/register', (req, res) => {
  try {
    const { email, password, clientId, agencyId } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    if (!clientId || !agencyId) {
      return res.status(400).json({ error: 'Client ID and Agency ID are required' });
    }

    const db = getDb();

    // Check if email already exists
    const existingCustomer = db.prepare('SELECT id FROM customers WHERE email = ?').get(email);
    if (existingCustomer) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Verify the client and agency exist
    const client = db.prepare('SELECT id, agency_id FROM clients WHERE id = ? AND agency_id = ?').get(clientId, agencyId);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);

    const result = db.prepare(
      'INSERT INTO customers (agency_id, client_id, email, password_hash, is_active) VALUES (?, ?, ?, ?, 1)'
    ).run(agencyId, clientId, email, passwordHash);

    const customerId = result.lastInsertRowid;

    const customer = db.prepare(
      'SELECT id, agency_id, client_id, email, is_active, created_at FROM customers WHERE id = ?'
    ).get(customerId);

    const token = generateCustomerToken(customer);

    res.status(201).json({
      message: 'Customer account created successfully',
      token,
      customer: {
        id: customer.id,
        email: customer.email,
        clientId: customer.client_id,
        agencyId: customer.agency_id
      }
    });
  } catch (error) {
    console.error('[ERROR] Customer registration failed:', error.message);
    res.status(500).json({ error: 'Registration failed', message: error.message });
  }
});

/**
 * GET /api/portal/me
 * Get current customer profile
 */
router.get('/me', authenticateCustomer, (req, res) => {
  try {
    const db = getDb();

    const customer = db.prepare(
      'SELECT id, agency_id, client_id, email, is_active, created_at FROM customers WHERE id = ? AND agency_id = ?'
    ).get(req.customer.id, req.customer.agency_id);

    if (!customer || !customer.is_active) {
      return res.status(404).json({ error: 'Customer account not found or disabled' });
    }

    // Get client details
    const client = db.prepare(
      'SELECT id, first_name, last_name, email, phone FROM clients WHERE id = ?'
    ).get(customer.client_id);

    // Get agency info
    const agency = db.prepare(
      'SELECT id, name, logo_url, primary_color FROM agencies WHERE id = ?'
    ).get(customer.agency_id);

    res.json({
      customer: {
        id: customer.id,
        email: customer.email,
        clientId: customer.client_id,
        clientName: client ? `${client.first_name} ${client.last_name}` : null,
        agencyId: customer.agency_id
      },
      agency: agency ? {
        id: agency.id,
        name: agency.name,
        logoUrl: agency.logo_url,
        primaryColor: agency.primary_color
      } : null
    });
  } catch (error) {
    console.error('[ERROR] Get customer profile failed:', error.message);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

/**
 * GET /api/portal/trips
 * Get only the customer's own trips
 */
router.get('/trips', authenticateCustomer, (req, res) => {
  try {
    const db = getDb();

    const trips = db.prepare(`
      SELECT t.id, t.name, t.destination, t.description, t.stage,
        t.travel_start_date, t.travel_end_date, t.created_at
      FROM trips t
      WHERE t.client_id = ? AND t.agency_id = ?
        AND t.stage NOT IN ('canceled', 'archived')
      ORDER BY t.travel_start_date ASC
    `).all(req.customer.client_id, req.customer.agency_id);

    res.json({
      trips: trips.map(t => ({
        id: t.id,
        name: t.name,
        destination: t.destination,
        description: t.description,
        stage: t.stage,
        travelStartDate: t.travel_start_date,
        travelEndDate: t.travel_end_date,
        createdAt: t.created_at
      }))
    });
  } catch (error) {
    console.error('[ERROR] Get customer trips failed:', error.message);
    res.status(500).json({ error: 'Failed to get trips' });
  }
});

/**
 * GET /api/portal/trips/:id
 * Get a single trip (only if it belongs to this customer)
 */
router.get('/trips/:id', authenticateCustomer, (req, res) => {
  try {
    const db = getDb();

    const trip = db.prepare(`
      SELECT t.id, t.name, t.destination, t.description, t.stage,
        t.travel_start_date, t.travel_end_date, t.created_at
      FROM trips t
      WHERE t.id = ? AND t.client_id = ? AND t.agency_id = ?
    `).get(req.params.id, req.customer.client_id, req.customer.agency_id);

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // Get travelers for this trip
    const travelers = db.prepare(
      'SELECT id, full_legal_name, date_of_birth, passport_status, passport_expiration, special_needs, relationship_to_client, created_at, updated_at FROM travelers WHERE trip_id = ?'
    ).all(trip.id);

    // Get bookings for this trip (limited fields, no internal notes)
    const bookings = db.prepare(`
      SELECT id, booking_type, supplier_name, status, confirmation_number,
        travel_start_date, travel_end_date, total_cost,
        deposit_amount, deposit_paid, final_payment_amount, final_payment_due_date, payment_status
      FROM bookings WHERE trip_id = ? AND agency_id = ?
    `).all(trip.id, req.customer.agency_id);

    // Get client-visible documents
    const documents = db.prepare(`
      SELECT id, document_type, file_name, is_sensitive, created_at
      FROM documents
      WHERE trip_id = ? AND agency_id = ? AND is_client_visible = 1 AND is_sensitive = 0
    `).all(trip.id, req.customer.agency_id);

    res.json({
      trip: {
        id: trip.id,
        name: trip.name,
        destination: trip.destination,
        description: trip.description,
        stage: trip.stage,
        travelStartDate: trip.travel_start_date,
        travelEndDate: trip.travel_end_date,
        createdAt: trip.created_at
      },
      travelers: travelers.map(tv => ({
        id: tv.id,
        fullLegalName: tv.full_legal_name,
        dateOfBirth: tv.date_of_birth,
        passportStatus: tv.passport_status,
        passportExpiration: tv.passport_expiration,
        specialNeeds: tv.special_needs,
        relationshipToClient: tv.relationship_to_client,
        createdAt: tv.created_at,
        updatedAt: tv.updated_at
      })),
      bookings: bookings.map(b => ({
        id: b.id,
        bookingType: b.booking_type,
        supplierName: b.supplier_name,
        status: b.status,
        confirmationNumber: b.confirmation_number,
        travelStartDate: b.travel_start_date,
        travelEndDate: b.travel_end_date,
        totalCost: b.total_cost,
        depositAmount: b.deposit_amount,
        depositPaid: !!b.deposit_paid,
        finalPaymentAmount: b.final_payment_amount,
        finalPaymentDueDate: b.final_payment_due_date,
        paymentStatus: b.payment_status
      })),
      documents: documents.map(d => ({
        id: d.id,
        documentType: d.document_type,
        fileName: d.file_name,
        createdAt: d.created_at
      }))
    });
  } catch (error) {
    console.error('[ERROR] Get customer trip detail failed:', error.message);
    res.status(500).json({ error: 'Failed to get trip details' });
  }
});

/**
 * POST /api/portal/trips/:id/travelers
 * Customer submits traveler information for their trip
 */
router.post('/trips/:id/travelers', authenticateCustomer, (req, res) => {
  try {
    const db = getDb();
    const tripId = req.params.id;

    // Verify trip belongs to this customer
    const trip = db.prepare(
      'SELECT id FROM trips WHERE id = ? AND client_id = ? AND agency_id = ?'
    ).get(tripId, req.customer.client_id, req.customer.agency_id);

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
      message: 'Traveler information submitted successfully',
      traveler: {
        id: traveler.id,
        fullLegalName: traveler.full_legal_name,
        dateOfBirth: traveler.date_of_birth,
        passportStatus: traveler.passport_status,
        passportExpiration: traveler.passport_expiration,
        specialNeeds: traveler.special_needs,
        relationshipToClient: traveler.relationship_to_client,
        createdAt: traveler.created_at
      }
    });
  } catch (error) {
    console.error('[ERROR] Submit traveler info failed:', error.message);
    res.status(500).json({ error: 'Failed to submit traveler information' });
  }
});

/**
 * PUT /api/portal/trips/:tripId/travelers/:id
 * Customer updates traveler information
 */
router.put('/trips/:tripId/travelers/:id', authenticateCustomer, (req, res) => {
  try {
    const db = getDb();
    const { tripId, id } = req.params;

    // Verify trip belongs to this customer
    const trip = db.prepare(
      'SELECT id FROM trips WHERE id = ? AND client_id = ? AND agency_id = ?'
    ).get(tripId, req.customer.client_id, req.customer.agency_id);

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
      message: 'Traveler information updated',
      traveler: {
        id: updated.id,
        fullLegalName: updated.full_legal_name,
        dateOfBirth: updated.date_of_birth,
        passportStatus: updated.passport_status,
        passportExpiration: updated.passport_expiration,
        specialNeeds: updated.special_needs,
        relationshipToClient: updated.relationship_to_client,
        updatedAt: updated.updated_at
      }
    });
  } catch (error) {
    console.error('[ERROR] Update traveler info failed:', error.message);
    res.status(500).json({ error: 'Failed to update traveler information' });
  }
});

/**
 * POST /api/portal/trips/:id/documents
 * Customer uploads a document to their trip
 */
router.post('/trips/:id/documents', authenticateCustomer, (req, res) => {
  try {
    const db = getDb();
    const tripId = req.params.id;

    // Verify trip belongs to this customer
    const trip = db.prepare(
      'SELECT id FROM trips WHERE id = ? AND client_id = ? AND agency_id = ?'
    ).get(tripId, req.customer.client_id, req.customer.agency_id);

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const { fileName, documentType, filePath } = req.body;

    if (!fileName) {
      return res.status(400).json({ error: 'File name is required' });
    }

    const result = db.prepare(`
      INSERT INTO documents (agency_id, trip_id, document_type, file_name, file_path, is_sensitive, is_client_visible, uploaded_by)
      VALUES (?, ?, ?, ?, ?, 0, 1, NULL)
    `).run(
      req.customer.agency_id,
      tripId,
      documentType || 'other',
      fileName,
      filePath || `/uploads/${Date.now()}_${fileName}`
    );

    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      message: 'Document uploaded successfully',
      document: {
        id: doc.id,
        documentType: doc.document_type,
        fileName: doc.file_name,
        createdAt: doc.created_at
      }
    });
  } catch (error) {
    console.error('[ERROR] Customer document upload failed:', error.message);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

/**
 * GET /api/portal/trips/:id/documents
 * Get documents visible to the customer for a trip
 */
router.get('/trips/:id/documents', authenticateCustomer, (req, res) => {
  try {
    const db = getDb();
    const tripId = req.params.id;

    // Verify trip belongs to this customer
    const trip = db.prepare(
      'SELECT id FROM trips WHERE id = ? AND client_id = ? AND agency_id = ?'
    ).get(tripId, req.customer.client_id, req.customer.agency_id);

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const documents = db.prepare(`
      SELECT id, document_type, file_name, is_sensitive, created_at
      FROM documents
      WHERE trip_id = ? AND agency_id = ? AND is_client_visible = 1 AND is_sensitive = 0
    `).all(tripId, req.customer.agency_id);

    res.json({
      documents: documents.map(d => ({
        id: d.id,
        documentType: d.document_type,
        fileName: d.file_name,
        createdAt: d.created_at
      }))
    });
  } catch (error) {
    console.error('[ERROR] Get customer documents failed:', error.message);
    res.status(500).json({ error: 'Failed to get documents' });
  }
});

/**
 * POST /api/portal/trips/:id/feedback
 * Customer submits post-trip feedback
 */
router.post('/trips/:id/feedback', authenticateCustomer, (req, res) => {
  try {
    const db = getDb();
    const tripId = req.params.id;

    const trip = db.prepare(
      'SELECT id FROM trips WHERE id = ? AND client_id = ? AND agency_id = ?'
    ).get(tripId, req.customer.client_id, req.customer.agency_id);

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const { rating, comments } = req.body;

    // Store feedback as a document of type 'feedback'
    const result = db.prepare(`
      INSERT INTO documents (agency_id, trip_id, document_type, file_name, file_path, is_sensitive, is_client_visible, uploaded_by)
      VALUES (?, ?, 'feedback', ?, ?, 0, 1, NULL)
    `).run(
      req.customer.agency_id,
      tripId,
      `Feedback - Rating: ${rating || 'N/A'}`,
      JSON.stringify({ rating, comments, submittedAt: new Date().toISOString() })
    );

    res.status(201).json({
      message: 'Feedback submitted successfully',
      feedbackId: result.lastInsertRowid
    });
  } catch (error) {
    console.error('[ERROR] Submit feedback failed:', error.message);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

module.exports = router;
