import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from '../database.js';
import { AuthMiddleware, tokenBlacklist } from '../middleware/auth.js';
import { logger } from '../logger.js';

import { JWT_SECRET } from '../config.js';

const router = express.Router();

// ── Login rate limit: 10 attempts / 15 min / IP ───────────────────────────
const loginRateLimits = new Map();
const LOGIN_MAX    = 10;
const LOGIN_WINDOW = 15 * 60 * 1000;

// ── Account lockout: 5 consecutive failures / email → 15 min lock ─────────
const accountLockouts = new Map();
const LOCKOUT_MAX      = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function checkAccountLockout(email) {
  const entry = accountLockouts.get(email);
  if (!entry) return true;
  if (Date.now() > entry.lockedUntil) { accountLockouts.delete(email); return true; }
  return false;
}

function recordFailedLogin(email) {
  const entry = accountLockouts.get(email) || { failures: 0, lockedUntil: 0 };
  entry.failures++;
  if (entry.failures >= LOCKOUT_MAX) entry.lockedUntil = Date.now() + LOCKOUT_DURATION;
  accountLockouts.set(email, entry);
}

function clearFailedLogins(email) { accountLockouts.delete(email); }

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginRateLimits.entries()) {
    if (now - entry.windowStart > LOGIN_WINDOW) loginRateLimits.delete(ip);
  }
  for (const [email, entry] of accountLockouts.entries()) {
    if (now > entry.lockedUntil) accountLockouts.delete(email);
  }
}, 30 * 60 * 1000);

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || '0.0.0.0';
    if (!checkLoginRate(ip)) {
      logger.warn('login_rate_limit', { ip });
      return res.status(429).json({ error: 'Příliš mnoho pokusů. Zkuste to za 15 minut.' });
    }

    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email a heslo jsou povinné' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Neplatný formát emailu' });
    }

    if (!checkAccountLockout(email)) {
      logger.warn('account_locked', { email });
      return res.status(429).json({ error: 'Účet dočasně uzamčen. Zkuste to za 15 minut.' });
    }

    const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      recordFailedLogin(email);
      logger.warn('login_failed', { reason: 'user_not_found' });
      return res.status(401).json({ error: 'Neplatné přihlašovací údaje' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      recordFailedLogin(email);
      logger.warn('login_failed', { reason: 'wrong_password', user_id: user.id });
      return res.status(401).json({ error: 'Neplatné přihlašovací údaje' });
    }

    clearFailedLogins(email);

    const jti = crypto.randomUUID();
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, jti },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    logger.info('login_success', { user_id: user.id, role: user.role });
    res.json({ token, expiresIn: 3600, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    logger.fromError('login_error', err);
    res.status(500).json({ error: 'Chyba serveru. Zkuste to znovu.' });
  }
});

// POST /api/auth/refresh — issue a new token if current is still valid
router.post('/refresh', AuthMiddleware.verifyToken, async (req, res) => {
  try {
    const user = await db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const jti = crypto.randomUUID();
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, jti },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    res.json({ token, expiresIn: 3600 });
  } catch (err) {
    logger.fromError('auth_refresh_error', err);
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// POST /api/auth/logout — blacklist the current token
router.post('/logout', AuthMiddleware.verifyToken, (req, res) => {
  if (req.user.jti) {
    const ttl = (req.user.exp || 0) - Math.floor(Date.now() / 1000);
    if (ttl > 0) tokenBlacklist.add(req.user.jti, ttl);
  }
  res.json({ ok: true });
});

// POST /api/auth/change-password — change the current user's password
router.post('/change-password', AuthMiddleware.verifyToken, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Současné a nové heslo jsou povinné' });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'Nové heslo musí mít alespoň 8 znaků' });
    }
    if (!/[A-Z]/.test(new_password) || !/[0-9]/.test(new_password)) {
      return res.status(400).json({ error: 'Heslo musí obsahovat velké písmeno a číslo' });
    }

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Uživatel nenalezen' });

    const match = await bcrypt.compare(current_password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Nesprávné současné heslo' });

    const newHash = await bcrypt.hash(new_password, 12);
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);

    logger.info('password_changed', { user_id: req.user.id });
    res.json({ message: 'Heslo úspěšně změněno' });
  } catch (err) {
    logger.fromError('change_password_error', err);
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// GET /api/auth/me
router.get('/me', AuthMiddleware.verifyToken, async (req, res) => {
  try {
    const user = await db.prepare('SELECT id, email, role, password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Check if using the default insecure password
    const isDefault = await bcrypt.compare('admin123', user.password_hash);
    const { password_hash: _, ...safeUser } = user;
    res.json({ ...safeUser, must_change_password: isDefault });
  } catch (err) {
    logger.fromError('auth_me_error', err, { user_id: req.user?.id });
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

export default router;
