// Modal screen builders. Each returns a refresh() function.
import type { ItemDef, ItemStack, RecipeDef } from '@dg/shared';
import { ASSIGNABLE_JOBS, JOB_NAMES, PERKS, TRAIT_MAP, canTakePerk, clinicOn, computeNeeds, havenPowerSource, irrigationOn, countItem, getItem, levelProgress, queryRecipes, type CraftBlock } from '@dg/sim';
import type { GameAPI, ScreenId, Settings } from '../game/api';
import { LORE_TERMINALS } from '../content/lore';
import { DISTRICT_INTROS } from '../content/campaign';
import { DISTRICT_KEYS } from '@dg/shared';
import { S } from './strings';
import { btn, clear, h, tap } from './dom';
import { iconImg } from './icons';
import type { UI } from './ui';

export interface ScreenCtx {
  ui: UI;
  api: GameAPI;
  body: HTMLElement;
  header: HTMLElement;
  title: HTMLElement;
  close: () => void;
}

export function buildScreen(id: ScreenId, c: ScreenCtx): (() => void) | null {
  switch (id) {
    case 'inventory':
      return inventoryScreen(c);
    case 'craft':
      return craftScreen(c);
    case 'map':
      return mapScreen(c);
    case 'ledger':
      return ledgerScreen(c);
    case 'journal':
      return journalScreen(c);
    case 'perks':
      return perksScreen(c);
    case 'settings':
      return settingsScreen(c);
    case 'pause':
      return pauseScreen(c);
    case 'storage':
      return storageScreen(c);
    default:
      return null;
  }
}

// ---------------- shared bits ----------------
function cell(stack: ItemStack | null, selected: boolean, onTap: () => void, equipped = false): HTMLElement {
  const el = h('div', { class: `cell ${selected ? 'sel' : ''} ${equipped ? 'equipped' : ''}`, role: 'button' });
  if (stack) {
    const def = getItem(stack.id);
    el.append(iconImg(stack.id, def?.category));
    if (stack.n > 1) el.append(h('span.n', null, String(stack.n)));
    const max = def?.tool?.durability ?? def?.weapon?.durability;
    if (max && stack.d !== undefined) {
      const i = h('i');
      i.style.width = `${Math.max(0, Math.min(100, (stack.d / max) * 100))}%`;
      if (stack.d / max < 0.25) i.style.background = 'var(--danger)';
      el.append(h('span.dur', null, i));
    }
    if (equipped) el.append(h('span.eq', null, 'E'));
  } else el.classList.add('empty');
  tap(el, onTap);
  return el;
}

function useLabel(def: ItemDef, equipped: boolean): string | null {
  switch (def.category) {
    case 'food':
      return S.eat;
    case 'drink':
      return S.drink;
    case 'medicine':
      return S.apply;
    case 'tool':
    case 'weapon':
      return equipped ? S.unequip : S.equip;
    case 'building':
    case 'station':
    case 'defense':
    case 'trap':
      return S.place;
    case 'blueprint':
      return S.read;
    case 'seed':
      return S.equip;
    default:
      return def.id === 'misc.lore_tape' ? S.use : null;
  }
}

function statsOf(def: ItemDef, stack: ItemStack): string[] {
  const out = [S.statWeight(def.weight), S.statStack(def.stack)];
  const max = def.tool?.durability ?? def.weapon?.durability;
  if (max) out.push(S.statDur(stack.d ?? max, max));
  if (def.tool) out.push(S.statTool(def.tool.tier));
  if (def.weapon) out.push(S.statDamage(def.weapon.damage));
  if (def.food) out.push(S.statFood(def.food.hunger, def.food.thirst));
  if (def.heals?.health) out.push(S.statHeal(def.heals.health));
  return out;
}

function weightBar(api: GameAPI): HTMLElement {
  const w = api.carryWeight();
  const pct = Math.min(100, (w.kg / Math.max(1, w.max)) * 100);
  const fill = h('i');
  fill.style.width = `${pct}%`;
  const over = w.kg > w.max;
  return h(
    'div.weight-wrap',
    null,
    h('div', { class: `weight ${over ? 'over' : ''}` }, S.weight(w.kg, w.max), over ? ` — ${S.overweight}` : ''),
    h('div', { class: `wbar ${over ? 'over' : ''}` }, fill),
  );
}

// ---------------- inventory ----------------
function inventoryScreen(c: ScreenCtx): () => void {
  const { api, body } = c;
  c.title.textContent = S.inventory;
  let sel = -1;
  const sortBtn = btn(S.sort, 'small ghost', () => {
    api.sortInventory();
    api.audio.play('click');
    sel = -1;
  });
  c.header.insertBefore(sortBtn, c.header.lastChild);
  const layout = h('div.inv-layout');
  body.append(layout);
  const render = () => {
    clear(layout);
    const p = api.save.player;
    const inv = p.inventory;
    const grid = h('div.grid.inv-grid');
    inv.forEach((s, i) =>
      grid.append(
        cell(s, i === sel, () => {
          sel = sel === i ? -1 : i;
          api.audio.play('click');
          render();
        }, !!s && s.id === p.equipped),
      ),
    );
    const left = h('div.inv-left', null, weightBar(api), grid);
    if (inv.every((s) => !s)) left.append(h('p.empty-note', null, S.emptyInventory));
    const detail = h('div.detail');
    const s = sel >= 0 ? inv[sel] : null;
    const def = s ? getItem(s.id) : undefined;
    if (!s || !def) {
      detail.append(h('h3', null, S.emptySlotTitle), h('p', null, S.emptySlotBody));
    } else {
      const equipped = p.equipped === s.id;
      const img = iconImg(s.id, def.category, 'big');
      detail.append(
        h('div.detail-head', null, img, h('div', null, h('h3', null, def.name), h('small.cat', null, def.category))),
        h('p', null, def.desc),
        h('div.req', null, ...statsOf(def, s).map((t) => h('span', null, t))),
      );
      const row = h('div.row');
      const lbl = useLabel(def, equipped);
      if (lbl)
        row.append(
          btn(lbl, 'primary', () => {
            api.useSlot(sel);
            if (!api.save.player.inventory[sel]) sel = -1;
          }),
        );
      const qrow = h('div.row.quick-row');
      for (let q = 0; q < 4; q++) {
        const on = p.quick[q] === s.id;
        qrow.append(
          btn(S.quick(q + 1), `small ${on ? 'on' : 'ghost'}`, () => {
            api.setQuick(q, on ? null : s.id);
            api.audio.play('click');
          }),
        );
      }
      if (s.n > 1)
        row.append(
          btn(S.split, 'ghost', () => {
            api.splitSlot(sel);
            api.audio.play('click');
          }),
        );
      row.append(
        btn(S.drop, 'danger', () => {
          api.dropSlot(sel);
          sel = -1;
        }),
      );
      detail.append(row, qrow);
    }
    layout.append(left, detail);
  };
  render();
  return render;
}

// ---------------- crafting ----------------
const CRAFT_TABS: [string, string[] | null][] = [
  [S.catAll, null],
  [S.catTools, ['tool']],
  [S.catWeapons, ['weapon', 'ammo']],
  [S.catMedicine, ['medicine']],
  [S.catFood, ['food', 'drink', 'seed']],
  [S.catBuilding, ['building', 'material', 'misc']],
  [S.catDefense, ['defense', 'trap']],
  [S.catStations, ['station']],
];

function blockText(b: CraftBlock, r: RecipeDef): string {
  switch (b) {
    case 'station':
      return S.block.station(S.stationNames[r.station] ?? r.station);
    case 'blueprint':
      return S.block.blueprint;
    case 'rank':
      return S.block.rank(r.rank ?? 1);
    case 'materials':
      return S.block.materials;
    case 'space':
      return S.block.space;
    default:
      return '';
  }
}

function craftScreen(c: ScreenCtx): () => void {
  const { api, body } = c;
  c.title.textContent = S.craft;
  let tab = 0;
  let text = '';
  const search = h('input.search', { type: 'search', placeholder: S.search, autocomplete: 'off', enterkeyhint: 'search' }) as HTMLInputElement;
  search.addEventListener('input', () => {
    text = search.value;
    render();
  });
  search.addEventListener('keydown', (e) => e.stopPropagation());
  const tabs = h('div.tabs');
  const list = h('div.list');
  body.append(search, tabs, list);
  const renderTabs = () => {
    clear(tabs);
    CRAFT_TABS.forEach(([name], i) => {
      const t = h('button', { class: `tab ${i === tab ? 'on' : ''}`, type: 'button' }, name);
      tap(t, () => {
        tab = i;
        api.audio.play('click');
        renderTabs();
        render();
      });
      tabs.append(t);
    });
  };
  const render = () => {
    clear(list);
    const inv = api.save.player.inventory;
    const info = api.craftInfo();
    const cats = CRAFT_TABS[tab][1];
    const rows = queryRecipes(inv, { stations: info.stations, blueprints: info.blueprints, rank: info.rank }, { text }).filter((r) => {
      if (!cats) return true;
      const d = getItem(r.recipe.out);
      return !!d && cats.includes(d.category);
    });
    if (!rows.length) {
      list.append(h('p.empty-note', null, S.noRecipes));
      return;
    }
    // the tutorial's recipe goes first; then craftable before blocked (queryRecipes order)
    const pin = api.suggestedRecipe();
    if (pin) rows.sort((a, b) => (a.recipe.id === pin ? -1 : b.recipe.id === pin ? 1 : 0));
    for (const { recipe: r, block } of rows) {
      const def = getItem(r.out);
      if (!def) continue;
      const locked = block === 'blueprint' || block === 'rank' || block === 'station';
      const req = h('div.req');
      for (const x of r.inputs) {
        const have = countItem(inv, x.item);
        const nm = getItem(x.item)?.name ?? x.item;
        req.append(h('span', { class: have >= x.count ? '' : 'miss' }, `${nm} ${have}/${x.count}`));
      }
      const sub = block === 'station' && info.unpowered?.includes(r.station) ? S.block.noPower(S.stationNames[r.station] ?? r.station) : block ? blockText(block, r) : S.stationNames[r.station] ?? r.station;
      const actions = h('div.craft-actions');
      const craftN = (n: number) => {
        if (api.craft(r.id, n)) api.audio.play('craft');
        else api.audio.play('deny');
      };
      const b1 = btn(S.craftOne, block ? 'small' : 'small primary', () => craftN(1));
      if (block) b1.disabled = true;
      actions.append(b1);
      if (!block && def.stack > 1) actions.append(btn(S.craftFive, 'small ghost', () => craftN(5)));
      const ic = h('div.ic', null, iconImg(def.id, def.category));
      const name = h('b', null, r.count > 1 ? `${def.name} ×${r.count}` : def.name);
      const row = h('div', { class: `li ${locked ? 'locked' : ''} ${r.id === pin ? 'suggested' : ''}` }, ic, h('div.main', null, name, h('small', { class: block ? 'blocked' : '' }, sub), req), actions);
      list.append(row);
    }
  };
  renderTabs();
  render();
  return render;
}

// ---------------- map ----------------
function mapScreen(c: ScreenCtx): () => void {
  c.title.textContent = S.map;
  c.body.classList.add('map-body');
  const cv = h('canvas.map-canvas') as HTMLCanvasElement;
  const legend = h('div.legend');
  const colors = ['#5a6670', '#8a8f7a', '#39e6d0', '#e8a65a', '#f2d28a'];
  S.mapLegend.forEach((n, i) => {
    const sw = h('i');
    sw.style.background = colors[i];
    legend.append(h('span', null, sw, n));
  });
  const note = h('p.empty-note', null, S.mapUnavailable);
  c.body.append(cv, legend);
  const render = () => {
    const draw = c.ui.mapDraw;
    if (!draw) {
      if (!note.isConnected) c.body.prepend(note);
      cv.style.display = 'none';
      return;
    }
    note.remove();
    cv.style.display = '';
    const r = cv.getBoundingClientRect();
    const size = Math.max(64, Math.floor(Math.min(r.width || 400, r.height || 400)));
    const px = Math.min(1024, Math.round(size * Math.min(2, devicePixelRatio || 1)));
    if (cv.width !== px) {
      cv.width = px;
      cv.height = px;
    }
    const ctx = cv.getContext('2d');
    if (ctx) draw(ctx, cv.width, cv.height);
  };
  requestAnimationFrame(render);
  return render;
}

// ---------------- ledger ----------------
function ledgerScreen(c: ScreenCtx): () => void {
  const { api, body } = c;
  c.title.textContent = S.ledger;
  const render = () => {
    clear(body);
    const world = api.save.world;
    let needs: ReturnType<typeof computeNeeds> | null = null;
    try {
      needs = computeNeeds(world);
    } catch {
      needs = null;
    }
    const alive = world.survivors.filter((s) => s.alive);
    const rank = api.craftInfo().rank;
    body.append(
      h(
        'div.stats-row',
        null,
        h('div.stat', null, h('b', null, String(alive.length + 1)), h('small', null, S.population)),
        h('div.stat', null, h('b', null, String(rank)), h('small', null, S.rank(rank))),
        needs ? h('div.stat', null, h('b', null, needs.foodDays.toFixed(1)), h('small', null, S.foodDays(needs.foodDays).replace(/^[\d.]+ /, ''))) : null,
      ),
    );
    // the Grid chain: what restored districts give Haven right now
    const src = havenPowerSource(world, DISTRICT_KEYS);
    const grid = h('div.list.grid-chain', { 'data-grid-chain': '' });
    const line = (on: boolean, text: string) => h('div', { class: `li obj ${on ? 'done-on' : ''}` }, h('span.check', null, on ? '⚡' : '·'), h('div.main', null, h('small', null, text)));
    grid.append(
      line(!!src, src ? S.power.havenFed(DISTRICT_INTROS[src]?.name ?? src) : S.power.havenDark),
      line(irrigationOn(world, DISTRICT_KEYS), irrigationOn(world, DISTRICT_KEYS) ? S.power.waterOn : S.power.waterOff),
      line(clinicOn(world, DISTRICT_KEYS), clinicOn(world, DISTRICT_KEYS) ? S.power.clinicOn : S.power.clinicOff),
    );
    body.append(h('h3.section', null, S.power.chainTitle), grid);
    if (needs) {
      const board = h('div.needs', null, h('h3', null, S.needs));
      for (const k of ['food', 'materials', 'defense', 'construction'] as const) {
        const v = Math.max(0, Math.min(1, needs[k]));
        const i = h('i');
        i.style.width = `${Math.round(v * 100)}%`;
        i.style.background = v > 0.66 ? 'var(--danger)' : v > 0.33 ? 'var(--warm)' : 'var(--ok)';
        board.append(h('div.need', null, h('span', null, S.needNames[k]), h('div.nbar', null, i)));
      }
      body.append(board);
    }
    body.append(h('h3.section', null, S.survivors));
    if (!alive.length) {
      body.append(h('p.empty-note', null, S.noSurvivors));
      return;
    }
    const list = h('div.list');
    for (const s of alive) {
      const jobs = h('div.seg.jobs');
      for (const j of ASSIGNABLE_JOBS) {
        const b = h('button', { class: s.job === j ? 'on' : '', type: 'button' }, j === 'auto' ? 'Auto' : JOB_NAMES[j]);
        tap(b, () => {
          api.audio.play('click');
          c.ui.jobAssign(s.id, j);
          s.job = j;
          render();
        });
        jobs.append(b);
      }
      list.append(
        h(
          'div.li.surv',
          null,
          h(
            'div.main',
            null,
            h('b', null, s.name, s.injured ? h('span.tagbad', null, ` · ${S.injured}`) : null),
            h('small', null, `${s.traits.map((t) => TRAIT_MAP.get(t)?.name ?? t).join(' · ')} — ${S.mood(s.mood)}`),
            jobs,
          ),
        ),
      );
    }
    body.append(list);
  };
  render();
  return render;
}

// ---------------- journal ----------------
function journalScreen(c: ScreenCtx): () => void {
  const { api, body } = c;
  c.title.textContent = S.journal;
  const render = () => {
    clear(body);
    const flags0 = api.save.world.flags ?? {};
    const st = c.ui.storySource?.();
    if (st) {
      // the one thing to do next, always visible at the top
      const next = h('div.next-step', { 'data-next': '' });
      if (st.ending) next.append(h('b', null, S.camp.endingReached(st.ending)));
      if (st.next) {
        const prog = st.next.need > 1 ? ` (${Math.min(st.next.have, st.next.need)}/${st.next.need})` : '';
        next.append(h('small.kicker', null, `${S.camp.nextStep} · ${st.next.title}`), h('b', null, st.next.text + prog), h('small', null, st.next.hint));
        if (st.decide) {
          const key = st.decide;
          next.append(btn(S.camp.decide, 'primary small', () => c.ui.decideHandler(key), { 'data-decide': key }));
        }
      } else if (!st.ending) next.append(h('b', null, S.camp.allDone));
      body.append(next);
    }
    const rk = c.ui.rankSource?.();
    if (rk) {
      const fill = h('i');
      fill.style.width = `${Math.round(rk.frac * 100)}%`;
      const box = h('div.rank-card', { 'data-rank-journal': '' }, h('div.rtop', null, h('b', null, S.rankbar.label(rk.rank)), h('div.rbar', null, fill), h('small', null, rk.max ? S.rankbar.max : S.rankbar.pts(rk.into, rk.need))), h('small.how', null, S.rankbar.how));
      const ul = h('div.list.rank-unlocks');
      for (const u of rk.next) ul.append(h('div', { class: 'li obj' }, h('span.check', null, String(u.rank)), h('div.main', null, h('b', null, u.label), h('small', null, S.rankbar.at(u.rank)))));
      body.append(h('h3.section', null, S.rankbar.title), box, ul);
    }
    body.append(h('h3.section', null, S.objectives));
    const entries = c.ui.journalSource();
    if (!entries.length) body.append(h('p.empty-note', null, S.noObjectives));
    const list = h('div.list');
    for (const e of entries) list.append(h('div', { class: `li obj ${e.done ? 'done' : ''}` }, h('span.check', null, e.done ? '✓' : ''), h('div.main', null, h('b', null, e.title), h('small', null, e.text))));
    body.append(list);
    if (st) {
      body.append(h('h3.section', null, S.camp.endingsTitle));
      body.append(h('p.rep-line', null, `${S.camp.rep}: ${st.rep.map((r) => `${r.name} ${r.value}`).join(' · ')}`));
      if (!st.endings) body.append(h('p.empty-note', null, S.camp.endingsLocked));
      else {
        const el = h('div.list.endings');
        for (const e of st.endings)
          el.append(
            h(
              'div',
              { class: `li obj ending-row ${e.reached ? 'done' : ''} ${e.met ? 'met' : ''}`, 'data-ending-row': '' },
              h('span.check', null, e.met ? '✓' : ''),
              h('div.main', null, h('b', null, e.title), h('small', null, `${e.met ? S.camp.endingMet : e.need ? S.camp.endingNeeds(e.need) : ''}${e.met || e.need ? ' · ' : ''}${e.how}`)),
            ),
          );
        body.append(el);
      }
    }
    const seen = Object.keys(S.enemy).filter((k) => flags0[`seen:${k}`]);
    if (seen.length) {
      body.append(h('h3.section', null, S.threatsTitle));
      const tl = h('div.list.threats');
      for (const k of seen) tl.append(h('div', { class: 'li obj', 'data-threat': k }, h('div.main', null, h('b', null, S.enemy[k].name), h('small', null, S.enemy[k].counter))));
      body.append(tl);
    }
    body.append(h('h3.section', null, S.lore));
    const flags = api.save.world.flags ?? {};
    const found = LORE_TERMINALS.filter((l) => flags[`lore:${l.id}`]);
    if (!found.length) body.append(h('p.empty-note', null, S.noLore));
    for (const l of found) {
      const det = h('details.lore', null, h('summary', null, l.title), h('pre', null, l.header), h('p', null, l.body));
      body.append(det);
    }
  };
  render();
  return render;
}

// ---------------- perks ----------------
const TRACKS = ['scavenger', 'builder', 'fighter', 'provider'] as const;

function perksScreen(c: ScreenCtx): () => void {
  const { api, body } = c;
  c.title.textContent = S.prog.title;
  let track = 0;
  const render = () => {
    const scroll = body.scrollTop;
    clear(body);
    const p = api.save.player;
    const lp = levelProgress(p.xp);
    const bar = h('i');
    bar.style.width = `${Math.min(100, (lp.into / lp.need) * 100)}%`;
    body.append(
      h('div.perk-head', null,
        h('b', null, S.prog.level(lp.level)),
        h('div.xpbar', null, bar),
        h('small', null, S.prog.xpBar(lp.into, lp.need)),
        h('b', { class: `pts ${p.perkPoints > 0 ? 'on' : ''}`, 'data-points': p.perkPoints }, p.perkPoints > 0 ? S.prog.points(p.perkPoints) : S.prog.noPoints),
        h('small', null, S.prog.ownedCount(p.perks.length, PERKS.length)),
      ),
      h('p.empty-note', null, S.prog.howTo),
    );
    const tabs = h('div.tabs');
    TRACKS.forEach((t, i) => {
      const n = PERKS.filter((x) => x.track === t && p.perks.includes(x.id)).length;
      const b = h('button', { class: `tab ${i === track ? 'on' : ''}`, type: 'button' }, `${S.prog.tracks[t]} ${n}/8`);
      tap(b, () => {
        track = i;
        api.audio.play('click');
        render();
      });
      tabs.append(b);
    });
    body.append(tabs);
    const list = h('div.list.perks');
    const rows = PERKS.filter((x) => x.track === TRACKS[track]).sort((a, b) => a.tier - b.tier);
    for (const perk of rows) {
      const owned = p.perks.includes(perk.id);
      const can = canTakePerk(p.perks, perk.id, p.perkPoints);
      const prev = rows.find((x) => x.tier === perk.tier - 1);
      const prevOwned = !prev || p.perks.includes(prev.id);
      const sub = owned ? S.prog.owned : !prevOwned && prev ? S.prog.locked(prev.name) : S.prog.tier(perk.tier);
      const act = owned ? h('span.check', null, '✓') : btn(S.prog.take, can ? 'small primary' : 'small', () => {
        if (api.takePerk(perk.id)) render();
      }, { 'data-perk': perk.id });
      if (!owned && !can) (act as HTMLButtonElement).disabled = true;
      list.append(h('div', { class: `li perk ${owned ? 'owned' : ''} ${!owned && !prevOwned ? 'locked' : ''}` }, h('div.tierno', null, String(perk.tier)), h('div.main', null, h('b', null, perk.name), h('small', null, `${perk.desc} · ${sub}`)), act));
    }
    body.append(list);
    body.scrollTop = scroll;
  };
  render();
  return render;
}

// ---------------- settings ----------------
function settingsScreen(c: ScreenCtx): () => void {
  const { api, body } = c;
  c.title.textContent = S.settings;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    api.settings[k] = v;
    api.applySettings();
    c.ui.applyHtmlClasses();
  };
  const render = () => {
    const scroll = body.scrollTop;
    clear(body);
    const s = api.settings;
    const row = (label: string, ctl: HTMLElement, hint?: string) => h('div.settings-row', null, h('label', null, label, hint ? h('small', null, hint) : null), ctl);
    const seg = <T extends string>(val: T, opts: [T, string][], on: (v: T) => void) => {
      const el = h('div.seg');
      for (const [v, l] of opts) {
        const b = h('button', { class: v === val ? 'on' : '', type: 'button' }, l);
        tap(b, () => {
          api.audio.play('click');
          on(v);
          render();
        });
        el.append(b);
      }
      return el;
    };
    const toggle = (k: 'muted' | 'invertY' | 'leftHanded' | 'colorblind' | 'reduceShake' | 'subtitles' | 'showPerf' | 'coopDiag' | 'fpsCap30' | 'hints') =>
      seg(s[k] ? 'on' : 'off', [['off', 'Off'], ['on', 'On']], (v) => set(k, v === 'on'));
    const slider = (k: 'master' | 'music' | 'sfx' | 'ambience' | 'sensitivity', min: number, max: number, step: number) => {
      const r = h('input', { type: 'range', min, max, step, value: s[k] }) as HTMLInputElement;
      r.addEventListener('input', () => set(k, Number(r.value)));
      r.addEventListener('change', () => api.audio.play('click'));
      return r;
    };
    const section = (t: string) => h('h3.section', null, t);
    body.append(
      section(S.sGraphics),
      row(S.sQuality, seg(s.quality, [['auto', S.qAuto], ['low', S.qLow], ['medium', S.qMed], ['high', S.qHigh]], (v) => set('quality', v))),
      row(S.sBattery, toggle('fpsCap30')),
      row(S.sPerf, toggle('showPerf')),
      row(S.sCoopDiag, toggle('coopDiag'), S.sCoopDiagHint),
      section(S.sAudio),
      row(S.sMaster, slider('master', 0, 1, 0.05)),
      row(S.sMusic, slider('music', 0, 1, 0.05)),
      row(S.sSfx, slider('sfx', 0, 1, 0.05)),
      row(S.sAmbience, slider('ambience', 0, 1, 0.05)),
      row(S.sMuted, toggle('muted')),
      section(S.sControls),
      row(S.sSensitivity, slider('sensitivity', 0.4, 2, 0.05)),
      row(S.sInvertY, toggle('invertY')),
      row(S.sLefty, toggle('leftHanded'), S.sLeftyHint),
      section(S.sAccess),
      row(S.sTextSize, seg(s.textSize, [['normal', S.tNormal], ['big', S.tBig], ['huge', S.tHuge]], (v) => set('textSize', v))),
      row(S.sColorblind, toggle('colorblind')),
      row(S.sReduceShake, toggle('reduceShake')),
      row(S.sSubtitles, toggle('subtitles')),
      row(S.sHints, toggle('hints')),
      section(S.sGame),
      api.save
        ? row(S.difficulty.label, seg(api.save.world.difficulty, [['chill', S.difficulty.chill], ['standard', S.difficulty.standard], ['hard', S.difficulty.hard]], (v) => api.setDifficulty(v)), S.difficulty.hint)
        : row(S.difficulty.label, h('small', null, S.difficulty.noSave)),
      row(S.sDay, seg(String(s.dayMinutes), [['12', S.sDayVal(12)], ['24', S.sDayVal(24)], ['48', S.sDayVal(48)]], (v) => set('dayMinutes', Number(v)))),
      section(S.sData),
      h(
        'div.row.data-row',
        null,
        btn(S.exportSave, 'ghost', () => exportSave(c)),
        btn(S.importSave, 'ghost', () => importSave(c)),
        btn(S.account, 'ghost', () => api.openScreen('account')),
        btn(S.coop, 'ghost', () => api.openScreen('coop')),
        btn(S.deviceReport, 'ghost', () => copyText(c, c.ui.deviceReport(), S.reportCopied)),
      ),
    );
    body.scrollTop = scroll;
  };
  render();
  return render;
}

async function copyText(c: ScreenCtx, text: string, ok: string): Promise<void> {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    c.ui.toast(ok);
  } catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' }) as HTMLTextAreaElement;
    ta.value = text;
    document.body.append(ta);
    ta.select();
    try {
      document.execCommand('copy');
      c.ui.toast(ok);
    } catch {
      /* ignore */
    }
    ta.remove();
  }
}

function exportSave(c: ScreenCtx): void {
  const json = c.api.exportSave();
  try {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `dormant-grid-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    c.ui.toast(S.exported);
  } catch {
    void copyText(c, json, S.exportedClip);
  }
}

function importSave(c: ScreenCtx): void {
  const ta = h('textarea.input.paste', { placeholder: S.importPaste, rows: 4 }) as HTMLTextAreaElement;
  ta.addEventListener('keydown', (e) => e.stopPropagation());
  const file = h('input', { type: 'file', accept: 'application/json,.json' }) as HTMLInputElement;
  const doImport = async (json: string) => {
    const ok = await c.api.importSave(json).catch(() => false);
    c.ui.toast(ok ? S.importOk : S.importBad, ok ? 'info' : 'bad');
    if (ok) c.ui.closeDialog();
  };
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (f) await doImport(await f.text());
  });
  c.ui.dialog(S.importSave, h('div', null, file, ta), [btn(S.cancel, 'ghost', () => c.ui.closeDialog()), btn(S.importDo, 'primary', () => void doImport(ta.value))]);
}

// ---------------- pause ----------------
function pauseScreen(c: ScreenCtx): () => void {
  c.title.textContent = S.pause;
  c.body.append(
    h(
      'div.pause-stack',
      null,
      btn(S.resume, 'primary', () => c.close()),
      btn(S.settings, '', () => c.ui.open('settings')),
      btn(S.saveQuit, 'ghost', () => {
        c.ui.closeAll();
        c.ui.quitHandler();
      }),
      btn(S.deviceReport, 'ghost small', () => void copyText(c, c.ui.deviceReport(), S.reportCopied)),
    ),
  );
  return () => {};
}

// ---------------- storage ----------------
function storageScreen(c: ScreenCtx): () => void {
  const { api, body } = c;
  c.title.textContent = S.storage;
  const render = () => {
    clear(body);
    const store = api.storage();
    const inv = api.save.player.inventory;
    const g1 = h('div.grid');
    inv.forEach((s, i) => g1.append(cell(s, false, () => s && (api.moveToStorage(i), api.audio.play('click')))));
    const g2 = h('div.grid');
    (store ?? []).forEach((s, i) => g2.append(cell(s, false, () => s && (api.moveFromStorage(i), api.audio.play('click')))));
    body.append(h('div.two-col', null, h('div', null, h('h3.section', null, S.inventory), weightBar(api), g1), h('div', null, h('h3.section', null, S.storage), g2)));
  };
  render();
  return render;
}

