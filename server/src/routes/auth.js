const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../config/database');
const { generateToken, authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/register
 * Creates a new agency and admin user
 */
router.post('/register', (req, res) => {
  try {
    const { email, password, firstName, lastName, agencyName } = req.body;

    // Validation
    if (!email || !password || !firstName || !lastName || !agencyName) {
      return res.status(400).json({
        error: 'All fields are required: email, password, firstName, lastName, agencyName'
      });
    }

    // Password strength validation
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!/[A-Z]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain at least one uppercase letter' });
    }
    if (!/[a-z]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain at least one lowercase letter' });
    }
    if (!/[0-9]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain at least one number' });
    }

    const db = getDb();

    // Check if email already exists
    console.log('[SQL] SELECT id FROM users WHERE email = ?', [email]);
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = bcrypt.hashSync(password, 10);

    // Create agency and user in a transaction
    const createAgencyAndUser = db.transaction(() => {
      // Create agency
      console.log('[SQL] INSERT INTO agencies (name) VALUES (?)', [agencyName]);
      const agencyResult = db.prepare(
        'INSERT INTO agencies (name) VALUES (?)'
      ).run(agencyName);
      const agencyId = agencyResult.lastInsertRowid;

      // Create admin user
      console.log('[SQL] INSERT INTO users (agency_id, email, password_hash, first_name, last_name, role) VALUES (?, ?, [HASH], ?, ?, admin)');
      const userResult = db.prepare(
        'INSERT INTO users (agency_id, email, password_hash, first_name, last_name, role) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(agencyId, email, passwordHash, firstName, lastName, 'admin');
      const userId = userResult.lastInsertRowid;

      return { agencyId, userId };
    });

    const { agencyId, userId } = createAgencyAndUser();

    // Generate JWT token
    const token = generateToken({
      id: userId,
      email,
      role: 'admin',
      agency_id: agencyId
    });

    // Fetch the created user to return
    console.log('[SQL] SELECT id, agency_id, email, first_name, last_name, role FROM users WHERE id = ?', [userId]);
    const user = db.prepare(
      'SELECT id, agency_id, email, first_name, last_name, role, created_at FROM users WHERE id = ?'
    ).get(userId);

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: {
        id: user.id,
        agencyId: user.agency_id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('[ERROR] Registration failed:', error.message);
    res.status(500).json({ error: 'Registration failed', message: error.message });
  }
});

/**
 * POST /api/auth/login
 * Authenticates user and returns JWT token
 */
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const db = getDb();

    // Find user by email
    console.log('[SQL] SELECT * FROM users WHERE email = ? AND is_active = 1', [email]);
    const user = db.prepare(
      'SELECT id, agency_id, email, password_hash, first_name, last_name, role FROM users WHERE email = ? AND is_active = 1'
    ).get(email);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      agency_id: user.agency_id
    });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        agencyId: user.agency_id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('[ERROR] Login failed:', error.message);
    res.status(500).json({ error: 'Login failed', message: error.message });
  }
});

/**
 * POST /api/auth/logout
 * Client-side token removal (JWT is stateless)
 */
router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

/**
 * GET /api/auth/me
 * Returns current user profile
 */
router.get('/me', authenticate, (req, res) => {
  try {
    const db = getDb();
    console.log('[SQL] SELECT id, agency_id, email, first_name, last_name, role FROM users WHERE id = ? AND agency_id = ?', [req.user.id, req.user.agency_id]);
    const user = db.prepare(
      'SELECT id, agency_id, email, first_name, last_name, role, notification_preferences, created_at FROM users WHERE id = ? AND agency_id = ?'
    ).get(req.user.id, req.user.agency_id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get agency info
    console.log('[SQL] SELECT id, name, logo_url, primary_color FROM agencies WHERE id = ?', [user.agency_id]);
    const agency = db.prepare(
      'SELECT id, name, logo_url, primary_color, timezone FROM agencies WHERE id = ?'
    ).get(user.agency_id);

    res.json({
      user: {
        id: user.id,
        agencyId: user.agency_id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        notificationPreferences: JSON.parse(user.notification_preferences || '{}'),
        createdAt: user.created_at
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
    console.error('[ERROR] Get profile failed:', error.message);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

/**
 * PUT /api/auth/notification-preferences
 * Update current user's notification preferences
 */
router.put('/notification-preferences', authenticate, (req, res) => {
  try {
    const { preferences } = req.body;

    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({ error: 'Invalid preferences format' });
    }

    // Define valid notification types and their defaults
    const validNotificationTypes = [
      'taskAssigned',
      'taskDue',
      'paymentReminder',
      'commissionUpdate',
      'tripStageChange',
      'approvalRequired',
      'approvalResolved',
      'documentUploaded',
      'clientMessage'
    ];

    // Validate and sanitize preferences - only allow boolean values for valid types
    const sanitizedPreferences = {};
    for (const type of validNotificationTypes) {
      // If not specified, default to true (enabled)
      sanitizedPreferences[type] = preferences[type] !== false;
    }

    const db = getDb();

    db.prepare(
      "UPDATE users SET notification_preferences = ?, updated_at = datetime('now') WHERE id = ? AND agency_id = ?"
    ).run(JSON.stringify(sanitizedPreferences), req.user.id, req.user.agency_id);

    // Create audit log entry
    db.prepare(
      `INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      req.user.agency_id,
      req.user.id,
      'update_notification_preferences',
      'user',
      req.user.id,
      JSON.stringify({ preferences: sanitizedPreferences })
    );

    res.json({
      message: 'Notification preferences updated successfully',
      preferences: sanitizedPreferences
    });
  } catch (error) {
    console.error('[ERROR] Update notification preferences failed:', error.message);
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

module.exports = router;
