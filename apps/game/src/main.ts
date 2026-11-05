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
  ui.setRespawnHandler(() => undefined);
  ui.setDeviceReport(() => game.perf.report());
  ui.setMinimap((ctx, w, h) => drawMinimap(game, ctx, w, h, 0.9));
  ui.setMapDraw((ctx, w, h) => drawMap(game, ctx, w, h));
  ui.setJournalSource(() => journal(game));
  new CoopView(game, svc.coop);
  const trader = new Trader(game);
  (window as unknown as { __trader: unknown }).__trader = trader;
  new Markers(game);
  new Guide(game, ui);
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
  (window as unknown as { __raids: unknown }).__raids = new Raids(game, enemies);
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
  ctx.fillStyle = '#e8a65a';
  ctx.beginPath();
  ctx.moveTo(w / 2, h / 2 - 7);
  ctx.lineTo(w / 2 + 5, h / 2 + 5);
  ctx.lineTo(w / 2 - 5, h / 2 + 5);
  ctx.closePath();
  ctx.fill();
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
