import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'nicolet.db');
console.log('📁 Database path:', dbPath);

// Async wrapper over sqlite3 (same pattern as Eolite/KanjoWin)
class Database {
  constructor(filepath) {
    this.db = new sqlite3.Database(filepath, (err) => {
      if (err) {
        console.error('❌ Failed to open database:', err);
        throw err;
      }
      console.log('✅ Database opened successfully');
    });
    this.db.configure('busyTimeout', 30000);
  }

  exec(sql) {
    return new Promise((resolve, reject) => {
      this.db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  prepare(sql) {
    const stmt = this.db.prepare(sql);
    return {
      run: (...params) => new Promise((resolve, reject) => {
        stmt.run(...params, function(err) {
          if (err) reject(err);
          else resolve({ lastInsertRowid: this.lastID, changes: this.changes });
        });
      }),
      get: (...params) => new Promise((resolve, reject) => {
        stmt.get(...params, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      }),
      all: (...params) => new Promise((resolve, reject) => {
        stmt.all(...params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      })
    };
  }
}

const db = new Database(dbPath);

export async function initDatabase() {
  console.log('🔄 Starting database initialization...');

  // ── Users ────────────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      email        TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role         TEXT NOT NULL DEFAULT 'admin',
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Settings (generic key-value) ─────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL DEFAULT '',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const defaultSettings = [
    ['site_name_cz',      'Nicolet CZ'],
    ['site_name_en',      'Nicolet CZ'],
    ['contact_phone',     ''],
    ['contact_email',     ''],
    ['contact_address',   ''],
    ['notification_email',''],
    ['footer_text_cz',    ''],
    ['footer_text_en',    ''],
    ['seo_title_default_cz', 'Nicolet CZ – Molekulová spektroskopie'],
    ['seo_title_default_en', 'Nicolet CZ – Molecular Spectroscopy'],
    ['seo_desc_default_cz',  ''],
    ['seo_desc_default_en',  ''],
    ['gtag_id',           ''],
    ['default_thumbnail', ''],
    ['logo_url',          ''],
  ];
  for (const [key, value] of defaultSettings) {
    await db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`).run(key, value);
  }
  console.log('✅ Settings ready');

  // ── Contacts ─────────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      role_cz       TEXT,
      role_en       TEXT,
      email         TEXT,
      phone         TEXT,
      image_url     TEXT,
      display_order INTEGER DEFAULT 0,
      is_active     INTEGER DEFAULT 1,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Gallery folders (adjacency list) ─────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS gallery_folders (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name_cz       TEXT NOT NULL,
      name_en       TEXT,
      slug          TEXT UNIQUE NOT NULL,
      parent_id     INTEGER,
      display_order INTEGER DEFAULT 0,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(parent_id) REFERENCES gallery_folders(id)
    )
  `);

  // ── Gallery images ────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS gallery_images (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_id       INTEGER,
      image_url       TEXT NOT NULL,
      identifier      TEXT UNIQUE NOT NULL,
      title_cz        TEXT,
      title_en        TEXT,
      description_cz  TEXT,
      description_en  TEXT,
      tags            TEXT,
      display_order   INTEGER DEFAULT 0,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(folder_id) REFERENCES gallery_folders(id)
    )
  `);

  // ── Pages (generic editable pages) ───────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── News posts ────────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS news_posts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
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
      is_published  INTEGER DEFAULT 0,
      published_at  DATETIME,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Product categories (tree – adjacency list) ────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS product_categories (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id     INTEGER,
      name_cz       TEXT NOT NULL,
      name_en       TEXT,
      slug          TEXT UNIQUE NOT NULL,
      display_order INTEGER DEFAULT 0,
      is_active     INTEGER DEFAULT 1,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(parent_id) REFERENCES product_categories(id)
    )
  `);

  // ── Products ──────────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      slug          TEXT UNIQUE NOT NULL,
      name_cz       TEXT NOT NULL,
      name_en       TEXT,
      description_cz TEXT,
      description_en TEXT,
      spec_cz       TEXT,
      spec_en       TEXT,
      images_json   TEXT DEFAULT '[]',
      is_published  INTEGER DEFAULT 0,
      is_featured   INTEGER DEFAULT 0,
      display_order INTEGER DEFAULT 0,
      seo_title_cz  TEXT,
      seo_title_en  TEXT,
      seo_desc_cz   TEXT,
      seo_desc_en   TEXT,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Product ↔ Category map (M:N) ─────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS product_categories_map (
      product_id  INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      PRIMARY KEY (product_id, category_id),
      FOREIGN KEY(product_id)  REFERENCES products(id)           ON DELETE CASCADE,
      FOREIGN KEY(category_id) REFERENCES product_categories(id) ON DELETE CASCADE
    )
  `);

  // ── Application groups ────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS application_groups (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      slug          TEXT UNIQUE NOT NULL,
      name_cz       TEXT NOT NULL,
      name_en       TEXT,
      display_order INTEGER DEFAULT 0,
      is_active     INTEGER DEFAULT 1,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Applications ──────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id      INTEGER,
      slug          TEXT UNIQUE NOT NULL,
      name_cz       TEXT NOT NULL,
      name_en       TEXT,
      content_cz    TEXT,
      content_en    TEXT,
      cover_image   TEXT,
      is_published  INTEGER DEFAULT 0,
      is_featured   INTEGER DEFAULT 0,
      display_order INTEGER DEFAULT 0,
      seo_title_cz  TEXT,
      seo_title_en  TEXT,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(group_id) REFERENCES application_groups(id)
    )
  `);

  // ── Product ↔ Application map (M:N) ──────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS product_applications_map (
      product_id     INTEGER NOT NULL,
      application_id INTEGER NOT NULL,
      PRIMARY KEY (product_id, application_id),
      FOREIGN KEY(product_id)     REFERENCES products(id)     ON DELETE CASCADE,
      FOREIGN KEY(application_id) REFERENCES applications(id) ON DELETE CASCADE
    )
  `);

  // ── Buttons (reusable CTA) ────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS buttons (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      label_cz    TEXT NOT NULL,
      label_en    TEXT,
      link_type   TEXT NOT NULL DEFAULT 'form',
      link_value  TEXT,
      style       TEXT NOT NULL DEFAULT 'primary',
      is_active   INTEGER DEFAULT 1,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Forms ─────────────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS forms (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT NOT NULL,
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
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Forms: migrate title columns if they don't exist ──────────────────────
  try { await db.exec(`ALTER TABLE forms ADD COLUMN title_cz TEXT`); } catch {}
  try { await db.exec(`ALTER TABLE forms ADD COLUMN title_en TEXT`); } catch {}

  // ── Form submissions ──────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS form_submissions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id      INTEGER NOT NULL,
      data_json    TEXT NOT NULL,
      ip           TEXT,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_read      INTEGER DEFAULT 0,
      FOREIGN KEY(form_id) REFERENCES forms(id)
    )
  `);

  // ── Carousel items ────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS carousel_items (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      image_url     TEXT NOT NULL,
      link_url      TEXT,
      title_cz      TEXT,
      title_en      TEXT,
      subtitle_cz   TEXT,
      subtitle_en   TEXT,
      show_text     INTEGER DEFAULT 1,
      display_order INTEGER DEFAULT 0,
      is_active     INTEGER DEFAULT 1,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Trainings ─────────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS trainings (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(cta_button_id) REFERENCES buttons(id)
    )
  `);

  // ── News categories ────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS news_categories (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name_cz       TEXT NOT NULL,
      name_en       TEXT,
      slug          TEXT UNIQUE NOT NULL,
      display_order INTEGER DEFAULT 0,
      is_active     INTEGER DEFAULT 1,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ALTER news_posts to add category_id (safe – wrapped in try/catch)
  try {
    await db.exec(`ALTER TABLE news_posts ADD COLUMN category_id INTEGER REFERENCES news_categories(id)`);
  } catch (err) {
    if (!err.message?.includes('duplicate column')) throw err;
  }

  // ── Safe ALTER TABLE additions ────────────────────────────────────────────
  const safeAlter = async (sql) => {
    try { await db.exec(sql); } catch (err) {
      if (!err.message?.includes('duplicate column')) throw err;
    }
  };
  await safeAlter(`ALTER TABLE products     ADD COLUMN thumbnail_url  TEXT`);
  await safeAlter(`ALTER TABLE applications ADD COLUMN thumbnail_url  TEXT`);
  await safeAlter(`ALTER TABLE applications ADD COLUMN cover_caption  TEXT`);
  await safeAlter(`ALTER TABLE applications ADD COLUMN cover_align    TEXT DEFAULT 'center'`);
  await safeAlter(`ALTER TABLE news_posts   ADD COLUMN cover_caption  TEXT`);
  await safeAlter(`ALTER TABLE news_posts   ADD COLUMN cover_align    TEXT DEFAULT 'center'`);
  console.log('✅ Schema migrations applied');

  // ── Menu items (tree – adjacency list) ───────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id     INTEGER,
      label_cz      TEXT NOT NULL,
      label_en      TEXT,
      link_type     TEXT NOT NULL DEFAULT 'internal',
      link_value    TEXT,
      display_order INTEGER DEFAULT 0,
      is_active     INTEGER DEFAULT 1,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(parent_id) REFERENCES menu_items(id)
    )
  `);

  console.log('✅ All tables initialized');

  // ── Seed default menu items (add missing root items only) ────────────────
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
        'INSERT INTO menu_items (label_cz, label_en, link_type, link_value, display_order, is_active) VALUES (?,?,"internal",?,?,1)'
      ).run(item.label_cz, item.label_en, item.link_value, item.order);
    }
  }
  // Add default child items for root items that have none yet
  const defaultChildItems = [
    { parentLink: '/novinky',  label_cz: 'Všechny novinky',  label_en: 'All news',         link_value: '/novinky',         order: 10 },
    { parentLink: '/produkty', label_cz: 'Všechny produkty', label_en: 'All products',     link_value: '/produkty',        order: 10 },
    { parentLink: '/o-nas',    label_cz: 'O společnosti',    label_en: 'About us',         link_value: '/stranka/o-nas',   order: 10 },
    { parentLink: '/o-nas',    label_cz: 'Kontakt',          label_en: 'Contact',          link_value: '/stranka/kontakt', order: 20 },
    { parentLink: '/skoleni',  label_cz: 'Termíny školení',  label_en: 'Training schedule',link_value: '/skoleni',         order: 10 },
    { parentLink: '/aplikace', label_cz: 'Všechny aplikace', label_en: 'All applications', link_value: '/aplikace',        order: 10 },
  ];
  for (const child of defaultChildItems) {
    const parent = await db.prepare(
      'SELECT id FROM menu_items WHERE link_value = ? AND parent_id IS NULL'
    ).get(child.parentLink);
    if (parent) {
      const childExists = await db.prepare(
        'SELECT id FROM menu_items WHERE parent_id = ? AND link_value = ?'
      ).get(parent.id, child.link_value === child.parentLink ? child.link_value : child.link_value);
      // Only add if this parent has no children yet
      const childCount = await db.prepare(
        'SELECT COUNT(*) as count FROM menu_items WHERE parent_id = ?'
      ).get(parent.id);
      if (childCount.count === 0) {
        await db.prepare(
          'INSERT INTO menu_items (parent_id, label_cz, label_en, link_type, link_value, display_order, is_active) VALUES (?,?,?,"internal",?,?,1)'
        ).run(parent.id, child.label_cz, child.label_en, child.link_value, child.order);
      }
    }
  }
  console.log('✅ Default menu items ensured');

  // ── Seed default admin user ───────────────────────────────────────────────
  const passwordHash = bcrypt.hashSync('admin123', 10);
  try {
    await db.prepare(`
      INSERT OR IGNORE INTO users (email, password_hash, role)
      VALUES (?, ?, ?)
    `).run('admin@nicolet.cz', passwordHash, 'admin');
  } catch (err) {
    if (err.code !== 'SQLITE_CONSTRAINT') console.error('Error seeding admin:', err);
  }

  console.log('✅ Database initialization complete');
}

export default db;
