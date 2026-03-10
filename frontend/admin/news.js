/**
 * NewsManager – CRUD for news posts.
 * Admin Manager Pattern.
 */
export class NewsManager {
  constructor(auth) {
    this.auth       = auth;
    this.items      = [];
    this.categories = [];
    this._editing   = null;
    this._selected  = new Set();
  }

  async init() {
    await this.loadCategories();
    await this.loadItems();
    this._bindButtons();
    this._bindSelection();
  }

  _bindSelection() {
    const selectAll = document.getElementById('newsSelectAll');
    if (selectAll && !selectAll.dataset.bound) {
      selectAll.dataset.bound = '1';
      selectAll.addEventListener('change', (e) => {
        this._selectAll(e.target.checked);
      });
    }
  }

  _selectAll(checked) {
    this._selected.clear();
    if (checked) {
      this.items.forEach(item => this._selected.add(item.id));
    }
    this._renderCheckboxes();
    this._updateDeleteButton();
  }

  _renderCheckboxes() {
    const checkboxes = document.querySelectorAll('.news-row-checkbox');
    checkboxes.forEach(cb => {
      cb.checked = this._selected.has(Number(cb.value));
    });
    const selectAll = document.getElementById('newsSelectAll');
    if (selectAll) {
      selectAll.checked = this._selected.size === this.items.length && this.items.length > 0;
      selectAll.indeterminate = this._selected.size > 0 && this._selected.size < this.items.length;
    }
  }

  _toggleSelection(id, checked) {
    if (checked) {
      this._selected.add(id);
    } else {
      this._selected.delete(id);
    }
    this._updateDeleteButton();
    this._renderCheckboxes();
  }

  _updateDeleteButton() {
    const btn = document.getElementById('btnDeleteSelectedNews');
    if (btn) {
      btn.disabled = this._selected.size === 0;
    }
  }

  async deleteSelected() {
    if (this._selected.size === 0) return;
    const count = this._selected.size;
    if (!confirm(`Smazat ${count} novink${count === 1 ? 'u' : count < 5 ? 'y' : ''}?`)) return;

    const ids = Array.from(this._selected);
    let deleted = 0;
    let errors = [];

    for (const id of ids) {
      try {
        const response = await fetch(`/api/news/admin/${id}`, {
          method: 'DELETE',
          headers: this.auth.getAuthHeaders()
        });
        const contentType = response.headers.get('content-type');
        if (!response.ok) {
          const err = contentType?.includes('application/json')
            ? await response.json()
            : { error: await response.text() };
          errors.push(err.error || `ID ${id}: Chyba`);
        } else {
          deleted++;
        }
      } catch (err) {
        errors.push(`ID ${id}: ${err.message}`);
      }
    }

    this._selected.clear();
    this._updateDeleteButton();
    await this.loadItems();

    if (errors.length > 0) {
      window.admin?.showNotification(`Smazáno ${deleted}, chyby: ${errors.join(', ')}`, 'warning');
    } else {
      window.admin?.showNotification(`${deleted} novink${deleted === 1 ? 'a' : deleted < 5 ? 'y' : ''} smazána`, 'success');
    }
  }

  async loadCategories() {
    try {
      const response = await fetch('/api/news-categories/admin/all', {
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
      this.categories = await response.json();
    } catch (err) {
      console.error('News: categories load error:', err);
    }
  }

  _bindButtons() {
    const btn = document.getElementById('btnAddNews');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => this.showModal());
    }
    const btnDelete = document.getElementById('btnDeleteSelectedNews');
    if (btnDelete && !btnDelete.dataset.bound) {
      btnDelete.dataset.bound = '1';
      btnDelete.addEventListener('click', () => this.deleteSelected());
    }
  }

  async loadItems() {
    try {
      const response = await fetch('/api/news/admin/all', {
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
      console.error('News load error:', err);
      window.admin?.showNotification('Chyba načítání novinek: ' + err.message, 'error');
    }
  }

  renderItems() {
    const tbody = document.getElementById('newsTableBody');
    if (!tbody) return;

    this._selected.clear();
    this._updateDeleteButton();

    if (!this.items.length) {
      tbody.innerHTML = `<tr><td colspan="7">
        <div class="table-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Z"/>
          </svg>
          <p>Žádné novinky. Přidejte první.</p>
        </div>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = this.items.map(item => {
      const date = item.created_at ? new Date(item.created_at).toLocaleDateString('cs-CZ') : '–';
      return `<tr>
        <td class="col-checkbox">
          <input type="checkbox" class="news-row-checkbox" value="${item.id}" onchange="admin.news._toggleSelection(${item.id}, this.checked)">
        </td>
        <td class="col-id">${item.id}</td>
        <td>
          <div class="table-title">${esc(item.title_cz || '–')}</div>
          <div class="table-sub">${esc(item.title_en || '')}</div>
        </td>
        <td><code style="font-size:12px;">${esc(item.slug || '–')}</code></td>
        <td class="col-status">
          <span class="badge ${item.is_published ? 'badge-success' : 'badge-neutral'}">
            ${item.is_published ? 'Publikováno' : 'Skryta'}
          </span>
        </td>
        <td>${date}</td>
        <td class="col-actions">
          <div class="table-actions">
            <button class="btn btn-ghost btn-icon" title="Upravit" onclick="admin.news.showModal(${item.id})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn ${item.is_published ? 'btn-secondary' : 'btn-ghost'} btn-icon" title="${item.is_published ? 'Skrýt' : 'Publikovat'}" onclick="admin.news.togglePublish(${item.id})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
            <button class="btn btn-danger btn-icon" title="Smazat" onclick="admin.news.deleteItem(${item.id})">
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

    const selectAll = document.getElementById('newsSelectAll');
    if (selectAll) selectAll.checked = false;
  }

  showModal(id = null) {
    const item = id ? this.items.find(i => i.id === id) : null;
    this._editing = item;

    document.getElementById('newsModalTitle').textContent = item ? 'Upravit novinku' : 'Přidat novinku';

    document.getElementById('newsSlug').value         = item?.slug         || '';
    document.getElementById('newsTitleCz').value      = item?.title_cz     || '';
    document.getElementById('newsTitleEn').value      = item?.title_en     || '';
    document.getElementById('newsContentCz').value    = item?.content_cz   || '';
    document.getElementById('newsContentEn').value    = item?.content_en   || '';
    document.getElementById('newsCoverImage').value   = item?.cover_image   || '';
    document.getElementById('newsCoverCaption').value = item?.cover_caption || '';
    document.getElementById('newsCoverAlign').value   = item?.cover_align   || 'center';
    document.getElementById('newsSeoTitleCz').value   = item?.seo_title_cz  || '';
    // Update cover preview
    const coverPreview = document.getElementById('newsCoverPreview');
    if (coverPreview) {
      const imgUrl = item?.cover_image || '';
      coverPreview.src = imgUrl;
      coverPreview.style.display = imgUrl ? '' : 'none';
    }
    document.getElementById('newsSeoTitleEn').value   = item?.seo_title_en || '';
    document.getElementById('newsSeoDescCz').value    = item?.seo_desc_cz  || '';
    document.getElementById('newsSeoDescEn').value    = item?.seo_desc_en  || '';
    document.getElementById('newsPublished').checked  = item?.is_published ?? false;

    // Populate category select
    const catSelect = document.getElementById('newsCategoryId');
    if (catSelect) {
      catSelect.innerHTML = '<option value="">— Bez kategorie —</option>';
      this.categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name_cz;
        if (item?.category_id === cat.id) opt.selected = true;
        catSelect.appendChild(opt);
      });
    }

    document.getElementById('newsModal').classList.remove('hidden');

    // Reset to CZ tab, init both editors
    window.resetNewsLangTabs?.();
    window.initEditorView?.('newsContentCz');
    window.initEditorView?.('newsContentEn');

    const form = document.getElementById('newsForm');
    if (!form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveItem();
      });
    }
  }

  closeModal() {
    document.getElementById('newsModal').classList.add('hidden');
    this._editing = null;
  }

  async saveItem() {
    // Sync contenteditable → textarea before reading values
    window.syncEditorToHtml?.('newsContentCz');
    window.syncEditorToHtml?.('newsContentEn');

    const title_cz = document.getElementById('newsTitleCz').value.trim();
    if (!title_cz) {
      window.admin?.showNotification('Název CZ je povinný', 'error');
      return;
    }

    const catVal = document.getElementById('newsCategoryId')?.value;
    const data = {
      slug:         document.getElementById('newsSlug').value.trim()       || null,
      title_cz,
      title_en:     document.getElementById('newsTitleEn').value.trim()    || null,
      content_cz:   document.getElementById('newsContentCz').value.trim()  || null,
      content_en:   document.getElementById('newsContentEn').value.trim()  || null,
      cover_image:   document.getElementById('newsCoverImage').value.trim()   || null,
      cover_caption: document.getElementById('newsCoverCaption').value.trim() || null,
      cover_align:   document.getElementById('newsCoverAlign').value          || 'center',
      category_id:   catVal ? Number(catVal) : null,
      seo_title_cz: document.getElementById('newsSeoTitleCz').value.trim() || null,
      seo_title_en: document.getElementById('newsSeoTitleEn').value.trim() || null,
      seo_desc_cz:  document.getElementById('newsSeoDescCz').value.trim()  || null,
      seo_desc_en:  document.getElementById('newsSeoDescEn').value.trim()  || null,
      is_published: document.getElementById('newsPublished').checked ? 1 : 0,
    };

    const isEdit = !!this._editing;
    const url    = isEdit ? `/api/news/admin/${this._editing.id}` : '/api/news/admin';
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
      window.admin?.showNotification(isEdit ? 'Novinka upravena' : 'Novinka přidána', 'success');
    } catch (err) {
      console.error('News save error:', err);
      window.admin?.showNotification('Chyba ukládání: ' + err.message, 'error');
    }
  }

  async togglePublish(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;

    try {
      const response = await fetch(`/api/news/admin/${id}/publish`, {
        method: 'PUT',
        headers: this.auth.getAuthHeaders(),
        body: JSON.stringify({ is_published: item.is_published ? 0 : 1 })
      });
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json')
          ? await response.json()
          : { error: await response.text() };
        throw new Error(err.error || 'Request failed');
      }
      await this.loadItems();
      window.admin?.showNotification(item.is_published ? 'Novinka skryta' : 'Novinka publikována', 'success');
    } catch (err) {
      console.error('News toggle publish error:', err);
      window.admin?.showNotification('Chyba změny stavu: ' + err.message, 'error');
    }
  }

  async deleteItem(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    if (!confirm(`Smazat novinku "${item.title_cz}"?`)) return;

    try {
      const response = await fetch(`/api/news/admin/${id}`, {
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
      window.admin?.showNotification('Novinka smazána', 'success');
    } catch (err) {
      console.error('News delete error:', err);
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
