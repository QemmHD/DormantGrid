import { describe, expect, it } from 'vitest';
import { ITEMS, ITEM_MAP } from '../src/data/items';
import { RECIPES } from '../src/data/recipes';
import { PIECES } from '../src/data/pieces';
import { CROPS } from '../src/data/crops';
import { LIVESTOCK, GAME_ANIMALS } from '../src/data/livestock';
import { PERKS } from '../src/data/perks';
import { FACTIONS } from '../src/data/factions';
import { ENEMIES } from '../src/data/enemies';
import { TRAITS, FIRST_NAMES, LAST_NAMES } from '../src/data/survivorTraits';
import { QUESTS, QUEST_MAP, ENDINGS, resolveEnding } from '../src/data/quests';
import { PROP_SALVAGE, BUILDING_SALVAGE, CONTAINER_LOOT } from '../src/data/loot';
import { MATERIALS } from '@dg/shared';

describe('item catalogue', () => {
  it('has 80-120 items with unique ids and full text', () => {
    expect(ITEMS.length).toBeGreaterThanOrEqual(80);
    expect(ITEMS.length).toBeLessThanOrEqual(120);
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    for (const i of ITEMS) {
      expect(i.name.length, i.id).toBeGreaterThan(2);
      expect(i.desc.length, i.id).toBeGreaterThan(10);
      expect(i.icon, i.id).toBe('icon.' + i.id);
      expect(i.stack, i.id).toBeGreaterThan(0);
      expect(i.weight, i.id).toBeGreaterThanOrEqual(0);
      expect(/todo|lorem|placeholder|xxx/i.test(i.name + i.desc), i.id).toBe(false);
    }
  });
  it('covers all nine materials', () => {
    for (const m of MATERIALS) expect(ITEM_MAP.has('mat.' + m)).toBe(true);
  });
  it('tools and weapons have valid stats', () => {
    for (const i of ITEMS) {
      if (i.weapon) {
        expect(i.weapon.damage).toBeGreaterThan(0);
        if (i.weapon.ammo) expect(ITEM_MAP.has(i.weapon.ammo)).toBe(true);
      }
      if (i.tool) expect(i.tool.durability).toBeGreaterThan(0);
      if (i.places) expect(PIECES.some((p) => p.id === i.places)).toBe(true);
    }
  });
});

describe('recipes', () => {
  it('reference existing items only', () => {
    for (const r of RECIPES) {
      expect(ITEM_MAP.has(r.out), r.id).toBe(true);
      for (const x of r.inputs) expect(ITEM_MAP.has(x.item), `${r.id} <- ${x.item}`).toBe(true);
      if (r.blueprint) expect(ITEM_MAP.get(r.blueprint)?.category, r.id).toBe('blueprint');
      expect(r.count).toBeGreaterThan(0);
      expect(r.time).toBeGreaterThan(0);
    }
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
  });

  it('every item is reachable from raw sources (no unreachable items, no circular-only recipes)', () => {
    const raw = new Set<string>();
    for (const s of Object.values(PROP_SALVAGE)) for (const y of s.yields) raw.add(y.item);
    for (const s of Object.values(BUILDING_SALVAGE)) for (const y of s.yields) raw.add(y.item);
    for (const l of Object.values(CONTAINER_LOOT)) for (const y of l) raw.add(y.item);
    for (const e of ENEMIES) for (const l of e.loot) raw.add(l.item);
    for (const c of CROPS) {
      raw.add(c.produce);
      raw.add(c.seed);
    }
    for (const l of LIVESTOCK) for (const p of [...l.products, ...l.butcher]) raw.add(p.item);
    for (const a of GAME_ANIMALS) for (const b of a.butcher) raw.add(b.item);
    for (const f of FACTIONS) for (const s of f.sells) raw.add(s.item);
    raw.add('misc.guild_chit');
    for (const q of QUESTS) for (const it of q.reward.items ?? []) raw.add(it.item);
    // fixpoint over recipes
    const have = new Set(raw);
    let changed = true;
    while (changed) {
      changed = false;
      for (const r of RECIPES) {
        if (have.has(r.out)) continue;
        if (r.inputs.every((x) => have.has(x.item))) {
          have.add(r.out);
          changed = true;
        }
      }
    }
    const missing = ITEMS.filter((i) => !have.has(i.id)).map((i) => i.id);
    expect(missing).toEqual([]);
  });
});

describe('other data tables', () => {
  it('pieces have costs that exist', () => {
    for (const p of PIECES) {
      for (const tier of p.costs) for (const c of tier) expect(ITEM_MAP.has(c.item), p.id + c.item).toBe(true);
      if (p.fromItem) expect(ITEM_MAP.has(p.fromItem)).toBe(true);
      if (p.blueprint) expect(ITEM_MAP.has(p.blueprint)).toBe(true);
    }
  });
  it('crops: seeds and produce exist, stages = 4', () => {
    expect(CROPS.length).toBeGreaterThanOrEqual(6);
    for (const c of CROPS) {
      expect(ITEM_MAP.has(c.seed)).toBe(true);
      expect(ITEM_MAP.has(c.produce)).toBe(true);
      expect(c.stages.length).toBe(4);
      expect(new Set(c.stages).size).toBe(4);
    }
  });
  it('perks: 4 tracks x 8', () => {
    expect(PERKS.length).toBe(32);
    for (const t of ['scavenger', 'builder', 'fighter', 'provider']) expect(PERKS.filter((p) => p.track === t).length).toBe(8);
  });
  it('enemies, traits, names', () => {
    expect(ENEMIES.length).toBe(11);
    for (const e of ENEMIES) for (const l of e.loot) expect(ITEM_MAP.has(l.item), e.id + l.item).toBe(true);
    expect(TRAITS.length).toBeGreaterThanOrEqual(20);
    expect(FIRST_NAMES.length).toBeGreaterThanOrEqual(100);
    expect(LAST_NAMES.length).toBeGreaterThanOrEqual(50);
    expect(new Set(FIRST_NAMES).size).toBe(FIRST_NAMES.length);
  });
  it('quests: requirements exist, items exist, every act present, endings resolve', () => {
    for (const q of QUESTS) {
      for (const r of q.requires) expect(QUEST_MAP.has(r), q.id + r).toBe(true);
      for (const s of q.steps) {
        const o = s.obj;
        if (o.type === 'collect' || o.type === 'craft') expect(ITEM_MAP.has(o.item), q.id).toBe(true);
        if (o.type === 'build') expect(PIECES.some((p) => p.id === o.piece), q.id).toBe(true);
      }
    }
    expect(new Set(QUESTS.map((q) => q.act))).toEqual(new Set(['ember', 'reboot', 'contest', 'core']));
    expect(ENDINGS.length).toBeGreaterThanOrEqual(5);
    expect(resolveEnding('commons', { hearth: 80 }).id).toBe('end.commons');
    expect(resolveEnding('commons', { hearth: 0 }).id).toBe('end.fracture');
    expect(resolveEnding('guild', { guild: 0 }).id).toBe('end.sleep');
    expect(resolveEnding('sleep', {}).id).toBe('end.sleep');
  });
});
