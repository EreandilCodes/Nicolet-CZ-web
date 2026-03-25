/**
 * import-old-news.js
 * Migrates old news articles from OldWebData/ into the Nicolet CZ database.
 *
 * Usage:  node scripts/import-old-news.js
 *
 * What it does:
 *  - Finds all slug-based article folders in OldWebData/
 *  - Parses each index.html with cheerio
 *  - Extracts: title, content, date, images
 *  - Copies images to frontend/uploads/gallery/
 *  - Registers images in DB (cover → Hlavičky folder, body → Novinky folder)
 *  - Creates news categories per year if missing
 *  - Inserts news posts into DB
 *  - Safe to re-run – skips already-imported articles (by slug)
 */

import fs from 'fs';
import path from 'path';
import { load } from 'cheerio';
import { fileURLToPath } from 'url';
import db from '../backend/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');
const OLD_DATA   = path.join(ROOT, 'OldWebData');
const GALLERY    = path.join(ROOT, 'frontend', 'uploads', 'gallery');

// ── Folders in OldWebData/ that are NOT article folders ──────────────────────
const SKIP_DIRS = new Set([
  '2019','2020','2021','2022','2023','2024','2025','2026','12519',
  'en','app','wp','wp-json','feed',
]);

// ── Runtime stats ─────────────────────────────────────────────────────────────
const stats = { found: 0, imported: 0, skipped: 0, errors: 0 };

// ── In-process caches (avoid repeated DB lookups) ─────────────────────────────
const yearCatCache   = {};   // year  → category id
const folderIdCache  = {};   // name  → folder id
const imageUrlCache  = {};   // identifier → gallery url

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────────────────────

async function getOrCreateNewsCategory(year) {
  if (yearCatCache[year]) return yearCatCache[year];
  const nameCz = String(year);
  const existing = await db.prepare('SELECT id FROM news_categories WHERE name_cz = ?').get(nameCz);
  if (existing) { yearCatCache[year] = existing.id; return existing.id; }

  const slug   = `${year}-novinky`;
  const result = await db.prepare(`
    INSERT INTO news_categories (name_cz, name_en, slug, display_order, is_active)
    VALUES (?, ?, ?, ?, 1)
  `).run(nameCz, nameCz, slug, parseInt(year) - 2000);

  yearCatCache[year] = result.lastInsertRowid;
  console.log(`  📁 Created news category: ${year}`);
  return result.lastInsertRowid;
}

async function getOrCreateGalleryFolder(nameCz) {
  if (folderIdCache[nameCz]) return folderIdCache[nameCz];
  const existing = await db.prepare('SELECT id FROM gallery_folders WHERE name_cz = ?').get(nameCz);
  if (existing) { folderIdCache[nameCz] = existing.id; return existing.id; }

  const slug   = `${nameCz.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
  const result = await db.prepare(`
    INSERT INTO gallery_folders (name_cz, slug, display_order)
    VALUES (?, ?, 0)
  `).run(nameCz, slug);

  folderIdCache[nameCz] = result.lastInsertRowid;
  console.log(`  📂 Created gallery folder: ${nameCz}`);
  return result.lastInsertRowid;
}

// ─────────────────────────────────────────────────────────────────────────────
// Image helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Given an image src (absolute nicoletcz.cz URL), find the local file.
 * Handles size-suffixed filenames like image-300x235.jpg → image.jpg.
 */
function resolveLocalImage(src) {
  // Accept both full URLs and root-relative paths
  const urlPath = src
    .replace(/^https?:\/\/nicoletcz\.cz\//, '')
    .replace(/^\//, '');

  let local = path.join(OLD_DATA, urlPath);
  if (fs.existsSync(local)) return local;

  // Strip WP size suffix: foo-300x235.jpg → foo.jpg
  const stripped = local.replace(/-\d+x\d+(\.[^.]+)$/, '$1');
  if (fs.existsSync(stripped)) return stripped;

  return null;
}

/**
 * Import a single image into the gallery.
 * Returns the gallery URL or null if image not found.
 * Deduplicates by identifier (derived from original URL).
 */
async function importImage(src, folderId) {
  if (!src || !(src.includes('nicoletcz.cz') || src.startsWith('/app/uploads'))) return null;

  // Build a stable identifier from the URL path portion
  const urlKey   = src.replace(/^https?:\/\/nicoletcz\.cz/, '').replace(/[^a-zA-Z0-9._-]/g, '-');
  const cacheKey = urlKey.slice(-120);

  if (imageUrlCache[cacheKey]) return imageUrlCache[cacheKey];

  // Check DB
  const existing = await db.prepare(
    'SELECT image_url FROM gallery_images WHERE identifier = ?'
  ).get(cacheKey);
  if (existing) {
    imageUrlCache[cacheKey] = existing.image_url;
    return existing.image_url;
  }

  // Locate local file
  const localPath = resolveLocalImage(src);
  if (!localPath) {
    console.warn(`    ⚠️  Local file not found: ${src}`);
    return null;
  }

  // Copy to gallery uploads dir
  const ext      = path.extname(localPath).toLowerCase();
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
  const destPath = path.join(GALLERY, filename);
  fs.copyFileSync(localPath, destPath);

  const galleryUrl = `/uploads/gallery/${filename}`;

  await db.prepare(`
    INSERT INTO gallery_images (folder_id, image_url, identifier, display_order)
    VALUES (?, ?, ?, 0)
  `).run(folderId, galleryUrl, cacheKey);

  imageUrlCache[cacheKey] = galleryUrl;
  return galleryUrl;
}

// ─────────────────────────────────────────────────────────────────────────────
// Content helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strip HTML tags, decode basic entities, trim whitespace → plain text excerpt.
 */
function stripHtml(html) {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main article processor
// ─────────────────────────────────────────────────────────────────────────────

async function processArticle(folderPath, slug) {
  const htmlPath = path.join(folderPath, 'index.html');
  if (!fs.existsSync(htmlPath)) return;

  const html = fs.readFileSync(htmlPath, 'utf8');
  const $    = load(html);

  // Only migrate actual articles
  const ogType = $('meta[property="og:type"]').attr('content');
  if (ogType !== 'article') {
    stats.skipped++;
    return;
  }

  // ── Deduplication ──
  const existing = await db.prepare('SELECT id FROM news_posts WHERE slug = ?').get(slug);
  if (existing) {
    console.log(`  ⏭️  Skip (already exists): ${slug}`);
    stats.skipped++;
    return;
  }

  // ── Title ──
  let title = $('meta[property="og:title"]').attr('content')
           || $('title').text()
           || slug;
  title = title.replace(/\s*[-–|]\s*Nicolet CZ\s*$/i, '').trim();

  // ── Date ──
  const publishedTimeStr = $('meta[property="article:published_time"]').attr('content')
                        || $('meta[property="og:updated_time"]').attr('content');
  if (!publishedTimeStr) {
    console.warn(`  ⚠️  No date found for ${slug}, skipping`);
    stats.skipped++;
    return;
  }
  const publishedDate = new Date(publishedTimeStr);
  const year          = publishedDate.getFullYear();
  const publishedAt   = publishedDate.toISOString().replace('T', ' ').slice(0, 19);

  // ── Category ──
  const categoryId = await getOrCreateNewsCategory(year);

  // ── Gallery folders ──
  const hlavickyId = await getOrCreateGalleryFolder('Hlavičky');
  const novinkyId  = await getOrCreateGalleryFolder('Novinky');

  // ── Cover image (og:image) ──
  const coverSrc = $('meta[property="og:image"]').attr('content');
  let coverGalleryUrl = null;
  if (coverSrc) {
    coverGalleryUrl = await importImage(coverSrc, hlavickyId);
  }

  // ── Article content ──
  let contentEl = $('.elementor-widget-theme-post-content');
  if (!contentEl.length) contentEl = $('.entry-content');
  if (!contentEl.length) contentEl = $('article .elementor-widget-container').first();
  if (!contentEl.length) contentEl = $('article').first();

  if (!contentEl.length) {
    console.warn(`  ⚠️  No article content found in ${slug}`);
    stats.skipped++;
    return;
  }

  // ── Body images: import & replace src ──
  const bodyImgs = contentEl.find('img');
  for (let i = 0; i < bodyImgs.length; i++) {
    const img = $(bodyImgs[i]);
    const src = img.attr('src') || '';
    if (src.includes('nicoletcz.cz') || src.startsWith('/app/uploads')) {
      const newUrl = await importImage(src, novinkyId);
      if (newUrl) img.attr('src', newUrl);
    }
    // Remove WP responsive-image attributes
    img.removeAttr('srcset');
    img.removeAttr('sizes');
    img.removeAttr('loading');
    img.removeAttr('decoding');
  }

  const contentHtml = contentEl.html() || '';
  const excerptCz   = stripHtml(contentHtml);

  // ── Insert news post ──
  await db.prepare(`
    INSERT INTO news_posts
      (slug, title_cz, content_cz, excerpt_cz, cover_image, cover_align,
       category_id, is_published, published_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'center', ?, 1, ?, datetime('now'), datetime('now'))
  `).run(
    slug, title, contentHtml, excerptCz,
    coverGalleryUrl, categoryId, publishedAt
  );

  console.log(`  ✅ Imported: ${slug}  (${year}-${String(publishedDate.getMonth()+1).padStart(2,'0')}-${String(publishedDate.getDate()).padStart(2,'0')})`);
  stats.imported++;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Nicolet CZ – import old news\n');
  console.log(`Source: ${OLD_DATA}`);
  console.log(`Gallery: ${GALLERY}\n`);

  if (!fs.existsSync(GALLERY)) fs.mkdirSync(GALLERY, { recursive: true });

  // Find all potential article dirs
  const entries = fs.readdirSync(OLD_DATA, { withFileTypes: true });
  const articleDirs = entries.filter(e =>
    e.isDirectory() &&
    !SKIP_DIRS.has(e.name) &&
    fs.existsSync(path.join(OLD_DATA, e.name, 'index.html'))
  );

  stats.found = articleDirs.length;
  console.log(`📂 Potential article folders: ${stats.found}\n`);

  for (const entry of articleDirs) {
    try {
      await processArticle(path.join(OLD_DATA, entry.name), entry.name);
    } catch (err) {
      console.error(`  ❌ Error [${entry.name}]: ${err.message}`);
      stats.errors++;
    }
  }

  console.log('\n' + '─'.repeat(50));
  console.log('📊 Import summary:');
  console.log(`   Folders found:   ${stats.found}`);
  console.log(`   Articles imported: ${stats.imported}`);
  console.log(`   Skipped:           ${stats.skipped}`);
  console.log(`   Errors:            ${stats.errors}`);
  console.log('─'.repeat(50));

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
