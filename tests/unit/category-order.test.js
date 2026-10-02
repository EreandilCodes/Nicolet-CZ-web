/**
 * Unit tests for the public sub-category ordering (frontend/js/category-order.js).
 *
 * Admin UI → Menu is the single source of truth for the order of the public
 * filter buttons. The frontend must never invent an order of its own.
 */
import { describe, it, expect } from 'vitest';
import { orderEntitiesByMenu, menuCategorySlugs, normalizeKey, SECTIONS } from '../../frontend/js/category-order.js';

// Menu exactly as Admin UI → Menu shows it (root items first, then children)
const menu = [
  { id: 1, parent_id: null, link_type: 'internal', link_value: '/', display_order: 0 },
  { id: 2, parent_id: null, link_type: 'internal', link_value: '/produkty', display_order: 10 },
  { id: 21, parent_id: 2, link_type: 'category', link_value: '/produkty?kategorie=ftir-spektroskopie', display_order: 1 },
  { id: 22, parent_id: 2, link_type: 'category', link_value: '/produkty?kategorie=ramany', display_order: 2 },
  { id: 23, parent_id: 2, link_type: 'category', link_value: '/produkty?kategorie=detektory', display_order: 3 },
  { id: 3, parent_id: null, link_type: 'internal', link_value: '/aplikace', display_order: 20 },
  { id: 31, parent_id: 3, link_type: 'app_group', link_value: '/aplikace?okruh=potravinarstvi', display_order: 1 },
  { id: 32, parent_id: 3, link_type: 'app_group', link_value: '/aplikace?okruh=polymery', display_order: 2 },
  { id: 4, parent_id: null, link_type: 'internal', link_value: '/novinky', display_order: 30 },
  { id: 41, parent_id: 4, link_type: 'news_category', link_value: '/novinky?rubrika=2026', display_order: 1 },
  { id: 42, parent_id: 4, link_type: 'news_category', link_value: '/novinky?rubrika=2025', display_order: 2 },
];

const cat = (slug, name) => ({ slug, name_cz: name, display_order: 0 });

describe('normalizeKey()', () => {
  it('ignores diacritics, case and separators', () => {
    expect(normalizeKey('FTIR-Spektroskopie')).toBe('ftirspektroskopie');
    expect(normalizeKey('Potravinářství')).toBe('potravinarstvi');
  });

  it('returns empty string for missing values', () => {
    expect(normalizeKey(null)).toBe('');
    expect(normalizeKey(undefined)).toBe('');
  });
});

describe('menuCategorySlugs()', () => {
  it('returns the children of the section root in menu display order', () => {
    expect(menuCategorySlugs(menu, 'product'))
      .toEqual(['ftir-spektroskopie', 'ramany', 'detektory']);
    expect(menuCategorySlugs(menu, 'application')).toEqual(['potravinarstvi', 'polymery']);
    expect(menuCategorySlugs(menu, 'news')).toEqual(['2026', '2025']);
  });

  it('sorts by display_order and then by id, never by insertion order', () => {
    const shuffled = [
      { id: 4, parent_id: null, link_value: '/novinky', display_order: 30 },
      { id: 42, parent_id: 4, link_value: '/novinky?rubrika=2025', display_order: 2 },
      { id: 41, parent_id: 4, link_value: '/novinky?rubrika=2026', display_order: 1 },
    ];
    expect(menuCategorySlugs(shuffled, 'news')).toEqual(['2026', '2025']);
  });

  it('accepts both admin parameter names (rubrika / kategorie)', () => {
    const m = [{ id: 1, parent_id: null, link_value: '/novinky', display_order: 1 },
      { id: 2, parent_id: 1, link_value: '/novinky?kategorie=2026', display_order: 1 }];
    expect(menuCategorySlugs(m, 'news')).toEqual(['2026']);
  });

  it('deduplicates a category that appears twice in the menu', () => {
    const m = [{ id: 1, parent_id: null, link_value: '/aplikace', display_order: 1 },
      { id: 2, parent_id: 1, link_value: '/aplikace?okruh=polymery', display_order: 1 },
      { id: 3, parent_id: 1, link_value: '/aplikace?skupina=Polymery', display_order: 2 }];
    expect(menuCategorySlugs(m, 'application')).toEqual(['polymery']);
  });

  it('falls back to path-style links when the section root is not in the menu', () => {
    const m = [{ id: 1, parent_id: null, link_value: '/aplikace/polymery', display_order: 2 },
      { id: 2, parent_id: null, link_value: '/aplikace/potravinarstvi', display_order: 1 }];
    expect(menuCategorySlugs(m, 'application')).toEqual(['potravinarstvi', 'polymery']);
  });

  it('ignores menu items from other sections', () => {
    expect(menuCategorySlugs(menu, 'news')).not.toContain('ramany');
  });

  it('returns an empty list for an empty / invalid menu', () => {
    expect(menuCategorySlugs([], 'product')).toEqual([]);
    expect(menuCategorySlugs(null, 'product')).toEqual([]);
    expect(menuCategorySlugs(menu, 'unknown')).toEqual([]);
  });
});

describe('orderEntitiesByMenu()', () => {
  it('applies the menu order even when every entity has display_order 0', () => {
    // real data: all product_categories.display_order === 0, so the API order
    // degenerated to the DB id order
    const entities = [cat('ramany', 'Rámany'), cat('detektory', 'Detektory'), cat('ftir-spektroskopie', 'FTIR')];
    expect(orderEntitiesByMenu(entities, menu, 'product').map(e => e.slug))
      .toEqual(['ftir-spektroskopie', 'ramany', 'detektory']);
  });

  it('appends entities that are not in the menu, keeping their incoming order', () => {
    const entities = [cat('ramany', 'R'), cat('nove-kategorie', 'N'), cat('detektory', 'D'), cat('jine', 'J')];
    // 'nove-kategorie' and 'jine' are not in the menu → they keep their order
    // and are appended; the two menu categories move to the front
    expect(orderEntitiesByMenu(entities, menu, 'product').map(e => e.slug))
      .toEqual(['ramany', 'detektory', 'nove-kategorie', 'jine']);
  });

  it('returns the input untouched when the menu has nothing to say', () => {
    const entities = [cat('a', 'A'), cat('b', 'B')];
    expect(orderEntitiesByMenu(entities, [], 'product').map(e => e.slug)).toEqual(['a', 'b']);
    expect(orderEntitiesByMenu(entities, null, 'product').map(e => e.slug)).toEqual(['a', 'b']);
  });

  it('matches the 2019…2026 news rubriky according to the menu', () => {
    const cats2026 = [cat('2026', '2026'), cat('2025', '2025')];
    expect(orderEntitiesByMenu(cats2026, menu, 'news').map(e => e.slug)).toEqual(['2026', '2025']);
  });

  it('does not mutate the input array', () => {
    const entities = [cat('ramany', 'R'), cat('ftir-spektroskopie', 'F')];
    orderEntitiesByMenu(entities, menu, 'product');
    expect(entities.map(e => e.slug)).toEqual(['ramany', 'ftir-spektroskopie']);
  });

  it('handles empty and invalid input', () => {
    expect(orderEntitiesByMenu([], menu, 'product')).toEqual([]);
    expect(orderEntitiesByMenu(null, menu, 'product')).toEqual([]);
    const entities = [cat('a', 'A')];
    expect(orderEntitiesByMenu(entities, menu, 'unknown')).toBe(entities);
  });
});

describe('SECTIONS', () => {
  it('declares the three public filter sections with their admin parameter names', () => {
    expect(SECTIONS.news.root).toBe('/novinky');
    expect(SECTIONS.product.root).toBe('/produkty');
    expect(SECTIONS.application.root).toBe('/aplikace');
    expect(SECTIONS.product.params).toContain('kategorie');
    expect(SECTIONS.application.params).toContain('okruh');
    expect(SECTIONS.news.params).toContain('rubrika');
  });
});
