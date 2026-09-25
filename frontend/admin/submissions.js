/**
 * SubmissionsManager – view & manage form submissions.
 * Admin Manager Pattern.
 */
export class SubmissionsManager {
  constructor(auth) {
    this.auth  = auth;
    this.items = [];
  }

  async init() {
    await this.loadItems();
  }

  async loadItems() {
    try {
      const response = await this.auth.authenticatedFetch('/api/submissions/admin/all');
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
      console.error('Submissions load error:', err);
      window.admin?.showNotification('Chyba načítání odpovědí: ' + err.message, 'error');
    }
  }

  renderItems() {
    const tbody = document.getElementById('submissionsTableBody');
    if (!tbody) return;

    if (!this.items.length) {
      tbody.innerHTML = `<tr><td colspan="6">
        <div class="table-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          <p>Žádné odpovědi formulářů.</p>
        </div>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = this.items.map(item => {
      const date    = item.submitted_at ? new Date(item.submitted_at).toLocaleString('cs-CZ') : '–';
      let preview   = '–';
      try {
        const parsed = typeof item.data_json === 'string' ? JSON.parse(item.data_json) : item.data_json;
        const str    = Object.entries(parsed || {}).map(([k, v]) => `${k}: ${v}`).join('; ');
        preview = str.length > 60 ? str.substring(0, 60) + '…' : str;
      } catch { /* fallback */ }

      return `<tr style="${item.is_read ? '' : 'font-weight:600;'}">
        <td class="col-id">${item.id}</td>
        <td>${esc(item.form_name || '–')}</td>
        <td style="font-size:12px;">${date}</td>
        <td class="col-status">
          <span class="badge ${item.is_read ? 'badge-neutral' : 'badge-success'}">
            ${item.is_read ? 'Přečteno' : 'Nové'}
          </span>
        </td>
        <td style="font-size:12px;max-width:220px;white-space:normal;">${esc(preview)}</td>
        <td class="col-actions">
          <div class="table-actions">
            <button class="btn btn-ghost btn-icon" title="Zobrazit" onclick="admin.submissions.showDetail(${item.id})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
            ${!item.is_read ? `
            <button class="btn btn-secondary btn-icon" title="Označit jako přečtené" onclick="admin.submissions.markRead(${item.id})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </button>` : ''}
            <button class="btn btn-danger btn-icon" title="Smazat" onclick="admin.submissions.deleteItem(${item.id})">
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

  showDetail(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;

    let html = '';
    try {
      const parsed = typeof item.data_json === 'string' ? JSON.parse(item.data_json) : item.data_json;
      html = Object.entries(parsed || {})
        .map(([k, v]) => `<div style="margin-bottom:8px;"><strong style="color:#374151;">${esc(k)}:</strong> <span>${esc(String(v))}</span></div>`)
        .join('');
    } catch {
      html = `<pre style="font-size:12px;">${esc(String(item.data_json))}</pre>`;
    }

    const date = item.submitted_at ? new Date(item.submitted_at).toLocaleString('cs-CZ') : '–';

    document.getElementById('submissionDetailTitle').textContent = `Odpověď #${item.id} – ${item.form_name || 'Formulář'}`;
    document.getElementById('submissionDetailDate').textContent  = date;
    document.getElementById('submissionDetailData').innerHTML    = html;
    document.getElementById('submissionDetailModal').classList.remove('hidden');

    if (!item.is_read) {
      this.markRead(id);
    }
  }

  closeDetailModal() {
    document.getElementById('submissionDetailModal').classList.add('hidden');
  }

  async markRead(id) {
    try {
      const response = await this.auth.authenticatedFetch(`/api/submissions/admin/${id}/read`, {
        method: 'PUT'
      });
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json')
          ? await response.json()
          : { error: await response.text() };
        throw new Error(err.error || 'Request failed');
      }
      const sub = this.items.find(i => i.id === id);
      if (sub) sub.is_read = 1;
      this.renderItems();
    } catch (err) {
      console.error('Submissions markRead error:', err);
      window.admin?.showNotification('Chyba označení: ' + err.message, 'error');
    }
  }

  async deleteItem(id) {
    if (!confirm('Smazat tuto odpověď?')) return;

    try {
      const response = await this.auth.authenticatedFetch(`/api/submissions/admin/${id}`, {
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
      window.admin?.showNotification('Odpověď smazána', 'success');
    } catch (err) {
      console.error('Submissions delete error:', err);
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
