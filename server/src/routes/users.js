const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../config/database');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');

const router = express.Router();

// All user routes require authentication and tenant scoping
router.use(authenticate, tenantScope);

/**
 * GET /api/users
 * List all users in the agency
 */
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const users = db.prepare(
      `SELECT id, agency_id, email, first_name, last_name, role, is_active, created_at, updated_at
       FROM users WHERE agency_id = ? ORDER BY created_at DESC`
    ).all(req.agencyId);

    res.json({
      users: users.map(u => ({
        id: u.id,
        agencyId: u.agency_id,
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        role: u.role,
        isActive: u.is_active === 1,
        createdAt: u.created_at,
        updatedAt: u.updated_at
      }))
    });
  } catch (error) {
    console.error('[ERROR] List users failed:', error.message);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

/**
 * POST /api/users/invite
 * Invite a new user to the agency (Admin only)
 * Creates the user directly with a temporary password
 */
router.post('/invite', authorize('admin'), (req, res) => {
  try {
    const { email, firstName, lastName, role, password } = req.body;

    // Validation
    if (!email || !firstName || !lastName || !role) {
      return res.status(400).json({
        error: 'Required fields: email, firstName, lastName, role'
      });
    }

    const validRoles = ['admin', 'planner', 'support', 'marketing'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        error: `Invalid role. Must be one of: ${validRoles.join(', ')}`
      });
    }

    // Use provided password or generate a default one
    const userPassword = password || 'Welcome123!';
    if (userPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const db = getDb();

    // Check if email already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    // Hash password
    const passwordHash = bcrypt.hashSync(userPassword, 10);

    // Create user in the same agency
    const result = db.prepare(
      `INSERT INTO users (agency_id, email, password_hash, first_name, last_name, role, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`
    ).run(req.agencyId, email, passwordHash, firstName, lastName, role);

    const userId = result.lastInsertRowid;

    // Create audit log entry
    db.prepare(
      `INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      req.agencyId,
      req.user.id,
      'invite_user',
      'user',
      userId,
      JSON.stringify({ email, role, invitedBy: req.user.email })
    );

    // Fetch the created user
    const newUser = db.prepare(
      `SELECT id, agency_id, email, first_name, last_name, role, is_active, created_at
       FROM users WHERE id = ?`
    ).get(userId);

    // Log the temporary password to console (in production, would send an email)
    console.log(`\n[INVITE] New user invited to agency:`);
    console.log(`  Email: ${email}`);
    console.log(`  Role: ${role}`);
    console.log(`  Temporary Password: ${userPassword}`);
    console.log(`  Agency ID: ${req.agencyId}\n`);

    res.status(201).json({
      message: 'User invited successfully',
      user: {
        id: newUser.id,
        agencyId: newUser.agency_id,
        email: newUser.email,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        role: newUser.role,
        isActive: newUser.is_active === 1,
        createdAt: newUser.created_at
      },
      temporaryPassword: userPassword
    });
  } catch (error) {
    console.error('[ERROR] Invite user failed:', error.message);
    res.status(500).json({ error: 'Failed to invite user', message: error.message });
  }
});

/**
 * PUT /api/users/:id
 * Update a user's profile
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, email } = req.body;
    const db = getDb();

    // Check user exists in same agency
    const user = db.prepare(
      'SELECT id FROM users WHERE id = ? AND agency_id = ?'
    ).get(id, req.agencyId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Only admins can edit other users; users can edit themselves
    if (req.user.role !== 'admin' && req.user.id !== parseInt(id)) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const updates = [];
    const values = [];
    if (firstName) { updates.push('first_name = ?'); values.push(firstName); }
    if (lastName) { updates.push('last_name = ?'); values.push(lastName); }
    if (email) { updates.push('email = ?'); values.push(email); }
    updates.push("updated_at = datetime('now')");
    values.push(id, req.agencyId);

    db.prepare(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ? AND agency_id = ?`
    ).run(...values);

    const updated = db.prepare(
      `SELECT id, agency_id, email, first_name, last_name, role, is_active, created_at, updated_at
       FROM users WHERE id = ?`
    ).get(id);

    res.json({
      message: 'User updated successfully',
      user: {
        id: updated.id,
        agencyId: updated.agency_id,
        email: updated.email,
        firstName: updated.first_name,
        lastName: updated.last_name,
        role: updated.role,
        isActive: updated.is_active === 1,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at
      }
    });
  } catch (error) {
    console.error('[ERROR] Update user failed:', error.message);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * PUT /api/users/:id/role
 * Change a user's role (Admin only)
 */
router.put('/:id/role', authorize('admin'), (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const db = getDb();

    const validRoles = ['admin', 'planner', 'support', 'marketing'];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({
        error: `Invalid role. Must be one of: ${validRoles.join(', ')}`
      });
    }

    // Can't change own role
    if (req.user.id === parseInt(id)) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    const user = db.prepare(
      'SELECT id, role FROM users WHERE id = ? AND agency_id = ?'
    ).get(id, req.agencyId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const oldRole = user.role;
    db.prepare(
      "UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ? AND agency_id = ?"
    ).run(role, id, req.agencyId);

    // Audit log
    db.prepare(
      `INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      req.agencyId,
      req.user.id,
      'change_role',
      'user',
      id,
      JSON.stringify({ oldRole, newRole: role })
    );

    res.json({ message: `Role updated from ${oldRole} to ${role}` });
  } catch (error) {
    console.error('[ERROR] Change role failed:', error.message);
    res.status(500).json({ error: 'Failed to change role' });
  }
});

/**
 * DELETE /api/users/:id
 * Deactivate a user (Admin only)
 */
router.delete('/:id', authorize('admin'), (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    // Can't delete yourself
    if (req.user.id === parseInt(id)) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    const user = db.prepare(
      'SELECT id FROM users WHERE id = ? AND agency_id = ?'
    ).get(id, req.agencyId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.prepare(
      "UPDATE users SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND agency_id = ?"
    ).run(id, req.agencyId);

    // Audit log
    db.prepare(
      `INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      req.agencyId,
      req.user.id,
      'deactivate_user',
      'user',
      id,
      JSON.stringify({ deactivatedBy: req.user.email })
    );

    res.json({ message: 'User deactivated successfully' });
  } catch (error) {
    console.error('[ERROR] Deactivate user failed:', error.message);
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

module.exports = router;
