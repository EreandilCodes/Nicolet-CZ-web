import express from 'express';
import db from '../database.js';
import { AuthMiddleware } from '../middleware/auth.js';

const router = express.Router();

// ─── Simple in-memory rate limiter for form submissions ───────────────────────
const submitRateMap = new Map(); // key: ip, value: { count, resetAt }
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function isRateLimited(ip) {
  const now = Date.now();
  const entry = submitRateMap.get(ip);
  if (!entry || now >= entry.resetAt) {
    submitRateMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (entry.count >= RATE_LIMIT_MAX) return true;
  entry.count++;
  return false;
}

// ─── Email helper ─────────────────────────────────────────────────────────────
async function sendFormEmail(form, submittedData) {
  try {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return;

    const nodemailer = (await import('nodemailer')).default;
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const recipients = form.email_recipients
      ? form.email_recipients.split(',').map(e => e.trim()).filter(Boolean)
      : [];
    if (recipients.length === 0) return;

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: recipients.join(', '),
      subject: `Nová odpověď: ${form.name}`,
      text: JSON.stringify(submittedData, null, 2)
    });
  } catch (err) {
    console.error('Email failed (non-critical):', err.message);
  }
}

// ─── Public form routes ───────────────────────────────────────────────────────

// GET /api/forms – public, active forms with parsed fields_json
router.get('/', async (req, res) => {
  try {
    const rows = await db.prepare(
      'SELECT * FROM forms WHERE is_active = 1 ORDER BY id'
    ).all();
    const result = rows.map(f => ({
      ...f,
      fields_json: (() => { try { return JSON.parse(f.fields_json); } catch { return []; } })()
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// GET /api/forms/admin/all – admin, all forms
// NOTE: must be defined before /:id to avoid shadowing
router.get('/admin/all', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const rows = await db.prepare(
      'SELECT * FROM forms ORDER BY id'
    ).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// GET /api/forms/:id – public, single form
router.get('/:id', async (req, res) => {
  try {
    const row = await db.prepare(
      'SELECT * FROM forms WHERE id = ? AND is_active = 1'
    ).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Formulář nenalezen' });
    try { row.fields_json = JSON.parse(row.fields_json); } catch { row.fields_json = []; }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// POST /api/forms/:id/submit – public, submit form
router.post('/:id/submit', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};

    // Honeypot check
    if (body._hp) {
      return res.json({ success: true });
    }

    // Time check: _ts must be 3-600 seconds ago
    const nowSec = Math.floor(Date.now() / 1000);
    const ts = Number(body._ts) || 0;
    const elapsed = nowSec - ts;
    if (elapsed < 3 || elapsed > 600) {
      return res.status(400).json({ error: 'Neplatný formulář. Zkuste to znovu.' });
    }

    // Rate limit by IP
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (isRateLimited(ip)) {
      return res.status(429).json({ error: 'Příliš mnoho pokusů. Zkuste to za 10 minut.' });
    }

    const form = await db.prepare('SELECT * FROM forms WHERE id = ? AND is_active = 1').get(id);
    if (!form) return res.status(404).json({ error: 'Formulář nenalezen' });

    // Parse form fields and validate required
    let formFields = [];
    try {
      formFields = typeof form.fields_json === 'string' ? JSON.parse(form.fields_json) : (form.fields_json || []);
    } catch { formFields = []; }

    for (const field of formFields) {
      if (field.required) {
        const value = body[field.name];
        const isEmpty = field.type === 'checkbox' ? !value : (!value || String(value).trim() === '');
        if (isEmpty) {
          return res.status(400).json({ error: `Vyplňte prosím: ${field.label_cz || field.label_en || field.name}` });
        }
      }
    }

    // Strip internal fields before storing
    const { _hp: _hpField, _ts: _tsField, ...submittedData } = body;

    await db.prepare(`
      INSERT INTO form_submissions (form_id, data_json, ip) VALUES (?, ?, ?)
    `).run(id, JSON.stringify(submittedData), ip);

    // Non-critical email
    sendFormEmail(form, submittedData);

    res.json({ success: true });
  } catch (err) {
    console.error('Form submit error:', err);
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// ─── Admin form CRUD ──────────────────────────────────────────────────────────

// POST /api/forms/admin – admin, create form
router.post('/admin', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const {
      name, title_cz, title_en, description_cz, description_en, fields_json, background_image,
      email_recipients, submit_label_cz, submit_label_en,
      success_msg_cz, success_msg_en, label_color, is_active
    } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: 'name je povinné' });

    const validColors = ['black', 'white', 'blue'];
    const safeLabelColor = validColors.includes(label_color) ? label_color : 'white';

    const result = await db.prepare(`
      INSERT INTO forms (name, title_cz, title_en, description_cz, description_en, fields_json, background_image,
        email_recipients, submit_label_cz, submit_label_en, success_msg_cz, success_msg_en, label_color, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name.trim(),
      title_cz?.trim() || null,
      title_en?.trim() || null,
      description_cz?.trim() || null,
      description_en?.trim() || null,
      typeof fields_json === 'string' ? fields_json : JSON.stringify(fields_json || []),
      background_image?.trim() || null,
      email_recipients?.trim() || '',
      submit_label_cz?.trim() || 'Odeslat',
      submit_label_en?.trim() || 'Submit',
      success_msg_cz?.trim() || 'Děkujeme za zprávu. Brzy se ozveme.',
      success_msg_en?.trim() || 'Thank you. We will get back to you shortly.',
      safeLabelColor,
      is_active != null ? (is_active ? 1 : 0) : 1
    );

    const created = await db.prepare('SELECT * FROM forms WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    console.error('Forms POST error:', err);
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// PUT /api/forms/admin/:id – admin, update form
router.put('/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, title_cz, title_en, description_cz, description_en, fields_json, background_image,
      email_recipients, submit_label_cz, submit_label_en,
      success_msg_cz, success_msg_en, label_color, is_active
    } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: 'name je povinné' });

    const validColors = ['black', 'white', 'blue'];
    const safeLabelColor = validColors.includes(label_color) ? label_color : 'white';

    const result = await db.prepare(`
      UPDATE forms
      SET name = ?, title_cz = ?, title_en = ?, description_cz = ?, description_en = ?, fields_json = ?, background_image = ?,
          email_recipients = ?, submit_label_cz = ?, submit_label_en = ?,
          success_msg_cz = ?, success_msg_en = ?, label_color = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name.trim(),
      title_cz?.trim() || null,
      title_en?.trim() || null,
      description_cz?.trim() || null,
      description_en?.trim() || null,
      typeof fields_json === 'string' ? fields_json : JSON.stringify(fields_json || []),
      background_image?.trim() || null,
      email_recipients?.trim() || '',
      submit_label_cz?.trim() || 'Odeslat',
      submit_label_en?.trim() || 'Submit',
      success_msg_cz?.trim() || 'Děkujeme za zprávu. Brzy se ozveme.',
      success_msg_en?.trim() || 'Thank you. We will get back to you shortly.',
      safeLabelColor,
      is_active != null ? (is_active ? 1 : 0) : 1,
      id
    );

    if (result.changes === 0) return res.status(404).json({ error: 'Formulář nenalezen' });
    const updated = await db.prepare('SELECT * FROM forms WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error('Forms PUT error:', err);
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// DELETE /api/forms/admin/:id – admin, delete form
router.delete('/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.prepare('DELETE FROM forms WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Formulář nenalezen' });
    res.json({ message: 'Formulář smazán' });
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// ─── Admin submission routes ──────────────────────────────────────────────────

// GET /api/submissions/admin/all is mounted separately in server.js
// We export a submissionsRouter for that purpose
export const submissionsRouter = express.Router();

// GET /api/submissions/admin/all – admin, all submissions with form name
submissionsRouter.get('/admin/all', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT fs.*, f.name AS form_name
      FROM form_submissions fs
      LEFT JOIN forms f ON f.id = fs.form_id
      ORDER BY fs.submitted_at DESC
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// PUT /api/submissions/admin/:id/read – admin, mark as read
submissionsRouter.put('/admin/:id/read', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.prepare('UPDATE form_submissions SET is_read = 1 WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Odpověď nenalezena' });
    const updated = await db.prepare('SELECT * FROM form_submissions WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// DELETE /api/submissions/admin/:id – admin, delete submission
submissionsRouter.delete('/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.prepare('DELETE FROM form_submissions WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Odpověď nenalezena' });
    res.json({ message: 'Odpověď smazána' });
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

export default router;
