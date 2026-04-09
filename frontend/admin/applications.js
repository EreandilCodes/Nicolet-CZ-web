/**
 * ApplicationsManager – CRUD for applications (autocomplete products, thumbnail, caption/align).
 */
export class ApplicationsManager {
  constructor(auth) {
    this.auth     = auth;
    this.items    = [];
    this.groups   = [];
    this.products = [];
    this._editing = null;
    this._selectedProductIds = new Set();
  }

  async init() {
    await Promise.all([this.loadGroups(), this.loadProducts()]);
    await this.loadItems();
    this._bindButtons();
  }

  _bindButtons() {
    const btn = document.getElementById('btnAddApplication');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => this.showModal());
    }
  }

  async loadProducts() {
    try {
      const response = await fetch('/api/products/admin/all', {
        headers: this.auth.getAuthHeaders()
      });
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json')
          ? await response.json()
          : { error: await response.text() };
        throw new Error(err.error || 'Request failed');
      }
      if (!contentType?.includes('application/json')) throw new Error('Neplatná odpověď serveru');
      this.products = await response.json();
    } catch (err) {
      console.error('Applications: products load error:', err);
    }
  }

  async loadGroups() {
    try {
      const response = await fetch('/api/application-groups/admin/all', {
        headers: this.auth.getAuthHeaders()
      });
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json')
          ? await response.json()
          : { error: await response.text() };
        throw new Error(err.error || 'Request failed');
      }
      if (!contentType?.includes('application/json')) throw new Error('Neplatná odpověď serveru');
      this.groups = await response.json();
    } catch (err) {
      console.error('Applications: groups load error:', err);
    }
  }

  async loadItems() {
    try {
      const response = await fetch('/api/applications/admin/all', {
        headers: this.auth.getAuthHeaders()
      });
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
      console.error('Applications load error:', err);
      window.admin?.showNotification('Chyba načítání aplikací: ' + err.message, 'error');
    }
  }

  renderItems() {
    const tbody = document.getElementById('applicationsTableBody');
    if (!tbody) return;

    if (!this.items.length) {
      tbody.innerHTML = `<tr><td colspan="7">
        <div class="table-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
          </svg>
          <p>Žádné aplikace. Přidejte první.</p>
        </div>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = this.items.map(item => {
      const group = this.groups.find(g => g.id === item.group_id);
      return `<tr>
        <td class="col-id">${item.id}</td>
        <td>
          <div class="table-title">${esc(item.name_cz || '–')}</div>
          <div class="table-sub">${esc(item.name_en || '')}</div>
        </td>
        <td>${esc(group?.name_cz || '–')}</td>
        <td class="col-status">
          <span class="badge ${item.is_published ? 'badge-success' : 'badge-neutral'}">
            ${item.is_published ? 'Pub.' : 'Skryta'}
          </span>
        </td>
        <td class="col-status">
          <span class="badge ${item.is_featured ? 'badge-warning' : 'badge-neutral'}">
            ${item.is_featured ? 'Featured' : '–'}
          </span>
        </td>
        <td class="col-order">${item.display_order ?? 0}</td>
        <td class="col-actions">
          <div class="table-actions">
            <button class="btn btn-ghost btn-icon" title="Upravit" onclick="admin.apps.showModal(${item.id})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn ${item.is_published ? 'btn-secondary' : 'btn-ghost'} btn-icon" title="${item.is_published ? 'Skrýt' : 'Publikovat'}" onclick="admin.apps.togglePublish(${item.id})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
            <button class="btn btn-danger btn-icon" title="Smazat" onclick="admin.apps.deleteItem(${item.id})">
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

    document.getElementById('appModalTitle').textContent = item ? 'Upravit aplikaci' : 'Přidat aplikaci';

    document.getElementById('appNameCz').value        = item?.name_cz       || '';
    document.getElementById('appNameEn').value        = item?.name_en       || '';
    document.getElementById('appSlug').value          = item?.slug          || '';
    document.getElementById('appContentCz').value     = item?.content_cz    || '';
    document.getElementById('appContentEn').value     = item?.content_en    || '';
    document.getElementById('appCoverImage').value    = item?.cover_image   || '';
    document.getElementById('appCoverCaption').value  = item?.cover_caption || '';
    document.getElementById('appCoverAlign').value    = item?.cover_align   || 'center';
    document.getElementById('appThumbnailUrl').value  = item?.thumbnail_url || '';
    // Update image previews
    const coverPreview = document.getElementById('appCoverPreview');
    if (coverPreview) { const u = item?.cover_image||''; coverPreview.src=u; coverPreview.style.display=u?'':'none'; }
    const thumbPreview = document.getElementById('appThumbnailPreview');
    if (thumbPreview) { const u = item?.thumbnail_url||''; thumbPreview.src=u; thumbPreview.style.display=u?'':'none'; }
    document.getElementById('appFeatured').checked    = item?.is_featured   ?? false;
    document.getElementById('appPublished').checked   = item ? !!item.is_published : true;
    document.getElementById('appOrder').value         = item?.display_order ?? 0;

    // Populate group select
    const groupSelect = document.getElementById('appGroupId');
    groupSelect.innerHTML = '<option value="">— Vyberte skupinu —</option>';
    this.groups.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.name_cz;
      if (item?.group_id === g.id) opt.selected = true;
      groupSelect.appendChild(opt);
    });

    // Product autocomplete – init chips
    this._selectedProductIds = new Set((item?.products || []).map(p => p.id));
    this._renderProductChips();
    const searchEl = document.getElementById('appProductSearch');
    if (searchEl) searchEl.value = '';
    const suggEl = document.getElementById('appProductSuggestions');
    if (suggEl) suggEl.style.display = 'none';

    document.getElementById('applicationsModal').classList.remove('hidden');

    // Reset to CZ tab and init editors in Text mode
    window.resetAppLangTabs?.();
    window.initEditorView?.('appContentCz');
    window.initEditorView?.('appContentEn');

    const nameInput = document.getElementById('appNameCz');
    const slugInput = document.getElementById('appSlug');
    let slugManuallyEdited = !!item;
    if (!item) {
      slugInput.addEventListener('input', () => { slugManuallyEdited = true; });
      nameInput.addEventListener('input', () => {
        if (!slugManuallyEdited && nameInput.value) {
          slugInput.value = this._generateSlug(nameInput.value);
        }
      });
    }

    const form = document.getElementById('applicationsForm');
    if (!form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveItem();
      });
    }
  }

  closeModal() {
    document.getElementById('applicationsModal').classList.add('hidden');
    this._editing = null;
    this._selectedProductIds = new Set();
  }

  // ─── Product autocomplete ────────────────────────────────────────────────────

  filterProductSuggestions(query) {
    const q = query.toLowerCase();
    const list = document.getElementById('appProductSuggestions');
    if (!list) return;
    const filtered = this.products.filter(p =>
      !this._selectedProductIds.has(p.id) &&
      (p.name_cz?.toLowerCase().includes(q) || p.name_en?.toLowerCase().includes(q))
    );
    if (!filtered.length) {
      list.style.display = 'none';
      return;
    }
    list.innerHTML = filtered.map(p =>
      `<div class="autocomplete-item" onmousedown="admin.apps.addProductChip(${p.id})">${esc(p.name_cz)}</div>`
    ).join('');
    list.style.display = 'block';
  }

  addProductChip(productId) {
    this._selectedProductIds.add(productId);
    this._renderProductChips();
    const searchEl = document.getElementById('appProductSearch');
    if (searchEl) { searchEl.value = ''; searchEl.focus(); }
    const list = document.getElementById('appProductSuggestions');
    if (list) list.style.display = 'none';
  }

  removeProductChip(productId) {
    this._selectedProductIds.delete(productId);
    this._renderProductChips();
  }

  _renderProductChips() {
    const container = document.getElementById('appProductChips');
    if (!container) return;
    const selected = this.products.filter(p => this._selectedProductIds.has(p.id));
    container.innerHTML = selected.map(p =>
      `<span class="chip">${esc(p.name_cz)}
        <button type="button" class="chip-remove" onmousedown="admin.apps.removeProductChip(${p.id})">&times;</button>
      </span>`
    ).join('');
  }

  // ─── Save / Toggle / Delete ─────────────────────────────────────────────────

  async saveItem() {
    // Sync contenteditable → textarea before reading values
    window.syncEditorToHtml?.('appContentCz');
    window.syncEditorToHtml?.('appContentEn');

    const name_cz = document.getElementById('appNameCz').value.trim();
    if (!name_cz) {
      window.admin?.showNotification('Název CZ je povinný', 'error');
      return;
    }

    const groupVal = document.getElementById('appGroupId').value;
    const data = {
      name_cz,
      name_en:       document.getElementById('appNameEn').value.trim()      || null,
      slug:          document.getElementById('appSlug').value.trim()        || null,
      group_id:      groupVal ? Number(groupVal) : null,
      content_cz:    document.getElementById('appContentCz').value.trim()   || null,
      content_en:    document.getElementById('appContentEn').value.trim()   || null,
      cover_image:   document.getElementById('appCoverImage').value.trim()  || null,
      cover_caption: document.getElementById('appCoverCaption').value.trim() || null,
      cover_align:   document.getElementById('appCoverAlign').value         || 'center',
      thumbnail_url: document.getElementById('appThumbnailUrl').value.trim() || null,
      is_featured:   document.getElementById('appFeatured').checked ? 1 : 0,
      is_published:  document.getElementById('appPublished').checked ? 1 : 0,
      display_order: Number(document.getElementById('appOrder').value)      || 0,
      product_ids:   [...this._selectedProductIds],
    };

    const isEdit = !!this._editing;
    const url    = isEdit ? `/api/applications/admin/${this._editing.id}` : '/api/applications/admin';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method,
        headers: this.auth.getAuthHeaders(),
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
      window.admin?.showNotification(isEdit ? 'Aplikace upravena' : 'Aplikace přidána', 'success');
    } catch (err) {
      console.error('Applications save error:', err);
      window.admin?.showNotification('Chyba ukládání: ' + err.message, 'error');
    }
  }

  async togglePublish(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;

    try {
      const response = await fetch(`/api/applications/admin/${id}`, {
        method: 'PUT',
        headers: this.auth.getAuthHeaders(),
        body: JSON.stringify({
          name_cz:       item.name_cz,
          name_en:       item.name_en,
          slug:          item.slug,
          group_id:      item.group_id,
          content_cz:    item.content_cz,
          content_en:    item.content_en,
          cover_image:   item.cover_image,
          cover_caption: item.cover_caption,
          cover_align:   item.cover_align,
          thumbnail_url: item.thumbnail_url,
          is_featured:   item.is_featured,
          is_published:  item.is_published ? 0 : 1,
          display_order: item.display_order,
          seo_title_cz:  item.seo_title_cz,
          seo_title_en:  item.seo_title_en,
          product_ids:   (item.products || []).map(p => p.id),
        })
      });
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json')
          ? await response.json()
          : { error: await response.text() };
        throw new Error(err.error || 'Request failed');
      }
      await this.loadItems();
      window.admin?.showNotification(item.is_published ? 'Aplikace skryta' : 'Aplikace publikována', 'success');
    } catch (err) {
      console.error('Applications toggle publish error:', err);
      window.admin?.showNotification('Chyba změny stavu: ' + err.message, 'error');
    }
  }

  async deleteItem(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    if (!confirm(`Smazat aplikaci "${item.name_cz}"?`)) return;

    try {
      const response = await fetch(`/api/applications/admin/${id}`, {
        method: 'DELETE',
        headers: this.auth.getAuthHeaders()
      });
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json')
          ? await response.json()
          : { error: await response.text() };
        throw new Error(err.error || 'Request failed');
      }
      await this.loadItems();
      window.admin?.showNotification('Aplikace smazána', 'success');
    } catch (err) {
      console.error('Applications delete error:', err);
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
