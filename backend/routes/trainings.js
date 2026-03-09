import express from 'express';
import db from '../database.js';
import { AuthMiddleware } from '../middleware/auth.js';

const router = express.Router();

// GET /api/trainings – public, published trainings ordered by date_start ASC
router.get('/', async (req, res) => {
  try {
    const rows = await db.prepare(
      'SELECT * FROM trainings WHERE is_published = 1 ORDER BY date_start ASC'
    ).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// GET /api/trainings/admin/all – admin, all trainings
router.get('/admin/all', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const rows = await db.prepare(
      'SELECT * FROM trainings ORDER BY date_start ASC'
    ).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// POST /api/trainings/admin – admin, create training
router.post('/admin', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const {
      title_cz, title_en, content_cz, content_en,
      date_start, date_end, location_cz, location_en,
      cta_button_id, is_published
    } = req.body;

    if (!title_cz?.trim()) return res.status(400).json({ error: 'title_cz je povinné' });
    if (!date_start?.trim()) return res.status(400).json({ error: 'date_start je povinné' });

    const result = await db.prepare(`
      INSERT INTO trainings (title_cz, title_en, content_cz, content_en,
        date_start, date_end, location_cz, location_en, cta_button_id, is_published)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title_cz.trim(),
      title_en?.trim() || null,
      content_cz?.trim() || null,
      content_en?.trim() || null,
      date_start.trim(),
      date_end?.trim() || null,
      location_cz?.trim() || null,
      location_en?.trim() || null,
      cta_button_id || null,
      is_published ? 1 : 0
    );

    const created = await db.prepare('SELECT * FROM trainings WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    console.error('Trainings POST error:', err);
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// PUT /api/trainings/admin/:id – admin, update training
router.put('/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title_cz, title_en, content_cz, content_en,
      date_start, date_end, location_cz, location_en,
      cta_button_id, is_published
    } = req.body;

    if (!title_cz?.trim()) return res.status(400).json({ error: 'title_cz je povinné' });
    if (!date_start?.trim()) return res.status(400).json({ error: 'date_start je povinné' });

    const result = await db.prepare(`
      UPDATE trainings
      SET title_cz = ?, title_en = ?, content_cz = ?, content_en = ?,
          date_start = ?, date_end = ?, location_cz = ?, location_en = ?,
          cta_button_id = ?, is_published = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      title_cz.trim(),
      title_en?.trim() || null,
      content_cz?.trim() || null,
      content_en?.trim() || null,
      date_start.trim(),
      date_end?.trim() || null,
      location_cz?.trim() || null,
      location_en?.trim() || null,
      cta_button_id || null,
      is_published ? 1 : 0,
      id
    );

    if (result.changes === 0) return res.status(404).json({ error: 'Školení nenalezeno' });
    const updated = await db.prepare('SELECT * FROM trainings WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error('Trainings PUT error:', err);
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// DELETE /api/trainings/admin/:id – admin, delete training
router.delete('/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.prepare('DELETE FROM trainings WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Školení nenalezeno' });
    res.json({ message: 'Školení smazáno' });
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

export default router;
