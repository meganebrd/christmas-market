/**
 * Unified input: keyboard (QWERTY/AZERTY via physical key codes), mouse, touch joystick (fed by the UI),
 * tap/click-to-move. Read `move`, `run` every frame; use `pressed(action)` for edge-triggered actions.
 */
export type Action = 'interact' | 'cancel' | 'map' | 'run' | 'camLeft' | 'camRight' | 'mute' | 'next';

const KEY_ACTIONS: Record<string, Action> = {
  KeyE: 'interact',
  Space: 'interact',
  Enter: 'interact',
  NumpadEnter: 'interact',
  Escape: 'cancel',
  KeyM: 'map',
  Tab: 'map',
  ShiftLeft: 'run',
  ShiftRight: 'run',
  KeyQ: 'camLeft', // physical Q (A on AZERTY)… see below: we use KeyQ only when not used for movement
  KeyR: 'camRight',
  KeyN: 'next',
};

// Physical WASD = ZQSD on AZERTY (KeyboardEvent.code is layout-independent).
const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

export interface PointerState {
  /** Normalised device coordinates (-1..1). */
  x: number;
  y: number;
  /** Pixels. */
  px: number;
  py: number;
  down: boolean;
  /** A click/tap happened this frame without dragging. */
  clicked: boolean;
  /** Horizontal drag delta this frame (camera orbit), in pixels. */
  dragDX: number;
  dragDY: number;
  /** Wheel/pinch zoom delta this frame. */
  zoom: number;
  type: 'mouse' | 'touch' | 'pen';
}

function isTyping(e: Event): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

export class Input {
  /** x = right, y = forward. Length ≤ 1. */
  readonly move = { x: 0, y: 0 };
  run = false;
  readonly pointer: PointerState = { x: 0, y: 0, px: 0, py: 0, down: false, clicked: false, dragDX: 0, dragDY: 0, zoom: 0, type: 'mouse' };
  /** Last device used: drives UI hints ("E" vs "Touchez"). */
  lastDevice: 'keyboard' | 'pointer' | 'touch' = 'keyboard';
  /** Input is ignored entirely (e.g. while a text field is focused or the UI blocks). */
  enabled = true;

  private keys = new Set<string>();
  private justPressed = new Set<Action>();
  private virtualMove = { x: 0, y: 0 };
  private virtualRun = false;
  private downAt: { x: number; y: number; t: number } | null = null;
  private dragged = false;
  private touches = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [];

  constructor(private canvas: HTMLCanvasElement) {
    const on = (t: EventTarget, type: string, fn: (e: any) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts);
      this.listeners.push([t, type, fn as EventListener, opts]);
    };
    on(window, 'keydown', (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      this.lastDevice = 'keyboard';
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) {
        const a = KEY_ACTIONS[e.code];
        if (a) this.justPressed.add(a);
      }
      this.keys.add(e.code);
    });
    on(window, 'keyup', (e: KeyboardEvent) => this.keys.delete(e.code));
    on(window, 'blur', () => this.keys.clear());

    on(canvas, 'pointerdown', (e: PointerEvent) => {
      this.pointer.type = e.pointerType as PointerState['type'];
      this.lastDevice = e.pointerType === 'touch' ? 'touch' : 'pointer';
      this.updatePointer(e);
      this.pointer.down = true;
      this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.dragged = false;
      if (e.pointerType === 'touch') this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      canvas.setPointerCapture?.(e.pointerId);
    });
    on(canvas, 'pointermove', (e: PointerEvent) => {
      const prevX = this.pointer.px;
      const prevY = this.pointer.py;
      this.updatePointer(e);
      if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.touches.size === 2) {
          const [a, b] = [...this.touches.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (this.pinchDist) this.pointer.zoom += (this.pinchDist - d) * 0.01;
          this.pinchDist = d;
          this.dragged = true;
          return;
        }
      }
      if (this.pointer.down && this.downAt) {
        if (Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 8) this.dragged = true;
        if (this.dragged) {
          this.pointer.dragDX += this.pointer.px - prevX;
          this.pointer.dragDY += this.pointer.py - prevY;
        }
      }
    });
    const up = (e: PointerEvent) => {
      if (this.pointer.down && !this.dragged && this.downAt && performance.now() - this.downAt.t < 450) {
        this.pointer.clicked = true;
      }
      this.pointer.down = false;
      this.downAt = null;
      this.touches.delete(e.pointerId);
      if (this.touches.size < 2) this.pinchDist = 0;
    };
    on(canvas, 'pointerup', up);
    on(canvas, 'pointercancel', up);
    on(canvas, 'wheel', (e: WheelEvent) => {
      e.preventDefault();
      this.pointer.zoom += Math.sign(e.deltaY) * 0.6;
    }, { passive: false });
    on(canvas, 'contextmenu', (e: Event) => e.preventDefault());
  }

  private updatePointer(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.px = e.clientX - r.left;
    this.pointer.py = e.clientY - r.top;
    this.pointer.x = (this.pointer.px / r.width) * 2 - 1;
    this.pointer.y = -(this.pointer.py / r.height) * 2 + 1;
  }

  /** Called by the touch joystick (UI). x right, y forward, length ≤ 1. */
  setVirtualMove(x: number, y: number, run = false) {
    this.virtualMove.x = x;
    this.virtualMove.y = y;
    this.virtualRun = run;
    if (x || y) this.lastDevice = 'touch';
  }

  /** A tap/click at a screen position (NDC), forwarded by UI layers that sit above the canvas (joystick zone). */
  tap(ndcX: number, ndcY: number) {
    this.pointer.x = ndcX;
    this.pointer.y = ndcY;
    this.pointer.clicked = true;
    this.lastDevice = 'touch';
  }

  /** Called by on-screen buttons (UI). */
  press(action: Action) {
    this.justPressed.add(action);
  }

  pressed(action: Action): boolean {
    return this.enabled && this.justPressed.has(action);
  }

  isDown(code: string) {
    return this.keys.has(code);
  }

  /** Called once per frame by the core, before systems update. */
  poll() {
    let x = 0;
    let y = 0;
    for (const code of this.keys) {
      const m = MOVE_KEYS[code];
      if (m) {
        x += m[0];
        y += m[1];
      }
    }
    x += this.virtualMove.x;
    y += this.virtualMove.y;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.move.x = this.enabled ? x : 0;
    this.move.y = this.enabled ? y : 0;
    this.run = this.enabled && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.virtualRun || Math.hypot(this.virtualMove.x, this.virtualMove.y) > 0.92);
  }

  /** Called once per frame by the core, after systems update. */
  endFrame() {
    this.justPressed.clear();
    this.pointer.clicked = false;
    this.pointer.dragDX = 0;
    this.pointer.dragDY = 0;
    this.pointer.zoom = 0;
  }

  dispose() {
    for (const [t, type, fn, opts] of this.listeners) t.removeEventListener(type, fn, opts);
  }
}
