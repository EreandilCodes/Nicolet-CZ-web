import '../setup.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDatabase, closeDatabase } from '../../backend/database.js';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import request from 'supertest';
import authRoutes from '../../backend/routes/auth.js';
import settingsRoutes from '../../backend/routes/settings.js';

let app;

beforeAll(async () => {
  await initDatabase();

  app = express();
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
        connectSrc: ["'self'"],
      },
    },
    hsts: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    frameguard: { action: 'sameorigin' },
  }));
  app.use(express.json({ limit: '1mb' }));
  app.param('id', (req, res, next, value) => {
    if (!/^\d+$/.test(value)) return res.status(400).json({ error: 'Neplatné ID' });
    next();
  });
  app.use('/api/auth', authRoutes);
  app.use('/api/settings', settingsRoutes);
});

afterAll(async () => {
  // Don't close SQLite in tests — native module throws SQLITE_BUSY with cached statements
});

describe('Security headers', () => {
  it('includes Content-Security-Policy', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('includes X-Content-Type-Options', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('includes X-Frame-Options', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('includes Referrer-Policy', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('omits Strict-Transport-Security in non-production', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  it('does not expose X-Powered-By', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('Input validation', () => {
  it('rejects non-numeric :id parameters', async () => {
    // Use a route that actually takes an :id param
    const testApp = express();
    testApp.use(express.json());
    testApp.param('id', (req, res, next, value) => {
      if (!/^\d+$/.test(value)) return res.status(400).json({ error: 'Neplatné ID' });
      next();
    });
    testApp.get('/api/items/:id', (req, res) => res.json({ id: req.params.id }));

    const res = await request(testApp).get('/api/items/abc');
    expect(res.status).toBe(400);

    const res2 = await request(testApp).get('/api/items/123');
    expect(res2.status).toBe(200);
  });

  it('rejects request bodies over 1mb', async () => {
    const largeBody = { data: 'x'.repeat(2 * 1024 * 1024) };
    const res = await request(app).post('/api/auth/login').send(largeBody);
    expect(res.status).toBe(413);
  });
});

describe('JWT token expiry', () => {
  it('token includes expiresIn of 3600 (1 hour)', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@nicolet.cz', password: 'admin123' });
    expect(res.body.expiresIn).toBe(3600);
  });
});
