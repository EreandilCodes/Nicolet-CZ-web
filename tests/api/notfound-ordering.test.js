/**
 * API tests for two releases:
 *
 *  1. The authoritative catalogue order endpoint used by Application pages
 *     (GET /api/products/order) — one shared orderer, published only.
 *
 *  2. The managed 404 page (GET /api/pages/notfound) and its associated
 *     instruments (GET/PUT /api/pages/admin/:id/products), which back the
 *     Admin UI → Pages → Speciální stránky editor and the public 404 view.
 */
import '../setup.js';

import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';

import { initDatabase } from '../../backend/database.js';
import authRoutes from '../../backend/routes/auth.js';
import pagesRoutes from '../../backend/routes/pages.js';
import productsRoutes, { categoriesRouter } from '../../backend/routes/products.js';

let app;
let token;
let childId;
let notFoundPageId;

const auth = () => ({ Authorization: `Bearer ${token}` });
const products = {};

async function createCategory(body) {
  const res = await request(app).post('/api/product-categories/admin').set(auth()).send(body);
  expect(res.status).toBe(201);
  return res.body.id;
}

async function createProduct(body) {
  const res = await request(app).post('/api/products/admin').set(auth()).send(body);
  expect(res.status).toBe(201);
  return res.body.id;
}

beforeAll(async () => {
  await initDatabase();

  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api/pages', pagesRoutes);
  app.use('/api/products', productsRoutes);
  app.use('/api/product-categories', categoriesRouter);

  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@nicolet.cz', password: 'admin123' });
  token = login.body.token;
  expect(token).toBeTruthy();

  const rootId = await createCategory({ name_cz: 'Root', slug: 'nf-root', is_active: true });
  childId = await createCategory({ name_cz: 'Child', slug: 'nf-child', parent_id: rootId, is_active: true });

  products.a = await createProduct({ name_cz: 'A', slug: 'nf-a', is_published: true, category_ids: [childId] });
  products.b = await createProduct({ name_cz: 'B', slug: 'nf-b', is_published: true, category_ids: [childId] });
  products.hidden = await createProduct({ name_cz: 'Hidden', slug: 'nf-hidden', is_published: false, category_ids: [childId] });

  const pagesRes = await request(app).get('/api/pages/admin/all').set(auth());
  const nf = pagesRes.body.find(p => p.slug === '404');
  expect(nf, 'the reserved 404 page must be seeded by initDatabase()').toBeTruthy();
  notFoundPageId = nf.id;
}, 30000);

describe('GET /api/products/order', () => {
  it('returns published ids in the authoritative order and hides unpublished', async () => {
    const put = await request(app)
      .put(`/api/products/admin/category/${childId}/order`)
      .set(auth())
      .send({ product_ids: [products.b, products.a] });
    expect(put.status).toBe(200);

    const res = await request(app).get('/api/products/order');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.ids)).toBe(true);

    const relevant = res.body.ids.filter(id => [products.a, products.b, products.hidden].includes(id));
    expect(relevant).toEqual([products.b, products.a]);
    expect(res.body.ids).not.toContain(products.hidden);
  });
});

describe('GET /api/pages/notfound', () => {
  it('returns the managed 404 page (public)', async () => {
    const res = await request(app).get('/api/pages/notfound');
    expect(res.status).toBe(200);
    expect(res.body.page).toBeTruthy();
    expect(res.body.page.slug).toBe('404');
    expect(Array.isArray(res.body.products)).toBe(true);
  });
});

describe('page associated products (404 editor)', () => {
  it('requires authentication', async () => {
    const res = await request(app).get(`/api/pages/admin/${notFoundPageId}/products`);
    expect(res.status).toBe(401);
  });

  it('persists an ordered selection and exposes it publicly (published only)', async () => {
    const put = await request(app)
      .put(`/api/pages/admin/${notFoundPageId}/products`)
      .set(auth())
      .send({ product_ids: [products.b, products.a, products.hidden] });
    expect(put.status).toBe(200);

    const publicRes = await request(app).get('/api/pages/notfound');
    expect(publicRes.body.products.map(p => p.id)).toEqual([products.b, products.a]);

    const reorder = await request(app)
      .put(`/api/pages/admin/${notFoundPageId}/products`)
      .set(auth())
      .send({ product_ids: [products.a, products.b] });
    expect(reorder.status).toBe(200);
    expect(reorder.body.map(p => p.id)).toEqual([products.a, products.b]);
  });

  it('rejects an unknown product id', async () => {
    const res = await request(app)
      .put(`/api/pages/admin/${notFoundPageId}/products`)
      .set(auth())
      .send({ product_ids: [products.a, 999999] });
    expect(res.status).toBe(400);
    expect(res.body.invalid_ids).toContain(999999);
  });

  it('rejects duplicates and non-arrays', async () => {
    const dup = await request(app)
      .put(`/api/pages/admin/${notFoundPageId}/products`)
      .set(auth())
      .send({ product_ids: [products.a, products.a] });
    expect(dup.status).toBe(400);

    const notArray = await request(app)
      .put(`/api/pages/admin/${notFoundPageId}/products`)
      .set(auth())
      .send({ product_ids: 'nope' });
    expect(notArray.status).toBe(400);
  });

  it('returns 404 for an unknown page', async () => {
    const res = await request(app)
      .put('/api/pages/admin/999999/products')
      .set(auth())
      .send({ product_ids: [] });
    expect(res.status).toBe(404);
  });
});
