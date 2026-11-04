import { MemoryStore } from '../src/store';
import type { RoomSocket, SocketAttachment } from '../src/room-core';
import type { ServerMsg } from '@dg/shared';

export class Clock {
  t = 1_700_000_000_000;
  now = (): number => this.t;
  advance(ms: number): void {
    this.t += ms;
  }
}

/** DurableObjectStorage-like fake for DO wrapper tests. */
export class FakeStorage extends MemoryStore {
  alarm: number | null = null;
  // DurableObjectStorage.list takes an options object
  override async list<T>(prefixOrOpts: string | { prefix: string; limit?: number }, limit?: number): Promise<Map<string, T>> {
    if (typeof prefixOrOpts === 'string') return super.list<T>(prefixOrOpts, limit);
    return super.list<T>(prefixOrOpts.prefix, prefixOrOpts.limit);
  }
  async getAlarm(): Promise<number | null> {
    return this.alarm;
  }
  async setAlarm(t: number): Promise<void> {
    this.alarm = t;
  }
  async deleteAll(): Promise<void> {
    this.data.clear();
  }
}

export class FakeSocket implements RoomSocket {
  sent: ServerMsg[] = [];
  closed: { code: number; reason: string } | null = null;
  private att: SocketAttachment | null = null;
  constructor(private readonly registry: FakeSocket[]) {
    registry.push(this);
  }
  send(data: string): void {
    if (this.closed) throw new Error('closed');
    this.sent.push(JSON.parse(data) as ServerMsg);
  }
  close(code: number, reason: string): void {
    this.closed = { code, reason };
    const i = this.registry.indexOf(this);
    if (i >= 0) this.registry.splice(i, 1);
  }
  getAttachment(): SocketAttachment | null {
    return this.att ? structuredClone(this.att) : null;
  }
  setAttachment(a: SocketAttachment): void {
    // enforce the 16 KiB hibernation attachment limit
    if (JSON.stringify(a).length > 16_384) throw new Error('attachment too large');
    this.att = structuredClone(a);
  }
  of<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }>[] {
    return this.sent.filter((m) => m.t === t) as Extract<ServerMsg, { t: T }>[];
  }
}
