/**
 * migrate-nicolet-full.js — kompletní migrace obsahu ze starého webu (OldWebData/) do DB.
 *
 * Idempotentní: opakované spuštění updatuje existující entity (match per slug),
 * nevytváří duplikáty. Mapping source→target se ukládá do scripts/migrate-mapping.json.
 *
 * Usage: node --require ./scripts/polyfill-node18.cjs scripts/migrate-nicolet-full.js [--phase=A|B|C|D]
 *
 * Fáze:
 *   A = kategorie produktů + ročníkové rubriky + smazání test novinek
 *   B = aplikace (okruhy + aplikace + obrázky)
 *   C = produkty (+ kategorie M:N + aplikace M:N + obrázky)
 *   D = novinky (118, vč. obsahových obrázků)
 *   (bez parametru = vše po sobě)
 */

import fs from 'fs';
import path from 'path';
import { load } from 'cheerio';
import { fileURLToPath } from 'url';
import db, { initDatabase, closeDatabase } from '../backend/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const OLD_DATA  = path.join(ROOT, 'OldWebData');
const GALLERY   = path.join(ROOT, 'frontend', 'uploads', 'gallery');

const ONLY = process.argv.find(a => a.startsWith('--phase='))?.split('=')[1] || null;

// ── Mapping (idempotence state) ─────────────────────────────────────────────
const mappingPath = path.join(__dirname, 'migrate-mapping.json');
const mapping = fs.existsSync(mappingPath) ? JSON.parse(fs.readFileSync(mappingPath, 'utf8')) : {
  categories: {}, yearCats: {}, groups: {}, apps: {}, products: {}, news: {}, images: {}, appProductLinks: {},
};
let mappingDirty = false;
function saveMapping() {
  if (!mappingDirty) return;
  fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 1));
  mappingDirty = false;
}
function touch() { mappingDirty = true; }

const stats = { cats: 0, yearCats: 0, images: 0, groups: 0, apps: 0, products: 0,
  catLinks: 0, appLinks: 0, news: 0, warnings: [], errors: [] };

// ── Helpers ─────────────────────────────────────────────────────────────────
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const cleanTitle = (s) => norm(s).replace(/\s*[-–|]\s*Nicolet ?CZ\s*$/i, '').trim();

function stripHtml(html) {
  return norm((html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' '))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function resolveLocalImage(src) {
  if (!src) return null;
  const urlPath = src.replace(/^https?:\/\/nicoletcz\.cz\//, '').replace(/^\//, '').split('?')[0].split('#')[0];
  try { const dec = decodeURIComponent(urlPath); const p1 = path.join(OLD_DATA, dec); if (fs.existsSync(p1)) return p1; } catch {}
  const p = path.join(OLD_DATA, urlPath);
  if (fs.existsSync(p)) return p;
  const stripped = p.replace(/-\d+x\d+(\.[^.]+)$/, '$1');
  if (fs.existsSync(stripped)) return stripped;
  return null;
}

function imgCacheKey(src) {
  return src.replace(/^https?:\/\/nicoletcz\.cz/, '').replace(/[^a-zA-Z0-9._-]/g, '-').slice(-120);
}

async function getOrCreateGalleryFolder(nameCz) {
  const existing = await db.prepare('SELECT id FROM gallery_folders WHERE name_cz = ?').get(nameCz);
  if (existing) return existing.id;
  const slug = nameCz.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const dup = await db.prepare('SELECT id FROM gallery_folders WHERE slug = ?').get(slug);
  if (dup) return dup.id;
  const result = await db.prepare(
    'INSERT INTO gallery_folders (name_cz, slug, display_order) VALUES (?, ?, 0)'
  ).run(nameCz, slug);
  return result.lastInsertRowid;
}

const folderIds = {};
async function folder(nameCz) {
  if (!folderIds[nameCz]) folderIds[nameCz] = await getOrCreateGalleryFolder(nameCz);
  return folderIds[nameCz];
}

async function importImage(src, folderName) {
  if (!src || !(src.includes('nicoletcz.cz') || src.startsWith('/app/uploads'))) return null;
  const key = imgCacheKey(src);
  if (mapping.images[key]) return mapping.images[key];
  const existing = await db.prepare('SELECT image_url FROM gallery_images WHERE identifier = ?').get(key);
  if (existing) { mapping.images[key] = existing.image_url; touch(); return existing.image_url; }
  const localPath = resolveLocalImage(src);
  if (!localPath) { stats.warnings.push(`img-missing: ${src}`); return null; }
  if (!fs.existsSync(GALLERY)) fs.mkdirSync(GALLERY, { recursive: true });
  const ext = path.extname(localPath).toLowerCase() || '.jpg';
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
  fs.copyFileSync(localPath, path.join(GALLERY, filename));
  const galleryUrl = `/uploads/gallery/${filename}`;
  await db.prepare(
    'INSERT INTO gallery_images (folder_id, image_url, identifier, display_order) VALUES (?, ?, ?, 0)'
  ).run(await folder(folderName), galleryUrl, key);
  mapping.images[key] = galleryUrl;
  touch();
  stats.images++;
  return galleryUrl;
}

async function galleryFor(src, folderName) {
  if (!src) return null;
  return await importImage(src, folderName);
}

/** Clean elementor HTML: strip <style>/<script>, remove data attributes, rewrite image srcs. */
async function cleanContent(html, folderName) {
  if (!html) return '';
  const $ = load(`<div id="xroot">${html}</div>`);
  $('#xroot style, #xroot script').remove();
  for (const el of $('#xroot *').toArray()) {
    for (const attr of Object.keys(el.attribs || {})) {
      if (attr.startsWith('data-')) $(el).removeAttr(attr);
    }
  }
  for (const img of $('#xroot img').toArray()) {
    const src = $(img).attr('src') || '';
    if (src.includes('nicoletcz.cz') || src.startsWith('/app/uploads')) {
      const newUrl = await importImage(src, folderName);
      if (newUrl) { $(img).attr('src', newUrl); $(img).attr('alt', $(img).attr('alt') || ''); }
      else $(img).remove();
    }
    $(img).removeAttr('srcset').removeAttr('sizes').removeAttr('loading').removeAttr('decoding').removeAttr('srcset');
  }
  // Remove empty elementor wrapper style tags left behind
  let out = $('#xroot').html() || '';
  out = out.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
  return out.trim();
}

// ═════════════════════════════════ PHASE A ══════════════════════════════════
const PRODUCT_CATS = [
  ['ftir-spektroskopie', 'FT-IR spektroskopie', 'FT-IR spectroscopy', null],
  ['ftir-spektroskopie/ft-ir-spektrometry', 'FT-IR spektrometry', 'FT-IR spectrometers', 'ftir-spektroskopie'],
  ['ftir-spektroskopie/ft-ir-mikroskopy', 'FT-IR mikroskopy', 'FT-IR microscopes', 'ftir-spektroskopie'],
  ['ftir-spektroskopie/analyza-plynu', 'Analýza plynů', 'Gas analysis', 'ftir-spektroskopie'],
  ['ftir-spektroskopie/thermo-ftir', 'Thermo Scientific', 'Thermo Scientific', 'ftir-spektroskopie'],
  ['ftir-spektroskopie/neaspec', 'Attocube (Neaspec)', 'Attocube (Neaspec)', 'ftir-spektroskopie'],
  ['ftir-spektroskopie/d-p-instruments', 'D&P Instruments', 'D&P Instruments', 'ftir-spektroskopie'],
  ['ftir-spektroskopie/prislusenstvi-ic-spektroskopie', 'Příslušenství FT-IR', 'FT-IR accessories', 'ftir-spektroskopie'],
  ['nir-spektrometry', 'NIR spektroskopie', 'NIR spectroscopy', null],
  ['nir-spektrometry/thermo-nir', 'Thermo Scientific', 'Thermo Scientific', 'nir-spektrometry'],
  ['nir-spektrometry/bwtek-nir', 'BWTek', 'BWTek', 'nir-spektrometry'],
  ['nir-spektrometry/prislusenstvi-nir-spektroskopie', 'Příslušenství NIR', 'NIR accessories', 'nir-spektrometry'],
  ['raman', 'Ramanova spektroskopie', 'Raman spectroscopy', null],
  ['raman/thermo-raman', 'Thermo Scientific', 'Thermo Scientific', 'raman'],
  ['raman/bw-tek', 'B&W Tek', 'B&W Tek', 'raman'],
  ['raman/timegate', 'Timegate', 'Timegate', 'raman'],
  ['raman/photon-systems', 'Photon Systems', 'Photon Systems', 'raman'],
  ['raman/spectroscopy-imaging', 'S&I Spectroscopy & Imaging', 'S&I Spectroscopy & Imaging', 'raman'],
  ['raman/oem', 'OEM', 'OEM', 'raman'],
  ['raman/prislusenstvi-raman', 'Příslušenství Raman', 'Raman accessories', 'raman'],
  ['rucni-analyzatory', 'Ruční analyzátory', 'Handheld analyzers', null],
  ['uv-vis-nir', 'UV-VIS-NIR', 'UV-VIS-NIR', null],
  ['libs', 'LIBS', 'LIBS', null],
  ['linkam', 'LINKAM', 'LINKAM', null],
  ['stare', 'Starší servisované přístroje', 'Refurbished instruments', null],
];

async function phaseA() {
  console.log('\n═══ FÁZE A: kategorie + rubriky + test-novinky ═══');
  // Product categories (tree order: parents first — list is ordered)
  for (const [srcPath, nameCz, nameEn, parentPath] of PRODUCT_CATS) {
    if (mapping.categories[srcPath]) continue;
    const existing = await db.prepare('SELECT id FROM product_categories WHERE slug = ?').get(srcPath);
    if (existing) { mapping.categories[srcPath] = existing.id; touch(); continue; }
    const parentId = parentPath ? (mapping.categories[parentPath] || null) : null;
    if (parentPath && !parentId) throw new Error(`parent category missing: ${parentPath}`);
    const result = await db.prepare(`
      INSERT INTO product_categories (parent_id, name_cz, name_en, slug, display_order, is_active)
      VALUES (?, ?, ?, ?, 0, 1)
    `).run(parentId, nameCz, nameEn, srcPath);
    mapping.categories[srcPath] = result.lastInsertRowid;
    touch();
    stats.cats++;
  }
  console.log(`   kategorie produktů: ${stats.cats} nových, ${Object.keys(mapping.categories).length} celkem`);

  // News year categories
  for (const year of [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]) {
    if (mapping.yearCats[year]) continue;
    const existing = await db.prepare('SELECT id FROM news_categories WHERE slug = ?').get(String(year));
    if (existing) { mapping.yearCats[year] = existing.id; touch(); continue; }
    const result = await db.prepare(`
      INSERT INTO news_categories (name_cz, name_en, slug, display_order, is_active)
      VALUES (?, ?, ?, ?, 1)
    `).run(String(year), String(year), String(year), year - 2000);
    mapping.yearCats[year] = result.lastInsertRowid;
    touch();
    stats.yearCats++;
  }
  console.log(`   ročníkové rubriky: ${stats.yearCats} nových, ${Object.keys(mapping.yearCats).length} celkem`);

  // Delete test news (explicitly approved by user)
  for (const slug of ['novinka', 'Test']) {
    const row = await db.prepare('SELECT id, title_cz FROM news_posts WHERE slug = ?').get(slug);
    if (row) {
      await db.prepare('DELETE FROM news_posts WHERE id = ?').run(row.id);
      console.log(`   🗑️  test novinka smazána: id=${row.id} "${row.title_cz}"`);
    }
  }
  saveMapping();
}

// ═════════════════════════════════ PHASE B ══════════════════════════════════
const APP_GROUPS = [
  ['veda-vyzkum-skolstvi', 'Věda, výzkum, školství', 'Science, research & education'],
  ['prumyslove-aplikace', 'Průmyslové aplikace', 'Industrial applications'],
  ['farmacie-a-medicina', 'Farmacie a medicína', 'Pharmacy & medicine'],
  ['potravinarstvi-zemedelstvi-a-krmiva', 'Potravinářství, zemědělství a krmiva', 'Food, agriculture & feed'],
  ['zivotni-prostredi', 'Životní prostředí', 'Environment'],
  ['bezpecnostni-slozky', 'Bezpečnostní složky', 'Security forces'],
  ['ropny-prumysl', 'Ropný průmysl', 'Oil industry'],
  ['ostatni-aplikace', 'Ostatní aplikace', 'Other applications'],
];

// EN names (source: /en/solutions/ og:title, verified in phase 1)
const APP_EN = {
  'veda-vyzkum-skolstvi': 'Science, research & education',
  'prumyslove-aplikace': 'Industrial applications',
  'farmacie-a-medicina': 'Pharmacy & medicine',
  'potravinarstvi-zemedelstvi-a-krmiva': 'Food, agriculture & feed',
  'zivotni-prostredi': 'Environment',
  'bezpecnostni-slozky': 'Security forces',
  'ropny-prumysl': 'Oil industry',
  'ostatni-aplikace': 'Other applications',
  'veda-vyzkum-skolstvi/analyza-chemickeho-slozeni-chondritu-a-komet': 'Analysis of the chemical composition of chondrites and comets',
  'veda-vyzkum-skolstvi/analyza-optickych-nanoanten': 'Analysis of optical nanoantennas',
  'veda-vyzkum-skolstvi/analyza-plynu': 'Gas analysis',
  'veda-vyzkum-skolstvi/analyza-proteinu': 'Protein analysis',
  'veda-vyzkum-skolstvi/analyza-sekundarni-struktury-amyloidnich-vlaken': 'Analysis of the secondary structure of amyloid fibrils',
  'veda-vyzkum-skolstvi/analyza-supercocek-a-metamaterialu': 'Analysis of superconductors and metamaterials',
  'veda-vyzkum-skolstvi/bezkontaktni-a-nedestruktivni-analyza-umeleckych-barev-a-pigmentu': 'Non-contact, non-destructive analysis of art paints and pigments',
  'veda-vyzkum-skolstvi/charakterizace-amorfniho-a-krystalickeho-kremiku': 'Characterization of amorphous and crystalline silicon',
  'veda-vyzkum-skolstvi/charakterizace-povrchovych-optickych-vln': 'Characterization of surface optical waves',
  'veda-vyzkum-skolstvi/fazove-prechody-v-nanomeritku': 'Phase transitions at the nanoscale',
  'veda-vyzkum-skolstvi/geologie': 'Geology',
  'veda-vyzkum-skolstvi/identifikace-materialu-v-polovodicovych-soucastkach': 'Material identification in semiconductor devices',
  'veda-vyzkum-skolstvi/imaging-viru-a-bunek': 'Imaging of viruses and cells',
  'veda-vyzkum-skolstvi/koroze-medenych-povrchu': 'Corrosion of copper surfaces',
  'veda-vyzkum-skolstvi/mapovani-heterogenity-nosicu-naboje-v-nanokrystalech': 'Mapping charge carrier heterogeneity in nanocrystals',
  'veda-vyzkum-skolstvi/mapovani-lokalni-vodivosti-v-polovodicovych-soucastkach': 'Mapping local conductivity in semiconductor devices',
  'veda-vyzkum-skolstvi/mapovani-tranzice-izolant-kov-v-oxidu-vanadicitem': 'Mapping the insulator-metal transition in vanadium dioxide',
  'veda-vyzkum-skolstvi/molekularni-staggering-ve-vlaknech-kolagenu': 'Molecular staggering in collagen fibres',
  'veda-vyzkum-skolstvi/nano-imaging-jadra-nukleocytu': 'Nano-imaging of nucleocyte nuclei',
  'veda-vyzkum-skolstvi/neasnom-a-grafenova-plazmonika': 'neaSNOM and graphene plasmonics',
  'veda-vyzkum-skolstvi/prime-sledovani-ubytku-lithia-v-elektrode-li-ion-baterie': 'Direct tracking of lithium depletion in Li-ion battery electrodes',
  'veda-vyzkum-skolstvi/raman-sem-kombinovana-mikroskopie': 'Raman-SEM combined microscopy',
  'veda-vyzkum-skolstvi/sledovani-pomaleho-svetla-v-prirodnich-hyperbolickych-materialech': 'Tracking slow light in natural hyperbolic materials',
  'veda-vyzkum-skolstvi/stanoveni-koncentrace-vodiku-ve-filmech-nitridu-kremiku-na-kremikovych-destickach': 'Hydrogen concentration in silicon nitride films on silicon wafers',
  'veda-vyzkum-skolstvi/studium-kulturniho-dedictvi': 'Cultural heritage research',
  'veda-vyzkum-skolstvi/uhlikove-nanoaplikace': 'Carbon nanoapplications',
  'veda-vyzkum-skolstvi/ultrarychla-spektroskopie-pohybu-elektronu-v-nanodratech': 'Ultrafast spectroscopy of electron motion in nanowires',
  'veda-vyzkum-skolstvi/vyzkum-imunoterapie-pomoci-ramanovy-spektroskopie': 'Immunotherapy research using Raman spectroscopy',
  'prumyslove-aplikace/analyza-polymeru': 'Polymer analysis',
  'prumyslove-aplikace/ftalaty': 'Phthalates',
  'prumyslove-aplikace/klasifikace-polyetylenu-pomoci-ramanovy-spektroskopie': 'Polyethylene classification using Raman spectroscopy',
  'prumyslove-aplikace/medicinalni-plyny': 'Medical gases',
  'prumyslove-aplikace/plastova-soucastka': 'Plastic component',
  'prumyslove-aplikace/regenerace-rozpoustedel': 'Solvent recycling',
  'prumyslove-aplikace/vytvrzovani-akrylatu-kombinace-ft-ir-spektroskopie-a-reologie': 'Acrylate curing: FT-IR spectroscopy combined with rheology',
  'farmacie-a-medicina/analyza-nikotinovych-naplasti': 'Analysis of nicotine patches',
  'farmacie-a-medicina/analyza-slozeni-a-struktury-lidskych-kosti-v-nanomeritku': 'Composition and structure of human bone at the nanoscale',
  'farmacie-a-medicina/kontrola-kvality-desinfekcnich-pripravku-behem-vyroby': 'Quality control of disinfectants during production',
  'farmacie-a-medicina/ledvinove-kameny': 'Kidney stones',
  'farmacie-a-medicina/mapovani-tablet': 'Tablet mapping',
  'farmacie-a-medicina/stanoveni-koncentrace-ozonu': 'Ozone concentration measurement',
  'potravinarstvi-zemedelstvi-a-krmiva/mikroplasty': 'Microplastics',
  'potravinarstvi-zemedelstvi-a-krmiva/bezpecnost-jidla': 'Food safety',
  'potravinarstvi-zemedelstvi-a-krmiva/analyza-vina-a-mostu': 'Wine and must analysis',
  'potravinarstvi-zemedelstvi-a-krmiva/mlecne-produkty-cokolady': 'Dairy products & chocolate',
  'zivotni-prostredi/mereni-toxicity-koure': 'Smoke toxicity measurement',
  'bezpecnostni-slozky/analyza-azbestu': 'Asbestos analysis',
  'bezpecnostni-slozky/analyza-bojovych-plynu-pomoci-gc-ftir': 'Chemical warfare agents analysis by GC-FTIR',
  'bezpecnostni-slozky/analyza-inkoustu-pomoci-zobrazovaci-ft-ir-atr': 'Ink analysis by FT-IR ATR imaging',
  'bezpecnostni-slozky/analyza-otisku-prstu': 'Fingerprint analysis',
  'bezpecnostni-slozky/metanolova-afera': 'The methanol affair',
};

async function phaseB() {
  console.log('\n═══ FÁZE B: okruhy aplikací + aplikace ═══');
  const base = path.join(OLD_DATA, 'aplikace');
  for (let gi = 0; gi < APP_GROUPS.length; gi++) {
    const [g, fallbackName] = APP_GROUPS[gi];
    if (!mapping.groups[g]) {
      let gid;
      const existing = await db.prepare('SELECT id FROM application_groups WHERE slug = ?').get(g);
      if (existing) {
        gid = existing.id;
      } else {
        const $g = load(fs.readFileSync(path.join(base, g, 'index.html'), 'utf8'));
        const nameCz = cleanTitle($g('meta[property="og:title"]').attr('content') || fallbackName(g)) || fallbackName(g);
        const result = await db.prepare(`
          INSERT INTO application_groups (slug, name_cz, name_en, display_order, is_active)
          VALUES (?, ?, ?, ?, 1)
        `).run(g, nameCz, APP_EN[g] || null, (gi + 1) * 10);
        gid = result.lastInsertRowid;
        stats.groups++;
      }
      mapping.groups[g] = gid;
      touch();
    }

    const gPath = path.join(base, g);
    const subs = fs.readdirSync(gPath).filter(s => {
      if (s === 'index.html' || s === 'feed') return false;
      return fs.existsSync(path.join(gPath, s, 'index.html'));
    });
    for (const sub of subs) {
      const key = `${g}/${sub}`;
      if (mapping.apps[key]) continue;
      let appId;
      const existing = await db.prepare('SELECT id FROM applications WHERE slug = ?').get(sub);
      if (existing) {
        appId = existing.id;
      } else {
        const $ = load(fs.readFileSync(path.join(gPath, sub, 'index.html'), 'utf8'));
        const title = cleanTitle($('meta[property="og:title"]').attr('content') || '') || sub;
        const ogImage = $('meta[property="og:image"]').attr('content');
        const coverUrl = ogImage ? await importImage(ogImage, 'Aplikace') : null;

        let contentHtml = '';
        for (const tabId of ['popis-aplikace-tab', 'o-aplikaci-tab']) {
          const t = $(`#${tabId}`);
          if (t.length) { contentHtml = t.html() || ''; break; }
        }
        if (!contentHtml.trim()) {
          const main = $('.elementor-widget-theme-post-content').first();
          if (main.length) contentHtml = main.html() || '';
        }
        const cleaned = await cleanContent(contentHtml, 'Aplikace');
        const result = await db.prepare(`
          INSERT INTO applications (group_id, slug, name_cz, name_en, content_cz, cover_image,
            thumbnail_url, is_published, display_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)
        `).run(mapping.groups[g], sub, title, APP_EN[key] || null, cleaned || null, coverUrl, coverUrl);
        appId = result.lastInsertRowid;
        stats.apps++;
      }
      mapping.apps[key] = appId;
      touch();
    }
  }
  saveMapping();
  console.log(`   okruhy: ${stats.groups}, aplikací: ${stats.apps}, obrázků zatím: ${stats.images}`);
}

function fallbackName(slug) {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ═════════════════════════════════ PHASE C ══════════════════════════════════
const EXCLUDED_404 = new Set([
  'analyza-mikroplastu', 'i-qcrx-system-pro-kontrolu-terapeutickych-roztoku', 'iraman-pro-st',
  'nanolibs', 'nanoram', 'picospin-45', 'picospin-80', 'ptram', 'qtram',
  'tacticid-gp-plus-a-tacticid-n-plus',
]);

const CAT_MEMBERS = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'tmp-audit', 'cat-prods-decoded.json'), 'utf8'));
const PROD_APP_LINKS = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'tmp-audit', 'prod-app-links.json'), 'utf8'));
const APP_TAB_PRODS = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'tmp-audit', 'app-tab-prods.json'), 'utf8'));

/** Decode %xx in slug keys/refs to match dir names. */
const decodeSlug = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

/** Category path → target category id (via mapping). */
function catTargetId(catPath) {
  return mapping.categories[catPath] || null;
}

/** Build product → category slugs from CAT_MEMBERS + mapping keys. */
function productCategories(slug) {
  const out = new Set();
  for (const [catPath, members] of Object.entries(CAT_MEMBERS)) {
    if (members.includes(slug)) out.add(catPath);
  }
  return [...out];
}

/** Product → concrete applications (drop group shortcuts). */
function productApplications(slug) {
  const links = PROD_APP_LINKS[slug] || [];
  return links.filter(l => l.split('/').filter(Boolean).length >= 3);
}

/** Application → products (from method tabs). */
function appProducts(appKey) {
  return (APP_TAB_PRODS[appKey] || []).map(l => decodeSlug(l.replace('/produkt/', '').replace(/\/$/, '')));
}

const PRODUCT_EN_NAMES = JSON.parse(fs.readFileSync(path.join(__dirname, 'product-en-names.json'), 'utf8'));

async function phaseC() {
  console.log('\n═══ FÁZE C: produkty + vazby ═══');
  const dir = path.join(OLD_DATA, 'produkt');
  const slugs = fs.readdirSync(dir).filter(s => {
    if (!fs.existsSync(path.join(dir, s, 'index.html'))) return false;
    const $ = load(fs.readFileSync(path.join(dir, s, 'index.html'), 'utf8'));
    return !/nenalezena/i.test($('title').text());
  }).filter(s => !EXCLUDED_404.has(s));

  console.log(`   produktů ke importu: ${slugs.length}`);
  let idx = 0;
  for (const slug of slugs) {
    idx++;
    const $ = load(fs.readFileSync(path.join(dir, slug, 'index.html'), 'utf8'));
    const name = cleanTitle($('meta[property="og:title"]').attr('content') || '') || slug;
    const excerpt = norm($('meta[property="og:description"]').attr('content') || '') || null;
    const ogImage = $('meta[property="og:image"]').attr('content');

    // main content: "o-pstroji-tab" → fallback main content widget
    let contentHtml = '';
    const t1 = $('#o-pstroji-tab');
    if (t1.length) contentHtml = t1.html() || '';
    if (!contentHtml.trim()) {
      const main = $('.elementor-widget-theme-post-content').first();
      if (main.length) contentHtml = main.html() || '';
    }
    const contentCz = await cleanContent(contentHtml, 'Přístroje');
    const thumbUrl = ogImage ? await importImage(ogImage, 'Přístroje') : null;

    let productId = mapping.products[slug];
    const nameEn = PRODUCT_EN_NAMES[slug] || null;
    if (productId) {
      await db.prepare(`
        UPDATE products SET name_cz = ?, name_en = COALESCE(?, name_en), excerpt_cz = COALESCE(?, excerpt_cz),
          description_cz = COALESCE(?, description_cz), thumbnail_url = COALESCE(?, thumbnail_url),
          updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(name, nameEn, excerpt, contentCz || null, thumbUrl, productId);
    } else {
      const existing = await db.prepare('SELECT id FROM products WHERE slug = ?').get(slug);
      if (existing) {
        productId = existing.id;
        await db.prepare('UPDATE products SET name_en = COALESCE(?, name_en) WHERE id = ?').run(nameEn, productId);
      } else {
        const result = await db.prepare(`
          INSERT INTO products (slug, name_cz, name_en, excerpt_cz, description_cz, thumbnail_url,
            is_published, is_featured, display_order, seo_title_cz, seo_desc_cz)
          VALUES (?, ?, ?, ?, ?, 1, 0, 0, ?, ?)
        `).run(slug, name, nameEn, excerpt, contentCz || null, thumbUrl,
          name, excerpt ? excerpt.slice(0, 160) : null);
        productId = result.lastInsertRowid;
        stats.products++;
      }
      mapping.products[slug] = productId;
      touch();
    }

    // ── M:N categories ──
    const cats = productCategories(slug);
    for (const catPath of cats) {
      const catId = mapping.categories[catPath];
      if (!catId) { stats.warnings.push(`cat-missing: ${slug} → ${catPath}`); continue; }
      const has = await db.prepare(
        'SELECT 1 FROM product_categories_map WHERE product_id = ? AND category_id = ?'
      ).get(productId, catId);
      if (!has) {
        await db.prepare('INSERT INTO product_categories_map (product_id, category_id) VALUES (?, ?)')
          .run(productId, catId);
        stats.catLinks++;
      }
    }

    // ── M:N applications (product side) ──
    const appLinks = productApplications(slug);
    for (const appPath of appLinks) {
      const appId = mapping.apps[decodeSlug(appPath.replace(/^\/aplikace\//, '').replace(/\/$/, ''))];
      if (!appId) { stats.warnings.push(`app-missing: ${slug} → ${appPath}`); continue; }
      const has = await db.prepare(
        'SELECT 1 FROM product_applications_map WHERE product_id = ? AND application_id = ?'
      ).get(productId, appId);
      if (!has) {
        await db.prepare('INSERT INTO product_applications_map (product_id, application_id) VALUES (?, ?)')
          .run(productId, appId);
        stats.appLinks++;
      }
    }

    if (idx % 20 === 0) console.log(`   … ${idx}/${slugs.length}`);
  }

  // ── app-side links: application → products (symmetrize from app method tabs) ──
  for (const [appKey, prods] of Object.entries(APP_TAB_PRODS)) {
    const appId = mapping.apps[appKey];
    if (!appId) continue;
    for (const prodSlug of prods) {
      const pid = mapping.products[decodeSlug(prodSlug)];
      if (!pid) continue; // 404-excluded products: link dropped
      const has = await db.prepare(
        'SELECT 1 FROM product_applications_map WHERE product_id = ? AND application_id = ?'
      ).get(pid, appId);
      if (!has) {
        await db.prepare('INSERT INTO product_applications_map (product_id, application_id) VALUES (?, ?)')
          .run(pid, appId);
        stats.appLinks++;
      }
    }
  }
  saveMapping();
  console.log(`   produkty: ${stats.products}, kategorie vazeb: ${stats.catLinks}, aplikace vazeb: ${stats.appLinks}`);
}

// ═════════════════════════════════ PHASE D ══════════════════════════════════
async function phaseD() {
  console.log('\n═══ FÁZE D: novinky ═══');
  const jsonFiles = [];
  // 7 nových postů (staženo ve fázi 1 do ~/tmp-audit/new-content)
  const newContentDir = '/home/inachis/tmp-audit/new-content';
  if (fs.existsSync(newContentDir)) {
    for (const f of fs.readdirSync(newContentDir)) {
      if (/^post-\d+\.json$/.test(f)) jsonFiles.push(path.join(newContentDir, f));
    }
  }
  // 111 mirror postů (wp-json dump)
  const wpJsonDir = path.join(OLD_DATA, 'wp-json', 'wp', 'v2', 'posts');
  for (const f of fs.readdirSync(wpJsonDir)) {
    jsonFiles.push(path.join(wpJsonDir, f));
  }

  console.log(`   novinek ke importu: ${jsonFiles.length}`);
  let i = 0;
  for (const file of jsonFiles) {
    i++;
    let d;
    try { d = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { stats.errors.push(`json-parse: ${file}: ${e.message}`); continue; }

    const slug = (() => { try { return decodeURIComponent(d.slug); } catch { return d.slug; } })();
    // NOTE: EXCLUDED_404 se vztahuje jen na PRODUKTY — novinka se stejným slugem je samostatný článek
    if (mapping.news[d.id]) continue;

    const existing = await db.prepare('SELECT id FROM news_posts WHERE slug = ?').get(slug);
    if (existing) { mapping.news[d.id] = existing.id; touch(); continue; }

    const title = cleanTitle(d.title?.rendered || '') || slug;
    const dateStr = d.date; // ISO
    const year = dateStr.substring(0, 4);
    const publishedAt = dateStr.replace('T', ' ').slice(0, 19);
    const categoryId = mapping.yearCats[year];
    if (!categoryId) { stats.errors.push(`year-cat-missing: ${slug} (${year})`); continue; }

    const ogImage = d.yoast_head_json?.og_image?.[0]?.url || null;
    const coverUrl = ogImage ? await importImage(ogImage, 'Hlavičky') : null;

    const excerptCz = stripHtml(d.excerpt?.rendered || '') || null;

    // Content: clean + import inline images
    let contentCz = await cleanContent(d.content?.rendered || '', 'Novinky');

    const result = await db.prepare(`
      INSERT INTO news_posts (slug, title_cz, content_cz, excerpt_cz, cover_image, cover_align,
        category_id, is_published, published_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'center', ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(slug, title, contentCz || null, excerptCz, coverUrl, categoryId, publishedAt);
    mapping.news[d.id] = result.lastInsertRowid;
    touch();
    stats.news++;
    if (i % 20 === 0) console.log(`   … ${i}/${jsonFiles.length}`);
  }
  saveMapping();
  console.log(`   novinek: ${stats.news}, obrázků celkem: ${stats.images}`);
}

// ═════════════════════════════════ MAIN ═════════════════════════════════════
async function main() {
  console.log('🚀 Nicolet CZ — kompletní migrace (fáze 2)\n');
  await initDatabase();
  try {
    if (!ONLY || ONLY === 'A') await phaseA();
    if (!ONLY || ONLY === 'B') await phaseB();
    if (!ONLY || ONLY === 'C') await phaseC();
    if (!ONLY || ONLY === 'D') await phaseD();

    console.log('\n' + '─'.repeat(50));
    console.log('📊 Souhrn:');
    console.log(`   Kategorie produktů:  ${stats.cats}`);
    console.log(`   Ročníkové rubriky:   ${stats.yearCats}`);
    console.log(`   Obrázky:             ${stats.images}`);
    console.log(`   Okruhy aplikací:     ${stats.groups}`);
    console.log(`   Aplikace:            ${stats.apps}`);
    console.log(`   Produkty:            ${stats.products}`);
    console.log(`   Vazby kat.↔produkt:  ${stats.catLinks}`);
    console.log(`   Vazby prod.↔aplik.:  ${stats.appLinks}`);
    console.log(`   Novinky:             ${stats.news}`);
    if (stats.warnings.length) console.log(`   ⚠️  varování: ${stats.warnings.length} (první 5: ${stats.warnings.slice(0, 5).join(' | ')})`);
    if (stats.errors.length) console.log(`   ❌ chyby: ${stats.errors.length} (první 5: ${stats.errors.slice(0, 5).join(' | ')})`);
    console.log('─'.repeat(50));
  } finally {
    await closeDatabase();
  }
  process.exit(stats.errors.length ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });