// Review: controls + feel measurements (headless Chromium/SwiftShader — frame times
// are CPU-rendered and NOT iPhone numbers; latencies are reported in frames).
// Usage: node tools/review/controls.mjs   (apps/game must be built)
// Output: docs/review/controls.json
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const port = 6100 + Math.floor(Math.random() * 90);
const srv = spawn(process.execPath, ['../../node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const base = `http://localhost:${port}`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const R = {};

// per-frame recorder installed in the page
const REC = `
  window.__rec = { f: 0, log: [] };
  (function loop(t) {
    const g = window.__dg;
    window.__rec.f++;
    if (g?.player) window.__rec.log.push([window.__rec.f, t, g.player.pos.x, g.player.pos.z, Math.hypot(g.player.vel.x, g.player.vel.z), g.camera.yaw]);
    if (window.__rec.log.length > 4000) window.__rec.log.splice(0, 2000);
    requestAnimationFrame(loop);
  })(performance.now());
  window.__skip = () => { const g = window.__dg; g.save.world.flags.onb = 99; g.onbStep = 99; };`;
const frame = (p) => p.evaluate(() => window.__rec.f);
const logSince = (p, f0) => p.evaluate((f) => window.__rec.log.filter((r) => r[0] > f), f0);
const firstChange = (log, from, idx = [2, 3], eps = 0.01) => {
  const r0 = log[0];
  for (const r of log) if (Math.hypot(r[idx[0]] - r0[idx[0]], r[idx[1]] - r0[idx[1]]) > eps) return r[0] - from;
  return null;
};
const waitFrames = (p, n) => p.evaluate((n) => new Promise((res) => { let k = n; const f = () => (--k <= 0 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
async function open(ctxOpts, q) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  await page.goto(`${base}/?autostart&fresh&quality=${q}`);
  await page.waitForFunction(() => window.__dg?.mode === 'play', null, { timeout: 90000 });
  await page.evaluate(REC);
  await page.evaluate(() => window.__skip());
  await page.waitForTimeout(1500);
  return { ctx, page };
}
const quantiles = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), worst: +s[s.length - 1].toFixed(1) };
};

// ---------------- 1. touch (iPhone landscape, medium) ----------------
{
  const W = 844, H = 390;
  const { ctx, page } = await open({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, 'medium');
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: p[2] ?? i })) });
  // input -> motion latency (frames), stick pushed fully up
  const lat = [];
  for (let k = 0; k < 5; k++) {
    await page.evaluate(() => { const g = window.__dg, s = g.layout.spawn; g.player.pos.set(s.x + 20, g.view.surface(s.x + 20, s.z - 25), s.z - 25); g.player.vel.set(0, 0, 0); });
    await waitFrames(page, 4);
    const f0 = await frame(page);
    await touch('touchStart', [[W * 0.15, H * 0.7]]);
    await touch('touchMove', [[W * 0.15, H * 0.7 - 70]]);
    await waitFrames(page, 25);
    const log = await logSince(page, f0);
    lat.push(firstChange(log, f0));
    await touch('touchEnd', []);
    await waitFrames(page, 20);
  }
  // camera degrees per pixel: slow drag (10 x 10 px) and fast drag (2 x 50 px)
  const dpp = [];
  for (const [steps, px] of [[10, 10], [2, 50]]) {
    await page.evaluate(() => window.__dg.camera.syncTargets?.());
    const y0 = await page.evaluate(() => window.__dg.camera.yaw);
    await touch('touchStart', [[W * 0.62, H * 0.45]]);
    for (let i = 1; i <= steps; i++) await touch('touchMove', [[W * 0.62 + i * px, H * 0.45]]);
    await touch('touchEnd', []);
    await waitFrames(page, 30);
    const y1 = await page.evaluate(() => window.__dg.camera.yaw);
    const total = steps * px - 5; // 5 px dead zone
    dpp.push({ drag: `${steps}x${px}px`, degPerPx: +((Math.abs(y1 - y0) * 180) / Math.PI / total).toFixed(3) });
  }
  // speed ramp while held (frames) and stop time
  await page.evaluate(() => { const g = window.__dg, s = g.layout.spawn; g.player.pos.set(s.x + 20, g.view.surface(s.x + 20, s.z - 25), s.z - 25); g.player.vel.set(0, 0, 0); });
  await waitFrames(page, 4);
  let f0 = await frame(page);
  await touch('touchStart', [[W * 0.15, H * 0.7]]);
  await touch('touchMove', [[W * 0.15, H * 0.7 - 70]]);
  await waitFrames(page, 40);
  let log = await logSince(page, f0);
  const vmax = Math.max(...log.map((r) => r[4]));
  const t90 = log.find((r) => r[4] >= 0.9 * vmax);
  const f1 = await frame(page);
  await touch('touchEnd', []);
  await waitFrames(page, 40);
  log = await logSince(page, f1);
  const stopRow = log.find((r) => r[4] < 0.1);
  const fts = log.slice(1).map((r, i) => r[1] - log[i][1]);
  R.touch = {
    inputToMotionFrames: lat,
    cameraDegPerPx: dpp,
    walkTopSpeed: +vmax.toFixed(2),
    framesTo90pctSpeed: t90 ? t90[0] - f0 : null,
    framesToStop: stopRow ? stopRow[0] - f1 : null,
    frameMsDuringTest: quantiles(fts),
  };
  console.log('touch', JSON.stringify(R.touch));
  await ctx.close();
}

// ---------------- 2. desktop keyboard + probes (low tier for speed) ----------------
{
  const { ctx, page } = await open({ viewport: { width: 1280, height: 720 } }, 'low');
  const lat = [];
  for (let k = 0; k < 5; k++) {
    await page.evaluate(() => { const g = window.__dg, s = g.layout.spawn; g.player.pos.set(s.x + 20, g.view.surface(s.x + 20, s.z - 25), s.z - 25); g.player.vel.set(0, 0, 0); });
    await waitFrames(page, 4);
    const f0 = await frame(page);
    await page.keyboard.down('KeyW');
    await waitFrames(page, 20);
    lat.push(firstChange(await logSince(page, f0), f0));
    await page.keyboard.up('KeyW');
    await waitFrames(page, 15);
  }
  R.keyboard = { inputToMotionFrames: lat };

  // stuck / sliding / camera-clip probes on streets and next to buildings
  const probes = await page.evaluate(() => {
    const L = window.__dg.layout;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const out = [];
    const keys = ['downtown', 'residential', 'market', 'industrial', 'haven', 'hospital'];
    for (const key of keys) {
      const d = L.districts.find((x) => x.key === key);
      const bs = L.buildings.filter((b) => b.district === d.index);
      for (let i = 0; i < 8; i++) {
        const b = bs[Math.floor(rnd() * bs.length)];
        const ry = b.rot * Math.PI / 2;
        const hd = (b.rot & 1 ? b.w : b.d) / 2;
        // start 3 m in front of the facade, walk toward it at an angle
        out.push({ key, x: b.x + Math.sin(ry) * (hd + 3), z: b.z + Math.cos(ry) * (hd + 3), yaw: ry + Math.PI + (rnd() - 0.5) * 1.6 });
      }
    }
    return out;
  });
  const results = [];
  for (const pr of probes) {
    await page.evaluate((pr) => {
      const g = window.__dg;
      g.view.loadAround(pr.x, pr.z);
      g.player.pos.set(pr.x, g.view.surface(pr.x, pr.z), pr.z);
      g.player.vel.set(0, 0, 0);
      g.camera.yaw = pr.yaw; g.camera.syncTargets?.();
      window.__clip = 0; window.__clipFrames = 0;
      window.__clipMon = () => {
        const cam = g.camera.cam.position, p = g.player.pos;
        for (const b of g.layout.buildings) {
          if (Math.abs(b.x - cam.x) > 30 || Math.abs(b.z - cam.z) > 30) continue;
          const odd = b.rot & 1; const hx = (odd ? b.d : b.w) / 2, hz = (odd ? b.w : b.d) / 2;
          const inCam = Math.abs(cam.x - b.x) < hx - 0.2 && Math.abs(cam.z - b.z) < hz - 0.2 && cam.y < b.floors * 3.25;
          const inPl = Math.abs(p.x - b.x) < hx && Math.abs(p.z - b.z) < hz;
          if (inCam && !inPl) window.__clip++;
        }
        window.__clipFrames++;
        if (window.__clipOn) requestAnimationFrame(window.__clipMon);
      };
      window.__clipOn = true; requestAnimationFrame(window.__clipMon);
    }, pr);
    await waitFrames(page, 6);
    const a = await page.evaluate(() => ({ x: window.__dg.player.pos.x, z: window.__dg.player.pos.z }));
    await page.keyboard.down('KeyW');
    await waitFrames(page, 18);
    const b = await page.evaluate(() => ({ x: window.__dg.player.pos.x, z: window.__dg.player.pos.z, v: Math.hypot(window.__dg.player.vel.x, window.__dg.player.vel.z) }));
    await page.keyboard.up('KeyW');
    await waitFrames(page, 15);
    const c = await page.evaluate(() => { window.__clipOn = false; const g = window.__dg; return { x: g.player.pos.x, z: g.player.pos.z, y: g.player.pos.y, ground: g.view.surface(g.player.pos.x, g.player.pos.z), clip: window.__clip, frames: window.__clipFrames }; });
    results.push({ ...pr, moved: +Math.hypot(b.x - a.x, b.z - a.z).toFixed(2), vAtRelease: +b.v.toFixed(2), driftAfterRelease: +Math.hypot(c.x - b.x, c.z - b.z).toFixed(2), belowGround: +(c.ground - c.y).toFixed(2), camInsideBuildingFrames: c.clip, frames: c.frames });
  }
  R.probes = {
    count: results.length,
    stuckNoMotion: results.filter((r) => r.moved < 0.15).map((r) => `${r.key} ${r.x.toFixed(0)},${r.z.toFixed(0)}`),
    slidingOver0_5m: results.filter((r) => r.driftAfterRelease > 0.5).map((r) => `${r.key} drift ${r.driftAfterRelease}`),
    fellBelowGround: results.filter((r) => r.belowGround > 0.3).length,
    cameraInsideBuilding: results.filter((r) => r.camInsideBuildingFrames > 0).map((r) => `${r.key} ${r.x.toFixed(0)},${r.z.toFixed(0)} frames ${r.camInsideBuildingFrames}/${r.frames}`),
    raw: results,
  };
  console.log('probes', JSON.stringify({ ...R.probes, raw: undefined }));

  // interaction range + wrong target
  const inter = await page.evaluate(async () => {
    const g = window.__dg, L = g.layout;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const kinds = ['crate', 'barrel', 'car', 'trashbag', 'bench', 'tire', 'cone', 'sign', 'bush', 'dumpster'];
    const out = { range: {}, ahead2m: { tests: 0, wrong: 0, none: 0, examples: [] }, behindCase: null };
    for (const kind of kinds) {
      const p = L.props.find((q) => q.kind === kind && q.building < 0 && !g.view.removedProps.has(q.id));
      if (!p) continue;
      out.range[kind] = 0;
      for (const d of [1, 2, 3, 3.5, 4, 4.5]) {
        g.view.loadAround(p.x, p.z);
        g.player.pos.set(p.x, g.view.surface(p.x, p.z + d), p.z + d);
        g.camera.yaw = Math.PI; g.camera.syncTargets?.();
        await sleep(450);
        const t = g.target;
        if (t && t.kind === 'prop' && t.id === p.id) out.range[kind] = d;
      }
    }
    // random clutter: stand 2 m in front of a prop, look straight at it
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const cand = L.props.filter((q) => q.building < 0 && ['crate', 'barrel', 'trashbag', 'tire', 'pallet', 'cone', 'debris'].includes(q.kind));
    for (let i = 0; i < 30; i++) {
      const p = cand[Math.floor(rnd() * cand.length)];
      const a = rnd() * Math.PI * 2;
      const x = p.x + Math.sin(a) * 2, z = p.z + Math.cos(a) * 2;
      g.view.loadAround(x, z);
      g.player.pos.set(x, g.view.surface(x, z), z);
      g.camera.yaw = a + Math.PI; g.camera.syncTargets?.();
      await sleep(400);
      const t = g.target;
      out.ahead2m.tests++;
      if (!t) out.ahead2m.none++;
      else if (!(t.kind === 'prop' && t.id === p.id)) {
        out.ahead2m.wrong++;
        if (out.ahead2m.examples.length < 6) out.ahead2m.examples.push(`looking at ${p.kind}#${p.id} from 2 m → got ${t.kind} ${t.name}`);
      }
    }
    return out;
  });
  // analytic: scoring d*(1.6 - dot) in game.ts scanTargets
  const score = (d, dot) => d * (1.6 - dot);
  inter.behindCase = `A prop 0.6 m directly BEHIND scores ${score(0.6, -1).toFixed(2)}; one 3.0 m directly ahead scores ${score(3.0, 1).toFixed(2)}, so the one behind the player wins (game.ts scanTargets score = d*(1.6-dot)).`;
  R.interaction = inter;
  console.log('interaction', JSON.stringify(inter));
  await ctx.close();
}

// ---------------- 3. frame time per tier (downtown street, 6 s) ----------------
R.frameMs = {};
for (const q of ['low', 'medium', 'high']) {
  const { ctx, page } = await open({ viewport: { width: 1280, height: 720 } }, q);
  await page.evaluate(() => {
    const g = window.__dg, d = g.layout.districts.find((x) => x.key === 'downtown');
    g.view.loadAround(d.cx, d.cz);
    g.player.pos.set(d.cx, g.view.surface(d.cx, d.cz), d.cz);
  });
  await page.waitForTimeout(4000);
  const f0 = await frame(page);
  await page.waitForTimeout(6000);
  const log = await logSince(page, f0);
  const fts = log.slice(1).map((r, i) => r[1] - log[i][1]);
  const info = await page.evaluate(() => ({ calls: window.__dg.renderer.gl.info.render.calls, tris: window.__dg.renderer.gl.info.render.triangles, dpr: window.__dg.renderer.gl.getPixelRatio() }));
  R.frameMs[q] = { ...quantiles(fts), ...info };
  console.log('frame', q, JSON.stringify(R.frameMs[q]));
  await ctx.close();
}
R.note = 'SwiftShader (CPU) rendering: frame times are for relative comparison between tiers only, not iPhone performance.';
R.analytic = {
  cameraRadPerLookUnit: '0.0042 (game/camera.ts:48)',
  touchGain: '(0.95 + 0.9*min(1, speed/22)) * sensitivity px→look units, 5 px dead zone (input/input.ts:305-309) → 0.23°/px slow, 0.45°/px fast',
  mouse: '0.9 * sensitivity per movementX count → 0.22°/count; mouse look only after pointer lock (input/input.ts:373)',
  accel: 'velocity lerps with k = 1 - exp(-14 dt) when pushing, -18 dt when releasing, 4 in air (game/player.ts:86) → 90% speed in 0.16 s, stop to 10% in 0.13 s',
  speeds: 'walk 3.4 m/s, run 6.0 m/s (game/player.ts:25-26)',
  targetRescan: 'every 0.1 s (game/game.ts:1797), INTERACT_RANGE 3.2 m (+1.2 cars/trees, +2.5 bus/container) (game/game.ts:108, 846)',
};
writeFileSync('docs/review/controls.json', JSON.stringify(R, null, 2) + '\n');
await browser.close();
srv.kill();
process.exit(0);
