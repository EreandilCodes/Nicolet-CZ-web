/**
 * ProductsManager – CRUD for products (M:N categories + applications, image manager, autocomplete).
 */
export class ProductsManager {
constructor(auth) {
    this.auth = auth;
    this.items = [];
    this.categories = [];
    this.applications = [];
    this._editing = null;
    this._imagesState = []; // [{url, caption, align}]
    this._selectedAppIds = new Set();
    this._saving = false;
  }

  async init() {
    await Promise.all([this.loadCategories(), this.loadApplications()]);
    await this.loadItems();
    this._bindButtons();
  }

  _bindButtons() {
    const btn = document.getElementById('btnAddProduct');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => this.showModal());
    }
  }

  async loadCategories() {
    try {
const response = await this.auth.authenticatedFetch('/api/product-categories/admin/all');
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json')
          ? await response.json()
          : { error: await response.text() };
        throw new Error(err.error || 'Request failed');
      }
      if (!contentType?.includes('application/json')) throw new Error('Neplatná odpověď serveru');
      this.categories = await response.json();
    } catch (err) {
      console.error('Products: categories load error:', err);
    }
  }

  async loadApplications() {
    try {
const response = await this.auth.authenticatedFetch('/api/applications/admin/all');
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json')
          ? await response.json()
          : { error: await response.text() };
        throw new Error(err.error || 'Request failed');
      }
      if (!contentType?.includes('application/json')) throw new Error('Neplatná odpověď serveru');
      this.applications = await response.json();
    } catch (err) {
      console.error('Products: applications load error:', err);
    }
  }

  async loadItems() {
    try {
const response = await this.auth.authenticatedFetch('/api/products/admin/all');
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json')
          ? await response.json()
          : { error: await response.text() };
        throw new Error(err.error || 'Request failed');
      }
      if (!contentType?.includes('application/json')) throw new Error('Neplatná odpověď serveru');
      this.items = await response.json();
      this.renderItems();
    } catch (err) {
      console.error('Products load error:', err);
      window.admin?.showNotification('Chyba načítání produktů: ' + err.message, 'error');
    }
  }

  renderItems() {
    const tbody = document.getElementById('productsTableBody');
    if (!tbody) return;

    if (!this.items.length) {
      tbody.innerHTML = `<tr><td colspan="7">
        <div class="table-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
          </svg>
          <p>Žádné produkty. Přidejte první.</p>
        </div>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = this.items.map(item => {
      const cats = (item.categories || []).map(c => esc(c.name_cz)).join(', ') || '–';
      return `<tr>
        <td class="col-id">${item.id}</td>
        <td>
          <div class="table-title">${esc(item.name_cz || '–')}</div>
          <div class="table-sub">${esc(item.name_en || '')}</div>
        </td>
        <td style="max-width:180px;white-space:normal;font-size:12px;">${cats}</td>
        <td class="col-status">
          <span class="badge ${item.is_featured ? 'badge-warning' : 'badge-neutral'}">
            ${item.is_featured ? 'Featured' : '–'}
          </span>
        </td>
        <td class="col-status">
          <span class="badge ${item.is_published ? 'badge-success' : 'badge-neutral'}">
            ${item.is_published ? 'Pub.' : 'Skryt'}
          </span>
        </td>
        <td class="col-order">${item.display_order ?? 0}</td>
        <td class="col-actions">
          <div class="table-actions">
            <button class="btn btn-ghost btn-icon" title="Upravit" onclick="admin.products.showModal(${item.id})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn btn-danger btn-icon" title="Smazat" onclick="admin.products.deleteItem(${item.id})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4h6v2"/>
              </svg>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

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
    const item = id ? this.items.find(i => i.id === id) : null;
    this._editing = item;

    document.getElementById('prodModalTitle').textContent = item ? 'Upravit produkt' : 'Přidat produkt';

    document.getElementById('prodNameCz').value      = item?.name_cz        || '';
    document.getElementById('prodNameEn').value      = item?.name_en        || '';
    document.getElementById('prodSlug').value        = item?.slug           || '';
    document.getElementById('prodDescCz').value      = item?.description_cz || '';
    document.getElementById('prodDescEn').value      = item?.description_en || '';
    document.getElementById('prodExcerptCz').value   = item?.excerpt_cz || '';
    document.getElementById('prodExcerptEn').value   = item?.excerpt_en || '';
    document.getElementById('prodThumbnailUrl').value = item?.thumbnail_url || '';
    // Update thumbnail preview
    const thumbPreview = document.getElementById('prodThumbnailPreview');
    if (thumbPreview) {
      const t = item?.thumbnail_url || '';
      thumbPreview.src = t;
      thumbPreview.style.display = t ? '' : 'none';
    }
    document.getElementById('prodFeatured').checked  = item?.is_featured    ?? false;
    document.getElementById('prodPublished').checked = item ? !!item.is_published : true;
    document.getElementById('prodOrder').value       = item?.display_order  ?? 0;
    document.getElementById('prodSeoTitleCz').value  = item?.seo_title_cz   || '';
    document.getElementById('prodSeoTitleEn').value  = item?.seo_title_en   || '';
    document.getElementById('prodSeoDescCz').value   = item?.seo_desc_cz    || '';
    document.getElementById('prodSeoDescEn').value   = item?.seo_desc_en    || '';

    // Images state
    try {
      const raw = item?.images_json || '[]';
      const parsed = JSON.parse(raw);
      this._imagesState = parsed.map(entry =>
        typeof entry === 'string'
          ? { url: entry, caption: '', align: 'center' }
          : entry
      );
    } catch {
      this._imagesState = [];
    }
    this._renderImagesUI();

    // Category checkboxes
    const existingCatIds = (item?.categories || []).map(c => c.id);
    const catContainer = document.getElementById('prodCategoryList');
    if (catContainer) {
      catContainer.innerHTML = this.categories.length
        ? this.categories.map(cat => `
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:6px;">
              <input type="checkbox" name="prodCategory" value="${cat.id}"
                ${existingCatIds.includes(cat.id) ? 'checked' : ''}>
              <span>${esc(cat.name_cz)}</span>
            </label>
          `).join('')
        : '<p style="color:#9ca3af;font-size:13px;">Žádné kategorie</p>';
    }

    // Application autocomplete – init chips
    this._selectedAppIds = new Set((item?.applications || []).map(a => a.id));
    this._renderAppChips();
    const searchEl = document.getElementById('prodAppSearch');
    if (searchEl) searchEl.value = '';
    const suggEl = document.getElementById('prodAppSuggestions');
    if (suggEl) suggEl.style.display = 'none';

    document.getElementById('productsModal').classList.remove('hidden');

    // Reset to CZ tab and init editors in Text mode
    window.resetProductLangTabs?.();
    window.initEditorView?.('prodDescCz');
    window.initEditorView?.('prodDescEn');

    const nameInput = document.getElementById('prodNameCz');
    const slugInput = document.getElementById('prodSlug');
    let slugManuallyEdited = !!item;
    if (!item) {
      slugInput.addEventListener('input', () => { slugManuallyEdited = true; });
      nameInput.addEventListener('input', () => {
        if (!slugManuallyEdited && nameInput.value) {
          slugInput.value = this._generateSlug(nameInput.value);
        }
      });
    }

    const form = document.getElementById('productsForm');
    if (!form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveItem();
      });
    }
  }

  closeModal() {
    document.getElementById('productsModal').classList.add('hidden');
    this._editing = null;
    this._imagesState = [];
    this._selectedAppIds = new Set();
  }

  // ─── Image manager ──────────────────────────────────────────────────────────

  _renderImagesUI() {
    const container = document.getElementById('prodImagesList');
    if (!container) return;
    if (!this._imagesState.length) {
      container.innerHTML = '<p style="color:#9ca3af;font-size:13px;">Žádné obrázky</p>';
      return;
    }
    container.innerHTML = this._imagesState.map((img, idx) => `
      <div style="display:flex;gap:8px;align-items:flex-start;padding:8px;border:1px solid #e5e7eb;border-radius:6px;background:#f9fafb;">
        <img src="${esc(img.url)}" style="width:64px;height:48px;object-fit:cover;border-radius:4px;flex-shrink:0;" onerror="this.style.display='none'">
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;color:#6b7280;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(img.url)}</div>
          <div style="display:flex;gap:6px;">
            <input type="text" placeholder="Popisek" value="${esc(img.caption || '')}"
              style="flex:1;font-size:12px;padding:4px 6px;border:1px solid #d1d5db;border-radius:4px;"
              oninput="admin.products._updateImageField(${idx},'caption',this.value)">
            <select style="font-size:12px;padding:4px 6px;border:1px solid #d1d5db;border-radius:4px;"
              onchange="admin.products._updateImageField(${idx},'align',this.value)">
              <option value="center" ${img.align==='center'?'selected':''}>Střed</option>
              <option value="left"   ${img.align==='left'  ?'selected':''}>Vlevo</option>
              <option value="right"  ${img.align==='right' ?'selected':''}>Vpravo</option>
            </select>
          </div>
        </div>
        <button type="button" style="flex-shrink:0;color:#ef4444;background:none;border:none;cursor:pointer;font-size:18px;line-height:1;"
          onclick="admin.products._removeImage(${idx})">&times;</button>
      </div>
    `).join('');
  }

  _updateImageField(idx, field, value) {
    if (this._imagesState[idx]) this._imagesState[idx][field] = value;
  }

  _removeImage(idx) {
    this._imagesState.splice(idx, 1);
    this._renderImagesUI();
  }

async addImageFromFile(input) {
  const file = input.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('image', file);
  try {
const res = await this.auth.authenticatedFetch('/api/gallery/images/admin/upload', {
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
        this._imagesState.push({ url, caption: '', align: 'center' });
        this._renderImagesUI();
      }
      window.admin?.showNotification('Obrázek nahrán', 'success');
    } catch (err) {
      window.admin?.showNotification('Chyba nahrávání: ' + err.message, 'error');
    }
    input.value = '';
  }

  addImageFromUrl(urlOverride) {
    const url = urlOverride || document.getElementById('prodImageUrlInput')?.value.trim();
    if (!url) return;
    this._imagesState.push({ url, caption: '', align: 'center' });
    this._renderImagesUI();
    if (!urlOverride) {
      const input = document.getElementById('prodImageUrlInput');
      if (input) input.value = '';
    }
  }

  // ─── Application autocomplete ───────────────────────────────────────────────

  filterAppSuggestions(query) {
    const q = query.toLowerCase();
    const list = document.getElementById('prodAppSuggestions');
    if (!list) return;
    const filtered = this.applications.filter(a =>
      !this._selectedAppIds.has(a.id) &&
      (a.name_cz?.toLowerCase().includes(q) || a.name_en?.toLowerCase().includes(q))
    );
    if (!filtered.length) {
      list.style.display = 'none';
      return;
    }
    list.innerHTML = filtered.map(a =>
      `<div class="autocomplete-item" onmousedown="admin.products.addAppChip(${a.id})">${esc(a.name_cz)}</div>`
    ).join('');
    list.style.display = 'block';
  }

  addAppChip(appId) {
    this._selectedAppIds.add(appId);
    this._renderAppChips();
    const searchEl = document.getElementById('prodAppSearch');
    if (searchEl) { searchEl.value = ''; searchEl.focus(); }
    const list = document.getElementById('prodAppSuggestions');
    if (list) list.style.display = 'none';
  }

  removeAppChip(appId) {
    this._selectedAppIds.delete(appId);
    this._renderAppChips();
  }

  _renderAppChips() {
    const container = document.getElementById('prodAppChips');
    if (!container) return;
    const selected = this.applications.filter(a => this._selectedAppIds.has(a.id));
    container.innerHTML = selected.map(a =>
      `<span class="chip">${esc(a.name_cz)}
        <button type="button" class="chip-remove" onmousedown="admin.products.removeAppChip(${a.id})">&times;</button>
      </span>`
    ).join('');
  }

  // ─── Save / Delete ──────────────────────────────────────────────────────────

  async saveItem() {
    if (this._saving) return;
    this._saving = true;

    // Sync contenteditable → textarea before reading values
    window.syncEditorToHtml?.('prodDescCz');
    window.syncEditorToHtml?.('prodDescEn');

    const name_cz = document.getElementById('prodNameCz').value.trim();
    if (!name_cz) {
      window.admin?.showNotification('Název CZ je povinný', 'error');
      this._saving = false;
      return;
    }

    const checkedCats = [...document.querySelectorAll('#prodCategoryList input[name="prodCategory"]:checked')]
      .map(el => Number(el.value));

    const data = {
      name_cz,
      name_en: document.getElementById('prodNameEn').value.trim() || null,
      slug: document.getElementById('prodSlug').value.trim() || null,
      description_cz: document.getElementById('prodDescCz').value.trim() || null,
      description_en: document.getElementById('prodDescEn').value.trim() || null,
      excerpt_cz: document.getElementById('prodExcerptCz').value.trim() || null,
      excerpt_en: document.getElementById('prodExcerptEn').value.trim() || null,
      thumbnail_url: document.getElementById('prodThumbnailUrl').value.trim() || null,
      images_json: JSON.stringify(this._imagesState),
      is_featured: document.getElementById('prodFeatured').checked ? 1 : 0,
      is_published: document.getElementById('prodPublished').checked ? 1 : 0,
      display_order: Number(document.getElementById('prodOrder').value) || 0,
      seo_title_cz: document.getElementById('prodSeoTitleCz').value.trim() || null,
      seo_title_en: document.getElementById('prodSeoTitleEn').value.trim() || null,
      seo_desc_cz: document.getElementById('prodSeoDescCz').value.trim() || null,
      seo_desc_en: document.getElementById('prodSeoDescEn').value.trim() || null,
      category_ids: checkedCats,
      application_ids: [...this._selectedAppIds],
    };

    const isEdit = !!this._editing;
    const url = isEdit ? `/api/products/admin/${this._editing.id}` : '/api/products/admin';
    const method = isEdit ? 'PUT' : 'POST';

    try {
const response = await this.auth.authenticatedFetch(url, {
        method,
        body: JSON.stringify(data)
      });
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json')
          ? await response.json()
          : { error: await response.text() };
        throw new Error(err.error || 'Request failed');
      }
      this.closeModal();
      await this.loadItems();
      window.admin?.showNotification(isEdit ? 'Produkt upraven' : 'Produkt přidán', 'success');
    } catch (err) {
      console.error('Products save error:', err);
      window.admin?.showNotification('Chyba ukládání: ' + err.message, 'error');
    } finally {
      this._saving = false;
    }
  }

  async deleteItem(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    if (!confirm(`Smazat produkt "${item.name_cz}"?`)) return;

    try {
const response = await this.auth.authenticatedFetch(`/api/products/admin/${id}`, {
        method: 'DELETE'
      });
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json')
          ? await response.json()
          : { error: await response.text() };
        throw new Error(err.error || 'Request failed');
      }
      await this.loadItems();
      window.admin?.showNotification('Produkt smazán', 'success');
    } catch (err) {
      console.error('Products delete error:', err);
      window.admin?.showNotification('Chyba mazání: ' + err.message, 'error');
    }
  }
}

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
