// Feel test: real touch events via CDP on an emulated iPhone (landscape) plus
// keyboard/mouse on desktop. Checks stick movement + response curve, smoothed
// look, tap dead zone (no accidental camera nudge), pinch zoom, frames from
// input to camera response, and accel/decel (no sliding).
// Usage: node tests/feel.mjs [baseUrl]
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';

let base = process.argv[2];
let srv = null;
if (!base) {
  const port = 5900 + Math.floor(Math.random() * 90);
  srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
  base = `http://localhost:${port}`;
  await new Promise((r) => setTimeout(r, 2500));
}
let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) failed++;
};
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

// ---------- touch (iPhone landscape) ----------
{
  const dev = devices['iPhone 14 Pro landscape'];
  const ctx = await browser.newContext({ ...dev, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${base}/?autostart&fresh&quality=low`);
  await page.waitForFunction(() => window.__dg?.mode === 'play', null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  const cdp = await ctx.newCDPSession(page);
  const W = dev.viewport.width, H = dev.viewport.height;
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: p[2] ?? i })) });
  const st = () => page.evaluate(() => ({ yaw: window.__dg.camera.yaw, pitch: window.__dg.camera.pitch, x: window.__dg.player.pos.x, z: window.__dg.player.pos.z, dist: window.__dg.camera.distance, vy: window.__dg.player.vel.y, grounded: window.__dg.player.grounded }));

  // tap on the look side must not move the camera (dead zone) or jump
  const a = await st();
  await touch('touchStart', [[W * 0.62, H * 0.45]]);
  await touch('touchMove', [[W * 0.62 + 3, H * 0.45 + 1]]);
  await touch('touchEnd', []);
  await page.waitForTimeout(400);
  const b = await st();
  check(Math.abs(b.yaw - a.yaw) < 1e-3 && Math.abs(b.pitch - a.pitch) < 1e-3, `tap/micro-drag on look side does not nudge camera (Δyaw ${(b.yaw - a.yaw).toFixed(4)})`);
  check(b.grounded, 'tap on look side does not jump');

  // look drag: smooth, proportional
  await touch('touchStart', [[W * 0.6, H * 0.5]]);
  for (let i = 1; i <= 10; i++) await touch('touchMove', [[W * 0.6 + i * 8, H * 0.5]]);
  // latency: frames until yaw responds to one more move
  const lat = await page.evaluate(async () => {
    const g = window.__dg;
    const y0 = g.camera.yaw;
    const t0 = performance.now();
    window.__latProbe = { y0, t0 };
    return { y0, t0 };
  });
  await touch('touchMove', [[W * 0.6 + 120, H * 0.5]]);
  const resp = await page.evaluate(
    (lat) =>
      new Promise((res) => {
        let frames = 0;
        const tick = () => {
          frames++;
          if (Math.abs(window.__dg.camera.yaw - lat.y0) > 1e-4 || frames > 30) res({ frames, ms: performance.now() - lat.t0 });
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    lat,
  );
  await touch('touchEnd', []);
  await page.waitForTimeout(500);
  const c = await st();
  check(c.yaw < b.yaw - 0.15, `right-side drag turns the camera (Δyaw ${(c.yaw - b.yaw).toFixed(2)} rad for 120 px)`);
  check(resp.frames <= 2, `camera responds within ${resp.frames} frame(s) of a touch move (≈${(resp.frames * 16.7).toFixed(0)} ms at 60 fps)`);

  // left stick: walk forward
  const p0 = await st();
  await touch('touchStart', [[W * 0.18, H * 0.7]]);
  for (let i = 1; i <= 6; i++) await touch('touchMove', [[W * 0.18, H * 0.7 - i * 12]]);
  await page.waitForTimeout(2500);
  const p1 = await st();
  await touch('touchEnd', []);
  const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  check(moved > 1.0, `left-thumb stick moves the player (${moved.toFixed(1)} m)`);
  // decel: after release the player stops quickly (no sliding)
  await page.waitForTimeout(300);
  const p2 = await st();
  await page.waitForTimeout(700);
  const p3 = await st();
  check(Math.hypot(p3.x - p2.x, p3.z - p2.z) < 0.15, `stops after release (drift ${Math.hypot(p3.x - p2.x, p3.z - p2.z).toFixed(2)} m)`);

  // pinch zoom on the look side
  const d0 = (await st()).dist;
  await touch('touchStart', [[W * 0.6, H * 0.3, 1]]);
  await touch('touchStart', [[W * 0.6, H * 0.3, 1], [W * 0.75, H * 0.3, 2]]);
  for (let i = 1; i <= 8; i++) await touch('touchMove', [[W * 0.6 - i * 6, H * 0.3, 1], [W * 0.75 + i * 6, H * 0.3, 2]]);
  await touch('touchEnd', []);
  await page.waitForTimeout(300);
  const d1 = (await st()).dist;
  check(d1 < d0 - 0.2, `pinch out zooms in (${d0.toFixed(2)} → ${d1.toFixed(2)} m)`);

  // primary button exists, is labelled and is thumb-sized
  const btn = await page.evaluate(() => {
    const el = document.querySelector('.act.interact');
    const r = el.getBoundingClientRect();
    return { w: r.width, label: el.querySelector('.act-lbl')?.textContent ?? '' };
  });
  check(btn.w >= 88 && btn.label.length > 0, `primary action button is ${btn.w.toFixed(0)} px and labelled "${btn.label}"`);
  const small = await page.evaluate(() => [...document.querySelectorAll('.act, .icon-btn, .slot')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && Math.min(r.width, r.height) < 40).length);
  check(small === 0, `no touch control smaller than 40 px (${small} found)`);
  check(errs.length === 0, `touch: no page errors ${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// ---------- desktop keyboard + mouse ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/?autostart&fresh&quality=low`);
  await page.waitForFunction(() => window.__dg?.mode === 'play', null, { timeout: 60000 });
  await page.waitForTimeout(800);
  const pos = () => page.evaluate(() => ({ x: window.__dg.player.pos.x, z: window.__dg.player.pos.z, sp: Math.hypot(window.__dg.player.vel.x, window.__dg.player.vel.z) }));
  const a = await pos();
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  const walk = await pos();
  await page.keyboard.down('ShiftLeft');
  // peak speed while sprinting (the path may end at an obstacle)
  const run = { sp: 0 };
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(200);
    run.sp = Math.max(run.sp, (await pos()).sp);
  }
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyW');
  check(Math.hypot(walk.x - a.x, walk.z - a.z) > 1, 'W walks');
  check(run.sp > walk.sp + 1, `Shift sprints (${walk.sp.toFixed(1)} → ${run.sp.toFixed(1)} m/s)`);
  await page.waitForTimeout(600);
  const stop = await pos();
  check(stop.sp < 0.3, `decelerates to a stop (${stop.sp.toFixed(2)} m/s)`);
  // wheel zoom
  const z0 = await page.evaluate(() => window.__dg.camera.distance);
  await page.mouse.move(640, 360);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(200);
  const z1 = await page.evaluate(() => window.__dg.camera.distance);
  check(z1 > z0, `mouse wheel zooms out (${z0.toFixed(2)} → ${z1.toFixed(2)})`);
  await ctx.close();
}
await browser.close();
srv?.kill();
console.log(failed ? `\n${failed} check(s) failed` : '\nfeel test passed');
process.exit(failed ? 1 : 0);
