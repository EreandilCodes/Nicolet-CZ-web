/**
 * remap-internal-links.js — přemapuje interní odkazy v obsahu novinek na nové routy.
 * Idempotentní: opakované spuštění nenajde žádné staré odkazy a neudělá nic.
 */
import db, { closeDatabase } from '../backend/database.js';

const stats = { news: 0, products: 0, applications: 0, docs: [] };

async function remapNews() {
  const rows = await db.prepare(
    "SELECT id, content_cz FROM news_posts WHERE content_cz LIKE '%https://nicoletcz.cz/%'"
  ).all();
  for (const row of rows) {
    let c = row.content_cz;
    // /produkt/{slug}/ → /produkty/{slug}
    c = c.replace(/href="https:\/\/nicoletcz\.cz\/produkt\/([^"#?]+)\/?"/g, (_m, slug) => `href="/produkty/${slug}"`);
    // /aplikace/{group}/{app}/ → /aplikace/{app}
    c = c.replace(/href="https:\/\/nicoletcz\.cz\/aplikace\/[a-z-]+\/([a-z0-9-]+)\/?"/g, (_m, app) => `href="/aplikace/${app}"`);
    // /aplikace/{group}/ → /aplikace
    c = c.replace(/href="https:\/\/nicoletcz\.cz\/aplikace\/([a-z-]+)\/?"/g, 'href="/aplikace"');
    // bare root
    c = c.replace(/href="https:\/\/nicoletcz\.cz\/aplikace\/"/g, 'href="/aplikace"');
    if (c !== row.content_cz) {
      await db.prepare('UPDATE news_posts SET content_cz = ? WHERE id = ?').run(c, row.id);
      stats.news++;
    }
  }
}

async function main() {
  await remapNews();
  console.log(`remap hotov: novinky upraveny: ${stats.news}`);
  // report zbývajících odkazů na dokumenty (PDF) — ty migrovány nebyly (viz rizika)
  const docRows = await db.prepare(
    "SELECT slug, title_cz FROM news_posts WHERE content_cz LIKE '%app/uploads/%.pdf%'"
  ).all();
  console.log(`novinky odkazující na PDF dokumenty (nepřeneseny): ${docRows.length}`, docRows.map(r => r.slug).slice(0, 10).join(', '));
  await closeDatabase();
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });