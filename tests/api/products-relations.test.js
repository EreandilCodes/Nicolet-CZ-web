/**
 * Test for Products categories and applications relations bug.
 * This test verifies that category_ids and application_ids are properly saved and returned.
 */
import '../setup.js';

import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';

import { initDatabase } from '../../backend/database.js';

import authRoutes from '../../backend/routes/auth.js';
import productsRoutes, { categoriesRouter } from '../../backend/routes/products.js';
import applicationsRoutes, { groupsRouter } from '../../backend/routes/applications.js';

let app;
let token;

beforeAll(async () => {
  await initDatabase();

  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use('/api/auth', authRoutes);
  app.use('/api/products', productsRoutes);
  app.use('/api/product-categories', categoriesRouter);
  app.use('/api/applications', applicationsRoutes);
  app.use('/api/application-groups', groupsRouter);

  // Login to get auth token
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@nicolet.cz', password: 'admin123' });
  token = res.body.token;
  expect(token).toBeTruthy();
}, 30000);

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('Products Categories and Applications Relations', () => {
  it('BUG: should save and retrieve categories and applications when updating a product', async () => {
    // Step 1: Create a product category
    const catRes = await request(app)
      .post('/api/product-categories/admin')
      .set(auth())
      .send({ name_cz: 'Test Category', slug: 'test-category', is_active: true });
    expect(catRes.status).toBe(201);
    const categoryId = catRes.body.id;

    // Step 2: Create an application group and application
    const groupRes = await request(app)
      .post('/api/application-groups/admin')
      .set(auth())
      .send({ name_cz: 'Test Group', slug: 'test-group', is_active: true });
    expect(groupRes.status).toBe(201);
    const groupId = groupRes.body.id;

    const appRes = await request(app)
      .post('/api/applications/admin')
      .set(auth())
      .send({
        name_cz: 'Test Application',
        slug: 'test-application',
        group_id: groupId,
        is_published: true
      });
    expect(appRes.status).toBe(201);
    const applicationId = appRes.body.id;

    // Step 3: Create a product
    const productRes = await request(app)
      .post('/api/products/admin')
      .set(auth())
      .send({
        name_cz: 'Test Product',
        slug: 'test-product',
        is_published: true
      });
    expect(productRes.status).toBe(201);
    const productId = productRes.body.id;

    // Step 4: Update the product with categories and applications (THIS IS THE BUG SCENARIO)
    const updateRes = await request(app)
      .put(`/api/products/admin/${productId}`)
      .set(auth())
      .send({
        name_cz: 'Test Product Updated',
        slug: 'test-product',
        is_published: true,
        category_ids: [categoryId],
        application_ids: [applicationId]
      });

    expect(updateRes.status).toBe(200);
    
    // Verify the PUT response includes the relations
    expect(updateRes.body.categories).toBeDefined();
    expect(updateRes.body.categories.length).toBe(1);
    expect(updateRes.body.categories[0].id).toBe(categoryId);
    
    expect(updateRes.body.applications).toBeDefined();
    expect(updateRes.body.applications.length).toBe(1);
    expect(updateRes.body.applications[0].id).toBe(applicationId);

    // Step 5: Reload all products (simulates what loadItems() does)
    const allProductsRes = await request(app)
      .get('/api/products/admin/all')
      .set(auth());
    
    expect(allProductsRes.status).toBe(200);
    const product = allProductsRes.body.find(p => p.id === productId);
    
    // THIS IS THE BUG: categories and applications should be present but might be missing
    expect(product).toBeDefined();
    expect(product.categories).toBeDefined();
    expect(product.categories.length).toBe(1);
    expect(product.categories[0].id).toBe(categoryId);
    
    expect(product.applications).toBeDefined();
    expect(product.applications.length).toBe(1);
    expect(product.applications[0].id).toBe(applicationId);

    // Step 6: Verify individual product endpoint also returns relations
    const singleProductRes = await request(app)
      .get(`/api/products/${product.slug}`)
      .set(auth());
    
    expect(singleProductRes.status).toBe(200);
    expect(singleProductRes.body.categories).toBeDefined();
    expect(singleProductRes.body.categories.length).toBe(1);
    expect(singleProductRes.body.applications).toBeDefined();
    expect(singleProductRes.body.applications.length).toBe(1);
  });

  it('should handle clearing all relations (empty arrays)', async () => {
    // Create minimal data
    const catRes = await request(app)
      .post('/api/product-categories/admin')
      .set(auth())
      .send({ name_cz: 'Temp Category', slug: 'temp-category', is_active: true });
    const categoryId = catRes.body.id;

    const productRes = await request(app)
      .post('/api/products/admin')
      .set(auth())
      .send({ name_cz: 'Temp Product', slug: 'temp-product', is_published: true, category_ids: [categoryId] });
    const productId = productRes.body.id;

    // Verify it was created with category
    expect(productRes.body.categories.length).toBe(1);

    // Update with empty arrays
    const updateRes = await request(app)
      .put(`/api/products/admin/${productId}`)
      .set(auth())
      .send({
        name_cz: 'Temp Product',
        slug: 'temp-product',
        is_published: true,
        category_ids: [],
        application_ids: []
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.categories.length).toBe(0);
    expect(updateRes.body.applications.length).toBe(0);
  });

  it('should handle undefined category_ids and application_ids (no change)', async () => {
    // Create product
    const productRes = await request(app)
      .post('/api/products/admin')
      .set(auth())
      .send({ name_cz: 'No Relations Product', slug: 'no-relations-product', is_published: true });
    const productId = productRes.body.id;

    // Update without sending category_ids or application_ids
    const updateRes = await request(app)
      .put(`/api/products/admin/${productId}`)
      .set(auth())
      .send({
        name_cz: 'No Relations Product Updated',
        slug: 'no-relations-product',
        is_published: true
        // Note: no category_ids or application_ids
      });

    expect(updateRes.status).toBe(200);
    // Relations should remain empty (as they were)
    expect(updateRes.body.categories).toBeDefined();
    expect(updateRes.body.applications).toBeDefined();
  });
});
