import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { useTimezone } from '../hooks/useTimezone';
import { useNetworkError, isNetworkError } from '../context/NetworkErrorContext';
import { NetworkErrorFallback } from '../components/NetworkError';

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
  const { token, handleSessionExpired, user } = useAuth();
  const { addToast } = useToast();
  const { showNetworkError } = useNetworkError();
  const navigate = useNavigate();
  const location = useLocation();
  const { formatShortDate, isOverdue: checkOverdue, timezone } = useTimezone();
  const [tasks, setTasks] = useState([]);
  const [trips, setTrips] = useState([]);
  const [atRiskPayments, setAtRiskPayments] = useState({ overdue: [], nearDue: [], totalAtRisk: 0 });
  const [recentItems, setRecentItems] = useState({ clients: [], trips: [] });
  const [commissionPipeline, setCommissionPipeline] = useState({
    pipeline: { expected: { count: 0, amount: 0 }, submitted: { count: 0, amount: 0 }, paid: { count: 0, amount: 0 } },
    summary: { totalBookings: 0, totalExpected: 0, totalReceived: 0, outstanding: 0 }
  });
  const [plannerPerformance, setPlannerPerformance] = useState({ planners: [], totals: {} });
  const [recentActivity, setRecentActivity] = useState({ activities: [], count: 0 });
  const [loading, setLoading] = useState(true);
  const [networkErrorState, setNetworkErrorState] = useState(null);

  const isAdmin = user?.role === 'admin';

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
      if (isNetworkError(err)) {
        setNetworkErrorState(err);
        showNetworkError(err, fetchTasks);
      }
    }
  }, [token, checkTokenExpiration, timezone, showNetworkError]);

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
      if (isNetworkError(err)) {
        setNetworkErrorState(err);
        showNetworkError(err, fetchTrips);
      }
    }
  }, [token, checkTokenExpiration, showNetworkError]);

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
      if (isNetworkError(err)) {
        setNetworkErrorState(err);
        showNetworkError(err, fetchAtRiskPayments);
      }
    }
  }, [token, checkTokenExpiration, showNetworkError]);

  const fetchRecentItems = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/dashboard/recent-items?limit=5`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      // Check for token expiration
      if (await checkTokenExpiration(res)) return;

      const data = await res.json();
      if (res.ok) {
        setRecentItems(data);
      }
    } catch (err) {
      console.error('Failed to load recent items:', err);
      if (isNetworkError(err)) {
        setNetworkErrorState(err);
        showNetworkError(err, fetchRecentItems);
      }
    }
  }, [token, checkTokenExpiration, showNetworkError]);

  const fetchCommissionPipeline = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/dashboard/commission-pipeline`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      // Check for token expiration
      if (await checkTokenExpiration(res)) return;

      const data = await res.json();
      if (res.ok) {
        setCommissionPipeline(data);
      }
    } catch (err) {
      console.error('Failed to load commission pipeline:', err);
      if (isNetworkError(err)) {
        setNetworkErrorState(err);
        showNetworkError(err, fetchCommissionPipeline);
      }
    }
  }, [token, checkTokenExpiration, showNetworkError]);

  const fetchPlannerPerformance = useCallback(async () => {
    // Only fetch for admin users
    if (!isAdmin) return;

    try {
      const res = await fetch(`${API_BASE}/dashboard/planner-performance`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      // Check for token expiration
      if (await checkTokenExpiration(res)) return;

      const data = await res.json();
      if (res.ok) {
        setPlannerPerformance(data);
      }
    } catch (err) {
      console.error('Failed to load planner performance:', err);
      if (isNetworkError(err)) {
        setNetworkErrorState(err);
        showNetworkError(err, fetchPlannerPerformance);
      }
    }
  }, [token, checkTokenExpiration, isAdmin, showNetworkError]);

  const fetchRecentActivity = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/dashboard/recent-activity?limit=10`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      // Check for token expiration
      if (await checkTokenExpiration(res)) return;

      const data = await res.json();
      if (res.ok) {
        setRecentActivity(data);
      }
    } catch (err) {
      console.error('Failed to load recent activity:', err);
      if (isNetworkError(err)) {
        setNetworkErrorState(err);
        showNetworkError(err, fetchRecentActivity);
      }
    }
  }, [token, checkTokenExpiration, showNetworkError]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const promises = [fetchTasks(), fetchTrips(), fetchAtRiskPayments(), fetchRecentItems(), fetchCommissionPipeline(), fetchRecentActivity()];
      if (isAdmin) {
        promises.push(fetchPlannerPerformance());
      }
      await Promise.all(promises);
      setLoading(false);
    };
    loadData();
  }, [fetchTasks, fetchTrips, fetchAtRiskPayments, fetchRecentItems, fetchCommissionPipeline, fetchRecentActivity, fetchPlannerPerformance, isAdmin]);

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
    if (task?.tripId) {
      navigate(`/trips/${task.tripId}`);
      return;
    }
    navigate('/tasks');
  };

  const navigateToTrip = (tripId) => {
    if (tripId) {
      navigate(`/trips/${tripId}`);
      return;
    }
    navigate('/trips');
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

  // Format activity time relative to now
  const formatActivityTime = (timestamp) => {
    if (!timestamp) return '';
    const now = new Date();
    const activityTime = new Date(timestamp);
    const diffMs = now - activityTime;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatShortDate(timestamp);
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

  // Retry function for network error fallback
  const retryLoadData = async () => {
    setNetworkErrorState(null);
    setLoading(true);
    const promises = [fetchTasks(), fetchTrips(), fetchAtRiskPayments(), fetchRecentItems(), fetchCommissionPipeline(), fetchRecentActivity()];
    if (isAdmin) {
      promises.push(fetchPlannerPerformance());
    }
    await Promise.all(promises);
    setLoading(false);
  };

  // Show network error fallback if we have a network error and no data loaded
  if (networkErrorState && !loading && tasks.length === 0 && trips.length === 0) {
    return (
      <NetworkErrorFallback
        error={networkErrorState}
        onRetry={retryLoadData}
      />
    );
  }

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
                      onClick={() => navigateToTrip(trip.id)}
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

        {/* Quick Access Card */}
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <div className="dashboard-card-title-row">
              <h3>Quick Access</h3>
            </div>
          </div>
          <div className="dashboard-card-body">
            {recentItems.clients.length === 0 && recentItems.trips.length === 0 ? (
              <p className="dashboard-empty-state">No recent activity. Your recently accessed clients and trips will appear here.</p>
            ) : (
              <div className="dashboard-quick-access">
                {/* Recent Clients */}
                {recentItems.clients.length > 0 && (
                  <div className="quick-access-section">
                    <div className="quick-access-label">Recent Clients</div>
                    <div className="quick-access-list">
                      {recentItems.clients.slice(0, 3).map(client => (
                        <div
                          key={`client-${client.id}`}
                          className="quick-access-item"
                          onClick={() => navigate(`/clients/${client.id}`)}
                        >
                          <div className="quick-access-icon quick-access-icon-client">
                            <span>👤</span>
                          </div>
                          <div className="quick-access-info">
                            <div className="quick-access-name">{client.name}</div>
                            {client.city && <div className="quick-access-meta">{client.city}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent Trips */}
                {recentItems.trips.length > 0 && (
                  <div className="quick-access-section">
                    <div className="quick-access-label">Recent Trips</div>
                    <div className="quick-access-list">
                      {recentItems.trips.slice(0, 3).map(trip => (
                        <div
                          key={`trip-${trip.id}`}
                          className="quick-access-item"
                          onClick={() => navigate(`/trips/${trip.id}`)}
                        >
                          <div className="quick-access-icon quick-access-icon-trip">
                            <span>✈</span>
                          </div>
                          <div className="quick-access-info">
                            <div className="quick-access-name">{trip.name}</div>
                            <div className="quick-access-meta">
                              {trip.clientName && <span>{trip.clientName}</span>}
                              {trip.destination && <span className="quick-access-destination">{trip.destination}</span>}
                            </div>
                          </div>
                          <span className={`stage-badge ${getStageClass(trip.stage)}`} style={{ fontSize: '0.65rem', padding: '0.125rem 0.375rem' }}>
                            {getStageLabel(trip.stage)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
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
                    onClick={() => navigateToTrip(deadline.tripId)}
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
        <div className="dashboard-card dashboard-card-wide">
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
                    onClick={() => navigateToTrip(payment.tripId)}
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
                    onClick={() => navigateToTrip(payment.tripId)}
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
        <div className="dashboard-card dashboard-card-wide">
          <div className="dashboard-card-header">
            <div className="dashboard-card-title-row">
              {commissionPipeline.summary.totalBookings > 0 && (
                <span className="dashboard-card-count">{commissionPipeline.summary.totalBookings}</span>
              )}
              <h3>Commission Pipeline</h3>
            </div>
          </div>
          <div className="dashboard-card-body">
            {commissionPipeline.summary.totalBookings === 0 ? (
              <p className="dashboard-empty-state">No commissions tracked yet. Commission data will appear as bookings are created.</p>
            ) : (
              <div className="commission-pipeline-widget">
                {/* Pipeline Flow */}
                <div className="commission-pipeline-flow">
                  <div className="pipeline-stage pipeline-expected" onClick={() => navigate('/commissions?status=expected')}>
                    <div className="pipeline-stage-label">Expected</div>
                    <div className="pipeline-stage-count">{commissionPipeline.pipeline.expected.count}</div>
                    <div className="pipeline-stage-amount">${commissionPipeline.pipeline.expected.amount.toLocaleString()}</div>
                  </div>
                  <div className="pipeline-arrow">→</div>
                  <div className="pipeline-stage pipeline-submitted" onClick={() => navigate('/commissions?status=submitted')}>
                    <div className="pipeline-stage-label">Submitted</div>
                    <div className="pipeline-stage-count">{commissionPipeline.pipeline.submitted.count}</div>
                    <div className="pipeline-stage-amount">${commissionPipeline.pipeline.submitted.amount.toLocaleString()}</div>
                  </div>
                  <div className="pipeline-arrow">→</div>
                  <div className="pipeline-stage pipeline-paid" onClick={() => navigate('/commissions?status=paid')}>
                    <div className="pipeline-stage-label">Paid</div>
                    <div className="pipeline-stage-count">{commissionPipeline.pipeline.paid.count}</div>
                    <div className="pipeline-stage-amount">${commissionPipeline.pipeline.paid.amount.toLocaleString()}</div>
                  </div>
                </div>
                {/* Summary Row */}
                <div className="commission-summary-row">
                  <div className="commission-summary-item">
                    <span className="summary-label">Total Expected</span>
                    <span className="summary-value">${commissionPipeline.summary.totalExpected.toLocaleString()}</span>
                  </div>
                  <div className="commission-summary-item">
                    <span className="summary-label">Received</span>
                    <span className="summary-value summary-received">${commissionPipeline.summary.totalReceived.toLocaleString()}</span>
                  </div>
                  <div className="commission-summary-item">
                    <span className="summary-label">Outstanding</span>
                    <span className="summary-value summary-outstanding">${commissionPipeline.summary.outstanding.toLocaleString()}</span>
                  </div>
                </div>
                <button className="btn btn-link" onClick={() => navigate('/commissions')}>
                  View all commissions
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Planner Performance Card (Admin Only) */}
        {isAdmin && (
          <div className="dashboard-card dashboard-card-full">
            <div className="dashboard-card-header">
              <div className="dashboard-card-title-row">
                {plannerPerformance.planners.length > 0 && (
                  <span className="dashboard-card-count">{plannerPerformance.planners.length}</span>
                )}
                <h3>Team Performance</h3>
              </div>
            </div>
            <div className="dashboard-card-body">
              {plannerPerformance.planners.length === 0 ? (
                <p className="dashboard-empty-state">No team members yet. Performance metrics will appear as planners are added.</p>
              ) : (
                <div className="planner-performance-widget">
                  {/* Performance Table */}
                  <div className="planner-performance-table">
                    <div className="planner-performance-header">
                      <div className="planner-col-name">Planner</div>
                      <div className="planner-col-trips">Active</div>
                      <div className="planner-col-trips">Completed</div>
                      <div className="planner-col-rate">Conversion</div>
                      <div className="planner-col-revenue">Revenue</div>
                    </div>
                    {plannerPerformance.planners.map(planner => (
                      <div key={planner.id} className="planner-performance-row">
                        <div className="planner-col-name">
                          <span className="planner-name">{planner.name}</span>
                          <span className="planner-role">{planner.role}</span>
                        </div>
                        <div className="planner-col-trips">{planner.trips.active}</div>
                        <div className="planner-col-trips">{planner.trips.completed}</div>
                        <div className="planner-col-rate">
                          {planner.conversionRate !== null ? (
                            <span className={`conversion-badge ${planner.conversionRate >= 70 ? 'conversion-high' : planner.conversionRate >= 50 ? 'conversion-medium' : 'conversion-low'}`}>
                              {planner.conversionRate}%
                            </span>
                          ) : (
                            <span className="conversion-na">N/A</span>
                          )}
                        </div>
                        <div className="planner-col-revenue">${planner.revenue.total.toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                  {/* Agency Totals */}
                  <div className="planner-performance-totals">
                    <div className="performance-total-item">
                      <span className="total-label">Total Active Trips</span>
                      <span className="total-value">{plannerPerformance.totals.activeTrips}</span>
                    </div>
                    <div className="performance-total-item">
                      <span className="total-label">Total Completed</span>
                      <span className="total-value">{plannerPerformance.totals.completedTrips}</span>
                    </div>
                    <div className="performance-total-item">
                      <span className="total-label">Agency Conversion</span>
                      <span className="total-value">
                        {plannerPerformance.totals.conversionRate !== null ? `${plannerPerformance.totals.conversionRate}%` : 'N/A'}
                      </span>
                    </div>
                    <div className="performance-total-item">
                      <span className="total-label">Total Revenue</span>
                      <span className="total-value">${plannerPerformance.totals.totalRevenue?.toLocaleString() || 0}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
