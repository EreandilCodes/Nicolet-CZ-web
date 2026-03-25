/**
 * Application migration script — OldWebData/aplikace/ → Nicolet CZ API
 *
 * Structure:
 *   aplikace/{group}/index.html           → application_groups entry
 *   aplikace/{group}/{sub-app}/index.html → applications entry
 *
 * - Creates 8 application groups (CZ + EN names from og:title + EN URL)
 * - Creates ~61 applications with content from "popis-aplikace-tab" / "o-aplikaci-tab"
 *   (ONLY the application description tab — NOT instrument/machine tabs)
 * - Uploads og:image to gallery folder "Aplikace" as thumbnail + cover_image
 * - Groups with no sub-apps (ropny-prumysl, ostatni-aplikace) are created as groups only
 *
 * Usage: node --require ./scripts/polyfill-node18.cjs scripts/migrate_applications.js
 * Server must be running on port 3003.
 */

import { load } from 'cheerio';
import { createWriteStream } from 'fs';
import { unlink, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ───────────────────────────────────────────────────────────────────
const API_BASE      = 'http://localhost:3003';
const ADMIN_EMAIL   = 'admin@nicolet.cz';
const ADMIN_PASS    = 'admin123';
const APPS_DIR      = path.join(__dirname, '../OldWebData/aplikace');
const TMP_DIR       = path.join(__dirname, '_tmp_app_images');

// ─── Stats ────────────────────────────────────────────────────────────────────
const stats = {
  groupsCreated: 0, appsCreated: 0, imagesImported: 0, failures: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function slugify(str) {
  return String(str || '')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\+/g, '-plus')
    .replace(/&/g, ' a ').replace(/[^a-z0-9\s-]/g, ' ').trim()
    .replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    .substring(0, 100);
}

function norm(str) { return String(str || '').replace(/\s+/g, ' ').trim(); }

/** Convert URL slug to Title Case English name */
function urlSlugToEnName(slug) {
  if (!slug) return '';
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Extract last non-empty segment from a URL path */
function lastUrlSegment(url) {
  if (!url) return '';
  const parts = url.replace(/\/$/, '').split('/');
  return parts[parts.length - 1] || '';
}

// ─── HTML parsing ─────────────────────────────────────────────────────────────

/**
 * Tab IDs that contain the application description (in priority order).
 * We skip any tabs related to instruments/machines.
 */
const CONTENT_TAB_IDS = [
  'popis-aplikace-tab',
  'o-aplikaci-tab',
  'vce-o-aplikaci-tab',
];

function parseGroupPage(html, folderSlug) {
  const $ = load(html);

  // CZ name from og:title (strip " - Nicolet CZ")
  const ogTitle = $('meta[property="og:title"]').attr('content') || '';
  const nameCz = norm(ogTitle.replace(/\s*-\s*Nicolet CZ\s*$/i, ''));

  // EN name from hreflang="en" href URL last segment
  const enUrl = $('link[hreflang="en"]').attr('href') || '';
  const enSegment = lastUrlSegment(enUrl);
  const nameEn = urlSlugToEnName(enSegment);

  // Thumbnail from og:image
  const thumbUrl = $('meta[property="og:image"]').attr('content') || '';

  // og:description as brief description (for reference, not stored in group)
  const desc = $('meta[property="og:description"]').attr('content') || '';

  return { slug: folderSlug, nameCz, nameEn, thumbUrl, desc };
}

function parseApplicationPage(html, folderSlug) {
  const $ = load(html);

  // Check if this is a 404/missing page
  const title = $('title').text();
  if (/stránka nenalezena|page not found|404/i.test(title)) return null;

  // CZ name from og:title
  const ogTitle = $('meta[property="og:title"]').attr('content') || '';
  const nameCz = norm(ogTitle.replace(/\s*-\s*Nicolet CZ\s*$/i, ''));
  if (!nameCz) return null;

  // EN name from hreflang="en" href URL last segment
  const enUrl = $('link[hreflang="en"]').attr('href') || '';
  const enSegment = lastUrlSegment(enUrl);
  const nameEn = urlSlugToEnName(enSegment);

  // Thumbnail from og:image
  const thumbUrl = $('meta[property="og:image"]').attr('content') || '';

  // Content: find the first matching application-description tab
  let contentCz = '';
  for (const tabId of CONTENT_TAB_IDS) {
    const tabEl = $(`#${tabId}`);
    if (tabEl.length) {
      // Clean up the tab content: remove elementor wrapper divs, keep semantic HTML
      contentCz = cleanTabContent(tabEl.html() || '');
      if (contentCz.trim()) break;
    }
  }

  // Fallback: og:description as plain text
  if (!contentCz) {
    const ogDesc = $('meta[property="og:description"]').attr('content') || '';
    contentCz = norm(ogDesc);
  }

  return { slug: folderSlug, nameCz, nameEn, thumbUrl, contentCz };
}

function cleanTabContent(html) {
  if (!html) return '';
  const $ = load(`<div id="_root">${html}</div>`);

  // Remove script/style/noscript
  $('script, style, noscript, iframe').remove();

  // Remove elementor utility divs but keep their inner HTML
  // We want to preserve p, h1-h6, ul, ol, li, a, strong, em, img, figure, table
  // Remove empty elementor wrapper divs
  $('[class*="elementor-widget-wrap"], [class*="elementor-widget-container"]').each((_, el) => {
    $(el).replaceWith($(el).html() || '');
  });

  // Remove divs that are purely structural (no semantic class)
  $('div').each((_, el) => {
    const cls = $(el).attr('class') || '';
    if (!cls || /elementor/.test(cls)) {
      $(el).replaceWith($(el).html() || '');
    }
  });

  let result = $('#_root').html() || '';

  // Clean up
  result = result
    .replace(/\n{3,}/g, '\n\n')
    .replace(/<!--[^>]*-->/g, '')
    .trim();

  return result;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
let _token = null;

async function getToken() {
  if (_token) return _token;
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const { token } = await res.json();
  _token = token;
  return token;
}

function authHeaders(extra = {}) {
  return { Authorization: `Bearer ${_token}`, ...extra };
}

// ─── Gallery ──────────────────────────────────────────────────────────────────
let _galleryFolderId = null;

async function ensureGalleryFolder(nameCz) {
  await getToken();

  // List existing folders (admin endpoint returns all)
  const res = await fetch(`${API_BASE}/api/gallery/folders/admin/all`, {
    headers: authHeaders(),
  });
  const folders = await res.json();
  const existing = folders.find(f => f.name_cz === nameCz);
  if (existing) {
    _galleryFolderId = existing.id;
    console.log(`  Gallery folder "${nameCz}" already exists (id=${existing.id})`);
    return existing.id;
  }

  // Create via /api/gallery/folders/admin
  const cr = await fetch(`${API_BASE}/api/gallery/folders/admin`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name_cz: nameCz }),
  });
  if (!cr.ok) {
    const t = await cr.text();
    throw new Error(`Create folder failed: ${cr.status} ${t}`);
  }
  const folder = await cr.json();
  _galleryFolderId = folder.id;
  console.log(`  Created gallery folder "${nameCz}" (id=${folder.id})`);
  return folder.id;
}

/** Download a remote image URL to a tmp file, upload to gallery, return image_url */
async function importImage(remoteUrl, altText) {
  if (!remoteUrl || !_galleryFolderId) return null;

  // Download
  const tmpPath = path.join(TMP_DIR, `app_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
  try {
    const dlRes = await fetch(remoteUrl);
    if (!dlRes.ok) return null;

    // Ensure tmp dir exists
    import('fs').then(({ mkdirSync }) => mkdirSync(TMP_DIR, { recursive: true })).catch(() => {});
    const { mkdirSync } = await import('fs');
    mkdirSync(TMP_DIR, { recursive: true });

    const ws = createWriteStream(tmpPath);
    await pipeline(Readable.fromWeb(dlRes.body), ws);

    // Upload to gallery
    const fileData = await readFile(tmpPath);
    const ext = (remoteUrl.split('.').pop().split('?')[0] || 'jpg').toLowerCase().replace(/[^a-z]/g, '') || 'jpg';
    const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
    const fileName = `${slugify(altText || 'image').substring(0, 40)}.${ext}`;

    const formData = new FormData();
    formData.append('image', new Blob([fileData], { type: mime }), fileName);
    formData.append('folder_id', String(_galleryFolderId));
    formData.append('title_cz', altText || '');

    const upRes = await fetch(`${API_BASE}/api/gallery/images/admin/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${_token}` },
      body: formData,
    });

    if (!upRes.ok) {
      const t = await upRes.text();
      console.warn(`    Upload failed for ${remoteUrl}: ${upRes.status} ${t.substring(0, 100)}`);
      return null;
    }

    const img = await upRes.json();
    stats.imagesImported++;
    return img.image_url || null;
  } catch (err) {
    console.warn(`    Image import error for ${remoteUrl}: ${err.message}`);
    return null;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

// ─── API calls ────────────────────────────────────────────────────────────────

// Cache of existing groups loaded once at startup
let _existingGroups = null;
async function loadExistingGroups() {
  if (_existingGroups) return _existingGroups;
  await getToken();
  const res = await fetch(`${API_BASE}/api/application-groups/admin/all`, {
    headers: authHeaders(),
  });
  _existingGroups = await res.json();
  return _existingGroups;
}

async function createGroup(data) {
  await getToken();
  const existing = (await loadExistingGroups()).find(g => g.slug === data.slug);
  if (existing) {
    console.log(`  ↩️  Group "${data.nameCz}" already exists (id=${existing.id})`);
    return existing;
  }
  const res = await fetch(`${API_BASE}/api/application-groups/admin`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      slug: data.slug,
      name_cz: data.nameCz,
      name_en: data.nameEn || null,
      display_order: data.order || 0,
      is_active: 1,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Create group failed: ${res.status} ${t}`);
  }
  const created = await res.json();
  _existingGroups.push(created);
  return created;
}

// Cache existing applications (slug → record)
let _existingApps = null;
async function loadExistingApps() {
  if (_existingApps) return _existingApps;
  await getToken();
  const res = await fetch(`${API_BASE}/api/applications/admin/all`, { headers: authHeaders() });
  const apps = await res.json();
  _existingApps = new Map(apps.map(a => [a.slug, a]));
  return _existingApps;
}

async function updateApplicationThumbnail(id, imageUrl) {
  await getToken();
  // GET current data first, then PUT with thumbnail
  const getRes = await fetch(`${API_BASE}/api/applications/admin/all`, { headers: authHeaders() });
  const apps = await getRes.json();
  const app = apps.find(a => a.id === id);
  if (!app) return;
  const putRes = await fetch(`${API_BASE}/api/applications/admin/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      ...app,
      thumbnail_url: imageUrl,
      cover_image: imageUrl,
      product_ids: [],
    }),
  });
  if (!putRes.ok) {
    const t = await putRes.text();
    console.warn(`    PUT thumbnail failed: ${putRes.status} ${t.substring(0, 80)}`);
  }
}

async function createApplication(data) {
  await getToken();
  const existing = await loadExistingApps();
  const existingApp = existing.get(data.slug);
  if (existingApp) {
    // Update thumbnail if missing
    if (!existingApp.thumbnail_url && data.imageUrl) {
      await updateApplicationThumbnail(existingApp.id, data.imageUrl);
      existingApp.thumbnail_url = data.imageUrl;
      return { _updated: true, id: existingApp.id };
    }
    return { _exists: true };
  }
  const res = await fetch(`${API_BASE}/api/applications/admin`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      group_id: data.groupId,
      slug: data.slug,
      name_cz: data.nameCz,
      name_en: data.nameEn || null,
      content_cz: data.contentCz || null,
      content_en: null,
      cover_image: data.imageUrl || null,
      thumbnail_url: data.imageUrl || null,
      cover_align: 'center',
      is_published: 1,
      is_featured: 0,
      display_order: data.order || 0,
      seo_title_cz: data.nameCz || null,
      seo_title_en: data.nameEn || null,
      product_ids: [],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    if (t.includes('Slug již existuje') || t.includes('UNIQUE')) {
      return { _exists: true };
    }
    throw new Error(`Create application failed: ${res.status} ${t}`);
  }
  const created = await res.json();
  _existingApps?.set(data.slug, created);
  return created;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Starting application migration...\n');
  await getToken();
  console.log('✅ Auth OK\n');

  // Ensure gallery folder
  await ensureGalleryFolder('Aplikace');
  console.log();

  // Read group folders in order
  const { readdirSync, statSync } = await import('fs');
  const groupFolders = readdirSync(APPS_DIR)
    .filter(name => {
      const p = path.join(APPS_DIR, name);
      return statSync(p).isDirectory();
    })
    .sort();

  let groupOrder = 0;

  for (const groupFolder of groupFolders) {
    const groupDir = path.join(APPS_DIR, groupFolder);
    const groupIndexPath = path.join(groupDir, 'index.html');

    let groupHtml;
    try {
      groupHtml = await readFile(groupIndexPath, 'utf-8');
    } catch {
      console.warn(`  ⚠️  No index.html in ${groupFolder}, skipping`);
      continue;
    }

    const groupData = parseGroupPage(groupHtml, groupFolder);
    if (!groupData.nameCz) {
      console.warn(`  ⚠️  Could not parse group name from ${groupFolder}`);
      continue;
    }

    console.log(`📁 Group: ${groupData.nameCz} / ${groupData.nameEn}`);

    // Create the group
    let group;
    try {
      const wasNew = !(await loadExistingGroups()).find(g => g.slug === groupData.slug);
      group = await createGroup({ ...groupData, order: groupOrder++ });
      if (wasNew) { stats.groupsCreated++; console.log(`  ✅ Group created (id=${group.id})`); }
    } catch (err) {
      console.error(`  ❌ Group creation failed: ${err.message}`);
      stats.failures.push({ type: 'group', slug: groupFolder, error: err.message });
      continue;
    }

    // Find sub-application folders
    const subFolders = readdirSync(groupDir)
      .filter(name => {
        const p = path.join(groupDir, name);
        return statSync(p).isDirectory();
      })
      .sort();

    if (subFolders.length === 0) {
      console.log(`  (no sub-applications)\n`);
      continue;
    }

    let appOrder = 0;

    for (const subFolder of subFolders) {
      const subDir = path.join(groupDir, subFolder);
      const subIndexPath = path.join(subDir, 'index.html');

      let subHtml;
      try {
        subHtml = await readFile(subIndexPath, 'utf-8');
      } catch {
        console.warn(`    ⚠️  No index.html in ${groupFolder}/${subFolder}`);
        continue;
      }

      const appData = parseApplicationPage(subHtml, subFolder);
      if (!appData) {
        console.log(`    ⏭️  Skipping ${subFolder} (404 or no name)`);
        continue;
      }

      process.stdout.write(`    📄 ${appData.nameCz}...`);

      // Import thumbnail image
      let imageUrl = null;
      if (appData.thumbUrl) {
        imageUrl = await importImage(appData.thumbUrl, appData.nameCz);
        if (imageUrl) process.stdout.write(` 🖼️`);
      }

      // Create application
      try {
        const result = await createApplication({
          groupId: group.id,
          slug: subFolder,           // use original folder slug directly
          nameCz: appData.nameCz,
          nameEn: appData.nameEn,
          contentCz: appData.contentCz,
          imageUrl,
          order: appOrder++,
        });

        if (result._updated) {
          stats.appsCreated++;
          console.log(` 🔄 thumbnail updated (id=${result.id})`);
        } else if (result._exists) {
          console.log(` ↩️  already exists`);
        } else {
          stats.appsCreated++;
          console.log(` ✅ (id=${result.id})`);
        }
      } catch (err) {
        console.log(` ❌ ${err.message}`);
        stats.failures.push({ type: 'app', slug: `${groupFolder}/${subFolder}`, error: err.message });
      }
    }
    console.log();
  }

  // ─── Summary ────────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════');
  console.log('✅ Migration complete');
  console.log(`   Groups created:   ${stats.groupsCreated}`);
  console.log(`   Apps created:     ${stats.appsCreated}`);
  console.log(`   Images imported:  ${stats.imagesImported}`);
  if (stats.failures.length) {
    console.log(`\n⚠️  Failures (${stats.failures.length}):`);
    for (const f of stats.failures) {
      console.log(`   [${f.type}] ${f.slug}: ${f.error}`);
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
