import { h } from './dom';

/** Soft falling snow on a 2D canvas (title & loading screens). Pauses when hidden. */
export class SnowCanvas {
  readonly el: HTMLCanvasElement;
  private g: CanvasRenderingContext2D | null;
  private flakes: { x: number; y: number; r: number; vy: number; vx: number; ph: number; a: number }[] = [];
  private raf = 0;
  private last = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;

  constructor(private density = 1, private reduced: () => boolean = () => false) {
    this.el = h('canvas', { class: 'gl-snow', 'aria-hidden': 'true' });
    this.g = this.el.getContext('2d');
  }

  private resize = () => {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.el.width = Math.round(this.w * this.dpr);
    this.el.height = Math.round(this.h * this.dpr);
    const target = Math.round(((this.w * this.h) / 9000) * this.density * (this.reduced() ? 0.35 : 1));
    while (this.flakes.length < target) this.flakes.push(this.spawn(true));
    this.flakes.length = Math.min(this.flakes.length, target);
  };

  private spawn(anywhere: boolean) {
    const r = 0.6 + Math.random() ** 2.2 * 2.6;
    return {
      x: Math.random() * (this.w || 1000),
      y: anywhere ? Math.random() * (this.h || 800) : -6,
      r,
      vy: 10 + r * 9 + Math.random() * 8,
      vx: -4 + Math.random() * 8,
      ph: Math.random() * Math.PI * 2,
      a: 0.35 + Math.random() * 0.55,
    };
  }

  start() {
    if (this.raf) return;
    this.resize();
    window.addEventListener('resize', this.resize);
    this.last = performance.now();
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.draw(dt, now / 1000);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    window.removeEventListener('resize', this.resize);
  }

  private draw(dt: number, t: number) {
    const g = this.g;
    if (!g) return;
    const slow = this.reduced() ? 0.35 : 1;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    g.fillStyle = '#fffaf0';
    for (let i = 0; i < this.flakes.length; i++) {
      const f = this.flakes[i];
      f.y += f.vy * dt * slow;
      f.x += (f.vx + Math.sin(t * 0.8 + f.ph) * 9) * dt * slow;
      if (f.y > this.h + 6 || f.x < -10 || f.x > this.w + 10) {
        this.flakes[i] = this.spawn(false);
        continue;
      }
      g.globalAlpha = f.a;
      g.beginPath();
      g.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
}
