import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Link } from 'react-router-dom';
import { useTimezone } from '../hooks/useTimezone';
import API_BASE from '../utils/apiBase';

const formatCurrency = (amount) => {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

export default function CommissionsPage() {
  const { token } = useAuth();
  const { addToast } = useToast();
  const { formatDate } = useTimezone();
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
  const [dateFilter, setDateFilter] = useState({ startDate: '', endDate: '' });
  const [supplierFilter, setSupplierFilter] = useState('');
  const [suppliers, setSuppliers] = useState([]);
  const [bySupplierData, setBySupplierData] = useState({ suppliers: [], totals: {} });
  const [bySupplierFilters, setBySupplierFilters] = useState({
    startDate: '',
    endDate: '',
    status: ''
  });
  const [expandedSupplier, setExpandedSupplier] = useState(null);
  const [plannerFilter, setPlannerFilter] = useState('');
  const [planners, setPlanners] = useState([]);
  const [byPlannerData, setByPlannerData] = useState({ planners: [], totals: {} });
  const [byPlannerFilters, setByPlannerFilters] = useState({
    startDate: '',
    endDate: '',
    status: ''
  });

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
      if (dateFilter.startDate) params.append('startDate', dateFilter.startDate);
      if (dateFilter.endDate) params.append('endDate', dateFilter.endDate);
      if (supplierFilter) params.append('supplier', supplierFilter);
      if (plannerFilter) params.append('plannerId', plannerFilter);

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
  }, [token, statusFilter, dateFilter, supplierFilter, plannerFilter, addToast]);

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/commissions/suppliers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setSuppliers(data.suppliers || []);
      }
    } catch (err) {
      console.error('Failed to fetch suppliers:', err);
    }
  }, [token]);

  const fetchPlanners = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/commissions/planners`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setPlanners(data.planners || []);
      }
    } catch (err) {
      console.error('Failed to fetch planners:', err);
    }
  }, [token]);

  const fetchByPlanner = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (byPlannerFilters.startDate) params.append('startDate', byPlannerFilters.startDate);
      if (byPlannerFilters.endDate) params.append('endDate', byPlannerFilters.endDate);
      if (byPlannerFilters.status) params.append('status', byPlannerFilters.status);

      const url = `${API_BASE}/commissions/by-planner${params.toString() ? '?' + params.toString() : ''}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setByPlannerData(data);
      } else {
        const error = await res.json();
        addToast(error.error || 'Failed to load planner report', 'error');
      }
    } catch (err) {
      console.error('Failed to fetch by-planner report:', err);
      addToast('Failed to load planner report', 'error');
    }
  }, [token, byPlannerFilters, addToast]);

  const fetchBySupplier = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (bySupplierFilters.startDate) params.append('startDate', bySupplierFilters.startDate);
      if (bySupplierFilters.endDate) params.append('endDate', bySupplierFilters.endDate);
      if (bySupplierFilters.status) params.append('status', bySupplierFilters.status);

      const url = `${API_BASE}/commissions/by-supplier${params.toString() ? '?' + params.toString() : ''}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setBySupplierData(data);
      } else {
        const error = await res.json();
        addToast(error.error || 'Failed to load supplier report', 'error');
      }
    } catch (err) {
      console.error('Failed to fetch by-supplier report:', err);
      addToast('Failed to load supplier report', 'error');
    }
  }, [token, bySupplierFilters, addToast]);

  const [pipelineSummary, setPipelineSummary] = useState({ byStatus: [], totals: {} });

  const fetchPipelineSummary = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/commissions/summary`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setPipelineSummary(data);
      }
    } catch (err) {
      console.error('Failed to fetch pipeline summary:', err);
    }
  }, [token]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchVarianceReport(), fetchAllCommissions(), fetchSuppliers(), fetchPlanners(), fetchBySupplier(), fetchByPlanner(), fetchPipelineSummary()]);
      setLoading(false);
    };
    loadData();
  }, [fetchVarianceReport, fetchAllCommissions, fetchSuppliers, fetchPlanners, fetchBySupplier, fetchByPlanner, fetchPipelineSummary]);

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

      {/* Commission Pipeline Overview */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
          Commission Pipeline
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem'
        }}>
          {/* Expected Card */}
          <div className="dashboard-card commission-pipeline-card" data-testid="pipeline-expected">
            <div className="dashboard-card-body" style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>📋</span>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Expected
                </div>
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-warning, var(--color-warning))' }}>
                {formatCurrency(
                  (pipelineSummary.byStatus.find(s => s.status === 'expected' || s.status === null)?.totalExpected || 0) +
                  (pipelineSummary.byStatus.find(s => s.status === null)?.totalExpected || 0)
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                {(pipelineSummary.byStatus.find(s => s.status === 'expected')?.count || 0) +
                 (pipelineSummary.byStatus.find(s => s.status === null)?.count || 0)} bookings awaiting submission
              </div>
            </div>
          </div>

          {/* Arrow */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }} className="pipeline-arrow">
            →
          </div>

          {/* Submitted Card */}
          <div className="dashboard-card commission-pipeline-card" data-testid="pipeline-submitted">
            <div className="dashboard-card-body" style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>📤</span>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Submitted
                </div>
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-info, var(--color-primary))' }}>
                {formatCurrency(pipelineSummary.byStatus.find(s => s.status === 'submitted')?.totalExpected || 0)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                {pipelineSummary.byStatus.find(s => s.status === 'submitted')?.count || 0} bookings awaiting payment
              </div>
            </div>
          </div>

          {/* Arrow */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }} className="pipeline-arrow">
            →
          </div>

          {/* Paid Card */}
          <div className="dashboard-card commission-pipeline-card" data-testid="pipeline-paid">
            <div className="dashboard-card-body" style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>✅</span>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Paid
                </div>
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-success, var(--color-success))' }}>
                {formatCurrency(pipelineSummary.byStatus.find(s => s.status === 'paid')?.totalReceived || 0)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                {pipelineSummary.byStatus.find(s => s.status === 'paid')?.count || 0} bookings completed
              </div>
            </div>
          </div>
        </div>
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
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-info, var(--color-primary))' }}>
              {formatCurrency(allCommissions.totals?.totalExpected || 0)}
            </div>
          </div>
        </div>
        <div className="dashboard-card">
          <div className="dashboard-card-body" style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total Received
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-success, var(--color-success))' }}>
              {formatCurrency(allCommissions.totals?.totalReceived || 0)}
            </div>
          </div>
        </div>
        <div className="dashboard-card">
          <div className="dashboard-card-body" style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Outstanding
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-warning, var(--color-warning))' }}>
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
      <div style={{ borderBottom: '1px solid var(--color-border)', marginBottom: '1.5rem' }}>
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
          <button
            className={`btn ${activeTab === 'bySupplier' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab('bySupplier')}
            style={{ borderRadius: '8px 8px 0 0', borderBottom: 'none' }}
          >
            By Supplier
          </button>
          <button
            className={`btn ${activeTab === 'byPlanner' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab('byPlanner')}
            style={{ borderRadius: '8px 8px 0 0', borderBottom: 'none' }}
          >
            By Planner
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
              background: 'var(--color-error-light, var(--color-error-light))',
              border: '1px solid var(--color-error, var(--color-error))',
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-error, var(--color-error))', textTransform: 'uppercase' }}>
                Underpaid
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-error, var(--color-error))' }}>
                {varianceData.summary?.underpaidCount || 0} bookings
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--color-error, var(--color-error))' }}>
                -{formatCurrency(varianceData.summary?.underpaidAmount || 0)}
              </div>
            </div>
            <div style={{
              padding: '1rem',
              background: 'var(--color-success-light, #e6f1ec)',
              border: '1px solid var(--color-success, var(--color-success))',
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-success, var(--color-success))', textTransform: 'uppercase' }}>
                Overpaid
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-success, var(--color-success))' }}>
                {varianceData.summary?.overpaidCount || 0} bookings
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--color-success, var(--color-success))' }}>
                +{formatCurrency(varianceData.summary?.overpaidAmount || 0)}
              </div>
            </div>
            <div style={{
              padding: '1rem',
              background: 'var(--bg-secondary, var(--color-bg-secondary))',
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
                  ? 'var(--color-success, var(--color-success))'
                  : 'var(--color-error, var(--color-error))'
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
                      <td style={{ fontWeight: 600, color: 'var(--color-success, var(--color-success))' }}>
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
          {/* Multiple Filters */}
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
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Start Date</label>
              <input
                type="date"
                name="startDate"
                className="form-input"
                value={dateFilter.startDate}
                onChange={(e) => setDateFilter(prev => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>End Date</label>
              <input
                type="date"
                name="endDate"
                className="form-input"
                value={dateFilter.endDate}
                onChange={(e) => setDateFilter(prev => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: '180px' }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Time Period</label>
              <select
                name="timePeriod"
                className="form-input"
                value=""
                onChange={(e) => {
                  const value = e.target.value;
                  if (!value) return;
                  const now = new Date();
                  let startDate, endDate;

                  if (value === 'this_month') {
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                  } else if (value === 'last_month') {
                    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    endDate = new Date(now.getFullYear(), now.getMonth(), 0);
                  } else if (value === 'this_quarter') {
                    const qtr = Math.floor(now.getMonth() / 3);
                    startDate = new Date(now.getFullYear(), qtr * 3, 1);
                    endDate = new Date(now.getFullYear(), qtr * 3 + 3, 0);
                  } else if (value === 'last_quarter') {
                    const qtr = Math.floor(now.getMonth() / 3) - 1;
                    const year = qtr < 0 ? now.getFullYear() - 1 : now.getFullYear();
                    const adjustedQtr = qtr < 0 ? 3 : qtr;
                    startDate = new Date(year, adjustedQtr * 3, 1);
                    endDate = new Date(year, adjustedQtr * 3 + 3, 0);
                  } else if (value === 'this_year') {
                    startDate = new Date(now.getFullYear(), 0, 1);
                    endDate = new Date(now.getFullYear(), 11, 31);
                  } else if (value === 'last_year') {
                    startDate = new Date(now.getFullYear() - 1, 0, 1);
                    endDate = new Date(now.getFullYear() - 1, 11, 31);
                  }

                  if (startDate && endDate) {
                    setDateFilter({
                      startDate: startDate.toISOString().split('T')[0],
                      endDate: endDate.toISOString().split('T')[0]
                    });
                  }
                }}
              >
                <option value="">Select Period...</option>
                <option value="this_month">This Month</option>
                <option value="last_month">Last Month</option>
                <option value="this_quarter">This Quarter</option>
                <option value="last_quarter">Last Quarter</option>
                <option value="this_year">This Year</option>
                <option value="last_year">Last Year</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: '180px' }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Supplier</label>
              <select
                name="supplierFilter"
                className="form-input"
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
              >
                <option value="">All Suppliers</option>
                {suppliers.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: '180px' }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Planner</label>
              <select
                name="plannerFilter"
                className="form-input"
                value={plannerFilter}
                onChange={(e) => setPlannerFilter(e.target.value)}
              >
                <option value="">All Planners</option>
                {planners.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            {(statusFilter || dateFilter.startDate || dateFilter.endDate || supplierFilter || plannerFilter) && (
              <button
                className="btn btn-outline"
                onClick={() => {
                  setStatusFilter('');
                  setDateFilter({ startDate: '', endDate: '' });
                  setSupplierFilter('');
                  setPlannerFilter('');
                }}
                style={{ height: '38px' }}
              >
                Clear All Filters
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
                      <td style={{ color: c.commissionAmountReceived > 0 ? 'var(--color-success, var(--color-success))' : 'inherit' }}>
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

      {activeTab === 'bySupplier' && (
        <div>
          {/* Filters */}
          <div style={{
            display: 'flex',
            gap: '1rem',
            marginBottom: '1rem',
            flexWrap: 'wrap',
            alignItems: 'flex-end'
          }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Start Date</label>
              <input
                type="date"
                name="startDate"
                className="form-input"
                value={bySupplierFilters.startDate}
                onChange={(e) => setBySupplierFilters(prev => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>End Date</label>
              <input
                type="date"
                name="endDate"
                className="form-input"
                value={bySupplierFilters.endDate}
                onChange={(e) => setBySupplierFilters(prev => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: '180px' }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Commission Status</label>
              <select
                name="status"
                className="form-input"
                value={bySupplierFilters.status}
                onChange={(e) => setBySupplierFilters(prev => ({ ...prev, status: e.target.value }))}
              >
                <option value="">All Statuses</option>
                <option value="expected">Expected</option>
                <option value="submitted">Submitted</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            {(bySupplierFilters.startDate || bySupplierFilters.endDate || bySupplierFilters.status) && (
              <button
                className="btn btn-outline"
                onClick={() => setBySupplierFilters({ startDate: '', endDate: '', status: '' })}
                style={{ height: '38px' }}
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Summary */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '0.75rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{
              padding: '1rem',
              background: 'var(--bg-secondary, var(--color-bg-secondary))',
              border: '1px solid var(--border-color)',
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Total Suppliers
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                {bySupplierData.totals?.supplierCount || 0}
              </div>
            </div>
            <div style={{
              padding: '1rem',
              background: 'var(--bg-secondary, var(--color-bg-secondary))',
              border: '1px solid var(--border-color)',
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Total Expected
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-info, var(--color-primary))' }}>
                {formatCurrency(bySupplierData.totals?.totalExpected || 0)}
              </div>
            </div>
            <div style={{
              padding: '1rem',
              background: 'var(--bg-secondary, var(--color-bg-secondary))',
              border: '1px solid var(--border-color)',
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Total Received
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-success, var(--color-success))' }}>
                {formatCurrency(bySupplierData.totals?.totalReceived || 0)}
              </div>
            </div>
            <div style={{
              padding: '1rem',
              background: 'var(--bg-secondary, var(--color-bg-secondary))',
              border: '1px solid var(--border-color)',
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Outstanding
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-warning, var(--color-warning))' }}>
                {formatCurrency(bySupplierData.totals?.outstanding || 0)}
              </div>
            </div>
          </div>

          {/* Supplier Table */}
          {bySupplierData.suppliers.length === 0 ? (
            <div className="page-empty-state" style={{ padding: '2rem' }}>
              <h3 className="empty-state-title">No supplier data</h3>
              <p className="empty-state-description">
                Commission data grouped by supplier will appear here as bookings with supplier names are created.
              </p>
            </div>
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Bookings</th>
                    <th>Avg Rate</th>
                    <th>Expected</th>
                    <th>Received</th>
                    <th>Outstanding</th>
                    <th>Status Breakdown</th>
                  </tr>
                </thead>
                <tbody>
                  {bySupplierData.suppliers.map(s => (
                    <tr
                      key={s.supplierName}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setSupplierFilter(s.supplierName);
                        setActiveTab('all');
                      }}
                    >
                      <td>
                        <div className="table-user-name">{s.supplierName}</div>
                      </td>
                      <td style={{ fontWeight: 600 }}>{s.bookingCount}</td>
                      <td>{s.avgCommissionRate ? `${s.avgCommissionRate}%` : '—'}</td>
                      <td style={{ fontWeight: 600 }}>{formatCurrency(s.totalExpected)}</td>
                      <td style={{ fontWeight: 600, color: s.totalReceived > 0 ? 'var(--color-success, var(--color-success))' : 'inherit' }}>
                        {s.totalReceived > 0 ? formatCurrency(s.totalReceived) : '—'}
                      </td>
                      <td style={{ fontWeight: 600, color: s.outstanding > 0 ? 'var(--color-warning, var(--color-warning))' : 'inherit' }}>
                        {s.outstanding > 0 ? formatCurrency(s.outstanding) : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          {s.expectedCount > 0 && (
                            <span className="status-badge status-warning" style={{ fontSize: '0.6875rem' }}>
                              {s.expectedCount} Expected
                            </span>
                          )}
                          {s.submittedCount > 0 && (
                            <span className="status-badge status-info" style={{ fontSize: '0.6875rem' }}>
                              {s.submittedCount} Submitted
                            </span>
                          )}
                          {s.paidCount > 0 && (
                            <span className="status-badge status-success" style={{ fontSize: '0.6875rem' }}>
                              {s.paidCount} Paid
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            💡 Click on a supplier row to view all their commissions in the "All Commissions" tab.
          </div>
        </div>
      )}

      {activeTab === 'byPlanner' && (
        <div>
          {/* Filters */}
          <div style={{
            display: 'flex',
            gap: '1rem',
            marginBottom: '1rem',
            flexWrap: 'wrap',
            alignItems: 'flex-end'
          }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Start Date</label>
              <input
                type="date"
                name="startDate"
                className="form-input"
                value={byPlannerFilters.startDate}
                onChange={(e) => setByPlannerFilters(prev => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>End Date</label>
              <input
                type="date"
                name="endDate"
                className="form-input"
                value={byPlannerFilters.endDate}
                onChange={(e) => setByPlannerFilters(prev => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: '180px' }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Commission Status</label>
              <select
                name="status"
                className="form-input"
                value={byPlannerFilters.status}
                onChange={(e) => setByPlannerFilters(prev => ({ ...prev, status: e.target.value }))}
              >
                <option value="">All Statuses</option>
                <option value="expected">Expected</option>
                <option value="submitted">Submitted</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            {(byPlannerFilters.startDate || byPlannerFilters.endDate || byPlannerFilters.status) && (
              <button
                className="btn btn-outline"
                onClick={() => setByPlannerFilters({ startDate: '', endDate: '', status: '' })}
                style={{ height: '38px' }}
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Summary */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '0.75rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{
              padding: '1rem',
              background: 'var(--bg-secondary, var(--color-bg-secondary))',
              border: '1px solid var(--border-color)',
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Total Planners
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                {byPlannerData.totals?.plannerCount || 0}
              </div>
            </div>
            <div style={{
              padding: '1rem',
              background: 'var(--bg-secondary, var(--color-bg-secondary))',
              border: '1px solid var(--border-color)',
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Total Expected
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-info, var(--color-primary))' }}>
                {formatCurrency(byPlannerData.totals?.totalExpected || 0)}
              </div>
            </div>
            <div style={{
              padding: '1rem',
              background: 'var(--bg-secondary, var(--color-bg-secondary))',
              border: '1px solid var(--border-color)',
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Total Received
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-success, var(--color-success))' }}>
                {formatCurrency(byPlannerData.totals?.totalReceived || 0)}
              </div>
            </div>
            <div style={{
              padding: '1rem',
              background: 'var(--bg-secondary, var(--color-bg-secondary))',
              border: '1px solid var(--border-color)',
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Outstanding
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-warning, var(--color-warning))' }}>
                {formatCurrency(byPlannerData.totals?.outstanding || 0)}
              </div>
            </div>
          </div>

          {/* Planner Table */}
          {byPlannerData.planners.length === 0 ? (
            <div className="page-empty-state" style={{ padding: '2rem' }}>
              <h3 className="empty-state-title">No planner data</h3>
              <p className="empty-state-description">
                Commission data grouped by planner will appear here as trips with assigned planners have bookings created.
              </p>
            </div>
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Planner</th>
                    <th>Trips</th>
                    <th>Bookings</th>
                    <th>Expected</th>
                    <th>Received</th>
                    <th>Outstanding</th>
                    <th>Status Breakdown</th>
                  </tr>
                </thead>
                <tbody>
                  {byPlannerData.planners.map(p => (
                    <tr
                      key={p.plannerId}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setPlannerFilter(String(p.plannerId));
                        setActiveTab('all');
                      }}
                    >
                      <td>
                        <div className="table-user-name">{p.plannerName}</div>
                      </td>
                      <td style={{ fontWeight: 600 }}>{p.tripCount}</td>
                      <td style={{ fontWeight: 600 }}>{p.bookingCount}</td>
                      <td style={{ fontWeight: 600 }}>{formatCurrency(p.totalExpected)}</td>
                      <td style={{ fontWeight: 600, color: p.totalReceived > 0 ? 'var(--color-success, var(--color-success))' : 'inherit' }}>
                        {p.totalReceived > 0 ? formatCurrency(p.totalReceived) : '—'}
                      </td>
                      <td style={{ fontWeight: 600, color: p.outstanding > 0 ? 'var(--color-warning, var(--color-warning))' : 'inherit' }}>
                        {p.outstanding > 0 ? formatCurrency(p.outstanding) : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          {p.expectedCount > 0 && (
                            <span className="status-badge status-warning" style={{ fontSize: '0.6875rem' }}>
                              {p.expectedCount} Expected
                            </span>
                          )}
                          {p.submittedCount > 0 && (
                            <span className="status-badge status-info" style={{ fontSize: '0.6875rem' }}>
                              {p.submittedCount} Submitted
                            </span>
                          )}
                          {p.paidCount > 0 && (
                            <span className="status-badge status-success" style={{ fontSize: '0.6875rem' }}>
                              {p.paidCount} Paid
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            💡 Click on a planner row to view all their commissions in the "All Commissions" tab.
          </div>
        </div>
      )}
    </div>
  );
}
