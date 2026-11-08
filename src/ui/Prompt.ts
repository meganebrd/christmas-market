import { Vector3 } from 'three';
import { h } from './dom';
import type { UIShared } from './shared';

/** "E · Parler à Margot" pill floating above the focused interactable. */
export class Prompt {
  private el: HTMLElement;
  private keyEl: HTMLElement;
  private labelEl: HTMLElement;
  private label: string | null = null;
  private pos = new Vector3();
  private hasPos = false;
  private v = new Vector3();
  private listeners = new Set<(label: string | null) => void>();

  constructor(private ui: UIShared) {
    this.keyEl = h('kbd', { class: 'gl-prompt__key', text: 'E' });
    this.labelEl = h('span', { class: 'gl-prompt__label' });
    this.el = h('div', { class: 'gl-prompt', 'aria-live': 'polite' }, h('span', { class: 'gl-prompt__pill' }, this.keyEl, this.labelEl), h('span', { class: 'gl-prompt__tail', 'aria-hidden': 'true' }));
    ui.root.appendChild(this.el);
    ui.ctx.addSystem(() => this.update());
  }

  get current() {
    return this.label;
  }

  onChange(fn: (label: string | null) => void) {
    this.listeners.add(fn);
  }

  set(p: { label: string; worldPos?: { x: number; y: number; z: number } } | null) {
    const label = p?.label ? String(p.label) : null;
    if (p?.worldPos) {
      this.pos.set(p.worldPos.x, p.worldPos.y, p.worldPos.z);
      this.hasPos = true;
    } else this.hasPos = false;
    if (label === this.label) return;
    const had = this.label !== null;
    this.label = label;
    if (label) {
      this.labelEl.textContent = label;
      this.el.classList.toggle('is-floating', this.hasPos);
      this.el.classList.remove('is-pop');
      void this.el.offsetWidth;
      this.el.classList.add('is-on', 'is-pop');
      if (!had) this.ui.sfx('ui-hover', { volume: 0.25 });
      this.update();
    } else this.el.classList.remove('is-on', 'is-pop');
    // the zone banner steps back while a prompt is shown (they often meet when arriving at a stall)
    this.ui.root.classList.toggle('gl-has-prompt', !!label);
    for (const fn of this.listeners) fn(label);
  }

  private update() {
    if (!this.label) return;
    this.keyEl.hidden = this.ui.isTouch();
    if (!this.hasPos) {
      this.el.classList.remove('is-floating');
      this.el.style.transform = '';
      return;
    }
    const cam = this.ui.ctx.camera;
    if (!cam) return;
    this.v.copy(this.pos).project(cam);
    const behind = this.v.z > 1 || this.v.z < -1;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const x = Math.max(90, Math.min(W - 90, (this.v.x * 0.5 + 0.5) * W));
    const y = Math.max(70, Math.min(H - 40, (-this.v.y * 0.5 + 0.5) * H));
    this.el.classList.toggle('is-hidden', behind);
    this.el.classList.add('is-floating');
    this.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  }
}
