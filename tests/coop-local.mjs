// Co-op on localhost against the REAL Worker + Durable Objects (wrangler dev, workerd).
// Not a live internet test: the sandbox blocks outbound WebSockets, but localhost works.
//   1. build the game into a temp dir, start `wrangler dev` serving it on 127.0.0.1
//   2. two headless clients: claim, host, join by code; presence, movement, shared world event
//   3. B's socket drops → B reconnects (resume) and A keeps seeing B
//   4. duplicate join: a third tab with B's credentials joins → the older socket is replaced
//      (close 4001), the room still has 2 players
//   5. old client: a hello with clientVersion 0.0.1 is refused (update_required, close 4006)
//   6. diagnostics overlay: state online, RTT, snapshot age, desyncs 0, "Copy co-op report"
// Usage: node tests/coop-local.mjs  → docs/review/coop-local.json
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const results = [];
const check = (ok, msg) => {
  results.push({ ok: !!ok, msg });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
};
const tmp = mkdtempSync(join(tmpdir(), 'dg-coop-'));
const dist = join(tmp, 'dist');
const b = spawnSync(process.execPath, ['../../node_modules/vite/bin/vite.js', 'build', '--outDir', dist, '--emptyOutDir'], { cwd: 'apps/game', stdio: 'pipe' });
check(b.status === 0, 'game built into a temp dir');
const port = 8800 + Math.floor(Math.random() * 90);
const wr = spawn('npx', ['wrangler', 'dev', '--port', String(port), '--ip', '127.0.0.1', '--assets', dist, '--persist-to', join(tmp, 'state')], { cwd: 'apps/server', stdio: 'pipe', detached: true });
let wlog = '';
wr.stdout.on('data', (d) => (wlog += d));
wr.stderr.on('data', (d) => (wlog += d));
const base = `http://127.0.0.1:${port}`;
let up = false;
for (let i = 0; i < 60 && !up; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  up = await fetch(`${base}/api/version`).then((r) => r.ok).catch(() => false);
}
check(up, `wrangler dev (workerd) answers on ${base}`);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];
async function client(tag, storage) {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 450 }, storageState: storage });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${tag}: ${e.message}`));
  await page.goto(`${base}/?autostart&fresh&quality=low`);
  await page.waitForFunction(() => window.__dg?.mode === 'play' && window.__svc, null, { timeout: 90000 });
  return { ctx, page };
}
const status = (p) => p.evaluate(() => window.__svc.coop.status);
try {
  const A = await client('a');
  const B = await client('b');
  const nameA = `dgl_a_${Math.random().toString(36).slice(2, 6)}`, nameB = `dgl_b_${Math.random().toString(36).slice(2, 6)}`;
  await A.page.evaluate((n) => window.__svc.account.claim(n), nameA);
  await B.page.evaluate((n) => window.__svc.account.claim(n), nameB);
  const code = await A.page.evaluate(() => window.__svc.coop.hostRoom());
  check(/^[A-Z0-9]{4,8}$/.test(code), `A hosted room ${code}`);
  await B.page.evaluate((c) => window.__svc.coop.join(c), code);
  const both = await B.page.waitForFunction((a) => window.__svc.coop.playerIds.includes(a), nameA, { timeout: 30000 }).then(() => true).catch(() => false);
  check(both, 'B joined by code and sees A');
  // movement reaches the other side
  const before = await B.page.evaluate((a) => window.__svc.coop.sample?.(a) ?? null, nameA);
  await A.page.keyboard.down('KeyW');
  await A.page.waitForTimeout(3000);
  await A.page.keyboard.up('KeyW');
  await B.page.waitForTimeout(1500);
  const after = await B.page.evaluate((a) => window.__svc.coop.sample?.(a) ?? null, nameA);
  check(!!before && !!after && Math.hypot(after.x - before.x, after.z - before.z) > 0.5, `B sees A move (${before && after ? Math.hypot(after.x - before.x, after.z - before.z).toFixed(1) : '?'} m)`);

  // 3. disconnect + reconnect
  await B.page.evaluate(() => window.__svc.coop.ws?.close());
  const dropped = await B.page.waitForFunction(() => window.__svc.coop.status !== 'online', null, { timeout: 4000, polling: 10 }).then(() => true).catch(() => false);
  const back = await B.page.waitForFunction(() => window.__svc.coop.status === 'online', null, { timeout: 30000 }).then(() => true).catch(() => false);
  const reconn = await B.page.evaluate(() => window.__svc.coop.diag.reconnects);
  // the resume can be quicker than one poll, so the reconnect counter (a second welcome) is the proof
  check(back && reconn >= 1, `B's socket closed and B reconnected by itself (reconnects ${reconn}; non-online state observed: ${dropped})`);
  const aSeesB = await A.page.waitForFunction((n) => window.__svc.coop.playerIds.includes(n) && !window.__svc.coop.reconnecting.has(n), nameB, { timeout: 20000 }).then(() => true).catch(() => false);
  check(aSeesB, 'A still sees B after the reconnect (not in grace)');

  // 3b. a silent drop (no close frame: phone switched networks): B stops hearing the server
  await B.page.evaluate(() => {
    const ws = window.__svc.coop.ws;
    ws.onmessage = null; // the link goes quiet
  });
  const staleBack = await B.page.waitForFunction(() => window.__svc.coop.diag.stale >= 1 && window.__svc.coop.status === 'online', null, { timeout: 45000 }).then(() => true).catch(() => false);
  check(staleBack, `silent drop detected (stale ${await B.page.evaluate(() => window.__svc.coop.diag.stale)}) and B resumed online`);

  // 4. duplicate join with B's credentials from a third tab
  const storage = await B.ctx.storageState({ indexedDB: true });
  const C = await client('c', storage);
  const credsMatch = await C.page.evaluate(() => window.__svc.api.creds?.user ?? null);
  check(credsMatch === nameB, `third tab carries B's account (${credsMatch})`);
  await C.page.evaluate((c) => window.__svc.coop.join(c), code);
  const cOn = await C.page.waitForFunction(() => window.__svc.coop.status === 'online', null, { timeout: 30000 }).then(() => true).catch(() => false);
  await B.page.waitForTimeout(2000);
  const bState = await status(B.page);
  const count = await A.page.evaluate(() => window.__svc.coop.playerIds.length);
  check(cOn && bState !== 'online', `duplicate join: new tab online (${cOn}), old tab replaced (status "${bState}")`);
  check(count === 1, `A sees one other player (B's account, now on the new tab), not two (${count})`);
  // the replacement tab's movement reaches A (its state numbering restarted at 1)
  const c0 = await A.page.evaluate((n) => window.__svc.coop.sample(n), nameB);
  await C.page.keyboard.down('KeyW');
  await C.page.waitForTimeout(7000); // three SwiftShader tabs share the CPU: give it time
  await C.page.keyboard.up('KeyW');
  await A.page.waitForTimeout(2000);
  const c1 = await A.page.evaluate((n) => window.__svc.coop.sample(n), nameB);
  const cm = c0 && c1 ? Math.hypot(c1.x - c0.x, c1.z - c0.z) : 0;
  check(cm > 0.5, `A sees the replacement tab move (${cm.toFixed(2)} m)`);
  // 5. old client refused (raw WebSocket hello with an old version and valid credentials)
  const creds = await A.page.evaluate(() => window.__svc.api.creds);
  const old = await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/room/${code}`);
    const out = { msgs: [], code: null };
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', user: creds.user, token: creds.token, clientVersion: '0.0.1' }));
    ws.onmessage = (e) => out.msgs.push(String(e.data));
    ws.onclose = (e) => {
      out.code = e.code;
      resolve(out);
    };
    setTimeout(() => resolve(out), 10000);
  });
  check(old.code === 4006 && old.msgs.some((m) => m.includes('update_required')), `old client (0.0.1) refused: close ${old.code}, ${old.msgs[0] ?? 'no message'}`);

  // 6. diagnostics overlay on A, while the other player is moving
  await A.page.evaluate(() => {
    window.__dg.settings.coopDiag = true;
  });
  await A.page.waitForSelector('[data-coop-diag][data-status="online"]', { timeout: 10000 });
  await C.page.keyboard.down('KeyW');
  await A.page.waitForTimeout(2500);
  const diag = await A.page.evaluate(() => ({
    text: document.querySelector('[data-coop-diag]').innerText,
    rtt: window.__svc.coop.rtt,
    age: window.__svc.coop.snapshotAge(),
    desyncs: window.__svc.coop.desyncs,
  }));
  await C.page.keyboard.up('KeyW');
  await C.ctx.close();
  await A.page.click('[data-coop-copy]');
  await A.page.waitForTimeout(500);
  const report = await A.page.evaluate(async () => {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return document.querySelector('.coop-report')?.textContent ?? '';
    }
  });
  let parsed = null;
  try {
    parsed = JSON.parse(report);
  } catch {
    parsed = null;
  }
  await A.page.screenshot({ path: 'docs/review/shots/coop-diag.png' });
  check(/online/.test(diag.text) && /2 players/.test(diag.text) && /Round trip \d+ ms/.test(diag.text) && /Snapshot age \d+ ms/.test(diag.text) && /Desyncs \d+/.test(diag.text), `overlay shows state, RTT, snapshot age, desyncs: "${diag.text.replace(/\n/g, ' | ')}"`);
  check(Number.isFinite(diag.age) && diag.age < 3000, `snapshots are fresh (${Math.round(diag.age)} ms old)`);
  check(diag.desyncs === 0, `no desyncs in this session (${diag.desyncs})`);
  check(parsed?.status === 'online' && parsed?.room === code, `"Copy co-op report" gives JSON (status ${parsed?.status}, room ${parsed?.room}, rtt ${parsed?.rttMs} ms)`);
  check(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await A.ctx.close();
  await B.ctx.close();
} catch (e) {
  check(false, `exception: ${e.message}`);
} finally {
  await browser.close();
  try {
    process.kill(-wr.pid);
  } catch {
    wr.kill();
  }
  rmSync(tmp, { recursive: true, force: true });
}
const pass = results.every((r) => r.ok);
writeFileSync('docs/review/coop-local.json', JSON.stringify({ base: 'localhost (wrangler dev / workerd)', results, pass }, null, 2) + '\n');
if (!pass) console.log(wlog.split('\n').slice(-15).join('\n'));
console.log(pass ? 'co-op local test passed' : 'co-op local test FAILED');
process.exit(pass ? 0 : 1);
