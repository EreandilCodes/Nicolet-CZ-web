import pg from 'pg';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Mode detection ────────────────────────────────────────────────────────────
// DB_PROVIDER=postgres  → PostgreSQL (Neon / Railway)
// DB_PROVIDER=sqlite    → SQLite (local dev, zero setup)
// Nothing set           → SQLite (safe default)
const isPostgres = process.env.DB_PROVIDER === 'postgres';

console.log(`🗄️  Database mode: ${isPostgres ? 'PostgreSQL' : 'SQLite'}`);

// ── Schema type tokens ────────────────────────────────────────────────────────
// TIMESTAMP and ON CONFLICT DO NOTHING work in both SQLite ≥3.24 and PostgreSQL.
// Only the primary key syntax differs.
const pk = isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';

// ── PostgreSQL wrapper ────────────────────────────────────────────────────────
function createPgDb() {
  const { Pool } = pg;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  pool.on('error', (err) => console.error('PG pool error:', err));

  function convertPlaceholders(sql) {
    let index = 0;
    return sql.replace(/\?/g, () => `$${++index}`);
  }

  return {
    _pool: pool,
    exec: async (sql) => { await pool.query(sql); },
    prepare: (sql) => {
      const isInsert = /^\s*INSERT/i.test(sql);
      // M:N mapping tables have no id column — skip RETURNING for those
      const noIdTable = /product_categories_map|product_applications_map|\bsettings\b/i.test(sql);
      const pgSql = convertPlaceholders(sql);
      const pgSqlRun = isInsert && !noIdTable && !/RETURNING/i.test(sql)
        ? pgSql.replace(/;?\s*$/, '') + ' RETURNING id'
        : pgSql;

      return {
        run: async (...params) => {
          const result = await pool.query(pgSqlRun, params);
          return {
            lastInsertRowid: isInsert && !noIdTable ? result.rows[0]?.id : undefined,
            changes: result.rowCount
          };
        },
        get: async (...params) => {
          const result = await pool.query(pgSql, params);
          return result.rows[0];
        },
        all: async (...params) => {
          const result = await pool.query(pgSql, params);
          return result.rows;
        }
      };
    }
  };
}

// ── SQLite wrapper ────────────────────────────────────────────────────────────
function createSqliteDb() {
  const dbPath = process.env.SQLITE_PATH
    ? path.resolve(process.env.SQLITE_PATH)
    : path.join(__dirname, 'nicolet.db');
  const sqliteDb = new sqlite3.Database(dbPath, (err) => {
    if (err) { console.error('❌ Failed to open SQLite database:', err); throw err; }
    console.log('✅ SQLite database opened:', dbPath);
  });
  sqliteDb.configure('busyTimeout', 30000);

  return {
    _sqliteDb: sqliteDb,
    exec: (sql) => new Promise((resolve, reject) => {
      sqliteDb.exec(sql, (err) => err ? reject(err) : resolve());
    }),
    prepare: (sql) => {
      const stmt = sqliteDb.prepare(sql);
      return {
        run: (...params) => new Promise((resolve, reject) => {
          stmt.run(...params, function(err) {
            if (err) reject(err);
            else resolve({ lastInsertRowid: this.lastID, changes: this.changes });
          });
        }),
        get: (...params) => new Promise((resolve, reject) => {
          stmt.get(...params, (err, row) => err ? reject(err) : resolve(row));
        }),
        all: (...params) => new Promise((resolve, reject) => {
          stmt.all(...params, (err, rows) => err ? reject(err) : resolve(rows));
        })
      };
    }
  };
}

// ── Export the right driver ───────────────────────────────────────────────────
const db = isPostgres ? createPgDb() : createSqliteDb();

// ── Schema initialization ─────────────────────────────────────────────────────
// Uses ${pk} for primary keys. TIMESTAMP and ON CONFLICT DO NOTHING
// are valid in both SQLite ≥3.24 and PostgreSQL — no branching needed.
let _dbInitialized = false;
export async function initDatabase() {
  if (_dbInitialized) return;
  _dbInitialized = true;
  console.log('🔄 Starting database initialization...');

  // ── Users ──────────────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            ${pk},
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'admin',
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ users table ready');

  // ── Settings (TEXT primary key — no serial in either mode) ────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const defaultSettings = [
    ['site_name_cz',             'Nicolet CZ'],
    ['site_name_en',             'Nicolet CZ'],
    ['contact_phone',            ''],
    ['contact_email',            ''],
    ['contact_address',          ''],
    ['notification_email',       ''],
    ['footer_text_cz',           ''],
    ['footer_text_en',           ''],
    ['seo_title_default_cz',     'Nicolet CZ – Molekulová spektroskopie'],
    ['seo_title_default_en',     'Nicolet CZ – Molecular Spectroscopy'],
    ['seo_desc_default_cz',      ''],
    ['seo_desc_default_en',      ''],
    ['gtag_id',                  ''],
    ['default_thumbnail',        ''],
    ['logo_url',                 ''],
    ['news_default_button_id',      ''],
    ['product_default_button_id',   ''],
    ['training_default_button_id',  ''],
  ];

  for (const [key, value] of defaultSettings) {
    await db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING`
    ).run(key, value);
  }
  console.log('✅ settings table ready');

  // ── Contacts ───────────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id            ${pk},
      name          TEXT NOT NULL,
      role_cz       TEXT,
      role_en       TEXT,
      email         TEXT,
      phone         TEXT,
      image_url     TEXT,
      display_order INTEGER DEFAULT 0,
      is_active     INTEGER DEFAULT 1,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ contacts table ready');

  // ── Gallery folders (adjacency list) ──────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS gallery_folders (
      id            ${pk},
      name_cz       TEXT NOT NULL,
      name_en       TEXT,
      slug          TEXT UNIQUE NOT NULL,
      parent_id     INTEGER,
      display_order INTEGER DEFAULT 0,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES gallery_folders(id)
    )
  `);
  console.log('✅ gallery_folders table ready');

  // ── Gallery images ─────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS gallery_images (
      id             ${pk},
      folder_id      INTEGER,
      image_url      TEXT NOT NULL,
      identifier     TEXT UNIQUE NOT NULL,
      title_cz       TEXT,
      title_en       TEXT,
      description_cz TEXT,
      description_en TEXT,
      tags           TEXT,
      display_order  INTEGER DEFAULT 0,
      created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (folder_id) REFERENCES gallery_folders(id)
    )
  `);
  console.log('✅ gallery_images table ready');

  // ── Pages ──────────────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      id            ${pk},
      slug          TEXT UNIQUE NOT NULL,
      title_cz      TEXT NOT NULL,
      title_en      TEXT,
      content_cz    TEXT,
      content_en    TEXT,
      excerpt_cz    TEXT,
      excerpt_en    TEXT,
      cover_image   TEXT,
      seo_title_cz  TEXT,
      seo_title_en  TEXT,
      seo_desc_cz   TEXT,
      seo_desc_en   TEXT,
      is_published  INTEGER DEFAULT 1,
      display_order INTEGER DEFAULT 0,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ pages table ready');

  // ── News categories (before news_posts — FK dependency) ───────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS news_categories (
      id            ${pk},
      name_cz       TEXT NOT NULL,
      name_en       TEXT,
      slug          TEXT UNIQUE NOT NULL,
      display_order INTEGER DEFAULT 0,
      is_active     INTEGER DEFAULT 1,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ news_categories table ready');

  // ── News posts ─────────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS news_posts (
      id            ${pk},
      slug          TEXT UNIQUE NOT NULL,
      title_cz      TEXT NOT NULL,
      title_en      TEXT,
      content_cz    TEXT,
      content_en    TEXT,
      excerpt_cz    TEXT,
      excerpt_en    TEXT,
      cover_image   TEXT,
      cover_caption TEXT,
      cover_align   TEXT DEFAULT 'center',
      seo_title_cz  TEXT,
      seo_title_en  TEXT,
      seo_desc_cz   TEXT,
      seo_desc_en   TEXT,
      category_id   INTEGER REFERENCES news_categories(id),
      is_published  INTEGER DEFAULT 0,
      published_at  TIMESTAMP,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ news_posts table ready');

  // ── Product categories (tree) ──────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS product_categories (
      id            ${pk},
      parent_id     INTEGER,
      name_cz       TEXT NOT NULL,
      name_en       TEXT,
      slug          TEXT UNIQUE NOT NULL,
      display_order INTEGER DEFAULT 0,
      is_active     INTEGER DEFAULT 1,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES product_categories(id)
    )
  `);
  console.log('✅ product_categories table ready');

  // ── Products ───────────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id             ${pk},
      slug           TEXT UNIQUE NOT NULL,
      name_cz        TEXT NOT NULL,
      name_en        TEXT,
      description_cz TEXT,
      description_en TEXT,
      spec_cz        TEXT,
      spec_en        TEXT,
      images_json    TEXT DEFAULT '[]',
      thumbnail_url  TEXT,
      is_published   INTEGER DEFAULT 0,
      is_featured    INTEGER DEFAULT 0,
      display_order  INTEGER DEFAULT 0,
      seo_title_cz   TEXT,
      seo_title_en   TEXT,
      seo_desc_cz    TEXT,
      seo_desc_en    TEXT,
      created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ products table ready');

  // ── Product ↔ Category map (M:N — composite PK, no serial) ────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS product_categories_map (
      product_id  INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      PRIMARY KEY (product_id, category_id),
      FOREIGN KEY (product_id)  REFERENCES products(id)           ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE CASCADE
    )
  `);
  console.log('✅ product_categories_map table ready');

  // ── Application groups ─────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS application_groups (
      id            ${pk},
      slug          TEXT UNIQUE NOT NULL,
      name_cz       TEXT NOT NULL,
      name_en       TEXT,
      display_order INTEGER DEFAULT 0,
      is_active     INTEGER DEFAULT 1,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ application_groups table ready');

  // ── Applications ───────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      id             ${pk},
      group_id       INTEGER,
      slug           TEXT UNIQUE NOT NULL,
      name_cz        TEXT NOT NULL,
      name_en        TEXT,
      content_cz     TEXT,
      content_en     TEXT,
      cover_image    TEXT,
      cover_caption  TEXT,
      cover_align    TEXT DEFAULT 'center',
      thumbnail_url  TEXT,
      is_published   INTEGER DEFAULT 0,
      is_featured    INTEGER DEFAULT 0,
      display_order  INTEGER DEFAULT 0,
      seo_title_cz   TEXT,
      seo_title_en   TEXT,
      created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (group_id) REFERENCES application_groups(id)
    )
  `);
  console.log('✅ applications table ready');

  // ── Product ↔ Application map (M:N — composite PK, no serial) ─────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS product_applications_map (
      product_id     INTEGER NOT NULL,
      application_id INTEGER NOT NULL,
      PRIMARY KEY (product_id, application_id),
      FOREIGN KEY (product_id)     REFERENCES products(id)     ON DELETE CASCADE,
      FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
    )
  `);
  console.log('✅ product_applications_map table ready');

  // ── Buttons ────────────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS buttons (
      id          ${pk},
      label_cz    TEXT NOT NULL,
      label_en    TEXT,
      link_type   TEXT NOT NULL DEFAULT 'form',
      link_value  TEXT,
      style       TEXT NOT NULL DEFAULT 'primary',
      is_active   INTEGER DEFAULT 1,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ buttons table ready');

  // ── Forms ──────────────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS forms (
      id               ${pk},
      name             TEXT NOT NULL,
      title_cz         TEXT,
      title_en         TEXT,
      description_cz   TEXT,
      description_en   TEXT,
      fields_json      TEXT DEFAULT '[]',
      background_image TEXT,
      email_recipients TEXT DEFAULT '',
      submit_label_cz  TEXT DEFAULT 'Odeslat',
      submit_label_en  TEXT DEFAULT 'Submit',
      success_msg_cz   TEXT DEFAULT 'Děkujeme za zprávu. Brzy se ozveme.',
      success_msg_en   TEXT DEFAULT 'Thank you. We will get back to you shortly.',
      is_active        INTEGER DEFAULT 1,
      created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ forms table ready');

  // ── Form submissions ───────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS form_submissions (
      id           ${pk},
      form_id      INTEGER NOT NULL,
      data_json    TEXT NOT NULL,
      ip           TEXT,
      submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_read      INTEGER DEFAULT 0,
      FOREIGN KEY (form_id) REFERENCES forms(id)
    )
  `);
  console.log('✅ form_submissions table ready');

  // ── Carousel items ─────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS carousel_items (
      id            ${pk},
      image_url     TEXT NOT NULL,
      link_url      TEXT,
      title_cz      TEXT,
      title_en      TEXT,
      subtitle_cz   TEXT,
      subtitle_en   TEXT,
      show_text     INTEGER DEFAULT 1,
      display_order INTEGER DEFAULT 0,
      is_active     INTEGER DEFAULT 1,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ carousel_items table ready');

  // ── Trainings ──────────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS trainings (
      id             ${pk},
      title_cz       TEXT NOT NULL,
      title_en       TEXT,
      content_cz     TEXT,
      content_en     TEXT,
      date_start     TEXT NOT NULL,
      date_end       TEXT,
      location_cz    TEXT,
      location_en    TEXT,
      cta_button_id  INTEGER,
      is_published   INTEGER DEFAULT 0,
      created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cta_button_id) REFERENCES buttons(id)
    )
  `);
  console.log('✅ trainings table ready');

  // ── Menu items (tree) ──────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id            ${pk},
      parent_id     INTEGER,
      label_cz      TEXT NOT NULL,
      label_en      TEXT,
      link_type     TEXT NOT NULL DEFAULT 'internal',
      link_value    TEXT,
      display_order INTEGER DEFAULT 0,
      is_active     INTEGER DEFAULT 1,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES menu_items(id)
    )
  `);
  console.log('✅ All tables initialized');

  // ── Seed default menu items ────────────────────────────────────────────────
  const defaultRootItems = [
    { label_cz: 'Novinky',            label_en: 'News',                link_value: '/novinky',                   order: 10 },
    { label_cz: 'Produkty',           label_en: 'Products',            link_value: '/produkty',                  order: 20 },
    { label_cz: 'O nás',             label_en: 'About us',            link_value: '/o-nas',                     order: 30 },
    { label_cz: 'Školení a kurzy',   label_en: 'Training & courses',  link_value: '/skoleni',                   order: 40 },
    { label_cz: 'Aplikační podpora', label_en: 'Application support', link_value: '/stranka/aplikacni-podpora', order: 50 },
    { label_cz: 'Aplikace',          label_en: 'Applications',        link_value: '/aplikace',                  order: 60 },
  ];

  for (const item of defaultRootItems) {
    const exists = await db.prepare(
      'SELECT id FROM menu_items WHERE link_value = ? AND parent_id IS NULL'
    ).get(item.link_value);
    if (!exists) {
      await db.prepare(
        `INSERT INTO menu_items (label_cz, label_en, link_type, link_value, display_order, is_active) VALUES (?,?,'internal',?,?,1)`
      ).run(item.label_cz, item.label_en, item.link_value, item.order);
    }
  }

  const defaultChildItems = [
    { parentLink: '/novinky',  label_cz: 'Všechny novinky',  label_en: 'All news',          link_value: '/novinky',         order: 10 },
    { parentLink: '/produkty', label_cz: 'Všechny produkty', label_en: 'All products',      link_value: '/produkty',        order: 10 },
    { parentLink: '/o-nas',    label_cz: 'O společnosti',    label_en: 'About us',          link_value: '/stranka/o-nas',   order: 10 },
    { parentLink: '/o-nas',    label_cz: 'Kontakt',          label_en: 'Contact',           link_value: '/stranka/kontakt', order: 20 },
    { parentLink: '/skoleni',  label_cz: 'Termíny školení',  label_en: 'Training schedule', link_value: '/skoleni',         order: 10 },
    { parentLink: '/aplikace', label_cz: 'Všechny aplikace', label_en: 'All applications',  link_value: '/aplikace',        order: 10 },
  ];

  for (const child of defaultChildItems) {
    const parent = await db.prepare(
      'SELECT id FROM menu_items WHERE link_value = ? AND parent_id IS NULL'
    ).get(child.parentLink);
    if (parent) {
      const childCount = await db.prepare(
        'SELECT COUNT(*) as count FROM menu_items WHERE parent_id = ?'
      ).get(parent.id);
      // parseInt handles both PG (returns string) and SQLite (returns number)
      if (parseInt(childCount.count, 10) === 0) {
        await db.prepare(
          `INSERT INTO menu_items (parent_id, label_cz, label_en, link_type, link_value, display_order, is_active) VALUES (?,?,?,'internal',?,?,1)`
        ).run(parent.id, child.label_cz, child.label_en, child.link_value, child.order);
      }
    }
  }
  console.log('✅ Default menu items ensured');

  // ── Seed default admin user ────────────────────────────────────────────────
  const passwordHash = bcrypt.hashSync('admin123', 10);
  await db.prepare(
    `INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?) ON CONFLICT (email) DO NOTHING`
  ).run('admin@nicolet.cz', passwordHash, 'admin');

  console.log('✅ Database initialization complete');
  console.log('   Admin: admin@nicolet.cz / admin123');
}

export async function closeDatabase() {
  if (db._pool) await db._pool.end();
  if (db._sqliteDb) {
    try { db._sqliteDb.close(); } catch { /* ignore SQLITE_BUSY during cleanup */ }
  }
}

export default db;
