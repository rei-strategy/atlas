/**
 * Server-side validation utilities
 * Defines maximum lengths for various field types to prevent database errors
 * and ensure consistent validation across frontend and backend
 */

// Maximum field lengths - should match client/src/utils/validation.js
const FIELD_LIMITS = {
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
 * Validate phone number format
 * Accepts various formats: (555) 123-4567, 555-123-4567, +1-555-123-4567, +44 20 7946 0958
 * @param {string} phone - Phone number to validate
 * @returns {{ valid: boolean, error?: string }}
 */
function validatePhoneFormat(phone) {
  if (!phone || !phone.trim()) {
    return { valid: true }; // Empty is valid (optional field)
  }

  // Check for letters - phone numbers shouldn't have letters
  if (/[a-zA-Z]/.test(phone)) {
    return { valid: false, error: 'Phone number should only contain digits and formatting characters' };
  }

  // Extract just the digits
  const digits = phone.replace(/\D/g, '');

  // Require minimum 7 digits for valid phone number
  if (digits.length < 7) {
    return { valid: false, error: 'Phone number must have at least 7 digits' };
  }

  // Maximum 15 digits (E.164 international standard)
  if (digits.length > 15) {
    return { valid: false, error: 'Phone number cannot exceed 15 digits' };
  }

  return { valid: true };
}

/**
 * Validate field lengths and return errors
 * @param {Object} data - Object with field values
 * @param {Object} fieldConfig - Object mapping field names to { maxLength, displayName }
 * @returns {Array} Array of error objects { field, message }
 */
function validateFieldLengths(data, fieldConfig) {
  const errors = [];

  for (const [fieldName, config] of Object.entries(fieldConfig)) {
    const value = data[fieldName];
    if (value && typeof value === 'string' && value.length > config.maxLength) {
      errors.push({
        field: fieldName,
        message: `${config.displayName || fieldName} must be ${config.maxLength} characters or less`
      });
    }
  }

  return errors;
}

/**
 * Validate client data fields
 * @param {Object} data - Client data object
 * @returns {Array} Array of error objects { field, message }
 */
function validateClientFields(data) {
  const errors = validateFieldLengths(data, {
    firstName: { maxLength: FIELD_LIMITS.name, displayName: 'First name' },
    lastName: { maxLength: FIELD_LIMITS.name, displayName: 'Last name' },
    email: { maxLength: FIELD_LIMITS.email, displayName: 'Email' },
    phone: { maxLength: FIELD_LIMITS.phone, displayName: 'Phone' },
    city: { maxLength: FIELD_LIMITS.city, displayName: 'City' },
    state: { maxLength: FIELD_LIMITS.state, displayName: 'State' },
    country: { maxLength: FIELD_LIMITS.country, displayName: 'Country' },
    notes: { maxLength: FIELD_LIMITS.notes, displayName: 'Notes' }
  });

  // Additional phone format validation
  if (data.phone) {
    const phoneResult = validatePhoneFormat(data.phone);
    if (!phoneResult.valid) {
      errors.push({ field: 'phone', message: phoneResult.error });
    }
  }

  return errors;
}

/**
 * Validate trip data fields
 * @param {Object} data - Trip data object
 * @returns {Array} Array of error objects { field, message }
 */
function validateTripFields(data) {
  return validateFieldLengths(data, {
    name: { maxLength: FIELD_LIMITS.title, displayName: 'Trip name' },
    destination: { maxLength: FIELD_LIMITS.city, displayName: 'Destination' },
    description: { maxLength: FIELD_LIMITS.description, displayName: 'Description' },
    lockReason: { maxLength: FIELD_LIMITS.default, displayName: 'Lock reason' }
  });
}

/**
 * Validate booking data fields
 * @param {Object} data - Booking data object
 * @returns {Array} Array of error objects { field, message }
 */
function validateBookingFields(data) {
  return validateFieldLengths(data, {
    supplierName: { maxLength: FIELD_LIMITS.supplierName, displayName: 'Supplier name' },
    confirmationNumber: { maxLength: FIELD_LIMITS.confirmationNumber, displayName: 'Confirmation number' },
    supplierNotes: { maxLength: FIELD_LIMITS.notes, displayName: 'Supplier notes' },
    inclusionsExclusions: { maxLength: FIELD_LIMITS.description, displayName: 'Inclusions/exclusions' },
    cancellationRules: { maxLength: FIELD_LIMITS.description, displayName: 'Cancellation rules' },
    commissionVarianceNote: { maxLength: FIELD_LIMITS.default, displayName: 'Commission variance note' },
    commissionPaymentReference: { maxLength: FIELD_LIMITS.default, displayName: 'Payment reference' }
  });
}

/**
 * Validate task data fields
 * @param {Object} data - Task data object
 * @returns {Array} Array of error objects { field, message }
 */
function validateTaskFields(data) {
  return validateFieldLengths(data, {
    title: { maxLength: FIELD_LIMITS.title, displayName: 'Task title' },
    description: { maxLength: FIELD_LIMITS.description, displayName: 'Description' }
  });
}

/**
 * Validate traveler data fields
 * @param {Object} data - Traveler data object
 * @returns {Array} Array of error objects { field, message }
 */
function validateTravelerFields(data) {
  return validateFieldLengths(data, {
    fullLegalName: { maxLength: FIELD_LIMITS.name * 2, displayName: 'Full legal name' },
    specialNeeds: { maxLength: FIELD_LIMITS.description, displayName: 'Special needs' },
    relationshipToClient: { maxLength: FIELD_LIMITS.shortName, displayName: 'Relationship' }
  });
}

/**
 * Format validation errors into a single message
 * @param {Array} errors - Array of error objects
 * @returns {string} Formatted error message
 */
function formatValidationErrors(errors) {
  if (errors.length === 1) {
    return errors[0].message;
  }
  return `Multiple validation errors: ${errors.map(e => e.message).join('; ')}`;
}

module.exports = {
  FIELD_LIMITS,
  validateFieldLengths,
  validatePhoneFormat,
  validateClientFields,
  validateTripFields,
  validateBookingFields,
  validateTaskFields,
  validateTravelerFields,
  formatValidationErrors
};
