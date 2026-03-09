import express from 'express';
import db from '../database.js';
import { AuthMiddleware } from '../middleware/auth.js';

const router = express.Router();

// GET /api/buttons – public, all active buttons
router.get('/', async (req, res) => {
  try {
    const rows = await db.prepare(
      'SELECT * FROM buttons WHERE is_active = 1 ORDER BY id'
    ).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// GET /api/buttons/admin/all – admin, all buttons
router.get('/admin/all', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const rows = await db.prepare(
      'SELECT * FROM buttons ORDER BY id'
    ).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// POST /api/buttons/admin – admin, create button
router.post('/admin', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { label_cz, label_en, link_type, link_value, style, is_active } = req.body;
    if (!label_cz?.trim()) return res.status(400).json({ error: 'label_cz je povinné' });

    const result = await db.prepare(`
      INSERT INTO buttons (label_cz, label_en, link_type, link_value, style, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      label_cz.trim(),
      label_en?.trim() || null,
      link_type?.trim() || 'form',
      link_value?.trim() || null,
      style?.trim() || 'primary',
      is_active != null ? (is_active ? 1 : 0) : 1
    );

    const created = await db.prepare('SELECT * FROM buttons WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    console.error('Buttons POST error:', err);
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// PUT /api/buttons/admin/:id – admin, update button
router.put('/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { label_cz, label_en, link_type, link_value, style, is_active } = req.body;
    if (!label_cz?.trim()) return res.status(400).json({ error: 'label_cz je povinné' });

    const result = await db.prepare(`
      UPDATE buttons
      SET label_cz = ?, label_en = ?, link_type = ?, link_value = ?, style = ?, is_active = ?
      WHERE id = ?
    `).run(
      label_cz.trim(),
      label_en?.trim() || null,
      link_type?.trim() || 'form',
      link_value?.trim() || null,
      style?.trim() || 'primary',
      is_active != null ? (is_active ? 1 : 0) : 1,
      id
    );

    if (result.changes === 0) return res.status(404).json({ error: 'Tlačítko nenalezeno' });
    const updated = await db.prepare('SELECT * FROM buttons WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error('Buttons PUT error:', err);
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// DELETE /api/buttons/admin/:id – admin, delete button
router.delete('/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.prepare('DELETE FROM buttons WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Tlačítko nenalezeno' });
    res.json({ message: 'Tlačítko smazáno' });
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

export default router;
