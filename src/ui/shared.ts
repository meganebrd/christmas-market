import type { GameContext, SfxName } from '../core/contracts';
import { isControl, trapTab } from './dom';

/**
 * Shared plumbing of the UI module:
 *  - a stack of keyboard "layers" (top-most handles keys first, consumed keys never reach the game),
 *  - the 'panel' mode lock used by stall panel / settings / help,
 *  - defensive audio helpers, reduced-motion and touch detection.
 */
export interface KeyLayer {
  /** The layer's element: Tab is trapped inside it when `modal`. */
  el?: HTMLElement;
  modal?: boolean;
  /** Return true when the key was handled (it is then swallowed). */
  onKey?: (e: KeyboardEvent) => boolean;
}

export class UIShared {
  readonly root: HTMLElement;
  private layers: KeyLayer[] = [];
  private panelLocks = new Set<string>();
  private mql: MediaQueryList | null = null;
  /** Set by index.ts: is a dialogue still open under a panel? */
  dialogueOpen: () => boolean = () => false;
  private hoverAt = 0;

  constructor(readonly ctx: GameContext) {
    this.root = document.getElementById('ui-root') ?? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'ui-root' }));
    this.root.classList.add('gl-ui');
    if (ctx.quality?.tier === 'low') this.root.classList.add('gl-lowfx');
    try {
      this.mql = matchMedia('(prefers-reduced-motion: reduce)');
      this.mql.addEventListener?.('change', () => this.applyMotion());
    } catch {
      /* old browser */
    }
    this.applyMotion();
    this.applyDevice();
    document.addEventListener('keydown', (e) => this.onKeyDown(e));
    // Hover sound on buttons (throttled, desktop only).
    this.root.addEventListener('pointerover', (e) => {
      if ((e as PointerEvent).pointerType !== 'mouse') return;
      const t = (e.target as HTMLElement | null)?.closest?.('button, a.gl-btn');
      if (!t || (e.relatedTarget instanceof Node && t.contains(e.relatedTarget))) return;
      const now = performance.now();
      if (now - this.hoverAt < 90) return;
      this.hoverAt = now;
      this.sfx('ui-hover', { volume: 0.35 });
    });
    // Device class (touch vs keyboard hints).
    window.addEventListener('pointerdown', (e) => this.applyDevice(e.pointerType === 'touch' ? 'touch' : 'pointer'), { capture: true, passive: true });
    window.addEventListener(
      'keydown',
      (e) => {
        // typing on a phone's virtual keyboard must not hide the touch controls
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
        this.applyDevice('keyboard');
      },
      { capture: true, passive: true },
    );
  }

  // ───────────── audio ─────────────

  sfx(name: SfxName, opts?: { volume?: number; pitch?: number }) {
    try {
      this.ctx.audio?.sfx?.(name, opts);
    } catch {
      /* audio is optional */
    }
  }

  blip(char: string, pitch: number) {
    try {
      this.ctx.audio?.voice?.blip?.(char, pitch);
    } catch {
      /* audio is optional */
    }
  }

  // ───────────── motion & device ─────────────

  reducedMotion(): boolean {
    return !!(this.mql?.matches || this.ctx.save?.data?.settings?.reducedMotion);
  }

  applyMotion() {
    this.root.classList.toggle('gl-reduced', this.reducedMotion());
  }

  private device: 'touch' | 'pointer' | 'keyboard' | null = null;
  private deviceListeners = new Set<() => void>();

  /** Touch hints & controls: a touch device, unless the visitor is using a mouse or a keyboard right now. */
  isTouch(): boolean {
    if (this.device) return this.device === 'touch';
    return this.ctx.input?.lastDevice === 'touch' || !!this.ctx.quality?.isTouch;
  }

  onDeviceChange(fn: () => void): () => void {
    this.deviceListeners.add(fn);
    return () => this.deviceListeners.delete(fn);
  }

  private applyDevice(d?: 'touch' | 'pointer' | 'keyboard') {
    const before = this.isTouch();
    if (d) this.device = d;
    const now = this.isTouch();
    this.root.classList.toggle('gl-is-touch', now);
    if (before !== now) for (const fn of this.deviceListeners) fn();
  }

  // ───────────── keyboard layers ─────────────

  pushLayer(layer: KeyLayer): () => void {
    this.layers.push(layer);
    return () => {
      const i = this.layers.indexOf(layer);
      if (i >= 0) this.layers.splice(i, 1);
    };
  }

  /** Move a layer to the top (e.g. the dialogue box re-opened over a panel). */
  raiseLayer(layer: KeyLayer) {
    const i = this.layers.indexOf(layer);
    if (i >= 0) this.layers.splice(i, 1);
    this.layers.push(layer);
  }

  topLayer(): KeyLayer | undefined {
    return this.layers[this.layers.length - 1];
  }

  private onKeyDown(e: KeyboardEvent) {
    const top = this.topLayer();
    const swallow = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (top) {
      if (top.onKey?.(e)) return swallow();
      if (top.modal && top.el && trapTab(top.el, e)) return swallow();
    }
    // Native activation of a focused UI control must not be hijacked by the game (Space = interact, Tab = map…).
    const t = e.target as HTMLElement | null;
    if (t && this.root.contains(t) && isControl(t)) {
      if (e.key === ' ' || e.key === 'Enter' || (e.key === 'Tab' && top?.modal)) e.stopPropagation();
      else if (e.key === 'Tab' && top) {
        // let Tab move focus inside non-modal layers (map legend, dialogue choices)
        if (top.el && top.el.contains(t)) e.stopPropagation();
      }
    }
    if (top?.modal && e.key === 'Tab') e.stopPropagation();
  }

  // ───────────── panel mode lock ─────────────

  /** A blocking panel opens: switch the game to 'panel' (only from explore/dialogue). */
  lockPanel(key: string) {
    const mode = this.ctx.mode;
    if (this.panelLocks.size === 0 && (mode === 'explore' || mode === 'dialogue')) this.ctx.setMode('panel');
    this.panelLocks.add(key);
  }

  /** The panel closed: back to the dialogue (if it is still open) or to exploring. */
  unlockPanel(key: string) {
    if (!this.panelLocks.delete(key)) return;
    if (this.panelLocks.size === 0 && this.ctx.mode === 'panel') this.ctx.setMode(this.dialogueOpen() ? 'dialogue' : 'explore');
  }

  /** Blur a button after a mouse click so Space/Enter go back to the game. */
  static blurAfterPointer(e: MouseEvent) {
    if (e.detail > 0) (e.currentTarget as HTMLElement | null)?.blur?.();
  }
}
