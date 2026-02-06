const express = require('express');
const { getDb } = require('../config/database');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');

const router = express.Router();

// Apply authentication and tenant scope to all routes
router.use(authenticate);
router.use(tenantScope);

/**
 * GET /api/settings/agency
 * Get agency branding settings
 */
router.get('/agency', (req, res) => {
  try {
    const db = getDb();

    const agency = db.prepare(`
      SELECT id, name, logo_url, primary_color, email_signature,
             default_commission_rate, timezone, created_at, updated_at,
             deadline_reminder_days, quote_followup_days, booking_confirmation_days,
             final_payment_reminder_days, travel_reminder_days, feedback_request_days
      FROM agencies
      WHERE id = ?
    `).get(req.agencyId);

    if (!agency) {
      return res.status(404).json({ error: 'Agency not found' });
    }

    res.json({
      agency: {
        id: agency.id,
        name: agency.name,
        logoUrl: agency.logo_url,
        primaryColor: agency.primary_color,
        emailSignature: agency.email_signature,
        defaultCommissionRate: agency.default_commission_rate,
        timezone: agency.timezone,
        createdAt: agency.created_at,
        updatedAt: agency.updated_at,
        // Workflow timing settings
        deadlineReminderDays: agency.deadline_reminder_days ?? 7,
        quoteFollowupDays: agency.quote_followup_days ?? 3,
        bookingConfirmationDays: agency.booking_confirmation_days ?? 1,
        finalPaymentReminderDays: agency.final_payment_reminder_days ?? 7,
        travelReminderDays: agency.travel_reminder_days ?? 0,
        feedbackRequestDays: agency.feedback_request_days ?? 3
      }
    });
  } catch (error) {
    console.error('[ERROR] Get agency settings failed:', error.message);
    res.status(500).json({ error: 'Failed to get agency settings' });
  }
});

/**
 * PUT /api/settings/agency
 * Update agency branding settings (admin only)
 */
router.put('/agency', authorize('admin'), (req, res) => {
  try {
    const db = getDb();
    const {
      name, logoUrl, primaryColor, emailSignature, defaultCommissionRate, timezone,
      // Workflow timing settings
      deadlineReminderDays, quoteFollowupDays, bookingConfirmationDays,
      finalPaymentReminderDays, travelReminderDays, feedbackRequestDays
    } = req.body;

    // Validate name is provided
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Agency name is required' });
    }

    // Validate primary color format if provided (must be hex color)
    if (primaryColor && !/^#[0-9A-Fa-f]{6}$/.test(primaryColor)) {
      return res.status(400).json({ error: 'Primary color must be a valid hex color (e.g., #1a56db)' });
    }

    // Validate commission rate if provided
    if (defaultCommissionRate !== undefined && defaultCommissionRate !== null) {
      const rate = parseFloat(defaultCommissionRate);
      if (isNaN(rate) || rate < 0 || rate > 100) {
        return res.status(400).json({ error: 'Default commission rate must be between 0 and 100' });
      }
    }

    // Validate timing settings (must be non-negative integers)
    const timingFields = { deadlineReminderDays, quoteFollowupDays, bookingConfirmationDays, finalPaymentReminderDays, travelReminderDays, feedbackRequestDays };
    for (const [field, value] of Object.entries(timingFields)) {
      if (value !== undefined && value !== null) {
        const num = parseInt(value, 10);
        if (isNaN(num) || num < 0 || num > 365) {
          return res.status(400).json({ error: `${field} must be between 0 and 365 days` });
        }
      }
    }

    // Update agency
    const result = db.prepare(`
      UPDATE agencies
      SET name = ?,
          logo_url = ?,
          primary_color = ?,
          email_signature = ?,
          default_commission_rate = ?,
          timezone = ?,
          deadline_reminder_days = ?,
          quote_followup_days = ?,
          booking_confirmation_days = ?,
          final_payment_reminder_days = ?,
          travel_reminder_days = ?,
          feedback_request_days = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name.trim(),
      logoUrl || null,
      primaryColor || '#1a56db',
      emailSignature || null,
      defaultCommissionRate !== undefined && defaultCommissionRate !== null ? parseFloat(defaultCommissionRate) : null,
      timezone || 'America/New_York',
      deadlineReminderDays !== undefined && deadlineReminderDays !== null ? parseInt(deadlineReminderDays, 10) : 7,
      quoteFollowupDays !== undefined && quoteFollowupDays !== null ? parseInt(quoteFollowupDays, 10) : 3,
      bookingConfirmationDays !== undefined && bookingConfirmationDays !== null ? parseInt(bookingConfirmationDays, 10) : 1,
      finalPaymentReminderDays !== undefined && finalPaymentReminderDays !== null ? parseInt(finalPaymentReminderDays, 10) : 7,
      travelReminderDays !== undefined && travelReminderDays !== null ? parseInt(travelReminderDays, 10) : 0,
      feedbackRequestDays !== undefined && feedbackRequestDays !== null ? parseInt(feedbackRequestDays, 10) : 3,
      req.agencyId
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Agency not found' });
    }

    // Fetch updated agency
    const agency = db.prepare(`
      SELECT id, name, logo_url, primary_color, email_signature,
             default_commission_rate, timezone, created_at, updated_at,
             deadline_reminder_days, quote_followup_days, booking_confirmation_days,
             final_payment_reminder_days, travel_reminder_days, feedback_request_days
      FROM agencies
      WHERE id = ?
    `).get(req.agencyId);

    // Log the update
    const allUpdatedFields = [
      'name', 'logoUrl', 'primaryColor', 'emailSignature', 'defaultCommissionRate', 'timezone',
      'deadlineReminderDays', 'quoteFollowupDays', 'bookingConfirmationDays',
      'finalPaymentReminderDays', 'travelReminderDays', 'feedbackRequestDays'
    ].filter(f => req.body[f] !== undefined);

    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'update_settings', 'agency', ?, ?)
    `).run(
      req.agencyId,
      req.user.id,
      req.agencyId,
      JSON.stringify({ updatedFields: allUpdatedFields })
    );

    res.json({
      message: 'Agency settings updated successfully',
      agency: {
        id: agency.id,
        name: agency.name,
        logoUrl: agency.logo_url,
        primaryColor: agency.primary_color,
        emailSignature: agency.email_signature,
        defaultCommissionRate: agency.default_commission_rate,
        timezone: agency.timezone,
        createdAt: agency.created_at,
        updatedAt: agency.updated_at,
        // Workflow timing settings
        deadlineReminderDays: agency.deadline_reminder_days ?? 7,
        quoteFollowupDays: agency.quote_followup_days ?? 3,
        bookingConfirmationDays: agency.booking_confirmation_days ?? 1,
        finalPaymentReminderDays: agency.final_payment_reminder_days ?? 7,
        travelReminderDays: agency.travel_reminder_days ?? 0,
        feedbackRequestDays: agency.feedback_request_days ?? 3
      }
    });
  } catch (error) {
    console.error('[ERROR] Update agency settings failed:', error.message);
    res.status(500).json({ error: 'Failed to update agency settings' });
  }
});

/**
 * POST /api/settings/agency/logo
 * Upload agency logo (admin only)
 * For simplicity, we'll accept a base64-encoded image or a URL
 */
router.post('/agency/logo', authorize('admin'), (req, res) => {
  try {
    const db = getDb();
    const { logoUrl, logoBase64 } = req.body;

    let finalLogoUrl = null;

    if (logoUrl) {
      // Validate URL format
      try {
        new URL(logoUrl);
        finalLogoUrl = logoUrl;
      } catch (e) {
        return res.status(400).json({ error: 'Invalid logo URL format' });
      }
    } else if (logoBase64) {
      // For base64 images, we'll store them as data URIs
      // Validate it's a valid base64 image
      if (!logoBase64.startsWith('data:image/')) {
        return res.status(400).json({ error: 'Invalid image format. Must be a data URI (data:image/...)' });
      }
      finalLogoUrl = logoBase64;
    }

    // Update agency logo
    const result = db.prepare(`
      UPDATE agencies
      SET logo_url = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(finalLogoUrl, req.agencyId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Agency not found' });
    }

    // Log the update
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'update_logo', 'agency', ?, ?)
    `).run(
      req.agencyId,
      req.user.id,
      req.agencyId,
      JSON.stringify({ hasLogo: !!finalLogoUrl })
    );

    res.json({
      message: finalLogoUrl ? 'Logo uploaded successfully' : 'Logo removed successfully',
      logoUrl: finalLogoUrl
    });
  } catch (error) {
    console.error('[ERROR] Upload logo failed:', error.message);
    res.status(500).json({ error: 'Failed to upload logo' });
  }
});

/**
 * DELETE /api/settings/agency/logo
 * Remove agency logo (admin only)
 */
router.delete('/agency/logo', authorize('admin'), (req, res) => {
  try {
    const db = getDb();

    const result = db.prepare(`
      UPDATE agencies
      SET logo_url = NULL,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(req.agencyId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Agency not found' });
    }

    // Log the update
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'remove_logo', 'agency', ?, ?)
    `).run(
      req.agencyId,
      req.user.id,
      req.agencyId,
      JSON.stringify({ action: 'logo_removed' })
    );

    res.json({ message: 'Logo removed successfully' });
  } catch (error) {
    console.error('[ERROR] Remove logo failed:', error.message);
    res.status(500).json({ error: 'Failed to remove logo' });
  }
});

module.exports = router;
