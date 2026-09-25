# END-TO-END FLOW AUDIT — Nicolet CZ

**Vytvořeno:** 2026-04-22  
**Auditor:** Senior QA Engineer  
**Rozsah:** Hlavní uživatelské toky (user flows)

---

## FLOW-01: Přihlášení do administrace

**KROKY:**
1. Uživatel jde na `/admin`
2. Systém přesměruje na `/login` (pokud není token)
3. Uživatel zadá email a heslo
4. Klikne "Přihlásit se"
5. Systém vrátí JWT token
6. Uložení tokenu do localStorage
7. Přesměrování na `/admin#dashboard`

**VÝSLEDEK:** NELZE OVĚŘIT AUTOMATICKY

**PROBLÉMY:**
- Nemám přístup k běžícímu serveru pro manuální testování
- Pro automatizované E2E testy by bylo potřeba Playwright/Cypress

**CO BY BYLO POTŘEBA:**
- Spustit server: `npm start`
- Otevřít browser na `/admin`
- Ověřit redirect na `/login`
- Vyplnit credentials
- Ověřit úspěšné přihlášení

---

## FLOW-02: Vytvoření produktu v administraci

**KROKY:**
1. Přihlášený uživatel klikne na "Produkty"
2. Systém načte seznam produktů z `/api/products/admin/all`
3. Uživatel klikne "Přidat produkt"
4. Otevře se modál s formulářem
5. Vyplní: název CZ, název EN, popis, vybere kategorie, nahraje obrázky
6. Klikne "Uložit"
7. POST `/api/products/admin`
8. Systém vrátí 201 s created produktem
9. FE zavře modál a refreshne seznam

**VÝSLEDEK:** NELZE OVĚŘIT AUTOMATICKY

**PROBLÉMY:**
- Chybí přístup k admin UI pro manuální test
- Formulář má složitou validaci (gallery picker, editor, kategorie)

**CO BY BYLO POTŘEBA:**
- Manuální test nebo Playwright test
- Ověřit že všechna pole fungují
- Ověřit double-submit prevention
- Ověřit že kategorie se správně ukládají do M:N tabulky

---

## FLOW-03: Návštěva homepage (veřejná část)

**KROKY:**
1. Uživatel jde na `/`
2. Systém vrátí `index.html`
3. public.js se inicializuje
4. Načtou se data: `/api/settings/public`, `/api/carousel`, `/api/products?fields=list`, `/api/applications?fields=list`, `/api/trainings`, `/api/news`, `/api/menu`
5. Zobrazení obsahu

**VÝSLEDEK:** NELZE OVĚŘIT AUTOMATICKY

**PROBLÉMY:**
- Nemám přístup k běžícímu serveru
- Nemohu ověřit že všechny sekce se načtou správně

---

## FLOW-04: Odeslání kontaktního formuláře

**KROKY:**
1. Uživatel jde na stránku s formulářem
2. FE načte formulář z `/api/forms/:id`
3. Zobrazí se formulářové pole
4. Uživatel vyplní data
5. Odešle formulář
6. FE pošle POST `/api/forms/:id/submit` s honeypot a timestamp
7. BE validuje, uloží do DB, pošle email
8. FE zobrazí success message

**VÝSLEDEK:** NELZE OVĚŘIT AUTOMATICKY

**PROBLÉMY:**
- Formulářový submit je chráněn honeypotem
- Rate limiting (5/10min)
- Nelze automatizovat bez bypassu honeypotu

**CO BY BYLO POTŘEBA:**
- Manuální test s reálným prohlížečem
- Ověřit email delivery (SMTP by mělo být nakonfigurováno)

---

## FLOW-05: Nahrání obrázku do galerie

**KROKY:**
1. Přihlášený admin jde na "Galerie"
2. Vybere složku
3. Klikne "Nahrát obrázek"
4. Vybere soubor z PC
5. FE pošle multipart/form-data na `/api/gallery/images/admin/upload`
6. BE zkomprimuje obrázek (Sharp)
7. Uloží do `/uploads/gallery/`
8. Záznam do DB
9. FE zobrazí nový obrázek

**VÝSLEDEK:** NELZE OVĚŘIT AUTOMATICKY

**PROBLÉMY:**
- File upload vyžaduje manuální interakci nebo specializovaný test
- Sharp compression musí být testován s různými formáty

---

## FLOW-06: Zobrazení detailu produktu

**KROKY:**
1. Uživatel klikne na produkt v seznamu
2. URL se změní na `/produkt/:slug`
3. public.js router zachytí změnu
4. GET `/api/products/:slug`
5. GET `/api/products/:id/applications`
6. Zobrazení detailu produktu
7. Zobrazení linked aplikací v druhém tabu

**VÝSLEDEK:** NELZE OVĚŘIT AUTOMATICKY

**PROBLÉMY:**
- Vyžaduje existující produkt v DB
- Vyžaduje aplikace linked k produktu

---

## FLOW-07: Vyhledávání

**KROKY:**
1. Uživatel zadá dotaz do vyhledávacího pole
2. FE provede GET `/api/products?search=...`, `/api/applications?search=...`, `/api/news?search=...`
3. Zobrazení výsledků

**VÝSLEDEK:** NELZE OVĚŘIT AUTOMATICKY

---

## SHRNUTÍ E2E

| Flow | Status | Blokováno |
|------|--------|-----------|
| FLOW-01 Login | NELZE OVĚŘIT | Chybí běžící server |
| FLOW-02 Create Product | NELZE OVĚŘIT | Chybí admin UI přístup |
| FLOW-03 Homepage | NELZE OVĚŘIT | Chybí běžící server |
| FLOW-04 Form Submit | NELZE OVĚŘIT | Honeypot ochrana |
| FLOW-05 Gallery Upload | NELZE OVĚŘIT | File upload vyžaduje interakci |
| FLOW-06 Product Detail | NELZE OVĚŘIT | Chybí testovací data |
| FLOW-07 Search | NELZE OVĚŘIT | Chybí testovací data |

---

## DOPORUČENÍ PRO E2E TESTING

Pro kompletní E2E audit by bylo potřeba:

1. **Playwright/Cypress setup:**
   ```javascript
   // playwright.config.js
   export default {
     webServer: {
       command: 'npm run dev',
       port: 3003,
     },
     use: {
       baseURL: 'http://localhost:3003',
     },
   };
   ```

2. **Testovací scénáře:**
   - Login flow
   - CRUD operace pro každý content type
   - Form submission s honeypot bypass (pro testy)
   - File upload test
   - Search functionality

3. **Test data:**
   - Seed databáze s testovacími produkty, aplikacemi, novinkami
   - Cleanup po každém testu

---

**Celkem flows:** 7 identifikováno, 0 ověřeno  
**Stav:** NELZE OVĚŘIT BEZ BĚŽÍCÍHO SERVERU
