/**
 * TrainingsManager – CRUD for training events.
 * Admin Manager Pattern.
 */
export class TrainingsManager {
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
    const btn = document.getElementById('btnAddTraining');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => this.showModal());
    }
  }

  async loadItems() {
    try {
const response = await this.auth.authenticatedFetch('/api/trainings/admin/all');
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
      console.error('Trainings load error:', err);
      window.admin?.showNotification('Chyba načítání školení: ' + err.message, 'error');
    }
  }

  renderItems() {
    const tbody = document.getElementById('trainingsTableBody');
    if (!tbody) return;

    if (!this.items.length) {
      tbody.innerHTML = `<tr><td colspan="7">
        <div class="table-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <p>Žádná školení. Přidejte první.</p>
        </div>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = this.items.map(item => {
      const dateStart = item.date_start ? new Date(item.date_start).toLocaleDateString('cs-CZ') : '–';
      const dateEnd   = item.date_end   ? new Date(item.date_end).toLocaleDateString('cs-CZ')   : '–';
      const today    = new Date().toISOString().slice(0, 10);
      const isPast   = !!(item.date_start && item.date_start.substring(0, 10) < today);
      return `<tr>
        <td class="col-id">${item.id}</td>
        <td>
          <div class="table-title">${esc(item.title_cz || '–')}</div>
          <div class="table-sub">${esc(item.title_en || '')}</div>
        </td>
        <td>${dateStart}${isPast ? ' <span class="badge badge-neutral">Proběhlé</span>' : ''}</td>
        <td>${dateEnd}</td>
        <td>${esc(item.location_cz || '–')}</td>
        <td class="col-status">
          <span class="badge ${item.is_published ? 'badge-success' : 'badge-neutral'}">
            ${item.is_published ? 'Publikováno' : 'Skryto'}
          </span>
        </td>
        <td class="col-actions">
          <div class="table-actions">
            <button class="btn btn-ghost btn-icon" title="Upravit" onclick="admin.trainings.showModal(${item.id})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn btn-danger btn-icon" title="Smazat" onclick="admin.trainings.deleteItem(${item.id})">
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

    document.getElementById('trainModalTitle').textContent = item ? 'Upravit školení' : 'Přidat školení';

    document.getElementById('trainTitleCz').value      = item?.title_cz     || '';
    document.getElementById('trainTitleEn').value      = item?.title_en     || '';
    document.getElementById('trainContentCz').value    = item?.content_cz   || '';
    document.getElementById('trainContentEn').value    = item?.content_en   || '';
    document.getElementById('trainDateStart').value    = item?.date_start   ? item.date_start.substring(0, 10) : '';
    document.getElementById('trainDateEnd').value      = item?.date_end     ? item.date_end.substring(0, 10)   : '';
    document.getElementById('trainLocationCz').value   = item?.location_cz  || '';
    document.getElementById('trainLocationEn').value   = item?.location_en  || '';
    document.getElementById('trainPublished').checked  = item ? !!item.is_published : true;

    document.getElementById('trainingsModal').classList.remove('hidden');

    // Init editors in Text mode
    window.initEditorView?.('trainContentCz');
    window.initEditorView?.('trainContentEn');

    const form = document.getElementById('trainingsForm');
    if (!form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveItem();
      });
    }
  }

  closeModal() {
    document.getElementById('trainingsModal').classList.add('hidden');
    this._editing = null;
  }

async saveItem() {
    if (this._saving) return;
    this._saving = true;

    // Sync contenteditable → textarea before reading values
    window.syncEditorToHtml?.('trainContentCz');
    window.syncEditorToHtml?.('trainContentEn');

    const title_cz = document.getElementById('trainTitleCz').value.trim();
    if (!title_cz) {
      window.admin?.showNotification('Název CZ je povinný', 'error');
      this._saving = false;
      return;
    }

    const data = {
      title_cz,
      title_en: document.getElementById('trainTitleEn').value.trim() || null,
      content_cz: document.getElementById('trainContentCz').value.trim() || null,
      content_en: document.getElementById('trainContentEn').value.trim() || null,
      date_start: document.getElementById('trainDateStart').value || null,
      date_end: document.getElementById('trainDateEnd').value || null,
      location_cz: document.getElementById('trainLocationCz').value.trim() || null,
      location_en: document.getElementById('trainLocationEn').value.trim() || null,
      is_published: document.getElementById('trainPublished').checked ? 1 : 0,
    };

    const isEdit = !!this._editing;
    const url = isEdit ? `/api/trainings/admin/${this._editing.id}` : '/api/trainings/admin';
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
      window.admin?.showNotification(isEdit ? 'Školení upraveno' : 'Školení přidáno', 'success');
    } catch (err) {
      console.error('Trainings save error:', err);
      window.admin?.showNotification('Chyba ukládání: ' + err.message, 'error');
    } finally {
this._saving = false;
    }
  }

  async deleteItem(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    if (!confirm(`Smazat školení "${item.title_cz}"?`)) return;

    try {
const response = await this.auth.authenticatedFetch(`/api/trainings/admin/${id}`, {
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
      window.admin?.showNotification('Školení smazáno', 'success');
    } catch (err) {
      console.error('Trainings delete error:', err);
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
