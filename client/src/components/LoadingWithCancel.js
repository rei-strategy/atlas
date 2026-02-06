import React, { useState, useEffect } from 'react';

/**
 * LoadingWithCancel - Shows a loading spinner with optional cancel button
 * Displays timeout warning if loading takes too long
 * @param {Object} props
 * @param {boolean} props.loading - Whether loading is in progress
 * @param {Function} props.onCancel - Callback when cancel is clicked
 * @param {string} props.message - Custom loading message
 * @param {number} props.slowThreshold - Time in ms before showing slow warning (default: 10000)
 * @param {number} props.timeoutThreshold - Time in ms before showing timeout warning (default: 25000)
 */
export function LoadingWithCancel({
  loading,
  onCancel,
  message = 'Loading...',
  slowThreshold = 10000,
  timeoutThreshold = 25000
}) {
  const [elapsed, setElapsed] = useState(0);
  const [startTime] = useState(() => Date.now());

  useEffect(() => {
    if (!loading) {
      setElapsed(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 1000);

    return () => clearInterval(interval);
  }, [loading, startTime]);

  if (!loading) return null;

  const isSlow = elapsed >= slowThreshold;
  const isNearTimeout = elapsed >= timeoutThreshold;

  const formatTime = (ms) => {
    const seconds = Math.floor(ms / 1000);
    return `${seconds}s`;
  };

  return (
    <div className="loading-with-cancel" role="status" aria-live="polite">
      <div className="loading-spinner-container">
        <div className="loading-spinner" />
        <span className="loading-message">{message}</span>
      </div>

      {isSlow && (
        <div className={`loading-slow-warning ${isNearTimeout ? 'loading-timeout-warning' : ''}`}>
          {isNearTimeout ? (
            <>
              <span className="warning-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </span>
              <span>This is taking longer than expected ({formatTime(elapsed)})</span>
            </>
          ) : (
            <span>Still working... ({formatTime(elapsed)})</span>
          )}
        </div>
      )}

      {onCancel && isSlow && (
        <button
          className="btn btn-outline btn-sm loading-cancel-btn"
          onClick={onCancel}
          type="button"
        >
          Cancel Request
        </button>
      )}
    </div>
  );
}

/**
 * LoadingOverlay - Full overlay with loading spinner and cancel option
 * Use for modal/form submissions that block the UI
 */
export function LoadingOverlay({
  loading,
  onCancel,
  message = 'Processing...',
  slowThreshold = 10000,
  timeoutThreshold = 25000
}) {
  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState(Date.now());

  useEffect(() => {
    if (loading) {
      setStartTime(Date.now());
      setElapsed(0);
    }
  }, [loading]);

  useEffect(() => {
    if (!loading) return;

    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 1000);

    return () => clearInterval(interval);
  }, [loading, startTime]);

  if (!loading) return null;

  const isSlow = elapsed >= slowThreshold;
  const isNearTimeout = elapsed >= timeoutThreshold;

  const formatTime = (ms) => {
    const seconds = Math.floor(ms / 1000);
    return `${seconds}s`;
  };

  return (
    <div className="loading-overlay" role="status" aria-live="polite">
      <div className="loading-overlay-content">
        <div className="loading-spinner loading-spinner-lg" />
        <p className="loading-overlay-message">{message}</p>

        {isSlow && (
          <p className={`loading-overlay-slow ${isNearTimeout ? 'loading-overlay-timeout' : ''}`}>
            {isNearTimeout
              ? `This is taking longer than expected (${formatTime(elapsed)}). The server may be busy.`
              : `Still working... (${formatTime(elapsed)})`
            }
          </p>
        )}

        {onCancel && (
          <button
            className="btn btn-outline loading-overlay-cancel"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

export default LoadingWithCancel;
