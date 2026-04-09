export class FaqsManager {
  constructor(auth) {
    this.auth = auth;
    this.items = [];
    this._editing = null;
    this._esc = (str) => {
      if (!str) return '';
      return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    };
  }

  async init() {
    await this.loadItems();
    this._bindButtons();
  }

  _bindButtons() {
    const btn = document.getElementById('btnAddFaq');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => this.showModal());
    }
  }

  async loadItems() {
    try {
      const response = await fetch('/api/faqs/admin/all', {
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
      console.error('FAQs load error:', err);
      window.admin?.showNotification('Chyba načítání FAQ: ' + err.message, 'error');
    }
  }

  renderItems() {
    const tbody = document.getElementById('faqsTableBody');
    if (!tbody) return;

    if (!this.items.length) {
      tbody.innerHTML = `<tr><td colspan="5">
        <div class="table-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <p>Žádné FAQ. Přidejte první.</p>
        </div>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = this.items.map(item => `
      <tr>
        <td class="col-id">${item.id}</td>
        <td>
          <div class="table-title">${this._esc(item.category_cz || '–')}</div>
        </td>
        <td>
          <div class="table-title">${this._esc(item.question_cz || '–')}</div>
          <div class="table-sub">${this._esc(item.question_en || '')}</div>
        </td>
        <td class="col-order">${item.display_order ?? 0}</td>
        <td class="col-status">
          <span class="badge ${item.is_active ? 'badge-success' : 'badge-neutral'}">
            ${item.is_active ? 'Aktivní' : 'Skryta'}
          </span>
        </td>
        <td class="col-actions">
          <div class="table-actions">
            <button class="btn btn-ghost btn-icon" title="Upravit" onclick="admin.faqs.showModal(${item.id})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn btn-danger btn-icon" title="Smazat" onclick="admin.faqs.deleteItem(${item.id})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4h6v2"/>
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  showModal(id = null) {
    const item = id ? this.items.find(i => i.id === id) : null;
    this._editing = item;

    document.getElementById('faqsModalTitle').textContent = item ? 'Upravit FAQ' : 'Přidat FAQ';

    document.getElementById('faqCategoryCz').value = item?.category_cz || '';
    document.getElementById('faqCategoryEn').value = item?.category_en || '';
    document.getElementById('faqQuestionCz').value = item?.question_cz || '';
    document.getElementById('faqQuestionEn').value = item?.question_en || '';
    document.getElementById('faqAnswerCz').value = item?.answer_cz || '';
    document.getElementById('faqAnswerEn').value = item?.answer_en || '';
    document.getElementById('faqOrder').value = item?.display_order ?? 0;
    document.getElementById('faqActive').checked = item ? !!item.is_active : true;

    document.getElementById('faqError').style.display = 'none';
    document.getElementById('faqModal').classList.remove('hidden');
  }

  hideModal() {
    document.getElementById('faqModal').classList.add('hidden');
    this._editing = null;
  }

  async saveItem() {
    const data = {
      category_cz: document.getElementById('faqCategoryCz').value,
      category_en: document.getElementById('faqCategoryEn').value,
      question_cz: document.getElementById('faqQuestionCz').value,
      question_en: document.getElementById('faqQuestionEn').value,
      answer_cz: document.getElementById('faqAnswerCz').value,
      answer_en: document.getElementById('faqAnswerEn').value,
      display_order: parseInt(document.getElementById('faqOrder').value) || 0,
      is_active: document.getElementById('faqActive').checked
    };

    const errorEl = document.getElementById('faqError');
    errorEl.style.display = 'none';

    if (!data.question_cz.trim()) {
      errorEl.textContent = 'Otázka (CZ) je povinná';
      errorEl.style.display = 'block';
      return;
    }
    if (!data.answer_cz.trim()) {
      errorEl.textContent = 'Odpověď (CZ) je povinná';
      errorEl.style.display = 'block';
      return;
    }

    const btn = document.getElementById('faqSaveBtn');
    btn.disabled = true;
    btn.textContent = 'Ukládám…';

    try {
      const url = this._editing
        ? `/api/faqs/admin/${this._editing.id}`
        : '/api/faqs/admin';
      const method = this._editing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...this.auth.getAuthHeaders()
        },
        body: JSON.stringify(data)
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Chyba serveru');

      this.hideModal();
      await this.loadItems();
      window.admin?.showNotification(
        this._editing ? 'FAQ upravena' : 'FAQ přidána',
        'success'
      );
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Uložit';
    }
  }

  async deleteItem(id) {
    if (!confirm('Opravdu chcete smazat tuto FAQ?')) return;

    try {
      const response = await fetch(`/api/faqs/admin/${id}`, {
        method: 'DELETE',
        headers: this.auth.getAuthHeaders()
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Chyba serveru');

      await this.loadItems();
      window.admin?.showNotification('FAQ smazána', 'success');
    } catch (err) {
      window.admin?.showNotification('Chyba: ' + err.message, 'error');
    }
  }
}
