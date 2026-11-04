import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/store';
import { CLAIMS_PER_IP_PER_HOUR, LINK_REDEEM_FAILS_PER_IP_PER_HOUR, LINK_TTL_MS, RegistryCore } from '../src/registry-core';
import { Clock } from './helpers';

describe('RegistryCore', () => {
  it('claims names uniquely and case-insensitively', async () => {
    const r = new RegistryCore(new MemoryStore());
    await r.claim('Ash', 'ash', 'ip1');
    await expect(r.claim('ASH', 'ash', 'ip2')).rejects.toMatchObject({ code: 'username_taken', status: 409 });
    expect((await r.lookup('ash'))?.display).toBe('Ash');
  });
  it('limits claims per IP per hour', async () => {
    const c = new Clock();
    const r = new RegistryCore(new MemoryStore(), c.now);
    for (let i = 0; i < CLAIMS_PER_IP_PER_HOUR; i++) await r.claim(`user${i}`, `user${i}`, 'ip');
    await expect(r.claim('another', 'another', 'ip')).rejects.toMatchObject({ code: 'rate_limited' });
    await r.claim('another', 'another', 'other-ip');
    c.advance(3600_001);
    await r.claim('later', 'later', 'ip');
  });
  it('release only undoes a matching claim', async () => {
    const r = new RegistryCore(new MemoryStore());
    const rec = await r.claim('Bo', 'bo', 'ip');
    await r.release('bo', rec.createdAt + 1);
    expect(await r.lookup('bo')).not.toBeNull();
    await r.release('bo', rec.createdAt);
    expect(await r.lookup('bo')).toBeNull();
  });
  it('link codes are single use, expire, and accept lowercase/no-dash input', async () => {
    const c = new Clock();
    const r = new RegistryCore(new MemoryStore(), c.now);
    await r.claim('Ash', 'ash', 'ip');
    const { code } = await r.createLink('ash');
    expect(code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
    expect(await r.redeemLink(code.replace('-', '').toLowerCase(), 'ip')).toEqual({ key: 'ash', display: 'Ash' });
    await expect(r.redeemLink(code, 'ip')).rejects.toMatchObject({ code: 'invalid_link_code' });
    const second = await r.createLink('ash');
    c.advance(LINK_TTL_MS + 1);
    await expect(r.redeemLink(second.code, 'ip')).rejects.toMatchObject({ code: 'invalid_link_code' });
  });
  it('a new link code invalidates the previous one', async () => {
    const r = new RegistryCore(new MemoryStore());
    await r.claim('Ash', 'ash', 'ip');
    const a = await r.createLink('ash');
    await r.createLink('ash');
    await expect(r.redeemLink(a.code, 'ip')).rejects.toMatchObject({ code: 'invalid_link_code' });
  });
  it('rate-limits failed redeems per IP', async () => {
    const r = new RegistryCore(new MemoryStore());
    for (let i = 0; i < LINK_REDEEM_FAILS_PER_IP_PER_HOUR; i++) {
      await expect(r.redeemLink('AAA-AAA', 'ip')).rejects.toMatchObject({ code: 'invalid_link_code' });
    }
    await expect(r.redeemLink('AAA-AAA', 'ip')).rejects.toMatchObject({ code: 'rate_limited' });
  });
});
