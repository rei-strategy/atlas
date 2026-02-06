const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../config/database');

const router = express.Router();

// File upload configuration for customer portal
const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `customer_${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    // Allow common document types
    const allowedTypes = /pdf|doc|docx|xls|xlsx|txt|csv|jpg|jpeg|png|gif|html/;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    if (allowedTypes.test(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: PDF, Word, Excel, images, text, HTML files'));
    }
  }
});

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
      'SELECT id, name, logo_url, primary_color, timezone FROM agencies WHERE id = ?'
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
        primaryColor: agency.primary_color,
        timezone: agency.timezone
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
 * Supports actual file upload via multipart/form-data
 */
router.post('/trips/:id/documents', authenticateCustomer, upload.single('file'), (req, res) => {
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

    // Support both file upload and metadata-only
    let fileName, filePath;
    if (req.file) {
      fileName = req.file.originalname;
      filePath = `/uploads/${req.file.filename}`;
    } else {
      // Metadata-only fallback
      fileName = req.body.fileName;
      if (!fileName) {
        return res.status(400).json({ error: 'File is required' });
      }
      filePath = req.body.filePath || `/uploads/${Date.now()}_${fileName}`;
    }

    const documentType = req.body.documentType || 'other';

    const result = db.prepare(`
      INSERT INTO documents (agency_id, trip_id, document_type, file_name, file_path, is_sensitive, is_client_visible, uploaded_by)
      VALUES (?, ?, ?, ?, ?, 0, 1, NULL)
    `).run(
      req.customer.agency_id,
      tripId,
      documentType,
      fileName,
      filePath
    );

    // Log customer upload in audit
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id)
      VALUES (?, NULL, ?, ?, ?, ?, ?)
    `).run(
      req.customer.agency_id,
      'customer_document_upload',
      'document',
      result.lastInsertRowid,
      JSON.stringify({ fileName, documentType, customerEmail: req.customer.email }),
      tripId
    );

    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      message: 'Document uploaded successfully',
      document: {
        id: doc.id,
        documentType: doc.document_type,
        fileName: doc.file_name,
        filePath: doc.file_path,
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
 * GET /api/portal/trips/:tripId/documents/:docId/download
 * Download a document (only client-facing, non-sensitive)
 */
router.get('/trips/:tripId/documents/:docId/download', authenticateCustomer, (req, res) => {
  try {
    const db = getDb();
    const { tripId, docId } = req.params;

    // Verify trip belongs to this customer
    const trip = db.prepare(
      'SELECT id FROM trips WHERE id = ? AND client_id = ? AND agency_id = ?'
    ).get(tripId, req.customer.client_id, req.customer.agency_id);

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // Get document - must be client visible AND not sensitive
    const doc = db.prepare(`
      SELECT id, document_type, file_name, file_path, is_sensitive, is_client_visible
      FROM documents
      WHERE id = ? AND trip_id = ? AND agency_id = ?
    `).get(docId, tripId, req.customer.agency_id);

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Security check: customers can only download client-visible, non-sensitive docs
    if (!doc.is_client_visible) {
      return res.status(403).json({ error: 'This document is not available in the customer portal' });
    }

    if (doc.is_sensitive) {
      return res.status(403).json({ error: 'Sensitive documents cannot be downloaded through the portal' });
    }

    // Log the download for audit purposes
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.customer.agency_id,
      null, // no user_id for customer downloads
      'portal_document_download',
      'document',
      doc.id,
      JSON.stringify({
        fileName: doc.file_name,
        documentType: doc.document_type,
        downloadedBy: req.customer.email,
        customerId: req.customer.id,
        clientId: req.customer.client_id
      }),
      tripId
    );

    // Try to serve the actual file
    const path = require('path');
    const fs = require('fs');
    const UPLOAD_DIR = path.join(__dirname, '../../uploads');

    // Handle different file path formats
    let filePath;
    if (doc.file_path.startsWith('/generated/')) {
      filePath = path.join(UPLOAD_DIR, doc.file_path.replace('/generated/', 'generated/'));
    } else {
      const storedFileName = doc.file_path.replace('/uploads/', '');
      filePath = path.join(UPLOAD_DIR, storedFileName);
    }

    // Check if file exists on disk
    if (fs.existsSync(filePath)) {
      res.download(filePath, doc.file_name);
    } else {
      // File doesn't exist on disk - return metadata (for testing/demo)
      res.json({
        message: 'Download initiated',
        document: {
          id: doc.id,
          documentType: doc.document_type,
          fileName: doc.file_name
        }
      });
    }
  } catch (error) {
    console.error('[ERROR] Portal document download failed:', error.message);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

/**
 * GET /api/portal/trips/:id/feedback
 * Get feedback for a trip (if already submitted)
 */
router.get('/trips/:id/feedback', authenticateCustomer, (req, res) => {
  try {
    const db = getDb();
    const tripId = req.params.id;

    // Verify trip belongs to this customer
    const trip = db.prepare(
      'SELECT id, stage FROM trips WHERE id = ? AND client_id = ? AND agency_id = ?'
    ).get(tripId, req.customer.client_id, req.customer.agency_id);

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // Get existing feedback
    const feedback = db.prepare(`
      SELECT id, overall_rating, service_rating, destination_rating, accommodations_rating,
        would_recommend, highlights, improvements, comments, created_at, updated_at
      FROM trip_feedback
      WHERE trip_id = ? AND agency_id = ?
    `).get(tripId, req.customer.agency_id);

    res.json({
      tripStage: trip.stage,
      canSubmitFeedback: trip.stage === 'completed',
      feedback: feedback ? {
        id: feedback.id,
        overallRating: feedback.overall_rating,
        serviceRating: feedback.service_rating,
        destinationRating: feedback.destination_rating,
        accommodationsRating: feedback.accommodations_rating,
        wouldRecommend: !!feedback.would_recommend,
        highlights: feedback.highlights,
        improvements: feedback.improvements,
        comments: feedback.comments,
        createdAt: feedback.created_at,
        updatedAt: feedback.updated_at
      } : null
    });
  } catch (error) {
    console.error('[ERROR] Get feedback failed:', error.message);
    res.status(500).json({ error: 'Failed to get feedback' });
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
      'SELECT id, stage FROM trips WHERE id = ? AND client_id = ? AND agency_id = ?'
    ).get(tripId, req.customer.client_id, req.customer.agency_id);

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // Only allow feedback for completed trips
    if (trip.stage !== 'completed') {
      return res.status(400).json({
        error: 'Feedback can only be submitted for completed trips',
        tripStage: trip.stage
      });
    }

    // Check if feedback already exists
    const existingFeedback = db.prepare(
      'SELECT id FROM trip_feedback WHERE trip_id = ? AND agency_id = ?'
    ).get(tripId, req.customer.agency_id);

    if (existingFeedback) {
      return res.status(409).json({
        error: 'Feedback has already been submitted for this trip',
        feedbackId: existingFeedback.id
      });
    }

    const {
      overallRating,
      serviceRating,
      destinationRating,
      accommodationsRating,
      wouldRecommend,
      highlights,
      improvements,
      comments
    } = req.body;

    if (!overallRating || overallRating < 1 || overallRating > 5) {
      return res.status(400).json({ error: 'Overall rating (1-5) is required' });
    }

    // Insert feedback into dedicated table
    const result = db.prepare(`
      INSERT INTO trip_feedback (
        agency_id, trip_id, client_id, customer_id,
        overall_rating, service_rating, destination_rating, accommodations_rating,
        would_recommend, highlights, improvements, comments
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.customer.agency_id,
      tripId,
      req.customer.client_id,
      req.customer.id,
      overallRating,
      serviceRating || null,
      destinationRating || null,
      accommodationsRating || null,
      wouldRecommend ? 1 : 0,
      highlights || null,
      improvements || null,
      comments || null
    );

    // Log feedback submission in audit
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id, client_id)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
    `).run(
      req.customer.agency_id,
      'feedback_submitted',
      'trip_feedback',
      result.lastInsertRowid,
      JSON.stringify({
        overallRating,
        customerEmail: req.customer.email,
        submittedAt: new Date().toISOString()
      }),
      tripId,
      req.customer.client_id
    );

    const feedback = db.prepare('SELECT * FROM trip_feedback WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      message: 'Thank you for your feedback!',
      feedback: {
        id: feedback.id,
        overallRating: feedback.overall_rating,
        serviceRating: feedback.service_rating,
        destinationRating: feedback.destination_rating,
        accommodationsRating: feedback.accommodations_rating,
        wouldRecommend: !!feedback.would_recommend,
        highlights: feedback.highlights,
        improvements: feedback.improvements,
        comments: feedback.comments,
        createdAt: feedback.created_at
      }
    });
  } catch (error) {
    console.error('[ERROR] Submit feedback failed:', error.message);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

/**
 * GET /api/portal/acknowledgments
 * Get all pending acknowledgments for the customer
 */
router.get('/acknowledgments', authenticateCustomer, (req, res) => {
  try {
    const db = getDb();

    const acknowledgments = db.prepare(`
      SELECT a.id, a.trip_id, a.title, a.description, a.acknowledgment_type,
        a.is_acknowledged, a.acknowledged_at, a.created_at,
        t.name as trip_name, t.destination as trip_destination
      FROM acknowledgments a
      JOIN trips t ON a.trip_id = t.id
      WHERE a.client_id = ? AND a.agency_id = ?
      ORDER BY a.is_acknowledged ASC, a.created_at DESC
    `).all(req.customer.client_id, req.customer.agency_id);

    const pending = acknowledgments.filter(a => !a.is_acknowledged);
    const acknowledged = acknowledgments.filter(a => a.is_acknowledged);

    res.json({
      pendingCount: pending.length,
      acknowledgments: acknowledgments.map(a => ({
        id: a.id,
        tripId: a.trip_id,
        tripName: a.trip_name,
        tripDestination: a.trip_destination,
        title: a.title,
        description: a.description,
        type: a.acknowledgment_type,
        isAcknowledged: !!a.is_acknowledged,
        acknowledgedAt: a.acknowledged_at,
        createdAt: a.created_at
      }))
    });
  } catch (error) {
    console.error('[ERROR] Get acknowledgments failed:', error.message);
    res.status(500).json({ error: 'Failed to get acknowledgments' });
  }
});

/**
 * GET /api/portal/trips/:id/acknowledgments
 * Get acknowledgments for a specific trip
 */
router.get('/trips/:id/acknowledgments', authenticateCustomer, (req, res) => {
  try {
    const db = getDb();
    const tripId = req.params.id;

    // Verify trip belongs to customer
    const trip = db.prepare(
      'SELECT id FROM trips WHERE id = ? AND client_id = ? AND agency_id = ?'
    ).get(tripId, req.customer.client_id, req.customer.agency_id);

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const acknowledgments = db.prepare(`
      SELECT id, title, description, acknowledgment_type, is_acknowledged,
        acknowledged_at, document_id, created_at
      FROM acknowledgments
      WHERE trip_id = ? AND agency_id = ?
      ORDER BY is_acknowledged ASC, created_at DESC
    `).all(tripId, req.customer.agency_id);

    res.json({
      acknowledgments: acknowledgments.map(a => ({
        id: a.id,
        title: a.title,
        description: a.description,
        type: a.acknowledgment_type,
        documentId: a.document_id,
        isAcknowledged: !!a.is_acknowledged,
        acknowledgedAt: a.acknowledged_at,
        createdAt: a.created_at
      }))
    });
  } catch (error) {
    console.error('[ERROR] Get trip acknowledgments failed:', error.message);
    res.status(500).json({ error: 'Failed to get acknowledgments' });
  }
});

/**
 * POST /api/portal/acknowledgments/:id/acknowledge
 * Customer acknowledges receipt of information
 */
router.post('/acknowledgments/:id/acknowledge', authenticateCustomer, (req, res) => {
  try {
    const db = getDb();
    const ackId = req.params.id;

    // Find the acknowledgment and verify it belongs to this customer
    const ack = db.prepare(`
      SELECT a.*, t.client_id, t.agency_id as trip_agency_id
      FROM acknowledgments a
      JOIN trips t ON a.trip_id = t.id
      WHERE a.id = ? AND a.agency_id = ?
    `).get(ackId, req.customer.agency_id);

    if (!ack) {
      return res.status(404).json({ error: 'Acknowledgment not found' });
    }

    if (ack.client_id !== req.customer.client_id) {
      return res.status(403).json({ error: 'Not authorized to acknowledge this item' });
    }

    if (ack.is_acknowledged) {
      return res.status(400).json({ error: 'This item has already been acknowledged' });
    }

    // Update the acknowledgment
    db.prepare(`
      UPDATE acknowledgments
      SET is_acknowledged = 1, acknowledged_at = datetime('now'),
        acknowledged_by_customer_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(req.customer.id, ackId);

    // Log in audit
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id, client_id)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
    `).run(
      req.customer.agency_id,
      'acknowledgment_confirmed',
      'acknowledgment',
      ackId,
      JSON.stringify({
        title: ack.title,
        type: ack.acknowledgment_type,
        customerEmail: req.customer.email,
        acknowledgedAt: new Date().toISOString()
      }),
      ack.trip_id,
      req.customer.client_id
    );

    const updated = db.prepare('SELECT * FROM acknowledgments WHERE id = ?').get(ackId);

    res.json({
      message: 'Acknowledgment confirmed',
      acknowledgment: {
        id: updated.id,
        title: updated.title,
        isAcknowledged: true,
        acknowledgedAt: updated.acknowledged_at
      }
    });
  } catch (error) {
    console.error('[ERROR] Acknowledge failed:', error.message);
    res.status(500).json({ error: 'Failed to acknowledge' });
  }
});

module.exports = router;
