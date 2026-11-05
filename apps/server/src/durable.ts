// Durable Object classes (thin wrappers around the testable *Core classes).

import { DurableObject } from 'cloudflare:workers';
import type { SaveMeta, SavePutRequest } from '@dg/shared';
import { DOStore } from './store';
import { RegistryCore, type NameRecord } from './registry-core';
import { VaultCore, type Credentials } from './vault-core';
import { RoomCore, type RoomSocket, type SocketAttachment } from './room-core';
import { wrap, type Result } from './rpc';
import type { Env } from './env';
import { TOKEN_RE } from './validate';
import { USERNAME_RE } from '@dg/shared';

export class AccountRegistry extends DurableObject<Env> {
  private core: RegistryCore;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.core = new RegistryCore(new DOStore(ctx.storage));
  }
  claim(display: string, key: string, ipHash: string): Promise<Result<NameRecord>> {
    return wrap(() => this.core.claim(display, key, ipHash));
  }
  release(key: string, createdAt: number): Promise<Result<void>> {
    return wrap(() => this.core.release(key, createdAt));
  }
  createLink(key: string): Promise<Result<{ code: string; expiresAt: number }>> {
    return wrap(() => this.core.createLink(key));
  }
  redeemLink(code: string, ipHash: string): Promise<Result<{ key: string; display: string }>> {
    return wrap(() => this.core.redeemLink(code, ipHash));
  }
}

export class PlayerVault extends DurableObject<Env> {
  private core: VaultCore;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.core = new VaultCore(new DOStore(ctx.storage));
  }
  create(display: string, key: string): Promise<Result<Credentials>> {
    return wrap(() => this.core.create(display, key));
  }
  auth(token: string, ipHash: string): Promise<Result<{ username: string; createdAt: number }>> {
    return wrap(async () => {
      const a = await this.core.auth(token, ipHash);
      return { username: a.display, createdAt: a.createdAt };
    });
  }
  recover(code: string): Promise<Result<Credentials>> {
    return wrap(() => this.core.recover(code));
  }
  addDevice(): Promise<Result<Credentials>> {
    return wrap(() => this.core.addDevice());
  }
  getSave(token: string, ipHash: string): Promise<Result<{ meta: SaveMeta | null; data: string | null }>> {
    return wrap(async () => {
      await this.core.auth(token, ipHash);
      return this.core.getSave();
    });
  }
  putSave(token: string, ipHash: string, req: SavePutRequest): Promise<Result<SaveMeta>> {
    return wrap(async () => {
      await this.core.auth(token, ipHash);
      return this.core.putSave(req);
    });
  }
}

class HibernatableSocket implements RoomSocket {
  constructor(readonly ws: WebSocket) {}
  send(data: string): void {
    this.ws.send(data);
  }
  close(code: number, reason: string): void {
    this.ws.close(code, reason);
  }
  getAttachment(): SocketAttachment | null {
    return (this.ws.deserializeAttachment() as SocketAttachment | null) ?? null;
  }
  setAttachment(a: SocketAttachment): void {
    this.ws.serializeAttachment(a);
  }
}

export class WorldRoom extends DurableObject<Env> {
  private core: RoomCore;
  private wrappers = new WeakMap<WebSocket, HibernatableSocket>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.core = new RoomCore({
      store: new DOStore(ctx.storage),
      now: () => Date.now(),
      sockets: () => ctx.getWebSockets().map((w) => this.wrap(w)),
      authenticate: async (user, token, ipHash) => {
        if (!USERNAME_RE.test(user) || !TOKEN_RE.test(token)) return null;
        const stub = env.PLAYER_VAULT.get(env.PLAYER_VAULT.idFromName(user.toLowerCase()));
        const r = await stub.auth(token, ipHash || 'room');
        return r.ok ? r.value.username : null;
      },
      minClient: env.MIN_CLIENT ?? '0.1.0',
      setAlarm: async (at) => {
        const existing = await ctx.storage.getAlarm();
        if (existing !== null && existing > Date.now() && existing <= at) return;
        await ctx.storage.setAlarm(at);
      },
    });
  }

  private wrap(ws: WebSocket): HibernatableSocket {
    let w = this.wrappers.get(ws);
    if (!w) {
      w = new HibernatableSocket(ws);
      this.wrappers.set(ws, w);
    }
    return w;
  }

  init(code: string, seed: number, creator: string): Promise<Result<boolean>> {
    return wrap(() => this.core.init(code, seed, creator));
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    await this.core.load();
    if (!this.core.getMeta()) return new Response('Room not found', { status: 404 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    await this.core.onOpen(this.wrap(server), request.headers.get('X-DG-IPH') ?? '');
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.core.onMessage(this.wrap(ws), message);
  }

  override async webSocketClose(ws: WebSocket, code: number, _reason: string, _wasClean: boolean): Promise<void> {
    // complete the close handshake: without this a client that closed its socket can sit in
    // CLOSING until the browser times out (found by tests/coop-local.mjs on workerd)
    try {
      ws.close(code >= 1000 && code < 5000 && code !== 1005 && code !== 1006 ? code : 1000, 'closed');
    } catch {
      /* already closed */
    }
    await this.core.onClose(this.wrap(ws));
  }

  override async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    await this.core.onClose(this.wrap(ws));
  }

  override async alarm(): Promise<void> {
    const { wipe } = await this.core.alarm();
    if (wipe) await this.ctx.storage.deleteAll();
  }
}
