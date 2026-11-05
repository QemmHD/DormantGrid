// Campaign + progression rules shared by the client and save migration:
// XP values, perk point sources, faction choices and ending previews.
// Pure data in, data out. The client applies these and shows the UI.

import type { WorldSave } from '@dg/shared';
import { ENDINGS, QUESTS, QUEST_MAP, resolveEnding, type EndingDef, type QuestDef, type QuestStep } from '../data/quests';
import { xpForLevel } from '../data/perks';
import { activeQuests, objectiveProgress, type QuestContext } from './progression';
import { playerLevel } from './rank';

/** XP per action. One level = one perk point (see xpForLevel). */
export const XP = {
  salvage: 2,
  salvageHeavy: 4,
  search: 1,
  craft: 4,
  build: 3,
  harvest: 3,
  kill: 12,
  killHeavy: 30,
  night: 25,
  arrival: 30,
  lore: 15,
  contract: 20,
  node: 150,
} as const;

/** Bonus perk points outside levelling: every Grid node rebooted, every quest finished. */
export const PERK_POINT_PER_NODE = 1;
export const PERK_POINT_PER_QUEST = 1;
/** Custodians warm to people who maintain the Grid. */
export const NODE_CUSTODIAN_REP = 5;

/** Act III toll decision: reputation changes per option. */
export const TOLL_OUTCOMES: Record<string, Record<string, number>> = {
  pay: { reavers: 35, hearth: -5 },
  fight: { reavers: -25, hearth: 10 },
  guild: { guild: 15, reavers: -10 },
};

export type CoreChoice = EndingDef['choice'];
export const CORE_CHOICES: readonly CoreChoice[] = ['commons', 'guild', 'reavers', 'sleep', 'custodian'];

/** Level and progress toward the next perk point. */
export function levelProgress(xp: number): { level: number; into: number; need: number } {
  const level = playerLevel(xp);
  let base = 0;
  for (let l = 1; l < level; l++) base += xpForLevel(l);
  return { level, into: Math.max(0, xp - base), need: xpForLevel(level) };
}

function clampRep(v: number): number {
  return Math.max(-100, Math.min(100, Math.round(v * 10) / 10));
}

export function applyRep(world: WorldSave, delta: Record<string, number> | undefined): void {
  if (!delta) return;
  for (const [f, d] of Object.entries(delta)) world.factions[f] = clampRep((world.factions[f] ?? 0) + d);
}

/** World-side quest rewards (reputation + blueprints). Items/XP are the player's, applied by the client. */
export function applyQuestRewards(world: WorldSave, q: QuestDef): void {
  applyRep(world, q.reward.rep);
  for (const bp of q.reward.blueprints ?? []) if (!world.blueprints.includes(bp)) world.blueprints.push(bp);
}

/** The option list for a choice objective, if any active quest step is that choice. */
export function choiceOptions(key: string): readonly string[] {
  for (const q of QUESTS) for (const s of q.steps) if (s.obj.type === 'choice' && s.obj.key === key) return s.obj.options;
  return [];
}

/** Record a campaign decision. Returns false if the option is unknown or already decided. */
export function applyChoice(world: WorldSave, key: string, option: string): boolean {
  if (world.flags[`choice:${key}`]) return false;
  if (!choiceOptions(key).includes(option)) return false;
  world.flags[`choice:${key}`] = option;
  if (key === 'toll') applyRep(world, TOLL_OUTCOMES[option]);
  if (key === 'core') world.flags['ending'] = resolveEnding(option as CoreChoice, world.factions).id;
  return true;
}

export interface StepInfo {
  quest: QuestDef;
  index: number;
  step: QuestStep;
  have: number;
  need: number;
}

/** The step the player should do next: first active main quest, else first active side quest. */
export function nextStep(world: WorldSave, ctx: QuestContext): StepInfo | null {
  const act = activeQuests(world);
  const q = act.find((x) => x.main) ?? act[0];
  if (!q) return null;
  const index = world.quests[q.id] ?? 0;
  const step = q.steps[index];
  if (!step) return null;
  const p = objectiveProgress(world, step.obj, ctx);
  return { quest: q, index, step, ...p };
}

/** Is a given choice step the current step of an active quest? */
export function choicePending(world: WorldSave, key: string): boolean {
  for (const q of activeQuests(world)) {
    const s = q.steps[world.quests[q.id] ?? 0];
    if (s?.obj.type === 'choice' && s.obj.key === key && !world.flags[`choice:${key}`]) return true;
  }
  return false;
}

export interface EndingPreview {
  choice: CoreChoice;
  /** the ending this choice aims for */
  target: EndingDef;
  /** what you would actually get right now */
  result: EndingDef;
  /** reputation requirements of the target, with current values */
  needs: { faction: string; min: number; have: number }[];
  met: boolean;
}

export function endingPreview(choice: CoreChoice, rep: Record<string, number>): EndingPreview {
  const target = ENDINGS.find((e) => e.choice === choice && e.id !== 'end.fracture')!;
  const needs = Object.entries(target.rep ?? {}).map(([faction, min]) => ({ faction, min, have: rep[faction] ?? 0 }));
  const result = resolveEnding(choice, rep);
  return { choice, target, result, needs, met: result.id === target.id };
}

/** All six endings and how each one is reached. */
export function endingPaths(rep: Record<string, number>): { ending: EndingDef; how: string; met: boolean }[] {
  return ENDINGS.map((e) => {
    if (e.id === 'end.fracture') return { ending: e, how: 'Choose the Commons without enough Hearth trust', met: (rep['hearth'] ?? 0) < 50 };
    const req = Object.entries(e.rep ?? {});
    const how = req.length ? req.map(([f, min]) => `${f} ≥ ${min}`).join(', ') : 'no requirement';
    return { ending: e, how, met: req.every(([f, min]) => (rep[f] ?? 0) >= min) };
  });
}

/** Total perk points a full campaign grants on its own (quests + nodes + levels from their XP). */
export function campaignPerkBudget(nodesTotal: number): number {
  const questXp = QUESTS.reduce((s, q) => s + (q.reward.xp ?? 0), 0);
  const xp = questXp + nodesTotal * XP.node;
  return QUESTS.length * PERK_POINT_PER_QUEST + nodesTotal * PERK_POINT_PER_NODE + (playerLevel(xp) - 1);
}

/**
 * Schema 2 → 3: progression was not applied before (XP never granted, quest
 * rep ignored). Credit completed quests and online nodes once. Mutates raw objects.
 */
export function retroactiveProgress(
  player: { xp?: unknown; perkPoints?: unknown },
  world: { quests?: unknown; districts?: unknown; factions?: unknown },
): { xp: number; points: number } {
  const quests = (world.quests && typeof world.quests === 'object' ? world.quests : {}) as Record<string, unknown>;
  const factions = (world.factions && typeof world.factions === 'object' ? world.factions : {}) as Record<string, number>;
  let xp = 0;
  let points = 0;
  for (const [id, v] of Object.entries(quests)) {
    const q = QUEST_MAP.get(id);
    if (!q || typeof v !== 'number' || v < q.steps.length) continue;
    xp += q.reward.xp ?? 0;
    points += PERK_POINT_PER_QUEST;
    for (const [f, d] of Object.entries(q.reward.rep ?? {})) factions[f] = clampRep((Number(factions[f]) || 0) + d);
  }
  let nodes = 0;
  if (Array.isArray(world.districts)) for (const d of world.districts) if (d && typeof d === 'object' && Array.isArray((d as { nodesOnline?: unknown }).nodesOnline)) nodes += (d as { nodesOnline: unknown[] }).nodesOnline.length;
  xp += nodes * XP.node;
  points += nodes * PERK_POINT_PER_NODE;
  if (nodes) factions['custodians'] = clampRep((Number(factions['custodians']) || 0) + nodes * NODE_CUSTODIAN_REP);
  world.factions = factions;
  const before = Number(player.xp) || 0;
  const after = before + xp;
  points += playerLevel(after) - playerLevel(before);
  player.xp = after;
  player.perkPoints = (Number(player.perkPoints) || 0) + points;
  return { xp, points };
}

