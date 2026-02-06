import { useCallback } from 'react';
import { usePortalAuth } from '../context/PortalAuthContext';

/**
 * Hook for timezone-aware date formatting in portal pages.
 * Uses the agency's timezone from portal auth context.
 */
export function usePortalTimezone() {
  const { agency } = usePortalAuth();
  const timezone = agency?.timezone || 'America/New_York';

  /**
   * Format a date string or Date object to a localized date string
   * using the agency's timezone setting.
   */
  const formatDate = useCallback((dateStr, options = {}) => {
    if (!dateStr) return '—';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '—';

      const defaultOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: timezone
      };

      return date.toLocaleDateString('en-US', { ...defaultOptions, ...options });
    } catch (error) {
      console.error('Error formatting date:', error);
      return '—';
    }
  }, [timezone]);

  /**
   * Format a date string or Date object to a localized date-time string
   * using the agency's timezone setting.
   */
  const formatDateTime = useCallback((dateStr, options = {}) => {
    if (!dateStr) return '—';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '—';

      const defaultOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: timezone
      };

      return date.toLocaleString('en-US', { ...defaultOptions, ...options });
    } catch (error) {
      console.error('Error formatting datetime:', error);
      return '—';
    }
  }, [timezone]);

  /**
   * Format a date string to just show month and day (short form)
   */
  const formatShortDate = useCallback((dateStr) => {
    if (!dateStr) return '—';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '—';

      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: timezone
      });
    } catch (error) {
      console.error('Error formatting short date:', error);
      return '—';
    }
  }, [timezone]);

  return {
    timezone,
    formatDate,
    formatDateTime,
    formatShortDate
  };
}

export default usePortalTimezone;
