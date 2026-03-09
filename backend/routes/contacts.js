import express from 'express';
import db from '../database.js';
import { AuthMiddleware } from '../middleware/auth.js';

const router = express.Router();

// GET /api/contacts (public – active only, ordered)
router.get('/', async (req, res) => {
  try {
    const rows = await db.prepare(
      'SELECT id, name, role_cz, role_en, email, phone, image_url, display_order FROM contacts WHERE is_active = 1 ORDER BY display_order, id'
    ).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// GET /api/contacts/admin/all (admin – all contacts)
router.get('/admin/all', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const rows = await db.prepare(
      'SELECT * FROM contacts ORDER BY display_order, id'
    ).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// POST /api/contacts (admin)
router.post('/', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { name, role_cz, role_en, email, phone, image_url, display_order, is_active } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Jméno je povinné' });

    const result = await db.prepare(`
      INSERT INTO contacts (name, role_cz, role_en, email, phone, image_url, display_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name.trim(),
      role_cz?.trim() || null,
      role_en?.trim() || null,
      email?.trim() || null,
      phone?.trim() || null,
      image_url?.trim() || null,
      Number(display_order) || 0,
      is_active ? 1 : 0
    );

    const created = await db.prepare('SELECT * FROM contacts WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    console.error('Contacts POST error:', err);
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// PUT /api/contacts/:id (admin)
router.put('/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role_cz, role_en, email, phone, image_url, display_order, is_active } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Jméno je povinné' });

    const result = await db.prepare(`
      UPDATE contacts
      SET name = ?, role_cz = ?, role_en = ?, email = ?, phone = ?,
          image_url = ?, display_order = ?, is_active = ?
      WHERE id = ?
    `).run(
      name.trim(),
      role_cz?.trim() || null,
      role_en?.trim() || null,
      email?.trim() || null,
      phone?.trim() || null,
      image_url?.trim() || null,
      Number(display_order) || 0,
      is_active ? 1 : 0,
      id
    );

    if (result.changes === 0) return res.status(404).json({ error: 'Kontakt nenalezen' });

    const updated = await db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error('Contacts PUT error:', err);
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// DELETE /api/contacts/:id (admin)
router.delete('/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Kontakt nenalezen' });
    res.json({ message: 'Kontakt smazán' });
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

export default router;
