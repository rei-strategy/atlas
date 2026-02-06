import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Link } from 'react-router-dom';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const formatCurrency = (amount) => {
  if (amount == null) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
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
  const [loading, setLoading] = useState(true);
  const [activeReport, setActiveReport] = useState('bookings');
  const [dateRange, setDateRange] = useState(getDefaultDateRange());
  const [reportData, setReportData] = useState(null);

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

  useEffect(() => {
    const loadReport = async () => {
      setLoading(true);
      if (activeReport === 'bookings') {
        await fetchBookingsReport();
      } else if (activeReport === 'revenue') {
        await fetchRevenueReport();
      } else if (activeReport === 'trips') {
        await fetchTripsReport();
      }
      setLoading(false);
    };
    loadReport();
  }, [activeReport, fetchBookingsReport, fetchRevenueReport, fetchTripsReport]);

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
        </>
      )}
    </div>
  );
}
