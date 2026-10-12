/**
 * Guards the Products menu interaction contract: the hierarchy stays, but it is
 * revealed progressively on hover (main category → subcategory → instruments),
 * not as one all-at-once grid. public.js is a browser SPA module, so the guard
 * reads the source + stylesheet (same approach as public-render-contract.test.js).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = readFileSync(path.join(root, 'frontend/js/public.js'), 'utf8');
const css = readFileSync(path.join(root, 'frontend/css/public.css'), 'utf8');

describe('Products menu – progressive hover reveal', () => {
  it('renders nested sub-items and flyouts instead of the flat mega grid', () => {
    expect(src).toMatch(/nav-submenu/);
    expect(src).toMatch(/nav-subitem/);
    expect(src).toMatch(/nav-sublink/);
    expect(src).toMatch(/nav-subflyout/);
    // the old all-at-once grid must be gone
    expect(src).not.toMatch(/nav-megamenu|nav-mega-col|nav-mega-head/);
  });

  it('reveals each level on hover and on keyboard focus', () => {
    expect(css).toMatch(/\.nav-subitem:hover\s*>\s*\.nav-subflyout/);
    expect(css).toMatch(/\.nav-subitem:focus-within\s*>\s*\.nav-subflyout/);
    expect(css).toMatch(/\.nav-subflyout\s*\{[^}]*display:\s*none/); // hidden by default
  });

  it('does not use the removed mega-panel classes in CSS', () => {
    expect(css).not.toMatch(/\.nav-megamenu|\.nav-mega-col/);
  });
});
