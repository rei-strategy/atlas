import React from 'react';

/**
 * UnsavedChangesDialog - Modal dialog for confirming navigation away from unsaved changes
 *
 * @param {boolean} isOpen - Whether the dialog is visible
 * @param {function} onStay - Callback when user chooses to stay
 * @param {function} onLeave - Callback when user chooses to leave
 * @param {string} title - Optional custom title
 * @param {string} message - Optional custom message
 */
function UnsavedChangesDialog({
  isOpen,
  onStay,
  onLeave,
  title = 'Unsaved Changes',
  message = 'You have unsaved changes. Are you sure you want to leave? Your changes will be lost.'
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onStay}>
      <div
        className="modal-content unsaved-changes-dialog"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-dialog-title"
        aria-describedby="unsaved-dialog-description"
      >
        <div className="modal-header">
          <h2 id="unsaved-dialog-title" className="modal-title">
            <span className="unsaved-warning-icon" aria-hidden="true">&#9888;</span>
            {' '}{title}
          </h2>
        </div>
        <div className="modal-body">
          <p id="unsaved-dialog-description" style={{ margin: 0 }}>{message}</p>
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onStay}
            autoFocus
          >
            Stay on Page
          </button>
          <button
            type="button"
            className="btn btn-outline btn-danger"
            onClick={onLeave}
          >
            Leave Page
          </button>
        </div>
      </div>
    </div>
  );
}

export default UnsavedChangesDialog;
