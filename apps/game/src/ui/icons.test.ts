import { describe, expect, it } from 'vitest';
import { ITEMS, PIECES } from '@dg/sim';
import { iconSpec } from './icons';

describe('item icons', () => {
  it('maps every item to a specific glyph', () => {
    for (const it of ITEMS) {
      const s = iconSpec(it.id, it.category);
      expect(s.glyph, it.id).not.toBe('unknown');
      expect(s.base).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  it('never throws on odd ids', () => {
    for (const id of ['', '.', 'zzz', 'bp.', 'piece.wall', 'station.bed', 'x.y.z']) expect(() => iconSpec(id)).not.toThrow();
  });
  it('has build piece icons', () => {
    for (const p of PIECES) expect(iconSpec(`piece.${p.id}`).glyph).toBe('block');
  });
});
