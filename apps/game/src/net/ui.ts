// Account, recovery, conflict and co-op dialogs (DOM, touch-first).
// Uses the shared design tokens/classes from ui/style.css.
import type { PingKind } from '@dg/shared';
import type { Bus, NetStatus } from '../game/api';
import { usernameProblem } from './account';
import { friendly } from './api';
import type { ConflictChoice, ConflictInfo } from './sync';
import type { Services } from './services';
import { NET_STR as S } from './strings';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', `btn ${cls}`, label);
  b.type = 'button';
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

interface Modal {
  root: HTMLDivElement;
  box: HTMLDivElement;
  close: () => void;
}

const openModals = new Set<Modal>();

/** Full-screen modal; swallows touches so the game canvas never sees them. */
function modal(title: string | null, onClose?: () => void, wide = false): Modal {
  const root = el('div', 'screen net-screen');
  const box = el('div', wide ? 'panel sheet' : 'panel dialog');
  if (wide) box.style.maxWidth = '640px';
  root.appendChild(box);
  if (title) {
    if (wide) {
      const h = el('header');
      h.appendChild(el('h2', '', title));
      const x = el('button', 'close-x', '×');
      x.setAttribute('aria-label', S.close);
      x.addEventListener('click', () => m.close());
      h.appendChild(x);
      box.appendChild(h);
    } else box.appendChild(el('h2', '', title));
  }
  const stop = (e: Event) => e.stopPropagation();
  for (const t of ['touchstart', 'touchmove', 'touchend', 'mousedown', 'keydown']) root.addEventListener(t, stop);
  (document.getElementById('ui') ?? document.body).appendChild(root);
  requestAnimationFrame(() => root.classList.add('show'));
  const m: Modal = {
    root,
    box,
    close: () => {
      if (!openModals.has(m)) return;
      openModals.delete(m);
      root.classList.remove('show');
      setTimeout(() => root.remove(), 260);
      onClose?.();
    },
  };
  openModals.add(m);
  return m;
}

function body(m: Modal): HTMLElement {
  if (m.box.classList.contains('sheet')) {
    const b = el('div', 'body');
    m.box.appendChild(b);
    return b;
  }
  return m.box;
}

function fmtPlaytime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const mm = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h} h ${mm} min` : `${mm} min`;
}

function fmtWhen(ms: number): string {
  if (!ms) return S.never;
  const d = new Date(ms);
  const diff = Date.now() - ms;
  if (diff < 60_000) return S.justNow;
  if (diff < 3600_000) return `${Math.round(diff / 60_000)} min ago`;
  if (diff < 86400_000) return `${Math.round(diff / 3600_000)} h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

// ---------------- claim ----------------
export function showClaimDialog(svc: Services): Promise<'claimed' | 'offline'> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: 'claimed' | 'offline') => {
      if (done) return;
      done = true;
      m.close();
      resolve(r);
    };
    const m = modal(S.claimTitle);
    m.box.appendChild(el('p', '', S.claimBody));
    const input = el('input', 'input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.autocapitalize = 'off';
    input.spellcheck = false;
    input.maxLength = 20;
    input.placeholder = S.claimPlaceholder;
    input.setAttribute('aria-label', S.claimPlaceholder);
    const err = el('div', 'err');
    const rules = el('p', '', S.claimRules);
    rules.style.fontSize = '12px';
    const row = el('div', 'row');
    const go = button(S.claimGo, 'primary', () => void submit());
    go.disabled = true;
    const later = button(S.claimLater, 'ghost', () => finish('offline'));
    const haveAcct = button(S.haveAccount, 'ghost small', () => {
      m.close();
      done = true;
      openRecoverDialog(svc).then((ok) => resolve(ok ? 'claimed' : 'offline'));
    });
    row.append(later, go);
    m.box.append(input, err, rules, row, haveAcct);
    haveAcct.style.marginTop = '10px';
    input.addEventListener('input', () => {
      const p = input.value ? usernameProblem(input.value) : null;
      err.textContent = p ?? '';
      go.disabled = !input.value || !!p;
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !go.disabled) void submit();
    });
    setTimeout(() => input.focus(), 300);
    async function submit() {
      const name = input.value.trim();
      const p = usernameProblem(name);
      if (p) {
        err.textContent = p;
        return;
      }
      go.disabled = true;
      go.textContent = S.claiming;
      try {
        const code = await svc.account.claim(name);
        finish('claimed');
        await showRecoveryCode(svc, code, false);
        svc.bus.emit({ type: 'toast', kind: 'info', text: S.welcome(name) });
      } catch (e) {
        err.textContent = friendly(e);
        go.disabled = false;
        go.textContent = S.claimGo;
      }
    }
  });
}

// ---------------- recovery code ----------------
export function showRecoveryCode(svc: Services, code: string, replaced: boolean): Promise<void> {
  return new Promise((resolve) => {
    const m = modal(S.recoveryTitle, () => resolve());
    m.box.appendChild(el('p', '', replaced ? S.recoveryReplaced : S.recoveryBody));
    const codeEl = el('div', 'code', code);
    const copy = button(S.copy, 'small', () => {
      void copyText(code).then((ok) => (copy.textContent = ok ? S.copied : S.copyFailed));
    });
    const check = el('label');
    check.style.display = 'flex';
    check.style.gap = '10px';
    check.style.alignItems = 'center';
    check.style.minHeight = '44px';
    const cb = el('input');
    cb.type = 'checkbox';
    cb.style.width = '24px';
    cb.style.height = '24px';
    check.append(cb, el('span', '', S.recoverySaved));
    const row = el('div', 'row');
    const ok = button(S.done, 'primary', () => {
      void svc.account.markRecoveryShown();
      m.close();
    });
    ok.disabled = true;
    cb.addEventListener('change', () => (ok.disabled = !cb.checked));
    row.append(copy, ok);
    m.box.append(codeEl, check, row);
  });
}

// ---------------- recover / redeem ----------------
export function openRecoverDialog(svc: Services): Promise<boolean> {
  return new Promise((resolve) => {
    let ok = false;
    const m = modal(S.recoverTitle, () => resolve(ok));
    m.box.appendChild(el('p', '', S.recoverBody));
    const user = el('input', 'input');
    user.placeholder = S.claimPlaceholder;
    user.autocapitalize = 'off';
    user.autocomplete = 'off';
    const code = el('input', 'input');
    code.placeholder = S.recoveryPlaceholder;
    code.autocapitalize = 'characters';
    code.autocomplete = 'off';
    const err = el('div', 'err');
    const row = el('div', 'row');
    const go = button(S.recoverGo, 'primary', async () => {
      go.disabled = true;
      try {
        const fresh = await svc.account.recover(user.value, code.value);
        ok = true;
        m.close();
        await showRecoveryCode(svc, fresh, true);
        await reloadFromCloud(svc);
      } catch (e) {
        err.textContent = friendly(e);
        go.disabled = false;
      }
    });
    row.append(button(S.cancel, 'ghost', () => m.close()), go);
    m.box.append(user, code, err, row);
  });
}

export function openRedeemDialog(svc: Services): Promise<boolean> {
  return new Promise((resolve) => {
    let ok = false;
    const m = modal(S.redeemTitle, () => resolve(ok));
    m.box.appendChild(el('p', '', S.redeemBody));
    const code = el('input', 'input');
    code.placeholder = 'K7Q-4MX';
    code.autocapitalize = 'characters';
    code.autocomplete = 'off';
    const err = el('div', 'err');
    const row = el('div', 'row');
    const go = button(S.redeemGo, 'primary', async () => {
      go.disabled = true;
      try {
        const fresh = await svc.account.redeemLink(code.value);
        ok = true;
        m.close();
        await showRecoveryCode(svc, fresh, true);
        await reloadFromCloud(svc);
      } catch (e) {
        err.textContent = friendly(e);
        go.disabled = false;
      }
    });
    row.append(button(S.cancel, 'ghost', () => m.close()), go);
    m.box.append(code, err, row);
  });
}

/** After adopting an existing account on this device, reconcile with its cloud save. */
async function reloadFromCloud(svc: Services): Promise<void> {
  const local = await svc.store.loadLocal();
  const chosen = await svc.sync.pullOnStart(local);
  if (chosen && chosen !== local) {
    await svc.store.saveLocal(chosen);
    svc.sync.onLoadSave?.(chosen);
  }
}

// ---------------- conflict ----------------
export function conflictDialog(info: ConflictInfo): Promise<ConflictChoice> {
  return new Promise((resolve) => {
    let choice: ConflictChoice | null = null;
    const m = modal(S.conflictTitle, () => resolve(choice ?? (info.local.savedAt >= info.cloud.savedAt ? 'device' : 'cloud')));
    m.box.appendChild(el('p', '', S.conflictBody));
    const card = (title: string, side: ConflictInfo['local'], c: ConflictChoice, primary: boolean) => {
      const li = el('div', 'li');
      const main = el('div', 'main');
      main.appendChild(el('b', '', title));
      main.appendChild(el('small', '', `${S.played} ${fmtPlaytime(side.playtime)} · ${S.lastPlayed} ${fmtWhen(side.savedAt)}`));
      li.appendChild(main);
      li.appendChild(
        button(S.keep, primary ? 'primary small' : 'small', () => {
          choice = c;
          m.close();
        }),
      );
      return li;
    };
    const list = el('div', 'list');
    const deviceNewer = info.local.savedAt >= info.cloud.savedAt;
    list.append(card(S.thisDevice, info.local, 'device', deviceNewer), card(S.cloud, info.cloud, 'cloud', !deviceNewer));
    m.box.append(list);
    const note = el('p', '', S.conflictNote);
    note.style.marginTop = '12px';
    note.style.fontSize = '12px';
    m.box.append(note);
  });
}

// ---------------- account screen ----------------
export function openAccountScreen(svc: Services, getSaveJSON: (() => string | null) | null): void {
  const m = modal(S.accountTitle, undefined, true);
  const b = body(m);
  const render = () => {
    b.textContent = '';
    const acct = svc.account;
    const who = el('div', 'detail');
    who.appendChild(el('h3', '', acct.username ?? S.noAccount));
    const status =
      svc.offlineOnly ? S.offlineBuild : acct.state === 'signed-in' ? S.signedIn : acct.state === 'offline' ? S.offlineNow : acct.state === 'revoked' ? S.revoked : S.notClaimed;
    who.appendChild(el('p', '', status));
    b.appendChild(who);
    const warn = el('p', '', S.lostWarning);
    warn.style.color = 'var(--text-dim)';
    warn.style.fontSize = '13px';
    warn.style.margin = '12px 0';
    b.appendChild(warn);
    const list = el('div', 'list');
    const item = (title: string, sub: string, label: string, fn: () => void, disabled = false) => {
      const li = el('div', 'li');
      const main = el('div', 'main');
      main.append(el('b', '', title), el('small', '', sub));
      const btn = button(label, 'small', fn);
      btn.disabled = disabled;
      li.append(main, btn);
      list.appendChild(li);
    };
    const online = !svc.offlineOnly;
    if (!acct.username && online)
      item(S.claimTitle, S.claimShort, S.claimGo, () => {
        m.close();
        void showClaimDialog(svc);
      });
    if (acct.username && online)
      item(S.linkTitle, S.linkSub, S.linkGo, () => void showLinkCode(svc), acct.state !== 'signed-in');
    if (online)
      item(S.redeemTitle, S.redeemSub, S.redeemGo, () => {
        m.close();
        void openRedeemDialog(svc);
      });
    if (online)
      item(S.recoverTitle, S.recoverSub, S.recoverGo, () => {
        m.close();
        void openRecoverDialog(svc);
      });
    if (getSaveJSON)
      item(S.exportTitle, S.exportSub, S.exportGo, () => {
        const json = getSaveJSON();
        if (!json) return;
        downloadText(json, `dormant-grid-${acct.username ?? 'save'}-${new Date().toISOString().slice(0, 10)}.json`);
      });
    item(S.importTitle, S.importSub, S.importGo, () => pickFile(async (text) => {
      const s = await svc.importSave(text);
      if (s) {
        svc.sync.onLoadSave?.(s);
        m.close();
      }
    }));
    b.appendChild(list);
  };
  render();
}

function downloadText(text: string, name: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function pickFile(cb: (text: string) => void): void {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'application/json,.json';
  inp.addEventListener('change', () => {
    const f = inp.files?.[0];
    if (!f || f.size > 16 * 1024 * 1024) return;
    void f.text().then(cb);
  });
  inp.click();
}

async function showLinkCode(svc: Services): Promise<void> {
  const m = modal(S.linkTitle);
  const p = el('p', '', S.linkLoading);
  m.box.appendChild(p);
  try {
    const r = await svc.account.createLink();
    p.textContent = S.linkBody;
    const codeEl = el('div', 'code', r.code);
    const timer = el('p', '');
    timer.style.fontSize = '13px';
    const row = el('div', 'row');
    row.append(button(S.done, 'primary', () => m.close()));
    m.box.append(codeEl, timer, row);
    const tick = () => {
      if (!document.body.contains(m.root)) return;
      const left = Math.max(0, r.expiresAt - Date.now());
      timer.textContent = left > 0 ? S.expiresIn(Math.floor(left / 60000), Math.floor((left % 60000) / 1000)) : S.expired;
      if (left > 0) setTimeout(tick, 1000);
    };
    tick();
  } catch (e) {
    p.textContent = friendly(e);
    m.box.appendChild(button(S.close, '', () => m.close()));
  }
}

// ---------------- co-op screen ----------------
const PINGS: { kind: PingKind; label: string }[] = [
  { kind: 'here', label: S.pingHere },
  { kind: 'danger', label: S.pingDanger },
  { kind: 'loot', label: S.pingLoot },
  { kind: 'help', label: S.pingHelp },
  { kind: 'go', label: S.pingGo },
];
const EMOTES = ['wave', 'thumbsup', 'cheer', 'point', 'laugh', 'shrug', 'thanks'];

export function openCoopScreen(svc: Services, playerPos: (() => { x: number; z: number }) | null): void {
  const coop = svc.coop;
  const m = modal(S.coopTitle, () => {
    coop.onPlayers = prevPlayers;
  }, true);
  const b = body(m);
  const prevPlayers = coop.onPlayers;
  const render = () => {
    b.textContent = '';
    if (svc.offlineOnly || !svc.account.username) {
      b.appendChild(el('p', '', svc.offlineOnly ? S.offlineBuild : S.coopNeedsAccount));
      if (!svc.offlineOnly)
        b.appendChild(
          button(S.claimGo, 'primary', () => {
            m.close();
            void showClaimDialog(svc);
          }),
        );
      return;
    }
    if (!coop.active) {
      b.appendChild(el('p', '', S.coopIntro));
      const err = el('div', 'err');
      const hostBtn = button(S.hostGo, 'primary', async () => {
        hostBtn.disabled = true;
        try {
          await coop.hostRoom();
          render();
        } catch (e) {
          err.textContent = friendly(e);
          hostBtn.disabled = false;
        }
      });
      const input = el('input', 'input');
      input.placeholder = S.codePlaceholder;
      input.autocapitalize = 'characters';
      input.autocomplete = 'off';
      input.maxLength = 7;
      const joinBtn = button(S.joinGo, '', () => {
        if (!coop.join(input.value)) err.textContent = S.badCode;
        else render();
      });
      const row = el('div', 'row');
      row.style.justifyContent = 'flex-start';
      row.append(hostBtn);
      b.append(row, el('p', '', S.orJoin), input, joinBtn, err);
      return;
    }
    const st = el('div', 'detail');
    st.appendChild(el('h3', '', `${S.room} ${coop.code}`));
    st.appendChild(el('p', '', statusText(coop.status) + (coop.isHost ? ` · ${S.youHost}` : coop.host ? ` · ${S.hostIs(coop.host)}` : '')));
    const link = coop.shareLink();
    if (link) {
      const share = button(S.share, 'small', async () => {
        const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
        if (nav.share) {
          try {
            await nav.share({ title: 'DORMANT GRID', text: S.shareText(coop.code ?? ''), url: link });
            return;
          } catch {
            /* fall back to copy */
          }
        }
        share.textContent = (await copyText(link)) ? S.copied : S.copyFailed;
      });
      st.appendChild(share);
    }
    b.appendChild(st);
    const list = el('div', 'list');
    list.style.marginTop = '12px';
    const me = el('div', 'li');
    me.appendChild(el('div', 'main')).append(el('b', '', `${coop.me ?? svc.account.username} (${S.you})`));
    list.appendChild(me);
    for (const id of coop.playerIds) {
      const li = el('div', 'li');
      const main = el('div', 'main');
      main.append(el('b', '', id), el('small', '', coop.reconnecting.has(id) ? S.reconnecting : id === coop.host ? S.host : S.connected));
      li.appendChild(main);
      list.appendChild(li);
    }
    b.appendChild(list);
    b.appendChild(el('p', '', S.pings));
    const pr = el('div', 'row');
    pr.style.justifyContent = 'flex-start';
    for (const p of PINGS)
      pr.appendChild(
        button(p.label, 'small', () => {
          const pos = playerPos?.() ?? { x: 0, z: 0 };
          coop.sendPing(p.kind, pos.x, pos.z);
        }),
      );
    b.appendChild(pr);
    const er = el('div', 'row');
    er.style.justifyContent = 'flex-start';
    er.style.marginTop = '8px';
    for (const e of EMOTES) er.appendChild(button(S.emote(e), 'small ghost', () => coop.sendEmote(e)));
    b.appendChild(er);
    const leave = button(S.leave, 'danger', () => {
      coop.leave();
      render();
    });
    leave.style.marginTop = '14px';
    b.appendChild(leave);
  };
  coop.onPlayers = () => {
    prevPlayers?.();
    render();
  };
  render();
}

function statusText(s: NetStatus): string {
  return s === 'online' ? S.connected : s === 'reconnecting' ? S.reconnecting : s === 'syncing' ? S.connecting : s === 'error' ? S.netError : S.offlineNow;
}

// ---------------- reconnect chip ----------------
function mountStatusChip(bus: Bus, svc: Services): void {
  const chip = el('div', 'toast warm net-chip');
  chip.style.position = 'fixed';
  chip.style.left = '50%';
  chip.style.top = 'calc(var(--safe-t) + 52px)';
  chip.style.transform = 'translateX(-50%)';
  chip.style.display = 'none';
  chip.style.pointerEvents = 'none';
  chip.style.zIndex = '25';
  (document.getElementById('ui') ?? document.body).appendChild(chip);
  bus.on('net', (ev) => {
    const coopIssue = svc.coop.active && (ev.status === 'reconnecting' || svc.coop.status === 'reconnecting');
    if (coopIssue) {
      chip.textContent = S.reconnectingChip;
      chip.style.display = 'flex';
    } else chip.style.display = 'none';
  });
}

/**
 * Install net UI: claim prompt hook, conflict dialog, account/co-op screens on
 * bus 'open' events, and the reconnecting chip.
 */
export function mountNetUI(
  bus: Bus,
  svc: Services,
  hooks: { getSaveJSON?: () => string | null; playerPos?: () => { x: number; z: number } } = {},
): void {
  svc.showClaim = () => showClaimDialog(svc);
  svc.sync.onConflict = (info) => conflictDialog(info);
  bus.on('open', (ev) => {
    if (ev.screen === 'account') openAccountScreen(svc, hooks.getSaveJSON ?? null);
    else if (ev.screen === 'coop') openCoopScreen(svc, hooks.playerPos ?? null);
  });
  mountStatusChip(bus, svc);
}

/** Close any open net dialogs (e.g. when entering a cinematic). */
export function closeNetUI(): void {
  for (const m of [...openModals]) m.close();
}
