import { Vector3, type Object3D } from 'three';
import { h } from './dom';
import type { UIShared } from './shared';

interface Bubble {
  anchor: Object3D;
  el: HTMLElement;
  height: number;
  until: number;
  dead: boolean;
}

const MAX = 4;
const FAR = 25;

/** Comic speech bubbles above characters/objects ("Chauds les marrons !"). */
export class Bubbles {
  private layer: HTMLElement;
  private list: Bubble[] = [];
  private v = new Vector3();

  constructor(private ui: UIShared) {
    this.layer = h('div', { class: 'gl-bubbles', 'aria-hidden': 'true' });
    ui.root.appendChild(this.layer);
    ui.ctx.addSystem(() => this.update());
  }

  show(anchor: Object3D, text: string, opts?: { duration?: number; height?: number }) {
    const t = String(text ?? '').trim();
    if (!anchor || !t) return;
    const duration = opts?.duration ?? Math.max(2600, Math.min(7000, 1800 + t.length * 60));
    const now = performance.now();
    let b = this.list.find((x) => x.anchor === anchor && !x.dead);
    if (b) {
      b.el.firstElementChild!.textContent = t;
      b.until = now + duration;
      b.height = opts?.height ?? b.height;
      b.el.classList.remove('is-pop');
      void b.el.offsetWidth;
      b.el.classList.add('is-pop');
    } else {
      const el = h('div', { class: 'gl-bubble' }, h('span', { class: 'gl-bubble__text', text: t }));
      b = { anchor, el, height: opts?.height ?? 1.85, until: now + duration, dead: false };
      this.list.push(b);
      this.layer.appendChild(el);
      requestAnimationFrame(() => el.classList.add('is-pop'));
      const alive = this.list.filter((x) => !x.dead);
      while (alive.length > MAX) this.kill(alive.shift()!);
    }
    this.place(b);
  }

  private kill(b: Bubble) {
    if (b.dead) return;
    b.dead = true;
    b.el.classList.add('is-out');
    setTimeout(() => {
      b.el.remove();
      this.list = this.list.filter((x) => x !== b);
    }, 300);
  }

  private update() {
    if (!this.list.length) return;
    const now = performance.now();
    for (const b of this.list) {
      if (b.dead) continue;
      if (now > b.until || !b.anchor.parent) {
        this.kill(b);
        continue;
      }
      this.place(b);
    }
  }

  private place(b: Bubble) {
    const ctx = this.ui.ctx;
    const cam = ctx.camera;
    if (!cam) return;
    b.anchor.getWorldPosition(this.v);
    this.v.y += b.height;
    const ref = ctx.player?.position ?? cam.position;
    const dist = Math.hypot(this.v.x - ref.x, this.v.z - ref.z);
    const camDist = this.v.distanceTo(cam.position);
    this.v.project(cam);
    const off = dist > FAR || this.v.z > 1 || this.v.z < -1 || Math.abs(this.v.x) > 1.1 || Math.abs(this.v.y) > 1.1;
    const blocked = ctx.mode === 'map' || ctx.mode === 'title' || ctx.mode === 'loading';
    b.el.classList.toggle('is-hidden', off || blocked);
    if (off) return;
    const x = (this.v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this.v.y * 0.5 + 0.5) * window.innerHeight;
    const k = Math.max(0.86, Math.min(1.08, 10 / Math.max(1, camDist)));
    b.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${k.toFixed(3)})`;
  }
}
