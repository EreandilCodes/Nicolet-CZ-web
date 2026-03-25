import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';

// ── In-memory token blacklist (JTI → expiry timestamp) ────────────────────
class TokenBlacklist {
  constructor() { this._map = new Map(); }
  add(jti, ttlSeconds) {
    this._map.set(jti, Date.now() + ttlSeconds * 1000);
  }
  has(jti) { return this._map.has(jti); }
  cleanup() {
    const now = Date.now();
    for (const [jti, expiry] of this._map.entries()) {
      if (now > expiry) this._map.delete(jti);
    }
  }
}

export const tokenBlacklist = new TokenBlacklist();
// Cleanup every 10 minutes
setInterval(() => tokenBlacklist.cleanup(), 10 * 60 * 1000).unref();

export class AuthMiddleware {
  static verifyToken(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.jti && tokenBlacklist.has(decoded.jti)) {
        return res.status(401).json({ error: 'Token revoked' });
      }
      req.user = decoded;
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  static adminOnly(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  }
}
