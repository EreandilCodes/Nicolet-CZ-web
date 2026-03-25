/**
 * Comprehensive CRUD tests for all API routes.
 * Uses SQLite test DB via ../setup.js for isolation.
 */
import '../setup.js';

import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';

import { initDatabase } from '../../backend/database.js';

import authRoutes from '../../backend/routes/auth.js';
import settingsRoutes from '../../backend/routes/settings.js';
import contactsRoutes from '../../backend/routes/contacts.js';
import carouselRoutes from '../../backend/routes/carousel.js';
import newsRoutes from '../../backend/routes/news.js';
import newsCategoriesRoutes from '../../backend/routes/news-categories.js';
import pagesRoutes from '../../backend/routes/pages.js';
import productsRoutes, { categoriesRouter } from '../../backend/routes/products.js';
import applicationsRoutes, { groupsRouter } from '../../backend/routes/applications.js';
import trainingsRoutes from '../../backend/routes/trainings.js';
import buttonsRoutes from '../../backend/routes/buttons.js';
import formsRoutes, { submissionsRouter } from '../../backend/routes/forms.js';
import galleryRoutes from '../../backend/routes/gallery.js';
import menuRoutes from '../../backend/routes/menu.js';

let app;
let token;

beforeAll(async () => {
  await initDatabase();

  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Validate numeric :id params (same as server.js)
  app.param('id', (req, res, next, value) => {
    if (!/^\d+$/.test(value)) return res.status(400).json({ error: 'Neplatne ID' });
    next();
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/contacts', contactsRoutes);
  app.use('/api/carousel', carouselRoutes);
  app.use('/api/news', newsRoutes);
  app.use('/api/news-categories', newsCategoriesRoutes);
  app.use('/api/pages', pagesRoutes);
  app.use('/api/products', productsRoutes);
  app.use('/api/product-categories', categoriesRouter);
  app.use('/api/application-groups', groupsRouter);
  app.use('/api/applications', applicationsRoutes);
  app.use('/api/trainings', trainingsRoutes);
  app.use('/api/buttons', buttonsRoutes);
  app.use('/api/forms', formsRoutes);
  app.use('/api/submissions', submissionsRouter);
  app.use('/api/gallery', galleryRoutes);
  app.use('/api/menu', menuRoutes);

  // Login to get auth token
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@nicolet.cz', password: 'admin123' });
  token = res.body.token;
  expect(token).toBeTruthy();
}, 30000);

// ── Helper ──────────────────────────────────────────────────────────────────
const auth = () => ({ Authorization: `Bearer ${token}` });

// ════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════════════════════════════════════
describe('Settings /api/settings', () => {
  it('GET / requires auth', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(401);
  });

  it('GET / returns object with auth', async () => {
    const res = await request(app).get('/api/settings').set(auth());
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
  });

  it('GET /public is public and returns object', async () => {
    const res = await request(app).get('/api/settings/public');
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
  });

  it('PUT / requires auth', async () => {
    const res = await request(app).put('/api/settings').send({ site_name_cz: 'Test' });
    expect(res.status).toBe(401);
  });

  it('PUT / updates whitelisted keys', async () => {
    const res = await request(app).put('/api/settings').set(auth())
      .send({ site_name_cz: 'Nicolet Test' });
    expect(res.status).toBe(200);

    const get = await request(app).get('/api/settings').set(auth());
    expect(get.body.site_name_cz).toBe('Nicolet Test');
  });

  it('PUT / ignores non-whitelisted keys', async () => {
    const res = await request(app).put('/api/settings').set(auth())
      .send({ evil_key: 'hacked' });
    expect(res.status).toBe(200);

    const get = await request(app).get('/api/settings').set(auth());
    expect(get.body.evil_key).toBeUndefined();
  });

  it('PUT / rejects non-object body', async () => {
    const res = await request(app).put('/api/settings').set(auth())
      .send([1, 2, 3]);
    expect(res.status).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CONTACTS
// ════════════════════════════════════════════════════════════════════════════
describe('Contacts /api/contacts', () => {
  let createdId;

  it('GET / returns array (public)', async () => {
    const res = await request(app).get('/api/contacts');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /admin/all requires auth', async () => {
    const res = await request(app).get('/api/contacts/admin/all');
    expect(res.status).toBe(401);
  });

  it('GET /admin/all returns array with auth', async () => {
    const res = await request(app).get('/api/contacts/admin/all').set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST / requires auth', async () => {
    const res = await request(app).post('/api/contacts').send({ name: 'Test' });
    expect(res.status).toBe(401);
  });

  it('POST / validates required fields', async () => {
    const res = await request(app).post('/api/contacts').set(auth()).send({});
    expect(res.status).toBe(400);
  });

  it('POST / creates contact', async () => {
    const res = await request(app).post('/api/contacts').set(auth())
      .send({ name: 'Jan Novak', email: 'jan@test.cz', is_active: true });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Jan Novak');
    createdId = res.body.id;
  });

  it('PUT /:id updates contact', async () => {
    const res = await request(app).put(`/api/contacts/${createdId}`).set(auth())
      .send({ name: 'Jan Updated', is_active: true });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Jan Updated');
  });

  it('PUT /:id returns 404 for non-existent', async () => {
    const res = await request(app).put('/api/contacts/99999').set(auth())
      .send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });

  it('DELETE /:id removes contact', async () => {
    const res = await request(app).delete(`/api/contacts/${createdId}`).set(auth());
    expect(res.status).toBe(200);
  });

  it('DELETE /:id returns 404 for non-existent', async () => {
    const res = await request(app).delete('/api/contacts/99999').set(auth());
    expect(res.status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CAROUSEL
// ════════════════════════════════════════════════════════════════════════════
describe('Carousel /api/carousel', () => {
  let createdId;

  it('GET / returns array (public)', async () => {
    const res = await request(app).get('/api/carousel');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /admin/all requires auth', async () => {
    const res = await request(app).get('/api/carousel/admin/all');
    expect(res.status).toBe(401);
  });

  it('GET /admin/all returns array with auth', async () => {
    const res = await request(app).get('/api/carousel/admin/all').set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /admin validates required fields', async () => {
    const res = await request(app).post('/api/carousel/admin').set(auth()).send({});
    expect(res.status).toBe(400);
  });

  it('POST /admin creates item', async () => {
    const res = await request(app).post('/api/carousel/admin').set(auth())
      .send({ image_url: '/uploads/gallery/test.jpg', title_cz: 'Slide 1' });
    expect(res.status).toBe(201);
    expect(res.body.image_url).toBe('/uploads/gallery/test.jpg');
    createdId = res.body.id;
  });

  it('PUT /admin/:id updates item', async () => {
    const res = await request(app).put(`/api/carousel/admin/${createdId}`).set(auth())
      .send({ image_url: '/uploads/gallery/updated.jpg', title_cz: 'Updated' });
    expect(res.status).toBe(200);
    expect(res.body.title_cz).toBe('Updated');
  });

  it('PUT /admin/:id returns 404 for non-existent', async () => {
    const res = await request(app).put('/api/carousel/admin/99999').set(auth())
      .send({ image_url: '/img.jpg' });
    expect(res.status).toBe(404);
  });

  it('DELETE /admin/:id removes item', async () => {
    const res = await request(app).delete(`/api/carousel/admin/${createdId}`).set(auth());
    expect(res.status).toBe(200);
  });

  it('DELETE /admin/:id returns 404 for non-existent', async () => {
    const res = await request(app).delete('/api/carousel/admin/99999').set(auth());
    expect(res.status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// NEWS
// ════════════════════════════════════════════════════════════════════════════
describe('News /api/news', () => {
  let createdId;
  let createdSlug;

  it('GET / returns array (public)', async () => {
    const res = await request(app).get('/api/news');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /admin/all requires auth', async () => {
    const res = await request(app).get('/api/news/admin/all');
    expect(res.status).toBe(401);
  });

  it('GET /admin/all returns array with auth', async () => {
    const res = await request(app).get('/api/news/admin/all').set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /admin validates required fields', async () => {
    const res = await request(app).post('/api/news/admin').set(auth()).send({});
    expect(res.status).toBe(400);
  });

  it('POST /admin creates news post', async () => {
    const res = await request(app).post('/api/news/admin').set(auth())
      .send({ title_cz: 'Testovaci novinka', content_cz: '<p>Obsah</p>', is_published: true });
    expect(res.status).toBe(201);
    expect(res.body.title_cz).toBe('Testovaci novinka');
    createdId = res.body.id;
    createdSlug = res.body.slug;
  });

  it('GET /:slug returns published post', async () => {
    const res = await request(app).get(`/api/news/${createdSlug}`);
    expect(res.status).toBe(200);
    expect(res.body.title_cz).toBe('Testovaci novinka');
  });

  it('GET /:slug returns 404 for non-existent', async () => {
    const res = await request(app).get('/api/news/nonexistent-slug-xyz');
    expect(res.status).toBe(404);
  });

  it('PUT /admin/:id updates post', async () => {
    const res = await request(app).put(`/api/news/admin/${createdId}`).set(auth())
      .send({ title_cz: 'Updated novinka', slug: createdSlug, is_published: true });
    expect(res.status).toBe(200);
    expect(res.body.title_cz).toBe('Updated novinka');
  });

  it('PUT /admin/:id returns 404 for non-existent', async () => {
    const res = await request(app).put('/api/news/admin/99999').set(auth())
      .send({ title_cz: 'Ghost', slug: 'ghost-slug' });
    expect(res.status).toBe(404);
  });

  it('PUT /admin/:id/publish toggles publish', async () => {
    const res = await request(app).put(`/api/news/admin/${createdId}/publish`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.is_published).toBeDefined();
  });

  it('DELETE /admin/:id removes post', async () => {
    const res = await request(app).delete(`/api/news/admin/${createdId}`).set(auth());
    expect(res.status).toBe(200);
  });

  it('DELETE /admin/:id returns 404 for non-existent', async () => {
    const res = await request(app).delete('/api/news/admin/99999').set(auth());
    expect(res.status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// NEWS CATEGORIES
// ════════════════════════════════════════════════════════════════════════════
describe('News Categories /api/news-categories', () => {
  let createdId;

  it('GET / returns array (public)', async () => {
    const res = await request(app).get('/api/news-categories');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /admin/all requires auth', async () => {
    const res = await request(app).get('/api/news-categories/admin/all');
    expect(res.status).toBe(401);
  });

  it('GET /admin/all returns array with auth', async () => {
    const res = await request(app).get('/api/news-categories/admin/all').set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /admin validates required fields', async () => {
    const res = await request(app).post('/api/news-categories/admin').set(auth()).send({});
    expect(res.status).toBe(400);
  });

  it('POST /admin creates category', async () => {
    const res = await request(app).post('/api/news-categories/admin').set(auth())
      .send({ name_cz: 'Technologie', is_active: true });
    expect(res.status).toBe(201);
    expect(res.body.name_cz).toBe('Technologie');
    createdId = res.body.id;
  });

  it('PUT /admin/:id updates category', async () => {
    const res = await request(app).put(`/api/news-categories/admin/${createdId}`).set(auth())
      .send({ name_cz: 'Tech Updated', slug: res => res, is_active: true });
    // Need slug for update – fetch first
    const get = await request(app).get('/api/news-categories/admin/all').set(auth());
    const cat = get.body.find(c => c.id === createdId);
    const upd = await request(app).put(`/api/news-categories/admin/${createdId}`).set(auth())
      .send({ name_cz: 'Tech Updated', slug: cat.slug, is_active: true });
    expect(upd.status).toBe(200);
    expect(upd.body.name_cz).toBe('Tech Updated');
  });

  it('PUT /admin/:id returns 404 for non-existent', async () => {
    const res = await request(app).put('/api/news-categories/admin/99999').set(auth())
      .send({ name_cz: 'Ghost', slug: 'ghost' });
    expect(res.status).toBe(404);
  });

  it('DELETE /admin/:id removes category', async () => {
    const res = await request(app).delete(`/api/news-categories/admin/${createdId}`).set(auth());
    expect(res.status).toBe(200);
  });

  it('DELETE /admin/:id returns 404 for non-existent', async () => {
    const res = await request(app).delete('/api/news-categories/admin/99999').set(auth());
    expect(res.status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PAGES
// ════════════════════════════════════════════════════════════════════════════
describe('Pages /api/pages', () => {
  let createdId;
  let createdSlug;

  it('GET / returns array (public)', async () => {
    const res = await request(app).get('/api/pages');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /admin/all requires auth', async () => {
    const res = await request(app).get('/api/pages/admin/all');
    expect(res.status).toBe(401);
  });

  it('GET /admin/all returns array with auth', async () => {
    const res = await request(app).get('/api/pages/admin/all').set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /admin validates required fields', async () => {
    const res = await request(app).post('/api/pages/admin').set(auth()).send({});
    expect(res.status).toBe(400);
  });

  it('POST /admin creates page', async () => {
    const res = await request(app).post('/api/pages/admin').set(auth())
      .send({ title_cz: 'O nas', content_cz: '<p>Obsah</p>', is_published: true });
    expect(res.status).toBe(201);
    expect(res.body.title_cz).toBe('O nas');
    createdId = res.body.id;
    createdSlug = res.body.slug;
  });

  it('GET /:slug returns published page', async () => {
    const res = await request(app).get(`/api/pages/${createdSlug}`);
    expect(res.status).toBe(200);
    expect(res.body.title_cz).toBe('O nas');
  });

  it('GET /:slug returns 404 for non-existent', async () => {
    const res = await request(app).get('/api/pages/nonexistent-page-xyz');
    expect(res.status).toBe(404);
  });

  it('PUT /admin/:id updates page', async () => {
    const res = await request(app).put(`/api/pages/admin/${createdId}`).set(auth())
      .send({ title_cz: 'O nas Updated', slug: createdSlug, is_published: true });
    expect(res.status).toBe(200);
    expect(res.body.title_cz).toBe('O nas Updated');
  });

  it('PUT /admin/:id returns 404 for non-existent', async () => {
    const res = await request(app).put('/api/pages/admin/99999').set(auth())
      .send({ title_cz: 'Ghost', slug: 'ghost' });
    expect(res.status).toBe(404);
  });

  it('DELETE /admin/:id removes page', async () => {
    const res = await request(app).delete(`/api/pages/admin/${createdId}`).set(auth());
    expect(res.status).toBe(200);
  });

  it('DELETE /admin/:id returns 404 for non-existent', async () => {
    const res = await request(app).delete('/api/pages/admin/99999').set(auth());
    expect(res.status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PRODUCT CATEGORIES
// ════════════════════════════════════════════════════════════════════════════
describe('Product Categories /api/product-categories', () => {
  let createdId;

  it('GET / returns array (public)', async () => {
    const res = await request(app).get('/api/product-categories');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /admin/all requires auth', async () => {
    const res = await request(app).get('/api/product-categories/admin/all');
    expect(res.status).toBe(401);
  });

  it('GET /admin/all returns array with auth', async () => {
    const res = await request(app).get('/api/product-categories/admin/all').set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /admin validates required fields', async () => {
    const res = await request(app).post('/api/product-categories/admin').set(auth()).send({});
    expect(res.status).toBe(400);
  });

  it('POST /admin creates category', async () => {
    const res = await request(app).post('/api/product-categories/admin').set(auth())
      .send({ name_cz: 'FTIR', is_active: true });
    expect(res.status).toBe(201);
    expect(res.body.name_cz).toBe('FTIR');
    createdId = res.body.id;
  });

  it('PUT /admin/:id updates category', async () => {
    const get = await request(app).get('/api/product-categories/admin/all').set(auth());
    const cat = get.body.find(c => c.id === createdId);
    const res = await request(app).put(`/api/product-categories/admin/${createdId}`).set(auth())
      .send({ name_cz: 'FTIR Updated', slug: cat.slug, is_active: true });
    expect(res.status).toBe(200);
    expect(res.body.name_cz).toBe('FTIR Updated');
  });

  it('PUT /admin/:id returns 404 for non-existent', async () => {
    const res = await request(app).put('/api/product-categories/admin/99999').set(auth())
      .send({ name_cz: 'Ghost', slug: 'ghost' });
    expect(res.status).toBe(404);
  });

  it('DELETE /admin/:id removes category', async () => {
    const res = await request(app).delete(`/api/product-categories/admin/${createdId}`).set(auth());
    expect(res.status).toBe(200);
  });

  it('DELETE /admin/:id returns 404 for non-existent', async () => {
    const res = await request(app).delete('/api/product-categories/admin/99999').set(auth());
    expect(res.status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PRODUCTS
// ════════════════════════════════════════════════════════════════════════════
describe('Products /api/products', () => {
  let createdId;
  let createdSlug;

  it('GET / returns array (public)', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /?fields=list returns lightweight array', async () => {
    const res = await request(app).get('/api/products?fields=list');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /admin/all requires auth', async () => {
    const res = await request(app).get('/api/products/admin/all');
    expect(res.status).toBe(401);
  });

  it('GET /admin/all returns array with auth', async () => {
    const res = await request(app).get('/api/products/admin/all').set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /admin validates required fields', async () => {
    const res = await request(app).post('/api/products/admin').set(auth()).send({});
    expect(res.status).toBe(400);
  });

  it('POST /admin creates product', async () => {
    const res = await request(app).post('/api/products/admin').set(auth())
      .send({ name_cz: 'Nicolet iS50', description_cz: 'FTIR spectrometer', is_published: true });
    expect(res.status).toBe(201);
    expect(res.body.name_cz).toBe('Nicolet iS50');
    expect(Array.isArray(res.body.categories)).toBe(true);
    createdId = res.body.id;
    createdSlug = res.body.slug;
  });

  it('GET /:slug returns published product', async () => {
    const res = await request(app).get(`/api/products/${createdSlug}`);
    expect(res.status).toBe(200);
    expect(res.body.name_cz).toBe('Nicolet iS50');
  });

  it('GET /:slug returns 404 for non-existent', async () => {
    const res = await request(app).get('/api/products/nonexistent-product-xyz');
    expect(res.status).toBe(404);
  });

  it('PUT /admin/:id updates product', async () => {
    const res = await request(app).put(`/api/products/admin/${createdId}`).set(auth())
      .send({ name_cz: 'Nicolet iS50 Updated', slug: createdSlug, is_published: true });
    expect(res.status).toBe(200);
    expect(res.body.name_cz).toBe('Nicolet iS50 Updated');
  });

  it('PUT /admin/:id returns 404 for non-existent', async () => {
    const res = await request(app).put('/api/products/admin/99999').set(auth())
      .send({ name_cz: 'Ghost', slug: 'ghost' });
    expect(res.status).toBe(404);
  });

  it('DELETE /admin/:id removes product', async () => {
    const res = await request(app).delete(`/api/products/admin/${createdId}`).set(auth());
    expect(res.status).toBe(200);
  });

  it('DELETE /admin/:id returns 404 for non-existent', async () => {
    const res = await request(app).delete('/api/products/admin/99999').set(auth());
    expect(res.status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// APPLICATION GROUPS
// ════════════════════════════════════════════════════════════════════════════
describe('Application Groups /api/application-groups', () => {
  let createdId;

  it('GET / returns array (public)', async () => {
    const res = await request(app).get('/api/application-groups');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /admin/all requires auth', async () => {
    const res = await request(app).get('/api/application-groups/admin/all');
    expect(res.status).toBe(401);
  });

  it('GET /admin/all returns array with auth', async () => {
    const res = await request(app).get('/api/application-groups/admin/all').set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /admin validates required fields', async () => {
    const res = await request(app).post('/api/application-groups/admin').set(auth()).send({});
    expect(res.status).toBe(400);
  });

  it('POST /admin creates group', async () => {
    const res = await request(app).post('/api/application-groups/admin').set(auth())
      .send({ name_cz: 'Potravinarska', is_active: true });
    expect(res.status).toBe(201);
    expect(res.body.name_cz).toBe('Potravinarska');
    createdId = res.body.id;
  });

  it('PUT /admin/:id updates group', async () => {
    const get = await request(app).get('/api/application-groups/admin/all').set(auth());
    const grp = get.body.find(g => g.id === createdId);
    const res = await request(app).put(`/api/application-groups/admin/${createdId}`).set(auth())
      .send({ name_cz: 'Potravinarska Updated', slug: grp.slug, is_active: true });
    expect(res.status).toBe(200);
    expect(res.body.name_cz).toBe('Potravinarska Updated');
  });

  it('PUT /admin/:id returns 404 for non-existent', async () => {
    const res = await request(app).put('/api/application-groups/admin/99999').set(auth())
      .send({ name_cz: 'Ghost', slug: 'ghost' });
    expect(res.status).toBe(404);
  });

  it('DELETE /admin/:id removes group', async () => {
    const res = await request(app).delete(`/api/application-groups/admin/${createdId}`).set(auth());
    expect(res.status).toBe(200);
  });

  it('DELETE /admin/:id returns 404 for non-existent', async () => {
    const res = await request(app).delete('/api/application-groups/admin/99999').set(auth());
    expect(res.status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// APPLICATIONS
// ════════════════════════════════════════════════════════════════════════════
describe('Applications /api/applications', () => {
  let createdId;
  let createdSlug;

  it('GET / returns array (public)', async () => {
    const res = await request(app).get('/api/applications');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /?fields=list returns lightweight array', async () => {
    const res = await request(app).get('/api/applications?fields=list');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /admin/all requires auth', async () => {
    const res = await request(app).get('/api/applications/admin/all');
    expect(res.status).toBe(401);
  });

  it('GET /admin/all returns array with auth', async () => {
    const res = await request(app).get('/api/applications/admin/all').set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /admin validates required fields', async () => {
    const res = await request(app).post('/api/applications/admin').set(auth()).send({});
    expect(res.status).toBe(400);
  });

  it('POST /admin creates application', async () => {
    const res = await request(app).post('/api/applications/admin').set(auth())
      .send({ name_cz: 'Analyza oleje', content_cz: '<p>Popis</p>', is_published: true });
    expect(res.status).toBe(201);
    expect(res.body.name_cz).toBe('Analyza oleje');
    expect(Array.isArray(res.body.products)).toBe(true);
    createdId = res.body.id;
    createdSlug = res.body.slug;
  });

  it('GET /:slug returns published application', async () => {
    const res = await request(app).get(`/api/applications/${createdSlug}`);
    expect(res.status).toBe(200);
    expect(res.body.name_cz).toBe('Analyza oleje');
  });

  it('GET /:slug returns 404 for non-existent', async () => {
    const res = await request(app).get('/api/applications/nonexistent-app-xyz');
    expect(res.status).toBe(404);
  });

  it('PUT /admin/:id updates application', async () => {
    const res = await request(app).put(`/api/applications/admin/${createdId}`).set(auth())
      .send({ name_cz: 'Analyza oleje Updated', slug: createdSlug, is_published: true });
    expect(res.status).toBe(200);
    expect(res.body.name_cz).toBe('Analyza oleje Updated');
  });

  it('PUT /admin/:id returns 404 for non-existent', async () => {
    const res = await request(app).put('/api/applications/admin/99999').set(auth())
      .send({ name_cz: 'Ghost', slug: 'ghost' });
    expect(res.status).toBe(404);
  });

  it('DELETE /admin/:id removes application', async () => {
    const res = await request(app).delete(`/api/applications/admin/${createdId}`).set(auth());
    expect(res.status).toBe(200);
  });

  it('DELETE /admin/:id returns 404 for non-existent', async () => {
    const res = await request(app).delete('/api/applications/admin/99999').set(auth());
    expect(res.status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TRAININGS
// ════════════════════════════════════════════════════════════════════════════
describe('Trainings /api/trainings', () => {
  let createdId;

  it('GET / returns array (public)', async () => {
    const res = await request(app).get('/api/trainings');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /admin/all requires auth', async () => {
    const res = await request(app).get('/api/trainings/admin/all');
    expect(res.status).toBe(401);
  });

  it('GET /admin/all returns array with auth', async () => {
    const res = await request(app).get('/api/trainings/admin/all').set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /admin validates required title_cz', async () => {
    const res = await request(app).post('/api/trainings/admin').set(auth())
      .send({ date_start: '2026-06-01' });
    expect(res.status).toBe(400);
  });

  it('POST /admin validates required date_start', async () => {
    const res = await request(app).post('/api/trainings/admin').set(auth())
      .send({ title_cz: 'Skoleni FTIR' });
    expect(res.status).toBe(400);
  });

  it('POST /admin creates training', async () => {
    const res = await request(app).post('/api/trainings/admin').set(auth())
      .send({ title_cz: 'Skoleni FTIR', date_start: '2026-06-01', is_published: true });
    expect(res.status).toBe(201);
    expect(res.body.title_cz).toBe('Skoleni FTIR');
    createdId = res.body.id;
  });

  it('PUT /admin/:id updates training', async () => {
    const res = await request(app).put(`/api/trainings/admin/${createdId}`).set(auth())
      .send({ title_cz: 'Skoleni Updated', date_start: '2026-07-01', is_published: true });
    expect(res.status).toBe(200);
    expect(res.body.title_cz).toBe('Skoleni Updated');
  });

  it('PUT /admin/:id returns 404 for non-existent', async () => {
    const res = await request(app).put('/api/trainings/admin/99999').set(auth())
      .send({ title_cz: 'Ghost', date_start: '2026-01-01' });
    expect(res.status).toBe(404);
  });

  it('DELETE /admin/:id removes training', async () => {
    const res = await request(app).delete(`/api/trainings/admin/${createdId}`).set(auth());
    expect(res.status).toBe(200);
  });

  it('DELETE /admin/:id returns 404 for non-existent', async () => {
    const res = await request(app).delete('/api/trainings/admin/99999').set(auth());
    expect(res.status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// BUTTONS
// ════════════════════════════════════════════════════════════════════════════
describe('Buttons /api/buttons', () => {
  let createdId;

  it('GET / returns array (public)', async () => {
    const res = await request(app).get('/api/buttons');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /admin/all requires auth', async () => {
    const res = await request(app).get('/api/buttons/admin/all');
    expect(res.status).toBe(401);
  });

  it('GET /admin/all returns array with auth', async () => {
    const res = await request(app).get('/api/buttons/admin/all').set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /admin validates required fields', async () => {
    const res = await request(app).post('/api/buttons/admin').set(auth()).send({});
    expect(res.status).toBe(400);
  });

  it('POST /admin creates button', async () => {
    const res = await request(app).post('/api/buttons/admin').set(auth())
      .send({ label_cz: 'Kontaktujte nas', link_type: 'form', is_active: true });
    expect(res.status).toBe(201);
    expect(res.body.label_cz).toBe('Kontaktujte nas');
    createdId = res.body.id;
  });

  it('PUT /admin/:id updates button', async () => {
    const res = await request(app).put(`/api/buttons/admin/${createdId}`).set(auth())
      .send({ label_cz: 'Updated CTA', link_type: 'link', is_active: true });
    expect(res.status).toBe(200);
    expect(res.body.label_cz).toBe('Updated CTA');
  });

  it('PUT /admin/:id returns 404 for non-existent', async () => {
    const res = await request(app).put('/api/buttons/admin/99999').set(auth())
      .send({ label_cz: 'Ghost' });
    expect(res.status).toBe(404);
  });

  it('DELETE /admin/:id removes button', async () => {
    const res = await request(app).delete(`/api/buttons/admin/${createdId}`).set(auth());
    expect(res.status).toBe(200);
  });

  it('DELETE /admin/:id returns 404 for non-existent', async () => {
    const res = await request(app).delete('/api/buttons/admin/99999').set(auth());
    expect(res.status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// FORMS + SUBMISSIONS
// ════════════════════════════════════════════════════════════════════════════
describe('Forms /api/forms', () => {
  let createdId;

  it('GET / returns array (public)', async () => {
    const res = await request(app).get('/api/forms');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /admin/all requires auth', async () => {
    const res = await request(app).get('/api/forms/admin/all');
    expect(res.status).toBe(401);
  });

  it('GET /admin/all returns array with auth', async () => {
    const res = await request(app).get('/api/forms/admin/all').set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /admin validates required fields', async () => {
    const res = await request(app).post('/api/forms/admin').set(auth()).send({});
    expect(res.status).toBe(400);
  });

  it('POST /admin creates form', async () => {
    const res = await request(app).post('/api/forms/admin').set(auth())
      .send({
        name: 'Kontaktni formular',
        fields_json: JSON.stringify([{ name: 'email', type: 'email', required: true }]),
        is_active: true
      });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Kontaktni formular');
    createdId = res.body.id;
  });

  it('GET /:id returns active form (public)', async () => {
    const res = await request(app).get(`/api/forms/${createdId}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Kontaktni formular');
    expect(Array.isArray(res.body.fields_json)).toBe(true);
  });

  it('GET /:id returns 404 for non-existent', async () => {
    const res = await request(app).get('/api/forms/99999');
    expect(res.status).toBe(404);
  });

  it('PUT /admin/:id updates form', async () => {
    const res = await request(app).put(`/api/forms/admin/${createdId}`).set(auth())
      .send({ name: 'Updated form', is_active: true });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated form');
  });

  it('PUT /admin/:id returns 404 for non-existent', async () => {
    const res = await request(app).put('/api/forms/admin/99999').set(auth())
      .send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });

  // ── Form Submission tests ────────────────────────────────────────────────
  it('POST /:id/submit with valid timestamp succeeds', async () => {
    const ts = Math.floor(Date.now() / 1000) - 5;
    const res = await request(app).post(`/api/forms/${createdId}/submit`)
      .send({ _ts: ts, email: 'test@test.cz' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /:id/submit rejects honeypot', async () => {
    const ts = Math.floor(Date.now() / 1000) - 5;
    const res = await request(app).post(`/api/forms/${createdId}/submit`)
      .send({ _ts: ts, _hp: 'bot-filled', email: 'bot@test.cz' });
    // Honeypot silently returns success (200) to fool bots
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /:id/submit rejects invalid timestamp (too old)', async () => {
    const ts = Math.floor(Date.now() / 1000) - 1000;
    const res = await request(app).post(`/api/forms/${createdId}/submit`)
      .send({ _ts: ts, email: 'test@test.cz' });
    expect(res.status).toBe(400);
  });

  it('POST /:id/submit rejects invalid timestamp (too fresh)', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const res = await request(app).post(`/api/forms/${createdId}/submit`)
      .send({ _ts: ts, email: 'test@test.cz' });
    expect(res.status).toBe(400);
  });

  it('POST /:id/submit returns 404 for non-existent form', async () => {
    const ts = Math.floor(Date.now() / 1000) - 5;
    const res = await request(app).post('/api/forms/99999/submit')
      .send({ _ts: ts, email: 'test@test.cz' });
    expect(res.status).toBe(404);
  });

  // ── Submissions admin routes ─────────────────────────────────────────────
  it('GET /submissions/admin/all requires auth', async () => {
    const res = await request(app).get('/api/submissions/admin/all');
    expect(res.status).toBe(401);
  });

  it('GET /submissions/admin/all returns array with auth', async () => {
    const res = await request(app).get('/api/submissions/admin/all').set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('PUT /submissions/admin/:id/read marks submission as read', async () => {
    const all = await request(app).get('/api/submissions/admin/all').set(auth());
    const subId = all.body[0].id;
    const res = await request(app).put(`/api/submissions/admin/${subId}/read`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.is_read).toBe(1);
  });

  it('PUT /submissions/admin/:id/read returns 404 for non-existent', async () => {
    const res = await request(app).put('/api/submissions/admin/99999/read').set(auth());
    expect(res.status).toBe(404);
  });

  it('DELETE /submissions/admin/:id removes submission', async () => {
    const all = await request(app).get('/api/submissions/admin/all').set(auth());
    const subId = all.body[0].id;
    const res = await request(app).delete(`/api/submissions/admin/${subId}`).set(auth());
    expect(res.status).toBe(200);
  });

  it('DELETE /submissions/admin/:id returns 404 for non-existent', async () => {
    const res = await request(app).delete('/api/submissions/admin/99999').set(auth());
    expect(res.status).toBe(404);
  });

  // ── Delete form last ────────────────────────────────────────────────────
  it('DELETE /admin/:id removes form', async () => {
    const res = await request(app).delete(`/api/forms/admin/${createdId}`).set(auth());
    expect(res.status).toBe(200);
  });

  it('DELETE /admin/:id returns 404 for non-existent', async () => {
    const res = await request(app).delete('/api/forms/admin/99999').set(auth());
    expect(res.status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GALLERY (Folders + Images)
// ════════════════════════════════════════════════════════════════════════════
describe('Gallery /api/gallery', () => {
  let folderId;
  let imageId;

  // ── Folders ──────────────────────────────────────────────────────────────
  describe('Folders', () => {
    it('GET /folders returns array (public)', async () => {
      const res = await request(app).get('/api/gallery/folders');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /folders/admin/all requires auth', async () => {
      const res = await request(app).get('/api/gallery/folders/admin/all');
      expect(res.status).toBe(401);
    });

    it('GET /folders/admin/all returns array with auth', async () => {
      const res = await request(app).get('/api/gallery/folders/admin/all').set(auth());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /folders/admin validates required fields', async () => {
      const res = await request(app).post('/api/gallery/folders/admin').set(auth()).send({});
      expect(res.status).toBe(400);
    });

    it('POST /folders/admin creates folder', async () => {
      const res = await request(app).post('/api/gallery/folders/admin').set(auth())
        .send({ name_cz: 'Produktove foto' });
      expect(res.status).toBe(201);
      expect(res.body.name_cz).toBe('Produktove foto');
      folderId = res.body.id;
    });

    it('PUT /folders/admin/:id updates folder', async () => {
      const get = await request(app).get('/api/gallery/folders/admin/all').set(auth());
      const folder = get.body.find(f => f.id === folderId);
      const res = await request(app).put(`/api/gallery/folders/admin/${folderId}`).set(auth())
        .send({ name_cz: 'Foto Updated', slug: folder.slug });
      expect(res.status).toBe(200);
      expect(res.body.name_cz).toBe('Foto Updated');
    });

    it('PUT /folders/admin/:id returns 404 for non-existent', async () => {
      const res = await request(app).put('/api/gallery/folders/admin/99999').set(auth())
        .send({ name_cz: 'Ghost', slug: 'ghost' });
      expect(res.status).toBe(404);
    });

    it('DELETE /folders/admin/:id removes empty folder', async () => {
      // Create a throwaway folder for clean delete
      const created = await request(app).post('/api/gallery/folders/admin').set(auth())
        .send({ name_cz: 'Temp folder' });
      const res = await request(app).delete(`/api/gallery/folders/admin/${created.body.id}`).set(auth());
      expect(res.status).toBe(200);
    });

    it('DELETE /folders/admin/:id returns 404 for non-existent', async () => {
      const res = await request(app).delete('/api/gallery/folders/admin/99999').set(auth());
      expect(res.status).toBe(404);
    });
  });

  // ── Images ───────────────────────────────────────────────────────────────
  describe('Images', () => {
    it('GET /images returns array (public)', async () => {
      const res = await request(app).get('/api/gallery/images');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /images?folder_id filters by folder', async () => {
      const res = await request(app).get(`/api/gallery/images?folder_id=${folderId}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /images/admin/all requires auth', async () => {
      const res = await request(app).get('/api/gallery/images/admin/all');
      expect(res.status).toBe(401);
    });

    it('GET /images/admin/all returns array with auth', async () => {
      const res = await request(app).get('/api/gallery/images/admin/all').set(auth());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /images/admin validates required fields', async () => {
      const res = await request(app).post('/api/gallery/images/admin').set(auth()).send({});
      expect(res.status).toBe(400);
    });

    it('POST /images/admin creates image record (URL)', async () => {
      const res = await request(app).post('/api/gallery/images/admin').set(auth())
        .send({ image_url: 'https://example.com/photo.jpg', folder_id: folderId });
      expect(res.status).toBe(201);
      expect(res.body.image_url).toBe('https://example.com/photo.jpg');
      imageId = res.body.id;
    });

    it('PUT /images/admin/:id updates image', async () => {
      const res = await request(app).put(`/api/gallery/images/admin/${imageId}`).set(auth())
        .send({ image_url: 'https://example.com/updated.jpg', title_cz: 'Updated' });
      expect(res.status).toBe(200);
      expect(res.body.title_cz).toBe('Updated');
    });

    it('PUT /images/admin/:id returns 404 for non-existent', async () => {
      const res = await request(app).put('/api/gallery/images/admin/99999').set(auth())
        .send({ image_url: 'https://example.com/ghost.jpg' });
      expect(res.status).toBe(404);
    });

    it('DELETE /images/admin/:id removes image', async () => {
      const res = await request(app).delete(`/api/gallery/images/admin/${imageId}`).set(auth());
      expect(res.status).toBe(200);
    });

    it('DELETE /images/admin/:id returns 404 for non-existent', async () => {
      const res = await request(app).delete('/api/gallery/images/admin/99999').set(auth());
      expect(res.status).toBe(404);
    });

    it('DELETE /folders/admin/:id rejects folder with images', async () => {
      // Add image to folderId
      await request(app).post('/api/gallery/images/admin').set(auth())
        .send({ image_url: 'https://example.com/block.jpg', folder_id: folderId });
      const res = await request(app).delete(`/api/gallery/folders/admin/${folderId}`).set(auth());
      expect(res.status).toBe(400);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// MENU
// ════════════════════════════════════════════════════════════════════════════
describe('Menu /api/menu', () => {
  let createdId;

  it('GET / returns array (public)', async () => {
    const res = await request(app).get('/api/menu');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /admin/all requires auth', async () => {
    const res = await request(app).get('/api/menu/admin/all');
    expect(res.status).toBe(401);
  });

  it('GET /admin/all returns array with auth', async () => {
    const res = await request(app).get('/api/menu/admin/all').set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /admin validates required fields', async () => {
    const res = await request(app).post('/api/menu/admin').set(auth()).send({});
    expect(res.status).toBe(400);
  });

  it('POST /admin creates menu item', async () => {
    const res = await request(app).post('/api/menu/admin').set(auth())
      .send({ label_cz: 'Testovaci menu', link_type: 'internal', link_value: '/test', is_active: true });
    expect(res.status).toBe(201);
    expect(res.body.label_cz).toBe('Testovaci menu');
    createdId = res.body.id;
  });

  it('PUT /admin/:id updates menu item', async () => {
    const res = await request(app).put(`/api/menu/admin/${createdId}`).set(auth())
      .send({ label_cz: 'Updated menu', link_type: 'internal', link_value: '/updated', is_active: true });
    expect(res.status).toBe(200);
    expect(res.body.label_cz).toBe('Updated menu');
  });

  it('PUT /admin/:id returns 404 for non-existent', async () => {
    const res = await request(app).put('/api/menu/admin/99999').set(auth())
      .send({ label_cz: 'Ghost' });
    expect(res.status).toBe(404);
  });

  it('POST /admin/seed-defaults requires auth', async () => {
    const res = await request(app).post('/api/menu/admin/seed-defaults');
    expect(res.status).toBe(401);
  });

  it('POST /admin/seed-defaults seeds menu items', async () => {
    const res = await request(app).post('/api/menu/admin/seed-defaults').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.inserted).toBeDefined();
  });

  it('DELETE /admin/:id removes menu item', async () => {
    const res = await request(app).delete(`/api/menu/admin/${createdId}`).set(auth());
    expect(res.status).toBe(200);
  });

  it('DELETE /admin/:id returns 404 for non-existent', async () => {
    const res = await request(app).delete('/api/menu/admin/99999').set(auth());
    expect(res.status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// AUTH (basic smoke tests)
// ════════════════════════════════════════════════════════════════════════════
describe('Auth /api/auth', () => {
  it('POST /login with valid credentials returns token', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'admin@nicolet.cz', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('POST /login with wrong password returns 401', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'admin@nicolet.cz', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('POST /login with missing fields returns 400', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });

  it('GET /me returns user with valid token', async () => {
    const res = await request(app).get('/api/auth/me').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('admin@nicolet.cz');
  });

  it('GET /me returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
