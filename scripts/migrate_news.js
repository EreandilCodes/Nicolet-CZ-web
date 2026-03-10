/**
 * News migration script — nicoletcz.cz → Nicolet CZ API
 *
 * - Elementor/WordPress aware selectors
 * - Caches posts/categories to avoid repeated API calls
 * - UPDATES existing posts (fixes already-migrated posts with empty content)
 * - Downloads cover + content images, uploads to gallery
 * - Pagination support for year archives
 *
 * Usage: node scripts/migrate_news.js
 * Server must be running on port 3003.
 */

import { load } from 'cheerio';
import { createWriteStream, existsSync, mkdirSync, rmSync } from 'fs';
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
const YEARS       = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
const TMP_DIR     = path.join(__dirname, '_tmp_images');

// ─── Stats ────────────────────────────────────────────────────────────────────
const stats = {
  yearsProcessed:    0,
  categoriesCreated: 0,
  postsCreated:      0,
  postsUpdated:      0,
  imagesImported:    0,
  failures:          [],
};

// ─── Caches ───────────────────────────────────────────────────────────────────
const cache = { categories: [], posts: [], galleryFolders: [] };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' a ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100);
}

function norm(str) { return String(str || '').replace(/\s+/g, ' ').trim(); }

function absUrl(url, base = SOURCE_BASE) {
  if (!url) return null;
  try { return new URL(url, base).href; } catch { return null; }
}

function guessExt(url) {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if (ext && ext.length <= 5) return ext;
  } catch {}
  return '.jpg';
}

function textFromHtml(html) {
  return norm(load(`<div>${html || ''}</div>`)('div').text());
}

function excerptFromHtml(html, max = 200) {
  const t = textFromHtml(html);
  return t.length > max ? t.slice(0, max - 1).trim() + '…' : t;
}

function uniqueBy(arr, fn) {
  const seen = new Set();
  return arr.filter(x => { const k = fn(x); if (seen.has(k)) return false; seen.add(k); return true; });
}

async function safeFetch(url, options = {}) {
  const res = await fetch(url, options);
  const ct = res.headers.get('content-type') || '';
  if (!res.ok) {
    const body = ct.includes('application/json') ? (await res.json()).error : await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res;
}

async function fetchJson(url, opts = {}) { return (await safeFetch(url, opts)).json(); }

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NicoletMigration/2.0)', Accept: 'text/html' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

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

// ─── API helpers ──────────────────────────────────────────────────────────────
async function login() {
  const data = await fetchJson(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS }),
  });
  console.log('✓ Logged in');
  return data.token;
}

async function loadCaches(token) {
  const h = { Authorization: `Bearer ${token}` };
  [cache.categories, cache.posts, cache.galleryFolders] = await Promise.all([
    fetchJson(`${API_BASE}/api/news-categories/admin/all`,   { headers: h }),
    fetchJson(`${API_BASE}/api/news/admin/all`,              { headers: h }),
    fetchJson(`${API_BASE}/api/gallery/folders/admin/all`,   { headers: h }),
  ]);
  console.log(`  Loaded: ${cache.categories.length} categories, ${cache.posts.length} posts, ${cache.galleryFolders.length} folders`);
}

async function ensureGalleryFolder(nameCz, token) {
  const match = cache.galleryFolders.find(f => norm(f.name_cz).toLowerCase() === nameCz.toLowerCase() && !f.parent_id);
  if (match) return match.id;
  const created = await fetchJson(`${API_BASE}/api/gallery/folders/admin`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name_cz: nameCz }),
  });
  cache.galleryFolders.push(created);
  console.log(`  + Gallery folder "${nameCz}" (id=${created.id})`);
  return created.id;
}

async function ensureNewsCategory(year, order, token) {
  const match = cache.categories.find(c => c.name_cz === String(year));
  if (match) return match.id;
  const created = await fetchJson(`${API_BASE}/api/news-categories/admin`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name_cz: String(year), name_en: String(year), slug: String(year), display_order: order, is_active: 1 }),
  });
  cache.categories.push(created);
  stats.categoriesCreated++;
  console.log(`  + Category ${year} (id=${created.id})`);
  return created.id;
}

// Returns existing post id or null
function findExistingPost(titleCz, categoryId) {
  const found = cache.posts.find(p =>
    norm(p.title_cz) === norm(titleCz) && String(p.category_id) === String(categoryId)
  );
  return found ? found.id : null;
}

// ─── Scraping — Archive ───────────────────────────────────────────────────────
function extractArticleLinks(html) {
  const $ = load(html);
  const links = [];

  // Elementor posts container
  $('.elementor-posts-container article, article.elementor-post').each((_, article) => {
    const href =
      absUrl($(article).find('.elementor-post__title a').first().attr('href')) ||
      absUrl($(article).find('.elementor-post__thumbnail__link').first().attr('href')) ||
      absUrl($(article).find('h2 a, h3 a').first().attr('href'));
    if (href) links.push(href);
  });

  // Generic WP archive patterns
  $('.entry-title a, .post-title a, article h2 a, article h3 a').each((_, el) => {
    const href = absUrl($(el).attr('href'));
    if (href) links.push(href);
  });

  return uniqueBy(
    links.filter(href =>
      href.startsWith(SOURCE_BASE + '/') &&
      !href.includes('/kategorie/') &&
      !href.includes('/en/') &&
      !href.includes('/author/') &&
      !href.includes('/tag/') &&
      !href.includes('/feed/') &&
      !href.includes('/page/') &&
      !href.includes('/wp-') &&
      !href.includes('sitemap') &&
      !href.endsWith('.xml')
    ),
    x => x
  );
}

async function getArchiveLinks(year) {
  const baseUrl = `${SOURCE_BASE}/kategorie/novinky/${year}/`;
  let html;
  try { html = await fetchHtml(baseUrl); } catch (err) {
    console.warn(`  ⚠ Archive ${year} failed: ${err.message}`);
    return [];
  }

  const links = new Set(extractArticleLinks(html));

  // Check pagination
  const $ = load(html);
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (href.startsWith(baseUrl + 'page/')) links.delete(href); // pagination links, not articles
  });

  // Also try page/2, page/3 if paginator exists
  const paginationLinks = [];
  $('a[href]').each((_, el) => {
    const href = absUrl($(el).attr('href'));
    if (href && href.match(new RegExp(`/kategorie/novinky/${year}/page/\\d+/?$`))) {
      paginationLinks.push(href);
    }
  });
  for (const pUrl of uniqueBy(paginationLinks, x => x)) {
    try {
      const ph = await fetchHtml(pUrl);
      for (const link of extractArticleLinks(ph)) links.add(link);
    } catch {}
  }

  return [...links];
}

// ─── Scraping — Article ───────────────────────────────────────────────────────

// Cleans a cheerio element: resolves image srcs, strips junk, strips classes/ids
function cleanElement($doc, $root) {
  // Work on a clone via html string
  const $c = load(`<div id="mig-root">${$doc.html($root)}</div>`);
  const $r = $c('#mig-root');

  // Remove junk
  $r.find([
    'script', 'style', 'noscript', 'nav', 'header', 'footer', 'form', 'aside',
    '.sharedaddy', '.jp-relatedposts', '.comments-area', '.post-navigation', '.navigation',
    '.elementor-widget-share-buttons', '.elementor-widget-social-icons',
    '.elementor-widget-post-navigation', '.elementor-widget-theme-post-title',
    '.elementor-widget-theme-post-excerpt', '.elementor-widget-theme-post-featured-image',
    '.elementor-widget-theme-post-info', '.elementor-location-header', '.elementor-location-footer',
    '.breadcrumbs', '.rank-math-breadcrumb',
  ].join(',')).remove();

  // Normalise images: resolve src, clean attrs
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

  // Normalise links: resolve href, strip decorative attrs
  $r.find('a[href]').each((_, a) => {
    const $a = $c(a);
    const href = absUrl($a.attr('href'));
    if (href) $a.attr('href', href);
    ['class', 'id', 'style', 'data-elementor-open-lightbox'].forEach(a => $a.removeAttr(a));
  });

  // Strip classes/ids/styles from all elements
  $r.find('*').each((_, el) => {
    $c(el).removeAttr('class').removeAttr('id').removeAttr('style')
      .removeAttr('data-id').removeAttr('data-element_type')
      .removeAttr('data-widget_type').removeAttr('data-settings');
  });

  return $r.html() || '';
}

// Score a candidate selector for content quality
function scoreCandidate($doc, selector) {
  const $el = $doc(selector).first();
  if (!$el.length) return { score: -1, html: '' };
  const html = cleanElement($doc, $el);
  const textLen = textFromHtml(html).length;
  if (textLen < 80) return { score: -1, html: '' };
  const $inner = load(`<div>${html}</div>`);
  const score = textLen
    + $inner('img').length * 200
    + $inner('p').length * 80
    + $inner('h2, h3, h4').length * 60;
  return { score, html };
}

function chooseBestContent($doc) {
  const candidates = [
    '.elementor-widget-theme-post-content .elementor-widget-container',
    '.elementor-widget-theme-post-content',
    'article .entry-content',
    '.entry-content',
    '.post-content',
    'main article',
    'article',
  ];

  const best = candidates
    .map(sel => ({ sel, ...scoreCandidate($doc, sel) }))
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)[0];

  if (best) return best.html;

  // Last resort: combine all text-editor blocks
  const blocks = [];
  $doc('.elementor-widget-text-editor .elementor-widget-container').each((_, el) => {
    const html = cleanElement($doc, $doc(el));
    const len = textFromHtml(html).length;
    if (len > 40) blocks.push({ html, len });
  });
  if (blocks.length) {
    blocks.sort((a, b) => b.len - a.len);
    return blocks[0].html;
  }
  return '';
}

async function scrapeArticle(url) {
  const html = await fetchHtml(url);
  const $ = load(html);

  // Title
  const titleCz =
    norm($('.elementor-widget-theme-post-title h1').first().text()) ||
    norm($('h1.entry-title').first().text()) ||
    norm($('article h1').first().text()) ||
    norm($('h1').first().text());
  if (!titleCz) throw new Error('No title found');

  // Date
  let publishedAt = null;
  const metaDate = $('meta[property="article:published_time"]').attr('content');
  if (metaDate) {
    publishedAt = metaDate;
  } else {
    const dt = $('time[datetime]').first().attr('datetime');
    if (dt) {
      publishedAt = dt;
    } else {
      const dateText = norm(
        $('.elementor-post-info__item--type-date').first().text() ||
        $('.entry-date').first().text() ||
        $('time').first().text()
      );
      const m = dateText.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
      if (m) publishedAt = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
  }

  // Cover image
  const coverImageSrc =
    absUrl($('meta[property="og:image"]').attr('content')) ||
    absUrl($('.elementor-widget-theme-post-featured-image img').first().attr('data-src')) ||
    absUrl($('.elementor-widget-theme-post-featured-image img').first().attr('src')) ||
    absUrl($('.post-thumbnail img').first().attr('src')) ||
    absUrl($('img.wp-post-image').first().attr('src')) ||
    null;

  // Content
  const contentHtml = chooseBestContent($);
  if (!contentHtml || textFromHtml(contentHtml).length < 60) {
    throw new Error('Content not found or too short');
  }

  // All image URLs found in content
  const $inner = load(`<div>${contentHtml}</div>`);
  const contentImageUrls = [];
  $inner('img[src]').each((_, img) => {
    const src = $inner(img).attr('src');
    if (src) contentImageUrls.push(src);
  });

  // Use first content image as cover fallback
  const effectiveCover = coverImageSrc || contentImageUrls[0] || null;

  return { titleCz, publishedAt, contentHtml, coverImageSrc: effectiveCover, contentImageUrls };
}

// ─── Image rewriting ──────────────────────────────────────────────────────────
async function rewriteImages(contentHtml, coverSrc, coverUrl, folderNovinky, token) {
  const $ = load(`<div id="root">${contentHtml}</div>`);
  const processed = new Map(); // original src → new url

  const imgs = [];
  $('#root img[src]').each((_, img) => imgs.push($(img).attr('src')));
  const unique = uniqueBy(imgs, x => x);

  for (const src of unique) {
    // Cover already uploaded — reuse its URL
    if (coverSrc && src === coverSrc && coverUrl) {
      processed.set(src, coverUrl);
      continue;
    }
    const ext = guessExt(src);
    const filename = `novinky-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const localPath = await downloadToTemp(src, filename);
    if (!localPath) continue;
    const newUrl = await uploadToGallery(localPath, folderNovinky, token);
    if (newUrl) processed.set(src, newUrl);
  }

  // Apply replacements
  $('#root img[src]').each((_, img) => {
    const $img = $(img);
    const newUrl = processed.get($img.attr('src'));
    if (newUrl) $img.attr('src', newUrl);
  });

  return $('#root').html() || contentHtml;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══ Nicolet CZ News Migration v2 ═══\n');

  const token = await login();
  const authH = { Authorization: `Bearer ${token}` };

  console.log('\n── Loading caches ──');
  await loadCaches(token);

  console.log('\n── Gallery folders ──');
  const folderHlavicky = await ensureGalleryFolder('hlavičky', token);
  const folderNovinky  = await ensureGalleryFolder('novinky',  token);
  console.log(`  IDs — hlavičky: ${folderHlavicky}, novinky: ${folderNovinky}`);

  for (let i = 0; i < YEARS.length; i++) {
    const year = YEARS[i];
    console.log(`\n══ Year ${year} ══`);

    const categoryId = await ensureNewsCategory(year, (i + 1) * 10, token);
    const links = await getArchiveLinks(year);
    console.log(`  Found ${links.length} article(s)`);
    if (!links.length) { console.log('  (skipping)'); continue; }

    stats.yearsProcessed++;

    for (const articleUrl of links) {
      console.log(`\n  → ${articleUrl}`);
      try {
        const article = await scrapeArticle(articleUrl);
        const existingId = findExistingPost(article.titleCz, categoryId);

        // Upload cover
        let coverUrl = null;
        if (article.coverImageSrc) {
          const ext = guessExt(article.coverImageSrc);
          const fname = `hlavicky-${slugify(article.titleCz).slice(0, 40)}-${Date.now()}${ext}`;
          const local = await downloadToTemp(article.coverImageSrc, fname);
          if (local) {
            coverUrl = await uploadToGallery(local, folderHlavicky, token);
            console.log(`    ✓ Cover: ${coverUrl || '(upload failed)'}`);
          }
        }

        // Rewrite content images
        const finalContent = await rewriteImages(
          article.contentHtml, article.coverImageSrc, coverUrl, folderNovinky, token
        );

        const slug    = slugify(article.titleCz);
        const excerpt = excerptFromHtml(finalContent, 200);
        const postData = {
          title_cz:     article.titleCz,
          title_en:     null,
          slug,
          content_cz:   finalContent,
          content_en:   null,
          excerpt_cz:   excerpt,
          excerpt_en:   null,
          cover_image:  coverUrl || null,
          cover_align:  'center',
          seo_title_cz: article.titleCz,
          seo_desc_cz:  excerpt.slice(0, 160),
          category_id:  categoryId,
          is_published: 1,
          published_at: article.publishedAt || `${year}-01-01`,
        };

        if (existingId) {
          // UPDATE existing post
          await fetchJson(`${API_BASE}/api/news/admin/${existingId}`, {
            method: 'PUT',
            headers: { ...authH, 'Content-Type': 'application/json' },
            body: JSON.stringify(postData),
          });
          stats.postsUpdated++;
          console.log(`    ✎ Updated: "${article.titleCz}"`);
        } else {
          // CREATE new post
          const created = await fetchJson(`${API_BASE}/api/news/admin`, {
            method: 'POST',
            headers: { ...authH, 'Content-Type': 'application/json' },
            body: JSON.stringify(postData),
          });
          cache.posts.push({ id: created.id, title_cz: article.titleCz, category_id: categoryId, slug });
          stats.postsCreated++;
          console.log(`    ✓ Created: "${article.titleCz}"`);
        }

        await new Promise(r => setTimeout(r, 400));
      } catch (err) {
        const msg = `${articleUrl}: ${err.message}`;
        console.error(`    ✗ FAILED: ${msg}`);
        stats.failures.push(msg);
      }
    }
  }

  console.log('\n\n═══ Migration Complete ═══');
  console.log(`  Years processed:    ${stats.yearsProcessed}`);
  console.log(`  Categories created: ${stats.categoriesCreated}`);
  console.log(`  Posts created:      ${stats.postsCreated}`);
  console.log(`  Posts updated:      ${stats.postsUpdated}`);
  console.log(`  Images imported:    ${stats.imagesImported}`);
  console.log(`  Failures:           ${stats.failures.length}`);
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
