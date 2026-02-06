const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../config/database');
const { authenticate, tenantScope } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

// All document routes require authentication and tenant scope
router.use(authenticate);
router.use(tenantScope);

// Configure multer for file uploads
const UPLOAD_DIR = path.join(__dirname, '../../uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow common document types
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: PDF, images, Word, Excel, text, CSV'), false);
    }
  }
});

/**
 * GET /api/trips/:tripId/documents
 * List all documents for a trip
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

    const documents = db.prepare(`
      SELECT d.*, u.first_name as uploader_first_name, u.last_name as uploader_last_name
      FROM documents d
      LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE d.trip_id = ? AND d.agency_id = ?
      ORDER BY d.created_at DESC
    `).all(tripId, req.agencyId);

    res.json({
      documents: documents.map(d => formatDocument(d)),
      total: documents.length
    });
  } catch (error) {
    console.error('[ERROR] List documents failed:', error.message);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

/**
 * POST /api/trips/:tripId/documents/generate
 * Generate a document (invoice, itinerary, authorization form)
 * Currently supports: invoice
 * NOTE: This route must come BEFORE the upload route to avoid being caught by multer
 */
router.post('/generate', (req, res) => {
  try {
    const db = getDb();
    const { tripId } = req.params;
    const { type } = req.body;

    if (!type || !['invoice', 'itinerary', 'authorization'].includes(type)) {
      return res.status(400).json({ error: 'Document type is required. Supported types: invoice, itinerary, authorization' });
    }

    // Verify trip belongs to this agency and get trip details
    const trip = db.prepare(`
      SELECT t.*, c.first_name as client_first_name, c.last_name as client_last_name, c.email as client_email
      FROM trips t
      LEFT JOIN clients c ON t.client_id = c.id
      WHERE t.id = ? AND t.agency_id = ?
    `).get(tripId, req.agencyId);

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // Get agency details for invoice header
    const agency = db.prepare('SELECT * FROM agencies WHERE id = ?').get(req.agencyId);

    if (type === 'invoice') {
      // Get bookings for this trip
      const bookings = db.prepare(`
        SELECT * FROM bookings
        WHERE trip_id = ? AND agency_id = ?
        ORDER BY created_at ASC
      `).all(tripId, req.agencyId);

      // Calculate totals
      const totals = bookings.reduce((acc, b) => {
        acc.totalCost += b.total_cost || 0;
        acc.totalDeposit += b.deposit_amount || 0;
        acc.totalPaid += b.payment_status === 'paid_in_full' ? (b.total_cost || 0) : (b.deposit_paid ? (b.deposit_amount || 0) : 0);
        return acc;
      }, { totalCost: 0, totalDeposit: 0, totalPaid: 0 });

      totals.totalDue = totals.totalCost - totals.totalPaid;

      // Generate invoice HTML
      const invoiceNumber = `INV-${trip.id}-${Date.now().toString().slice(-6)}`;
      const generatedDate = new Date().toISOString().split('T')[0];

      const invoiceHtml = generateInvoiceHtml(trip, bookings, totals, agency, invoiceNumber, generatedDate);

      // Create a filename
      const fileName = `invoice_${trip.name.replace(/[^a-zA-Z0-9]/g, '_')}_${invoiceNumber}.html`;
      const filePath = `/generated/invoices/${fileName}`;

      // Save invoice file to disk
      const generatedDir = path.join(UPLOAD_DIR, 'generated', 'invoices');
      if (!fs.existsSync(generatedDir)) {
        fs.mkdirSync(generatedDir, { recursive: true });
      }
      const fullFilePath = path.join(generatedDir, fileName);
      fs.writeFileSync(fullFilePath, invoiceHtml, 'utf8');

      // Create document record
      const result = db.prepare(`
        INSERT INTO documents (agency_id, trip_id, booking_id, document_type, file_name, file_path, is_sensitive, is_client_visible, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.agencyId,
        tripId,
        null, // not tied to a specific booking
        'invoice',
        fileName,
        filePath,
        0, // not sensitive
        1, // client visible by default
        req.user.id
      );

      // Log to audit
      db.prepare(`
        INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.agencyId,
        req.user.id,
        'generate_invoice',
        'document',
        result.lastInsertRowid,
        JSON.stringify({ invoiceNumber, totalCost: totals.totalCost, totalDue: totals.totalDue }),
        tripId
      );

      const doc = db.prepare(`
        SELECT d.*, u.first_name as uploader_first_name, u.last_name as uploader_last_name
        FROM documents d
        LEFT JOIN users u ON d.uploaded_by = u.id
        WHERE d.id = ?
      `).get(result.lastInsertRowid);

      return res.status(201).json({
        message: 'Invoice generated successfully',
        document: formatDocument(doc),
        invoice: {
          invoiceNumber,
          generatedDate,
          tripName: trip.name,
          clientName: `${trip.client_first_name || ''} ${trip.client_last_name || ''}`.trim() || 'N/A',
          totalCost: totals.totalCost,
          totalPaid: totals.totalPaid,
          totalDue: totals.totalDue,
          bookingCount: bookings.length
        }
      });
    }

    // Other document types not yet implemented
    return res.status(400).json({ error: `Document type "${type}" is not yet implemented` });

  } catch (error) {
    console.error('[ERROR] Generate document failed:', error.message);
    res.status(500).json({ error: 'Failed to generate document' });
  }
});

/**
 * POST /api/trips/:tripId/documents
 * Upload a document to a trip (planner side)
 */
router.post('/', upload.single('file'), (req, res) => {
  try {
    const db = getDb();
    const { tripId } = req.params;

    const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND agency_id = ?').get(tripId, req.agencyId);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // If a file was uploaded, use that; otherwise use body fields for metadata-only upload
    let fileName, filePath;

    if (req.file) {
      fileName = req.file.originalname;
      filePath = `/uploads/${req.file.filename}`;
    } else {
      // Metadata-only (for testing or external file references)
      fileName = req.body.fileName;
      if (!fileName) {
        return res.status(400).json({ error: 'File or file name is required' });
      }
      filePath = req.body.filePath || `/uploads/${Date.now()}_${fileName}`;
    }

    const { documentType, bookingId, isSensitive, isClientVisible } = req.body;

    const result = db.prepare(`
      INSERT INTO documents (agency_id, trip_id, booking_id, document_type, file_name, file_path, is_sensitive, is_client_visible, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      tripId,
      bookingId || null,
      documentType || 'other',
      fileName,
      filePath,
      isSensitive === 'true' || isSensitive === true ? 1 : 0,
      isClientVisible === 'true' || isClientVisible === true ? 1 : 0,
      req.user.id
    );

    const doc = db.prepare(`
      SELECT d.*, u.first_name as uploader_first_name, u.last_name as uploader_last_name
      FROM documents d
      LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE d.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({
      message: 'Document uploaded successfully',
      document: formatDocument(doc)
    });
  } catch (error) {
    console.error('[ERROR] Upload document failed:', error.message);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

/**
 * GET /api/trips/:tripId/documents/:id/download
 * Download a document
 * Sensitive documents are logged in audit trail for security
 */
router.get('/:id/download', (req, res) => {
  try {
    const db = getDb();
    const { tripId, id } = req.params;

    const doc = db.prepare(`
      SELECT * FROM documents
      WHERE id = ? AND trip_id = ? AND agency_id = ?
    `).get(id, tripId, req.agencyId);

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Log access to sensitive documents in audit trail
    if (doc.is_sensitive) {
      db.prepare(`
        INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.agencyId,
        req.user.id,
        'sensitive_document_access',
        'document',
        id,
        JSON.stringify({
          fileName: doc.file_name,
          documentType: doc.document_type,
          accessedBy: req.user.email,
          accessType: 'download'
        }),
        tripId
      );
      console.log(`[AUDIT] Sensitive document accessed: ${doc.file_name} by user ${req.user.id}`);
    }

    // Extract the filename from the stored path
    const storedFileName = doc.file_path.replace('/uploads/', '');
    const filePath = path.join(UPLOAD_DIR, storedFileName);

    // Check if file exists on disk
    if (fs.existsSync(filePath)) {
      res.download(filePath, doc.file_name);
    } else {
      // File doesn't exist on disk, return metadata as JSON (for testing/demo)
      res.json({
        message: 'File not found on disk (metadata-only record)',
        document: formatDocument(doc)
      });
    }
  } catch (error) {
    console.error('[ERROR] Download document failed:', error.message);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

/**
 * PUT /api/trips/:tripId/documents/:id
 * Update document metadata (visibility, type, etc.)
 */
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const { tripId, id } = req.params;

    const doc = db.prepare(`
      SELECT * FROM documents
      WHERE id = ? AND trip_id = ? AND agency_id = ?
    `).get(id, tripId, req.agencyId);

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const { documentType, isSensitive, isClientVisible } = req.body;

    db.prepare(`
      UPDATE documents SET
        document_type = COALESCE(?, document_type),
        is_sensitive = COALESCE(?, is_sensitive),
        is_client_visible = COALESCE(?, is_client_visible)
      WHERE id = ? AND agency_id = ?
    `).run(
      documentType || null,
      isSensitive !== undefined ? (isSensitive ? 1 : 0) : null,
      isClientVisible !== undefined ? (isClientVisible ? 1 : 0) : null,
      id,
      req.agencyId
    );

    const updated = db.prepare(`
      SELECT d.*, u.first_name as uploader_first_name, u.last_name as uploader_last_name
      FROM documents d
      LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE d.id = ?
    `).get(id);

    res.json({
      message: 'Document updated successfully',
      document: formatDocument(updated)
    });
  } catch (error) {
    console.error('[ERROR] Update document failed:', error.message);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

/**
 * DELETE /api/trips/:tripId/documents/:id
 * Delete a document
 */
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const { tripId, id } = req.params;

    const doc = db.prepare(`
      SELECT * FROM documents
      WHERE id = ? AND trip_id = ? AND agency_id = ?
    `).get(id, tripId, req.agencyId);

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Delete the physical file if it exists
    const storedFileName = doc.file_path.replace('/uploads/', '');
    const filePath = path.join(UPLOAD_DIR, storedFileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from database
    db.prepare('DELETE FROM documents WHERE id = ? AND agency_id = ?').run(id, req.agencyId);

    // Log deletion to audit log
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      req.user.id,
      'delete',
      'document',
      id,
      JSON.stringify({ fileName: doc.file_name, documentType: doc.document_type }),
      tripId
    );

    res.json({
      message: 'Document deleted successfully',
      deletedId: parseInt(id)
    });
  } catch (error) {
    console.error('[ERROR] Delete document failed:', error.message);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

/**
 * POST /api/trips/:tripId/documents/generate
 * Generate a document (invoice, itinerary, authorization form)
 * Currently supports: invoice
 */
router.post('/generate', (req, res) => {
  try {
    const db = getDb();
    const { tripId } = req.params;
    const { type } = req.body;

    if (!type || !['invoice', 'itinerary', 'authorization'].includes(type)) {
      return res.status(400).json({ error: 'Document type is required. Supported types: invoice, itinerary, authorization' });
    }

    // Verify trip belongs to this agency and get trip details
    const trip = db.prepare(`
      SELECT t.*, c.first_name as client_first_name, c.last_name as client_last_name, c.email as client_email
      FROM trips t
      LEFT JOIN clients c ON t.client_id = c.id
      WHERE t.id = ? AND t.agency_id = ?
    `).get(tripId, req.agencyId);

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // Get agency details for invoice header
    const agency = db.prepare('SELECT * FROM agencies WHERE id = ?').get(req.agencyId);

    if (type === 'invoice') {
      // Get bookings for this trip
      const bookings = db.prepare(`
        SELECT * FROM bookings
        WHERE trip_id = ? AND agency_id = ?
        ORDER BY created_at ASC
      `).all(tripId, req.agencyId);

      // Calculate totals
      const totals = bookings.reduce((acc, b) => {
        acc.totalCost += b.total_cost || 0;
        acc.totalDeposit += b.deposit_amount || 0;
        acc.totalPaid += b.payment_status === 'paid_in_full' ? (b.total_cost || 0) : (b.deposit_paid ? (b.deposit_amount || 0) : 0);
        return acc;
      }, { totalCost: 0, totalDeposit: 0, totalPaid: 0 });

      totals.totalDue = totals.totalCost - totals.totalPaid;

      // Generate invoice HTML
      const invoiceNumber = `INV-${trip.id}-${Date.now().toString().slice(-6)}`;
      const generatedDate = new Date().toISOString().split('T')[0];

      const invoiceHtml = generateInvoiceHtml(trip, bookings, totals, agency, invoiceNumber, generatedDate);

      // Create a filename
      const fileName = `invoice_${trip.name.replace(/[^a-zA-Z0-9]/g, '_')}_${invoiceNumber}.html`;
      const filePath = `/generated/invoices/${fileName}`;

      // Save invoice file to disk
      const generatedDir = path.join(UPLOAD_DIR, 'generated', 'invoices');
      if (!fs.existsSync(generatedDir)) {
        fs.mkdirSync(generatedDir, { recursive: true });
      }
      const fullFilePath = path.join(generatedDir, fileName);
      fs.writeFileSync(fullFilePath, invoiceHtml, 'utf8');

      // Create document record
      const result = db.prepare(`
        INSERT INTO documents (agency_id, trip_id, booking_id, document_type, file_name, file_path, is_sensitive, is_client_visible, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.agencyId,
        tripId,
        null, // not tied to a specific booking
        'invoice',
        fileName,
        filePath,
        0, // not sensitive
        1, // client visible by default
        req.user.id
      );

      // Log to audit
      db.prepare(`
        INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.agencyId,
        req.user.id,
        'generate_invoice',
        'document',
        result.lastInsertRowid,
        JSON.stringify({ invoiceNumber, totalCost: totals.totalCost, totalDue: totals.totalDue }),
        tripId
      );

      const doc = db.prepare(`
        SELECT d.*, u.first_name as uploader_first_name, u.last_name as uploader_last_name
        FROM documents d
        LEFT JOIN users u ON d.uploaded_by = u.id
        WHERE d.id = ?
      `).get(result.lastInsertRowid);

      return res.status(201).json({
        message: 'Invoice generated successfully',
        document: formatDocument(doc),
        invoice: {
          invoiceNumber,
          generatedDate,
          tripName: trip.name,
          clientName: `${trip.client_first_name || ''} ${trip.client_last_name || ''}`.trim() || 'N/A',
          totalCost: totals.totalCost,
          totalPaid: totals.totalPaid,
          totalDue: totals.totalDue,
          bookingCount: bookings.length
        }
      });
    }

    // Other document types not yet implemented
    return res.status(400).json({ error: `Document type "${type}" is not yet implemented` });

  } catch (error) {
    console.error('[ERROR] Generate document failed:', error.message);
    res.status(500).json({ error: 'Failed to generate document' });
  }
});

/**
 * Generate invoice HTML content
 */
function generateInvoiceHtml(trip, bookings, totals, agency, invoiceNumber, generatedDate) {
  const formatCurrency = (amount) => {
    return '$' + (amount || 0).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const clientName = `${trip.client_first_name || ''} ${trip.client_last_name || ''}`.trim() || 'N/A';
  const clientEmail = trip.client_email || 'N/A';

  const paymentStatusLabel = totals.totalDue <= 0 ? 'PAID IN FULL' :
    (totals.totalPaid > 0 ? 'PARTIAL PAYMENT RECEIVED' : 'PAYMENT DUE');
  const paymentStatusColor = totals.totalDue <= 0 ? '#10B981' : '#F59E0B';

  const bookingRows = bookings.map(b => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #E5E7EB;">${b.supplier_name || 'N/A'}</td>
      <td style="padding: 12px; border-bottom: 1px solid #E5E7EB;">${b.booking_type || 'Other'}</td>
      <td style="padding: 12px; border-bottom: 1px solid #E5E7EB;">${b.confirmation_number || '—'}</td>
      <td style="padding: 12px; border-bottom: 1px solid #E5E7EB;">${formatDate(b.travel_start_date)}</td>
      <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; text-align: right;">${formatCurrency(b.total_cost)}</td>
      <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; text-align: center;">
        <span style="padding: 4px 8px; border-radius: 4px; font-size: 12px; background: ${b.payment_status === 'paid_in_full' ? '#D1FAE5' : '#FEF3C7'}; color: ${b.payment_status === 'paid_in_full' ? '#065F46' : '#92400E'};">
          ${b.payment_status === 'paid_in_full' ? 'Paid' : (b.payment_status === 'deposit_paid' ? 'Deposit' : 'Due')}
        </span>
      </td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${invoiceNumber}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 40px; color: #1F2937; }
    .invoice-container { max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
    .company-info { }
    .company-name { font-size: 24px; font-weight: 700; color: #1F2937; margin-bottom: 8px; }
    .company-details { font-size: 14px; color: #6B7280; line-height: 1.5; }
    .invoice-info { text-align: right; }
    .invoice-title { font-size: 32px; font-weight: 700; color: #1F2937; margin-bottom: 8px; }
    .invoice-number { font-size: 14px; color: #6B7280; }
    .meta-section { display: flex; justify-content: space-between; margin-bottom: 40px; padding: 24px; background: #F9FAFB; border-radius: 8px; }
    .meta-block { }
    .meta-label { font-size: 12px; color: #6B7280; text-transform: uppercase; margin-bottom: 4px; }
    .meta-value { font-size: 16px; font-weight: 600; color: #1F2937; }
    .trip-section { margin-bottom: 32px; padding: 20px; border: 1px solid #E5E7EB; border-radius: 8px; }
    .trip-title { font-size: 18px; font-weight: 600; color: #1F2937; margin-bottom: 8px; }
    .trip-details { font-size: 14px; color: #6B7280; }
    .bookings-table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
    .bookings-table th { text-align: left; padding: 12px; background: #F3F4F6; font-size: 12px; text-transform: uppercase; color: #6B7280; }
    .bookings-table th:last-child { text-align: center; }
    .totals-section { margin-left: auto; width: 300px; }
    .total-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; }
    .total-row.grand { font-size: 18px; font-weight: 700; border-top: 2px solid #1F2937; padding-top: 16px; margin-top: 8px; }
    .payment-status { display: inline-block; padding: 8px 16px; border-radius: 4px; font-weight: 600; font-size: 14px; margin-top: 24px; }
    .footer { margin-top: 60px; padding-top: 24px; border-top: 1px solid #E5E7EB; font-size: 12px; color: #9CA3AF; text-align: center; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="invoice-container">
    <div class="header">
      <div class="company-info">
        <div class="company-name">${agency ? agency.name : 'Travel Agency'}</div>
        <div class="company-details">Travel Planning Services</div>
      </div>
      <div class="invoice-info">
        <div class="invoice-title">INVOICE</div>
        <div class="invoice-number">${invoiceNumber}</div>
      </div>
    </div>

    <div class="meta-section">
      <div class="meta-block">
        <div class="meta-label">Bill To</div>
        <div class="meta-value">${clientName}</div>
        <div style="font-size: 14px; color: #6B7280;">${clientEmail}</div>
      </div>
      <div class="meta-block">
        <div class="meta-label">Invoice Date</div>
        <div class="meta-value">${formatDate(generatedDate)}</div>
      </div>
      <div class="meta-block">
        <div class="meta-label">Due Date</div>
        <div class="meta-value">${trip.final_payment_deadline ? formatDate(trip.final_payment_deadline) : 'Upon Receipt'}</div>
      </div>
    </div>

    <div class="trip-section">
      <div class="trip-title">${trip.name}</div>
      <div class="trip-details">
        ${trip.destination ? `<span>Destination: ${trip.destination}</span><br>` : ''}
        ${trip.travel_start_date ? `<span>Travel Dates: ${formatDate(trip.travel_start_date)} - ${formatDate(trip.travel_end_date)}</span>` : ''}
      </div>
    </div>

    ${bookings.length > 0 ? `
    <table class="bookings-table">
      <thead>
        <tr>
          <th>Supplier</th>
          <th>Type</th>
          <th>Confirmation</th>
          <th>Date</th>
          <th style="text-align: right;">Amount</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${bookingRows}
      </tbody>
    </table>
    ` : '<p style="color: #6B7280; margin-bottom: 32px;">No bookings added yet.</p>'}

    <div class="totals-section">
      <div class="total-row">
        <span>Subtotal</span>
        <span>${formatCurrency(totals.totalCost)}</span>
      </div>
      <div class="total-row">
        <span>Amount Paid</span>
        <span style="color: #10B981;">-${formatCurrency(totals.totalPaid)}</span>
      </div>
      <div class="total-row grand">
        <span>Balance Due</span>
        <span>${formatCurrency(totals.totalDue)}</span>
      </div>
    </div>

    <div style="text-align: center;">
      <span class="payment-status" style="background: ${paymentStatusColor}20; color: ${paymentStatusColor};">
        ${paymentStatusLabel}
      </span>
    </div>

    <div class="footer">
      <p>Thank you for choosing ${agency ? agency.name : 'our agency'} for your travel plans.</p>
      <p>Generated on ${formatDate(generatedDate)}</p>
    </div>
  </div>
</body>
</html>`;
}

function formatDocument(d) {
  return {
    id: d.id,
    tripId: d.trip_id,
    bookingId: d.booking_id,
    documentType: d.document_type,
    fileName: d.file_name,
    filePath: d.file_path,
    isSensitive: !!d.is_sensitive,
    isClientVisible: !!d.is_client_visible,
    uploadedBy: d.uploaded_by,
    uploaderName: d.uploader_first_name ? `${d.uploader_first_name} ${d.uploader_last_name}` : null,
    createdAt: d.created_at
  };
}

module.exports = router;
