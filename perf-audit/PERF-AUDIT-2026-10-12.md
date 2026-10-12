# Performance audit — Nicolet CZ (2026-10-12)

Branch: `perf-audit/2026-10-12`.

> **Tooling limitation (important):** no local Chrome and PSI API returned HTTP 429
> (anonymous daily quota exhausted), and the installed Lighthouse 13 / Puppeteer 25
> require Node ≥ 20 while this environment runs Node 18. **Lab and field Core Web
> Vitals are therefore NOT MEASURED.** All numbers below are real *network / payload /
> header* measurements taken with `curl`, asset byte sizes, and source evidence.
> Mechanism-based claims are explicitly marked as such.

## Environment / assumptions
- Stack: Node.js 18 + Express (custom, no bundler/build step), vanilla ESM SPA.
- Production: `https://nicolet-cz-web-production.up.railway.app` (Railway, HTTP/2, Brotli).
- DB/media: PostgreSQL + `frontend/uploads/` (500 files, 69 MB).
- Pages sampled: `/`, `/produkty`, `/produkty/:slug`, `/novinky`, `/aplikace`, `/o-nas`.
- Not measured: Lighthouse/CrUX, JS/CSS coverage, INP, real-device rendering.

## Measured baseline (curl)

| Resource | raw B | br B |
|---|---:|---:|
| `/` (index.html) | 12 964 | 3 066 |
| `/js/public.js` | 96 473 | 22 918 |
| `/css/public.css` | 104 740 | 20 306 |
| `/uploads/NicoLandingPage.png` | **2 703 532** | 2 703 532 (not re-compressed) |
| `/uploads/gallery/1790450879032-76126.png` | 1 339 438 | 1 339 438 |
| `/api/products?fields=list` | 25 469 (br) @1.26 s | |
| `/api/menu/product-tree` | 3 678 (br) @0.46 s | |

- HTML: `cache-control: no-cache`, `content-encoding: br`, HTTP/2. TTFB ≈ 0.29 s.
- CSS/images: `max-age=86400`. JS: `no-cache` (revalidates).
- `GET /images/favicon.ico` → **404** (referenced by `frontend/index.html:9`) and the
  404 body was the full 3 066 B SPA document.

## Findings

| ID | Finding | Evidence | Impact | Effort | Status |
|---|---|---|---|---|---|
| P1 | Homepage ships a 2.7 MB PNG (1536×1024) rendered at ≤700 px | `public.js:361`; `public.css` `.landing-intro-image`; measured 2 703 532 B | High | S | **FIXED** (WebP 257 660 B, −90.5%) |
| P2 | `/uploads/*` cached only 1 day despite immutable epoch filenames | `curl -I` → `max-age=86400` | Medium | S | **FIXED** (`max-age=31536000, immutable`) |
| P3 | Missing static assets returned the full 3 KB SPA document | `favicon.ico` 404 body 3 066 B | Low | S | **FIXED** (9 B `text/plain`) |
| P4 | No `fetchpriority`/`decoding` anywhere; detail covers have no intrinsic size | `grep` = 0 `fetchpriority`, 0 `decoding` | Med-High | S | **FIXED (mechanism) / partly NEEDS APPROVAL** |
| P5 | Product gallery thumbnails load the **full-size** image URL | `public.js:935` `src == data-full-src` | High | M | NEEDS APPROVAL |
| P6 | 100+ stored gallery PNG/JPG are large (0.9–8.8 MB each) | `du`/`find`; e.g. 8 832 949 B PNG | High | L | NEEDS APPROVAL (content) |
| P7 | JS 96 KB + CSS 105 KB served **unminified** (no build step) | raw sizes above | Medium | M | NEEDS APPROVAL (add build) |
| P8 | Google Fonts third-party CSS is render-blocking (35 `@font-face`) | `index.html:21`; fonts CSS | Medium | M | NEEDS APPROVAL (self-host) |
| P9 | `/api/products?fields=list` 25 KB @1.26 s on home/listing | curl | Medium | M | **FIXED** (30 s HTTP cache + SWR; pagination unnecessary) |
| P10 | favicon 404 (no icon asset) | `index.html:9` | Low | S | **FIXED** (`favicon.ico` + `apple-touch-icon.png`) |
| P11 | `aurora.js` rAF animation with blurred blobs (desktop only) | `aurora.js:81-108` | Low | M | Not changed (already gated: reduced-motion/touch/<768 px, pauses hidden) |

## Changes made (this branch)
1. `perf(images)`: homepage landing image → `<picture>` WebP + PNG fallback, width/height,
   `decoding="async"`; `fetchpriority="high"` + `decoding="async"` on LCP covers.
2. `perf(delivery)`: `/uploads/*` served `immutable`; file-like misses return a 9 B 404.
3. `perf(api)`: public content API cached 30 s (`stale-while-revalidate=300`), admin/auth
   never cached (`backend/middleware/public-cache.js`).
4. `perf(assets)`: real `favicon.ico` (16/32/48) + `apple-touch-icon.png` generated from the
   brand logo emblem (`scripts/make-favicon.mjs`); removes the favicon 404.

## Verification
- `npm run lint` → 0 errors (3 pre-existing warnings); `npm test` → 369/369 pass.
- Local server: `/uploads/NicoLandingPage.png` → `public, max-age=31536000, immutable`;
  `NicoLandingPage.webp` → 200 `image/webp` 257 660 B; `favicon.ico` → 404 `text/plain` 9 B;
  `/`, `/o-nas`, `/produkty` → 200; unknown route → 404 (SPA 404 view intact).
- Not verified: LCP/CLS deltas (no lab tooling).
