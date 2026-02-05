const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb, closeDb } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Health endpoint
app.get('/api/health', (req, res) => {
  try {
    const db = getDb();
    const result = db.prepare('SELECT 1 as ok').get();
    res.json({
      status: 'healthy',
      database: result.ok === 1 ? 'connected' : 'error',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message
    });
  }
});

// Routes will be added here as features are implemented
// app.use('/api/auth', require('./routes/auth'));
// app.use('/api/clients', require('./routes/clients'));
// app.use('/api/trips', require('./routes/trips'));
// app.use('/api/tasks', require('./routes/tasks'));
// app.use('/api/bookings', require('./routes/bookings'));
// app.use('/api/commissions', require('./routes/commissions'));
// app.use('/api/documents', require('./routes/documents'));
// app.use('/api/email-templates', require('./routes/emailTemplates'));
// app.use('/api/email-queue', require('./routes/emailQueue'));
// app.use('/api/approvals', require('./routes/approvals'));
// app.use('/api/notifications', require('./routes/notifications'));
// app.use('/api/dashboard', require('./routes/dashboard'));
// app.use('/api/reports', require('./routes/reports'));
// app.use('/api/settings', require('./routes/settings'));
// app.use('/api/search', require('./routes/search'));
// app.use('/api/users', require('./routes/users'));
// app.use('/api/portal', require('./routes/portal'));
// app.use('/api/audit-logs', require('./routes/auditLogs'));

// 404 handler
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`);
  console.error(err.stack);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down...');
  closeDb();
  process.exit(0);
});

// Initialize database and start server
try {
  const db = getDb();
  console.log('Database connection established');

  app.listen(PORT, () => {
    console.log(`Atlas server running on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });
} catch (error) {
  console.error('Failed to start server:', error.message);
  process.exit(1);
}

module.exports = app;
