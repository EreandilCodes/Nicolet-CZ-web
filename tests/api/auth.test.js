import '../setup.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDatabase, closeDatabase } from '../../backend/database.js';
import db from '../../backend/database.js';
import bcrypt from 'bcrypt';
import express from 'express';
import request from 'supertest';
import authRoutes from '../../backend/routes/auth.js';
import { AuthMiddleware } from '../../backend/middleware/auth.js';
import { JWT_SECRET } from '../../backend/config.js';
import jwt from 'jsonwebtoken';

let app;

beforeAll(async () => {
  await initDatabase();
  app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/auth', authRoutes);
  // Protected test route
  app.get('/api/test-protected', AuthMiddleware.verifyToken, (req, res) => {
    res.json({ user: req.user.email });
  });
});

afterAll(async () => {
  // Don't close SQLite in tests — sqlite3 native module throws SQLITE_BUSY
  // when prepared statements are cached. Process cleanup handles it.
});

describe('POST /api/auth/login', () => {
  it('returns 400 for missing credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 for invalid email format', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email', password: 'test' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it('returns 401 for wrong credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'wrong@test.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('returns token for valid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@nicolet.cz', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.expiresIn).toBe(3600);
    expect(res.body.user.email).toBe('admin@nicolet.cz');
  });
});

describe('POST /api/auth/refresh', () => {
  it('issues a new token', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'admin@nicolet.cz', password: 'admin123' });
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.token).not.toBe(login.body.token);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a tampered token (wrong secret)', async () => {
    const forged = jwt.sign(
      { id: 1, email: 'admin@nicolet.cz', role: 'admin' },
      'completely-wrong-secret',
      { expiresIn: '1h' }
    );
    const res = await request(app).post('/api/auth/refresh').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid token');
  });

  it('issues a new token for an expired-but-correctly-signed token (sliding session)', async () => {
    const expired = jwt.sign(
      { id: 1, email: 'admin@nicolet.cz', role: 'admin', jti: 'expired-refresh-test' },
      JWT_SECRET,
      { expiresIn: '-1h' }
    );
    const res = await request(app).post('/api/auth/refresh').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();

    // The newly issued token must be usable on protected endpoints
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
  });

  it('rejects refresh with a logged-out (blacklisted) token', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'admin@nicolet.cz', password: 'admin123' });
    expect(login.status).toBe(200);
    const token = login.body.token;

    const logout = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
    expect(logout.status).toBe(200);

    const res = await request(app).post('/api/auth/refresh').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token revoked');
  });
});

describe('POST /api/auth/logout', () => {
  it('blacklists the token', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'admin@nicolet.cz', password: 'admin123' });
    const token = login.body.token;

    // Token works before logout
    const before = await request(app).get('/api/test-protected').set('Authorization', `Bearer ${token}`);
    expect(before.status).toBe(200);

    // Logout
    const logout = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
    expect(logout.status).toBe(200);

    // Token rejected after logout
    const after = await request(app).get('/api/test-protected').set('Authorization', `Bearer ${token}`);
    expect(after.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns user info with valid token', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'admin@nicolet.cz', password: 'admin123' });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('admin@nicolet.cz');
    expect(res.body.role).toBe('admin');
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
  });
});

describe('Authentication middleware', () => {
  it('rejects requests without auth header', async () => {
    const res = await request(app).get('/api/test-protected');
    expect(res.status).toBe(401);
  });

  it('rejects malformed tokens', async () => {
    const res = await request(app).get('/api/test-protected').set('Authorization', 'Bearer abc123');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/change-password', () => {
  let token;

  // Get a single token to reuse (avoids hitting login rate limit)
  it('setup: get auth token', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'admin@nicolet.cz', password: 'admin123' });
    expect(login.status).toBe(200);
    token = login.body.token;
  });

  it('rejects missing fields', async () => {
    const res = await request(app).post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects short password', async () => {
    const res = await request(app).post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'admin123', new_password: 'short' });
    expect(res.status).toBe(400);
  });

  it('rejects weak password (no uppercase/number)', async () => {
    const res = await request(app).post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'admin123', new_password: 'longpassword' });
    expect(res.status).toBe(400);
  });

  it('rejects wrong current password', async () => {
    const res = await request(app).post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'wrongpass', new_password: 'NewPass123' });
    expect(res.status).toBe(401);
  });

  it('changes password successfully', async () => {
    const res = await request(app).post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'admin123', new_password: 'NewSecure1' });
    expect(res.status).toBe(200);

    // Restore original password directly in DB for other tests
    const restoreHash = await bcrypt.hash('admin123', 12);
    await db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(restoreHash, 'admin@nicolet.cz');
  });
});

describe('GET /api/auth/me - must_change_password flag', () => {
  it('returns must_change_password flag', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'admin@nicolet.cz', password: 'admin123' });
    expect(login.status).toBe(200);
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('must_change_password');
    expect(res.body.password_hash).toBeUndefined(); // must not leak
  });
});
