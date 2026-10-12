/**
 * Unit tests for the Products mega-menu model (frontend/js/nav-model.js).
 *
 * The rule: the authoritative content tree provides the columns; the stored
 * menu is the manual configuration and always wins (order + visibility), with
 * unreferenced categories appended in the authoritative order.
 */
import { describe, it, expect } from 'vitest';
import { buildProductMenu } from '../../frontend/js/nav-model.js';

const tree = [
  { id: 1, slug: 'a', display_order: 10, children: [] },
  { id: 2, slug: 'b', display_order: 20, children: [] },
  { id: 3, slug: 'c', display_order: 30, children: [] },
];

describe('buildProductMenu', () => {
  it('keeps the authoritative order when the menu has no override', () => {
    const { roots } = buildProductMenu(tree, []);
    expect(roots.map(r => r.slug)).toEqual(['a', 'b', 'c']);
  });

  it('lets a manual position win, then appends the rest in authoritative order', () => {
    const { roots } = buildProductMenu(tree, [
      { id: 100, entity_type: 'product_category', entity_id: 3, display_order: 1, is_active: 1 },
      { id: 101, entity_type: 'product_category', entity_id: 2, display_order: 5, is_active: 1 },
    ]);
    expect(roots.map(r => r.slug)).toEqual(['c', 'b', 'a']);
  });

  it('hides a category referenced with is_active = 0', () => {
    const { roots } = buildProductMenu(tree, [
      { id: 100, entity_type: 'product_category', entity_id: 2, display_order: 1, is_active: 0 },
    ]);
    expect(roots.map(r => r.slug)).toEqual(['a', 'c']);
  });

  it('returns plain manual links in menu order as flat entries', () => {
    const { flat, roots } = buildProductMenu(tree, [
      { id: 200, label_cz: 'Všechny produkty', link_value: '/produkty', display_order: 10, is_active: 1 },
      { id: 201, label_cz: 'Akce', link_value: '/akce', display_order: 5, is_active: 1 },
    ]);
    expect(flat.map(c => c.label_cz)).toEqual(['Akce', 'Všechny produkty']);
    expect(roots).toHaveLength(3);
  });

  it('ignores an inactive plain link', () => {
    const { flat } = buildProductMenu(tree, [
      { id: 200, label_cz: 'Skryté', link_value: '/x', display_order: 1, is_active: 0 },
    ]);
    expect(flat).toEqual([]);
  });

  it('is safe with no tree (API failure)', () => {
    const { roots, flat } = buildProductMenu(undefined, [
      { id: 200, label_cz: 'Všechny produkty', link_value: '/produkty', is_active: 1 },
    ]);
    expect(roots).toEqual([]);
    expect(flat.map(c => c.label_cz)).toEqual(['Všechny produkty']);
  });
});
