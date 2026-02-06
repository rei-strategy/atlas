import React from 'react';
import { useNetworkError } from '../context/NetworkErrorContext';

/**
 * NetworkErrorBanner - Shows a banner when network errors occur
 * Displays user-friendly message with retry button
 */
export function NetworkErrorBanner() {
  const { networkError, isOffline, clearNetworkError, retryAll, hasRetryCallbacks } = useNetworkError();

  if (!networkError && !isOffline) {
    return null;
  }

  const handleRetry = async () => {
    if (hasRetryCallbacks) {
      await retryAll();
    } else {
      // If no callbacks, just refresh the page
      window.location.reload();
    }
  };

  return (
    <div className="network-error-banner" role="alert" aria-live="assertive">
      <div className="network-error-content">
        <div className="network-error-icon">
          {isOffline ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23"></line>
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
              <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
              <line x1="12" y1="20" x2="12.01" y2="20"></line>
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          )}
        </div>
        <div className="network-error-text">
          <div className="network-error-title">
            {isOffline ? 'No Internet Connection' : 'Connection Problem'}
          </div>
          <div className="network-error-message">
            {networkError?.message || "You're currently offline. Please check your internet connection."}
          </div>
        </div>
        <div className="network-error-actions">
          <button
            className="btn btn-secondary network-error-retry"
            onClick={handleRetry}
            disabled={isOffline}
            title={isOffline ? "Waiting for internet connection..." : "Try again"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
            {isOffline ? 'Waiting...' : 'Try Again'}
          </button>
          {!isOffline && (
            <button
              className="btn-icon network-error-dismiss"
              onClick={clearNetworkError}
              aria-label="Dismiss error"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * NetworkErrorFallback - Full page error when page fails to load
 * Use when entire page content cannot be displayed
 */
export function NetworkErrorFallback({ error, onRetry }) {
  const isOffline = !navigator.onLine;

  return (
    <div className="network-error-fallback">
      <div className="network-error-fallback-content">
        <div className="network-error-fallback-icon">
          {isOffline ? (
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23"></line>
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
              <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
              <line x1="12" y1="20" x2="12.01" y2="20"></line>
            </svg>
          ) : (
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          )}
        </div>
        <h2 className="network-error-fallback-title">
          {isOffline ? "You're Offline" : "Connection Problem"}
        </h2>
        <p className="network-error-fallback-message">
          {isOffline
            ? "It looks like you've lost your internet connection. Please check your network settings and try again."
            : "We're having trouble connecting to our servers. This could be a temporary issue. Please try again in a moment."}
        </p>
        <div className="network-error-fallback-actions">
          <button
            className="btn btn-primary"
            onClick={onRetry}
            disabled={isOffline}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
            {isOffline ? 'Waiting for Connection...' : 'Try Again'}
          </button>
        </div>
        {!isOffline && (
          <p className="network-error-fallback-hint">
            If the problem persists, try refreshing the page or checking back later.
          </p>
        )}
      </div>
    </div>
  );
}

export default NetworkErrorBanner;
