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
**This applies to all admin JS files in `/frontend/admin/` directory as well.**

### 11. Label Color for Forms
When adding a new form-related setting that affects visual appearance, ensure:
- Database column exists with proper migration
- Admin UI has corresponding input (radio/select)
- Public JS reads and applies CSS classes
- CSS has `!important` on color overrides to ensure they take effect

### 7. Security
- Use `esc()` for all DB string fields rendered in innerHTML templates
- Never log credentials
- Upload whitelist: MIME + extension both checked
- Rate limiting: express-rate-limit (100/min general, 30/min writes), form submissions (5/IP/10min), login (10/IP/15min)
- Honeypot + time check on public form submissions
- helmet.js for security headers (CSP with `useDefaults: false`, HSTS only in production)
- JWT 1h expiry + auto-refresh + JTI blacklist on logout
  - `POST /api/auth/refresh` is a **sliding session**: it re-issues a token for an expired-but-correctly-signed JWT (`jwt.verify(..., { ignoreExpiration: true })`), not just a valid one — signature check and JTI-blacklist check still apply
  - Every new/existing admin manager MUST route all its fetches through `this.auth.authenticatedFetch` (the refresh interceptor); a raw `fetch` in a manager brings back "Chyba ukládání: Invalid token" once the 1h token expires (cookie lasts 24h)
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
- Selecting a menu target (picker or autocomplete) auto-fills "Popis CZ"/"Popis EN" from the target's `name_cz`/`name_en` (pages: `title_cz`/`title_en`), guarded by per-field `_labelCzDirty`/`_labelEnDirty` flags — a field becomes dirty once the admin types into it (or when the item already had a value on open) and is then NEVER overwritten by picking another target
- For items with `link_value === '/novinky'`, news categories from `GET /api/news-categories` are injected as dropdown children automatically
- Admin session is carried in an httpOnly `auth_token` cookie (`credentials: 'include'`); no localStorage tokens are used

**DB recovery pattern (when menu items disappear):**
1. Use the admin UI "Obnovit výchozí" button (no server restart needed)
2. OR restart server (initDatabase seeds missing items)
3. Do NOT directly manipulate the DB while server is running (SQLITE_BUSY)

---

## Gallery Image Compression

Gallery uploads are automatically optimized using Sharp:

- **Max width:** 2000px (maintains aspect ratio)
- **JPEG:** Quality 85, progressive, mozjpeg compression (~60-70% size reduction, excellent quality)
- **PNG:** Converted to WebP quality 90 (transparent support, much smaller file)
- **WebP:** Quality 90 optimization
- **Upload limit:** 50MB (images > 8MB are always resized)

This happens automatically on upload in `backend/routes/gallery.js`.

---

## Linked Items Tiles (Detail Pages)

Product and Application detail pages show linked items in the second tab:
- Products show linked Applications
- Applications show linked Products

**Frontend rendering** uses CSS classes `linked-app-tile` and `linked-prod-tile`:
```javascript
// Products → Applications (horizontal tiles)
const tabContentApps = linkedApps.length
  ? `<div class="linked-items-grid">${linkedApps.map(a => `
      <a class="linked-app-tile" href="/aplikace/${a.slug}">
        <div class="linked-app-tile-img">
          <img src="${a.thumbnail_url || a.cover_image}" alt="...">
        </div>
        <div class="linked-app-tile-body">
          <div class="linked-app-tile-name">${name}</div>
        </div>
      </a>`).join('')}</div>`
  : '';
```

**API** must include thumbnail fields for linked items:
```sql
-- products.js: getProductApplications
SELECT a.id, a.slug, a.name_cz, a.name_en, a.thumbnail_url, a.cover_image FROM applications...

-- applications.js: getApplicationProducts  
SELECT p.id, p.slug, p.name_cz, p.name_en, p.thumbnail_url FROM products...
```

---

## Form Required Field Validation

Both frontend and backend validate required fields:

**Frontend** (`public.js` `_submitFormModal`):
```javascript
const requiredFields = fields.filter(f => f.required);
for (const field of requiredFields) {
  const input = formEl.querySelector(`[name="${field.name}"]`);
  if (!input) continue;
  const value = input.type === 'checkbox' ? input.checked : input.value.trim();
  if (!value) {
    input.classList.add('pform-error');
    // Show error message
    return;
  }
}
```

**Backend** (`routes/forms.js` POST submit):
```javascript
for (const field of formFields) {
  if (field.required) {
    const value = body[field.name];
    const isEmpty = field.type === 'checkbox' ? !value : (!value || String(value).trim() === '');
    if (isEmpty) {
      return res.status(400).json({ error: `Vyplňte prosím: ${field.label_cz || field.name}` });
    }
  }
}
```

**Structured validation errors (2026-09-25)** — backend returns `{ errors: [{field, label, message, type}], message }` (type ∈ `required | email | minlength | maxlength`). Frontend displays field-level error messages beneath each errored input with `aria-invalid`/`aria-describedby`, highlights with `.pform-field-error`, focuses first errored field, preserves all user data. Frontend also validates locally (all required fields + email regex + min/max length) for immediate feedback; backend stays authoritative. Admin field builder supports optional `minlength`/`maxlength` configuration.

---

## Product Modal Form Order

In admin UI, product modal fields are ordered:
1. Name (CZ/EN) + Slug
2. Description editor (with language tabs)
3. **Gallery images** (moved after description, before thumbnail)
4. Thumbnail
5. Categories
6. Linked applications
7. SEO fields
8. Featured / Published toggles

---

## Auto-Slug Generation Pattern

For admin entity forms, implement `_generateSlug()` method and auto-fill slug from CZ title on input:

```javascript
_generateSlug(text) {
  const replacements = {
    'á': 'a', 'ä': 'a', 'å': 'a', 'ā': 'a', 'ą': 'a', 'ă': 'a', 'ȧ': 'a', 'α': 'a',
    'č': 'c', 'ć': 'c', 'ç': 'c', 'ċ': 'c', 'ĉ': 'c', 'χ': 'c',
    'ď': 'd', 'đ': 'd', 'δ': 'd',
    'ě': 'e', 'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e', 'ę': 'e', 'ė': 'e', 'ē': 'e', 'ε': 'e',
    'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i', 'į': 'i', 'ī': 'i', 'ι': 'i',
    'ň': 'n', 'ń': 'n', 'ñ': 'n', 'ν': 'n',
    'ř': 'r', 'ŕ': 'r', 'ρ': 'r',
    'š': 's', 'ś': 's', 'ş': 's', 'ș': 's', 'σ': 's',
    'ť': 't', 'ț': 't', 'τ': 't',
    'ů': 'u', 'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u', 'ų': 'u', 'ū': 'u', 'ȳ': 'u', 'ύ': 'u', 'υ': 'u',
    'ý': 'y', 'ÿ': 'y', 'ψ': 'y',
    'ž': 'z', 'ź': 'z', 'ż': 'z', 'ζ': 'z',
    'β': 'b', 'γ': 'g', 'η': 'h', 'θ': 'th', 'κ': 'k', 'λ': 'l', 'μ': 'm', 'ξ': 'x', 'ο': 'o', 'π': 'p', 'φ': 'f',
  };
  let result = text.toLowerCase();
  for (const [from, to] of Object.entries(replacements)) {
    result = result.split(from).join(to);
  }
  return result.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

showModal(id = null) {
  // ... existing code ...
  const titleInput = document.getElementById('entityTitleCz');
  const slugInput = document.getElementById('entitySlug');
  let slugManuallyEdited = !!id;
  if (!id) {
    slugInput.addEventListener('input', () => { slugManuallyEdited = true; });
    titleInput.addEventListener('input', () => {
      if (!slugManuallyEdited && titleInput.value) {
        slugInput.value = this._generateSlug(titleInput.value);
      }
    });
  }
}
```
```

---

## Default Published/Active State

When adding new entities, default toggle should be `true`:

```javascript
document.getElementById('entityPublished').checked = item ? !!item.is_published : true;
```

---

## Form Builder Pattern (admin/forms.js)

For forms with dynamic field builder:

```javascript
// Field object structure
const field = {
  name: 'email_1',
  label_cz: 'Email',
  label_en: 'Email',
  placeholder_cz: 'vas@email.cz',
  placeholder_en: 'your@email.com',
  type: 'email',
  required: false,
};

// _syncFieldsFromDOM must capture all field properties
_syncFieldsFromDOM() {
  container.querySelectorAll('.field-row').forEach(row => {
    const idx = parseInt(row.dataset.idx, 10);
    const typeEl = row.querySelector('[data-prop="type"]');
    const czEl   = row.querySelector('[data-prop="label_cz"]');
    const enEl   = row.querySelector('[data-prop="label_en"]');
    const phCzEl = row.querySelector('[data-prop="placeholder_cz"]');
    const phEnEl = row.querySelector('[data-prop="placeholder_en"]');
    const reqEl  = row.querySelector('[data-prop="required"]');
    if (typeEl)  this._fields[idx].type             = typeEl.value;
    if (czEl)    this._fields[idx].label_cz         = czEl.value;
    if (enEl)    this._fields[idx].label_en         = enEl.value;
    if (phCzEl)  this._fields[idx].placeholder_cz   = phCzEl.value;
    if (phEnEl)  this._fields[idx].placeholder_en   = phEnEl.value;
    if (reqEl)   this._fields[idx].required         = reqEl.checked;
  });
}
```

---

## Form Label Color Setting

Forms support configurable label color (black/white/blue):

**Database:** `ALTER TABLE forms ADD COLUMN label_color TEXT DEFAULT 'white'`

**Admin HTML:** Radio buttons with name="formLabelColor"

**Admin JS:** Save label_color from checked radio

**Public JS:** Apply class `label-{color}` to title, desc, and all field labels

**CSS:** Each color variant needs `!important` to override defaults

---

## Homepage Trainings Teaser with CTA

The `_renderTrainingsTeaser()` method accepts an optional `defaultBtn` parameter:

```javascript
_renderTrainingsTeaser(trainings, defaultBtn = null) {
  // Apply defaultBtn to each training card that doesn't have its own cta_button_id
  trainings.map(tr => {
    const ctaBtn = tr.cta_button_id ? null : defaultBtn;
    // render card with ctaBtn if present
  });
}
```

In `renderHome()`, fetch buttons and pass to teaser:
```javascript
const [trainingsRes, buttons] = await Promise.all([...]);
const btnMap = {};
settled(buttons).forEach(b => { btnMap[b.id] = b; });
const defaultTrainingBtn = this.settings.training_default_button_id
  ? (btnMap[this.settings.training_default_button_id] || null) : null;
_renderTrainingsTeaser(upcoming, defaultTrainingBtn)
```

---

## CONNECTIVITY AUDIT 2026-04-22

**BE nálezy:** 20 celkem  
**FE nálezy:** 13 celkem  
**Integrační nálezy:** 14 celkem  
**E2E flows:** 0/7 ověřeno (nelze bez běžícího serveru)  
**Stav:** CONDITIONAL PASS — zbývají nízké a info priority

### TOP 3 Problémy
1. **BE-001 KRITICKÁ:** Admin page (`/admin`) není chráněna autentizací — veřejně přístupná pro analýzu
2. **BE-008 VYSOKÁ:** XSS možné ve form submissions — chybí server-side sanitizace
3. **INT-001 VYSOKÁ:** Contacts DELETE endpoint má nekonzistentní cestu (`/api/contacts/:id` vs `/api/contacts/admin/:id`)

### Doporučení
- ✅ Opraveno BE-001: Admin page nyní chráněna inline autentizací
- ✅ Opraveno BE-008: XSS sanitizace ve form submissions
- ✅ Opraveno FE-006: Double-submit prevention ve všech 12 manažerech
- ✅ Opraveno INT-001: Kontakty DELETE endpoint konzistentní
- ✅ Opraveno BE-006: Slug generace s diakritikou
- ✅ Opraveno BE-003/004: Indexy na FK sloupce
- ✅ **DOKONČENO**: httpOnly cookies implementovány (architekturní změna)
  - Všechna localStorage token volání odstraněna
  - Refresh interceptor s reaktivním 401 handlingem
  - Cross-tab logout via storage events
  - 100+ fetch volání aktualizováno s `credentials: 'include'`
  - Dokumentace: `docs/auth-migration/`

**Celá dokumentace:** `/audit/` adresář

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


# ── FORENSIC DIAGNOSIS PREVENTIVE RULES (2026-09-25) ───────────────────
# Added after investigation of data-disappearance incident during deploy.
# These rules prevent the root cause from recurring.
# Root cause (see below): SQLite DB (gitignored, never in git) was not
# migrated to PostgreSQL (Neon/Railway) on deploy; deployed PostgreSQL
# instance started with only default seed data.
# ───────────────────────────────────────────────────────────────────────

## Produkční data jsou nedotknutelná
Agent nesmí při běžném developmentu, testování, refactoringu, buildu,
commitu, pushi nebo deployi automaticky mazat, resetovat, seedovat nebo
rekonstruovat produkční data.

## Deploy ≠ reset databáze
Deploy aplikace nesmí implicitně znamenat database reset, truncate,
destructive seed nebo recreate production database.

## Dual-mode DB safety (SQLite ↔ PostgreSQL)
Tento projekt podporuje dvě databázová provozovny:
- **SQLite** (`DB_PROVIDER=sqlite` nebo neuvedeno) → `backend/nicolet.db`
- **PostgreSQL** (`DB_PROVIDER=postgres`) → `DATABASE_URL` (Neon/Railway)

**`backend/nicolet.db` je v `.gitignore` — nikdy se nedostane do gitu.**
Při deployu z gitu na platformu používající PostgreSQL (Railway/Neon):
1. SQLite databáze NEPŘEJDE do nového prostředí (gitignored)
2. `initDatabase()` vytvoří PRÁZDNÉ tabulky v PostgreSQL a doplní jen výchozí seed data
3. Veškerá uživatelsky vytvořená data z SQLite budou ZTRÁCENA

**Před deployem musí být data migrována:**
- Buď data exportovat z SQLite a importovat do PostgreSQL
- Nebo použít `DATABASE_URL` pointing to existing data-bearing DB
- Nebo deploy provést ručně s přenosem SQLite souboru

**`initDatabase()` bezpečnost:** Používá pouze `CREATE TABLE IF NOT EXISTS` a
`INSERT ... ON CONFLICT DO NOTHING`. Nikdy nemaže, nevyprázdnňuje a nemění
existující data. Bezpečné opakované spuštění.

## Migration safety
Každá databázová migration musí být před nasazením identifikována, zkontrolována
na destruktivní operace a posouzena z hlediska zachování existujících produkčních dat.
Všech `ALTER TABLE ADD COLUMN` v tomto projektu je obaleno v `try/catch` a jen
přidává sloupce. Žádná migration nemá destrukční operaci.

## Seed safety
Seed scripts (`initDatabase()` default data) používají `INSERT ... ON CONFLICT DO NOTHING`.
Seed NEBYL navržen pro produkční databázi s uživatelskými daty — doplní jen výchozí
záznamy, pokud ještě neexistují. Nikdy neresetuje a nemaže existující data.

## Environment safety
Před deployem je nutné ověřit, že aplikace používá správnou:
- databázi (SQLite vs PostgreSQL — ověřit `DB_PROVIDER`)
- storage (cesty k uploadům, gallery)
- environment (port, NODE_ENV)
- credentials (JWT_SECRET, SMTP_*)
- persistent volume (u PostgreSQL: Neon connection string)

**Kritické proměnné:** `DB_PROVIDER`, `DATABASE_URL`, `SQLITE_PATH`, `PORT`,
`JWT_SECRET`, `SITE_URL`, `CORS_ORIGIN`, `SMTP_*`.

**Code-level safety guard (`database.js`):** Production safety is enforced at module load time.
If `NODE_ENV=production` or `RAILWAY_ENVIRONMENT=production` and `DB_PROVIDER !== 'postgres'`,
the process exits with code 1. If `DB_PROVIDER=postgres` but `DATABASE_URL` is missing,
the process exits with code 1. **Production CANNOT silently fall back to SQLite.**

**Migration rule (2026-09-25):** Before any deploy that changes `DB_PROVIDER` from `sqlite`
to `postgres`, data must be migrated. `initDatabase()` uses only `CREATE TABLE IF NOT EXISTS`
and `INSERT ... ON CONFLICT DO NOTHING` — it never deletes or truncates existing data.

## Persistent storage
Produkční data NESMÍ být závislá na ephemeral filesystemu containeru, pokud
architektura očekává jejich trvalé zachování. SQLite databáze na ephemeral
filesystemu se ztratí při restartu containeru.

**Pro produkci používejte PostgreSQL (Neon/Railway)** s trvalým úložištěm.
SQLite je určen výhradně pro lokální vývoj.

## Pre-deploy kontrola
Před deployem musí agent zkontrolovat:
- zda se mění `DB_PROVIDER` (SQLite → PostgreSQL?)
- zda se mění `DATABASE_URL` / `SQLITE_PATH`
- zda se mění migrations
- zda se mění seed/init scripts
- zda se mění storage konfigurace
- zda deploy obsahuje destruktivní příkaz
- zda je `backend/nicolet.db` zahrnut do deploy (NENÍ — gitignored!)

Pokud něco takového zjistí, **nesmí to automaticky provést bez explicitního potvrzení**.

## Read-only diagnostika
Při podezření na problém s produkčními daty se nejdříve provádí read-only diagnostika.
Nikdy neprovádějte žádný INSERT, UPDATE, DELETE, DROP, TRUNCATE, ALTER na
produkční databázi bez explicitního potvrzení.

## Explicitní confirmation pro destruktivní operace
Jakákoli operace typu reset, truncate, drop, destructive migration, destructive seed,
recreate production DB, smazání storage vyžaduje **explicitní potvrzení člověka**
před provedením.

## Zásada: data v gitu vs data mimo gitu
- **V gitu:** kód, schemata, seed data, konfigurace
- **Mimo gitu (gitignore):** `backend/nicolet.db`, `backend/nicolet.db-shm`,
  `backend/nicolet.db-wal`, `backend/logs/`, `frontend/uploads/`
- **Deploy z gitu nikdy nezachová data mimo gitu.**
- Pokud data nejsou v gitu, musí se data buď exportovat/importovat, nebo
  deploy provést s přenosem souborů.

## Zjištěná příčina incidentu (forenzní diagnostika)
**Prokázaná skutečnost:** `backend/nicolet.db` je v `.gitignore`. Při deployu z gitu
se SQLite databáze s uživatelskými daty nedostane do nového prostředí. Platforma
Railway/Neon používá `DB_PROVIDER=postgres` a `DATABASE_URL`. `initDatabase()`
vytvoří prázdné tabulky v PostgreSQL a doplní jen výchozí seed data.

**Silně podporovaná hypotéza:** Data nebyla smazána — nově nasazená aplikace se
pouze připojuje k jinam (PostgreSQL místo SQLite), kde existují jen výchozí data.

**Nelze ověřit bez přístupu k Railway env vars:** zda `DB_PROVIDER=postgres` a
`DATABASE_URL` byly skutečně nastaveny v deploy prostředí.

## Co jsi NEZMĚNIL v tomto diagnostickém úkolu
- application code (kromě AGENTS.md)
- database (SQLite i PostgreSQL)
- production data
- deployment
- migrations
- seed
- configuration
- storage
- environment variables
- Docker/config files (žádné nebyly změněny)

## Git
Jediná změna v tomto úkolu: doplnění preventivních pravidel do `AGENTS.md`.
Žádný jiný soubor nebyl změněn.
