import React, { useEffect, useRef, useCallback } from 'react';

/**
 * Accessible Modal Component
 *
 * Features:
 * - Escape key closes modal
 * - Focus trapped within modal
 * - Focus returns to trigger element after close
 * - Click outside (on overlay) closes modal
 * - aria-modal and role="dialog" for screen readers
 */
function Modal({
  isOpen,
  onClose,
  children,
  className = '',
  size = 'md',
  title,
  ariaLabelledBy
}) {
  const modalRef = useRef(null);
  const triggerRef = useRef(null);
  const previousActiveElement = useRef(null);

  // Store the element that had focus before the modal opened
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement;
    }
  }, [isOpen]);

  // Handle Escape key press
  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Escape') {
      onClose();
    }

    // Focus trapping
    if (event.key === 'Tab' && modalRef.current) {
      const focusableElements = modalRef.current.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );

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
  }, [onClose]);

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
      // Small delay to ensure modal content is rendered
      const timer = setTimeout(() => {
        const focusableElements = modalRef.current?.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements && focusableElements.length > 0) {
          // Focus the close button or first focusable element
          const closeBtn = modalRef.current?.querySelector('.modal-close-btn');
          if (closeBtn) {
            closeBtn.focus();
          } else {
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
      // Return focus to the element that triggered the modal
      previousActiveElement.current.focus();
      previousActiveElement.current = null;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClass = {
    sm: 'modal-sm',
    md: '',
    lg: 'modal-lg',
    xl: 'modal-xl'
  }[size] || '';

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={modalRef}
        className={`modal-content ${sizeClass} ${className}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy || (title ? 'modal-title' : undefined)}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Modal Header component
 */
Modal.Header = function ModalHeader({ children, onClose }) {
  return (
    <div className="modal-header">
      {typeof children === 'string' ? (
        <h2 className="modal-title" id="modal-title">{children}</h2>
      ) : (
        children
      )}
      {onClose && (
        <button
          className="modal-close-btn"
          onClick={onClose}
          aria-label="Close dialog"
          type="button"
        >
          ×
        </button>
      )}
    </div>
  );
};

/**
 * Modal Body component
 */
Modal.Body = function ModalBody({ children, className = '' }) {
  return (
    <div className={`modal-body ${className}`}>
      {children}
    </div>
  );
};

/**
 * Modal Footer component
 */
Modal.Footer = function ModalFooter({ children, className = '' }) {
  return (
    <div className={`modal-footer ${className}`}>
      {children}
    </div>
  );
};

export default Modal;
