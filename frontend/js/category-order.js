/**
 * Nicolet CZ – public sub-category ordering.
 *
 * Admin UI → Menu is the SINGLE source of truth for the order of the public
 * filter buttons (Novinky rubriky, Produkty kategorie, Aplikace okruhy).
 *
 * The frontend must never invent its own order (alphabetical, by DB id, by
 * creation date or by a hardcoded list). It resolves the order from the menu
 * items that point at a category, and only falls back to the entity's own
 * `display_order` for entities that are not present in the menu yet — the
 * fallback keeps the order the API already returned, so it is deterministic
 * and can never break the main rule.
 */

// ── Section definitions ──────────────────────────────────────────────────────
/**
 * `params` – query parameters the admin entity picker writes for this section
 *            (see frontend/admin/menu.js: /produkty?kategorie=,
 *            /novinky?rubrika=, /aplikace?okruh=)
 */
export const SECTIONS = {
  news: {
    root: '/novinky',
    params: ['rubrika', 'kategorie'],
  },
  product: {
    root: '/produkty',
    params: ['kategorie'],
  },
  application: {
    root: '/aplikace',
    params: ['okruh', 'skupina'],
  },
};

/** Split `/produkty?kategorie=ftir` into `{ path: '/produkty', query: {kategorie:'ftir'} }`. */
function splitLink(linkValue) {
  const raw = String(linkValue || '').trim();
  if (!raw) return null;
  const [path, search = ''] = raw.split('?');
  const query = {};
  if (search) {
    for (const pair of search.split('&')) {
      if (!pair) continue;
      const eq = pair.indexOf('=');
      const key = eq === -1 ? pair : pair.slice(0, eq);
      const value = eq === -1 ? '' : pair.slice(eq + 1);
      if (key) query[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
    }
  }
  return { path: path.replace(/\/+$/, '') || '/', query };
}

/** Diacritic/formatting-insensitive key so a label can be matched to a slug. */
export function normalizeKey(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Menu display order → children first, exactly as the admin table shows them. */
function byMenuOrder(a, b) {
  return (Number(a.display_order) || 0) - (Number(b.display_order) || 0)
    || (Number(a.id) || 0) - (Number(b.id) || 0);
}

/**
 * Ordered list of category slugs referenced by the menu for one section.
 * A slug comes from the category query parameter written by the admin picker,
 * or – for path-style links – from the last path segment.
 */
export function menuCategorySlugs(menuItems, sectionKey) {
  const section = SECTIONS[sectionKey];
  if (!section || !Array.isArray(menuItems) || !menuItems.length) return [];

  const rootIds = menuItems
    .filter(item => !item.parent_id && splitLink(item.link_value)?.path === section.root)
    .map(item => Number(item.id));

  const candidates = rootIds.length
    // Preferred: children of the section root in the menu – exactly the items the
    // admin drags around in Admin UI → Menu.
    ? menuItems.filter(item => rootIds.includes(Number(item.parent_id)))
    // Fallback: the section root itself is not in the menu (rootCount < 3 guard).
    : menuItems.filter(item => splitLink(item.link_value)?.path.startsWith(`${section.root}/`));

  const slugs = [];
  const seen = new Set();
  for (const item of [...candidates].sort(byMenuOrder)) {
    const link = splitLink(item.link_value);
    if (!link) continue;

    // The admin picker always writes `?param=slug`. A hand-written path link
    // (/aplikace/polymery) is supported as well. Both candidates are already
    // restricted to this section, so a link that is not a category at all
    // (e.g. a link to a single article) simply never matches an entity and
    // cannot break the order of the real ones.
    let slug = null;
    for (const param of section.params) {
      if (link.query[param]) { slug = link.query[param]; break; }
    }
    if (!slug) {
      const segments = link.path.split('/').filter(Boolean);
      if (segments.length > 1) slug = segments[segments.length - 1];
    }
    if (!slug) continue;

    const key = normalizeKey(slug);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    slugs.push(slug);
  }
  return slugs;
}

/**
 * Order entities (news categories / product categories / application groups)
 * according to Admin UI → Menu.
 *
 * @param {Array}  entities    entities as returned by the public API
 * @param {Array}  menuItems   active menu items as returned by GET /api/menu
 * @param {string} sectionKey  'news' | 'product' | 'application'
 * @returns {Array} new array; entities missing from the menu keep their original
 *                       relative order and are appended after the menu ones
 */
export function orderEntitiesByMenu(entities, menuItems, sectionKey) {
  if (!Array.isArray(entities) || !entities.length) return [];
  if (!SECTIONS[sectionKey]) return entities;

  const slugs = menuCategorySlugs(menuItems, sectionKey);
  if (!slugs.length) return entities;

  const rank = new Map();
  slugs.forEach((slug, index) => rank.set(normalizeKey(slug), index));

  const matched = [];
  const unmatched = [];
  for (const entity of entities) {
    const index = rank.get(normalizeKey(entity.slug));
    if (index === undefined) unmatched.push(entity);
    else matched.push({ entity, index });
  }

  // Deterministic tie-break inside the menu group: menu order first, then the
  // entity's own order as delivered by the API.
  matched.sort((a, b) => a.index - b.index);
  return matched.map(item => item.entity).concat(unmatched);
}