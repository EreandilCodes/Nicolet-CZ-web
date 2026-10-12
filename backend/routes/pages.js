import express from 'express';
import db from '../database.js';
import { AuthMiddleware } from '../middleware/auth.js';

const router = express.Router();

function generateSlug(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + `-${Date.now()}`;
}

// ── Managed 404 page ─────────────────────────────────────────────────────────
const NOT_FOUND_SLUG = '404';

/** Associated instruments of a page, in the saved order. */
async function getPageProducts(pageId, publishedOnly = true) {
  const where = publishedOnly ? 'AND p.is_published = 1' : '';
  return db.prepare(`
    SELECT p.id, p.slug, p.name_cz, p.name_en, p.thumbnail_url, m.display_order
    FROM products p
    JOIN page_products_map m ON m.product_id = p.id
    WHERE m.page_id = ? ${where}
    ORDER BY CASE WHEN m.display_order IS NULL THEN 1 ELSE 0 END,
             m.display_order, p.display_order, p.id
  `).all(pageId);
}

// GET /api/pages – public, published pages
router.get('/', async (req, res) => {
  try {
    const rows = await db.prepare(
      'SELECT * FROM pages WHERE is_published = 1 ORDER BY display_order, id'
    ).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// GET /api/pages/admin/all – admin, all pages
// NOTE: must be defined before /:slug
router.get('/admin/all', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const rows = await db.prepare(
      'SELECT * FROM pages ORDER BY display_order, id'
    ).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// GET /api/pages/notfound – public, the managed 404 message + associated
// published instruments. Defined before /:slug so "notfound" is a route, not a
// page lookup. The page itself is the reserved slug `404`.
router.get('/notfound', async (req, res) => {
  try {
    const page = await db.prepare(
      'SELECT * FROM pages WHERE slug = ? AND is_published = 1'
    ).get(NOT_FOUND_SLUG);
    if (!page) return res.json({ page: null, products: [] });
    const products = await getPageProducts(page.id, true);
    res.json({ page, products });
  } catch (err) {
    console.error('NotFound GET error:', err);
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// GET /api/pages/:slug – public, single published page
router.get('/:slug', async (req, res) => {
  try {
    const row = await db.prepare(
      'SELECT * FROM pages WHERE slug = ? AND is_published = 1'
    ).get(req.params.slug);
    if (!row) return res.status(404).json({ error: 'Stránka nenalezena' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// POST /api/pages/admin – admin, create page
router.post('/admin', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const {
      slug: slugInput, title_cz, title_en, content_cz, content_en,
      excerpt_cz, excerpt_en, cover_image,
      seo_title_cz, seo_title_en, seo_desc_cz, seo_desc_en,
      is_published, display_order
    } = req.body;

    if (!title_cz?.trim()) return res.status(400).json({ error: 'title_cz je povinné' });

    const slug = slugInput?.trim() ? slugInput.trim() : generateSlug(title_cz.trim());

    const result = await db.prepare(`
      INSERT INTO pages (slug, title_cz, title_en, content_cz, content_en,
        excerpt_cz, excerpt_en, cover_image, seo_title_cz, seo_title_en, seo_desc_cz, seo_desc_en,
        is_published, display_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      slug,
      title_cz.trim(),
      title_en?.trim() || null,
      content_cz?.trim() || null,
      content_en?.trim() || null,
      excerpt_cz?.trim() || null,
      excerpt_en?.trim() || null,
      cover_image?.trim() || null,
      seo_title_cz?.trim() || null,
      seo_title_en?.trim() || null,
      seo_desc_cz?.trim() || null,
      seo_desc_en?.trim() || null,
      is_published ? 1 : 0,
      Number(display_order) || 0
    );

    const created = await db.prepare('SELECT * FROM pages WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    console.error('Pages POST error:', err);
    if (err.message?.includes('UNIQUE')) return res.status(400).json({ error: 'Slug již existuje' });
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// PUT /api/pages/admin/:id – admin, update page
router.put('/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      slug, title_cz, title_en, content_cz, content_en,
      excerpt_cz, excerpt_en, cover_image,
      seo_title_cz, seo_title_en, seo_desc_cz, seo_desc_en,
      is_published, display_order
    } = req.body;

    if (!title_cz?.trim()) return res.status(400).json({ error: 'title_cz je povinné' });
    if (!slug?.trim()) return res.status(400).json({ error: 'slug je povinné' });

    const result = await db.prepare(`
      UPDATE pages
      SET slug = ?, title_cz = ?, title_en = ?, content_cz = ?, content_en = ?,
          excerpt_cz = ?, excerpt_en = ?, cover_image = ?,
          seo_title_cz = ?, seo_title_en = ?, seo_desc_cz = ?, seo_desc_en = ?,
          is_published = ?, display_order = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      slug.trim(),
      title_cz.trim(),
      title_en?.trim() || null,
      content_cz?.trim() || null,
      content_en?.trim() || null,
      excerpt_cz?.trim() || null,
      excerpt_en?.trim() || null,
      cover_image?.trim() || null,
      seo_title_cz?.trim() || null,
      seo_title_en?.trim() || null,
      seo_desc_cz?.trim() || null,
      seo_desc_en?.trim() || null,
      is_published ? 1 : 0,
      Number(display_order) || 0,
      id
    );

    if (result.changes === 0) return res.status(404).json({ error: 'Stránka nenalezena' });
    const updated = await db.prepare('SELECT * FROM pages WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error('Pages PUT error:', err);
    if (err.message?.includes('UNIQUE')) return res.status(400).json({ error: 'Slug již existuje' });
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// GET /api/pages/admin/:id/products – admin, associated instruments (any state)
router.get('/admin/:id/products', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const page = await db.prepare('SELECT id FROM pages WHERE id = ?').get(id);
    if (!page) return res.status(404).json({ error: 'Stránka nenalezena' });
    res.json(await getPageProducts(id, false));
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// PUT /api/pages/admin/:id/products – admin, persist the complete ordered list.
// Every id must reference an existing product; the list is the full desired
// sequence, so reordering is deterministic.
router.put('/admin/:id/products', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const raw = req.body?.product_ids;
    if (!Array.isArray(raw)) return res.status(400).json({ error: 'product_ids musí být pole' });
    const productIds = raw.map(Number);
    if (productIds.some(n => !Number.isInteger(n))) {
      return res.status(400).json({ error: 'product_ids obsahuje neplatné ID' });
    }
    if (new Set(productIds).size !== productIds.length) {
      return res.status(400).json({ error: 'product_ids obsahuje duplicity' });
    }

    const page = await db.prepare('SELECT id FROM pages WHERE id = ?').get(id);
    if (!page) return res.status(404).json({ error: 'Stránka nenalezena' });

    if (productIds.length) {
      const ph = productIds.map(() => '?').join(',');
      const found = await db.prepare(`SELECT id FROM products WHERE id IN (${ph})`).all(...productIds);
      const foundSet = new Set(found.map(r => Number(r.id)));
      const missing = productIds.filter(pid => !foundSet.has(pid));
      if (missing.length) {
        return res.status(400).json({ error: 'Některé produkty neexistují', invalid_ids: missing });
      }
    }

    await db.prepare('DELETE FROM page_products_map WHERE page_id = ?').run(id);
    for (let i = 0; i < productIds.length; i++) {
      await db.prepare(
        'INSERT INTO page_products_map (page_id, product_id, display_order) VALUES (?, ?, ?) ON CONFLICT DO NOTHING'
      ).run(id, productIds[i], i + 1);
    }
    res.json(await getPageProducts(id, false));
  } catch (err) {
    console.error('Page products PUT error:', err);
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// DELETE /api/pages/admin/:id – admin, delete page
router.delete('/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.prepare('DELETE FROM pages WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Stránka nenalezena' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

export default router;
