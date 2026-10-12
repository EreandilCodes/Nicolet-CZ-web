/**
 * API tests for the dynamic navigation release:
 *
 *  1. GET /api/menu/product-tree — the Products menu hierarchy
 *     (top-level category → child category → instruments) computed from real
 *     content in batched queries, ordered authoritatively, published only.
 *
 *  2. menu_items.entity_type / entity_id — the stable entity reference a menu
 *     item keeps instead of relying on a label/slug.
 */
import '../setup.js';

import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';

import { initDatabase } from '../../backend/database.js';
import authRoutes from '../../backend/routes/auth.js';
import menuRoutes from '../../backend/routes/menu.js';
import productsRoutes, { categoriesRouter } from '../../backend/routes/products.js';

let app;
let token;
let rootId;
let childId;
const products = {};

const auth = () => ({ Authorization: `Bearer ${token}` });

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
  app.use('/api/menu', menuRoutes);
  app.use('/api/products', productsRoutes);
  app.use('/api/product-categories', categoriesRouter);

  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@nicolet.cz', password: 'admin123' });
  token = login.body.token;
  expect(token).toBeTruthy();

  rootId = await createCategory({ name_cz: 'FT-IR', slug: 'tree-ftir', is_active: true });
  childId = await createCategory({ name_cz: 'Spektrometry', slug: 'tree-spectro', parent_id: rootId, is_active: true });

  products.b = await createProduct({ name_cz: 'B', slug: 'tree-b', display_order: 1, is_published: true, category_ids: [childId] });
  products.a = await createProduct({ name_cz: 'A', slug: 'tree-a', display_order: 2, is_published: true, category_ids: [childId] });
  products.hidden = await createProduct({ name_cz: 'Hidden', slug: 'tree-hidden', display_order: 0, is_published: false, category_ids: [childId] });
}, 30000);

describe('GET /api/menu/product-tree', () => {
  it('nests child categories under their root and lists published instruments in order', async () => {
    const res = await request(app).get('/api/menu/product-tree');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const root = res.body.find(r => r.id === rootId);
    expect(root).toBeTruthy();

    const child = (root.children || []).find(c => c.id === childId);
    expect(child).toBeTruthy();

    const ids = child.products.map(p => p.id);
    expect(ids).toEqual([products.b, products.a]);          // display_order 1, then 2
    expect(ids).not.toContain(products.hidden);              // unpublished never appears
  });

  it('reflects the per-category product order saved in Admin UI → Products', async () => {
    const put = await request(app)
      .put(`/api/products/admin/category/${childId}/order`)
      .set(auth())
      .send({ product_ids: [products.a, products.b] });
    expect(put.status).toBe(200);

    const res = await request(app).get('/api/menu/product-tree');
    const child = res.body.find(r => r.id === rootId).children.find(c => c.id === childId);
    expect(child.products.map(p => p.id)).toEqual([products.a, products.b]);

    // restore
    await request(app)
      .put(`/api/products/admin/category/${childId}/order`)
      .set(auth())
      .send({ product_ids: [products.b, products.a] });
  });
});

describe('menu_items stable entity reference', () => {
  it('persists a valid entity_type + entity_id', async () => {
    const res = await request(app)
      .post('/api/menu/admin')
      .set(auth())
      .send({
        label_cz: 'FT-IR',
        link_type: 'category',
        link_value: '/produkty?kategorie=tree-ftir',
        entity_type: 'product_category',
        entity_id: rootId,
      });
    expect(res.status).toBe(201);
    expect(res.body.entity_type).toBe('product_category');
    expect(res.body.entity_id).toBe(rootId);
  });

  it('drops an unknown entity_type and a non-numeric entity_id', async () => {
    const badType = await request(app)
      .post('/api/menu/admin')
      .set(auth())
      .send({ label_cz: 'X', entity_type: 'bogus', entity_id: rootId });
    expect(badType.status).toBe(201);
    expect(badType.body.entity_type).toBeNull();
    expect(badType.body.entity_id).toBeNull();

    const badId = await request(app)
      .post('/api/menu/admin')
      .set(auth())
      .send({ label_cz: 'Y', entity_type: 'product', entity_id: 'not-a-number' });
    expect(badId.status).toBe(201);
    expect(badId.body.entity_type).toBeNull();
    expect(badId.body.entity_id).toBeNull();
  });
});
