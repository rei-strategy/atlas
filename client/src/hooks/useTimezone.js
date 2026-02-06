import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * Hook for timezone-aware date formatting based on agency settings.
 * Uses the agency's timezone from auth context for consistent date display.
 */
export function useTimezone() {
  const { agency } = useAuth();
  const timezone = agency?.timezone || 'America/New_York';

  /**
   * Format a date string or Date object to a localized date string
   * using the agency's timezone setting.
   * @param {string|Date} dateStr - The date to format
   * @param {object} options - Intl.DateTimeFormat options (month, day, year, etc.)
   * @returns {string} Formatted date string
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
   * @param {string|Date} dateStr - The date to format
   * @param {object} options - Intl.DateTimeFormat options
   * @returns {string} Formatted date-time string
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
   * @param {string|Date} dateStr - The date to format
   * @returns {string} Formatted short date string
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

  /**
   * Get the current date in the agency's timezone
   * @returns {Date} Current date adjusted for timezone display
   */
  const getCurrentDate = useCallback(() => {
    const now = new Date();
    return now;
  }, []);

  /**
   * Check if a date is today in the agency's timezone
   * @param {string|Date} dateStr - The date to check
   * @returns {boolean} True if the date is today
   */
  const isToday = useCallback((dateStr) => {
    if (!dateStr) return false;
    try {
      const date = new Date(dateStr);
      const today = new Date();

      const dateInTz = date.toLocaleDateString('en-US', { timeZone: timezone });
      const todayInTz = today.toLocaleDateString('en-US', { timeZone: timezone });

      return dateInTz === todayInTz;
    } catch (error) {
      return false;
    }
  }, [timezone]);

  /**
   * Check if a date is overdue (in the past) based on the agency's timezone
   * @param {string|Date} dateStr - The date to check
   * @returns {boolean} True if the date is in the past
   */
  const isOverdue = useCallback((dateStr) => {
    if (!dateStr) return false;
    try {
      const date = new Date(dateStr);
      const now = new Date();

      // Compare just the dates (not time) in the timezone
      const dateInTz = date.toLocaleDateString('en-US', { timeZone: timezone });
      const todayInTz = now.toLocaleDateString('en-US', { timeZone: timezone });

      const dateObj = new Date(dateInTz);
      const todayObj = new Date(todayInTz);

      return dateObj < todayObj;
    } catch (error) {
      return false;
    }
  }, [timezone]);

  /**
   * Get days until a deadline in the agency's timezone
   * @param {string|Date} dateStr - The deadline date
   * @returns {number} Number of days until deadline (negative if overdue)
   */
  const getDaysUntil = useCallback((dateStr) => {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      const now = new Date();

      // Get dates in the timezone
      const dateInTz = new Date(date.toLocaleDateString('en-US', { timeZone: timezone }));
      const todayInTz = new Date(now.toLocaleDateString('en-US', { timeZone: timezone }));

      const diffTime = dateInTz - todayInTz;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      return diffDays;
    } catch (error) {
      return null;
    }
  }, [timezone]);

  return {
    timezone,
    formatDate,
    formatDateTime,
    formatShortDate,
    getCurrentDate,
    isToday,
    isOverdue,
    getDaysUntil
  };
}

export default useTimezone;
