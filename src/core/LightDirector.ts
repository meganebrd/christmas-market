import type * as THREE from 'three';

/**
 * Orchestrates the market's illuminations. Every lamp, garland, window or lantern registers here
 * with a `set(k)` callback (k = 0 off → 1 on). The intro plays a "wave": lights switch on one after
 * the other from the Grand Sapin outward, with a tiny flicker — the signature moment of the experience.
 */
export interface LightHandle {
  position: THREE.Vector3 | { x: number; y?: number; z: number };
  /** Called with 0..1 (may be called every frame during transitions). Keep it cheap. */
  set(k: number): void;
  /** 'street' | 'stall' | 'window' | 'garland' | 'tree' | … — used for group control. */
  group?: string;
  /** Lights with the same delay offset switch on together (seconds, added to the wave delay). */
  delay?: number;
}

interface Entry extends LightHandle {
  current: number;
  target: number;
  /** Seconds before it starts moving toward target. */
  wait: number;
  /** Units per second. */
  speed: number;
  flicker: number;
}

export class LightDirector {
  private entries: Entry[] = [];
  private level = 1;
  private active = false;

  register(h: LightHandle): () => void {
    const e: Entry = { ...h, current: this.level, target: this.level, wait: 0, speed: 3, flicker: 0 };
    this.entries.push(e);
    try {
      h.set(this.level);
    } catch (err) {
      console.error(err);
    }
    return () => {
      const i = this.entries.indexOf(e);
      if (i >= 0) this.entries.splice(i, 1);
    };
  }

  /** Instantly set every light (or one group). */
  setAll(level: number, group?: string) {
    if (!group) this.level = level;
    for (const e of this.entries) {
      if (group && e.group !== group) continue;
      e.current = e.target = level;
      e.wait = 0;
      e.set(level);
    }
  }

  /** Smoothly fade every light (or one group) to `level`. */
  fadeAll(level: number, seconds = 1, group?: string) {
    if (!group) this.level = level;
    for (const e of this.entries) {
      if (group && e.group !== group) continue;
      e.target = level;
      e.wait = 0;
      e.speed = 1 / Math.max(0.01, seconds);
    }
    this.active = true;
  }

  /**
   * Lights switch on as a circular wave passes them.
   * @param origin  wave centre (usually the Grand Sapin)
   * @param speed   metres per second
   * @returns seconds until the farthest light is on
   */
  wave(origin: { x: number; z: number }, opts: { speed?: number; startDelay?: number; group?: string } = {}): number {
    const speed = opts.speed ?? 14;
    const start = opts.startDelay ?? 0;
    let maxT = 0;
    this.level = 1;
    for (const e of this.entries) {
      if (opts.group && e.group !== opts.group) continue;
      const d = Math.hypot(e.position.x - origin.x, e.position.z - origin.z);
      e.wait = start + d / speed + (e.delay ?? 0) + Math.random() * 0.25;
      e.target = 1;
      e.speed = 2.5 + Math.random() * 2;
      e.flicker = Math.random() < 0.35 ? 0.35 : 0;
      maxT = Math.max(maxT, e.wait + 1 / e.speed + e.flicker);
    }
    this.active = true;
    return maxT;
  }

  get count() {
    return this.entries.length;
  }

  update(dt: number) {
    if (!this.active) return;
    let moving = false;
    for (const e of this.entries) {
      if (e.current === e.target) continue;
      moving = true;
      if (e.wait > 0) {
        e.wait -= dt;
        continue;
      }
      if (e.flicker > 0) {
        // old neon flicker: blink a few times before settling
        e.flicker -= dt;
        e.set(Math.random() < 0.5 ? 0.15 : 0.9);
        continue;
      }
      const dir = Math.sign(e.target - e.current);
      e.current += dir * e.speed * dt;
      if ((dir > 0 && e.current >= e.target) || (dir < 0 && e.current <= e.target)) e.current = e.target;
      e.set(e.current);
    }
    if (!moving) this.active = false;
  }
}
