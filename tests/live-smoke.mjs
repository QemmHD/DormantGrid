// Post-deploy smoke test against a live URL.
// Usage: node tests/live-smoke.mjs <baseUrl> [--offline]
//   - shell + manifest + every asset referenced by index.html/sw.js return 200
//   - service worker registers
//   - the game boots to the menu with zero console errors
//   - (online) username claim with a throwaway test name, whoami, cloud save PUT→GET round trip
//   - in-browser local save → reload → restore
import { chromium } from 'playwright';

const base = (process.argv[2] ?? '').replace(/\/$/, '');
const offline = process.argv.includes('--offline');
const noBrowser = process.argv.includes('--no-browser');
if (!base) {
  console.error('usage: node tests/live-smoke.mjs <baseUrl> [--offline]');
  process.exit(2);
}
let failed = 0;
const res = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) failed++;
};

async function get(path) {
  const r = await fetch(base + path, { redirect: 'follow' });
  return { status: r.status, text: await r.text(), type: r.headers.get('content-type') ?? '' };
}

// 1. shell, manifest, assets
const shell = await get('/');
res(shell.status === 200 && shell.text.includes('DORMANT'), `GET / → ${shell.status}`);
const man = await get('/manifest.webmanifest');
res(man.status === 200, `GET /manifest.webmanifest → ${man.status}`);
const sw = await get('/sw.js');
res(sw.status === 200, `GET /sw.js → ${sw.status}`);
const refs = new Set();
for (const m of shell.text.matchAll(/(?:src|href)="([^"]+)"/g)) refs.add(m[1]);
for (const m of sw.text.matchAll(/url:"([^"]+)"/g)) refs.add(m[1]);
const basePath = new URL(base + '/').pathname;
let bad = 0;
for (const r of refs) {
  if (/^https?:/.test(r)) continue;
  const path = r.startsWith('/') ? r.slice(basePath.length - 1) : '/' + r;
  const g = await fetch(base + path);
  if (g.status !== 200) {
    bad++;
    console.log(`     ${g.status} ${path}`);
  }
}
res(bad === 0, `${refs.size} referenced assets return 200 (${bad} failed)`);

// 2. API: claim + whoami + cloud save round trip
if (!offline) {
  const name = `dgtest_${Math.random().toString(36).slice(2, 9)}`;
  const claim = await fetch(base + '/api/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: name }) });
  const cj = await claim.json().catch(() => ({}));
  res(claim.status === 200 && cj.ok && typeof cj.token === 'string', `POST /api/claim (${name}) → ${claim.status}`);
  if (cj.ok) {
    const auth = { 'x-dg-user': name, authorization: `Bearer ${cj.token}` };
    const who = await fetch(base + '/api/whoami', { headers: auth });
    res(who.status === 200, `GET /api/whoami → ${who.status}`);
    const data = Buffer.from('smoke-test-save').toString('base64');
    const meta = { rev: 1, schema: 1, savedAt: Date.now(), playtime: 1, bytes: 15 };
    const put = await fetch(base + '/api/save', { method: 'PUT', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ baseRev: 0, meta, data }) });
    res(put.status === 200, `PUT /api/save → ${put.status}`);
    const back = await fetch(base + '/api/save', { headers: auth });
    const bj = await back.json().catch(() => ({}));
    res(back.status === 200 && bj.data === data && bj.meta?.rev === 1, `GET /api/save round trip → ${back.status}, data ${bj.data === data ? 'matches' : 'MISMATCH'}`);
    const dup = await fetch(base + '/api/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: name.toUpperCase() }) });
    res(dup.status === 409 || dup.status === 400, `duplicate claim (case-insensitive) rejected → ${dup.status}`);
  }
  const ver = await get('/api/version');
  res(ver.status === 200 && ver.text.includes('minClient'), `GET /api/version → ${ver.status}`);
}

// 3. browser: SW registers, boots, local save round trip
if (noBrowser) {
  console.log(failed ? `\n${failed} check(s) failed` : '\nlive smoke passed (http only)');
  process.exit(failed ? 1 : 0);
}
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
await page.goto(base + '/');
const swOk = await page
  .waitForFunction(async () => !!(await navigator.serviceWorker?.getRegistration()), null, { timeout: 30000 })
  .then(() => true)
  .catch(() => false);
res(swOk, 'service worker registered');
await page.goto(base + '/?autostart&fresh&quality=low');
const booted = await page.waitForFunction(() => window.__dg?.mode === 'play', null, { timeout: 45000 }).then(() => true).catch(() => false);
res(booted, 'game boots into the world');
if (booted) {
  const before = await page.evaluate(() => {
    const g = window.__dg;
    g.save.player.inventory[10] = { id: 'mat.scrap', n: 17 };
    g.persist('manual');
    return g.save.player.inventory.reduce((s, x) => s + (x ? x.n : 0), 0);
  });
  await page.waitForTimeout(1500);
  await page.goto(base + '/?autostart&quality=low');
  await page.waitForFunction(() => window.__dg?.mode === 'play', null, { timeout: 45000 });
  const after = await page.evaluate(() => window.__dg.save.player.inventory.reduce((s, x) => s + (x ? x.n : 0), 0));
  res(after === before, `local save survives reload (${before} → ${after} items)`);
}
res(errs.length === 0, `zero console errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nlive smoke passed');
process.exit(failed ? 1 : 0);
