// Daily Town Board: a short, human summary of what happened overnight.

import { Rng } from '@dg/shared';
import type { TownEvent } from './survivors';
import { clockString, dayOf } from './time';

const OPENERS = [
  'Morning, Haven.',
  'Another day, another pot of something.',
  'The Ledger, as kept by whoever had the pencil.',
  'Overnight report. Coffee not included, because there is no coffee.',
  'Good morning. Mostly.',
];

const QUIET = [
  'Nothing happened. Somebody wrote “nothing happened” and underlined it twice.',
  'A quiet night. The crows held a meeting. No minutes were taken.',
  'All quiet. Suspiciously so. Guards report “vibes: fine.”',
];

const SIGNOFFS = [
  'Wash your hands.',
  'Whoever took the good ladle: we know.',
  'Lights on soon. Probably.',
  'Be kind to the new people.',
  'Do not feed the drones.',
];

export interface BoardSummary {
  day: number;
  title: string;
  lines: string[];
}

/** Build a 2–5 line summary from a day's events. Deterministic for (day, events). */
export function townBoard(events: readonly TownEvent[], hour: number, seed: number): BoardSummary {
  const day = dayOf(hour);
  const rng = new Rng((seed ^ (day * 2654435761)) >>> 0);
  const lines: string[] = [];
  const byType = (t: TownEvent['type']) => events.filter((e) => e.type === t);

  const harvest = byType('harvest').reduce((a, e) => a + (e.count ?? 0), 0);
  if (harvest > 0) lines.push(harvest > 20 ? `Big harvest: ${harvest} produce in the stores. The farmers are insufferable about it.` : `Harvest: ${harvest} produce brought in.`);

  for (const e of byType('arrival').slice(0, 2)) lines.push(e.text);
  for (const e of byType('blueprint').slice(0, 1)) lines.push(e.text);
  const conflicts = byType('conflict');
  if (conflicts.length) lines.push(conflicts[0].text + (conflicts.length > 1 ? ` (${conflicts.length - 1} more disagreements, all equally important.)` : ''));
  const friends = byType('friendship');
  if (friends.length) lines.push(friends[0].text);
  const injuries = byType('injury');
  if (injuries.length) lines.push(`${injuries.length === 1 ? injuries[0].text : `${injuries.length} people hurt.`} The nurse would like a word with everyone.`);
  for (const e of byType('recovered').slice(0, 1)) lines.push(e.text);
  const spoiled = byType('spoiled').reduce((a, e) => a + (e.count ?? 0), 0);
  if (spoiled > 0) lines.push(`${spoiled} food spoiled. The compost heap thanks you.`);
  const starving = byType('starving');
  if (starving.length) lines.push(`${starving.length} went hungry. We need more food on the Board.`);
  for (const e of byType('left')) lines.push(e.text);
  for (const e of byType('death')) lines.push(e.text);
  for (const e of byType('livestock').slice(0, 1)) lines.push(e.text);

  if (lines.length === 0) lines.push(rng.pick(QUIET));
  const trimmed = lines.slice(0, 5);
  trimmed.push(rng.pick(SIGNOFFS));
  return { day, title: `Day ${day + 1} — ${rng.pick(OPENERS)}`, lines: trimmed };
}

export function eventTime(e: TownEvent): string {
  return clockString(e.hour);
}
