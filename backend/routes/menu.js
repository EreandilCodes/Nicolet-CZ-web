import express from 'express';
import db from '../database.js';
import { AuthMiddleware } from '../middleware/auth.js';

const router = express.Router();

// GET /api/menu – public, active items ordered by parent_id, display_order
router.get('/', async (req, res) => {
  try {
    const rows = await db.prepare(
      'SELECT * FROM menu_items WHERE is_active = 1 ORDER BY parent_id, display_order, id'
    ).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// GET /api/menu/admin/all – admin, all menu items
router.get('/admin/all', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const rows = await db.prepare(
      'SELECT * FROM menu_items ORDER BY parent_id, display_order, id'
    ).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// POST /api/menu/admin – admin, create menu item
router.post('/admin', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { parent_id, label_cz, label_en, link_type, link_value, display_order, is_active } = req.body;
    if (!label_cz?.trim()) return res.status(400).json({ error: 'label_cz je povinné' });

    const result = await db.prepare(`
      INSERT INTO menu_items (parent_id, label_cz, label_en, link_type, link_value, display_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      parent_id || null,
      label_cz.trim(),
      label_en?.trim() || null,
      link_type?.trim() || 'internal',
      link_value?.trim() || null,
      Number(display_order) || 0,
      is_active != null ? (is_active ? 1 : 0) : 1
    );

    const created = await db.prepare('SELECT * FROM menu_items WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    console.error('Menu POST error:', err);
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// PUT /api/menu/admin/:id – admin, update menu item
router.put('/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { parent_id, label_cz, label_en, link_type, link_value, display_order, is_active } = req.body;
    if (!label_cz?.trim()) return res.status(400).json({ error: 'label_cz je povinné' });

    const result = await db.prepare(`
      UPDATE menu_items
      SET parent_id = ?, label_cz = ?, label_en = ?, link_type = ?, link_value = ?,
          display_order = ?, is_active = ?
      WHERE id = ?
    `).run(
      parent_id || null,
      label_cz.trim(),
      label_en?.trim() || null,
      link_type?.trim() || 'internal',
      link_value?.trim() || null,
      Number(display_order) || 0,
      is_active != null ? (is_active ? 1 : 0) : 1,
      id
    );

    if (result.changes === 0) return res.status(404).json({ error: 'Položka nenalezena' });
    const updated = await db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error('Menu PUT error:', err);
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// DELETE /api/menu/admin/:id – admin, delete item (orphan children by setting parent_id = NULL)
router.delete('/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    // Orphan children
    await db.prepare('UPDATE menu_items SET parent_id = NULL WHERE parent_id = ?').run(id);
    const result = await db.prepare('DELETE FROM menu_items WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Položka nenalezena' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// POST /api/menu/admin/seed-defaults – admin, restore missing default menu items
router.post('/admin/seed-defaults', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const defaultRootItems = [
      { label_cz: 'Novinky',            label_en: 'News',                link_value: '/novinky',                   order: 10 },
      { label_cz: 'Produkty',           label_en: 'Products',            link_value: '/produkty',                  order: 20 },
      { label_cz: 'O nás',             label_en: 'About us',            link_value: '/o-nas',                     order: 30 },
      { label_cz: 'Školení a kurzy',   label_en: 'Training & courses',  link_value: '/skoleni',                   order: 40 },
      { label_cz: 'Aplikační podpora', label_en: 'Application support', link_value: '/stranka/aplikacni-podpora', order: 50 },
      { label_cz: 'Aplikace',          label_en: 'Applications',        link_value: '/aplikace',                  order: 60 },
    ];
    let inserted = 0;
    for (const item of defaultRootItems) {
      const exists = await db.prepare('SELECT id FROM menu_items WHERE link_value = ? AND parent_id IS NULL').get(item.link_value);
      if (!exists) {
        await db.prepare(`INSERT INTO menu_items (label_cz, label_en, link_type, link_value, display_order, is_active) VALUES (?,?,'internal',?,?,1)`).run(item.label_cz, item.label_en, item.link_value, item.order);
        inserted++;
      }
    }
    const defaultChildItems = [
      { parentLink: '/novinky',  label_cz: 'Všechny novinky',  label_en: 'All news',          link_value: '/novinky',                   order: 10 },
      { parentLink: '/produkty', label_cz: 'Všechny produkty', label_en: 'All products',      link_value: '/produkty',                  order: 10 },
      { parentLink: '/o-nas',    label_cz: 'O společnosti',    label_en: 'About us',          link_value: '/stranka/o-nas',             order: 10 },
      { parentLink: '/o-nas',    label_cz: 'Kontakt',          label_en: 'Contact',           link_value: '/stranka/kontakt',           order: 20 },
      { parentLink: '/skoleni',  label_cz: 'Termíny školení',  label_en: 'Training schedule', link_value: '/skoleni',                   order: 10 },
      { parentLink: '/aplikace', label_cz: 'Všechny aplikace', label_en: 'All applications',  link_value: '/aplikace',                  order: 10 },
    ];
    for (const child of defaultChildItems) {
      const parent = await db.prepare('SELECT id FROM menu_items WHERE link_value = ? AND parent_id IS NULL').get(child.parentLink);
      if (!parent) continue;
      const childExists = await db.prepare('SELECT id FROM menu_items WHERE parent_id = ? AND link_value = ?').get(parent.id, child.link_value);
      if (!childExists) {
        await db.prepare(`INSERT INTO menu_items (parent_id, label_cz, label_en, link_type, link_value, display_order, is_active) VALUES (?,?,?,'internal',?,?,1)`).run(parent.id, child.label_cz, child.label_en, child.link_value, child.order);
        inserted++;
      }
    }
    res.json({ message: `Výchozí položky obnoveny (${inserted} přidáno)`, inserted });
  } catch (err) {
    console.error('Menu seed-defaults error:', err);
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// PUT /api/menu/admin/:id/order – admin, reorder item (direction: 'up'|'down')
router.put('/admin/:id/order', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { direction } = req.body;
    if (direction !== 'up' && direction !== 'down') {
      return res.status(400).json({ error: 'direction musí být up nebo down' });
    }

    const item = await db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
    if (!item) return res.status(404).json({ error: 'Položka nenalezena' });

    let neighbor;
    if (direction === 'up') {
      neighbor = await db.prepare(`
        SELECT * FROM menu_items
        WHERE display_order < ? AND (parent_id IS ? OR parent_id = ?)
        ORDER BY display_order DESC, id DESC LIMIT 1
      `).get(item.display_order, item.parent_id, item.parent_id);
    } else {
      neighbor = await db.prepare(`
        SELECT * FROM menu_items
        WHERE display_order > ? AND (parent_id IS ? OR parent_id = ?)
        ORDER BY display_order ASC, id ASC LIMIT 1
      `).get(item.display_order, item.parent_id, item.parent_id);
    }

    if (!neighbor) return res.json({ message: 'Již na krajní pozici' });

    await db.prepare('UPDATE menu_items SET display_order = ? WHERE id = ?').run(neighbor.display_order, item.id);
    await db.prepare('UPDATE menu_items SET display_order = ? WHERE id = ?').run(item.display_order, neighbor.id);

    res.json({ message: 'Pořadí aktualizováno' });
  } catch (err) {
    console.error('Menu order error:', err);
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

export default router;
