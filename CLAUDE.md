# CLAUDE.md – Nicolet CZ

## Project Summary

Nicolet CZ is a presentation + B2B product website for Nicolet spectroscopy instruments.
Built on the KanjoWin/Eolite Node.js architecture.

- **Port:** 3003
- **DB:** `backend/nicolet.db` (SQLite via sqlite3 async wrapper)
- **Admin:** admin@nicolet.cz / admin123
- **Stack:** Node.js + Express + SQLite + Vanilla JS (no frontend framework)

---

## Architecture

```
backend/
  server.js          – Express app, all routes mounted here
  database.js        – Schema + initDatabase(), all tables defined here
  middleware/
    auth.js          – JWT auth (AuthMiddleware.verifyToken, .adminOnly)
  routes/
    auth.js          – POST /api/auth/login, /logout, /me
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
    auth.js          – AuthManager (JWT storage, headers)
    public.js        – Public SPA router + views
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
| Forms | forms | fields JSON, email recipients |
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
- Menu admin: ordering (up/down), parent/child hierarchy, link types: internal/page/category/product/application/external
- Entity pickers in admin modal auto-fill link_value from pages/products/applications/categories

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

- `JWT_SECRET` – JWT signing secret (set in .env)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` – email (optional)
- `PORT` – default 3003
