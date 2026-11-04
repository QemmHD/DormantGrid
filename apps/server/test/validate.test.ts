import { describe, expect, it } from 'vitest';
import { isProfane, parseClientMsg, validateSavePut, validateUsername, validateWorldEvent } from '../src/validate';
import { HttpError, compareVersions, originAllowed, randomCode, timingSafeEqual, CODE_ALPHABET } from '../src/util';
import { MAX_SAVE_BYTES } from '@dg/shared';

const TOKEN = 'a'.repeat(64);

describe('usernames', () => {
  it('accepts valid names and lowercases the key', () => {
    expect(validateUsername('Ash_Walker-7')).toEqual({ display: 'Ash_Walker-7', key: 'ash_walker-7' });
  });
  it.each(['ab', 'a'.repeat(21), 'has space', 'émile', '', 'semi;colon'])('rejects %j', (n) => {
    expect(() => validateUsername(n)).toThrow(HttpError);
  });
  it('rejects non-strings', () => {
    expect(() => validateUsername(42)).toThrow(HttpError);
    expect(() => validateUsername(null)).toThrow(HttpError);
  });
  it('blocks profanity including leetspeak and separators', () => {
    expect(isProfane('sh1t_lord')).toBe(true);
    expect(isProfane('F-U-C-K')).toBe(true);
    expect(isProfane('fuuuuck')).toBe(true);
    expect(isProfane('n4z1')).toBe(true);
    expect(() => validateUsername('B1tch')).toThrow(/isn't allowed/);
  });
  it('does not block innocent names (Scunthorpe check)', () => {
    for (const n of ['Document', 'canal_rat', 'Cassie', 'scrapper', 'Hancock', 'Assembler', 'Grassland']) {
      expect(isProfane(n), n).toBe(false);
    }
  });
  it('blocks reserved names', () => {
    expect(() => validateUsername('Admin')).toThrow(/reserved/);
    expect(() => validateUsername('dormant_grid')).toThrow(/reserved/);
  });
});

describe('helpers', () => {
  it('timingSafeEqual', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(true);
  });
  it('randomCode uses only the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) for (const ch of randomCode(8)) expect(CODE_ALPHABET).toContain(ch);
  });
  it('compareVersions', () => {
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0);
    expect(compareVersions('0.1.0', '0.2.0')).toBe(-1);
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
  });
  it('originAllowed with wildcard', () => {
    const p = ['https://*.dormant-grid.pages.dev', 'http://localhost:*'];
    expect(originAllowed('https://abc123.dormant-grid.pages.dev', p)).toBe(true);
    expect(originAllowed('http://localhost:5173', p)).toBe(true);
    expect(originAllowed('https://evil.com', p)).toBe(false);
    expect(originAllowed('https://dormant-grid.pages.dev.evil.com', p)).toBe(false);
    expect(originAllowed('https://x.dormant-grid.pages.dev/', p)).toBe(false);
  });
});

describe('save validation', () => {
  const good = { baseRev: 0, data: 'AAAA', meta: { rev: 1, schema: 1, savedAt: 1, playtime: 5, bytes: 4 } };
  it('accepts a valid upload and sets bytes from data', () => {
    expect(validateSavePut({ ...good, meta: { ...good.meta, bytes: 999 } }).meta.bytes).toBe(4);
  });
  it('rejects oversize data', () => {
    expect(() => validateSavePut({ ...good, data: 'A'.repeat(MAX_SAVE_BYTES + 4) })).toThrow(/too large/);
  });
  it('rejects non-base64 and bad meta', () => {
    expect(() => validateSavePut({ ...good, data: '<script>' })).toThrow(HttpError);
    expect(() => validateSavePut({ ...good, meta: { ...good.meta, rev: -1 } })).toThrow(HttpError);
    expect(() => validateSavePut({ ...good, meta: { ...good.meta, playtime: Infinity } })).toThrow(HttpError);
    expect(() => validateSavePut({ ...good, force: 'yes' })).toThrow(HttpError);
    expect(() => validateSavePut([])).toThrow(HttpError);
  });
});

describe('ws message parsing', () => {
  it('parses a hello', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'hello', user: 'Ash', token: TOKEN, clientVersion: '0.1.0' }), 8192)).toMatchObject({ t: 'hello' });
  });
  it('rejects bad tokens and oversized frames', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'hello', user: 'Ash', token: 'x', clientVersion: '0.1.0' }), 8192)).toBeNull();
    expect(parseClientMsg('x'.repeat(9000), 8192)).toBeNull();
    expect(parseClientMsg(new ArrayBuffer(4), 8192)).toBeNull();
  });
  it('validates world events strictly', () => {
    expect(validateWorldEvent({ type: 'propRemoved', id: 5 })).toEqual({ type: 'propRemoved', id: 5 });
    expect(validateWorldEvent({ type: 'propRemoved', id: -5 })).toBeNull();
    expect(validateWorldEvent({ type: 'nuke' })).toBeNull();
    expect(validateWorldEvent({ type: 'piecePlaced', piece: { id: 1, piece: 'wall', tier: 9, x: 0, y: 0, z: 0, rot: 0, hp: 1 } })).toBeNull();
    expect(validateWorldEvent({ type: 'time', hour: 5, weather: 'RAIN<script>' })).toBeNull();
  });
  it('fuzz: random garbage never throws', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const atoms: unknown[] = [null, true, 0, -1, 1e308, NaN, 'x', '', [], {}, 'hello', 'state', 'action', 'ping', 'emote', 'pingWheel'];
    const gen = (depth: number): unknown => {
      if (depth > 3 || rnd() < 0.4) return atoms[Math.floor(rnd() * atoms.length)];
      if (rnd() < 0.3) return Array.from({ length: Math.floor(rnd() * 4) }, () => gen(depth + 1));
      const o: Record<string, unknown> = {};
      for (const k of ['t', 's', 'ev', 'type', 'id', 'x', 'z', 'seq', 'piece', 'user', 'token', 'kind', 'emote', 'at']) if (rnd() < 0.4) o[k] = gen(depth + 1);
      return o;
    };
    for (let i = 0; i < 5000; i++) {
      const raw = rnd() < 0.1 ? String(gen(0)).slice(0, 50) + '{' : JSON.stringify(gen(0)) ?? 'null';
      expect(() => parseClientMsg(raw, 8192)).not.toThrow();
    }
  });
});
