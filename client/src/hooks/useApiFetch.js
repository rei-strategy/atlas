import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchWithTimeout, isTimeoutError, isNetworkError, getNetworkErrorMessage } from '../utils/apiErrors';

// Default timeout in milliseconds (30 seconds)
const DEFAULT_TIMEOUT = 30000;

/**
 * Custom hook for making API calls with timeout and cancellation support
 * @param {Object} options - Hook options
 * @param {number} options.timeout - Request timeout in milliseconds (default: 30000)
 * @returns {Object} API fetch utilities
 */
export function useApiFetch(options = {}) {
  const { timeout = DEFAULT_TIMEOUT } = options;
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isTimeout, setIsTimeout] = useState(false);
  const abortControllerRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  /**
   * Cancel the current request
   */
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setLoading(false);
      setError('Request cancelled');
    }
  }, []);

  /**
   * Reset error state
   */
  const reset = useCallback(() => {
    setError(null);
    setIsTimeout(false);
    setLoading(false);
  }, []);

  /**
   * Make an API request with timeout support
   * @param {string} url - The API endpoint URL
   * @param {Object} fetchOptions - Fetch options (method, body, headers, etc.)
   * @returns {Promise<{data: Object, response: Response}|null>}
   */
  const apiFetch = useCallback(async (url, fetchOptions = {}) => {
    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    setIsTimeout(false);

    try {
      const response = await fetchWithTimeout(url, {
        ...fetchOptions,
        timeout,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          ...fetchOptions.headers
        }
      });

      // Check if request was cancelled
      if (controller.signal.aborted) {
        return null;
      }

      const data = await response.json();

      setLoading(false);
      abortControllerRef.current = null;

      if (!response.ok) {
        const errorMessage = data.error || data.message || 'Request failed';
        setError(errorMessage);
        return { data, response, error: errorMessage };
      }

      return { data, response, error: null };
    } catch (err) {
      // Don't update state if component unmounted or request was cancelled
      if (err.name === 'AbortError' && !err.isTimeout) {
        return null; // Request was cancelled
      }

      setLoading(false);
      abortControllerRef.current = null;

      if (isTimeoutError(err)) {
        setIsTimeout(true);
        setError('The request took too long. Please try again.');
        return { data: null, response: null, error: 'timeout' };
      }

      if (isNetworkError(err)) {
        const message = getNetworkErrorMessage(err);
        setError(message);
        return { data: null, response: null, error: 'network' };
      }

      setError(err.message || 'An unexpected error occurred');
      return { data: null, response: null, error: err.message };
    }
  }, [token, timeout]);

  return {
    apiFetch,
    cancel,
    reset,
    loading,
    error,
    isTimeout,
    canCancel: loading && abortControllerRef.current !== null
  };
}

export default useApiFetch;
