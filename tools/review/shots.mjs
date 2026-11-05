// Review: screenshots at fixed points, iPhone-landscape (touch, medium tier) and desktop (high tier).
// Usage: node tools/review/shots.mjs [baseUrl]   (default: local build via vite preview)
// Output: docs/review/shots/<profile>-<nn>-<scene>.png + shots.json (counters per shot)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

let base = process.argv[2];
let srv = null;
if (!base) {
  const port = 5900 + Math.floor(Math.random() * 90);
  srv = spawn(process.execPath, ['../../node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
  await new Promise((r) => setTimeout(r, 2500));
  base = `http://localhost:${port}`;
}
const OUT = 'docs/review/shots';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const profiles = [
  { name: 'iphone', q: 'medium', ctx: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  { name: 'desktop', q: 'high', ctx: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 } },
];

// helpers injected into the page
const PRE = `
  window.__rv = {
    g: () => window.__dg,
    skipTut() { const g = window.__dg; g.save.world.flags.onb = 99; g.onbStep = 99; },
    to(x, z, yaw, pitch, hour) {
      const g = window.__dg;
      g.view.loadAround(x, z);
      g.player.pos.set(x, g.view.surface(x, z), z);
      g.player.vel.set(0, 0, 0);
      if (yaw !== undefined) { g.player.yaw = yaw; g.camera.yaw = yaw; }
      if (pitch !== undefined) g.camera.pitch = pitch;
      if (hour !== undefined) g.save.world.hour = hour;
    },
    district(key) { return window.__dg.layout.districts.find((d) => d.key === key); },
    /** a road point near a district center, looking along the road */
    street(key) {
      const g = window.__dg, L = g.layout, d = this.district(key);
      let best = null;
      for (let dz = -60; dz <= 60; dz += 4) for (let dx = -60; dx <= 60; dx += 4) {
        const x = d.cx + dx, z = d.cz + dz;
        const t = L.tiles[Math.floor(z / 4) * 304 + Math.floor(x / 4)];
        if (t !== 1) continue; // Tile.Road
        const dist = Math.hypot(dx, dz);
        if (!best || dist < best.dist) best = { x, z, dist };
      }
      return best ?? { x: d.cx, z: d.cz };
    },
    building(lot, near) {
      const L = window.__dg.layout;
      return L.buildings.filter((b) => b.lot === lot && b.decay < 0.6).sort((a, b) => Math.hypot(a.x - near.x, a.z - near.z) - Math.hypot(b.x - near.x, b.z - near.z))[0];
    },
    front(b, dist, side = 0) {
      const ry = b.rot * Math.PI / 2, fx = Math.sin(ry), fz = Math.cos(ry);
      const hd = (b.rot & 1 ? b.w : b.d) / 2;
      return { x: b.x + fx * (hd + dist) + fz * side, z: b.z + fz * (hd + dist) - fx * side, yaw: ry + Math.PI };
    },
    restore(key, state) {
      const g = window.__dg, i = g.layout.districts.findIndex((d) => d.key === key);
      const ds = g.save.world.districts[i];
      ds.nodesOnline = g.layout.nodes.filter((n) => n.district === i).map((n) => n.id);
      ds.state = state;
      window.__grid.remoteOnline(0, i);
    },
  };`;

const scenes = [
  ['menu', async (p) => { await p.goto(`${base}/?quality=${p.q}`); await p.waitForTimeout(8000); }, 0],
  ['spawn-first-frame', async (p) => { await p.goto(`${base}/?autostart&fresh&quality=${p.q}`); await p.waitForFunction(() => window.__dg?.mode === 'play', null, { timeout: 90000 }); await p.evaluate(PRE); }, 2500],
  ['spawn-after-intro', async () => {}, 9000],
  ['haven-overview', `__rv.skipTut(); const s = __dg.layout.spawn; __rv.to(s.x - 10, s.z + 14, 2.6, -0.32, 10);`, 4000],
  ['downtown-street-dormant', `const s = __rv.street('downtown'); __rv.to(s.x, s.z, 0.7, -0.1, 11);`, 5000],
  ['downtown-street-restored', `__rv.restore('downtown', 4);`, 5000],
  ['residential-street', `const s = __rv.street('residential'); __rv.to(s.x, s.z, 1.2, -0.1, 14);`, 5000],
  ['building-closeup-apartment', `const b = __rv.building('apartment', __dg.layout.spawn); const f = __rv.front(b, 7, 2); __rv.to(f.x, f.z, f.yaw + 0.2, -0.02, 15);`, 5000],
  ['building-closeup-shop', `const b = __rv.building('shop', __rv.district('market')); const f = __rv.front(b, 8, 2); __rv.to(f.x, f.z, f.yaw + 0.2, -0.05, 15);`, 5000],
  ['interior', `const L = __dg.layout, s = L.spawn; const b = L.buildings.filter((b) => b.enterable && b.lot === 'house').sort((a, c) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(c.x - s.x, c.z - s.z))[0]; __rv.to(b.x, b.z, 0.4, -0.15, 12);`, 5000],
  ['prop-closeup-car', `const g = __dg; const s = __rv.street('residential'); const c = g.layout.props.filter((p) => p.kind === 'car').sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0]; __rv.to(c.x + 3.2, c.z + 3.2, Math.atan2(c.x - (c.x + 3.2), c.z - (c.z + 3.2)), -0.12, 13);`, 5000],
  ['interact-target-crate', `const g = __dg; const s = g.layout.spawn; const c = g.layout.props.filter((p) => p.kind === 'crate' && p.building < 0).sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0]; __rv.to(c.x, c.z + 1.8, Math.PI, -0.2, 10);`, 4000],
  ['night-haven', `const s = __dg.layout.spawn; __rv.to(s.x - 8, s.z + 10, 2.6, -0.2, 22.5);`, 5000],
  ['night-downtown-dormant', `__dg.save.world.districts[__dg.layout.districts.findIndex((d) => d.key === 'market')].state = 0; const s = __rv.street('market'); __rv.to(s.x, s.z, 0.7, -0.1, 23);`, 5000],
  ['night-downtown-restored', `const s = __rv.street('downtown'); __rv.to(s.x, s.z, 0.7, -0.1, 23);`, 5000],
  ['rain', `const s = __rv.street('residential'); __rv.to(s.x, s.z, 2.0, -0.1, 36);`, 6000],
  ['fog', `const s = __rv.street('residential'); __rv.to(s.x, s.z, 2.0, -0.1, 106.5);`, 6000],
  ['storm', `const s = __rv.street('residential'); __rv.to(s.x, s.z, 2.0, -0.1, 34.5);`, 6000],
  ['build-mode', `const s = __dg.layout.spawn; __rv.to(s.x + 6, s.z + 6, 2.4, -0.3, 130.5); __dg.startBuild('foundation', 0);`, 4000],
  ['raid', `__dg.stopBuild?.(); const s = __dg.layout.spawn; __rv.to(s.x, s.z, 0.5 + Math.PI / 2, -0.12, 131); __dg.settings.dayMinutes = 2; __raids.force();`, 14000],
  ['screen-inventory', `__dg.settings.dayMinutes = 24; __dg.openScreen('inventory');`, 2000],
  ['screen-craft', `__dg.openScreen('craft');`, 2000],
  ['screen-map', `__dg.openScreen('map');`, 2500],
  ['screen-ledger', `__dg.openScreen('ledger');`, 2000],
  ['screen-journal', `__dg.openScreen('journal');`, 2000],
  ['screen-settings', `__dg.openScreen('settings');`, 2000],
];

const meta = [];
// PROFILE=desktop|iphone limits the run to one profile
for (const prof of profiles.filter((p) => !process.env.PROFILE || p.name === process.env.PROFILE)) {
  const ctx = await browser.newContext(prof.ctx);
  const page = await ctx.newPage();
  page.q = prof.q;
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  let i = 0;
  for (const [name, setup, wait] of scenes) {
    i++;
    try {
      if (typeof setup === 'function') await setup(page);
      else {
        await page.evaluate(`(() => { try { __dg.openScreen(null); } catch {} })()`);
        await page.evaluate(`(() => { ${setup} })()`);
      }
      if (wait) await page.waitForTimeout(wait);
      const file = `${OUT}/${prof.name}-${String(i).padStart(2, '0')}-${name}.png`;
      await page.screenshot({ path: file });
      const c = await page.evaluate(() => {
        const g = window.__dg;
        if (!g?.renderer) return null;
        const r = g.renderer.gl.info.render;
        return { calls: r.calls, tris: r.triangles, weather: g.save?.world.weather, hour: +(g.save?.world.hour ?? 0).toFixed(2), raiders: window.__enemies?.aliveTagged?.('raid') };
      }).catch(() => null);
      meta.push({ profile: prof.name, scene: name, file, ...c });
      console.log(`${prof.name} ${name} ${JSON.stringify(c)}`);
    } catch (e) {
      meta.push({ profile: prof.name, scene: name, error: e.message.slice(0, 200) });
      console.log(`${prof.name} ${name} ERROR ${e.message.slice(0, 160)}`);
    }
  }
  meta.push({ profile: prof.name, pageErrors: errs.slice(0, 10) });
  await ctx.close();
}
writeFileSync('docs/review/shots.json', JSON.stringify(meta, null, 2) + '\n');
await browser.close();
srv?.kill();
process.exit(0);
