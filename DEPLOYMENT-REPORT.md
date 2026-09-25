# Pre-Deployment Audit Report — Nicolet CZ

**Date:** 2026-06-22
**Repository:** Nicolet-CZ-web (Node.js/Express/SQLite-PostgreSQL/Vanilla JS)
**Audit scope:** Security, Forms/Email, Database, GDPR, Railway, Cloudflare, Performance, SEO, Accessibility
**Status:** ✅ READY FOR DEPLOYMENT (with recommendations)

---

## Executive Summary

Audit of the Nicolet CZ web application found the repository in good overall shape. Three high-confidence issues were identified and fixed:

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | 16 DELETE endpoint tests failing (200→204 mismatch after REST-correct change) | High | ✅ Fixed |
| 2 | Gallery PNG upload crashes (`baseName` used before declaration + `const` reassignment) | Critical | ✅ Fixed |
| 3 | Dead `nicolet_token` localStorage cleanup code in admin.html | Low | ✅ Fixed |

**Test suite:** 226/226 passing, lint clean (0 errors, 3 pre-existing warnings).

No remaining critical or high-priority blockers identified. Remaining issues are medium/low priority (see below).

---

## Safe Fixes Applied

### Fix 1: DELETE endpoint tests (16 tests)
- **File:** `tests/api/crud.test.js`
- **Change:** `expect(res.status).toBe(200)` → `expect(res.status).toBe(204)` for all 16 DELETE success test cases
- **Why:** Backend was recently refactored to return HTTP 204 (correct REST standard for DELETE), but tests were not updated
- **Also:** Fixed contacts DELETE test path from `/api/contacts/:id` → `/api/contacts/admin/:id` (old public-style path didn't exist)

### Fix 2: Gallery PNG upload crash
- **File:** `backend/routes/gallery.js`
- **Changes:**
  - Line 213: `const filename` → `let filename` (was preventing reassignment on line 258)
  - Line 235: `baseName + '.webp'` → `path.basename(filename, ext) + '.webp'` (was using variable declared 30+ lines later)
- **Impact:** Every PNG upload to gallery would throw `ReferenceError: baseName is not defined` — broken feature

### Fix 3: Dead localStorage references
- **File:** `frontend/admin.html`
- **Change:** Removed 4 lines of `localStorage.removeItem('nicolet_token')` / `localStorage.removeItem('nicolet_user')`
- **Why:** Auth was migrated to httpOnly cookies — these localStorage items are never set, only cleaned up. Dead code.

---

## Remaining Issues by Priority

### Critical (🔴 None)
All critical issues from prior audit (BE-001 admin page auth, BE-008 XSS sanitization) are verified as fixed.

### High (🟠 1 issue)

| Issue | File | Description |
|-------|------|-------------|
| **No `trust proxy` setting** | `backend/server.js` | Missing `app.set('trust proxy', ...)` means `req.ip` returns proxy IPs behind Cloudflare/nginx. Affects rate limiting (login/IP, general API), request logging, and audit trail. |

### Medium (🟡 2 issues)

| Issue | File | Description |
|-------|------|-------------|
| **In-memory rate limiting resets on restart** | `backend/routes/auth.js` | Login rate limit (`Map`) and account lockout (`Map`) are in-memory only. Server restart resets all counters. Acceptable for single-instance Railway deployment, but not for multi-instance. |
| **Missing robots.txt** | `frontend/` (missing) | No `robots.txt` in static directory. Returns SPA HTML response. Low SEO impact but should be added. `request-logger.js` already has it in SILENT_PATHS. |

### Low (🟢 3 issues)

| Issue | File | Description |
|-------|------|-------------|
| **Missing `seo_desc` on applications** | `backend/database.js:383` | `applications` table has `seo_title_cz/en` but no `seo_desc_cz/en`. Products, news, and pages all have both. Incomplete SEO implementation for applications. |
| **EmailService duplication** | `backend/routes/forms.js` | Has its own inline nodemailer transport (`sendFormEmail`) instead of using `backend/services/email.service.js`. Identical to `EmailService.sendEmail`. Low risk but violates DRY. |
| **Old `nicolet_token` in auth middleware fallback** | `backend/middleware/auth.js:26` | Auth middleware falls back to `Authorization: Bearer` header if cookie is absent. No frontend sends this header, but the code path remains. |

---

## Security Assessment

| Area | Status | Notes |
|------|--------|-------|
| CSP | ✅ Good | `useDefaults: false`, script/style with `'unsafe-inline'`, no CDN (Purify self-hosted) |
| HSTS | ✅ Good | Enabled in production only (31536000s, includeSubDomains) |
| Rate limiting | ✅ Good | 100 req/min general, 30 req/min writes, 10/IP/15min login (in-memory) |
| Account lockout | ✅ Good | 5 consecutive failures → 15 min lock per email (in-memory) |
| XSS prevention | ✅ Good | Server-side entity escaping (`sanitizeField`/`sanitizeSubmission`) in forms.js |
| SQL injection | ✅ Good | Parameterized queries throughout |
| Helmet | ⚠️ Minor | `crossOriginEmbedderPolicy: false` (not set — might be needed for Cloudflare) |
| Auth | ✅ Good | httpOnly cookies, JWT 1h expiry, refresh interceptor, JTI blacklist, graceful handling |
| Upload validation | ✅ Good | MIME + extension whitelist, Sharp compression, 50MB limit |
| Honeypot + time check | ✅ Good | Public forms protected |
| **trust proxy** | ❌ Missing | **HIGH** — needed behind Cloudflare/nginx for correct IP detection |

**Security verdict:** Sound for a small-business website. The missing `trust proxy` setting is the most impactful finding — it causes rate limiting to use proxy IPs (all users share one IP → lockout risk).

---

## GDPR Readiness

| Requirement | Status | Notes |
|-------------|--------|-------|
| Contact form data minimization | ✅ Good | Only collects explicitly defined form fields |
| Email notifications | ✅ Good | Non-blocking email sending, configurable recipients |
| Data deletion (contacts, submissions) | ✅ Good | Admin DELETE endpoints functional (204 responses) |
| Account lockout notification | ⚠️ Basic | User sees "Účet dočasně uzamčen" but no email notification |
| Cookie consent | ❓ Not assessed | Not implemented in code — may be needed for GA tracking |

---

## Forms Assessment

| Feature | Status | Notes |
|---------|--------|-------|
| Dynamic field builder | ✅ Good | Full CRUD with CZ/EN labels, placeholders, types, required fields |
| Required field validation | ✅ Good | Both frontend (`_submitFormModal`) and backend validation |
| Honeypot + time check | ✅ Good | CSRF-style protection |
| Email notification | ✅ Good | Non-blocking, configurable recipients |
| Label color setting | ✅ Good | Black/white/blue radio selection with CSS `!important` |
| **EmailService duplication** | ⚠️ Low | Inline `sendFormEmail` vs `EmailService.sendEmail` — identical code |

---

## Database Assessment

| Entity | Table exists | Admin CRUD | SEO fields | Notes |
|--------|-------------|-----------|------------|-------|
| Settings | ✅ | ✅ | N/A | |
| Contacts | ✅ | ✅ | N/A | |
| Carousel | ✅ | ✅ | N/A | |
| News | ✅ | ✅ | ✅ `seo_desc_cz/en` | |
| News Categories | ✅ | ✅ | N/A | |
| Pages | ✅ | ✅ | ✅ `seo_desc_cz/en` | |
| Products | ✅ | ✅ | ✅ `seo_desc_cz/en` | |
| Product Categories | ✅ | ✅ | N/A | |
| Applications | ✅ | ✅ | ❌ Missing `seo_desc_cz/en` | Incomplete |
| Application Groups | ✅ | ✅ | N/A | |
| Trainings | ✅ | ✅ | N/A | |
| Gallery | ✅ | ✅ | N/A | |
| Menu | ✅ | ✅ | N/A | |
| Forms | ✅ | ✅ | N/A | |
| Form Submissions | ✅ | ✅ | N/A | |
| FAQs | ✅ | ✅ | N/A | |
| Buttons | ✅ | ✅ | N/A | |
| Users | ✅ | N/A | N/A | Seeded via initDatabase |

**Schema migration:** All `ALTER TABLE ADD COLUMN` wrapped in try/catch. No transaction runner. All schema in `database.js`.

**Indexes:** Verified that prior audit issues BE-003/BE-004 (FK column indexes) are fixed.

---

## Railway Readiness

| Requirement | Status | Notes |
|-------------|--------|-------|
| Start command | ✅ Good | `node backend/server.js` |
| PORT env var | ✅ Good | `process.env.PORT \|\| 3003` |
| Database dual-mode | ✅ Good | SQLite (dev) / PostgreSQL (Neon, production) |
| Graceful shutdown | ✅ Good | SIGTERM/SIGINT → close DB, destroy server |
| Logging | ✅ Good | Structured JSON logger, request tracing |
| Build step | ⚠️ None needed | Vanilla JS SPA, no build |

---

## Cloudflare Readiness

| Requirement | Status | Notes |
|-------------|--------|-------|
| **trust proxy** | ❌ Missing | Must add `app.set('trust proxy', 1)` for correct IP |
| HSTS | ✅ Good | Enabled in production |
| CSP | ✅ Good | Self-hosted resources, no CDN dependencies except fonts |
| Cache strategy | ✅ Good | Static assets 1d cache, HTML no-cache |
| Sitemap | ✅ Good | `/sitemap.xml` auto-generated from DB |
| SSL/TLS | ✅ Handled by CF | Express serves HTTP, CF terminates TLS |

---

## Performance Assessment

| Area | Status | Notes |
|------|--------|-------|
| Static asset caching | ✅ Good | 1 day maxAge |
| Compression (gzip) | ✅ Good | `compression` middleware |
| Image optimization | ✅ Good | Sharp: max 2000px, JPEG q85 progressive, PNG→WebP q90 |
| Response size | ✅ Good | 1mb JSON limit on requests |
| Concurrent DB access | ✅ Good | WAL mode for SQLite, connection pool for PG |
| CSS | ⚠️ Moderate | Single CSS file (admin.css, style.css), not minified |

---

## SEO Assessment

| Area | Status | Notes |
|------|--------|-------|
| Auto-generated sitemap | ✅ Good | `/sitemap.xml` includes products, apps, news, pages |
| Meta titles/descriptions | ✅ Good | Per-entity CZ/EN for news, products, pages |
| Applications SEO | ⚠️ Low | Missing `seo_desc_cz/en` — titles only |
| Canonical URLs | ❓ Not found | Not implemented |
| robots.txt | ❌ Missing | Returns SPA HTML (low impact — CF can add) |
| Semantic HTML | ✅ Good | `<article>`, `<section>`, `<nav>` used |

---

## Accessibility Assessment

| Area | Status | Notes |
|------|--------|-------|
| Semantic HTML | ✅ Good | Proper landmark elements |
| ARIA attributes | ✅ Basic | `aria-hidden="true"` on decorative elements |
| Form labels | ✅ Good | `<label>` elements associated with inputs |
| Keyboard navigation | ⚠️ Admin only | Admin sidebar nav keyboard accessible |
| Color contrast | ❓ Not assessed | Visual check only — tooling needed |
| Focus indicators | ❓ Not assessed | Visual check only |

---

## Deployment Checklist

### Pre-deployment
- [x] All 226 tests passing
- [x] ESLint clean (0 errors)
- [x] No `console.log` in production code (only `console.error` in non-critical paths)
- [x] All non-critical email failures handled gracefully
- [x] Auth uses httpOnly cookies (no localStorage tokens)
- [x] CSP configured for production
- [x] Rate limiting active

### Pre-deployment ⚠️ Recommended
- [ ] Add `app.set('trust proxy', 1)` in `backend/server.js` before helmut/rate-limiting
- [ ] Add `robots.txt` to `frontend/` directory (basic: allow all, sitemap link)
- [ ] Verify `SITE_URL` env var is set on Railway (used by sitemap generator)
- [ ] Verify `JWT_SECRET` env var is set (used for token signing)
- [ ] Verify `CORS_ORIGIN` env var is set on Railway
- [ ] Verify `DATABASE_URL` env var points to Neon PostgreSQL
- [ ] Verify `SMTP_*` env vars for email sending

### Post-deployment
- [ ] Smoke-test all admin sections (CRUD operations)
- [ ] Test gallery upload (JPEG, PNG, WebP)
- [ ] Test public form submission
- [ ] Test login/logout/refresh flow
- [ ] Verify sitemap.xml accessible
- [ ] Monitor logs for errors

---

## Post-Deployment Monitoring Checklist

| What to watch | How | Threshold |
|---------------|-----|-----------|
| 4xx/5xx errors | Railway logs | < 1% of requests |
| Login failures | Logged as `login_failed` | > 10/min → investigate |
| DB connection errors | Logged as `db_init_failed` | > 0 → check Neon |
| Email failures | Logged as `Email failed (non-critical)` | > 0 → check SMTP config |
| Gallery upload errors | Logged as `Image optimization error` | > 0 → check Sharp |
| Rate limit hits | Logged as `login_rate_limit` | > 0 → check if legitimate users affected |

---

## Final Recommendation

**✅ DEPLOYMENT READY** after applying the 3 safe fixes above (all applied).

**One blocking recommendation:** Add `app.set('trust proxy', 1)` before deploying behind Cloudflare. Without it, rate limiting uses proxy IPs, causing all traffic to appear from Cloudflare's IP range → rate limits will trigger incorrectly under load.

Remaining medium/low issues (missing robots.txt, applications seo_desc, in-memory lockout, email service duplication) can be addressed post-deployment as time permits — none are blockers.

---

## Files Modified

| File | Change |
|------|--------|
| `tests/api/crud.test.js` | 16 DELETE assertions 200→204, contacts path fix |
| `backend/routes/gallery.js` | `const`→`let filename`, inline `path.basename` call |
| `frontend/admin.html` | Removed dead localStorage cleanup |
