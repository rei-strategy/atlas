import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, sessionExpired, clearSessionExpiredMessage } = useAuth();
  const navigate = useNavigate();

  // Clear session expired message when component unmounts or user starts typing
  useEffect(() => {
    return () => {
      if (sessionExpired) {
        clearSessionExpiredMessage();
      }
    };
  }, [sessionExpired, clearSessionExpiredMessage]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    // Clear session expired message when attempting to login
    if (sessionExpired) {
      clearSessionExpiredMessage();
    }
    setLoading(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
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
          <h2 className="auth-form-title">Sign in to your account</h2>

          {sessionExpired && (
            <div className="auth-warning" role="alert">
              Your session has expired. Please sign in again.
            </div>
          )}

          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email" className="form-label">Email address</label>
            <input
              id="email"
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">Password</label>
            <input
              id="password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>

          <p className="auth-footer-text">
            Don't have an account?{' '}
            <Link to="/register" className="auth-link">Create one here</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
