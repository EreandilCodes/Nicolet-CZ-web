import express from 'express';
import db from '../database.js';
import { AuthMiddleware } from '../middleware/auth.js';

const router = express.Router();
export const categoriesRouter = express.Router();

function generateSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + `-${Date.now()}`;
}

// Batch-load categories and applications for a list of products (3 queries total)
async function batchAttachRelations(products) {
  if (!products.length) return products;
  const ids = products.map(p => p.id);
  const ph = ids.map(() => '?').join(',');

  const catRows = await db.prepare(`
    SELECT m.product_id, pc.id, pc.slug, pc.name_cz, pc.name_en, pc.display_order, pc.parent_id, pc.is_active
    FROM product_categories pc
    JOIN product_categories_map m ON m.category_id = pc.id
    WHERE m.product_id IN (${ph})
    ORDER BY pc.display_order, pc.id
  `).all(...ids);

  const appRows = await db.prepare(`
    SELECT m.product_id, a.id, a.slug, a.name_cz, a.name_en
    FROM applications a
    JOIN product_applications_map m ON m.application_id = a.id
    WHERE m.product_id IN (${ph})
    ORDER BY a.display_order, a.id
  `).all(...ids);

  const catsByProduct = {};
  const appsByProduct = {};
  for (const row of catRows) {
    const { product_id, ...cat } = row;
    (catsByProduct[product_id] ||= []).push(cat);
  }
  for (const row of appRows) {
    const { product_id, ...app } = row;
    (appsByProduct[product_id] ||= []).push(app);
  }

  return products.map(p => ({
    ...p,
    categories:   catsByProduct[p.id] || [],
    applications: appsByProduct[p.id] || [],
  }));
}

async function getProductCategories(productId) {
  return db.prepare(`
    SELECT pc.* FROM product_categories pc
    JOIN product_categories_map m ON m.category_id = pc.id
    WHERE m.product_id = ?
    ORDER BY pc.display_order, pc.id
  `).all(productId);
}

async function getProductApplications(productId) {
  return db.prepare(`
    SELECT a.id, a.slug, a.name_cz, a.name_en FROM applications a
    JOIN product_applications_map m ON m.application_id = a.id
    WHERE m.product_id = ?
    ORDER BY a.display_order, a.id
  `).all(productId);
}

async function syncProductApplications(productId, applicationIds) {
  await db.prepare('DELETE FROM product_applications_map WHERE product_id = ?').run(productId);
  if (!Array.isArray(applicationIds)) return;
  for (const appId of applicationIds) {
    try {
      await db.prepare('INSERT INTO product_applications_map (product_id, application_id) VALUES (?, ?) ON CONFLICT DO NOTHING').run(productId, appId);
    } catch { /* ignore */ }
  }
}

// ─── Product Category routes (mounted at /api/product-categories) ─────────────

// GET /api/product-categories – public, all active categories
categoriesRouter.get('/', async (req, res) => {
  try {
    const rows = await db.prepare(
      'SELECT * FROM product_categories WHERE is_active = 1 ORDER BY display_order, id'
    ).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// GET /api/product-categories/admin/all – admin
categoriesRouter.get('/admin/all', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const rows = await db.prepare(
      'SELECT * FROM product_categories ORDER BY display_order, id'
    ).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// POST /api/product-categories/admin – admin, create category
categoriesRouter.post('/admin', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { parent_id, name_cz, name_en, slug: slugInput, display_order, is_active } = req.body;
    if (!name_cz?.trim()) return res.status(400).json({ error: 'name_cz je povinné' });

    const slug = slugInput?.trim() ? slugInput.trim() : generateSlug(name_cz.trim());

    const result = await db.prepare(`
      INSERT INTO product_categories (parent_id, name_cz, name_en, slug, display_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      parent_id || null,
      name_cz.trim(),
      name_en?.trim() || null,
      slug,
      Number(display_order) || 0,
      is_active != null ? (is_active ? 1 : 0) : 1
    );

    const created = await db.prepare('SELECT * FROM product_categories WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    console.error('ProductCategories POST error:', err);
    if (err.message?.includes('UNIQUE')) return res.status(400).json({ error: 'Slug již existuje' });
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// PUT /api/product-categories/admin/:id – admin, update category
categoriesRouter.put('/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { parent_id, name_cz, name_en, slug, display_order, is_active } = req.body;
    if (!name_cz?.trim()) return res.status(400).json({ error: 'name_cz je povinné' });
    if (!slug?.trim()) return res.status(400).json({ error: 'slug je povinné' });

    const result = await db.prepare(`
      UPDATE product_categories
      SET parent_id = ?, name_cz = ?, name_en = ?, slug = ?, display_order = ?, is_active = ?
      WHERE id = ?
    `).run(
      parent_id || null,
      name_cz.trim(),
      name_en?.trim() || null,
      slug.trim(),
      Number(display_order) || 0,
      is_active != null ? (is_active ? 1 : 0) : 1,
      id
    );

    if (result.changes === 0) return res.status(404).json({ error: 'Kategorie nenalezena' });
    const updated = await db.prepare('SELECT * FROM product_categories WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error('ProductCategories PUT error:', err);
    if (err.message?.includes('UNIQUE')) return res.status(400).json({ error: 'Slug již existuje' });
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// DELETE /api/product-categories/admin/:id – admin, delete category
categoriesRouter.delete('/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.prepare('DELETE FROM product_categories WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Kategorie nenalezena' });
    res.json({ message: 'Kategorie smazána' });
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// ─── Product routes (mounted at /api/products) ────────────────────────────────

// GET /api/products – public, published products with categories
router.get('/', async (req, res) => {
  try {
    // ?fields=list returns lightweight payload for list views (no spec, no SEO, truncated desc)
    const listMode = req.query.fields === 'list';
    const cols = listMode
      ? 'id, slug, name_cz, name_en, thumbnail_url, images_json, is_featured, display_order, SUBSTR(description_cz, 1, 300) AS description_cz, SUBSTR(description_en, 1, 300) AS description_en'
      : '*';
    const products = await db.prepare(
      `SELECT ${cols} FROM products WHERE is_published = 1 ORDER BY display_order, id`
    ).all();

    const result = await batchAttachRelations(products);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// GET /api/products/admin/all – admin, all products
// NOTE: must be defined before /:slug
router.get('/admin/all', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const products = await db.prepare(
      'SELECT * FROM products ORDER BY display_order, id'
    ).all();

    const result = await batchAttachRelations(products);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// GET /api/products/:slug – public, single product with categories
router.get('/:slug', async (req, res) => {
  try {
    const product = await db.prepare(
      'SELECT * FROM products WHERE slug = ? AND is_published = 1'
    ).get(req.params.slug);
    if (!product) return res.status(404).json({ error: 'Produkt nenalezen' });

    product.categories    = await getProductCategories(product.id);
    product.applications  = await getProductApplications(product.id);
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// POST /api/products/admin – admin, create product
router.post('/admin', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const {
      slug: slugInput, name_cz, name_en, description_cz, description_en,
      spec_cz, spec_en, images_json, thumbnail_url, is_published, is_featured, display_order,
      seo_title_cz, seo_title_en, seo_desc_cz, seo_desc_en,
      category_ids, application_ids
    } = req.body;

    if (!name_cz?.trim()) return res.status(400).json({ error: 'name_cz je povinné' });

    const slug = slugInput?.trim() ? slugInput.trim() : generateSlug(name_cz.trim());

    const result = await db.prepare(`
      INSERT INTO products (slug, name_cz, name_en, description_cz, description_en,
        spec_cz, spec_en, images_json, thumbnail_url, is_published, is_featured, display_order,
        seo_title_cz, seo_title_en, seo_desc_cz, seo_desc_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      slug,
      name_cz.trim(),
      name_en?.trim() || null,
      description_cz?.trim() || null,
      description_en?.trim() || null,
      spec_cz?.trim() || null,
      spec_en?.trim() || null,
      images_json || '[]',
      thumbnail_url?.trim() || null,
      is_published ? 1 : 0,
      is_featured ? 1 : 0,
      Number(display_order) || 0,
      seo_title_cz?.trim() || null,
      seo_title_en?.trim() || null,
      seo_desc_cz?.trim() || null,
      seo_desc_en?.trim() || null
    );

    const productId = result.lastInsertRowid;

    if (Array.isArray(category_ids) && category_ids.length > 0) {
      for (const catId of category_ids) {
        try {
          await db.prepare('INSERT INTO product_categories_map (product_id, category_id) VALUES (?, ?) ON CONFLICT DO NOTHING').run(productId, catId);
        } catch (e) { /* ignore */ }
      }
    }

    await syncProductApplications(productId, application_ids);

    const created = await db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    created.categories   = await getProductCategories(productId);
    created.applications = await getProductApplications(productId);
    res.status(201).json(created);
  } catch (err) {
    console.error('Products POST error:', err);
    if (err.message?.includes('UNIQUE')) return res.status(400).json({ error: 'Slug již existuje' });
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// PUT /api/products/admin/:id – admin, update product
router.put('/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      slug, name_cz, name_en, description_cz, description_en,
      spec_cz, spec_en, images_json, thumbnail_url, is_published, is_featured, display_order,
      seo_title_cz, seo_title_en, seo_desc_cz, seo_desc_en,
      category_ids, application_ids
    } = req.body;

    if (!name_cz?.trim()) return res.status(400).json({ error: 'name_cz je povinné' });
    if (!slug?.trim()) return res.status(400).json({ error: 'slug je povinné' });

    const result = await db.prepare(`
      UPDATE products
      SET slug = ?, name_cz = ?, name_en = ?, description_cz = ?, description_en = ?,
          spec_cz = ?, spec_en = ?, images_json = ?, thumbnail_url = ?,
          is_published = ?, is_featured = ?,
          display_order = ?, seo_title_cz = ?, seo_title_en = ?, seo_desc_cz = ?, seo_desc_en = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      slug.trim(),
      name_cz.trim(),
      name_en?.trim() || null,
      description_cz?.trim() || null,
      description_en?.trim() || null,
      spec_cz?.trim() || null,
      spec_en?.trim() || null,
      images_json || '[]',
      thumbnail_url?.trim() || null,
      is_published ? 1 : 0,
      is_featured ? 1 : 0,
      Number(display_order) || 0,
      seo_title_cz?.trim() || null,
      seo_title_en?.trim() || null,
      seo_desc_cz?.trim() || null,
      seo_desc_en?.trim() || null,
      id
    );

    if (result.changes === 0) return res.status(404).json({ error: 'Produkt nenalezen' });

    if (Array.isArray(category_ids)) {
      await db.prepare('DELETE FROM product_categories_map WHERE product_id = ?').run(id);
      for (const catId of category_ids) {
        try {
          await db.prepare('INSERT INTO product_categories_map (product_id, category_id) VALUES (?, ?) ON CONFLICT DO NOTHING').run(id, catId);
        } catch (e) { /* ignore */ }
      }
    }

    await syncProductApplications(id, application_ids);

    const updated = await db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    updated.categories   = await getProductCategories(id);
    updated.applications = await getProductApplications(id);
    res.json(updated);
  } catch (err) {
    console.error('Products PUT error:', err);
    if (err.message?.includes('UNIQUE')) return res.status(400).json({ error: 'Slug již existuje' });
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// DELETE /api/products/admin/:id – admin, delete product
router.delete('/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.prepare('DELETE FROM products WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Produkt nenalezen' });
    res.json({ message: 'Produkt smazán' });
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

export default router;
