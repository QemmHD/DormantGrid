// Unified touch + keyboard/mouse input. Produces a per-frame snapshot.
// Touch: floating left stick, right-side swipe-look, DOM buttons bound to actions.

export type Action =
  | 'attack'
  | 'heavy'
  | 'interact'
  | 'dodge'
  | 'jump'
  | 'sprint'
  | 'build'
  | 'inventory'
  | 'craft'
  | 'map'
  | 'menu'
  | 'q1'
  | 'q2'
  | 'q3'
  | 'q4'
  | 'rotate'
  | 'confirm'
  | 'cancel'
  | 'ledger'
  | 'journal'
  | 'perks'
  | 'ping'
  | 'photo';

const KEYMAP: Record<string, Action> = {
  Space: 'jump',
  KeyE: 'interact',
  KeyF: 'interact',
  KeyQ: 'dodge',
  ControlLeft: 'dodge',
  KeyB: 'build',
  KeyI: 'inventory',
  Tab: 'inventory',
  KeyC: 'craft',
  KeyM: 'map',
  KeyL: 'ledger',
  KeyJ: 'journal',
  KeyK: 'perks',
  KeyG: 'ping',
  KeyP: 'photo',
  Escape: 'menu',
  Digit1: 'q1',
  Digit2: 'q2',
  Digit3: 'q3',
  Digit4: 'q4',
  KeyR: 'rotate',
  Enter: 'confirm',
  Backspace: 'cancel',
};

export class Input {
  // movement -1..1 (x right, y forward)
  moveX = 0;
  moveY = 0;
  moveMag = 0;
  // look delta in "pixels" this frame
  lookX = 0;
  lookY = 0;
  /** camera zoom delta this frame (+ = further away) */
  zoom = 0;
  sprintToggle = false;
  usingTouch = false;
  leftHanded = false;
  sensitivity = 1;
  /** vertical look as a fraction of horizontal */
  sensitivityY = 0.8;
  /** true while any modal UI is open; game ignores movement */
  uiBlocking = false;

  private held = new Set<Action>();
  private pressed = new Set<Action>();
  private released = new Set<Action>();
  private heldSince = new Map<Action, number>();
  private keys = new Set<string>();
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private stickPos = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  /** total travel since the look touch began (dead zone so taps never nudge the camera) */
  private lookTravel = 0;
  private pinchId: number | null = null;
  private pinchLast = { x: 0, y: 0 };
  private pinchDist = 0;
  private pointerLocked = false;
  readonly stickEl: HTMLDivElement;
  readonly stickKnob: HTMLDivElement;
  private readonly STICK_R = 60;
  /** buffered presses (input forgiveness): action -> expiry time */
  private buffer = new Map<Action, number>();

  constructor(private surface: HTMLElement) {
    this.stickEl = document.createElement('div');
    this.stickEl.className = 'stick';
    this.stickKnob = document.createElement('div');
    this.stickKnob.className = 'stick-knob';
    this.stickEl.appendChild(this.stickKnob);
    document.getElementById('ui')!.appendChild(this.stickEl);

    surface.addEventListener('touchstart', this.onTouchStart, { passive: false });
    surface.addEventListener('touchmove', this.onTouchMove, { passive: false });
    surface.addEventListener('touchend', this.onTouchEnd, { passive: false });
    surface.addEventListener('touchcancel', this.onTouchEnd, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    surface.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    surface.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom += Math.sign(e.deltaY) * Math.min(1, Math.abs(e.deltaY) / 100) * 0.6;
      },
      { passive: false },
    );
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === surface;
    });
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });
  }

  releaseAll(): void {
    for (const a of this.held) this.released.add(a);
    this.held.clear();
    this.keys.clear();
    this.stickId = null;
    this.lookId = null;
    this.pinchId = null;
    this.moveX = this.moveY = this.moveMag = 0;
    this.stickEl.classList.remove('on');
  }

  /** Bind a DOM button to an action (touch + mouse). */
  bindButton(el: HTMLElement, action: Action): void {
    const down = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.usingTouch = e.type === 'touchstart' || this.usingTouch;
      el.classList.add('down');
      this.press(action);
    };
    const up = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove('down');
      this.release(action);
    };
    el.addEventListener('touchstart', down, { passive: false });
    el.addEventListener('touchend', up, { passive: false });
    el.addEventListener('touchcancel', up, { passive: false });
    el.addEventListener('mousedown', down);
    el.addEventListener('mouseup', up);
    el.addEventListener('mouseleave', (e) => {
      if (this.held.has(action)) up(e);
    });
  }

  press(a: Action): void {
    if (!this.held.has(a)) {
      this.pressed.add(a);
      this.heldSince.set(a, performance.now());
      this.buffer.set(a, performance.now() + 150);
    }
    this.held.add(a);
    if (a === 'sprint') this.sprintToggle = !this.sprintToggle;
  }

  release(a: Action): void {
    if (this.held.has(a)) this.released.add(a);
    this.held.delete(a);
  }

  isHeld(a: Action): boolean {
    return this.held.has(a);
  }
  wasPressed(a: Action): boolean {
    return this.pressed.has(a);
  }
  /** Handle a press once: later readers in the same frame (fixed-step tickers) no longer see it. */
  consume(a: Action): boolean {
    return this.pressed.delete(a);
  }
  wasReleased(a: Action): boolean {
    return this.released.has(a);
  }
  /** Consume a buffered press within ~150 ms (input forgiveness). */
  consumeBuffered(a: Action): boolean {
    const t = this.buffer.get(a);
    if (t !== undefined && t >= performance.now()) {
      this.buffer.delete(a);
      return true;
    }
    return false;
  }
  heldFor(a: Action): number {
    if (!this.held.has(a)) return 0;
    return (performance.now() - (this.heldSince.get(a) ?? performance.now())) / 1000;
  }

  /** Called at end of frame. */
  endFrame(): void {
    this.pressed.clear();
    this.released.clear();
    this.lookX = 0;
    this.lookY = 0;
    this.zoom = 0;
  }

  /** Sample keyboard movement each frame. */
  update(): void {
    if (this.stickId === null) {
      let x = 0;
      let y = 0;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
      const m = Math.hypot(x, y);
      this.moveX = m > 0 ? x / m : 0;
      this.moveY = m > 0 ? y / m : 0;
      this.moveMag = m > 0 ? 1 : 0;
    }
    if (this.uiBlocking) {
      this.moveX = this.moveY = this.moveMag = 0;
    }
  }

  get sprinting(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.sprintToggle;
  }

  // ---- touch ----
  private isStickSide(x: number): boolean {
    const half = window.innerWidth * 0.45;
    return this.leftHanded ? x > window.innerWidth - half : x < half;
  }

  private onTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    this.usingTouch = true;
    for (const t of Array.from(e.changedTouches)) {
      if (this.stickId === null && this.isStickSide(t.clientX) && !this.uiBlocking) {
        this.stickId = t.identifier;
        this.stickOrigin = { x: t.clientX, y: t.clientY };
        this.stickPos = { x: t.clientX, y: t.clientY };
        this.stickEl.style.transform = `translate(${t.clientX}px, ${t.clientY}px)`;
        this.stickKnob.style.transform = 'translate(-50%, -50%)';
        this.stickEl.classList.add('on');
      } else if (this.lookId === null) {
        this.lookId = t.identifier;
        this.lookLast = { x: t.clientX, y: t.clientY };
        this.lookTravel = 0;
      } else if (this.pinchId === null) {
        // second finger on the look side: pinch to zoom
        this.pinchId = t.identifier;
        this.pinchLast = { x: t.clientX, y: t.clientY };
        this.pinchDist = Math.hypot(t.clientX - this.lookLast.x, t.clientY - this.lookLast.y);
      }
    }
  };

  private onTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.stickId) {
        this.stickPos = { x: t.clientX, y: t.clientY };
        let dx = t.clientX - this.stickOrigin.x;
        let dy = t.clientY - this.stickOrigin.y;
        const d = Math.hypot(dx, dy);
        const r = this.STICK_R;
        if (d > r * 1.6) {
          // let the stick follow the thumb so it never "runs out"
          const k = (d - r * 1.6) / d;
          this.stickOrigin.x += dx * k;
          this.stickOrigin.y += dy * k;
          dx = t.clientX - this.stickOrigin.x;
          dy = t.clientY - this.stickOrigin.y;
          this.stickEl.style.transform = `translate(${this.stickOrigin.x}px, ${this.stickOrigin.y}px)`;
        }
        const cd = Math.min(Math.hypot(dx, dy), r);
        const a = Math.atan2(dy, dx);
        const kx = Math.cos(a) * cd;
        const ky = Math.sin(a) * cd;
        this.stickKnob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
        const dead = 0.12;
        const m = cd / r;
        const lin = m < dead ? 0 : (m - dead) / (1 - dead);
        // gentle response curve: fine control near the center, full speed at the rim
        const mm = Math.pow(lin, 1.35);
        this.moveMag = mm;
        this.moveX = Math.cos(a) * mm;
        this.moveY = -Math.sin(a) * mm;
        if (this.uiBlocking) this.moveX = this.moveY = this.moveMag = 0;
      } else if (t.identifier === this.lookId || t.identifier === this.pinchId) {
        if (t.identifier === this.pinchId) this.pinchLast = { x: t.clientX, y: t.clientY };
        else {
          const dx = t.clientX - this.lookLast.x;
          const dy = t.clientY - this.lookLast.y;
          this.lookLast = { x: t.clientX, y: t.clientY };
          if (this.pinchId === null) {
            this.lookTravel += Math.hypot(dx, dy);
            // 5 px dead zone per touch, then an acceleration curve: slow drags are precise, flicks turn fast
            if (this.lookTravel > 5) {
              const speed = Math.hypot(dx, dy);
              const gain = (0.95 + 0.9 * Math.min(1, speed / 22)) * this.sensitivity;
              this.lookX += dx * gain;
              this.lookY += dy * gain * this.sensitivityY;
            }
          }
        }
        if (this.pinchId !== null) {
          const d = Math.hypot(this.pinchLast.x - this.lookLast.x, this.pinchLast.y - this.lookLast.y);
          this.zoom -= (d - this.pinchDist) * 0.012;
          this.pinchDist = d;
        }
      }
    }
  };

  private onTouchEnd = (e: TouchEvent) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.stickId) {
        this.stickId = null;
        this.moveX = this.moveY = this.moveMag = 0;
        this.stickEl.classList.remove('on');
      } else if (t.identifier === this.lookId) {
        // if pinching, the remaining finger becomes the look finger
        if (this.pinchId !== null) {
          this.lookId = this.pinchId;
          this.lookLast = { ...this.pinchLast };
          this.lookTravel = 10;
          this.pinchId = null;
        } else this.lookId = null;
      } else if (t.identifier === this.pinchId) {
        this.pinchId = null;
      }
    }
  };

  // ---- keyboard / mouse ----
  private onKeyDown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.code === 'Tab') e.preventDefault();
    this.usingTouch = false;
    if (e.repeat) return;
    this.keys.add(e.code);
    const a = KEYMAP[e.code];
    if (a) this.press(a);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    const a = KEYMAP[e.code];
    if (a) this.release(a);
  };
  private onMouseDown = (e: MouseEvent) => {
    if (this.usingTouch) return;
    if (!this.pointerLocked && !this.uiBlocking) {
      this.surface.requestPointerLock?.();
      return;
    }
    if (e.button === 0) this.press('attack');
    if (e.button === 2) this.press('heavy');
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.release('attack');
    if (e.button === 2) this.release('heavy');
  };
  private onMouseMove = (e: MouseEvent) => {
    if (!this.pointerLocked) return;
    this.lookX += e.movementX * 0.9 * this.sensitivity;
    this.lookY += e.movementY * 0.9 * this.sensitivity * this.sensitivityY;
  };

  exitPointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }
}
