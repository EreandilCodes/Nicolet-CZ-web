/**
 * Nicolet CZ – shared rich-text helpers.
 *
 * ONE mechanism for turning stored rich content (HTML) into something the public
 * site can render. Two strictly separated modes that must never be mixed:
 *
 *   DETAIL  → sanitize() in public.js. Sanitized HTML is allowed here.
 *   PREVIEW → plainText() / previewText(). Plain text ONLY; the caller still
 *             escapes it with esc(). Tiles, cards, search results, meta
 *             descriptions and SEO snippets ALWAYS use PREVIEW – that is why
 *             raw `<p>`, `<div …>` or `&nbsp;` can never leak into them.
 *
 * Pure ESM, no DOM access at import time, so it is unit-testable in Node.
 * DOMParser is used when available (browser), otherwise a tag/entity based
 * fallback – both produce identical results for real project content.
 */

// ── HTML entity decoding ─────────────────────────────────────────────────────
/** Named entities that actually occur in imported WordPress/Elementor content. */
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: '\u00a0', hellip: '\u2026', mdash: '\u2014', ndash: '\u2013',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d',
  laquo: '\u00ab', raquo: '\u00bb', bull: '\u2022', middot: '\u00b7',
  deg: '\u00b0', copy: '\u00a9', reg: '\u00ae', trade: '\u2122',
  euro: '\u20ac', pound: '\u00a3', times: '\u00d7',
};

/**
 * Decode numeric and common named HTML entities.
 * Unknown named entities are left untouched so real content is never mangled.
 */
export function decodeEntities(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&#(x[0-9a-fA-F]+|[0-9]+);/g, (match, code) => {
      const isHex = code[0].toLowerCase() === 'x';
      const cp = isHex ? parseInt(code.slice(1), 16) : parseInt(code, 10);
      // Reject 0, out-of-range and lone surrogates – fromCodePoint would throw
      if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return match;
      return String.fromCodePoint(cp);
    })
    .replace(/&([a-zA-Z][a-zA-Z0-9]{0,9});/g, (match, name) => {
      const decoded = NAMED_ENTITIES[name.toLowerCase()];
      return decoded === undefined ? match : decoded;
    });
}

// ── Rich HTML → plain text ───────────────────────────────────────────────────
/** Elements that must not contribute to a textual preview. */
const DROP_TAGS = ['script', 'style', 'noscript', 'template', 'head', 'iframe', 'object', 'embed', 'svg'];

/**
 * Elements that end a "line" of text. A preview has no layout, so their text is
 * simply separated by whitespace instead of being concatenated into one word.
 */
const BLOCK_TAGS = [
  'p', 'div', 'section', 'article', 'header', 'footer', 'aside', 'nav', 'main',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'figure', 'figcaption', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'blockquote', 'pre', 'hr', 'br', 'address',
];

const BLOCK_TAG_SELECTOR = BLOCK_TAGS.join(',');
const DROP_TAG_SELECTOR = DROP_TAGS.join(',');

function hasDomParser() {
  return typeof DOMParser !== 'undefined';
}

/**
 * Trailing, unterminated tag. List endpoints cut the stored HTML by character
 * count (`SUBSTR(content_cz, 1, 300)`), which regularly lands in the middle of
 * an Elementor tag and leaves a fragment such as `<div cla`. A fragment that
 * was never a tag must never reach a preview.
 */
const DANGLING_TAG = /<[^>]*$/;

/** Browser path – real HTML parsing, entities already decoded by the parser. */
function extractTextViaDom(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.body;
  if (!root) return '';

  root.querySelectorAll(DROP_TAG_SELECTOR).forEach(node => node.remove());
  root.querySelectorAll(BLOCK_TAG_SELECTOR).forEach(node => {
    node.appendChild(doc.createTextNode('\n'));
  });
  return (root.textContent || '').replace(DANGLING_TAG, '');
}

/** Fallback path – no DOM available (SSR / unit tests). */
function extractTextViaRegex(html) {
  const dropRe = new RegExp(`<(${DROP_TAGS.join('|')})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, 'gi');
  const blockRe = new RegExp(`<\\/?(?:${BLOCK_TAGS.join('|')})\\b[^>]*>`, 'gi');
  return String(html)
    .replace(dropRe, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(blockRe, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(DANGLING_TAG, '');
}

/**
 * Machine truncation marker left behind by the old site's og:description import
 * (e.g. `… hřiště. [&hellip;]`). Only the bracketed form is treated as an
 * artifact, so a deliberately written HTML entity in real content survives.
 * Applied AFTER whitespace normalization, because block-level markup leaves a
 * trailing newline behind that would otherwise defeat the `$` anchor.
 */
const TRUNCATION_MARKER = /(?:[\s]*\[\s*(?:&hellip;|&#8230;|…|\.\.\.)\s*\])+$/;

/**
 * Rich HTML (or plain text) → normalized plain text preview.
 * Strips markup, decodes entities, removes import truncation markers and
 * collapses all whitespace. Never returns markup.
 */
export function plainText(value) {
  if (value == null) return '';
  const raw = String(value);
  if (!raw.trim()) return '';

  const extracted = hasDomParser() ? extractTextViaDom(raw) : extractTextViaRegex(raw);

  return decodeEntities(extracted)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(TRUNCATION_MARKER, '')
    .trim();
}

/**
 * Plain-text preview for tiles / cards / search results.
 * `maxLength` truncates on a word boundary and appends a single typographic
 * ellipsis (only when the text was actually shortened).
 */
export function previewText(value, maxLength = 0) {
  const text = plainText(value);
  if (!maxLength || text.length <= maxLength) return text;

  const slice = text.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(' ');
  // Only break on a space when it does not throw away most of the preview
  const cut = lastSpace > maxLength * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[\s.,;:!?–—-]+$/, '')}\u2026`;
}

/**
 * Imported articles store a perex that is nothing but the opening of the article
 * body (it was taken from the old site's og:description). Rendering both shows
 * the same text twice. Detect that case so the renderer shows the lead only once.
 *
 * Read-only: the stored content is never modified.
 */
export function excerptRepeatsLead(excerpt, content) {
  const lead = plainText(excerpt);
  const body = plainText(content);
  // Long enough to be a real lead paragraph, never a coincidental short match,
  // and only when there actually is a body that already contains it.
  if (lead.length < 40 || !body) return false;
  return body.startsWith(lead);
}