import pg from 'pg';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Production safety ────────────────────────────────────────────────────
// Production MUST use PostgreSQL. This prevents silent fallback to SQLite
// on ephemeral filesystem that loses all data on restart/deploy.
const isProduction = process.env.NODE_ENV === 'production'
    || process.env.RAILWAY_ENVIRONMENT === 'production';

if (isProduction && process.env.DB_PROVIDER !== 'postgres') {
    console.error('❌ FATAL: DB_PROVIDER must be set to "postgres" in production');
    console.error('   Set DB_PROVIDER=postgres and DATABASE_URL before starting.');
    process.exit(1);
}

if (process.env.DB_PROVIDER === 'postgres' && !process.env.DATABASE_URL) {
    console.error('❌ FATAL: DATABASE_URL is required when DB_PROVIDER=postgres');
    process.exit(1);
}

// ── Mode detection ────────────────────────────────────────────────────────
// DB_PROVIDER=postgres  → PostgreSQL (Neon / Railway)
// DB_PROVIDER=sqlite    → SQLite (local dev, zero setup)
// Nothing set (non-production) → SQLite (safe default)
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

// ── Indexes on Foreign Keys ────────────────────────────────────────────────
await db.exec(`CREATE INDEX IF NOT EXISTS idx_gallery_folders_parent ON gallery_folders(parent_id)`);
await db.exec(`CREATE INDEX IF NOT EXISTS idx_gallery_images_folder ON gallery_images(folder_id)`);
console.log('✅ Foreign key indexes ready');

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

  // ── FAQ ─────────────────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS faqs (
      id            ${pk},
      category_cz  TEXT NOT NULL DEFAULT '',
      category_en  TEXT NOT NULL DEFAULT '',
      question_cz  TEXT NOT NULL,
      question_en  TEXT,
      answer_cz    TEXT NOT NULL,
      answer_en    TEXT,
      display_order INTEGER DEFAULT 0,
      is_active    INTEGER DEFAULT 1,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ faqs table ready');

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

  // Perex (excerpt) columns for products – optional short text entered by admin
  try { await db.exec('ALTER TABLE products ADD COLUMN excerpt_cz TEXT'); } catch { /* exists */ }
  try { await db.exec('ALTER TABLE products ADD COLUMN excerpt_en TEXT'); } catch { /* exists */ }

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

// ── Indexes on product_categories_map ──────────────────────────────────────
await db.exec(`CREATE INDEX IF NOT EXISTS idx_pcm_category ON product_categories_map(category_id)`);

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

  // Perex (excerpt) columns for applications – optional short text entered by admin
  try { await db.exec('ALTER TABLE applications ADD COLUMN excerpt_cz TEXT'); } catch { /* exists */ }
  try { await db.exec('ALTER TABLE applications ADD COLUMN excerpt_en TEXT'); } catch { /* exists */ }

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

// ── Indexes on product_applications_map ─────────────────────────────────────
await db.exec(`CREATE INDEX IF NOT EXISTS idx_pam_application ON product_applications_map(application_id)`);

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
      label_color      TEXT DEFAULT 'white',
      is_active        INTEGER DEFAULT 1,
      created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ forms table ready');

  // Add label_color column to existing forms tables (with check for SQLite)
  try {
    let hasLabelColor = false;
    try {
      const cols = await db.prepare('PRAGMA table_info(forms)').all();
      hasLabelColor = cols.some(c => c.name === 'label_color');
    } catch { /* PRAGMA might not be supported */ }
    
    if (!hasLabelColor) {
      await db.exec(`ALTER TABLE forms ADD COLUMN label_color TEXT DEFAULT 'white'`);
      console.log('✅ forms.label_color column added');
    }
    
    try {
      await db.exec(`UPDATE forms SET label_color = 'white' WHERE label_color IS NULL`);
    } catch { /* UPDATE might fail if column doesn't exist */ }
    console.log('✅ forms.label_color column ready');
  } catch (err) {
    console.log('⚠️ label_color migration:', err.message);
  }

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
    { parentLink: '/o-nas',    label_cz: 'Časté dotazy',     label_en: 'FAQ',               link_value: '/stranka/caste-dotazy', order: 30 },
    { parentLink: '/o-nas',    label_cz: 'GDPR',             label_en: 'GDPR',              link_value: '/stranka/gdpr',    order: 40 },
    { parentLink: '/o-nas',    label_cz: 'Certifikace výrobce', label_en: 'Manufacturer cert.', link_value: '/stranka/certifikace-vyrobce', order: 50 },
    { parentLink: '/o-nas',    label_cz: 'Certifikace prodejce', label_en: 'Seller cert.',    link_value: '/stranka/certifikace-prodejce', order: 60 },
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

  // ── Seed default pages ──────────────────────────────────────────────────────
  const defaultPages = [
{
      slug: 'o-nas',
      title_cz: 'O nás',
      title_en: 'About us',
      excerpt_cz: 'Společnost Nicolet CZ s.r.o. je výhradním dodavatelem spektrometrů pro molekulovou spektrometrii americké společnosti Thermo Scientific v České republice.',
      content_cz: `<p>Společnost Nicolet CZ s.r.o. je výhradním dodavatelem spektrometrů pro molekulovou spektrometrii americké společnosti <a href="https://www.thermofisher.com/cz/en/home/industrial/spectroscopy-elemental-isotope-analysis/molecular-spectroscopy.html" target="_blank" rel="noopener">Thermo Scientific</a> v České republiky.</p>
<p>Společnost Thermo Scientific je předním světovým výrobcem infračervených a Ramanových spektrometrů s Fourierovou transformací (<a href="https://www.thermofisher.com/cz/en/home/industrial/spectroscopy-elemental-isotope-analysis/molecular-spectroscopy/fourier-transform-infrared-ftir-spectroscopy.html">FT-IR</a>, <a href="https://www.thermofisher.com/cz/en/home/industrial/spectroscopy-elemental-isotope-analysis/molecular-spectroscopy/near-infrared-nir-spectroscopy.html">FT-NIR</a> a <a href="https://nicoletcz.cz/produkt/ft-ramanuv-modul/">FT-Raman</a>), dále disperzních <a href="https://www.thermofisher.com/cz/en/home/industrial/spectroscopy-elemental-isotope-analysis/molecular-spectroscopy/raman-spectroscopy.html">Ramanových spektrometrů</a> a veškerého příslušenství k těmto systémům. Tyto přístroje jsou určeny k chemické analýze nebo fyzikálnímu měření.</p>
<h3>Dále společnost Nicolet CZ zastupuje v České republice:</h3>
<p><strong><a href="https://www.iris-eng.com/">IRIS Technology:</a></strong> Procesní a ruční NIR, Raman a hyperspektrální spektrometry. Výroba a integrace komplexních řešení včetně implementace umělé inteligence. Hlavní aplikace: potravinářský, farmaceutický, chemický, plastikářský, dřevozpracující průmysl a další odvětví.</p>
<p><strong><a href="https://www.timegate.com/">Timegate</a>:</strong> Kompaktní Ramanovy spektrometry s reálně potlačenou fluorescencí pro průmyslové provozy i špičkové vědecké laboratoře.</p>
<p><strong><a href="https://nicoletcz.cz/produkt/si-spectroscopy/">S+I Spectroscopy and Imaging GmBH</a>:</strong> Vysoce vědecké Ramanovy spektrometry, Raman-AFM, monochromátory.</p>
<p><strong><a href="https://nicoletcz.cz/modelova-rada/ftir-spektroskopie/neaspec/">Attocube (dříve Neaspec)</a>:</strong> Vysoce vědecké mikrospektrometry pro IR-SNOM experimenty v blízkém poli s velmi vysokým rozlišením.</p>
<p><strong><a href="https://nicoletcz.cz/modelova-rada/linkam/">LINKAM Scientific Instruments</a>:</strong> Specializované mikroskopické stolky (vysoké/nízké teploty a tlaky), cely pro charakterizaci materiálů při různých podmínkách.</p>
<p><strong><a href="https://m-oem.com/pages/raman-spectroscopy">m-OEM systémy</a>:</strong> Přenosné Ramanovy a NIR spektrometry postavené na míru pro vaši aplikaci.</p>
<p><strong><a href="https://nicoletcz.cz/produkt/remote-sensing/">Designs & Prototypes d.b.a. D&P Instruments</a>:</strong> Přenosné FT-IR spektrometry pro tzv. "remote sensing" experimenty.</p>
<p><strong><a href="https://nicoletcz.cz/modelova-rada/raman/photon-systems/">Photon Systems, Inc.</a>:</strong> UV-Raman spektroskopie/mikroskopie, UV a deep UV lasery.</p>
<p>Společnost Nicolet CZ s.r.o. dále nabízí všem svým zákazníkům servis spektrometrů námi zastupovaných společností, jejich certifikaci a testování dle platných norem a předpisů, zakázkový vývoj analytických metod, specializované knihovny infračervených a Ramanových spekter a vývoj software pro Vaše aplikace.</p>
<p>Společnost Nicolet CZ s.r.o. v neposlední řadě organizuje každoročně přibližně třináct specializovaných kurzů infračervené a Ramanovy spektroskopie/mikroskopie (teoretických i praktických), z nichž některé ve spolupráci s českou Spektroskopickou společností Jana Marka Marci.</p>
<p>Možnosti zpětného odběru námi dodávaných elektrozařízení <a href="https://nicoletcz.cz/app/uploads/2025/11/addf5bed-1.docx">naleznete zde</a>.</p>`,
      is_published: 1,
      display_order: 1
    },
    {
      slug: 'kontakt',
      title_cz: 'Kontakt',
      title_en: 'Contact',
      excerpt_cz: 'Kontaktní údaje a adresy společnosti Nicolet CZ.',
      content_cz: `<h3>Sídlo a fakturační adresa</h3>
<p>Klapálkova 2242/9, Česká Republika – 149 00, Praha 4</p>
<p>Nicolet CZ s.r.o.<br>IČ: 26422182, DIČ: CZ26422182<br>Spisová značka 80993 C, Městský soud v Praze</p>

<h3>Servisní a aplikační středisko</h3>
<p>Křelovická 970, Česká Republika – 104 00, Praha 10</p>

<h3>Stálá aplikační a poradenská služba</h3>
<p>Pondělí až Pátek – 8:30 – 17:00</p>
<ul>
<li>Tel: <a href="tel:+420272760432">+420 272 760 432</a></li>
<li>Email: <a href="mailto:info@nicoletcz.cz">info@nicoletcz.cz</a></li>
</ul>

<h3>Mobilní telefon – kdykoliv</h3>
<ul>
<li>+420 602 325 829 (JP)</li>
<li>+420 728 087 223 (MH)</li>
<li>+420 603 554 788 (FK)</li>
<li>+420 606 726 245 (MS)</li>
<li>+420 605 825 817 (KŠ)</li>
<li>+420 603 725 812 (LT)</li>
<li>+420 775 749 807 (LV)</li>
</ul>

<p>Vaše dotazy nám můžete poslat také pomocí <a href="/stranka/kontakt">kontaktního formuláře</a>.</p>`,
      is_published: 1,
      display_order: 2
    },
    {
      slug: 'certifikace-vyrobce',
      title_cz: 'Certifikace výrobce',
      title_en: 'Manufacturer Certification',
      excerpt_cz: 'Certifikace výrobce Thermo Scientific podle ISO 9001:2016.',
      content_cz: `<p>Společnost Thermo Fischer Scientific je certifikována podle ISO 9001:2016, což je dnes v rámci správné výrobní praxe (current Good Manufacturing Practices – cGMP) nezbytností. Tato skutečnost umožňuje bezproblémovou kvalifikaci spektrometrů pro konečného uživatele v rámci DQ (Design Qualification).</p>
<p><strong>Certifikát ke stažení:</strong> <a href="https://nicoletcz.cz/app/uploads/2024/10/d00d66a1.pdf" target="_blank">Certifikát ISO Thermo Scientific</a></p>`,
      is_published: 1,
      display_order: 3
    },
    {
      slug: 'certifikace-prodejce',
      title_cz: 'Certifikace prodejce',
      title_en: 'Seller Certification',
      excerpt_cz: 'Certifikace společnosti Nicolet CZ podle ISO 9001:2016.',
      content_cz: `<p>Precizní práce pracovníků naší společnosti v rámci systému jakosti byla korunována v roce 2007 získáním certifikátu jakosti ISO 9001, aktuálně certifikátem 9001:2016.</p>
<p>Pro více informací nás neváhejte <a href="/stranka/kontakt">kontaktovat</a>.</p>
<p><strong>Certifikáty ke stažení:</strong></p>
<ul>
<li><a href="https://nicoletcz.cz/app/uploads/2025/11/7adb62de.pdf" target="_blank">Certifikát ISO CQS_CZ</a></li>
<li><a href="https://nicoletcz.cz/app/uploads/2025/11/e69c5a10.pdf" target="_blank">Certifikát ISO CQS_EN</a></li>
<li><a href="https://nicoletcz.cz/app/uploads/2025/11/a349d738.pdf" target="_blank">Certifikát ISO_CZ</a></li>
<li><a href="https://nicoletcz.cz/app/uploads/2025/11/8c6b43bc.pdf" target="_blank">Certifikát ISO_EN</a></li>
<li><a href="https://nicoletcz.cz/app/uploads/2025/11/296fdf94.pdf" target="_blank">Certifikát IQNET_EN</a></li>
</ul>
<p><strong>Informace pro posledního prodejce elektroniky:</strong> <a href="https://nicoletcz.cz/app/uploads/2021/08/633b8ecb.pdf" target="_blank">zde</a></p>
<p>Nicolet CZ s.r.o.<br>Křelovická 970<br>104 00 Praha 10</p>
<p><strong>Sběrné místo zpětného odběru (v rámci zákona o elektro-odpadech):</strong></p>
<p>Nicolet CZ s.r.o.<br>Křelovická 970<br>104 00 Praha 10</p>`,
      is_published: 1,
      display_order: 4
    },
    {
      slug: 'gdpr',
      title_cz: 'GDPR',
      title_en: 'GDPR',
      excerpt_cz: 'Zásady zpracování osobních údajů společnosti Nicolet CZ.',
      content_cz: `<h3>e-newsletter společnosti Nicolet CZ s.r.o. – podmínky zpracování osobních údajů</h3>
<ul>
<li>Správcem osobních údajů podle Nařízení (EU) 2016/679 (GDPR) je společnost <a href="/stranka/kontakt">Nicolet CZ s.r.o.</a></li>
<li>Ochrana osobních údajů odpovídá požadavkům Nařízení (EU) 2016/679 (GDPR).</li>
<li>Předmětem zpracování je <strong>pouze e-mailová adresa</strong>. Uvedený osobní údaj za tímto účelem budeme uchovávat maximálně 15 let.</li>
<li>Vaše osobní údaje neposkytneme žádné třetí osobě s výjimkou institucí k tomu zmocněných zákonem.</li>
<li>Kdykoliv máte právo odvolat svůj souhlas se zpracováním osobních údajů, jejich opravu nebo výmaz. Odvolání souhlasu a žádost o změnu je třeba zaslat na email <a href="mailto:info@nicoletcz.cz">info@nicoletcz.cz</a>.</li>
</ul>

<h3>Obecné podmínky zpracování osobních údajů – zákazníci</h3>
<ul>
<li>Správcem osobních údajů je společnost <a href="/stranka/kontakt">Nicolet CZ s.r.o.</a></li>
<li>Vaše osobní údaje zpracováváme z důvodu vyřízení Vašich objednávek a k řešení reklamací.</li>
<li>Zpracováváme Vaše jméno a příjmení, doručovací adresu, e-mail, telefonní číslo, číslo bankovního účtu, objednané zboží a jeho cenu.</li>
<li>Právním důvodem tohoto zpracování je plnění smlouvy.</li>
<li>Při zpracování Vašich osobních údajů nebude docházet k automatizovanému rozhodování ani k profilování.</li>
</ul>

<p>V případě jakýchkoliv dotazů nás neváhejte <a href="/stranka/kontakt">kontaktovat</a>.</p>`,
      is_published: 1,
      display_order: 5
    },
    {
      slug: 'caste-dotazy',
      title_cz: 'Časté dotazy',
      title_en: 'FAQ',
      excerpt_cz: 'Často kladené dotazy o spektroskopii a našich službách.',
      content_cz: `<div id="faq-page-root" data-view="faq"></div>`,
      is_published: 1,
      display_order: 6
    },
    {
      slug: 'vedecke-projekty',
      title_cz: 'Vědecké projekty',
      title_en: 'Research Projects',
      excerpt_cz: 'Vědecké projekty, kterých se společnost Nicolet CZ účastní.',
      content_cz: `<p>Kromě prodeje a servisu spektrometrů se účastníme rovněž vědeckých projektů:</p>

<h3>Vývoj metod analýz čistoty vodíku s využitím infračervené spektrometrie s Fourierovou transformací</h3>
<p><strong>Číslo projektu:</strong> CL01000071<br><strong>Doba řešení:</strong> 01/2024 – 06/2026</p>

<h4>Představení projektu</h4>
<p>Vodík má jako alternativní zdroj čisté energie a palivo velký potenciál. Používání vodíkového paliva v dopravě povede ke snížení emisí a tím i ke snížení negativních dopadů dopravy na životní prostředí.</p>
<p>Projekt řeší vývoj a zavedení analytické metody pro stanovení sedmi nečistot ve vodíkovém palivu pomocí infračervené spektroskopie s Fourierovou transformací (FTIR).</p>
<p>Cílem projektu je zavedení metodiky pro stanovení nečistot v laboratořích Centra dopravního výzkumu a její následná akreditace.</p>

<h4>Koordinátor projektu</h4>
<p>Centrum dopravního výzkumu, v. v. i.</p>

<h4>Partneři projektu</h4>
<ul>
<li>Centrum dopravního výzkumu, v. v. i.</li>
<li>Nicolet CZ s. r. o.</li>
</ul>

<p>Tento projekt je spolufinancován se státní podporou Technologické agentury ČR a Ministerstva dopravy ČR v rámci Programu DOPRAVA 2030.</p>`,
      is_published: 1,
      display_order: 6
    },
    {
      slug: 'aplikacni-podpora',
      title_cz: 'Aplikační podpora',
      title_en: 'Application Support',
      excerpt_cz: 'Aplikační a poradenská služba pro vaše měření a analytické metody.',
      content_cz: `<p>Nabízíme komplexní aplikační podporu pro všechny námi zastupované spektrometry a analytické metody. Naši odborníci vám pomohou s vývojem metod, optimalizací měření i zpracováním a interpretací spekter.</p>
<h3>Co všechno aplikační podpora zahrnuje?</h3>
<ul>
<li>Poradenství při výběru přístroje a příslušenství pro vaši aplikaci.</li>
<li>Vývoj a optimalizaci analytických metod (FT-IR, FT-NIR, Raman).</li>
<li>Specializované knihovny infračervených a Ramanových spekter.</li>
<li>Proměření vašich vzorků a konzultaci výsledků.</li>
<li>Školení a specializované kurzy infračervené a Ramanovy spektroskopie.</li>
<li>Vývoj řídicího a vyhodnocovacího softwaru pro vaše aplikace.</li>
</ul>
<p>Stálá aplikační a poradenská služba je k dispozici v pracovní dny od 8:30 do 17:00. Neváhejte nás <a href="/stranka/kontakt">kontaktovat</a> – poradíme vám se vším, co se týká vašich měření.</p>`,
      is_published: 1,
      display_order: 5
    }
  ];

  for (const page of defaultPages) {
    const existing = await db.prepare('SELECT id FROM pages WHERE slug = ?').get(page.slug);
    if (!existing) {
      await db.prepare(`
        INSERT INTO pages (slug, title_cz, title_en, excerpt_cz, content_cz, is_published, display_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(page.slug, page.title_cz, page.title_en, page.excerpt_cz, page.content_cz, page.is_published, page.display_order);
    }
  }
  console.log('✅ Default pages ensured');

  // ── Seed default FAQs ────────────────────────────────────────────────────────
  const defaultFaqs = [
    // Obecné otázky
    { category_cz: 'Obecné otázky', category_en: 'General Questions', question_cz: 'FT-IR, FT-NIR, Ramanova spektroskopie… Co to znamená?', question_en: 'FT-IR, FT-NIR, Raman spectroscopy… What does it mean?', answer_cz: 'Všechny tyto metody spočívají v interakci vzorku s elektromagnetickým zářením o jedné konkrétní vlnové délce (Ramanova spektroskopie) nebo v daném intervalu (infračervená spektroskopie) a mluvíme o nich obecně jako o metodách molekulové spektroskopie. Výstupem této analýzy je pak spektrum, které je unikátní pro každou sloučeninu.', answer_en: 'All these methods are based on the interaction of a sample with electromagnetic radiation at one specific wavelength (Raman spectroscopy) or in a given interval (infrared spectroscopy).', order: 1 },
    { category_cz: 'Obecné otázky', category_en: 'General Questions', question_cz: 'Jaký typ analýzy můžu provádět?', question_en: 'What type of analysis can I perform?', answer_cz: 'Pomocí Ramanových a infračervených spektrometrů lze provádět jak kvalitativní analýzu (identifikaci a verifikaci látek), tak i kvantitativní měření, a to včetně analýzy směsí.', answer_en: 'Using Raman and infrared spectrometers, you can perform both qualitative analysis (identification and verification of substances) and quantitative measurements, including mixture analysis.', order: 2 },
    { category_cz: 'Obecné otázky', category_en: 'General Questions', question_cz: 'Jaké výhody molekulová spektroskopie přináší?', question_en: 'What are the advantages of molecular spectroscopy?', answer_cz: 'Molekulová spektroskopie je rychlá, spolehlivá, neinvazivní metoda, která navíc většinou nevyžaduje ani žádnou úpravu vzorku. Ve výsledku tak šetří váš čas, peníze i materiál.', answer_en: 'Molecular spectroscopy is a fast, reliable, non-invasive method that usually does not require any sample preparation. It saves your time, money, and material.', order: 3 },
    { category_cz: 'Obecné otázky', category_en: 'General Questions', question_cz: 'Jak často se metody molekulové spektroskopie využívají?', question_en: 'How often are molecular spectroscopy methods used?', answer_cz: 'V současné době se infračervená i Ramanova spektroskopie využívá ve všech možných odvětvích vědy, výzkumu a průmyslu. V České a Slovenské republice funguje již více než 650 našich přístrojů.', answer_en: 'Currently, both infrared and Raman spectroscopy is used in all possible fields of science, research, and industry.', order: 4 },
    
    // Vzorky a aplikace
    { category_cz: 'O vaší aplikaci a vzorcích', category_en: 'About Your Application and Samples', question_cz: 'Jaké vzorky můžu měřit?', question_en: 'What samples can I measure?', answer_cz: 'Metodami molekulové spektroskopie můžete analyzovat vzorky pevné, kapalné i plynné, práškové, gelové, mikroskopické i velké objekty, buňky i anorganické vzorky a mnoho dalších.', answer_en: 'Using molecular spectroscopy methods, you can analyze solid, liquid, and gaseous samples, powders, gels, microscopic and large objects, cells, and inorganic samples.', order: 1 },
    { category_cz: 'O vaší aplikaci a vzorcích', category_en: 'About Your Application and Samples', question_cz: 'Jak malé nebo velké vzorky lze měřit?', question_en: 'How small or large samples can be measured?', answer_cz: 'Pomocí našich přístrojů lze měřit mikroskopické vzorky s rozlišením od pouhých 10 nm i rozměrné vzorky, jako jsou nástěnné fresky nebo malby.', answer_en: 'Using our instruments, you can measure microscopic samples with resolution from just 10 nm as well as large samples such as wall frescoes or paintings.', order: 2 },
    { category_cz: 'O vaší aplikaci a vzorcích', category_en: 'About Your Application and Samples', question_cz: 'Potřebuji analyzovat plynný vzorek, je to možné?', question_en: 'I need to analyze a gas sample, is that possible?', answer_cz: 'Ano! FT-IR i Ramanovy spektrometry lze vybavit plynovými celami, se kterými plynné vzorky můžete analyzovat obdobně jako vzorky v jiných skupenstvích.', answer_en: 'Yes! FT-IR and Raman spectrometers can be equipped with gas cells for analyzing gas samples.', order: 3 },
    { category_cz: 'O vaší aplikaci a vzorcích', category_en: 'About Your Application and Samples', question_cz: 'Můj vzorek má silnou fluorescenci. Co se s tím dá dělat?', question_en: 'My sample has strong fluorescence. What can I do?', answer_cz: 'Pokud měříte pomocí Ramanova spektrometru, vyzkoušejte jinou vlnovou délku excitačního laseru. Také můžete prozkoumat možnosti FT-IR spektroskopie.', answer_en: 'If you are using a Raman spectrometer, try a different excitation laser wavelength. You can also explore FT-IR spectroscopy options.', order: 4 },
    
    // Přístroje
    { category_cz: 'O přístrojích', category_en: 'About Instruments', question_cz: 'Jak jsou spektrometry velké?', question_en: 'How big are the spectrometers?', answer_cz: 'Nabízíme ruční spektrometry, přenosné, které můžete snadno převážet v kufru auta nebo přenášet mezi učebnami či laboratořemi, i sofistikované vědecké přístroje.', answer_en: 'We offer handheld spectrometers, portable ones that you can easily transport in a car trunk or between classrooms and laboratories, and sophisticated scientific instruments.', order: 1 },
    { category_cz: 'O přístrojích', category_en: 'About Instruments', question_cz: 'Je ovládání spektrometrů složité?', question_en: 'Is operating the spectrometers complicated?', answer_cz: 'Většina našich přístrojů je snadno ovladatelná, měření a zpracování dat probíhá pomocí intuitivních programů, mezi které patří např. OMINC nebo TQ Analyst.', answer_en: 'Most of our instruments are easy to operate, with measurement and data processing done through intuitive software programs.', order: 2 },
    { category_cz: 'O přístrojích', category_en: 'About Instruments', question_cz: 'Je možné měření automatizovat?', question_en: 'Is it possible to automate measurements?', answer_cz: 'Ano, měření standardních vzorků lze pomocí autosamplerů a chytrého měřicího příslušenství zpravidla velmi snadno automatizovat.', answer_en: 'Yes, measurements of standard samples can usually be easily automated using autosamplers and smart measurement accessories.', order: 3 },
    { category_cz: 'O přístrojích', category_en: 'About Instruments', question_cz: 'Mohu si ke spektrometru pořídit nějaké příslušenství?', question_en: 'Can I get accessories for the spectrometer?', answer_cz: 'Ano! Ke všem spektrometrům nabízíme širokou škálu příslušenství: uživatelsky výměnné lasery, filtry a mřížky, různé měřicí nástavce, autosamplery, vláknovou optiku, integrační sféry a mnohé další.', answer_en: 'Yes! We offer a wide range of accessories for all spectrometers: user-exchangeable lasers, filters and gratings, various measurement attachments, autosamplers, fiber optics, integration spheres, and much more.', order: 4 },
    
    // Podpora
    { category_cz: 'Naše podpora', category_en: 'Our Support', question_cz: 'Můžete mi poradit s mou aplikací?', question_en: 'Can you advise me on my application?', answer_cz: 'Jistě. Nedodáváme pouze přístroj, ale záleží nám i na tom, abyste jej mohli ke své práci efektivně využít. Vaši aplikaci s vámi probereme a se vším vám poradíme.', answer_en: 'Of course. We not only supply the instrument, but we also care about you being able to use it effectively for your work. We will discuss your application with you and advise you on everything.', order: 1 },
    { category_cz: 'Naše podpora', category_en: 'Our Support', question_cz: 'Jak nákladný je servis přístrojů?', question_en: 'How expensive is instrument service?', answer_cz: 'Veškerý servis u nás zakoupených přístrojů je zdarma, vy budete platit pouze cenu náhradních dílů při případné opravě.', answer_en: 'All service for instruments purchased from us is free of charge; you will only pay for replacement parts in case of repair.', order: 2 },
    { category_cz: 'Naše podpora', category_en: 'Our Support', question_cz: 'Jak rychle přijedete, když se přístroj porouchá?', question_en: 'How quickly can you come if the instrument breaks down?', answer_cz: 'Sídlíme v Praze a jelikož máme plně vybavený sklad náhradních dílů, můžeme k vám přijet takřka okamžitě. Všichni naši technici jsou proškoleni výrobci jednotlivých spektrometrů.', answer_en: 'We are based in Prague and since we have a fully equipped spare parts warehouse, we can come to you almost immediately.', order: 3 },
    { category_cz: 'Naše podpora', category_en: 'Our Support', question_cz: 'Nový spektrometr je pro nás moc drahý, existuje nějaká levnější varianta?', question_en: 'A new spectrometer is too expensive for us, is there a cheaper option?', answer_cz: 'Pokud nechcete nebo nemůžete investovat do nového přístroje, můžete využít některou z nabídek repasovaných přístrojů. Kontaktujte nás a budeme se snažit vám maximálně vyhovět.', answer_en: 'If you do not want or cannot invest in a new instrument, you can take advantage of one of our refurbished instrument offers.', order: 4 },
    { category_cz: 'Naše podpora', category_en: 'Our Support', question_cz: 'Nic o molekulové spektroskopii nevím, kde se můžu vzdělat?', question_en: 'I know nothing about molecular spectroscopy, where can I learn?', answer_cz: 'Ročně pořádáme řadu kurzů a školení, kde vám podrobně vysvětlíme principy molekulové spektroskopie, naučíme vás ovládat váš přístroj i jeho řídicí software. Pro nové majitele našich přístrojů jsou kurzy zdarma!', answer_en: 'We organize a number of courses and training sessions annually where we will explain the principles of molecular spectroscopy in detail, teach you how to operate your instrument and its control software.', order: 5 },
  ];

  // Unique constraint makes the seed idempotent: ON CONFLICT skips already-seeded
  // questions on every server restart (previously this inserted duplicates — the
  // local dev DB accumulated 29 copies of each of the 17 default FAQs).
  let faqSeedByConflict = true;
  try {
    await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_faqs_question_cz ON faqs(question_cz)`);
  } catch (err) {
    // Existing DB with duplicate questions — index creation fails; seed below
    // uses the exists-check fallback instead of ON CONFLICT.
    faqSeedByConflict = false;
    console.warn('⚠️  faqs: unique index not created (duplicates present?):', err.message);
  }

  for (const faq of defaultFaqs) {
    let seeded = false;
    if (faqSeedByConflict) {
      try {
        await db.prepare(`
          INSERT INTO faqs (category_cz, category_en, question_cz, question_en, answer_cz, answer_en, display_order, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1)
          ON CONFLICT (question_cz) DO NOTHING
        `).run(faq.category_cz, faq.category_en, faq.question_cz, faq.question_en, faq.answer_cz, faq.answer_en, faq.order);
        seeded = true;
      } catch (err) {
        // SQLite < 3.24 / other ON CONFLICT failure → fall through to exists-check
        console.warn('⚠️  faqs seed ON CONFLICT failed, using exists-check:', err.message);
      }
    }
    if (!seeded) {
      const exists = await db.prepare('SELECT id FROM faqs WHERE question_cz = ?').get(faq.question_cz);
      if (!exists) {
        await db.prepare(`
          INSERT INTO faqs (category_cz, category_en, question_cz, question_en, answer_cz, answer_en, display_order, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `).run(faq.category_cz, faq.category_en, faq.question_cz, faq.question_en, faq.answer_cz, faq.answer_en, faq.order);
      }
    }
  }
  console.log('✅ Default FAQs ensured');

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
