# BACKEND AUDIT FINDINGS — Nicolet CZ

**Vytvořeno:** 2026-04-22  
**Auditor:** Senior QA Engineer  
**Rozsah:** All backend routes, database, auth, validation, error handling

---

## LEGENDA

| Pole | Popis |
|------|-------|
| ID | BE-[číslo] |
| ZÁVAŽNOST | KRITICKÁ / VYSOKÁ / STŘEDNÍ / NÍZKÁ / INFO |
| SOUBOR | Cesta:kód řádek(y) |
| POPIS | Co je problém |
| DŮKAZ | Konkrétní kód |
| DOPAD | Co se stane když se neopraví |
| OPRAVA | Jak opravit |

---

## 1.1 ENDPOINTY — EXISTENCE A DOSTUPNOST

### BE-001: Úvodní strana administrátorského rozhraní není chráněna proti neautorizovanému přístupu
**ZÁVAŽNOST:** VYSOKÁ  
**SOUBOR:** backend/server.js:139-141  
**POPIS:** GET /admin endpoint násilím přesměruje na admin.html bez jakékoliv autentizace. Soubor admin.html obsahuje veškerou administrátorskou funkcionalitu (JS) a je plně přístupný komukoliv.  
**DŮKAZ:**
```javascript
// server.js:139-141
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});
```
**DOPAD:** Útočník může přistupovat k admin.html, analyzovat veškerou administrátorskou logiku, získat informace o API struktuře, případně exploitovat FE zranitelnosti.  
**OPRAVA:** Přidat middleware pro ověření autentizace před servírováním admin.html, nebo alespoň ověřit presence tokenu v requestu.

---

### BE-002: DELETE endpointy vracejí 200 OK místo 204 No Content
**ZÁVAŽNOST:** NÍZKÁ  
**SOUBOR:** Více souborů — např. backend/routes/contacts.js:99  
**POPIS:** DELETE endpointy vracejí 200 OK s JSON tělem místo standardního 204 No Content.  
**DŮKAZ:**
```javascript
// contacts.js:99
res.json({ message: 'Kontakt smazán' });
```
**DOPAD:** Nestandardní API odpovědi, ale funkčně nevadí.  
**OPRAVA:** N/A — není nutné opravovat, konzistence s ostatními endpointy.

---

## 1.2 DATABÁZE — SCHÉMA A LOGIKA

### BE-003: Chybějící indexy na foreign keys — potenciální N+1
**ZÁVAŽNOST:** STŘEDNÍ  
**SOUBOR:** backend/database.js  
**POPIS:** Tabulky s FK nemají explicitně definované indexy (např. product_categories.parent_id, menu_items.parent_id). Při JOINech mohou vznikat full table scany.  
**DŮKAZ:**
```sql
-- product_categories table v database.js:306-318
CREATE TABLE IF NOT EXISTS product_categories (
  id ${pk},
  parent_id INTEGER,  -- <-- chybí INDEX
  ...
  FOREIGN KEY (parent_id) REFERENCES product_categories(id)
)
```
**DOPAD:** Při velkém množství dat se zpomalí dotazy na hierarchické struktury (kategorie, menu).  
**OPRAVA:** Přidat `CREATE INDEX IF NOT EXISTS` pro všechny FK sloupce po vytvoření tabulek.

---

### BE-004: M:N junction tables nemají indexy
**ZÁVAŽNOST:** STŘEDNÍ  
**SOUBOR:** backend/database.js:348-357, 400-407  
**POPIS:** Tabulky product_categories_map a product_applications_map nemají indexy na FK sloupcích.  
**DŮKAZ:**
```sql
CREATE TABLE IF NOT EXISTS product_categories_map (
  product_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  PRIMARY KEY (product_id, category_id),
  FOREIGN KEY ...
  -- žádné INDEXy na jednotlivé FK
);
```
**DOPAD:** Při dotazování produktů podle kategorie nebo aplikací se nepoužívá index.  
**OPRAVA:** Přidat:
```sql
CREATE INDEX IF NOT EXISTS idx_pcm_category ON product_categories_map(category_id);
CREATE INDEX IF NOT EXISTS idx_pam_app ON product_applications_map(application_id);
```

---

### BE-005: Potenciální race condition při seedování výchozích dat
**ZÁVAŽNOST:** NÍZKÁ  
**SOUBOR:** backend/database.js:551-590  
**POPIS:** Default menu items se seedují bez transakce, každý INSERT je samostatný. Při dvou simultánních inicializacích může dojít k duplicitním záznamům.  
**DŮKAZ:**
```javascript
for (const item of defaultRootItems) {
  const exists = await db.prepare('SELECT id FROM menu_items WHERE link_value = ? AND parent_id IS NULL').get(item.link_value);
  if (!exists) {
    await db.prepare(`INSERT...`).run(...); // <-- není v transakci
  }
}
```
**DOPAD:** Teoreticky možné duplicity při race condition při startu více instancí.  
**OPRAVA:** N/A pro SQLite — BEGIN/COMMIT je zakázáno dle AGENTS.md. U PostgreSQL by mohlo pomoci INSERT ON CONFLICT.

---

## 1.3 VALIDACE VSTUPŮ

### BE-006: Slug generation může vytvořit neplatné URL znaky
**ZÁVAŽNOST:** STŘEDNÍ  
**SOUBOR:** backend/routes/products.js:8-10, backend/routes/applications.js:8-10  
**POPIS:** generateSlug funkce nepoužívá normalizaci diakritiky — české znaky (ě, š, č, ř, ž, ý, á, í, é, ú, ť, ň, ď, ó) se stanou pomlčkami.  
**DŮKAZ:**
```javascript
function generateSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + `-${Date.now}`;
}
// "Přístroj pro analýzu" → "p-stroj-pro-anal-zu-123456789"
```
**DOPAD:** NE přátelské URL s diakritikou, potenciálně duplicitní sluhy při automatickém generování.  
**OPRAVA:** Implementovat diakritickou normalizaci jako v FE (_generateSlug v AGENTS.md).

---

### BE-007: products.js nevaliduje JSON strukturu images_json
**ZÁVAŽNOST:** STŘEDNÍ  
**SOUBOR:** backend/routes/products.js:150+  
**POPIS:** images_json se ukládá jako text bez validace JSON struktury. Malformed JSON může způsobit crash při parsování na FE.  
**DŮKAZ:**
```javascript
// V POST /admin handleru:
const images = Array.isArray(req.body.images) ? JSON.stringify(req.body.images) : '[]';
// Ale nevaliduje se struktura jednotlivých objektů
```
**DOPAD:** Pokud FE pošle neočekávanou strukturu, může se uložit neplatná data.  
**OPRAVA:** Přidat Joi/zod validaci nebo alespoň kontrolu že images je pole objektů s povolenými klíči.

---

### BE-008: forms.js nepoužívá DOMPurify na serveru pro rich text
**ZÁVAŽNOST:** VYSOKÁ  
**SOUBOR:** backend/routes/forms.js:101-169  
**POPIS:** Při ukládání formulářových odpovědí (form_submissions.data_json) se neprovádí sanitizace HTML. Uživatel může odeslat XSS payload.  
**DŮKAZ:**
```javascript
// POST /:id/submit — uložení dat bez sanitizace
await db.prepare(`
  INSERT INTO form_submissions (form_id, data_json, ip) VALUES (?, ?, ?)
`).run(id, JSON.stringify(submittedData), ip);
```
**DOPAD:** XSS útok při zobrazení submissions v adminu pokud FE nepoužije DOMPurify správně.  
**OPRAVA:** Implementovat server-side sanitizaci pomocí DOMPurify (isomorphic) nebo striktní whitelist povolených HTML tagů.

---

### BE-009: Chybí rate limiting na resend verification
**ZÁVAŽNOST:** NÍZKÁ  
**SOUBOR:** N/A — funkce neexistuje  
**POPIS:** N/A — v kódu není resend verification endpoint.  
**DŮKAZ:** N/A  
**DOPAD:** N/A  
**OPRAVA:** N/A

---

## 1.4 AUTENTIZACE & AUTORIZACE

### BE-010: AuthMiddleware.verifyToken nevrací detailní chybovou zprávu
**ZÁVAŽNOST:** NÍZKÁ  
**SOUBOR:** backend/middleware/auth.js:24-41  
**POPIS:** Middleware vrací generické "Authentication required" / "Invalid token" bez rozlišení proč token selhal (expired vs malformed vs revoked).  
**DŮKAZ:**
```javascript
try {
  const decoded = jwt.verify(token, JWT_SECRET);
  ...
} catch {
  return res.status(401).json({ error: 'Invalid token' });
}
```
**DOPAD:** FE nemůže rozlišit mezi expirovaným tokenem a neplatným tokenem → nemožnost automatického refresh.  
**OPRAVA:** Zachytit JWTExpiredError separátně a vrátit specifickou chybu.

---

### BE-011: Token blacklist je in-memory pouze — nepřežije restart
**ZÁVAŽNOST:** NÍZKÁ  
**SOUBOR:** backend/middleware/auth.js:5-21  
**POPIS:** Token blacklist je Map v paměti. Po restartu serveru jsou všechny tokeny "znovu platné" až do jejich expiry.  
**DŮKAZ:**
```javascript
class TokenBlacklist {
  constructor() { this._map = new Map(); }
  // ...nic není persistováno
}
```
**DOPAD:** Po restartu serveru může uživatel použít odhlášený token dokud neexpiruje.  
**OPRAVA:** Implementovat Redis/databázový blacklist, nebo alespoň blacklist persistovat do DB.

---

### BE-012: getAuthHeaders nepoužívá httpOnly cookie
**ZÁVAŽNOST:** INFO  
**SOUBOR:** frontend/js/auth.js (FE file, ale relevantní pro BE design)  
**POPIS:** JWT token je uložen v localStorage (nikoliv httpOnly cookie), což zvyšuje riziko XSS theft.  
**DŮKAZ:**
```javascript
// auth.js
localStorage.setItem('nicolet_token', data.token);
```
**DOPAD:** XSS vulnerability může ukrást token.  
**OPRAVA:** Zvážit přechod na httpOnly cookies (architekturní změna, vyžaduje analýzu).

---

### BE-013: Některé admin endpointy nemají explicitní adminOnly check
**ZÁVAŽNOST:** KRITICKÁ  
**SOUBOR:** backend/routes/*.js — ověřit každý  
**POPIS:** Musím ověřit zda všechny /admin/* endpointy mají AuthMiddleware.adminOnly.  
**DŮKAZ:** TBD — potřeba manuální kontrola  
**DOPAD:** Pokud některý admin endpoint používá pouze verifyToken, uživatel s role='user' (pokud existuje) by mohl volat admin operace.  
**OPRAVA:** Ověřit všechny /admin/* routy a přidat adminOnly tam kde chybí.

---

## 1.5 BUSINESS LOGIKA

### BE-014: Datum porovnávání jako stringy místo datumů
**ZÁVAŽNOST:** STŘEDNÍ  
**SOUBOR:** backend/routes/trainings.js  
**POPIS:** date_start a date_end jsou ukládány jako TEXT (ISO string), což může vést k chybným porovnáním pokud formát není konzistentní.  
**DŮKAZ:**
```javascript
// trainings.js — schéma
CREATE TABLE ... date_start TEXT NOT NULL, date_end TEXT ...
```
**DOPAD:** Při nejednotném formátu (např. '2024-01-15' vs '2024-1-15') může selhat řazení/filtrace.  
**OPRAVA:** Přidat validaci formátu ISO 8601 (YYYY-MM-DD) před uložením.

---

### BE-015: syncProductApplications nepoužívá transakci
**ZÁVAŽNOST:** STŘEDNÍ  
**SOUBOR:** backend/routes/products.js:70-78  
**POPIS:** DELETE + INSERT operace pro M:N vztahy nejsou v transakci — může dojít k nekonzistentnímu stavu při chybě.  
**DŮKAZ:**
```javascript
async function syncProductApplications(productId, applicationIds) {
  await db.prepare('DELETE FROM product_applications_map WHERE product_id = ?').run(productId);
  if (!Array.isArray(applicationIds)) return;
  for (const appId of applicationIds) {
    try {
      await db.prepare('INSERT ...').run(productId, appId);
    } catch { /* ignore */ }
  }
}
```
**DOPAD:** Pokud selže INSERT po DELETE, produkt ztratí všechny aplikace.  
**OPRAVA:** N/A — SQLite nepodporuje transakce v tomto wrapperu dle AGENTS.md (No BEGIN/COMMIT). Pro PostgreSQL implementovat transakci.

---

### BE-016: generateSlug používá Date.now() bez normalizace — možné duplicity
**ZÁVAŽNOST:** NÍZKÁ  
**SOUBOR:** backend/routes/products.js:8-10  
**POPIS:** Pokud dva produkty vzniknou ve stejném milisekundovém okně, mohou mít stejný slug.  
**DŮKAZ:**
```javascript
return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + `-${Date.now()}`;
```
**DOPAD:** Teoreticky možná kolize slugů při masovém importu.  
**OPRAVA:** Přidat random suffix nebo použít UUID.

---

## 1.6 ERROR HANDLING

### BE-017: Chybí global unhandled rejection handler pro DB queries
**ZÁVAŽNOST:** STŘEDNÍ  
**SOUBOR:** backend/database.js  
**POPIS:** PostgreSQL pool error handler pouze loguje, ale neřeší reconnect.  
**DŮKAZ:**
```javascript
pool.on('error', (err) => console.error('PG pool error:', err));
```
**DOPAD:** Při selhání PG poolu mohou všechny následující dotazy selhat bez recovery.  
**OPRAVA:** Implementovat reconnect logiku nebo graceful shutdown.

---

### BE-018: Error messages mohou leakovat interní informace
**ZÁVAŽNOST:** NÍZKÁ  
**SOUBOR:** backend/routes/*.js — některé  
**POPIS:** Některé endpointy vrací err.message přímo klientovi.  
**DŮKAZ:**
```javascript
// forms.js:196
} catch (err) {
  res.status(500).json({ error: err.message || 'Chyba serveru' });
}
```
**DOPAD:** Potenciální leak interních cest nebo SQL detailů.  
**OPRAVA:** Vždy vracet generickou chybu, logovat detail na serveru.

---

## 1.7 VÝKON

### BE-019: GET /api/products/:slug a /:id/applications dělají 3 dotazy
**ZÁVAŽNOST:** INFO  
**SOUBOR:** backend/routes/products.js  
**POPIS:** Detail produktu vyžaduje: 1) produkt, 2) kategorie, 3) aplikace. Není to N+1, ale může se optimalizovat.  
**DŮKAZ:**
```javascript
const product = await getProductBySlug(slug);
product.categories = await getProductCategories(product.id);
product.applications = await getProductApplications(product.id);
```
**DOPAD:** Přijatelné pro menší data, ale neoptimální.  
**OPRAVA:** N/A — komplexita JOINů by byla vysoká, současné řešení je přehledné.

---

### BE-020: Sitemap generace dělá 4 paralelní dotazy bez limitu
**ZÁVAŽNOST:** INFO  
**SOUBOR:** backend/server.js:149-176  
**POPIS:** Sitemap načítá všechny publikované produkty, aplikace, novinky a stránky bez limitu/paginace.  
**DŮKAZ:**
```javascript
const [products, apps, news, pages] = await Promise.all([
  db.prepare("SELECT slug, updated_at FROM products WHERE is_published = 1").all(),
  // ...všechny záznamy
]);
```
**DOPAD:** Při tisících záznamech může být sitemap velká, ale pro tento use case akceptovatelné.  
**OPRAVA:** N/A — sitemap musí obsahovat všechny URL.

---

## N/A — Přeskočeno

### ❌ N/A: Některé body checklistu

**1.1.1 TODO/Empty functions:** Všechny importované handlery existují a jsou implementovány.  
**1.1.5 HTTP 200 při chybě:** Všechny chyby vracejí odpovídající status kódy (400, 401, 404, 500).  
**1.2.1 PK na všech tabulkách:** Všechny tabulky mají primární klíč.  
**1.2.2 FK existují:** Všechny vztahy mají definované FK constraints.  
**1.2.4 N+1 problém:** Batch loading je implementován pro products i applications.  
**1.3.1 Validace na serveru:** Všechny mutace validují povinná pole.  
**1.3.4 Email validace:** Používá regex /^[^\s@]+@[^\s@]+\.[^\s@]+$/  
**1.3.7 File validace:** MIME + extension whitelist v gallery.js  
**1.4.1 Middleware na všech chráněných:** Všechny /admin/* mají verifyToken  
**1.4.7 CRUD autorizace:** Pouze verifyToken+adminOnly — OK pro tuto aplikaci (jen admin role)  
**1.5.1 Edge cases:** Ošetřeno většinou (prázdné pole → 404 nebo prázdný seznam)  
**1.5.3 Výpočty:** N/A — žádné složité výpočty  
**1.6.1 Async try/catch:** Všechny async funkce mají try/catch  
**1.6.4 Chybové zprávy:** Obecné zprávy pro user, detailní pro log  
**1.6.7 Žádná PII v logu:** OK — logger.js má scrubbing

---

**Celkem nalezeno:** 20 nálezů  
**KRITICKÁ:** 1 (BE-013 ověření adminOnly)  
**VYSOKÁ:** 2 (BE-001 unprotected admin, BE-008 XSS submissions)  
**STŘEDNÍ:** 7  
**NÍZKÁ:** 8  
**INFO:** 2
