// Campaign quest tracking + persistence helpers for state stored in WorldSave.flags.
// Flag conventions (all in world.flags):
//   crafted:<itemId>  number   built:<pieceId> number   reached:<districtKey> true
//   talk:<npcId> true          choice:<key> string      nights number
//   raid.last number           raid.pending string (JSON RaidPlan)

import type { DistrictKey, WorldSave } from '@dg/shared';
import { QUESTS, QUEST_MAP, type Objective, type QuestDef } from '../data/quests';
import type { Inventory } from './inventory';
import { countItem } from './inventory';
import { newRaidState, type RaidPlan, type RaidSchedulerState } from './raids';

export interface QuestContext {
  inventory: Inventory;
  rank: number;
  /** district key by index, to map world.districts[] */
  districtKeys: readonly DistrictKey[];
}

export function bumpFlag(world: WorldSave, key: string, by = 1): number {
  const v = Number(world.flags[key] ?? 0) + by;
  world.flags[key] = v;
  return v;
}

function nodesOnlineIn(world: WorldSave, ctx: QuestContext, key: DistrictKey): number {
  let n = 0;
  world.districts.forEach((d, i) => {
    if (ctx.districtKeys[i] === key) n += d.nodesOnline.length;
  });
  return n;
}

export function objectiveProgress(world: WorldSave, obj: Objective, ctx: QuestContext): { have: number; need: number } {
  switch (obj.type) {
    case 'collect':
      return { have: Math.min(obj.count, countItem(ctx.inventory, obj.item)), need: obj.count };
    case 'craft':
      return { have: Math.min(obj.count, Number(world.flags[`crafted:${obj.item}`] ?? 0)), need: obj.count };
    case 'build': {
      const ids = obj.piece === 'wall' ? ['wall', 'doorway', 'window'] : [obj.piece];
      const n = world.pieces.filter((p) => ids.includes(p.piece)).length;
      return { have: Math.min(obj.count, n), need: obj.count };
    }
    case 'reboot':
      return { have: Math.min(obj.count, nodesOnlineIn(world, ctx, obj.district)), need: obj.count };
    case 'reach':
      return { have: world.flags[`reached:${obj.district}`] ? 1 : 0, need: 1 };
    case 'talk':
      return { have: world.flags[`talk:${obj.npc}`] ? 1 : 0, need: 1 };
    case 'rank':
      return { have: Math.min(obj.rank, ctx.rank), need: obj.rank };
    case 'population':
      return { have: Math.min(obj.count, world.survivors.filter((s) => s.alive).length), need: obj.count };
    case 'survive':
      return { have: Math.min(obj.nights, Number(world.flags['nights'] ?? 0) - Number(world.flags[`nights@${obj.nights}`] ?? 0)), need: obj.nights };
    case 'rep':
      return { have: Math.max(0, Math.min(obj.min, world.factions[obj.faction] ?? 0)), need: obj.min };
    case 'choice':
      return { have: world.flags[`choice:${obj.key}`] ? 1 : 0, need: 1 };
  }
}

export function isQuestDone(world: WorldSave, q: QuestDef): boolean {
  return (world.quests[q.id] ?? 0) >= q.steps.length;
}

export function activeQuests(world: WorldSave): QuestDef[] {
  return QUESTS.filter((q) => !isQuestDone(world, q) && q.requires.every((r) => QUEST_MAP.get(r) && isQuestDone(world, QUEST_MAP.get(r)!)));
}

export interface QuestEvent {
  quest: string;
  step: number;
  completedQuest: boolean;
}

/** Advance any active quest steps whose objectives are met. Call after relevant actions. */
export function advanceQuests(world: WorldSave, ctx: QuestContext): QuestEvent[] {
  const out: QuestEvent[] = [];
  for (let guard = 0; guard < 20; guard++) {
    let progressed = false;
    for (const q of activeQuests(world)) {
      const step = world.quests[q.id] ?? 0;
      const s = q.steps[step];
      if (!s) continue;
      // 'survive' counts nights from when the step became active
      if (s.obj.type === 'survive' && world.flags[`nights@${s.obj.nights}`] === undefined) world.flags[`nights@${s.obj.nights}`] = Number(world.flags['nights'] ?? 0);
      const p = objectiveProgress(world, s.obj, ctx);
      if (p.have >= p.need) {
        world.quests[q.id] = step + 1;
        if (s.obj.type === 'survive') delete world.flags[`nights@${s.obj.nights}`];
        const done = step + 1 >= q.steps.length;
        out.push({ quest: q.id, step, completedQuest: done });
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return out;
}

export function loadRaidState(world: WorldSave): RaidSchedulerState {
  const st = newRaidState();
  const last = world.flags['raid.last'];
  if (typeof last === 'number') st.lastRaidHour = last;
  const next = world.flags['raid.nextId'];
  if (typeof next === 'number') st.nextId = next;
  const pending = world.flags['raid.pending'];
  if (typeof pending === 'string' && pending.length < 4000) {
    try {
      const p = JSON.parse(pending) as RaidPlan;
      if (p && typeof p.arriveHour === 'number' && Array.isArray(p.units)) st.pending = p;
    } catch {
      /* corrupt: ignore */
    }
  }
  return st;
}

export function storeRaidState(world: WorldSave, st: RaidSchedulerState): void {
  world.flags['raid.last'] = st.lastRaidHour;
  world.flags['raid.nextId'] = st.nextId;
  if (st.pending) world.flags['raid.pending'] = JSON.stringify(st.pending);
  else delete world.flags['raid.pending'];
}
