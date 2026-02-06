import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Link } from 'react-router-dom';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const formatCurrency = (amount) => {
  if (amount == null) return '—';
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

export default function CommissionsPage() {
  const { token } = useAuth();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('variance');
  const [varianceData, setVarianceData] = useState({ commissions: [], summary: {}, count: 0 });
  const [allCommissions, setAllCommissions] = useState({ commissions: [], totals: {}, count: 0 });
  const [filters, setFilters] = useState({
    varianceType: '',
    startDate: '',
    endDate: ''
  });
  const [statusFilter, setStatusFilter] = useState('');

  const fetchVarianceReport = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.varianceType) params.append('varianceType', filters.varianceType);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const url = `${API_BASE}/commissions/variance${params.toString() ? '?' + params.toString() : ''}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setVarianceData(data);
      } else {
        const error = await res.json();
        addToast(error.error || 'Failed to load variance report', 'error');
      }
    } catch (err) {
      console.error('Failed to fetch variance report:', err);
      addToast('Failed to load variance report', 'error');
    }
  }, [token, filters, addToast]);

  const fetchAllCommissions = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);

      const url = `${API_BASE}/commissions${params.toString() ? '?' + params.toString() : ''}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setAllCommissions(data);
      } else {
        const error = await res.json();
        addToast(error.error || 'Failed to load commissions', 'error');
      }
    } catch (err) {
      console.error('Failed to fetch commissions:', err);
      addToast('Failed to load commissions', 'error');
    }
  }, [token, statusFilter, addToast]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchVarianceReport(), fetchAllCommissions()]);
      setLoading(false);
    };
    loadData();
  }, [fetchVarianceReport, fetchAllCommissions]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-screen">
          <div className="loading-spinner" />
          <p>Loading commissions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Commissions</h1>
        <p className="page-subtitle">Track and analyze commission earnings across all bookings.</p>
      </div>

      {/* Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div className="dashboard-card">
          <div className="dashboard-card-body" style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total Expected
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-info, #1a56db)' }}>
              {formatCurrency(allCommissions.totals?.totalExpected || 0)}
            </div>
          </div>
        </div>
        <div className="dashboard-card">
          <div className="dashboard-card-body" style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total Received
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-success, #059669)' }}>
              {formatCurrency(allCommissions.totals?.totalReceived || 0)}
            </div>
          </div>
        </div>
        <div className="dashboard-card">
          <div className="dashboard-card-body" style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Outstanding
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-warning, #f59e0b)' }}>
              {formatCurrency(allCommissions.totals?.outstanding || 0)}
            </div>
          </div>
        </div>
        <div className="dashboard-card">
          <div className="dashboard-card-body" style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total Bookings
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
              {allCommissions.count || 0}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className={`btn ${activeTab === 'variance' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab('variance')}
            style={{ borderRadius: '8px 8px 0 0', borderBottom: 'none' }}
          >
            Variance Report
          </button>
          <button
            className={`btn ${activeTab === 'all' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab('all')}
            style={{ borderRadius: '8px 8px 0 0', borderBottom: 'none' }}
          >
            All Commissions
          </button>
        </div>
      </div>

      {activeTab === 'variance' && (
        <div>
          {/* Variance Summary */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '0.75rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{
              padding: '1rem',
              background: 'var(--color-error-light, #fef2f2)',
              border: '1px solid var(--color-error, #dc2626)',
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-error, #dc2626)', textTransform: 'uppercase' }}>
                Underpaid
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-error, #dc2626)' }}>
                {varianceData.summary?.underpaidCount || 0} bookings
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--color-error, #dc2626)' }}>
                -{formatCurrency(varianceData.summary?.underpaidAmount || 0)}
              </div>
            </div>
            <div style={{
              padding: '1rem',
              background: 'var(--color-success-light, #f0fdf4)',
              border: '1px solid var(--color-success, #059669)',
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-success, #059669)', textTransform: 'uppercase' }}>
                Overpaid
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-success, #059669)' }}>
                {varianceData.summary?.overpaidCount || 0} bookings
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--color-success, #059669)' }}>
                +{formatCurrency(varianceData.summary?.overpaidAmount || 0)}
              </div>
            </div>
            <div style={{
              padding: '1rem',
              background: 'var(--bg-secondary, #f8f9fa)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Net Variance
              </div>
              <div style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: (varianceData.summary?.netVariance || 0) >= 0
                  ? 'var(--color-success, #059669)'
                  : 'var(--color-error, #dc2626)'
              }}>
                {(varianceData.summary?.netVariance || 0) >= 0 ? '+' : ''}{formatCurrency(varianceData.summary?.netVariance || 0)}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div style={{
            display: 'flex',
            gap: '1rem',
            marginBottom: '1rem',
            flexWrap: 'wrap',
            alignItems: 'flex-end'
          }}>
            <div className="form-group" style={{ marginBottom: 0, minWidth: '150px' }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Variance Type</label>
              <select
                name="varianceType"
                className="form-input"
                value={filters.varianceType}
                onChange={handleFilterChange}
              >
                <option value="">All with Variance</option>
                <option value="underpaid">Underpaid Only</option>
                <option value="overpaid">Overpaid Only</option>
                <option value="any">Any Variance</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Start Date</label>
              <input
                type="date"
                name="startDate"
                className="form-input"
                value={filters.startDate}
                onChange={handleFilterChange}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>End Date</label>
              <input
                type="date"
                name="endDate"
                className="form-input"
                value={filters.endDate}
                onChange={handleFilterChange}
              />
            </div>
          </div>

          {/* Variance Table */}
          {varianceData.commissions.length === 0 ? (
            <div className="page-empty-state" style={{ padding: '2rem' }}>
              <h3 className="empty-state-title">No variance data</h3>
              <p className="empty-state-description">
                Commission variance data will appear here once bookings have been marked as paid with different amounts than expected.
              </p>
            </div>
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Booking</th>
                    <th>Trip</th>
                    <th>Client</th>
                    <th>Expected</th>
                    <th>Received</th>
                    <th>Variance</th>
                    <th>Status</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {varianceData.commissions.map(c => (
                    <tr key={c.id}>
                      <td>
                        <div className="table-user-name">{c.supplierName || c.bookingType}</div>
                        {c.confirmationNumber && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            #{c.confirmationNumber}
                          </div>
                        )}
                      </td>
                      <td>
                        <Link to={`/trips?id=${c.tripId}`} style={{ color: 'var(--color-primary)' }}>
                          {c.tripName}
                        </Link>
                      </td>
                      <td>{c.clientName}</td>
                      <td style={{ fontWeight: 600 }}>{formatCurrency(c.commissionAmountExpected)}</td>
                      <td style={{ fontWeight: 600, color: 'var(--color-success, #059669)' }}>
                        {formatCurrency(c.commissionAmountReceived)}
                      </td>
                      <td>
                        <span
                          className={`status-badge ${c.varianceType === 'underpaid' ? 'status-error' : 'status-success'}`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                        >
                          {c.varianceType === 'underpaid' ? '⚠️ Underpaid' : '✓ Overpaid'}
                          <span style={{ fontWeight: 600 }}>
                            ({c.varianceAmount > 0 ? '+' : ''}{formatCurrency(c.varianceAmount)})
                          </span>
                        </span>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {c.variancePercent}%
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.75rem' }}>
                          {formatDate(c.commissionReceivedDate)}
                        </div>
                        {c.commissionPaymentReference && (
                          <div style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
                            Ref: {c.commissionPaymentReference}
                          </div>
                        )}
                      </td>
                      <td style={{ maxWidth: '200px' }}>
                        {c.commissionVarianceNote ? (
                          <div style={{ fontSize: '0.8125rem', whiteSpace: 'pre-wrap' }}>
                            {c.commissionVarianceNote}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'all' && (
        <div>
          {/* Status Filter */}
          <div style={{
            display: 'flex',
            gap: '1rem',
            marginBottom: '1rem',
            flexWrap: 'wrap',
            alignItems: 'flex-end'
          }}>
            <div className="form-group" style={{ marginBottom: 0, minWidth: '180px' }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Commission Status</label>
              <select
                name="statusFilter"
                className="form-input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="expected">Expected</option>
                <option value="submitted">Submitted</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            {statusFilter && (
              <button
                className="btn btn-outline"
                onClick={() => setStatusFilter('')}
                style={{ height: '38px' }}
              >
                Clear Filter
              </button>
            )}
          </div>

          {/* Status Summary Counts */}
          {!statusFilter && allCommissions.commissions.length > 0 && (
            <div style={{
              display: 'flex',
              gap: '0.5rem',
              marginBottom: '1rem',
              flexWrap: 'wrap'
            }}>
              <button
                className="btn btn-outline"
                onClick={() => setStatusFilter('expected')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem'
                }}
              >
                <span className="status-badge status-warning" style={{ padding: '0.125rem 0.5rem', fontSize: '0.75rem' }}>
                  Expected
                </span>
                <span>{allCommissions.commissions.filter(c => !c.commissionStatus || c.commissionStatus === 'expected').length}</span>
              </button>
              <button
                className="btn btn-outline"
                onClick={() => setStatusFilter('submitted')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem'
                }}
              >
                <span className="status-badge status-info" style={{ padding: '0.125rem 0.5rem', fontSize: '0.75rem' }}>
                  Submitted
                </span>
                <span>{allCommissions.commissions.filter(c => c.commissionStatus === 'submitted').length}</span>
              </button>
              <button
                className="btn btn-outline"
                onClick={() => setStatusFilter('paid')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem'
                }}
              >
                <span className="status-badge status-success" style={{ padding: '0.125rem 0.5rem', fontSize: '0.75rem' }}>
                  Paid
                </span>
                <span>{allCommissions.commissions.filter(c => c.commissionStatus === 'paid').length}</span>
              </button>
            </div>
          )}

          {allCommissions.commissions.length === 0 ? (
            <div className="page-empty-state" style={{ padding: '2rem' }}>
              <h3 className="empty-state-title">No commissions tracked yet</h3>
              <p className="empty-state-description">
                Commission data will appear here as bookings with commission rates are created.
              </p>
            </div>
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Booking</th>
                    <th>Trip</th>
                    <th>Client</th>
                    <th>Rate</th>
                    <th>Expected</th>
                    <th>Received</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {allCommissions.commissions.map(c => (
                    <tr key={c.id}>
                      <td>
                        <div className="table-user-name">{c.supplierName || c.bookingType}</div>
                        {c.confirmationNumber && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            #{c.confirmationNumber}
                          </div>
                        )}
                      </td>
                      <td>
                        <Link to={`/trips?id=${c.tripId}`} style={{ color: 'var(--color-primary)' }}>
                          {c.tripName}
                        </Link>
                      </td>
                      <td>{c.clientName}</td>
                      <td>{c.commissionRate ? `${c.commissionRate}%` : '—'}</td>
                      <td style={{ fontWeight: 600 }}>{formatCurrency(c.commissionAmountExpected)}</td>
                      <td style={{ color: c.commissionAmountReceived > 0 ? 'var(--color-success, #059669)' : 'inherit' }}>
                        {c.commissionAmountReceived > 0 ? formatCurrency(c.commissionAmountReceived) : '—'}
                      </td>
                      <td>
                        <span className={`status-badge ${
                          c.commissionStatus === 'paid' ? 'status-success' :
                          c.commissionStatus === 'submitted' ? 'status-info' :
                          'status-warning'
                        }`}>
                          {c.commissionStatus ? c.commissionStatus.charAt(0).toUpperCase() + c.commissionStatus.slice(1) : 'Expected'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
