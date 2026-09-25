import express from 'express';
import db from '../database.js';
import { AuthMiddleware } from '../middleware/auth.js';

const router = express.Router();
export const groupsRouter = express.Router();

function generateSlug(name) {
  const replacements = {
    'á': 'a', 'ä': 'a', 'å': 'a', 'ā': 'a', 'ą': 'a', 'ă': 'a', 'ȧ': 'a', 'α': 'a',
    'č': 'c', 'ć': 'c', 'ç': 'c', 'ċ': 'c', 'ĉ': 'c', 'χ': 'c',
    'ď': 'd', 'đ': 'd', 'δ': 'd',
    'ě': 'e', 'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e', 'ę': 'e', 'ė': 'e', 'ē': 'e', 'ε': 'e',
    'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i', 'į': 'i', 'ī': 'i', 'ι': 'i',
    'ň': 'n', 'ń': 'n', 'ñ': 'n', 'ν': 'n',
    'ř': 'r', 'ŕ': 'r', 'ρ': 'r',
    'š': 's', 'ś': 's', 'ş': 's', 'ș': 's', 'σ': 's',
    'ť': 't', 'ț': 't', 'τ': 't',
    'ů': 'u', 'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u', 'ų': 'u', 'ū': 'u', 'ȳ': 'u', 'ύ': 'u', 'υ': 'u',
    'ý': 'y', 'ÿ': 'y', 'ψ': 'y',
    'ž': 'z', 'ź': 'z', 'ż': 'z', 'ζ': 'z',
    'ö': 'o', 'ő': 'o', 'ø': 'o', 'ō': 'o', 'ô': 'o', 'ò': 'o', 'ó': 'o', 'õ': 'o',
    'ß': 'ss',
  };
  let result = name.toLowerCase();
  for (const [from, to] of Object.entries(replacements)) {
    result = result.split(from).join(to);
  }
  return result.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + `-${Date.now()}`;
}

// Batch-load products for a list of applications (2 queries total)
async function batchAttachProducts(applications) {
  if (!applications.length) return applications;
  const ids = applications.map(a => a.id);
  const ph = ids.map(() => '?').join(',');

  const rows = await db.prepare(`
    SELECT m.application_id, p.id, p.slug, p.name_cz, p.name_en, p.thumbnail_url
    FROM products p
    JOIN product_applications_map m ON m.product_id = p.id
    WHERE m.application_id IN (${ph})
    ORDER BY p.display_order, p.id
  `).all(...ids);

  const byApp = {};
  for (const row of rows) {
    const { application_id, ...prod } = row;
    (byApp[application_id] ||= []).push(prod);
  }

  return applications.map(a => ({ ...a, products: byApp[a.id] || [] }));
}

async function getApplicationProducts(applicationId) {
  return db.prepare(`
    SELECT p.id, p.slug, p.name_cz, p.name_en, p.thumbnail_url FROM products p
    JOIN product_applications_map m ON m.product_id = p.id
    WHERE m.application_id = ?
    ORDER BY p.display_order, p.id
  `).all(applicationId);
}

async function syncApplicationProducts(applicationId, productIds) {
  await db.prepare('DELETE FROM product_applications_map WHERE application_id = ?').run(applicationId);
  if (!Array.isArray(productIds)) return;
  for (const pid of productIds) {
    try {
      await db.prepare('INSERT INTO product_applications_map (product_id, application_id) VALUES (?, ?) ON CONFLICT DO NOTHING').run(pid, applicationId);
    } catch { /* ignore */ }
  }
}

// ─── Application Group routes (mounted at /api/application-groups) ────────────

// GET /api/application-groups – public, all active groups
groupsRouter.get('/', async (req, res) => {
  try {
    const rows = await db.prepare(
      'SELECT * FROM application_groups WHERE is_active = 1 ORDER BY display_order, id'
    ).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// GET /api/application-groups/admin/all – admin
groupsRouter.get('/admin/all', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const rows = await db.prepare(
      'SELECT * FROM application_groups ORDER BY display_order, id'
    ).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// POST /api/application-groups/admin – admin, create group
groupsRouter.post('/admin', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { slug: slugInput, name_cz, name_en, display_order, is_active } = req.body;
    if (!name_cz?.trim()) return res.status(400).json({ error: 'name_cz je povinné' });

    const slug = slugInput?.trim() ? slugInput.trim() : generateSlug(name_cz.trim());

    const result = await db.prepare(`
      INSERT INTO application_groups (slug, name_cz, name_en, display_order, is_active)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      slug,
      name_cz.trim(),
      name_en?.trim() || null,
      Number(display_order) || 0,
      is_active != null ? (is_active ? 1 : 0) : 1
    );

    const created = await db.prepare('SELECT * FROM application_groups WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    console.error('ApplicationGroups POST error:', err);
    if (err.message?.includes('UNIQUE')) return res.status(400).json({ error: 'Slug již existuje' });
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// PUT /api/application-groups/admin/:id – admin, update group
groupsRouter.put('/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { slug, name_cz, name_en, display_order, is_active } = req.body;
    if (!name_cz?.trim()) return res.status(400).json({ error: 'name_cz je povinné' });
    if (!slug?.trim()) return res.status(400).json({ error: 'slug je povinné' });

    const result = await db.prepare(`
      UPDATE application_groups
      SET slug = ?, name_cz = ?, name_en = ?, display_order = ?, is_active = ?
      WHERE id = ?
    `).run(
      slug.trim(),
      name_cz.trim(),
      name_en?.trim() || null,
      Number(display_order) || 0,
      is_active != null ? (is_active ? 1 : 0) : 1,
      id
    );

    if (result.changes === 0) return res.status(404).json({ error: 'Skupina nenalezena' });
    const updated = await db.prepare('SELECT * FROM application_groups WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error('ApplicationGroups PUT error:', err);
    if (err.message?.includes('UNIQUE')) return res.status(400).json({ error: 'Slug již existuje' });
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// DELETE /api/application-groups/admin/:id – admin, delete group
groupsRouter.delete('/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.prepare('DELETE FROM application_groups WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Skupina nenalezena' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// ─── Application routes (mounted at /api/applications) ───────────────────────

// GET /api/applications – public, published applications
router.get('/', async (req, res) => {
  try {
    // ?fields=list returns lightweight payload (no content, no SEO)
    const listMode = req.query.fields === 'list';
    const cols = listMode
      ? 'id, group_id, slug, name_cz, name_en, cover_image, thumbnail_url, is_featured, is_published, display_order, SUBSTR(content_cz, 1, 300) AS content_cz, SUBSTR(content_en, 1, 300) AS content_en'
      : '*';
    const rows = await db.prepare(
      `SELECT ${cols} FROM applications WHERE is_published = 1 ORDER BY display_order, id`
    ).all();
    // Skip batch-loading linked products in list mode (not displayed)
    res.json(listMode ? rows : await batchAttachProducts(rows));
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// GET /api/applications/admin/all – admin
// NOTE: must be defined before /:slug
router.get('/admin/all', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const rows = await db.prepare(
      'SELECT * FROM applications ORDER BY display_order, id'
    ).all();
    res.json(await batchAttachProducts(rows));
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// GET /api/applications/:slug – public, single application
router.get('/:slug', async (req, res) => {
  try {
    const row = await db.prepare(
      'SELECT * FROM applications WHERE slug = ? AND is_published = 1'
    ).get(req.params.slug);
    if (!row) return res.status(404).json({ error: 'Aplikace nenalezena' });
    row.products = await getApplicationProducts(row.id);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// POST /api/applications/admin – admin, create application
router.post('/admin', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const {
      group_id, slug: slugInput, name_cz, name_en, content_cz, content_en,
      excerpt_cz, excerpt_en, cover_image, thumbnail_url, cover_caption, cover_align,
      is_published, is_featured, display_order,
      seo_title_cz, seo_title_en, product_ids
    } = req.body;

    if (!name_cz?.trim()) return res.status(400).json({ error: 'name_cz je povinné' });

    const slug = slugInput?.trim() ? slugInput.trim() : generateSlug(name_cz.trim());

    const result = await db.prepare(`
      INSERT INTO applications (group_id, slug, name_cz, name_en, content_cz, content_en,
        excerpt_cz, excerpt_en, cover_image, thumbnail_url, cover_caption, cover_align,
        is_published, is_featured, display_order, seo_title_cz, seo_title_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      group_id || null,
      slug,
      name_cz.trim(),
      name_en?.trim() || null,
      content_cz?.trim() || null,
      content_en?.trim() || null,
      excerpt_cz?.trim() || null,
      excerpt_en?.trim() || null,
      cover_image?.trim() || null,
      thumbnail_url?.trim() || null,
      cover_caption?.trim() || null,
      cover_align?.trim() || 'center',
      is_published ? 1 : 0,
      is_featured ? 1 : 0,
      Number(display_order) || 0,
      seo_title_cz?.trim() || null,
      seo_title_en?.trim() || null
    );

    const appId = result.lastInsertRowid;
    await syncApplicationProducts(appId, product_ids);

    const created = await db.prepare('SELECT * FROM applications WHERE id = ?').get(appId);
    created.products = await getApplicationProducts(appId);
    res.status(201).json(created);
  } catch (err) {
    console.error('Applications POST error:', err);
    if (err.message?.includes('UNIQUE')) return res.status(400).json({ error: 'Slug již existuje' });
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// PUT /api/applications/admin/:id – admin, update application
router.put('/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      group_id, slug, name_cz, name_en, content_cz, content_en,
      excerpt_cz, excerpt_en, cover_image, thumbnail_url, cover_caption, cover_align,
      is_published, is_featured, display_order,
      seo_title_cz, seo_title_en, product_ids
    } = req.body;

    if (!name_cz?.trim()) return res.status(400).json({ error: 'name_cz je povinné' });
    if (!slug?.trim()) return res.status(400).json({ error: 'slug je povinné' });

    const result = await db.prepare(`
      UPDATE applications
      SET group_id = ?, slug = ?, name_cz = ?, name_en = ?, content_cz = ?, content_en = ?,
          excerpt_cz = ?, excerpt_en = ?, cover_image = ?, thumbnail_url = ?, cover_caption = ?, cover_align = ?,
          is_published = ?, is_featured = ?, display_order = ?,
          seo_title_cz = ?, seo_title_en = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      group_id || null,
      slug.trim(),
      name_cz.trim(),
      name_en?.trim() || null,
      content_cz?.trim() || null,
      content_en?.trim() || null,
      excerpt_cz?.trim() || null,
      excerpt_en?.trim() || null,
      cover_image?.trim() || null,
      thumbnail_url?.trim() || null,
      cover_caption?.trim() || null,
      cover_align?.trim() || 'center',
      is_published ? 1 : 0,
      is_featured ? 1 : 0,
      Number(display_order) || 0,
      seo_title_cz?.trim() || null,
      seo_title_en?.trim() || null,
      id
    );

    if (result.changes === 0) return res.status(404).json({ error: 'Aplikace nenalezena' });

    if (Array.isArray(product_ids)) {
      await syncApplicationProducts(id, product_ids);
    }

    const updated = await db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
    updated.products = await getApplicationProducts(id);
    res.json(updated);
  } catch (err) {
    console.error('Applications PUT error:', err);
    if (err.message?.includes('UNIQUE')) return res.status(400).json({ error: 'Slug již existuje' });
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// DELETE /api/applications/admin/:id – admin, delete application
router.delete('/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.prepare('DELETE FROM applications WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Aplikace nenalezena' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

export default router;
