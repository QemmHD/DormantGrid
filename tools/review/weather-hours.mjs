// Review helper: first in-game hours (after day 0) with each weather type for seed 1337.
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const out = path.join(mkdtempSync(path.join(os.tmpdir(), 'dg-rv-')), 'sim.mjs');
await build({ entryPoints: ['packages/sim/src/index.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const sim = await import(pathToFileURL(out).href);
const found = {};
const counts = {};
for (let h = 24; h < 24 * 28; h += 0.25) {
  const w = sim.weatherAt(1337, h);
  counts[w] = (counts[w] ?? 0) + 1;
  const daylight = h % 24 > 10 && h % 24 < 16;
  if (!found[w] && daylight) found[w] = h;
}
const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(JSON.stringify({ firstDaylightHour: found, shareOver4Weeks: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, +(v / total).toFixed(3)])) }));
