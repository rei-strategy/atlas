import React, { useState, useEffect } from 'react';
import { usePortalAuth } from '../../context/PortalAuthContext';
import { usePortalTimezone } from '../../hooks/usePortalTimezone';
import { Link } from 'react-router-dom';
import API_BASE from '../../utils/apiBase';

export default function PortalDashboardPage() {
  const { customer, token } = usePortalAuth();
  const { formatDate: formatDateTz } = usePortalTimezone();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTrips();
  }, []);

  const fetchTrips = async () => {
    try {
      const res = await fetch(`${API_BASE}/portal/trips`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load trips');
      const data = await res.json();
      setTrips(data.trips || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'TBD';
    return formatDateTz(dateStr);
  };

  const getStageLabel = (stage) => {
    const labels = {
      inquiry: 'Inquiry',
      quoted: 'Planning',
      booked: 'Booked',
      final_payment_pending: 'Payment Pending',
      traveling: 'Traveling',
      completed: 'Completed'
    };
    return labels[stage] || stage;
  };

  const getStageStyle = (stage) => {
    const styles = {
      inquiry: { backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', borderColor: 'var(--color-border)' },
      quoted: { backgroundColor: 'var(--color-warning-light)', color: 'var(--color-warning)', borderColor: 'var(--color-warning)' },
      booked: { backgroundColor: 'var(--color-success-light)', color: 'var(--color-success)', borderColor: 'var(--color-success)' },
      final_payment_pending: { backgroundColor: 'var(--color-error-light)', color: 'var(--color-error)', borderColor: 'var(--color-error)' },
      traveling: { backgroundColor: 'var(--color-info-light)', color: 'var(--color-primary)', borderColor: 'var(--color-primary)' },
      completed: { backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', borderColor: 'var(--color-border)' }
    };
    return styles[stage] || styles.inquiry;
  };

  if (loading) {
    return (
      <div className="portal-page">
        <div className="portal-loading">
          <div className="loading-spinner" />
          <p>Loading your trips...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-page">
      <div className="portal-page-header">
        <h1>Welcome, {customer?.clientName || 'Traveler'}</h1>
        <p className="portal-page-subtitle">Here are your upcoming travel plans</p>
      </div>

      {error && <div className="portal-error" role="alert">{error}</div>}

      {trips.length === 0 ? (
        <div className="portal-empty-state">
          <div className="portal-empty-icon">✈️</div>
          <h2>No trips yet</h2>
          <p>Your travel planner hasn't added any trips to your account yet. Check back soon!</p>
        </div>
      ) : (
        <div className="portal-trips-grid">
          {trips.map(trip => (
            <Link
              key={trip.id}
              to={`/portal/trips/${trip.id}`}
              className="portal-trip-card"
            >
              <div className="portal-trip-card-header">
                <h3>{trip.name}</h3>
                <span
                  className="portal-stage-badge"
                  style={getStageStyle(trip.stage)}
                >
                  {getStageLabel(trip.stage)}
                </span>
              </div>
              {trip.destination && (
                <p className="portal-trip-destination">
                  <span aria-hidden="true">📍</span> {trip.destination}
                </p>
              )}
              <div className="portal-trip-dates">
                <span>{formatDate(trip.travelStartDate)}</span>
                {trip.travelEndDate && (
                  <>
                    <span className="portal-date-separator">→</span>
                    <span>{formatDate(trip.travelEndDate)}</span>
                  </>
                )}
              </div>
              {trip.description && (
                <p className="portal-trip-description">{trip.description}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
