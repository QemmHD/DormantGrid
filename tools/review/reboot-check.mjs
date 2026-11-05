// Review round 6, item 1: the first reboot is reachable and guided.
// From the start of Act II (Act I quests set done; the 30-chit Act I reward granted), in fast
// sim time with real inputs (walk with W along the nav path, E to talk/interact, held E):
//   fuse step:  objective card + world beacon + minimap marker point at Odile; buy the fuse
//   node step:  card + beacon ("Control node") + minimap marker point at the downtown node
//   near node:  one-time reboot explainer card; prompt reads "Reboot node"; E starts the reboot
//   reboot:     route 3 relays (held E), hold to sync, defend the waves → node online
// The player fights back with swings; health is topped up during the defence (we test
// reachability and guidance here, not combat skill — see PLAN.md for difficulty).
// Usage: node tools/review/reboot-check.mjs  (apps/game built) → docs/review/reboot.json
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const port = 7620 + Math.floor(Math.random() * 40);
const srv = spawn(process.execPath, ['../../node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://localhost:${port}/?autostart&fresh&quality=low`);
await page.waitForFunction(() => window.__dg?.mode === 'play' && window.__story && window.__guide && window.__sim, null, { timeout: 120000 });
const res = await page.evaluate(async () => {
  const g = window.__dg, guide = window.__guide, grid = window.__grid, trader = window.__trader, sim = window.__sim;
  const origRaf = window.requestAnimationFrame.bind(window);
  let fakeT = performance.now();
  performance.now = () => fakeT;
  window.requestAnimationFrame = (cb) => origRaf(() => { fakeT += 50; cb(fakeT); });
  g.renderer.render = () => {};
  const frames = (n) => new Promise((r) => { let k = n; const f = () => (--k <= 0 ? r() : window.requestAnimationFrame(f)); window.requestAnimationFrame(f); });
  const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
  const tap = async (code) => { key(code, true); await frames(2); key(code, false); await frames(2); };
  const P = () => g.player.pos, W = g.save.world, T = () => g.time;
  const out = { steps: [] };
  const step = (k, ok, detail) => out.steps.push({ k, ok: !!ok, detail });
  // Act II start
  W.flags.onb = 99; g.onbStep = 99; W.flags['open.v'] = 2;
  for (const id of ['q.first_light', 'q.roof_over', 'q.first_neighbors']) W.quests[id] = sim.QUEST_MAP.get(id).steps.length;
  sim.addItem(g.save.player.inventory, 'misc.guild_chit', 30);
  g.pokeQuests();
  await frames(10);
  const nav = sim.buildNavGrid(g.layout, g.view.removedProps);
  // walk toward (x,z); returns true if reached, false if no progress for 3 s despite side-steps
  async function walkStraight(x, z, stop, maxS) {
    const s = T();
    let lastD = 1e9, progT = T(), stuckT = T(), side = 0;
    key('KeyW', true);
    let ok = false;
    for (let fr = 0; T() - s < maxS && fr < maxS * 20 + 200; fr++) {
      if (g.paused) { out.pausedSeen = (out.pausedSeen ?? 0) + 1; await tap('Escape'); }
      const dx = x - P().x, dz = z - P().z, d = Math.hypot(dx, dz);
      if (d < stop) { ok = true; break; }
      if (T() - progT > 3) break;
      const rc = document.querySelector('[data-reboot-card]');
      if (rc && !out.rebootCardSeen) { out.rebootCardSeen = { dist: +Math.hypot(x - P().x, z - P().z).toFixed(1), text: rc.closest('.screen')?.textContent.slice(0, 200) }; }
      if (rc) { key('KeyW', false); rc.closest('.screen')?.querySelector('.btn.primary')?.click(); await frames(6); key('KeyW', true); progT = T(); continue; }
      g.camera.yaw = Math.atan2(dx, dz); g.camera.syncTargets?.();
      if (d < lastD - 0.3) { lastD = d; stuckT = T(); progT = T(); } else if (T() - stuckT > 0.8) { const k2 = side++ % 2 ? 'KeyD' : 'KeyA'; key('KeyW', false); key(k2, true); await frames(10); key(k2, false); key('KeyW', true); stuckT = T(); }
      await frames(3);
    }
    key('KeyW', false);
    await frames(3);
    return ok;
  }
  // follow the nav path; when blocked by something the coarse nav grid misses, mark the cell ahead and replan
  async function walkTo(x, z, stop = 1.8) {
    out.paths = out.paths ?? [];
    const trace = { from: [Math.round(P().x), Math.round(P().z)], to: [Math.round(x), Math.round(z)], replans: 0, blockedAt: [] };
    out.paths.push(trace);
    for (let attempt = 0; attempt < 12; attempt++) {
      const path = sim.findPath(nav, P().x, P().z, x, z, 150000) ?? [[P().x, P().z], [x, z]];
      let blocked = false;
      for (let i = 1; i < path.length && !blocked; i++) {
        const last = i === path.length - 1;
        const [wx, wz] = path[i];
        if (!(await walkStraight(wx, wz, last ? stop : 1.6, 8 + Math.hypot(wx - P().x, wz - P().z) / 2))) {
          const dx = wx - P().x, dz = wz - P().z, d = Math.hypot(dx, dz) || 1;
          const cx = Math.floor((P().x + (dx / d) * 1.5) / 2), cz = Math.floor((P().z + (dz / d) * 1.5) / 2);
          nav[cz * 608 + cx] = 1;
          trace.blockedAt.push({ at: [Math.round(P().x), Math.round(P().z)], hp: Math.round(g.save.player.health), mode: g.mode, screen: (document.querySelector('.screen.show')?.textContent ?? '').slice(0, 60), foes: (window.__enemies.list ?? []).filter((e) => e.state !== 'dead' && Math.hypot(e.pos.x - P().x, e.pos.z - P().z) < 6).length, props: g.layout.props.filter((q) => Math.hypot(q.x - P().x, q.z - P().z) < 3 && !g.view.removedProps.has(q.id)).map((q) => q.kind) });
          blocked = true;
        }
      }
      if (!blocked) break;
      trace.replans++;
    }
    await walkStraight(x, z, stop, 6);
    trace.remaining = +Math.hypot(x - P().x, z - P().z).toFixed(1);
    return Math.hypot(x - P().x, z - P().z);
  }
  const guidance = () => ({
    card: document.querySelector('.objective .ob')?.textContent ?? '',
    beacon: guide.beaconTarget.label,
    beaconAt: guide.beaconTarget.pos ? [Math.round(guide.beaconTarget.pos.x), Math.round(guide.beaconTarget.pos.z)] : null,
    minimap: g.objectiveOnMap ? { pinned: g.objectiveOnMap.pinned, label: g.objectiveOnMap.label } : null,
  });
  await frames(20);
  // 1. fuse: guided to Odile
  const g1 = guidance();
  const od = { x: g.layout.spawn.x + 8.6, z: g.layout.spawn.z - 1.6 };
  step('fuse step guided to Odile', /fuse/i.test(g1.card) && g1.beacon.includes('Odile') && g1.minimap?.label?.includes('Odile') && Math.hypot(g1.beaconAt[0] - od.x, g1.beaconAt[1] - od.z) < 2, g1);
  await walkTo(od.x, od.z - 1.6, 1.4);
  g.camera.yaw = Math.atan2(od.x - P().x, od.z - P().z); g.camera.syncTargets?.();
  await frames(6);
  await tap('KeyE');
  await frames(10);
  const row = trader.rows().find((r) => r.kind === 'buy' && r.item === 'misc.grid_fuse');
  const dialogOpened = !!document.querySelector('.screen.show');
  const bought = row ? trader.trade(row, 1) : false;
  await tap('Escape');
  await frames(10);
  const closedAfter = !document.querySelector('.screen.show') && !g.paused;
  g.pokeQuests();
  await frames(20);
  step('fuse bought from Odile (24 chits); Escape closes the trade', bought && dialogOpened && closedAfter && sim.countItem(g.save.player.inventory, 'misc.grid_fuse') >= 1, { price: row?.price, dialogOpened, closedAfter });
  // 2. node: guided
  await frames(20);
  const g2 = guidance();
  const di = g.layout.districts.findIndex((d) => d.key === 'downtown');
  const node = g.layout.nodes.filter((n) => n.district === di).sort((a, b) => Math.hypot(a.x - P().x, a.z - P().z) - Math.hypot(b.x - P().x, b.z - P().z))[0];
  step('node step guided (card, beacon, minimap)', /control node/i.test(g2.card) && g2.beacon === 'Control node' && g2.minimap?.label === 'Control node' && Math.hypot(g2.beaconAt[0] - node.x, g2.beaconAt[1] - node.z) < 2, { ...g2, nodeDist: Math.round(Math.hypot(node.x - P().x, node.z - P().z)) });
  // 3. walk there along the nav path
  const t0 = T();
  const dEnd = await walkTo(node.x, node.z, 2.4);
  const walkS = T() - t0;
  step('walked from Haven to the node', dEnd < 3.2, { seconds: Math.round(walkS), remaining: +dEnd.toFixed(1) });
  await frames(20);
  step('one-time reboot explainer shown near the node', out.rebootCardSeen && W.flags['seen:rebootCard'], out.rebootCardSeen ?? {});
  g.camera.yaw = Math.atan2(node.x - P().x, node.z - P().z); g.camera.syncTargets?.();
  await frames(8);
  const prompt = document.querySelector('.prompt')?.textContent ?? '';
  step('prompt reads "Reboot node"', /Reboot node/.test(prompt), { prompt });
  await tap('KeyE');
  await frames(10);
  step('E starts the reboot', !!grid.active, { phase: grid.active?.phase });
  // 4. relays, sync, defend
  const view = grid.activeView;
  for (let i = 0; view && i < view.relays.length; i++) {
    const r = view.relays[i];
    await walkTo(r.x, r.z, 1.4);
    g.camera.yaw = Math.atan2(r.x - P().x, r.z - P().z); g.camera.syncTargets?.();
    await frames(4);
    key('KeyE', true);
    for (let k = 0; k < 90 && grid.active && !grid.active.relays[i]; k++) await frames(2);
    key('KeyE', false);
    await frames(4);
  }
  step('three relays routed', grid.active?.phase === 'syncing' || grid.active?.relays?.every(Boolean), { phase: grid.active?.phase });
  await walkTo(node.x, node.z, 2.4);
  g.camera.yaw = Math.atan2(node.x - P().x, node.z - P().z); g.camera.syncTargets?.();
  key('KeyE', true);
  const s0 = T();
  let swings = 0;
  while (grid.active && T() - s0 < 240) {
    g.save.player.health = Math.max(g.save.player.health, 60);
    if (grid.active.phase === 'defend') {
      key('KeyE', false);
      const e = (window.__enemies.list ?? []).filter((x) => x.state !== 'dead' && Math.hypot(x.pos.x - P().x, x.pos.z - P().z) < 3)[0];
      if (e) {
        g.player.yaw = Math.atan2(e.pos.x - P().x, e.pos.z - P().z);
        g.input.press('attack'); await frames(2); g.input.release('attack'); swings++;
      }
      if (Math.hypot(node.x - P().x, node.z - P().z) > 6) await walkStraight(node.x, node.z, 3, 6);
    }
    await frames(6);
  }
  key('KeyE', false);
  const online = W.districts[di].nodesOnline.includes(node.id);
  step('sync + defence → node online', online, { seconds: Math.round(T() - s0), swings });
  g.pokeQuests();
  await frames(10);
  out.walkSeconds = Math.round(walkS);
  return out;
});
await browser.close();
srv.kill();
const pass = res.steps.every((s) => s.ok) && errs.length === 0;
for (const s of res.steps) console.log(`${s.ok ? 'ok  ' : 'FAIL'} ${s.k} ${JSON.stringify(s.detail)}`);
writeFileSync('docs/review/reboot.json', JSON.stringify({ ...res, pageErrors: errs.slice(0, 3), pass }, null, 2) + '\n');
console.log(pass ? 'reboot check passed' : 'reboot check FAILED');
process.exit(pass ? 0 : 1);
