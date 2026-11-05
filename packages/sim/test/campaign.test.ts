// Progression + campaign: perk budget, choices, every ending reachable,
// a next step always visible, and schema-2 saves still load (with credit).
import { describe, expect, it } from 'vitest';
import { DISTRICT_KEYS, SAVE_SCHEMA_VERSION, type GameSave, type SurvivorSave } from '@dg/shared';
import { migrateSave, newGame, validateSave } from '../src/save/index';
import { ENDINGS, QUESTS, type Objective } from '../src/data/quests';
import { PERKS, canTakePerk } from '../src/data/perks';
import { addItem } from '../src/systems/inventory';
import { advanceQuests, isQuestDone, type QuestContext } from '../src/systems/progression';
import { CORE_CHOICES, TOLL_OUTCOMES, applyChoice, applyQuestRewards, campaignPerkBudget, choicePending, endingPreview, levelProgress, nextStep, type CoreChoice } from '../src/systems/campaign';
import { playerLevel } from '../src/systems/rank';
import { SAVE_V2 } from './fixtures/save-v2';

const NODES_TOTAL = 15; // seed 1337 world: downtown 3, residential 2, industrial 3, waterworks 2, outskirts 2, market/hospital/rail 1

function ctxFor(s: GameSave, rank: { v: number }): QuestContext {
  return { inventory: s.player.inventory, rank: rank.v, districtKeys: DISTRICT_KEYS };
}

/** Do whatever the current step asks, the way play would (choices via applyChoice). */
function satisfy(s: GameSave, obj: Objective, rank: { v: number }, picks: Record<string, string>): void {
  const w = s.world;
  switch (obj.type) {
    case 'collect':
      addItem(s.player.inventory, obj.item, obj.count);
      return;
    case 'craft':
      w.flags[`crafted:${obj.item}`] = obj.count;
      return;
    case 'build':
      for (let i = 0; i < obj.count; i++) w.pieces.push({ id: w.nextPieceId++, piece: obj.piece, tier: 1, x: i * 4, y: 0, z: 0, rot: 0, hp: 100 });
      return;
    case 'reboot': {
      const d = w.districts[DISTRICT_KEYS.indexOf(obj.district)];
      for (let i = d.nodesOnline.length; i < obj.count; i++) d.nodesOnline.push(100 + i + DISTRICT_KEYS.indexOf(obj.district) * 10);
      return;
    }
    case 'reach':
      w.flags[`reached:${obj.district}`] = true;
      return;
    case 'talk':
      w.flags[`talk:${obj.npc}`] = true;
      return;
    case 'rank':
      rank.v = Math.max(rank.v, obj.rank);
      return;
    case 'population':
      while (w.survivors.length < obj.count) w.survivors.push({ id: w.survivors.length + 1, alive: true } as SurvivorSave);
      return;
    case 'survive':
      w.flags['nights'] = Number(w.flags['nights'] ?? 0) + obj.nights;
      return;
    case 'rep':
      w.factions[obj.faction] = Math.max(w.factions[obj.faction] ?? 0, obj.min);
      return;
    case 'choice':
      expect(choicePending(w, obj.key)).toBe(true);
      expect(applyChoice(w, obj.key, picks[obj.key])).toBe(true);
      return;
  }
}

/** Play the whole main campaign; returns the save and every next-step text seen. */
function playCampaign(picks: Record<string, string>, repTweak?: (r: Record<string, number>) => void): { s: GameSave; seen: string[] } {
  const s = newGame(1337, 'standard', { x: 226, z: 658 });
  const rank = { v: 1 };
  const seen: string[] = [];
  for (let guard = 0; guard < 200; guard++) {
    const ctx = ctxFor(s, rank);
    for (const e of advanceQuests(s.world, ctx)) if (e.completedQuest) applyQuestRewards(s.world, QUESTS.find((q) => q.id === e.quest)!);
    const n = nextStep(s.world, ctx);
    if (!n) break;
    seen.push(n.step.text);
    expect(n.step.hint.length).toBeGreaterThan(5);
    if (n.step.obj.type === 'choice' && n.step.obj.key === 'core') repTweak?.(s.world.factions);
    satisfy(s, n.step.obj, rank, picks);
  }
  return { s, seen };
}

describe('campaign is completable through play', () => {
  it('main path reaches the core choice and every main quest completes, with a visible next step at each stage', () => {
    const { s, seen } = playCampaign({ toll: 'fight', core: 'sleep' });
    for (const q of QUESTS.filter((x) => x.main)) expect(isQuestDone(s.world, q), q.id).toBe(true);
    const mainSteps = QUESTS.filter((x) => x.main).reduce((n, q) => n + q.steps.length, 0);
    expect(seen.length).toBeGreaterThanOrEqual(mainSteps);
    expect(s.world.flags['ending']).toBe('end.sleep');
  });

  it('the toll choice changes reputation as advertised', () => {
    for (const opt of Object.keys(TOLL_OUTCOMES)) {
      const s = newGame(1, 'standard', { x: 0, z: 0 });
      const before = { ...s.world.factions };
      s.world.quests['q.first_light'] = 4; // irrelevant to applyChoice; it only needs a valid option
      expect(applyChoice(s.world, 'toll', opt)).toBe(true);
      for (const [f, d] of Object.entries(TOLL_OUTCOMES[opt])) expect(s.world.factions[f]).toBe((before[f] ?? 0) + d);
      expect(applyChoice(s.world, 'toll', opt)).toBe(false); // no undo
    }
    expect(applyChoice(newGame(1, 'standard', { x: 0, z: 0 }).world, 'toll', 'bribe')).toBe(false);
  });

  it('all six endings are reachable by a faction path', () => {
    const paths: [string, Record<string, string>, (r: Record<string, number>) => void][] = [
      // quest rewards + fighting the toll give Hearth 70 with no extra work
      ['end.commons', { toll: 'fight', core: 'commons' }, () => {}],
      // Hearth trust lost elsewhere (e.g. survivors dying, paying the toll) → the Commons fractures
      ['end.fracture', { toll: 'pay', core: 'commons' }, (r) => (r['hearth'] = 30)],
      // Guild: 15 from the quest + 15 for bringing them in on the toll + 10 from trades/contracts
      ['end.guild', { toll: 'guild', core: 'guild' }, (r) => (r['guild'] += 10)],
      ['end.reavers', { toll: 'pay', core: 'reavers' }, () => {}],
      ['end.sleep', { toll: 'fight', core: 'sleep' }, () => {}],
      // Custodians: -50 start, +5 quest, +5 per node rebooted (10 nodes)
      ['end.custodian', { toll: 'fight', core: 'custodian' }, (r) => (r['custodians'] += 50)],
    ];
    const got = new Set<string>();
    for (const [want, picks, tweak] of paths) {
      const { s } = playCampaign(picks, tweak);
      expect(s.world.flags['ending'], want).toBe(want);
      got.add(String(s.world.flags['ending']));
    }
    expect(got.size).toBe(ENDINGS.length);
  });

  it('paying the toll alone is enough reputation for the Reaver ending', () => {
    const s = newGame(1, 'standard', { x: 0, z: 0 });
    applyChoice(s.world, 'toll', 'pay');
    expect(endingPreview('reavers', s.world.factions).met).toBe(true);
  });

  it('ending previews explain unmet requirements', () => {
    const p = endingPreview('commons', { hearth: 20 });
    expect(p.met).toBe(false);
    expect(p.result.id).toBe('end.fracture');
    expect(p.needs).toEqual([{ faction: 'hearth', min: 50, have: 20 }]);
    for (const c of CORE_CHOICES) expect(endingPreview(c as CoreChoice, {}).target.choice).toBe(c);
  });
});

describe('perks are reachable', () => {
  it('a full campaign alone grants enough points for all 32 perks', () => {
    expect(PERKS.length).toBe(32);
    expect(campaignPerkBudget(NODES_TOTAL)).toBeGreaterThanOrEqual(32);
  });

  it('every perk can be taken in tier order', () => {
    const owned: string[] = [];
    for (let tier = 1; tier <= 8; tier++)
      for (const p of PERKS.filter((x) => x.tier === tier)) {
        expect(canTakePerk(owned, p.id, 1), p.id).toBe(true);
        owned.push(p.id);
      }
    expect(owned.length).toBe(32);
  });

  it('a tier needs the previous tier of its track', () => {
    const t2 = PERKS.find((p) => p.track === 'fighter' && p.tier === 2)!;
    expect(canTakePerk([], t2.id, 5)).toBe(false);
  });

  it('level progress is consistent with playerLevel', () => {
    for (const xp of [0, 50, 99, 100, 101, 354, 355, 5000]) {
      const lp = levelProgress(xp);
      expect(lp.level).toBe(playerLevel(xp));
      expect(lp.into).toBeLessThan(lp.need);
    }
  });
});

describe('schema 2 → 3 migration', () => {
  const v2 = () => JSON.parse(JSON.stringify(SAVE_V2)) as Record<string, unknown>;

  it('a save written by the schema-2 build still loads', () => {
    const raw = v2();
    expect(raw['schema']).toBe(2);
    const s = migrateSave(raw);
    expect(s.schema).toBe(SAVE_SCHEMA_VERSION);
    expect(() => validateSave(s)).not.toThrow();
    expect(s.player.inventory[1]).toEqual({ id: 'tool.crowbar', n: 1, d: 61 });
    expect(s.world.quests['q.roof_over']).toBe(4);
    expect(s.world.districts[1].nodesOnline).toEqual([0]);
  });

  it('credits past progress once: quest XP, node XP, perk points, Custodian rep', () => {
    const s = migrateSave(v2());
    // first_light 50 + roof_over 80 + one node 150
    expect(s.player.xp).toBe(280);
    // 2 quests + 1 node + 1 level (280 xp → level 2)
    expect(s.player.perkPoints).toBe(4);
    expect(s.world.factions['custodians']).toBe(-45);
    // migrating the result again changes nothing
    const again = migrateSave(JSON.parse(JSON.stringify(s)));
    expect(again.player.xp).toBe(280);
    expect(again.player.perkPoints).toBe(4);
  });
});
