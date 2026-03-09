import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from './database.js';

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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 3003;

console.log('🔄 Starting Nicolet CZ server...');

const initWithTimeout = Promise.race([
  initDatabase(),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Database initialization timeout')), 35000)
  )
]);

initWithTimeout
  .catch(err => {
    console.warn('⚠️  Database initialization issue:', err.message);
    console.warn('⚠️  Server will start anyway.');
  })
  .finally(() => {
    if (!process.env.JWT_SECRET) {
      console.warn('⚠️  JWT_SECRET not set in .env – using insecure default. Set a strong secret before deploying!');
    }

    app.disable('x-powered-by');
    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Security headers
    app.use((_req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      next();
    });

    // Static files
    app.use(express.static(path.join(__dirname, '../frontend')));

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

    // Admin panel
    app.get('/admin', (_req, res) => {
      res.sendFile(path.join(__dirname, '../frontend/admin.html'));
    });

    // Login page
    app.get('/login', (_req, res) => {
      res.sendFile(path.join(__dirname, '../frontend/login.html'));
    });

    // Public SPA – all remaining routes
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, '../frontend/index.html'));
    });

    const server = app.listen(PORT, () => {
      console.log(`✅ Nicolet CZ running on http://localhost:${PORT}`);
      console.log(`📊 Admin: http://localhost:${PORT}/admin`);
      console.log(`🔐 Login: http://localhost:${PORT}/login`);
      console.log(`🌐 Public: http://localhost:${PORT}/`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} already in use. Set PORT env variable.`);
        process.exit(1);
      } else {
        throw err;
      }
    });
  });
