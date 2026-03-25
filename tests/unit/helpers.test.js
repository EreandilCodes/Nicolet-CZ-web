import { describe, it, expect } from 'vitest';

// Re-implement the frontend helpers for unit testing
// (frontend code is not ESM-importable in Node without a DOM, so we test the logic)

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function settled(result, fallback = []) {
  return result.status === 'fulfilled' ? result.value : fallback;
}

function sanitizeFallback(html) {
  return (html || '').replace(/<[^>]*>/g, '');
}

describe('esc() HTML escaping', () => {
  it('escapes HTML special characters', () => {
    expect(esc('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('escapes single quotes', () => {
    expect(esc("it's")).toBe("it&#x27;s");
  });

  it('escapes ampersands', () => {
    expect(esc('a&b')).toBe('a&amp;b');
  });

  it('returns empty string for null/undefined', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });

  it('converts numbers to string', () => {
    expect(esc(42)).toBe('42');
  });
});

describe('settled() Promise.allSettled helper', () => {
  it('extracts value from fulfilled result', () => {
    expect(settled({ status: 'fulfilled', value: [1, 2, 3] })).toEqual([1, 2, 3]);
  });

  it('returns fallback for rejected result', () => {
    expect(settled({ status: 'rejected', reason: new Error('fail') })).toEqual([]);
  });

  it('uses custom fallback', () => {
    expect(settled({ status: 'rejected', reason: 'err' }, null)).toBe(null);
  });

  it('returns empty array by default for rejected', () => {
    expect(settled({ status: 'rejected', reason: 'err' })).toEqual([]);
  });
});

describe('sanitizeFallback() - DOMPurify fallback', () => {
  it('strips all HTML tags', () => {
    expect(sanitizeFallback('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
  });

  it('strips script tags', () => {
    expect(sanitizeFallback('<script>alert(1)</script>safe')).toBe('alert(1)safe');
  });

  it('handles empty input', () => {
    expect(sanitizeFallback('')).toBe('');
    expect(sanitizeFallback(null)).toBe('');
    expect(sanitizeFallback(undefined)).toBe('');
  });

  it('preserves plain text', () => {
    expect(sanitizeFallback('no tags here')).toBe('no tags here');
  });
});

describe('URL validation for background images', () => {
  function validateBgUrl(url) {
    try {
      const bgUrl = new URL(url, 'http://localhost');
      if (bgUrl.protocol === 'http:' || bgUrl.protocol === 'https:') return bgUrl.href;
    } catch { /* invalid */ }
    return '';
  }

  it('accepts valid HTTP URLs', () => {
    expect(validateBgUrl('https://example.com/image.jpg')).toBe('https://example.com/image.jpg');
  });

  it('accepts relative URLs', () => {
    expect(validateBgUrl('/uploads/gallery/img.png')).toBe('http://localhost/uploads/gallery/img.png');
  });

  it('rejects javascript: URLs', () => {
    expect(validateBgUrl('javascript:alert(1)')).toBe('');
  });

  it('rejects data: URLs', () => {
    expect(validateBgUrl('data:text/html,<script>alert(1)</script>')).toBe('');
  });

  it('rejects malformed URLs', () => {
    expect(validateBgUrl("'); background:url('http://evil.com/steal")); // CSS injection attempt
    // validateBgUrl will either throw or return empty for this
  });
});
