
// ── Editor helper: escape for use in JS only (not injected to DOM as innerHTML) ──
function _esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

function authFetch(url, opts) {
  const fn = window.admin?.auth?.authenticatedFetch?.bind(window.admin.auth);
  return fn ? fn(url, opts) : fetch(url, opts);
}

// ── Text/HTML editor toggle ──────────────────────────────────────────────────

// Call after setting textarea.value — populates the contenteditable view & defaults to Text mode.
function initEditorView(id) {
  const ta   = document.getElementById(id);
  const view = document.getElementById(id + '_view');
  if (!ta || !view) return;
  view.innerHTML = ta.value;
  ta.style.display  = 'none';
  view.style.display = '';
  ta.dataset.editorMode = 'text';
  // sync toggle buttons
  const wrap = view.closest('.editor-wrap');
  if (wrap) {
    wrap.querySelectorAll('.editor-mode-btn').forEach(b => {
      b.classList.toggle('active', b.textContent.trim() === 'Text');
    });
  }
}

// Switch mode: 'text' or 'html'
function setEditorMode(id, mode) {
  const ta   = document.getElementById(id);
  const view = document.getElementById(id + '_view');
  if (!ta || !view) return;
  if (mode === 'html') {
    ta.value = view.innerHTML;
    view.style.display = 'none';
    ta.style.display   = '';
    ta.focus();
  } else {
    view.innerHTML = ta.value;
    ta.style.display   = 'none';
    view.style.display = '';
    view.focus();
  }
  ta.dataset.editorMode = mode;
  const wrap = view.closest('.editor-wrap') || ta.closest('.editor-wrap');
  if (wrap) {
    wrap.querySelectorAll('.editor-mode-btn').forEach(b => {
      const btnMode = b.textContent.trim() === 'HTML' ? 'html' : 'text';
      b.classList.toggle('active', btnMode === mode);
    });
  }
}

// Call before reading textarea.value in saveItem() — flushes contenteditable → textarea.
function syncEditorToHtml(id) {
  const ta   = document.getElementById(id);
  const view = document.getElementById(id + '_view');
  if (!ta || !view) return;
  if (ta.dataset.editorMode !== 'html') {
    ta.value = view.innerHTML;
  }
}

// ── insertFormat: works in both text (contenteditable) and html (textarea) modes ──
function insertFormat(textareaId, format) {
  const ta = document.getElementById(textareaId);
  if (!ta) return;

  // Text mode → operate on contenteditable
  if (ta.dataset.editorMode !== 'html') {
    const view = document.getElementById(textareaId + '_view');
    if (!view) return;
    view.focus();
    if (format === 'bold')   { document.execCommand('bold');   return; }
    if (format === 'italic') { document.execCommand('italic'); return; }
    if (format === 'ul')     { document.execCommand('insertUnorderedList'); return; }
    if (format === 'ol')     { document.execCommand('insertOrderedList');   return; }
    if (format === 'h1' || format === 'h2' || format === 'h3') {
      document.execCommand('formatBlock', false, format); return;
    }
    if (format === 'link') {
      const url = prompt('URL odkazu:', 'https://');
      if (url) document.execCommand('createLink', false, url);
      return;
    }
    return;
  }

  // HTML mode → insert tags into textarea at cursor
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  const text  = ta.value;
  const sel   = text.substring(start, end);
  let insert = '', cursorOffset = 0;

  if (format === 'h1')     { const i = sel||'Nadpis 1'; insert = `<h1>${i}</h1>\n`; }
  else if (format === 'h2') { const i = sel||'Nadpis 2'; insert = `<h2>${i}</h2>\n`; }
  else if (format === 'h3') { const i = sel||'Nadpis 3'; insert = `<h3>${i}</h3>\n`; }
  else if (format === 'bold')   { const i = sel||'text'; insert = `<strong>${i}</strong>`; }
  else if (format === 'italic') { const i = sel||'text'; insert = `<em>${i}</em>`; }
  else if (format === 'ul')  { const i = sel||'položka'; insert = `\n<ul>\n  <li>${i}</li>\n</ul>\n`; }
  else if (format === 'ol')  { const i = sel||'položka'; insert = `\n<ol>\n  <li>${i}</li>\n</ol>\n`; }
  else if (format === 'link') {
    const url = prompt('URL odkazu:', 'https://');
    if (!url) return;
    const i = sel || url;
    insert = `<a href="${url}">${i}</a>`;
  }

  cursorOffset = insert.length;
  ta.value = text.substring(0, start) + insert + text.substring(end);
  ta.setSelectionRange(start + cursorOffset, start + cursorOffset);
  ta.focus();
}

// ── News language tabs (CZ / EN) ─────────────────────────────────────────────

let _newsCurrentLang = 'cz';

function resetNewsLangTabs() {
  _newsCurrentLang = 'cz';
  const czPanel = document.getElementById('newsContentCzPanel');
  const enPanel = document.getElementById('newsContentEnPanel');
  const czTab   = document.getElementById('newsTabCz');
  const enTab   = document.getElementById('newsTabEn');
  if (czPanel) czPanel.style.display = '';
  if (enPanel) enPanel.style.display = 'none';
  if (czTab)   czTab.classList.add('lang-tab-active');
  if (enTab)   enTab.classList.remove('lang-tab-active');
}

function switchNewsLang(lang) {
  // Flush current editor before switching
  if (_newsCurrentLang === 'cz') syncEditorToHtml('newsContentCz');
  else                            syncEditorToHtml('newsContentEn');

  _newsCurrentLang = lang;

  document.getElementById('newsContentCzPanel').style.display = lang === 'cz' ? '' : 'none';
  document.getElementById('newsContentEnPanel').style.display = lang === 'en' ? '' : 'none';
  document.getElementById('newsTabCz').classList.toggle('lang-tab-active', lang === 'cz');
  document.getElementById('newsTabEn').classList.toggle('lang-tab-active', lang === 'en');
}

// ── Product language tabs (CZ / EN) ──────────────────────────────────────────

let _prodCurrentLang = 'cz';

function resetProductLangTabs() {
  _prodCurrentLang = 'cz';
  const czPanel = document.getElementById('prodDescCzPanel');
  const enPanel = document.getElementById('prodDescEnPanel');
  const czTab   = document.getElementById('prodTabCz');
  const enTab   = document.getElementById('prodTabEn');
  if (czPanel) czPanel.style.display = '';
  if (enPanel) enPanel.style.display = 'none';
  if (czTab)   czTab.classList.add('lang-tab-active');
  if (enTab)   enTab.classList.remove('lang-tab-active');
}

function switchProductLang(lang) {
  if (_prodCurrentLang === 'cz') syncEditorToHtml('prodDescCz');
  else                            syncEditorToHtml('prodDescEn');
  _prodCurrentLang = lang;
  document.getElementById('prodDescCzPanel').style.display = lang === 'cz' ? '' : 'none';
  document.getElementById('prodDescEnPanel').style.display = lang === 'en' ? '' : 'none';
  document.getElementById('prodTabCz').classList.toggle('lang-tab-active', lang === 'cz');
  document.getElementById('prodTabEn').classList.toggle('lang-tab-active', lang === 'en');
}

// ── Application language tabs (CZ / EN) ──────────────────────────────────────

let _appCurrentLang = 'cz';

function resetAppLangTabs() {
  _appCurrentLang = 'cz';
  const czPanel = document.getElementById('appContentCzPanel');
  const enPanel = document.getElementById('appContentEnPanel');
  const czTab   = document.getElementById('appTabCz');
  const enTab   = document.getElementById('appTabEn');
  if (czPanel) czPanel.style.display = '';
  if (enPanel) enPanel.style.display = 'none';
  if (czTab)   czTab.classList.add('lang-tab-active');
  if (enTab)   enTab.classList.remove('lang-tab-active');
}

function switchAppLang(lang) {
  if (_appCurrentLang === 'cz') syncEditorToHtml('appContentCz');
  else                           syncEditorToHtml('appContentEn');
  _appCurrentLang = lang;
  document.getElementById('appContentCzPanel').style.display = lang === 'cz' ? '' : 'none';
  document.getElementById('appContentEnPanel').style.display = lang === 'en' ? '' : 'none';
  document.getElementById('appTabCz').classList.toggle('lang-tab-active', lang === 'cz');
  document.getElementById('appTabEn').classList.toggle('lang-tab-active', lang === 'en');
}

// ── Pages language tabs (CZ / EN) ────────────────────────────────────────────

let _pagesCurrentLang = 'cz';

function resetPagesLangTabs() {
  _pagesCurrentLang = 'cz';
  const czPanel = document.getElementById('pagesContentCzPanel');
  const enPanel = document.getElementById('pagesContentEnPanel');
  const czTab   = document.getElementById('pagesTabCz');
  const enTab   = document.getElementById('pagesTabEn');
  if (czPanel) czPanel.style.display = '';
  if (enPanel) enPanel.style.display = 'none';
  if (czTab)   czTab.classList.add('lang-tab-active');
  if (enTab)   enTab.classList.remove('lang-tab-active');
}

function switchPagesLang(lang) {
  if (_pagesCurrentLang === 'cz') syncEditorToHtml('pagesContentCz');
  else                             syncEditorToHtml('pagesContentEn');
  _pagesCurrentLang = lang;
  document.getElementById('pagesContentCzPanel').style.display = lang === 'cz' ? '' : 'none';
  document.getElementById('pagesContentEnPanel').style.display = lang === 'en' ? '' : 'none';
  document.getElementById('pagesTabCz').classList.toggle('lang-tab-active', lang === 'cz');
  document.getElementById('pagesTabEn').classList.toggle('lang-tab-active', lang === 'en');
}

// ── Gallery Picker ────────────────────────────────────────────────────────────

let _galPickerTarget  = null;
let _galPickerPreview = null;
let _galAllImages     = [];
let _galAllFolders   = [];
let _galCurrentFolder = '';

async function openGalleryPicker(targetInputId, previewImgId) {
  _galPickerTarget  = targetInputId;
  _galPickerPreview = previewImgId || null;
  const searchEl = document.getElementById('galPickerSearch');
  if (searchEl) searchEl.value = '';
  const folderEl = document.getElementById('galPickerFolder');
  if (folderEl) folderEl.value = '';
  _galCurrentFolder = '';
  await _loadGalleryFolders();
  document.getElementById('galleryPickerModal').classList.remove('hidden');
  await _loadGalleryPickerImages();
}

// Called from products.js for picking into _imagesState
async function openGalleryPickerMulti(prefix) {
  _galPickerTarget  = '__multi__' + prefix;
  _galPickerPreview = null;
  const searchEl = document.getElementById('galPickerSearch');
  if (searchEl) searchEl.value = '';
  const folderEl = document.getElementById('galPickerFolder');
  if (folderEl) folderEl.value = '';
  _galCurrentFolder = '';
  await _loadGalleryFolders();
  document.getElementById('galleryPickerModal').classList.remove('hidden');
  await _loadGalleryPickerImages();
}

async function _loadGalleryFolders() {
  const select = document.getElementById('galPickerFolder');
  if (!select) return;
  try {
    const res = await authFetch('/api/gallery/folders/admin/all', {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });
    const ct = res.headers.get('content-type');
    if (!res.ok) return;
    _galAllFolders = ct?.includes('application/json') ? await res.json() : [];
    select.innerHTML = '<option value="">Všechny složky</option>' +
      _galAllFolders.map(f => `<option value="${f.id}">${_esc(f.name_cz || f.name_en || 'Složka ' + f.id)}</option>`).join('');
  } catch (err) {
    console.error('Failed to load gallery folders:', err);
  }
}

function filterGalleryPickerByFolder() {
  const folderEl = document.getElementById('galPickerFolder');
  _galCurrentFolder = folderEl ? folderEl.value : '';
  _loadGalleryPickerImages();
}

async function _loadGalleryPickerImages() {
  const grid = document.getElementById('galPickerGrid');
  if (!grid) return;
  grid.innerHTML = '<p style="padding:20px;color:#6b7280;grid-column:1/-1;">Načítám obrázky…</p>';
  try {
    let url = '/api/gallery/images/admin/all';
    if (_galCurrentFolder) {
      url += '?folder_id=' + _galCurrentFolder;
    }
    const res = await authFetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
    });
    const ct = res.headers.get('content-type');
    if (!res.ok) {
      const err = ct?.includes('application/json') ? await res.json() : { error: await res.text() };
      throw new Error(err.error || 'Request failed');
    }
    _galAllImages = await res.json();
    _renderGalleryPickerImages(_galAllImages);
  } catch (err) {
    grid.innerHTML = `<p style="padding:20px;color:#ef4444;grid-column:1/-1;">Chyba: ${_esc(err.message)}</p>`;
  }
}

function _renderGalleryPickerImages(images) {
  const grid = document.getElementById('galPickerGrid');
  if (!grid) return;
  const currentUrl = _galPickerTarget && !_galPickerTarget.startsWith('__multi__')
    ? (document.getElementById(_galPickerTarget)?.value || '') : '';
  if (!images.length) {
    grid.innerHTML = '<p style="padding:20px;color:#6b7280;grid-column:1/-1;">Žádné obrázky v galerii.</p>';
    return;
  }
  grid.innerHTML = images.map(img => {
    const url  = img.image_url || '';
    const name = _esc(img.title_cz || img.identifier || '–');
    const sel  = url === currentUrl ? ' selected' : '';
    return `<div class="gallery-picker-item${sel}" data-url="${_esc(url)}" onclick="selectGalleryImage(this.dataset.url)">
      <div class="gallery-picker-item-image">
        <img src="${_esc(url)}" alt="${name}"
          onerror="this.style.display='none'">
        <div style="display:none;width:100%;height:90px;background:#f1f5f9;align-items:center;justify-content:center;color:#94a3b8;font-size:11px;">no preview</div>
      </div>
      <div class="gallery-picker-item-name">${name}</div>
    </div>`;
  }).join('');
}

function filterGalleryPicker(query) {
  const q = query.toLowerCase();
  const filtered = _galAllImages.filter(img =>
    !q || (img.title_cz || img.identifier || '').toLowerCase().includes(q) ||
          (img.image_url || '').toLowerCase().includes(q)
  );
  _renderGalleryPickerImages(filtered);
}

function selectGalleryImage(url) {
  if (_galPickerTarget && _galPickerTarget.startsWith('__multi__')) {
    const prefix = _galPickerTarget.replace('__multi__', '');
    // Delegate to the relevant manager
    if (prefix === 'prod') window.admin?.products?.addImageFromUrl(url);
  } else if (_galPickerTarget) {
    const input = document.getElementById(_galPickerTarget);
    if (input) input.value = url;
    if (_galPickerPreview) {
      const preview = document.getElementById(_galPickerPreview);
      if (preview) { preview.src = url; preview.style.display = ''; }
    }
  }
  closeGalleryPicker();
}

function closeGalleryPicker() {
  document.getElementById('galleryPickerModal').classList.add('hidden');
  _galPickerTarget  = null;
  _galPickerPreview = null;
}

// ── uploadImage (settings / other single-field uploads) ──────────────────────
async function uploadImage(input, targetId) {
  const file = input.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('image', file);
  try {
    const res = await authFetch('/api/gallery/images/admin/upload', {
      method: 'POST',
      body: formData
    });
    const ct = res.headers.get('content-type');
 if (!res.ok) {
 const err = ct?.includes('application/json') ? await res.json() : { error: await res.text() };
 throw new Error(err.error || 'Upload failed');
 }
 const data = await res.json();
 const url = data.image_url || data.identifier;
 if (url) {
 document.getElementById(targetId).value = url;
 }
 window.admin?.showNotification('Obrázek nahrán', 'success');
 } catch (err) {
 console.error('Upload error:', err);
  window.admin?.showNotification('Chyba nahrávání: ' + err.message, 'error');
  }
}

// Attach gallery picker functions to window for inline onclick handlers
window.openGalleryPicker = openGalleryPicker;
window.openGalleryPickerMulti = openGalleryPickerMulti;
window.closeGalleryPicker = closeGalleryPicker;
window.filterGalleryPicker = filterGalleryPicker;
window.selectGalleryImage = selectGalleryImage;
window.uploadImage = uploadImage;
