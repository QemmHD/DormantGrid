// Grid inventory: a fixed-length array of slots. All ops mutate in place and
// never produce negative, NaN or over-stacked slots.

import type { ItemStack } from '@dg/shared';
import { ITEM_MAP, stackLimit } from '../data/items';

export type Inventory = (ItemStack | null)[];

export const PLAYER_SLOTS = 24;
export const BASE_CARRY_KG = 40;

export function createInventory(slots = PLAYER_SLOTS): Inventory {
  return new Array<ItemStack | null>(slots).fill(null);
}

function validCount(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function countItem(inv: Inventory, id: string): number {
  let c = 0;
  for (const s of inv) if (s && s.id === id) c += s.n;
  return c;
}

/** How many of `id` could be added (bounded by free space). */
export function spaceFor(inv: Inventory, id: string): number {
  const lim = stackLimit(id);
  let space = 0;
  for (const s of inv) {
    if (!s) space += lim;
    else if (s.id === id && s.d === undefined) space += Math.max(0, lim - s.n);
  }
  return space;
}

export function canAdd(inv: Inventory, id: string, n: number): boolean {
  return spaceFor(inv, id) >= validCount(n);
}

/**
 * Add items; fills existing stacks first, then empty slots.
 * Returns the number that did NOT fit (0 = all added).
 */
export function addItem(inv: Inventory, id: string, n: number, extra?: { d?: number; t?: number }): number {
  let left = validCount(n);
  if (!ITEM_MAP.has(id)) return left;
  const lim = stackLimit(id);
  const hasDur = extra?.d !== undefined;
  if (!hasDur) {
    for (const s of inv) {
      if (left <= 0) break;
      if (s && s.id === id && s.d === undefined && s.n < lim) {
        const k = Math.min(lim - s.n, left);
        s.n += k;
        if (extra?.t !== undefined) s.t = s.t === undefined ? extra.t : Math.min(s.t, extra.t);
        left -= k;
      }
    }
  }
  for (let i = 0; i < inv.length && left > 0; i++) {
    if (!inv[i]) {
      const k = Math.min(lim, left);
      const st: ItemStack = { id, n: k };
      if (extra?.d !== undefined) st.d = extra.d;
      if (extra?.t !== undefined) st.t = extra.t;
      inv[i] = st;
      left -= k;
    }
  }
  return left;
}

/** Remove up to n of id; returns number actually removed. Takes from the last stacks first. */
export function removeItem(inv: Inventory, id: string, n: number): number {
  let left = validCount(n);
  const want = left;
  for (let i = inv.length - 1; i >= 0 && left > 0; i--) {
    const s = inv[i];
    if (s && s.id === id) {
      const k = Math.min(s.n, left);
      s.n -= k;
      left -= k;
      if (s.n <= 0) inv[i] = null;
    }
  }
  return want - left;
}

export function hasItems(inv: Inventory, needs: { item: string; count: number }[]): boolean {
  return needs.every((x) => countItem(inv, x.item) >= x.count);
}

/** Remove all or nothing. */
export function takeItems(inv: Inventory, needs: { item: string; count: number }[]): boolean {
  if (!hasItems(inv, needs)) return false;
  for (const x of needs) removeItem(inv, x.item, x.count);
  return true;
}

export function totalWeight(inv: Inventory): number {
  let w = 0;
  for (const s of inv) if (s) w += (ITEM_MAP.get(s.id)?.weight ?? 0) * s.n;
  return Math.round(w * 100) / 100;
}

/** Move/merge/swap slot a into slot b (works across inventories). */
export function moveSlot(from: Inventory, a: number, to: Inventory, b: number): void {
  if (a < 0 || a >= from.length || b < 0 || b >= to.length) return;
  if (from === to && a === b) return;
  const sa = from[a];
  const sb = to[b];
  if (!sa) return;
  if (sb && sb.id === sa.id && sa.d === undefined && sb.d === undefined) {
    const lim = stackLimit(sa.id);
    const k = Math.min(lim - sb.n, sa.n);
    if (k > 0) {
      sb.n += k;
      sa.n -= k;
      if (sa.n <= 0) from[a] = null;
      return;
    }
  }
  from[a] = sb;
  to[b] = sa;
}

/** Split half of a stack into the first empty slot. Returns new slot index or -1. */
export function splitSlot(inv: Inventory, a: number, amount?: number): number {
  const s = inv[a];
  if (!s || s.n < 2) return -1;
  const k = Math.max(1, Math.min(s.n - 1, validCount(amount ?? Math.floor(s.n / 2))));
  const empty = inv.indexOf(null);
  if (empty < 0) return -1;
  s.n -= k;
  inv[empty] = { id: s.id, n: k, ...(s.t !== undefined ? { t: s.t } : {}) };
  return empty;
}

/** Transfer everything that fits from one inventory to another; returns count moved. */
export function transferAll(from: Inventory, to: Inventory): number {
  let moved = 0;
  for (let i = 0; i < from.length; i++) {
    const s = from[i];
    if (!s) continue;
    if (s.d !== undefined) {
      const e = to.indexOf(null);
      if (e >= 0) {
        to[e] = s;
        from[i] = null;
        moved += s.n;
      }
      continue;
    }
    const left = addItem(to, s.id, s.n, s.t !== undefined ? { t: s.t } : undefined);
    moved += s.n - left;
    if (left <= 0) from[i] = null;
    else s.n = left;
  }
  return moved;
}

/** Sort: category order then id; merges partial stacks. */
export function sortInventory(inv: Inventory): void {
  const order = ['tool', 'weapon', 'ammo', 'medicine', 'food', 'drink', 'seed', 'material', 'trap', 'defense', 'station', 'building', 'misc', 'blueprint'];
  const items = inv.filter((s): s is ItemStack => !!s);
  inv.fill(null);
  items.sort((a, b) => {
    const ca = order.indexOf(ITEM_MAP.get(a.id)?.category ?? 'misc');
    const cb = order.indexOf(ITEM_MAP.get(b.id)?.category ?? 'misc');
    return ca - cb || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  let i = 0;
  for (const s of items) {
    if (s.d === undefined) {
      const left = addItem(inv, s.id, s.n, s.t !== undefined ? { t: s.t } : undefined);
      if (left > 0) {
        // should not happen (same slot count), keep data safe
        while (i < inv.length && inv[i]) i++;
        if (i < inv.length) inv[i] = { id: s.id, n: left };
      }
    } else {
      const e = inv.indexOf(null);
      if (e >= 0) inv[e] = s;
    }
  }
}

/** Sanitize an inventory loaded from untrusted data. */
export function sanitizeInventory(raw: unknown, slots = PLAYER_SLOTS): Inventory {
  const inv = createInventory(slots);
  if (!Array.isArray(raw)) return inv;
  for (let i = 0; i < Math.min(raw.length, slots); i++) {
    const s = raw[i] as Partial<ItemStack> | null;
    if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !ITEM_MAP.has(s.id)) continue;
    const n = Math.min(validCount(Number(s.n)), stackLimit(s.id));
    if (n <= 0) continue;
    const st: ItemStack = { id: s.id, n };
    if (typeof s.d === 'number' && Number.isFinite(s.d)) st.d = Math.max(0, s.d);
    if (typeof s.t === 'number' && Number.isFinite(s.t)) st.t = s.t;
    inv[i] = st;
  }
  return inv;
}

/** Consume durability on a tool/weapon stack; returns true if it broke. */
export function wearSlot(inv: Inventory, slot: number, amount: number): boolean {
  const s = inv[slot];
  if (!s) return false;
  const def = ITEM_MAP.get(s.id);
  const max = def?.tool?.durability ?? def?.weapon?.durability;
  if (!max) return false;
  const cur = s.d ?? max;
  const next = Math.max(0, cur - Math.max(0, amount || 0));
  s.d = next;
  if (next <= 0) {
    inv[slot] = null;
    return true;
  }
  return false;
}

export function maxDurability(id: string): number | undefined {
  const def = ITEM_MAP.get(id);
  return def?.tool?.durability ?? def?.weapon?.durability;
}

/** Repair kit: restore 50% durability (+ perk bonus). */
export function repairSlot(inv: Inventory, slot: number, bonus = 0): boolean {
  const s = inv[slot];
  if (!s) return false;
  const max = maxDurability(s.id);
  if (!max) return false;
  if (removeItem(inv, 'tool.repair_kit', 1) < 1) return false;
  s.d = Math.min(max, (s.d ?? max) + max * 0.5 * (1 + bonus));
  return true;
}
