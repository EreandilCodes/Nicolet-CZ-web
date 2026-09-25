/**
 * Nicolet CZ – Public SPA
 * Full implementation: homepage, carousel, products, applications, trainings, news, pages, search
 */

/** Lazy-loaded DOMPurify — self-hosted, no CDN dependency. */
let _DOMPurify = null;
async function _loadDOMPurify() {
  if (_DOMPurify) return _DOMPurify;
  try {
    const mod = await import('/js/vendor/purify.es.mjs');
    _DOMPurify = mod.default;
  } catch (err) {
    console.error('DOMPurify failed to load:', err);
  }
  return _DOMPurify;
}
function sanitize(html) {
  if (_DOMPurify) return _DOMPurify.sanitize(html || '', { USE_PROFILES: { html: true } });
  // Safe fallback: strip all HTML tags if DOMPurify unavailable
  return (html || '').replace(/<[^>]*>/g, '');
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function stripHtml(str) {
  return String(str || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Count grid columns by measuring how many items share the first row's offsetTop
function gridColumns(grid, itemSel) {
  const items = Array.from(grid.querySelectorAll(itemSel));
  if (!items.length) return 3;
  const firstTop = items[0].offsetTop; // forces synchronous layout
  let cols = 0;
  for (const item of items) { if (item.offsetTop > firstTop + 5) break; cols++; }
  return Math.max(cols, 1);
}

function getLang() {
  return localStorage.getItem('nicolet_lang') || 'cz';
}

function setLang(lang) {
  localStorage.setItem('nicolet_lang', lang);
  app.route();
  app.updateLangUI();
  app._renderNav();
}

/** Extract fulfilled value from Promise.allSettled result, with fallback */
function settled(result, fallback = []) {
  return result.status === 'fulfilled' ? result.value : fallback;
}

function pick(czVal, enVal) {
  if (getLang() === 'en' && enVal) return enVal;
  return czVal || '';
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString(getLang() === 'en' ? 'en-GB' : 'cs-CZ', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  } catch { return dateStr; }
}

async function safeFetch(url) {
  const response = await fetch(url);
  const contentType = response.headers.get('content-type');
  if (!response.ok) {
    const err = contentType?.includes('application/json')
      ? await response.json()
      : { error: await response.text() };
    throw new Error(err.error || 'Request failed');
  }
  if (!contentType?.includes('application/json')) throw new Error('Neplatná odpověď serveru');
  return response.json();
}

/** Update document title + meta tags for SPA route changes */
function updateMeta({ title, description, ogImage, canonical }) {
  const base = 'Nicolet CZ – Molekulová spektroskopie';
  document.title = title ? `${title} – Nicolet CZ` : base;
  const setMeta = (sel, content) => {
    const el = document.querySelector(sel);
    if (el && content) el.setAttribute('content', content);
  };
  const desc = description || '';
  setMeta('meta[name="description"]', desc);
  setMeta('meta[property="og:title"]', document.title);
  setMeta('meta[property="og:description"]', desc);
  setMeta('meta[name="twitter:title"]', document.title);
  setMeta('meta[name="twitter:description"]', desc);
  if (ogImage) setMeta('meta[property="og:image"]', ogImage);
  const url = canonical || window.location.href;
  setMeta('meta[property="og:url"]', url);
  const canon = document.querySelector('link[rel="canonical"]');
  if (canon) canon.setAttribute('href', url);
}

// ── Static UI texts ───────────────────────────────────────────────────────────
const UI = {
  cz: {
    nav: {
      news: 'Novinky', products: 'Produkty', about: 'O nás',
      training: 'Školení a kurzy', appSupport: 'Aplikační podpora',
      applications: 'Aplikace',
    },
    search: {
      placeholder: 'Hledat produkty, aplikace, novinky…',
      close: 'Zavřít', no_results: 'Žádné výsledky',
    },
    common: {
      loading: 'Načítám…', read_more: 'Číst více', back: 'Zpět', load_more: 'Načíst více',
      published: 'Publikováno', date: 'Datum', contact: 'Kontakt',
      all_products: 'Všechny produkty', all_apps: 'Všechny aplikace',
      all_news: 'Všechny novinky', trainings: 'Termíny školení', all_trainings: 'Všechna školení',
      upcoming_trainings: 'Nejbližší školení',
      no_items: 'Žádné položky.', page_not_found: 'Stránka nenalezena',
      page_not_found_desc: 'Tato stránka neexistuje nebo byla přesunuta.',
      back_home: 'Zpět na hlavní stránku',
      contact_us: 'Kontaktujte nás',
      featured: 'Doporučeno',
      date_from: 'Od', date_to: 'Do', location: 'Místo',
      download_spec: 'Technická specifikace',
      related_products: 'Související produkty',
      search_results: 'Výsledky hledání',
      search_for: 'Hledat',
    }
  },
  en: {
    nav: {
      news: 'News', products: 'Products', about: 'About us',
      training: 'Training & courses', appSupport: 'Application support',
      applications: 'Applications',
    },
    search: {
      placeholder: 'Search products, applications, news…',
      close: 'Close', no_results: 'No results',
    },
    common: {
      loading: 'Loading…', read_more: 'Read more', back: 'Back', load_more: 'Load more',
      published: 'Published', date: 'Date', contact: 'Contact',
      all_products: 'All products', all_apps: 'All applications',
      all_news: 'All news', trainings: 'Training schedule', all_trainings: 'All trainings',
      upcoming_trainings: 'Upcoming trainings',
      no_items: 'No items.', page_not_found: 'Page not found',
      page_not_found_desc: 'This page does not exist or has been moved.',
      back_home: 'Back to homepage',
      contact_us: 'Contact us',
      featured: 'Featured',
      date_from: 'From', date_to: 'To', location: 'Location',
      download_spec: 'Technical specification',
      related_products: 'Related products',
      search_results: 'Search results',
      search_for: 'Search',
    }
  }
};

function t(path) {
  const keys = path.split('.');
  let obj = UI[getLang()];
  for (const k of keys) { if (!obj) return path; obj = obj[k]; }
  return obj || path;
}

// ── Main App ──────────────────────────────────────────────────────────────────
class PublicApp {
  constructor() {
    this.lang     = getLang();
    this.settings = {};
    this.menuItems = [];
    this._categories = null;   // cached
    this._appGroups  = null;   // cached

    // Apply cached logo instantly (avoids flash while settings API loads)
    try {
      const cachedLogo = localStorage.getItem('nicolet_logo_url') || '';
      if (cachedLogo) {
        this._applyLogoEl('headerLogoImg', 'headerLogoText', cachedLogo);
        this._applyLogoEl('footerLogoImg',  'footerLogoText',  cachedLogo);
      }
    } catch { /* no cache available */ }
  }

  async init() {
    try { this.settings = await safeFetch('/api/settings/public'); }
    catch { this.settings = {}; }

    // Load menu from DB
    try { this.menuItems = await safeFetch('/api/menu'); }
    catch { this.menuItems = []; }

    await this._renderNav();
    this._updateTopbar();
    this._updateFooter();
    this._updateLogo();
    this.updateLangUI();
    this._bindLangSwitch();
    this._bindSearch();
    this._bindFormModalButtons();
    this._bindMobileMenu();

    window.addEventListener('popstate', () => this.route());
    document.addEventListener('click', (e) => {
      const link = e.target.closest('[data-nav]');
      if (link) {
        const href = link.dataset.nav;
        const isExternal = href.startsWith('http://') || href.startsWith('https://');
        if (isExternal) return;
        e.preventDefault();
        this.navigate(href);
      }
    });

    await this.route();
  }

  async route() {
    const path  = window.location.pathname;
    const parts = path.split('/').filter(Boolean);
    const el    = document.getElementById('page-content');
    if (!el) return;

    el.innerHTML = `<div class="container" style="padding:80px 24px;text-align:center;color:var(--text-3)">${t('common.loading')}</div>`;

    try {
      if (path === '/' || path === '') {
        await this.renderHome(el);
      } else if (parts[0] === 'novinky' && parts[1]) {
        await this.renderNewsDetail(el, parts[1]);
      } else if (parts[0] === 'novinky') {
        await this.renderNewsList(el);
      } else if (parts[0] === 'produkty' && parts[1]) {
        await this.renderProductDetail(el, parts[1]);
      } else if (parts[0] === 'produkty') {
        await this.renderProducts(el);
      } else if (parts[0] === 'aplikace' && parts[1]) {
        await this.renderApplicationDetail(el, parts[1]);
      } else if (parts[0] === 'aplikace') {
        await this.renderApplications(el);
      } else if (parts[0] === 'skoleni') {
        await this.renderTrainings(el);
      } else if (parts[0] === 'hledat') {
        await this.renderSearch(el);
      } else if (parts[0] === 'stranka' && parts[1]) {
        await this.renderPage(el, parts[1]);
      } else if (parts[0] === 'faq') {
        await this.renderFaq(el);
      } else {
        this.render404(el);
      }
    } catch (err) {
      console.error('Route error:', err);
      el.innerHTML = `<div class="container section"><p style="color:var(--error)">Chyba načítání stránky.</p></div>`;
    }
  }

  navigate(path) {
    history.pushState(null, '', path);
    this.route();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── HOME ──────────────────────────────────────────────────────────────────

  async renderHome(el) {
    updateMeta({ title: null, description: 'Nicolet CZ – dodavatel přístrojů pro molekulovou spektroskopii na českém trhu více než 30 let.' });
    const [carouselItems, products, applications, newsPosts, trainingsRes, buttons] = await Promise.allSettled([
      safeFetch('/api/carousel'),
      safeFetch('/api/products?fields=list'),
      safeFetch('/api/applications?fields=list'),
      safeFetch('/api/news'),
      safeFetch('/api/trainings'),
      this._getButtons(),
    ]);

    const carousel = settled(carouselItems);
    const allProds = settled(products);
    const prods    = allProds.filter(p => p.is_featured);
    const prodRow  = prods.length ? prods : allProds;
    const allApps  = settled(applications);
    const apps     = allApps.filter(a => a.is_featured);
    const appRow   = apps.length ? apps : allApps;
    const news     = settled(newsPosts).slice(0, 3);

    // Upcoming trainings: filter future/today, already sorted ASC by date_start from API
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = settled(trainingsRes).filter(tr => tr.date_start >= today).slice(0, 3);

    // Default training button
    const btnMap = {};
    (settled(buttons) || []).forEach(b => { btnMap[b.id] = b; });
    const defaultTrainingBtn = this.settings.training_default_button_id
      ? (btnMap[this.settings.training_default_button_id] || null)
      : null;

    el.innerHTML = `
      ${this._renderCarousel(carousel)}
      ${this._renderLandingIntro()}
      ${prodRow.length ? this._renderFeaturedProducts(prodRow) : ''}
      ${appRow.length  ? this._renderFeaturedApplications(appRow) : ''}
      ${upcoming.length ? this._renderTrainingsTeaser(upcoming, defaultTrainingBtn) : ''}
      ${news.length  ? this._renderNewsTeaser(news) : ''}
      ${this._renderContactBanner()}
    `;
  }

  _renderLandingIntro() {
    return `<section class="landing-intro">
  <div class="landing-intro-wrapper">
    <div class="landing-intro-image">
      <img src="/uploads/NicoLandingPage.png" alt="Nicolet CZ">
    </div>
    <div class="landing-intro-card">
      <h2>Společnost Nicolet CZ s.r.o. působí na českém trhu více než 30 let.</h2>
      <p>Specializujeme se na molekulovou spektroskopii a dodáváme více než 30 typů analyzátorů od malých (mobilních/ručních) modelů přes specializované až po špičkové vědecké přístroje stavěné na zakázku.</p>
      <a href="/stranka/o-nas" class="btn btn-primary btn-sm" data-nav="/stranka/o-nas">
        Zjistit více
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </a>
    </div>
  </div>
</section>`;
  }

  _renderCarousel(items) {
    if (!items.length) {
      return `
        <div class="carousel-wrap carousel-wrap--empty">
          <div class="carousel-empty-inner">
            <div style="font-size:2.5rem;margin-bottom:12px;opacity:0.45">◈</div>
            <div style="font-size:1rem;color:rgba(255,255,255,0.72)">Nicolet CZ – Molekulová spektroskopie</div>
          </div>
        </div>`;
    }

    const slides = items.map((item, i) => `
      <div class="carousel-slide ${i === 0 ? 'active' : ''}" data-slide="${i}">
        <img src="${esc(item.image_url)}" alt="${esc(pick(item.title_cz, item.title_en))}" loading="${i === 0 ? 'eager' : 'lazy'}">
        ${item.show_text && (item.title_cz || item.subtitle_cz) ? `
          <div class="carousel-caption">
            ${item.title_cz ? `<h2>${esc(pick(item.title_cz, item.title_en))}</h2>` : ''}
            ${item.subtitle_cz ? `<p>${esc(pick(item.subtitle_cz, item.subtitle_en))}</p>` : ''}
            ${item.link_url ? `<a href="${esc(item.link_url)}" class="btn-primary-pub" data-nav="${esc(item.link_url)}">${t('common.read_more')}</a>` : ''}
          </div>` : ''}
      </div>`).join('');

    const dots = items.length > 1
      ? `<div class="carousel-dots">${items.map((_, i) => `<button class="carousel-dot ${i === 0 ? 'active' : ''}" data-goto="${i}"></button>`).join('')}</div>`
      : '';

    const arrows = items.length > 1 ? `
      <button class="carousel-arrow carousel-prev" aria-label="Předchozí">&#8592;</button>
      <button class="carousel-arrow carousel-next" aria-label="Další">&#8594;</button>` : '';

    setTimeout(() => this._initCarousel(), 0);

    return `<div class="carousel-wrap" id="main-carousel">${slides}${arrows}${dots}</div>`;
  }

  _initCarousel() {
    const wrap = document.getElementById('main-carousel');
    if (!wrap) return;
    let current = 0;
    const slides = wrap.querySelectorAll('.carousel-slide');
    const dots   = wrap.querySelectorAll('.carousel-dot');
    if (slides.length < 2) return;

    const go = (n) => {
      slides[current].classList.remove('active');
      dots[current]?.classList.remove('active');
      current = ((n % slides.length) + slides.length) % slides.length;
      slides[current].classList.add('active');
      dots[current]?.classList.add('active');
    };

    wrap.querySelector('.carousel-prev')?.addEventListener('click', () => go(current - 1));
    wrap.querySelector('.carousel-next')?.addEventListener('click', () => go(current + 1));
    dots.forEach(d => d.addEventListener('click', () => go(Number(d.dataset.goto))));

    // Auto-advance every 5s (loop infinitely)
    let timer = setInterval(() => go(current + 1), 5000);
    wrap.addEventListener('mouseenter', () => clearInterval(timer));
    wrap.addEventListener('mouseleave', () => { timer = setInterval(() => go(current + 1), 5000); });
  }

  _renderFeaturedProducts(prods) {
    const cards = prods.slice(0, 4).map(p => {
      let imgSrc = null;
      if (p.thumbnail_url) {
        imgSrc = p.thumbnail_url;
      } else if (p.images_json) {
        try {
          const imgs = JSON.parse(p.images_json);
          if (imgs[0]) imgSrc = typeof imgs[0] === 'string' ? imgs[0] : imgs[0].url;
        } catch {}
      }
      return `
      <a class="product-card" href="/produkty/${esc(p.slug)}" data-nav="/produkty/${esc(p.slug)}">
        ${imgSrc ? `<div class="product-card-img"><img src="${esc(imgSrc)}" alt="${esc(pick(p.name_cz, p.name_en))}" loading="lazy"></div>` : '<div class="product-card-img product-card-img-empty"></div>'}
        <div class="product-card-body">
          <div class="product-card-name">${esc(pick(p.name_cz, p.name_en))}</div>
          ${(p.excerpt_cz || p.description_cz) ? `<div class="product-card-desc">${esc(stripHtml(pick(p.excerpt_cz, p.excerpt_en) || pick(p.description_cz, p.description_en))).substring(0, 120)}…</div>` : ''}
          <span class="product-card-link">${t('common.read_more')} →</span>
        </div>
      </a>`}).join('');

    return `
      <section class="section-block">
        <div class="container">
          <div class="section-header">
            <div class="section-label">${t('common.featured')}</div>
            <h2 class="section-title">${t('nav.products')}</h2>
          </div>
          <div class="product-grid">${cards}</div>
          <div style="text-align:center;margin-top:32px">
            <a href="/produkty" data-nav="/produkty" class="btn-outline-pub">${t('common.all_products')}</a>
          </div>
        </div>
      </section>`;
  }

  _renderFeaturedApplications(apps) {
    const cards = apps.slice(0, 4).map(a => {
      const imgSrc = a.thumbnail_url || a.cover_image || null;
      return `
      <a class="app-card" href="/aplikace/${esc(a.slug)}" data-nav="/aplikace/${esc(a.slug)}">
        ${imgSrc ? `<div class="app-card-img"><img src="${esc(imgSrc)}" alt="${esc(pick(a.name_cz, a.name_en))}" loading="lazy"></div>` : '<div class="app-card-img app-card-img-empty"></div>'}
        <div class="app-card-body">
          <div class="app-card-name">${esc(pick(a.name_cz, a.name_en))}</div>
          ${(a.excerpt_cz || a.content_cz) ? `<div class="app-card-desc">${esc(pick(a.excerpt_cz, a.excerpt_en) || pick(a.content_cz, a.content_en)).substring(0, 100)}…</div>` : ''}
          <span class="app-card-link">${t('common.read_more')} →</span>
        </div>
      </a>`}).join('');

    return `
      <section class="section-block section-block-alt">
        <div class="container">
          <div class="section-header">
            <div class="section-label">${t('common.featured')}</div>
            <h2 class="section-title">${t('nav.applications')}</h2>
          </div>
          <div class="app-grid">${cards}</div>
          <div style="text-align:center;margin-top:32px">
            <a href="/aplikace" data-nav="/aplikace" class="btn-outline-pub">${t('common.all_apps')}</a>
          </div>
        </div>
      </section>`;
  }

  _renderNewsTeaser(posts) {
    const stripHtml = str => str ? str.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim() : '';
    const cards = posts.map(p => `
      <a class="news-card-teaser" href="/novinky/${esc(p.slug)}" data-nav="/novinky/${esc(p.slug)}">
        ${p.cover_image ? `<div class="news-card-img"><img src="${esc(p.cover_image)}" alt="${esc(pick(p.title_cz, p.title_en))}" loading="lazy"></div>` : ''}
        <div class="news-card-body">
          <div class="news-card-date">${fmtDate(p.published_at)}</div>
          <h3 class="news-card-title">${esc(pick(p.title_cz, p.title_en))}</h3>
          ${p.excerpt_cz ? `<p class="news-card-excerpt">${esc(stripHtml(pick(p.excerpt_cz, p.excerpt_en)))}</p>` : ''}
        </div>
      </a>`).join('');

    return `
      <section class="section-block">
        <div class="container">
          <div class="section-header">
            <h2 class="section-title">${t('nav.news')}</h2>
          </div>
          <div class="news-grid-teaser">${cards}</div>
          <div style="text-align:center;margin-top:32px">
            <a href="/novinky" data-nav="/novinky" class="btn-outline-pub">${t('common.all_news')}</a>
          </div>
        </div>
      </section>`;
  }

  _renderTrainingsTeaser(trainings, defaultBtn = null) {
    const cards = trainings.map(tr => {
      const ctaBtn = tr.cta_button_id
        ? null
        : defaultBtn;
      return `
      <div class="training-card">
        <div class="training-card-dates">
          <div class="training-date-from">
            <span class="training-date-label">${t('common.date_from')}</span>
            <span class="training-date-val">${fmtDate(tr.date_start)}</span>
          </div>
          ${tr.date_end ? `<div class="training-date-to">
            <span class="training-date-label">${t('common.date_to')}</span>
            <span class="training-date-val">${fmtDate(tr.date_end)}</span>
          </div>` : ''}
        </div>
        <div class="training-card-body">
          <h3 class="training-card-title">${esc(pick(tr.title_cz, tr.title_en))}</h3>
          ${tr.location_cz ? `<div class="training-card-location"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${esc(pick(tr.location_cz, tr.location_en))}</div>` : ''}
          ${ctaBtn ? `<div class="training-card-cta">${this._renderCtaButton(ctaBtn)}</div>` : ''}
        </div>
      </div>`}).join('');

    return `
      <section class="section-block section-block-alt">
        <div class="container">
          <div class="section-header">
            <div class="section-label">${t('common.upcoming_trainings')}</div>
            <h2 class="section-title">${t('nav.training')}</h2>
          </div>
          <div class="trainings-list">${cards}</div>
          <div style="text-align:center;margin-top:32px">
            <a href="/skoleni" data-nav="/skoleni" class="btn-outline-pub">${t('common.all_trainings')}</a>
          </div>
        </div>
      </section>`;
  }

  _renderContactBanner() {
    const phone = this.settings.contact_phone || '';
    const email = this.settings.contact_email || '';
    return `
      <section class="contact-banner">
        <div class="container">
          <h2>${t('common.contact_us')}</h2>
          <div class="contact-banner-items">
            ${phone ? `<a href="tel:${esc(phone)}" class="contact-banner-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.37 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 8a16 16 0 0 0 6 6z"/></svg>${esc(phone)}</a>` : ''}
            ${email ? `<a href="mailto:${esc(email)}" class="contact-banner-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>${esc(email)}</a>` : ''}
          </div>
        </div>
      </section>`;
  }

  // ── NEWS ──────────────────────────────────────────────────────────────────

  async renderNewsList(el) {
    updateMeta({ title: getLang() === 'en' ? 'News' : 'Novinky' });
    const [posts, cats] = await Promise.all([
      safeFetch('/api/news'),
      safeFetch('/api/news-categories').catch(() => []),
    ]);

    // Show newest categories first
    const sortedCats = [...cats].sort((a, b) => b.display_order - a.display_order);

    const filterHtml = sortedCats.length ? `
      <div class="filter-bar-pub">
        <button class="filter-chip active" data-cat-filter="">
          ${getLang() === 'en' ? 'All' : 'Vše'}
        </button>
        ${sortedCats.map(c => `<button class="filter-chip" data-cat-filter="${c.id}">${esc(pick(c.name_cz, c.name_en))}</button>`).join('')}
      </div>` : '';

    const cards = posts.map(p => `
      <a class="news-card" href="/novinky/${esc(p.slug)}" data-nav="/novinky/${esc(p.slug)}" data-news-cat="${p.category_id || ''}">
        ${p.cover_image ? `<div class="news-card-img"><img src="${esc(p.cover_image)}" alt="${esc(pick(p.title_cz, p.title_en))}" loading="lazy"></div>` : ''}
        <div class="news-card-body">
          <div class="news-card-date">${fmtDate(p.published_at)}</div>
          <h3 class="news-card-title">${esc(pick(p.title_cz, p.title_en))}</h3>
          ${p.excerpt_cz ? `<p class="news-card-excerpt">${esc(pick(p.excerpt_cz, p.excerpt_en))}</p>` : ''}
          <span class="news-card-link">${t('common.read_more')} →</span>
        </div>
      </a>`).join('');

    el.innerHTML = `
      <div class="container section">
        <div class="section-header">
          <h1 class="page-title">${t('nav.news')}</h1>
        </div>
        ${filterHtml}
        <div class="news-grid news-grid-full" id="newsGrid">${cards}</div>
        <div id="newsLoadMore" style="text-align:center;margin-top:32px;display:none">
          <button class="btn-outline-pub" id="newsLoadMoreBtn">${t('common.load_more')}</button>
        </div>
      </div>`;

    const newsGrid     = el.querySelector('#newsGrid');
    const loadMoreWrap = el.querySelector('#newsLoadMore');
    const loadMoreBtn  = el.querySelector('#newsLoadMoreBtn');

    const PAGE_SIZE = gridColumns(newsGrid, '.news-card') * 2;

    function updateFilterEmpty(matched) {
      const empty = newsGrid.querySelector('.news-filter-empty')
        || newsGrid.appendChild(document.createElement('p'));
      empty.className = 'empty-state news-filter-empty';
      empty.textContent = t('common.no_items');
      empty.style.display = matched.length ? 'none' : '';
    }

    function applyFilter(catId) {
      const all     = Array.from(newsGrid.querySelectorAll('.news-card'));
      const matched = catId
        ? all.filter(c => String(c.dataset.newsCat) === catId)
        : all;
      all.filter(c => !matched.includes(c)).forEach(c => { c.style.display = 'none'; });
      matched.forEach((c, i) => { c.style.display = i < PAGE_SIZE ? '' : 'none'; });
      const shown = Math.min(PAGE_SIZE, matched.length);
      loadMoreBtn.dataset.catFilter = catId;
      loadMoreBtn.dataset.shown     = String(shown);
      loadMoreWrap.style.display    = matched.length > shown ? '' : 'none';
      updateFilterEmpty(matched);
    }

    el.querySelectorAll('.filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyFilter(btn.dataset.catFilter);
      });
    });

    loadMoreBtn.addEventListener('click', () => {
      const catId    = loadMoreBtn.dataset.catFilter;
      const shown    = Number(loadMoreBtn.dataset.shown);
      const all      = Array.from(newsGrid.querySelectorAll('.news-card'));
      const matched  = catId
        ? all.filter(c => String(c.dataset.newsCat) === catId)
        : all;
      const newShown = Math.min(shown + PAGE_SIZE, matched.length);
      matched.slice(shown, newShown).forEach(c => { c.style.display = ''; });
      loadMoreBtn.dataset.shown = String(newShown);
      if (newShown >= matched.length) loadMoreWrap.style.display = 'none';
    });

    applyFilter('');

    // Pre-select filter from URL ?rubrika=slug (news categories / menu years) or legacy ?kategorie=
    const searchParams = new URLSearchParams(window.location.search);
    const slugParam = searchParams.get('rubrika') || searchParams.get('kategorie');
    if (slugParam) {
      const matched = cats.find(c => c.slug === slugParam);
      if (matched) {
        const chip = el.querySelector(`.filter-chip[data-cat-filter="${matched.id}"]`);
        if (chip) chip.click();
      }
    }
  }

  async renderNewsDetail(el, slug) {
    const [post, , buttons] = await Promise.all([
      safeFetch(`/api/news/${slug}`),
      _loadDOMPurify(),
      this._getButtons(),
    ]);
    const btnMap = {};
    (buttons || []).forEach(b => { btnMap[b.id] = b; });
    const defaultBtn = this.settings.news_default_button_id
      ? (btnMap[this.settings.news_default_button_id] || null)
      : null;
    const ctaHtml = defaultBtn ? `<div class="article-cta">${this._renderCtaButton(defaultBtn)}</div>` : '';

    el.innerHTML = `
      <article class="container section article-body">
        <div class="article-meta">
          <a href="/novinky" data-nav="/novinky" class="back-link">← ${t('common.back')}</a>
          <span class="article-date">${fmtDate(post.published_at)}</span>
        </div>
        ${post.cover_image ? `<figure class="article-cover-wrap img-align--${esc(post.cover_align || 'center')}"><img class="article-cover" src="${esc(post.cover_image)}" alt="${esc(pick(post.title_cz, post.title_en))}">${post.cover_caption ? `<figcaption class="img-caption img-caption--${esc(post.cover_align || 'center')}">${esc(post.cover_caption)}</figcaption>` : ''}</figure>` : ''}
        <h1 class="article-title">${esc(pick(post.title_cz, post.title_en))}</h1>
        ${post.excerpt_cz ? `<p class="article-excerpt">${esc(pick(post.excerpt_cz, post.excerpt_en))}</p>` : ''}
        <div class="article-content">${sanitize(pick(post.content_cz, post.content_en))}</div>
        ${ctaHtml}
      </article>`;

    updateMeta({
      title: pick(post.seo_title_cz || post.title_cz, post.seo_title_en || post.title_en),
      description: pick(post.seo_desc_cz || post.excerpt_cz, post.seo_desc_en || post.excerpt_en),
      ogImage: post.cover_image || '',
    });
  }

  // ── PRODUCTS ──────────────────────────────────────────────────────────────

  async renderProducts(el) {
    updateMeta({ title: getLang() === 'en' ? 'Products' : 'Produkty' });
    const [prods, cats] = await Promise.all([
      safeFetch('/api/products?fields=list'),
      this._getCategories(),
    ]);

    const filterHtml = cats.length ? `
      <div class="filter-bar-pub">
        <button class="filter-chip active" data-cat-filter="">
          ${getLang() === 'en' ? 'All' : 'Vše'}
        </button>
        ${cats.map(c => `<button class="filter-chip" data-cat-filter="${c.id}">${esc(pick(c.name_cz, c.name_en))}</button>`).join('')}
      </div>` : '';

    const defaultThumb = this.settings.default_thumbnail || '';
    const cards = prods.map(p => {
      const catIds = (p.categories || []).map(c => c.id).join(' ');
      let thumb = p.thumbnail_url || '';
      if (!thumb) { try { const imgs = JSON.parse(p.images_json || '[]'); thumb = (typeof imgs[0] === 'string' ? imgs[0] : imgs[0]?.url) || ''; } catch {} }
      if (!thumb) thumb = defaultThumb;
      const desc = stripHtml(pick(p.excerpt_cz, p.excerpt_en) || pick(p.description_cz, p.description_en));
      return `
        <a class="product-card" href="/produkty/${esc(p.slug)}" data-nav="/produkty/${esc(p.slug)}" data-product-cats="${esc(catIds)}">
          ${thumb ? `<div class="product-card-img"><img src="${esc(thumb)}" alt="${esc(pick(p.name_cz, p.name_en))}" loading="lazy"></div>` : '<div class="product-card-img product-card-img-empty"></div>'}
          <div class="product-card-body">
            ${p.is_featured ? `<span class="badge-featured">${t('common.featured')}</span>` : ''}
            <div class="product-card-name">${esc(pick(p.name_cz, p.name_en))}</div>
            ${desc ? `<div class="product-card-desc">${esc(desc).substring(0, 120)}</div>` : ''}
            <span class="product-card-link">${t('common.read_more')} →</span>
          </div>
        </a>`;
    }).join('');

    el.innerHTML = `
      <div class="container section">
        <h1 class="page-title">${t('nav.products')}</h1>
        ${filterHtml}
        <div class="product-grid" id="productsGrid">${cards || `<p class="empty-state">${t('common.no_items')}</p>`}</div>
        <div id="productsLoadMore" style="text-align:center;margin-top:32px;display:none">
          <button class="btn-outline-pub" id="productsLoadMoreBtn">${t('common.load_more')}</button>
        </div>
      </div>`;

    const grid         = el.querySelector('#productsGrid');
    const loadMoreWrap = el.querySelector('#productsLoadMore');
    const loadMoreBtn  = el.querySelector('#productsLoadMoreBtn');

    // Measure 2 rows worth of items based on actual rendered column count
    const PAGE_SIZE = gridColumns(grid, '.product-card') * 2;

    function applyFilter(catId) {
      const all     = Array.from(grid.querySelectorAll('.product-card'));
      const matched = catId
        ? all.filter(c => (c.dataset.productCats || '').split(' ').includes(catId))
        : all;
      all.filter(c => !matched.includes(c)).forEach(c => { c.style.display = 'none'; });
      matched.forEach((c, i) => { c.style.display = i < PAGE_SIZE ? '' : 'none'; });
      const shown = Math.min(PAGE_SIZE, matched.length);
      loadMoreBtn.dataset.catFilter = catId;
      loadMoreBtn.dataset.shown     = String(shown);
      loadMoreWrap.style.display    = matched.length > shown ? '' : 'none';
    }

    el.querySelectorAll('.filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyFilter(btn.dataset.catFilter);
      });
    });

    loadMoreBtn.addEventListener('click', () => {
      const catId    = loadMoreBtn.dataset.catFilter;
      const shown    = Number(loadMoreBtn.dataset.shown);
      const all      = Array.from(grid.querySelectorAll('.product-card'));
      const matched  = catId
        ? all.filter(c => (c.dataset.productCats || '').split(' ').includes(catId))
        : all;
      const newShown = Math.min(shown + PAGE_SIZE, matched.length);
      matched.slice(shown, newShown).forEach(c => { c.style.display = ''; });
      loadMoreBtn.dataset.shown = String(newShown);
      if (newShown >= matched.length) loadMoreWrap.style.display = 'none';
    });

    applyFilter('');

    // Pre-select filter from URL ?kategorie=slug
    const slugParam = new URLSearchParams(window.location.search).get('kategorie');
    if (slugParam) {
      const matched = cats.find(c => c.slug === slugParam);
      if (matched) {
        const chip = el.querySelector(`.filter-chip[data-cat-filter="${matched.id}"]`);
        if (chip) chip.click();
      }
    }
  }

  async renderProductDetail(el, slug) {
    const [p, , buttons] = await Promise.all([
      safeFetch(`/api/products/${slug}`),
      _loadDOMPurify(),
      this._getButtons(),
    ]);
    const btnMap = {};
    (buttons || []).forEach(b => { btnMap[b.id] = b; });
    const defaultBtn = this.settings.product_default_button_id
      ? (btnMap[this.settings.product_default_button_id] || null)
      : null;
    const productCtaHtml = defaultBtn ? `<div class="article-cta">${this._renderCtaButton(defaultBtn)}</div>` : '';

    let images = [];
    try {
      const raw = JSON.parse(p.images_json || '[]');
      images = raw.map(e => typeof e === 'string' ? { url: e, caption: '', align: 'center' } : e);
    } catch {}
    const cats = (p.categories || []).map(c => pick(c.name_cz, c.name_en)).join(', ');
    const linkedApps = p.applications || [];

    const galleryHtml = images.length
      ? `<div class="product-detail-cover">
           <img id="prodMainImg" class="article-cover img-align--center" src="${esc(images[0].url)}" alt="${esc(pick(p.name_cz, p.name_en))}">
           ${images[0].caption ? `<p class="img-caption img-caption--${esc(images[0].align || 'center')}">${esc(images[0].caption)}</p>` : ''}
           ${images.length > 1 ? `<div class="product-thumbs">${images.map((img, i) => `
             <img src="${esc(img.url)}" data-full-src="${esc(img.url)}" class="product-thumb ${i === 0 ? 'active' : ''}"
               loading="lazy">`).join('')}</div>` : ''}
         </div>`
      : '';

    const tabContentDesc = `
      <div class="product-detail-desc-wrap">
        ${p.description_cz ? `<div class="product-detail-desc">${sanitize(pick(p.description_cz, p.description_en))}</div>` : ''}
        ${galleryHtml}
        ${p.spec_cz ? `<div class="product-spec-section"><h3>${getLang() === 'en' ? 'Technical specification' : 'Technická specifikace'}</h3><div class="product-spec-content">${sanitize(pick(p.spec_cz, p.spec_en))}</div></div>` : ''}
      </div>`;

    const tabContentApps = linkedApps.length
      ? `<div class="linked-items-grid">${linkedApps.map(a => `
          <a class="linked-app-tile" href="/aplikace/${esc(a.slug)}" data-nav="/aplikace/${esc(a.slug)}">
            ${a.thumbnail_url || a.cover_image 
              ? `<div class="linked-app-tile-img"><img src="${esc(a.thumbnail_url || a.cover_image)}" alt="${esc(pick(a.name_cz, a.name_en))}" loading="lazy"></div>`
              : `<div class="linked-app-tile-img linked-app-tile-img-empty"></div>`}
            <div class="linked-app-tile-body">
              <div class="linked-app-tile-name">${esc(pick(a.name_cz, a.name_en))}</div>
              <div class="linked-app-tile-link">${getLang() === 'en' ? 'View application →' : 'Zobrazit aplikaci →'}</div>
            </div>
          </a>`).join('')}</div>`
      : `<p class="empty-state">${getLang() === 'en' ? 'No linked applications.' : 'Žádné propojené aplikace.'}</p>`;

    el.innerHTML = `
      <article class="container section">
        <a href="/produkty" data-nav="/produkty" class="back-link">← ${t('common.all_products')}</a>
        <div class="detail-tabs">
          <div class="detail-tab-bar">
            <button class="detail-tab-btn active" data-tab="desc">${getLang() === 'en' ? 'About the instrument' : 'O přístroji'}</button>
            <button class="detail-tab-btn" data-tab="apps">${getLang() === 'en' ? 'Applications' : 'Aplikace'}${linkedApps.length ? ` <span class="tab-count">${linkedApps.length}</span>` : ''}</button>
          </div>
          <div class="detail-tab-panel" data-panel="desc">
            ${cats ? `<div class="product-detail-cats">${esc(cats)}</div>` : ''}
            <h1 class="product-detail-name">${esc(pick(p.name_cz, p.name_en))}</h1>
            ${tabContentDesc}
            ${productCtaHtml}
          </div>
          <div class="detail-tab-panel" data-panel="apps" style="display:none;">${tabContentApps}</div>
        </div>
      </article>`;

    // Product thumbnail gallery — event delegation (no inline onclick)
    el.querySelector('.product-thumbs')?.addEventListener('click', (e) => {
      const thumb = e.target.closest('.product-thumb');
      if (!thumb) return;
      const mainImg = document.getElementById('prodMainImg');
      if (mainImg) mainImg.src = thumb.dataset.fullSrc;
      el.querySelectorAll('.product-thumb').forEach(t => t.classList.remove('active'));
      thumb.classList.add('active');
    });

    el.querySelectorAll('.detail-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.detail-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        el.querySelectorAll('.detail-tab-panel').forEach(p => {
          p.style.display = p.dataset.panel === tab ? '' : 'none';
        });
      });
    });

    updateMeta({
      title: pick(p.seo_title_cz || p.name_cz, p.seo_title_en || p.name_en),
      description: pick(p.seo_desc_cz, p.seo_desc_en) || stripHtml(pick(p.description_cz, p.description_en)).slice(0, 160),
      ogImage: images[0]?.url || p.thumbnail_url || '',
    });
  }

  // ── APPLICATIONS ──────────────────────────────────────────────────────────

  async renderApplications(el) {
    updateMeta({ title: getLang() === 'en' ? 'Applications' : 'Aplikace' });
    const [apps, groups] = await Promise.all([
      safeFetch('/api/applications?fields=list'),
      this._getAppGroups(),
    ]);

    const filterHtml = groups.length ? `
      <div class="filter-bar-pub">
        <button class="filter-chip active" data-group-filter="">
          ${getLang() === 'en' ? 'All' : 'Vše'}
        </button>
        ${groups.map(g => `<button class="filter-chip" data-group-filter="${g.id}">${esc(pick(g.name_cz, g.name_en))}</button>`).join('')}
      </div>` : '';

    const defaultThumb = this.settings.default_thumbnail || '';
    const cards = apps.map(a => {
      const thumb = a.thumbnail_url || defaultThumb;
      const imgSrc = thumb || a.cover_image;
      return `
      <a class="app-card" href="/aplikace/${esc(a.slug)}" data-nav="/aplikace/${esc(a.slug)}" data-app-group="${a.group_id || ''}">
        ${imgSrc ? `<div class="app-card-img"><img src="${esc(imgSrc)}" alt="${esc(pick(a.name_cz, a.name_en))}" loading="lazy"></div>` : '<div class="app-card-img app-card-img-empty"></div>'}
        <div class="app-card-body">
          <div class="app-card-name">${esc(pick(a.name_cz, a.name_en))}</div>
          ${(a.excerpt_cz || a.content_cz) ? `<div class="app-card-desc">${esc(pick(a.excerpt_cz, a.excerpt_en) || pick(a.content_cz, a.content_en)).substring(0, 120)}</div>` : ''}
          <span class="app-card-link">${t('common.read_more')} →</span>
        </div>
      </a>`;
    }).join('');

    el.innerHTML = `
      <div class="container section">
        <h1 class="page-title">${t('nav.applications')}</h1>
        ${filterHtml}
        <div class="app-grid" id="appsGrid">${cards || `<p class="empty-state">${t('common.no_items')}</p>`}</div>
      </div>`;

    el.querySelectorAll('.filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const gid = btn.dataset.groupFilter;
        el.querySelectorAll('.app-card').forEach(card => {
          card.style.display = (!gid || card.dataset.appGroup === gid) ? '' : 'none';
        });
      });
    });

    // Pre-select filter from URL ?skupina=slug or ?okruh=slug (set by menu entity picker)
    const groupParams = new URLSearchParams(window.location.search);
    const groupSlug = groupParams.get('skupina') || groupParams.get('okruh');
    if (groupSlug) {
      const matched = groups.find(g => g.slug === groupSlug);
      if (matched) {
        const chip = el.querySelector(`.filter-chip[data-group-filter="${matched.id}"]`);
        if (chip) chip.click();
      }
    }
  }

  async renderApplicationDetail(el, slug) {
    const [a] = await Promise.all([safeFetch(`/api/applications/${slug}`), _loadDOMPurify()]);
    const linkedProds = a.products || [];

    const coverHtml = a.cover_image
      ? `<div class="app-detail-cover">
           <img class="article-cover img-align--${esc(a.cover_align || 'center')}" src="${esc(a.cover_image)}" alt="${esc(pick(a.name_cz, a.name_en))}">
           ${a.cover_caption ? `<p class="img-caption img-caption--${esc(a.cover_align || 'center')}">${esc(a.cover_caption)}</p>` : ''}
         </div>`
      : '';

    const tabContentDesc = `<div class="article-content">${sanitize(pick(a.content_cz, a.content_en))}</div>`;

    const tabContentProds = linkedProds.length
      ? `<div class="linked-items-grid">${linkedProds.map(p => `
          <a class="linked-prod-tile" href="/produkty/${esc(p.slug)}" data-nav="/produkty/${esc(p.slug)}">
            ${p.thumbnail_url 
              ? `<div class="linked-prod-tile-img"><img src="${esc(p.thumbnail_url)}" alt="${esc(pick(p.name_cz, p.name_en))}" loading="lazy"></div>`
              : `<div class="linked-prod-tile-img linked-prod-tile-img-empty"></div>`}
            <div class="linked-prod-tile-body">
              <div class="linked-prod-tile-name">${esc(pick(p.name_cz, p.name_en))}</div>
              <div class="linked-prod-tile-link">${getLang() === 'en' ? 'View instrument →' : 'Zobrazit přístroj →'}</div>
            </div>
          </a>`).join('')}</div>`
      : `<p class="empty-state">${getLang() === 'en' ? 'No linked instruments.' : 'Žádné propojené přístroje.'}</p>`;

    el.innerHTML = `
      <article class="container section">
        <a href="/aplikace" data-nav="/aplikace" class="back-link">← ${t('common.all_apps')}</a>
        ${coverHtml}
        <div class="detail-tabs">
          <div class="detail-tab-bar">
            <button class="detail-tab-btn active" data-tab="desc">
              ${getLang() === 'en' ? 'About the application' : 'O aplikaci'}
            </button>
            <button class="detail-tab-btn" data-tab="prods">
              ${getLang() === 'en' ? 'Vhodné přístroje' : 'Vhodné přístroje'}${linkedProds.length ? ` <span class="tab-count">${linkedProds.length}</span>` : ''}
            </button>
          </div>
          <div class="detail-tab-panel" data-panel="desc">
            <h1 class="article-title">${esc(pick(a.name_cz, a.name_en))}</h1>
            ${tabContentDesc}
          </div>
          <div class="detail-tab-panel" data-panel="prods" style="display:none;">${tabContentProds}</div>
        </div>
      </article>`;

    el.querySelectorAll('.detail-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.detail-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        el.querySelectorAll('.detail-tab-panel').forEach(p => {
          p.style.display = p.dataset.panel === tab ? '' : 'none';
        });
      });
    });

    updateMeta({
      title: pick(a.seo_title_cz || a.name_cz, a.seo_title_en || a.name_en),
      description: pick(a.seo_desc_cz, a.seo_desc_en) || stripHtml(pick(a.content_cz, a.content_en)).slice(0, 160),
      ogImage: a.cover_image || a.thumbnail_url || '',
    });
  }

  // ── TRAININGS ─────────────────────────────────────────────────────────────

  async _getButtons() {
    if (!this._buttonsCache) {
      this._buttonsCache = await safeFetch('/api/buttons').catch(() => []);
    }
    return this._buttonsCache;
  }

  async renderTrainings(el) {
    updateMeta({ title: getLang() === 'en' ? 'Trainings' : 'Školení a kurzy' });
    const [trainings, , buttons] = await Promise.all([
      safeFetch('/api/trainings'),
      _loadDOMPurify(),
      this._getButtons(),
    ]);

    const btnMap = {};
    (buttons || []).forEach(b => { btnMap[b.id] = b; });

    const defaultTrainingBtn = this.settings.training_default_button_id
      ? (btnMap[this.settings.training_default_button_id] || null)
      : null;

    const rows = trainings.map(tr => {
      const ctaBtn = tr.cta_button_id
        ? (btnMap[tr.cta_button_id] || null)
        : defaultTrainingBtn;
      return `
      <div class="training-card">
        <div class="training-card-dates">
          <div class="training-date-from">
            <span class="training-date-label">${t('common.date_from')}</span>
            <span class="training-date-val">${fmtDate(tr.date_start)}</span>
          </div>
          ${tr.date_end ? `<div class="training-date-to">
            <span class="training-date-label">${t('common.date_to')}</span>
            <span class="training-date-val">${fmtDate(tr.date_end)}</span>
          </div>` : ''}
        </div>
        <div class="training-card-body">
          <h3 class="training-card-title">${esc(pick(tr.title_cz, tr.title_en))}</h3>
          ${tr.location_cz ? `<div class="training-card-location"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${esc(pick(tr.location_cz, tr.location_en))}</div>` : ''}
          ${tr.content_cz ? `<div class="training-card-desc">${sanitize(pick(tr.content_cz, tr.content_en))}</div>` : ''}
          ${ctaBtn ? `<div class="training-card-cta">${this._renderCtaButton(ctaBtn)}</div>` : ''}
        </div>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div class="container section">
        <h1 class="page-title">${t('nav.training')}</h1>
        ${!trainings.length
          ? `<p class="empty-state">${t('common.no_items')}</p>`
          : `<div class="trainings-list">${rows}</div>`}
      </div>`;
  }

  // ── PAGES ─────────────────────────────────────────────────────────────────

  async renderPage(el, slug) {
    const [page] = await Promise.all([safeFetch(`/api/pages/${slug}`), _loadDOMPurify()]);
    el.innerHTML = `
      <article class="container section article-body">
        ${page.cover_image ? `<img class="article-cover" src="${esc(page.cover_image)}" alt="${esc(pick(page.title_cz, page.title_en))}">` : ''}
        <h1 class="article-title">${esc(pick(page.title_cz, page.title_en))}</h1>
        ${page.excerpt_cz ? `<p class="article-excerpt">${esc(pick(page.excerpt_cz, page.excerpt_en))}</p>` : ''}
        <div class="article-content">${sanitize(pick(page.content_cz, page.content_en))}</div>
      </article>`;

    updateMeta({
      title: pick(page.seo_title_cz || page.title_cz, page.seo_title_en || page.title_en),
      description: pick(page.seo_desc_cz || page.excerpt_cz, page.seo_desc_en || page.excerpt_en),
      ogImage: page.cover_image || '',
    });
  }

  async renderFaq(el) {
    const lang = getLang();
    const [faqs] = await Promise.all([safeFetch('/api/faqs'), _loadDOMPurify()]);
    
    if (!faqs || !faqs.length) {
      el.innerHTML = `
        <div class="container section">
          <h1 class="page-title">Časté dotazy</h1>
          <p class="empty-state">Žádné FAQ zatím nebyly přidány.</p>
        </div>`;
      return;
    }

    const categories = {};
    faqs.forEach(faq => {
      const cat = pick(faq.category_cz, faq.category_en) || 'Obecné dotazy';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(faq);
    });

    const catHtml = Object.entries(categories).map(([cat, items]) => `
      <div class="faq-category">
        <h2 class="faq-category-title">${esc(cat)}</h2>
        <div class="faq-list">
          ${items.map(faq => `
            <div class="faq-item">
              <button class="faq-question" aria-expanded="false">
                <span>${esc(pick(faq.question_cz, faq.question_en))}</span>
                <svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              <div class="faq-answer">${sanitize(pick(faq.answer_cz, faq.answer_en))}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    el.innerHTML = `
      <div class="container section">
        <h1 class="page-title">Časté dotazy</h1>
        <div class="faq-container">${catHtml}</div>
      </div>`;

    document.querySelectorAll('.faq-question').forEach(btn => {
      btn.addEventListener('click', () => {
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        document.querySelectorAll('.faq-question').forEach(b => {
          b.setAttribute('aria-expanded', 'false');
          b.closest('.faq-item').classList.remove('faq-open');
        });
        if (!expanded) {
          btn.setAttribute('aria-expanded', 'true');
          btn.closest('.faq-item').classList.add('faq-open');
        }
      });
    });
  }

  // ── SEARCH ────────────────────────────────────────────────────────────────

  async renderSearch(el) {
    const q = new URLSearchParams(window.location.search).get('q') || '';
    if (!q) {
      el.innerHTML = `<div class="container section"><h1 class="page-title">${t('common.search_results')}</h1><p class="empty-state">${t('common.no_items')}</p></div>`;
      return;
    }

    const ql = q.toLowerCase();
    const [prods, apps, news] = await Promise.allSettled([
      safeFetch('/api/products?fields=list'),
      safeFetch('/api/applications?fields=list'),
      safeFetch('/api/news'),
    ]);

    const matchProd = settled(prods).filter(p =>
      pick(p.name_cz, p.name_en).toLowerCase().includes(ql) ||
      pick(p.description_cz, p.description_en).toLowerCase().includes(ql)
    );
    const matchApp = settled(apps).filter(a =>
      pick(a.name_cz, a.name_en).toLowerCase().includes(ql) ||
      pick(a.content_cz, a.content_en).toLowerCase().includes(ql)
    );
    const matchNews = settled(news).filter(n =>
      pick(n.title_cz, n.title_en).toLowerCase().includes(ql) ||
      pick(n.excerpt_cz, n.excerpt_en).toLowerCase().includes(ql)
    );

    const total = matchProd.length + matchApp.length + matchNews.length;

    const section = (title, items, makeCard) => items.length
      ? `<div class="search-section"><h3 class="search-section-title">${title}</h3><div class="search-results-grid">${items.map(makeCard).join('')}</div></div>`
      : '';

    el.innerHTML = `
      <div class="container section">
        <h1 class="page-title">${t('common.search_results')}: <em>"${esc(q)}"</em></h1>
        <p style="color:var(--text-2);margin-bottom:32px">${total} ${getLang() === 'en' ? 'result(s)' : 'výsledek/výsledků'}</p>
        ${!total ? `<p class="empty-state">${t('search.no_results')}</p>` : ''}
        ${section(t('nav.products'), matchProd, p => `
          <a class="search-result-card" href="/produkty/${esc(p.slug)}" data-nav="/produkty/${esc(p.slug)}">
            <div class="search-result-type">${t('nav.products')}</div>
            <div class="search-result-title">${esc(pick(p.name_cz, p.name_en))}</div>
            ${p.description_cz ? `<div class="search-result-desc">${esc(pick(p.description_cz, p.description_en)).substring(0, 100)}</div>` : ''}
          </a>`)}
        ${section(t('nav.applications'), matchApp, a => `
          <a class="search-result-card" href="/aplikace/${esc(a.slug)}" data-nav="/aplikace/${esc(a.slug)}">
            <div class="search-result-type">${t('nav.applications')}</div>
            <div class="search-result-title">${esc(pick(a.name_cz, a.name_en))}</div>
            ${a.content_cz ? `<div class="search-result-desc">${esc(pick(a.content_cz, a.content_en)).substring(0, 100)}</div>` : ''}
          </a>`)}
        ${section(t('nav.news'), matchNews, n => `
          <a class="search-result-card" href="/novinky/${esc(n.slug)}" data-nav="/novinky/${esc(n.slug)}">
            <div class="search-result-type">${t('nav.news')}</div>
            <div class="search-result-title">${esc(pick(n.title_cz, n.title_en))}</div>
            ${n.excerpt_cz ? `<div class="search-result-desc">${esc(pick(n.excerpt_cz, n.excerpt_en)).substring(0, 100)}</div>` : ''}
          </a>`)}
      </div>`;
  }

  // ── 404 ───────────────────────────────────────────────────────────────────

  render404(el) {
    el.innerHTML = `
      <div class="container section" style="text-align:center;padding:80px 24px">
        <div style="font-size:4rem;font-weight:800;color:var(--text-3);line-height:1">404</div>
        <h2 style="margin:16px 0 8px;color:var(--text-0)">${t('common.page_not_found')}</h2>
        <p style="color:var(--text-2);margin-bottom:24px">${t('common.page_not_found_desc')}</p>
        <a href="/" data-nav="/" class="btn-primary-pub">${t('common.back_home')}</a>
      </div>`;
  }

  // ── Navigation from DB menu ────────────────────────────────────────────────

  _renderNav() {
    const nav = document.getElementById('main-nav');
    if (!nav) return;

    // Keep static fallback if API failed or returned suspiciously few root items
    const rootCount = this.menuItems.filter(i => !i.parent_id).length;
    if (rootCount < 3) return;

    const lang = getLang();
    const roots    = this.menuItems.filter(i => !i.parent_id).sort((a, b) => a.display_order - b.display_order);
    const children = this.menuItems.filter(i =>  i.parent_id);

    const chevronSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`;

    nav.innerHTML = roots.map(item => {
      const href = item.link_value || '#';
      const label = lang === 'en' && item.label_en ? item.label_en : item.label_cz;

      const itemChildren = children
        .filter(c => c.parent_id === item.id)
        .sort((a, b) => a.display_order - b.display_order);

      const hasDropdown = itemChildren.length > 0;

      const dropdownHtml = hasDropdown ? `
        <div class="nav-dropdown">
          ${itemChildren.map(c => {
            const cHref  = c.link_value || '#';
            const cLabel = lang === 'en' && c.label_en ? c.label_en : (c.label_cz || '');
            return `<a href="${esc(cHref)}" data-nav="${esc(cHref)}">${esc(cLabel)}</a>`;
          }).join('')}
        </div>` : '';

      return `<li>
        <a href="${esc(href)}" data-nav="${esc(href)}">${esc(label)}${hasDropdown ? chevronSvg : ''}</a>
        ${dropdownHtml}
      </li>`;
    }).join('');
  }

  // ── UI helpers ────────────────────────────────────────────────────────────

  updateLangUI() {
    const lang = getLang();
    document.querySelectorAll('[data-lang-btn]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.langBtn === lang);
    });
  }

  _updateTopbar() {
    const s = this.settings;
    const phoneEl = document.getElementById('topbarPhone');
    const emailEl = document.getElementById('topbarEmail');
    if (phoneEl && s.contact_phone) {
      phoneEl.textContent = s.contact_phone;
      phoneEl.closest('a')?.setAttribute('href', `tel:${s.contact_phone}`);
    }
    if (emailEl && s.contact_email) {
      emailEl.textContent = s.contact_email;
      emailEl.closest('a')?.setAttribute('href', `mailto:${s.contact_email}`);
    }
  }

  _updateFooter() {
    const s = this.settings;
    const footerTextEl    = document.getElementById('footerText');
    const footerPhoneEl   = document.getElementById('footerPhone');
    const footerEmailEl   = document.getElementById('footerEmail');
    const footerAddressEl = document.getElementById('footerAddress');
    if (footerTextEl    && (s.footer_text_cz || s.footer_text_en)) footerTextEl.textContent = pick(s.footer_text_cz, s.footer_text_en);
    if (footerPhoneEl   && s.contact_phone)   footerPhoneEl.textContent   = s.contact_phone;
    if (footerEmailEl   && s.contact_email)   footerEmailEl.textContent   = s.contact_email;
    if (footerAddressEl && s.contact_address) footerAddressEl.textContent = s.contact_address;
  }

  _updateLogo() {
    const logoUrl = this.settings.logo_url || '';
    this._applyLogoEl('headerLogoImg', 'headerLogoText', logoUrl);
    this._applyLogoEl('footerLogoImg',  'footerLogoText',  logoUrl);
    // Cache for instant display on next page load
    try { localStorage.setItem('nicolet_logo_url', logoUrl); } catch { /* quota */ }
  }

  _applyLogoEl(imgId, textId, logoUrl) {
    const imgEl  = document.getElementById(imgId);
    const textEl = document.getElementById(textId);
    if (!imgEl || !textEl) return;
    if (logoUrl) {
      imgEl.src            = logoUrl;
      imgEl.style.display  = '';
      textEl.style.display = 'none';
    } else {
      imgEl.style.display  = 'none';
      textEl.style.display = '';
    }
  }

  _bindLangSwitch() {
    document.querySelectorAll('[data-lang-btn]').forEach(btn => {
      btn.addEventListener('click', () => setLang(btn.dataset.langBtn));
    });
  }

  _bindSearch() {
    const overlay  = document.getElementById('search-overlay');
    const input    = document.getElementById('search-input');
    const openBtns = document.querySelectorAll('[data-open-search]');
    const closeBtn = document.querySelector('.search-close');

    openBtns.forEach(btn => btn.addEventListener('click', () => {
      overlay?.classList.add('open'); input?.focus();
    }));
    closeBtn?.addEventListener('click', () => overlay?.classList.remove('open'));
    overlay?.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') overlay?.classList.remove('open');
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault(); overlay?.classList.add('open'); input?.focus();
      }
    });

    let _searchTimer = null;
    input?.addEventListener('input', () => {
      const q = input.value.trim();
      clearTimeout(_searchTimer);
      if (q.length >= 2) {
        _searchTimer = setTimeout(() => this._doLiveSearch(q), 200);
      } else {
        document.getElementById('search-results').innerHTML = '';
      }
    });

    input?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const q = input.value.trim();
        if (q) { overlay?.classList.remove('open'); this.navigate(`/hledat?q=${encodeURIComponent(q)}`); }
      }
    });
  }

  async _doLiveSearch(q) {
    const resultsEl = document.getElementById('search-results');
    if (!resultsEl) return;
    const ql = q.toLowerCase();

    try {
      // Cache search data for the session (lightweight list endpoints)
      if (!this._searchData) {
        const [prods, apps, news] = await Promise.allSettled([
          safeFetch('/api/products?fields=list'),
          safeFetch('/api/applications?fields=list'),
          safeFetch('/api/news'),
        ]);
        this._searchData = {
          prods: settled(prods),
          apps:  settled(apps),
          news:  settled(news),
        };
      }
      const { prods, apps, news } = this._searchData;

      const results = [
        ...prods.filter(p => pick(p.name_cz, p.name_en).toLowerCase().includes(ql))
          .slice(0, 3).map(p => ({ type: t('nav.products'), title: pick(p.name_cz, p.name_en), href: `/produkty/${p.slug}` })),
        ...apps.filter(a => pick(a.name_cz, a.name_en).toLowerCase().includes(ql))
          .slice(0, 3).map(a => ({ type: t('nav.applications'), title: pick(a.name_cz, a.name_en), href: `/aplikace/${a.slug}` })),
        ...news.filter(n => pick(n.title_cz, n.title_en).toLowerCase().includes(ql))
          .slice(0, 2).map(n => ({ type: t('nav.news'), title: pick(n.title_cz, n.title_en), href: `/novinky/${n.slug}` })),
      ];

      if (!results.length) {
        resultsEl.innerHTML = `<div class="search-no-results">${t('search.no_results')}</div>`;
        return;
      }

      resultsEl.innerHTML = results.map(r => `
        <a class="search-result-item" href="${esc(r.href)}" data-nav="${esc(r.href)}">
          <span class="search-result-item-type">${esc(r.type)}</span>
          <span class="search-result-item-title">${esc(r.title)}</span>
        </a>`).join('');

      resultsEl.querySelectorAll('[data-nav]').forEach(link => {
        link.addEventListener('click', e => {
          e.preventDefault();
          document.getElementById('search-overlay')?.classList.remove('open');
          this.navigate(link.dataset.nav);
        });
      });
    } catch { /* non-critical */ }
  }

  _bindMobileMenu() {
    const toggle = document.getElementById('mobileMenuToggle');
    const nav    = document.getElementById('main-nav');
    if (!toggle || !nav) return;
    toggle.addEventListener('click', () => nav.classList.toggle('mobile-open'));
  }

  // ── Cache helpers ─────────────────────────────────────────────────────────

  async _getCategories() {
    if (!this._categories) {
      try { this._categories = await safeFetch('/api/product-categories'); }
      catch { this._categories = []; }
    }
    return this._categories;
  }

  async _getAppGroups() {
    if (!this._appGroups) {
      try { this._appGroups = await safeFetch('/api/application-groups'); }
      catch { this._appGroups = []; }
    }
    return this._appGroups;
  }

  // ── FORM MODAL ────────────────────────────────────────────────────────────

  _bindFormModalButtons() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-open-form]');
      if (btn) {
        e.preventDefault();
        this.openFormModal(btn.dataset.openForm);
      }
    });
    document.getElementById('publicFormClose')?.addEventListener('click', () => this.closeFormModal());
    document.getElementById('publicFormModal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.closeFormModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeFormModal();
    });
  }

  async openFormModal(formId) {
    if (!formId) return;
    try {
      const form = await safeFetch(`/api/forms/${formId}`);
      this._renderFormModal(form);
      const modal = document.getElementById('publicFormModal');
      if (modal) { modal.style.display = ''; document.body.style.overflow = 'hidden'; }
    } catch (err) {
      console.error('Form modal load error:', err);
    }
  }

  _renderFormModal(form) {
    const lang = getLang();
    const title = lang === 'en' ? (form.title_en || form.title_cz || form.name) : (form.title_cz || form.name);
    const desc  = lang === 'en' ? (form.description_en || form.description_cz || '') : (form.description_cz || '');
    const submitLabel = lang === 'en' ? (form.submit_label_en || 'Submit') : (form.submit_label_cz || 'Odeslat');

    const titleEl  = document.getElementById('publicFormTitle');
    const descEl   = document.getElementById('publicFormDesc');
    const submitEl = document.getElementById('publicFormSubmit');
    const fieldsEl = document.getElementById('publicFormFields');
    const successEl= document.getElementById('publicFormSuccess');
    const bgEl     = document.getElementById('publicFormBg');
    const tsEl     = document.getElementById('publicFormTs');

    const labelColor = form.label_color || 'white';
    const labelColorClass = `label-${labelColor}`;
    console.log('Form modal - label_color:', form.label_color, '-> class:', labelColorClass);

    if (titleEl) {
      titleEl.textContent = title;
      titleEl.className = `pform-title ${labelColorClass}`;
    }
    if (descEl)  { 
      descEl.textContent = desc; 
      descEl.style.display = desc ? '' : 'none';
      descEl.className = `pform-desc ${labelColorClass}`;
    }
    if (submitEl) submitEl.textContent = submitLabel;
    if (successEl) successEl.style.display = 'none';
    const errorEl = document.getElementById('publicFormError');
    if (errorEl) errorEl.style.display = 'none';
    if (tsEl) tsEl.value = Math.floor(Date.now() / 1000);

    // Background image (validate URL to prevent CSS injection)
    if (bgEl) {
      let safeBg = '';
      if (form.background_image) {
        try {
          const bgUrl = new URL(form.background_image, window.location.origin);
          if (bgUrl.protocol === 'http:' || bgUrl.protocol === 'https:') safeBg = bgUrl.href;
        } catch { /* invalid URL — skip */ }
      }
      bgEl.style.backgroundImage = safeBg ? `url("${safeBg}")` : '';
      bgEl.style.display = safeBg ? '' : 'none';
    }

    // Render fields
    if (fieldsEl) {
      const fields = Array.isArray(form.fields_json) ? form.fields_json : [];
      fieldsEl.innerHTML = fields.map(f => {
        const label = lang === 'en' ? (f.label_en || f.label_cz) : (f.label_cz || f.label_en);
        const placeholder = lang === 'en' 
          ? (f.placeholder_en || f.placeholder_cz || label)
          : (f.placeholder_cz || f.placeholder_en || label);
        const req   = f.required ? 'required' : '';
        const reqMark = f.required ? ' <span class="pform-required">*</span>' : '';

        if (f.type === 'checkbox') {
          return `<label class="pform-checkbox-label ${labelColorClass}">
            <input type="checkbox" name="${esc(f.name)}" ${req}>
            <span>${esc(label)}${reqMark}</span>
          </label>`;
        }
        const fieldId = `pf_${esc(f.name)}`;
        if (f.type === 'textarea') {
          return `<div class="pform-field">
            <label class="pform-label ${labelColorClass}" for="${fieldId}">${esc(label)}${reqMark}</label>
            <textarea id="${fieldId}" name="${esc(f.name)}" class="pform-textarea" rows="4" ${req} placeholder="${esc(placeholder)}"></textarea>
          </div>`;
        }
        return `<div class="pform-field">
          <label class="pform-label ${labelColorClass}" for="${fieldId}">${esc(label)}${reqMark}</label>
          <input id="${fieldId}" type="${esc(f.type || 'text')}" name="${esc(f.name)}" class="pform-input" ${req} placeholder="${esc(placeholder)}">
        </div>`;
      }).join('');
    }

    // Show/hide form
    const formEl = document.getElementById('publicFormEl');
    if (formEl) {
      formEl.style.display = '';
      formEl.dataset.formId = form.id;
      // Bind submit (once per form load)
      formEl.onsubmit = (e) => {
        e.preventDefault();
        this._submitFormModal(form);
      };
    }
  }

  async _submitFormModal(form) {
    const formEl   = document.getElementById('publicFormEl');
    const submitEl = document.getElementById('publicFormSubmit');
    const successEl= document.getElementById('publicFormSuccess');
    const errorEl  = document.getElementById('publicFormError');
    if (!formEl) return;

    const lang = getLang();

    this._clearFieldErrors();
    if (errorEl) errorEl.style.display = 'none';

    // Validate all fields (required + format)
    const fields = Array.isArray(form.fields_json) ? form.fields_json : [];
    const fieldErrors = [];

    for (const field of fields) {
      const input = formEl.querySelector(`[name="${field.name}"]`);
      if (!input) continue;
      const value = input.type === 'checkbox' ? input.checked : input.value.trim();
      const isEmpty = input.type === 'checkbox' ? !value : (!value || value.length === 0);
      if (isEmpty) {
        const label = lang === 'en' ? (field.label_en || field.label_cz || field.name) : (field.label_cz || field.label_en || field.name);
        fieldErrors.push({ field: field.name, label, message: lang === 'en' ? `Please fill in the "${label}" field.` : `Vyplňte prosím pole "${label}".`, type: 'required', input });
        continue;
      }
      if (field.type === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          const label = lang === 'en' ? (field.label_en || field.label_cz || field.name) : (field.label_cz || field.label_en || field.name);
          fieldErrors.push({ field: field.name, label, message: lang === 'en' ? `Please check the email address format (name@domain.cz).` : `Zkontrolujte prosím e-mailovou adresu ve formátu jméno@doména.cz.`, type: 'email', input });
        }
      }
      const strVal = String(value || '').trim();
      if (field.minlength != null && strVal.length < Number(field.minlength)) {
        const label = lang === 'en' ? (field.label_en || field.label_cz || field.name) : (field.label_cz || field.label_en || field.name);
        fieldErrors.push({ field: field.name, label, message: lang === 'en' ? `"${label}" must be at least ${field.minlength} characters.` : `Pole "${label}" musí mít alespoň ${field.minlength} znaků.`, type: 'minlength', input });
      }
      if (field.maxlength != null && strVal.length > Number(field.maxlength)) {
        const label = lang === 'en' ? (field.label_en || field.label_cz || field.name) : (field.label_cz || field.label_en || field.name);
        fieldErrors.push({ field: field.name, label, message: lang === 'en' ? `"${label}" must not exceed ${field.maxlength} characters.` : `Pole "${label}" nesmí přesáhnout ${field.maxlength} znaků.`, type: 'maxlength', input });
      }
      input.classList.remove('pform-error');
    }

    if (fieldErrors.length) {
      this._renderFieldErrors(fieldErrors);
      if (fieldErrors[0].input) fieldErrors[0].input.focus();
      if (submitEl) { submitEl.disabled = false; }
      return;
    }

    const data = {};
    new FormData(formEl).forEach((val, key) => {
      if (key !== '_hp' && key !== '_ts') data[key] = val;
    });

    data._ts = document.getElementById('publicFormTs')?.value || Math.floor(Date.now() / 1000);

    if (submitEl) { submitEl.disabled = true; submitEl.textContent = '…'; }

    try {
      const response = await fetch(`/api/forms/${form.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const errBody = contentType?.includes('application/json') ? await response.json() : { error: await response.text() };
        if (errBody.errors && Array.isArray(errBody.errors)) {
          this._renderFieldErrors(errBody.errors.map(e => ({ ...e, input: formEl.querySelector(`[name="${e.field}"]`) })));
          const firstInput = errBody.errors.find(e => formEl.querySelector(`[name="${e.field}"]`));
          if (firstInput) firstInput.focus();
        } else {
          throw new Error(errBody.error || 'Chyba odeslání');
        }
        return;
      }

      const msg = lang === 'en'
        ? (form.success_msg_en || 'Thank you. We will get back to you shortly.')
        : (form.success_msg_cz || 'Děkujeme za zprávu. Brzy se ozveme.');

      formEl.style.display = 'none';
      if (successEl) { successEl.textContent = msg; successEl.style.display = ''; }
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message || 'Chyba při odeslání formuláře';
        errorEl.style.display = '';
        setTimeout(() => { errorEl.style.display = 'none'; }, 6000);
      }
    } finally {
      if (submitEl) { submitEl.disabled = false; }
    }
  }

  _clearFieldErrors() {
    const formEl = document.getElementById('publicFormEl');
    if (!formEl) return;
    formEl.querySelectorAll('.pform-field-error').forEach(el => el.remove());
    formEl.querySelectorAll('.pform-input.pform-error, .pform-textarea.pform-error').forEach(el => {
      el.classList.remove('pform-error');
      el.removeAttribute('aria-invalid');
      el.removeAttribute('aria-describedby');
    });
  }

  _renderFieldErrors(errors) {
    const formEl = document.getElementById('publicFormEl');
    if (!formEl || !errors.length) return;
    // Global summary
    const errorEl = document.getElementById('publicFormError');
    if (errorEl && !errorEl.textContent) {
      errorEl.textContent = errors.map(e => e.message).join('\n');
      errorEl.style.display = '';
      errorEl.style.whiteSpace = 'pre-line';
      setTimeout(() => { if (errorEl) errorEl.style.display = 'none'; }, 8000);
    }
    for (const err of errors) {
      const input = err.input || formEl.querySelector(`[name="${err.field}"]`);
      if (!input) continue;
      input.classList.add('pform-error');
      input.setAttribute('aria-invalid', 'true');
      const errId = `pf_err_${err.field}`;
      let errDiv = document.getElementById(errId);
      if (!errDiv) {
        errDiv = document.createElement('div');
        errDiv.id = errId;
        errDiv.className = 'pform-field-error';
        errDiv.setAttribute('role', 'alert');
        input.parentNode.appendChild(errDiv);
      }
      errDiv.textContent = err.message;
      input.setAttribute('aria-describedby', errId);
    }
  }

  closeFormModal() {
    const modal = document.getElementById('publicFormModal');
    if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }
  }

  _renderCtaButton(btn) {
    if (!btn || !btn.is_active) return '';
    const lang = getLang();
    const label = lang === 'en' ? (btn.label_en || btn.label_cz) : (btn.label_cz || btn.label_en);
    const styleMap = { primary: 'btn-cta-primary', secondary: 'btn-cta-secondary', outline: 'btn-cta-outline' };
    const cls = styleMap[btn.style] || 'btn-cta-primary';

    if (btn.link_type === 'form' && btn.link_value) {
      return `<button type="button" class="training-cta-btn ${cls}" data-open-form="${esc(btn.link_value)}">${esc(label)}</button>`;
    }
    if (btn.link_type === 'external') {
      return `<a href="${esc(btn.link_value || '#')}" target="_blank" rel="noopener" class="training-cta-btn ${cls}">${esc(label)}</a>`;
    }
    return `<a href="${esc(btn.link_value || '#')}" data-nav="${esc(btn.link_value || '#')}" class="training-cta-btn ${cls}">${esc(label)}</a>`;
  }
}

// Footer year (moved from inline script to satisfy CSP)
const footerYearEl = document.getElementById('footerYear');
if (footerYearEl) footerYearEl.textContent = new Date().getFullYear();

const app = new PublicApp();
window.app = app;
app.init();
