// Chunk mesher worker: owns its own copy of the deterministic layout and builds
// ground + building geometry off the main thread. Results are transferred.
import type { WorldLayout } from '@dg/shared';
import { buildingPieces, generateWorld, heightAt, initialRuinedPieces, type PieceInfo } from '@dg/sim';
import { MeshBuilder } from '../render/geo';
import { buildGround, meshBuilding, paletteOf } from './mesher';

export interface ChunkRequest {
  t: 'chunk';
  key: number;
  gen: number;
  cx: number;
  cz: number;
  ground: boolean;
  bids: number[];
  removed: Record<number, number[]>;
  windowLit: number[];
}

export interface ChunkArrays {
  pos: Float32Array;
  nor: Float32Array;
  col: Float32Array;
  emit: Float32Array;
}

export interface ChunkResult {
  t: 'chunk';
  key: number;
  gen: number;
  ground: ChunkArrays | null;
  bld: ChunkArrays | null;
  ms: number;
}

let layout: WorldLayout | null = null;
const pieceCache = new Map<number, PieceInfo[]>();

function pieces(bid: number): PieceInfo[] {
  let p = pieceCache.get(bid);
  if (!p) {
    p = buildingPieces(layout!.buildings[bid]);
    pieceCache.set(bid, p);
  }
  return p;
}

function arrays(b: MeshBuilder): ChunkArrays | null {
  if (b.vertexCount === 0) return null;
  return b.toArrays();
}

const ctx = self as unknown as { postMessage: (m: unknown, t?: Transferable[]) => void; onmessage: ((e: MessageEvent) => void) | null };

ctx.onmessage = (e: MessageEvent) => {
  const m = e.data as { t: 'init'; seed: number } | ChunkRequest;
  if (m.t === 'init') {
    layout = generateWorld(m.seed);
    ctx.postMessage({ t: 'ready', hash: layout.hash });
    return;
  }
  if (m.t === 'chunk' && layout) {
    const t0 = performance.now();
    const L = layout;
    const ground = m.ground ? arrays(buildGround(L, m.cx, m.cz, (x, z) => heightAt(L, x, z))) : null;
    let bld: ChunkArrays | null = null;
    if (m.bids.length) {
      const mb = new MeshBuilder({ groundAO: true });
      for (const bid of m.bids) {
        const b = L.buildings[bid];
        const ps = pieces(bid);
        const removed = new Set(m.removed[bid] ?? initialRuinedPieces(b, ps));
        meshBuilding(mb, b, ps, removed, paletteOf(L, b.district), m.windowLit[b.district] ?? 0.05);
      }
      bld = arrays(mb);
    }
    const res: ChunkResult = { t: 'chunk', key: m.key, gen: m.gen, ground, bld, ms: performance.now() - t0 };
    const tr: Transferable[] = [];
    for (const a of [ground, bld]) if (a) tr.push(a.pos.buffer, a.nor.buffer, a.col.buffer, a.emit.buffer);
    ctx.postMessage(res, tr);
  }
};
