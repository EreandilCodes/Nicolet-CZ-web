/**
 * FormsManager – CRUD for contact forms with visual field builder.
 * Admin Manager Pattern.
 */
export class FormsManager {
  constructor(auth) {
    this.auth     = auth;
    this.items    = [];
    this._editing = null;
    this._fields  = [];   // working array for field builder
    this._fieldCounter = 0;
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
      let fieldCount = 0;
      try { fieldCount = JSON.parse(item.fields_json || '[]').length; } catch {}
      return `<tr>
        <td class="col-id">${item.id}</td>
        <td class="table-title">${esc(item.name || '–')}</td>
        <td style="font-size:12px;">${esc(item.email_recipients || '–')}</td>
        <td><span class="badge badge-neutral">${fieldCount} polí</span></td>
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

  // ── Field Builder ──────────────────────────────────────────────────────────

  addField(type) {
    this._syncFieldsFromDOM();   // preserve values already typed in existing fields
    this._fieldCounter++;
    const name = type === 'gdpr' ? 'gdpr_consent' : `${type}_${this._fieldCounter}`;
    const field = {
      name,
      label_cz: type === 'gdpr' ? 'Souhlasím se zpracováním osobních údajů' : '',
      label_en: type === 'gdpr' ? 'I agree to the processing of personal data' : '',
      placeholder_cz: '',
      placeholder_en: '',
      type: type === 'gdpr' ? 'checkbox' : type,
      required: type === 'gdpr' ? true : false,
    };
    this._fields.push(field);
    this._renderFieldBuilder();
  }

  removeField(idx) {
    this._syncFieldsFromDOM();   // preserve values in remaining fields before removing
    this._fields.splice(idx, 1);
    this._renderFieldBuilder();
  }

  moveField(idx, dir) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= this._fields.length) return;
    const tmp = this._fields[idx];
    this._fields[idx] = this._fields[newIdx];
    this._fields[newIdx] = tmp;
    this._syncFieldsFromDOM();  // sync before render so values aren't lost
    this._renderFieldBuilder();
  }

  _syncFieldsFromDOM() {
    // Read current input values back into _fields
    const container = document.getElementById('formFieldList');
    if (!container) return;
    container.querySelectorAll('.field-row').forEach(row => {
      const idx = parseInt(row.dataset.idx, 10);
      if (isNaN(idx) || !this._fields[idx]) return;
      const typeEl = row.querySelector('[data-prop="type"]');
      const czEl   = row.querySelector('[data-prop="label_cz"]');
      const enEl   = row.querySelector('[data-prop="label_en"]');
      const phCzEl = row.querySelector('[data-prop="placeholder_cz"]');
      const phEnEl = row.querySelector('[data-prop="placeholder_en"]');
      const reqEl  = row.querySelector('[data-prop="required"]');
      if (typeEl)  this._fields[idx].type             = typeEl.value;
      if (czEl)    this._fields[idx].label_cz         = czEl.value;
      if (enEl)    this._fields[idx].label_en         = enEl.value;
      if (phCzEl)  this._fields[idx].placeholder_cz   = phCzEl.value;
      if (phEnEl)  this._fields[idx].placeholder_en   = phEnEl.value;
      if (reqEl)   this._fields[idx].required         = reqEl.checked;
    });
  }

  _renderFieldBuilder() {
    const container = document.getElementById('formFieldList');
    if (!container) return;

    if (!this._fields.length) {
      container.innerHTML = `<div class="field-empty-state">Zatím žádná pole. Použijte tlačítka níže.</div>`;
      return;
    }

    const typeLabels = { text: 'Text', email: 'Email', tel: 'Telefon', textarea: 'Textarea', checkbox: 'Checkbox' };

    container.innerHTML = this._fields.map((f, idx) => {
      const opts = Object.entries(typeLabels).map(([val, label]) => 
        `<option value="${val}" ${f.type === val ? 'selected' : ''}>${label}</option>`
      ).join('');
      return `
      <div class="field-row" data-idx="${idx}">
        <div class="field-row-header">
          <select class="field-type-select" data-prop="type" style="font-size:0.75rem;padding:4px 8px;border-radius:4px;border:1px solid var(--border-mid);background:var(--bg-card);">
            ${opts}
          </select>
          <div class="field-row-actions">
            <button type="button" class="btn btn-ghost btn-icon btn-sm" title="Nahoru" onclick="admin.forms.moveField(${idx}, -1)">↑</button>
            <button type="button" class="btn btn-ghost btn-icon btn-sm" title="Dolů" onclick="admin.forms.moveField(${idx}, 1)">↓</button>
            <button type="button" class="btn btn-danger btn-icon btn-sm" title="Smazat" onclick="admin.forms.removeField(${idx})">×</button>
          </div>
        </div>
        <div class="field-row-body">
          <div class="field-row-grid">
            <div class="form-group">
              <label class="form-label">Název pole (CZ)</label>
              <input type="text" class="form-input form-input-sm" data-prop="label_cz"
                value="${esc(f.label_cz)}" placeholder="např. Jméno">
            </div>
            <div class="form-group">
              <label class="form-label">Název pole (EN)</label>
              <input type="text" class="form-input form-input-sm" data-prop="label_en"
                value="${esc(f.label_en)}" placeholder="e.g. Name">
            </div>
          </div>
          <div class="field-row-grid" style="margin-top:8px;">
            <div class="form-group">
              <label class="form-label">Placeholder (CZ)</label>
              <input type="text" class="form-input form-input-sm" data-prop="placeholder_cz"
                value="${esc(f.placeholder_cz || '')}" placeholder="např. Zadejte vaše jméno">
            </div>
            <div class="form-group">
              <label class="form-label">Placeholder (EN)</label>
              <input type="text" class="form-input form-input-sm" data-prop="placeholder_en"
                value="${esc(f.placeholder_en || '')}" placeholder="e.g. Enter your name">
            </div>
          </div>
          <label class="toggle-wrap" style="margin-top:8px;">
            <div class="toggle toggle-sm">
              <input type="checkbox" data-prop="required" ${f.required ? 'checked' : ''}>
              <div class="toggle-slider"></div>
            </div>
            <span class="toggle-label" style="font-size:0.8rem;">Povinné pole</span>
          </label>
        </div>
      </div>
    `}).join('');
  }

  // ── Modal ──────────────────────────────────────────────────────────────────

  showModal(id = null) {
    const item = id ? this.items.find(i => i.id === id) : null;
    this._editing = item;
    this._fieldCounter = 0;

    document.getElementById('formModalTitle').textContent = item ? 'Upravit formulář' : 'Přidat formulář';

    document.getElementById('formName').value             = item?.name              || '';
    document.getElementById('formTitleCz').value          = item?.title_cz          || '';
    document.getElementById('formTitleEn').value          = item?.title_en          || '';
    document.getElementById('formDescCz').value           = item?.description_cz    || '';
    document.getElementById('formDescEn').value           = item?.description_en    || '';
    document.getElementById('formEmailRecipients').value  = item?.email_recipients  || '';
    document.getElementById('formSubmitLabelCz').value    = item?.submit_label_cz   || '';
    document.getElementById('formSubmitLabelEn').value    = item?.submit_label_en   || '';
    document.getElementById('formSuccessMsgCz').value     = item?.success_msg_cz    || '';
    document.getElementById('formSuccessMsgEn').value     = item?.success_msg_en    || '';
    document.getElementById('formBackgroundImage').value  = item?.background_image  || '';
    document.getElementById('formActive').checked         = item?.is_active         ?? true;

    const labelColor = (item && item.label_color) || 'white';
    console.log('Loading form, label_color from DB:', item?.label_color, '-> using:', labelColor);
    const colorRadios = document.querySelectorAll('input[name="formLabelColor"]');
    if (colorRadios.length > 0) {
      colorRadios.forEach(r => {
        r.checked = r.value === labelColor;
        console.log(`  Radio ${r.value}: ${r.checked ? 'CHECKED' : 'not checked'}`);
      });
    } else {
      console.log('  No radio buttons found for formLabelColor!');
    }

    // Update bg preview
    const bgPreview = document.getElementById('formBgPreview');
    if (bgPreview) {
      bgPreview.src = item?.background_image || '';
      bgPreview.style.display = item?.background_image ? '' : 'none';
    }

    // Load fields
    this._fields = [];
    if (item?.fields_json) {
      try {
        const parsed = typeof item.fields_json === 'string'
          ? JSON.parse(item.fields_json)
          : item.fields_json;
        this._fields = Array.isArray(parsed) ? parsed : [];
      } catch { this._fields = []; }
    }
    this._renderFieldBuilder();

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
    this._fields = [];
  }

  async saveItem() {
    if (this._saving) return;

    const name = document.getElementById('formName').value.trim();
    if (!name) {
      window.admin?.showNotification('Název formuláře je povinný', 'error');
      return;
    }

    // Sync current DOM values into _fields before saving
    this._syncFieldsFromDOM();

    const selectedColor = document.querySelector('input[name="formLabelColor"]:checked');
    const labelColorValue = selectedColor ? selectedColor.value : 'white';
    console.log('Saving form with label_color:', labelColorValue);

    const data = {
      name,
      title_cz:          document.getElementById('formTitleCz').value.trim()          || null,
      title_en:          document.getElementById('formTitleEn').value.trim()          || null,
      description_cz:    document.getElementById('formDescCz').value.trim()          || null,
      description_en:    document.getElementById('formDescEn').value.trim()          || null,
      email_recipients:  document.getElementById('formEmailRecipients').value.trim() || null,
      submit_label_cz:   document.getElementById('formSubmitLabelCz').value.trim()   || null,
      submit_label_en:   document.getElementById('formSubmitLabelEn').value.trim()   || null,
      success_msg_cz:    document.getElementById('formSuccessMsgCz').value.trim()    || null,
      success_msg_en:    document.getElementById('formSuccessMsgEn').value.trim()    || null,
      background_image:  document.getElementById('formBackgroundImage').value.trim() || null,
      fields_json:       JSON.stringify(this._fields),
      label_color:       labelColorValue,
      is_active:         document.getElementById('formActive').checked ? 1 : 0,
    };

    const isEdit = !!this._editing;
    const url    = isEdit ? `/api/forms/admin/${this._editing.id}` : '/api/forms/admin';
    const method = isEdit ? 'PUT' : 'POST';

    this._saving = true;
    const saveBtn = document.querySelector('#formsFormEl button[type="submit"]');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Ukládám…'; }

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
    } finally {
      this._saving = false;
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Uložit'; }
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
