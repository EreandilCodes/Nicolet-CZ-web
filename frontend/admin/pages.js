/**
 * PagesManager – CRUD for static pages.
 * Admin Manager Pattern.
 */
export class PagesManager {
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
    const btnAddPage = document.getElementById('btnAddPage');
    if (btnAddPage && !btnAddPage.dataset.bound) {
      btnAddPage.dataset.bound = '1';
      btnAddPage.addEventListener('click', () => this.showModal());
    }
  }

  async loadItems() {
  try {
    const response = await fetch('/api/pages/admin/all', {
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
      console.error('Pages load error:', err);
      window.admin?.showNotification('Chyba načítání stránek: ' + err.message, 'error');
    }
  }

  renderItems() {
    const tbody = document.getElementById('pagesTableBody');
    if (!tbody) return;

    if (!this.items.length) {
      tbody.innerHTML = `<tr><td colspan="6">
        <div class="table-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <p>Žádné stránky. Přidejte první.</p>
        </div>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = this.items.map(item => {
      return `<tr>
        <td class="col-id">${item.id}</td>
        <td>
          <div class="table-title">${esc(item.title_cz || '–')}</div>
          <div class="table-sub">${esc(item.title_en || '')}</div>
        </td>
        <td><code style="font-size:12px;">${esc(item.slug || '–')}</code></td>
        <td class="col-order">${item.display_order ?? 0}</td>
        <td class="col-status">
          <span class="badge ${item.is_published ? 'badge-success' : 'badge-neutral'}">
            ${item.is_published ? 'Publikováno' : 'Skryta'}
          </span>
        </td>
        <td class="col-actions">
          <div class="table-actions">
            <button class="btn btn-ghost btn-icon" title="Upravit" onclick="admin.pages.showModal(${item.id})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn btn-danger btn-icon" title="Smazat" onclick="admin.pages.deleteItem(${item.id})">
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

  async renderSpecialPages() {
    const tbody = document.getElementById('specialPagesTableBody');
    if (!tbody) return;

  // Načteme stránku "caste-dotazy" přímo z DB
  let faqPage = null;
  try {
    const response = await fetch('/api/pages/admin/all', {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });
      const contentType = response.headers.get('content-type');
      if (response.ok && contentType?.includes('application/json')) {
        const pages = await response.json();
        faqPage = pages.find(p => p.slug === 'caste-dotazy');
      }
    } catch (err) {
      console.error('Error loading FAQ page:', err);
    }

    if (!faqPage) {
      tbody.innerHTML = `<tr><td colspan="4">
        <div class="table-empty"><p>Stránka Časté dotazy nenalezena.</p></div>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = `<tr onclick="admin.pages.editFaqPage(${faqPage.id})" style="cursor:pointer;">
      <td class="col-id">${faqPage.id}</td>
      <td>
        <div class="table-title">${esc(faqPage.title_cz || 'Časté dotazy')}</div>
        <div class="table-sub">${esc(faqPage.title_en || 'FAQ')}</div>
      </td>
      <td><code style="font-size:12px;">${esc(faqPage.slug || 'caste-dotazy')}</code></td>
      <td class="col-status">
        <span class="badge ${faqPage.is_published ? 'badge-success' : 'badge-neutral'}">
          ${faqPage.is_published ? 'Publikováno' : 'Skryta'}
        </span>
      </td>
    </tr>`;
  }

  editFaqPage(id) {
    // Otevřeme standardní modal stránky, ale uživatel může přidávat FAQ otázky
    this.showModal(id);
  }

  addFaqFromModal(lang) {
    // Otevření FAQ modalu z pages modalu
    if (window.admin?.faqs) {
      window.admin.faqs.showModal();
    }
  }

  _generateSlug(text) {
    const replacements = {
      'á': 'a', 'ä': 'a', 'å': 'a', 'ā': 'a', 'ą': 'a', 'ă': 'a', 'ȧ': 'a', 'α': 'a',
      'č': 'c', 'ć': 'c', 'ç': 'c', 'ċ': 'c', 'ĉ': 'c', 'χ': 'c',
      'ď': 'd', 'đ': 'd', 'δ': 'd',
      'ě': 'e', 'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e', 'ę': 'e', 'ė': 'e', 'ē': 'e', 'ε': 'e',
      'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i', 'į': 'i', 'ī': 'i', 'ι': 'i',
      'ň': 'n', 'ń': 'n', 'ñ': 'n', 'ň': 'n', 'ν': 'n',
      'ř': 'r', 'ŕ': 'r', 'ρ': 'r',
      'š': 's', 'ś': 's', 'ş': 's', 'ș': 's', 'σ': 's',
      'ť': 't', 'ț': 't', 'τ': 't',
      'ů': 'u', 'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u', 'ų': 'u', 'ū': 'u', 'ȳ': 'u', 'ύ': 'u', 'υ': 'u',
      'ý': 'y', 'ÿ': 'y', 'ψ': 'y',
      'ž': 'z', 'ź': 'z', 'ż': 'z', 'ζ': 'z',
      'β': 'b', 'γ': 'g', 'η': 'h', 'θ': 'th', 'κ': 'k', 'λ': 'l', 'μ': 'm', 'ξ': 'x', 'ο': 'o', 'π': 'p', 'φ': 'f',
      'ο': 'o',
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

    document.getElementById('pagesModalTitle').textContent = item ? 'Upravit stránku' : 'Přidat stránku';

    document.getElementById('pagesSlug').value         = item?.slug         || '';
    document.getElementById('pagesTitleCz').value      = item?.title_cz     || '';
    document.getElementById('pagesTitleEn').value      = item?.title_en     || '';
    document.getElementById('pagesExcerptCz').value    = item?.excerpt_cz   || '';
    document.getElementById('pagesExcerptEn').value    = item?.excerpt_en   || '';
    document.getElementById('pagesContentCz').value    = item?.content_cz   || '';
    document.getElementById('pagesContentEn').value    = item?.content_en   || '';
    document.getElementById('pagesCoverImage').value   = item?.cover_image  || '';
    document.getElementById('pagesSeoTitleCz').value   = item?.seo_title_cz || '';
    document.getElementById('pagesSeoTitleEn').value   = item?.seo_title_en || '';
    document.getElementById('pagesSeoDescCz').value    = item?.seo_desc_cz  || '';
    document.getElementById('pagesSeoDescEn').value    = item?.seo_desc_en  || '';
    document.getElementById('pagesPublished').checked  = item ? !!item.is_published : true;
    document.getElementById('pagesOrder').value        = item?.display_order ?? 0;

    document.getElementById('pagesModal').classList.remove('hidden');

    const titleInput = document.getElementById('pagesTitleCz');
    const slugInput = document.getElementById('pagesSlug');
    let slugManuallyEdited = !!item;
    if (!item) {
      slugInput.addEventListener('input', () => { slugManuallyEdited = true; });
      titleInput.addEventListener('input', () => {
        if (!slugManuallyEdited && titleInput.value) {
          slugInput.value = this._generateSlug(titleInput.value);
        }
      });
    }

    const form = document.getElementById('pagesForm');
    if (!form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveItem();
      });
    }
  }

  closeModal() {
    document.getElementById('pagesModal').classList.add('hidden');
    this._editing = null;
  }

async saveItem() {
    if (this._saving) return;
    this._saving = true;

    const title_cz = document.getElementById('pagesTitleCz').value.trim();
    if (!title_cz) {
      window.admin?.showNotification('Název CZ je povinný', 'error');
      this._saving = false;
      return;
    }

    const data = {
      slug: document.getElementById('pagesSlug').value.trim() || null,
      title_cz,
      title_en: document.getElementById('pagesTitleEn').value.trim() || null,
      excerpt_cz: document.getElementById('pagesExcerptCz').value.trim() || null,
      excerpt_en: document.getElementById('pagesExcerptEn').value.trim() || null,
      content_cz: document.getElementById('pagesContentCz').value.trim() || null,
      content_en: document.getElementById('pagesContentEn').value.trim() || null,
      cover_image: document.getElementById('pagesCoverImage').value.trim() || null,
      seo_title_cz: document.getElementById('pagesSeoTitleCz').value.trim() || null,
      seo_title_en: document.getElementById('pagesSeoTitleEn').value.trim() || null,
      seo_desc_cz: document.getElementById('pagesSeoDescCz').value.trim() || null,
      seo_desc_en: document.getElementById('pagesSeoDescEn').value.trim() || null,
      is_published: document.getElementById('pagesPublished').checked ? 1 : 0,
      display_order: Number(document.getElementById('pagesOrder').value) || 0,
    };

    const isEdit = !!this._editing;
    const url = isEdit ? `/api/pages/admin/${this._editing.id}` : '/api/pages/admin';
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
      window.admin?.showNotification(isEdit ? 'Stránka upravena' : 'Stránka přidána', 'success');
    } catch (err) {
      console.error('Pages save error:', err);
      window.admin?.showNotification('Chyba ukládání: ' + err.message, 'error');
    } finally {
this._saving = false;
    }
  }

  async deleteItem(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    if (!confirm(`Smazat stránku "${item.title_cz}"?`)) return;

    try {
      const response = await fetch(`/api/pages/admin/${id}`, {
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
      window.admin?.showNotification('Stránka smazána', 'success');
    } catch (err) {
      console.error('Pages delete error:', err);
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
