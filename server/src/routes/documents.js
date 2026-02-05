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
