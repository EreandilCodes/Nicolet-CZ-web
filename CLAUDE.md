# CLAUDE.md – Nicolet CZ

## Project Summary

Nicolet CZ is a presentation + B2B product website for Nicolet spectroscopy instruments.
Built on the KanjoWin/Eolite Node.js architecture.

- **Port:** 3003
- **DB:** PostgreSQL (Neon) via `DB_PROVIDER=postgres` + `DATABASE_URL` in production. SQLite only for local dev. **Production SQLite fallback is BLOCKED**
- **Admin:** admin@nicolet.cz / admin123 (must change on first login — `must_change_password` flag)
- **Stack:** Node.js + Express + PostgreSQL (production) / SQLite (local dev) + Vanilla JS
- **Tests:** 223 tests (vitest + supertest), `npm test` to run
- **CI:** GitHub Actions (`.github/workflows/ci.yml`) — lint + test on Node 20/22

---

## Architecture

```
backend/
  server.js          – Express app, all routes mounted here
  config.js          – JWT_SECRET export (shared by auth.js + middleware/auth.js)
  database.js        – Schema + initDatabase() + closeDatabase(), PostgreSQL with safety guard
  logger.js          – Structured logging with secret scrubbing
  middleware/
    auth.js          – JWT auth (AuthMiddleware.verifyToken, .adminOnly) + token blacklist
    request-logger.js – Request tracing middleware
  routes/
    auth.js          – POST /api/auth/login, /logout, /refresh, /change-password, GET /me
    settings.js      – GET/PUT /api/settings
    contacts.js      – CRUD /api/contacts
    carousel.js      – CRUD /api/carousel
    news.js          – CRUD /api/news (slug auto-generated)
    pages.js         – CRUD /api/pages
    products.js      – CRUD /api/products + /api/product-categories
    applications.js  – CRUD /api/applications + /api/application-groups
    trainings.js     – CRUD /api/trainings
    buttons.js       – CRUD /api/buttons
    forms.js         – CRUD /api/forms + submissions + public submit
    gallery.js       – CRUD /api/gallery/folders + /api/gallery/images (multer upload)
    menu.js          – CRUD /api/menu
  services/
    email.js         – Nodemailer wrapper (non-critical)

frontend/
  index.html         – Public SPA entry
  admin.html         – Admin panel
  login.html         – Login page
  css/
    admin.css        – Admin design system (light theme)
    public.css       – Public website styles
  js/
    admin.js         – AdminController (loads section managers)
    auth.js          – AuthManager (JWT storage, headers, auto-refresh)
    public.js        – Public SPA router + views + dynamic meta tags
    aurora.js        – WebGL aurora background animation
  js/vendor/
    purify.es.mjs    – Self-hosted DOMPurify (no CDN dependency)
  admin/             – Admin section managers (one file per section)
    settings.js, contacts.js, carousel.js, news.js, pages.js,
    products.js, product-categories.js, applications.js, app-groups.js,
    trainings.js, buttons.js, forms.js, submissions.js, gallery.js, menu.js
  uploads/
    gallery/         – Uploaded images (served as /uploads/gallery/*)
```

---

## Content Types

| Entity | Table | Notes |
|---|---|---|
| Carousel | carousel_items | image, title CZ/EN, link, order |
| News | news_posts | slug auto, publish toggle |
| Pages | pages | slug, rich content CZ/EN |
| Product Categories | product_categories | tree (parent_id) |
| Products | products | M:N categories, images JSON array |
| Application Groups | application_groups | groups for applications |
| Applications | applications | linked to group, M:N products |
| Trainings | trainings | date_start/end, CTA button |
| Buttons | buttons | reusable CTA (form/link) |
| Forms | forms | fields JSON, label_color (black/white/blue), email recipients |
| Submissions | form_submissions | from public form submit |
| Gallery Folders | gallery_folders | tree (parent_id) |
| Gallery Images | gallery_images | uploaded or URL, tags |
| Menu Items | menu_items | tree, link_type: internal/product/application/external |
| Contacts | contacts | team contacts |
| Settings | settings | key-value pairs |

---

## Admin Groups

| Group | Sections |
|---|---|
| MAIN CONTENT | Carousel, News, Pages, Products, Applications, Trainings |
| INTERACTIVE | Buttons, Forms |
| STRUCTURE | Categories, Menu |
| GALLERY | Gallery |
| ADMINISTRATION | Settings, Contacts, Submissions |

---

## Design System

- **Theme:** Light admin (white/grey backgrounds, coloured accents)
- **Logo accent colors:** Red (#dc2626), Yellow (#ca8a04), Green (#16a34a), Blue (#2563eb), Grey (#6b7280)
- **Public theme:** "Science luxury" – dark navy, electric blue, gold accent
- **Font:** Inter

---

## Key Patterns

See AGENTS.md for Safe Fetch, DB migration, Admin Manager, security, Text/HTML editor toggle, and gallery picker rules.

### Promise.all Destructuring (CRITICAL)
When using `Promise.all` with `_loadDOMPurify()`, the DOMPurify result must be skipped in destructuring:
```javascript
// CORRECT — skip slot for DOMPurify
const [data, , buttons] = await Promise.all([
  safeFetch(url),
  _loadDOMPurify(),
  this._getButtons(),
]);

// WRONG — buttons gets DOMPurify module, .forEach crashes
const [data, buttons] = await Promise.all([
  safeFetch(url), _loadDOMPurify(),
  this._getButtons(),
]);
```

### CSP and Inline Scripts
- `script-src` includes `'unsafe-inline'` because admin.html has a large inline `<script>` block
- `upgrade-insecure-requests` and HSTS only enabled when `NODE_ENV=production`
- DOMPurify is self-hosted at `/js/vendor/purify.es.mjs` — no CDN in CSP needed
- Footer year logic is in public.js (not inline script) to comply with CSP

### Text/HTML Editor Toggle
- All rich-text admin fields (content_cz, content_en in News, Products, Applications, Trainings) use dual-mode editor
- Default: **Text mode** (contenteditable div) — HTML mode shows the textarea
- `initEditorView(id)` called in `showModal()`, `syncEditorToHtml(id)` called at start of `saveItem()`
- Global functions in admin.html `<script>` block; managers call via `window.initEditorView?.()`

### Gallery-Based Image Selection
- Entity forms (News, Products, Applications, Carousel) use gallery picker for all image fields
- Direct PC upload is only in the Gallery admin section (`/api/gallery/upload`)
- `openGalleryPicker(targetInputId, previewImgId)` — single image
- `openGalleryPickerMulti('prod')` — multi-image (calls `admin.products.addImageFromUrl(url)`)
- Gallery images API field: `image_url` (not `url`)

### Thumbnail Fallback Chain (public.js)
- Products: `thumbnail_url → images[0].url → settings.default_thumbnail`
- Applications: `thumbnail_url → cover_image → settings.default_thumbnail`

### Gallery Auth Token
Admin panel stores JWT as `nicolet_token` in localStorage (not `admin_token`). The inline `<script>` in admin.html must use `localStorage.getItem('nicolet_token')`.

### Gallery Folder Filtering
Backend `GET /api/gallery/images/admin/all?folder_id=N` filters by folder. Admin frontend passes `?folder_id=X` when `_currentFolder` is set.

### Gallery Upload Lock
`gallery.js` uses `this._uploading` flag + button disable/re-enable to prevent duplicate uploads on double-click.

### CZ/EN Language Tabs (News, Products, Applications)
All three editors use top CZ/EN tab buttons. Same pattern for all three:
- News: `switchNewsLang(lang)` / `resetNewsLangTabs()` — panels: `newsContentCzPanel` / `newsContentEnPanel`
- Products: `switchProductLang(lang)` / `resetProductLangTabs()` — panels: `prodDescCzPanel` / `prodDescEnPanel`
- Applications: `switchAppLang(lang)` / `resetAppLangTabs()` — panels: `appContentCzPanel` / `appContentEnPanel`
- Each `reset*LangTabs()` called in manager's `showModal()`, then both `initEditorView()` calls follow
- Switching tabs flushes current editor via `syncEditorToHtml(id)` before showing other panel

### Menu as Source of Truth
`index.html` `#main-nav` has static fallback nav. `public.js._renderNav()` overwrites it from `GET /api/menu` only when **≥ 3 root items** exist (threshold prevents replacing static nav with a partial/broken DB state). Novinky dropdown auto-injects items from `GET /api/news-categories`. Nav re-renders on lang switch.

- DB seed in `database.js` → `initDatabase()` ensures 6 default root items + children on server start
- Admin "Obnovit výchozí" button → `POST /api/menu/admin/seed-defaults` re-seeds missing items without server restart
- Menu admin: ordering (up/down), parent/child hierarchy, link types: internal/page/category/news_category/app_group/product/application/external
- Menu link value input has autocomplete suggestions (pages, products, apps, categories, news categories, app groups)
- Entity pickers in admin modal auto-fill link_value from pages/products/applications/categories/news-categories/app-groups

### FE Detail Page Layout (Product and Application)
Both Product and Application detail pages use the same single-column layout:
- Optional image / gallery above the `detail-tabs` block (full width, like cover image)
- `detail-tabs` below (full width): tab bar + tab panels with content and linked items as `linked-items-grid`
- Product tabs: "O přístroji" (desc + spec) and "Aplikace" (linked apps)
- Application tabs: "O aplikaci" (content) and "Vhodné přístroje" (linked products)
- Product uses `.product-detail-cover` wrapper for gallery, Application uses `.app-detail-cover`
- NO 2-column grid (`.product-detail-layout` is NOT used in the detail renderer)

---

## Environment

- `JWT_SECRET` – JWT signing secret (required in production, fails fast if missing)
- `DB_PROVIDER` – `postgres` or `sqlite` (default: sqlite)
- `DATABASE_URL` – PostgreSQL connection string (when DB_PROVIDER=postgres)
- `CORS_ORIGIN` – Comma-separated allowed origins (default: `http://localhost:PORT`)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` – email (optional)
- `PORT` – default 3003

---

## Security

- **Headers:** helmet.js — CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy
- **XSS:** DOMPurify self-hosted (`/js/vendor/purify.es.mjs`), safe fallback strips HTML if load fails
- **CORS:** Restricted to `CORS_ORIGIN` whitelist; same-origin requests always allowed
- **JWT:** 1h expiry + auto-refresh, JTI-based token blacklist on logout, centralized in `backend/config.js`
- **Auth:** Account lockout (5 failures → 15min lock), email format validation, password policy (8+ chars, uppercase + number)
- **Rate limiting:** express-rate-limit — 100 req/min general, 30 req/min writes, custom limits on login + form submit
- **Input:** `express.json({ limit: '1mb' })`, numeric `:id` param validation via `app.param()`
- **SQL:** All queries use parameterized statements
- **Uploads:** MIME type + extension validation, `path.basename()` for path traversal prevention
- **Shutdown:** Graceful SIGTERM/SIGINT handling with DB connection cleanup
- **Timeouts:** 30s request, 65s keepAlive

---

## Form Fields Structure

Form fields JSON stores: `name`, `label_cz`, `label_en`, `placeholder_cz`, `placeholder_en`, `type` (text/email/tel/textarea/checkbox), `required`.

## Homepage Sections (public.js renderHome)

Order: Carousel → Products (4, featured or fallback all) → Applications (4, featured or fallback all) → Upcoming Trainings (3, date >= today) → News (3) → Contact Banner

### Logo Caching
`logo_url` is cached in `localStorage` (`nicolet_logo_url`) and applied instantly in the constructor before the settings API call. Updated on each settings load and on admin save.

### Lightweight API for Lists
`GET /api/products?fields=list` and `GET /api/applications?fields=list` return reduced payloads (no spec, no SEO, truncated descriptions, no linked relations for apps). Used by homepage, list pages, and search. Detail endpoints (`/:slug`) return full data.

### Categories Section (Admin)
The "Kategorie & Sekce" admin section (`productCategories`) has 3 tabs: product categories, news categories (sekce novinek), and app groups (okruhy aplikací). `_switchCatTab()` in admin.js handles all 3. `loadSection('productCategories')` initializes `prodCats`, `newsCats`, AND `appGroups` managers.

### Cache Busting
JS files use `?v=N` query params in HTML script tags. Bump version when changing public.js or admin.js.

### Double-Submit Prevention
Forms admin (`forms.js`) uses `this._saving` flag + button disable. Gallery uses `this._uploading`. Settings uses button disable during save. Apply same pattern to any new save operations.

---

## Testing

- **Framework:** vitest v1 + supertest, config in `vitest.config.js`
- **Run:** `npm test` (or `npm run test:watch`)
- **Lint:** `npm run lint` (ESLint, `eslint.config.js`)
- **CI:** GitHub Actions on push/PR to main, Node 20+22 matrix
- **Test DB:** Each test file gets isolated SQLite via `tests/setup.js`
- **Pool:** Single fork (`singleFork: true`) — required by sqlite3 native module

| File | Tests | Coverage |
|------|-------|---------|
| `tests/api/crud.test.js` | 177 | All 14 CRUD routes |
| `tests/api/auth.test.js` | 19 | Login, refresh, logout, blacklist, change-password |
| `tests/api/security.test.js` | 9 | Headers, ID validation, body limits |
| `tests/unit/helpers.test.js` | 18 | esc, settled, sanitize fallback, URL validation |

When adding new routes, add corresponding tests to `crud.test.js`.
