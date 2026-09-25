# CONNECTIVITY AUDIT PLAN — Nicolet CZ

**Vytvořeno:** 2026-04-22  
**Rozsah:** Kompletní audit BE↔FE connectivity

---

## 1. BACKEND ENDPOINTY — Kompletní seznam

### 1.1 Auth (`/api/auth`)
| Metoda | Cesta | Handler | Middleware | FE Volající |
|--------|-------|---------|------------|-------------|
| POST | /login | login | — | login.html |
| POST | /refresh | refresh | verifyToken | auth.js (auto-refresh) |
| POST | /logout | logout | verifyToken | auth.js |
| POST | /change-password | changePassword | verifyToken | admin/settings.js |
| GET | /me | getMe | verifyToken | auth.js |

### 1.2 Settings (`/api/settings`)
| Metoda | Cesta | Handler | Middleware | FE Volající |
|--------|-------|---------|------------|-------------|
| GET | / | getAll | verifyToken, adminOnly | admin/settings.js |
| GET | /public | getPublic | — | public.js (init) |
| PUT | / | update | verifyToken, adminOnly | admin/settings.js |
| POST | /test-email | testEmail | verifyToken, adminOnly | admin/settings.js |

### 1.3 Contacts (`/api/contacts`)
| Metoda | Cesta | Handler | Middleware | FE Volající |
|--------|-------|---------|------------|-------------|
| GET | / | getActive | — | public.js (kontakt stránka) |
| GET | /admin/all | getAll | verifyToken, adminOnly | admin.js (dashboard), admin/contacts.js |
| POST | / | create | verifyToken, adminOnly | admin/contacts.js |
| PUT | /:id | update | verifyToken, adminOnly | admin/contacts.js |
| DELETE | /:id | delete | verifyToken, adminOnly | admin/contacts.js |

### 1.4 Carousel (`/api/carousel`)
| Metoda | Cesta | Handler | Middleware | FE Volající |
|--------|-------|---------|------------|-------------|
| GET | / | getActive | — | public.js (homepage) |
| GET | /admin/all | getAll | verifyToken, adminOnly | admin/carousel.js |
| POST | /admin | create | verifyToken, adminOnly | admin/carousel.js |
| PUT | /admin/:id | update | verifyToken, adminOnly | admin/carousel.js |
| DELETE | /admin/:id | delete | verifyToken, adminOnly | admin/carousel.js |

### 1.5 News Categories (`/api/news-categories`)
| Metoda | Cesta | Handler | Middleware | FE Volající |
|--------|-------|---------|------------|-------------|
| GET | / | getActive | — | public.js (novinky, menu) |
| GET | /admin/all | getAll | verifyToken, adminOnly | admin/news-categories.js |
| POST | /admin | create | verifyToken, adminOnly | admin/news-categories.js |
| PUT | /admin/:id | update | verifyToken, adminOnly | admin/news-categories.js |
| DELETE | /admin/:id | delete | verifyToken, adminOnly | admin/news-categories.js |

### 1.6 News (`/api/news`)
| Metoda | Cesta | Handler | Middleware | FE Volající |
|--------|-------|---------|------------|-------------|
| GET | / | getPublished | — | public.js (novinky seznam, homepage) |
| GET | /:slug | getBySlug | — | public.js (detail novinky) |
| GET | /admin/all | getAll | verifyToken, adminOnly | admin/news.js |
| POST | /admin | create | verifyToken, adminOnly | admin/news.js |
| PUT | /admin/:id | update | verifyToken, adminOnly | admin/news.js |
| DELETE | /admin/:id | delete | verifyToken, adminOnly | admin/news.js |
| POST | /admin/delete-many | deleteMany | verifyToken, adminOnly | admin/news.js |

### 1.7 Pages (`/api/pages`)
| Metoda | Cesta | Handler | Middleware | FE Volající |
|--------|-------|---------|------------|-------------|
| GET | / | getPublished | — | public.js (stránky seznam) |
| GET | /by-slug/:slug | getBySlug | — | public.js (detail stránky) |
| GET | /admin/all | getAll | verifyToken, adminOnly | admin/pages.js |
| POST | /admin | create | verifyToken, adminOnly | admin/pages.js |
| PUT | /admin/:id | update | verifyToken, adminOnly | admin/pages.js |
| DELETE | /admin/:id | delete | verifyToken, adminOnly | admin/pages.js |

### 1.8 Product Categories (`/api/product-categories`)
| Metoda | Cesta | Handler | Middleware | FE Volající |
|--------|-------|---------|------------|-------------|
| GET | / | getActive | — | public.js (produkty, menu) |
| GET | /admin/all | getAll | verifyToken, adminOnly | admin/product-categories.js |
| POST | /admin | create | verifyToken, adminOnly | admin/product-categories.js |
| PUT | /admin/:id | update | verifyToken, adminOnly | admin/product-categories.js |
| DELETE | /admin/:id | delete | verifyToken, adminOnly | admin/product-categories.js |

### 1.9 Products (`/api/products`)
| Metoda | Cesta | Handler | Middleware | FE Volající |
|--------|-------|---------|------------|-------------|
| GET | / | getPublished | — | public.js (produkty seznam, homepage) |
| GET | /:slug | getBySlug | — | public.js (detail produktu) |
| GET | /admin/all | getAll | verifyToken, adminOnly | admin/products.js |
| POST | /admin | create | verifyToken, adminOnly | admin/products.js |
| PUT | /admin/:id | update | verifyToken, adminOnly | admin/products.js |
| DELETE | /admin/:id | delete | verifyToken, adminOnly | admin/products.js |
| POST | /admin/delete-many | deleteMany | verifyToken, adminOnly | admin/products.js |
| GET | /:id/applications | getProductApplications | — | public.js (detail produktu) |

### 1.10 Application Groups (`/api/application-groups`)
| Metoda | Cesta | Handler | Middleware | FE Volající |
|--------|-------|---------|------------|-------------|
| GET | / | getActive | — | public.js (aplikace, menu) |
| GET | /admin/all | getAll | verifyToken, adminOnly | admin/app-groups.js |
| POST | /admin | create | verifyToken, adminOnly | admin/app-groups.js |
| PUT | /admin/:id | update | verifyToken, adminOnly | admin/app-groups.js |
| DELETE | /admin/:id | delete | verifyToken, adminOnly | admin/app-groups.js |

### 1.11 Applications (`/api/applications`)
| Metoda | Cesta | Handler | Middleware | FE Volající |
|--------|-------|---------|------------|-------------|
| GET | / | getPublished | — | public.js (aplikace seznam, homepage) |
| GET | /:slug | getBySlug | — | public.js (detail aplikace) |
| GET | /admin/all | getAll | verifyToken, adminOnly | admin/applications.js |
| POST | /admin | create | verifyToken, adminOnly | admin/applications.js |
| PUT | /admin/:id | update | verifyToken, adminOnly | admin/applications.js |
| DELETE | /admin/:id | delete | verifyToken, adminOnly | admin/applications.js |
| POST | /admin/delete-many | deleteMany | verifyToken, adminOnly | admin/applications.js |
| GET | /:id/products | getApplicationProducts | — | public.js (detail aplikace) |

### 1.12 Trainings (`/api/trainings`)
| Metoda | Cesta | Handler | Middleware | FE Volající |
|--------|-------|---------|------------|-------------|
| GET | / | getPublished | — | public.js (školení seznam, homepage) |
| GET | /:id | getById | — | public.js (detail školení) |
| GET | /admin/all | getAll | verifyToken, adminOnly | admin/trainings.js |
| POST | /admin | create | verifyToken, adminOnly | admin/trainings.js |
| PUT | /admin/:id | update | verifyToken, adminOnly | admin/trainings.js |
| DELETE | /admin/:id | delete | verifyToken, adminOnly | admin/trainings.js |

### 1.13 Buttons (`/api/buttons`)
| Metoda | Cesta | Handler | Middleware | FE Volající |
|--------|-------|---------|------------|-------------|
| GET | / | getActive | — | public.js (CTA buttons) |
| GET | /admin/all | getAll | verifyToken, adminOnly | admin/buttons.js |
| POST | /admin | create | verifyToken, adminOnly | admin/buttons.js |
| PUT | /admin/:id | update | verifyToken, adminOnly | admin/buttons.js |
| DELETE | /admin/:id | delete | verifyToken, adminOnly | admin/buttons.js |

### 1.14 Forms (`/api/forms`)
| Metoda | Cesta | Handler | Middleware | FE Volající |
|--------|-------|---------|------------|-------------|
| GET | / | getActive | — | public.js (formuláře) |
| GET | /:id | getById | — | public.js (formulář detail) |
| GET | /admin/all | getAll | verifyToken, adminOnly | admin/forms.js |
| POST | /admin | create | verifyToken, adminOnly | admin/forms.js |
| PUT | /admin/:id | update | verifyToken, adminOnly | admin/forms.js |
| DELETE | /admin/:id | delete | verifyToken, adminOnly | admin/forms.js |
| POST | /:id/submit | submit | — (s honeypot + rate limit) | public.js (form submit) |

### 1.15 Submissions (`/api/submissions`)
| Metoda | Cesta | Handler | Middleware | FE Volající |
|--------|-------|---------|------------|-------------|
| GET | /admin/all | getAll | verifyToken, adminOnly | admin/submissions.js |
| GET | /admin/:id | getById | verifyToken, adminOnly | admin/submissions.js |
| DELETE | /admin/:id | delete | verifyToken, adminOnly | admin/submissions.js |

### 1.16 Gallery (`/api/gallery`)
| Metoda | Cesta | Handler | Middleware | FE Volající |
|--------|-------|---------|------------|-------------|
| GET | /folders | getFolders | — | public.js (galerie), admin/gallery.js |
| GET | /folders/admin/all | getAllFolders | verifyToken, adminOnly | admin/gallery.js |
| POST | /folders/admin | createFolder | verifyToken, adminOnly | admin/gallery.js |
| PUT | /folders/admin/:id | updateFolder | verifyToken, adminOnly | admin/gallery.js |
| DELETE | /folders/admin/:id | deleteFolder | verifyToken, adminOnly | admin/gallery.js |
| GET | /images | getImages | — | public.js (galerie), admin/gallery.js |
| GET | /images/admin/all | getAllImages | verifyToken, adminOnly | admin/gallery.js |
| POST | /images/admin/upload | uploadImage | verifyToken, adminOnly | admin/gallery.js |
| PUT | /images/admin/:id | updateImage | verifyToken, adminOnly | admin/gallery.js |
| DELETE | /images/admin/:id | deleteImage | verifyToken, adminOnly | admin/gallery.js |

### 1.17 Menu (`/api/menu`)
| Metoda | Cesta | Handler | Middleware | FE Volající |
|--------|-------|---------|------------|-------------|
| GET | / | getActive | — | public.js (navigace) |
| GET | /admin/all | getAll | verifyToken, adminOnly | admin/menu.js |
| POST | /admin | createItem | verifyToken, adminOnly | admin/menu.js |
| PUT | /admin/:id | updateItem | verifyToken, adminOnly | admin/menu.js |
| DELETE | /admin/:id | deleteItem | verifyToken, adminOnly | admin/menu.js |
| POST | /admin/seed-defaults | seedDefaults | verifyToken, adminOnly | admin/menu.js |
| POST | /admin/reorder | reorder | verifyToken, adminOnly | admin/menu.js |

### 1.18 FAQs (`/api/faqs`)
| Metoda | Cesta | Handler | Middleware | FE Volající |
|--------|-------|---------|------------|-------------|
| GET | / | getActive | — | public.js (FAQ stránka) |
| GET | /by-page/:pageId | getByPage | — | public.js (FAQ stránka) |
| GET | /admin/all | getAll | verifyToken, adminOnly | admin/faqs.js |
| POST | /admin | create | verifyToken, adminOnly | admin/faqs.js |
| PUT | /admin/:id | update | verifyToken, adminOnly | admin/faqs.js |
| DELETE | /admin/:id | delete | verifyToken, adminOnly | admin/faqs.js |

### 1.19 Statické/Server Routes
| Metoda | Cesta | Popis |
|--------|-------|-------|
| GET | / | index.html (SPA entry) |
| GET | /admin | admin.html (Admin panel) |
| GET | /login | login.html (Login page) |
| GET | /sitemap.xml | Auto-generovaný sitemap |
| GET | * | index.html (SPA fallback) |

---

## 2. FRONTEND STRÁNKY / VIEW

### 2.1 Veřejné stránky (public.js router)
| View | Route Pattern | Funkce v public.js |
|------|---------------|-------------------|
| Home | / | renderHome() |
| Products List | /produkty | renderProductList() |
| Product Detail | /produkt/:slug | renderProductDetail() |
| Applications List | /aplikace | renderApplicationList() |
| Application Detail | /aplikace/:slug | renderApplicationDetail() |
| News List | /novinky | renderNewsList() |
| News Detail | /novinka/:slug | renderNewsDetail() |
| Trainings | /skoleni | renderTrainings() |
| Page | /stranka/:slug | renderPage() |
| Contact | /kontakt | renderContact() |
| Search | /hledat?q= | renderSearch() |
| FAQ | /stranka/caste-dotazy | renderFAQ() |
| 404 | * | render404() |

### 2.2 Admin sekce (admin.js)
| Sekce | ID | Manager | API Endpointy |
|-------|----|---------|---------------|
| Dashboard | dashboardSection | — (inline) | /api/*/admin/all (4x) |
| Carousel | carouselSection | CarouselManager | /api/carousel/* |
| News | newsSection | NewsManager | /api/news/*, /api/news-categories/* |
| Pages | pagesSection | PagesManager | /api/pages/* |
| Categories | productCategoriesSection | ProductCategoriesManager, NewsCategoriesManager, AppGroupsManager | /api/product-categories/*, /api/news-categories/*, /api/application-groups/* |
| Products | productsSection | ProductsManager | /api/products/*, /api/product-categories/* |
| Applications | applicationsSection | ApplicationsManager | /api/applications/*, /api/application-groups/* |
| Trainings | trainingsSection | TrainingsManager | /api/trainings/*, /api/buttons/* |
| Forms | formsSection | FormsManager | /api/forms/* |
| Buttons | buttonsSection | ButtonsManager | /api/buttons/* |
| Submissions | submissionsSection | SubmissionsManager | /api/submissions/*, /api/forms/* |
| Gallery | gallerySection | GalleryManager | /api/gallery/* |
| Menu | menuSection | MenuManager | /api/menu/* |
| Contacts | contactsSection | ContactsManager | /api/contacts/* |
| Settings | settingsSection | SettingsManager | /api/settings/* |
| FAQ | faqsSection | FaqsManager | /api/faqs/*, /api/pages/* |

### 2.3 Login stránka
| Stránka | Soubor | Funkce |
|---------|--------|--------|
| Login | login.html | AuthManager.login() |

---

## 3. MAPA: FE → BE Volání

### 3.1 Homepage (renderHome)
| Zdroj dat | FE Funkce | BE Endpoint |
|-----------|-----------|-------------|
| Carousel | renderHome | GET /api/carousel |
| Produkty (featured) | renderHome | GET /api/products?fields=list |
| Aplikace (featured) | renderHome | GET /api/applications?fields=list |
| Školení (nadcházející) | renderHome | GET /api/trainings |
| Novinky | renderHome | GET /api/news |
| Nastavení | constructor/init | GET /api/settings/public |
| Menu | _renderNav | GET /api/menu |

### 3.2 Product Detail
| Zdroj dat | FE Funkce | BE Endpoint |
|-----------|-----------|-------------|
| Produkt detail | renderProductDetail | GET /api/products/:slug |
| Linked aplikace | renderProductDetail | GET /api/products/:id/applications |

### 3.3 Application Detail
| Zdroj dat | FE Funkce | BE Endpoint |
|-----------|-----------|-------------|
| Aplikace detail | renderApplicationDetail | GET /api/applications/:slug |
| Linked produkty | renderApplicationDetail | GET /api/applications/:id/products |

### 3.4 News Detail
| Zdroj dat | FE Funkce | BE Endpoint |
|-----------|-----------|-------------|
| Novinka detail | renderNewsDetail | GET /api/news/:slug |

### 3.5 Page Detail
| Zdroj dat | FE Funkce | BE Endpoint |
|-----------|-----------|-------------|
| Stránka detail | renderPage | GET /api/pages/by-slug/:slug |
| FAQ (pro FAQ stránku) | renderPage → renderFAQ | GET /api/faqs/by-page/:pageId |

### 3.6 Form Submit
| Zdroj dat | FE Funkce | BE Endpoint |
|-----------|-----------|-------------|
| Formulář | _submitFormModal | POST /api/forms/:id/submit |

---

## 4. DATABÁZOVÉ TABULKY A VZTAHY

### 4.1 Entity Tables
```
users (id, email, password_hash, role, created_at)
├── role: 'admin' (enum)

settings (key PRIMARY KEY, value, updated_at)
├── key whitelistováno v settings.js

contacts (id, name, role_cz, role_en, email, phone, image_url, display_order, is_active, created_at)

pages (id, slug UNIQUE, title_cz, title_en, content_cz, content_en, excerpt_cz, excerpt_en, cover_image, seo_*, is_published, display_order, created_at, updated_at)

faqs (id, category_cz, category_en, question_cz, question_en, answer_cz, answer_en, display_order, is_active, created_at, updated_at)

news_categories (id, name_cz, name_en, slug UNIQUE, display_order, is_active, created_at)

news_posts (id, slug UNIQUE, title_cz, title_en, content_cz, content_en, excerpt_cz, excerpt_en, cover_image, cover_caption, cover_align, seo_*, category_id FK, is_published, published_at, created_at, updated_at)
└── category_id → news_categories(id)

product_categories (id, parent_id FK, name_cz, name_en, slug UNIQUE, display_order, is_active, created_at)
└── parent_id → product_categories(id) [adjacency list]

products (id, slug UNIQUE, name_cz, name_en, description_cz, description_en, spec_cz, spec_en, images_json, thumbnail_url, is_published, is_featured, display_order, seo_*, created_at, updated_at)

product_categories_map (product_id, category_id) [M:N junction]
├── FK: product_id → products(id) ON DELETE CASCADE
├── FK: category_id → product_categories(id) ON DELETE CASCADE

application_groups (id, slug UNIQUE, name_cz, name_en, display_order, is_active, created_at)

applications (id, group_id FK, slug UNIQUE, name_cz, name_en, content_cz, content_en, cover_image, cover_caption, cover_align, thumbnail_url, is_published, is_featured, display_order, seo_*, created_at, updated_at)
└── group_id → application_groups(id)

product_applications_map (product_id, application_id) [M:N junction]
├── FK: product_id → products(id) ON DELETE CASCADE
├── FK: application_id → applications(id) ON DELETE CASCADE

buttons (id, label_cz, label_en, link_type, link_value, style, is_active, created_at)

forms (id, name, title_cz, title_en, description_cz, description_en, fields_json, background_image, email_recipients, submit_label_*, success_msg_*, label_color, is_active, created_at, updated_at)

form_submissions (id, form_id FK, data_json, ip, submitted_at, is_read)
└── form_id → forms(id)

carousel_items (id, image_url, link_url, title_cz, title_en, subtitle_cz, subtitle_en, show_text, display_order, is_active, created_at)

trainings (id, title_cz, title_en, content_cz, content_en, date_start, date_end, location_cz, location_en, cta_button_id FK, is_published, created_at, updated_at)
└── cta_button_id → buttons(id)

menu_items (id, parent_id FK, label_cz, label_en, link_type, link_value, display_order, is_active, created_at)
└── parent_id → menu_items(id) [adjacency list]

gallery_folders (id, parent_id FK, name_cz, name_en, slug UNIQUE, display_order, created_at, updated_at)
└── parent_id → gallery_folders(id) [adjacency list]

gallery_images (id, folder_id FK, image_url, identifier UNIQUE, title_cz, title_en, description_cz, description_en, tags, display_order, created_at, updated_at)
└── folder_id → gallery_folders(id)
```

---

## 5. EXTERNÍ SLUŽBY A INTEGRACE

### 5.1 Email (services/email.service.js)
| Služba | Použití | Konfigurace |
|--------|---------|-------------|
| Nodemailer | Form submissions, test emails | SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS |
| Fallback | Mock mode (logs only) | When SMTP not configured |

### 5.2 File Upload
| Služba | Použití | Konfigurace |
|--------|---------|-------------|
| Multer | Image uploads to /uploads/gallery | diskStorage, limits: 50MB |
| Sharp | Image compression/optimization | Quality 85 (JPEG), WebP90 (PNG) |

### 5.3 Databáze
| Provider | Mód | Konfigurace |
|----------|-----|-------------|
| PostgreSQL | Production | DATABASE_URL, DB_PROVIDER=postgres |
| SQLite | Development/Fallback | SQLite_PATH, DB_PROVIDER=sqlite |

---

## 6. HIGH-RISK ZÓNY

### 6.1 Autentizace & Autorizace
- **JWT token handling** — auth.js, middleware/auth.js
- **Token blacklist** — in-memory (JTI based)
- **Rate limiting** — login (10/15min/IP), account lockout (5 failures/15min)
- **Password policy** — min 8 chars, uppercase + number

### 6.2 Data Validation
- **SQL Injection** — parameterized queries OK, but verify all
- **XSS** — DOMPurify on FE, output encoding (esc())
- **File Upload** — MIME + extension validation, path traversal prevention

### 6.3 Form Submissions
- **Honeypot** — _hp field check
- **Time check** — _ts 3-600s validation
- **Rate limit** — 5 submissions/10min/IP

### 6.4 Admin Operations
- **Bulk delete** — /api/*/admin/delete-many
- **Mass assignment** — whitelist in settings.js ALLOWED_KEYS

---

## 7. POTENCIÁLNÍ NEVYUŽITÝ KÓD (MRTVÝ KÓD?)

### 7.1 BE Endpointy k ověření
| Endpoint | Status | Důvod |
|----------|--------|-------|
| GET /api/faqs/by-page/:pageId | ? | Používá se? |
| POST /api/menu/admin/reorder | ? | Používá se v menu.js? |

### 7.2 FE Views k ověření
| View | Status | Důvod |
|------|--------|-------|
| FAQ v Pages | ? | Implementováno v pages.js? |

---

## 8. KONTRAKTY KE OVĚŘENÍ

### 8.1 Request Body Formáty
| Endpoint | FE Posílá | BE Očekává | Status |
|----------|-----------|------------|--------|
| POST /api/products/admin | ? | name_cz, name_en, slug, description_*, images_json | TBD |
| PUT /api/products/admin/:id | ? | same + id | TBD |
| POST /api/forms/:id/submit | ? | field values + _hp + _ts | TBD |

### 8.2 Response Formáty
| Endpoint | BE Vrací | FE Čeká | Status |
|----------|----------|---------|--------|
| GET /api/products | ? | Array with categories, applications | TBD |
| GET /api/products/:slug | ? | Object with categories[], applications[] | TBD |

---

**Připraveno pro FÁZI 1 — Backend Audit**
