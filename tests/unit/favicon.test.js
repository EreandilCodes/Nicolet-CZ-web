/**
 * Guards the favicon fix: index.html must reference a real /images/favicon.ico
 * (the site used to 404 on it) and a valid ICO + apple-touch-icon must ship.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('favicon', () => {
  it('index.html references the ICO and an apple-touch-icon', () => {
    const html = readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
    expect(html).toMatch(/<link rel="icon"[^>]*href="\/images\/favicon\.ico"/);
    expect(html).toMatch(/<link rel="apple-touch-icon"[^>]*href="\/images\/apple-touch-icon\.png"/);
  });

  it('ships a valid multi-size ICO (not a 404)', () => {
    const ico = path.join(root, 'frontend/images/favicon.ico');
    expect(existsSync(ico)).toBe(true);
    const buf = readFileSync(ico);
    expect(buf.readUInt16LE(0)).toBe(0);   // reserved
    expect(buf.readUInt16LE(2)).toBe(1);   // type = icon
    expect(buf.readUInt16LE(4)).toBeGreaterThanOrEqual(1); // image count
    expect(buf.length).toBeLessThan(100 * 1024);
  });

  it('ships a valid apple-touch-icon PNG', () => {
    const p = path.join(root, 'frontend/images/apple-touch-icon.png');
    expect(existsSync(p)).toBe(true);
    expect(readFileSync(p).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });
});
