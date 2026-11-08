import type { GameContext } from '../core/contracts';

/**
 * A cinematic timeline running on the GAME clock (so it stays in sync with camera shots, which are
 * advanced by the same `dt`, and it pauses when the tab is hidden). Abortable: every pending wait
 * resolves `false` on `abort()`, so scripts read naturally:
 *
 *   if (!(await tl.at(10.4))) return;   // aborted (skipped)
 */
export class Timeline {
  /** Seconds since the timeline started. */
  t = 0;
  aborted = false;
  private waits: { at: number; resolve: (ok: boolean) => void }[] = [];
  private off: () => void;

  constructor(ctx: GameContext) {
    this.off = ctx.addSystem((dt) => this.tick(dt));
  }

  private tick(dt: number) {
    this.t += dt;
    if (!this.waits.length) return;
    const due = this.waits.filter((w) => w.at <= this.t);
    if (!due.length) return;
    this.waits = this.waits.filter((w) => w.at > this.t);
    for (const w of due) w.resolve(true);
  }

  /** Resolves when the timeline reaches `time` (absolute seconds). */
  at(time: number): Promise<boolean> {
    if (this.aborted) return Promise.resolve(false);
    if (time <= this.t) return Promise.resolve(true);
    return new Promise((resolve) => this.waits.push({ at: time, resolve }));
  }

  /** Resolves after `seconds` (relative). */
  sleep(seconds: number): Promise<boolean> {
    return this.at(this.t + seconds);
  }

  /** Runs `fn` at `time` unless aborted before. */
  cue(time: number, fn: () => void) {
    void this.at(time).then((ok) => {
      if (ok && !this.aborted) {
        try {
          fn();
        } catch (err) {
          console.error('[givrelune] story cue failed', err);
        }
      }
    });
  }

  abort() {
    if (this.aborted) return;
    this.aborted = true;
    const w = this.waits;
    this.waits = [];
    for (const x of w) x.resolve(false);
  }

  dispose() {
    this.abort();
    this.off();
  }
}

/** One-shot delayed call on the game clock. Returns a cancel function. */
export function delay(ctx: GameContext, seconds: number, fn: () => void): () => void {
  let t = 0;
  let done = false;
  const off = ctx.addSystem((dt) => {
    if (done) return;
    t += dt;
    if (t >= seconds) {
      done = true;
      off();
      fn();
    }
  });
  return () => {
    done = true;
    off();
  };
}

/** Per-frame tween on the game clock: `fn(e)` with e = eased 0..1. Resolves at the end. */
export function tween(ctx: GameContext, seconds: number, fn: (e: number, t: number) => void, ease: (t: number) => number = smooth): Promise<void> {
  return new Promise((resolve) => {
    let t = 0;
    const off = ctx.addSystem((dt) => {
      t = Math.min(1, t + dt / Math.max(0.001, seconds));
      fn(ease(t), t);
      if (t >= 1) {
        off();
        resolve();
      }
    });
  });
}

export const smooth = (t: number) => t * t * (3 - 2 * t);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Wall-clock sleep (for UI things that are timed in ms). */
export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
