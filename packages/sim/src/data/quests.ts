// Campaign: four acts as a quest graph. Each quest has ordered steps; the client tracks
// world.quests[questId] = current step index (steps.length = complete).

import type { DistrictKey } from '@dg/shared';

export type Objective =
  | { type: 'collect'; item: string; count: number }
  | { type: 'craft'; item: string; count: number }
  | { type: 'build'; piece: string; count: number }
  | { type: 'reboot'; district: DistrictKey; count: number }
  | { type: 'reach'; district: DistrictKey }
  | { type: 'talk'; npc: string }
  | { type: 'rank'; rank: number }
  | { type: 'population'; count: number }
  | { type: 'survive'; nights: number }
  | { type: 'rep'; faction: string; min: number }
  | { type: 'choice'; key: string; options: string[] };

export interface QuestStep {
  text: string; // journal line
  hint: string; // contextual prompt
  obj: Objective;
}

export type Act = 'ember' | 'reboot' | 'contest' | 'core';
export const ACT_NAMES: Record<Act, string> = { ember: 'Act I — Ember', reboot: 'Act II — Reboot', contest: 'Act III — Contest', core: 'Act IV — Core' };

export interface QuestDef {
  id: string;
  act: Act;
  title: string;
  /** quest ids that must be complete first */
  requires: string[];
  steps: QuestStep[];
  reward: { items?: { item: string; count: number }[]; rep?: Record<string, number>; blueprints?: string[]; xp?: number };
  main: boolean;
}

export const QUESTS: readonly QuestDef[] = [
  // ---- Act I: Ember ----
  {
    id: 'q.first_light', act: 'ember', title: 'First Light', requires: [], main: true,
    steps: [
      { text: 'Strip something for parts. Anything. The city won’t mind.', hint: 'Hold Interact on a glowing prop to salvage it.', obj: { type: 'collect', item: 'mat.scrap', count: 6 } },
      { text: 'Gather timber from fences, pallets or furniture.', hint: 'Wooden props give timber.', obj: { type: 'collect', item: 'mat.timber', count: 6 } },
      { text: 'Build a campfire in Haven Lot.', hint: 'Open Build, pick Campfire, confirm on the ghost.', obj: { type: 'build', piece: 'campfire', count: 1 } },
      { text: 'Make a crowbar. Doors are only suggestions.', hint: 'Open Craft. Crowbars need hands and scrap.', obj: { type: 'craft', item: 'tool.crowbar', count: 1 } },
    ],
    reward: { items: [{ item: 'food.canned_beans', count: 2 }, { item: 'drink.clean_water', count: 2 }], xp: 50 },
  },
  {
    id: 'q.roof_over', act: 'ember', title: 'A Roof Over Your Head', requires: ['q.first_light'], main: true,
    steps: [
      { text: 'Lay four foundations.', hint: 'Foundations snap to a 4 m grid.', obj: { type: 'build', piece: 'foundation', count: 4 } },
      { text: 'Raise walls and a doorway.', hint: 'Walls snap to foundation edges.', obj: { type: 'build', piece: 'wall', count: 6 } },
      { text: 'Put a roof on it.', hint: 'Roofs need walls beneath them.', obj: { type: 'build', piece: 'roof', count: 4 } },
      { text: 'Build a bed and sleep through the night.', hint: 'Sleeping sets your respawn point.', obj: { type: 'survive', nights: 1 } },
    ],
    reward: { items: [{ item: 'seed.potato', count: 6 }, { item: 'seed.carrot', count: 6 }], xp: 80 },
  },
  {
    id: 'q.first_neighbors', act: 'ember', title: 'Neighbors', requires: ['q.roof_over'], main: true,
    steps: [
      { text: 'Build a workbench and a farm plot.', hint: 'Survivors only stay where there’s work and food.', obj: { type: 'build', piece: 'farm_plot', count: 2 } },
      { text: 'Find the woman signalling from the Residential Rows.', hint: 'Follow the mirror flashes north.', obj: { type: 'reach', district: 'residential' } },
      { text: 'Bring Haven to three residents.', hint: 'Beds attract survivors. One bed, one neighbor.', obj: { type: 'population', count: 3 } },
    ],
    reward: { items: [{ item: 'bp.workbench2', count: 1 }], rep: { hearth: 10 }, xp: 120 },
  },
  // ---- Act II: Reboot ----
  {
    id: 'q.first_node', act: 'reboot', title: 'Something Still Hums', requires: ['q.first_neighbors'], main: true,
    steps: [
      { text: 'Get a Grid fuse.', hint: 'Odile sells them for Guild chits (sell her scrap). Custodian heavies carry them too.', obj: { type: 'collect', item: 'misc.grid_fuse', count: 1 } },
      { text: 'Reach the control node in Old Downtown.', hint: 'The tall mast with the dead blue light.', obj: { type: 'reach', district: 'downtown' } },
      { text: 'Reboot the node and hold it until sync completes.', hint: 'Route power, then hold to sync. Then survive.', obj: { type: 'reboot', district: 'downtown', count: 1 } },
    ],
    reward: { items: [{ item: 'bp.workbench3', count: 1 }], rep: { hearth: 15, custodians: 5 }, xp: 250 },
  },
  {
    id: 'q.guild_contact', act: 'reboot', title: 'The Clipboard People', requires: ['q.first_node'], main: true,
    steps: [
      { text: 'Talk to Odile, the Meridian Guild factor trading at Haven Lot.', hint: 'She stands by the camp, east of the fire. Walk up and talk.', obj: { type: 'talk', npc: 'guild_factor' } },
      { text: 'Earn the Guild’s trust (reputation 15).', hint: 'Trade with Odile or finish her delivery contracts.', obj: { type: 'rep', faction: 'guild', min: 15 } },
    ],
    reward: { items: [{ item: 'misc.guild_chit', count: 40 }], blueprints: ['bp.nailgun'], xp: 150 },
  },
  {
    id: 'q.water', act: 'reboot', title: 'Running Water', requires: ['q.first_node'], main: true,
    steps: [
      { text: 'Reach the Waterworks.', hint: 'Follow the river south.', obj: { type: 'reach', district: 'waterworks' } },
      { text: 'Reboot the Waterworks node.', hint: 'The pumps start the moment it syncs.', obj: { type: 'reboot', district: 'waterworks', count: 1 } },
      { text: 'Grow Haven to Town Rank 3.', hint: 'Rank grows with people, power, and defenses.', obj: { type: 'rank', rank: 3 } },
    ],
    reward: { blueprints: ['bp.canning', 'bp.chemlab'], rep: { hearth: 15 }, xp: 300 },
  },
  // ---- Act III: Contest ----
  {
    id: 'q.toll', act: 'contest', title: 'The Toll', requires: ['q.water', 'q.guild_contact'], main: true,
    steps: [
      { text: 'The Reavers demand a cut of every harvest. Decide.', hint: 'Pay them, fight them, or bring the Guild in.', obj: { type: 'choice', key: 'toll', options: ['pay', 'fight', 'guild'] } },
      { text: 'Survive what comes next.', hint: 'Raids are announced. Use the warning.', obj: { type: 'survive', nights: 2 } },
      { text: 'Reboot the Rail Depot node.', hint: 'The Reavers’ stronghold. Or their new trading post.', obj: { type: 'reboot', district: 'rail', count: 1 } },
    ],
    reward: { blueprints: ['bp.reinforced', 'bp.crossbow'], xp: 400 },
  },
  {
    id: 'q.hospital', act: 'contest', title: 'Bedside Manner', requires: ['q.water'], main: false,
    steps: [
      { text: 'Reach the Hospital Campus.', hint: 'East of downtown, past the overturned buses.', obj: { type: 'reach', district: 'hospital' } },
      { text: 'Reboot the hospital node.', hint: 'The clinic reopens when the lights do.', obj: { type: 'reboot', district: 'hospital', count: 1 } },
    ],
    reward: { blueprints: ['bp.antibiotics'], items: [{ item: 'med.first_aid', count: 2 }], xp: 300 },
  },
  {
    id: 'q.industry', act: 'contest', title: 'Heavy Industry', requires: ['q.toll'], main: true,
    steps: [
      { text: 'Reboot the Industrial Yard node.', hint: 'Custodian heavies guard it. Bring friends.', obj: { type: 'reboot', district: 'industrial', count: 1 } },
      { text: 'Reach Town Rank 6.', hint: 'Restored districts count the most.', obj: { type: 'rank', rank: 6 } },
    ],
    reward: { blueprints: ['bp.turret'], xp: 500 },
  },
  // ---- Act IV: Core ----
  {
    id: 'q.core', act: 'core', title: 'The Grid Core', requires: ['q.industry'], main: true,
    steps: [
      { text: 'Reboot every remaining node in Old Downtown.', hint: 'The Core wakes when downtown is whole.', obj: { type: 'reboot', district: 'downtown', count: 3 } },
      { text: 'Enter the Grid Core beneath Old Downtown.', hint: 'The Custodians will not make this easy.', obj: { type: 'talk', npc: 'grid_core' } },
      { text: 'Choose the Grid’s fate.', hint: 'There is no undo.', obj: { type: 'choice', key: 'core', options: ['commons', 'guild', 'reavers', 'sleep', 'custodian'] } },
    ],
    reward: { xp: 1000 },
  },
];

export const QUEST_MAP: ReadonlyMap<string, QuestDef> = new Map(QUESTS.map((q) => [q.id, q]));

export interface EndingDef {
  id: string;
  title: string;
  /** required core choice */
  choice: 'commons' | 'guild' | 'reavers' | 'sleep' | 'custodian';
  /** extra reputation requirements; if unmet, fallback ending applies */
  rep?: Record<string, number>;
  text: string;
}

export const ENDINGS: readonly EndingDef[] = [
  { id: 'end.commons', title: 'The Commons', choice: 'commons', rep: { hearth: 50 }, text: 'You hand the Grid to everyone. Meetings get longer. Lights stay on anyway. Somebody paints the charter on the Core’s housing, pizza-box spelling and all.' },
  { id: 'end.guild', title: 'Metered', choice: 'guild', rep: { guild: 40 }, text: 'The Guild holds the keys and sends very polite invoices. The city glows, block by paid-up block. Haven gets a discount. For now.' },
  { id: 'end.reavers', title: 'Under New Management', choice: 'reavers', rep: { reavers: 30 }, text: 'The Reavers take the Core and call it protection. Trains run on time. Nobody asks where the fuel came from.' },
  { id: 'end.sleep', title: 'Lights Out', choice: 'sleep', text: 'You put the Grid to sleep for good. The machines stop. So do the pumps. Haven learns to live by candlelight and is, against all odds, fine.' },
  { id: 'end.custodian', title: 'Maintenance Restored', choice: 'custodian', rep: { custodians: 0 }, text: 'You give the Custodians a new last order: “people are infrastructure.” The drones start fixing gutters. One of them waves.' },
  { id: 'end.fracture', title: 'Fractured', choice: 'commons', text: 'You tried to give it to everyone, but not everyone trusted you. The Grid splinters into districts that don’t speak to each other. Haven’s lights stay on. Some of the others don’t.' },
];

/** Resolve ending from the core choice and reputation. */
export function resolveEnding(choice: EndingDef['choice'], rep: Record<string, number>): EndingDef {
  for (const e of ENDINGS) {
    if (e.choice !== choice || e.id === 'end.fracture') continue;
    const ok = !e.rep || Object.entries(e.rep).every(([f, min]) => (rep[f] ?? 0) >= min);
    if (ok) return e;
    if (choice === 'commons') return ENDINGS.find((x) => x.id === 'end.fracture')!;
    return ENDINGS.find((x) => x.id === 'end.sleep')!;
  }
  return ENDINGS.find((x) => x.id === 'end.sleep')!;
}
