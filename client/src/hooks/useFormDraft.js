import { useState, useEffect, useCallback, useRef } from 'react';
import {
  saveDraft,
  loadDraft,
  clearDraft,
  getDraftMetadata,
  hasFormContent,
  formatDraftAge,
  clearExpiredDrafts
} from '../utils/formDraft';

/**
 * Custom hook for form draft persistence
 *
 * Features:
 * - Auto-saves form data to localStorage as user types
 * - Loads existing draft when form opens
 * - Shows notification when draft is restored
 * - Clears draft on successful form submission
 * - Warns user before page unload with unsaved changes
 *
 * @param {string} formType - Type of form (e.g., 'client', 'trip', 'booking')
 * @param {string|number} entityId - Optional entity ID for edit forms
 * @param {Object} initialData - Initial form data (for editing existing entity)
 * @param {Object} options - Configuration options
 * @param {boolean} options.enabled - Whether draft saving is enabled (default: true)
 * @param {number} options.saveDelay - Debounce delay in ms (default: 500)
 * @param {Array<string>} options.contentFields - Fields to check for meaningful content
 * @returns {Object} Draft management functions and state
 */
export function useFormDraft(formType, entityId = null, initialData = null, options = {}) {
  const {
    enabled = true,
    saveDelay = 500,
    contentFields = []
  } = options;

  const [hasDraftLoaded, setHasDraftLoaded] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftAge, setDraftAge] = useState(null);
  const [isDirty, setIsDirty] = useState(false);

  const saveTimeoutRef = useRef(null);
  const initialDataRef = useRef(initialData);
  const isEditMode = entityId !== null;

  // Clear expired drafts on mount (cleanup old data)
  useEffect(() => {
    clearExpiredDrafts();
  }, []);

  /**
   * Check if form data differs from initial data (for edit mode)
   */
  const checkIfDirty = useCallback((formData) => {
    if (!initialDataRef.current) {
      // For create mode, check if any meaningful content exists
      return hasFormContent(formData, contentFields);
    }

    // For edit mode, compare with initial data
    const initial = initialDataRef.current;
    return Object.keys(formData).some(key => {
      const current = formData[key];
      const originalValue = initial[key];

      // Compare arrays
      if (Array.isArray(current) && Array.isArray(originalValue)) {
        return JSON.stringify(current) !== JSON.stringify(originalValue);
      }

      // Compare other values
      return current !== originalValue;
    });
  }, [contentFields]);

  /**
   * Load existing draft if available
   * Returns the draft data or null
   */
  const loadExistingDraft = useCallback(() => {
    if (!enabled) return null;

    const draft = loadDraft(formType, entityId);
    if (draft) {
      const metadata = getDraftMetadata(formType, entityId);
      if (metadata) {
        setDraftAge(formatDraftAge(metadata.savedAt));
      }
      setDraftRestored(true);
      setIsDirty(true);
    }
    setHasDraftLoaded(true);
    return draft;
  }, [enabled, formType, entityId]);

  /**
   * Save form data as draft (debounced)
   */
  const saveFormDraft = useCallback((formData) => {
    if (!enabled) return;

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce the save
    saveTimeoutRef.current = setTimeout(() => {
      // Only save if there's meaningful content
      if (hasFormContent(formData, contentFields)) {
        saveDraft(formType, formData, entityId);
        setIsDirty(checkIfDirty(formData));
      }
    }, saveDelay);
  }, [enabled, formType, entityId, saveDelay, contentFields, checkIfDirty]);

  /**
   * Clear the draft (call on successful submit or explicit discard)
   */
  const clearFormDraft = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    clearDraft(formType, entityId);
    setDraftRestored(false);
    setDraftAge(null);
    setIsDirty(false);
  }, [formType, entityId]);

  /**
   * Dismiss the "draft restored" notification without clearing the draft
   */
  const dismissDraftNotification = useCallback(() => {
    setDraftRestored(false);
    setDraftAge(null);
  }, []);

  /**
   * Update dirty state based on current form data
   */
  const updateDirtyState = useCallback((formData) => {
    setIsDirty(checkIfDirty(formData));
  }, [checkIfDirty]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Setup beforeunload warning when form is dirty
  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      // Modern browsers require returnValue to be set
      e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      return e.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);

  return {
    // State
    hasDraftLoaded,
    draftRestored,
    draftAge,
    isDirty,
    isEditMode,

    // Actions
    loadExistingDraft,
    saveFormDraft,
    clearFormDraft,
    dismissDraftNotification,
    updateDirtyState
  };
}

export default useFormDraft;
