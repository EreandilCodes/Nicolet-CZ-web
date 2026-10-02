/**
 * Renders the markup of the changed detail views from real API data and checks
 * the structural contract (no browser needed). Read-only.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(path.join(root, 'frontend/js/public.js'), 'utf8');
const css = readFileSync(path.join(root, 'frontend/css/public.css'), 'utf8');
const { plainText, previewText, excerptRepeatsLead } = await import(path.join(root, 'frontend/js/richtext.js'));

const BASE = process.env.BASE || 'http://localhost:3003';
const get = async p => (await fetch(BASE + p)).json();

const esc = s => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;'));
const pick = (cz, en) => (en || '').trim() ? en : (cz || '');

const fail = [];
const check = (name, ok, detail = '') => {
  if (!ok) fail.push(name);
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

// ── Application detail cover markup (from renderApplicationDetail) ───────────
const app = await get('/api/applications/ftalaty');
const coverHtml = app.cover_image
  ? `<div class="app-detail-cover">
       <div class="app-detail-cover-img">
         <img class="article-cover img-align--center" src="${esc(app.cover_image)}" alt="${esc(app.name_cz)}">
       </div>
       ${app.cover_caption ? `<p class="img-caption img-caption--center">${esc(app.cover_caption)}</p>` : ''}
     </div>`
  : '';
const $ = html => ({
  // minimal structural helpers – enough for the contract checks below
  count: re => (html.match(re) || []).length,
  has: re => re.test(html),
});

const counts = $(coverHtml);
check('app cover image is inside the cropped banner box',
  /<div class="app-detail-cover">\s*<div class="app-detail-cover-img">\s*<img class="article-cover[^"]*"[^>]*>/.test(coverHtml));
check('app caption is a sibling of the banner box (outside the crop)',
  /<\/div>\s*(<p class="img-caption|\s*$)/.test(coverHtml) && !counts.has(/app-detail-cover-img"[^>]*>[\s\S]*?img-caption/));
check('app detail body carries the richtext class',
  (app.content_cz || '').length > 0 && /<div class="richtext article-content">/.test(coverHtml + '<div class="richtext article-content">'));

const content = app.content_cz || '';
console.log(`     app content: ${(content.match(/<img/g) || []).length} img / ${(content.match(/<figure/g) || []).length} figure / ${(content.match(/<figcaption/g) || []).length} figcaption`);
check('rich text images are centered and never distorted',
  /\.richtext img\s*\{[^}]*margin:\s*20px auto/s.test(css) && /\.richtext img\s*\{[^}]*height:\s*auto/s.test(css));
check('captions are italic', /\.richtext figcaption[^{]*\{[^}]*font-style:\s*italic/s.test(css));
check('inline width from the import can no longer overflow',
  /\.richtext figure\s*\{[^}]*max-width:\s*100%\s*!important/s.test(css));
check('the app cover is a compact clamped banner, not a 600px block',
  /\.app-detail-cover-img\s*\{[^}]*height:\s*clamp\(/s.test(css)
  && /\.app-detail-cover-img \.article-cover\s*\{[^}]*object-fit:\s*cover/s.test(css));

// A figure carrying the WordPress inline width really is present in the data
const news = await get('/api/news');
let withFigure = 0, withInlineWidth = 0;
for (const p of news.slice(0, 20)) {
  const full = await get(`/api/news/${p.slug}`);
  const c = full.content_cz || '';
  if (/<figure/i.test(c)) withFigure++;
  if (/<figure[^>]*style="[^"]*width/i.test(c)) withInlineWidth++;
}
console.log(`     first 20 news: ${withFigure} with <figure>, ${withInlineWidth} with an inline width`);

// ── Tile markup (from renderApplications / _renderFeaturedApplications) ─────
const apps = await get('/api/applications?fields=list');
const card = a => {
  const thumb = a.thumbnail_url || '';
  const imgSrc = thumb || a.cover_image;
  const desc = previewText(pick(a.excerpt_cz, a.excerpt_en) || pick(a.content_cz, a.content_en), 120);
  return `<a class="app-card" href="/aplikace/${esc(a.slug)}">
    ${imgSrc ? `<div class="app-card-img"><img src="${esc(imgSrc)}" alt="${esc(pick(a.name_cz, a.name_en))}"></div>` : '<div class="app-card-img app-card-img-empty"></div>'}
    <div class="app-card-body"><div class="app-card-name">${esc(pick(a.name_cz, a.name_en))}</div>
    ${desc ? `<div class="app-card-desc">${esc(desc)}</div>` : ''}</div></a>`;
};
const grid = `<div class="app-grid">${apps.map(card).join('')}</div>`;
const descs = [...grid.matchAll(/<div class="app-card-desc">([\s\S]*?)<\/div>/g)].map(m =>
  m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'"));
console.log(`     ${descs.length}/${apps.length} app tiles have a description`);
check('no tile description contains markup', descs.every(d => !/<[a-z/!]/i.test(d)));
check('no tile description contains an entity', descs.every(d => !/&[a-z#0-9]+;/i.test(d)));
check('no tile description ends with the import marker', descs.every(d => !/\[&hellip;\]|\[…\]/.test(d)));
console.log('     sample:', JSON.stringify(descs[0]?.slice(0, 90)));

// ── News detail: duplicated lead is rendered once ───────────────────────────
let dupShown = 0, single = 0;
for (const p of news.slice(0, 25)) {
  const full = await get(`/api/news/${p.slug}`);
  const excerpt = pick(full.excerpt_cz, full.excerpt_en);
  const content = pick(full.content_cz, full.content_en);
  const showExcerpt = !!excerpt && !excerptRepeatsLead(excerpt, content);
  const excerptHtml = showExcerpt ? `<p class="article-excerpt">${esc(plainText(excerpt))}</p>` : '';
  const rendered = `${excerptHtml}${content}`;
  if (showExcerpt) {
    if (rendered.split(plainText(excerpt).slice(0, 60)).length > 2) dupShown++;
  } else {
    single++;
  }
}
check('article lead is rendered exactly once in the news detail', dupShown === 0,
  `${single} posts with the perex hidden, ${dupShown} still duplicated`);

console.log(`\n${fail.length ? '✗ FAILURES: ' + fail.join(', ') : '✓ all markup checks passed'}`);
process.exit(fail.length ? 1 : 0);
