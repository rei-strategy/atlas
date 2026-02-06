/**
 * API Error Handler Utility
 * Provides consistent error message extraction and handling for API responses
 */

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
 * Get a user-friendly message for network errors
 * @param {Error} error - The error
 * @returns {string}
 */
export function getNetworkErrorMessage(error) {
  if (error.name === 'AbortError') {
    return 'The request took too long. Please check your connection and try again.';
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return "You're currently offline. Please check your internet connection.";
  }

  return "We couldn't connect to the server. Please check your internet connection and try again.";
}

/**
 * Extract a user-friendly error message from an API response
 * @param {Response} res - Fetch API Response object
 * @param {Object} data - Parsed JSON response body
 * @param {string} fallbackMessage - Default message if no specific error is found
 * @returns {string} User-friendly error message
 */
export function getErrorMessage(res, data, fallbackMessage = 'An error occurred') {
  // Handle permission denied (403) with enhanced message
  if (res.status === 403) {
    if (data.message) {
      return data.message; // Use the detailed message from server
    }
    if (data.error === 'Permission denied') {
      return "You don't have permission to perform this action.";
    }
    return data.error || 'Permission denied';
  }

  // Handle unauthorized (401)
  if (res.status === 401) {
    if (data.code === 'TOKEN_EXPIRED') {
      return 'Your session has expired. Please log in again.';
    }
    return data.error || 'Authentication required';
  }

  // Handle not found (404)
  if (res.status === 404) {
    return data.error || 'The requested resource was not found';
  }

  // Handle conflict (409) - duplicate data
  if (res.status === 409) {
    return data.error || 'This data already exists';
  }

  // Handle validation errors (400)
  if (res.status === 400) {
    return data.error || 'Invalid data provided';
  }

  // Handle server errors (500)
  if (res.status >= 500) {
    return 'A server error occurred. Please try again later.';
  }

  // Default: use error from response or fallback
  return data.error || data.message || fallbackMessage;
}

/**
 * Check if an error response is a permission error
 * @param {Response} res - Fetch API Response object
 * @returns {boolean}
 */
export function isPermissionError(res) {
  return res.status === 403;
}

/**
 * Check if an error response is an authentication error
 * @param {Response} res - Fetch API Response object
 * @returns {boolean}
 */
export function isAuthError(res) {
  return res.status === 401;
}
