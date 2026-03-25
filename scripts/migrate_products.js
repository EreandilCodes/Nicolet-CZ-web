/**
 * Product migration script — OldWebData/produkt/ → Nicolet CZ API
 *
 * - Reads local HTML files from OldWebData/produkt/
 * - Skips 404 pages ("Stránka nenalezena")
 * - Extracts: title (og:title), thumbnail (og:image), "O přístroji" tab content
 * - For products without tabs: uses the main text-editor blocks
 * - Creates gallery folder "Přístroje" and uploads all images there
 * - Sets thumbnail_url on each product
 *
 * Usage: node --require ./scripts/polyfill-node18.cjs scripts/migrate_products.js
 * Server must be running on port 3003.
 */

import { load } from 'cheerio';
import { createWriteStream, existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'fs';
import { unlink, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ───────────────────────────────────────────────────────────────────
const API_BASE    = 'http://localhost:3003';
const SOURCE_BASE = 'https://nicoletcz.cz';
const ADMIN_EMAIL = 'admin@nicolet.cz';
const ADMIN_PASS  = 'admin123';
const PRODUCTS_DIR = path.join(__dirname, '../OldWebData/produkt');
const TMP_DIR      = path.join(__dirname, '_tmp_images');

// ─── Stats ────────────────────────────────────────────────────────────────────
const stats = {
  total: 0, skipped404: 0, created: 0, updated: 0, imagesImported: 0, failures: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function slugify(str) {
  return String(str || '')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\+/g, '-plus')   // preserve + as -plus (avoids slug collisions)
    .replace(/&/g, ' a ').replace(/[^a-z0-9\s-]/g, ' ').trim()
    .replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    .substring(0, 100);
}

function norm(str) { return String(str || '').replace(/\s+/g, ' ').trim(); }

function absUrl(url) {
  if (!url) return null;
  try { return new URL(url, SOURCE_BASE).href; } catch { return null; }
}

function guessExt(url) {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if (ext && ext.length <= 5 && ext !== '.') return ext;
  } catch {}
  return '.jpg';
}

function textFromHtml(html) {
  return norm(load(`<div>${html || ''}</div>`)('div').text());
}

function uniqueBy(arr, fn) {
  const seen = new Set();
  return arr.filter(x => { const k = fn(x); if (seen.has(k)) return false; seen.add(k); return true; });
}

// ─── API helpers ──────────────────────────────────────────────────────────────
async function safeFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  const ct = res.headers.get('content-type') || '';
  if (!res.ok) {
    const body = ct.includes('json') ? (await res.json()).error : await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res;
}
async function fetchJson(url, opts = {}) { return (await safeFetch(url, opts)).json(); }

async function login() {
  const data = await fetchJson(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS }),
  });
  console.log('✓ Logged in');
  return data.token;
}

// ─── Image helpers ────────────────────────────────────────────────────────────
async function downloadToTemp(remoteUrl, filename) {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
  const localPath = path.join(TMP_DIR, filename);
  try {
    const res = await fetch(remoteUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NicoletMigration/2.0)', Referer: SOURCE_BASE },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(localPath));
    return localPath;
  } catch (err) {
    console.warn(`    ⚠ Download failed ${remoteUrl}: ${err.message}`);
    return null;
  }
}

async function uploadToGallery(localPath, folderId, token) {
  try {
    const buf  = await readFile(localPath);
    const ext  = path.extname(localPath).slice(1).toLowerCase() || 'jpg';
    const mime = { png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' }[ext] || 'image/jpeg';
    const form = new FormData();
    form.append('image', new Blob([buf], { type: mime }), path.basename(localPath));
    if (folderId) form.append('folder_id', String(folderId));
    const res = await fetch(`${API_BASE}/api/gallery/images/admin/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok) throw new Error(ct.includes('json') ? (await res.json()).error : await res.text());
    const data = await res.json();
    stats.imagesImported++;
    return data.image_url || data.url || null;
  } catch (err) {
    console.warn(`    ⚠ Upload failed ${path.basename(localPath)}: ${err.message}`);
    return null;
  } finally {
    try { await unlink(localPath); } catch {}
  }
}

async function ensureGalleryFolder(nameCz, token) {
  const folders = await fetchJson(`${API_BASE}/api/gallery/folders/admin/all`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const existing = folders.find(f => norm(f.name_cz) === nameCz && !f.parent_id);
  if (existing) return existing.id;
  const created = await fetchJson(`${API_BASE}/api/gallery/folders/admin`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name_cz: nameCz }),
  });
  console.log(`  + Gallery folder "${nameCz}" (id=${created.id})`);
  return created.id;
}

// ─── HTML parsing ─────────────────────────────────────────────────────────────

// Priority order for tab content IDs (first match wins)
const CONTENT_TAB_IDS = ['o-pstroji-tab', 'pehled-tab', 'o-pstrojch-tab', 'o-psluenstv-tab'];

// Junk selectors to remove from content
const JUNK_SELECTORS = [
  'script', 'style', 'noscript', 'nav', 'header', 'footer', 'form', 'aside',
  '.elementor-widget-share-buttons', '.elementor-widget-social-icons',
  '.elementor-widget-post-navigation', '.elementor-widget-theme-post-title',
  '.elementor-widget-theme-post-excerpt', '.elementor-widget-theme-post-featured-image',
  '.elementor-widget-theme-post-info', '.elementor-location-header', '.elementor-location-footer',
  '.breadcrumbs', '.rank-math-breadcrumb', '.sharedaddy', '.jp-relatedposts',
  '.elementor-widget-call-to-action',
].join(',');

function cleanHtml($, $root) {
  const $c = load(`<div id="root">${$.html($root)}</div>`);
  const $r = $c('#root');

  $r.find(JUNK_SELECTORS).remove();

  // Normalise images
  $r.find('img').each((_, img) => {
    const $img = $c(img);
    const src = absUrl(
      $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src') ||
      $img.attr('data-orig-file') || $img.attr('data-large_image')
    );
    $img.attr('src', src || '');
    ['srcset', 'data-src', 'data-lazy-src', 'data-orig-file', 'data-large_image',
     'loading', 'decoding', 'class', 'id', 'style', 'sizes', 'width', 'height'].forEach(a => $img.removeAttr(a));
    if (!src) $img.remove();
  });

  // Normalise links
  $r.find('a[href]').each((_, a) => {
    const $a = $c(a);
    const href = absUrl($a.attr('href'));
    if (href) $a.attr('href', href);
    ['class', 'id', 'style', 'data-elementor-open-lightbox'].forEach(a => $a.removeAttr(a));
  });

  // Strip all class/id/style from elements
  $r.find('*').each((_, el) => {
    $c(el).removeAttr('class').removeAttr('id').removeAttr('style')
      .removeAttr('data-id').removeAttr('data-element_type')
      .removeAttr('data-widget_type').removeAttr('data-settings');
  });

  return $r.html() || '';
}

function parseProduct(html) {
  const $ = load(html);

  // Title from og:title (strip " - Nicolet CZ" suffix)
  const ogTitle = $('meta[property="og:title"]').attr('content') || '';
  const titleTag = $('title').text() || '';
  const rawTitle = ogTitle || titleTag;
  const title = rawTitle.replace(/\s*[-–]\s*Nicolet CZ\s*$/i, '').trim();

  // Skip 404 pages
  if (!title || /stránka nenalezena/i.test(title)) return null;

  // Thumbnail from og:image
  const thumbnailSrc = absUrl($('meta[property="og:image"]').attr('content') || '');

  // Content — try tabs in priority order first
  let contentHtml = '';

  for (const tabId of CONTENT_TAB_IDS) {
    const $tab = $(`#${tabId}`);
    if ($tab.length) {
      contentHtml = cleanHtml($, $tab);
      if (textFromHtml(contentHtml).length > 60) break;
      contentHtml = '';
    }
  }

  // Fallback for no-tab products: concatenate text-editor blocks
  if (!contentHtml) {
    const blocks = [];
    $('.elementor-widget-text-editor .elementor-widget-container').each((_, el) => {
      const cleaned = cleanHtml($, $(el));
      const text = textFromHtml(cleaned);
      // Skip tiny blocks and contact-form-like content
      if (text.length > 80 && !/váš titul|jméno a p/i.test(text)) {
        blocks.push({ cleaned, len: text.length });
      }
    });
    if (blocks.length) {
      // Take the largest 2 blocks (main description)
      blocks.sort((a, b) => b.len - a.len);
      contentHtml = blocks.slice(0, 2).map(b => b.cleaned).join('\n');
    }
  }

  // SEO description
  const seoDesc = norm($('meta[name="description"]').attr('content') || '');
  const excerpt = seoDesc || textFromHtml(contentHtml).slice(0, 200);

  return { title, thumbnailSrc, contentHtml, excerpt };
}

// ─── Image rewriting in content ───────────────────────────────────────────────
async function rewriteContentImages(contentHtml, thumbnailSrc, thumbnailUrl, folderId, token) {
  const $ = load(`<div id="root">${contentHtml}</div>`);
  const srcs = [];
  $('#root img[src]').each((_, img) => srcs.push($(img).attr('src')));
  const unique = uniqueBy(srcs, x => x);
  const map = new Map();

  for (const src of unique) {
    // Reuse already-uploaded thumbnail
    if (thumbnailSrc && src === thumbnailSrc && thumbnailUrl) {
      map.set(src, thumbnailUrl);
      continue;
    }
    const ext = guessExt(src);
    const fname = `pristroje-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const local = await downloadToTemp(src, fname);
    if (!local) continue;
    const newUrl = await uploadToGallery(local, folderId, token);
    if (newUrl) map.set(src, newUrl);
  }

  $('#root img[src]').each((_, img) => {
    const $img = $(img);
    const newUrl = map.get($img.attr('src'));
    if (newUrl) $img.attr('src', newUrl);
  });

  return $('#root').html() || contentHtml;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══ Nicolet CZ Product Migration ═══\n');

  const token = await login();
  const authH = { Authorization: `Bearer ${token}` };

  console.log('\n── Gallery folder ──');
  const folderId = await ensureGalleryFolder('Přístroje', token);
  console.log(`  Folder "Přístroje" id=${folderId}`);

  console.log('\n── Loading existing products ──');
  const existing = await fetchJson(`${API_BASE}/api/products/admin/all`, { headers: authH });
  const existingMap = new Map(existing.map(p => [norm(p.name_cz), p.id]));
  console.log(`  ${existing.length} existing products`);

  // Enumerate product directories
  const dirs = readdirSync(PRODUCTS_DIR)
    .filter(name => statSync(path.join(PRODUCTS_DIR, name)).isDirectory())
    .sort();

  console.log(`\n── Processing ${dirs.length} product directories ──\n`);

  for (const dirName of dirs) {
    const htmlPath = path.join(PRODUCTS_DIR, dirName, 'index.html');
    if (!existsSync(htmlPath)) continue;

    stats.total++;
    const html = await readFile(htmlPath, 'utf8');
    const parsed = parseProduct(html);

    if (!parsed) {
      stats.skipped404++;
      console.log(`  ✗ Skip (404): ${dirName}`);
      continue;
    }

    const { title, thumbnailSrc, contentHtml, excerpt } = parsed;
    console.log(`\n→ ${dirName}`);
    console.log(`  Title: ${title}`);

    try {
      // Upload thumbnail
      let thumbnailUrl = null;
      if (thumbnailSrc) {
        const ext = guessExt(thumbnailSrc);
        const fname = `pristroj-${slugify(title).slice(0, 40)}-${Date.now()}${ext}`;
        const local = await downloadToTemp(thumbnailSrc, fname);
        if (local) {
          thumbnailUrl = await uploadToGallery(local, folderId, token);
          console.log(`  ✓ Thumbnail: ${thumbnailUrl || '(upload failed)'}`);
        }
      }

      // Rewrite content images
      const finalContent = contentHtml
        ? await rewriteContentImages(contentHtml, thumbnailSrc, thumbnailUrl, folderId, token)
        : '';

      const slug = slugify(title);
      const productData = {
        name_cz:       title,
        name_en:       null,
        slug,
        description_cz: finalContent || null,
        description_en: null,
        spec_cz:        null,
        spec_en:        null,
        images_json:    '[]',
        thumbnail_url:  thumbnailUrl || null,
        is_published:   1,
        is_featured:    0,
        display_order:  0,
        seo_title_cz:   title,
        seo_desc_cz:    excerpt.slice(0, 160) || null,
        category_ids:   [],
        application_ids: [],
      };

      const existingId = existingMap.get(norm(title));
      if (existingId) {
        await fetchJson(`${API_BASE}/api/products/admin/${existingId}`, {
          method: 'PUT',
          headers: { ...authH, 'Content-Type': 'application/json' },
          body: JSON.stringify(productData),
        });
        stats.updated++;
        console.log(`  ✎ Updated: "${title}"`);
      } else {
        const created = await fetchJson(`${API_BASE}/api/products/admin`, {
          method: 'POST',
          headers: { ...authH, 'Content-Type': 'application/json' },
          body: JSON.stringify(productData),
        });
        existingMap.set(norm(title), created.id);
        stats.created++;
        console.log(`  ✓ Created: "${title}"`);
      }

      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      const msg = `${dirName} (${title}): ${err.message}`;
      console.error(`  ✗ FAILED: ${msg}`);
      stats.failures.push(msg);
    }
  }

  console.log('\n\n═══ Migration Complete ═══');
  console.log(`  Total dirs:      ${stats.total}`);
  console.log(`  Skipped (404):   ${stats.skipped404}`);
  console.log(`  Created:         ${stats.created}`);
  console.log(`  Updated:         ${stats.updated}`);
  console.log(`  Images imported: ${stats.imagesImported}`);
  console.log(`  Failures:        ${stats.failures.length}`);
  if (stats.failures.length) {
    console.log('\n  Failed:');
    stats.failures.forEach(f => console.log(`    - ${f}`));
  }

  try { if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
}

main().catch(err => {
  console.error('\n✗ Migration aborted:', err);
  process.exit(1);
});
