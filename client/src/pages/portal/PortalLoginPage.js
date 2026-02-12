import React, { useState } from 'react';
import { usePortalAuth } from '../../context/PortalAuthContext';
import { useNavigate } from 'react-router-dom';

export default function PortalLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = usePortalAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login(email, password);
      navigate('/portal/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="portal-login-container">
      <div className="portal-login-card">
        <div className="portal-login-header">
          <div className="portal-logo">
            <img src="/brand/atlas-icon.png" alt="Atlas" width="40" height="40" />
          </div>
          <h1>Client Portal</h1>
          <p className="portal-subtitle">Access your travel plans and documents</p>
        </div>

        <form onSubmit={handleSubmit} className="portal-login-form">
          {error && (
            <div className="portal-error-message" role="alert">
              {error}
            </div>
          )}

          <div className="portal-form-group">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="portal-form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="portal-login-btn"
            disabled={isSubmitting || !email || !password}
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="portal-login-footer">
          <p>
            Looking for the agency login? <a href="/login">Sign in here</a>
          </p>
        </div>
      </div>
    </div>
  );
}
