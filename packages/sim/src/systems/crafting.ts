import type { RecipeDef, StationId } from '@dg/shared';
import { getItem } from '../data/items';
import { RECIPES, stationSatisfies } from '../data/recipes';
import { addItem, countItem, hasItems, removeItem, spaceFor, type Inventory } from './inventory';

export interface CraftContext {
  /** stations within reach (always includes 'hands') */
  stations: readonly StationId[];
  blueprints: readonly string[];
  rank: number;
  /** extra inventories reachable from nearby storage (consumed after the player inventory) */
  storage?: Inventory[];
  /** current game hour (stamps food for spoilage) */
  hour?: number;
}

export type CraftBlock = 'station' | 'blueprint' | 'rank' | 'materials' | 'space' | null;

export function recipeBlock(r: RecipeDef, inv: Inventory, ctx: CraftContext): CraftBlock {
  if (r.blueprint && !ctx.blueprints.includes(r.blueprint)) return 'blueprint';
  if (r.rank && ctx.rank < r.rank) return 'rank';
  if (!ctx.stations.some((s) => stationSatisfies(s, r.station))) return 'station';
  for (const x of r.inputs) if (available(inv, ctx, x.item) < x.count) return 'materials';
  if (spaceFor(inv, r.out) < r.count && !freesSlot(r, inv)) return 'space';
  return null;
}

function freesSlot(r: RecipeDef, inv: Inventory): boolean {
  // consuming a whole stack frees a slot
  return r.inputs.some((x) => inv.some((s) => s && s.id === x.item && s.n <= x.count));
}

function available(inv: Inventory, ctx: CraftContext, id: string): number {
  let n = countItem(inv, id);
  for (const s of ctx.storage ?? []) n += countItem(s, id);
  return n;
}

export function canCraft(r: RecipeDef, inv: Inventory, ctx: CraftContext): boolean {
  return recipeBlock(r, inv, ctx) === null;
}

/** Max times the recipe can be crafted with current materials (ignores space). */
export function craftableCount(r: RecipeDef, inv: Inventory, ctx: CraftContext): number {
  let m = Infinity;
  for (const x of r.inputs) m = Math.min(m, Math.floor(available(inv, ctx, x.item) / x.count));
  return m === Infinity ? 0 : m;
}

/** Perform the craft. All-or-nothing. Returns true on success. */
export function craft(r: RecipeDef, inv: Inventory, ctx: CraftContext): boolean {
  if (!canCraft(r, inv, ctx)) return false;
  for (const x of r.inputs) {
    let left = x.count - removeItem(inv, x.item, x.count);
    for (const s of ctx.storage ?? []) {
      if (left <= 0) break;
      left -= removeItem(s, x.item, left);
    }
  }
  const def = getItem(r.out);
  const extra: { d?: number; t?: number } = {};
  const dur = def?.tool?.durability ?? def?.weapon?.durability;
  if (dur) extra.d = dur;
  if (def?.food?.spoilHours !== undefined && ctx.hour !== undefined) extra.t = ctx.hour;
  let left = r.count;
  if (dur) {
    for (let i = 0; i < r.count; i++) left -= 1 - addItem(inv, r.out, 1, extra);
  } else left = addItem(inv, r.out, r.count, extra);
  // overflow goes to first storage, otherwise lost is impossible because canCraft checked space
  if (left > 0 && ctx.storage?.[0]) addItem(ctx.storage[0], r.out, left, extra);
  return true;
}

export function hasMaterials(r: RecipeDef, inv: Inventory): boolean {
  return hasItems(inv, r.inputs);
}

export interface RecipeQuery {
  text?: string;
  category?: string;
  craftableOnly?: boolean;
}

/** Searchable, filterable list for the crafting UI. Craftable first, then locked by reason. */
export function queryRecipes(inv: Inventory, ctx: CraftContext, q: RecipeQuery = {}): { recipe: RecipeDef; block: CraftBlock }[] {
  const t = q.text?.trim().toLowerCase();
  const out: { recipe: RecipeDef; block: CraftBlock }[] = [];
  for (const r of RECIPES) {
    const def = getItem(r.out);
    if (!def) continue;
    if (q.category && def.category !== q.category) continue;
    if (t && !def.name.toLowerCase().includes(t) && !def.id.includes(t)) continue;
    const block = recipeBlock(r, inv, ctx);
    if (q.craftableOnly && block) continue;
    out.push({ recipe: r, block });
  }
  const rank = (b: CraftBlock) => (b === null ? 0 : b === 'materials' || b === 'space' ? 1 : b === 'station' ? 2 : 3);
  out.sort((a, b) => rank(a.block) - rank(b.block));
  return out;
}

/** Blueprint items unlock when picked up/used. */
export function learnBlueprint(known: string[], itemId: string): boolean {
  if (!itemId.startsWith('bp.') || known.includes(itemId)) return false;
  known.push(itemId);
  return true;
}
