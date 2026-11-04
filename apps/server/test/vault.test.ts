import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/store';
import { AUTH_FAILS_PER_IP_PER_HOUR, BACKUPS, RECOVERY_FAILS_PER_HOUR, SAVE_PUTS_PER_MINUTE, VaultCore, type Account } from '../src/vault-core';
import { Clock } from './helpers';
import type { SavePutRequest } from '@dg/shared';

function put(rev: number, baseRev: number, force = false): SavePutRequest {
  return { baseRev, force, data: 'QUJD', meta: { rev, schema: 1, savedAt: rev * 1000, playtime: rev, bytes: 4 } };
}

describe('VaultCore identity', () => {
  it('creates an account, never stores the raw token, and authenticates', async () => {
    const store = new MemoryStore();
    const v = new VaultCore(store);
    const creds = await v.create('Ash', 'ash');
    expect(creds.token).toMatch(/^[0-9a-f]{64}$/);
    expect(creds.recoveryCode).toMatch(/^[A-Z0-9]{5}(-[A-Z0-9]{5}){3}$/);
    const raw = JSON.stringify([...store.data.entries()]);
    expect(raw).not.toContain(creds.token);
    expect(raw).not.toContain(creds.recoveryCode.replace(/-/g, ''));
    expect((await v.auth(creds.token, 'ip')).display).toBe('Ash');
    await expect(v.auth('0'.repeat(64), 'ip')).rejects.toMatchObject({ status: 401 });
    await expect(v.create('Ash', 'ash')).rejects.toMatchObject({ code: 'username_taken' });
  });
  it('locks out an IP after repeated bad tokens but not other IPs', async () => {
    const v = new VaultCore(new MemoryStore());
    const creds = await v.create('Ash', 'ash');
    for (let i = 0; i < AUTH_FAILS_PER_IP_PER_HOUR; i++) await expect(v.auth('f'.repeat(64), 'bad')).rejects.toMatchObject({ status: 401 });
    await expect(v.auth(creds.token, 'bad')).rejects.toMatchObject({ status: 429 });
    expect((await v.auth(creds.token, 'good')).display).toBe('Ash');
  });
  it('recovery code works once, then rotates; old tokens still valid', async () => {
    const v = new VaultCore(new MemoryStore());
    const first = await v.create('Ash', 'ash');
    const rec = await v.recover(first.recoveryCode.toLowerCase().replace(/-/g, ' '));
    expect(rec.token).not.toBe(first.token);
    await expect(v.recover(first.recoveryCode)).rejects.toMatchObject({ code: 'invalid_recovery' });
    await v.recover(rec.recoveryCode);
    await v.auth(first.token, 'ip');
    await v.auth(rec.token, 'ip');
  });
  it('rate-limits recovery attempts', async () => {
    const v = new VaultCore(new MemoryStore());
    const creds = await v.create('Ash', 'ash');
    for (let i = 0; i < RECOVERY_FAILS_PER_HOUR; i++) await expect(v.recover('WRONG-CODE')).rejects.toMatchObject({ status: 401 });
    await expect(v.recover(creds.recoveryCode)).rejects.toMatchObject({ status: 429 });
  });
  it('addDevice issues independent tokens and caps devices', async () => {
    const store = new MemoryStore();
    const v = new VaultCore(store);
    const first = await v.create('Ash', 'ash');
    const second = await v.addDevice();
    await v.auth(first.token, 'ip');
    await v.auth(second.token, 'ip');
    for (let i = 0; i < 20; i++) await v.addDevice();
    expect((await store.get<Account>('account'))!.devices.length).toBe(10);
  });
  it('recover on a missing account fails cleanly', async () => {
    const v = new VaultCore(new MemoryStore());
    await expect(v.recover('AAAAA-AAAAA-AAAAA-AAAAA')).rejects.toMatchObject({ status: 401 });
    await expect(v.addDevice()).rejects.toMatchObject({ status: 404 });
  });
});

describe('VaultCore saves', () => {
  it('round-trips and enforces revision checks', async () => {
    const c = new Clock();
    const v = new VaultCore(new MemoryStore(), c.now);
    expect(await v.getSave()).toEqual({ meta: null, data: null });
    expect((await v.putSave(put(1, 0))).rev).toBe(1);
    expect((await v.getSave()).data).toBe('QUJD');
    // stale base revision -> conflict carrying server meta
    await expect(v.putSave(put(2, 0))).rejects.toMatchObject({ status: 409, code: 'conflict', extra: { server: { rev: 1 } } });
    // non-increasing revision -> conflict
    await expect(v.putSave(put(1, 1))).rejects.toMatchObject({ code: 'conflict' });
    expect((await v.putSave(put(5, 1))).rev).toBe(5);
    // force after conflict resolution always lands with a higher rev
    expect((await v.putSave(put(2, 0, true))).rev).toBe(6);
  });
  it('keeps the last five backups, newest first', async () => {
    const c = new Clock();
    const v = new VaultCore(new MemoryStore(), c.now);
    for (let r = 1; r <= 9; r++) {
      await v.putSave(put(r, r - 1));
      c.advance(10_000);
    }
    const backups = await v.listBackups();
    expect(backups.length).toBe(BACKUPS);
    expect(backups.map((b) => b.rev)).toEqual([8, 7, 6, 5, 4]);
  });
  it('rate-limits save uploads', async () => {
    const c = new Clock();
    const v = new VaultCore(new MemoryStore(), c.now);
    for (let r = 1; r <= SAVE_PUTS_PER_MINUTE; r++) await v.putSave(put(r, r - 1));
    await expect(v.putSave(put(99, SAVE_PUTS_PER_MINUTE))).rejects.toMatchObject({ status: 429 });
    c.advance(60_001);
    await v.putSave(put(99, SAVE_PUTS_PER_MINUTE));
  });
});

describe('VaultCore quota safety', () => {
  it('failed auth/recovery against a nonexistent account writes nothing', async () => {
    const store = new MemoryStore();
    const v = new VaultCore(store);
    for (let i = 0; i < 50; i++) {
      await expect(v.auth('1'.repeat(64), `ip${i}`)).rejects.toMatchObject({ status: 401 });
      await expect(v.recover('AAAAA-AAAAA-AAAAA-AAAAA')).rejects.toMatchObject({ status: 401 });
    }
    expect(store.data.size).toBe(0);
  });
});
