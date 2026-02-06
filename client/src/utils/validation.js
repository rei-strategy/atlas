/**
 * Validation utilities for form inputs
 * Defines maximum lengths for various field types to prevent database errors
 * and ensure consistent validation across frontend and backend
 */

// Maximum field lengths - reasonable limits for each field type
export const FIELD_LIMITS = {
  // Name fields
  name: 100,           // First name, last name, full name
  shortName: 50,       // Short identifiers

  // Contact fields
  email: 255,          // Standard email max length
  phone: 30,           // Phone numbers with formatting

  // Address fields
  city: 100,
  state: 100,
  country: 100,
  address: 255,

  // Content fields
  title: 200,          // Titles, subjects
  description: 5000,   // Descriptions, long text
  notes: 10000,        // Notes, comments (very long text)

  // Reference fields
  confirmationNumber: 100,
  supplierName: 200,

  // URL fields
  url: 2000,

  // Default for generic text
  default: 255
};

/**
 * Check if a string exceeds its maximum allowed length
 * @param {string} value - The value to check
 * @param {number} maxLength - Maximum allowed length
 * @returns {boolean} True if value exceeds limit
 */
export function exceedsMaxLength(value, maxLength) {
  return value && value.length > maxLength;
}

/**
 * Get validation error message for max length violation
 * @param {string} fieldName - Display name for the field
 * @param {number} maxLength - Maximum allowed length
 * @param {number} currentLength - Current length of input
 * @returns {string} Error message
 */
export function getMaxLengthError(fieldName, maxLength, currentLength) {
  return `${fieldName} must be ${maxLength} characters or less (currently ${currentLength})`;
}

/**
 * Validate a field's length and return error if exceeded
 * @param {string} value - The value to validate
 * @param {string} fieldName - Display name for error message
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} Error message or empty string if valid
 */
export function validateMaxLength(value, fieldName, maxLength) {
  if (value && value.length > maxLength) {
    return getMaxLengthError(fieldName, maxLength, value.length);
  }
  return '';
}

/**
 * Truncate a string to maximum length
 * @param {string} value - The value to truncate
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} Truncated string
 */
export function truncateToMaxLength(value, maxLength) {
  if (!value || value.length <= maxLength) {
    return value;
  }
  return value.substring(0, maxLength);
}

/**
 * Get the maximum length for a field by its type
 * @param {string} fieldType - Type of field (name, email, notes, etc.)
 * @returns {number} Maximum length
 */
export function getFieldMaxLength(fieldType) {
  return FIELD_LIMITS[fieldType] || FIELD_LIMITS.default;
}

/**
 * Get character count display string (e.g., "45/100")
 * @param {string} value - Current value
 * @param {number} maxLength - Maximum length
 * @returns {string} Count display
 */
export function getCharacterCount(value, maxLength) {
  const current = value ? value.length : 0;
  return `${current}/${maxLength}`;
}

/**
 * Determine if character count should show warning (approaching limit)
 * @param {string} value - Current value
 * @param {number} maxLength - Maximum length
 * @param {number} warningThreshold - Percentage at which to show warning (default 80%)
 * @returns {boolean}
 */
export function isApproachingLimit(value, maxLength, warningThreshold = 0.8) {
  if (!value) return false;
  return value.length / maxLength >= warningThreshold;
}

/**
 * Server-side validation - returns object with validated/sanitized values
 * and any errors found
 * @param {Object} data - Object with field values
 * @param {Object} fieldLimits - Object mapping field names to max lengths
 * @returns {{ validated: Object, errors: Array }}
 */
export function validateAllFields(data, fieldLimits) {
  const errors = [];
  const validated = {};

  for (const [fieldName, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      validated[fieldName] = value;
      continue;
    }

    const maxLength = fieldLimits[fieldName];
    if (maxLength && typeof value === 'string' && value.length > maxLength) {
      errors.push({
        field: fieldName,
        message: `${fieldName} exceeds maximum length of ${maxLength} characters`,
        currentLength: value.length,
        maxLength
      });
    }

    validated[fieldName] = value;
  }

  return { validated, errors };
}

export default {
  FIELD_LIMITS,
  exceedsMaxLength,
  getMaxLengthError,
  validateMaxLength,
  truncateToMaxLength,
  getFieldMaxLength,
  getCharacterCount,
  isApproachingLimit,
  validateAllFields
};
