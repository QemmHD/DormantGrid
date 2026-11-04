// Review: clean re-measure of camera clipping and interaction targeting.
// Fixes two harness problems in controls.mjs: (1) the camera glides after a teleport,
// so monitoring now starts after it settles; (2) low tier hides 45% of small props, so
// this runs on HIGH (prop density 1). Rendering is disabled and the clock is advanced
// 50 ms/frame (harness only) so the sim runs fast; camera + targeting logic still run.
// Usage: node tools/review/controls2.mjs   → docs/review/controls2.json
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const port = 6500 + Math.floor(Math.random() * 90);
const srv = spawn(process.execPath, ['../../node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto(`http://localhost:${port}/?autostart&fresh&quality=high`);
await page.waitForFunction(() => window.__dg?.mode === 'play', null, { timeout: 90000 });

const R = await page.evaluate(async () => {
  const g = window.__dg, L = g.layout;
  const origRaf = window.requestAnimationFrame.bind(window);
  let fakeT = performance.now();
  performance.now = () => fakeT;
  window.requestAnimationFrame = (cb) => origRaf(() => { fakeT += 50; cb(fakeT); });
  g.renderer.render = () => {};
  g.save.world.flags.onb = 99; g.onbStep = 99;
  const frames = (n) => new Promise((res) => { let k = n; const f = () => (--k <= 0 ? res() : window.requestAnimationFrame(f)); window.requestAnimationFrame(f); });
  const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
  const bbox = (b) => { const odd = b.rot & 1; return { hx: (odd ? b.d : b.w) / 2, hz: (odd ? b.w : b.d) / 2 }; };
  const camInWall = () => {
    // camera behind a facade: inside some building footprint (by > 0.25 m) that the player is NOT inside
    const c = g.camera.cam.position, p = g.player.pos;
    for (const b of L.buildings) {
      if (Math.abs(b.x - c.x) > 30 || Math.abs(b.z - c.z) > 30) continue;
      const { hx, hz } = bbox(b);
      const inC = Math.abs(c.x - b.x) < hx - 0.25 && Math.abs(c.z - b.z) < hz - 0.25 && c.y < b.floors * 3.25 - 0.3;
      const inP = Math.abs(p.x - b.x) < hx + 0.3 && Math.abs(p.z - b.z) < hz + 0.3;
      if (inC && !inP) return b.id;
    }
    return -1;
  };
  const place = async (x, z, yaw) => {
    g.view.loadAround(x, z);
    g.player.pos.set(x, g.view.surface(x, z), z); g.player.vel.set(0, 0, 0);
    g.player.yaw = yaw; g.camera.yaw = yaw; g.camera.syncTargets?.();
    await frames(40); // let the camera settle after the teleport
  };
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out = { wallSpin: [], walkAlong: [], range: {}, ahead2m: { tests: 0, correct: 0, wrong: 0, none: 0, winners: {}, examples: [] } };

  // A. stand 0.8 m from a facade, back to the wall, sweep the camera 360° around the player
  const keys = ['downtown', 'residential', 'market', 'industrial', 'haven', 'hospital'];
  for (const k of keys) {
    const d = L.districts.find((x) => x.key === k);
    const bs = L.buildings.filter((b) => b.district === d.index);
    for (let i = 0; i < 5; i++) {
      const b = bs[Math.floor(rnd() * bs.length)];
      const ry = b.rot * Math.PI / 2, hd = (b.rot & 1 ? b.w : b.d) / 2;
      const x = b.x + Math.sin(ry) * (hd + 0.8), z = b.z + Math.cos(ry) * (hd + 0.8);
      await place(x, z, ry);
      let bad = 0, n = 0;
      for (let s = 0; s < 36; s++) {
        g.input.lookX += (Math.PI * 2 / 36) / 0.0042; // one 10° step via the real look path
        await frames(3);
        n++;
        if (camInWall() >= 0) bad++;
      }
      out.wallSpin.push({ district: k, building: b.id, framesBehindWall: bad, of: n });
    }
  }
  // B. walk 3 s along a sidewalk next to buildings with the camera trailing
  for (const k of keys) {
    const d = L.districts.find((x) => x.key === k);
    const bs = L.buildings.filter((b) => b.district === d.index);
    for (let i = 0; i < 4; i++) {
      const b = bs[Math.floor(rnd() * bs.length)];
      const ry = b.rot * Math.PI / 2, hd = (b.rot & 1 ? b.w : b.d) / 2;
      const x = b.x + Math.sin(ry) * (hd + 1.2), z = b.z + Math.cos(ry) * (hd + 1.2);
      await place(x, z, ry + Math.PI / 2 + 0.25); // walk parallel, angled slightly toward the wall
      let bad = 0, n = 0;
      key('KeyW', true);
      for (let s = 0; s < 30; s++) { await frames(2); n++; if (camInWall() >= 0) bad++; }
      key('KeyW', false);
      out.walkAlong.push({ district: k, framesBehindWall: bad, of: n });
    }
  }
  // C. interaction range per kind (stand at d m, camera facing the prop)
  for (const kind of ['crate', 'barrel', 'car', 'trashbag', 'bench', 'tire', 'cone', 'sign', 'bush', 'dumpster', 'weeds', 'barrier']) {
    const ps = L.props.filter((q) => q.kind === kind && q.building < 0 && !g.view.removedProps.has(q.id));
    const p = ps[Math.floor(rnd() * ps.length)];
    if (!p) continue;
    out.range[kind] = { reached: 0 };
    for (const dd of [1, 2, 3, 3.5, 4, 4.5]) {
      const a = rnd() * Math.PI * 2;
      await place(p.x + Math.sin(a) * dd, p.z + Math.cos(a) * dd, a + Math.PI);
      await frames(6);
      const t = g.target;
      if (t && t.kind === 'prop' && t.id === p.id) out.range[kind].reached = dd;
    }
  }
  // D. wrong target: stand 2 m from a clutter prop, look straight at it
  const cand = L.props.filter((q) => q.building < 0 && ['crate', 'barrel', 'trashbag', 'tire', 'pallet', 'cone', 'debris', 'dumpster', 'bench'].includes(q.kind));
  for (let i = 0; i < 60; i++) {
    const p = cand[Math.floor(rnd() * cand.length)];
    const a = rnd() * Math.PI * 2;
    await place(p.x + Math.sin(a) * 2, p.z + Math.cos(a) * 2, a + Math.PI);
    await frames(6);
    const t = g.target;
    out.ahead2m.tests++;
    if (!t) { out.ahead2m.none++; continue; }
    if (t.kind === 'prop' && t.id === p.id) { out.ahead2m.correct++; continue; }
    out.ahead2m.wrong++;
    const tp = t.pos ? { x: t.pos.x, z: t.pos.z } : null;
    const P = g.player.pos;
    let rel = '';
    if (tp) {
      const fx = Math.sin(g.camera.yaw), fz = Math.cos(g.camera.yaw);
      const dx = tp.x - P.x, dz = tp.z - P.z, dist = Math.hypot(dx, dz);
      const ang = Math.round((Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / Math.max(1e-3, dist)))) * 180) / Math.PI);
      rel = `${dist.toFixed(1)} m away at ${ang}° off-center`;
    }
    const w = `${t.kind}:${t.kind === 'prop' ? L.props[t.id].kind : t.name}`;
    out.ahead2m.winners[w] = (out.ahead2m.winners[w] ?? 0) + 1;
    if (out.ahead2m.examples.length < 10) out.ahead2m.examples.push(`aimed at ${p.kind} 2 m ahead → got ${w}, ${rel}`);
  }
  return out;
});
const sum = (a) => ({ probes: a.length, probesWithCameraBehindWall: a.filter((x) => x.framesBehindWall > 0).length, framesBehindWall: a.reduce((s, x) => s + x.framesBehindWall, 0), framesTotal: a.reduce((s, x) => s + x.of, 0) });
R.summary = { wallSpin: sum(R.wallSpin), walkAlong: sum(R.walkAlong) };
writeFileSync('docs/review/controls2.json', JSON.stringify(R, null, 2) + '\n');
console.log(JSON.stringify({ summary: R.summary, range: R.range, ahead2m: R.ahead2m }, null, 2));
await browser.close();
srv.kill();
process.exit(0);
