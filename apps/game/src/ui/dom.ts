// Tiny DOM helpers for the UI layer.

type Attrs = Record<string, string | number | boolean | undefined | ((e: Event) => void)>;

/** h('div.cls1.cls2', {attrs/on*}, ...children) */
export function h<K extends keyof HTMLElementTagNameMap>(sel: K | `${K}.${string}`, attrs: Attrs | null = null, ...kids: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const [tag, ...cls] = sel.split('.');
  const el = document.createElement(tag as K);
  if (cls.length) el.className = cls.join(' ');
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === false) continue;
      if (typeof v === 'function') el.addEventListener(k.replace(/^on/, '').toLowerCase(), v as EventListener);
      else if (k === 'text') el.textContent = String(v);
      else if (k === 'html') el.innerHTML = String(v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  for (const k of kids) if (k !== null && k !== undefined && k !== false) el.append(k instanceof Node ? k : document.createTextNode(k));
  return el;
}

/** Tap handler that works for both touch and mouse without the 300ms delay or double fire. */
export function tap(el: HTMLElement, fn: (e: Event) => void): HTMLElement {
  let touched = 0;
  el.addEventListener(
    'touchend',
    (e) => {
      touched = performance.now();
      e.preventDefault();
      e.stopPropagation();
      fn(e);
    },
    { passive: false },
  );
  el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  el.addEventListener('click', (e) => {
    if (performance.now() - touched < 600) return;
    e.stopPropagation();
    fn(e);
  });
  return el;
}

export function btn(label: string | Node, cls: string, fn: () => void, attrs: Attrs = {}): HTMLButtonElement {
  const b = h('button', { class: `btn ${cls}`.trim(), type: 'button', ...attrs }, label);
  tap(b, () => {
    if (!b.disabled) fn();
  });
  return b;
}

export function clear(el: HTMLElement): HTMLElement {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** Stop touch events inside panels from reaching the game canvas, while keeping native scrolling. */
export function shield(el: HTMLElement): void {
  for (const t of ['touchstart', 'touchmove', 'touchend'] as const) el.addEventListener(t, (e) => e.stopPropagation(), { passive: true });
  el.addEventListener('mousedown', (e) => e.stopPropagation());
}

export const SVG = {
  inventory: '<svg viewBox="0 0 24 24"><path d="M6 8h12l-1 12H7z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  craft: '<svg viewBox="0 0 24 24"><path d="M14 4l6 6-3 3-6-6z"/><path d="M11 7l-7 7 6 6 7-7"/></svg>',
  build: '<svg viewBox="0 0 24 24"><path d="M3 20h18"/><path d="M5 20V10l7-5 7 5v10"/><path d="M10 20v-6h4v6"/></svg>',
  map: '<svg viewBox="0 0 24 24"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
  ledger: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><path d="M15 15c3 0 6 1.8 6 5"/></svg>',
  journal: '<svg viewBox="0 0 24 24"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M9 9h6M9 13h6"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  attack: '<svg viewBox="0 0 24 24"><path d="M14.5 4.5l5 5-9 9-5-5z"/><path d="M4 20l3-3"/></svg>',
  interact: '<svg viewBox="0 0 24 24"><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11.5V4a1.5 1.5 0 0 1 3 0v7.5"/><path d="M14 11V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-2-3.5a1.5 1.5 0 0 1 2.6-1.5L8 14"/></svg>',
  dodge: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v4h4"/></svg>',
  jump: '<svg viewBox="0 0 24 24"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>',
  sprint: '<svg viewBox="0 0 24 24"><path d="M13 4l-7 9h6l-1 7 7-9h-6z"/></svg>',
  rotate: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-3-6.2"/><path d="M20 4v4h-4"/></svg>',
};
