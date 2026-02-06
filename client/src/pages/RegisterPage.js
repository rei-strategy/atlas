import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    agencyName: ''
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  // Validate individual field
  const validateField = (name, value) => {
    switch (name) {
      case 'email':
        if (!value || !value.trim()) {
          return 'Email is required';
        }
        if (!EMAIL_REGEX.test(value.trim())) {
          return 'Please enter a valid email address';
        }
        return '';
      case 'firstName':
        if (!value || !value.trim()) {
          return 'First name is required';
        }
        return '';
      case 'lastName':
        if (!value || !value.trim()) {
          return 'Last name is required';
        }
        return '';
      case 'agencyName':
        if (!value || !value.trim()) {
          return 'Agency name is required';
        }
        return '';
      case 'password':
        if (!value) {
          return 'Password is required';
        }
        if (value.length < 8) {
          return 'Password must be at least 8 characters';
        }
        if (!/[A-Z]/.test(value)) {
          return 'Password must contain at least one uppercase letter';
        }
        if (!/[a-z]/.test(value)) {
          return 'Password must contain at least one lowercase letter';
        }
        if (!/[0-9]/.test(value)) {
          return 'Password must contain at least one number';
        }
        return '';
      case 'confirmPassword':
        if (!value) {
          return 'Please confirm your password';
        }
        if (value !== formData.password) {
          return 'Passwords do not match';
        }
        return '';
      default:
        return '';
    }
  };

  // Validate all fields
  const validateAllFields = () => {
    const errors = {};
    const fields = ['agencyName', 'firstName', 'lastName', 'email', 'password', 'confirmPassword'];
    fields.forEach(field => {
      const error = validateField(field, formData[field]);
      if (error) {
        errors[field] = error;
      }
    });
    return errors;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    // Real-time validation for touched fields
    if (touched[name]) {
      const fieldError = validateField(name, value);
      setFieldErrors(prev => ({ ...prev, [name]: fieldError }));
    }
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    setTouched(prev => ({ ...prev, [name]: true }));

    // Validate on blur
    const fieldError = validateField(name, value);
    setFieldErrors(prev => ({ ...prev, [name]: fieldError }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate all fields on submit
    const errors = validateAllFields();
    setFieldErrors(errors);

    // Mark all fields as touched
    setTouched({
      agencyName: true,
      firstName: true,
      lastName: true,
      email: true,
      password: true,
      confirmPassword: true
    });

    // If there are any errors, don't submit
    if (Object.keys(errors).length > 0) {
      setError('Please fix the errors below before submitting');
      return;
    }

    setLoading(true);

    try {
      await register({
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        agencyName: formData.agencyName
      });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <div className="auth-logo">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="40" height="40" rx="8" fill="var(--color-primary)" />
              <path d="M12 28L20 12L28 28H12Z" fill="white" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
              <circle cx="20" cy="22" r="2" fill="var(--color-primary)" />
            </svg>
          </div>
          <h1 className="auth-title">Atlas</h1>
          <p className="auth-subtitle">Travel Agency Platform</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <h2 className="auth-form-title">Create your account</h2>

          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}

          <fieldset disabled={loading} style={{ border: 'none', padding: 0, margin: 0 }}>
          <div className={`form-group ${fieldErrors.agencyName && touched.agencyName ? 'form-group-error' : ''}`}>
            <label htmlFor="agencyName" className="form-label">Agency name *</label>
            <input
              id="agencyName"
              name="agencyName"
              type="text"
              className={`form-input ${fieldErrors.agencyName && touched.agencyName ? 'form-input-error' : ''}`}
              value={formData.agencyName}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="Your travel agency name"
              autoFocus
              aria-invalid={!!(fieldErrors.agencyName && touched.agencyName)}
              aria-describedby={fieldErrors.agencyName && touched.agencyName ? 'agencyName-error' : undefined}
            />
            {fieldErrors.agencyName && touched.agencyName && (
              <span id="agencyName-error" className="form-error-message">{fieldErrors.agencyName}</span>
            )}
          </div>

          <div className="form-row">
            <div className={`form-group ${fieldErrors.firstName && touched.firstName ? 'form-group-error' : ''}`}>
              <label htmlFor="firstName" className="form-label">First name *</label>
              <input
                id="firstName"
                name="firstName"
                type="text"
                className={`form-input ${fieldErrors.firstName && touched.firstName ? 'form-input-error' : ''}`}
                value={formData.firstName}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="First name"
                aria-invalid={!!(fieldErrors.firstName && touched.firstName)}
                aria-describedby={fieldErrors.firstName && touched.firstName ? 'firstName-error' : undefined}
              />
              {fieldErrors.firstName && touched.firstName && (
                <span id="firstName-error" className="form-error-message">{fieldErrors.firstName}</span>
              )}
            </div>
            <div className={`form-group ${fieldErrors.lastName && touched.lastName ? 'form-group-error' : ''}`}>
              <label htmlFor="lastName" className="form-label">Last name *</label>
              <input
                id="lastName"
                name="lastName"
                type="text"
                className={`form-input ${fieldErrors.lastName && touched.lastName ? 'form-input-error' : ''}`}
                value={formData.lastName}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="Last name"
                aria-invalid={!!(fieldErrors.lastName && touched.lastName)}
                aria-describedby={fieldErrors.lastName && touched.lastName ? 'lastName-error' : undefined}
              />
              {fieldErrors.lastName && touched.lastName && (
                <span id="lastName-error" className="form-error-message">{fieldErrors.lastName}</span>
              )}
            </div>
          </div>

          <div className={`form-group ${fieldErrors.email && touched.email ? 'form-group-error' : ''}`}>
            <label htmlFor="email" className="form-label">Email address *</label>
            <input
              id="email"
              name="email"
              type="email"
              className={`form-input ${fieldErrors.email && touched.email ? 'form-input-error' : ''}`}
              value={formData.email}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="you@example.com"
              autoComplete="email"
              aria-invalid={!!(fieldErrors.email && touched.email)}
              aria-describedby={fieldErrors.email && touched.email ? 'email-error' : undefined}
            />
            {fieldErrors.email && touched.email && (
              <span id="email-error" className="form-error-message">{fieldErrors.email}</span>
            )}
          </div>

          <div className={`form-group ${fieldErrors.password && touched.password ? 'form-group-error' : ''}`}>
            <label htmlFor="password" className="form-label">Password *</label>
            <input
              id="password"
              name="password"
              type="password"
              className={`form-input ${fieldErrors.password && touched.password ? 'form-input-error' : ''}`}
              value={formData.password}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="At least 6 characters"
              autoComplete="new-password"
              aria-invalid={!!(fieldErrors.password && touched.password)}
              aria-describedby={fieldErrors.password && touched.password ? 'password-error' : undefined}
            />
            {fieldErrors.password && touched.password && (
              <span id="password-error" className="form-error-message">{fieldErrors.password}</span>
            )}
          </div>

          <div className={`form-group ${fieldErrors.confirmPassword && touched.confirmPassword ? 'form-group-error' : ''}`}>
            <label htmlFor="confirmPassword" className="form-label">Confirm password *</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              className={`form-input ${fieldErrors.confirmPassword && touched.confirmPassword ? 'form-input-error' : ''}`}
              value={formData.confirmPassword}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="Confirm your password"
              autoComplete="new-password"
              aria-invalid={!!(fieldErrors.confirmPassword && touched.confirmPassword)}
              aria-describedby={fieldErrors.confirmPassword && touched.confirmPassword ? 'confirmPassword-error' : undefined}
            />
            {fieldErrors.confirmPassword && touched.confirmPassword && (
              <span id="confirmPassword-error" className="form-error-message">{fieldErrors.confirmPassword}</span>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={loading}
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
          </fieldset>

          <p className="auth-footer-text">
            Already have an account?{' '}
            <Link to="/login" className="auth-link">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
