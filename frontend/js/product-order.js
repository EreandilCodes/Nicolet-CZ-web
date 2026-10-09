/**
 * Nicolet CZ – shared product ordering for the public catalogue.
 *
 * SINGLE SOURCE OF TRUTH
 *   Admin UI → Categories decides the order of top-level categories and of the
 *   children inside each parent (`product_categories.display_order`).
 *   Admin UI → Products decides the order of the products inside one category
 *   (`product_categories_map.display_order`, scoped to the (product, category)
 *   pair, so a product in several categories has an independent position in
 *   each of them).
 *
 * Every public product listing (All Products, a top-level category page, a
 * child-category page, the category buttons) renders the array returned by
 * `orderProductsForCategory()` – there is no second sort in the renderer and no
 * CSS reordering.
 *
 * FALLBACK
 *   A product that has no explicit position in a category (`order_in_category`
 *   is null) sorts after the explicitly ordered ones, by its global
 *   `display_order` and then by id. It never disappears and the fallback is
 *   deterministic (no reliance on database insertion order).
 */

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Index a flat category list so the tree can be walked by parent_id only.
 * No name, slug or hardcoded list is ever involved.
 */
export function buildCategoryIndex(categories = []) {
  const byId = new Map();
  for (const c of categories) byId.set(Number(c.id), c);

  const parentKey = (c) => (c.parent_id == null ? null : Number(c.parent_id));

  // Sibling order = the order the admin set in Admin UI → Categories.
  const sorted = [...categories].sort(
    (a, b) => num(a.display_order) - num(b.display_order) || num(a.id) - num(b.id)
  );

  const childrenOf = (parentId) => sorted.filter(c => parentKey(c) === parentId);
  const roots = childrenOf(null);

  return { byId, roots, childrenOf };
}

/**
 * Order the products that belong to `selectedId` (a category id) or to any of
 * its descendants, walking children before their parent and applying the saved
 * per-category product order inside every group.
 *
 * `selectedId === null` → the whole catalogue in the same hierarchical order
 * (used by the "All Products" view). Products without any category are appended
 * last by their global order.
 *
 * @param {Array}  products   products with `categories: [{id, order_in_category}]`
 * @param {Array}  categories all product categories (id, parent_id, display_order)
 * @param {number|null} selectedId
 * @returns {Array} a new array – a subset for a category, the full set for null
 */
export function orderProductsForCategory(products = [], categories = [], selectedId = null) {
  const index = buildCategoryIndex(categories);

  const hasCategory = (product, categoryId) =>
    (product.categories || []).some(c => Number(c.id) === categoryId);

  const orderInCategory = (product, categoryId) => {
    const c = (product.categories || []).find(c => Number(c.id) === categoryId);
    return c && c.order_in_category != null ? Number(c.order_in_category) : Infinity;
  };

  // Cartesian-aware comparator: the saved position wins, then the global
  // product order, then the id – always deterministic.
  const within = (categoryId) => (a, b) =>
    orderInCategory(a, categoryId) - orderInCategory(b, categoryId)
    || num(a.display_order) - num(b.display_order)
    || num(a.id) - num(b.id);

  const emitted = new Set();
  const out = [];

  const emitDirect = (categoryId) => {
    const group = products.filter(
      p => !emitted.has(Number(p.id)) && hasCategory(p, categoryId)
    );
    group.sort(within(categoryId));
    for (const p of group) {
      if (emitted.has(Number(p.id))) continue;
      emitted.add(Number(p.id));
      out.push(p);
    }
  };

  // Depth-first: child categories first, then the products directly in this one.
  const walk = (categoryId) => {
    for (const child of index.childrenOf(categoryId)) walk(Number(child.id));
    emitDirect(categoryId);
  };

  if (selectedId == null) {
    for (const root of index.roots) walk(Number(root.id));
    // Products not assigned to any (active) category keep a deterministic place
    // at the end instead of vanishing.
    const rest = products
      .filter(p => !emitted.has(Number(p.id)))
      .sort((a, b) => num(a.display_order) - num(b.display_order) || num(a.id) - num(b.id));
    for (const p of rest) {
      emitted.add(Number(p.id));
      out.push(p);
    }
  } else {
    walk(Number(selectedId));
  }

  return out;
}
