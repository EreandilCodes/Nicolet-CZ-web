/**
 * ProductCategoriesManager – CRUD for product categories.
 * Admin Manager Pattern.
 */
export class ProductCategoriesManager {
constructor(auth) {
    this.auth = auth;
    this.items = [];
    this._editing = null;
    this._saving = false;
  }

  async init() {
    await this.loadItems();
    this._bindButtons();
  }

  _bindButtons() {
    const btn = document.getElementById('btnAddProductCategory');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => this.showModal());
    }
  }

  async loadItems() {
    try {
      const response = await fetch('/api/product-categories/admin/all', {
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
      console.error('ProductCategories load error:', err);
      window.admin?.showNotification('Chyba načítání kategorií: ' + err.message, 'error');
    }
  }

  renderItems() {
    const tbody = document.getElementById('productCategoriesTableBody');
    if (!tbody) return;

    if (!this.items.length) {
      tbody.innerHTML = `<tr><td colspan="7">
        <div class="table-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>
            <path d="M16 3H8a2 2 0 0 0-2 2v2h12V5a2 2 0 0 0-2-2z"/>
          </svg>
          <p>Žádné kategorie. Přidejte první.</p>
        </div>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = this.items.map((item, idx) => {
      const parent = item.parent_id ? this.items.find(c => c.id === item.parent_id) : null;
      const isFirst = idx === 0;
      const isLast  = idx === this.items.length - 1;
      return `<tr>
        <td class="col-id">${item.id}</td>
        <td>
          <div class="table-title">${esc(item.name_cz || '–')}</div>
          <div class="table-sub">${esc(item.name_en || '')}</div>
        </td>
        <td>${esc(parent?.name_cz || '–')}</td>
        <td><code style="font-size:12px;">${esc(item.slug || '–')}</code></td>
        <td class="col-order">
          <div style="display:flex;flex-direction:column;align-items:center;gap:1px;">
            <button class="btn btn-ghost btn-icon" style="padding:2px;height:20px;" title="Nahoru"
              ${isFirst ? 'disabled' : ''} onclick="admin.prodCats.moveItem(${item.id}, -1)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                <polyline points="18 15 12 9 6 15"/>
              </svg>
            </button>
            <span style="font-size:11px;line-height:1;">${item.display_order ?? 0}</span>
            <button class="btn btn-ghost btn-icon" style="padding:2px;height:20px;" title="Dolů"
              ${isLast ? 'disabled' : ''} onclick="admin.prodCats.moveItem(${item.id}, 1)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
          </div>
        </td>
        <td class="col-status">
          <span class="badge ${item.is_active ? 'badge-success' : 'badge-neutral'}">
            ${item.is_active ? 'Aktivní' : 'Skryto'}
          </span>
        </td>
        <td class="col-actions">
          <div class="table-actions">
            <button class="btn btn-ghost btn-icon" title="Upravit" onclick="admin.prodCats.showModal(${item.id})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn btn-danger btn-icon" title="Smazat" onclick="admin.prodCats.deleteItem(${item.id})">
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

    document.getElementById('pcatModalTitle').textContent = item ? 'Upravit kategorii' : 'Přidat kategorii';

    document.getElementById('pcatNameCz').value   = item?.name_cz       || '';
    document.getElementById('pcatNameEn').value   = item?.name_en       || '';
    document.getElementById('pcatSlug').value     = item?.slug          || '';
    document.getElementById('pcatOrder').value    = item?.display_order ?? 0;
    document.getElementById('pcatActive').checked = item ? !!item.is_active : true;

    // Populate parent select
    const parentSelect = document.getElementById('pcatParentId');
    parentSelect.innerHTML = '<option value="">— Žádná nadřazená —</option>';
    this.items
      .filter(c => c.id !== id)
      .forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name_cz;
        if (item?.parent_id === c.id) opt.selected = true;
        parentSelect.appendChild(opt);
      });

    document.getElementById('pcatModal').classList.remove('hidden');

    const nameInput = document.getElementById('pcatNameCz');
    const slugInput = document.getElementById('pcatSlug');
    let slugManuallyEdited = !!item;
    if (!item) {
      slugInput.addEventListener('input', () => { slugManuallyEdited = true; });
      nameInput.addEventListener('input', () => {
        if (!slugManuallyEdited && nameInput.value) {
          slugInput.value = this._generateSlug(nameInput.value);
        }
      });
    }

    const form = document.getElementById('pcatForm');
    if (!form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveItem();
      });
    }
  }

  closeModal() {
    document.getElementById('pcatModal').classList.add('hidden');
    this._editing = null;
  }

async saveItem() {
    if (this._saving) return;
    this._saving = true;

    const name_cz = document.getElementById('pcatNameCz').value.trim();
    if (!name_cz) {
      window.admin?.showNotification('Název CZ je povinný', 'error');
      this._saving = false;
      return;
    }

    const parentVal = document.getElementById('pcatParentId').value;
    const data = {
      name_cz,
      name_en: document.getElementById('pcatNameEn').value.trim() || null,
      slug: document.getElementById('pcatSlug').value.trim() || null,
      parent_id: parentVal ? Number(parentVal) : null,
      display_order: Number(document.getElementById('pcatOrder').value) || 0,
      is_active: document.getElementById('pcatActive').checked ? 1 : 0,
    };

    const isEdit = !!this._editing;
    const url = isEdit ? `/api/product-categories/admin/${this._editing.id}` : '/api/product-categories/admin';
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
      window.admin?.showNotification(isEdit ? 'Kategorie upravena' : 'Kategorie přidána', 'success');
    } catch (err) {
      console.error('ProductCategories save error:', err);
      window.admin?.showNotification('Chyba ukládání: ' + err.message, 'error');
    } finally {
this._saving = false;
    }
  }

  async moveItem(id, direction) {
    const idx = this.items.findIndex(i => i.id === id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= this.items.length) return;

    const a = this.items[idx];
    const b = this.items[swapIdx];

    // Swap display_order values
    const orderA = a.display_order ?? idx;
    const orderB = b.display_order ?? swapIdx;

    try {
      await Promise.all([
        fetch(`/api/product-categories/admin/${a.id}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name_cz: a.name_cz, name_en: a.name_en, slug: a.slug,
            parent_id: a.parent_id, display_order: orderB, is_active: a.is_active })
        }),
        fetch(`/api/product-categories/admin/${b.id}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name_cz: b.name_cz, name_en: b.name_en, slug: b.slug,
            parent_id: b.parent_id, display_order: orderA, is_active: b.is_active })
        }),
      ]);
      await this.loadItems();
    } catch (err) {
      console.error('ProductCategories move error:', err);
      window.admin?.showNotification('Chyba změny pořadí: ' + err.message, 'error');
    }
  }

  async deleteItem(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    if (!confirm(`Smazat kategorii "${item.name_cz}"?`)) return;

    try {
      const response = await fetch(`/api/product-categories/admin/${id}`, {
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
      window.admin?.showNotification('Kategorie smazána', 'success');
    } catch (err) {
      console.error('ProductCategories delete error:', err);
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
