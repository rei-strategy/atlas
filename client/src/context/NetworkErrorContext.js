import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const NetworkErrorContext = createContext(null);

/**
 * Check if an error is a network error
 * @param {Error} error - The error to check
 * @returns {boolean}
 */
export function isNetworkError(error) {
  // TypeError: Failed to fetch - network connection failed
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return true;
  }

  // NetworkError name (some browsers)
  if (error.name === 'NetworkError') {
    return true;
  }

  // AbortError from timeout
  if (error.name === 'AbortError') {
    return true;
  }

  // Check for common network error messages
  const networkMessages = [
    'network error',
    'network request failed',
    'net::err_',
    'load failed',
    'cors error',
    'failed to fetch',
    'unable to connect',
    'connection refused',
    'network unavailable'
  ];

  const errorMessage = (error.message || '').toLowerCase();
  return networkMessages.some(msg => errorMessage.includes(msg));
}

/**
 * Get a user-friendly error message for network errors
 * @param {Error} error - The error
 * @returns {string}
 */
export function getNetworkErrorMessage(error) {
  if (error.name === 'AbortError') {
    return 'The request took too long. Please check your connection and try again.';
  }

  if (!navigator.onLine) {
    return "You're currently offline. Please check your internet connection.";
  }

  return "We couldn't connect to the server. Please check your internet connection and try again.";
}

export function NetworkErrorProvider({ children }) {
  const [networkError, setNetworkError] = useState(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [retryCallbacks, setRetryCallbacks] = useState([]);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      // Auto-clear network error when we come back online
      if (networkError) {
        setNetworkError(null);
      }
    };

    const handleOffline = () => {
      setIsOffline(true);
      setNetworkError({
        message: "You're currently offline. Please check your internet connection.",
        timestamp: Date.now()
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [networkError]);

  // Show network error
  const showNetworkError = useCallback((error, retryCallback) => {
    const message = getNetworkErrorMessage(error);
    setNetworkError({
      message,
      timestamp: Date.now(),
      originalError: error
    });

    if (retryCallback) {
      setRetryCallbacks(prev => [...prev, retryCallback]);
    }
  }, []);

  // Clear network error
  const clearNetworkError = useCallback(() => {
    setNetworkError(null);
    setRetryCallbacks([]);
  }, []);

  // Retry all failed requests
  const retryAll = useCallback(async () => {
    const callbacks = [...retryCallbacks];
    setRetryCallbacks([]);
    setNetworkError(null);

    // Execute all retry callbacks
    for (const callback of callbacks) {
      try {
        await callback();
      } catch (err) {
        // If retry fails, show error again
        if (isNetworkError(err)) {
          showNetworkError(err, callback);
          break;
        }
      }
    }
  }, [retryCallbacks, showNetworkError]);

  const value = {
    networkError,
    isOffline,
    showNetworkError,
    clearNetworkError,
    retryAll,
    hasRetryCallbacks: retryCallbacks.length > 0
  };

  return (
    <NetworkErrorContext.Provider value={value}>
      {children}
    </NetworkErrorContext.Provider>
  );
}

export function useNetworkError() {
  const context = useContext(NetworkErrorContext);
  if (!context) {
    throw new Error('useNetworkError must be used within a NetworkErrorProvider');
  }
  return context;
}

export default NetworkErrorContext;
