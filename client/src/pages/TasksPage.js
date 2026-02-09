import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { useTimezone } from '../hooks/useTimezone';
import { generateIdempotencyKey } from '../utils/idempotency';
import { useModalAccessibility } from '../hooks/useModalAccessibility';
import LoadingButton from '../components/LoadingButton';

const API_BASE = '/api';

const PRIORITY_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'urgent', label: 'Urgent' }
];

const CATEGORY_OPTIONS = [
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'payment', label: 'Payment' },
  { value: 'commission', label: 'Commission' },
  { value: 'client_request', label: 'Client Request' },
  { value: 'internal', label: 'Internal / Admin' }
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'open', label: 'Open' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'completed', label: 'Completed' }
];

function TaskFormModal({ isOpen, onClose, onSaved, task, token, users, trips }) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submittingRef = useRef(false); // Prevent double-click submission
  // Modal accessibility: focus trapping, Escape key, focus restoration
  const { modalRef } = useModalAccessibility(isOpen, onClose);
  // Generate new idempotency key when modal opens to prevent duplicate submissions on back/resubmit
  const idempotencyKey = useMemo(() => isOpen ? generateIdempotencyKey() : null, [isOpen]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    dueDate: '',
    priority: 'normal',
    category: 'internal',
    assignedUserId: '',
    tripId: ''
  });

  useEffect(() => {
    if (task) {
      setForm({
        title: task.title || '',
        description: task.description || '',
        dueDate: task.dueDate || '',
        priority: task.priority || 'normal',
        category: task.category || 'internal',
        assignedUserId: task.assignedUserId?.toString() || '',
        tripId: task.tripId?.toString() || ''
      });
    } else {
      // Default due date to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setForm({
        title: '',
        description: '',
        dueDate: tomorrow.toISOString().split('T')[0],
        priority: 'normal',
        category: 'internal',
        assignedUserId: '',
        tripId: ''
      });
    }
    setError('');
  }, [task, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Prevent double-click submission
    if (submittingRef.current || loading) {
      return;
    }
    submittingRef.current = true;

    setError('');

    if (!form.title.trim()) {
      setError('Task title is required');
      submittingRef.current = false;
      return;
    }

    if (!form.dueDate) {
      setError('Due date is required');
      submittingRef.current = false;
      return;
    }

    setLoading(true);
    try {
      const isEdit = !!task;
      const url = isEdit ? `${API_BASE}/tasks/${task.id}` : `${API_BASE}/tasks`;
      const method = isEdit ? 'PUT' : 'POST';

      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        dueDate: form.dueDate,
        priority: form.priority,
        category: form.category,
        assignedUserId: form.assignedUserId ? parseInt(form.assignedUserId) : null,
        tripId: form.tripId ? parseInt(form.tripId) : null
      };

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey })
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save task');
      }

      addToast(isEdit ? 'Task updated successfully' : 'Task created successfully', 'success');
      onSaved(data.task);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        ref={modalRef}
        className="modal-content modal-md"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-form-modal-title"
      >
        <div className="modal-header">
          <h2 className="modal-title" id="task-form-modal-title">{task ? 'Edit Task' : 'Create Task'}</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close dialog">&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="auth-error" role="alert">{error}</div>}
            <fieldset disabled={loading} style={{ border: 'none', padding: 0, margin: 0 }}>
            <div className="form-group">
              <label className="form-label" htmlFor="title">Title *</label>
              <input
                id="title"
                name="title"
                className="form-input"
                value={form.title}
                onChange={handleChange}
                placeholder="What needs to be done?"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                className="form-input form-textarea"
                value={form.description}
                onChange={handleChange}
                placeholder="Additional details..."
                rows={3}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="dueDate">Due Date *</label>
                <input
                  id="dueDate"
                  name="dueDate"
                  type="date"
                  className="form-input"
                  value={form.dueDate}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="priority">Priority</label>
                <select
                  id="priority"
                  name="priority"
                  className="form-input"
                  value={form.priority}
                  onChange={handleChange}
                >
                  {PRIORITY_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="category">Category</label>
                <select
                  id="category"
                  name="category"
                  className="form-input"
                  value={form.category}
                  onChange={handleChange}
                >
                  {CATEGORY_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="assignedUserId">Assign To</label>
                <select
                  id="assignedUserId"
                  name="assignedUserId"
                  className="form-input"
                  value={form.assignedUserId}
                  onChange={handleChange}
                >
                  <option value="">Assign to me</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.firstName} {u.lastName} ({u.role})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="tripId">Link to Trip (Optional)</label>
              <select
                id="tripId"
                name="tripId"
                className="form-input"
                value={form.tripId}
                onChange={handleChange}
              >
                <option value="">No trip linked</option>
                {trips.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.clientName ? `(${t.clientName})` : ''} - {t.destination || 'No destination'}
                  </option>
                ))}
              </select>
            </div>
            </fieldset>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>Cancel</button>
            <LoadingButton
              type="submit"
              className="btn btn-primary"
              loading={loading}
              loadingText="Saving..."
            >
              {task ? 'Save Changes' : 'Create Task'}
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
}

function TaskCard({ task, onComplete, onEdit }) {
  const { formatDate } = useTimezone();

  const getPriorityClass = (priority) => {
    return priority === 'urgent' ? 'priority-urgent' : 'priority-normal';
  };

  const getStatusClass = (status) => {
    switch (status) {
      case 'completed': return 'status-success';
      case 'overdue': return 'status-danger';
      default: return 'status-neutral';
    }
  };

  const getCategoryLabel = (category) => {
    const cat = CATEGORY_OPTIONS.find(c => c.value === category);
    return cat ? cat.label : category;
  };

  const isOverdue = task.status === 'overdue';
  const isCompleted = task.status === 'completed';

  return (
    <div className={`task-card ${isOverdue ? 'task-card-overdue' : ''} ${isCompleted ? 'task-card-completed' : ''}`}>
      <div className="task-card-header">
        <div className="task-card-title-row">
          {!isCompleted && (
            <button
              className="task-checkbox"
              onClick={() => onComplete(task.id)}
              aria-label="Mark as complete"
            >
              <span className="checkbox-icon"></span>
            </button>
          )}
          {isCompleted && (
            <span className="task-checkbox task-checkbox-completed" aria-label="Completed">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </span>
          )}
          <h3 className={`task-card-title ${isCompleted ? 'task-title-completed' : ''}`}>
            {task.title}
          </h3>
          {task.priority === 'urgent' && (
            <span className={`priority-badge ${getPriorityClass(task.priority)}`}>Urgent</span>
          )}
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => onEdit(task)}>
          Edit
        </button>
      </div>

      {task.description && (
        <p className="task-card-description">{task.description}</p>
      )}

      <div className="task-card-meta">
        <div className="task-meta-item">
          <span className="task-meta-label">Due:</span>
          <span className={`task-meta-value ${isOverdue ? 'text-danger' : ''}`}>
            {formatDate(task.dueDate)}
          </span>
        </div>
        <div className="task-meta-item">
          <span className="task-meta-label">Status:</span>
          <span className={`status-badge ${getStatusClass(task.status)}`}>
            {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
          </span>
        </div>
        <div className="task-meta-item">
          <span className="task-meta-label">Category:</span>
          <span className="task-meta-value">{getCategoryLabel(task.category)}</span>
        </div>
        {task.assignedUserName && (
          <div className="task-meta-item">
            <span className="task-meta-label">Assigned:</span>
            <span className="task-meta-value">{task.assignedUserName}</span>
          </div>
        )}
        {task.tripName && (
          <div className="task-meta-item">
            <span className="task-meta-label">Trip:</span>
            <span className="task-meta-value">{task.tripName}</span>
          </div>
        )}
        {task.isSystemGenerated && (
          <div className="task-meta-item">
            <span className="task-system-badge">System Generated</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TasksPage() {
  const { token, user } = useAuth();
  const { addToast } = useToast();
  const { formatDate } = useTimezone();
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTask, setEditTask] = useState(null);

  // Filters
  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    category: '',
    search: '',
    assignedTo: '' // '' = all, 'me' = current user, or specific user ID
  });

  const fetchTasks = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.priority) params.set('priority', filters.priority);
      if (filters.category) params.set('category', filters.category);
      if (filters.search) params.set('search', filters.search);
      if (filters.assignedTo) {
        // 'me' means current user, otherwise it's a specific user ID
        const assignedToId = filters.assignedTo === 'me' ? user?.id : filters.assignedTo;
        if (assignedToId) params.set('assignedTo', assignedToId);
      }

      const res = await fetch(`${API_BASE}/tasks?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setTasks(data.tasks);
      }
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [token, filters, user]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setUsers(data.users);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  }, [token]);

  const fetchTrips = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/trips`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setTrips(data.trips);
      }
    } catch (err) {
      console.error('Failed to load trips:', err);
    }
  }, [token]);

  useEffect(() => {
    fetchTasks();
    fetchUsers();
    fetchTrips();
  }, [fetchTasks, fetchUsers, fetchTrips]);

  const handleCreateTask = () => {
    setEditTask(null);
    setShowModal(true);
  };

  const handleEditTask = (task) => {
    setEditTask(task);
    setShowModal(true);
  };

  const handleTaskSaved = (savedTask) => {
    setTasks(prev => {
      const existing = prev.find(t => t.id === savedTask.id);
      if (existing) {
        return prev.map(t => t.id === savedTask.id ? savedTask : t);
      }
      return [savedTask, ...prev];
    });
  };

  const handleCompleteTask = async (taskId) => {
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}/complete`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        setTasks(prev => prev.map(t => t.id === taskId ? data.task : t));
        addToast('Task completed!', 'success');
      } else {
        addToast(data.error || 'Failed to complete task', 'error');
      }
    } catch (err) {
      console.error('Failed to complete task:', err);
      addToast('Failed to complete task', 'error');
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  // Separate tasks by status for grouping
  const urgentTasks = tasks.filter(t => t.status !== 'completed' && (t.priority === 'urgent' || t.status === 'overdue'));
  const openTasks = tasks.filter(t => t.status === 'open' && t.priority !== 'urgent');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-subtitle">Track and manage your tasks.</p>
        </div>
        <button className="btn btn-primary" onClick={handleCreateTask}>
          + Add Task
        </button>
      </div>

      {/* Filters */}
      <div className="filters-row" style={{ marginBottom: 'var(--spacing-lg)', display: 'flex', gap: 'var(--spacing-md)', flexWrap: 'wrap' }}>
        <input
          type="text"
          name="search"
          className="form-input"
          placeholder="Search tasks..."
          value={filters.search}
          onChange={handleFilterChange}
          style={{ flex: '1', minWidth: '200px' }}
        />
        <select
          name="status"
          className="form-input"
          value={filters.status}
          onChange={handleFilterChange}
          style={{ width: '150px' }}
        >
          {STATUS_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          name="priority"
          className="form-input"
          value={filters.priority}
          onChange={handleFilterChange}
          style={{ width: '150px' }}
        >
          <option value="">All Priorities</option>
          {PRIORITY_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          name="category"
          className="form-input"
          value={filters.category}
          onChange={handleFilterChange}
          style={{ width: '180px' }}
        >
          <option value="">All Categories</option>
          {CATEGORY_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          name="assignedTo"
          className="form-input"
          value={filters.assignedTo}
          onChange={handleFilterChange}
          style={{ width: '180px' }}
        >
          <option value="">All Assignees</option>
          <option value="me">Assigned to Me</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>
              {u.firstName} {u.lastName}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="loading-screen" style={{ minHeight: '200px' }}>
          <div className="loading-spinner" />
          <p>Loading tasks...</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="page-empty-state">
          <div className="empty-state-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </div>
          <h3 className="empty-state-title">No tasks yet</h3>
          <p className="empty-state-description">
            Create your first task to start tracking your work. Tasks can also be generated automatically from trip stage changes.
          </p>
          <button className="btn btn-primary" style={{ marginTop: 'var(--spacing-md)' }} onClick={handleCreateTask}>
            + Add Your First Task
          </button>
        </div>
      ) : (
        <div className="tasks-container">
          {/* Urgent / Overdue Section */}
          {urgentTasks.length > 0 && (
            <div className="tasks-section">
              <h2 className="tasks-section-title tasks-section-urgent">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                Urgent & Overdue ({urgentTasks.length})
              </h2>
              <div className="tasks-list">
                {urgentTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onComplete={handleCompleteTask}
                    onEdit={handleEditTask}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Open Tasks Section */}
          {openTasks.length > 0 && (
            <div className="tasks-section">
              <h2 className="tasks-section-title">
                Open Tasks ({openTasks.length})
              </h2>
              <div className="tasks-list">
                {openTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onComplete={handleCompleteTask}
                    onEdit={handleEditTask}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Completed Tasks Section */}
          {completedTasks.length > 0 && (
            <div className="tasks-section">
              <h2 className="tasks-section-title tasks-section-completed">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                Completed ({completedTasks.length})
              </h2>
              <div className="tasks-list">
                {completedTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onComplete={handleCompleteTask}
                    onEdit={handleEditTask}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <TaskFormModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditTask(null); }}
        onSaved={handleTaskSaved}
        task={editTask}
        token={token}
        users={users}
        trips={trips}
      />
    </div>
  );
}
