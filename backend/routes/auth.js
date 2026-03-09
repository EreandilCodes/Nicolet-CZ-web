import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from '../database.js';
import { AuthMiddleware } from '../middleware/auth.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'nicolet-dev-secret-change-in-production';

// ── Login rate limit: 10 attempts / 15 min / IP ───────────────────────────
const loginRateLimits = new Map();
const LOGIN_MAX    = 10;
const LOGIN_WINDOW = 15 * 60 * 1000;

function checkLoginRate(ip) {
  const now   = Date.now();
  const entry = loginRateLimits.get(ip);
  if (!entry || now - entry.windowStart > LOGIN_WINDOW) {
    loginRateLimits.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= LOGIN_MAX) return false;
  entry.count++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginRateLimits.entries()) {
    if (now - entry.windowStart > LOGIN_WINDOW) loginRateLimits.delete(ip);
  }
}, 30 * 60 * 1000);

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || '0.0.0.0';
    if (!checkLoginRate(ip)) {
      return res.status(429).json({ error: 'Příliš mnoho pokusů. Zkuste to za 15 minut.' });
    }

    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email a heslo jsou povinné' });
    }

    const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(401).json({ error: 'Neplatné přihlašovací údaje' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Neplatné přihlašovací údaje' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Chyba serveru. Zkuste to znovu.' });
  }
});

// GET /api/auth/me
router.get('/me', AuthMiddleware.verifyToken, async (req, res) => {
  try {
    const user = await db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

export default router;
