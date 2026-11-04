// Tier B model runtime test (end to end):
//   1. generate GLBs, run the real ingest into a temp assets root
//   2. add a manifest entry whose file is missing (must fall back, not crash)
//   3. build the game against that assets root into a temp outDir and preview it
//   4. verify: crate + robot replaced, barrel stays procedural, no page errors
// Usage: node tests/models-flow.mjs
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { Document, NodeIO } from '@gltf-transform/core';
import { chromium } from 'playwright';

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) failed++;
};

async function boxGlb(file, [w, h, d], rgba) {
  const doc = new Document();
  const buf = doc.createBuffer();
  const [x0, x1, y0, y1, z0, z1] = [-w / 2, w / 2, 0, h, -d / 2, d / 2];
  const P = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const idx = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5];
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(P.flat())).setBuffer(buf))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(idx)).setBuffer(buf))
    .setMaterial(doc.createMaterial('paint').setBaseColorFactor(rgba));
  const scene = doc.createScene().addChild(doc.createNode('m').setMesh(doc.createMesh().addPrimitive(prim)));
  doc.getRoot().setDefaultScene(scene);
  await new NodeIO().write(file, doc);
  await fs.writeFile(file + '.license.txt', 'owner-created');
}

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dg-models-'));
const assets = path.join(tmp, 'assets');
await fs.mkdir(path.join(assets, 'incoming', 'props'), { recursive: true });
await fs.mkdir(path.join(assets, 'incoming', 'characters'), { recursive: true });
await boxGlb(path.join(assets, 'incoming', 'props', 'prop.crate_wood_01.glb'), [0.72, 0.7, 0.72], [0.9, 0.2, 0.2, 1]);
await boxGlb(path.join(assets, 'incoming', 'characters', 'char.robot_sentinel_01.glb'), [1.2, 2.3, 1.0], [0.9, 0.9, 0.85, 1]);
process.env.DG_ASSETS_ROOT = assets;
const { ingest } = await import('../tools/ingest.mjs');
const res = await ingest();
check(res.ok.length === 2 && res.failed.length === 0, `ingest processed 2 models (${res.ok.length} ok, ${res.failed.length} failed)`);
// a live entry whose file does not exist: the game must fall back to procedural
const manPath = path.join(assets, 'manifest.json');
const man = JSON.parse(await fs.readFile(manPath, 'utf8'));
man.assets['prop.barrel_steel_01'] = { path: 'processed/props/prop.barrel_steel_01.glb', kind: 'model', stable: 'prop.barrel_steel', runtime: 'live', replaces: { prop: 'barrel' } };
await fs.writeFile(manPath, JSON.stringify(man, null, 2));

const outDir = path.join(tmp, 'dist');
const b = spawnSync(process.execPath, ['../../node_modules/vite/bin/vite.js', 'build', '--outDir', outDir, '--emptyOutDir'], {
  cwd: 'apps/game',
  env: { ...process.env, DG_ASSETS_ROOT: assets },
  encoding: 'utf8',
});
check(b.status === 0, 'game builds against the temp assets root');
const copied = await fs.readdir(path.join(outDir, 'models', 'processed', 'props')).catch(() => []);
check(copied.includes('prop.crate_wood_01.glb'), 'build copied processed GLBs into dist/models/');

const port = 5600 + Math.floor(Math.random() * 200);
const srv = spawn(process.execPath, ['../../node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--outDir', outDir], { cwd: 'apps/game', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
try {
  await page.goto(`http://localhost:${port}/?autostart&fresh&quality=low`);
  await page.waitForFunction(() => window.__dg?.mode === 'play' && window.__models, null, { timeout: 60000 });
  const r = await page.evaluate(() => {
    const g = window.__dg;
    const crate = g.view.batches.get('crate')?.mesh;
    const barrel = g.view.batches.get('barrel')?.mesh;
    window.__enemies.spawn('bot', g.player.pos.x + 30, g.player.pos.z + 30);
    const bot = window.__enemies.list[window.__enemies.list.length - 1];
    let botVerts = 0;
    bot.obj.traverse((o) => { if (o.isMesh && o !== bot.eye) botVerts = Math.max(botVerts, o.geometry.attributes.position.count); });
    return {
      models: window.__models,
      crateVerts: crate?.geometry.attributes.position.count,
      crateMat: crate?.material?.type,
      barrelVerts: barrel?.geometry.attributes.position.count,
      barrelMat: barrel?.material?.type,
      botVerts,
    };
  });
  check(r.models.loaded.includes('prop.crate_wood_01') && r.models.loaded.includes('char.robot_sentinel_01'), `loaded: ${r.models.loaded.join(', ')}`);
  check(r.models.failed.some((f) => f.id === 'prop.barrel_steel_01'), `missing barrel reported as fallback (${r.models.failed.map((f) => f.id).join(', ')})`);
  check(r.crateVerts === 36 && r.crateMat === 'MeshLambertMaterial', `crate batch uses the GLB (${r.crateVerts} verts, ${r.crateMat})`);
  check(r.barrelVerts > 36, `barrel stays procedural (${r.barrelVerts} verts)`);
  check(r.botVerts === 36, `spawned robot uses the GLB (${r.botVerts} verts)`);
  // fresh world swap keeps the override
  await page.evaluate(() => window.__dg.newGame());
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => window.__dg.view.batches.get('crate')?.mesh.geometry.attributes.position.count);
  check(after === 36, 'override survives a new game (view rebuild)');
} catch (e) {
  check(false, `exception: ${e.message}`);
}
check(errs.length === 0, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
await browser.close();
srv.kill();
await fs.rm(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} check(s) failed` : '\nmodels flow passed');
process.exit(failed ? 1 : 0);
