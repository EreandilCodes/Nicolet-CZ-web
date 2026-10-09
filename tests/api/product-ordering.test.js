/**
 * API tests for per-category product ordering (Admin UI → Products).
 *
 * The position is stored per (product, category) pair in
 * product_categories_map.display_order, so a product that lives in several
 * categories has an independent position in each. The endpoint must:
 *   - require an admin token,
 *   - reject ids that do not belong to the selected category,
 *   - reject duplicates,
 *   - keep the fallback for products omitted from the request,
 *   - persist a deterministic sequence that a fresh GET returns unchanged.
 */
import '../setup.js';

import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';

import { initDatabase } from '../../backend/database.js';
import authRoutes from '../../backend/routes/auth.js';
import productsRoutes, { categoriesRouter } from '../../backend/routes/products.js';
import { orderProductsForCategory } from '../../frontend/js/product-order.js';

let app;
let token;
let rootId;
let childId;
let otherChildId;
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

const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  await initDatabase();

  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api/products', productsRoutes);
  app.use('/api/product-categories', categoriesRouter);

  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@nicolet.cz', password: 'admin123' });
  token = login.body.token;
  expect(token).toBeTruthy();

  rootId = await createCategory({ name_cz: 'Root', slug: 'order-root', is_active: true });
  childId = await createCategory({ name_cz: 'Child', slug: 'order-child', parent_id: rootId, is_active: true });
  otherChildId = await createCategory({ name_cz: 'Other', slug: 'order-other', parent_id: rootId, is_active: true });

  products.a = await createProduct({ name_cz: 'A', slug: 'order-a', is_published: true, category_ids: [childId] });
  products.b = await createProduct({ name_cz: 'B', slug: 'order-b', is_published: true, category_ids: [childId] });
  products.c = await createProduct({ name_cz: 'C', slug: 'order-c', is_published: true, category_ids: [childId] });
  products.outsider = await createProduct({ name_cz: 'Outsider', slug: 'order-outsider', is_published: true, category_ids: [otherChildId] });
}, 30000);

describe('GET /api/products/admin/category/:id', () => {
  it('requires authentication', async () => {
    const res = await request(app).get(`/api/products/admin/category/${childId}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for an unknown category', async () => {
    const res = await request(app).get('/api/products/admin/category/999999').set(auth());
    expect(res.status).toBe(404);
  });

  it('returns the category and its products', async () => {
    const res = await request(app).get(`/api/products/admin/category/${childId}`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.category.id).toBe(childId);
    expect(res.body.products.map(p => p.id).sort()).toEqual(
      [products.a, products.b, products.c].sort()
    );
    // Nothing configured yet → the fallback marker is null.
    expect(res.body.products.every(p => p.order_in_category == null)).toBe(true);
  });
});

describe('PUT /api/products/admin/category/:id/order', () => {
  it('persists the submitted sequence', async () => {
    const desired = [products.c, products.a, products.b];
    const put = await request(app)
      .put(`/api/products/admin/category/${childId}/order`)
      .set(auth())
      .send({ product_ids: desired });
    expect(put.status).toBe(200);

    const get = await request(app).get(`/api/products/admin/category/${childId}`).set(auth());
    expect(get.body.products.map(p => p.id)).toEqual(desired);
    expect(get.body.products.map(p => p.order_in_category)).toEqual([1, 2, 3]);
  });

  it('exposes order_in_category through the product relations', async () => {
    const res = await request(app).get('/api/products/admin/all').set(auth());
    const product = res.body.find(p => p.id === products.c);
    const relation = product.categories.find(c => c.id === childId);
    expect(relation.order_in_category).toBe(1);
  });

  it('rejects a product that does not belong to the category', async () => {
    const res = await request(app)
      .put(`/api/products/admin/category/${childId}/order`)
      .set(auth())
      .send({ product_ids: [products.c, products.outsider] });
    expect(res.status).toBe(400);
    expect(res.body.invalid_ids).toContain(products.outsider);
  });

  it('rejects duplicates', async () => {
    const res = await request(app)
      .put(`/api/products/admin/category/${childId}/order`)
      .set(auth())
      .send({ product_ids: [products.a, products.a] });
    expect(res.status).toBe(400);
  });

  it('rejects a non-array payload', async () => {
    const res = await request(app)
      .put(`/api/products/admin/category/${childId}/order`)
      .set(auth())
      .send({ product_ids: 'nope' });
    expect(res.status).toBe(400);
  });

  it('keeps products omitted from the request (fallback, never dropped)', async () => {
    // Send only C; A and B are not in the request and must still be listed.
    const res = await request(app)
      .put(`/api/products/admin/category/${childId}/order`)
      .set(auth())
      .send({ product_ids: [products.c] });
    expect(res.status).toBe(200);
    expect(res.body.products.map(p => p.id)).toContain(products.a);
    expect(res.body.products.map(p => p.id)).toContain(products.b);
    expect(res.body.products[0].id).toBe(products.c);
    expect(res.body.products[0].order_in_category).toBe(1);
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .put(`/api/products/admin/category/${childId}/order`)
      .send({ product_ids: [products.a] });
    expect(res.status).toBe(401);
  });
});

describe('public list + shared orderer', () => {
  it('reproduces the saved category sequence', async () => {
    const desired = [products.c, products.a, products.b];
    await request(app)
      .put(`/api/products/admin/category/${childId}/order`)
      .set(auth())
      .send({ product_ids: desired });

    const catsRes = await request(app).get('/api/product-categories');
    const listRes = await request(app).get('/api/products?fields=list');
    expect(catsRes.status).toBe(200);
    expect(listRes.status).toBe(200);

    const ordered = orderProductsForCategory(listRes.body, catsRes.body, childId);
    expect(ordered.map(p => p.id)).toEqual(desired);
  });
});
