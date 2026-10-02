/**
 * Unit tests for the shared rich-text helper (frontend/js/richtext.js).
 *
 * The module is pure ESM without DOM access at import time, so it can be
 * imported directly here instead of being re-implemented in the test.
 *
 * The test data mirrors the real imported content (WordPress/Elementor):
 *   - <figure class="wp-caption aligncenter" style="width:500px">
 *   - &nbsp; / &amp; / &hellip; entities
 *   - excerpts ending in the import marker " [&hellip;]"
 */
import { describe, it, expect } from 'vitest';
import { decodeEntities, plainText, previewText, excerptRepeatsLead } from '../../frontend/js/richtext.js';

describe('decodeEntities()', () => {
  it('decodes named entities', () => {
    expect(decodeEntities('a&amp;b')).toBe('a&b');
    expect(decodeEntities('&nbsp;')).toBe('\u00a0');
    expect(decodeEntities('&hellip;')).toBe('\u2026');
  });

  it('decodes decimal and hexadecimal numeric references', () => {
    expect(decodeEntities('&#8211;')).toBe('\u2013');
    expect(decodeEntities('&#x2014;')).toBe('\u2014');
  });

  it('leaves unknown named entities untouched', () => {
    expect(decodeEntities('&notarealentity;')).toBe('&notarealentity;');
  });

  it('leaves invalid numeric references untouched instead of throwing', () => {
    expect(decodeEntities('&#0;')).toBe('&#0;');
    expect(decodeEntities('&#xD800;')).toBe('&#xD800;');
  });

  it('returns empty string for null/undefined', () => {
    expect(decodeEntities(null)).toBe('');
    expect(decodeEntities(undefined)).toBe('');
  });
});

describe('plainText() – markup never leaks into previews', () => {
  it('strips block tags and returns readable text', () => {
    expect(plainText('<p>První odstavec.</p><p>Druhý odstavec.</p>'))
      .toBe('První odstavec. Druhý odstavec.');
  });

  it('strips inline formatting but keeps the text', () => {
    expect(plainText('<p>Text s <strong>tučným</strong> a <em> kurzivou</em> částí.</p>'))
      .toBe('Text s tučným a kurzivou částí.');
  });

  it('decodes entities so &nbsp; is a space, not visible text', () => {
    expect(plainText('<p>Spektroskop&nbsp;FT&nbsp;NIR</p>')).toBe('Spektroskop FT NIR');
  });

  it('keeps a genuine entity that is part of the text (a &amp; b)', () => {
    expect(plainText('<p>Průměr &amp; hmotnost</p>')).toBe('Průměr & hmotnost');
  });

  it('never returns markup', () => {
    const html = '<div class="x"><h2>Titulek</h2><p>Odstavec &amp; text</p></div>';
    expect(plainText(html)).not.toMatch(/[<>]/);
  });

  it('removes the import truncation marker " [&hellip;]"', () => {
    expect(plainText('Nový přístroj na fotbalovém hřišti. [&hellip;]'))
      .toBe('Nový přístroj na fotbalovém hřišti.');
    expect(plainText('Konec věty [&hellip;]')).toBe('Konec věty');
  });

  it('removes the marker even when the content is wrapped in block markup', () => {
    // block elements leave a trailing newline, which must not defeat the marker
    expect(plainText('<p>Konec věty [&hellip;]</p>')).toBe('Konec věty');
    expect(plainText('<div><p>Konec věty</p><p>Další odstavec.</p></div> [&hellip;]'))
      .toBe('Konec věty Další odstavec.');
  });

  it('keeps a bare &hellip; that was written as real content', () => {
    expect(plainText('Analýza&hellip; a další')).toBe('Analýza\u2026 a další');
  });

  it('ignores script and style content', () => {
    expect(plainText('<p>A</p><script>var x = "<b>no</b>";</script><style>.a{}</style>'))
      .toBe('A');
  });

  it('handles tables by separating cells with whitespace', () => {
    expect(plainText('<table><tr><td>100 Hz</td><td>±2 nm</td></tr></table>'))
      .toBe('100 Hz ±2 nm');
  });

  it('collapses whitespace', () => {
    expect(plainText('<p>a</p>\n\n   <p>b</p>')).toBe('a b');
  });

  it('passes plain text through unchanged', () => {
    expect(plainText('Prostý text bez značky.')).toBe('Prostý text bez značky.');
  });

  it('returns empty string for empty / missing values', () => {
    expect(plainText(null)).toBe('');
    expect(plainText(undefined)).toBe('');
    expect(plainText('')).toBe('');
    expect(plainText('   ')).toBe('');
  });

  it('works on a real WordPress figure with an inline width', () => {
    const html = '<figure class="wp-caption aligncenter" style="width:500px">'
      + '<img src="/uploads/a.jpg" alt="Přístroj"/>'
      + '<figcaption class="wp-caption-text">Obr. 1 Přístroj FTIR</figcaption></figure>';
    expect(plainText(html)).toBe('Obr. 1 Přístroj FTIR');
  });

  it('drops a tag left dangling by character-count truncation of the HTML', () => {
    // GET /api/products?fields=list cuts Elementor HTML with SUBSTR(…,1,300)
    // and regularly ends inside a tag
    const truncated = '<div class="elementor-widget-container">\n\t<div class="elementor elementor-1767">\n\t\t<section class="elementor-s';
    expect(plainText(truncated)).toBe('');
    expect(plainText('<p>Text před zalomením</p><div class="el')).toBe('Text před zalomením');
  });
});

describe('previewText() – bounded tile previews', () => {
  it('returns the full text when it fits', () => {
    expect(previewText('<p>Krátký perex.</p>', 100)).toBe('Krátký perex.');
  });

  it('truncates with a single ellipsis and no trailing space', () => {
    const out = previewText('slovo '.repeat(60), 40);
    expect(out.endsWith('\u2026')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(41);
    expect(out).not.toMatch(/ \u2026$/);
  });

  it('truncates on a word boundary', () => {
    expect(previewText('alpha beta gamma delta epsilon', 15)).toBe('alpha beta\u2026');
  });

  it('does not append an ellipsis when the text is not shortened', () => {
    expect(previewText('Krátké', 100)).toBe('Krátké');
  });

  it('works without a maxLength', () => {
    expect(previewText('<p>Celý&nbsp;text</p>')).toBe('Celý text');
  });

  it('returns empty string when there is nothing to preview', () => {
    expect(previewText('', 100)).toBe('');
    expect(previewText(null, 100)).toBe('');
  });
});

describe('excerptRepeatsLead() – duplicated news body text', () => {
  const body = '<p>Společnost Nicolet představila nový přístroj FTIR, který umožňuje'
    + ' rychlou analýzu vzorků přímo v laboratoři.</p>'
    + '<p>Druhý odstavec navazuje.</p>';

  it('detects the imported perex that is only the body lead', () => {
    // 48/118 news posts imported og:description as the perex
    expect(excerptRepeatsLead('Společnost Nicolet představila nový přístroj FTIR, '
      + 'který umožňuje rychlou analýzu vzorků přímo v laboratoři.', body)).toBe(true);
  });

  it('detects it even with HTML and entities in the perex', () => {
    expect(excerptRepeatsLead('<p>Společnost Nicolet&nbsp;představila nový přístroj FTIR, '
      + 'který umožňuje rychlou analýzu vzorků přímo v laboratoři. [&hellip;]</p>', body))
      .toBe(true);
  });

  it('does not hide a real, independently written perex', () => {
    expect(excerptRepeatsLead('Krátké shrnutí, které není úvod odstavce.', body)).toBe(false);
  });

  it('ignores a short coincidental prefix (would be a false positive)', () => {
    expect(excerptRepeatsLead('Druhý odstavec', body)).toBe(false);
  });

  it('returns false when the article has no body', () => {
    expect(excerptRepeatsLead('Společnost Nicolet představila nový přístroj FTIR, '
      + 'který umožňuje rychlou analýzu vzorků přímo v laboratoři.', '')).toBe(false);
  });

  it('returns false when there is no perex', () => {
    expect(excerptRepeatsLead('', body)).toBe(false);
  });
});
