/**
 * Retry script — re-processes failed article URLs from migration.
 * Reads failed URLs from stdin or hardcoded list.
 * Uses longer delays to avoid rate-limiting.
 *
 * Usage: node scripts/migrate_news_retry.js
 */

import { load } from 'cheerio';
import { createWriteStream, existsSync, mkdirSync, rmSync } from 'fs';
import { unlink, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_BASE    = 'http://localhost:3003';
const SOURCE_BASE = 'https://nicoletcz.cz';
const ADMIN_EMAIL = 'admin@nicolet.cz';
const ADMIN_PASS  = 'admin123';
const TMP_DIR     = path.join(__dirname, '_tmp_images');

// Delay between article requests (ms) — higher than main script to avoid throttling
const ARTICLE_DELAY = 2000;

// Retry count per article
const MAX_RETRIES = 3;

const FAILED_URLS = [
  'https://nicoletcz.cz/12519/',
  'https://nicoletcz.cz/afm-raman-a-s-snom-ziva-ukazka-analyzy-2d-materialu/',
  'https://nicoletcz.cz/analyza-extracelularnich-vezikulu-pomoci-ramanovy-spektroskopie-s-realnym-potlacenim-fluorescence/',
  'https://nicoletcz.cz/analyza-nanoplastu-pomoci-ftir-snom-technologie-s-rozlisenim-10-nanometru/',
  'https://nicoletcz.cz/analyza-piva-od-sladu-az-po-sklenici/',
  'https://nicoletcz.cz/analyza-vitaminu-c-pomoci-ft-nir-spektroskopie/',
  'https://nicoletcz.cz/casove-rozlisena-ramanova-spektroskopie-za-vysokych-teplot/',
  'https://nicoletcz.cz/cesko-slovenska-spektroskopicka-konference-2024/',
  'https://nicoletcz.cz/chytre-pivo-zacina-v-nicoletu/',
  'https://nicoletcz.cz/dokonaly-dousek-jak-zajistit-nejvyssi-kvalitu-napoju-pomoci-ft-ir-spektroskopie/',
  'https://nicoletcz.cz/afm-raman-a-s-snom-ziva-ukazka-analyzy-2d-materialu/',
  'https://nicoletcz.cz/ft-ir-spektrometr-nicolet-apex-a-ramanuv-spektrometr-marqmetrix/',
  'https://nicoletcz.cz/kontrola-kvality-3d-laseroveho-mikrotisku-pomoci-ir-snom-nanoskopie/',
  'https://nicoletcz.cz/laborexpo-2024/',
  'https://nicoletcz.cz/monitorovani-polymerni-extruze-v-realnem-case-pomoci-ramanova-spektroskopu-marqmetrix/',
  'https://nicoletcz.cz/novinka-2026-ramanuv-a-fotoluminiscencni-spektrometr-monovista-crs%c2%b3-core/',
  'https://nicoletcz.cz/novinka-pro-rok-2026-dxr3-smartraman/',
  'https://nicoletcz.cz/nova-generace-multimodalni-spektroskopie-seznamte-se-s-ira-scope/',
  'https://nicoletcz.cz/kurzy-a-skoleni-2026/',
  'https://nicoletcz.cz/ira-scope-tri-dimenze-spektroskopie-v-jednom-pristroji/',
  'https://nicoletcz.cz/presne-monitorovani-procesu-bez-zbytecne-slozitosti/',
  'https://nicoletcz.cz/ramanova-spektroskopie-a-tajemstvi-pokrocilych-materialu/',
  'https://nicoletcz.cz/ramanova-spektroskopie-odhaluje-tajemstvi-pokrocilych-materialu-webinar-na-vyzadani/',
  'https://nicoletcz.cz/revoluce-v-biovyrobe-pomoci-procesni-analyticke-technologie-pat/',
  'https://nicoletcz.cz/revoluce-v-mikrobiologii-identifikace-mikroorganismu-a-detekce-amr-behem-nekolika-minut-diky-maap-ir-a-atr-ftir-spektroskopii/',
  'https://nicoletcz.cz/setkani-uzivatelu-2025/',
  'https://nicoletcz.cz/sila-ft-ir-a-ramanovy-spektroskopie-ve-forenzni-analyze-webinar-na-vyzadani/',
  'https://nicoletcz.cz/stali-jsme-se-autorizovanym-distributorem-iris-technology/',
  'https://nicoletcz.cz/tec-mct-detektory-pro-nicolet-is50-uz-zadny-tekuty-dusik/',
  'https://nicoletcz.cz/timegate-mereni-se-vzorkovaci-destickou/',
  'https://nicoletcz.cz/udrzitelne-produkty-z-plastoveho-odpadu-webinar/',
  'https://nicoletcz.cz/uv-ramanova-spektroskopie/',
  'https://nicoletcz.cz/vyuziti-ramanovy-mikroskopie-k-analyze-napeti-strain-polovodicu/',
  'https://nicoletcz.cz/vyssi-citlivost-analytiky-v-upstream-bioprocesu-diky-time-gated-raman-spektroskopii/',
  'https://nicoletcz.cz/webinar-pokroky-v-ultrarychle-nanoskopii/',
  'https://nicoletcz.cz/webinar-seznamte-se-s-novym-ft-ir-spektrometrem-nicolet-apex/',
  'https://nicoletcz.cz/webinar-spolehlivy-a-vsestranny-ramanuv-spektrometr-nicolet-dxr3-flex/',
  'https://nicoletcz.cz/webinar-timegated-raman-pro-high-throughput-screening-hts/',
  'https://nicoletcz.cz/webinar-vyuziti-ft-ir-spektroskopie-ve-vyzkumu-katalyzy/',
  'https://nicoletcz.cz/webinar-zlepsete-recyklaci-polymeru-diky-ftir-analyze-a-reaktivni-extruzi/',
  'https://nicoletcz.cz/z-ulic-do-laboratore-identifikace-omamnych-latek-pomoci-ft-ir-a-ramanovy-spektroskopie/',
  'https://nicoletcz.cz/zveme-vas-na-discovery-days2024/',
  'https://nicoletcz.cz/pozvanka-na-workshop-infracervena-nanoskopie-mekkych-materialu/',
  'https://nicoletcz.cz/analyza-nanoplastu-pomoci-ftir-snom-technologie-s-rozlisenim-10-nanometru/',
  'https://nicoletcz.cz/objevte-fascinujici-svet-2d-materialu/',
  'https://nicoletcz.cz/objevte-silu-ft-ir-spektroskopie-v-analyze-plynu/',
  'https://nicoletcz.cz/dokonaly-dousek-jak-zajistit-nejvyssi-kvalitu-napoju-pomoci-ft-ir-spektroskopie/',
  'https://nicoletcz.cz/afm-raman-a-s-snom-ziva-ukazka-analyzy-2d-materialu/',
  'https://nicoletcz.cz/chytre-pivo-zacina-v-nicoletu/',
  'https://nicoletcz.cz/webinar-zlepsete-recyklaci-polymeru-diky-ftir-analyze-a-reaktivni-extruzi/',
  'https://nicoletcz.cz/nova-generace-multimodalni-spektroskopie-seznamte-se-s-ira-scope/',
  'https://nicoletcz.cz/kurzy-a-skoleni-2026/',
  'https://nicoletcz.cz/ramanova-spektroskopie-odhaluje-tajemstvi-pokrocilych-materialu-webinar-na-vyzadani/',
  'https://nicoletcz.cz/ira-scope-tri-dimenze-spektroskopie-v-jednom-pristroji/',
  'https://nicoletcz.cz/stali-jsme-se-autorizovanym-distributorem-iris-technology/',
  'https://nicoletcz.cz/sila-ft-ir-a-ramanovy-spektroskopie-ve-forenzni-analyze-webinar-na-vyzadani/',
  'https://nicoletcz.cz/z-ulic-do-laboratore-identifikace-omamnych-latek-pomoci-ft-ir-a-ramanovy-spektroskopie/',
  'https://nicoletcz.cz/udrzitelne-produkty-z-plastoveho-odpadu-webinar/',
  'https://nicoletcz.cz/revoluce-v-mikrobiologii-identifikace-mikroorganismu-a-detekce-amr-behem-nekolika-minut-diky-maap-ir-a-atr-ftir-spektroskopii/',
  'https://nicoletcz.cz/tec-mct-detektory-pro-nicolet-is50-uz-zadny-tekuty-dusik/',
  'https://nicoletcz.cz/chytre-pivo-zacina-v-nicoletu/',
  'https://nicoletcz.cz/ramanova-spektroskopie-a-tajemstvi-pokrocilych-materialu/',
  'https://nicoletcz.cz/pozvanka-na-workshop-infracervena-nanoskopie-mekkych-materialu/',
  'https://nicoletcz.cz/webinar-spolehlivy-a-vsestranny-ramanuv-spektrometr-nicolet-dxr3-flex/',
  'https://nicoletcz.cz/12519/',
  'https://nicoletcz.cz/objevte-silu-ft-ir-spektroskopie-v-analyze-plynu/',
  'https://nicoletcz.cz/vyuziti-ramanovy-mikroskopie-k-analyze-napeti-strain-polovodicu/',
  'https://nicoletcz.cz/objevte-fascinujici-svet-2d-materialu/',
  'https://nicoletcz.cz/webinar-vyuziti-ft-ir-spektroskopie-ve-vyzkumu-katalyzy/',
  'https://nicoletcz.cz/monitorovani-polymerni-extruze-v-realnem-case-pomoci-ramanova-spektroskopu-marqmetrix/',
  'https://nicoletcz.cz/dokonaly-dousek-jak-zajistit-nejvyssi-kvalitu-napoju-pomoci-ft-ir-spektroskopie/',
  'https://nicoletcz.cz/afm-raman-a-s-snom-ziva-ukazka-analyzy-2d-materialu/',
  'https://nicoletcz.cz/revoluce-v-biovyrobe-pomoci-procesni-analyticke-technologie-pat/',
  'https://nicoletcz.cz/analyza-nanoplastu-pomoci-ftir-snom-technologie-s-rozlisenim-10-nanometru/',
  'https://nicoletcz.cz/presne-monitorovani-procesu-bez-zbytecne-slozitosti/',
  'https://nicoletcz.cz/vyssi-citlivost-analytiky-v-upstream-bioprocesu-diky-time-gated-raman-spektroskopii/',
  'https://nicoletcz.cz/novinka-2026-ramanuv-a-fotoluminiscencni-spektrometr-monovista-crs%c2%b3-core/',
  'https://nicoletcz.cz/webinar-timegated-raman-pro-high-throughput-screening-hts/',
  'https://nicoletcz.cz/novinka-pro-rok-2026-dxr3-smartraman/',
];

// ─── Everything below is identical to migrate_news.js helpers ─────────────────
function slugify(str) {
  return String(str || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' a ').replace(/[^a-z0-9\s-]/g, ' ')
    .trim().replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 100);
}
function norm(str) { return String(str || '').replace(/\s+/g, ' ').trim(); }
function absUrl(url, base = SOURCE_BASE) {
  if (!url) return null;
  try { return new URL(url, base).href; } catch { return null; }
}
function guessExt(url) {
  try { const e = path.extname(new URL(url).pathname).toLowerCase(); if (e && e.length <= 5) return e; } catch {}
  return '.jpg';
}
function textFromHtml(html) { return norm(load(`<div>${html || ''}</div>`)('div').text()); }
function excerptFromHtml(html, max = 200) { const t = textFromHtml(html); return t.length > max ? t.slice(0, max - 1).trim() + '…' : t; }
function uniqueBy(arr, fn) { const s = new Set(); return arr.filter(x => { const k = fn(x); if (s.has(k)) return false; s.add(k); return true; }); }

async function safeFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  const ct = res.headers.get('content-type') || '';
  if (!res.ok) { const b = ct.includes('json') ? (await res.json()).error : await res.text(); throw new Error(`HTTP ${res.status}: ${b}`); }
  return res;
}
async function fetchJson(url, opts = {}) { return (await safeFetch(url, opts)).json(); }

async function fetchHtmlWithRetry(url, attempts = MAX_RETRIES) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NicoletMigration/2.0)', Accept: 'text/html' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (i < attempts - 1) {
        const wait = (i + 1) * 3000;
        console.warn(`      retry ${i + 1}/${attempts} in ${wait / 1000}s (${err.message})`);
        await new Promise(r => setTimeout(r, wait));
      } else throw err;
    }
  }
}

async function downloadToTemp(remoteUrl, filename) {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
  const localPath = path.join(TMP_DIR, filename);
  try {
    const res = await fetch(remoteUrl, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: SOURCE_BASE }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(localPath));
    return localPath;
  } catch (err) { console.warn(`    ⚠ Download failed ${remoteUrl}: ${err.message}`); return null; }
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
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
    });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok) throw new Error(ct.includes('json') ? (await res.json()).error : await res.text());
    const data = await res.json();
    return data.image_url || data.url || null;
  } catch (err) { console.warn(`    ⚠ Upload failed ${path.basename(localPath)}: ${err.message}`); return null; }
  finally { try { await unlink(localPath); } catch {} }
}

function cleanElement($doc, $root) {
  const $c = load(`<div id="mig-root">${$doc.html($root)}</div>`);
  const $r = $c('#mig-root');
  $r.find(['script','style','noscript','nav','header','footer','form','aside',
    '.sharedaddy','.jp-relatedposts','.comments-area','.post-navigation',
    '.elementor-widget-share-buttons','.elementor-widget-post-navigation',
    '.elementor-widget-theme-post-title','.elementor-widget-theme-post-excerpt',
    '.elementor-widget-theme-post-featured-image','.elementor-widget-theme-post-info',
    '.elementor-location-header','.elementor-location-footer',
    '.breadcrumbs','.rank-math-breadcrumb',
  ].join(',')).remove();
  $r.find('img').each((_, img) => {
    const $img = $c(img);
    const src = absUrl($img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src') || $img.attr('data-orig-file'));
    $img.attr('src', src || '');
    ['srcset','data-src','data-lazy-src','data-orig-file','loading','decoding','class','id','style','sizes','width','height'].forEach(a => $img.removeAttr(a));
    if (!src) $img.remove();
  });
  $r.find('a[href]').each((_, a) => {
    const $a = $c(a); const href = absUrl($a.attr('href'));
    if (href) $a.attr('href', href);
    ['class','id','style','data-elementor-open-lightbox'].forEach(a => $a.removeAttr(a));
  });
  $r.find('*').each((_, el) => {
    $c(el).removeAttr('class').removeAttr('id').removeAttr('style')
      .removeAttr('data-id').removeAttr('data-element_type').removeAttr('data-widget_type').removeAttr('data-settings');
  });
  return $r.html() || '';
}

function scoreCandidate($doc, selector) {
  const $el = $doc(selector).first();
  if (!$el.length) return { score: -1, html: '' };
  const html = cleanElement($doc, $el);
  const textLen = textFromHtml(html).length;
  if (textLen < 80) return { score: -1, html: '' };
  const $i = load(`<div>${html}</div>`);
  const score = textLen + $i('img').length * 200 + $i('p').length * 80 + $i('h2,h3,h4').length * 60;
  return { score, html };
}

function chooseBestContent($doc) {
  const candidates = [
    '.elementor-widget-theme-post-content .elementor-widget-container',
    '.elementor-widget-theme-post-content',
    'article .entry-content', '.entry-content', '.post-content', 'main article', 'article',
  ];
  const best = candidates.map(sel => ({ sel, ...scoreCandidate($doc, sel) }))
    .filter(c => c.score > 0).sort((a, b) => b.score - a.score)[0];
  if (best) return best.html;
  const blocks = [];
  $doc('.elementor-widget-text-editor .elementor-widget-container').each((_, el) => {
    const html = cleanElement($doc, $doc(el)); const len = textFromHtml(html).length;
    if (len > 40) blocks.push({ html, len });
  });
  if (blocks.length) { blocks.sort((a, b) => b.len - a.len); return blocks[0].html; }
  return '';
}

async function scrapeArticle(url) {
  const html = await fetchHtmlWithRetry(url);
  const $ = load(html);
  const titleCz =
    norm($('.elementor-widget-theme-post-title h1').first().text()) ||
    norm($('h1.entry-title').first().text()) ||
    norm($('article h1').first().text()) ||
    norm($('h1').first().text());
  if (!titleCz) throw new Error('No title found');

  let publishedAt = null;
  const metaDate = $('meta[property="article:published_time"]').attr('content');
  if (metaDate) { publishedAt = metaDate; }
  else {
    const dt = $('time[datetime]').first().attr('datetime');
    if (dt) { publishedAt = dt; }
    else {
      const dateText = norm($('.elementor-post-info__item--type-date').first().text() || $('.entry-date').first().text() || $('time').first().text());
      const m = dateText.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
      if (m) publishedAt = `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    }
  }
  const coverImageSrc =
    absUrl($('meta[property="og:image"]').attr('content')) ||
    absUrl($('.elementor-widget-theme-post-featured-image img').first().attr('data-src')) ||
    absUrl($('.elementor-widget-theme-post-featured-image img').first().attr('src')) ||
    absUrl($('.post-thumbnail img').first().attr('src')) ||
    null;
  const contentHtml = chooseBestContent($);
  if (!contentHtml || textFromHtml(contentHtml).length < 60) throw new Error('Content not found or too short');
  const $i = load(`<div>${contentHtml}</div>`);
  const contentImageUrls = [];
  $i('img[src]').each((_, img) => { const s = $i(img).attr('src'); if (s) contentImageUrls.push(s); });
  return { titleCz, publishedAt, contentHtml, coverImageSrc: coverImageSrc || contentImageUrls[0] || null, contentImageUrls };
}

async function rewriteImages(contentHtml, coverSrc, coverUrl, folderNovinky, token) {
  const $ = load(`<div id="root">${contentHtml}</div>`);
  const imgs = [];
  $('#root img[src]').each((_, img) => imgs.push($(img).attr('src')));
  const unique = uniqueBy(imgs, x => x);
  const processed = new Map();
  for (const src of unique) {
    if (coverSrc && src === coverSrc && coverUrl) { processed.set(src, coverUrl); continue; }
    const ext = guessExt(src);
    const fname = `novinky-${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}`;
    const local = await downloadToTemp(src, fname);
    if (!local) continue;
    const newUrl = await uploadToGallery(local, folderNovinky, token);
    if (newUrl) processed.set(src, newUrl);
  }
  $('#root img[src]').each((_, img) => { const $img = $(img); const n = processed.get($img.attr('src')); if (n) $img.attr('src', n); });
  return $('#root').html() || contentHtml;
}

// ─── Main retry loop ──────────────────────────────────────────────────────────
async function main() {
  console.log('═══ Nicolet CZ Migration — Retry Failed Articles ═══\n');

  const token = await fetchJson(`${API_BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS }),
  }).then(d => d.token);
  console.log('✓ Logged in');

  const authH = { Authorization: `Bearer ${token}` };

  // Load all data
  const [allPosts, allCats, allFolders] = await Promise.all([
    fetchJson(`${API_BASE}/api/news/admin/all`, { headers: authH }),
    fetchJson(`${API_BASE}/api/news-categories/admin/all`, { headers: authH }),
    fetchJson(`${API_BASE}/api/gallery/folders/admin/all`, { headers: authH }),
  ]);

  const folderHlavicky = allFolders.find(f => norm(f.name_cz).toLowerCase() === 'hlavičky' && !f.parent_id)?.id;
  const folderNovinky  = allFolders.find(f => norm(f.name_cz).toLowerCase() === 'novinky'  && !f.parent_id)?.id;
  console.log(`  Gallery — hlavičky: ${folderHlavicky}, novinky: ${folderNovinky}`);

  // Deduplicate the failed URL list
  const urls = uniqueBy(FAILED_URLS, x => new URL(x).pathname.replace(/\/+$/, ''));
  console.log(`\nRetrying ${urls.length} unique articles...\n`);

  let created = 0, updated = 0, skipped = 0, failed = 0;

  for (const articleUrl of urls) {
    console.log(`→ ${articleUrl}`);
    try {
      const article = await scrapeArticle(articleUrl);

      // Find which year/category this article belongs to (from published date or URL)
      let categoryId = null;
      if (article.publishedAt) {
        const year = article.publishedAt.slice(0, 4);
        categoryId = allCats.find(c => c.name_cz === year)?.id || null;
      }
      // Fallback: check if post already exists without category match
      const existingPost = allPosts.find(p => norm(p.title_cz) === norm(article.titleCz));
      const existingId = existingPost?.id || null;
      if (!categoryId && existingPost) categoryId = existingPost.category_id;
      if (!categoryId) {
        // Try to detect year from URL
        const yearMatch = articleUrl.match(/\/(202[0-9]|201[0-9])\//);
        if (yearMatch) categoryId = allCats.find(c => c.name_cz === yearMatch[1])?.id || null;
      }

      // Upload cover
      let coverUrl = null;
      if (article.coverImageSrc) {
        const ext = guessExt(article.coverImageSrc);
        const fname = `hlavicky-${slugify(article.titleCz).slice(0,40)}-${Date.now()}${ext}`;
        const local = await downloadToTemp(article.coverImageSrc, fname);
        if (local) coverUrl = await uploadToGallery(local, folderHlavicky, token);
      }

      // Rewrite images
      const finalContent = await rewriteImages(article.contentHtml, article.coverImageSrc, coverUrl, folderNovinky, token);
      const excerpt = excerptFromHtml(finalContent, 200);
      const slug = slugify(article.titleCz);

      const postData = {
        title_cz: article.titleCz, title_en: null, slug,
        content_cz: finalContent, content_en: null,
        excerpt_cz: excerpt, excerpt_en: null,
        cover_image: coverUrl || null, cover_align: 'center',
        seo_title_cz: article.titleCz, seo_desc_cz: excerpt.slice(0, 160),
        category_id: categoryId, is_published: 1,
        published_at: article.publishedAt || '2024-01-01',
      };

      if (existingId) {
        await fetchJson(`${API_BASE}/api/news/admin/${existingId}`, {
          method: 'PUT', headers: { ...authH, 'Content-Type': 'application/json' },
          body: JSON.stringify(postData),
        });
        console.log(`  ✎ Updated: "${article.titleCz}"`);
        updated++;
      } else {
        await fetchJson(`${API_BASE}/api/news/admin`, {
          method: 'POST', headers: { ...authH, 'Content-Type': 'application/json' },
          body: JSON.stringify(postData),
        });
        console.log(`  ✓ Created: "${article.titleCz}"`);
        created++;
      }

      await new Promise(r => setTimeout(r, ARTICLE_DELAY));
    } catch (err) {
      console.error(`  ✗ FAILED: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n═══ Retry Complete ═══`);
  console.log(`  Created: ${created}, Updated: ${updated}, Failed: ${failed}`);
  try { if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
}

main().catch(err => { console.error('\n✗ Aborted:', err); process.exit(1); });
