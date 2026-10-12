/**
 * Unit tests for the public content-API cache middleware.
 *
 * Rule: only GET requests for whitelisted public content prefixes are cached;
 * the admin surface and auth are never cached.
 */
import { describe, it, expect } from 'vitest';
import { isCacheablePublicGet, publicCache } from '../../backend/middleware/public-cache.js';

describe('isCacheablePublicGet', () => {
  it('caches GET on whitelisted public content (query strings ignored)', () => {
    const urls = [
      '/api/products', '/api/products?fields=list', '/api/products/order',
      '/api/product-categories', '/api/applications', '/api/applications/some-slug',
      '/api/application-groups', '/api/news', '/api/news-categories',
      '/api/carousel', '/api/trainings', '/api/faqs', '/api/pages',
      '/api/pages/notfound', '/api/buttons', '/api/menu', '/api/menu/product-tree',
      '/api/settings/public',
    ];
    for (const u of urls) expect(isCacheablePublicGet('GET', u), u).toBe(true);
  });

  it('never caches the admin surface or auth', () => {
    const urls = [
      '/api/products/admin/all', '/api/pages/admin/all', '/api/news/admin/1',
      '/api/auth/me', '/api/auth/login', '/api/settings', '/api/submissions',
      '/api/forms/1', '/api/gallery/images/admin/all',
    ];
    for (const u of urls) expect(isCacheablePublicGet('GET', u), u).toBe(false);
  });

  it('never caches non-GET methods', () => {
    expect(isCacheablePublicGet('POST', '/api/products')).toBe(false);
    expect(isCacheablePublicGet('PUT', '/api/products/1')).toBe(false);
    expect(isCacheablePublicGet('DELETE', '/api/products/1')).toBe(false);
  });
});

describe('publicCache middleware', () => {
  const makeRes = () => {
    const headers = {};
    return { headers, set(k, v) { headers[k] = v; } };
  };

  it('sets a short public cache header and continues', () => {
    const res = makeRes();
    let nexted = false;
    publicCache({ method: 'GET', originalUrl: '/api/products?fields=list' }, res, () => { nexted = true; });
    expect(nexted).toBe(true);
    expect(res.headers['Cache-Control']).toBe('public, max-age=30, stale-while-revalidate=300');
  });

  it('sets nothing on the admin surface', () => {
    const res = makeRes();
    publicCache({ method: 'GET', originalUrl: '/api/products/admin/all' }, res, () => {});
    expect(res.headers['Cache-Control']).toBeUndefined();
  });
});
