import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { initDatabase, closeDatabase } from './database.js';
import { logger } from './logger.js';
import { requestLogger } from './middleware/request-logger.js';

import authRoutes                          from './routes/auth.js';
import settingsRoutes                      from './routes/settings.js';
import contactsRoutes                      from './routes/contacts.js';
import carouselRoutes                      from './routes/carousel.js';
import newsRoutes                          from './routes/news.js';
import newsCategoriesRoutes               from './routes/news-categories.js';
import pagesRoutes                         from './routes/pages.js';
import productsRoutes, { categoriesRouter } from './routes/products.js';
import applicationsRoutes, { groupsRouter } from './routes/applications.js';
import trainingsRoutes                     from './routes/trainings.js';
import buttonsRoutes                       from './routes/buttons.js';
import formsRoutes, { submissionsRouter }  from './routes/forms.js';
import galleryRoutes                       from './routes/gallery.js';
import menuRoutes                          from './routes/menu.js';
import faqsRoutes                          from './routes/faqs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 3003;

logger.info('server_starting', { service: 'nicolet-cz', port: PORT });

const initWithTimeout = Promise.race([
  initDatabase(),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Database initialization timeout')), 35000)
  )
]);

initWithTimeout
  .catch(err => {
    logger.warn('db_init_failed', { error_message: err.message });
  })
  .finally(() => {
    app.disable('x-powered-by');
    app.use(compression());

    // ── Security headers (helmet) ────────────────────────────────────────
    const isProd = process.env.NODE_ENV === 'production';
    const cspDirectives = {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      connectSrc: ["'self'"],
    };
    if (isProd) cspDirectives.upgradeInsecureRequests = [];
    app.use(helmet({
      contentSecurityPolicy: { useDefaults: false, directives: cspDirectives },
      hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      frameguard: { action: 'sameorigin' },
    }));

    // CORS – restrict to same origin in production; allow dev localhost
    const ALLOWED_ORIGINS = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
      : [`http://localhost:${PORT}`];
    app.use(cors({
      origin(origin, cb) {
        // Allow same-origin requests (origin is undefined) and whitelisted origins
        if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        cb(null, false); // reject silently – browser enforces the block
      },
    }));

    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    // ── Request logging (must be before routes) ───────────────────────────
    app.use(requestLogger);

    // ── Rate limiting ────────────────────────────────────────────────────
    app.use('/api/', rateLimit({
      windowMs: 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Příliš mnoho požadavků. Zkuste to za chvíli.' },
    }));

    // Stricter limit on write operations
    app.use('/api/', rateLimit({
      windowMs: 60 * 1000,
      max: 30,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
      message: { error: 'Příliš mnoho požadavků. Zkuste to za chvíli.' },
    }));

    // ── Validate numeric :id params across all routes ────────────────────
    app.param('id', (req, res, next, value) => {
      if (!/^\d+$/.test(value)) return res.status(400).json({ error: 'Neplatné ID' });
      next();
    });

    // Static files – cache assets for 1 day, HTML never
    app.use(express.static(path.join(__dirname, '../frontend'), {
      maxAge: '1d',
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      }
    }));

    // API Routes
    app.use('/api/auth',               authRoutes);
    app.use('/api/settings',           settingsRoutes);
    app.use('/api/contacts',           contactsRoutes);
    app.use('/api/carousel',           carouselRoutes);
    app.use('/api/news',               newsRoutes);
    app.use('/api/news-categories',    newsCategoriesRoutes);
    app.use('/api/pages',              pagesRoutes);
    app.use('/api/products',           productsRoutes);
    app.use('/api/product-categories', categoriesRouter);
    app.use('/api/application-groups', groupsRouter);
    app.use('/api/applications',       applicationsRoutes);
    app.use('/api/trainings',          trainingsRoutes);
    app.use('/api/buttons',            buttonsRoutes);
    app.use('/api/forms',              formsRoutes);
    app.use('/api/submissions',        submissionsRouter);
    app.use('/api/gallery',            galleryRoutes);
    app.use('/api/menu',               menuRoutes);
    app.use('/api/faqs',               faqsRoutes);

    // Admin panel
    app.get('/admin', (_req, res) => {
      res.sendFile(path.join(__dirname, '../frontend/admin.html'));
    });

    // Login page
    app.get('/login', (_req, res) => {
      res.sendFile(path.join(__dirname, '../frontend/login.html'));
    });

    // ── Sitemap.xml (auto-generated from DB) ──────────────────────────────
    app.get('/sitemap.xml', async (_req, res) => {
      try {
        const baseUrl = process.env.SITE_URL || `http://localhost:${PORT}`;
        const [products, apps, news, pages] = await Promise.all([
          db.prepare("SELECT slug, updated_at FROM products WHERE is_published = 1").all(),
          db.prepare("SELECT slug, updated_at FROM applications WHERE is_published = 1").all(),
          db.prepare("SELECT slug, updated_at FROM news_posts WHERE is_published = 1 ORDER BY created_at DESC").all(),
          db.prepare("SELECT slug, updated_at FROM pages WHERE is_published = 1").all(),
        ]);
        const fmt = (d) => d ? new Date(d).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
        xml += `  <url><loc>${baseUrl}/</loc><priority>1.0</priority></url>\n`;
        xml += `  <url><loc>${baseUrl}/produkty</loc><priority>0.8</priority></url>\n`;
        xml += `  <url><loc>${baseUrl}/aplikace</loc><priority>0.8</priority></url>\n`;
        xml += `  <url><loc>${baseUrl}/novinky</loc><priority>0.7</priority></url>\n`;
        xml += `  <url><loc>${baseUrl}/skoleni</loc><priority>0.6</priority></url>\n`;
        for (const p of products) xml += `  <url><loc>${baseUrl}/produkt/${p.slug}</loc><lastmod>${fmt(p.updated_at)}</lastmod><priority>0.7</priority></url>\n`;
        for (const a of apps) xml += `  <url><loc>${baseUrl}/aplikace/${a.slug}</loc><lastmod>${fmt(a.updated_at)}</lastmod><priority>0.7</priority></url>\n`;
        for (const n of news) xml += `  <url><loc>${baseUrl}/novinka/${n.slug}</loc><lastmod>${fmt(n.updated_at)}</lastmod><priority>0.6</priority></url>\n`;
        for (const pg of pages) xml += `  <url><loc>${baseUrl}/stranka/${pg.slug}</loc><lastmod>${fmt(pg.updated_at)}</lastmod><priority>0.5</priority></url>\n`;
        xml += `</urlset>`;
        res.set('Content-Type', 'application/xml');
        res.send(xml);
      } catch (err) {
        logger.fromError('sitemap_error', err);
        res.status(500).send('Sitemap generation failed');
      }
    });

    // Public SPA – all remaining routes
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, '../frontend/index.html'));
    });

    // ── Global error handler (must be last) ───────────────────────────────
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, _next) => {
      logger.fromError('unhandled_request_error', err, {
        method: req.method,
        path:   req.path,
      });
      res.status(500).json({ error: 'Chyba serveru' });
    });

    const server = app.listen(PORT, () => {
      logger.info('server_ready', {
        port:  PORT,
        admin: `http://localhost:${PORT}/admin`,
      });
    });

    // ── Timeouts ──────────────────────────────────────────────────────────
    server.timeout = 30000;
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.fatal('port_in_use', { port: PORT });
        process.exit(1);
      } else {
        logger.fromError('server_error', err);
        throw err;
      }
    });

    // ── Graceful shutdown ────────────────────────────────────────────────
    function shutdown(signal) {
      logger.info('shutdown_signal', { signal });
      server.close(async () => {
        try { await closeDatabase(); } catch {}
        logger.info('shutdown_complete');
        process.exit(0);
      });
      // Force exit after 10s if connections hang
      setTimeout(() => process.exit(1), 10000).unref();
    }
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

    // ── Unhandled rejections / exceptions ─────────────────────────────────
    process.on('unhandledRejection', (reason) => {
      logger.fromError('unhandled_rejection', reason instanceof Error ? reason : new Error(String(reason)));
    });

    process.on('uncaughtException', (err) => {
      logger.fromError('uncaught_exception', err);
      process.exit(1);
    });
  });
