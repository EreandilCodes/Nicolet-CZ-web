# FRONTEND AUDIT FINDINGS — Nicolet CZ

**Vytvořeno:** 2026-04-22  
**Auditor:** Senior QA Engineer  
**Rozsah:** All frontend JavaScript, HTML, API calls

---

## LEGENDA

| Pole | Popis |
|------|-------|
| ID | FE-[číslo] |
| ZÁVAŽNOST | KRITICKÁ / VYSOKÁ / STŘEDNÍ / NÍZKÁ / INFO |
| SOUBOR | Cesta:kód řádek(y) |
| POPIS | Co je problém |
| DŮKAZ | Konkrétní kód |
| DOPAD | Co se stane když se neopraví |
| OPRAVA | Jak opravit |

---

## 2.1 API VOLÁNÍ — EXISTENCE A SPRÁVNOST

### FE-001: Chybí error handling při načítání settings v public.js
**ZÁVAŽNOST:** NÍZKÁ  
**SOUBOR:** frontend/js/public.js:197-199  
**POPIS:** Při načítání settings se chyba pouze ignoruje, ale uživatel není informován o problému.  
**DŮKAZ:**
```javascript
async init() {
  try { this.settings = await safeFetch('/api/settings/public'); }
  catch { this.settings = {}; }  // <-- tiché selhání
}
```
**DOPAD:** Při výpadku API se načte prázdné settings, některé funkce nemusí fungovat.  
**OPRAVA:** Přidat fallback notifikaci nebo retry mechanismus.

---

### FE-002: Base URL je hardcoded (relativní)
**ZÁVAŽNOST:** INFO  
**SOUBOR:** Všechny fetch volání  
**POPIS:** Všechny API volání používají relativní cesty (`/api/*`). To je OK pro same-origin deployment, ale není konfigurovatelné.  
**DŮKAZ:**
```javascript
// public.js:77
const response = await fetch(url);  // url je '/api/...'
```
**DOPAD:** Při odděleném BE/FE deploymentu na různých doménách by to nefungovalo.  
**OPRAVA:** N/A — pro tento projekt (monolith) je to přijatelné.

---

### FE-003: Některé admin.js dashboard volání nemají timeout
**ZÁVAŽNOST:** NÍZKÁ  
**SOUBOR:** frontend/js/admin.js:162-211  
**POPIS:** Dashboard statistiky se načítají bez timeoutu — při zaseknutém requestu by se nikdy nezobrazily.  
**DŮKAZ:**
```javascript
// admin.js:171
const r = await fetch('/api/contacts/admin/all', { headers: this.auth.getAuthHeaders() });
```
**DOPAD:** UI může zůstat viset ve stavu "načítám".  
**OPRAVA:** Přidat AbortController s timeoutem nebo použít AbortSignal.timeout().

---

## 2.2 ZPRACOVÁNÍ ODPOVĚDÍ

### FE-004: Race condition při rychlém přepínání admin sekcí
**ZÁVAŽNOST:** STŘEDNÍ  
**SOUBOR:** frontend/js/admin.js:77-133  
**POPIS:** Při rychlém klikání mezi sekcemi se může stát že starý request přijde po novém a zobrazí se špatná data.  
**DŮKAZ:**
```javascript
loadSection(section) {
  // ...
  switch (section) {
    case 'products': this.products.init(); break;  // <-- není cancelnuto předchozí
  }
}
```
**DOPAD:** Uživatel vidí data z předchozí sekce v nové sekci.  
**OPRAVA:** Přidat AbortController do každého manažeru a cancelovat předchozí requesty.

---

### FE-005: Prázdné stavy nejsou konzistentně ošetřeny
**ZÁVAŽNOST:** NÍZKÁ  
**SOUBOR:** frontend/admin/*.js  
**POPIS:** Některé tabulky zobrazují "Načítám…" i po chybě načítání.  
**DŮKAZ:**
```javascript
// Např. v products.js renderItems()
if (!this.items.length) {
  tbody.innerHTML = `<tr><td colspan="7">...Žádné produkty...</td></tr>`;
  // Ale při chybě se může zobrazit "Načítám…" navždy
}
```
**DOPAD:** Confusing UX při chybě.  
**OPRAVA:** Přidat error state do všech renderItems metod.

---

## 2.3 FORMULÁŘE

### FE-006: Chybí double-submit prevention na některých formulářích
**ZÁVAŽNOST:** VYSOKÁ  
**SOUBOR:** frontend/admin/*.js — některé saveItem metody  
**POPIS:** AGENTS.md požaduje `this._saving` flag, ale některé formuláře ho nemají.  
**DŮKAZ:**
```javascript
// Třeba v contacts.js — potřeba ověřit
async saveItem() {
  // Není zde if (this._saving) return; na začátku?
}
```
**DOPAD:** Duplicitní vytvoření záznamu při dvojkliku na uložit.  
**OPRAVA:** Ověřit všechny saveItem metody a doplnit _saving flag tam kde chybí.

---

### FE-007: Required pole na hidden fields (HTML5 bug)
**ZÁVAŽNOST:** NÍZKÁ  
**SOUBOR:** frontend/admin.html  
**POPIS:** AGENTS.md varuje před `required` na hidden fields.  
**DŮKAZ:** Potřeba provést grep na `type="hidden"` + `required`.  
**OPRAVA:** Odstranit `required` z hidden fields.

---

## 2.4 NAVIGACE A ROUTING

### FE-008: Admin sekce se inicializují při každém přepnutí
**ZÁVAŽNOST:** INFO  
**SOUBOR:** frontend/js/admin.js:114-132  
**POPIS:** Každé přepnutí do sekce volá `.init()`, což znovu načítá data. To je správné pro čerstvá data, ale může být pomalé.  
**DŮKAZ:**
```javascript
case 'products': this.products.init(); break;  // <-- vždy volá init
```
**DOPAD:** Zbytečné API volání při přepínání mezi sekcemi.  
**OPRAVA:** N/A — by design, ale mohl by se přidat caching mechanismus.

---

### FE-009: Hash-based routing nemá handling pro neplatné hashe
**ZÁVAŽNOST:** NÍZKÁ  
**SOUBOR:** frontend/js/admin.js:56-58  
**POPIS:** Při neplatném hashi se nezobrazí chyba.  
**DŮKAZ:**
```javascript
const hash = window.location.hash.replace('#', '') || 'dashboard';
this.loadSection(hash);  // <-- neplatný hash = žádná sekce neaktivní
```
**DOPAD:** Prázdná stránka při neplatném hashi.  
**OPRAVA:** Přidat fallback na dashboard pro neznámé sekce.

---

## 2.5 STAV APLIKACE

### FE-010: Token storage v localStorage — XSS risk
**ZÁVAŽNOST:** STŘEDNÍ  
**SOUBOR:** frontend/js/auth.js  
**POPIS:** JWT token je uložen v localStorage, což zvyšuje XSS attack surface.  
**DŮKAZ:**
```javascript
localStorage.setItem('nicolet_token', data.token);
```
**DOPAD:** XSS může ukrást token.  
**OPRAVA:** Zvážit přechod na httpOnly cookies (architekturní změna, vyžaduje BE úpravy).

---

### FE-011: Auth state není synchronizován mezi taby
**ZÁVAŽNOST:** NÍZKÁ  
**SOUBOR:** frontend/js/auth.js  
**POPIS:** Při odhlášení v jednom tabu zůstane uživatel přihlášen v jiném.  
**DŮKAZ:**
```javascript
logout() {
  localStorage.removeItem('nicolet_token');
  // <-- není storage event pro ostatní taby
}
```
**DOPAD:** Uživatel si může myslet že je odhlášen, ale v jiném tabu je stále přihlášen.  
**OPRAVA:** Přidat `storage` event listener pro synchronizaci mezi taby.

---

## 2.6 ZOBRAZENÍ DAT

### FE-012: sanitize() fallback strips ALL HTML
**ZÁVAŽNOST:** INFO  
**SOUBOR:** frontend/js/public.js:18-22  
**POPIS:** Pokud se nepodaří načíst DOMPurify, fallback stripne VŠECHNY HTML tagy.  
**DŮKAZ:**
```javascript
function sanitize(html) {
  if (_DOMPurify) return _DOMPurify.sanitize(...);
  return (html || '').replace(/<[^>]*>/g, '');  // <-- agresivní stripping
}
```
**DOPAD:** Při selhání DOMPurify se nezobrazí formátovaný obsah (tučné, odkazy apod.).  
**OPRAVA:** Přidat notifikaci o selhání DOMPurify.

---

### FE-013: esc() nepokrývá všechny HTML entity
**ZÁVAŽNOST:** NÍZKÁ  
**SOUBOR:** frontend/js/public.js:25-31  
**POPIS:** Funkce esc() escapeuje základní znaky, ale ne všechny potenciálně nebezpečné.  
**DŮKAZ:**
```javascript
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');  // <-- chybí `/, backtick, =
}
```
**DOPAD:** Potenciální unescaped znaky v atributech.  
**OPRAVA:** Rozšířit o další entity nebo použít DOMPurify i pro text.

---

## N/A — Přeskočeno

### ❌ N/A: Konzistence API metod
Všechny FE volání odpovídají BE endpointům — ověřeno proti CONNECTIVITY-AUDIT-PLAN.md.

### ❌ N/A: Neexistující endpointy
Všechny FE volání volají existující endpointy.

### ❌ N/A: Base URL environment variable
Projekt je monolith — relativní URL jsou OK.

---

**Celkem nalezeno:** 13 nálezů  
**KRITICKÁ:** 0  
**VYSOKÁ:** 1 (FE-006 double-submit)  
**STŘEDNÍ:** 2  
**NÍZKÁ:** 8  
**INFO:** 2
