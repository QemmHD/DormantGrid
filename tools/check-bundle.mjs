// Gate 4: initial payload budget. Sums gzip size of everything the app loads
// at start (all JS/CSS/HTML + precached assets) and fails if > 12 MB, or if it
// grows > 10% over the recorded baseline (tools/bundle-baseline.json).
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = 'apps/game/dist';
const LIMIT = 12 * 1024 * 1024;
let total = 0;
// On-demand only (not precached, see vite.config.ts globIgnores): Tier B model files
// and the GLB loader chunks, fetched only when assets/manifest.json lists live models.
const ON_DEMAND = [/^models$/, /^GLTFLoader-.*\.js$/, /^meshopt_decoder.*\.js$/];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (ON_DEMAND.some((r) => r.test(f))) continue;
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|css|html|json|webp|png|wasm|m4a|mp3|svg|webmanifest)$/.test(f)) total += /\.(png|webp|m4a|mp3)$/.test(f) ? statSync(p).size : gzipSync(readFileSync(p)).length;
  }
};
walk(dist);
const mb = (total / 1048576).toFixed(2);
const basePath = 'tools/bundle-baseline.json';
const base = existsSync(basePath) ? JSON.parse(readFileSync(basePath, 'utf8')).bytes : null;
console.log(`initial payload (gzip): ${mb} MB${base ? ` (baseline ${(base / 1048576).toFixed(2)} MB)` : ''}`);
if (total > LIMIT) {
  console.error(`bundle over budget: ${mb} MB > 12 MB`);
  process.exit(1);
}
if (base && total > base * 1.1 && !process.env.UPDATE_BASELINE) {
  console.error('bundle grew more than 10% over baseline; set UPDATE_BASELINE=1 to accept on purpose');
  process.exit(1);
}
if (!base || process.env.UPDATE_BASELINE) writeFileSync(basePath, JSON.stringify({ bytes: total, at: new Date().toISOString() }, null, 2) + '\n');
