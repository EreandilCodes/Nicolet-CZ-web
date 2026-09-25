# AUTH MIGRATION PLAN — localStorage to httpOnly Cookies

**Vytvořeno:** 2026-04-22  
**Cíl:** Přejít z localStorage JWT storage na httpOnly cookies pro lepší XSS ochranu

---

## PŘEHLED ZMĚN

| Aspekt | Před | Po |
|--------|------|-----|
| Token storage | localStorage (`nicolet_token`) | httpOnly cookie (`auth_token`) |
| API auth | `Authorization: Bearer xxx` header | Automatické `Cookie: auth_token=xxx` |
| Cross-tab logout | Žádná | `storage` event s `logout_signal` |
| Token refresh | Polling každých 45 min | Reaktivní interceptor při 401 |
| CSRF ochrana | Žádná | SameSite=Strict + Secure |

---

## 1. KOMPLETNÍ SEZNAM BE SOUBORŮ KE ZMĚNĚ

### 1.1 Vytvořit nové soubory
| Soubor | Popis | Priorita |
|--------|-------|----------|
| `backend/utils/cookie.js` | Cookie helper funkce (setAuthCookie, clearAuthCookie) | 1 |

### 1.2 Upravit existující soubory
| Soubor | Změny | Priorita |
|--------|-------|----------|
| `backend/server.js` | Přidat cookie-parser middleware | 2 |
| `backend/routes/auth.js` | Login, logout, refresh endpoints | 3 |
| `backend/middleware/auth.js` | Číst token z cookie místo headeru | 4 |
| `backend/routes/*.js` | Ověřit že DELETE vrací 204 | 5 |

---

## 2. KOMPLETNÍ SEZNAM 71 FE FETCH VOLÁNÍ

### 2.1 Login / Auth (3 volání)
| Soubor:Řádek | Endpoint | SKUPINA | Změna |
|---------------|----------|---------|-------|
| `login.html:77` | POST /api/auth/login | A | credentials: 'include', odstranit token z response |
| `js/auth.js:30` | POST /api/auth/logout | A | credentials: 'include', odstranit Authorization header |
| `js/auth.js:48` | GET /api/auth/me | A | credentials: 'include', odstranit Authorization header |
| `js/auth.js:81` | POST /api/auth/refresh | A | credentials: 'include' |

### 2.2 Admin Dashboard (4 volání)
| Soubor:Řádek | Endpoint | SKUPINA | Změna |
|---------------|----------|---------|-------|
| `js/admin.js:172` | GET /api/contacts/admin/all | A | credentials: 'include', odstranit getAuthHeaders() |
| `js/admin.js:182` | GET /api/products/admin/all | A | credentials: 'include', odstranit getAuthHeaders() |
| `js/admin.js:192` | GET /api/news/admin/all | A | credentials: 'include', odstranit getAuthHeaders() |
| `js/admin.js:202` | GET /api/trainings/admin/all | A | credentials: 'include', odstranit getAuthHeaders() |

### 2.3 Admin Managers (64 volání)

#### contacts.js (2 volání)
| Soubor:Řádek | Endpoint | SKUPINA |
|---------------|----------|---------|
| `admin/contacts.js:28` | GET /api/contacts/admin/all | A |
| `admin/contacts.js:204` | DELETE /api/contacts/admin/:id | A |

#### carousel.js (6 volání)
| Soubor:Řádek | Endpoint | SKUPINA |
|---------------|----------|---------|
| `admin/carousel.js:26` | GET /api/pages | B (veřejné) |
| `admin/carousel.js:27` | GET /api/products?fields=list | B (veřejné) |
| `admin/carousel.js:28` | GET /api/applications?fields=list | B (veřejné) |
| `admin/carousel.js:29` | GET /api/news | B (veřejné) |
| `admin/carousel.js:50` | GET /api/carousel/admin/all | A |
| `admin/carousel.js:312` | PUT /api/carousel/admin/:id | A |

#### app-groups.js (2 volání)
| Soubor:Řádek | Endpoint | SKUPINA |
|---------------|----------|---------|
| `admin/app-groups.js:28` | GET /api/application-groups/admin/all | A |
| `admin/app-groups.js:250` | PUT/DELETE /api/application-groups/admin/:id | A |

#### news-categories.js (2 volání)
| Soubor:Řádek | Endpoint | SKUPINA |
|---------------|----------|---------|
| `admin/news-categories.js:26` | GET /api/news-categories/admin/all | A |
| `admin/news-categories.js:205` | PUT/DELETE /api/news-categories/admin/:id | A |

#### product-categories.js (4 volání)
| Soubor:Řádek | Endpoint | SKUPINA |
|---------------|----------|---------|
| `admin/product-categories.js:28` | GET /api/product-categories/admin/all | A |
| `admin/product-categories.js:296` | PUT /api/product-categories/admin/:a.id | A |
| `admin/product-categories.js:302` | PUT /api/product-categories/admin/:b.id | A |
| `admin/product-categories.js:322` | PUT/DELETE /api/product-categories/admin/:id | A |

#### products.js (5 volání)
| Soubor:Řádek | Endpoint | SKUPINA |
|---------------|----------|---------|
| `admin/products.js:32` | GET /api/product-categories/admin/all | A |
| `admin/products.js:51` | GET /api/applications/admin/all | A |
| `admin/products.js:70` | GET /api/products/admin/all | A |
| `admin/products.js:318` | POST /api/gallery/images/admin/upload | A |
| `admin/products.js:470` | PUT/DELETE /api/products/admin/:id | A |

#### applications.js (6 volání)
| Soubor:Řádek | Endpoint | SKUPINA |
|---------------|----------|---------|
| `admin/applications.js:31` | GET /api/products/admin/all | A |
| `admin/applications.js:50` | GET /api/application-groups/admin/all | A |
| `admin/applications.js:69` | GET /api/applications/admin/all | A |
| `admin/applications.js:410` | PUT/DELETE /api/applications/admin/:id | A |
| `admin/applications.js:453` | PUT/DELETE /api/applications/admin/:id | A |

#### trainings.js (2 volání)
| Soubor:Řádek | Endpoint | SKUPINA |
|---------------|----------|---------|
| `admin/trainings.js:28` | GET /api/trainings/admin/all | A |
| `admin/trainings.js:241` | PUT/DELETE /api/trainings/admin/:id | A |

#### buttons.js (5 volání)
| Soubor:Řádek | Endpoint | SKUPINA |
|---------------|----------|---------|
| `admin/buttons.js:23` | GET /api/forms/admin/all | A |
| `admin/buttons.js:70` | GET /api/buttons/admin/all | A |
| `admin/buttons.js:306` | GET /api/settings | A |
| `admin/buttons.js:337` | PUT /api/settings | A |
| `admin/buttons.js:364` | PUT/DELETE /api/buttons/admin/:id | A |

#### forms.js (2 volání)
| Soubor:Řádek | Endpoint | SKUPINA |
|---------------|----------|---------|
| `admin/forms.js:29` | GET /api/forms/admin/all | A |
| `admin/forms.js:365` | PUT/DELETE /api/forms/admin/:id | A |

#### submissions.js (3 volání)
| Soubor:Řádek | Endpoint | SKUPINA |
|---------------|----------|---------|
| `admin/submissions.js:17` | GET /api/submissions/admin/all | A |
| `admin/submissions.js:132` | PUT /api/submissions/admin/:id/read | A |
| `admin/submissions.js:156` | DELETE /api/submissions/admin/:id | A |

#### news.js (5 volání)
| Soubor:Řádek | Endpoint | SKUPINA |
|---------------|----------|---------|
| `admin/news.js:81` | PUT/DELETE /api/news/admin/:id | A |
| `admin/news.js:112` | GET /api/news-categories/admin/all | A |
| `admin/news.js:144` | GET /api/news/admin/all | A |
| `admin/news.js:438` | POST /api/news/admin/:id/publish | A |
| `admin/news.js:464` | PUT/DELETE /api/news/admin/:id | A |

#### pages.js (3 volání)
| Soubor:Řádek | Endpoint | SKUPINA |
|---------------|----------|---------|
| `admin/pages.js:28` | GET /api/pages/admin/all | A |
| `admin/pages.js:107` | GET /api/pages/admin/all | A |
| `admin/pages.js:332` | PUT/DELETE /api/pages/admin/:id | A |

#### faqs.js (2 volání)
| Soubor:Řádek | Endpoint | SKUPINA |
|---------------|----------|---------|
| `admin/faqs.js:27` | GET /api/faqs/admin/all | A |
| `admin/faqs.js:193` | PUT/DELETE /api/faqs/admin/:id | A |

#### menu.js (4 volání)
| Soubor:Řádek | Endpoint | SKUPINA |
|---------------|----------|---------|
| `admin/menu.js:60` | GET /api/menu/admin/all | A |
| `admin/menu.js:361` | PUT /api/menu/admin/:id/order | A |
| `admin/menu.js:430` | PUT/DELETE /api/menu/admin/:id | A |
| `admin/menu.js:452` | POST /api/menu/admin/seed-defaults | A |

#### gallery.js (6 volání)
| Soubor:Řádek | Endpoint | SKUPINA |
|---------------|----------|---------|
| `admin/gallery.js:66` | GET /api/gallery/folders/admin/all | A |
| `admin/gallery.js:344` | PUT/DELETE /api/gallery/folders/admin/:id | A |
| `admin/gallery.js:417` | PUT /api/gallery/images/admin/:id | A |
| `admin/gallery.js:452` | DELETE /api/gallery/images/admin/:id | A |
| `admin/gallery.js:525` | POST /api/gallery/images/admin/upload | A |

#### settings.js (3 volání)
| Soubor:Řádek | Endpoint | SKUPINA |
|---------------|----------|---------|
| `admin/settings.js:17` | GET /api/settings | A |
| `admin/settings.js:110` | PUT /api/settings | A |
| `admin/settings.js:151` | POST /api/settings/test-email | A |

### 2.4 Admin Helpers (2 volání)
| Soubor:Řádek | Endpoint | SKUPINA |
|---------------|----------|---------|
| `js/admin-helpers.js:263` | GET /api/gallery/folders/admin/all | A |
| `js/admin-helpers.js:370` | POST /api/gallery/images/admin/upload | A |

### 2.5 Public (1 volání)
| Soubor:Řádek | Endpoint | SKUPINA |
|---------------|----------|---------|
| `js/public.js:1604` | POST /api/forms/:id/submit | B (veřejné) |

---

## 3. TŘÍDĚNÍ DO SKUPIN

### SKUPINA A — Admin API s autentizací (67 volání)
Všechny `/api/*/admin/*` endpointy + nastavení. Musí:
1. Použít `credentials: 'include'`
2. ODSTRANIT `Authorization` header
3. ODSTRANIT `getAuthHeaders()` volání

### SKUPINA B — Veřejné API bez autentizace (4 volání)
- `admin/carousel.js:26-29` (GET /api/pages, /api/products, /api/applications, /api/news)
- `js/public.js:1604` (POST /api/forms/:id/submit)

Tyto pouze přidají `credentials: 'include'` (pro budoucí kompatibilitu), ale nepotřebují auth.

### SKUPINA C — Externí API (0 volání)
Tento projekt nemá externí API volání.

---

## 4. ZÁVISLOSTNÍ POŘADÍ ZMĚN

### Fáze 1: Backend (BE)
```
Krok 1.1: npm install cookie-parser
Krok 1.2: Vytvořit backend/utils/cookie.js
Krok 1.3: Upravit backend/server.js (přidat cookie-parser)
Krok 1.4: Upravit backend/routes/auth.js (login, logout, refresh)
Krok 1.5: Upravit backend/middleware/auth.js (čtení z cookie)
Krok 1.6: Ověřit BE endpointy fungují
```

### Fáze 2: Frontend Core (FE)
```
Krok 2.1: Upravit frontend/js/auth.js
Krok 2.2: Vytvořit authenticatedFetch helper
Krok 2.3: Přidat cross-tab logout listener do admin.html
```

### Fáze 3: Admin Managers (FE)
```
Krok 3.1: Upravit js/admin.js (dashboard volání)
Krok 3.2: Projet všechny admin/*.js soubory (18 souborů)
Krok 3.3: Upravit js/admin-helpers.js
```

### Fáze 4: Login Page (FE)
```
Krok 4.1: Upravit login.html
```

### Fáze 5: Testování
```
Krok 5.1: Spustit test suite
Krok 5.2: Ověřit všechny scénáře z TEST-RESULTS.md
Krok 5.3: Ověřit grep výsledek
```

---

## 5. ROLLBACK PLÁN

### Před změnami (backup)
```bash
# Vytvořit git commit před změnami
git add -A
git commit -m "Pre-auth-migration checkpoint"
```

### Rollback postup
```bash
# Pokud něco selže, vrátit změny
git reset --hard HEAD~1
npm restart
```

### Hotfix (částečný rollback)
Pokud selže pouze FE část:
1. Zachovat BE změny (cookies fungují)
2. Vrátit pouze FE soubory na původní stav
3. Upravit BE aby akceptoval BOTH cookie AND header (fallback)

---

## 6. VERIFIKAČNÍ CHECKLIST

Před nasazením ověř:
- [ ] `grep -r "getAuthHeaders" frontend/` vrací prázdný výsledek
- [ ] `grep -r "nicolet_token" frontend/` vrací prázdný výsledek (kromě logout_signal)
- [ ] `grep -r "Authorization.*Bearer" frontend/` vrací prázdný výsledek
- [ ] Login funguje a nastavuje cookie
- [ ] Logout maže cookie
- [ ] Refresh endpoint funguje
- [ ] Cross-tab logout funguje
- [ ] Všechny admin operace fungují
- [ ] Veřejné API stále přístupné

---

## 7. RIZIKA A MITIGACE

| Riziko | Pravděpodobnost | Mitigace |
|--------|-----------------|----------|
| Cookie nejsou nastaveny správně | Střední | Testovat v DevTools Application → Cookies |
| CORS credentials problém | Střední | Ověřit `Access-Control-Allow-Credentials: true` |
| Refresh interceptor nekonečná smyčka | Nízká | Implementovat retry counter (max 2 pokusy) |
| Cross-tab logout nefunguje | Nízká | Testovat v dvou tabech současně |
| Zapomenutý fetch volání | Vysoká | Použít grep pro ověření |

---

**Připraveno pro implementaci. Dokud tento soubor není schválen, nepokračovat s kódem.**
