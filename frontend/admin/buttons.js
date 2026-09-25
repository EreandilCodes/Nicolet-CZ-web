/**
 * ButtonsManager – CRUD for reusable CTA buttons.
 * Admin Manager Pattern.
 */
export class ButtonsManager {
constructor(auth) {
    this.auth = auth;
    this.items = [];
    this._editing = null;
    this._forms = []; // for form selector dropdown
    this._defaultSettings = {};
    this._saving = false;
  }

  async init() {
    await Promise.all([this.loadItems(), this._loadForms()]);
    this._bindButtons();
    await this._loadAndRenderDefaultButtons();
  }

  async _loadForms() {
    try {
      const response = await fetch('/api/forms/admin/all', {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });
      const contentType = response.headers.get('content-type');
      if (!response.ok) return;
      if (!contentType?.includes('application/json')) return;
      this._forms = await response.json();
    } catch { this._forms = []; }
  }

  _bindButtons() {
    const btn = document.getElementById('btnAddButton');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => this.showModal());
    }

    // React to link_type change
    const linkTypeEl = document.getElementById('btnLinkType');
    if (linkTypeEl && !linkTypeEl.dataset.bound) {
      linkTypeEl.dataset.bound = '1';
      linkTypeEl.addEventListener('change', () => this._toggleLinkValueUI(linkTypeEl.value));
    }
  }

  _toggleLinkValueUI(linkType) {
    const inputWrap  = document.getElementById('btnLinkValueWrap');
    const selectWrap = document.getElementById('btnFormSelectWrap');
    if (!inputWrap || !selectWrap) return;

    if (linkType === 'form') {
      inputWrap.style.display  = 'none';
      selectWrap.style.display = '';
      // Populate form select if empty
      const sel = document.getElementById('btnFormSelect');
      if (sel && !sel.children.length) {
        sel.innerHTML = `<option value="">– Vyberte formulář –</option>` +
          this._forms.map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join('');
      }
    } else {
      inputWrap.style.display  = '';
      selectWrap.style.display = 'none';
    }
  }

  async loadItems() {
    try {
      const response = await fetch('/api/buttons/admin/all', {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
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
      console.error('Buttons load error:', err);
      window.admin?.showNotification('Chyba načítání tlačítek: ' + err.message, 'error');
    }
  }

  renderItems() {
    const tbody = document.getElementById('buttonsTableBody');
    if (!tbody) return;

    if (!this.items.length) {
      tbody.innerHTML = `<tr><td colspan="6">
        <div class="table-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="1" y="9" width="22" height="6" rx="3"/>
          </svg>
          <p>Žádná tlačítka. Přidejte první.</p>
        </div>
      </td></tr>`;
      return;
    }

    const linkTypeLabels = { form: 'Formulář', internal: 'Interní', external: 'Externí' };
    const styleLabels    = { primary: 'Primární', secondary: 'Sekundární', outline: 'Outline' };

    tbody.innerHTML = this.items.map(item => {
      // If link_type=form, show form name instead of raw ID
      let linkValueDisplay = esc(item.link_value || '–');
      if (item.link_type === 'form' && item.link_value) {
        const form = this._forms.find(f => String(f.id) === String(item.link_value));
        linkValueDisplay = form ? esc(form.name) : `Formulář #${item.link_value}`;
      }
      return `<tr>
        <td class="col-id">${item.id}</td>
        <td>
          <div class="table-title">${esc(item.label_cz || '–')}</div>
          <div class="table-sub">${esc(item.label_en || '')}</div>
        </td>
        <td class="col-status">
          <span class="badge badge-neutral">${esc(linkTypeLabels[item.link_type] || item.link_type || '–')}</span>
        </td>
        <td style="font-size:12px;color:var(--text-2);">${linkValueDisplay}</td>
        <td class="col-status">
          <span class="badge badge-neutral">${esc(styleLabels[item.style] || item.style || '–')}</span>
        </td>
        <td class="col-status">
          <span class="badge ${item.is_active ? 'badge-success' : 'badge-neutral'}">
            ${item.is_active ? 'Aktivní' : 'Skryto'}
          </span>
        </td>
        <td class="col-actions">
          <div class="table-actions">
            <button class="btn btn-ghost btn-icon" title="Upravit" onclick="admin.buttons.showModal(${item.id})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn btn-danger btn-icon" title="Smazat" onclick="admin.buttons.deleteItem(${item.id})">
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

  showModal(id = null) {
    const item = id ? this.items.find(i => i.id === id) : null;
    this._editing = item;

    document.getElementById('btnModalTitle').textContent = item ? 'Upravit tlačítko' : 'Přidat tlačítko';

    document.getElementById('btnLabelCz').value    = item?.label_cz   || '';
    document.getElementById('btnLabelEn').value    = item?.label_en   || '';
    document.getElementById('btnLinkType').value   = item?.link_type  || 'internal';
    document.getElementById('btnLinkValue').value  = item?.link_value || '';
    document.getElementById('btnStyle').value      = item?.style      || 'primary';
    document.getElementById('btnActive').checked   = item?.is_active  ?? true;

    // Setup form select
    const sel = document.getElementById('btnFormSelect');
    if (sel) {
      sel.innerHTML = `<option value="">– Vyberte formulář –</option>` +
        this._forms.map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join('');
      if (item?.link_type === 'form' && item?.link_value) {
        sel.value = item.link_value;
      }
    }

    // Show/hide correct UI for link_type
    this._toggleLinkValueUI(item?.link_type || 'internal');

    document.getElementById('buttonsModal').classList.remove('hidden');

    const form = document.getElementById('buttonsForm');
    if (!form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveItem();
      });
    }

    // Bind link type change
    const linkTypeEl = document.getElementById('btnLinkType');
    if (linkTypeEl && !linkTypeEl.dataset.changeBound) {
      linkTypeEl.dataset.changeBound = '1';
      linkTypeEl.addEventListener('change', () => this._toggleLinkValueUI(linkTypeEl.value));
    }
  }

  closeModal() {
    document.getElementById('buttonsModal').classList.add('hidden');
    this._editing = null;
  }

async saveItem() {
    if (this._saving) return;
    this._saving = true;

    const label_cz = document.getElementById('btnLabelCz').value.trim();
    if (!label_cz) {
      window.admin?.showNotification('Popis CZ je povinný', 'error');
      this._saving = false;
      return;
    }

    const linkType = document.getElementById('btnLinkType').value || 'internal';
    let linkValue;
    if (linkType === 'form') {
      linkValue = document.getElementById('btnFormSelect')?.value || null;
    } else {
      linkValue = document.getElementById('btnLinkValue').value.trim() || null;
    }

    const data = {
      label_cz,
      label_en: document.getElementById('btnLabelEn').value.trim() || null,
      link_type: linkType,
      link_value: linkValue,
      style: document.getElementById('btnStyle').value || 'primary',
      is_active: document.getElementById('btnActive').checked ? 1 : 0,
    };

    const isEdit = !!this._editing;
    const url = isEdit ? `/api/buttons/admin/${this._editing.id}` : '/api/buttons/admin';
    const method = isEdit ? 'PUT' : 'POST';

    try {
    const response = await fetch(url, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
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
      window.admin?.showNotification(isEdit ? 'Tlačítko upraveno' : 'Tlačítko přidáno', 'success');
    } catch (err) {
      console.error('Buttons save error:', err);
      window.admin?.showNotification('Chyba ukládání: ' + err.message, 'error');
    } finally {
this._saving = false;
    }
  }

  async _loadAndRenderDefaultButtons() {
    try {
      const response = await fetch('/api/settings', {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });
      const contentType = response.headers.get('content-type');
      if (!response.ok || !contentType?.includes('application/json')) return;
      this._defaultSettings = await response.json();
    } catch { this._defaultSettings = {}; }
    this._renderDefaultButtonSelects();
  }

  _renderDefaultButtonSelects() {
    const opts = `<option value="">– Žádné –</option>` +
      this.items.map(b => `<option value="${b.id}">${esc(b.label_cz)}${b.label_en ? ' / ' + esc(b.label_en) : ''}</option>`).join('');

    const selNews      = document.getElementById('defaultBtnNews');
    const selProducts  = document.getElementById('defaultBtnProducts');
    const selTrainings = document.getElementById('defaultBtnTrainings');

    if (selNews)      { selNews.innerHTML      = opts; selNews.value      = this._defaultSettings.news_default_button_id      || ''; }
    if (selProducts)  { selProducts.innerHTML  = opts; selProducts.value  = this._defaultSettings.product_default_button_id   || ''; }
    if (selTrainings) { selTrainings.innerHTML = opts; selTrainings.value = this._defaultSettings.training_default_button_id  || ''; }
  }

  async saveDefaultButtons() {
    const data = {
      news_default_button_id:     document.getElementById('defaultBtnNews')?.value      || '',
      product_default_button_id:  document.getElementById('defaultBtnProducts')?.value  || '',
      training_default_button_id: document.getElementById('defaultBtnTrainings')?.value || '',
    };

    try {
      const response = await fetch('/api/settings', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json')
          ? await response.json()
          : { error: await response.text() };
        throw new Error(err.error || 'Request failed');
      }
      // Reload from server to confirm what was actually persisted
      await this._loadAndRenderDefaultButtons();
      window.admin?.showNotification('Defaultní tlačítka uložena', 'success');
    } catch (err) {
      console.error('Default buttons save error:', err);
      window.admin?.showNotification('Chyba ukládání: ' + err.message, 'error');
    }
  }

  async deleteItem(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    if (!confirm(`Smazat tlačítko "${item.label_cz}"?`)) return;

    try {
      const response = await fetch(`/api/buttons/admin/${id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json')
          ? await response.json()
          : { error: await response.text() };
        throw new Error(err.error || 'Request failed');
      }
      await this.loadItems();
      window.admin?.showNotification('Tlačítko smazáno', 'success');
    } catch (err) {
      console.error('Buttons delete error:', err);
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
