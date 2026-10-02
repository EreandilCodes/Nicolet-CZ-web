/**
 * Dump every table of the connected PostgreSQL database to a single JSON file.
 * Used as a rollback safety net before a data migration.
 *   NODE_PATH=/app/node_modules node scripts/dump-postgres.js /tmp/out.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');

if (!process.env.DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(1); }
const out = process.argv[2] || '/tmp/pg-dump.json';

const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();

const tables = (await pg.query(
  `SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`
)).rows.map(r => r.table_name);

const dump = { takenAt: new Date().toISOString(), tables: {} };
let total = 0;
for (const t of tables) {
  const { rows } = await pg.query(`SELECT * FROM ${t}`);
  dump.tables[t] = rows;
  total += rows.length;
  console.log(`  ${t.padEnd(28)} ${rows.length}`);
}

const fs = require('fs');
fs.writeFileSync(out, JSON.stringify(dump, null, 1));
console.log(`\nwrote ${out} — ${total} rows across ${tables.length} tables`);
await pg.end();
