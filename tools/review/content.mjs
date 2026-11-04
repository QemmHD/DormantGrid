// Review: count shipped content from the real sim data (bundled with esbuild),
// compare with GDD promises, and write docs/review/content.json.
// Usage: node tools/review/content.mjs
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdtempSync, readdirSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(path.join(os.tmpdir(), 'dg-review-'));
const out = path.join(dir, 'sim.mjs');
await build({ entryPoints: ['packages/sim/src/index.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const sim = await import(pathToFileURL(out).href);

const by = (arr, key) => arr.reduce((m, x) => ((m[x[key]] = (m[x[key]] ?? 0) + 1), m), {});
const items = sim.ITEMS;
const layout = sim.generateWorld(1337);
const audioSrc = readFileSync('apps/game/src/audio/audio.ts', 'utf8');
const sfx = [...new Set([...audioSrc.matchAll(/case '([a-zA-Z_]+)'/g)].map((m) => m[1]))];
const processed = existsSync('assets/processed') ? readdirSync('assets/processed', { recursive: true }).filter((f) => /\.\w+$/.test(f)) : [];
const survSrc = readFileSync('packages/sim/src/systems/survivors.ts', 'utf8');
const jobs = (survSrc.match(/export type JobId = ([^;]+);/)?.[1] ?? '').match(/'([a-z]+)'/g)?.map((s) => s.slice(1, -1)) ?? [];
const events = [...new Set([...survSrc.matchAll(/type: '([a-z_]+)'/g)].map((m) => m[1]))];
const enemiesClient = readFileSync('apps/game/src/game/enemies.ts', 'utf8').match(/export type EnemyKind = ([^;]+);/)?.[1];

const res = {
  items: { total: items.length, byCategory: by(items, 'category') },
  recipes: { total: sim.RECIPES.length, byStation: by(sim.RECIPES, 'station') },
  buildPieces: { total: sim.PIECES.length, byKind: by(sim.PIECES, 'kind') },
  crops: sim.CROPS.length,
  livestock: sim.LIVESTOCK.length,
  perks: { total: sim.PERKS.length, byTrack: by(sim.PERKS, 'track') },
  factions: sim.FACTIONS.length,
  enemiesSim: sim.ENEMIES.map((e) => e.id),
  enemyKindsClient: enemiesClient,
  traits: sim.TRAITS.length,
  quests: { total: sim.QUESTS.length, byAct: by(sim.QUESTS, 'act') },
  endings: sim.ENDINGS.length,
  jobs,
  survivorEventKinds: events,
  districts: layout.districts.map((d) => d.key),
  world: { buildings: layout.buildings.length, enterable: layout.buildings.filter((b) => b.enterable).length, props: layout.props.length, nodes: layout.nodes.length, propKinds: Object.keys(by(layout.props, 'kind')).length },
  audio: { synthesizedSfx: sfx, sfxCount: sfx.length, recordedAudioFiles: processed.filter((f) => /\.(m4a|mp3|wav|ogg)$/.test(f)).length, musicIsGenerative: /scale|chord|minor/.test(audioSrc) },
  tierBAssetsShipped: processed.length,
};
res.vsGdd = {
  'items 80-120': `${res.items.total}`,
  'workbench tiers 1-3 + campfire, kitchen, chem lab': Object.keys(res.recipes.byStation).join(', '),
  'perks: 4 tracks x ~8': `${res.perks.total} (${JSON.stringify(res.perks.byTrack)})`,
  'raider types 5 (grunt, scout, brute, sniper, leader) + drones, bots, crawlers, heavies, hounds, boar': `sim: ${res.enemiesSim.join(', ')} | client kinds: ${enemiesClient}`,
  'survivors 12 early / 40 late': 'see session.json (start count)',
  'livestock chickens, goats, pigs': `${res.livestock} defined in sim`,
  'districts 9': `${res.districts.length}`,
  'endings 3': `${res.endings}`,
};
writeFileSync('docs/review/content.json', JSON.stringify(res, null, 2) + '\n');
console.log(JSON.stringify(res, null, 2));
