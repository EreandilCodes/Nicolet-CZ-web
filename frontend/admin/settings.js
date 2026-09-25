/**
 * SettingsManager – admin key-value settings editor.
 * Admin Manager Pattern: init() → loadItems() → renderItems() → showModal() / saveItem()
 */
export class SettingsManager {
  constructor(auth) {
    this.auth     = auth;
    this.settings = {};
  }

  async init() {
    await this.loadItems();
  }

  async loadItems() {
    try {
const response = await this.auth.authenticatedFetch('/api/settings');
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json')
          ? await response.json()
          : { error: await response.text() };
        throw new Error(err.error || 'Request failed');
      }
      if (!contentType?.includes('application/json')) throw new Error('Neplatná odpověď serveru');
      this.settings = await response.json();
      this.renderItems();
    } catch (err) {
      console.error('Settings load error:', err);
      window.admin?.showNotification('Chyba načítání nastavení: ' + err.message, 'error');
    }
  }

  renderItems() {
    const s = this.settings;

    // General settings
    this._setVal('settingSiteName',    s.site_name_cz);
    this._setVal('settingSiteNameEn',  s.site_name_en);
    this._setVal('settingPhone',       s.contact_phone);
    this._setVal('settingEmail',       s.contact_email);
    this._setVal('settingAddress',     s.contact_address);
    this._setVal('settingFooterCz',    s.footer_text_cz);
    this._setVal('settingFooterEn',    s.footer_text_en);
    this._setVal('settingNotifEmail',         s.notification_email);
    this._setVal('settingGtagId',             s.gtag_id);
    this._setVal('settingDefaultThumbnail',   s.default_thumbnail);

    // Logo
    this._setVal('settingLogoUrl',           s.logo_url);
    const logoPreview = document.getElementById('settingLogoPreview');
    if (logoPreview) {
      if (s.logo_url) { logoPreview.src = s.logo_url; logoPreview.style.display = ''; }
      else { logoPreview.style.display = 'none'; }
    }

    // SEO
    this._setVal('settingSeoTitleCz',  s.seo_title_default_cz);
    this._setVal('settingSeoTitleEn',  s.seo_title_default_en);
    this._setVal('settingSeoDescCz',   s.seo_desc_default_cz);
    this._setVal('settingSeoDescEn',   s.seo_desc_default_en);
  }

  _setVal(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? '';
  }

  _getVal(id) {
    return document.getElementById(id)?.value?.trim() ?? '';
  }

  async saveGeneral() {
    await this._save({
      site_name_cz:    this._getVal('settingSiteName'),
      site_name_en:    this._getVal('settingSiteNameEn'),
      contact_phone:   this._getVal('settingPhone'),
      contact_email:   this._getVal('settingEmail'),
      contact_address: this._getVal('settingAddress'),
      footer_text_cz:  this._getVal('settingFooterCz'),
      footer_text_en:  this._getVal('settingFooterEn'),
    });
  }

  async saveNotifications() {
    await this._save({
      notification_email: this._getVal('settingNotifEmail'),
      gtag_id:            this._getVal('settingGtagId'),
    });
  }

  async saveSeo() {
    await this._save({
      seo_title_default_cz: this._getVal('settingSeoTitleCz'),
      seo_title_default_en: this._getVal('settingSeoTitleEn'),
      seo_desc_default_cz:  this._getVal('settingSeoDescCz'),
      seo_desc_default_en:  this._getVal('settingSeoDescEn'),
    });
  }

  async _save(data, _callerBtn) {
    // Find the calling button for visual feedback
    const btn = _callerBtn || document.activeElement;
    const origText = btn?.tagName === 'BUTTON' ? btn.textContent : null;
    if (origText) { btn.disabled = true; btn.textContent = 'Ukládám…'; }

    try {
const response = await this.auth.authenticatedFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json')
          ? await response.json()
          : { error: await response.text() };
        throw new Error(err.error || 'Request failed');
      }
      await response.json();
      window.admin?.showNotification('Nastavení uloženo', 'success');
      await this.loadItems();
    } catch (err) {
      console.error('Settings save error:', err);
      window.admin?.showNotification('Chyba ukládání: ' + err.message, 'error');
    } finally {
      if (origText) { btn.disabled = false; btn.textContent = origText; }
    }
  }

  async saveLogo() {
    const url = this._getVal('settingLogoUrl');
    // Cache for instant display on public site (no extra API round-trip)
    try { localStorage.setItem('nicolet_logo_url', url); } catch { /* quota */ }
    await this._save({ logo_url: url });
  }

  async saveMedia() {
    await this._save({
      default_thumbnail: this._getVal('settingDefaultThumbnail'),
    });
  }

  async sendTestEmail() {
    const btn = document.getElementById('btnTestEmail');
    if (btn) { btn.disabled = true; btn.textContent = 'Odesílám…'; }

    try {
const response = await this.auth.authenticatedFetch('/api/settings/test-email', {
        method: 'POST'
      });
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json')
          ? await response.json()
          : { error: await response.text() };
        throw new Error(err.error || 'Request failed');
      }
      await response.json();
      window.admin?.showNotification('Testovací email odeslán', 'success');
    } catch (err) {
      window.admin?.showNotification('Chyba: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Odeslat testovací email'; }
    }
  }

  _setVal(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value == null ? '' : value;
  }

  async loadAdmins() {
    const emailEl = document.getElementById('settingsCurrentEmail');
    if (emailEl && this.auth?.user?.email) emailEl.textContent = this.auth.user.email;
    const tbody = document.getElementById('adminUsersListBody');
    if (!tbody) return;
    try {
      const response = await this.auth.authenticatedFetch('/api/auth/users');
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json')
          ? await response.json()
          : { error: await response.text() };
        throw new Error(err.error || 'Request failed');
      }
      const users = await response.json();
      if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="3" style="color:#9ca3af;font-size:13px;">Žádné účty</td></tr>';
        return;
      }
      const me = this.auth?.user?.email || '';
      tbody.innerHTML = users.map(u => `
        <tr>
          <td>${esc(u.email)}${u.email === me ? ' <span class="badge badge-success">vy</span>' : ''}</td>
          <td>${esc(u.role || 'admin')}</td>
          <td>${u.created_at ? new Date(u.created_at).toLocaleDateString('cs-CZ') : '–'}</td>
        </tr>`).join('');
    } catch (err) {
      console.error('Admins load error:', err);
      tbody.innerHTML = `<tr><td colspan="3" style="color:#ef4444;font-size:13px;">Chyba načítání: ${esc(err.message)}</td></tr>`;
    }
  }

  async changePassword() {
    const btn = document.getElementById('btnChangePassword');
    if (btn) { btn.disabled = true; btn.textContent = 'Ukládám…'; }
    try {
      const current = document.getElementById('pwCurrent').value;
      const pwNew = document.getElementById('pwNew').value;
      const pwConfirm = document.getElementById('pwNewConfirm').value;
      if (!current) throw new Error('Zadejte současné heslo');
      if (!pwNew) throw new Error('Zadejte nové heslo');
      if (pwNew !== pwConfirm) throw new Error('Nové heslo a potvrzení se neshodují');

      const response = await this.auth.authenticatedFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: current, new_password: pwNew })
      });
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json')
          ? await response.json()
          : { error: await response.text() };
        throw new Error(err.error || 'Request failed');
      }
      await response.json();
      document.getElementById('pwCurrent').value = '';
      document.getElementById('pwNew').value = '';
      document.getElementById('pwNewConfirm').value = '';
      window.admin?.showNotification('Heslo úspěšně změněno', 'success');
    } catch (err) {
      window.admin?.showNotification('Chyba: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Změnit heslo'; }
    }
  }

  async addAdmin() {
    const btn = document.getElementById('btnAddAdmin');
    if (btn) { btn.disabled = true; btn.textContent = 'Ukládám…'; }
    try {
      const email = document.getElementById('newAdminEmail').value.trim();
      const password = document.getElementById('newAdminPassword').value;
      if (!email) throw new Error('Zadejte email');
      if (!password) throw new Error('Zadejte heslo');

      const response = await this.auth.authenticatedFetch('/api/auth/admin', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json')
          ? await response.json()
          : { error: await response.text() };
        throw new Error(err.error || 'Request failed');
      }
      await response.json();
      document.getElementById('newAdminEmail').value = '';
      document.getElementById('newAdminPassword').value = '';
      await this.loadAdmins();
      window.admin?.showNotification('Správce přidán', 'success');
    } catch (err) {
      window.admin?.showNotification('Chyba: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Přidat správce'; }
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
    .replace(/'/g, '&#39;');
}
