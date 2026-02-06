const express = require('express');
const { getDb } = require('../config/database');
const { authenticate, tenantScope } = require('../middleware/auth');
const { checkAllDeadlines } = require('../services/deadlineTaskService');

const router = express.Router();

// All task routes require authentication and tenant scope
router.use(authenticate);
router.use(tenantScope);

const VALID_STATUSES = ['open', 'completed', 'overdue'];
const VALID_PRIORITIES = ['normal', 'urgent'];
const VALID_CATEGORIES = ['follow_up', 'payment', 'commission', 'client_request', 'internal'];

/**
 * GET /api/tasks
 * List all tasks for the agency with optional filters
 */
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const {
      status,
      priority,
      category,
      assignedTo,
      tripId,
      search,
      sortBy = 'due_date',
      sortOrder = 'asc'
    } = req.query;

    let query = `
      SELECT t.*,
        u.first_name as assigned_first_name, u.last_name as assigned_last_name,
        tr.name as trip_name, tr.destination as trip_destination,
        c.first_name as client_first_name, c.last_name as client_last_name
      FROM tasks t
      LEFT JOIN users u ON t.assigned_user_id = u.id
      LEFT JOIN trips tr ON t.trip_id = tr.id
      LEFT JOIN clients c ON tr.client_id = c.id
      WHERE t.agency_id = ?
    `;
    const params = [req.agencyId];

    if (status) {
      query += ` AND t.status = ?`;
      params.push(status);
    }

    if (priority) {
      query += ` AND t.priority = ?`;
      params.push(priority);
    }

    if (category) {
      query += ` AND t.category = ?`;
      params.push(category);
    }

    if (assignedTo) {
      query += ` AND t.assigned_user_id = ?`;
      params.push(assignedTo);
    }

    if (tripId) {
      query += ` AND t.trip_id = ?`;
      params.push(tripId);
    }

    if (search) {
      query += ` AND (t.title LIKE ? OR t.description LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    // Sort with priority consideration: urgent tasks first, then by due date
    const allowedSortCols = ['title', 'due_date', 'status', 'priority', 'category', 'created_at'];
    const safeSortBy = allowedSortCols.includes(sortBy) ? sortBy : 'due_date';
    const safeSortOrder = sortOrder === 'desc' ? 'DESC' : 'ASC';

    // Order by priority (urgent first) then by the chosen column
    query += ` ORDER BY
      CASE WHEN t.priority = 'urgent' THEN 0 ELSE 1 END ASC,
      t.${safeSortBy} ${safeSortOrder}`;

    const tasks = db.prepare(query).all(...params);

    // Check for overdue tasks and update their status
    const today = new Date().toISOString().split('T')[0];
    const overdueTaskIds = tasks
      .filter(t => t.status === 'open' && t.due_date && t.due_date < today)
      .map(t => t.id);

    if (overdueTaskIds.length > 0) {
      db.prepare(`
        UPDATE tasks SET status = 'overdue', updated_at = CURRENT_TIMESTAMP
        WHERE id IN (${overdueTaskIds.map(() => '?').join(',')}) AND agency_id = ?
      `).run(...overdueTaskIds, req.agencyId);
    }

    res.json({
      tasks: tasks.map(t => formatTask(t, today)),
      total: tasks.length
    });
  } catch (error) {
    console.error('[ERROR] List tasks failed:', error.message);
    res.status(500).json({ error: 'Failed to list tasks' });
  }
});

/**
 * POST /api/tasks/check-deadlines
 * Trigger deadline check and create tasks for approaching deadlines
 * (Admin only - can be called manually or by cron)
 */
router.post('/check-deadlines', (req, res) => {
  try {
    // Only admins can trigger deadline check
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can trigger deadline checks' });
    }

    const result = checkAllDeadlines();

    res.json({
      message: 'Deadline check completed',
      result
    });
  } catch (error) {
    console.error('[ERROR] Check deadlines failed:', error.message);
    res.status(500).json({ error: 'Failed to check deadlines' });
  }
});

/**
 * GET /api/tasks/:id
 * Get a single task by ID
 */
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const task = db.prepare(`
      SELECT t.*,
        u.first_name as assigned_first_name, u.last_name as assigned_last_name,
        tr.name as trip_name, tr.destination as trip_destination,
        c.first_name as client_first_name, c.last_name as client_last_name
      FROM tasks t
      LEFT JOIN users u ON t.assigned_user_id = u.id
      LEFT JOIN trips tr ON t.trip_id = tr.id
      LEFT JOIN clients c ON tr.client_id = c.id
      WHERE t.id = ? AND t.agency_id = ?
    `).get(req.params.id, req.agencyId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const today = new Date().toISOString().split('T')[0];
    res.json({ task: formatTask(task, today) });
  } catch (error) {
    console.error('[ERROR] Get task failed:', error.message);
    res.status(500).json({ error: 'Failed to get task' });
  }
});

/**
 * POST /api/tasks
 * Create a new task (manual task creation by planner)
 */
router.post('/', (req, res) => {
  try {
    const {
      title,
      description,
      dueDate,
      priority = 'normal',
      category = 'internal',
      assignedUserId,
      tripId
    } = req.body;

    // Validation
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    if (!dueDate) {
      return res.status(400).json({ error: 'Due date is required' });
    }

    if (priority && !VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: `Invalid priority. Valid options: ${VALID_PRIORITIES.join(', ')}` });
    }

    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `Invalid category. Valid options: ${VALID_CATEGORIES.join(', ')}` });
    }

    const db = getDb();

    // Verify assigned user exists and belongs to same agency
    const assignee = assignedUserId || req.user.id;
    const userCheck = db.prepare('SELECT id FROM users WHERE id = ? AND agency_id = ?').get(assignee, req.agencyId);
    if (!userCheck) {
      return res.status(400).json({ error: 'Assigned user not found in your agency' });
    }

    // Verify trip exists and belongs to same agency (if provided)
    if (tripId) {
      const tripCheck = db.prepare('SELECT id FROM trips WHERE id = ? AND agency_id = ?').get(tripId, req.agencyId);
      if (!tripCheck) {
        return res.status(400).json({ error: 'Trip not found' });
      }
    }

    const result = db.prepare(`
      INSERT INTO tasks (
        agency_id, trip_id, assigned_user_id,
        title, description, due_date,
        status, priority, category,
        is_system_generated, source_event
      ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, 0, NULL)
    `).run(
      req.agencyId,
      tripId || null,
      assignee,
      title.trim(),
      description || null,
      dueDate,
      priority,
      category
    );

    const taskId = result.lastInsertRowid;

    // Fetch the created task with joins
    const task = db.prepare(`
      SELECT t.*,
        u.first_name as assigned_first_name, u.last_name as assigned_last_name,
        tr.name as trip_name, tr.destination as trip_destination,
        c.first_name as client_first_name, c.last_name as client_last_name
      FROM tasks t
      LEFT JOIN users u ON t.assigned_user_id = u.id
      LEFT JOIN trips tr ON t.trip_id = tr.id
      LEFT JOIN clients c ON tr.client_id = c.id
      WHERE t.id = ? AND t.agency_id = ?
    `).get(taskId, req.agencyId);

    // Log the creation in audit logs
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      req.user.id,
      'create_task',
      'task',
      taskId,
      JSON.stringify({ title: title.trim(), assignedTo: assignee, dueDate, priority, category }),
      tripId || null
    );

    const today = new Date().toISOString().split('T')[0];
    res.status(201).json({
      message: 'Task created successfully',
      task: formatTask(task, today)
    });
  } catch (error) {
    console.error('[ERROR] Create task failed:', error.message);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

/**
 * PUT /api/tasks/:id
 * Update a task
 */
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const taskId = req.params.id;

    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND agency_id = ?').get(taskId, req.agencyId);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const {
      title,
      description,
      dueDate,
      priority,
      category,
      assignedUserId,
      tripId
    } = req.body;

    // Validation
    if (priority && !VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: `Invalid priority. Valid options: ${VALID_PRIORITIES.join(', ')}` });
    }

    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `Invalid category. Valid options: ${VALID_CATEGORIES.join(', ')}` });
    }

    // Verify assigned user if changing
    if (assignedUserId) {
      const userCheck = db.prepare('SELECT id FROM users WHERE id = ? AND agency_id = ?').get(assignedUserId, req.agencyId);
      if (!userCheck) {
        return res.status(400).json({ error: 'Assigned user not found in your agency' });
      }
    }

    // Verify trip if changing
    if (tripId) {
      const tripCheck = db.prepare('SELECT id FROM trips WHERE id = ? AND agency_id = ?').get(tripId, req.agencyId);
      if (!tripCheck) {
        return res.status(400).json({ error: 'Trip not found' });
      }
    }

    // Check if assignee is changing
    const previousAssignee = existing.assigned_user_id;
    const newAssignee = assignedUserId || previousAssignee;
    const isReassigning = assignedUserId && assignedUserId !== previousAssignee;

    db.prepare(`
      UPDATE tasks SET
        title = COALESCE(?, title),
        description = ?,
        due_date = COALESCE(?, due_date),
        priority = COALESCE(?, priority),
        category = COALESCE(?, category),
        assigned_user_id = COALESCE(?, assigned_user_id),
        trip_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND agency_id = ?
    `).run(
      title || null,
      description !== undefined ? description : existing.description,
      dueDate || null,
      priority || null,
      category || null,
      assignedUserId || null,
      tripId !== undefined ? tripId : existing.trip_id,
      taskId,
      req.agencyId
    );

    // If task was reassigned, log it and create notification
    if (isReassigning) {
      // Get the new assignee's name
      const newUser = db.prepare('SELECT first_name, last_name FROM users WHERE id = ?').get(newAssignee);
      const newAssigneeName = newUser ? `${newUser.first_name} ${newUser.last_name}` : 'Unknown';

      // Log reassignment in audit
      db.prepare(`
        INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.agencyId,
        req.user.id,
        'reassign_task',
        'task',
        taskId,
        JSON.stringify({
          title: existing.title,
          previousAssignee,
          newAssignee,
          newAssigneeName
        }),
        existing.trip_id
      );

      // Create notification for the new assignee (if different from current user)
      if (newAssignee !== req.user.id) {
        // Get current user's name for the notification message
        const currentUser = db.prepare('SELECT first_name, last_name FROM users WHERE id = ?').get(req.user.id);
        const assignerName = currentUser ? `${currentUser.first_name} ${currentUser.last_name}` : 'A team member';

        const eventKey = `task_assigned_${taskId}_${Date.now()}`;
        db.prepare(`
          INSERT INTO notifications (agency_id, user_id, type, title, message, entity_type, entity_id, event_key)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          req.agencyId,
          newAssignee,
          'normal',
          'Task Assigned to You',
          `"${existing.title}" has been assigned to you by ${assignerName}.`,
          'task',
          taskId,
          eventKey
        );
      }
    }

    // Fetch updated task
    const task = db.prepare(`
      SELECT t.*,
        u.first_name as assigned_first_name, u.last_name as assigned_last_name,
        tr.name as trip_name, tr.destination as trip_destination,
        c.first_name as client_first_name, c.last_name as client_last_name
      FROM tasks t
      LEFT JOIN users u ON t.assigned_user_id = u.id
      LEFT JOIN trips tr ON t.trip_id = tr.id
      LEFT JOIN clients c ON tr.client_id = c.id
      WHERE t.id = ? AND t.agency_id = ?
    `).get(taskId, req.agencyId);

    const today = new Date().toISOString().split('T')[0];
    res.json({
      message: 'Task updated successfully',
      task: formatTask(task, today)
    });
  } catch (error) {
    console.error('[ERROR] Update task failed:', error.message);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

/**
 * PUT /api/tasks/:id/complete
 * Mark a task as completed
 */
router.put('/:id/complete', (req, res) => {
  try {
    const db = getDb();
    const taskId = req.params.id;

    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND agency_id = ?').get(taskId, req.agencyId);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (existing.status === 'completed') {
      return res.status(400).json({ error: 'Task is already completed' });
    }

    db.prepare(`
      UPDATE tasks SET
        status = 'completed',
        completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND agency_id = ?
    `).run(taskId, req.agencyId);

    // Log completion in audit
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      req.user.id,
      'complete_task',
      'task',
      taskId,
      JSON.stringify({ title: existing.title, previousStatus: existing.status }),
      existing.trip_id
    );

    // Fetch updated task
    const task = db.prepare(`
      SELECT t.*,
        u.first_name as assigned_first_name, u.last_name as assigned_last_name,
        tr.name as trip_name, tr.destination as trip_destination,
        c.first_name as client_first_name, c.last_name as client_last_name
      FROM tasks t
      LEFT JOIN users u ON t.assigned_user_id = u.id
      LEFT JOIN trips tr ON t.trip_id = tr.id
      LEFT JOIN clients c ON tr.client_id = c.id
      WHERE t.id = ? AND t.agency_id = ?
    `).get(taskId, req.agencyId);

    const today = new Date().toISOString().split('T')[0];
    res.json({
      message: 'Task marked as completed',
      task: formatTask(task, today)
    });
  } catch (error) {
    console.error('[ERROR] Complete task failed:', error.message);
    res.status(500).json({ error: 'Failed to complete task' });
  }
});

/**
 * PUT /api/tasks/:id/assign
 * Reassign a task to another user
 */
router.put('/:id/assign', (req, res) => {
  try {
    const db = getDb();
    const taskId = req.params.id;
    const { assignedUserId } = req.body;

    if (!assignedUserId) {
      return res.status(400).json({ error: 'assignedUserId is required' });
    }

    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND agency_id = ?').get(taskId, req.agencyId);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Verify assigned user exists and belongs to same agency
    const userCheck = db.prepare('SELECT id, first_name, last_name FROM users WHERE id = ? AND agency_id = ?').get(assignedUserId, req.agencyId);
    if (!userCheck) {
      return res.status(400).json({ error: 'Assigned user not found in your agency' });
    }

    const previousAssignee = existing.assigned_user_id;

    db.prepare(`
      UPDATE tasks SET
        assigned_user_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND agency_id = ?
    `).run(assignedUserId, taskId, req.agencyId);

    // Log reassignment in audit
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      req.user.id,
      'reassign_task',
      'task',
      taskId,
      JSON.stringify({
        title: existing.title,
        previousAssignee,
        newAssignee: assignedUserId,
        newAssigneeName: `${userCheck.first_name} ${userCheck.last_name}`
      }),
      existing.trip_id
    );

    // Create notification for the new assignee (if different from current user)
    if (assignedUserId !== req.user.id && assignedUserId !== previousAssignee) {
      // Get current user's name for the notification message
      const currentUser = db.prepare('SELECT first_name, last_name FROM users WHERE id = ?').get(req.user.id);
      const assignerName = currentUser ? `${currentUser.first_name} ${currentUser.last_name}` : 'A team member';

      const eventKey = `task_assigned_${taskId}_${Date.now()}`;
      db.prepare(`
        INSERT INTO notifications (agency_id, user_id, type, title, message, entity_type, entity_id, event_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.agencyId,
        assignedUserId,
        'normal',
        'Task Assigned to You',
        `"${existing.title}" has been assigned to you by ${assignerName}.`,
        'task',
        taskId,
        eventKey
      );
    }

    // Fetch updated task
    const task = db.prepare(`
      SELECT t.*,
        u.first_name as assigned_first_name, u.last_name as assigned_last_name,
        tr.name as trip_name, tr.destination as trip_destination,
        c.first_name as client_first_name, c.last_name as client_last_name
      FROM tasks t
      LEFT JOIN users u ON t.assigned_user_id = u.id
      LEFT JOIN trips tr ON t.trip_id = tr.id
      LEFT JOIN clients c ON tr.client_id = c.id
      WHERE t.id = ? AND t.agency_id = ?
    `).get(taskId, req.agencyId);

    const today = new Date().toISOString().split('T')[0];
    res.json({
      message: `Task reassigned to ${userCheck.first_name} ${userCheck.last_name}`,
      task: formatTask(task, today)
    });
  } catch (error) {
    console.error('[ERROR] Reassign task failed:', error.message);
    res.status(500).json({ error: 'Failed to reassign task' });
  }
});

/**
 * DELETE /api/tasks/:id
 * Delete a task
 */
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const taskId = req.params.id;

    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND agency_id = ?').get(taskId, req.agencyId);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    db.prepare('DELETE FROM tasks WHERE id = ? AND agency_id = ?').run(taskId, req.agencyId);

    // Log deletion in audit
    db.prepare(`
      INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, details, trip_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.agencyId,
      req.user.id,
      'delete_task',
      'task',
      taskId,
      JSON.stringify({ title: existing.title, wasSystemGenerated: !!existing.is_system_generated }),
      existing.trip_id
    );

    res.json({ message: 'Task deleted successfully', deletedId: taskId });
  } catch (error) {
    console.error('[ERROR] Delete task failed:', error.message);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

function formatTask(t, today) {
  // Determine if task is overdue
  let status = t.status;
  if (status === 'open' && t.due_date && t.due_date < today) {
    status = 'overdue';
  }

  return {
    id: t.id,
    tripId: t.trip_id,
    tripName: t.trip_name || null,
    tripDestination: t.trip_destination || null,
    clientName: t.client_first_name ? `${t.client_first_name} ${t.client_last_name}` : null,
    assignedUserId: t.assigned_user_id,
    assignedUserName: t.assigned_first_name ? `${t.assigned_first_name} ${t.assigned_last_name}` : null,
    title: t.title,
    description: t.description,
    dueDate: t.due_date,
    status: status,
    priority: t.priority,
    category: t.category,
    isSystemGenerated: !!t.is_system_generated,
    sourceEvent: t.source_event,
    createdAt: t.created_at,
    completedAt: t.completed_at,
    updatedAt: t.updated_at
  };
}

module.exports = router;
