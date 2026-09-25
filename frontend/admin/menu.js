/**
 * MenuManager – CRUD for menu items with hierarchy, ordering, entity pickers.
 * Admin Manager Pattern.
 */
export class MenuManager {
constructor(auth) {
    this.auth = auth;
    this.items = [];
    this._editing = null;
    this._pages = [];
    this._products = [];
    this._apps = [];
    this._cats = [];
    this._newsCats = [];
    this._appGroups = [];
    this._saving = false;
  }

  async init() {
    await Promise.all([this.loadItems(), this._loadEntities()]);
    this._bindButtons();
  }

  _bindButtons() {
    const btn = document.getElementById('btnAddMenuItem');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => this.showModal());
    }
    const restoreBtn = document.getElementById('btnRestoreMenuDefaults');
    if (restoreBtn && !restoreBtn.dataset.bound) {
      restoreBtn.dataset.bound = '1';
      restoreBtn.addEventListener('click', () => this.restoreDefaults());
    }
  }

  async _loadEntities() {
    const headers = { 'Content-Type': 'application/json' };
    const safeLoad = async (url) => {
    try {
      const r = await fetch(url, { credentials: 'include', headers });
        const ct = r.headers.get('content-type');
        if (!r.ok) return [];
        if (!ct?.includes('application/json')) return [];
        return r.json();
      } catch { return []; }
    };
    [this._pages, this._products, this._apps, this._cats, this._newsCats, this._appGroups] = await Promise.all([
      safeLoad('/api/pages/admin/all'),
      safeLoad('/api/products/admin/all'),
      safeLoad('/api/applications/admin/all'),
      safeLoad('/api/product-categories/admin/all'),
      safeLoad('/api/news-categories/admin/all'),
      safeLoad('/api/application-groups/admin/all'),
    ]);
  }

  async loadItems() {
    try {
      const response = await fetch('/api/menu/admin/all', {
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
      console.error('Menu load error:', err);
      window.admin?.showNotification('Chyba načítání menu: ' + err.message, 'error');
    }
  }

  _buildHierarchy() {
    const roots    = this.items.filter(i => !i.parent_id).sort((a, b) => a.display_order - b.display_order);
    const children = this.items.filter(i =>  i.parent_id);
    const result   = [];

    roots.forEach(root => {
      result.push({ item: root, depth: 0 });
      children
        .filter(c => c.parent_id === root.id)
        .sort((a, b) => a.display_order - b.display_order)
        .forEach(child => result.push({ item: child, depth: 1 }));
    });

    return result;
  }

  renderItems() {
    const tbody = document.getElementById('menuTableBody');
    if (!tbody) return;

    if (!this.items.length) {
      tbody.innerHTML = `<tr><td colspan="8">
        <div class="table-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
          <p>Žádné položky menu. Přidejte první nebo obnovte výchozí.</p>
        </div>
      </td></tr>`;
      return;
    }

    const linkTypeLabels = {
      internal:    'Interní',
      page:        'Stránka',
      product:     'Produkt',
      application: 'Aplikace',
      category:    'Kategorie',
      external:    'Externí',
    };
    const hierarchy = this._buildHierarchy();

    tbody.innerHTML = hierarchy.map(({ item, depth }) => {
      const indent = depth > 0
        ? `<span style="display:inline-block;width:${depth * 20}px;"></span><span style="color:#9ca3af;">└ </span>`
        : '';
      return `<tr>
        <td class="col-id">${item.id}</td>
        <td>
          ${indent}<span class="table-title">${esc(item.label_cz || '–')}</span>
          ${item.label_en ? `<div class="table-sub" style="padding-left:${depth ? depth * 20 + 16 : 0}px;">${esc(item.label_en)}</div>` : ''}
        </td>
        <td>
          <span class="badge badge-neutral">${esc(linkTypeLabels[item.link_type] || item.link_type || '–')}</span>
        </td>
        <td style="font-size:12px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${esc(item.link_value || '–')}
        </td>
        <td class="col-status">
          <span class="badge ${item.is_active ? 'badge-success' : 'badge-neutral'}">
            ${item.is_active ? 'Aktivní' : 'Skryto'}
          </span>
        </td>
        <td class="col-actions">
          <div class="table-actions">
            <button class="btn btn-ghost btn-icon" title="Nahoru" onclick="admin.menu.moveItem(${item.id}, 'up')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
            </button>
            <button class="btn btn-ghost btn-icon" title="Dolů" onclick="admin.menu.moveItem(${item.id}, 'down')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            ${depth === 0 ? `<button class="btn btn-ghost btn-icon" title="Přidat podpoložku" onclick="admin.menu.showModal(null,${item.id})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>` : ''}
            <button class="btn btn-ghost btn-icon" title="Upravit" onclick="admin.menu.showModal(${item.id})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn btn-danger btn-icon" title="Smazat" onclick="admin.menu.deleteItem(${item.id})">
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

  // parentIdPreset: pass when clicking "Add child" button on a row
  showModal(id = null, parentIdPreset = null) {
    const item = id ? this.items.find(i => i.id === id) : null;
    this._editing = item;

    document.getElementById('menuModalTitle').textContent = item ? 'Upravit položku menu' : 'Přidat položku menu';

    document.getElementById('menuLabelCz').value   = item?.label_cz    || '';
    document.getElementById('menuLabelEn').value   = item?.label_en    || '';
    document.getElementById('menuLinkType').value  = item?.link_type   || 'internal';
    document.getElementById('menuLinkValue').value = item?.link_value  || '';
    document.getElementById('menuOrder').value     = item?.display_order ?? 0;
    document.getElementById('menuActive').checked  = item?.is_active   ?? true;

    // Parent select – only root items can be parents
    const parentSelect = document.getElementById('menuParentId');
    parentSelect.innerHTML = '<option value="">— Žádný (kořenová položka) —</option>';
    this.items
      .filter(i => !i.parent_id && i.id !== id)
      .forEach(i => {
        const opt = document.createElement('option');
        opt.value = i.id;
        opt.textContent = i.label_cz;
        // Pre-select parent if: editing with existing parent, OR "add child" shortcut
        const activeParent = item ? item.parent_id : parentIdPreset;
        if (activeParent === i.id) opt.selected = true;
        parentSelect.appendChild(opt);
      });

    // Update entity picker for current link type
    this._updateEntityPicker(item?.link_type || 'internal', item?.link_value || '');

    document.getElementById('menuModal').classList.remove('hidden');

    const form = document.getElementById('menuForm');
    if (!form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveItem();
      });
    }

    // Bind link type change
    const linkTypeEl = document.getElementById('menuLinkType');
    linkTypeEl.onchange = () => this._updateEntityPicker(linkTypeEl.value, '');
  }

  _getAllLinkOptions() {
    return [
      ...this._pages.map(p => ({ label: `Stránka: ${p.title_cz || p.slug}`, value: `/stranka/${p.slug}` })),
      ...this._products.map(p => ({ label: `Produkt: ${p.name_cz}`, value: `/produkty/${p.slug}` })),
      ...this._apps.map(a => ({ label: `Aplikace: ${a.name_cz}`, value: `/aplikace/${a.slug}` })),
      ...this._cats.map(c => ({ label: `Kategorie: ${c.name_cz}`, value: `/produkty?kategorie=${c.slug}` })),
      ...this._newsCats.map(c => ({ label: `Rubrika: ${c.name_cz}`, value: `/novinky?rubrika=${c.slug}` })),
      ...this._appGroups.map(g => ({ label: `Okruh aplikací: ${g.name_cz}`, value: `/aplikace?okruh=${g.slug}` })),
      { label: 'Novinky', value: '/novinky' },
      { label: 'Produkty', value: '/produkty' },
      { label: 'Aplikace', value: '/aplikace' },
      { label: 'Školení', value: '/skoleni' },
      { label: 'O nás', value: '/stranka/o-nas' },
      { label: 'Kontakt', value: '/stranka/kontakt' },
    ];
  }

  _getOptionsForType(linkType) {
    switch (linkType) {
      case 'page':          return this._pages.map(p => ({ label: p.title_cz || p.slug, value: `/stranka/${p.slug}` }));
      case 'product':       return this._products.map(p => ({ label: p.name_cz, value: `/produkty/${p.slug}` }));
      case 'application':   return this._apps.map(a => ({ label: a.name_cz, value: `/aplikace/${a.slug}` }));
      case 'category':      return this._cats.map(c => ({ label: c.name_cz, value: `/produkty?kategorie=${c.slug}` }));
      case 'news_category': return this._newsCats.map(c => ({ label: c.name_cz, value: `/novinky?rubrika=${c.slug}` }));
      case 'app_group':     return this._appGroups.map(g => ({ label: g.name_cz, value: `/aplikace?okruh=${g.slug}` }));
      default:              return [];
    }
  }

  _updateEntityPicker(linkType, currentValue) {
    const picker = document.getElementById('menuEntityPicker');
    const valueInput = document.getElementById('menuLinkValue');
    const suggestionsEl = document.getElementById('menuLinkSuggestions');
    if (!picker) return;

    const options = this._getOptionsForType(linkType);

    // For entity types, show the select dropdown too
    if (options.length) {
      picker.style.display = '';
      picker.innerHTML = `<option value="">— Vyberte —</option>` +
        options.map(o => `<option value="${esc(o.value)}"${currentValue === o.value ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
      picker.onchange = () => { if (picker.value) valueInput.value = picker.value; };
      if (currentValue) {
        const match = options.find(o => o.value === currentValue);
        if (match) picker.value = currentValue;
      }
    } else {
      picker.style.display = 'none';
    }

    // Bind autocomplete on the text input (all link types)
    if (!valueInput.dataset.acBound) {
      valueInput.dataset.acBound = '1';
      valueInput.addEventListener('input', () => this._showLinkSuggestions(valueInput.value));
      valueInput.addEventListener('blur', () => setTimeout(() => { if (suggestionsEl) suggestionsEl.style.display = 'none'; }, 150));
      valueInput.addEventListener('focus', () => { if (valueInput.value) this._showLinkSuggestions(valueInput.value); });
    }
  }

  _showLinkSuggestions(q) {
    const suggestionsEl = document.getElementById('menuLinkSuggestions');
    const valueInput = document.getElementById('menuLinkValue');
    if (!suggestionsEl || !valueInput) return;

    if (!q.trim()) { suggestionsEl.style.display = 'none'; return; }

    const ql = q.toLowerCase();
    const matches = this._getAllLinkOptions()
      .filter(o => o.label.toLowerCase().includes(ql) || o.value.toLowerCase().includes(ql))
      .slice(0, 8);

    if (!matches.length) { suggestionsEl.style.display = 'none'; return; }

    suggestionsEl.style.display = '';
    suggestionsEl.innerHTML = matches.map(o =>
      `<div class="autocomplete-item" data-value="${esc(o.value)}">${esc(o.label)} <span style="color:#9ca3af;font-size:11px">${esc(o.value)}</span></div>`
    ).join('');

    suggestionsEl.querySelectorAll('.autocomplete-item').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        valueInput.value = el.dataset.value;
        suggestionsEl.style.display = 'none';
      });
    });
  }

  closeModal() {
    document.getElementById('menuModal').classList.add('hidden');
    this._editing = null;
  }

async saveItem() {
    if (this._saving) return;
    this._saving = true;

    const label_cz = document.getElementById('menuLabelCz').value.trim();
    if (!label_cz) {
      window.admin?.showNotification('Popis CZ je povinný', 'error');
      this._saving = false;
      return;
    }

    const parentVal = document.getElementById('menuParentId').value;
    const data = {
      label_cz,
      label_en: document.getElementById('menuLabelEn').value.trim() || null,
      parent_id: parentVal ? Number(parentVal) : null,
      link_type: document.getElementById('menuLinkType').value || 'internal',
      link_value: document.getElementById('menuLinkValue').value.trim() || null,
      display_order: Number(document.getElementById('menuOrder').value) || 0,
      is_active: document.getElementById('menuActive').checked ? 1 : 0,
    };

    const isEdit = !!this._editing;
    const url = isEdit ? `/api/menu/admin/${this._editing.id}` : '/api/menu/admin';
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
      window.admin?.showNotification(isEdit ? 'Položka upravena' : 'Položka přidána', 'success');
    } catch (err) {
      console.error('Menu save error:', err);
      window.admin?.showNotification('Chyba ukládání: ' + err.message, 'error');
    } finally {
this._saving = false;
    }
  }

  async moveItem(id, direction) {
    try {
      const response = await fetch(`/api/menu/admin/${id}/order`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction })
      });
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json')
          ? await response.json()
          : { error: await response.text() };
        throw new Error(err.error || 'Request failed');
      }
      await this.loadItems();
    } catch (err) {
      console.error('Menu move error:', err);
      window.admin?.showNotification('Chyba přesouvání: ' + err.message, 'error');
    }
  }

  async deleteItem(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    if (!confirm(`Smazat položku menu "${item.label_cz}"?`)) return;

    try {
      const response = await fetch(`/api/menu/admin/${id}`, {
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
      window.admin?.showNotification('Položka smazána', 'success');
    } catch (err) {
      console.error('Menu delete error:', err);
      window.admin?.showNotification('Chyba mazání: ' + err.message, 'error');
    }
  }

  async restoreDefaults() {
    if (!confirm('Obnovit výchozí položky menu? Existující položky zůstanou zachovány.')) return;
    try {
      const response = await fetch('/api/menu/admin/seed-defaults', {
      method: 'POST',
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
      const data = await response.json();
      await this.loadItems();
      window.admin?.showNotification(data.message, 'success');
    } catch (err) {
      console.error('Menu restore error:', err);
      window.admin?.showNotification('Chyba obnovy: ' + err.message, 'error');
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
