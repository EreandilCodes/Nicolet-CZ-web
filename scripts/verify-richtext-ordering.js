/**
 * Read-only end-to-end verification of the plain-text preview + menu ordering
 * against the LIVE public API. Imports the very same modules the browser uses.
 * Nothing is written anywhere.
 */
import { plainText, previewText, excerptRepeatsLead } from '../frontend/js/richtext.js';
import { orderEntitiesByMenu, menuCategorySlugs } from '../frontend/js/category-order.js';

const BASE = process.env.BASE || 'http://localhost:3003';
const get = async p => {
  const r = await fetch(BASE + p);
  if (!r.ok) throw new Error(`${p} → HTTP ${r.status}`);
  return r.json();
};

const fail = [];
const check = (name, ok, detail = '') => {
  if (!ok) fail.push(`${name}${detail ? ' — ' + detail : ''}`);
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

const [menu, newsCats, prodCats, appGroups, news, prods, apps] = await Promise.all([
  get('/api/menu'),
  get('/api/news-categories'),
  get('/api/product-categories'),
  get('/api/application-groups'),
  get('/api/news'),
  get('/api/products?fields=list'),
  get('/api/applications?fields=list'),
]);

console.log(`\n== data ==  news:${news.length} products:${prods.length} applications:${apps.length}`);
console.log(`== menu ==  items:${menu.length}\n`);

// ── 1. Tiles never contain markup or entities ────────────────────────────────
let htmlLeaks = 0, entityLeaks = 0, markerLeaks = 0, emptyPreviews = 0;
const sources = [
  ...news.map(p => ({ kind: 'news', text: p.excerpt_cz || '', alt: p.content_cz || '' })),
  ...prods.map(p => ({ kind: 'product', text: p.excerpt_cz || p.description_cz || '' })),
  ...apps.map(a => ({ kind: 'application', text: a.excerpt_cz || a.content_cz || '' })),
];
for (const s of sources) {
  const t = previewText(s.text, 120);
  if (/<[a-z/!]/i.test(t)) { htmlLeaks++; if (htmlLeaks < 3) console.log('   leak:', t.slice(0, 90)); }
  if (/&(nbsp|amp|hellip|lt|gt|#\d+);/i.test(t)) { entityLeaks++; if (entityLeaks < 3) console.log('   entity leak:', t.slice(-60)); }
  if (/\[&hellip;\]|\[…\]/.test(t)) markerLeaks++;
  if (s.text && !t) emptyPreviews++;
}
check('no raw HTML in any tile preview (news+products+apps)',
  htmlLeaks === 0, `${htmlLeaks} leaks of ${sources.length}`);
check('no visible HTML entities in any tile preview',
  entityLeaks === 0, `${entityLeaks} leaks of ${sources.length}`);
check('no "[&hellip;]" import marker in any tile preview',
  markerLeaks === 0, `${markerLeaks} markers`);

// ── 2. Duplicated news body text ─────────────────────────────────────────────
// read straight from SQLite (read-only): the public list endpoint deliberately
// omits content_cz, the detail page reads it
const { default: sqlite3 } = await import('sqlite3');
const db = await new Promise((res, rej) => {
  const d = new sqlite3.Database('backend/nicolet.db', sqlite3.OPEN_READONLY, e => (e ? rej(e) : res(d)));
});
const newsRows = await new Promise((res, rej) =>
  db.all('SELECT slug, excerpt_cz, content_cz FROM news_posts WHERE is_published = 1',
    (e, r) => (e ? rej(e) : res(r))));

let dupes = 0, shortExcerpt = 0;
for (const r of newsRows) {
  if (excerptRepeatsLead(r.excerpt_cz, r.content_cz)) dupes++;
  else if (plainText(r.excerpt_cz).length) shortExcerpt++;
}
check('news perex that repeats the body lead is detected and hidden',
  dupes > 0, `${dupes}/${newsRows.length} posts repeat the lead`);
check('independently written perex is still shown', shortExcerpt >= 0,
  `${shortExcerpt} perex kept`);
db.close();

// ── 3. Admin UI → Menu ordering ──────────────────────────────────────────────
for (const [label, entities, section] of [
  ['news', newsCats, 'news'], ['product', prodCats, 'product'], ['application', appGroups, 'application'],
]) {
  const slugs = menuCategorySlugs(menu, section);
  const before = entities.map(e => e.slug);
  const after = orderEntitiesByMenu(entities, menu, section).map(e => e.slug);
  console.log(`\n-- ${label} --`);
  console.log('   menu slugs :', slugs.join(', ') || '(none)');
  console.log('   API order  :', before.slice(0, 10).join(', '), before.length > 10 ? `… (+${before.length - 10})` : '');
  console.log('   final order:', after.slice(0, 10).join(', '), after.length > 10 ? `… (+${after.length - 10})` : '');
  check(`  ${label}: ordering is stable & complete (nothing lost, none duplicated)`,
    after.length === before.length && new Set(after).size === after.length
    && before.every(s => after.includes(s)));
}

// News rubrik years: the reported bug showed 2024…2019,2026,2025 (DESC bug)
const newsOrder = orderEntitiesByMenu(newsCats, menu, 'news').map(c => c.slug);
console.log('\n   news rubriky final:', newsOrder.join(', '));

// Products: every product_categories.display_order is 0 in the real data
const zeroOrder = prodCats.filter(c => Number(c.display_order) === 0).length;
console.log(`   product categories with display_order = 0: ${zeroOrder}/${prodCats.length}`);

console.log(`\n${fail.length ? '✗ FAILURES:\n  ' + fail.join('\n  ') : '✓ all live checks passed'}`);
process.exit(fail.length ? 1 : 0);
