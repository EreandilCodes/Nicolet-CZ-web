/**
 * ContactsManager – CRUD for contact persons.
 * Admin Manager Pattern.
 */
export class ContactsManager {
  constructor(auth) {
    this.auth     = auth;
    this.contacts = [];
    this._editing = null;
  }

  async init() {
    await this.loadItems();
    this._bindAddBtn();
  }

  _bindAddBtn() {
    const btn = document.getElementById('btnAddContact');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => this.showModal());
    }
  }

  async loadItems() {
    try {
      const response = await fetch('/api/contacts/admin/all', {
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
      this.contacts = await response.json();
      this.renderItems();
    } catch (err) {
      console.error('Contacts load error:', err);
      window.admin?.showNotification('Chyba načítání kontaktů: ' + err.message, 'error');
    }
  }

  renderItems() {
    const tbody = document.getElementById('contactsTableBody');
    if (!tbody) return;

    if (!this.contacts.length) {
      tbody.innerHTML = `<tr><td colspan="6">
        <div class="table-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <p>Žádné kontakty. Přidejte první.</p>
        </div>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = this.contacts.map(c => {
      const initials = (c.name || '?').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
      const avatar = c.image_url
        ? `<img class="contact-avatar" src="${esc(c.image_url)}" alt="${esc(c.name)}">`
        : `<div class="contact-avatar-placeholder">${esc(initials)}</div>`;

      return `<tr>
        <td class="col-id">${c.id}</td>
        <td>
          <div class="contact-card">
            ${avatar}
            <div>
              <div class="table-title">${esc(c.name)}</div>
              <div class="table-sub">${esc(c.role_cz || '')}</div>
            </div>
          </div>
        </td>
        <td>${esc(c.email || '–')}</td>
        <td>${esc(c.phone || '–')}</td>
        <td class="col-order">${c.display_order}</td>
        <td class="col-status">
          <span class="badge ${c.is_active ? 'badge-success' : 'badge-neutral'}">
            ${c.is_active ? 'Aktivní' : 'Skryto'}
          </span>
        </td>
        <td class="col-actions">
          <div class="table-actions">
            <button class="btn btn-ghost btn-icon" title="Upravit" onclick="admin.contacts.showModal(${c.id})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn btn-danger btn-icon" title="Smazat" onclick="admin.contacts.deleteItem(${c.id})">
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
    const contact = id ? this.contacts.find(c => c.id === id) : null;
    this._editing = contact;

    const isEdit = !!contact;
    const title  = isEdit ? 'Upravit kontakt' : 'Přidat kontakt';

    document.getElementById('contactModalTitle').textContent = title;

    document.getElementById('contactName').value        = contact?.name       || '';
    document.getElementById('contactRoleCz').value      = contact?.role_cz    || '';
    document.getElementById('contactRoleEn').value      = contact?.role_en    || '';
    document.getElementById('contactEmail').value       = contact?.email      || '';
    document.getElementById('contactPhone').value       = contact?.phone      || '';
    document.getElementById('contactImageUrl').value    = contact?.image_url  || '';
    document.getElementById('contactOrder').value       = contact?.display_order ?? 0;
    document.getElementById('contactActive').checked    = contact?.is_active ?? 1;

    document.getElementById('contactModal').classList.remove('hidden');

    const form = document.getElementById('contactForm');
    if (!form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveItem();
      });
    }
  }

  closeModal() {
    document.getElementById('contactModal').classList.add('hidden');
    this._editing = null;
  }

  async saveItem() {
    const name = document.getElementById('contactName').value.trim();
    if (!name) {
      window.admin?.showNotification('Jméno je povinné', 'error');
      return;
    }

    const data = {
      name,
      role_cz:       document.getElementById('contactRoleCz').value.trim() || null,
      role_en:       document.getElementById('contactRoleEn').value.trim() || null,
      email:         document.getElementById('contactEmail').value.trim()  || null,
      phone:         document.getElementById('contactPhone').value.trim()  || null,
      image_url:     document.getElementById('contactImageUrl').value.trim() || null,
      display_order: Number(document.getElementById('contactOrder').value)  || 0,
      is_active:     document.getElementById('contactActive').checked ? 1 : 0,
    };

    const isEdit  = !!this._editing;
    const url     = isEdit ? `/api/contacts/${this._editing.id}` : '/api/contacts';
    const method  = isEdit ? 'PUT' : 'POST';

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
      window.admin?.showNotification(isEdit ? 'Kontakt upraven' : 'Kontakt přidán', 'success');
    } catch (err) {
      console.error('Contacts save error:', err);
      window.admin?.showNotification('Chyba ukládání: ' + err.message, 'error');
    }
  }

  async deleteItem(id) {
    const contact = this.contacts.find(c => c.id === id);
    if (!contact) return;
    if (!confirm(`Smazat kontakt "${contact.name}"?`)) return;

    try {
      const response = await fetch(`/api/contacts/${id}`, {
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
      window.admin?.showNotification('Kontakt smazán', 'success');
    } catch (err) {
      console.error('Contacts delete error:', err);
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
