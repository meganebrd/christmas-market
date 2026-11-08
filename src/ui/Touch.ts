import type { GameMode } from '../core/contracts';
import { h } from './dom';
import { icon } from './icons';
import type { Prompt } from './Prompt';
import type { UIShared } from './shared';

const R = 56; // joystick travel radius (px)

/**
 * Phone controls: a floating joystick (appears where the left thumb lands), a big action button that
 * shows the current prompt, and a map button. Taps elsewhere still reach the 3D canvas (tap-to-move).
 */
export class Touch {
  private el: HTMLElement;
  private stick: HTMLElement;
  private knob: HTMLElement;
  private action: HTMLButtonElement;
  private actionLabel: HTMLElement;
  private mapBtn: HTMLButtonElement;
  private pointerId: number | null = null;
  private origin = { x: 0, y: 0 };
  private downAt = 0;
  private moved = false;
  private label: string | null = null;
  private holdTimer = 0;

  constructor(private ui: UIShared, prompt: Prompt) {
    this.knob = h('span', { class: 'gl-stick__knob' });
    this.stick = h('div', { class: 'gl-stick', 'aria-hidden': 'true' }, h('span', { class: 'gl-stick__ring' }), this.knob);
    this.actionLabel = h('span', { class: 'gl-action__label' });
    this.action = h(
      'button',
      {
        class: 'gl-action',
        type: 'button',
        'aria-label': 'Interagir',
        onpointerdown: (e: PointerEvent) => {
          e.preventDefault();
          this.action.classList.add('is-down');
        },
        onpointerup: () => this.action.classList.remove('is-down'),
        onpointercancel: () => this.action.classList.remove('is-down'),
        onclick: () => {
          ui.ctx.input?.press?.('interact');
          if (navigator.vibrate) {
            try {
              navigator.vibrate(8);
            } catch {
              /* ignore */
            }
          }
        },
      },
      h('span', { class: 'gl-action__ring', 'aria-hidden': 'true' }),
      icon('hand', { size: 30 }),
    );
    this.mapBtn = h(
      'button',
      { class: 'gl-touchmap', type: 'button', 'aria-label': 'Carte', onclick: () => ui.ctx.input?.press?.('map') },
      icon('map', { size: 24 }),
    );
    this.el = h('div', { class: 'gl-touch' }, this.stick, h('div', { class: 'gl-touch__right' }, this.mapBtn, h('div', { class: 'gl-action-wrap' }, this.actionLabel, this.action)));
    ui.root.appendChild(this.el);

    prompt.onChange((label) => this.setLabel(label));
    ui.ctx.events?.on('mode:change', ({ to }) => this.applyMode(to));
    ui.onDeviceChange(() => this.applyMode(ui.ctx.mode));
    this.applyMode(ui.ctx.mode);

    // The joystick listens before the canvas (capture) and keeps its touch to itself.
    window.addEventListener('pointerdown', (e) => this.onDown(e), { capture: true });
    window.addEventListener('pointermove', (e) => this.onMove(e), { capture: true });
    window.addEventListener('pointerup', (e) => this.onUp(e), { capture: true });
    window.addEventListener('pointercancel', (e) => this.onUp(e, true), { capture: true });
  }

  private enabled() {
    const mode = this.ui.ctx.mode;
    const stickOff = mode === 'minigame' && document.documentElement.dataset.mgJoystick === 'off';
    return this.ui.isTouch() && !stickOff && (mode === 'explore' || mode === 'minigame') && !this.ui.ctx.ui?.isBlocking?.();
  }

  private applyMode(mode: GameMode) {
    const on = this.ui.isTouch() && (mode === 'explore' || mode === 'minigame');
    this.el.classList.toggle('is-on', on);
    this.el.dataset.mode = mode;
    if (!on) this.release();
  }

  private setLabel(label: string | null) {
    this.label = label;
    this.actionLabel.textContent = label ?? '';
    this.el.classList.toggle('has-action', !!label);
    this.action.setAttribute('aria-label', label ?? 'Interagir');
    if (label) {
      this.action.classList.remove('is-pop');
      void this.action.offsetWidth;
      this.action.classList.add('is-pop');
    }
  }

  private onDown(e: PointerEvent) {
    if (e.pointerType !== 'touch' || this.pointerId !== null) return;
    if (!this.enabled()) return;
    const canvas = this.ui.ctx.renderer?.domElement;
    if (!canvas || e.target !== canvas) return;
    if (e.clientX > window.innerWidth * 0.5 || e.clientY < 90) return;
    e.stopPropagation();
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.origin = { x: e.clientX, y: e.clientY };
    this.downAt = performance.now();
    this.moved = false;
    // Hidden until the thumb really holds or drags: a simple tap never leaves a ring behind.
    this.stick.classList.remove('is-resetting');
    this.stick.classList.add('is-pending');
    this.stick.style.left = `${e.clientX}px`;
    this.stick.style.top = `${e.clientY}px`;
    this.knob.style.transform = 'translate(-50%, -50%)';
    clearTimeout(this.holdTimer);
    this.holdTimer = window.setTimeout(() => this.activate(), 140);
  }

  private activate() {
    if (this.pointerId === null) return;
    this.stick.classList.remove('is-pending');
    this.stick.classList.add('is-active');
  }

  private onMove(e: PointerEvent) {
    if (e.pointerId !== this.pointerId) return;
    e.stopPropagation();
    e.preventDefault();
    let dx = e.clientX - this.origin.x;
    let dy = e.clientY - this.origin.y;
    const len = Math.hypot(dx, dy);
    if (len > 10) this.moved = true;
    if (len > 6 && !this.stick.classList.contains('is-active')) this.activate();
    // the base follows the thumb when it goes past the edge (comfortable on small phones)
    if (len > R * 1.35) {
      const k = (len - R * 1.35) / len;
      this.origin.x += dx * k;
      this.origin.y += dy * k;
      this.stick.style.left = `${this.origin.x}px`;
      this.stick.style.top = `${this.origin.y}px`;
      dx = e.clientX - this.origin.x;
      dy = e.clientY - this.origin.y;
    }
    const l = Math.min(R, Math.hypot(dx, dy));
    const a = Math.atan2(dy, dx);
    const kx = Math.cos(a) * l;
    const ky = Math.sin(a) * l;
    this.knob.style.transform = `translate(calc(-50% + ${kx.toFixed(1)}px), calc(-50% + ${ky.toFixed(1)}px))`;
    const dead = 0.12;
    let mx = kx / R;
    let my = -ky / R;
    const m = Math.hypot(mx, my);
    if (m < dead) mx = my = 0;
    this.ui.ctx.input?.setVirtualMove?.(mx, my);
  }

  private onUp(e: PointerEvent, cancel = false) {
    if (e.pointerId !== this.pointerId) return;
    e.stopPropagation();
    const quick = !this.moved && performance.now() - this.downAt < 300;
    this.release();
    // a quick tap in the joystick zone is still a tap on the world (walk there / talk)
    if (quick && !cancel) this.forwardTap(e);
  }

  private release() {
    if (this.pointerId === null) return;
    this.pointerId = null;
    clearTimeout(this.holdTimer);
    this.ui.ctx.input?.setVirtualMove?.(0, 0);
    // back to the resting ghost (bottom-left): hide, jump home, then fade the ghost back in
    this.stick.classList.remove('is-active', 'is-pending');
    this.stick.classList.add('is-resetting');
    this.stick.style.left = '';
    this.stick.style.top = '';
    this.knob.style.transform = 'translate(-50%, -50%)';
    requestAnimationFrame(() => requestAnimationFrame(() => this.stick.classList.remove('is-resetting')));
  }

  private forwardTap(e: PointerEvent) {
    const input = this.ui.ctx.input;
    const canvas = this.ui.ctx.renderer?.domElement;
    if (!input || !canvas) return;
    const r = canvas.getBoundingClientRect();
    input.pointer.type = 'touch';
    input.tap(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
}
