import express from 'express';
import db from '../database.js';
import { AuthMiddleware } from '../middleware/auth.js';

const router = express.Router();

// GET /api/faqs – public, all active FAQs grouped by category
router.get('/', async (req, res) => {
  try {
    const rows = await db.prepare(
      'SELECT * FROM faqs WHERE is_active = 1 ORDER BY display_order, id'
    ).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// GET /api/faqs/admin/all – admin, all FAQs
router.get('/admin/all', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const rows = await db.prepare(
      'SELECT * FROM faqs ORDER BY display_order, id'
    ).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// POST /api/faqs/admin – admin, create FAQ
router.post('/admin', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const {
      category_cz, category_en,
      question_cz, question_en,
      answer_cz, answer_en,
      display_order, is_active
    } = req.body;

    if (!question_cz?.trim()) return res.status(400).json({ error: 'Otázka (CZ) je povinná' });
    if (!answer_cz?.trim()) return res.status(400).json({ error: 'Odpověď (CZ) je povinná' });

    const result = await db.prepare(`
      INSERT INTO faqs (category_cz, category_en, question_cz, question_en, answer_cz, answer_en, display_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      category_cz?.trim() || '',
      category_en?.trim() || '',
      question_cz.trim(),
      question_en?.trim() || null,
      answer_cz.trim(),
      answer_en?.trim() || null,
      parseInt(display_order) || 0,
      is_active !== false ? 1 : 0
    );

    const newItem = await db.prepare('SELECT * FROM faqs WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newItem);
  } catch (err) {
    console.error('FAQ create error:', err);
    res.status(500).json({ error: 'Chyba při vytváření FAQ' });
  }
});

// PUT /api/faqs/admin/:id – admin, update FAQ
router.put('/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      category_cz, category_en,
      question_cz, question_en,
      answer_cz, answer_en,
      display_order, is_active
    } = req.body;

    if (!question_cz?.trim()) return res.status(400).json({ error: 'Otázka (CZ) je povinná' });
    if (!answer_cz?.trim()) return res.status(400).json({ error: 'Odpověď (CZ) je povinná' });

    await db.prepare(`
      UPDATE faqs SET
        category_cz = ?, category_en = ?,
        question_cz = ?, question_en = ?,
        answer_cz = ?, answer_en = ?,
        display_order = ?, is_active = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      category_cz?.trim() || '',
      category_en?.trim() || '',
      question_cz.trim(),
      question_en?.trim() || null,
      answer_cz.trim(),
      answer_en?.trim() || null,
      parseInt(display_order) || 0,
      is_active !== false ? 1 : 0,
      id
    );

    const updated = await db.prepare('SELECT * FROM faqs WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error('FAQ update error:', err);
    res.status(500).json({ error: 'Chyba při aktualizaci FAQ' });
  }
});

// DELETE /api/faqs/admin/:id – admin, delete FAQ
router.delete('/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    await db.prepare('DELETE FROM faqs WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    console.error('FAQ delete error:', err);
    res.status(500).json({ error: 'Chyba při mazání FAQ' });
  }
});

export default router;
