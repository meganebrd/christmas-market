import * as THREE from 'three';
import { glowTexture } from '../world/textures';
import { additiveSprite, hot } from './fx';
import type { StoryRuntime } from './types';

/**
 * The fireworks over the Place du Grand Sapin. Rockets with sparkling trails burst into peonies,
 * rings, golden willows, glitter and — of course — five-pointed stars. Everything goes through the
 * shared pooled particle system (1 draw call) + a few additive flash sprites: cheap enough for phones.
 */
export type BurstType = 'peony' | 'ring' | 'willow' | 'star' | 'glitter';

interface Rocket {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  fuse: number;
  type: BurstType;
  a: THREE.Color;
  b: THREE.Color;
  big: number;
}

interface Launch {
  at: number;
  type: BurstType;
  /** -1..1 across the sky. */
  x: number;
  /** 0..1 (near → far). */
  depth: number;
  /** 0..1 (low → high). */
  height: number;
  a: string;
  b?: string;
  big?: number;
}

const COLORS = {
  gold: '#ffc95e',
  red: '#ff5446',
  green: '#5fe3a8',
  blue: '#76b4ff',
  violet: '#bf8cff',
  silver: '#e8f0ff',
  rose: '#ff8ec4',
  amber: '#ff9a3c',
};
type ColorName = keyof typeof COLORS;
const PAIRS: [ColorName, ColorName][] = [
  ['red', 'gold'],
  ['blue', 'silver'],
  ['green', 'gold'],
  ['violet', 'rose'],
  ['gold', 'red'],
  ['silver', 'blue'],
  ['rose', 'violet'],
  ['amber', 'green'],
];

export class Fireworks {
  private rockets: Rocket[] = [];
  private flashes: { s: THREE.Sprite; t: number; life: number }[] = [];
  private flashIdx = 0;
  private schedule: Launch[] = [];
  private t = 0;
  private running = false;
  private q: number;
  private trailColor = hot('#ffb45a', 2.2);
  private tmpC = new THREE.Color();
  private tmpV = new THREE.Vector3();
  private camRight = new THREE.Vector3();
  private camUp = new THREE.Vector3();

  constructor(private story: StoryRuntime) {
    const tier = story.ctx.quality.tier;
    this.q = tier === 'high' ? 1 : tier === 'medium' ? 0.72 : 0.45;
    for (let i = 0; i < 6; i++) {
      const s = additiveSprite(glowTexture(), '#ffffff', 1, 0);
      s.visible = false;
      s.renderOrder = 8;
      story.group.add(s);
      this.flashes.push({ s, t: 1, life: 0.5 });
    }
  }

  get active() {
    return this.running || this.rockets.length > 0;
  }

  /** Plays the choreographed show (≈ `duration` seconds of launches). */
  start(duration = 30) {
    this.schedule = this.choreography(duration);
    this.t = 0;
    this.running = true;
  }

  /** No more launches (what is in the air finishes). */
  stop() {
    this.running = false;
    this.schedule = [];
  }

  private choreography(D: number): Launch[] {
    const L: Launch[] = [];
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    let pair = 0;
    const nextPair = () => PAIRS[pair++ % PAIRS.length];
    const k = D / 30;
    // 1 — the overture: single rockets, one shape at a time
    const overture: BurstType[] = ['peony', 'ring', 'peony', 'star', 'willow', 'glitter'];
    overture.forEach((type, i) => {
      const [a, b] = nextPair();
      L.push({ at: (0.2 + i * 1.25) * k, type, x: rnd(-0.6, 0.6), depth: rnd(0.2, 0.8), height: rnd(0.4, 0.8), a: COLORS[a], b: COLORS[b] });
    });
    // 2 — pairs, mirrored left / right
    const duo: BurstType[] = ['peony', 'ring', 'star', 'peony', 'glitter', 'ring'];
    duo.forEach((type, i) => {
      const [a, b] = nextPair();
      const x = rnd(0.35, 0.85);
      const at = (8 + i * 1.45) * k;
      L.push({ at, type, x: -x, depth: rnd(0.2, 0.7), height: rnd(0.3, 0.7), a: COLORS[a], b: COLORS[b] });
      L.push({ at: at + 0.12, type, x, depth: rnd(0.2, 0.7), height: rnd(0.3, 0.7), a: COLORS[a], b: COLORS[b] });
    });
    // 3 — the dance: quicker, mixed
    const mix: BurstType[] = ['star', 'willow', 'peony', 'ring', 'glitter', 'peony', 'star', 'ring', 'willow', 'peony'];
    mix.forEach((type, i) => {
      const [a, b] = nextPair();
      L.push({ at: (17 + i * 0.75) * k, type, x: rnd(-0.9, 0.9), depth: rnd(0, 1), height: rnd(0.3, 1), a: COLORS[a], b: COLORS[b] });
    });
    // 4 — crescendo
    for (let i = 0; i < 14; i++) {
      const [a, b] = nextPair();
      const types: BurstType[] = ['peony', 'glitter', 'ring', 'star'];
      L.push({ at: (24.6 + i * 0.3) * k, type: types[i % types.length], x: rnd(-1, 1), depth: rnd(0, 1), height: rnd(0.2, 1), a: COLORS[a], b: COLORS[b] });
    }
    // 5 — the grand finale: a curtain of golden willows and a big star in the middle
    for (let i = 0; i < 5; i++) L.push({ at: 29 * k + i * 0.08, type: 'willow', x: -0.9 + i * 0.45, depth: 0.5, height: 0.85, a: COLORS.gold, big: 1.15 });
    L.push({ at: 29.5 * k, type: 'star', x: 0, depth: 0.3, height: 1, a: COLORS.gold, b: COLORS.silver, big: 1.5 });
    L.push({ at: 29.7 * k, type: 'glitter', x: -0.5, depth: 0.8, height: 0.6, a: COLORS.silver });
    L.push({ at: 29.8 * k, type: 'glitter', x: 0.5, depth: 0.8, height: 0.6, a: COLORS.silver });
    return L.sort((p, q) => p.at - q.at);
  }

  /** Sky placement: across the camera's view, above and behind the Grand Sapin. */
  private place(l: Launch): { launch: THREE.Vector3; burst: THREE.Vector3 } {
    const aspect = this.story.ctx.camera.aspect || 1.6;
    const spread = THREE.MathUtils.clamp(aspect * 13, 7, 22);
    const bx = l.x * spread;
    const bz = -6 - l.depth * 20;
    const by = 20 + l.height * 11;
    const launch = new THREE.Vector3(bx * 0.75 + (Math.random() - 0.5) * 4, 0.6, -28 - Math.random() * 4);
    return { launch, burst: new THREE.Vector3(bx, by, bz) };
  }

  /** Fire one rocket now. */
  launch(l: Launch) {
    const { launch, burst } = this.place(l);
    const g = 12;
    const h = burst.y - launch.y;
    const vy = Math.sqrt(2 * g * h);
    const fuse = (vy / g) * 0.92;
    const vel = new THREE.Vector3((burst.x - launch.x) / fuse, vy, (burst.z - launch.z) / fuse);
    this.rockets.push({ pos: launch, vel, fuse, type: l.type, a: new THREE.Color(l.a), b: new THREE.Color(l.b ?? l.a), big: l.big ?? 1 });
    try {
      this.story.ctx.audio.sfx('whoosh', { volume: 0.16, pitch: 2.1, position: launch });
    } catch {
      /* ignore */
    }
  }

  update(dt: number) {
    if (this.running) {
      this.t += dt;
      while (this.schedule.length && this.schedule[0].at <= this.t) this.launch(this.schedule.shift()!);
      if (!this.schedule.length) this.running = false;
    }
    const sparks = this.story.sparks;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.vel.y -= 12 * dt;
      r.pos.addScaledVector(r.vel, dt);
      r.fuse -= dt;
      // trail: hot head + falling embers
      for (let k = 0; k < 2; k++) {
        this.tmpC.copy(this.trailColor).multiplyScalar(0.6 + Math.random() * 0.6);
        sparks.emit(r.pos.x, r.pos.y - k * 0.15, r.pos.z, (Math.random() - 0.5) * 0.8, -1 - Math.random(), (Math.random() - 0.5) * 0.8, {
          color: this.tmpC,
          life: 0.45 + Math.random() * 0.35,
          size: 0.36,
          sizeEnd: 0.03,
          drag: 1.2,
          gravity: -2,
          hot: true,
        });
      }
      if (r.fuse <= 0) {
        this.burst(r);
        this.rockets.splice(i, 1);
      }
    }
    for (const f of this.flashes) {
      if (!f.s.visible) continue;
      f.t += dt;
      const x = f.t / f.life;
      (f.s.material as THREE.SpriteMaterial).opacity = Math.max(0, 0.6 * (1 - x) * (1 - x));
      if (x >= 1) f.s.visible = false;
    }
  }

  private flash(at: THREE.Vector3, color: THREE.Color, scale: number) {
    if (this.story.reducedMotion()) return;
    const f = this.flashes[this.flashIdx++ % this.flashes.length];
    f.s.position.copy(at);
    f.s.scale.setScalar(scale);
    (f.s.material as THREE.SpriteMaterial).color.copy(color).lerp(new THREE.Color('#ffffff'), 0.5).multiplyScalar(0.8);
    (f.s.material as THREE.SpriteMaterial).opacity = 0.6;
    f.s.visible = true;
    f.t = 0;
    f.life = 0.55;
  }

  private burst(r: Rocket) {
    const { ctx, sparks } = this.story;
    const q = this.q * r.big;
    const at = r.pos;
    const A = r.a.clone().multiplyScalar(4);
    const B = r.b.clone().multiplyScalar(3.6);
    try {
      ctx.audio.sfx('firework', { position: at.clone(), pitch: 0.85 + Math.random() * 0.3, volume: 0.85 });
    } catch {
      /* ignore */
    }
    this.flash(at, r.a, 22 * Math.sqrt(r.big));
    // camera basis (shapes like stars and rings should face the visitor)
    const cam = ctx.camera;
    this.camRight.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
    this.camUp.setFromMatrixColumn(cam.matrixWorld, 1).normalize();
    const rnd = Math.random;
    const sphere = (n: number, speed: number, color: THREE.Color, o: { life: number; size: number; drag: number; gravity: number; twinkle?: boolean; trail?: number }) => {
      for (let k = 0; k < n; k++) {
        // even distribution on a sphere (golden spiral) + jitter
        const y = 1 - (2 * (k + 0.5)) / n;
        const rr = Math.sqrt(1 - y * y);
        const th = k * 2.39996 + rnd() * 0.3;
        const v = speed * (0.88 + rnd() * 0.2);
        sparks.emit(at.x, at.y, at.z, Math.cos(th) * rr * v, y * v, Math.sin(th) * rr * v, {
          color,
          life: o.life * (0.8 + rnd() * 0.4),
          size: o.size,
          sizeEnd: o.size * 0.25,
          drag: o.drag,
          gravity: o.gravity,
          twinkle: o.twinkle,
          hot: true,
          trail: o.trail,
        });
      }
    };
    switch (r.type) {
      case 'peony':
        sphere(Math.round(100 * q), 13 * Math.sqrt(r.big), A, { life: 2, size: 0.95, drag: 1.25, gravity: -2.4 });
        sphere(Math.round(36 * q), 6, B, { life: 1.6, size: 0.8, drag: 1.4, gravity: -2 });
        break;
      case 'glitter':
        sphere(Math.round(110 * q), 12 * Math.sqrt(r.big), A, { life: 2.4, size: 0.8, drag: 1.2, gravity: -2.8, twinkle: true });
        break;
      case 'willow':
        sphere(Math.round(70 * q), 8.5 * Math.sqrt(r.big), hot(COLORS.gold, 2.6), {
          life: 3.2,
          size: 0.75,
          drag: 1.7,
          gravity: -2.4,
          twinkle: true,
          trail: this.q >= 0.7 ? 0.07 : 0,
        });
        break;
      case 'ring': {
        const n = Math.round(80 * q);
        // a ring roughly facing the camera, slightly tilted
        const tilt = (rnd() - 0.5) * 1.2;
        const u = this.camRight.clone();
        const w = this.camUp.clone().applyAxisAngle(this.camRight, tilt);
        const speed = 12 * Math.sqrt(r.big);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          this.tmpV.copy(u).multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a)).multiplyScalar(speed * (0.97 + rnd() * 0.06));
          sparks.emit(at.x, at.y, at.z, this.tmpV.x, this.tmpV.y, this.tmpV.z, { color: k % 2 ? A : B, life: 2, size: 0.9, sizeEnd: 0.15, drag: 1.25, gravity: -1.6, hot: true });
        }
        sphere(Math.round(18 * q), 3, B, { life: 1.3, size: 0.7, drag: 1.5, gravity: -1.5 });
        break;
      }
      case 'star': {
        // five-pointed star outline, facing the visitor — Maître Aubin would approve
        const per = Math.max(5, Math.round(9 * q));
        const speed = 13 * Math.sqrt(r.big);
        const pts: [number, number][] = [];
        for (let i = 0; i < 10; i++) {
          const rad = i % 2 === 0 ? 1 : 0.42;
          const a = Math.PI / 2 + (i * Math.PI) / 5;
          pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
        }
        for (let i = 0; i < 10; i++) {
          const [x0, y0] = pts[i];
          const [x1, y1] = pts[(i + 1) % 10];
          for (let k = 0; k < per; k++) {
            const f = k / per;
            const x = x0 + (x1 - x0) * f;
            const y = y0 + (y1 - y0) * f;
            this.tmpV.copy(this.camRight).multiplyScalar(x * speed).addScaledVector(this.camUp, y * speed);
            sparks.emit(at.x, at.y, at.z, this.tmpV.x, this.tmpV.y, this.tmpV.z, { color: A, life: 2.2, size: 0.9, sizeEnd: 0.2, drag: 1.5, gravity: -1.1, hot: true, twinkle: i % 2 === 0 });
          }
        }
        sphere(Math.round(24 * q), 2.5, B, { life: 1.6, size: 0.75, drag: 1.4, gravity: -1.2, twinkle: true });
        break;
      }
    }
  }
}
