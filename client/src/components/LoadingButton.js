import React from 'react';

/**
 * LoadingButton - A button that shows a loading spinner when processing
 *
 * Features:
 * - Shows spinner animation during loading state
 * - Disables button during processing to prevent double-clicks
 * - Supports all standard button props
 * - Works with any button variant (btn-primary, btn-outline, etc.)
 *
 * @param {boolean} loading - Whether the button is in loading state
 * @param {string} loadingText - Text to show while loading (optional, defaults to children)
 * @param {React.ReactNode} children - Button content when not loading
 * @param {string} className - Additional CSS classes
 * @param {boolean} disabled - Whether button is disabled (independent of loading)
 * @param {string} type - Button type (submit, button, reset)
 * @param {object} props - Additional props passed to button element
 */
function LoadingButton({
  loading = false,
  loadingText,
  children,
  className = '',
  disabled = false,
  type = 'button',
  ...props
}) {
  const isDisabled = disabled || loading;
  const isPrimary = className.includes('btn-primary') || className.includes('btn-danger') || className.includes('btn-success');

  return (
    <button
      type={type}
      className={`${className}${loading ? ' btn-loading' : ''}`}
      disabled={isDisabled}
      aria-busy={loading}
      {...props}
    >
      {loading && (
        <span className={`btn-spinner${isPrimary ? ' btn-spinner-light' : ''}`} aria-hidden="true" />
      )}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}

export default LoadingButton;
