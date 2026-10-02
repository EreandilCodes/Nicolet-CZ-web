/**
 * Architecture guard for the public renderer.
 *
 * The bugs this file prevents are all regressions of the same rule:
 *
 *   PREVIEW (tiles, cards, search results, meta descriptions)
 *       → plain text only, produced by previewText()/plainText() from
 *         frontend/js/richtext.js, escaped with esc()
 *   DETAIL (article bodies, descriptions, specs, FAQ answers)
 *       → sanitized HTML, produced by sanitize()
 *   ORDER of the public filter buttons
 *       → Admin UI → Menu, via orderEntitiesByMenu()
 *
 * Reading the source is enough to assert this – the renderer is a browser SPA
 * and cannot be imported in Node. A re-introduced local stripHtml() or an
 * esc() straight on a rich column fails here instead of on the live site.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = readFileSync(path.join(root, 'frontend/js/public.js'), 'utf8');
const css = readFileSync(path.join(root, 'frontend/css/public.css'), 'utf8');
/** Comments are stripped – the CSS documents these rules in prose. */
const cssRules = css.replace(/\/\*[\s\S]*?\*\//g, '');
const html = readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
const lines = src.split('\n').map(line => line.replace(/\r$/, ''));

/**
 * Lines that render a plain-text PREVIEW into a tile / card / search result.
 * The detail containers (product-detail-desc …) hold sanitized HTML and are
 * deliberately not part of this list.
 */
const PREVIEW_CLASSES = /(?:product-card-desc|app-card-desc|news-card-excerpt|search-result-desc|article-excerpt)">/;
const previewRenderers = lines
  .map((line, i) => ({ line, n: i + 1 }))
  .filter(({ line }) => PREVIEW_CLASSES.test(line));

/** Lines that render sanitized rich content into a detail view. */
const detailRenderers = lines
  .map((line, i) => ({ line, n: i + 1 }))
  .filter(({ line }) => /\$\{sanitize\(/.test(line));

describe('public.js – one plain-text preview mechanism', () => {
  it('imports the shared helpers instead of defining a local one', () => {
    expect(src).toMatch(/import \{[^}]*plainText[^}]*\} from '\.\/richtext\.js'/);
    expect(src).toMatch(/import \{[^}]*orderEntitiesByMenu[^}]*\} from '\.\/category-order\.js'/);
  });

  it('has no ad-hoc stripHtml() left – the global helper was removed on purpose', () => {
    const hits = lines.filter(l => /stripHtml/.test(l));
    expect(hits).toEqual([]);
  });

  it('has no inline tag-stripping or entity-decoding inside the renderer', () => {
    // A second implementation of the mechanism is exactly what caused the bug.
    // The one allowed tag-strip is the safe fallback of sanitize() (the stand-in
    // for DOMPurify on the DETAIL path).
    const tagStrips = src.match(/<\[\^>\]\*>/g) || [];
    expect(tagStrips).toHaveLength(1);
    expect(src).toMatch(/function sanitize\(html\)[\s\S]{0,200}<\[\^>\]\*>/);

    // decoded named entities belong to richtext.js – esc() is the only place in
    // public.js that may mention them, and it only re-escapes for output
    const hits = lines
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => /&nbsp;/.test(line) || /&hellip;/.test(line));
    expect(hits).toEqual([]);
  });

  it('every tile / card / search preview goes through the shared helpers', () => {
    expect(previewRenderers.length).toBeGreaterThanOrEqual(6);
    for (const { line, n } of previewRenderers) {
      expect(line, `line ${n} must render a preview, not raw content`)
        .toMatch(/\$\{esc\((?:desc|excerpt|plainText\()/);
    }
  });

  it('never escapes a rich column directly into a tile', () => {
    const hits = lines
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => PREVIEW_CLASSES.test(line)
        && /esc\(\s*pick\(\s*[a-z]\.(?:description_cz|content_cz|excerpt_cz)/.test(line));
    expect(hits).toEqual([]);
  });

  it('truncates previews with the shared helper, not String.substring()', () => {
    const hits = lines
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => /(?:description_cz|content_cz|excerpt_cz)[^;]*\)\.substring\(/.test(line));
    expect(hits).toEqual([]);
  });

  it('the news detail hides a perex that is only the body lead', () => {
    expect(src).toMatch(/excerptRepeatsLead\(excerpt, content\)/);
    expect(src).toMatch(/!excerptRepeatsLead\(excerpt, content\)/);
  });
});

describe('public.js – sanitized HTML only in detail views', () => {
  it('every sanitize() output sits in a container with the richtext class', () => {
    expect(detailRenderers.length).toBeGreaterThanOrEqual(5);
    for (const { line, n } of detailRenderers) {
      expect(line, `line ${n}: sanitize() output must be in a .richtext container`).toMatch(/class="[^"]*\brichtext\b/);
    }
  });

  it('the application cover caption lives outside the cropped image box', () => {
    expect(src).toMatch(/app-detail-cover-img/);
  });
});

describe('public.js – sub-category order comes from Admin UI → Menu', () => {
  for (const section of ['news', 'product', 'application']) {
    it(`renderers order their ${section} categories through orderEntitiesByMenu()`, () => {
      expect(src).toMatch(new RegExp(`orderEntitiesByMenu\\([\\s\\S]{0,120}'${section}'`));
    });
  }

  it('never sorts the chips by display_order DESC – that reversed the rubriky', () => {
    const hits = lines
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => /b\.display_order\s*-\s*a\.display_order/.test(line));
    expect(hits).toEqual([]);
  });
});

describe('public.css – rich text images, captions and grids', () => {
  it('has one .richtext block that centers images and italicizes captions', () => {
    expect(css).toMatch(/\.richtext img\s*\{[^}]*height:\s*auto/);
    expect(css).toMatch(/\.richtext img\s*\{[^}]*margin:\s*20px auto/);
    expect(css).toMatch(/\.richtext img\s*\{[^}]*max-width:\s*100%\s*!important/);
    expect(css).toMatch(/\.richtext figcaption[^{]*\{[^}]*font-style:\s*italic/);
    expect(css).toMatch(/\.richtext figure\s*\{[^}]*max-width:\s*100%\s*!important/);
  });

  it('renders the application cover as a compact cropped banner', () => {
    expect(css).toMatch(/\.app-detail-cover-img\s*\{[^}]*height:\s*clamp\(/);
    expect(css).toMatch(/\.app-detail-cover-img \.article-cover\s*\{[^}]*object-fit:\s*cover/);
  });

  it('teaser grids use auto-fit so a short row fills the container', () => {
    for (const sel of ['.product-grid', '.app-grid', '.news-grid-teaser']) {
      const escaped = sel.replace('.', '\\.');
      expect(cssRules, `${sel} has no auto-fit rule`).toMatch(new RegExp(`${escaped}\\s*\\{[^}]*auto-fit`));
      // auto-fill reserves empty tracks, which left the cards at ~2/3 width
      expect(cssRules, `${sel} still uses auto-fill`).not.toMatch(new RegExp(`${escaped}\\s*\\{[^}]*auto-fill`));
    }
  });

  // Regression: the mobile column counts were originally declared in the
  // "Responsive (base)" block, which sits BEFORE the base grid rules. Equal
  // specificity means the later base rule won, so every mobile grid override
  // was dead CSS (product/app teasers stayed 2-up on phones instead of 1-up).
  it('declares mobile grid overrides AFTER the base grid rules', () => {
    const SELS = ['.product-grid', '.app-grid', '.news-grid-teaser'];

    // Walk the stylesheet tracking the open block headers, so a declaration
    // can be attributed to its selector and to whether it sits in @media.
    const decls = SELS.map(() => []);
    const stack = [];
    const re = /(@media[^{]*)|([^{}]+)\{|\}|(grid-template-columns\s*:\s*([^;}]+))/g;
    let m;
    while ((m = re.exec(cssRules)) !== null) {
      if (m[1]) stack.push(m[1].trim());
      else if (m[2]) stack.push(m[2].trim());
      else if (m[0] === '}') stack.pop();
      else if (m[4]) {
        const header = stack[stack.length - 1] || '';
        SELS.forEach((sel, i) => {
          if (new RegExp(`(^|[\\s,>+~])${sel.replace('.', '\\.')}(?![\\w-])`).test(header)) {
            decls[i].push({
              inMedia: stack.some(h => h.startsWith('@media')),
              value: m[4].trim(),
            });
          }
        });
      }
    }

    SELS.forEach((sel, i) => {
      const list = decls[i];
      expect(list.length, `${sel} has no grid-template-columns`).toBeGreaterThan(0);
      const baseIdxs = list.map((d, idx) => (d.inMedia ? -1 : idx)).filter(idx => idx >= 0);
      const mediaIdxs = list.map((d, idx) => (d.inMedia ? idx : -1)).filter(idx => idx >= 0);
      expect(baseIdxs.length, `${sel} has no base (non-media) column rule`).toBeGreaterThan(0);
      expect(mediaIdxs.length, `${sel} has no mobile column override`).toBeGreaterThan(0);

      // The decisive check: EVERY media override has to come after the LAST
      // base rule. A media rule placed above the base rule is silently
      // overridden by it (equal specificity, later wins) → dead CSS.
      const lastBase = baseIdxs[baseIdxs.length - 1];
      expect(mediaIdxs[0], `${sel}: mobile override is declared before the base rule — dead CSS`)
        .toBeGreaterThan(lastBase);

      // the phone breakpoint must be the last word on those columns
      expect(list[mediaIdxs[mediaIdxs.length - 1]].value).toBe('1fr');
      // …and the tablet breakpoint just before it must be 2 columns
      expect(list[mediaIdxs[mediaIdxs.length - 2]].value).toBe('repeat(2, minmax(0, 1fr))');
    });
  });
});

describe('index.html – cache busting', () => {
  it('busts the cache for the changed public.js and public.css', () => {
    const js = html.match(/\/js\/public\.js\?v=(\d+)/);
    const style = html.match(/\/css\/public\.css\?v=(\d+)/);
    expect(js).toBeTruthy();
    expect(style).toBeTruthy();
    // the assets changed in this change set
    expect(Number(js[1])).toBeGreaterThanOrEqual(11);
    expect(Number(style[1])).toBeGreaterThanOrEqual(12);
  });
});
