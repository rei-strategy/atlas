import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Link } from 'react-router-dom';
import { useTimezone } from '../hooks/useTimezone';
import API_BASE from '../utils/apiBase';
import Icon from '../components/Icon';

const formatCurrency = (amount) => {
  if (amount == null) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

// Get default date range (last 30 days)
const getDefaultDateRange = () => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  };
};

export default function ReportsPage() {
  const { token } = useAuth();
  const { addToast } = useToast();
  const { formatDate } = useTimezone();
  const [loading, setLoading] = useState(true);
  const [activeReport, setActiveReport] = useState('bookings');
  const [dateRange, setDateRange] = useState(getDefaultDateRange());
  const [reportData, setReportData] = useState(null);
  const [taskCategoryFilter, setTaskCategoryFilter] = useState('all');

  const fetchBookingsReport = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (dateRange.startDate) params.append('startDate', dateRange.startDate);
      if (dateRange.endDate) params.append('endDate', dateRange.endDate);

      const res = await fetch(`${API_BASE}/reports/bookings?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setReportData(data);
      } else {
        const error = await res.json();
        addToast(error.error || 'Failed to load bookings report', 'error');
      }
    } catch (err) {
      console.error('Failed to fetch bookings report:', err);
      addToast('Failed to load bookings report', 'error');
    }
  }, [token, dateRange, addToast]);

  const fetchRevenueReport = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (dateRange.startDate) params.append('startDate', dateRange.startDate);
      if (dateRange.endDate) params.append('endDate', dateRange.endDate);

      const res = await fetch(`${API_BASE}/reports/revenue?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setReportData(data);
      } else {
        const error = await res.json();
        addToast(error.error || 'Failed to load revenue report', 'error');
      }
    } catch (err) {
      console.error('Failed to fetch revenue report:', err);
      addToast('Failed to load revenue report', 'error');
    }
  }, [token, dateRange, addToast]);

  const fetchTripsReport = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (dateRange.startDate) params.append('startDate', dateRange.startDate);
      if (dateRange.endDate) params.append('endDate', dateRange.endDate);

      const res = await fetch(`${API_BASE}/reports/trips?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setReportData(data);
      } else {
        const error = await res.json();
        addToast(error.error || 'Failed to load trips report', 'error');
      }
    } catch (err) {
      console.error('Failed to fetch trips report:', err);
      addToast('Failed to load trips report', 'error');
    }
  }, [token, dateRange, addToast]);

  const fetchConversionReport = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (dateRange.startDate) params.append('startDate', dateRange.startDate);
      if (dateRange.endDate) params.append('endDate', dateRange.endDate);

      const res = await fetch(`${API_BASE}/reports/conversion?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setReportData(data);
      } else {
        const error = await res.json();
        addToast(error.error || 'Failed to load conversion report', 'error');
      }
    } catch (err) {
      console.error('Failed to fetch conversion report:', err);
      addToast('Failed to load conversion report', 'error');
    }
  }, [token, dateRange, addToast]);

  const fetchTasksReport = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (dateRange.startDate) params.append('startDate', dateRange.startDate);
      if (dateRange.endDate) params.append('endDate', dateRange.endDate);
      if (taskCategoryFilter && taskCategoryFilter !== 'all') {
        params.append('category', taskCategoryFilter);
      }

      const res = await fetch(`${API_BASE}/reports/tasks?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setReportData(data);
      } else {
        const error = await res.json();
        addToast(error.error || 'Failed to load tasks report', 'error');
      }
    } catch (err) {
      console.error('Failed to fetch tasks report:', err);
      addToast('Failed to load tasks report', 'error');
    }
  }, [token, dateRange, taskCategoryFilter, addToast]);

  const fetchClientsReport = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (dateRange.startDate) params.append('startDate', dateRange.startDate);
      if (dateRange.endDate) params.append('endDate', dateRange.endDate);

      const res = await fetch(`${API_BASE}/reports/clients?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setReportData(data);
      } else {
        const error = await res.json();
        addToast(error.error || 'Failed to load clients report', 'error');
      }
    } catch (err) {
      console.error('Failed to fetch clients report:', err);
      addToast('Failed to load clients report', 'error');
    }
  }, [token, dateRange, addToast]);

  useEffect(() => {
    const loadReport = async () => {
      setLoading(true);
      if (activeReport === 'bookings') {
        await fetchBookingsReport();
      } else if (activeReport === 'revenue') {
        await fetchRevenueReport();
      } else if (activeReport === 'trips') {
        await fetchTripsReport();
      } else if (activeReport === 'conversion') {
        await fetchConversionReport();
      } else if (activeReport === 'tasks') {
        await fetchTasksReport();
      } else if (activeReport === 'clients') {
        await fetchClientsReport();
      }
      setLoading(false);
    };
    loadReport();
  }, [activeReport, fetchBookingsReport, fetchRevenueReport, fetchTripsReport, fetchConversionReport, fetchTasksReport, fetchClientsReport]);

  const handleDateChange = (field, value) => {
    setDateRange(prev => ({ ...prev, [field]: value }));
  };

  const handleQuickRange = (days) => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    setDateRange({
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    });
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Reports</h1>
        <p className="page-subtitle">Analyze your business performance with filtered reports.</p>
      </div>

      {/* Date Range Filter - Common to all reports */}
      <div className="dashboard-card" style={{ marginBottom: '1.5rem' }}>
        <div className="dashboard-card-body" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Start Date</label>
              <input
                type="date"
                className="form-input"
                value={dateRange.startDate}
                onChange={(e) => handleDateChange('startDate', e.target.value)}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>End Date</label>
              <input
                type="date"
                className="form-input"
                value={dateRange.endDate}
                onChange={(e) => handleDateChange('endDate', e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn btn-outline"
                onClick={() => handleQuickRange(7)}
                style={{ fontSize: '0.75rem', padding: '0.5rem 0.75rem' }}
              >
                Last 7 days
              </button>
              <button
                className="btn btn-outline"
                onClick={() => handleQuickRange(30)}
                style={{ fontSize: '0.75rem', padding: '0.5rem 0.75rem' }}
              >
                Last 30 days
              </button>
              <button
                className="btn btn-outline"
                onClick={() => handleQuickRange(90)}
                style={{ fontSize: '0.75rem', padding: '0.5rem 0.75rem' }}
              >
                Last 90 days
              </button>
              <button
                className="btn btn-outline"
                onClick={() => handleQuickRange(365)}
                style={{ fontSize: '0.75rem', padding: '0.5rem 0.75rem' }}
              >
                Last year
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Report Type Tabs */}
      <div style={{ borderBottom: '1px solid var(--color-border)', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className={`btn ${activeReport === 'bookings' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveReport('bookings')}
            style={{ borderRadius: '8px 8px 0 0', borderBottom: 'none' }}
          >
            Bookings Report
          </button>
          <button
            className={`btn ${activeReport === 'revenue' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveReport('revenue')}
            style={{ borderRadius: '8px 8px 0 0', borderBottom: 'none' }}
          >
            Revenue Report
          </button>
          <button
            className={`btn ${activeReport === 'trips' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveReport('trips')}
            style={{ borderRadius: '8px 8px 0 0', borderBottom: 'none' }}
          >
            Trips Report
          </button>
          <button
            className={`btn ${activeReport === 'conversion' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveReport('conversion')}
            style={{ borderRadius: '8px 8px 0 0', borderBottom: 'none' }}
          >
            Conversion Report
          </button>
          <button
            className={`btn ${activeReport === 'tasks' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveReport('tasks')}
            style={{ borderRadius: '8px 8px 0 0', borderBottom: 'none' }}
          >
            Task Report
          </button>
          <button
            className={`btn ${activeReport === 'clients' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveReport('clients')}
            style={{ borderRadius: '8px 8px 0 0', borderBottom: 'none' }}
          >
            Client Report
          </button>
          <Link
            to="/commissions"
            className="btn btn-outline"
            style={{ borderRadius: '8px 8px 0 0', borderBottom: 'none' }}
          >
            Commission Report
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="loading-screen">
          <div className="loading-spinner" />
          <p>Loading report...</p>
        </div>
      ) : (
        <>
          {/* Bookings Report */}
          {activeReport === 'bookings' && reportData && (
            <div>
              {/* Summary Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem'
              }}>
                <div className="dashboard-card">
                  <div className="dashboard-card-body" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Total Bookings
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                      {reportData.summary?.totalBookings || 0}
                    </div>
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="dashboard-card-body" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Total Value
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-success)' }}>
                      {formatCurrency(reportData.summary?.totalValue || 0)}
                    </div>
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="dashboard-card-body" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Avg. Booking Value
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                      {formatCurrency(reportData.summary?.avgValue || 0)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bookings by Type */}
              {reportData.byType && reportData.byType.length > 0 && (
                <div className="dashboard-card" style={{ marginBottom: '1.5rem' }}>
                  <div className="dashboard-card-header">
                    <h3 className="dashboard-card-title">Bookings by Type</h3>
                  </div>
                  <div className="dashboard-card-body">
                    <div className="data-table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Booking Type</th>
                            <th>Count</th>
                            <th>Total Value</th>
                            <th>Commission Expected</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.byType.map(item => (
                            <tr key={item.type}>
                              <td style={{ textTransform: 'capitalize' }}>{item.type}</td>
                              <td>{item.count}</td>
                              <td>{formatCurrency(item.totalValue)}</td>
                              <td>{formatCurrency(item.commissionExpected)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Recent Bookings */}
              {reportData.bookings && reportData.bookings.length > 0 && (
                <div className="dashboard-card">
                  <div className="dashboard-card-header">
                    <h3 className="dashboard-card-title">Bookings in Date Range ({reportData.bookings.length})</h3>
                  </div>
                  <div className="dashboard-card-body">
                    <div className="data-table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Type</th>
                            <th>Supplier</th>
                            <th>Trip</th>
                            <th>Value</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.bookings.map(booking => (
                            <tr key={booking.id}>
                              <td>{formatDate(booking.createdAt)}</td>
                              <td style={{ textTransform: 'capitalize' }}>{booking.bookingType}</td>
                              <td>{booking.supplierName || '—'}</td>
                              <td>
                                <Link to={`/trips?id=${booking.tripId}`} style={{ color: 'var(--color-primary)' }}>
                                  {booking.tripName}
                                </Link>
                              </td>
                              <td>{formatCurrency(booking.totalCost)}</td>
                              <td>
                                <span className={`status-badge ${
                                  booking.status === 'confirmed' ? 'status-success' :
                                  booking.status === 'canceled' ? 'status-error' :
                                  'status-warning'
                                }`}>
                                  {booking.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {(!reportData.bookings || reportData.bookings.length === 0) && (
                <div className="page-empty-state" style={{ padding: '2rem' }}>
                  <h3 className="empty-state-title">No bookings in this date range</h3>
                  <p className="empty-state-description">
                    Try adjusting your date range to see booking data.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Revenue Report */}
          {activeReport === 'revenue' && reportData && (
            <div>
              {/* Summary Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem'
              }}>
                <div className="dashboard-card">
                  <div className="dashboard-card-body" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Total Revenue
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-success)' }}>
                      {formatCurrency(reportData.summary?.totalRevenue || 0)}
                    </div>
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="dashboard-card-body" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Commission Earned
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-info)' }}>
                      {formatCurrency(reportData.summary?.commissionEarned || 0)}
                    </div>
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="dashboard-card-body" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Commission Pending
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-warning)' }}>
                      {formatCurrency(reportData.summary?.commissionPending || 0)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Revenue by Month */}
              {reportData.byMonth && reportData.byMonth.length > 0 && (
                <div className="dashboard-card">
                  <div className="dashboard-card-header">
                    <h3 className="dashboard-card-title">Revenue by Month</h3>
                  </div>
                  <div className="dashboard-card-body">
                    <div className="data-table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Month</th>
                            <th>Bookings</th>
                            <th>Revenue</th>
                            <th>Commission</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.byMonth.map(item => (
                            <tr key={item.month}>
                              <td>{item.month}</td>
                              <td>{item.bookingCount}</td>
                              <td>{formatCurrency(item.revenue)}</td>
                              <td>{formatCurrency(item.commission)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {(!reportData.byMonth || reportData.byMonth.length === 0) && (
                <div className="page-empty-state" style={{ padding: '2rem' }}>
                  <h3 className="empty-state-title">No revenue data in this date range</h3>
                  <p className="empty-state-description">
                    Try adjusting your date range to see revenue data.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Trips Report */}
          {activeReport === 'trips' && reportData && (
            <div>
              {/* Summary Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem'
              }}>
                <div className="dashboard-card">
                  <div className="dashboard-card-body" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Total Trips
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                      {reportData.summary?.totalTrips || 0}
                    </div>
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="dashboard-card-body" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Confirmed
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-success)' }}>
                      {reportData.summary?.confirmedTrips || 0}
                    </div>
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="dashboard-card-body" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      In Progress
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-info)' }}>
                      {reportData.summary?.inProgressTrips || 0}
                    </div>
                  </div>
                </div>
              </div>

              {/* Trips by Stage */}
              {reportData.byStage && reportData.byStage.length > 0 && (
                <div className="dashboard-card" style={{ marginBottom: '1.5rem' }}>
                  <div className="dashboard-card-header">
                    <h3 className="dashboard-card-title">Trips by Stage</h3>
                  </div>
                  <div className="dashboard-card-body">
                    <div className="data-table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Stage</th>
                            <th>Count</th>
                            <th>Percentage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.byStage.map(item => (
                            <tr key={item.stage}>
                              <td style={{ textTransform: 'capitalize' }}>{item.stage.replace('_', ' ')}</td>
                              <td>{item.count}</td>
                              <td>{item.percentage}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Trips List */}
              {reportData.trips && reportData.trips.length > 0 && (
                <div className="dashboard-card">
                  <div className="dashboard-card-header">
                    <h3 className="dashboard-card-title">Trips in Date Range ({reportData.trips.length})</h3>
                  </div>
                  <div className="dashboard-card-body">
                    <div className="data-table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Created</th>
                            <th>Trip Name</th>
                            <th>Client</th>
                            <th>Destination</th>
                            <th>Stage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.trips.map(trip => (
                            <tr key={trip.id}>
                              <td>{formatDate(trip.createdAt)}</td>
                              <td>
                                <Link to={`/trips?id=${trip.id}`} style={{ color: 'var(--color-primary)' }}>
                                  {trip.name}
                                </Link>
                              </td>
                              <td>{trip.clientName}</td>
                              <td>{trip.destination}</td>
                              <td>
                                <span className={`status-badge ${
                                  trip.stage === 'completed' ? 'status-success' :
                                  trip.stage === 'canceled' ? 'status-error' :
                                  trip.stage === 'booked' ? 'status-info' :
                                  'status-warning'
                                }`}>
                                  {trip.stage.replace('_', ' ')}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {(!reportData.trips || reportData.trips.length === 0) && (
                <div className="page-empty-state" style={{ padding: '2rem' }}>
                  <h3 className="empty-state-title">No trips in this date range</h3>
                  <p className="empty-state-description">
                    Try adjusting your date range to see trip data.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Conversion Report */}
          {activeReport === 'conversion' && reportData && (
            <div>
              {/* Summary Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem'
              }}>
                <div className="dashboard-card">
                  <div className="dashboard-card-body" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Total Trips
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                      {reportData.summary?.totalTrips || 0}
                    </div>
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="dashboard-card-body" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Converted (Booked)
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-success)' }}>
                      {reportData.summary?.converted || 0}
                    </div>
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="dashboard-card-body" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      In Progress
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-warning)' }}>
                      {reportData.summary?.inProgress || 0}
                    </div>
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="dashboard-card-body" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Not Converted
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-error)' }}>
                      {reportData.summary?.notConverted || 0}
                    </div>
                  </div>
                </div>
              </div>

              {/* Conversion Rate Highlight */}
              <div className="dashboard-card" style={{ marginBottom: '1.5rem' }}>
                <div className="dashboard-card-body" style={{ padding: '1.5rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                    Inquiry to Booked Conversion Rate
                  </div>
                  <div style={{
                    fontSize: '3rem',
                    fontWeight: 700,
                    color: reportData.summary?.conversionRate >= 70 ? 'var(--color-success)' :
                           reportData.summary?.conversionRate >= 50 ? 'var(--color-warning)' :
                           'var(--color-error)'
                  }}>
                    {reportData.summary?.conversionRate !== null
                      ? `${reportData.summary.conversionRate}%`
                      : 'N/A'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                    Based on {reportData.summary?.closedTrips || 0} closed trips (converted + canceled)
                  </div>
                </div>
              </div>

              {/* Conversion by Month */}
              {reportData.byMonth && reportData.byMonth.length > 0 && (
                <div className="dashboard-card" style={{ marginBottom: '1.5rem' }}>
                  <div className="dashboard-card-header">
                    <h3 className="dashboard-card-title">Conversion by Month</h3>
                  </div>
                  <div className="dashboard-card-body">
                    <div className="data-table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Month</th>
                            <th>Total</th>
                            <th>Converted</th>
                            <th>In Progress</th>
                            <th>Not Converted</th>
                            <th>Conversion Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.byMonth.map(item => (
                            <tr key={item.month}>
                              <td>{item.month}</td>
                              <td>{item.total}</td>
                              <td style={{ color: 'var(--color-success)' }}>{item.converted}</td>
                              <td style={{ color: 'var(--color-warning)' }}>{item.inProgress}</td>
                              <td style={{ color: 'var(--color-error)' }}>{item.notConverted}</td>
                              <td>
                                <span style={{
                                  fontWeight: 600,
                                  color: item.conversionRate >= 70 ? 'var(--color-success)' :
                                         item.conversionRate >= 50 ? 'var(--color-warning)' :
                                         'var(--color-error)'
                                }}>
                                  {item.conversionRate !== null ? `${item.conversionRate}%` : 'N/A'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Trips by Stage */}
              {reportData.byStage && reportData.byStage.length > 0 && (
                <div className="dashboard-card" style={{ marginBottom: '1.5rem' }}>
                  <div className="dashboard-card-header">
                    <h3 className="dashboard-card-title">Trips by Current Stage</h3>
                  </div>
                  <div className="dashboard-card-body">
                    <div className="data-table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Stage</th>
                            <th>Count</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.byStage.map(item => (
                            <tr key={item.stage}>
                              <td style={{ textTransform: 'capitalize' }}>{item.stage.replace('_', ' ')}</td>
                              <td>{item.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Trips List */}
              {reportData.trips && reportData.trips.length > 0 && (
                <div className="dashboard-card">
                  <div className="dashboard-card-header">
                    <h3 className="dashboard-card-title">All Trips ({reportData.trips.length})</h3>
                  </div>
                  <div className="dashboard-card-body">
                    <div className="data-table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Created</th>
                            <th>Trip Name</th>
                            <th>Client</th>
                            <th>Destination</th>
                            <th>Stage</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.trips.map(trip => (
                            <tr key={trip.id}>
                              <td>{formatDate(trip.createdAt)}</td>
                              <td>
                                <Link to={`/trips?id=${trip.id}`} style={{ color: 'var(--color-primary)' }}>
                                  {trip.name}
                                </Link>
                              </td>
                              <td>{trip.clientName}</td>
                              <td>{trip.destination}</td>
                              <td style={{ textTransform: 'capitalize' }}>{trip.stage.replace('_', ' ')}</td>
                              <td>
                                <span className={`status-badge ${
                                  trip.status === 'converted' ? 'status-success' :
                                  trip.status === 'not_converted' ? 'status-error' :
                                  'status-warning'
                                }`}>
                                  {trip.status === 'converted' ? 'Converted' :
                                   trip.status === 'not_converted' ? 'Not Converted' :
                                   'In Progress'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {(!reportData.trips || reportData.trips.length === 0) && (
                <div className="page-empty-state" style={{ padding: '2rem' }}>
                  <h3 className="empty-state-title">No trips in this date range</h3>
                  <p className="empty-state-description">
                    Try adjusting your date range to see conversion data.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Task Report */}
          {activeReport === 'tasks' && reportData && (
            <div>
              {/* Category Filter */}
              <div className="dashboard-card" style={{ marginBottom: '1rem' }}>
                <div className="dashboard-card-body" style={{ padding: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Filter by category:</span>
                    <select
                      className="form-input"
                      style={{ width: 'auto', padding: '0.375rem 0.75rem' }}
                      value={taskCategoryFilter}
                      onChange={(e) => setTaskCategoryFilter(e.target.value)}
                    >
                      <option value="all">All Categories</option>
                      <option value="follow_up">Follow Up</option>
                      <option value="payment">Payment</option>
                      <option value="commission">Commission</option>
                      <option value="client_request">Client Request</option>
                      <option value="internal">Internal</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Summary Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem'
              }}>
                <div className="dashboard-card">
                  <div className="dashboard-card-body" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Total Tasks
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                      {reportData.summary?.totalTasks || 0}
                    </div>
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="dashboard-card-body" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Completed
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-success)' }}>
                      {reportData.summary?.completed || 0}
                    </div>
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="dashboard-card-body" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Open
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-info)' }}>
                      {reportData.summary?.open || 0}
                    </div>
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="dashboard-card-body" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Overdue
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-error)' }}>
                      {reportData.summary?.overdue || 0}
                    </div>
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="dashboard-card-body" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Completion Rate
                    </div>
                    <div style={{
                      fontSize: '1.5rem',
                      fontWeight: 700,
                      color: reportData.summary?.completionRate >= 80 ? 'var(--color-success)' :
                             reportData.summary?.completionRate >= 60 ? 'var(--color-warning)' :
                             'var(--color-error)'
                    }}>
                      {reportData.summary?.completionRate !== null
                        ? `${reportData.summary.completionRate}%`
                        : 'N/A'}
                    </div>
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="dashboard-card-body" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Avg. Completion Time
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                      {reportData.summary?.avgCompletionTime !== null
                        ? `${reportData.summary.avgCompletionTime} days`
                        : 'N/A'}
                    </div>
                  </div>
                </div>
              </div>

              {/* By Category */}
              {reportData.byCategory && reportData.byCategory.length > 0 && (
                <div className="dashboard-card" style={{ marginBottom: '1.5rem' }}>
                  <div className="dashboard-card-header">
                    <h3 className="dashboard-card-title">Tasks by Category</h3>
                  </div>
                  <div className="dashboard-card-body">
                    <div className="data-table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Category</th>
                            <th>Total</th>
                            <th>Completed</th>
                            <th>Open</th>
                            <th>Overdue</th>
                            <th>Completion Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.byCategory.map(item => (
                            <tr key={item.category}>
                              <td style={{ textTransform: 'capitalize' }}>{item.category.replace('_', ' ')}</td>
                              <td>{item.total}</td>
                              <td style={{ color: 'var(--color-success)' }}>{item.completed}</td>
                              <td style={{ color: 'var(--color-info)' }}>{item.open}</td>
                              <td style={{ color: 'var(--color-error)' }}>{item.overdue}</td>
                              <td>
                                <span style={{
                                  fontWeight: 600,
                                  color: item.completionRate >= 80 ? 'var(--color-success)' :
                                         item.completionRate >= 60 ? 'var(--color-warning)' :
                                         'var(--color-error)'
                                }}>
                                  {item.completionRate !== null ? `${item.completionRate}%` : 'N/A'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Overdue Tasks */}
              {reportData.overdueDetails && reportData.overdueDetails.length > 0 && (
                <div className="dashboard-card" style={{ marginBottom: '1.5rem' }}>
                  <div className="dashboard-card-header">
                    <h3 className="dashboard-card-title" style={{ color: 'var(--color-error)' }}>
                      ⚠️ Overdue Tasks ({reportData.overdueDetails.length})
                    </h3>
                  </div>
                  <div className="dashboard-card-body">
                    <div className="data-table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Task</th>
                            <th>Days Overdue</th>
                            <th>Due Date</th>
                            <th>Priority</th>
                            <th>Category</th>
                            <th>Assigned To</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.overdueDetails.map(task => (
                            <tr key={task.id}>
                              <td>
                                {task.tripId ? (
                                  <Link to={`/trips?id=${task.tripId}`} style={{ color: 'var(--color-primary)' }}>
                                    {task.title}
                                  </Link>
                                ) : task.title}
                              </td>
                              <td style={{ color: 'var(--color-error)', fontWeight: 600 }}>
                                {task.daysOverdue} day{task.daysOverdue !== 1 ? 's' : ''}
                              </td>
                              <td>{formatDate(task.dueDate)}</td>
                              <td>
                                <span className={`status-badge ${task.priority === 'urgent' ? 'status-error' : 'status-info'}`}>
                                  {task.priority}
                                </span>
                              </td>
                              <td style={{ textTransform: 'capitalize' }}>{task.category?.replace('_', ' ') || '—'}</td>
                              <td>{task.assignedTo || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* All Tasks List */}
              {reportData.tasks && reportData.tasks.length > 0 && (
                <div className="dashboard-card">
                  <div className="dashboard-card-header">
                    <h3 className="dashboard-card-title">All Tasks ({reportData.tasks.length})</h3>
                  </div>
                  <div className="dashboard-card-body">
                    <div className="data-table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Created</th>
                            <th>Task</th>
                            <th>Due Date</th>
                            <th>Status</th>
                            <th>Priority</th>
                            <th>Category</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.tasks.map(task => (
                            <tr key={task.id}>
                              <td>{formatDate(task.createdAt)}</td>
                              <td>
                                {task.tripId ? (
                                  <Link to={`/trips?id=${task.tripId}`} style={{ color: 'var(--color-primary)' }}>
                                    {task.title}
                                  </Link>
                                ) : task.title}
                                {task.isSystemGenerated && (
                                  <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                    (auto)
                                  </span>
                                )}
                              </td>
                              <td>{formatDate(task.dueDate)}</td>
                              <td>
                                <span className={`status-badge ${
                                  task.status === 'completed' ? 'status-success' :
                                  task.status === 'overdue' ? 'status-error' :
                                  'status-warning'
                                }`}>
                                  {task.status}
                                </span>
                              </td>
                              <td>
                                <span className={`status-badge ${task.priority === 'urgent' ? 'status-error' : 'status-info'}`}>
                                  {task.priority}
                                </span>
                              </td>
                              <td style={{ textTransform: 'capitalize' }}>{task.category?.replace('_', ' ') || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {(!reportData.tasks || reportData.tasks.length === 0) && (
                <div className="page-empty-state" style={{ padding: '2rem' }}>
                  <h3 className="empty-state-title">No tasks in this date range</h3>
                  <p className="empty-state-description">
                    Try adjusting your date range or category filter to see task data.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Client Activity Report */}
          {activeReport === 'clients' && reportData && (
            <div>
              {/* Summary Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem'
              }}>
                <div className="dashboard-card">
                  <div className="dashboard-card-body" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Total Clients
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                      {reportData.summary?.totalClients || 0}
                    </div>
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="dashboard-card-body" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Active
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-success)' }}>
                      {reportData.summary?.activeClients || 0}
                    </div>
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="dashboard-card-body" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Recent
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-info)' }}>
                      {reportData.summary?.recentClients || 0}
                    </div>
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="dashboard-card-body" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Dormant
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-warning)' }}>
                      {reportData.summary?.dormantClients || 0}
                    </div>
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="dashboard-card-body" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Total Revenue
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-success)' }}>
                      {formatCurrency(reportData.summary?.totalRevenue || 0)}
                    </div>
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="dashboard-card-body" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Avg Revenue/Client
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                      {formatCurrency(reportData.summary?.avgRevenuePerClient || 0)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Activity Level Breakdown */}
              {reportData.byActivityLevel && reportData.byActivityLevel.length > 0 && (
                <div className="dashboard-card" style={{ marginBottom: '1.5rem' }}>
                  <div className="dashboard-card-header">
                    <h3 className="dashboard-card-title">Client Activity Levels</h3>
                  </div>
                  <div className="dashboard-card-body">
                    <div className="data-table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Status</th>
                            <th>Count</th>
                            <th>Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.byActivityLevel.map(item => (
                            <tr key={item.level}>
                              <td>
                                <span className={`status-badge ${
                                  item.level === 'active' ? 'status-success' :
                                  item.level === 'recent' ? 'status-info' :
                                  item.level === 'dormant' ? 'status-warning' :
                                  'status-error'
                                }`} style={{ textTransform: 'capitalize' }}>
                                  {item.level}
                                </span>
                              </td>
                              <td style={{ fontWeight: 600 }}>{item.count}</td>
                              <td style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{item.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Top Clients by Revenue */}
              {reportData.topClientsByRevenue && reportData.topClientsByRevenue.length > 0 && (
                <div className="dashboard-card" style={{ marginBottom: '1.5rem' }}>
                  <div className="dashboard-card-header">
                    <h3 className="dashboard-card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Icon name="money" size={16} />
                      Top Clients by Revenue
                    </h3>
                  </div>
                  <div className="dashboard-card-body">
                    <div className="data-table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Client</th>
                            <th>Revenue</th>
                            <th>Trips</th>
                            <th>Bookings</th>
                            <th>Activity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.topClientsByRevenue.map(client => (
                            <tr key={client.id}>
                              <td>
                                <Link to={`/clients?id=${client.id}`} style={{ color: 'var(--color-primary)' }}>
                                  {client.name}
                                </Link>
                              </td>
                              <td style={{ fontWeight: 600, color: 'var(--color-success)' }}>
                                {formatCurrency(client.totalRevenue)}
                              </td>
                              <td>{client.trips}</td>
                              <td>{client.bookings}</td>
                              <td>
                                <span className={`status-badge ${
                                  client.activityLevel === 'active' ? 'status-success' :
                                  client.activityLevel === 'recent' ? 'status-info' :
                                  client.activityLevel === 'dormant' ? 'status-warning' :
                                  'status-error'
                                }`} style={{ textTransform: 'capitalize' }}>
                                  {client.activityLevel}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* All Clients List */}
              {reportData.clients && reportData.clients.length > 0 && (
                <div className="dashboard-card">
                  <div className="dashboard-card-header">
                    <h3 className="dashboard-card-title">All Clients ({reportData.clients.length})</h3>
                  </div>
                  <div className="dashboard-card-body">
                    <div className="data-table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Client</th>
                            <th>Location</th>
                            <th>Trips</th>
                            <th>Bookings</th>
                            <th>Revenue</th>
                            <th>Last Activity</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.clients.map(client => (
                            <tr key={client.id}>
                              <td>
                                <Link to={`/clients?id=${client.id}`} style={{ color: 'var(--color-primary)' }}>
                                  {client.name}
                                </Link>
                                {client.email && (
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                    {client.email}
                                  </div>
                                )}
                              </td>
                              <td>{client.location || '—'}</td>
                              <td>{client.trips}</td>
                              <td>{client.bookings}</td>
                              <td>{formatCurrency(client.totalRevenue)}</td>
                              <td>{client.lastActivity ? formatDate(client.lastActivity) : '—'}</td>
                              <td>
                                <span className={`status-badge ${
                                  client.activityLevel === 'active' ? 'status-success' :
                                  client.activityLevel === 'recent' ? 'status-info' :
                                  client.activityLevel === 'dormant' ? 'status-warning' :
                                  'status-error'
                                }`} style={{ textTransform: 'capitalize' }}>
                                  {client.activityLevel}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {(!reportData.clients || reportData.clients.length === 0) && (
                <div className="page-empty-state" style={{ padding: '2rem' }}>
                  <h3 className="empty-state-title">No clients in this date range</h3>
                  <p className="empty-state-description">
                    Try adjusting your date range to see client activity data.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
