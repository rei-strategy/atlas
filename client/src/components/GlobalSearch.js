import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef(null);
  const inputRef = useRef(null);
  const { token } = useAuth();
  const navigate = useNavigate();

  // Debounced search
  const debouncedSearch = useCallback((searchQuery) => {
    if (!searchQuery.trim()) {
      setResults(null);
      return;
    }

    setLoading(true);
    fetch(`http://localhost:3001/api/search?q=${encodeURIComponent(searchQuery)}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(res => res.json())
      .then(data => {
        setResults(data.results);
        setLoading(false);
      })
      .catch(err => {
        console.error('Search error:', err);
        setLoading(false);
      });
  }, [token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      debouncedSearch(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, debouncedSearch]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on ESC key
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleResultClick = (type, id, tripId = null) => {
    setIsOpen(false);
    setQuery('');

    switch (type) {
      case 'client':
        navigate(`/clients/${id}`);
        break;
      case 'trip':
        navigate(`/trips/${id}`);
        break;
      case 'booking':
        navigate(`/trips/${tripId}`);
        break;
      default:
        break;
    }
  };

  const hasResults = results && (
    results.clients.length > 0 ||
    results.trips.length > 0 ||
    results.bookings.length > 0
  );

  return (
    <div className="global-search" ref={searchRef}>
      <div className="global-search-input-wrapper">
        <svg className="global-search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M7 12.5C10.0376 12.5 12.5 10.0376 12.5 7C12.5 3.96243 10.0376 1.5 7 1.5C3.96243 1.5 1.5 3.96243 1.5 7C1.5 10.0376 3.96243 12.5 7 12.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M11 11L14.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="global-search-input"
          placeholder="Search clients, trips, bookings..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          aria-label="Global search"
          aria-expanded={isOpen}
          aria-controls="search-results"
        />
        {loading && <span className="global-search-spinner"></span>}
      </div>

      {isOpen && query.trim() && (
        <div className="global-search-dropdown" id="search-results" role="listbox">
          {loading ? (
            <div className="global-search-loading">Searching...</div>
          ) : !hasResults ? (
            <div className="global-search-empty">No results found for "{query}"</div>
          ) : (
            <>
              {/* Clients Section */}
              {results.clients.length > 0 && (
                <div className="global-search-section">
                  <h4 className="global-search-section-title">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <path d="M14 19V17C14 15.9391 13.5786 14.9217 12.8284 14.1716C12.0783 13.4214 11.0609 13 10 13H4C2.93913 13 1.92172 13.4214 1.17157 14.1716C0.421427 14.9217 0 15.9391 0 17V19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M7 9C9.20914 9 11 7.20914 11 5C11 2.79086 9.20914 1 7 1C4.79086 1 3 2.79086 3 5C3 7.20914 4.79086 9 7 9Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Clients ({results.clients.length})
                  </h4>
                  {results.clients.map(client => (
                    <button
                      key={`client-${client.id}`}
                      className="global-search-result"
                      onClick={() => handleResultClick('client', client.id)}
                      role="option"
                    >
                      <span className="global-search-result-name">{client.name}</span>
                      <span className="global-search-result-meta">{client.email}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Trips Section */}
              {results.trips.length > 0 && (
                <div className="global-search-section">
                  <h4 className="global-search-section-title">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <path d="M13 2L19 8L8 19H2V13L13 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Trips ({results.trips.length})
                  </h4>
                  {results.trips.map(trip => (
                    <button
                      key={`trip-${trip.id}`}
                      className="global-search-result"
                      onClick={() => handleResultClick('trip', trip.id)}
                      role="option"
                    >
                      <span className="global-search-result-name">{trip.name}</span>
                      <span className="global-search-result-meta">
                        {trip.destination} • {trip.clientName || 'No client'}
                      </span>
                      <span className={`global-search-result-badge stage-${trip.stage}`}>
                        {trip.stage}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Bookings Section */}
              {results.bookings.length > 0 && (
                <div className="global-search-section">
                  <h4 className="global-search-section-title">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <rect x="1" y="3" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M1 7H19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Bookings ({results.bookings.length})
                  </h4>
                  {results.bookings.map(booking => (
                    <button
                      key={`booking-${booking.id}`}
                      className="global-search-result"
                      onClick={() => handleResultClick('booking', booking.id, booking.tripId)}
                      role="option"
                    >
                      <span className="global-search-result-name">
                        {booking.supplierName} - {booking.bookingType}
                      </span>
                      <span className="global-search-result-meta">
                        {booking.confirmationNumber ? `#${booking.confirmationNumber}` : 'No confirmation #'} • {booking.tripName}
                      </span>
                      <span className={`global-search-result-badge booking-${booking.status}`}>
                        {booking.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
