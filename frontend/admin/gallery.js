/**
 * GalleryManager – manage gallery folders and images.
 * Admin Manager Pattern.
 */
export class GalleryManager {
  constructor(auth) {
    this.auth           = auth;
    this.folders        = [];
    this.images         = [];
    this._currentFolder = null;
    this._editingFolder = null;
    this._editingImage  = null;
    this._uploading     = false;
  }

  async init() {
    await this.loadFolders();
    await this.loadImages();
    this._bindButtons();
  }

  _bindButtons() {
    const btnFolder = document.getElementById('btnAddGalFolder');
    if (btnFolder && !btnFolder.dataset.bound) {
      btnFolder.dataset.bound = '1';
      btnFolder.addEventListener('click', () => this.showFolderModal());
    }

    const btnUpload = document.getElementById('btnUploadGalImage');
    if (btnUpload && !btnUpload.dataset.bound) {
      btnUpload.dataset.bound = '1';
      btnUpload.addEventListener('click', () => this.showUploadModal());
    }

    const uploadForm = document.getElementById('galUploadForm');
    if (uploadForm && !uploadForm.dataset.bound) {
      uploadForm.dataset.bound = '1';
      uploadForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.uploadImage();
      });
    }

    const folderForm = document.getElementById('galFolderForm');
    if (folderForm && !folderForm.dataset.bound) {
      folderForm.dataset.bound = '1';
      folderForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveFolder();
      });
    }

    const imageForm = document.getElementById('galImageForm');
    if (imageForm && !imageForm.dataset.bound) {
      imageForm.dataset.bound = '1';
      imageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveImage();
      });
    }
  }

  async loadFolders() {
    try {
      const response = await fetch('/api/gallery/folders/admin/all', {
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
      this.folders = await response.json();
      this.renderFolders();
    } catch (err) {
      console.error('Gallery folders load error:', err);
      window.admin?.showNotification('Chyba načítání složek: ' + err.message, 'error');
    }
  }

  async loadImages() {
    try {
      const url = this._currentFolder
        ? `/api/gallery/images/admin/all?folder_id=${this._currentFolder}`
        : '/api/gallery/images/admin/all';

      const response = await fetch(url, {
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
      this.images = await response.json();
      this.renderImages();
    } catch (err) {
      console.error('Gallery images load error:', err);
      window.admin?.showNotification('Chyba načítání obrázků: ' + err.message, 'error');
    }
  }

  renderFolders() {
    const container = document.getElementById('galFolderList');
    if (!container) return;

    const roots    = this.folders.filter(f => !f.parent_id);
    const children = this.folders.filter(f => f.parent_id);

    const buildItem = (folder, depth = 0) => {
      const isActive   = this._currentFolder === folder.id;
      const subfolders = children.filter(f => f.parent_id === folder.id);
      return `
        <div class="gal-folder-item ${isActive ? 'gal-folder-active' : ''}" style="padding-left:${12 + depth * 16}px;"
             onclick="admin.gallery.selectFolder(${folder.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;flex-shrink:0;">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(folder.name_cz || '–')}</span>
          <div style="display:flex;gap:2px;flex-shrink:0;">
            <button class="btn btn-ghost btn-icon" style="width:22px;height:22px;" title="Upravit"
              onclick="event.stopPropagation();admin.gallery.showFolderModal(${folder.id})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn btn-danger btn-icon" style="width:22px;height:22px;" title="Smazat"
              onclick="event.stopPropagation();admin.gallery.deleteFolder(${folder.id})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14H6L5 6"/>
              </svg>
            </button>
          </div>
        </div>
        ${subfolders.map(sf => buildItem(sf, depth + 1)).join('')}
      `;
    };

    const allItem = `
      <div class="gal-folder-item ${this._currentFolder === null ? 'gal-folder-active' : ''}" style="padding-left:12px;"
           onclick="admin.gallery.selectFolder(null)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;flex-shrink:0;">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        <span>Všechny obrázky</span>
      </div>
    `;

    container.innerHTML = allItem + roots.map(f => buildItem(f)).join('');
  }

  selectFolder(folderId) {
    this._currentFolder = folderId;
    this.renderFolders();
    this.loadImages();
  }

  renderImages() {
    const container = document.getElementById('galImageGrid');
    if (!container) return;

    if (!this.images.length) {
      container.innerHTML = `<div class="table-empty" style="grid-column:1/-1;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:40px;height:40px;">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        <p>Žádné obrázky v této složce.</p>
      </div>`;
      return;
    }

    container.innerHTML = this.images.map(img => `
      <div class="gal-image-card">
        <div class="gal-image-thumb">
          <img src="${esc(img.image_url || img.identifier)}" alt="${esc(img.title_cz || '')}"
               onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
               style="width:100%;height:120px;object-fit:cover;">
          <div style="display:none;width:100%;height:120px;background:#f3f4f6;align-items:center;justify-content:center;color:#9ca3af;font-size:11px;">
            no preview
          </div>
        </div>
        <div class="gal-image-info">
          <div style="font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(img.title_cz || img.image_url || img.identifier)}">
            ${esc(img.title_cz || img.identifier || '–')}
          </div>
          <div style="font-size:11px;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${esc(img.image_url || '')}
          </div>
        </div>
        <div class="gal-image-actions">
          <button class="btn btn-ghost btn-icon btn-sm" title="Upravit" onclick="admin.gallery.showImageModal(${img.id})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="btn btn-danger btn-icon btn-sm" title="Smazat" onclick="admin.gallery.deleteImage(${img.id})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/>
            </svg>
          </button>
        </div>
      </div>
    `).join('');
  }

  // ── Folder Modal ──────────────────────────────────────────────────────────

  showFolderModal(id = null) {
    const folder = id ? this.folders.find(f => f.id === id) : null;
    this._editingFolder = folder;

    document.getElementById('galFolderModalTitle').textContent = folder ? 'Upravit složku' : 'Nová složka';

    document.getElementById('galFolderNameCz').value = folder?.name_cz       || '';
    document.getElementById('galFolderNameEn').value = folder?.name_en       || '';
    document.getElementById('galFolderSlug').value   = folder?.slug          || '';
    document.getElementById('galFolderOrder').value  = folder?.display_order ?? 0;

    // Parent select
    const parentSelect = document.getElementById('galFolderParentId');
    parentSelect.innerHTML = '<option value="">— Kořenová složka —</option>';
    this.folders
      .filter(f => f.id !== id)
      .forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = f.name_cz;
        if (folder?.parent_id === f.id) opt.selected = true;
        parentSelect.appendChild(opt);
      });

    document.getElementById('galFolderModal').classList.remove('hidden');
  }

  closeFolderModal() {
    document.getElementById('galFolderModal').classList.add('hidden');
    this._editingFolder = null;
  }

  async saveFolder() {
    const name_cz = document.getElementById('galFolderNameCz').value.trim();
    if (!name_cz) {
      window.admin?.showNotification('Název složky CZ je povinný', 'error');
      return;
    }

    const parentVal = document.getElementById('galFolderParentId').value;
    const data = {
      name_cz,
      name_en:       document.getElementById('galFolderNameEn').value.trim() || null,
      slug:          document.getElementById('galFolderSlug').value.trim()   || null,
      parent_id:     parentVal ? Number(parentVal) : null,
      display_order: Number(document.getElementById('galFolderOrder').value) || 0,
    };

    const isEdit = !!this._editingFolder;
    const url    = isEdit ? `/api/gallery/folders/admin/${this._editingFolder.id}` : '/api/gallery/folders/admin';
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
      this.closeFolderModal();
      await this.loadFolders();
      window.admin?.showNotification(isEdit ? 'Složka upravena' : 'Složka vytvořena', 'success');
    } catch (err) {
      console.error('Gallery folder save error:', err);
      window.admin?.showNotification('Chyba ukládání složky: ' + err.message, 'error');
    }
  }

  async deleteFolder(id) {
    const folder = this.folders.find(f => f.id === id);
    if (!folder) return;
    if (!confirm(`Smazat složku "${folder.name_cz}"? Obrázky ve složce zůstanou bez přiřazení.`)) return;

    try {
      const response = await fetch(`/api/gallery/folders/admin/${id}`, {
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
      if (this._currentFolder === id) this._currentFolder = null;
      await this.loadFolders();
      await this.loadImages();
      window.admin?.showNotification('Složka smazána', 'success');
    } catch (err) {
      console.error('Gallery folder delete error:', err);
      window.admin?.showNotification('Chyba mazání složky: ' + err.message, 'error');
    }
  }

  // ── Image Modal (edit) ────────────────────────────────────────────────────

  showImageModal(id) {
    const img = this.images.find(i => i.id === id);
    if (!img) return;
    this._editingImage = img;

    document.getElementById('galImageTitleCz').value = img.title_cz || '';
    document.getElementById('galImageTitleEn').value = img.title_en || '';
    document.getElementById('galImageDescCz').value  = img.desc_cz  || '';
    document.getElementById('galImageDescEn').value  = img.desc_en  || '';
    document.getElementById('galImageTags').value    = img.tags     || '';

    // Folder select
    const folderSelect = document.getElementById('galImageFolderId');
    folderSelect.innerHTML = '<option value="">— Žádná složka —</option>';
    this.folders.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.name_cz;
      if (img.folder_id === f.id) opt.selected = true;
      folderSelect.appendChild(opt);
    });

    document.getElementById('galImageModal').classList.remove('hidden');
  }

  closeImageModal() {
    document.getElementById('galImageModal').classList.add('hidden');
    this._editingImage = null;
  }

  async saveImage() {
    if (!this._editingImage) return;

    const folderVal = document.getElementById('galImageFolderId').value;
    const data = {
      title_cz:  document.getElementById('galImageTitleCz').value.trim() || null,
      title_en:  document.getElementById('galImageTitleEn').value.trim() || null,
      desc_cz:   document.getElementById('galImageDescCz').value.trim()  || null,
      desc_en:   document.getElementById('galImageDescEn').value.trim()  || null,
      tags:      document.getElementById('galImageTags').value.trim()    || null,
      folder_id: folderVal ? Number(folderVal) : null,
    };

    try {
      const response = await fetch(`/api/gallery/images/admin/${this._editingImage.id}`, {
        method: 'PUT',
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
      this.closeImageModal();
      await this.loadImages();
      window.admin?.showNotification('Obrázek upraven', 'success');
    } catch (err) {
      console.error('Gallery image save error:', err);
      window.admin?.showNotification('Chyba ukládání obrázku: ' + err.message, 'error');
    }
  }

  async deleteImage(id) {
    if (!confirm('Smazat tento obrázek?')) return;

    try {
      const response = await fetch(`/api/gallery/images/admin/${id}`, {
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
      await this.loadImages();
      window.admin?.showNotification('Obrázek smazán', 'success');
    } catch (err) {
      console.error('Gallery image delete error:', err);
      window.admin?.showNotification('Chyba mazání obrázku: ' + err.message, 'error');
    }
  }

  // ── Upload Modal ──────────────────────────────────────────────────────────

  showUploadModal() {
    document.getElementById('galUploadFile').value    = '';
    document.getElementById('galUploadTitleCz').value = '';
    document.getElementById('galUploadTitleEn').value = '';

    // Folder select for upload
    const folderSelect = document.getElementById('galUploadFolderId');
    folderSelect.innerHTML = '<option value="">— Žádná složka —</option>';
    this.folders.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.name_cz;
      if (this._currentFolder === f.id) opt.selected = true;
      folderSelect.appendChild(opt);
    });

    document.getElementById('galUploadModal').classList.remove('hidden');
  }

  closeUploadModal() {
    document.getElementById('galUploadModal').classList.add('hidden');
  }

  async uploadImage() {
    if (this._uploading) return;

    const fileInput = document.getElementById('galUploadFile');
    if (!fileInput.files || !fileInput.files[0]) {
      window.admin?.showNotification('Vyberte soubor', 'error');
      return;
    }

    const submitBtn = document.querySelector('#galUploadForm button[type="submit"]');
    this._uploading = true;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Nahrávám…'; }

    const formData = new FormData();
    formData.append('image', fileInput.files[0]);

    const titleCz   = document.getElementById('galUploadTitleCz').value.trim();
    const titleEn   = document.getElementById('galUploadTitleEn').value.trim();
    const folderVal = document.getElementById('galUploadFolderId').value;

    if (titleCz)   formData.append('title_cz',  titleCz);
    if (titleEn)   formData.append('title_en',  titleEn);
    if (folderVal) formData.append('folder_id', folderVal);

    try {
      // IMPORTANT: do NOT set Content-Type header – let browser set multipart boundary
      const authHeaders = this.auth.getAuthHeaders();
      const headers = { Authorization: authHeaders.Authorization };

      const response = await fetch('/api/gallery/images/admin/upload', {
        method: 'POST',
        headers,
        body: formData
      });
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json')
          ? await response.json()
          : { error: await response.text() };
        throw new Error(err.error || 'Request failed');
      }
      this.closeUploadModal();
      await this.loadImages();
      window.admin?.showNotification('Obrázek nahrán', 'success');
    } catch (err) {
      console.error('Gallery upload error:', err);
      window.admin?.showNotification('Chyba nahrávání: ' + err.message, 'error');
    } finally {
      this._uploading = false;
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Nahrát'; }
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
