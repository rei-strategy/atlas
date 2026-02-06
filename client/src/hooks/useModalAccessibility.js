import { useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook for adding accessibility to modal dialogs
 *
 * Features:
 * - Traps focus within the modal
 * - Handles Escape key to close
 * - Returns focus to trigger element on close
 * - Prevents body scroll when modal is open
 *
 * Usage:
 * const { modalRef } = useModalAccessibility(isOpen, onClose);
 * <div ref={modalRef} role="dialog" aria-modal="true">...</div>
 */
export function useModalAccessibility(isOpen, onClose) {
  const modalRef = useRef(null);
  const previousActiveElement = useRef(null);

  // Store the element that had focus before the modal opened
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement;
    }
  }, [isOpen]);

  // Handle keyboard events
  const handleKeyDown = useCallback((event) => {
    if (!isOpen) return;

    // Escape key closes modal
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    // Focus trapping with Tab key
    if (event.key === 'Tab' && modalRef.current) {
      const focusableElements = modalRef.current.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );

      if (focusableElements.length === 0) return;

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];

      if (event.shiftKey) {
        // Shift + Tab: if on first element, wrap to last
        if (document.activeElement === firstFocusable) {
          event.preventDefault();
          lastFocusable?.focus();
        }
      } else {
        // Tab: if on last element, wrap to first
        if (document.activeElement === lastFocusable) {
          event.preventDefault();
          firstFocusable?.focus();
        }
      }
    }
  }, [isOpen, onClose]);

  // Add/remove keyboard event listener
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  // Focus the first focusable element when modal opens
  useEffect(() => {
    if (isOpen && modalRef.current) {
      const timer = setTimeout(() => {
        const focusableElements = modalRef.current?.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements && focusableElements.length > 0) {
          // Prefer focusing a close button first if available
          const closeBtn = modalRef.current?.querySelector('[aria-label*="close" i], [aria-label*="Close" i], .modal-close-btn');
          if (closeBtn) {
            closeBtn.focus();
          } else {
            // Otherwise focus the first focusable element
            focusableElements[0].focus();
          }
        }
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Return focus to trigger element when modal closes
  useEffect(() => {
    if (!isOpen && previousActiveElement.current) {
      previousActiveElement.current.focus();
      previousActiveElement.current = null;
    }
  }, [isOpen]);

  return { modalRef };
}

export default useModalAccessibility;
