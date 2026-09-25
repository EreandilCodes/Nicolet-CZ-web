import express from 'express';
import db from '../database.js';
import { AuthMiddleware } from '../middleware/auth.js';

const router = express.Router();

function generateSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + `-${Date.now()}`;
}

// GET /api/news-categories – public, active categories
router.get('/', async (req, res) => {
  try {
    const rows = await db.prepare(
      'SELECT * FROM news_categories WHERE is_active = 1 ORDER BY display_order, id'
    ).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// GET /api/news-categories/admin/all – admin
router.get('/admin/all', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const rows = await db.prepare(
      'SELECT * FROM news_categories ORDER BY display_order, id'
    ).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// POST /api/news-categories/admin – admin, create
router.post('/admin', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { name_cz, name_en, slug: slugInput, display_order, is_active } = req.body;
    if (!name_cz?.trim()) return res.status(400).json({ error: 'name_cz je povinné' });

    const slug = slugInput?.trim() ? slugInput.trim() : generateSlug(name_cz.trim());

    const result = await db.prepare(`
      INSERT INTO news_categories (name_cz, name_en, slug, display_order, is_active)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      name_cz.trim(),
      name_en?.trim() || null,
      slug,
      Number(display_order) || 0,
      is_active != null ? (is_active ? 1 : 0) : 1
    );

    const created = await db.prepare('SELECT * FROM news_categories WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    console.error('NewsCategories POST error:', err);
    if (err.message?.includes('UNIQUE')) return res.status(400).json({ error: 'Slug již existuje' });
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// PUT /api/news-categories/admin/:id – admin, update
router.put('/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { name_cz, name_en, slug, display_order, is_active } = req.body;
    if (!name_cz?.trim()) return res.status(400).json({ error: 'name_cz je povinné' });
    if (!slug?.trim()) return res.status(400).json({ error: 'slug je povinné' });

    const result = await db.prepare(`
      UPDATE news_categories
      SET name_cz = ?, name_en = ?, slug = ?, display_order = ?, is_active = ?
      WHERE id = ?
    `).run(
      name_cz.trim(),
      name_en?.trim() || null,
      slug.trim(),
      Number(display_order) || 0,
      is_active != null ? (is_active ? 1 : 0) : 1,
      id
    );

    if (result.changes === 0) return res.status(404).json({ error: 'Kategorie nenalezena' });
    const updated = await db.prepare('SELECT * FROM news_categories WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error('NewsCategories PUT error:', err);
    if (err.message?.includes('UNIQUE')) return res.status(400).json({ error: 'Slug již existuje' });
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// DELETE /api/news-categories/admin/:id – admin, delete
router.delete('/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    // Unlink posts in this category before deleting
    await db.prepare('UPDATE news_posts SET category_id = NULL WHERE category_id = ?').run(id);
    const result = await db.prepare('DELETE FROM news_categories WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Kategorie nenalezena' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

export default router;
