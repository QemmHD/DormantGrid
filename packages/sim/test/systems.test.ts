import { describe, expect, it } from 'vitest';
import { Rng, type PlacedPiece } from '@dg/shared';
import { ITEMS } from '../src/data/items';
import { RECIPE_MAP, RECIPES } from '../src/data/recipes';
import { PROP_SALVAGE } from '../src/data/loot';
import {
  addItem,
  countItem,
  createInventory,
  moveSlot,
  removeItem,
  sanitizeInventory,
  sortInventory,
  splitSlot,
  totalWeight,
  transferAll,
  wearSlot,
} from '../src/systems/inventory';
import { canCraft, craft, queryRecipes, recipeBlock } from '../src/systems/crafting';
import { consume, damagePlayer, modifiers, newPlayer, tickPlayer, tickStamina, hasCondition } from '../src/systems/survival';
import { collapsePlacedAfterRemoval, computeStability, removePiece, snapPiece, validatePlacement } from '../src/systems/building';
import { cropStage, harvest, plant, tickCrop } from '../src/systems/farming';
import { RELAYS_PER_NODE, restorationFor, routeRelay, startReboot, tickReboot, type NodeEvent } from '../src/systems/grid';
import { grantXp, townRank, survivorCap } from '../src/systems/rank';
import { changeRep, buyPrice, sellPrice, generateContract } from '../src/systems/factions';
import { hoursToRipe } from '../src/systems/farming';
import { EARLY_RAIDS, earlyRaidBudget, finishRaid, maybeScheduleRaid, newRaidState, raidCompass, raidPhase, raidStrength, resolveRaidCoarse } from '../src/systems/raids';
import { dayOf, seasonOf, sunAt, weatherAt, isNight } from '../src/systems/time';
import { townBoard } from '../src/systems/townboard';

function invValid(inv: ReturnType<typeof createInventory>) {
  for (const s of inv) {
    if (!s) continue;
    expect(Number.isFinite(s.n)).toBe(true);
    expect(s.n).toBeGreaterThan(0);
    const def = ITEMS.find((i) => i.id === s.id)!;
    expect(s.n).toBeLessThanOrEqual(def.stack);
  }
}

describe('inventory', () => {
  it('adds, stacks, removes', () => {
    const inv = createInventory(4);
    expect(addItem(inv, 'mat.scrap', 120)).toBe(0);
    expect(countItem(inv, 'mat.scrap')).toBe(120);
    expect(inv.filter(Boolean).length).toBe(3);
    expect(addItem(inv, 'mat.timber', 80)).toBe(30); // only one slot left
    expect(removeItem(inv, 'mat.scrap', 500)).toBe(120);
    expect(countItem(inv, 'mat.scrap')).toBe(0);
    invValid(inv);
  });
  it('rejects bad input', () => {
    const inv = createInventory(4);
    expect(addItem(inv, 'mat.scrap', NaN)).toBe(0);
    expect(addItem(inv, 'mat.scrap', -5)).toBe(0);
    expect(addItem(inv, 'nope', 3)).toBe(3);
    expect(removeItem(inv, 'mat.scrap', Infinity)).toBe(0);
    expect(inv.every((s) => s === null)).toBe(true);
  });
  it('fuzz: random ops never produce invalid slots', () => {
    const rng = new Rng(1234);
    const ids = ITEMS.map((i) => i.id);
    const a = createInventory(24);
    const b = createInventory(12);
    for (let k = 0; k < 4000; k++) {
      const op = rng.int(0, 7);
      const id = rng.pick(ids);
      const n = rng.chance(0.05) ? rng.pick([NaN, -3, 1e9, 0.5]) : rng.int(0, 60);
      if (op === 0) addItem(a, id, n);
      else if (op === 1) removeItem(a, id, n);
      else if (op === 2) moveSlot(a, rng.int(-1, 25), b, rng.int(-1, 13));
      else if (op === 3) moveSlot(b, rng.int(0, 11), a, rng.int(0, 23));
      else if (op === 4) splitSlot(a, rng.int(0, 23), rng.int(0, 30));
      else if (op === 5) transferAll(b, a);
      else if (op === 6) sortInventory(a);
      else wearSlot(a, rng.int(0, 23), rng.int(0, 400));
      invValid(a);
      invValid(b);
      expect(Number.isFinite(totalWeight(a))).toBe(true);
    }
  });
  it('sort preserves totals', () => {
    const inv = createInventory(10);
    addItem(inv, 'mat.scrap', 30);
    addItem(inv, 'food.potato', 5);
    addItem(inv, 'mat.scrap', 30);
    const before = countItem(inv, 'mat.scrap');
    sortInventory(inv);
    expect(countItem(inv, 'mat.scrap')).toBe(before);
    expect(countItem(inv, 'food.potato')).toBe(5);
  });
  it('sanitize handles corrupt data', () => {
    const inv = sanitizeInventory([{ id: 'mat.scrap', n: 9999 }, { id: 'evil', n: 1 }, 'x', null, { id: 'food.potato', n: -1 }], 6);
    expect(inv.length).toBe(6);
    expect(inv[0]).toEqual({ id: 'mat.scrap', n: 50 });
    expect(inv.filter(Boolean).length).toBe(1);
    expect(sanitizeInventory('garbage').length).toBe(24);
  });
});

describe('crafting', () => {
  const ctx = { stations: ['hands', 'workbench1'] as const, blueprints: [] as string[], rank: 1, hour: 10 };
  it('crafts a crowbar from scrap with hands', () => {
    const inv = createInventory();
    addItem(inv, 'mat.scrap', 10);
    addItem(inv, 'mat.timber', 2);
    const r = RECIPE_MAP.get('r.tool.crowbar')!;
    expect(canCraft(r, inv, { ...ctx, stations: ['hands'] })).toBe(true);
    expect(craft(r, inv, { ...ctx, stations: ['hands'] })).toBe(true);
    expect(countItem(inv, 'mat.scrap')).toBe(6);
    expect(countItem(inv, 'mat.timber')).toBe(1);
    expect(countItem(inv, 'tool.crowbar')).toBe(1);
    expect(inv.find((s) => s?.id === 'tool.crowbar')?.d).toBe(300);
  });
  it('the tutorial path never dead-ends: starting kit + the first crate always cover a crowbar', () => {
    // starting kit gives 2 scrap (game.ts newGame); a crate yields at least 2 scrap and 2 timber
    const crate = PROP_SALVAGE.crate.yields;
    const minScrap = crate.filter((y) => y.item === 'mat.scrap' && !y.chance).reduce((a, y) => a + y.min, 0);
    const minTimber = crate.filter((y) => y.item === 'mat.timber' && !y.chance).reduce((a, y) => a + y.min, 0);
    const r = RECIPE_MAP.get('r.tool.crowbar')!;
    const need = (id: string) => r.inputs.find((x) => x.item === id)?.count ?? 0;
    expect(2 + minScrap).toBeGreaterThanOrEqual(need('mat.scrap'));
    expect(minTimber).toBeGreaterThanOrEqual(need('mat.timber'));
  });
  it('gates by station, blueprint and rank', () => {
    const inv = createInventory(40);
    for (const i of ITEMS) if (i.category === 'material') expect(addItem(inv, i.id, 40)).toBe(0);
    const xbow = RECIPES.find((r) => r.out === 'wpn.crossbow')!;
    expect(recipeBlock(xbow, inv, ctx)).toBe('blueprint');
    expect(recipeBlock(xbow, inv, { ...ctx, blueprints: ['bp.crossbow'] })).toBe('station');
    expect(recipeBlock(xbow, inv, { ...ctx, blueprints: ['bp.crossbow'], stations: ['workbench2'] })).toBe(null);
    const torch = RECIPES.find((r) => r.out === 'tool.torch')!;
    expect(recipeBlock(torch, inv, { ...ctx, stations: ['workbench3'] })).toBe('rank');
  });
  it('uses storage when inventory lacks materials', () => {
    const inv = createInventory();
    const store = createInventory(10);
    addItem(store, 'mat.cloth', 3);
    const r = RECIPE_MAP.get('r.comp.rope')!;
    expect(craft(r, inv, { ...ctx, storage: [store] })).toBe(true);
    expect(countItem(store, 'mat.cloth')).toBe(0);
    expect(countItem(inv, 'comp.rope')).toBe(1);
  });
  it('query sorts craftable first and filters text', () => {
    const inv = createInventory();
    addItem(inv, 'mat.cloth', 10);
    const res = queryRecipes(inv, ctx, { text: 'band' });
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].block).toBe(null);
  });
});

describe('survival', () => {
  it('meters drain and starvation hurts; regen when fed', () => {
    const p = newPlayer({ x: 0, z: 0 });
    const ctx = { difficulty: 'standard' as const, rng: new Rng(1) };
    tickPlayer(p, 10, ctx);
    expect(p.hunger).toBeLessThan(85);
    expect(p.thirst).toBeLessThan(80);
    p.hunger = 0;
    p.thirst = 0;
    const hp = p.health;
    tickPlayer(p, 1, ctx);
    expect(p.health).toBeLessThan(hp);
    for (let i = 0; i < 100; i++) tickPlayer(p, 1, ctx);
    expect(p.health).toBe(0);
    expect(Number.isFinite(p.hunger)).toBe(true);
  });
  it('difficulty scales drain', () => {
    const a = newPlayer({ x: 0, z: 0 });
    const b = newPlayer({ x: 0, z: 0 });
    tickPlayer(a, 5, { difficulty: 'chill', rng: new Rng(1) });
    tickPlayer(b, 5, { difficulty: 'hard', rng: new Rng(1) });
    expect(a.hunger).toBeGreaterThan(b.hunger);
  });
  it('fracture limps until splinted, bandage stops bleeding', () => {
    const p = newPlayer({ x: 0, z: 0 });
    const ctx = { difficulty: 'standard' as const, rng: new Rng(5) };
    p.conditions.push({ id: 'fracture', t: 48 }, { id: 'bleeding', t: 3 });
    expect(modifiers(p).limp).toBe(true);
    expect(modifiers(p).speed).toBeLessThan(1);
    consume(p, { id: 'med.splint', n: 1 }, 0, ctx);
    consume(p, { id: 'med.bandage', n: 1 }, 0, ctx);
    expect(hasCondition(p, 'fracture')).toBe(false);
    expect(hasCondition(p, 'bleeding')).toBe(false);
    expect(modifiers(p).limp).toBe(false);
  });
  it('spoiled food and dirty water can cause sickness; antibiotics cure', () => {
    const p = newPlayer({ x: 0, z: 0 });
    let sick = 0;
    for (let i = 0; i < 50; i++) {
      const r = consume(p, { id: 'drink.dirty_water', n: 1 }, 0, { difficulty: 'standard', rng: new Rng(i) });
      if (r.becameSick) sick++;
    }
    expect(sick).toBeGreaterThan(5);
    const spoiled = consume(p, { id: 'food.raw_meat', n: 1, t: 0 }, 500, { difficulty: 'standard', rng: new Rng(3) });
    expect(spoiled.spoiled).toBe(true);
    consume(p, { id: 'med.antibiotics', n: 1 }, 0, { difficulty: 'standard', rng: new Rng(1) });
    expect(hasCondition(p, 'sick')).toBe(false);
  });
  it('damage can cause bleeding; stamina never NaN', () => {
    const p = newPlayer({ x: 0, z: 0 });
    let bled = false;
    for (let i = 0; i < 20 && !bled; i++) {
      damagePlayer(p, 10, 'cut', { difficulty: 'standard', rng: new Rng(i) });
      bled = hasCondition(p, 'bleeding');
      p.health = 100;
    }
    expect(bled).toBe(true);
    tickStamina(p, NaN, NaN, modifiers(p));
    tickStamina(p, 0.5, 200, modifiers(p));
    expect(p.stamina).toBe(0);
    tickStamina(p, 1, 0, modifiers(p));
    expect(p.stamina).toBeGreaterThan(0);
  });
});

describe('building', () => {
  let nextId = 1;
  const mk = (piece: string, x: number, y: number, z: number, rot: 0 | 1 | 2 | 3 = 0, tier: 0 | 1 | 2 | 3 = 1): PlacedPiece => ({ id: nextId++, piece, tier, x, y, z, rot, hp: 100 });

  it('snaps cell and edge pieces', () => {
    expect(snapPiece('foundation', 5.1, 0, 9.7, 0)).toMatchObject({ x: 6, z: 10, y: 0 });
    const w = snapPiece('wall', 6, 0, 8.3, 0);
    expect(w).toMatchObject({ x: 6, z: 8 });
    expect(w.rot % 2).toBe(0);
    const v = snapPiece('wall', 4.2, 0, 10, 0);
    expect(v).toMatchObject({ x: 4, z: 10 });
    expect(v.rot % 2).toBe(1);
  });

  it('builds a supported house and collapses when support removed', () => {
    const pieces: PlacedPiece[] = [];
    const place = (p: PlacedPiece) => {
      const chk = validatePlacement(pieces, p);
      expect(chk.ok, `${p.piece} ${chk.reason}`).toBe(true);
      pieces.push(p);
      return p;
    };
    const f = place(mk('foundation', 2, 0, 2));
    place(mk('wall', 2, 0, 0, 0));
    place(mk('wall', 2, 0, 4, 0));
    place(mk('wall', 0, 0, 2, 1));
    const w4 = place(mk('wall', 4, 0, 2, 1));
    const roof = place(mk('roof', 2, 3, 2));
    // a floor hanging two cells out is weaker but ok, three cells out on scrap fails eventually
    const f1 = place(mk('floor', 6, 3, 2, 0, 1)); // rests on the east wall
    const f2 = place(mk('floor', 10, 3, 2, 0, 0)); // cantilevered off f1
    expect(validatePlacement(pieces, mk('wall', 2, 0, 0, 0)).reason).toBe('occupied');
    // unsupported: floating floor
    expect(validatePlacement(pieces, mk('floor', 30, 3, 30)).reason).toBe('unsupported');
    // wall with no foundation at ground level is unsupported
    expect(validatePlacement(pieces, mk('wall', 22, 0, 20, 0)).reason).toBe('unsupported');
    const stab = computeStability(pieces);
    expect(stab.get(f)).toBe(100);
    expect(stab.get(f1)!).toBeGreaterThan(stab.get(f2)!);
    expect(stab.get(roof)!).toBeGreaterThan(stab.get(f2)!);
    // removing the foundation drops every wall, the roof and the cantilevered floor
    const gone = collapsePlacedAfterRemoval(pieces, f.id);
    expect(gone).toContain(roof.id);
    expect(gone).toContain(w4.id);
    expect(gone).toContain(f1.id);
    expect(gone).toContain(f2.id);
    const removed = removePiece(pieces, f.id);
    expect(removed.length).toBe(gone.length + 1);
    expect(pieces.length).toBe(0);
  });

  it('stations sit on ground or on floors; free pieces cannot overlap', () => {
    const pieces: PlacedPiece[] = [mk('campfire', 10, 0, 10)];
    expect(validatePlacement(pieces, mk('campfire', 10.5, 0, 10)).reason).toBe('overlap');
    expect(validatePlacement(pieces, mk('bed', 14, 0, 10)).ok).toBe(true);
    expect(validatePlacement(pieces, mk('bed', 14, 3, 10)).reason).toBe('unsupported');
  });
});

describe('farming', () => {
  it('grows through 4 visible stages in season and harvests', () => {
    const spring = 24 * 1 + 8;
    const c = plant(1, 'seed.potato', spring)!;
    expect(c).toBeTruthy();
    const stages = new Set<number>([cropStage(c.growth)]);
    for (let h = 0; h < 24 * 8 && c.growth < 1; h++) {
      tickCrop(c, 1, { hour: spring + h, weather: h % 30 < 5 ? 'rain' : 'overcast', tended: 1 });
      if (c.water < 0.3) c.water = 1;
      stages.add(cropStage(c.growth));
    }
    expect(stages).toEqual(new Set([0, 1, 2, 3]));
    const out = harvest(c, new Rng(1));
    expect(out[0].item).toBe('food.potato');
    expect(out[0].count).toBeGreaterThan(0);
    expect(c.crop).toBe('');
  });
  it('out of season seeds cannot be planted', () => {
    const summer = 7 * 24 + 10;
    expect(seasonOf(summer)).toBe('summer');
    expect(plant(1, 'seed.cabbage', summer)).toBe(null);
    expect(plant(1, 'seed.tomato', summer)).not.toBe(null);
  });
  it('dry soil stalls growth', () => {
    const a = plant(1, 'seed.carrot', 10)!;
    const b = plant(2, 'seed.carrot', 10)!;
    a.water = 1;
    b.water = 0;
    tickCrop(a, 2, { hour: 10, weather: 'overcast' });
    tickCrop(b, 2, { hour: 10, weather: 'overcast' });
    expect(a.growth).toBeGreaterThan(b.growth * 2);
  });
});

describe('grid node reboot', () => {
  it('routes relays, syncs, defends, comes online', () => {
    const s = startReboot(1, 2);
    const ev: NodeEvent[] = [];
    for (let i = 0; i < RELAYS_PER_NODE; i++) routeRelay(s, i, ev);
    expect(s.phase).toBe('syncing');
    for (let t = 0; t < 20; t++) tickReboot(s, 1, { holding: true, inRange: true, enemiesAlive: 0, danger: 1 }, ev);
    expect(s.phase).toBe('defend');
    let waves = ev.filter((e) => e.type === 'wave').length;
    for (let t = 0; t < 200 && s.phase !== 'online'; t++) {
      const out = tickReboot(s, 1, { holding: false, inRange: true, enemiesAlive: t < 55 ? 3 : 0, danger: 1 }, []);
      waves += out.filter((e) => e.type === 'wave').length;
    }
    expect(waves).toBe(3);
    expect(s.phase).toBe('online');
  });
  it('leaving range during defend is a setback, not a reset', () => {
    const s = startReboot(1, 2);
    for (let i = 0; i < RELAYS_PER_NODE; i++) routeRelay(s, i);
    for (let t = 0; t < 20; t++) tickReboot(s, 1, { holding: true, inRange: true, enemiesAlive: 0, danger: 0 });
    for (let t = 0; t < 20; t++) tickReboot(s, 1, { holding: false, inRange: false, enemiesAlive: 2, danger: 0 });
    expect(s.phase).toBe('syncing');
    expect(s.sync).toBeGreaterThan(0.3);
  });
  it('restoration states progress with nodes and people', () => {
    expect(restorationFor({ nodesOnline: 0, nodesTotal: 2, residents: 0, rank: 1 })).toBe(0);
    expect(restorationFor({ nodesOnline: 1, nodesTotal: 2, residents: 0, rank: 1 })).toBe(1);
    expect(restorationFor({ nodesOnline: 2, nodesTotal: 2, residents: 0, rank: 1 })).toBe(2);
    expect(restorationFor({ nodesOnline: 2, nodesTotal: 2, residents: 4, rank: 3 })).toBe(3);
    expect(restorationFor({ nodesOnline: 2, nodesTotal: 2, residents: 8, rank: 7 })).toBe(4);
  });
});

describe('rank, factions, raids, time', () => {
  it('rank grows monotonically and caps at 10', () => {
    let last = 0;
    for (let pop = 0; pop <= 40; pop += 4) {
      const r = townRank({ population: pop, restoredDistricts: pop / 5, infrastructure: pop, defense: pop * 3 }).rank;
      expect(r).toBeGreaterThanOrEqual(last);
      last = r;
    }
    expect(last).toBe(10);
    expect(survivorCap(10, true)).toBe(40);
  });
  it('xp grants perk points', () => {
    const p = newPlayer({ x: 0, z: 0 });
    expect(grantXp(p, 5000)).toBeGreaterThan(3);
    expect(p.perkPoints).toBeGreaterThan(3);
  });
  it('reputation clamps; trade prices respond to rep', () => {
    const rep: Record<string, number> = {};
    changeRep(rep, 'guild', 500);
    expect(rep.guild).toBe(100);
    expect(buyPrice('bp.turret', 'guild', 10)).toBe(null);
    expect(buyPrice('bp.turret', 'guild', 60)).toBeGreaterThan(0);
    expect(sellPrice('mat.wiring', 'guild', 50)).toBeGreaterThan(sellPrice('mat.wiring', 'guild', -50));
    expect(sellPrice('mat.wiring', 'hearth', 50)).toBe(0);
    const c = generateContract(new Rng(3), 'guild', 3, 100);
    expect(c.rewardChits).toBeGreaterThan(0);
  });
  it('raids are telegraphed, spaced, and losses are capped', () => {
    const st = newRaidState();
    const rng = new Rng(9);
    expect(maybeScheduleRaid(st, 24 + 6, rng, { pressure: { reavers: 1, custodians: 1 }, rank: 3, difficulty: 'hard' })).toBe(null);
    let plan = null;
    for (let d = 3; d < 30 && !plan; d++) plan = maybeScheduleRaid(st, d * 24 + 6, rng, { pressure: { reavers: 1, custodians: 0.2 }, rank: 3, difficulty: 'standard' });
    expect(plan).not.toBe(null);
    expect(plan!.arriveHour - plan!.warnHour).toBeGreaterThanOrEqual(5);
    expect(raidPhase(plan, plan!.warnHour + 0.1)).toBe('warning');
    expect(raidPhase(plan, plan!.arriveHour)).toBe('active');
    expect(maybeScheduleRaid(st, plan!.arriveHour + 30, rng, { pressure: { reavers: 1, custodians: 1 }, rank: 3, difficulty: 'standard' })).toBe(null);
    const lost = resolveRaidCoarse(plan!, 0, new Rng(1));
    expect(lost.won).toBe(false);
    expect(lost.stockLoss).toBeLessThanOrEqual(0.3);
    expect(resolveRaidCoarse(plan!, plan!.strength * 3, new Rng(1)).won).toBe(true);
  });
  it('early raids are sized to preparation, scale with difficulty, and fail softly', () => {
    const none = { walls: 0, traps: 0, turrets: 0, guards: 0, weapon: false };
    const ready = { walls: 6, traps: 2, turrets: 0, guards: 1, weapon: true };
    const plan = (raidIndex: number, difficulty: 'chill' | 'standard' | 'hard', prep = none, seed = 4) => {
      const st = newRaidState();
      const rng = new Rng(seed);
      for (let d = 3; d < 60; d++) {
        const p = maybeScheduleRaid(st, d * 24 + 6, rng, { pressure: { reavers: 1, custodians: 1 }, rank: 4, difficulty, raidIndex, prep });
        if (p) return p;
      }
      throw new Error('no raid');
    };
    // first raid with no defences: at most two grunts' worth, whatever the faction or rank
    for (let seed = 1; seed < 12; seed++) {
      const p = plan(0, 'standard', none, seed);
      expect(p.early).toBe(true);
      expect(p.strength).toBeLessThanOrEqual(26);
    }
    // preparation grows the raid a little, bounded
    expect(earlyRaidBudget(0, ready)).toBeGreaterThan(earlyRaidBudget(0, none));
    expect(earlyRaidBudget(0, { walls: 99, traps: 99, turrets: 9, guards: 9, weapon: true })).toBeLessThanOrEqual(34);
    expect(earlyRaidBudget(1, none)).toBeGreaterThan(earlyRaidBudget(0, none));
    // difficulty scales the squad size
    const n = (p: { units: { count: number }[] }) => p.units.reduce((s, u) => s + u.count, 0);
    expect(n(plan(0, 'chill', ready))).toBeLessThan(n(plan(0, 'hard', ready)));
    expect(n(plan(EARLY_RAIDS, 'chill'))).toBeLessThan(n(plan(EARLY_RAIDS, 'hard')));
    // later raids are not early and are bigger than the first
    expect(plan(EARLY_RAIDS, 'standard').early).toBe(false);
    expect(raidStrength(plan(EARLY_RAIDS, 'standard').units)).toBeGreaterThan(raidStrength(plan(0, 'standard').units));
    // soft failure on an early raid: ≤10% stores, nobody hurt
    const lost = resolveRaidCoarse(plan(0, 'standard'), 0, new Rng(1));
    expect(lost.won).toBe(false);
    expect(lost.stockLoss).toBeLessThanOrEqual(0.1);
    expect(lost.injuries).toBe(0);
    // grace after a loss: no raid for at least 3 days
    const st = newRaidState();
    finishRaid(st, 100, true);
    expect(maybeScheduleRaid(st, 100 + 24 * 2.5, new Rng(1), { pressure: { reavers: 5, custodians: 5 }, rank: 4, difficulty: 'hard', raidIndex: 1, prep: none })).toBe(null);
    // compass: x+ is east, z- is north
    expect(raidCompass(0)).toBe('E');
    expect(raidCompass(-Math.PI / 2)).toBe('N');
    expect(raidCompass(Math.PI / 2)).toBe('S');
    expect(raidCompass(Math.PI)).toBe('W');
  });
  it('hoursToRipe: a fresh watered carrot in spring ripens in about its grow days, faster when tended', () => {
    const c = plant(1, 'seed.carrot', 2 * 24)!;
    c.water = 1;
    c.nutrients = 1;
    const env = { hour: 2 * 24, weather: 'clear' as const, tended: 0 };
    const h = hoursToRipe(c, env);
    expect(h).toBeGreaterThan(3 * 24);
    expect(h).toBeLessThan(3 * 24 * 1.5);
    expect(hoursToRipe(c, { ...env, tended: 1 })).toBeLessThan(h);
    c.growth = 1;
    expect(hoursToRipe(c, env)).toBe(0);
  });
  it('time: seasons, sun, deterministic weather', () => {
    expect(seasonOf(0)).toBe('spring');
    expect(seasonOf(7 * 24)).toBe('summer');
    expect(seasonOf(28 * 24)).toBe('spring');
    expect(dayOf(49)).toBe(2);
    expect(isNight(23)).toBe(true);
    expect(sunAt(13).daylight).toBeGreaterThan(0.9);
    expect(sunAt(2).daylight).toBe(0);
    const a = [];
    for (let h = 0; h < 500; h += 4) a.push(weatherAt(42, h));
    const b = [];
    for (let h = 0; h < 500; h += 4) b.push(weatherAt(42, h));
    expect(a).toEqual(b);
    expect(weatherAt(42, 300)).toBe(a[75]);
    expect(new Set(a).size).toBeGreaterThan(2);
  });
  it('town board writes something human', () => {
    const b = townBoard([{ type: 'harvest', hour: 30, text: '', count: 25 }, { type: 'arrival', hour: 31, text: 'Ada Bell walked in.' }], 32, 1);
    expect(b.lines.length).toBeGreaterThanOrEqual(3);
    expect(b.title).toContain('Day 2');
    const quiet = townBoard([], 50, 1);
    expect(quiet.lines.length).toBe(2);
  });
});
