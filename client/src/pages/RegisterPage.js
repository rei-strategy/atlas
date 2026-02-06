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
        if (value.length < 6) {
          return 'Password must be at least 6 characters';
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
            <div className="form-group">
              <label htmlFor="firstName" className="form-label">First name</label>
              <input
                id="firstName"
                name="firstName"
                type="text"
                className="form-input"
                value={formData.firstName}
                onChange={handleChange}
                placeholder="First name"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="lastName" className="form-label">Last name</label>
              <input
                id="lastName"
                name="lastName"
                type="text"
                className="form-input"
                value={formData.lastName}
                onChange={handleChange}
                placeholder="Last name"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="email" className="form-label">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              className="form-input"
              value={formData.email}
              onChange={handleChange}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              className="form-input"
              value={formData.password}
              onChange={handleChange}
              placeholder="At least 6 characters"
              required
              autoComplete="new-password"
              minLength={6}
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword" className="form-label">Confirm password</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              className="form-input"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Confirm your password"
              required
              autoComplete="new-password"
            />
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
