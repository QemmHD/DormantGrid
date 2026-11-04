// Gate 6: scripted walk across the whole town (accelerated). Checks that
// geometry/texture counts, colliders and chunk counts stay bounded (no leaks)
// and records chunk build times. Also checks world hash determinism in-browser.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const port = 5100 + Math.floor(Math.random() * 90);
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://localhost:${port}/?autostart&fresh&quality=${process.env.Q ?? 'medium'}`);
await page.waitForFunction(() => window.__dg?.mode === 'play', null, { timeout: 40000 });
const samples = [];
const way = [];
for (let i = 0; i < 48; i++) {
  const a = (i / 48) * Math.PI * 4;
  const r = 120 + (i / 48) * 400;
  way.push([608 + Math.cos(a) * r, 608 + Math.sin(a) * r]);
}
let worstBuild = 0;
for (let i = 0; i < way.length; i++) {
  const [x, z] = way[i];
  const s = await page.evaluate(([x, z]) => {
    const g = window.__dg;
    g.save.player.health = 100;
    g.player.pos.set(x, g.view.surface(x, z), z);
    let worst = 0;
    for (let k = 0; k < 40; k++) {
      g.view.update(x, z);
      worst = Math.max(worst, g.view.lastBuildMs);
    }
    const mem = g.renderer.gl.info.memory;
    return { geo: mem.geometries, tex: mem.textures, chunks: g.view.chunkCount, cols: g.collision.count, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, worst };
  }, [x, z]);
  await page.waitForTimeout(250);
  worstBuild = Math.max(worstBuild, s.worst);
  samples.push(s);
}
await page.evaluate(() => window.gc && window.gc());
const final = await page.evaluate(() => ({ heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, hash: window.__dg.layout.hash }));
const first = samples[4], last = samples[samples.length - 1];
console.log('first', JSON.stringify(first));
console.log('last ', JSON.stringify(last));
console.log('final heap MB', final.heap, 'world hash', final.hash, 'worst chunk build ms', worstBuild.toFixed(1));
let ok = true;
const maxGeo = Math.max(...samples.map((s) => s.geo));
const maxCols = Math.max(...samples.map((s) => s.cols));
if (last.geo > first.geo + 60) { console.log('FAIL geometry count grew', first.geo, '→', last.geo); ok = false; } else console.log('ok   geometry count bounded (max', maxGeo + ')');
if (last.tex > first.tex + 4) { console.log('FAIL texture count grew'); ok = false; } else console.log('ok   texture count bounded', last.tex);
if (maxCols > 40000) { console.log('FAIL colliders unbounded', maxCols); ok = false; } else console.log('ok   colliders bounded (max', maxCols + ')');
if (final.hash !== '9cf52650') { console.log('FAIL world hash differs', final.hash); ok = false; } else console.log('ok   world hash deterministic', final.hash);
if (errs.length) { console.log('FAIL errors', errs.slice(0, 3)); ok = false; }
await browser.close();
srv.kill();
process.exit(ok ? 0 : 1);
