/**
 * Nicolet CZ – Products mega-menu model (pure, Node-importable).
 *
 * The Products navigation is generated from real content: the authoritative
 * hierarchy (top-level category → child category → instruments) comes from
 * `GET /api/menu/product-tree`, already ordered by Admin UI → Categories and
 * Admin UI → Products.
 *
 * Admin UI → Menu is the MANUAL configuration and always wins:
 *   - a stored child of `/produkty` that references a top-level category by its
 *     stable `entity_id` (`entity_type: 'product_category'`) sets that column's
 *     position (manual order first, then the authoritative order);
 *   - stored children that are plain links (no entity) are returned as `flat`,
 *     in menu order, to render above the columns;
 *   - `is_active === 0` on a referenced category hides its column.
 *
 * Nothing here writes data and nothing is reordered twice: `public.js` only
 * renders the result.
 */

/**
 * @param {Array} tree           /api/menu/product-tree payload
 * @param {Array} storedChildren menu_items children of the /produkty root
 * @returns {{ flat: Array, roots: Array }} ordered columns + flat manual links
 */
export function buildProductMenu(tree = [], storedChildren = []) {
  const override = new Map();  // category_id -> stored menu item
  const flat = [];

  for (const c of storedChildren || []) {
    if (c.entity_type === 'product_category' && c.entity_id != null) {
      override.set(Number(c.entity_id), c);
    } else if (c.is_active !== 0) {
      flat.push(c);
    }
  }

  flat.sort((a, b) =>
    (Number(a.display_order) || 0) - (Number(b.display_order) || 0)
    || (Number(a.id) || 0) - (Number(b.id) || 0));

  const roots = (Array.isArray(tree) ? tree : [])
    .filter(r => override.get(Number(r.id))?.is_active !== 0)
    .slice()
    .sort((a, b) => {
      const ao = override.get(Number(a.id))?.display_order;
      const bo = override.get(Number(b.id))?.display_order;
      if (ao != null && bo != null) return (Number(ao) - Number(bo)) || (a.id - b.id);
      if (ao != null) return -1;   // manually positioned columns first
      if (bo != null) return 1;
      return (Number(a.display_order) || 0) - (Number(b.display_order) || 0) || (a.id - b.id);
    });

  return { flat, roots };
}
