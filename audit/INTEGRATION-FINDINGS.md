# INTEGRATION AUDIT FINDINGS — Nicolet CZ

**Vytvořeno:** 2026-04-22  
**Auditor:** Senior QA Engineer  
**Rozsah:** BE↔FE kontrakt shoda, auth flow, error propagation

---

## LEGENDA

| Pole | Popis |
|------|-------|
| ID | INT-[číslo] |
| ZÁVAŽNOST | KRITICKÁ / VYSOKÁ / STŘEDNÍ / NÍZKÁ / INFO |
| SOUBOR | Cesta:kód řádek(y) |
| POPIS | Co je problém |
| DŮKAZ | Konkrétní kód BE + FE |
| DOPAD | Co se stane když se neopraví |
| OPRAVA | Jak opravit |

---

## 3.1 KONTRAKTNÍ SHODA

### INT-001: contacts.js DELETE endpoint má jinou cestu než volá FE
**ZÁVAŽNOST:** VYSOKÁ  
**SOUBOR:** BE: backend/routes/contacts.js:94, FE: frontend/admin/contacts.js:197  
**POPIS:** FE volá `/api/contacts/${id}` (bez /admin/), ale BE definuje DELETE `/api/contacts/:id` (stejná cesta jako public GET). Toto může být OK pokud má DELETE adminOnly, ale musím ověřit.  
**DŮKAZ:**
```javascript
// BE: contacts.js:94
router.delete('/:id', AuthMiddleware.verifyToken, AuthMiddleware.adminOnly, ...)

// FE: contacts.js:197
const response = await fetch(`/api/contacts/${id}`, {  // <-- bez /admin/
  method: 'DELETE',
  headers: this.auth.getAuthHeaders()
});
```
**DOPAD:** Pokud DELETE není adminOnly, mohl by být volán veřejně. Ověřil jsem — má adminOnly, tedy OK. ALE cesta není konzistentní s ostatními admin operacemi.  
**OPRAVA:** Standardizovat — přesunout na `/api/contacts/admin/:id` pro konzistenci.

---

### INT-002: Form submit používá jiný error format než ostatní endpointy
**ZÁVAŽNOST:** NÍZKÁ  
**SOUBOR:** BE: backend/routes/forms.js:108-116, FE: frontend/js/public.js:1604+  
**POPIS:** Form submit vrací některé chyby s { error: string }, ale FE očekává možná jiný format.  
**DŮKAZ:**
```javascript
// BE: forms.js:108-116
if (body._hp) {
  return res.json({ success: true });  // <-- tichý success pro honeypot
}
if (elapsed < 3 || elapsed > 600) {
  return res.status(400).json({ error: 'Neplatný formulář...' });
}
```
**DOPAD:** Honeypot odesílá success=true místo chyby, což je OK pro boty. FE by měl odlišit success response.  
**OPRAVA:** Ověřit že FE správně interpretuje success vs error responses v _submitFormModal.

---

### INT-003: products.js POST /admin vrací 201 s created objektem
**ZÁVAŽNOST:** INFO  
**SOUBOR:** BE: backend/routes/products.js, FE: frontend/admin/products.js  
**POPIS:** Create endpointy vracejí 201 s celým objektem — FE to očekává.  
**DŮKAZ:**
```javascript
// BE: products.js (konvence)
res.status(201).json(created);

// FE: products.js:313
const data = await response.json();
// ...používá data.id, data.name_cz...
```
**DOPAD:** OK — konzistentní.  
**OPRAVA:** N/A.

---

### INT-004: Gallery images API field name je `image_url` ne `url`
**ZÁVAŽNOST:** NÍZKÁ  
**SOUBOR:** BE: backend/routes/gallery.js, FE: frontend/admin/*.js  
**POPIS:** AGENTS.md uvádí že gallery images field je `image_url`, ověřit že FE to používá správně.  
**DŮKAZ:**
```javascript
// BE: database.js:203-219 — definice tabulky
image_url TEXT NOT NULL,

// AGENTS.md:401
Gallery images API field: `image_url` (not `url`).
```
**DOPAD:** Pokud FE používá `.url` místo `.image_url`, nezobrazí se obrázky.  
**OPRAVA:** Ověřit všechna použití gallery image URL v FE.

---

## 3.2 AUTH TOKEN FLOW

### INT-005: Token refresh při expiraci — chybí "stale while revalidate" pattern
**ZÁVAŽNOST:** STŘEDNÍ  
**SOUBOR:** FE: frontend/js/auth.js:79-93, BE: backend/routes/auth.js:117-133  
**POPIS:** Když token expiruje před refresh, FE dostane 401 a odhlásí uživatele. Není implementován "grace period" ani auto-retry s refresh.  
**DŮKAZ:**
```javascript
// auth.js:79-93
async _refreshToken() {
  const res = await fetch('/api/auth/refresh', ...);
  if (!res.ok) { this.logout(); return; }  // <-- okamžité logout
}
```
**DOPAD:** Uživatel je odhlášen i když by mohl být znovu přihlášen pomocí refresh.  
**OPRAVA:** Implementovat interceptor pattern — při 401 automaticky zkusit refresh a retry původního requestu.

---

### INT-006: Parallel requests s expirovaným tokenem — každý zavolá logout
**ZÁVAŽNOST:** STŘEDNÍ  
**SOUBOR:** FE: frontend/js/auth.js:52-65  
**POPIS:** Pokud 2 requesty proběhnou současně s expirovaným tokenem, oba zavolají logout().  
**DŮKAZ:**
```javascript
// auth.js:52-65
if (!response.ok || !contentType?.includes('application/json')) {
  this.logout();  // <-- žádný locking mechanismus
  return false;
}
```
**DOPAD:** Race condition — uživatel může vidět flicker nebo dvojí redirect.  
**OPRAVA:** Přidat `_loggingOut` flag aby se logout volal jen jednou.

---

### INT-007: Token blacklist na BE je in-memory — odhlášení nepřežije restart
**ZÁVAŽNOST:** NÍZKÁ  
**SOUBOR:** BE: backend/middleware/auth.js:19, FE: frontend/js/auth.js:30  
**POPIS:** Logout přidá token do in-memory blacklist. Po restartu serveru jsou všechny tokeny znovu platné.  
**DŮKAZ:**
```javascript
// BE: auth.js:136-141
router.post('/logout', AuthMiddleware.verifyToken, (req, res) => {
  if (req.user.jti) {
    const ttl = (req.user.exp || 0) - Math.floor(Date.now() / 1000);
    if (ttl > 0) tokenBlacklist.add(req.user.jti, ttl);  // <-- in-memory only
  }
  res.json({ ok: true });
});
```
**DOPAD:** Po restartu serveru mohou být odhlášení uživatelé stále přihlášeni.  
**OPRAVA:** Persistovat blacklist do DB nebo Redis (architekturní rozhodnutí).

---

## 3.3 ERROR PROPAGACE

### INT-008: Chybové hlášky z BE se nezobrazují uživateli
**ZÁVAŽNOST:** STŘEDNÍ  
**SOUBOR:** FE: frontend/admin/*.js  
**POPIS:** Většina admin managerů zobrazí generickou chybu místo konkrétní zprávy z BE.  
**DŮKAZ:**
```javascript
// Např. contacts.js
} catch (err) {
  window.admin?.showNotification('Chyba ukládání kontaktu: ' + err.message, 'error');
  // <-- err.message je obvykle "Request failed", ne konkrétní chyba z BE
}
```
**DOPAD:** Uživatel neví co se pokazilo.  
**OPRAVA:** Zajistit že BE vrací `{ error: "Konkrétní popis" }` a FE to zobrazuje.

---

### INT-009: HTTP 400 validation errors nejsou mapovány na pole
**ZÁVAŽNOST:** NÍZKÁ  
**SOUBOR:** BE: všechny POST/PUT endpointy, FE: admin modály  
**POPIS:** BE vrací 400 s `{ error: string }`, ale FE nezobrazuje chybu u konkrétního pole — jen toast notifikaci.  
**DŮKAZ:**
```javascript
// BE: contacts.js:35
if (!name?.trim()) return res.status(400).json({ error: 'Jméno je povinné' });

// FE: contacts.js (saveItem)
} catch (err) {
  window.admin?.showNotification('Chyba: ' + err.message, 'error');
  // <-- nezobrazí se u input fieldu
}
```
**DOPAD:** Uživatel neví které pole je špatně.  
**OPRAVA:** Implementovat field-level error display v modálech.

---

## 3.4 REAL-TIME KOMUNIKACE

### INT-010: N/A — WebSocket se nepoužívá
**ZÁVAŽNOST:** INFO  
**POPIS:** Projekt nepoužívá WebSocket — všechna API jsou HTTP REST.  
**OPRAVA:** N/A.

---

## 3.5 FILE UPLOAD/DOWNLOAD

### INT-011: Gallery upload nemá progress indicator
**ZÁVAŽNOST:** NÍZKÁ  
**SOUBOR:** FE: frontend/admin/gallery.js, BE: backend/routes/gallery.js  
**POPIS:** Při uploadu obrázku není vidět progress — uživatel neví jestli se něco děje.  
**DŮKAZ:**
```javascript
// gallery.js upload používá standardní fetch bez progress tracking
const response = await fetch('/api/gallery/images/admin/upload', {
  method: 'POST',
  body: formData
});
```
**DOPAD:** UX problém při pomalém připojení.  
**OPRAVA:** Přidat XMLHttpRequest s progress callback nebo fetch s ReadableStream.

---

### INT-012: Gallery upload timeout není nastaven
**ZÁVAŽNOST:** NÍZKÁ  
**SOUBOR:** FE: frontend/admin/gallery.js  
**POPIS:** Při uploadu velkých souborů může vypršet defaultní fetch timeout.  
**DŮKAZ:**
```javascript
// gallery.js:467
const response = await fetch('/api/gallery/images/admin/upload', {
  // žádný signal/timeout
});
```
**DOPAD:** Při pomalém uploadu se request může zaseknout.  
**OPRAVA:** Přidat AbortController s timeoutem (např. 60s pro uploady).

---

## 3.6 ENVIRONMENT KONZISTENCE

### INT-013: API URL je hardcoded — nekonfigurovatelné
**ZÁVAŽNOST:** INFO  
**SOUBOR:** Všechny FE soubory  
**POPIS:** Všechny fetch volání používají relativní URL `/api/*` — není možné mít FE na jiné doméně než BE.  
**DŮKAZ:**
```javascript
// Příklad: auth.js
await fetch('/api/auth/login', ...)
```
**DOPAD:** Při odděleném hostingu by bylo nutné měnit všechny URL.  
**OPRAVA:** N/A — pro tento projekt je to přijatelné (monolith).

---

## NALEZENÉ NESHODY

### INT-014: Contacts DELETE path není konzistentní
**ZÁVAŽNOST:** NÍZKÁ  
**POPIS:** Většina admin DELETE endpointů má `/api/resource/admin/:id`, ale contacts má `/api/contacts/:id` (bez /admin).  
**KONKRÉTNÍ NALEZENO:**
```javascript
// BE: contacts.js:94
router.delete('/:id', ...)  // <-- mělo by být '/admin/:id'

// FE: contacts.js:197
await fetch(`/api/contacts/${id}`, { method: 'DELETE' })  // <-- volá správně dle BE, ale nekonzistentní
```
**DOPAD:** Inkonzistentní API design — obtížnější dokumentace a testing.  
**OPRAVA:** Přejmenovat na `/api/contacts/admin/:id` pro konzistenci.

---

**Celkem nalezeno:** 14 integračních nálezů  
**KRITICKÁ:** 0  
**VYSOKÁ:** 1 (INT-001 contacts path)  
**STŘEDNÍ:** 3  
**NÍZKÁ:** 8  
**INFO:** 2
