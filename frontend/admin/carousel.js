/**
 * CarouselManager – CRUD for carousel items.
 * Admin Manager Pattern.
 */
export class CarouselManager {
constructor(auth) {
    this.auth = auth;
    this.items = [];
    this.pages = [];
    this.products = [];
    this.applications = [];
    this.news = [];
    this._editing = null;
    this._saving = false;
  }

  async init() {
    await this.loadItems();
    await this._loadLinkSources();
    this._bindButtons();
  }

  async _loadLinkSources() {
    try {
      const [pages, products, apps, newsItems] = await Promise.all([
        this.auth.authenticatedFetch('/api/pages').then(r => r.ok ? r.json() : []).catch(() => []),
        this.auth.authenticatedFetch('/api/products?fields=list').then(r => r.ok ? r.json() : []).catch(() => []),
        this.auth.authenticatedFetch('/api/applications?fields=list').then(r => r.ok ? r.json() : []).catch(() => []),
        this.auth.authenticatedFetch('/api/news').then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      this.pages = pages;
      this.products = products;
      this.applications = apps;
      this.news = newsItems;
    } catch (err) {
      console.error('Failed to load link sources:', err);
    }
  }

  _bindButtons() {
    const btn = document.getElementById('btnAddCarousel');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => this.showModal());
    }
  }

  async loadItems() {
    try {
const response = await this.auth.authenticatedFetch('/api/carousel/admin/all');
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
      console.error('Carousel load error:', err);
      window.admin?.showNotification('Chyba načítání karuselu: ' + err.message, 'error');
    }
  }

  renderItems() {
    const tbody = document.getElementById('carouselTableBody');
    if (!tbody) return;

    if (!this.items.length) {
      tbody.innerHTML = `<tr><td colspan="7">
        <div class="table-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="1" y="6" width="22" height="12" rx="2"/>
          </svg>
          <p>Žádné položky karuselu. Přidejte první.</p>
        </div>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = this.items.map(item => {
      const thumb = item.image_url
        ? `<img src="${esc(item.image_url)}" alt="" style="width:60px;height:36px;object-fit:cover;border-radius:4px;">`
        : `<div style="width:60px;height:36px;background:#e5e7eb;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#9ca3af;">no img</div>`;

      return `<tr>
        <td class="col-id">${item.id}</td>
        <td>${thumb}</td>
        <td class="table-title">${esc(item.title_cz || '–')}</td>
        <td>${esc(item.link_url || '–')}</td>
        <td class="col-order">${item.display_order}</td>
        <td class="col-status">
          <span class="badge ${item.is_active ? 'badge-success' : 'badge-neutral'}">
            ${item.is_active ? 'Aktivní' : 'Skryto'}
          </span>
        </td>
        <td class="col-actions">
          <div class="table-actions">
            <button class="btn btn-ghost btn-icon" title="Upravit" onclick="admin.carousel.showModal(${item.id})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn btn-danger btn-icon" title="Smazat" onclick="admin.carousel.deleteItem(${item.id})">
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

    document.getElementById('carouselModalTitle').textContent = item ? 'Upravit položku' : 'Přidat položku';

    document.getElementById('carouselImageUrl').value    = item?.image_url     || '';
    document.getElementById('carouselLinkUrl').value     = item?.link_url      || '';
    document.getElementById('carouselTitleCz').value     = item?.title_cz      || '';
    document.getElementById('carouselTitleEn').value     = item?.title_en      || '';
    document.getElementById('carouselSubtitleCz').value  = item?.subtitle_cz   || '';
    document.getElementById('carouselSubtitleEn').value  = item?.subtitle_en   || '';
    document.getElementById('carouselShowText').checked  = item?.show_text     ?? true;
    document.getElementById('carouselOrder').value       = item?.display_order ?? 0;
    document.getElementById('carouselActive').checked    = item?.is_active     ?? true;

    // Update image preview
    const imgPreview = document.getElementById('carouselImagePreview');
    if (imgPreview) { const u = item?.image_url || ''; imgPreview.src = u; imgPreview.style.display = u ? '' : 'none'; }

    document.getElementById('carouselModal').classList.remove('hidden');

    const form = document.getElementById('carouselForm');
    if (!form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveItem();
      });
    }
  }

  closeModal() {
    document.getElementById('carouselModal').classList.add('hidden');
    this._editing = null;
  }

  filterLinkSuggestions(query) {
    const list = document.getElementById('carouselLinkSuggestions');
    if (!list) return;
    const q = query.toLowerCase();
    if (!q) { list.style.display = 'none'; return; }

    const suggestions = [];

    this.pages?.forEach(p => {
      if (p.slug && (p.title_cz?.toLowerCase().includes(q) || p.title_en?.toLowerCase().includes(q))) {
        suggestions.push({ type: 'page', label: p.title_cz || p.title_en, value: `/stranky/${p.slug}` });
      }
    });
    this.products?.forEach(p => {
      if (p.slug && (p.name_cz?.toLowerCase().includes(q) || p.name_en?.toLowerCase().includes(q))) {
        suggestions.push({ type: 'product', label: p.name_cz || p.name_en, value: `/produkty/${p.slug}` });
      }
    });
    this.applications?.forEach(a => {
      if (a.slug && (a.name_cz?.toLowerCase().includes(q) || a.name_en?.toLowerCase().includes(q))) {
        suggestions.push({ type: 'app', label: a.name_cz || a.name_en, value: `/aplikace/${a.slug}` });
      }
    });
    this.news?.forEach(n => {
      if (n.slug && (n.title_cz?.toLowerCase().includes(q) || n.title_en?.toLowerCase().includes(q))) {
        suggestions.push({ type: 'news', label: n.title_cz || n.title_en, value: `/novinky/${n.slug}` });
      }
    });

    const typeIcons = { page: '📄', product: '🔬', app: '⚙️', news: '📰' };
    const typeLabels = { page: 'Stránka', product: 'Produkt', app: 'Aplikace', news: 'Novinka' };

    if (!suggestions.length) {
      list.style.display = 'none';
      return;
    }

    list.innerHTML = suggestions.slice(0, 10).map(s => `
      <div class="autocomplete-item" onmousedown="admin.carousel.selectLinkSuggestion('${esc(s.value)}', '${esc(s.label)}')">
        <span class="link-suggestion-icon">${typeIcons[s.type] || '🔗'}</span>
        <span class="link-suggestion-label">${esc(s.label)}</span>
        <span class="link-suggestion-type">${typeLabels[s.type] || s.type}</span>
      </div>
    `).join('');
    list.style.display = 'block';
  }

  selectLinkSuggestion(url, label) {
    const input = document.getElementById('carouselLinkUrl');
    if (input) {
      input.value = url;
      input.focus();
    }
    const list = document.getElementById('carouselLinkSuggestions');
    if (list) list.style.display = 'none';
  }

async saveItem() {
    if (this._saving) return;
    this._saving = true;

    const image_url = document.getElementById('carouselImageUrl').value.trim();
    if (!image_url) {
      window.admin?.showNotification('URL obrázku je povinné', 'error');
      this._saving = false;
      return;
    }

    const data = {
      image_url,
      link_url: document.getElementById('carouselLinkUrl').value.trim() || null,
      title_cz: document.getElementById('carouselTitleCz').value.trim() || null,
      title_en: document.getElementById('carouselTitleEn').value.trim() || null,
      subtitle_cz: document.getElementById('carouselSubtitleCz').value.trim() || null,
      subtitle_en: document.getElementById('carouselSubtitleEn').value.trim() || null,
      show_text: document.getElementById('carouselShowText').checked ? 1 : 0,
      display_order: Number(document.getElementById('carouselOrder').value) || 0,
      is_active: document.getElementById('carouselActive').checked ? 1 : 0,
    };

    const isEdit = !!this._editing;
    const url = isEdit ? `/api/carousel/admin/${this._editing.id}` : '/api/carousel/admin';
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
      window.admin?.showNotification(isEdit ? 'Položka upravena' : 'Položka přidána', 'success');
    } catch (err) {
      console.error('Carousel save error:', err);
      window.admin?.showNotification('Chyba ukládání: ' + err.message, 'error');
    } finally {
this._saving = false;
    }
  }

  async deleteItem(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    if (!confirm(`Smazat položku karuselu "${item.title_cz || item.id}"?`)) return;

    try {
const response = await this.auth.authenticatedFetch(`/api/carousel/admin/${id}`, {
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
      window.admin?.showNotification('Položka smazána', 'success');
    } catch (err) {
      console.error('Carousel delete error:', err);
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
