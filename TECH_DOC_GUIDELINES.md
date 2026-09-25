# TECH_DOC_GUIDELINES.md – Nicolet CZ

Live reverse-engineered documentation of the Nicolet CZ web app.
Purpose: give any LLM/agent enough verified context to implement new features
correctly WITHOUT breaking existing patterns, architecture, or tests.

## Conventions

- Understanding markers:
  - `[VERIFIED]` – directly observed in code / tests during this audit.
  - `[INFERRED]` – reasoned from adjacent code, not directly observed.
  - `[UNKNOWN]` – not confirmed; do not rely on it.
- **Reuse-first:** every new feature must reuse an existing pattern below.
- Docs language: Czech (matching project) with exact technical identifiers in English.
- Files referenced are relative to repo root.

---

## 1. Project Overview

- Nicolet CZ – corporate/landing website for Nicolet CZ, s.r.o. (molecular spectroscopy: products, applications, trainings, news).
- Single Node.js/Express server serves BOTH the public site AND the admin panel. No separate API host, no SPA framework.
- Architecture style: classic server-rendered shell + JSON API + vanilla-JS SPA on the public side; a single classic HTML admin page with section managers on the admin side.
- [VERIFIED] Monorepo layout: `backend/` (Express), `frontend/` (static HTML/CSS/JS), `tests/`, `scripts/` (legacy data migrations), `audit/`, `docs/auth-migration/`.
- Admin auth: JWT in httpOnly cookie (`auth_token`). This was an architectural migration (see `docs/auth-migration/`) — **do not reintroduce localStorage token storage**.
- Test status at audit time: `npm test` → 226 tests passing (5 suites). [VERIFIED 2026-09-24]
- **Known broken state (CRITICAL):** 10 of 17 admin manager JS files fail `node --check` (orphaned duplicate code blocks). The admin panel currently does NOT bootstrap in the browser because `frontend/js/admin.js` statically imports them all. See Section 21.

---

## 2. Technology Stack

| Layer | Technology | Notes | Status |
|---|---|---|---|
| Runtime | Node.js ESM (`"type": "module"`) | `import` everywhere | [VERIFIED] |
| Web framework | Express `4.21.2` | `server.js` mounts all routers | [VERIFIED] |
| DB | `sqlite3` `5.1.7` (dev) / `pg` `8.13.3` → PostgreSQL (Neon, prod) | dual provider via `DB_PROVIDER` | [VERIFIED] |
| Auth | `jsonwebtoken` `9.0.2` + httpOnly cookies (`cookie-parser` `1.4.7`) | JTI blacklist + refresh | [VERIFIED] |
| Password hashing | `bcrypt` `6.0.0` | | [VERIFIED] |
| Security headers | `helmet` `8.1.0` | custom CSP, HSTS only in prod | [VERIFIED] |
| Rate limiting | `express-rate-limit` `8.3.1` | global + write + login + form limits | [VERIFIED] |
| Image upload | `multer` `1.4.5-lts.1` + `sharp` `0.33.5` | gallery upload, on-the-fly compression | [VERIFIED] |
| Email | `nodemailer` `8.0.1` | `EMAIL_MODE=mock\|smtp`, non-critical | [VERIFIED] |
| XSS (client) | self-hosted DOMPurify `frontend/js/vendor/purify.es.mjs` | no CDN dependency | [VERIFIED] |
| Server deps (unused on server) | `dompurify` `3.3.3`, `cheerio` | [VERIFIED] used only by `scripts/` (legacy migration) and public.js vendor | [VERIFIED] |
| Middleware | `compression`, `cors` | | [VERIFIED] |
| Tests | `vitest` `1.6.1` single-fork, `supertest` `7.2.2` | | [VERIFIED] |
| Lint | `eslint` `8.57.1` | flat config `eslint.config.js` | [VERIFIED] |
| Dev | `nodemon` `3.1.9` | `npm run dev` | [VERIFIED] |

Rules for dependencies in AGENTS.md/CLAUDE.md: **no new frameworks or libraries without explicit user approval.**

---

## 3. Project Structure

```
backend/
  server.js            – Express app, middleware, route mounting, sitemap.xml, SPA fallback
  config.js            – secrets (JWT_SECRET) + fatal exit in prod when default secret
  database.js          – dual-mode PG/SQLite, full schema (initDatabase), closeDatabase
  logger.js            – structured logger with secret scrubbing
  middleware/
    auth.js            – verifyToken, adminOnly, in-memory JTI blacklist
    request-logger.js  – request tracing (request_id via AsyncLocalStorage)
  routes/              – one file per resource (see Section 5)
  services/
    email.service.js   – nodemailer wrapper (mock/smtp), non-blocking usage
  utils/
    cookie.js          – setAuthCookie / clearAuthCookie / getAuthTokenFromCookie
frontend/
  index.html           – public SPA shell (header, #main-nav static fallback nav)
  admin.html           – admin panel (auth gate + inline script helpers + 17 modals)
  login.html           – admin login page
  css/ admin.css, public.css
  js/
    admin.js           – AdminController: loads manager modules, section switching
    admin-helpers.js   – editor toggle, gallery picker, notifications, esc()
    auth.js            – AuthManager: authenticatedFetch, 401→refresh→retry, cross-tab logout
    public.js          – public SPA router + all views + SEO meta + DOMPurify usage
    aurora.js          – WebGL background animation (cosmetic)
    vendor/purify.es.mjs – self-hosted DOMPurify
  admin/               – one manager module per admin section (17 files, see Section 21)
  uploads/gallery/     – uploaded images, served as /uploads/gallery/*
tests/
  setup.js             – forces SQLite temp DB per test file (.test-dbs/)
  api/ auth.test.js, crud.test.js, security.test.js, products-relations.test.js
  unit/ helpers.test.js
scripts/               – legacy CZ-web data import/migration scripts
audit/                 – CONNECTIVITY AUDIT reports
docs/auth-migration/   – token→cookie migration docs
```

---

## 4. Frontend Routing

### Public SPA (`frontend/js/public.js`) [VERIFIED]
- Vanilla JS hash-free History-API routing. Click interception + `popstate`.
- Routes include `/`, `/produkty`, `/produkt/:slug`, `/aplikace`, `/aplikace/:slug`, `/novinky`, `/novinka/:slug`, `/stranka/:slug`, `/kontakt`, `/skoleni`, search, 404 view. (Route names from public.js; render into a `<main>` region of index.html.)
- `_renderNav()` replaces the static `#main-nav` HTML ONLY when `≥ 3` root menu items come back from the API. If DB returns fewer, static fallback nav stays (prevents broken nav from partial seed).
- i18n: language from `localStorage.getItem('nicolet_lang')` ('cz' default). `pick(czVal, enVal)` helper → EN if lang=en AND enVal exists, else CZ.
- `esc(str)` client-side HTML escape used for all DB string interpolation.
- `updateMeta(...)` sets `<title>` + meta description dynamically per view (SEO).
- Rich text safely rendered via DOMPurify (`_loadDOMPurify()`). **When used inside `Promise.all`, its result slot must be skipped in destructuring** (see CLAUDE.md §Key Patterns; breaks fetches otherwise).

### Admin (`frontend/admin.html`) [VERIFIED]
- Not an SPA. One static HTML page with sidebar `[data-section]` links; `frontend/js/admin.js` shows/hides `<section id="{name}Section">`.
- Auth gate: inline `<script>` at top checks cookie; redirects to `/login` when unauthenticated.
- One CRUD modal per section + `#faqModal` + `#galleryPickerModal`.
- Global helpers live in admin.html inline `<script>` + `admin-helpers.js` (editor toggle `initEditorView`/`setEditorMode`/`syncEditorToHtml`, gallery picker `openGalleryPicker*`, toast `showNotification`).

---

## 5. Backend Routing

Mounted in `backend/server.js`. Route resource files under `backend/routes/`.

| Mount point | File | Public read | Admin write |
|---|---|---|---|
| `/api/auth` | routes/auth.js | login, refresh, logout, me | change-password |
| `/api/settings` | routes/settings.js | GET | PUT |
| `/api/contacts` | routes/contacts.js | GET | CRUD `/admin` |
| `/api/carousel` | routes/carousel.js | GET | CRUD `/admin` |
| `/api/news` | routes/news.js | list + `/news-categories` injection | CRUD `/admin/:id` |
| `/api/news-categories` | routes/news-categories.js | GET | CRUD `/admin` |
| `/api/pages` | routes/pages.js | GET | CRUD `/admin` |
| `/api/products` | routes/products.js | list/detail + linked apps | CRUD `/admin` |
| `/api/product-categories` | categoriesRouter (products.js) | GET | CRUD `/admin` |
| `/api/applications` | routes/applications.js | list/detail + linked products | CRUD `/admin` |
| `/api/application-groups` | groupsRouter (applications.js) | GET | CRUD `/admin` |
| `/api/trainings` | routes/trainings.js | GET | CRUD `/admin` |
| `/api/buttons` | routes/buttons.js | GET | CRUD `/admin` |
| `/api/forms` | routes/forms.js | GET + `POST submit` | CRUD `/admin` |
| `/api/submissions` | submissionsRouter (forms.js) | – | list/get/delete |
| `/api/gallery` | routes/gallery.js | folders/images | upload + CRUD `/admin` |
| `/api/menu` | routes/menu.js | GET | CRUD `/admin`, `seed-defaults` |
| `/api/faqs` | routes/faqs.js | GET | CRUD `/admin` |

Other routes: `/admin` → admin.html, `/login` → login.html, `/sitemap.xml` auto-generated from DB, `GET *` → index.html (SPA fallback).

Route conventions (AGENTS.md):
- Public read: `GET /api/resource` → only active/published.
- Admin list: `GET /api/resource/admin/all`.
- Create/update/delete: `POST/PUT/DELETE /api/resource/admin[/:id]`.
- Admin routes use `AuthMiddleware.verifyToken, AuthMiddleware.adminOnly`.
- **`app.param('id')`** validates numeric `:id` globally → 400 for non-numeric. [VERIFIED server.js]
- Category paste endpoints (`POST /api/menu/admin/seed-defaults`) re-seed missing menu defaults without restart. [VERIFIED]

---

## 6. Authentication and Authorization

[VERIFIED from `backend/routes/auth.js`, `backend/middleware/auth.js`, `backend/utils/cookie.js`, `frontend/js/auth.js`]

- JWT (1h), stored httpOnly cookie `auth_token` (secure in prod, `sameSite:'strict'`, 24h cookie maxAge) via `setAuthCookie`.
- Legacy `Authorization: Bearer` header ALSO accepted (backward compat; both checked by `verifyToken`).
- `AuthMiddleware.verifyToken` → decodes JWT, checks JTI blacklist, attaches `req.user`. `adminOnly` → 403 when `role !== 'admin'`.
- In-memory JTI blacklist for logout (cleaned each 10 min). In-memory only → resets on restart.
- Login protection: rate limit 10 req/15min/IP + account lockout 5 failed attempts → 15 min per email (in-memory Map).
- Password policy: min 8 chars, requires uppercase + number.
- Refresh: `POST /api/auth/refresh` returns new JWT cookie.
- Frontend `AuthManager.authenticatedFetch`: on 401 tries refresh once, then retries the original request; on failure logs out. Cross-tab logout via `logout_signal` localStorage event. `nicolet_user` (JSON) cached in localStorage — token NOT stored there.
- Logout clears cookie + JTI-blacklists the token.
- User seed: `admin@nicolet.cz / admin123` (printed at DB init). **Must change in prod.**

---

## 7. Database Schema

[VERIFIED from `backend/database.js`; exact per-table columns partially read — treat fine-grained columns as [VERIFIED] for the main content tables, [INFERRED] where noted.]

Tables (all created with `CREATE TABLE IF NOT EXISTS`):
- `users` (id, email, password_hash, role default 'admin', created_at) — **no lockout columns**; failed-login counters are in-memory Maps in auth.js, not persisted
- `settings` (key-value store: logo, colors, training_default_button_id, etc.)
- `menu_items` (id, parent_id tree, label_cz, label_en, link_type: internal|page|category|product|application|external, link_value, display_order, is_active)
- `buttons` (id, label CZ/EN, url, targets: form|link, form_id, ...)
- `carousel_items` (image, title CZ/EN, link, order, published)
- `news_categories` (id, slug, name CZ/EN)
- `news_posts` (slug, title CZ/EN, content CZ/EN, cover_image, cover_caption, cover_align, category_id, seo_*, is_published)
- `pages` (slug, title CZ/EN, content CZ/EN, seo_*, is_published)
- `contacts` (name, role, email, phone, sort)
- `faqs` (question/answer CZ/EN, category, special slot flags, is_published)
- `trainings` (title CZ/EN, desc CZ/EN, date_start/date_end, place, link, cta_button_id, is_published)
- `product_categories` (tree via parent_id, slug, name CZ/EN)
- `products` (slug, name CZ/EN, short/desc CZ/EN, images JSON array, cover/thumbnail, seo_*, is_featured, is_published)
- `product_categories_map` (product_id ↔ category_id)
- `product_applications_map` (product_id ↔ application_id)
- `applications` (slug, name CZ/EN, content CZ/EN, group_id → app_groups, cover_image, thumbnail_url, seo_*)
- `app_groups` (name/slug CZ/EN)
- `forms` (name, title CZ/EN, description CZ/EN, fields_json, background_image, email_recipients, submit_label CZ/EN, success_msg CZ/EN, label_color default 'white', is_active)
- `form_submissions` (form_id, payload JSON, created_at)
- `gallery_folders` (name, slug, parent_id tree)
- `gallery_images` (folder_id, image_url, identifier UNIQUE, title CZ/EN, description CZ/EN, tags, display_order, created_at)

Rules (AGENTS.md §4 + §6): `CREATE TABLE IF NOT EXISTS` always; `ALTER TABLE ADD COLUMN` wrapped in try/catch for new columns; **no BEGIN/COMMIT, no transaction runner, no migration runner** — everything lives in `database.js initDatabase()`; DB access via `db.prepare(sql).run/.get/.all`. Default menu items / pages / FAQs / settings seeded by `initDatabase()` on server start.

---

## 8. Database Layer

[VERIFIED `backend/database.js`]

- Dual provider chosen at runtime by `DB_PROVIDER` env (`sqlite` default, `postgres` for Neon).
- Unified low-level shim: `db.prepare(sql)` returns `{ run, get, all }` (mirrors better-sqlite3 API). For PG, `?` placeholders are converted to `$1..$n` before prepare.
- Primary keys: sqlite `INTEGER PRIMARY KEY AUTOINCREMENT`; pg `SERIAL PRIMARY KEY`. Insert uses `RETURNING id` on PG, `lastInsertRowid` on sqlite to fetch the new id.
- `initDatabase()` and `closeDatabase()` exported; server gates startup on `initWithTimeout` (35s timeout).
- No ORM, no transactions, no migrations. All schema in `initDatabase()`.
- Tests force SQLite + temp DB per file (`tests/setup.js` sets `DB_PROVIDER=sqlite`, `SQLITE_PATH=...test-NUUID.db`, `NODE_ENV=test`).

---

## 9. API Structure

- JSON everywhere; all data responses are `{...}` or arrays; list endpoints often `{ items: [...], total: n }` (forms/gallery/menu use item arrays). [VERIFIED]
- Admin list endpoints: `GET /api/<res>/admin/all`. [VERIFIED]
- Images in responses: gallery images field is **`image_url`**, not `url`. [VERIFIED]
- Public reads always filter `is_published = 1` / active. [VERIFIED]
- Slug auto-generation on create; unique via `-${Date.now()}` suffix or explicit slug policy. Two variants exist — simple sanitizer (`news.css`-family) and diacritic transliteration map (`products`/`applications`). [VERIFIED]
- Deterministic order field: `order` column, `sort_order`, or `created_at DESC` per resource.

---

## 10. Error Handling

[VERIFIED]

- Handlers:
  - Async route handlers wrapped so rejections reach the Express error middleware.
  - Global error handler (`server.js`, last middleware) → `500 {"error":"Chyba serveru"}` + structured log via `logger.fromError`.
  - `400` validation, `404` missing, `500` server — per AGENTS.md §5. Always JSON.
  - Non-numeric `:id` → 400 (`app.param('id')`).
- Frontend "Safe Fetch" (MANDATORY, AGENTS.md §1): always check `response.headers.get('content-type')` before `response.json()`, throw with backend-provided error message.
- Email is always non-critical: wrap in try/catch, log, never block the request (AGENTS.md §2).

---

## 11. Frontend State Management

[VERIFIED]

- No framework. Public SPA holds view state in the `public.js` module instance (current route, filters, language).
- Admin section managers are classes (`XManager`) holding `this.items` + render in `loadItems()`/`renderItems()`.
- Shared admin state lives on `window.admin` (AdminController) → `window.admin?.showNotification(...)`, `window.admin?.products...`.
- Language state: `localStorage nicolet_lang`.
- Auth state: native httpOnly cookie + `AuthManager`; user object in `localStorage nicolet_user`; cross-tab sync via storage event.

---

## 12. Form Handling

[VERIFIED]

### Public forms (`frontend/js/public.js` + `backend/routes/forms.js`)
- Admin-defined form fields stored as JSON (`forms.fields`).
- Dynamic form modal renders fields; required validation on submit (checkbox → `checked`, text → trimmed non-empty).
- Honeypot `_hp` + timing field (`form_loaded_at`) + server-side check — submissions with filled honeypot or instant submit are dropped.
- Server-side rate limit 5 submissions/10min/IP (in-memory).
- Server-side XSS sanitization: `sanitizeField`/`sanitizeSubmission` HTML-entity-escapes submitted values before storing in `form_submissions.payload`.
- New submissions emailed (non-critical, never blocks response).

### Admin form-builder (`frontend/admin/forms.js`)
- Dynamic field rows with `data-idx`; `_syncFieldsFromDOM()` reads ALL props (type, label_cz/en, placeholder_cz/en, required) as in AGENTS.md §Form Builder Pattern.

### Label color
- Forms have `label_color` (white|black|blue) applied as `label-{color}` classes; CSS color overrides need `!important`. (AGENTS.md §11)

---

## 13. File Uploads

[VERIFIED `backend/routes/gallery.js`]

- **Only** `/api/gallery/upload` (gallery admin section) accepts direct PC uploads. Entity forms (news/products/applications/carousel) must use the gallery picker to reference existing gallery images — never direct upload.
- `multer` disk storage into `frontend/uploads/gallery/`, 50MB limit.
- MIME + extension whitelist (jpeg/png/webp/gif).
- `sharp` optimization: max width 2000px; JPEG q85 progressive (mozjpeg); PNG→WebP q90; WebP q90; >8MB always resized.
- Filename `Date.now()-<random>.<ext>` (avoids collisions).
- Upload button double-submit lock (`this._uploading` + disabled button + "Nahrávám…") per AGENTS.md §Gallery Upload.
- Gallery picker: `openGalleryPicker('inputId','previewId')` single, `openGalleryPickerMulti('prod'|'app')` multi → calls `window.admin.products.addImageFromUrl(url)` etc. API field is `image_url`.

---

## 14. Data Validation

[VERIFIED]

- Backend: presence/type checks per route; 400 + Czech message on failure; `email` validated with regex; numeric IDs; enum checks for link_type/label_color/cover_align.
- Required-field parity: frontend validates before fetch (checkbox special-cased) AND backend re-validates required fields on submit (both documented in AGENTS.md §Form Required Field Validation).
- Slug uniqueness via suffix; auto-generation rules (Section 9).
- HTML/rich text: client-side DOMPurify sanitize before injection; server-side escaping for form submissions.
- No `required` attribute on hidden form fields (HTML5 bug) — enforce via JS validation instead. (AGENTS.md §6)

---

## 15. Styles and Design System

[VERIFIED from `frontend/css/`, `CLAUDE.md`]

- Two worlds:
  - **Public** — "science luxury": dark navy, electric blue, gold accents; font Inter; classes used by `public.js` templates (`.container .section`, `.detail-tabs .detail-tab-bar .detail-tab-panel`, `.linked-items-grid .linked-app-tile .linked-prod-tile`, `.carousel-*`, `.p-*` form classes, `label-{color}`).
  - **Admin** — light theme (white/grey, coloured accents), logo accent colors Red #dc2626 / Yellow #ca8a04 / Green #16a34a / Blue #2563eb / Grey #6b7280.
- Admin modal structure uses classes `.modal`, `.modal-content`, `.form-*`, `.input-with-btn`, `.btn .btn-secondary .btn-sm`, `.editor-wrap .editor-top-bar .editor-mode-toggle`, `.lang-tab-bar .lang-tab-panel`, `.gallery-grid`.
- Detail pages (product/application): single-column layout — back-link, optional full-width cover, tabs, linked tiles inside tab panel. **Do NOT use `.product-detail-layout` 2-column grid.** (CLAUDE.md + AGENTS.md)
- CSS color overrides that must win carry `!important`.

---

## 16. i18n

[VERIFIED]

- EN is optional on most fields; DB pairs `_cz`/`_en`, missing EN falls back to CZ.
- `pick(cz, en)` helper on frontend.
- Admin editors for rich text use CZ/EN **lang tabs** + **Text/HTML mode toggle**:
  - HTML structure per AGENTS.md §Text/HTML Editor Toggle: lang-tab-bar + per-language panels; each panel has editor-wrap with mode toggle (Text=contenteditable div visible / HTML=textarea hidden) + formatting toolbar.
  - Default mode Text; `min-height: 320px`.
  - `reset<Entity>LangTabs()` on modal open; `switch<Entity>Lang(lang)` calls `syncEditorToHtml` on departing field; `saveItem()` starts with `syncEditorToHtml` for both langs.
  - Implemented for News, Products, Applications (+ Trainings per CLAUDE.md).
- Server error/notification messages: Czech literals.

---

## 17. Tests

[VERIFIED]

- `npm test` = `vitest run` (single fork — sqlite3 native module; `vitest.config.js`).
- `tests/setup.js` must run before backend imports (mjs import order); creates `.test-dbs/test-*.db` per file.
- Suites: `auth.test.js`, `crud.test.js`, `security.test.js`, `products-relations.test.js`, `unit/helpers.test.js`.
- Cover: login/refresh/logout, CRUD for main entities, security (XSS, rate limit, honeypot, admin-gating), product↔application relations.
- Setup convenience: agent may run individual suites with `npx vitest run tests/api/crud.test.js`.

**Testing still current:** [VERIFIED] 226 passed on audit day.

---

## 18. Common Function Types

- `esc(str)` – HTML escape (public.js + each manager file re-defines it locally).
- `pick(cz, en)` – i18n select.
- `_generateSlug(text)` / simple slug helper – slugify.
- `showNotification(msg, type)` / `window.admin?.showNotification` – toast.
- `openGalleryPicker(inputId, previewId)` / `openGalleryPickerMulti(key)` – asset selection.
- `initEditorView(id)` / `syncEditorToHtml(id)` / `setEditorMode(id, mode)` – Text/HTML editor.
- `switch<Entity>Lang(lang)` / `reset<Entity>LangTabs()` – lang tabs in modals.
- `_loadDOMPurify()` – lazy-loads self-hosted DOMPurify; res could be module not text.
- `authenticatedFetch(url, opts)` (AuthManager) – cookie auth + auto-refresh.

---

## 19. Reusable Components

[VERIFIED]

- **Admin Manager class** — the core reuse unit:
  ```js
  export class XManager {
    constructor(auth) { this.auth = auth; this.items = []; this._saving = false; }
    async init() { await this.loadItems(); this._bindButtons(); }
    async loadItems() { /* safe fetch → this.items → renderItems() */ }
    renderItems() { /* tbody innerHTML with esc() */ }
    showModal(id = null) { /* element id ↔ manager JS id 1:1 */ }
    async saveItem() { /* double-submit guard + POST/PUT safe fetch */ }
    async deleteItem(id) {}
  }
  ```
- **Detail tabs + linked-tile grids** (product ↔ application).
- **Carousel** (`carousel.js` public view).
- **Trainings teaser** with optional default CTA button (`_renderTrainingsTeaser(trainings, defaultBtn)`).
- **Menu tree** rendering + seed-defaults recovery.
- **Gallery picker modal**, **advanced editor**, **toast**, **news category filter**.
- **Forms builder UI**, **form submissions list**, **FAQ section**.

---

## 20. External Services

[VERIFIED from DEPLOYMENT-REPORT.md + .env.example; some details [UNKNOWN]]

- **Email**: `backend/services/email.service.js` (nodemailer). `EMAIL_MODE=mock` logs instead of sending (dev); `smtp` uses `SMTP_*` env. Recipients via comma-separated `recipients` list on the form. Never interrupts request flow. [VERIFIED]
  - Note: `forms.js` historically contained an inline duplicate transport (`sendFormEmail`) instead of using the service — flagged in audit as DRY violation; prefer `email.service.js`. [INFERRED still true / verify on use]
- **PostgreSQL (Neon)** for production; **SQLite** locally. `DATABASE_URL` / `DB_PROVIDER` env. [VERIFIED]
- **CDN/edge**: Cloudflare in front (from DEPLOYMENT-REPORT). Rate limiting must see real IPs → need `app.set('trust proxy', ...)` — currently MISSING (audit HIGH finding). [VERIFIED from report], runtime effect [VERIFIED].
- **Fonts**: Google Fonts (Inter) via CSP font-src; NO JS CDN — DOMPurify self-hosted, no analytics/tracking. [VERIFIED]
- No other external APIs. [INFERRED — none found in route files]

---

## 21. Anti-patterns / Things Not To Break

### CRITICAL — broken admin JS (FIXED 2026-09-24)
[VERIFIED at discovery via `node --check`]

10 of 17 manager files contained orphaned duplicate code blocks (a leftover second copy of `saveItem()`/`saveFolder()`/`saveImage()` body directly in the class body) → SyntaxError. They were introduced by an uncommitted auth-migration edit (old `getAuthHeaders()` removal + `_saving` guard + `credentials:'include'`) that pasted a NEW `saveItem()` in front of the old body without deleting it.
- FAILED at discovery: `app-groups.js`, `applications.js`, `buttons.js`, `carousel.js`, `gallery.js` (2 orphans), `menu.js`, `news.js`, `pages.js`, `product-categories.js`, `trainings.js`
- OK at discovery: `contacts.js`, `faqs.js`, `forms.js`, `news-categories.js`, `products.js`, `settings.js`, `submissions.js`

Effect: `frontend/js/admin.js` statically imports all managers → the ENTIRE admin console failed to load in the browser.

**Fixed:** all orphans removed; all `frontend/admin/*.js` pass `node --check`; module graph loads; 226 tests pass; `admin.js?v=7` cache-busted in `admin.html`. Related auth bug fixed in `backend/routes/auth.js`: login/refresh now call `setAuthCookie()`, logout calls `clearAuthCookie()` — previously the httpOnly `auth_token` cookie was never set (see §6).

### Must-keep invariants (AGENTS.md / CLAUDE.md)
1. Safe Fetch content-type check — never bare `fetch().then(r => r.json())`.
2. Email failures never block requests.
3. Admin Manager class pattern; admin endpoints behind `verifyToken + adminOnly`; JSON responses; 400/404/500 codes.
4. DB rules: `IF NOT EXISTS`, try/catch ALTER, no transaction runner, no migration runner.
5. No `required` on hidden fields.
6. Admin modal element IDs ↔ manager JS must match 1:1.
7. Double-submit prevention (`this._saving` + disabled button) in every save/upload.
8. Cache-busting `?v=N` on `admin.html`/`index.html`/`login.html` script tags whenever `public.js`/`admin.js` or ANY `frontend/admin/*.js` changes (assets cached 1 day).
9. `Promise.all` with `_loadDOMPurify()` → skip its destructuring slot.
10. Cookie auth only; never store JWT in localStorage; never revert to `nicolet_token`/`admin_token` pattern.
11. Menu is the single source of truth for public nav; keep `_renderNav` threshold `rootCount < 3 → return` (static fallback).
12. Gallery-picker-only image selection in entity forms; only gallery section uploads.
13. Label color needs DB column + admin radio + public class + CSS `!important`.
14. Diacritic-aware slugs for products/applications.
15. Detail pages single-column with tabs; never reintroduce `.product-detail-layout`.
16. Default `is_published`/active toggle = true for new entities.
17. Auto-slug from CZ title until manually edited (with `_generateSlug` transliteration map).

---

## 22. Caching and Performance

[VERIFIED]

- `compression()` enabled (gzip).
- Static assets maxAge 1 day; HTML `Cache-Control: no-cache`.
- CSP allows `blob:`/`https:` images; hotlinking mostly self-hosted.
- Gallery images are sharp-compressed on upload (Section 13) → no runtime resize middleware.
- Sitemap regenerated per request from DB (no cache) — cheap SELECTs.
- Service timeouts: server 30s, keepAlive 65s, headers 66s.
- DB access via prepared statements; indexes on FK columns (audit BE-003/004 fixed). [VERIFIED]
- Public list endpoints render server data + client-side templates; no SSR, no client framework → keep bundle small, no new framework.

---

## 23. Development Workflow / Env Variables

[VERIFIED `.env.example` + config]

```
PORT=3003            # default
DB_PROVIDER=sqlite   # sqlite | postgres
DATABASE_URL         # Neon PG (prod) when postgres; SQLITE_PATH for sqlite
SQLITE_PATH=./backend/nicolet.db
JWT_SECRET           # required; prod exits if default
SITE_URL             # used by sitemap.xml (required on Railway)
CORS_ORIGIN          # comma-separated whitelist; defaults to localhost:PORT
EMAIL_MODE=mock      # mock | smtp
ADMIN_EMAIL, EMAIL_FROM, SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_PORT
NODE_ENV             # production turns on HSTS + secure cookies
```

Commands: `npm start` (`node backend/server.js`), `npm run dev` (nodemon), `npm test` (vitest), `npm run test:watch`, `npm run lint` (eslint .).
Server logs are structured (`logger.info('server_ready', {port})`), request logging middleware adds `request_id` + `X-Request-Id`.

---

## 24. Deployment

[VERIFIED from DEPLOYMENT-REPORT.md]

- Platform: Railway (start command `node backend/server.js`), PostgreSQL via Neon, Cloudflare in front.
- **Known prod requirement (from audit):** set `app.set('trust proxy', 1)` so rate limiting sees real client IPs behind Cloudflare — currently missing (HIGH).
- Prod env: `SITE_URL`, `CORS_ORIGIN`, `DATABASE_URL`, strong `JWT_SECRET`, `NODE_ENV=production`.
- Changes to JWT_SECRET/cookie require `docs/auth-migration/` review (cookie/header dual accept).
- Graceful shutdown on SIGTERM/SIGINT closes DB; uncaughtException → exit 1.
- [UNKNOWN] CI specifics (github workflows exist but this audit did not fully parse them; the last commit log mentions "remove Node 20 from CI").
- [UNKNOWN] Exact production secrets/domains — not present in repo.

---

## 25. Reuse Index

> How to reuse existing code for common future tasks. Each row should be the FIRST place to look.

| Task | Reuse from | Notes |
|---|---|---|
| Create a CRUD admin section | Any `frontend/admin/XManager` (use `products.js` as reference) + a new router file copied from `products.js` BE + table in `database.js` + section wired in `admin.html` + `admin.js` import | Follow Admin Manager pattern; update `cache-bust` version |
| Login / change password / refresh | `backend/routes/auth.js`, `frontend/js/auth.js` | Cookie-based; never add new token storage |
| Create user | `users` table seeding in `database.js` + bcrypt in `auth.js` | Admin role only today |
| Create category (tree) | `product_categories.js` + `gallery_folders.js` (parent_id tree) | Reuse the tree render/select pattern |
| Nested categories / submenu | Menu tree (`menu.js`), categories tree | `_renderNav` threshold applies to root menu items |
| Form validation (public) | `_submitFormModal` in `public.js` + required-field loop in `forms.js` | Honeypot + timing + rate limit + sanitize on submit |
| Data table | `renderItems()` tbody pattern + `showModal`/`deleteItem` | Add `?v=N` bump |
| Modal | Any admin CRUD modal (admin.html) | Keep element IDs 1:1 with JS |
| Notifications | `showNotification(msg,type)` / `window.admin?.showNotification` | toast |
| Gallery upload | `backend/routes/gallery.js` upload + upcoming `_uploading` lock | Only gallery section uploads |
| Image picker in a form | `openGalleryPicker(inputId, previewId)` / `openGalleryPickerMulti(key)` | Field is `image_url` |
| Contact form / submissions | `forms.js` + `form_submissions` + email.service | Email non-blocking |
| Slug generation | diacritic map in `products.js`/`applications.js`; simple variant elsewhere | unique via Date.now suffix |
| Rich text field (CZ/EN + Text/HTML) | lang-tab + editor-toggle pattern (News) | `reset*LangTabs` + `initEditorView` + `syncEditorToHtml` |
| Blog/news list + categories | `news.js` BE + public detail tabs | Category dropdown injects on `/novinky` |
| Detail page with linked items | Product/Application detail renderers + `linked-items-grid` | Never 2-column layout |
| Trainings with CTA | `_renderTrainingsTeaser(trainings, defaultBtn)` | default CTA button from settings |
| Menu seeding/reset | `POST /api/menu/admin/seed-defaults` | no restart needed |
| i18n text | `pick(cz,en)` + `_cz`/`_en` columns | EN optional fallback CZ |
| XSS protection | `esc()` client + DOMPurify + server-side submission sanitize | Never disable |
| Rate limiting | `express-rate-limit` mounts in `server.js` | per-IP in-memory |
| SEO / meta | `updateMeta()` in `public.js` + seo_* columns + `sitemap.xml` | |

---

## Appendix A – Reporting Rules for Agents

- Every claim you add to this file: mark `[VERIFIED]` / `[INFERRED]` / `[UNKNOWN]`.
- Never invent library versions; read `package.json`.
- Never change architecture: keep dual-DB shim, cookie auth, no-ORM, no migration runner, vanilla JS.
- After touching frontend JS: run `node --check` on each changed file (most admin managers are currently broken — see §21) and `npm test`.
- Bump `?v=N` cache-busting for changed JS assets.

## Appendix B – Current Verification Snapshot (2026-09-24)

- `npm test`: 5 files, 226 tests passed (after fixes).
- `node --check frontend/admin/*.js`: **all 17 pass** (10 broken files fixed; orphans removed).
- `node --check frontend/js/*.js frontend/js/admin.js`: all pass; admin.js module graph loads.
- Auth cookie E2E verified on temp instance: login → `Set-Cookie: auth_token` → `/api/auth/me` 200 with cookie.
- `/admin` → 301 `/admin/` → serves admin.html (browser-followed automatically).
- Note: `frontend/` files were the source of the regression; eslint ignores `frontend/` (see ignore patterns in `eslint.config.js`), so a syntax sweep (`node --check`) is the required guard for admin JS changes.