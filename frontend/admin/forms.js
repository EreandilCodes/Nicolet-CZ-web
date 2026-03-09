/**
 * FormsManager – CRUD for contact forms.
 * Admin Manager Pattern.
 */
export class FormsManager {
  constructor(auth) {
    this.auth     = auth;
    this.items    = [];
    this._editing = null;
  }

  async init() {
    await this.loadItems();
    this._bindButtons();
  }

  _bindButtons() {
    const btn = document.getElementById('btnAddForm');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => this.showModal());
    }
  }

  async loadItems() {
    try {
      const response = await fetch('/api/forms/admin/all', {
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
      console.error('Forms load error:', err);
      window.admin?.showNotification('Chyba načítání formulářů: ' + err.message, 'error');
    }
  }

  renderItems() {
    const tbody = document.getElementById('formsTableBody');
    if (!tbody) return;

    if (!this.items.length) {
      tbody.innerHTML = `<tr><td colspan="5">
        <div class="table-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
            <line x1="8" y1="16" x2="12" y2="16"/>
          </svg>
          <p>Žádné formuláře. Přidejte první.</p>
        </div>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = this.items.map(item => {
      return `<tr>
        <td class="col-id">${item.id}</td>
        <td class="table-title">${esc(item.name || '–')}</td>
        <td style="font-size:12px;">${esc(item.email_recipients || '–')}</td>
        <td class="col-status">
          <span class="badge ${item.is_active ? 'badge-success' : 'badge-neutral'}">
            ${item.is_active ? 'Aktivní' : 'Skryto'}
          </span>
        </td>
        <td class="col-actions">
          <div class="table-actions">
            <button class="btn btn-ghost btn-icon" title="Upravit" onclick="admin.forms.showModal(${item.id})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn btn-danger btn-icon" title="Smazat" onclick="admin.forms.deleteItem(${item.id})">
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

    document.getElementById('formModalTitle').textContent = item ? 'Upravit formulář' : 'Přidat formulář';

    document.getElementById('formName').value             = item?.name              || '';
    document.getElementById('formDescCz').value           = item?.desc_cz           || '';
    document.getElementById('formDescEn').value           = item?.desc_en           || '';
    document.getElementById('formEmailRecipients').value  = item?.email_recipients  || '';
    document.getElementById('formSubmitLabelCz').value    = item?.submit_label_cz   || '';
    document.getElementById('formSubmitLabelEn').value    = item?.submit_label_en   || '';
    document.getElementById('formSuccessMsgCz').value     = item?.success_msg_cz    || '';
    document.getElementById('formSuccessMsgEn').value     = item?.success_msg_en    || '';
    document.getElementById('formBackgroundImage').value  = item?.background_image  || '';
    document.getElementById('formActive').checked         = item?.is_active         ?? true;

    // fields_json as raw JSON textarea
    let fieldsJson = '[]';
    if (item?.fields_json) {
      try {
        fieldsJson = typeof item.fields_json === 'string'
          ? JSON.stringify(JSON.parse(item.fields_json), null, 2)
          : JSON.stringify(item.fields_json, null, 2);
      } catch {
        fieldsJson = item.fields_json;
      }
    }
    document.getElementById('formFieldsJson').value = fieldsJson;

    document.getElementById('formsModal').classList.remove('hidden');

    const form = document.getElementById('formsFormEl');
    if (!form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveItem();
      });
    }
  }

  closeModal() {
    document.getElementById('formsModal').classList.add('hidden');
    this._editing = null;
  }

  async saveItem() {
    const name = document.getElementById('formName').value.trim();
    if (!name) {
      window.admin?.showNotification('Název formuláře je povinný', 'error');
      return;
    }

    let fields_json = '[]';
    const rawJson = document.getElementById('formFieldsJson').value.trim();
    try {
      JSON.parse(rawJson);
      fields_json = rawJson;
    } catch {
      window.admin?.showNotification('Pole formuláře obsahují neplatný JSON', 'error');
      return;
    }

    const data = {
      name,
      desc_cz:           document.getElementById('formDescCz').value.trim()          || null,
      desc_en:           document.getElementById('formDescEn').value.trim()          || null,
      email_recipients:  document.getElementById('formEmailRecipients').value.trim() || null,
      submit_label_cz:   document.getElementById('formSubmitLabelCz').value.trim()   || null,
      submit_label_en:   document.getElementById('formSubmitLabelEn').value.trim()   || null,
      success_msg_cz:    document.getElementById('formSuccessMsgCz').value.trim()    || null,
      success_msg_en:    document.getElementById('formSuccessMsgEn').value.trim()    || null,
      background_image:  document.getElementById('formBackgroundImage').value.trim() || null,
      fields_json,
      is_active:         document.getElementById('formActive').checked ? 1 : 0,
    };

    const isEdit = !!this._editing;
    const url    = isEdit ? `/api/forms/admin/${this._editing.id}` : '/api/forms/admin';
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
      window.admin?.showNotification(isEdit ? 'Formulář upraven' : 'Formulář přidán', 'success');
    } catch (err) {
      console.error('Forms save error:', err);
      window.admin?.showNotification('Chyba ukládání: ' + err.message, 'error');
    }
  }

  async deleteItem(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    if (!confirm(`Smazat formulář "${item.name}"?`)) return;

    try {
      const response = await fetch(`/api/forms/admin/${id}`, {
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
      window.admin?.showNotification('Formulář smazán', 'success');
    } catch (err) {
      console.error('Forms delete error:', err);
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
