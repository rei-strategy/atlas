import { useCallback, useEffect, useState } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Custom hook for blocking navigation when there are unsaved changes
 *
 * Features:
 * - Blocks React Router navigation when shouldBlock is true
 * - Shows a confirmation dialog before navigating away
 * - Handles both in-app navigation and browser back/forward
 *
 * @param {boolean} shouldBlock - Whether navigation should be blocked
 * @returns {Object} Blocker state and control functions
 */
export function useNavigationBlocker(shouldBlock) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Use React Router's useBlocker to intercept navigation
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      shouldBlock && currentLocation.pathname !== nextLocation.pathname
  );

  // Show dialog when navigation is blocked
  useEffect(() => {
    if (blocker.state === 'blocked') {
      setShowConfirmDialog(true);
    }
  }, [blocker.state]);

  // Confirm navigation (proceed with navigation)
  const confirmNavigation = useCallback(() => {
    setShowConfirmDialog(false);
    if (blocker.state === 'blocked') {
      blocker.proceed();
    }
  }, [blocker]);

  // Cancel navigation (stay on current page)
  const cancelNavigation = useCallback(() => {
    setShowConfirmDialog(false);
    if (blocker.state === 'blocked') {
      blocker.reset();
    }
  }, [blocker]);

  return {
    showConfirmDialog,
    confirmNavigation,
    cancelNavigation,
    isBlocked: blocker.state === 'blocked'
  };
}

export default useNavigationBlocker;
