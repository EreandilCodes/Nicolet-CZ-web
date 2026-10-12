/**
 * Generates the favicon set from the brand logo.
 *
 * The site's logo (Admin → Settings → logo_url) is a wide wordmark; the square
 * emblem on its left is used as the favicon so the tab icon stays faithful to
 * the brand. Output:
 *   frontend/images/favicon.ico           (16 / 32 / 48, PNG-in-ICO)
 *   frontend/images/apple-touch-icon.png  (180, flattened on white)
 *
 * Usage:  node scripts/make-favicon.mjs <path-to-logo.png>
 * The source is intentionally not committed; pass the current logo file.
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root      = path.resolve(__dirname, '..');
const outDir    = path.join(root, 'frontend/images');

const src = process.argv[2];
if (!src) {
  console.error('Usage: node scripts/make-favicon.mjs <path-to-logo.png>');
  process.exit(1);
}

// PNG-in-ICO container (supported by every modern browser).
function icoFromPngs(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);            // reserved
  header.writeUInt16LE(1, 2);            // type: icon
  header.writeUInt16LE(entries.length, 4);

  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;
  const parts = [header];
  entries.forEach((e, i) => {
    const at = i * 16;
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, at);
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, at + 1);
    dir.writeUInt8(0, at + 2);           // palette
    dir.writeUInt8(0, at + 3);           // reserved
    dir.writeUInt16LE(1, at + 4);        // planes
    dir.writeUInt16LE(32, at + 6);       // bpp
    dir.writeUInt32LE(e.buf.length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += e.buf.length;
  });
  parts.push(dir, ...entries.map(e => e.buf));
  return Buffer.concat(parts);
}

const base = sharp(src).extract({ left: 25, top: 0, width: 400, height: 321 });

const sizes = [16, 32, 48];
const pngs = [];
for (const size of sizes) {
  const buf = await base.clone()
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  pngs.push({ size, buf });
}

fs.writeFileSync(path.join(outDir, 'favicon.ico'), icoFromPngs(pngs));

await base.clone()
  .resize(180, 180, { fit: 'contain', background: '#ffffff' })
  .flatten({ background: '#ffffff' })
  .png({ compressionLevel: 9 })
  .toFile(path.join(outDir, 'apple-touch-icon.png'));

console.log('favicon.ico      ', fs.statSync(path.join(outDir, 'favicon.ico')).size, 'B');
console.log('apple-touch-icon ', fs.statSync(path.join(outDir, 'apple-touch-icon.png')).size, 'B');
