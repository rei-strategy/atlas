/**
 * Form Draft Persistence Utility
 *
 * Provides functionality to save form data to localStorage to prevent
 * data loss on accidental page refresh. Each form is identified by a unique key.
 */

const DRAFT_PREFIX = 'atlas_form_draft_';
const DRAFT_EXPIRY_HOURS = 24; // Drafts expire after 24 hours

/**
 * Generate a storage key for a form draft
 * @param {string} formType - Type of form (e.g., 'client', 'trip', 'booking')
 * @param {string|number} entityId - Optional entity ID for edit forms (null/undefined for create)
 * @returns {string} Storage key
 */
export function getDraftKey(formType, entityId = null) {
  if (entityId) {
    return `${DRAFT_PREFIX}${formType}_${entityId}`;
  }
  return `${DRAFT_PREFIX}${formType}_new`;
}

/**
 * Save form data as a draft to localStorage
 * @param {string} formType - Type of form
 * @param {Object} formData - Form data to save
 * @param {string|number} entityId - Optional entity ID for edit forms
 */
export function saveDraft(formType, formData, entityId = null) {
  try {
    const key = getDraftKey(formType, entityId);
    const draft = {
      data: formData,
      savedAt: Date.now(),
      expiresAt: Date.now() + (DRAFT_EXPIRY_HOURS * 60 * 60 * 1000)
    };
    localStorage.setItem(key, JSON.stringify(draft));
  } catch (err) {
    // localStorage might be full or disabled - fail silently
    console.warn('Failed to save form draft:', err);
  }
}

/**
 * Load a saved draft from localStorage
 * @param {string} formType - Type of form
 * @param {string|number} entityId - Optional entity ID for edit forms
 * @returns {Object|null} Saved form data or null if not found/expired
 */
export function loadDraft(formType, entityId = null) {
  try {
    const key = getDraftKey(formType, entityId);
    const stored = localStorage.getItem(key);

    if (!stored) {
      return null;
    }

    const draft = JSON.parse(stored);

    // Check if draft has expired
    if (draft.expiresAt && Date.now() > draft.expiresAt) {
      clearDraft(formType, entityId);
      return null;
    }

    return draft.data;
  } catch (err) {
    console.warn('Failed to load form draft:', err);
    return null;
  }
}

/**
 * Clear a saved draft from localStorage
 * @param {string} formType - Type of form
 * @param {string|number} entityId - Optional entity ID for edit forms
 */
export function clearDraft(formType, entityId = null) {
  try {
    const key = getDraftKey(formType, entityId);
    localStorage.removeItem(key);
  } catch (err) {
    console.warn('Failed to clear form draft:', err);
  }
}

/**
 * Check if a draft exists for a form
 * @param {string} formType - Type of form
 * @param {string|number} entityId - Optional entity ID for edit forms
 * @returns {boolean} True if valid draft exists
 */
export function hasDraft(formType, entityId = null) {
  return loadDraft(formType, entityId) !== null;
}

/**
 * Get draft metadata (when it was saved)
 * @param {string} formType - Type of form
 * @param {string|number} entityId - Optional entity ID for edit forms
 * @returns {Object|null} Metadata object with savedAt timestamp or null
 */
export function getDraftMetadata(formType, entityId = null) {
  try {
    const key = getDraftKey(formType, entityId);
    const stored = localStorage.getItem(key);

    if (!stored) {
      return null;
    }

    const draft = JSON.parse(stored);

    // Check if draft has expired
    if (draft.expiresAt && Date.now() > draft.expiresAt) {
      clearDraft(formType, entityId);
      return null;
    }

    return {
      savedAt: draft.savedAt,
      expiresAt: draft.expiresAt
    };
  } catch (err) {
    return null;
  }
}

/**
 * Clear all expired drafts from localStorage
 * Call this periodically to clean up old drafts
 */
export function clearExpiredDrafts() {
  try {
    const keys = Object.keys(localStorage);
    const now = Date.now();

    keys.forEach(key => {
      if (key.startsWith(DRAFT_PREFIX)) {
        try {
          const stored = localStorage.getItem(key);
          if (stored) {
            const draft = JSON.parse(stored);
            if (draft.expiresAt && now > draft.expiresAt) {
              localStorage.removeItem(key);
            }
          }
        } catch (err) {
          // If we can't parse it, it's probably corrupted - remove it
          localStorage.removeItem(key);
        }
      }
    });
  } catch (err) {
    console.warn('Failed to clear expired drafts:', err);
  }
}

/**
 * Check if form data has meaningful content worth preserving
 * @param {Object} formData - Form data to check
 * @param {Array<string>} fieldsToCheck - Fields that indicate meaningful content
 * @returns {boolean} True if form has content worth saving
 */
export function hasFormContent(formData, fieldsToCheck = []) {
  if (!formData || typeof formData !== 'object') {
    return false;
  }

  // If no specific fields provided, check all string fields
  const fields = fieldsToCheck.length > 0
    ? fieldsToCheck
    : Object.keys(formData);

  return fields.some(field => {
    const value = formData[field];
    // Check for non-empty strings
    if (typeof value === 'string' && value.trim().length > 0) {
      return true;
    }
    // Check for arrays with content
    if (Array.isArray(value) && value.length > 0) {
      return true;
    }
    return false;
  });
}

/**
 * Format a timestamp for display (e.g., "5 minutes ago")
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Human-readable relative time
 */
export function formatDraftAge(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) {
    return 'just now';
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
