/**
 * Idempotency middleware for preventing duplicate form submissions
 *
 * This implements server-side protection against:
 * - Browser back + resubmit
 * - Double-click submissions
 * - Network retries
 *
 * Usage: Add 'Idempotency-Key' header to POST/PUT requests
 * Keys are valid for 5 minutes to handle retries
 */

// In-memory store for idempotency keys
// Key: agencyId-idempotencyKey, Value: { response, timestamp }
const idempotencyStore = new Map();

// TTL for stored keys (5 minutes)
const KEY_TTL = 5 * 60 * 1000;

// Cleanup interval (1 minute)
const CLEANUP_INTERVAL = 60 * 1000;

// Periodically clean up expired keys
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of idempotencyStore.entries()) {
    if (now - value.timestamp > KEY_TTL) {
      idempotencyStore.delete(key);
    }
  }
}, CLEANUP_INTERVAL);

/**
 * Idempotency middleware
 *
 * Checks for Idempotency-Key header and:
 * - Returns cached response if key was seen before
 * - Caches response after successful processing
 */
function idempotency(req, res, next) {
  // Only apply to POST and PUT requests (methods that create/modify data)
  if (req.method !== 'POST' && req.method !== 'PUT') {
    return next();
  }

  // Get the idempotency key from header
  const idempotencyKey = req.headers['idempotency-key'];

  // If no key provided, just proceed (backwards compatible)
  if (!idempotencyKey) {
    return next();
  }

  // Get agency ID from authenticated user (req.user is set by auth middleware)
  // If not authenticated, use 'anon' as prefix
  const agencyId = req.user?.agencyId || 'anon';

  // Create composite key that's unique per agency
  const compositeKey = `${agencyId}-${idempotencyKey}`;

  // Check if we've seen this key before
  const cached = idempotencyStore.get(compositeKey);

  if (cached) {
    // Return the cached response
    console.log(`[IDEMPOTENCY] Duplicate request detected for key: ${idempotencyKey}`);
    return res.status(cached.statusCode).json(cached.body);
  }

  // Store a placeholder to prevent race conditions (processing state)
  // This prevents concurrent requests with same key
  idempotencyStore.set(compositeKey, {
    timestamp: Date.now(),
    processing: true
  });

  // Intercept the response to cache it
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    // Only cache successful responses (2xx status codes)
    // For errors, allow retries
    if (res.statusCode >= 200 && res.statusCode < 300) {
      idempotencyStore.set(compositeKey, {
        timestamp: Date.now(),
        statusCode: res.statusCode,
        body: body,
        processing: false
      });
    } else {
      // Remove placeholder on error to allow retry
      idempotencyStore.delete(compositeKey);
    }

    return originalJson(body);
  };

  next();
}

module.exports = idempotency;
