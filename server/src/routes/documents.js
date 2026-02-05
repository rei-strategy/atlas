const express = require('express');
const { getDb } = require('../config/database');
const { authenticate, tenantScope } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

// All document routes require authentication and tenant scope
router.use(authenticate);
router.use(tenantScope);

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
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { tripId } = req.params;

    const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND agency_id = ?').get(tripId, req.agencyId);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const { fileName, documentType, bookingId, isSensitive, isClientVisible } = req.body;

    if (!fileName) {
      return res.status(400).json({ error: 'File name is required' });
    }

    const result = db.prepare(`
      INSERT INTO documents (agency_id, trip_id, booking_id, document_type, file_name, file_path, is_sensitive, is_client_visible, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      tripId,
      bookingId || null,
      documentType || 'other',
      fileName,
      `/uploads/${Date.now()}_${fileName}`,
      isSensitive ? 1 : 0,
      isClientVisible !== undefined ? (isClientVisible ? 1 : 0) : 0,
      req.user.id
    );

    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(result.lastInsertRowid);

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
 * DELETE /api/documents/:id
 * Delete a document
 */
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const doc = db.prepare('SELECT id FROM documents WHERE id = ? AND agency_id = ?').get(id, req.agencyId);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    db.prepare('DELETE FROM documents WHERE id = ? AND agency_id = ?').run(id, req.agencyId);

    res.json({ message: 'Document deleted successfully', deletedId: id });
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
