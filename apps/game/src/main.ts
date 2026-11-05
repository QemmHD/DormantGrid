import '@fontsource/chakra-petch/latin-600.css';
import '@fontsource/chakra-petch/latin-700.css';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import './ui/theme.css';
// Entry point: boot sequence, iOS Safari hardening, then hand off to Game.
import { errors } from './core/errors';
import { LOADING_TIPS } from './content/tips';

errors.install();

// iOS Safari hardening: block pinch-zoom, double-tap zoom, rubber-banding.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now();
    if (now - lastTouchEnd < 300 && (e.target as HTMLElement)?.tagName !== 'INPUT') e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false },
);
if ('ontouchstart' in window || navigator.maxTouchPoints > 0 || location.search.includes('touch=1')) document.documentElement.classList.add('touch');

const fill = document.getElementById('boot-fill') as HTMLElement;
const tip = document.getElementById('boot-tip') as HTMLElement;
let tipIdx = Math.floor(Math.random() * LOADING_TIPS.length);
const showTip = () => {
  const t = LOADING_TIPS[tipIdx % LOADING_TIPS.length];
  tip.textContent = typeof t === 'string' ? t : String((t as { text?: string }).text ?? '');
  tipIdx++;
};
showTip();
const tipTimer = window.setInterval(showTip, 4500);

export function bootProgress(p: number, label?: string): void {
  fill.style.width = `${Math.round(Math.min(1, p) * 100)}%`;
  if (label) tip.dataset.label = label;
}

export function bootDone(): void {
  window.clearInterval(tipTimer);
  const el = document.getElementById('boot')!;
  el.classList.add('hide');
  setTimeout(() => el.remove(), 800);
}

async function start() {
  bootProgress(0.1);
  if (new URLSearchParams(location.search).has('spike')) {
    const { runSpike } = await import('./spike');
    bootProgress(0.6);
    await runSpike();
    bootDone();
    return;
  }
  if (new URLSearchParams(location.search).get('ui') === 'harness') {
    const { runHarness } = await import('./ui/harness');
    await runHarness();
    bootDone();
    return;
  }
  const [{ Game }, { UI }, { Services }, { mountNetUI }, { Town, jobLabel }] = await Promise.all([
    import('./game/game'),
    import('./ui/ui'),
    import('./net/services'),
    import('./net/ui'),
    import('./game/town'),
  ]);
  const { Enemies } = await import('./game/enemies');
  const { Grid } = await import('./game/grid');
  const { CoopView } = await import('./game/coopview');
  const { Trader } = await import('./game/trader');
  const { Raids } = await import('./game/raids');
  const { Markers } = await import('./game/markers');
  const { Guide } = await import('./game/guide');
  bootProgress(0.3);
  const game = new Game();
  (window as unknown as { __dg: unknown }).__dg = game;
  await game.boot((p) => bootProgress(0.3 + p * 0.6));
  const svc = new Services(game.bus);
  (window as unknown as { __svc: unknown }).__svc = svc;
  // co-op diagnostics overlay (Settings → Co-op diagnostics)
  const { CoopDiag } = await import('./ui/coopdiag');
  const coopDiag = new CoopDiag(svc.coop, () => game.settings, (text) => game.toast(text, 'info'));
  game.tickers.push((dt) => coopDiag.update(dt));
  const town = new Town(game);
  const enemies = new Enemies(game);
  const grid = new Grid(game, enemies);
  (window as unknown as { __grid: unknown; __enemies: unknown }).__grid = grid;
  game.resetHooks.push(() => {
    town.reset();
    enemies.clear();
    grid.reset();
  });
  game.onRemoteNode = (node, district) => grid.remoteOnline(node, district);
  (window as unknown as { __enemies: unknown }).__enemies = enemies;
  (window as unknown as { __town: unknown }).__town = town;
  // Tier B audio: recorded files by stable ID replace synthesized sounds when shipped; never blocks boot.
  void (async () => {
    const { audio: eng } = await import('./audio/audio');
    const n = await eng.files.load(import.meta.env.BASE_URL);
    (window as unknown as { __audio: unknown }).__audio = eng;
    if (n) console.info(`[audio] ${n} recorded files available`);
  })();
  // Tier B models (GLB) replace procedural meshes when present; never blocks boot.
  void (async () => {
    const [{ loadModelOverrides }, { overridePropShape }, { setEnemyModel }] = await Promise.all([
      import('./assets/models'),
      import('./render/props'),
      import('./game/enemies'),
    ]);
    const report = await loadModelOverrides(import.meta.env.BASE_URL, {
      prop: (kind, geo, mat) => {
        overridePropShape(kind, geo, mat);
        game.view.applyPropShape(kind);
      },
      enemy: (kind, geo, mat) => setEnemyModel(kind as Parameters<typeof setEnemyModel>[0], geo, mat),
    });
    (window as unknown as { __models: unknown }).__models = report;
    if (report.loaded.length || report.failed.length) {
      console.info(`[models] loaded ${report.loaded.length}, fell back ${report.failed.length}`, report.failed);
    }
  })();
  const ui = new UI(game);
  game.screenProbe = () => ui.openScreen;
  ui.setJobAssign((id, job) => town.assign(id, job));
  ui.setQuitHandler(() => {
    game.quitToMenu();
    svc.safeMoment();
    ui.showMenu({ hasSave: true, username: svc.account.username ?? null });
  });
  ui.setRespawnHandler(() => game.respawn());
  ui.setDeviceReport(() => game.perf.report());
  ui.setMinimap((ctx, w, h) => drawMinimap(game, ctx, w, h, 0.9));
  ui.setMapDraw((ctx, w, h) => drawMap(game, ctx, w, h));
  ui.setJournalSource(() => journal(game));
  new CoopView(game, svc.coop);
  const trader = new Trader(game);
  traderRef = () => ({ x: trader.pos.x, z: trader.pos.z, call: !!game.save.world.flags['trader:mentioned'] && !game.save.world.flags['trader:met'] });
  (window as unknown as { __trader: unknown }).__trader = trader;
  new Markers(game);
  const guide = new Guide(game, ui);
  (window as unknown as { __guide: unknown }).__guide = guide;
  town.onTalk = (s) => {
    const wrap = document.createElement('div');
    const traits = s.traits.join(' · ');
    const info = document.createElement('p');
    info.textContent = `${traits}. Mood ${Math.round(s.mood)}%, fed ${Math.round(s.hunger)}%${s.injured ? ', injured' : ''}. Right now: ${jobLabel(s.job)}.`;
    const ask = document.createElement('p');
    ask.textContent = 'What should they work on?';
    const grid = document.createElement('div');
    grid.className = 'tabs';
    const jobs: [string, string][] = [['auto', 'Their choice'], ['farm', 'Farm'], ['gather', 'Gather'], ['build', 'Build'], ['cook', 'Cook'], ['guard', 'Guard'], ['scavenge', 'Scavenge'], ['heal', 'Heal']];
    for (const [id, label] of jobs) {
      const b = document.createElement('button');
      b.className = `tab${s.job === id ? ' on' : ''}`;
      b.textContent = label;
      b.addEventListener('click', () => {
        town.assign(s.id, id);
        game.save.world.flags['ledgerOpened'] = true;
        ui.closeDialog();
        game.input.uiBlocking = !!ui.openScreen;
      });
      grid.append(b);
    }
    wrap.append(info, ask, grid);
    const close = document.createElement('button');
    close.className = 'btn';
    close.textContent = 'Later';
    close.addEventListener('click', () => {
      ui.closeDialog();
      game.input.uiBlocking = !!ui.openScreen;
    });
    game.input.uiBlocking = true;
    game.input.releaseAll();
    ui.dialog(s.name, wrap, [close]);
  };
  game.tickers.push(() => {
    if (ui.openScreen === 'ledger' && game.save) game.save.world.flags['ledgerOpened'] = true;
  });
  const raids = new Raids(game, enemies);
  (window as unknown as { __raids: unknown }).__raids = raids;
  guide.raidSource = () => raids.status();
  guide.recoverySource = () => raids.recovery();
  raidRef = () => raids.status();
  const { Restoration } = await import('./game/restoration');
  const restoration = new Restoration(game);
  game.restorationAt = (x, z) => restoration.stateAt(x, z);
  grid.onOnline = (x, y, z) => restoration.beat(x, y, z);
  (window as unknown as { __restore: unknown }).__restore = restoration;
  const { Power } = await import('./game/power');
  (window as unknown as { __power: unknown }).__power = new Power(game, enemies);
  const { Story } = await import('./game/story');
  const story = new Story(game, ui);
  ui.storySource = () => story.info();
  // a raid warning or a recovery objective outranks the story step: lead the player home
  const THREE = await import('three');
  const { S } = await import('./ui/strings');
  const { isNight } = await import('@dg/sim');
  const { HAVEN_SAFE_R } = await import('./game/enemies');
  const havenTarget = (label: string) => {
    const sp = game.layout.spawn;
    return { pos: new THREE.Vector3(sp.x, game.view.surface(sp.x, sp.z) + 1.5, sp.z), label, kind: 'haven' };
  };
  const { FarmGuide } = await import('./game/farmguide');
  const farm = new FarmGuide(game, ui);
  game.farmHooks = farm;
  guide.cropSource = () => farm.status();
  (window as unknown as { __farm: unknown }).__farm = farm;
  game.onDeathRecap = (r) => {
    const kind = r.cause.startsWith('bleed:') ? r.cause.slice(6) : r.cause;
    const foe = S.enemy[kind];
    const cause = r.cause.startsWith('bleed:') && foe ? S.death.bledAfter(foe.name) : foe ? S.death.killedBy(foe.name) : (S.death.causes[r.cause] ?? S.causeUnknown);
    const night = isNight(game.save.world.hour);
    const tip = foe && night && r.fromHaven > 100 ? S.death.tips.night : r.cause.startsWith('bleed:') ? S.death.tips.bleed : foe ? foe.counter : (S.death.tips[r.cause] ?? S.death.tips.exposure);
    ui.showDeathRecap({ cause, where: S.death.where(r.district, r.fromHaven), tip, kept: S.death.kept(r.kept), dropped: r.dropped ? S.death.satchel(r.dropped) : S.death.nothingLost });
  };
  // the satchel dropped on death, while any of it is still on the ground
  const satchelTarget = () => {
    const f = game.save.world.flags['satchel'];
    if (typeof f !== 'string') return null;
    const [x, z] = f.split(',').map(Number);
    if (!game.save.world.drops.some((d) => Math.hypot(d.x - x, d.z - z) < 2.5 && d.items.length)) {
      delete game.save.world.flags['satchel'];
      return null;
    }
    return { pos: new THREE.Vector3(x, game.view.surface(x, z) + 1, z), label: S.death.satchelTarget, kind: 'satchel' };
  };
  // one-time note the first time the player walks back into the Haven safe zone
  let wasOut = false;
  game.tickers.push(() => {
    if (game.mode !== 'play' || !game.save) return;
    const d = Math.hypot(game.player.pos.x - game.layout.spawn.x, game.player.pos.z - game.layout.spawn.z);
    if (d > HAVEN_SAFE_R + 20) wasOut = true;
    else if (wasOut && d < HAVEN_SAFE_R && !game.save.world.flags['tip:safeZone']) {
      game.save.world.flags['tip:safeZone'] = true;
      game.toast(S.death.safeZone, 'warm');
    }
  });
  const objective = () => {
    const r = raids.status();
    if (r && r.phase === 'warning' && Math.hypot(game.player.pos.x - game.layout.spawn.x, game.player.pos.z - game.layout.spawn.z) > 40) return havenTarget(S.raid.targetHaven);
    if (raids.recovery()) return havenTarget(S.raid.recoverTarget);
    return satchelTarget() ?? farm.ripeTarget() ?? story.target();
  };
  guide.objectiveSource = objective;
  objectiveRef = objective;
  const { rankOf } = await import('./game/town');
  // review tools read sim data tables (salvage yields, recipes) through this
  (window as unknown as { __sim: unknown }).__sim = await import('@dg/sim');
  const { rankProgress, nextUnlocks } = await import('@dg/sim');
  ui.rankSource = () => {
    const r = rankOf(game.save.world);
    return { rank: r.rank, ...rankProgress(r.rank, r.points), next: nextUnlocks(r.rank, 3) };
  };
  ui.decideHandler = (key) => story.decide(key);
  (window as unknown as { __story: unknown }).__story = story;
  let lastPts = -1;
  const syncPerks = () => {
    const n = game.save?.player.perkPoints ?? 0;
    if (n !== lastPts) {
      lastPts = n;
      ui.setPerkBadge(n);
    }
  };
  game.onPerkPoint = syncPerks;
  game.tickers.push(syncPerks);
  const { Opening } = await import('./game/opening');
  (window as unknown as { __opening: unknown }).__opening = new Opening(game, enemies);
  trader.onLore = (title, header, body) => {
    const wrap = document.createElement('div');
    const hd = document.createElement('div');
    hd.className = 'code';
    hd.style.fontSize = '12px';
    hd.style.textAlign = 'left';
    hd.textContent = header;
    const p = document.createElement('p');
    p.style.whiteSpace = 'pre-wrap';
    p.textContent = body;
    wrap.append(hd, p);
    const close = document.createElement('button');
    close.className = 'btn primary';
    close.textContent = 'Close';
    close.addEventListener('click', () => {
      ui.closeDialog();
      game.input.uiBlocking = !!ui.openScreen;
    });
    game.input.uiBlocking = true;
    game.input.releaseAll();
    ui.dialog(title, wrap, [close]);
  };
  trader.onOpen = () => openTrade();
  const openTrade = () => {
    const wrap = document.createElement('div');
    wrap.style.maxHeight = '52vh';
    wrap.style.overflow = 'auto';
    const head = document.createElement('p');
    head.textContent = `Guild chits: ${trader.chits()}  ·  Reputation: ${Math.round(trader.rep)}`;
    wrap.append(head);
    if (!game.save.world.flags['trader:gift']) {
      // round 6: a small free trade on the first visit
      const box = document.createElement('div');
      box.className = 'li welcome-trade';
      box.setAttribute('data-welcome-trade', '');
      const main = document.createElement('div');
      main.className = 'main';
      const b = document.createElement('b');
      b.textContent = S.trader.giftTitle;
      const sm = document.createElement('small');
      sm.textContent = S.trader.giftText;
      main.append(b, sm);
      const take = document.createElement('button');
      take.className = 'btn small primary';
      take.textContent = S.trader.giftBtn;
      take.addEventListener('click', () => {
        if (trader.welcomeGift()) openTrade();
      });
      box.append(main, take);
      wrap.append(box);
    }
    const ct = trader.contract();
    if (ct?.item && ct.count) {
      const box = document.createElement('div');
      box.className = 'li';
      const main = document.createElement('div');
      main.className = 'main';
      main.innerHTML = '<b></b><small></small>';
      (main.firstChild as HTMLElement).textContent = `Contract: ${ct.title}`;
      (main.lastChild as HTMLElement).textContent = `Bring ${ct.count}× ${trader.itemName(ct.item)} → ${ct.rewardChits} chits`;
      const b = document.createElement('button');
      b.className = 'btn small primary';
      b.textContent = 'Deliver';
      b.addEventListener('click', () => {
        if (trader.deliverContract()) openTrade();
      });
      box.append(main, b);
      wrap.append(box);
    }
    const list = document.createElement('div');
    list.className = 'list';
    for (const kind of ['buy', 'sell'] as const) {
      const rows = trader.rows().filter((r) => r.kind === kind);
      const h3 = document.createElement('h3');
      h3.textContent = kind === 'buy' ? 'Odile sells' : 'Odile buys';
      h3.style.margin = '10px 0 4px';
      list.append(h3);
      if (!rows.length) {
        const e = document.createElement('small');
        e.textContent = kind === 'buy' ? 'Nothing on offer at your reputation.' : 'Nothing she wants. Salvage more.';
        list.append(e);
      }
      for (const r of rows) {
        const li = document.createElement('div');
        li.className = 'li';
        const main = document.createElement('div');
        main.className = 'main';
        main.innerHTML = `<b></b><small></small>`;
        (main.firstChild as HTMLElement).textContent = r.name;
        (main.lastChild as HTMLElement).textContent = `${r.price} chits each · you have ${r.have}`;
        const b1 = document.createElement('button');
        b1.className = 'btn small';
        b1.textContent = kind === 'buy' ? 'Buy 1' : 'Sell 1';
        b1.addEventListener('click', () => {
          if (trader.trade(r, 1)) openTrade();
        });
        li.append(main, b1);
        if (kind === 'sell' && r.have > 1) {
          const b2 = document.createElement('button');
          b2.className = 'btn small';
          b2.textContent = 'Sell all';
          b2.addEventListener('click', () => {
            if (trader.trade(r, r.have)) openTrade();
          });
          li.append(b2);
        }
        list.append(li);
      }
    }
    wrap.append(list);
    const close = document.createElement('button');
    close.className = 'btn primary';
    close.textContent = 'Done';
    close.addEventListener('click', () => {
      ui.closeDialog();
      game.input.uiBlocking = !!ui.openScreen;
    });
    game.input.uiBlocking = true;
    game.input.releaseAll();
    ui.dialog('Meridian Guild — Odile', wrap, [close]);
  };
  mountNetUI(game.bus, svc, { getSaveJSON: () => game.exportSave(), playerPos: () => ({ x: game.player.pos.x, z: game.player.pos.z }) });
  let hasSave = false;
  game.hasSaveHook = () => hasSave;
  const REASONS: Record<string, string> = { auto: 'autosave', build: 'build', dismantle: 'build', sleep: 'sleep', death: 'death', quit: 'quit', hidden: 'hidden', pagehide: 'hidden', new: 'manual', import: 'manual', craft: 'autosave' };
  game.persistHook = (s, reason) => {
    if (reason === 'export') return;
    hasSave = true;
    void svc.saveLocal(s, (REASONS[reason] ?? 'autosave') as Parameters<typeof svc.saveLocal>[1]);
  };
  svc.sync.onLoadSave = (s) => {
    game.loadSave(s);
    town.reset();
    enemies.clear();
    grid.reset();
    hasSave = true;
  };
  svc.attachLifecycle(() => (game.mode === 'menu' ? null : game.save));
  const res = await svc.boot().catch((e) => {
    console.warn('services boot failed', e);
    return { username: null, local: null, offlineOnly: true };
  });
  if (res.local) {
    hasSave = true;
    game.loadSave(res.local);
    grid.refresh();
  }
  // per-frame UI update
  game.tickers.push((dt) => {
    ui.update(dt);
    if (game.mode !== 'menu') {
      const c = game.clock();
      ui.setClock(c.time, c.sub);
      ui.setInteractReady(game.interactReady);
    }
  });
  const origNew = game.newGame.bind(game);
  game.newGame = async () => {
    town.reset();
    enemies.clear();
    await origNew();
    grid.reset();
    town.seed();
    hasSave = true;
    ui.hideMenu();
    if (!new URLSearchParams(location.search).has('autostart')) {
      // ask for a name once the player has done something worth saving (crafted a tool) or after 4 minutes
      const wait = () => (game.mode !== 'play' || (game.onbStep < 6 && game.playtime + game.save.playtime < 240) ? setTimeout(wait, 1500) : void svc.ensureAccount());
      setTimeout(wait, 1500);
    }
  };
  const origCont = game.continueGame.bind(game);
  game.continueGame = async () => {
    await origCont();
    if (!game.save.world.survivors.length) town.seed();
    ui.hideMenu();
    if (!new URLSearchParams(location.search).has('autostart')) void svc.ensureAccount();
  };
  bootProgress(1);
  bootDone();
  const params = new URLSearchParams(location.search);
  if (params.has('autostart')) {
    await (hasSave && !params.has('fresh') ? game.continueGame() : game.newGame());
    if (params.has('h')) game.save.world.hour = Number(params.get('h'));
    if (params.has('x') && params.has('z')) {
      const x = Number(params.get('x')), z = Number(params.get('z'));
      game.player.pos.set(x, game.view.surface(x, z), z);
      game.view.loadAround(x, z);
    }
    if (params.has('yaw')) game.camera.yaw = Number(params.get('yaw'));
  } else {
    ui.showMenu({ hasSave, username: res.username });
    svc.safeMoment();
  }
}

import type { Game as GameT } from './game/game';
import { PALETTES } from './content/palette';

let mapImg: HTMLCanvasElement | null = null;
function baseMap(game: GameT): HTMLCanvasElement {
  if (mapImg) return mapImg;
  const L = game.layout;
  const c = document.createElement('canvas');
  const N = 304;
  c.width = N;
  c.height = N;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const t = L.tiles[i];
    const d = L.districts[L.districtMap[i]];
    const pal = PALETTES[d?.key ?? 'downtown'];
    let col = pal.ground;
    if (t === 1 || t === 10) col = 0x3a3c40;
    else if (t === 2) col = 0x6a6a66;
    else if (t === 6) col = 0x2a4a5a;
    else if (t === 7) col = 0x5a4a3a;
    else if (t === 9) col = 0x3a4a34;
    else if (t === 5) col = 0x6e6a44;
    img.data[i * 4] = (col >> 16) & 255;
    img.data[i * 4 + 1] = (col >> 8) & 255;
    img.data[i * 4 + 2] = col & 255;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = '#8a8478';
  for (const b of L.buildings) {
    const odd = b.rot % 2 === 1;
    const w = (odd ? b.d : b.w) / 4, h = (odd ? b.w : b.d) / 4;
    ctx.fillRect(b.x / 4 - w / 2, b.z / 4 - h / 2, w, h);
  }
  mapImg = c;
  return c;
}

function drawMinimap(game: GameT, ctx: CanvasRenderingContext2D, w: number, h: number, zoom: number): void {
  const img = baseMap(game);
  const px = game.player.pos.x / 4, pz = game.player.pos.z / 4;
  const span = 40 / zoom;
  ctx.fillStyle = '#0b0e11';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(Math.PI - game.camera.yaw);
  ctx.drawImage(img, px - span, pz - span, span * 2, span * 2, -w / 2, -h / 2, w, h);
  ctx.restore();
  drawNodes(game, ctx, w, h, px, pz, span, Math.PI - game.camera.yaw);
  if (game.pk('tracker') > 0) drawWildlife(game, ctx, w, h, px, pz, span, Math.PI - game.camera.yaw);
  drawObjective(game, ctx, w, h, px, pz, span, Math.PI - game.camera.yaw);
  drawRaid(game, ctx, w, h, Math.PI - game.camera.yaw);
  drawTrader(game, ctx, w, h, px, pz, span, Math.PI - game.camera.yaw);
  ctx.fillStyle = '#e8a65a';
  ctx.beginPath();
  ctx.moveTo(w / 2, h / 2 - 7);
  ctx.lineTo(w / 2 + 5, h / 2 + 5);
  ctx.lineTo(w / 2 - 5, h / 2 + 5);
  ctx.closePath();
  ctx.fill();
}

/** current objective (set once Story exists) */
let objectiveRef: (() => { pos: { x: number; z: number }; label: string } | null) | null = null;

/** Odile's stall (set once the Trader exists); `call` = mentioned but not yet visited */
let traderRef: (() => { x: number; z: number; call: boolean }) | null = null;

/** trader: a gold coin on the minimap (edge-pinned and pulsing until the first visit) */
function drawTrader(game: GameT, ctx: CanvasRenderingContext2D, w: number, h: number, px: number, pz: number, span: number, rot: number): void {
  const t = traderRef?.();
  if (!t || !game.save) {
    game.traderOnMap = null;
    return;
  }
  const k = w / (span * 2);
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const dx = t.x / 4 - px, dz = t.z / 4 - pz;
  let rx = dx * cs - dz * sn, rz = dx * sn + dz * cs;
  const edge = Math.max(Math.abs(rx), Math.abs(rz)) / (span * 0.88);
  if (edge > 1 && !t.call) {
    game.traderOnMap = null;
    return;
  }
  if (edge > 1) {
    rx /= edge;
    rz /= edge;
  }
  const x = w / 2 + rx * k, y = h / 2 + rz * k;
  const r = t.call ? 5 + 1.5 * Math.sin(performance.now() / 160) : 4.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd27a';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#3a2a08';
  ctx.stroke();
  ctx.fillStyle = '#3a2a08';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('¢', x, y + 0.5);
  game.traderOnMap = { x, y, call: t.call };
}

/** announced raid (set once Raids exists) */
let raidRef: (() => { phase: string; dir: number } | null) | null = null;

/** raid direction: a red chevron on the minimap edge, pointing in from where they come */
function drawRaid(game: GameT, ctx: CanvasRenderingContext2D, w: number, h: number, rot: number): void {
  const r = raidRef?.();
  if (!r) {
    game.raidOnMap = null;
    return;
  }
  const dx = Math.cos(r.dir), dz = Math.sin(r.dir);
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const rx = dx * cs - dz * sn, rz = dx * sn + dz * cs;
  const m = Math.max(Math.abs(rx), Math.abs(rz));
  const x = w / 2 + (rx / m) * (w / 2 - 9), y = h / 2 + (rz / m) * (h / 2 - 9);
  const blink = 0.6 + 0.4 * Math.sin(performance.now() / 140);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(rz, rx) + Math.PI); // point inward
  ctx.globalAlpha = blink;
  ctx.fillStyle = '#ff4a3a';
  ctx.strokeStyle = '#2a0503';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-6, -7);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-6, 7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  game.raidOnMap = { x, y };
}

/** objective marker: a pulsing diamond, pinned to the minimap edge when out of range */
function drawObjective(game: GameT, ctx: CanvasRenderingContext2D, w: number, h: number, px: number, pz: number, span: number, rot: number): void {
  const o = objectiveRef?.();
  if (!o) {
    game.objectiveOnMap = null;
    return;
  }
  const k = w / (span * 2);
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const dx = o.pos.x / 4 - px, dz = o.pos.z / 4 - pz;
  let rx = dx * cs - dz * sn, rz = dx * sn + dz * cs;
  const edge = Math.max(Math.abs(rx), Math.abs(rz)) / (span * 0.88);
  const pinned = edge > 1;
  if (pinned) {
    rx /= edge;
    rz /= edge;
  }
  const x = w / 2 + rx * k, y = h / 2 + rz * k;
  const pulse = 1 + 0.25 * Math.sin(performance.now() / 180);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#39e6d0';
  ctx.strokeStyle = '#062420';
  ctx.lineWidth = 2;
  const s = 6 * pulse;
  ctx.fillRect(-s, -s, s * 2, s * 2);
  ctx.strokeRect(-s, -s, s * 2, s * 2);
  ctx.restore();
  game.objectiveOnMap = { x, y, pinned, label: o.label };
}

/** Tracker perk: hounds and boars within 80 m as brown dots */
function drawWildlife(game: GameT, ctx: CanvasRenderingContext2D, w: number, h: number, px: number, pz: number, span: number, rot: number): void {
  const list = (window as unknown as { __enemies?: { list: { kind: string; state: string; pos: { x: number; z: number } }[] } }).__enemies?.list ?? [];
  const k = w / (span * 2);
  const cs = Math.cos(rot), sn = Math.sin(rot);
  ctx.fillStyle = '#c8955a';
  let n = 0;
  for (const e of list) {
    if ((e.kind !== 'hound' && e.kind !== 'boar') || e.state === 'dead') continue;
    if (Math.hypot(e.pos.x - game.player.pos.x, e.pos.z - game.player.pos.z) > 80) continue;
    const dx = e.pos.x / 4 - px, dz = e.pos.z / 4 - pz;
    const rx = dx * cs - dz * sn, rz = dx * sn + dz * cs;
    if (Math.abs(rx) > span || Math.abs(rz) > span) continue;
    ctx.beginPath();
    ctx.arc(w / 2 + rx * k, h / 2 + rz * k, e.kind === 'boar' ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
    n++;
  }
  game.trackedOnMap = n;
}

function drawNodes(game: GameT, ctx: CanvasRenderingContext2D, w: number, h: number, px: number, pz: number, span: number, rot: number): void {
  const k = w / (span * 2);
  for (const n of game.layout.nodes) {
    let dx = n.x / 4 - px, dz = n.z / 4 - pz;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const rx = dx * cs - dz * sn, rz = dx * sn + dz * cs;
    dx = rx;
    dz = rz;
    if (Math.abs(dx) > span || Math.abs(dz) > span) continue;
    const online = game.save.world.districts[n.district]?.nodesOnline.includes(n.id);
    ctx.fillStyle = online ? '#39e6d0' : '#e2574c';
    ctx.beginPath();
    ctx.arc(w / 2 + dx * k, h / 2 + dz * k, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMap(game: GameT, ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const img = baseMap(game);
  const s = Math.min(w, h);
  const ox = (w - s) / 2, oy = (h - s) / 2;
  ctx.fillStyle = '#0b0e11';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, ox, oy, s, s);
  const k = s / game.layout.size;
  // fog of war: districts never reached are dimmed
  ctx.font = '600 12px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const d of game.layout.districts) {
    const reached = !!game.save.world.flags[`reached:${d.key}`];
    const st = game.save.world.districts[d.index]?.state ?? 0;
    ctx.fillStyle = reached ? 'rgba(231,228,220,0.9)' : 'rgba(231,228,220,0.35)';
    ctx.fillText(d.name.toUpperCase(), ox + d.cx * k, oy + d.cz * k);
    ctx.fillStyle = st >= 2 ? '#39e6d0' : 'rgba(154,163,168,0.8)';
    ctx.fillText(['Ruin', 'Stabilized', 'Powered', 'Inhabited', 'Thriving'][st], ox + d.cx * k, oy + d.cz * k + 14);
  }
  for (const n of game.layout.nodes) {
    const online = game.save.world.districts[n.district]?.nodesOnline.includes(n.id);
    ctx.fillStyle = online ? '#39e6d0' : '#e2574c';
    ctx.beginPath();
    ctx.arc(ox + n.x * k, oy + n.z * k, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#e8a65a';
  ctx.beginPath();
  ctx.arc(ox + game.player.pos.x * k, oy + game.player.pos.z * k, 5, 0, Math.PI * 2);
  ctx.fill();
}

function journal(game: GameT): { title: string; text: string; done: boolean }[] {
  return game.objectives();
}

start().catch((e) => {
  errors.push(`boot failed: ${e?.message ?? e}`);
  tip.textContent = 'Something went wrong while waking the city. Pull down to reload, or reopen the app.';
  console.error(e);
});
