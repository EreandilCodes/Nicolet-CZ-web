#!/usr/bin/env node
/**
 * Copy the local SQLite development database into the production PostgreSQL
 * database. This exists because `backend/nicolet.db` is gitignored: deploying
 * from git ships code only, so a fresh production Postgres gets empty tables
 * from `initDatabase()` and seed rows, never the real content.
 *
 * Design rules (see AGENTS.md):
 *  - NON-DESTRUCTIVE. Nothing is dropped, truncated or deleted. Rows are
 *    upserted by primary key, so production seed rows are overwritten with the
 *    local (authoritative) version and any production-only row is LEFT ALONE
 *    and reported. Re-running the script is safe.
 *  - Explicit ids are preserved, because the mapping tables
 *    (product_categories_map, product_applications_map) reference content ids.
 *    After copying, every sequence is reset with setval() — without that the
 *    first new record created through the admin UI collides on the PK.
 *  - Speaks to `pg` DIRECTLY instead of the project's dual-DB `database.js`
 *    layer. That layer deliberately has no transaction runner (AGENTS.md rule
 *    4); a data copy is exactly the case where a partial import would be
 *    worse than a deviated convention, so this script uses one real
 *    transaction around the whole copy.
 *
 * Usage:
 *   node scripts/migrate-sqlite-to-postgres.js --sqlite backend/nicolet.db --dry-run
 *   node scripts/migrate-sqlite-to-postgres.js --sqlite backend/nicolet.db
 *   node scripts/migrate-sqlite-to-postgres.js --tables news_posts,products
 *
 * Requires DATABASE_URL in the environment.
 */
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

// ── args ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (name, dflt = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const DRY = argv.includes('--dry-run');
const SQLITE_PATH = arg('sqlite', 'backend/nicolet.db');
const ONLY = arg('tables') ? arg('tables').split(',').map(s => s.trim()).filter(Boolean) : null;

// parents before children; mapping tables last
const DEFAULT_ORDER = [
  'settings', 'contacts', 'gallery_folders',
  'news_categories', 'product_categories', 'application_groups',
  'pages', 'faqs', 'buttons', 'forms', 'carousel_items', 'trainings',
  'news_posts', 'products', 'applications', 'gallery_images',
  'product_categories_map', 'product_applications_map', 'form_submissions',
  'menu_items',
];

// The admin account is infrastructure, not content. Production already has one,
// and copying the local row would overwrite its password hash — silently
// reverting any password rotation. Pass --include-users to force it.
const SKIP_DEFAULT = ['users'];

// Natural keys for tables whose id numbering differs between the two databases.
// Both were seeded by the same `initDatabase()`, but earlier seed attempts on
// production consumed ids, so its auto-increment assigned different numbers to
// the same logical rows. Matching on the natural key keeps each row in place
// instead of colliding with a different row that happens to hold the same slug.
const CONFLICT_KEY = {
  pages: ['slug'],
};

const log = (...a) => console.log(...a);
const fail = [];
const note = m => { fail.push(m); console.log('   !! ' + m); };

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required. Refusing to run against an unknown database.');
  process.exit(1);
}
// never print the connection string — it carries the password
const target = (() => { try { return new URL(process.env.DATABASE_URL).host; } catch { return '<unparseable>'; } })();
log(`source : ${SQLITE_PATH}`);
log(`target : postgresql @ ${target}`);
log(`mode   : ${DRY ? 'DRY RUN (no writes)' : 'LIVE'}`);
log('');

// ── connections ────────────────────────────────────────────────────────────
const sqlite3 = require('sqlite3');
const { Client } = require('pg');
const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const db = new sqlite3.Database(SQLITE_PATH, sqlite3.OPEN_READONLY, e => { if (e) { console.error('Cannot open SQLite:', e.message); process.exit(1); } });

const sqlAll = (q, p = []) => new Promise((res, rej) => db.all(q, p, (e, r) => e ? rej(e) : res(r)));
const sqlOne = (q, p = []) => new Promise((res, rej) => db.get(q, p, (e, r) => e ? rej(e) : res(r)));

// ── SQLite datetime text -> ISO Z (SQLite CURRENT_TIMESTAMP is UTC) ───────
const TS_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?$/;
function normValue(val, dataType) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string' && /^timestamp|timestamp with|time zone$/i.test(dataType)) {
    const m = TS_RE.exec(val.trim());
    if (m) return `${m[1]}T${m[2]}${m[3] ? '.' + m[3].padEnd(3, '0') : ''}Z`;
  }
  if (Buffer.isBuffer(val)) return '\\x' + val.toString('hex');
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (typeof val === 'bigint') return Number(val);
  return val;
}

(async () => {
  await pg.connect();

  const requested = ONLY || DEFAULT_ORDER;
  const tables = argv.includes('--include-users') ? requested : requested.filter(t => !SKIP_DEFAULT.includes(t));
  if (requested.length !== tables.length) {
    log(`!! skipped by default (use --include-users to copy): ${requested.filter(t => !tables.includes(t)).join(', ')}`);
  }

  // production columns, with real types
  const pgCols = (await pg.query(
    `SELECT table_name, column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY($1)`,
    [tables]
  )).rows.reduce((acc, r) => {
    (acc[r.table_name] ||= {})[r.column_name] = r.data_type;
    return acc;
  }, {});

  // Primary keys are NOT always "id": settings is keyed by `key`, and both
  // mapping tables have composite keys. Reading them from the catalogue is what
  // lets the upsert target the right conflict and keeps the copy idempotent.
  const pkCols = (await pg.query(
    `SELECT tc.table_name, kcu.column_name, kcu.ordinal_position
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_name = ANY($1)
      ORDER BY tc.table_name, kcu.ordinal_position`,
    [tables]
  )).rows.reduce((acc, r) => {
    (acc[r.table_name] ||= []).push(r.column_name);
    return acc;
  }, {});

  const total = { copied: 0, tables: 0 };
  const pgOnlyRows = [];
  const localOnlyCols = [];

  // one transaction for the whole copy
  if (!DRY) await pg.query('BEGIN');

  try {
    for (const t of tables) {
      const cols = pgCols[t];
      if (!cols) { log(`\n-- ${t}: not present in production, skipped`); continue; }

      let localCols;
      try { localCols = (await sqlAll(`PRAGMA table_info(${t})`)).map(c => c.name); }
      catch { log(`\n-- ${t}: not present in SQLite, skipped`); continue; }

      // only write columns that exist on BOTH sides
      const shared = localCols.filter(c => cols[c]);
      const only = localCols.filter(c => !cols[c]);
      if (only.length) { localOnlyCols.push(`${t}: ${only.join(', ')}`); note(`${t} has columns missing in production: ${only.join(', ')}`); }
      if (!shared.length) { log(`\n-- ${t}: no shared columns, skipped`); continue; }

      // conflict target = natural key if declared, else the real primary key
      const pk = (pkCols[t] || []).filter(c => shared.includes(c));
      const nat = (CONFLICT_KEY[t] || []).filter(c => shared.includes(c));
      const useNat = nat.length > 0;
      const targetCols = useNat ? nat : pk;
      const target_ = targetCols.length ? `(${targetCols.join(', ')})` : '';

      // On a natural-key match the id must NOT be sent: the row already exists
      // under a different id (production's auto-increment assigned different
      // numbers), so including it would violate the primary key before
      // PostgreSQL ever got to the slug conflict. Let the existing row keep its
      // id and take its content from the local version.
      const insertCols = useNat ? shared.filter(c => c !== 'id') : shared;
      const setList = shared
        .filter(c => !targetCols.includes(c) && !(useNat && c === 'id'))
        .map(c => `${c} = EXCLUDED.${c}`);
      const sql =
        `INSERT INTO ${t} (${insertCols.join(', ')}) VALUES (${insertCols.map((_, i) => `$${i + 1}`).join(', ')})` +
        (setList.length
          ? ` ON CONFLICT ${target_} DO UPDATE SET ${setList.join(', ')}`
          : ` ON CONFLICT ${target_} DO NOTHING`);

      const rows = await sqlAll(`SELECT ${shared.join(', ')} FROM ${t}`);
      if (!rows.length) { log(`\n-- ${t}: 0 rows in SQLite`); continue; }

      const before = (await pg.query(`SELECT COUNT(*)::int AS c FROM ${t}`)).rows[0].c;
      const key = targetCols.length ? targetCols.join('+') : '(no key)';

      if (DRY) {
        log(`\n-- ${t}: would upsert ${rows.length} rows on (${key}) — production currently has ${before}`);
      } else {
        for (const r of rows) {
          const vals = insertCols.map(c => normValue(r[c], cols[c]));
          try {
            await pg.query(sql, vals);
          } catch (e) {
            // Fail fast and loud. Inside a transaction one error aborts the whole
            // block, so continuing would only print a cascade of "current
            // transaction is aborted" and hide the actual cause.
            const ident = targetCols.length ? targetCols.map(c => `${c}=${r[c]}`).join(' ') : '(?)';
            throw new Error(
              `${t} [${ident}] could not be written: ${e.message.split('\n')[0]}\n` +
              `  Nothing was applied — the whole copy is rolled back.`
            );
          }
        }
        const after = (await pg.query(`SELECT COUNT(*)::int AS c FROM ${t}`)).rows[0].c;
        total.copied += rows.length; total.tables++;
        log(`\n-- ${t}: upserted ${rows.length} rows on (${key}) — production ${before} -> ${after}`);
      }
    }

    // ── sequences ──────────────────────────────────────────────────────────
    // Without setval() the next INSERT through the admin UI collides on the PK.
    // Only meaningful for single-column `id` keys; the mapping tables and
    // `settings` have no serial and must be skipped.
    if (!DRY) {
      log('\n-- resetting sequences');
      let n = 0;
      for (const t of tables) {
        if (!pgCols[t]) continue;
        const pk = pkCols[t] || [];
        if (pk.length !== 1 || pk[0] !== 'id') continue;
        try {
          await pg.query(
            `SELECT setval(pg_get_serial_sequence($1, 'id'),
                          GREATEST(COALESCE((SELECT MAX(id) FROM ${t}), 0), 1), true)`, [t]);
          n++;
        } catch (e) { note(`sequence ${t}: ${e.message.split('\n')[0]}`); }
      }
      log(`   ${n} sequence(s) reset`);
    }

    if (!DRY) await pg.query('COMMIT');
  } catch (e) {
    if (!DRY) { await pg.query('ROLLBACK'); console.error('\nROLLED BACK — production unchanged.'); }
    console.error('Migration error:', e.message);
    await pg.end(); db.close();
    process.exit(1);
  }

  // ── verification ────────────────────────────────────────────────────────
  // Guard against a table silently falling out of DEFAULT_ORDER: compare the
  // list against what production actually has. An omission shows up as a table
  // that production still empties after the copy.
  const prodTables = (await pg.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE'`
  )).rows.map(r => r.table_name);
  const notListed = prodTables.filter(t => !tables.includes(t));
  if (notListed.length) {
    log(`\ntables in production that this run does NOT touch:`);
    for (const t of notListed) log(`  - ${t}`);
  }

  log('\n=== verification (SQLite -> production) ===');
  log(`   ${'table'.padEnd(26)}${'sqlite'.padStart(8)}${'prod'.padStart(8)}`);
  let mismatch = 0;
  for (const t of tables) {
    if (!pgCols[t]) continue;
    let localN;
    try { localN = (await sqlOne(`SELECT COUNT(*) c FROM ${t}`)).c; } catch { continue; }
    const prodN = (await pg.query(`SELECT COUNT(*)::int AS c FROM ${t}`)).rows[0].c;
    const mark = prodN === localN ? '  ' : '<-';
    if (prodN !== localN) mismatch++;
    log(`${mark} ${t.padEnd(26)}${String(localN).padStart(8)}${String(prodN).padStart(8)}`);
    if (prodN !== localN && prodN > localN) {
      pgOnlyRows.push(`${t}: ${prodN - localN} production-only row(s) left untouched`);
    }
  }

  if (localOnlyCols.length) { log('\ncolumns present only in SQLite (reported above, not written):'); for (const l of localOnlyCols) log('  - ' + l); }
  if (pgOnlyRows.length) { log('\nproduction rows with no SQLite counterpart (left untouched):'); for (const p of pgOnlyRows) log('  - ' + p); }

  log(`\n${DRY ? 'DRY RUN — nothing was written.' : `DONE. ${total.copied} rows across ${total.tables} tables.`}`);
  if (fail.length) log(`\n${fail.length} warning(s) — see "!!" lines above.`);
  await pg.end(); db.close();
  process.exit(0);
})().catch(async e => {
  console.error('Fatal:', e.message);
  try { if (!DRY) await pg.query('ROLLBACK'); } catch {}
  try { await pg.end(); } catch {}
  db.close();
  process.exit(1);
});
