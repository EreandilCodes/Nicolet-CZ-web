import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import db from '../database.js';
import { AuthMiddleware } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '../../frontend/uploads/gallery');

// Ensure upload directory exists
try {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
} catch (e) { /* already exists */ }

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_EXT  = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, unique);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_MIME.has(file.mimetype) && ALLOWED_EXT.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Nepodporovaný formát souboru'));
    }
  }
});

function generateSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + `-${Date.now()}`;
}

// ─── Public folder routes ─────────────────────────────────────────────────────

// GET /api/gallery/folders – public, all folders
router.get('/folders', async (req, res) => {
  try {
    const rows = await db.prepare(
      'SELECT * FROM gallery_folders ORDER BY display_order, id'
    ).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// GET /api/gallery/folders/admin/all – admin, all folders
// NOTE: must be defined before /folders/:id (if such route existed)
router.get('/folders/admin/all', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const rows = await db.prepare(
      'SELECT * FROM gallery_folders ORDER BY display_order, id'
    ).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// POST /api/gallery/folders/admin – admin, create folder
router.post('/folders/admin', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { name_cz, name_en, slug: slugInput, parent_id, display_order } = req.body;
    if (!name_cz?.trim()) return res.status(400).json({ error: 'name_cz je povinné' });

    const slug = slugInput?.trim() ? slugInput.trim() : generateSlug(name_cz.trim());

    const result = await db.prepare(`
      INSERT INTO gallery_folders (name_cz, name_en, slug, parent_id, display_order)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      name_cz.trim(),
      name_en?.trim() || null,
      slug,
      parent_id || null,
      Number(display_order) || 0
    );

    const created = await db.prepare('SELECT * FROM gallery_folders WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    console.error('GalleryFolders POST error:', err);
    if (err.message?.includes('UNIQUE')) return res.status(400).json({ error: 'Slug již existuje' });
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// PUT /api/gallery/folders/admin/:id – admin, update folder
router.put('/folders/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { name_cz, name_en, slug, parent_id, display_order } = req.body;
    if (!name_cz?.trim()) return res.status(400).json({ error: 'name_cz je povinné' });
    if (!slug?.trim()) return res.status(400).json({ error: 'slug je povinné' });

    const result = await db.prepare(`
      UPDATE gallery_folders
      SET name_cz = ?, name_en = ?, slug = ?, parent_id = ?, display_order = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name_cz.trim(),
      name_en?.trim() || null,
      slug.trim(),
      parent_id || null,
      Number(display_order) || 0,
      id
    );

    if (result.changes === 0) return res.status(404).json({ error: 'Složka nenalezena' });
    const updated = await db.prepare('SELECT * FROM gallery_folders WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error('GalleryFolders PUT error:', err);
    if (err.message?.includes('UNIQUE')) return res.status(400).json({ error: 'Slug již existuje' });
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// DELETE /api/gallery/folders/admin/:id – admin, delete folder (check no images)
router.delete('/folders/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const imageCount = await db.prepare(
      'SELECT COUNT(*) as count FROM gallery_images WHERE folder_id = ?'
    ).get(id);
    if (imageCount.count > 0) {
      return res.status(400).json({ error: 'Složka obsahuje obrázky. Nejdříve je přesuňte nebo smažte.' });
    }

    const result = await db.prepare('DELETE FROM gallery_folders WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Složka nenalezena' });
    res.json({ message: 'Složka smazána' });
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// ─── Public image routes ──────────────────────────────────────────────────────

// GET /api/gallery/images – public, all images (optional ?folder_id)
router.get('/images', async (req, res) => {
  try {
    let rows;
    if (req.query.folder_id) {
      rows = await db.prepare(
        'SELECT * FROM gallery_images WHERE folder_id = ? ORDER BY id DESC'
      ).all(req.query.folder_id);
    } else {
      rows = await db.prepare(
        'SELECT * FROM gallery_images ORDER BY id DESC'
      ).all();
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// GET /api/gallery/images/admin/all – admin, all images (optional ?folder_id=N)
router.get('/images/admin/all', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    let rows;
    if (req.query.folder_id !== undefined) {
      const fid = req.query.folder_id;
      rows = await db.prepare(
        'SELECT * FROM gallery_images WHERE folder_id = ? ORDER BY id DESC'
      ).all(fid || null);
    } else {
      rows = await db.prepare(
        'SELECT * FROM gallery_images ORDER BY id DESC'
      ).all();
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// POST /api/gallery/images/admin/upload – admin, upload image via multer
router.post(
  '/images/admin/upload',
  AuthMiddleware.verifyToken,
  AuthMiddleware.adminOnly,
  (req, res, next) => {
    upload.single('image')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || 'Chyba nahrávání' });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Žádný soubor nebyl nahrán' });

      const filename = req.file.filename;
      const ext = path.extname(filename);
      const baseName = path.basename(filename, ext);
      const identifier = `${baseName}-${Date.now()}`;
      const image_url = `/uploads/gallery/${filename}`;

      const {
        folder_id, title_cz, title_en, description_cz, description_en,
        tags, display_order
      } = req.body;

      const result = await db.prepare(`
        INSERT INTO gallery_images (folder_id, image_url, identifier, title_cz, title_en,
          description_cz, description_en, tags, display_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        folder_id || null,
        image_url,
        identifier,
        title_cz?.trim() || null,
        title_en?.trim() || null,
        description_cz?.trim() || null,
        description_en?.trim() || null,
        tags?.trim() || null,
        Number(display_order) || 0
      );

      const created = await db.prepare('SELECT * FROM gallery_images WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json(created);
    } catch (err) {
      console.error('Gallery upload error:', err);
      res.status(500).json({ error: 'Chyba serveru' });
    }
  }
);

// POST /api/gallery/images/admin – admin, create image record (URL only, no file)
router.post('/images/admin', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const {
      folder_id, image_url, identifier: identifierInput, title_cz, title_en,
      description_cz, description_en, tags, display_order
    } = req.body;

    if (!image_url?.trim()) return res.status(400).json({ error: 'image_url je povinné' });

    const identifier = identifierInput?.trim() || `img-${Date.now()}`;

    const result = await db.prepare(`
      INSERT INTO gallery_images (folder_id, image_url, identifier, title_cz, title_en,
        description_cz, description_en, tags, display_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      folder_id || null,
      image_url.trim(),
      identifier,
      title_cz?.trim() || null,
      title_en?.trim() || null,
      description_cz?.trim() || null,
      description_en?.trim() || null,
      tags?.trim() || null,
      Number(display_order) || 0
    );

    const created = await db.prepare('SELECT * FROM gallery_images WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    console.error('GalleryImages POST error:', err);
    if (err.message?.includes('UNIQUE')) return res.status(400).json({ error: 'Identifikátor již existuje' });
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// PUT /api/gallery/images/admin/:id – admin, update image
router.put('/images/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      folder_id, image_url, title_cz, title_en,
      description_cz, description_en, tags, display_order
    } = req.body;

    if (!image_url?.trim()) return res.status(400).json({ error: 'image_url je povinné' });

    const result = await db.prepare(`
      UPDATE gallery_images
      SET folder_id = ?, image_url = ?, title_cz = ?, title_en = ?,
          description_cz = ?, description_en = ?, tags = ?, display_order = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      folder_id || null,
      image_url.trim(),
      title_cz?.trim() || null,
      title_en?.trim() || null,
      description_cz?.trim() || null,
      description_en?.trim() || null,
      tags?.trim() || null,
      Number(display_order) || 0,
      id
    );

    if (result.changes === 0) return res.status(404).json({ error: 'Obrázek nenalezen' });
    const updated = await db.prepare('SELECT * FROM gallery_images WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error('GalleryImages PUT error:', err);
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// DELETE /api/gallery/images/admin/:id – admin, delete image + disk file
router.delete('/images/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const image = await db.prepare('SELECT * FROM gallery_images WHERE id = ?').get(id);
    if (!image) return res.status(404).json({ error: 'Obrázek nenalezen' });

    const result = await db.prepare('DELETE FROM gallery_images WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Obrázek nenalezen' });

    // Delete file from disk if it's in /uploads/gallery/
    if (image.image_url?.startsWith('/uploads/gallery/')) {
      const filename = path.basename(image.image_url);
      const filePath = path.join(UPLOAD_DIR, filename);
      try {
        fs.unlinkSync(filePath);
      } catch (e) { /* file may not exist, non-critical */ }
    }

    res.json({ message: 'Obrázek smazán' });
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// PUT /api/gallery/images/admin/:id/move – admin, move image to different folder
router.put('/images/admin/:id/move', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { folder_id } = req.body;

    const result = await db.prepare(`
      UPDATE gallery_images SET folder_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(folder_id || null, id);

    if (result.changes === 0) return res.status(404).json({ error: 'Obrázek nenalezen' });
    const updated = await db.prepare('SELECT * FROM gallery_images WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error('GalleryImages move error:', err);
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

export default router;
