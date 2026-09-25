/**
 * AppGroupsManager – CRUD for application groups.
 * Admin Manager Pattern.
 */
export class AppGroupsManager {
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
    const btn = document.getElementById('btnAddAppGroup');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => this.showModal());
    }
  }

  async loadItems() {
    try {
const response = await this.auth.authenticatedFetch('/api/application-groups/admin/all');
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
      console.error('AppGroups load error:', err);
      window.admin?.showNotification('Chyba načítání skupin aplikací: ' + err.message, 'error');
    }
  }

  renderItems() {
    const tbody = document.getElementById('appGroupsTableBody');
    if (!tbody) return;

    if (!this.items.length) {
      tbody.innerHTML = `<tr><td colspan="6">
        <div class="table-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          </svg>
          <p>Žádné skupiny aplikací. Přidejte první.</p>
        </div>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = this.items.map(item => {
      return `<tr>
        <td class="col-id">${item.id}</td>
        <td>
          <div class="table-title">${esc(item.name_cz || '–')}</div>
          <div class="table-sub">${esc(item.name_en || '')}</div>
        </td>
        <td><code style="font-size:12px;">${esc(item.slug || '–')}</code></td>
        <td class="col-order">${item.display_order ?? 0}</td>
        <td class="col-status">
          <span class="badge ${item.is_active ? 'badge-success' : 'badge-neutral'}">
            ${item.is_active ? 'Aktivní' : 'Skryto'}
          </span>
        </td>
        <td class="col-actions">
          <div class="table-actions">
            <button class="btn btn-ghost btn-icon" title="Upravit" onclick="admin.appGroups.showModal(${item.id})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn btn-danger btn-icon" title="Smazat" onclick="admin.appGroups.deleteItem(${item.id})">
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

    document.getElementById('agModalTitle').textContent = item ? 'Upravit skupinu' : 'Přidat skupinu';

    document.getElementById('agNameCz').value   = item?.name_cz       || '';
    document.getElementById('agNameEn').value   = item?.name_en       || '';
    document.getElementById('agSlug').value     = item?.slug          || '';
    document.getElementById('agOrder').value    = item?.display_order ?? 0;
    document.getElementById('agActive').checked = item ? !!item.is_active : true;

    document.getElementById('agModal').classList.remove('hidden');

    const nameInput = document.getElementById('agNameCz');
    const slugInput = document.getElementById('agSlug');
    let slugManuallyEdited = !!item;
    if (!item) {
      slugInput.addEventListener('input', () => { slugManuallyEdited = true; });
      nameInput.addEventListener('input', () => {
        if (!slugManuallyEdited && nameInput.value) {
          slugInput.value = this._generateSlug(nameInput.value);
        }
      });
    }

    const form = document.getElementById('agForm');
    if (!form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveItem();
      });
    }
  }

  closeModal() {
    document.getElementById('agModal').classList.add('hidden');
    this._editing = null;
  }

async saveItem() {
    if (this._saving) return;
    this._saving = true;

    const name_cz = document.getElementById('agNameCz').value.trim();
    if (!name_cz) {
      window.admin?.showNotification('Název CZ je povinný', 'error');
      this._saving = false;
      return;
    }

    const data = {
      name_cz,
      name_en: document.getElementById('agNameEn').value.trim() || null,
      slug: document.getElementById('agSlug').value.trim() || null,
      display_order: Number(document.getElementById('agOrder').value) || 0,
      is_active: document.getElementById('agActive').checked ? 1 : 0,
    };

    const isEdit = !!this._editing;
    const url = isEdit ? `/api/application-groups/admin/${this._editing.id}` : '/api/application-groups/admin';
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
      window.admin?.showNotification(isEdit ? 'Skupina upravena' : 'Skupina přidána', 'success');
    } catch (err) {
      console.error('AppGroups save error:', err);
      window.admin?.showNotification('Chyba ukládání: ' + err.message, 'error');
    } finally {
this._saving = false;
    }
  }

  async deleteItem(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    if (!confirm(`Smazat skupinu "${item.name_cz}"?`)) return;

    try {
const response = await this.auth.authenticatedFetch(`/api/application-groups/admin/${id}`, {
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
      window.admin?.showNotification('Skupina smazána', 'success');
    } catch (err) {
      console.error('AppGroups delete error:', err);
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
