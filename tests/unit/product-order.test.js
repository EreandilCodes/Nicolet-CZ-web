/**
 * Unit tests for the shared public product orderer (frontend/js/product-order.js).
 *
 * The persisted sequence is the single source of truth:
 *   - Admin UI → Categories   → category display_order (siblings + hierarchy)
 *   - Admin UI → Products     → product_categories_map.display_order
 *                               (scoped to one (product, category) pair)
 *
 * The orderer must never depend on database insertion order, names, ids of the
 * translated columns or a hardcoded slug list, and it must never drop a product.
 */
import { describe, it, expect } from 'vitest';
import { buildCategoryIndex, orderProductsForCategory } from '../../frontend/js/product-order.js';

/** A tree:
 *   Root A (do=1): child A1 (do=2), child A2 (do=1)
 *   Root B (do=2): child B1 (do=1)
 */
const categories = [
  { id: 100, parent_id: null, display_order: 1, name_cz: 'A' },
  { id: 110, parent_id: 100, display_order: 2, name_cz: 'A1' },
  { id: 120, parent_id: 100, display_order: 1, name_cz: 'A2' },
  { id: 200, parent_id: null, display_order: 2, name_cz: 'B' },
  { id: 210, parent_id: 200, display_order: 1, name_cz: 'B1' },
];

const p = (id, cats, extra = {}) => ({
  id,
  display_order: 0,
  categories: cats.map(c => ({ id: c[0], order_in_category: c[1] })),
  ...extra,
});

describe('buildCategoryIndex()', () => {
  it('orders roots and children by display_order, then id', () => {
    const index = buildCategoryIndex(categories);
    expect(index.roots.map(c => c.id)).toEqual([100, 200]);
    expect(index.childrenOf(100).map(c => c.id)).toEqual([120, 110]);
    expect(index.childrenOf(200).map(c => c.id)).toEqual([210]);
  });

  it('returns an empty index for missing input', () => {
    const index = buildCategoryIndex();
    expect(index.roots).toEqual([]);
  });
});

describe('orderProductsForCategory() – All Products', () => {
  it('walks roots → children → products and keeps direct root products after children', () => {
    const products = [
      p(1, [[100, null]]),   // directly in root A
      p(2, [[110, null]]),   // in A1
      p(3, [[120, null]]),   // in A2
      p(4, [[210, null]]),   // in B1
    ];
    expect(orderProductsForCategory(products, categories, null).map(x => x.id))
      .toEqual([3, 2, 1, 4]);
  });

  it('uses the saved per-category position before the global display_order', () => {
    const products = [
      p(1, [[120, 2]]),
      p(2, [[120, 1]]),
      p(3, [[120, null]]),
    ];
    expect(orderProductsForCategory(products, categories, null).map(x => x.id))
      .toEqual([2, 1, 3]);
  });

  it('falls back to display_order then id for products without a saved position', () => {
    const products = [
      p(1, [[120, null]], { display_order: 5 }),
      p(2, [[120, null]], { display_order: 1 }),
      p(3, [[120, null]], { display_order: 1 }),
    ];
    expect(orderProductsForCategory(products, categories, null).map(x => x.id))
      .toEqual([2, 3, 1]);
  });

  it('keeps a multi-category product once, at its first traversed occurrence', () => {
    const products = [
      p(1, [[120, 1], [210, 1]]), // first reached through A2
      p(2, [[210, 2]]),
    ];
    const out = orderProductsForCategory(products, categories, null).map(x => x.id);
    expect(out).toEqual([1, 2]);
    expect(new Set(out).size).toBe(out.length);
  });

  it('appends products without any category instead of dropping them', () => {
    const products = [p(1, []), p(2, [[120, 1]])];
    expect(orderProductsForCategory(products, categories, null).map(x => x.id))
      .toEqual([2, 1]);
  });

  it('never mutates the input array', () => {
    const products = [p(1, [[120, null]]), p(2, [[120, null]])];
    const snapshot = products.map(x => x.id);
    orderProductsForCategory(products, categories, null);
    expect(products.map(x => x.id)).toEqual(snapshot);
  });
});

describe('orderProductsForCategory() – category view', () => {
  it('returns the selected branch (category + descendants) in nested order', () => {
    const products = [
      p(1, [[100, null]]),
      p(2, [[110, null]]),
      p(3, [[120, null]]),
      p(4, [[210, null]]),
    ];
    expect(orderProductsForCategory(products, categories, 100).map(x => x.id))
      .toEqual([3, 2, 1]);
  });

  it('restricts to the selected child and excludes other branches', () => {
    const products = [
      p(1, [[110, 2]]),
      p(2, [[110, 1]]),
      p(3, [[120, 0]]),
    ];
    expect(orderProductsForCategory(products, categories, 110).map(x => x.id))
      .toEqual([2, 1]);
  });

  it('returns an empty list for a category without products', () => {
    const products = [p(1, [[210, 0]])];
    expect(orderProductsForCategory(products, categories, 100)).toEqual([]);
  });
});
