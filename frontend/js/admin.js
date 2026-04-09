import { AuthManager }              from './auth.js';
import { SettingsManager }          from '../admin/settings.js';
import { ContactsManager }          from '../admin/contacts.js';
import { CarouselManager }          from '../admin/carousel.js';
import { NewsManager }              from '../admin/news.js';
import { PagesManager }             from '../admin/pages.js';
import { ProductCategoriesManager } from '../admin/product-categories.js';
import { NewsCategoriesManager }    from '../admin/news-categories.js';
import { ProductsManager }          from '../admin/products.js';
import { AppGroupsManager }         from '../admin/app-groups.js';
import { ApplicationsManager }      from '../admin/applications.js';
import { TrainingsManager }         from '../admin/trainings.js';
import { ButtonsManager }           from '../admin/buttons.js';
import { FormsManager }             from '../admin/forms.js';
import { SubmissionsManager }       from '../admin/submissions.js';
import { GalleryManager }           from '../admin/gallery.js';
import { MenuManager }              from '../admin/menu.js';
import { FaqsManager }             from '../admin/faqs.js';

class AdminController {
  constructor() {
    this.auth        = new AuthManager();
    this.settings    = new SettingsManager(this.auth);
    this.contacts    = new ContactsManager(this.auth);
    this.carousel    = new CarouselManager(this.auth);
    this.news        = new NewsManager(this.auth);
    this.pages       = new PagesManager(this.auth);
    this.prodCats    = new ProductCategoriesManager(this.auth);
    this.newsCats    = new NewsCategoriesManager(this.auth);
    this.products    = new ProductsManager(this.auth);
    this.appGroups   = new AppGroupsManager(this.auth);
    this.apps        = new ApplicationsManager(this.auth);
    this.trainings   = new TrainingsManager(this.auth);
    this.buttons     = new ButtonsManager(this.auth);
    this.forms       = new FormsManager(this.auth);
    this.submissions = new SubmissionsManager(this.auth);
    this.gallery     = new GalleryManager(this.auth);
    this.menu        = new MenuManager(this.auth);
    this.faqs        = new FaqsManager(this.auth);
  }

  async init() {
    const ok = await this.auth.checkAuth();
    if (!ok) return;

    // Show user info
    const user     = this.auth.user;
    const emailEl  = document.getElementById('adminUserEmail');
    const avatarEl = document.getElementById('adminUserAvatar');
    if (emailEl)  emailEl.textContent  = user?.email || '';
    if (avatarEl) avatarEl.textContent = (user?.email || '?')[0].toUpperCase();

    this._setupNavigation();
    this._bindGlobalHandlers();

    // Load initial section
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    this.loadSection(hash);
  }

  _setupNavigation() {
    document.querySelectorAll('[data-section]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const section = link.dataset.section;
        this.loadSection(section);
        window.location.hash = section;
      });
    });
  }

  _bindGlobalHandlers() {
    const logoutBtn = document.getElementById('btnLogout');
    if (logoutBtn) logoutBtn.addEventListener('click', () => this.auth.logout());
  }

  loadSection(section) {
    // Hide all sections
    document.querySelectorAll('.admin-section').forEach(el => el.classList.remove('active'));

    // Update active nav link
    document.querySelectorAll('[data-section]').forEach(link => {
      link.classList.toggle('active', link.dataset.section === section);
    });

    // Update header title
    const titles = {
      dashboard:         'Přehled',
      carousel:          'Karusel',
      news:              'Novinky',
      pages:             'Stránky',
      productCategories: 'Kategorie & Sekce',
      products:          'Produkty',
      appGroups:         'Skupiny aplikací',
      applications:      'Aplikace',
      trainings:         'Školení',
      forms:             'Formuláře',
      buttons:           'Tlačítka',
      submissions:       'Odpovědi',
      gallery:           'Galerie',
      menu:              'Menu',
      contacts:          'Kontakty',
      settings:          'Nastavení',
      faqs:             'FAQ',
    };
    const titleEl = document.getElementById('admin-section-title');
    if (titleEl) titleEl.textContent = titles[section] || section;

    // Show target section
    const sectionEl = document.getElementById(`${section}Section`);
    if (sectionEl) sectionEl.classList.add('active');

    // Initialize manager
    switch (section) {
      case 'dashboard':         this._loadDashboard();       break;
      case 'settings':          this.settings.init();        break;
      case 'contacts':          this.contacts.init();        break;
      case 'carousel':          this.carousel.init();        break;
      case 'news':              this.news.init();            break;
      case 'pages':             this.pages.init(); this.faqs.init(); break;
      case 'productCategories': this.prodCats.init(); this.newsCats.init(); this.appGroups.init(); break;
      case 'products':          this.products.init();        break;
      case 'appGroups':         this.appGroups.init();       break;
      case 'applications':      this.apps.init();            break;
      case 'trainings':         this.trainings.init();       break;
      case 'buttons':           this.buttons.init();         break;
      case 'forms':             this.forms.init();           break;
      case 'submissions':       this.submissions.init();     break;
      case 'gallery':           this.gallery.init();         break;
      case 'menu':              this.menu.init();            break;
      case 'faqs':              this.faqs.init();            break;
    }
  }

  _switchCatTab(tab) {
    const panels = { prod: document.getElementById('catPanelProd'), news: document.getElementById('catPanelNews'), appGroups: document.getElementById('catPanelAppGroups') };
    const tabs   = { prod: document.getElementById('catTabProd'),   news: document.getElementById('catTabNews'),   appGroups: document.getElementById('catTabAppGroups') };
    Object.keys(panels).forEach(key => {
      if (panels[key]) panels[key].style.display = key === tab ? '' : 'none';
      if (tabs[key]) {
        tabs[key].style.color       = key === tab ? '#2563eb' : '#6b7280';
        tabs[key].style.fontWeight  = key === tab ? '600'     : '500';
        tabs[key].style.borderBottom = key === tab ? '2px solid #2563eb' : '2px solid transparent';
      }
    });
  }

  _switchPagesTab(tab) {
    const panels = { std: document.getElementById('pagesPanelStd'), special: document.getElementById('pagesPanelSpecial') };
    const tabs   = { std: document.getElementById('pagesTabStd'),   special: document.getElementById('pagesTabSpecial') };
    Object.keys(panels).forEach(key => {
      if (panels[key]) panels[key].style.display = key === tab ? '' : 'none';
      if (tabs[key]) {
        tabs[key].style.color       = key === tab ? '#2563eb' : '#6b7280';
        tabs[key].style.fontWeight  = key === tab ? '600'     : '500';
        tabs[key].style.borderBottom = key === tab ? '2px solid #2563eb' : '2px solid transparent';
      }
    });
    if (tab === 'special' && this.faqs) this.faqs.loadItems();
  }

  async _loadDashboard() {
    const statEls = {
      contacts:  document.getElementById('statContacts'),
      products:  document.getElementById('statProducts'),
      news:      document.getElementById('statNews'),
      trainings: document.getElementById('statTrainings'),
    };

    // Contacts
    try {
      const r  = await fetch('/api/contacts/admin/all', { headers: this.auth.getAuthHeaders() });
      const ct = r.headers.get('content-type');
      if (r.ok && ct?.includes('application/json')) {
        const data = await r.json();
        if (statEls.contacts) statEls.contacts.textContent = data.length;
      }
    } catch { /* non-critical */ }

    // Products
    try {
      const r  = await fetch('/api/products/admin/all', { headers: this.auth.getAuthHeaders() });
      const ct = r.headers.get('content-type');
      if (r.ok && ct?.includes('application/json')) {
        const data = await r.json();
        if (statEls.products) statEls.products.textContent = data.length;
      }
    } catch { /* non-critical */ }

    // News
    try {
      const r  = await fetch('/api/news/admin/all', { headers: this.auth.getAuthHeaders() });
      const ct = r.headers.get('content-type');
      if (r.ok && ct?.includes('application/json')) {
        const data = await r.json();
        if (statEls.news) statEls.news.textContent = data.length;
      }
    } catch { /* non-critical */ }

    // Trainings (upcoming – date_start >= today)
    try {
      const r  = await fetch('/api/trainings/admin/all', { headers: this.auth.getAuthHeaders() });
      const ct = r.headers.get('content-type');
      if (r.ok && ct?.includes('application/json')) {
        const data = await r.json();
        const today = new Date().toISOString().substring(0, 10);
        const upcoming = data.filter(t => t.date_start && t.date_start >= today);
        if (statEls.trainings) statEls.trainings.textContent = upcoming.length;
      }
    } catch { /* non-critical */ }
  }

  showNotification(message, type = 'info') {
    const container = document.getElementById('admin-toast');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className   = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity    = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
}

const admin = new AdminController();
window.admin = admin;
admin.init();
