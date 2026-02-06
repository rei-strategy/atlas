/**
 * Idempotency utilities for preventing duplicate form submissions
 *
 * Generates unique idempotency keys and provides helpers for
 * making idempotent API requests.
 */

/**
 * Generate a unique idempotency key
 * Combines timestamp with random string for uniqueness
 */
export function generateIdempotencyKey() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}

/**
 * Make a fetch request with idempotency key
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @param {string} [idempotencyKey] - Optional explicit key, generates one if not provided
 * @returns {Promise<Response>}
 */
export async function fetchWithIdempotency(url, options = {}, idempotencyKey) {
  const key = idempotencyKey || generateIdempotencyKey();

  const headers = {
    ...options.headers,
    'Idempotency-Key': key
  };

  return fetch(url, {
    ...options,
    headers
  });
}

/**
 * React hook for managing idempotency keys
 * Returns a new key each time the form opens
 */
export function useIdempotencyKey(isOpen) {
  // Generate new key when form opens
  if (isOpen) {
    // Store key per component instance using a pseudo-stable ID
    const key = generateIdempotencyKey();
    return key;
  }
  return null;
}

/**
 * Higher-order wrapper for fetch that adds idempotency key
 * @param {Function} fetchFn - The original fetch function
 * @param {string} idempotencyKey - The idempotency key to add
 * @returns {Function} - Wrapped fetch function
 */
export function withIdempotency(fetchFn, idempotencyKey) {
  return async (url, options = {}) => {
    const headers = {
      ...options.headers,
      'Idempotency-Key': idempotencyKey
    };

    return fetchFn(url, {
      ...options,
      headers
    });
  };
}
