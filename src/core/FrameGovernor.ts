/**
 * Adaptive render quality. Watches frame times and picks a render level (0 = full quality,
 * higher = lighter: MSAA off, then fewer pixels). It steps down fast when the GPU cannot keep up —
 * a GPU saturated for seconds is what makes browsers drop the WebGL context (black screen) — and
 * climbs back slowly, backing off each time a climb proved too ambitious, so it never oscillates.
 *
 * Pure logic, no DOM: the render pipeline feeds it and applies the level.
 */
export interface GovernorOptions {
  /** Number of levels (0 … levels-1). */
  levels: number;
  /** Average frame time (ms) above which the level steps down. Default ≈ 40 fps. */
  slowMs?: number;
  /** Average frame time (ms) below which climbing back may be tried. Default ≈ 57 fps. */
  fastMs?: number;
  /** Averaging window (ms). */
  windowMs?: number;
  /** Time spent fast before the first climb (ms); doubles after each failed climb. */
  upDelayMs?: number;
  maxUpDelayMs?: number;
  /** Single frames longer than this are hitches (shader compile, tab switch, GC): ignored. */
  hitchMs?: number;
  /** Frames ignored after a change, while the new targets are allocated. */
  settleMs?: number;
}

export class FrameGovernor {
  level = 0;
  private readonly o: Required<GovernorOptions>;
  private acc = 0;
  private cpuAcc = 0;
  private n = 0;
  private windowStart = 0;
  private fastSince = -1;
  private settleUntil = 0;
  private upDelay: number;
  private lastClimb = -Infinity;

  constructor(opts: GovernorOptions) {
    this.o = {
      slowMs: 1000 / 40,
      fastMs: 1000 / 57,
      windowMs: 2000,
      upDelayMs: 8000,
      maxUpDelayMs: 120000,
      hitchMs: 250,
      settleMs: 1000,
      ...opts,
    };
    this.upDelay = this.o.upDelayMs;
  }

  get levels() {
    return this.o.levels;
  }

  /**
   * Feed one frame.
   * @param frameMs time since the previous frame
   * @param cpuMs   time the frame's JavaScript took (if it fills the frame, fewer pixels won't help)
   * @param now     timestamp (ms)
   * @returns the new level when it changes, otherwise null
   */
  frame(frameMs: number, cpuMs: number, now: number): number | null {
    if (now < this.settleUntil || !(frameMs > 0) || frameMs > this.o.hitchMs) return null;
    if (this.n === 0) this.windowStart = now;
    this.acc += frameMs;
    this.cpuAcc += cpuMs;
    this.n++;
    if (now - this.windowStart < this.o.windowMs) return null;

    const avg = this.acc / this.n;
    const cpu = this.cpuAcc / this.n;
    const start = this.windowStart;
    this.acc = this.cpuAcc = this.n = 0;

    const gpuBound = cpu < avg * 0.7;
    if (avg > this.o.slowMs && gpuBound && this.level < this.o.levels - 1) {
      // slow again shortly after climbing: that climb was too much, wait longer next time
      if (now - this.lastClimb < this.upDelay) this.upDelay = Math.min(this.upDelay * 2, this.o.maxUpDelayMs);
      return this.set(this.level + 1, now);
    }
    if (avg < this.o.fastMs && this.level > 0) {
      if (this.fastSince < 0) this.fastSince = start;
      if (now - this.fastSince >= this.upDelay) {
        this.lastClimb = now;
        return this.set(this.level - 1, now);
      }
    } else this.fastSince = -1;
    return null;
  }

  /** Jump to at least `level` (e.g. after the GPU crashed) and stop climbing for a long while. */
  atLeast(level: number, now: number): number | null {
    const l = Math.min(this.o.levels - 1, Math.max(0, level));
    this.upDelay = this.o.maxUpDelayMs;
    if (l <= this.level) return null;
    return this.set(l, now);
  }

  private set(level: number, now: number): number {
    this.level = level;
    this.fastSince = -1;
    this.acc = this.cpuAcc = this.n = 0;
    this.settleUntil = now + this.o.settleMs;
    return level;
  }
}
