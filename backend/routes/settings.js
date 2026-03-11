import express from 'express';
import db from '../database.js';
import { AuthMiddleware } from '../middleware/auth.js';
import emailService from '../services/email.service.js';

const router = express.Router();

// Whitelist of allowed setting keys
const ALLOWED_KEYS = new Set([
  'site_name_cz', 'site_name_en',
  'contact_phone', 'contact_email', 'contact_address',
  'notification_email',
  'footer_text_cz', 'footer_text_en',
  'seo_title_default_cz', 'seo_title_default_en',
  'seo_desc_default_cz', 'seo_desc_default_en',
  'gtag_id',
  'default_thumbnail',
  'logo_url',
  'news_default_button_id',
  'product_default_button_id',
  'training_default_button_id',
]);

// GET /api/settings (admin only – returns all as object)
router.get('/', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const rows = await db.prepare('SELECT key, value FROM settings').all();
    const result = {};
    for (const r of rows) result[r.key] = r.value;
    res.json(result);
  } catch (err) {
    console.error('Settings GET error:', err);
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// GET /api/settings/public (public – only safe keys)
const PUBLIC_KEYS = new Set([
  'site_name_cz', 'site_name_en',
  'contact_phone', 'contact_email', 'contact_address',
  'footer_text_cz', 'footer_text_en',
  'seo_title_default_cz', 'seo_title_default_en',
  'seo_desc_default_cz', 'seo_desc_default_en',
  'default_thumbnail',
  'logo_url',
  'news_default_button_id',
  'product_default_button_id',
  'training_default_button_id',
]);

router.get('/public', async (req, res) => {
  try {
    const rows = await db.prepare('SELECT key, value FROM settings').all();
    const result = {};
    for (const r of rows) {
      if (PUBLIC_KEYS.has(r.key)) result[r.key] = r.value;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// PUT /api/settings (admin – update multiple keys at once)
router.put('/', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const updates = req.body;
    if (typeof updates !== 'object' || Array.isArray(updates)) {
      return res.status(400).json({ error: 'Neplatný formát dat' });
    }

    const stmt = db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);

    for (const [key, value] of Object.entries(updates)) {
      if (!ALLOWED_KEYS.has(key)) continue;
      await stmt.run(key, String(value ?? ''));
    }

    res.json({ message: 'Nastavení uloženo' });
  } catch (err) {
    console.error('Settings PUT error:', err);
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// POST /api/settings/test-email (admin – sends test email)
router.post('/test-email', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const row = await db.prepare(`SELECT value FROM settings WHERE key = 'notification_email'`).get();
    const email = row?.value || '';
    if (!email) {
      return res.status(400).json({ error: 'Notification email není nastaven' });
    }
    await emailService.sendTestNotification(email);
    res.json({ message: 'Testovací email odeslán' });
  } catch (err) {
    console.error('Test email error:', err);
    res.status(500).json({ error: err.message || 'Chyba při odesílání emailu' });
  }
});

export default router;
