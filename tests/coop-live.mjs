// Two-client co-op test against a live (or wrangler dev) URL.
// Usage: node tests/coop-live.mjs <baseUrl>
// A hosts a room, B joins by code; checks presence, interpolated movement,
// a shared world event (prop removal), pings, and reconnect after a drop.
import { chromium } from 'playwright';

const base = (process.argv[2] ?? '').replace(/\/$/, '');
if (!base) {
  console.error('usage: node tests/coop-live.mjs <baseUrl>');
  process.exit(2);
}
let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) failed++;
};
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];
async function client(tag) {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${tag}: ${e.message}`));
  await page.goto(`${base}/?autostart&fresh&quality=low`);
  await page.waitForFunction(() => window.__dg?.mode === 'play', null, { timeout: 60000 });
  const name = `dgco_${tag}_${Math.random().toString(36).slice(2, 7)}`;
  await page.evaluate((n) => window.__svc.account.claim(n), name);
  return { page, name };
}

try {
  const A = await client('a');
  const B = await client('b');
  check(true, `two clients claimed (${A.name}, ${B.name})`);
  const code = await A.page.evaluate(() => window.__svc.coop.hostRoom());
  check(/^[A-Z0-9]{4,8}$/.test(code), `A hosted room ${code}`);
  await B.page.evaluate((c) => window.__svc.coop.join(c), code);
  const both = await B.page
    .waitForFunction(() => window.__svc.coop.playerIds.length >= 2, null, { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  check(both, 'B sees both players in the room');
  const status = await B.page.evaluate(() => window.__svc.coop.status);
  check(status === 'online', `B net status: ${status}`);

  // A walks; B's interpolated view of A should move
  const aName = A.name;
  const s0 = await B.page.evaluate((id) => window.__svc.coop.sample(id), aName);
  await A.page.keyboard.down('KeyW');
  await A.page.waitForTimeout(3000);
  await A.page.keyboard.up('KeyW');
  await B.page.waitForTimeout(1500);
  const s1 = await B.page.evaluate((id) => window.__svc.coop.sample(id), aName);
  const moved = s0 && s1 ? Math.hypot(s1.x - s0.x, s1.z - s0.z) : 0;
  check(moved > 0.5, `B sees A move (${moved.toFixed(2)} m)`);

  // shared world event: A removes a prop, B applies it
  const pid = await A.page.evaluate(() => {
    const g = window.__dg;
    const ids = g.view.propsNear(g.player.pos.x, g.player.pos.z, 60, []);
    const id = ids.find((i) => !g.view.removedProps.has(i));
    g.view.destroyProp(id);
    g.onWorldAction({ type: 'propRemoved', id });
    return id;
  });
  const applied = await B.page
    .waitForFunction((id) => window.__dg.view.removedProps.has(id), pid, { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  check(applied, `prop ${pid} removed on A is removed on B`);

  // ping
  const pingP = B.page.evaluate(() => new Promise((res) => {
    const prev = window.__svc.coop.onPing;
    window.__svc.coop.onPing = (...a) => {
      prev?.(...a);
      res(a[1]);
    };
    setTimeout(() => res(null), 10000);
  }));
  await A.page.evaluate(() => window.__svc.coop.sendPing('loot', 600, 600));
  const kind = await pingP;
  check(kind === 'loot', `ping from A received on B (${kind})`);

  // drop + reconnect: close B's socket abruptly, expect automatic resume
  await B.page.evaluate(() => window.__svc.coop.ws?.close());
  const back = await B.page
    .waitForFunction(() => window.__svc.coop.status === 'online', null, { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  check(back, 'B reconnects after a dropped socket');
  await A.page.evaluate(() => window.__svc.coop.leave());
  await B.page.evaluate(() => window.__svc.coop.leave());
} catch (e) {
  check(false, `exception: ${e.message}`);
}
check(errs.length === 0, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nco-op live test passed');
process.exit(failed ? 1 : 0);
