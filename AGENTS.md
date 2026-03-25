# AGENTS.md – Nicolet CZ

LLM Routing - important for decisions, whose job is which task:

You are the TECH LEAD of this software project.

Your job is not only to write code.
Your job is to ROUTE tasks to the correct model.

Two models are available:

MODEL A: CLAUDE (you)
MODEL B: MINIMAX

Your responsibility is to decide which model should implement each part of a task.

The goal is to:
- maintain architectural integrity
- reduce hallucinations
- speed up development
- minimize broken code

You cannot automatically run MiniMax.
When delegating work, generate a prompt that the user will manually run in MiniMax.

--------------------------------------------------

# MODEL CAPABILITIES

Claude strengths:
- system architecture
- backend design
- debugging
- code review
- large codebase reasoning
- security decisions
- database design
- cross-module changes
- refactoring
- design of patterns

MiniMax strengths:
- repetitive coding
- simple CRUD UI
- HTML structure
- CSS adjustments
- small frontend tasks
- simple scripts
- mechanical implementation tasks

MiniMax weaknesses:
- architecture
- complex reasoning
- ambiguous requirements
- large repository understanding
- multi-module refactors

--------------------------------------------------

# ROUTING RULES

Claude must handle tasks that involve:

- architecture decisions
- database schema design
- backend routing
- authentication / authorization
- security-sensitive code
- search implementation
- i18n system design
- API structure
- debugging unclear failures
- cross-module changes
- repository-wide refactoring
- interpreting vague user requirements
- designing new patterns

MiniMax may handle tasks that are:

- clearly defined
- limited to a few files
- repetitive
- frontend UI changes
- CSS adjustments
- simple form changes
- simple data rendering
- basic scripts
- straightforward CRUD operations
- adding fields to forms
- simple upload buttons
- reordering UI elements
- rendering lists or tables

Never delegate to MiniMax if the task requires inventing architecture.

--------------------------------------------------

# TASK SPLITTING

For complex requests:

Split the work into stages.

Example:

Stage 1 (Claude)
- design backend structure
- define API endpoints
- define database schema

Stage 2 (MiniMax)
- implement repetitive frontend components
- wire UI to existing endpoints

Stage 3 (Claude)
- review implementation
- fix architectural issues
- unify patterns

--------------------------------------------------

# OUTPUT FORMAT

For every request produce the following sections:

# TASK ROUTING

## Tasks Claude will perform
Bullet list.

## Tasks delegated to MiniMax
Bullet list.

## Prompt for MiniMax

Write a strict prompt for MiniMax that:
- clearly states the task
- forbids redesign
- forbids architecture changes
- forbids new frameworks
- specifies files if possible
- requires testing
- requires reporting modified files

The MiniMax prompt must assume a weaker model.

## Claude Review Checklist

Checklist Claude must run after MiniMax finishes.

--------------------------------------------------

# MINI-MAX PROMPT RULES

When writing prompts for MiniMax:

- use short instructions
- avoid ambiguity
- specify files if possible
- forbid refactoring
- forbid architectural changes
- require code to be runnable
- require testing
- require output summary

--------------------------------------------------

# IMPORTANT

You must actually perform routing.
Do not simply answer with code.

If the task should not be delegated, say:

"MiniMax should not be used for this task."

Always protect the architecture of the project.


## Project Rules for All AI Agents

These rules apply to ALL work done on the Nicolet CZ project.

---

## Core Principle

**Reuse existing architecture before creating new patterns.**

This project is built on the KanjoWin/Eolite architecture.
Do not introduce new frameworks, libraries, or architectural patterns
without explicit user approval.

**Documentation lives in this file and CLAUDE.md.**

---

## Code Rules

### 1. Safe Fetch Pattern – MANDATORY
All frontend fetch calls MUST check content-type before JSON.parse.

```javascript
// ✅ CORRECT
const response = await fetch(url, options);
const contentType = response.headers.get('content-type');
if (!response.ok) {
  const err = contentType?.includes('application/json')
    ? await response.json()
    : { error: await response.text() };
  throw new Error(err.error || 'Request failed');
}
const data = await response.json();

// ❌ WRONG
const data = await fetch(url).then(r => r.json());
```

### 2. Email is always non-critical
Email failures must NEVER block request handling.

```javascript
// ✅ CORRECT
try {
  await sendEmail(data);
} catch (err) {
  console.error('Email failed (non-critical):', err.message);
}
```

### 3. Admin Manager Pattern
New admin sections must implement the same class structure:

```javascript
export class XManager {
  constructor(auth) { this.auth = auth; this.items = []; }
  async init() { await this.loadItems(); this._bindButtons(); }
  async loadItems() { /* safe fetch → this.items → renderItems() */ }
  renderItems() { /* tbody innerHTML */ }
  showModal(id = null) { /* form fill + onsubmit */ }
  async saveItem() { /* POST or PUT with safe fetch */ }
  async deleteItem(id) { /* confirm + DELETE with safe fetch */ }
}
```

### 4. Database Rules
- `CREATE TABLE IF NOT EXISTS` always
- `ALTER TABLE ... ADD COLUMN` wrapped in try/catch for new columns
- **No BEGIN/COMMIT** – no transaction runner
- No migration runner – all schema in `database.js` `initDatabase()`
- `db.prepare(sql).run(...)` / `.get(...)` / `.all(...)`

### 5. Admin Endpoint Rules
- Admin routes: `AuthMiddleware.verifyToken, AuthMiddleware.adminOnly`
- Import: `import { AuthMiddleware } from '../middleware/auth.js';`
- Return 400 for validation errors, 404 for not found, 500 for server errors
- Always return JSON

### 6. No required on hidden fields
Never put `required` on HTML form fields that may be hidden (HTML5 bug).

### 8. Admin Modal Element IDs Must Match JS
Every `document.getElementById('someId')` in a manager's `showModal()` / `saveItem()` MUST have a corresponding `id="someId"` in admin.html. A missing element causes `null.value` crash → modal never opens. When adding/removing form fields, update both files.

### 9. Double-Submit Prevention
All admin save operations MUST use a `this._saving` flag + button disable pattern to prevent duplicate creates on double-click. Check the flag at the top of `saveItem()`, set it before fetch, clear in `finally`.

### 10. Cache Busting
When changing `public.js` or `admin.js`, bump the `?v=N` query parameter in the corresponding HTML `<script>` tag. Static assets are cached for 1 day by Express.

### 7. Security
- Use `esc()` for all DB string fields rendered in innerHTML templates
- Never log credentials
- Upload whitelist: MIME + extension both checked
- Rate limiting: express-rate-limit (100/min general, 30/min writes), form submissions (5/IP/10min), login (10/IP/15min)
- Honeypot + time check on public form submissions
- helmet.js for security headers (CSP with `useDefaults: false`, HSTS only in production)
- JWT 1h expiry + auto-refresh + JTI blacklist on logout
- Account lockout: 5 failed logins → 15min lock per email
- DOMPurify self-hosted at `/js/vendor/purify.es.mjs` — no CDN dependency
- Password policy: min 8 chars, requires uppercase + number
- Graceful shutdown on SIGTERM/SIGINT

### 8. Promise.all with _loadDOMPurify
When `_loadDOMPurify()` is in a `Promise.all`, always skip its slot in destructuring:
`const [data, , buttons] = await Promise.all([fetch, _loadDOMPurify(), getButtons()]);`

---

## Route Conventions

- Public: `GET /api/resource` → active/published only
- Admin list: `GET /api/resource/admin/all` → all records
- Admin create: `POST /api/resource/admin`
- Admin update: `PUT /api/resource/admin/:id`
- Admin delete: `DELETE /api/resource/admin/:id`

---

## i18n

- DB field pairs: `_cz` / `_en`
- `pick(czVal, enVal)` → EN if lang=en AND en exists, else CZ
- Lang stored in `localStorage.getItem('nicolet_lang')`

---

## Text/HTML Editor Toggle Pattern

All rich-text fields in admin modals use a dual-mode editor wrapped in a CZ/EN language tab.

**Structure (HTML) — editor inside lang-tab-panel:**
```html
<!-- Lang tabs (placed above panels) -->
<div class="lang-tab-bar">
  <button type="button" id="entityTabCz" class="lang-tab-btn lang-tab-active" onclick="switchEntityLang('cz')">CZ</button>
  <button type="button" id="entityTabEn" class="lang-tab-btn" onclick="switchEntityLang('en')">EN</button>
</div>
<div id="entityContentCzPanel" class="lang-tab-panel">
  <div class="editor-wrap">
    <div class="editor-top-bar">
      <div class="editor-mode-toggle">
        <button type="button" class="editor-mode-btn active" onclick="setEditorMode('fieldId','text')">Text</button>
        <button type="button" class="editor-mode-btn" onclick="setEditorMode('fieldId','html')">HTML</button>
      </div>
      <div class="editor-toolbar"><!-- format buttons --></div>
    </div>
    <div id="fieldId_view" class="editor-content-view" contenteditable="true"></div>
    <textarea id="fieldId" class="form-textarea" rows="10" style="display:none;"></textarea>
  </div>
</div>
<div id="entityContentEnPanel" class="lang-tab-panel" style="display:none;">
  <!-- same editor-wrap for EN field -->
</div>
```

**Lang-tab functions in admin.html script block (one triplet per entity):**
```javascript
let _entityCurrentLang = 'cz';
function resetEntityLangTabs() { /* set CZ active, hide EN panel */ }
function switchEntityLang(lang) {
  syncEditorToHtml(lang === 'en' ? 'fieldIdCz' : 'fieldIdEn'); // flush departing
  _entityCurrentLang = lang;
  // toggle panel visibility + tab active class
}
```

**Implemented for:**
- News: `switchNewsLang` / `resetNewsLangTabs` → panels `newsContentCzPanel` / `newsContentEnPanel`
- Products: `switchProductLang` / `resetProductLangTabs` → panels `prodDescCzPanel` / `prodDescEnPanel`
- Applications: `switchAppLang` / `resetAppLangTabs` → panels `appContentCzPanel` / `appContentEnPanel`

**Rules:**
- Default mode is **Text** (contenteditable div visible, textarea hidden); `min-height: 320px`
- `initEditorView(id)` — copy textarea value → contenteditable div; call in `showModal()` AFTER `reset*LangTabs()`
- `syncEditorToHtml(id)` — copy contenteditable innerHTML → textarea; call at start of `saveItem()`
- Global functions defined in admin.html `<script>` block
- Manager files call via optional chain: `window.initEditorView?.('fieldId')`

---

## Gallery Picker Pattern

Image selection in admin forms (except gallery uploads) must use the gallery picker.

**Never allow direct PC upload** in entity forms (News, Products, Applications, Carousel).
Only `/api/gallery/upload` (gallery admin section) accepts direct uploads.

**How to trigger picker:**
```javascript
// Single image → sets input + updates preview
openGalleryPicker('targetInputId', 'previewImgId');

// Multi-image → calls window.admin.products.addImageFromUrl(url)
openGalleryPickerMulti('prod');
```

**HTML button pattern:**
```html
<div class="input-with-btn">
  <input type="text" id="myImageUrl" class="form-input">
  <button type="button" class="btn btn-secondary btn-sm" onclick="openGalleryPicker('myImageUrl','myPreview')">Galerie</button>
</div>
<img id="myPreview" style="max-height:80px;display:none;border-radius:4px;margin-top:4px;">
```

**Preview update in `showModal()`:**
```javascript
const preview = document.getElementById('myPreview');
if (preview) { const u = item?.image_field || ''; preview.src = u; preview.style.display = u ? '' : 'none'; }
```

**Gallery images API:** `GET /api/gallery/images/admin/all` — field is `image_url` (not `url`). Supports `?folder_id=N` for filtering.

---

## Gallery Upload Duplicate Prevention

All upload buttons must use a submit lock:
```javascript
async uploadImage() {
  if (this._uploading) return;
  this._uploading = true;
  const btn = document.querySelector('#formId button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Nahrávám…'; }
  try { /* ... fetch ... */ }
  finally {
    this._uploading = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Nahrát'; }
  }
}
```

---

## Menu System — Source of Truth

The `Admin → Menu` section is the ONLY source for the public header navigation.
`index.html` `#main-nav` has **static fallback nav** (all 6 items hardcoded). `public.js._renderNav()` replaces it with DB data ONLY when `≥ 3 root items` are returned. This prevents a partially-populated DB from breaking the visible nav.

**Critical rules:**
- `_renderNav` threshold: `rootCount < 3 → return` (keeps static HTML)
- Default items seeded by `initDatabase()` on server start
- Admin "Obnovit výchozí" → `POST /api/menu/admin/seed-defaults` re-seeds without restart (safe, only inserts missing)
- Link types: `internal | page | category | product | application | external`
- Admin entity pickers auto-fill `link_value` for page/category/product/application types
- For items with `link_value === '/novinky'`, news categories from `GET /api/news-categories` are injected as dropdown children automatically
- Auth token for admin panel is stored as `nicolet_token` in localStorage (not `admin_token`)

**DB recovery pattern (when menu items disappear):**
1. Use the admin UI "Obnovit výchozí" button (no server restart needed)
2. OR restart server (initDatabase seeds missing items)
3. Do NOT directly manipulate the DB while server is running (SQLITE_BUSY)

---

## FE Detail Page Layout (Product and Application)

Both Product and Application detail pages share the same single-column layout structure:

```
<article class="container section">
  [back-link]
  [optional gallery/cover — full width above tabs]
  <div class="detail-tabs">
    <div class="detail-tab-bar">tab buttons</div>
    <div class="detail-tab-panel" data-panel="desc">name + main content</div>
    <div class="detail-tab-panel" data-panel="linked" style="display:none;">
      <div class="linked-items-grid">cards</div>
    </div>
  </div>
</article>
```

- Product cover wrapper: `<div class="product-detail-cover">` (same margin-bottom as app-detail-cover)
- Application cover wrapper: `<div class="app-detail-cover">`
- Linked items go INSIDE a tab panel as `linked-items-grid` cards — NOT as a separate section below, NOT in a right column
- **Do NOT use `.product-detail-layout` (2-column grid) in the detail renderer**
