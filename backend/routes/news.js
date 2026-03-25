import express from 'express';
import db from '../database.js';
import { AuthMiddleware } from '../middleware/auth.js';

const router = express.Router();

function generateSlug(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + `-${Date.now()}`;
}

// GET /api/news – public, published posts with category info (no full content)
router.get('/', async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT n.id, n.slug, n.title_cz, n.title_en,
             n.excerpt_cz, n.excerpt_en, n.cover_image,
             n.category_id, n.is_published, n.published_at, n.created_at,
             nc.name_cz AS category_name_cz, nc.name_en AS category_name_en
      FROM news_posts n
      LEFT JOIN news_categories nc ON nc.id = n.category_id
      WHERE n.is_published = 1 ORDER BY n.published_at DESC, n.id DESC
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// GET /api/news/admin/all – admin, all posts with category info
// NOTE: must be defined before /:slug to avoid being shadowed
router.get('/admin/all', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT n.*, nc.name_cz AS category_name_cz, nc.name_en AS category_name_en
      FROM news_posts n
      LEFT JOIN news_categories nc ON nc.id = n.category_id
      ORDER BY n.created_at DESC
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// GET /api/news/:slug – public, single published post with category
router.get('/:slug', async (req, res) => {
  try {
    const row = await db.prepare(`
      SELECT n.*, nc.name_cz AS category_name_cz, nc.name_en AS category_name_en
      FROM news_posts n
      LEFT JOIN news_categories nc ON nc.id = n.category_id
      WHERE n.slug = ? AND n.is_published = 1
    `).get(req.params.slug);
    if (!row) return res.status(404).json({ error: 'Článek nenalezen' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// POST /api/news/admin – admin, create post
router.post('/admin', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const {
      slug: slugInput, title_cz, title_en, content_cz, content_en,
      cover_image, cover_caption, cover_align, category_id,
      seo_title_cz, seo_title_en, seo_desc_cz, seo_desc_en,
      is_published
    } = req.body;

    if (!title_cz?.trim()) return res.status(400).json({ error: 'title_cz je povinné' });

    const slug = slugInput?.trim() ? slugInput.trim() : generateSlug(title_cz.trim());

    // Auto-generate excerpt from content (first 200 chars, strip HTML)
    const autoExcerpt = (content_cz || '').replace(/<[^>]*>/g, '').substring(0, 200).trim() || null;
    const autoExcerptEn = (content_en || '').replace(/<[^>]*>/g, '').substring(0, 200).trim() || null;

    const result = await db.prepare(`
      INSERT INTO news_posts (slug, title_cz, title_en, content_cz, content_en,
        excerpt_cz, excerpt_en, cover_image, cover_caption, cover_align, category_id,
        seo_title_cz, seo_title_en, seo_desc_cz, seo_desc_en,
        is_published, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      slug,
      title_cz.trim(),
      title_en?.trim() || null,
      content_cz?.trim() || null,
      content_en?.trim() || null,
      autoExcerpt,
      autoExcerptEn,
      cover_image?.trim() || null,
      cover_caption?.trim() || null,
      cover_align?.trim() || 'center',
      category_id || null,
      seo_title_cz?.trim() || null,
      seo_title_en?.trim() || null,
      seo_desc_cz?.trim() || null,
      seo_desc_en?.trim() || null,
      is_published ? 1 : 0,
      is_published ? new Date().toISOString() : null
    );

    const created = await db.prepare('SELECT * FROM news_posts WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    console.error('News POST error:', err);
    if (err.message?.includes('UNIQUE')) return res.status(400).json({ error: 'Slug již existuje' });
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// PUT /api/news/admin/:id – admin, update post
router.put('/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      slug, title_cz, title_en, content_cz, content_en,
      cover_image, cover_caption, cover_align, category_id,
      seo_title_cz, seo_title_en, seo_desc_cz, seo_desc_en,
      is_published
    } = req.body;

    if (!title_cz?.trim()) return res.status(400).json({ error: 'title_cz je povinné' });
    if (!slug?.trim()) return res.status(400).json({ error: 'slug je povinné' });

    // Auto-generate excerpt from content
    const autoExcerpt = (content_cz || '').replace(/<[^>]*>/g, '').substring(0, 200).trim() || null;
    const autoExcerptEn = (content_en || '').replace(/<[^>]*>/g, '').substring(0, 200).trim() || null;

    const result = await db.prepare(`
      UPDATE news_posts
      SET slug = ?, title_cz = ?, title_en = ?, content_cz = ?, content_en = ?,
          excerpt_cz = ?, excerpt_en = ?, cover_image = ?, cover_caption = ?, cover_align = ?,
          category_id = ?,
          seo_title_cz = ?, seo_title_en = ?, seo_desc_cz = ?, seo_desc_en = ?,
          is_published = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      slug.trim(),
      title_cz.trim(),
      title_en?.trim() || null,
      content_cz?.trim() || null,
      content_en?.trim() || null,
      autoExcerpt,
      autoExcerptEn,
      cover_image?.trim() || null,
      cover_caption?.trim() || null,
      cover_align?.trim() || 'center',
      category_id || null,
      seo_title_cz?.trim() || null,
      seo_title_en?.trim() || null,
      seo_desc_cz?.trim() || null,
      seo_desc_en?.trim() || null,
      is_published ? 1 : 0,
      id
    );

    if (result.changes === 0) return res.status(404).json({ error: 'Článek nenalezen' });
    const updated = await db.prepare('SELECT * FROM news_posts WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error('News PUT error:', err);
    if (err.message?.includes('UNIQUE')) return res.status(400).json({ error: 'Slug již existuje' });
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// DELETE /api/news/admin/:id – admin, delete post
router.delete('/admin/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.prepare('DELETE FROM news_posts WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Článek nenalezen' });
    res.json({ message: 'Článek smazán' });
  } catch (err) {
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

// PUT /api/news/admin/:id/publish – admin, toggle is_published
router.put('/admin/:id/publish', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const post = await db.prepare('SELECT * FROM news_posts WHERE id = ?').get(id);
    if (!post) return res.status(404).json({ error: 'Článek nenalezen' });

    const newPublished = post.is_published ? 0 : 1;
    const publishedAt = newPublished ? new Date().toISOString() : post.published_at;

    await db.prepare(`
      UPDATE news_posts SET is_published = ?, published_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(newPublished, publishedAt, id);

    const updated = await db.prepare('SELECT * FROM news_posts WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error('News publish error:', err);
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

export default router;
