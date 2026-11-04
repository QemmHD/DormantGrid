// Base building: snapping, placement validation and stability.
// Logical coordinates: x/z meters, y = level * STOREY. Cell (i,j) spans [i*4, i*4+4).
// Edge pieces: rot 0/2 lie along x on the line z = j*4 (centered x = i*4+2);
//              rot 1/3 lie along z on the line x = i*4 (centered z = j*4+2).

import type { PlacedPiece } from '@dg/shared';
import { FREE_GRID, GRID, STOREY, TIER_LOSS_MULT, getPiece, type PieceDef } from '../data/pieces';

export const MIN_STABILITY = 5;
export const MAX_LEVEL = 4;

/** Stability loss per hop (before tier multiplier). */
const LOSS = { wallOnBase: 8, wallOnWall: 12, floorOnWall: 10, floorSide: 24, stairs: 5 };

export type Candidate = Omit<PlacedPiece, 'id' | 'hp'> & { id?: number };

export function levelOf(y: number): number {
  return Math.max(0, Math.round(y / STOREY));
}

/** Snap a raw aim point to a valid slot for the piece. yaw in radians. */
export function snapPiece(pieceId: string, x: number, y: number, z: number, yaw: number): { x: number; y: number; z: number; rot: 0 | 1 | 2 | 3 } {
  const def = getPiece(pieceId);
  const L = Math.min(MAX_LEVEL, levelOf(y));
  let rot = (((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  if (!def || def.snap === 'free') {
    return { x: Math.round(x / FREE_GRID) * FREE_GRID, y: L * STOREY, z: Math.round(z / FREE_GRID) * FREE_GRID, rot };
  }
  if (def.snap === 'cell') {
    return { x: Math.floor(x / GRID) * GRID + GRID / 2, y: L * STOREY, z: Math.floor(z / GRID) * GRID + GRID / 2, rot };
  }
  // edge: pick the nearest edge of the containing cell
  const i = Math.floor(x / GRID);
  const j = Math.floor(z / GRID);
  const fx = x / GRID - i;
  const fz = z / GRID - j;
  const dN = fz; // to line z=j*4
  const dS = 1 - fz;
  const dW = fx;
  const dE = 1 - fx;
  const m = Math.min(dN, dS, dW, dE);
  if (m === dN || m === dS) {
    rot = (rot % 2 === 0 ? rot : 0) as 0 | 2;
    return { x: i * GRID + GRID / 2, y: L * STOREY, z: (m === dN ? j : j + 1) * GRID, rot };
  }
  rot = (rot % 2 === 1 ? rot : 1) as 1 | 3;
  return { x: (m === dW ? i : i + 1) * GRID, y: L * STOREY, z: j * GRID + GRID / 2, rot };
}

interface Indexed {
  p: Candidate;
  def: PieceDef;
  L: number;
}

function slotKey(c: Candidate, def: PieceDef): string | null {
  const L = levelOf(c.y);
  if (def.snap === 'cell') {
    const i = Math.floor(c.x / GRID);
    const j = Math.floor(c.z / GRID);
    return `${def.kind === 'stairs' ? 's' : 'c'}${i},${j},${L}`;
  }
  if (def.snap === 'edge') {
    if (c.rot % 2 === 0) return `h${Math.floor(c.x / GRID)},${Math.round(c.z / GRID)},${L}`;
    return `v${Math.round(c.x / GRID)},${Math.floor(c.z / GRID)},${L}`;
  }
  return null;
}

class PieceIndex {
  cells = new Map<string, Indexed>(); // surface pieces: foundation/floor/roof
  edges = new Map<string, Indexed>();
  list: Indexed[] = [];
  constructor(pieces: readonly Candidate[]) {
    for (const p of pieces) this.add(p);
  }
  add(p: Candidate): Indexed | null {
    const def = getPiece(p.piece);
    if (!def) return null;
    const ix: Indexed = { p, def, L: levelOf(p.y) };
    this.list.push(ix);
    const k = slotKey(p, def);
    if (k) {
      if (def.snap === 'edge') this.edges.set(k, ix);
      else if (def.kind !== 'stairs') this.cells.set(k, ix);
    }
    return ix;
  }
  cell(i: number, j: number, L: number): Indexed | undefined {
    return this.cells.get(`c${i},${j},${L}`);
  }
  edge(key: string): Indexed | undefined {
    return this.edges.get(key);
  }
}

/** Supports of a piece: list of [supporter, loss]. 'ground' => grounded value. */
function supports(ix: Indexed, idx: PieceIndex): { ground: number; links: [Indexed, number][] } {
  const { p, def, L } = ix;
  const links: [Indexed, number][] = [];
  let ground = 0;
  const lossMul = TIER_LOSS_MULT[p.tier] ?? 1;
  const isBase = (x?: Indexed) => !!x && (x.def.kind === 'foundation' || x.def.kind === 'floor');
  const isWallish = (x?: Indexed) => !!x && x.def.kind === 'wall';
  switch (def.kind) {
    case 'foundation':
      if (L === 0) ground = 100;
      break;
    case 'wall':
    case 'fence': {
      if (def.kind === 'fence' && L === 0) ground = 100;
      let cA: Indexed | undefined;
      let cB: Indexed | undefined;
      let below: Indexed | undefined;
      if (p.rot % 2 === 0) {
        const i = Math.floor(p.x / GRID);
        const j = Math.round(p.z / GRID);
        cA = idx.cell(i, j - 1, L);
        cB = idx.cell(i, j, L);
        below = L > 0 ? idx.edge(`h${i},${j},${L - 1}`) : undefined;
      } else {
        const i = Math.round(p.x / GRID);
        const j = Math.floor(p.z / GRID);
        cA = idx.cell(i - 1, j, L);
        cB = idx.cell(i, j, L);
        below = L > 0 ? idx.edge(`v${i},${j},${L - 1}`) : undefined;
      }
      if (isBase(cA)) links.push([cA!, LOSS.wallOnBase * lossMul]);
      if (isBase(cB)) links.push([cB!, LOSS.wallOnBase * lossMul]);
      if (isWallish(below)) links.push([below!, LOSS.wallOnWall * lossMul]);
      break;
    }
    case 'floor':
    case 'roof': {
      if (L === 0) break; // use foundations at ground level
      const i = Math.floor(p.x / GRID);
      const j = Math.floor(p.z / GRID);
      for (const k of [`h${i},${j},${L - 1}`, `h${i},${j + 1},${L - 1}`, `v${i},${j},${L - 1}`, `v${i + 1},${j},${L - 1}`]) {
        const w = idx.edge(k);
        if (isWallish(w)) links.push([w!, LOSS.floorOnWall * lossMul]);
      }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const n = idx.cell(i + di, j + dj, L);
        if (n && (n.def.kind === 'floor' || n.def.kind === 'roof' || n.def.kind === 'foundation')) links.push([n, LOSS.floorSide * lossMul]);
      }
      break;
    }
    case 'stairs': {
      const i = Math.floor(p.x / GRID);
      const j = Math.floor(p.z / GRID);
      if (L === 0) ground = 100;
      const base = idx.cell(i, j, L);
      if (isBase(base)) links.push([base!, LOSS.stairs * lossMul]);
      break;
    }
    default: {
      // station/defense/trap
      if (L === 0) ground = 100;
      else {
        const base = idx.cell(Math.floor(p.x / GRID), Math.floor(p.z / GRID), L);
        if (isBase(base)) links.push([base!, 0]);
      }
    }
  }
  return { ground, links };
}

/** Compute stability (0..100) for every piece. Key: piece id (or list index if id missing). */
export function computeStability(pieces: readonly Candidate[], bonus = 0): Map<Candidate, number> {
  const idx = new PieceIndex(pieces);
  const stab = new Map<Indexed, number>();
  const sup = new Map<Indexed, ReturnType<typeof supports>>();
  for (const ix of idx.list) {
    const s = supports(ix, idx);
    sup.set(ix, s);
    stab.set(ix, s.ground);
  }
  // Relaxation (Bellman-Ford style; losses are positive so this converges)
  for (let pass = 0; pass < idx.list.length + 1; pass++) {
    let changed = false;
    for (const ix of idx.list) {
      const s = sup.get(ix)!;
      let best = s.ground;
      for (const [o, loss] of s.links) {
        const v = (stab.get(o) ?? 0) - loss * (1 - bonus);
        if (v > best) best = v;
      }
      best = Math.max(0, Math.min(100, best));
      if (best > (stab.get(ix) ?? 0) + 1e-9) {
        stab.set(ix, best);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const out = new Map<Candidate, number>();
  for (const ix of idx.list) out.set(ix.p, Math.round(stab.get(ix) ?? 0));
  return out;
}

export type PlaceBlock = 'unknown' | 'occupied' | 'unsupported' | 'overlap' | 'height' | null;

export interface PlacementCheck {
  ok: boolean;
  reason: PlaceBlock;
  stability: number;
}

function freeFootprint(c: Candidate, def: PieceDef): [number, number, number, number] {
  const w = c.rot % 2 === 0 ? def.size.w : def.size.d;
  const d = c.rot % 2 === 0 ? def.size.d : def.size.w;
  return [c.x - w / 2, c.z - d / 2, c.x + w / 2, c.z + d / 2];
}

export function validatePlacement(pieces: readonly PlacedPiece[], cand: Candidate, bonus = 0): PlacementCheck {
  const def = getPiece(cand.piece);
  if (!def) return { ok: false, reason: 'unknown', stability: 0 };
  if (levelOf(cand.y) > MAX_LEVEL) return { ok: false, reason: 'height', stability: 0 };
  const key = slotKey(cand, def);
  if (key) {
    for (const p of pieces) {
      const pd = getPiece(p.piece);
      if (pd && slotKey(p, pd) === key) return { ok: false, reason: 'occupied', stability: 0 };
    }
  } else {
    const [ax0, az0, ax1, az1] = freeFootprint(cand, def);
    const L = levelOf(cand.y);
    for (const p of pieces) {
      const pd = getPiece(p.piece);
      if (!pd || pd.snap !== 'free' || levelOf(p.y) !== L) continue;
      const [bx0, bz0, bx1, bz1] = freeFootprint(p, pd);
      if (ax0 < bx1 - 0.05 && ax1 > bx0 + 0.05 && az0 < bz1 - 0.05 && az1 > bz0 + 0.05) return { ok: false, reason: 'overlap', stability: 0 };
    }
  }
  const all: Candidate[] = [...pieces, cand];
  const s = computeStability(all, bonus).get(cand) ?? 0;
  if (s < MIN_STABILITY) return { ok: false, reason: 'unsupported', stability: s };
  return { ok: true, reason: null, stability: s };
}

/** After removing piece `removedId`, which other pieces lose support and collapse? */
export function collapsePlacedAfterRemoval(pieces: readonly PlacedPiece[], removedId: number, bonus = 0): number[] {
  const rest = pieces.filter((p) => p.id !== removedId);
  const stab = computeStability(rest, bonus);
  const out: number[] = [];
  for (const p of rest) if ((stab.get(p) ?? 0) < MIN_STABILITY) out.push(p.id);
  return out;
}

/** Remove a piece and everything that collapses; returns removed pieces (for debris drops). */
export function removePiece(pieces: PlacedPiece[], id: number, bonus = 0): PlacedPiece[] {
  const collapse = new Set([id, ...collapsePlacedAfterRemoval(pieces, id, bonus)]);
  const removed: PlacedPiece[] = [];
  for (let i = pieces.length - 1; i >= 0; i--) {
    if (collapse.has(pieces[i].id)) removed.push(...pieces.splice(i, 1));
  }
  return removed;
}

/** Salvage refund when deconstructing your own piece (50%). */
export function refundFor(piece: PlacedPiece): { item: string; count: number }[] {
  const def = getPiece(piece.piece);
  if (!def) return [];
  if (def.fromItem) return [{ item: def.fromItem, count: 1 }];
  const cost = def.costs[Math.min(piece.tier, def.costs.length - 1)] ?? [];
  return cost.map((c) => ({ item: c.item, count: Math.floor(c.count / 2) })).filter((c) => c.count > 0);
}
