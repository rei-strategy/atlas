/**
 * Notification Service
 * Handles notification creation with deduplication support
 */

const { getDb } = require('../config/database');

/**
 * Create a notification with deduplication support
 * If an event_key is provided and a notification with that key already exists
 * for the user, the duplicate is silently skipped.
 *
 * @param {Object} options - Notification options
 * @param {number} options.agencyId - Agency ID
 * @param {number} options.userId - User ID to notify
 * @param {string} options.type - Notification type ('urgent' or 'normal')
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification message
 * @param {string} [options.entityType] - Related entity type (e.g., 'trip', 'booking')
 * @param {number} [options.entityId] - Related entity ID
 * @param {string} [options.eventKey] - Unique key for deduplication (e.g., 'new_inquiry:trip:123')
 * @returns {Object} - { created: boolean, id: number|null, duplicate: boolean }
 */
function createNotification(options) {
  const {
    agencyId,
    userId,
    type = 'normal',
    title,
    message,
    entityType,
    entityId,
    eventKey
  } = options;

  const db = getDb();

  // If eventKey is provided, check for existing notification
  if (eventKey) {
    const existing = db.prepare(`
      SELECT id FROM notifications
      WHERE user_id = ? AND event_key = ?
    `).get(userId, eventKey);

    if (existing) {
      console.log(`[NOTIFICATION] Duplicate prevented for user ${userId}, event_key: ${eventKey}`);
      return { created: false, id: null, duplicate: true };
    }
  }

  try {
    const result = db.prepare(`
      INSERT INTO notifications (
        agency_id, user_id, type, title, message, entity_type, entity_id, event_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      agencyId,
      userId,
      type,
      title,
      message || null,
      entityType || null,
      entityId || null,
      eventKey || null
    );

    console.log(`[NOTIFICATION] Created notification ${result.lastInsertRowid} for user ${userId}${eventKey ? `, event_key: ${eventKey}` : ''}`);

    return { created: true, id: result.lastInsertRowid, duplicate: false };
  } catch (error) {
    // Handle unique constraint violation (race condition fallback)
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.message.includes('UNIQUE constraint failed')) {
      console.log(`[NOTIFICATION] Duplicate prevented (constraint) for user ${userId}, event_key: ${eventKey}`);
      return { created: false, id: null, duplicate: true };
    }
    throw error;
  }
}

/**
 * Create notifications for multiple users with deduplication
 *
 * @param {Object} options - Notification options
 * @param {number} options.agencyId - Agency ID
 * @param {number[]} options.userIds - Array of user IDs to notify
 * @param {string} options.type - Notification type ('urgent' or 'normal')
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification message
 * @param {string} [options.entityType] - Related entity type
 * @param {number} [options.entityId] - Related entity ID
 * @param {string} [options.eventKeyPrefix] - Event key prefix (will append user ID)
 * @returns {Object} - { total: number, created: number, duplicates: number }
 */
function createNotificationsForUsers(options) {
  const {
    agencyId,
    userIds,
    type,
    title,
    message,
    entityType,
    entityId,
    eventKeyPrefix
  } = options;

  let created = 0;
  let duplicates = 0;

  for (const userId of userIds) {
    // Generate unique event key per user if prefix provided
    const eventKey = eventKeyPrefix ? `${eventKeyPrefix}:user:${userId}` : null;

    const result = createNotification({
      agencyId,
      userId,
      type,
      title,
      message,
      entityType,
      entityId,
      eventKey
    });

    if (result.created) {
      created++;
    } else if (result.duplicate) {
      duplicates++;
    }
  }

  return { total: userIds.length, created, duplicates };
}

/**
 * Generate an event key for a specific event
 *
 * @param {string} eventType - Type of event (e.g., 'new_inquiry', 'stage_change')
 * @param {string} entityType - Entity type (e.g., 'trip', 'booking')
 * @param {number} entityId - Entity ID
 * @param {string} [extra] - Additional context (e.g., new stage name)
 * @returns {string} - Event key
 */
function generateEventKey(eventType, entityType, entityId, extra = null) {
  const base = `${eventType}:${entityType}:${entityId}`;
  return extra ? `${base}:${extra}` : base;
}

module.exports = {
  createNotification,
  createNotificationsForUsers,
  generateEventKey
};
