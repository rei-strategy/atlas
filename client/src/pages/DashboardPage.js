import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { useTimezone } from '../hooks/useTimezone';

const API_BASE = '/api';

const CATEGORY_LABELS = {
  follow_up: 'Follow Up',
  payment: 'Payment',
  commission: 'Commission',
  client_request: 'Client Request',
  internal: 'Internal'
};

function TaskItem({ task, onComplete, onClick, formatShortDate }) {
  const isOverdue = task.status === 'overdue';
  const isUrgent = task.priority === 'urgent';

  return (
    <div
      className={`dashboard-task-item ${isOverdue ? 'task-overdue' : ''} ${isUrgent ? 'task-urgent' : ''}`}
      onClick={() => onClick(task)}
    >
      <div className="dashboard-task-checkbox">
        <button
          className="task-complete-btn"
          onClick={(e) => {
            e.stopPropagation();
            onComplete(task.id);
          }}
          aria-label="Mark as complete"
        >
          <span className="checkbox-circle"></span>
        </button>
      </div>
      <div className="dashboard-task-content">
        <div className="dashboard-task-title">{task.title}</div>
        <div className="dashboard-task-meta">
          <span className="task-meta-category">{CATEGORY_LABELS[task.category] || task.category}</span>
          {task.tripName && (
            <span className="task-meta-trip">{task.tripName}</span>
          )}
          <span className={`task-meta-due ${isOverdue ? 'text-danger' : ''}`}>
            Due: {formatShortDate(task.dueDate)}
          </span>
        </div>
      </div>
      <div className="dashboard-task-badges">
        {isUrgent && <span className="badge badge-urgent">Urgent</span>}
        {isOverdue && <span className="badge badge-overdue">Overdue</span>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { token, handleSessionExpired } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { formatShortDate, isOverdue: checkOverdue, timezone } = useTimezone();
  const [tasks, setTasks] = useState([]);
  const [trips, setTrips] = useState([]);
  const [atRiskPayments, setAtRiskPayments] = useState({ overdue: [], nearDue: [], totalAtRisk: 0 });
  const [loading, setLoading] = useState(true);

  // Handle access denied redirect from admin routes
  useEffect(() => {
    if (location.state?.accessDenied) {
      addToast(location.state.message || 'Access denied', 'error');
      // Clear the state so the message doesn't repeat
      navigate('/dashboard', { replace: true, state: {} });
    }
  }, [location.state, addToast, navigate]);

  // Helper to check for token expiration
  const checkTokenExpiration = useCallback(async (res) => {
    if (res.status === 401) {
      const data = await res.clone().json().catch(() => ({}));
      if (data.code === 'TOKEN_EXPIRED') {
        handleSessionExpired();
        return true;
      }
    }
    return false;
  }, [handleSessionExpired]);

  const fetchTasks = useCallback(async () => {
    try {
      // Fetch all non-completed tasks (open or overdue)
      const res = await fetch(`${API_BASE}/tasks`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      // Check for token expiration
      if (await checkTokenExpiration(res)) return;

      const data = await res.json();
      if (res.ok) {
        // Filter to today's tasks and overdue tasks, sort by urgency
        // Use timezone-aware date comparison
        const todayInTz = new Date().toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD format
        const relevantTasks = data.tasks
          .filter(t => t.status !== 'completed' && (t.dueDate <= todayInTz || t.priority === 'urgent'))
          .sort((a, b) => {
            // Sort: overdue first, then urgent, then by due date
            if (a.status === 'overdue' && b.status !== 'overdue') return -1;
            if (b.status === 'overdue' && a.status !== 'overdue') return 1;
            if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
            if (b.priority === 'urgent' && a.priority !== 'urgent') return 1;
            return (a.dueDate || '').localeCompare(b.dueDate || '');
          });
        setTasks(relevantTasks);
      }
    } catch (err) {
      console.error('Failed to load tasks:', err);
    }
  }, [token, checkTokenExpiration, timezone]);

  const fetchTrips = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/trips`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      // Check for token expiration
      if (await checkTokenExpiration(res)) return;

      const data = await res.json();
      if (res.ok) {
        // Filter active trips (not completed, canceled, or archived)
        const activeTrips = data.trips.filter(t =>
          !['completed', 'canceled', 'archived'].includes(t.stage)
        );
        setTrips(activeTrips);
      }
    } catch (err) {
      console.error('Failed to load trips:', err);
    }
  }, [token, checkTokenExpiration]);

  const fetchAtRiskPayments = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/dashboard/at-risk-payments`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      // Check for token expiration
      if (await checkTokenExpiration(res)) return;

      const data = await res.json();
      if (res.ok) {
        setAtRiskPayments(data);
      }
    } catch (err) {
      console.error('Failed to load at-risk payments:', err);
    }
  }, [token, checkTokenExpiration]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchTasks(), fetchTrips(), fetchAtRiskPayments()]);
      setLoading(false);
    };
    loadData();
  }, [fetchTasks, fetchTrips, fetchAtRiskPayments]);

  const handleCompleteTask = async (taskId) => {
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}/complete`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      // Check for token expiration
      if (await checkTokenExpiration(res)) return;

      const data = await res.json();
      if (res.ok) {
        setTasks(prev => prev.filter(t => t.id !== taskId));
        addToast('Task completed!', 'success');
      } else {
        addToast(data.error || 'Failed to complete task', 'error');
      }
    } catch (err) {
      console.error('Failed to complete task:', err);
      addToast('Failed to complete task', 'error');
    }
  };

  const handleTaskClick = (task) => {
    navigate('/tasks');
  };

  const getStageLabel = (stage) => {
    const labels = {
      inquiry: 'Inquiry',
      quoted: 'Quoted',
      booked: 'Booked',
      final_payment_pending: 'Payment Pending',
      traveling: 'Traveling',
      completed: 'Completed',
      canceled: 'Canceled',
      archived: 'Archived'
    };
    return labels[stage] || stage;
  };

  const getStageClass = (stage) => {
    switch (stage) {
      case 'inquiry': return 'stage-inquiry';
      case 'quoted': return 'stage-quoted';
      case 'booked': return 'stage-booked';
      case 'final_payment_pending': return 'stage-payment';
      case 'traveling': return 'stage-traveling';
      default: return '';
    }
  };

  // Calculate upcoming deadlines from trips using timezone
  const getUpcomingDeadlines = () => {
    // Get today's date in the agency's timezone
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: timezone });
    const today = new Date(todayStr);
    const weekFromNow = new Date(today);
    weekFromNow.setDate(weekFromNow.getDate() + 7);

    const deadlines = [];
    trips.forEach(trip => {
      if (trip.finalPaymentDeadline) {
        const deadline = new Date(trip.finalPaymentDeadline);
        if (deadline >= today && deadline <= weekFromNow) {
          deadlines.push({
            type: 'payment',
            label: 'Final Payment',
            date: trip.finalPaymentDeadline,
            tripName: trip.name,
            tripId: trip.id
          });
        }
      }
      if (trip.travelStartDate) {
        const travelDate = new Date(trip.travelStartDate);
        if (travelDate >= today && travelDate <= weekFromNow) {
          deadlines.push({
            type: 'travel',
            label: 'Trip Starts',
            date: trip.travelStartDate,
            tripName: trip.name,
            tripId: trip.id
          });
        }
      }
    });
    return deadlines.sort((a, b) => a.date.localeCompare(b.date));
  };

  const upcomingDeadlines = getUpcomingDeadlines();

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-screen" style={{ minHeight: '300px' }}>
          <div className="loading-spinner" />
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Here's your overview for today.</p>
      </div>

      <div className="dashboard-grid">
        {/* Active Trips Card */}
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <div className="dashboard-card-title-row">
              {trips.length > 0 && (
                <span className="dashboard-card-count">{trips.length}</span>
              )}
              <h3>Active Trips</h3>
            </div>
          </div>
          <div className="dashboard-card-body">
            {trips.length === 0 ? (
              <p className="dashboard-empty-state">No active trips yet. Create your first client and trip to get started.</p>
            ) : (
              <>
                {/* Stage counts breakdown */}
                <div className="dashboard-stage-counts" style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  marginBottom: '1rem',
                  paddingBottom: '0.75rem',
                  borderBottom: '1px solid var(--color-border)'
                }}>
                  {['inquiry', 'quoted', 'booked', 'final_payment_pending', 'traveling'].map(stage => {
                    const count = trips.filter(t => t.stage === stage).length;
                    if (count === 0) return null;
                    return (
                      <div
                        key={stage}
                        className="stage-count-item"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          fontSize: '0.75rem',
                          cursor: 'pointer'
                        }}
                        onClick={() => navigate(`/trips?stage=${stage}`)}
                      >
                        <span className={`stage-badge ${getStageClass(stage)}`} style={{ padding: '0.125rem 0.5rem', fontSize: '0.7rem' }}>
                          {getStageLabel(stage)}
                        </span>
                        <span style={{ fontWeight: 600 }}>{count}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="dashboard-trips-list">
                  {trips.slice(0, 5).map(trip => (
                    <div
                      key={trip.id}
                      className="dashboard-trip-item"
                      onClick={() => navigate(`/trips`)}
                    >
                      <div className="dashboard-trip-info">
                        <div className="dashboard-trip-name">{trip.name}</div>
                        <div className="dashboard-trip-meta">
                          {trip.clientName && <span>{trip.clientName}</span>}
                          {trip.destination && <span>{trip.destination}</span>}
                        </div>
                      </div>
                      <span className={`stage-badge ${getStageClass(trip.stage)}`}>
                        {getStageLabel(trip.stage)}
                      </span>
                    </div>
                  ))}
                  {trips.length > 5 && (
                    <button className="btn btn-link" onClick={() => navigate('/trips')}>
                      View all {trips.length} trips
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Today's Tasks Card */}
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <div className="dashboard-card-title-row">
              {tasks.length > 0 && (
                <span className="dashboard-card-count">{tasks.length}</span>
              )}
              <h3>Today's Tasks</h3>
              {(() => {
                const overdueCount = tasks.filter(t => t.status === 'overdue').length;
                return overdueCount > 0 && (
                  <span className="badge badge-overdue" style={{ marginLeft: 'auto' }}>
                    {overdueCount} Overdue
                  </span>
                );
              })()}
            </div>
          </div>
          <div className="dashboard-card-body">
            {tasks.length === 0 ? (
              <p className="dashboard-empty-state">No tasks for today. Tasks will appear here as you manage trips.</p>
            ) : (
              <div className="dashboard-tasks-list">
                {tasks.slice(0, 5).map(task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onComplete={handleCompleteTask}
                    onClick={handleTaskClick}
                    formatShortDate={formatShortDate}
                  />
                ))}
                {tasks.length > 5 && (
                  <button className="btn btn-link" onClick={() => navigate('/tasks')}>
                    View all {tasks.length} tasks
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Deadlines Card */}
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <div className="dashboard-card-title-row">
              {upcomingDeadlines.length > 0 && (
                <span className="dashboard-card-count">{upcomingDeadlines.length}</span>
              )}
              <h3>Upcoming Deadlines</h3>
            </div>
          </div>
          <div className="dashboard-card-body">
            {upcomingDeadlines.length === 0 ? (
              <p className="dashboard-empty-state">No upcoming deadlines. Deadlines will appear when trips have payment or travel dates.</p>
            ) : (
              <div className="dashboard-deadlines-list">
                {upcomingDeadlines.map((deadline, idx) => (
                  <div
                    key={idx}
                    className="dashboard-deadline-item"
                    onClick={() => navigate('/trips')}
                  >
                    <div className={`deadline-icon ${deadline.type === 'payment' ? 'deadline-payment' : 'deadline-travel'}`}>
                      {deadline.type === 'payment' ? '$' : '✈'}
                    </div>
                    <div className="deadline-info">
                      <div className="deadline-label">{deadline.label}</div>
                      <div className="deadline-trip">{deadline.tripName}</div>
                    </div>
                    <div className="deadline-date">
                      {formatShortDate(deadline.date)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* At-Risk Payments Card */}
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <div className="dashboard-card-title-row">
              {atRiskPayments.totalAtRisk > 0 && (
                <span className="dashboard-card-count">{atRiskPayments.totalAtRisk}</span>
              )}
              <h3>At-Risk Payments</h3>
              {atRiskPayments.overdue.length > 0 && (
                <span className="badge badge-overdue" style={{ marginLeft: 'auto' }}>
                  {atRiskPayments.overdue.length} Overdue
                </span>
              )}
            </div>
          </div>
          <div className="dashboard-card-body">
            {atRiskPayments.totalAtRisk === 0 ? (
              <p className="dashboard-empty-state">No at-risk payments. Payments approaching due date will appear here.</p>
            ) : (
              <div className="dashboard-atrisk-list">
                {/* Overdue payments first (in red) */}
                {atRiskPayments.overdue.map(payment => (
                  <div
                    key={`overdue-${payment.bookingId}`}
                    className="dashboard-atrisk-item atrisk-overdue"
                    onClick={() => navigate(`/trips`)}
                  >
                    <div className="atrisk-icon atrisk-icon-overdue">!</div>
                    <div className="atrisk-info">
                      <div className="atrisk-supplier">{payment.supplierName || payment.bookingType}</div>
                      <div className="atrisk-meta">
                        <span className="atrisk-trip">{payment.tripName}</span>
                        {payment.clientName && <span className="atrisk-client">{payment.clientName}</span>}
                      </div>
                    </div>
                    <div className="atrisk-details">
                      <div className="atrisk-amount">${(payment.finalPaymentAmount || 0).toLocaleString()}</div>
                      <div className="atrisk-due text-danger">
                        {payment.daysOverdue} day{payment.daysOverdue !== 1 ? 's' : ''} overdue
                      </div>
                    </div>
                  </div>
                ))}
                {/* Near-due payments */}
                {atRiskPayments.nearDue.slice(0, 5 - atRiskPayments.overdue.length).map(payment => (
                  <div
                    key={`neardue-${payment.bookingId}`}
                    className={`dashboard-atrisk-item ${payment.isUrgent ? 'atrisk-urgent' : ''}`}
                    onClick={() => navigate(`/trips`)}
                  >
                    <div className={`atrisk-icon ${payment.isUrgent ? 'atrisk-icon-urgent' : 'atrisk-icon-warning'}`}>$</div>
                    <div className="atrisk-info">
                      <div className="atrisk-supplier">{payment.supplierName || payment.bookingType}</div>
                      <div className="atrisk-meta">
                        <span className="atrisk-trip">{payment.tripName}</span>
                        {payment.clientName && <span className="atrisk-client">{payment.clientName}</span>}
                      </div>
                    </div>
                    <div className="atrisk-details">
                      <div className="atrisk-amount">${(payment.finalPaymentAmount || 0).toLocaleString()}</div>
                      <div className={`atrisk-due ${payment.isUrgent ? 'text-warning' : ''}`}>
                        Due in {payment.daysUntilDue} day{payment.daysUntilDue !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                ))}
                {atRiskPayments.totalAtRisk > 5 && (
                  <button className="btn btn-link" onClick={() => navigate('/commissions')}>
                    View all {atRiskPayments.totalAtRisk} at-risk payments
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Commission Pipeline Card */}
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h3>Commission Pipeline</h3>
          </div>
          <div className="dashboard-card-body">
            <p className="dashboard-empty-state">No commissions tracked yet. Commission data will appear as bookings are created.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
