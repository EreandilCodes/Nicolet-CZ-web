import express from 'express';
import db from '../database.js';
import { AuthMiddleware } from '../middleware/auth.js';

const router = express.Router();

// GET /api/carousel – public, active items ordered by display_order
router.get('/', async (req, res) => {
  try {
    const rows = await db.prepare(
      'SELECT * FROM carousel_items WHERE is_active = 1 ORDER BY display_order, id'
    ).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// GET /api/carousel/admin/all – admin, all items
router.get('/admin/all', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const rows = await db.prepare(
      'SELECT * FROM carousel_items ORDER BY display_order, id'
    ).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// POST /api/carousel/admin – admin, create item
router.post('/admin', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { image_url, link_url, title_cz, title_en, subtitle_cz, subtitle_en, show_text, display_order, is_active } = req.body;
    if (!image_url?.trim()) return res.status(400).json({ error: 'image_url je povinné' });

    const result = await db.prepare(`
      INSERT INTO carousel_items (image_url, link_url, title_cz, title_en, subtitle_cz, subtitle_en, show_text, display_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      image_url.trim(),
      link_url?.trim() || null,
      title_cz?.trim() || null,
      title_en?.trim() || null,
      subtitle_cz?.trim() || null,
      subtitle_en?.trim() || null,
      show_text != null ? (show_text ? 1 : 0) : 1,
      Number(display_order) || 0,
      is_active != null ? (is_active ? 1 : 0) : 1
    );

    const created = await db.prepare('SELECT * FROM carousel_items WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    console.error('Carousel POST error:', err);
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// PUT /api/carousel/admin/:id – admin, update item
router.put('/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { image_url, link_url, title_cz, title_en, subtitle_cz, subtitle_en, show_text, display_order, is_active } = req.body;
    if (!image_url?.trim()) return res.status(400).json({ error: 'image_url je povinné' });

    const result = await db.prepare(`
      UPDATE carousel_items
      SET image_url = ?, link_url = ?, title_cz = ?, title_en = ?,
          subtitle_cz = ?, subtitle_en = ?, show_text = ?, display_order = ?, is_active = ?
      WHERE id = ?
    `).run(
      image_url.trim(),
      link_url?.trim() || null,
      title_cz?.trim() || null,
      title_en?.trim() || null,
      subtitle_cz?.trim() || null,
      subtitle_en?.trim() || null,
      show_text != null ? (show_text ? 1 : 0) : 1,
      Number(display_order) || 0,
      is_active != null ? (is_active ? 1 : 0) : 1,
      id
    );

    if (result.changes === 0) return res.status(404).json({ error: 'Položka nenalezena' });
    const updated = await db.prepare('SELECT * FROM carousel_items WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error('Carousel PUT error:', err);
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// DELETE /api/carousel/admin/:id – admin, delete item
router.delete('/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.prepare('DELETE FROM carousel_items WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Položka nenalezena' });
    res.json({ message: 'Položka smazána' });
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// PUT /api/carousel/admin/:id/order – admin, reorder item
router.put('/admin/:id/order', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { direction } = req.body;
    if (direction !== 'up' && direction !== 'down') {
      return res.status(400).json({ error: 'direction musí být up nebo down' });
    }

    const item = await db.prepare('SELECT * FROM carousel_items WHERE id = ?').get(id);
    if (!item) return res.status(404).json({ error: 'Položka nenalezena' });

    let neighbor;
    if (direction === 'up') {
      neighbor = await db.prepare(
        'SELECT * FROM carousel_items WHERE display_order < ? ORDER BY display_order DESC, id DESC LIMIT 1'
      ).get(item.display_order);
    } else {
      neighbor = await db.prepare(
        'SELECT * FROM carousel_items WHERE display_order > ? ORDER BY display_order ASC, id ASC LIMIT 1'
      ).get(item.display_order);
    }

    if (!neighbor) return res.json({ message: 'Již na krajní pozici' });

    await db.prepare('UPDATE carousel_items SET display_order = ? WHERE id = ?').run(neighbor.display_order, item.id);
    await db.prepare('UPDATE carousel_items SET display_order = ? WHERE id = ?').run(item.display_order, neighbor.id);

    res.json({ message: 'Pořadí aktualizováno' });
  } catch (err) {
    console.error('Carousel order error:', err);
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

export default router;
