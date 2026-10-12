/**
 * Short HTTP caching for the PUBLIC content API consumed by the SPA.
 *
 * Only GET requests for whitelisted public content prefixes receive a cache
 * header. The admin surface (`/api/.../admin/...`) and auth (`/api/auth/...`)
 * are never cached. 30 s freshness + 5 min stale-while-revalidate keeps repeat
 * navigation and back/forward cheap, while an admin edit becomes visible within
 * ~30 s. Express's ETag still allows 304 revalidation after the freshness window.
 *
 * Content, not freshness-critical configuration: a stale phone number for 30 s
 * is acceptable, a slow catalogue on every navigation is not.
 */
const CACHEABLE_PREFIXES = [
  '/products', '/product-categories',
  '/applications', '/application-groups',
  '/news', '/news-categories',
  '/carousel', '/trainings', '/faqs', '/pages',
  '/buttons', '/menu', '/settings/public',
];

/** @returns {boolean} whether a GET to this full URL may be cached publicly. */
export function isCacheablePublicGet(method, url) {
  const full = String(url || '');
  if (method !== 'GET') return false;
  if (!full.startsWith('/api/')) return false;
  if (full.includes('/admin')) return false;
  const pathOnly = full.slice(4).split('?')[0]; // strip '/api', drop query string
  return CACHEABLE_PREFIXES.some(p => pathOnly === p || pathOnly.startsWith(`${p}/`));
}

export function publicCache(req, res, next) {
  if (isCacheablePublicGet(req.method, req.originalUrl)) {
    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
  }
  next();
}
