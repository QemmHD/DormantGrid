// Review: convert screenshots to small WebP (max 960 px wide, q60).
// Usage: node tools/review/to-webp.mjs <outDir> <png> [png...]
import sharp from 'sharp';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
const [, , out, ...files] = process.argv;
mkdirSync(out, { recursive: true });
let total = 0;
for (const f of files) {
  const dest = path.join(out, path.basename(f).replace(/\.png$/, '.webp'));
  const info = await sharp(f).resize({ width: 960, withoutEnlargement: true }).webp({ quality: 60 }).toFile(dest);
  total += info.size;
  console.log(`${dest} ${(info.size / 1024).toFixed(0)} KB`);
}
console.log(`total ${(total / 1024).toFixed(0)} KB`);
