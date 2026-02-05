const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'atlas-dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Authentication middleware - verifies JWT token
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Block customer tokens from internal API routes
    if (decoded.role === 'customer') {
      return res.status(403).json({ error: 'Access denied. Customer accounts cannot access internal APIs.' });
    }
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Role-based authorization middleware
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Permission denied. Required role: ' + roles.join(' or ') });
    }
    next();
  };
}

/**
 * Tenant isolation middleware - ensures agency_id is always scoped
 */
function tenantScope(req, res, next) {
  if (!req.user || !req.user.agency_id) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.agencyId = req.user.agency_id;
  next();
}

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      agency_id: user.agency_id
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

module.exports = {
  authenticate,
  authorize,
  tenantScope,
  generateToken,
  JWT_SECRET
};
