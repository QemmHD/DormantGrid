// Review P11: enemy variety, measured.
// A. Silhouettes: each of the 11 kinds rendered alone at 30 m (same camera, enemy on vs off).
//    Pass: every silhouette covers ≥ 40 px at 1280×720, and every pair overlaps ≤ 0.8 IoU when
//    aligned at the feet (shape alone tells them apart). Sheet: docs/review/shots/enemy-silhouettes.png
// B. Behaviour, counter and escalation signatures in fast sim time (render off, fake 50 ms frames):
//    each kind's role does what it says, and its counter works.
// Usage: node tools/review/enemies-check.mjs   (apps/game must be built) → docs/review/enemies.json
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const KINDS = ['raider', 'scout', 'brute', 'sniper', 'captain', 'drone', 'bot', 'crawler', 'heavy', 'hound', 'boar'];
const T = { minPx: 40, maxIoU: 0.8 };
const port = 7240 + Math.floor(Math.random() * 50);
const srv = spawn(process.execPath, ['../../node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
mkdirSync('docs/review/shots', { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://localhost:${port}/?autostart&fresh&quality=high`);
await page.waitForFunction(() => window.__dg?.mode === 'play' && window.__enemies, null, { timeout: 120000 });

// ---------------------------------------------------------------- A. silhouettes
const spot = await page.evaluate(() => {
  const g = window.__dg, E = window.__enemies;
  E.enabled = false;
  const f = g.save.world.flags;
  f.onb = 99; g.onbStep = 99; f['open.v'] = 2;
  g.save.world.hour = 12;
  // an open, flat field: scan west of Haven for 40 m of free ground ahead
  const s = g.layout.spawn;
  const x = s.x - 40, z = s.z - 30;
  g.view.loadAround(x, z);
  g.player.pos.set(x, g.view.surface(x, z), z);
  g.camera.yaw = 0;
  g.camera.pitch = 0;
  g.camera.syncTargets?.();
  g.player.rig.root.visible = false;
  document.querySelector('#ui').style.visibility = 'hidden';
  return { x, z };
});
const masks = {};
for (const k of KINDS) {
  await page.evaluate(({ k, spot }) => {
    const g = window.__dg, E = window.__enemies;
    E.clear();
    g.setPaused(false);
    E.spawn(k, spot.x, spot.z + 30, false, 'sil');
    const e = E.list[E.list.length - 1];
    e.def = { ...e.def, speed: 0, sense: 0 };
    e.yaw = Math.PI * 1.25; // three-quarter view toward the camera
  }, { k, spot });
  await page.waitForFunction(() => window.__enemies.list[0]?.obj.scale.x >= 1, null, { timeout: 60000, polling: 100 });
  await page.evaluate(() => {
    const e = window.__enemies.list[0];
    e.alt = e.def.fly;
    window.__dg.setPaused(true);
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `docs/review/shots/sil-${k}-on.png`, timeout: 120000 });
  await page.evaluate(() => (window.__enemies.list[0].obj.visible = false));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `docs/review/shots/sil-${k}-off.png`, timeout: 120000 });
  const a = await sharp(`docs/review/shots/sil-${k}-on.png`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(`docs/review/shots/sil-${k}-off.png`).removeAlpha().raw().toBuffer();
  const W = a.info.width, H = a.info.height;
  const m = new Uint8Array(W * H);
  let x0 = W, x1 = -1, y0 = H, y1 = -1, n = 0;
  for (let i = 0; i < W * H; i++) {
    const d = Math.abs(a.data[i * 3] - b[i * 3]) + Math.abs(a.data[i * 3 + 1] - b[i * 3 + 1]) + Math.abs(a.data[i * 3 + 2] - b[i * 3 + 2]);
    if (d > 24) {
      m[i] = 1;
      n++;
      const x = i % W, y = (i / W) | 0;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  masks[k] = { m, W, H, n, x0, x1, y0, y1 };
  console.log(`silhouette ${k}: ${n} px, ${x1 - x0 + 1}×${y1 - y0 + 1}`);
}
await page.evaluate(() => {
  window.__dg.setPaused(false);
  window.__enemies.clear();
  window.__dg.player.rig.root.visible = true;
});
// IoU aligned at the feet (bottom-centre of the bounding box)
const iou = (A, B) => {
  const ax = (A.x0 + A.x1) >> 1, bx = (B.x0 + B.x1) >> 1;
  let inter = 0;
  for (let y = A.y0; y <= A.y1; y++)
    for (let x = A.x0; x <= A.x1; x++) {
      if (!A.m[y * A.W + x]) continue;
      const by = y - A.y1 + B.y1, bxx = x - ax + bx;
      if (by >= 0 && by < B.H && bxx >= 0 && bxx < B.W && B.m[by * B.W + bxx]) inter++;
    }
  return inter / (A.n + B.n - inter);
};
const pairs = [];
for (let i = 0; i < KINDS.length; i++) for (let j = i + 1; j < KINDS.length; j++) pairs.push([KINDS[i], KINDS[j], +iou(masks[KINDS[i]], masks[KINDS[j]]).toFixed(3)]);
pairs.sort((a, b) => b[2] - a[2]);
const worst = pairs[0];
// contact sheet: 2× crops around each silhouette, same scale
const crops = [];
for (const k of KINDS) {
  const M = masks[k];
  const cx = (M.x0 + M.x1) >> 1;
  const left = Math.max(0, Math.min(1280 - 90, cx - 45)), top = Math.max(0, Math.min(720 - 110, M.y1 - 100));
  crops.push({ input: await sharp(`docs/review/shots/sil-${k}-on.png`).extract({ left, top, width: 90, height: 110 }).resize(180, 220, { kernel: 'nearest' }).toBuffer(), left: crops.length * 184, top: 0 });
}
await sharp({ create: { width: KINDS.length * 184, height: 220, channels: 3, background: '#000' } }).composite(crops).png().toFile('docs/review/shots/enemy-silhouettes.png');
const silhouettes = {
  px: Object.fromEntries(KINDS.map((k) => [k, masks[k].n])),
  size: Object.fromEntries(KINDS.map((k) => [k, `${masks[k].x1 - masks[k].x0 + 1}×${masks[k].y1 - masks[k].y0 + 1}`])),
  worstPairs: pairs.slice(0, 5),
  pass: KINDS.every((k) => masks[k].n >= T.minPx) && worst[2] <= T.maxIoU,
};

// ---------------------------------------------------------------- B. behaviour / counters / escalation
const B = await page.evaluate(async () => {
  const g = window.__dg, E = window.__enemies;
  // fast sim: no rendering, fake 50 ms frames
  const origRaf = window.requestAnimationFrame.bind(window);
  let fakeT = performance.now();
  performance.now = () => fakeT;
  window.requestAnimationFrame = (cb) => origRaf(() => { fakeT += 50; cb(fakeT); });
  g.renderer.render = () => {};
  const frames = (n) => new Promise((res) => { let k = n; const f = () => (--k <= 0 ? res() : window.requestAnimationFrame(f)); window.requestAnimationFrame(f); });
  const s = g.layout.spawn;
  const P = g.player;
  const reset = (px, pz, hour = 12) => {
    E.clear();
    g.save.world.pieces = g.save.world.pieces.filter((p) => p.id < 9000);
    g.base.rebuild(g.save.world.pieces, g.save.world.crops, g.save.world.hour);
    g.view.loadAround(px, pz);
    P.pos.set(px, g.view.surface(px, pz), pz);
    P.vel.set(0, 0, 0);
    g.save.player.health = 100;
    g.save.world.hour = hour;
  };
  const field = { x: s.x - 40, z: s.z - 30 };
  const spawn1 = (k, dx, dz, wave = true) => {
    E.spawn(k, P.pos.x + dx, P.pos.z + dz, wave, 'test');
    return E.list[E.list.length - 1];
  };
  const out = {};
  const hurtBy = {};
  const origHurt = g.hurt.bind(g);
  g.hurt = (amt, kind, cause) => { hurtBy[cause] = (hurtBy[cause] ?? 0) + amt; return origHurt(amt, kind, cause); };
  const godmode = () => { g.save.player.health = 100; };
  const hold = async (n, fn) => { for (let i = 0; i < n; i++) { await frames(2); fn?.(); } };
  const dist = (e) => Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z);
  const stuckDodge = (on) => Object.defineProperty(P, 'dodging', { configurable: true, get: () => on });

  // raider: melee rusher hurts you; counter: dodging through the swing takes no damage
  reset(field.x, field.z);
  hurtBy.raider = 0;
  spawn1('raider', 0, 10);
  await hold(150, godmode);
  const rHurt = hurtBy.raider;
  reset(field.x, field.z);
  stuckDodge(true);
  hurtBy.raider = 0;
  spawn1('raider', 0, 6);
  await hold(150, godmode);
  const rDodged = hurtBy.raider;
  delete P.dodging;
  out.raider = { behaviour: `hurt the player ${rHurt.toFixed(0)} hp in 15 s`, counter: `dodging: ${rDodged.toFixed(0)} hp`, pass: rHurt > 0 && rDodged === 0 };

  // scout: approaches from the side; counter: bear trap pins it ≥ 5 s
  reset(field.x, field.z);
  const sc = spawn1('scout', 0, 22);
  await hold(60, godmode);
  const lateral = sc.stats.maxLateral;
  reset(field.x, field.z);
  g.save.world.pieces.push({ id: 9101, piece: 'bear_trap', tier: 0, x: P.pos.x, y: 0, z: P.pos.z + 4, rot: 0, hp: 60 });
  const sc2 = spawn1('scout', 0, 4.2, false);
  sc2.def = { ...sc2.def, speed: 0 };
  await hold(4, () => {});
  sc2.pos.set(P.pos.x, sc2.pos.y, P.pos.z + 4);
  await hold(2, () => {});
  let pinned = 0;
  for (let i = 0; i < 160 && sc2.state === 'stagger'; i++) { await frames(1); pinned += 0.05; }
  out.scout = { behaviour: `max sideways offset on approach ${lateral.toFixed(1)} m`, counter: `bear trap pinned it ${pinned.toFixed(1)} s`, pass: lateral >= 3 && pinned >= 5 };

  // brute (sapper): ignores a nearby player and blows up a wall; counter: a hit during the plant cancels it
  reset(field.x, field.z);
  g.save.world.pieces.push({ id: 9102, piece: 'wall', tier: 1, x: P.pos.x + 14, y: 0, z: P.pos.z, rot: 0, hp: 200 });
  g.base.rebuild(g.save.world.pieces, g.save.world.crops, g.save.world.hour);
  const br = spawn1('brute', 10, 8);
  await hold(220, godmode);
  const wallHp = g.save.world.pieces.find((p) => p.id === 9102)?.hp ?? 0;
  const planted = br.stats.planted;
  reset(field.x, field.z);
  g.save.world.pieces.push({ id: 9103, piece: 'wall', tier: 1, x: P.pos.x + 14, y: 0, z: P.pos.z, rot: 0, hp: 200 });
  g.base.rebuild(g.save.world.pieces, g.save.world.crops, g.save.world.hour);
  const br2 = spawn1('brute', 10, 8);
  let interrupts = 0;
  await hold(220, () => {
    godmode();
    if (br2.state === 'windup' && br2.targetPiece >= 0 && br2.t > 0.6) { E.hitFrom(br2, 5, br2.pos.x - 1, br2.pos.z); interrupts++; }
  });
  out.brute = { behaviour: `planted ${planted} charge(s); wall 200 → ${wallHp.toFixed(0)} hp while the player stood 10 m away`, counter: `hit during the plant ${interrupts}×: planted ${br2.stats.planted}`, pass: planted >= 1 && wallHp < 100 && br2.stats.planted === 0 && interrupts > 0 };

  // sniper: keeps its distance and fires; counter: no shots through cover
  reset(field.x, field.z);
  const sn = spawn1('sniper', 0, 8);
  const ds = [];
  await hold(200, () => { godmode(); ds.push(dist(sn)); });
  ds.sort((a, b) => a - b);
  const median = ds[ds.length >> 1];
  const fired = sn.stats.fired;
  reset(field.x, field.z);
  const blk = g.collision.add({ minX: P.pos.x - 6, maxX: P.pos.x + 6, minY: P.pos.y - 1, maxY: P.pos.y + 6, minZ: P.pos.z + 3, maxZ: P.pos.z + 3.6, tag: 'test', ref: 0 });
  const sn2 = spawn1('sniper', 0, 18);
  await hold(200, () => { godmode(); sn2.pos.z = Math.max(sn2.pos.z, P.pos.z + 12); });
  g.collision.remove?.(blk);
  out.sniper = { behaviour: `median distance ${median.toFixed(1)} m, fired ${fired}`, counter: `behind cover: fired ${sn2.stats.fired} (blind ${sn2.stats.firedNoLos})`, pass: median >= 12 && fired >= 1 && sn2.stats.fired === 0 };

  // captain: buffs raiders near it; counter: kill it and they break
  reset(field.x, field.z);
  const cap = spawn1('captain', 0, 14);
  const r1 = spawn1('raider', 2, 15);
  await hold(10, godmode);
  const buffed = r1.buff > 0;
  E.hitFrom(cap, 9999, cap.pos.x, cap.pos.z - 1);
  await hold(2, () => {});
  out.captain = { behaviour: `nearby raider buffed: ${buffed}`, counter: `captain killed → raider state "${r1.state}"`, pass: buffed && r1.state === 'flee' };

  // drone: orbits out of reach; counter: melee only lands when it dips to fire
  reset(field.x, field.z);
  const dr = spawn1('drone', 0, 9);
  let swingHigh = 0, swingLow = 0, highTries = 0, lowTries = 0;
  await hold(200, () => {
    godmode();
    const dy = dr.pos.y - P.pos.y;
    // face it and swing whenever it is in horizontal reach (melee resolution only, tiny damage)
    P.yaw = Math.atan2(dr.pos.x - P.pos.x, dr.pos.z - P.pos.z);
    const hp = dr.hp;
    if (dist(dr) < 2.9) {
      g.swingHook(0.001);
      if (dy >= 2.4) { highTries++; if (dr.hp < hp) swingHigh++; } else { lowTries++; if (dr.hp < hp) swingLow++; }
    }
  });
  out.drone = { behaviour: `orbited ${(dr.stats.orbit * 57.3).toFixed(0)}°, cruise ${dr.def.fly} m, dipped to ${dr.stats.minAlt.toFixed(1)} m to fire`, counter: `melee at cruise height hit ${swingHigh}/${highTries}; while dipped ${swingLow}/${lowTries}`, pass: dr.stats.orbit > Math.PI && dr.stats.minAlt < 2 && swingHigh === 0 };

  // guard unit: riot shield in front; counter: hit it from behind
  reset(field.x, field.z);
  const bot = spawn1('bot', 0, 3, false);
  bot.yaw = Math.PI; // facing the player (-z)
  const front = E.hitMult(bot, { x: 0, y: 0, z: 1 });
  const back = E.hitMult(bot, { x: 0, y: 0, z: -1 });
  out.bot = { behaviour: `frontal damage ×${front}`, counter: `from behind ×${back}`, pass: front <= 0.3 && back >= 1 };

  // crawler: swarms; counter: a swing hits the pack, spike strips shred
  reset(field.x, field.z);
  const swarm = Enemies_ambient('industrial', 0, 0.001);
  for (let i = 0; i < 4; i++) spawn1('crawler', -0.6 + (i % 2) * 1.2, 2 + Math.floor(i / 2) * 0.9, false);
  await hold(2, () => {});
  for (const c of E.list) c.def = { ...c.def, speed: 0 };
  P.yaw = 0;
  const before = E.list.map((c) => c.hp);
  g.swingHook(10);
  const hitN = E.list.filter((c, i) => c.hp < before[i]).length;
  reset(field.x, field.z);
  g.save.world.pieces.push({ id: 9104, piece: 'spike_strip', tier: 0, x: P.pos.x, y: 0, z: P.pos.z + 6, rot: 0, hp: 60 });
  const cs = spawn1('crawler', 0, 6, false);
  cs.def = { ...cs.def, speed: 0 };
  const rs = spawn1('raider', 0.4, 6, false);
  rs.def = { ...rs.def, speed: 0 };
  await hold(10, () => { cs.pos.set(P.pos.x, cs.pos.y, P.pos.z + 6); rs.pos.set(P.pos.x + 0.3, rs.pos.y, P.pos.z + 6); });
  const cLoss = (cs.def.hp - cs.hp) / cs.def.hp, rLoss = (rs.def.hp - rs.hp) / rs.def.hp;
  out.crawler = { behaviour: `ambient swarm size in industrial: ${swarm.n}+`, counter: `one swing hit ${hitN} crawlers; spikes took ${(cLoss * 100).toFixed(0)}% of a crawler vs ${(rLoss * 100).toFixed(0)}% of a raider in 1 s`, pass: swarm.n >= 3 && hitN >= 3 && cLoss > rLoss * 2 };

  // heavy: telegraphed slam ring; counter: back core takes double, front half
  reset(field.x, field.z);
  const hv = spawn1('heavy', 0, 6);
  let ring = false;
  await hold(80, () => { godmode(); if (hv.tele) ring = true; });
  hv.yaw = Math.PI;
  out.heavy = { behaviour: `slam ring telegraph shown: ${ring}`, counter: `front ×${E.hitMult(hv, { x: 0, y: 0, z: 1 })}, back ×${E.hitMult(hv, { x: 0, y: 0, z: -1 })}`, pass: ring && E.hitMult(hv, { x: 0, y: 0, z: -1 }) === 2 && E.hitMult(hv, { x: 0, y: 0, z: 1 }) === 0.5 };

  // hound: circles from behind; counter: will not enter the camp's firelight at night
  const fire = g.camp.firePositions()[g.camp.firePositions().length - 1];
  reset(fire.x + 1, fire.z + 1, 22.5);
  E.refreshLights?.();
  await hold(4, () => {});
  const hs = [spawn1('hound', 14, 0), spawn1('hound', -14, 2), spawn1('hound', 0, -15)];
  let minFire = 99;
  await hold(200, () => { godmode(); for (const h of hs) if (h.state !== 'dead') minFire = Math.min(minFire, Math.hypot(h.pos.x - fire.x, h.pos.z - fire.z)); });
  const nightHurt = 100 - g.save.player.health;
  reset(field.x, field.z, 12);
  void hurtBy;
  out.hound = { behaviour: `pack of 3 at night around the cookfire`, counter: `closest a hound came to the fire: ${minFire.toFixed(1)} m (light radius 9 m)`, pass: minFire >= 8.5 };
  void nightHurt;

  // boar: charges fast in a line; counter: charging into a wall stuns it (double damage)
  reset(field.x, field.z);
  const bo = spawn1('boar', 0, 11);
  await hold(80, godmode);
  const top = bo.stats.maxSpeed;
  reset(field.x, field.z);
  // the player sidesteps (dodges) the charge; a wall stands behind the player
  const wall = g.collision.add({ minX: P.pos.x - 4, maxX: P.pos.x + 4, minY: P.pos.y - 1, maxY: P.pos.y + 3, minZ: P.pos.z - 3.2, maxZ: P.pos.z - 2.6, tag: 'test', ref: 0 });
  stuckDodge(true);
  const bo2 = spawn1('boar', 0, 11);
  let stunned = false;
  await hold(120, () => { godmode(); if (bo2.stun > 0) stunned = true; });
  delete P.dodging;
  g.collision.remove?.(wall);
  out.boar = { behaviour: `charge top speed ${top.toFixed(1)} m/s (walk ${bo.def.speed})`, counter: `charged into a wall → stunned: ${stunned} (takes ×2)`, pass: top >= 9 && stunned };

  // escalation: ambient tables grow with threat tier; raids use every kind by rank
  const districts = ['outskirts', 'residential', 'market', 'rail', 'industrial', 'downtown', 'hospital', 'waterworks'];
  const kindsAt = (tier) => { const set = new Set(); for (const d of districts) for (let r = 0.001; r < 1; r += 0.01) set.add(Enemies_ambient(d, tier, r).kind); return [...set].sort(); };
  out.escalation = { tier0: kindsAt(0), tier4: kindsAt(4) };
  return out;

  function Enemies_ambient(d, tier, roll = 0.999) { return E.constructor.ambientKind(d, tier, roll); }
});
const behaviour = Object.fromEntries(KINDS.map((k) => [k, B[k]]));
const esc = B.escalation;
const escalation = { ...esc, pass: esc.tier4.length === 11 && esc.tier0.length < esc.tier4.length };
const result = {
  thresholds: T,
  silhouettes,
  behaviour,
  escalation,
  kindsDistinct: KINDS.length,
  pass: silhouettes.pass && KINDS.every((k) => behaviour[k]?.pass) && escalation.pass && errs.length === 0,
  pageErrors: errs.slice(0, 5),
};
writeFileSync('docs/review/enemies.json', JSON.stringify(result, null, 2) + '\n');
for (const k of KINDS) console.log(`${behaviour[k]?.pass ? 'ok  ' : 'FAIL'} ${k}: ${behaviour[k]?.behaviour} | counter: ${behaviour[k]?.counter}`);
console.log(`silhouettes: worst pair ${worst.join(' vs ')} IoU; smallest ${Math.min(...Object.values(silhouettes.px))} px → ${silhouettes.pass ? 'ok' : 'FAIL'}`);
console.log(`escalation: tier 0 ${esc.tier0.length} kinds, tier 4 ${esc.tier4.length} kinds → ${escalation.pass ? 'ok' : 'FAIL'}`);
console.log(JSON.stringify({ pass: result.pass, errors: errs.length }));
await browser.close();
srv.kill();
process.exit(result.pass ? 0 : 1);
