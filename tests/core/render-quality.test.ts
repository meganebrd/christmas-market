import { describe, expect, it } from 'vitest';
import { FrameGovernor } from '../../src/core/FrameGovernor';
import { lowerTier, MIN_PIXEL_RATIO, profileFor, renderPixelRatio } from '../../src/core/quality';

/** Feeds `seconds` of frames of `frameMs` each; returns the levels the governor switched to. */
function run(g: FrameGovernor, clock: { now: number }, frameMs: number, seconds: number, cpuMs = 2) {
  const changes: number[] = [];
  const end = clock.now + seconds * 1000;
  while (clock.now < end) {
    clock.now += frameMs;
    const l = g.frame(frameMs, cpuMs, clock.now);
    if (l !== null) changes.push(l);
  }
  return changes;
}

describe('renderPixelRatio', () => {
  const high = profileFor('high');
  it('keeps the device ratio on a modest screen', () => {
    expect(renderPixelRatio(high, 800, 600, 2)).toBe(2);
    expect(renderPixelRatio(high, 1280, 720, 1)).toBe(1);
  });
  it('caps a big Retina screen to the pixel budget', () => {
    // MacBook Air M1, full-screen browser: 1440×820 CSS px at 2× would be 4.7 Mpx
    const pr = renderPixelRatio(high, 1440, 820, 2);
    expect(pr).toBeGreaterThan(1.4);
    expect(pr).toBeLessThan(1.7);
    expect(1440 * 820 * pr * pr).toBeLessThanOrEqual(high.maxPixels);
  });
  it('caps by tier', () => {
    expect(renderPixelRatio(profileFor('low'), 400, 300, 3)).toBe(1.25);
    expect(renderPixelRatio(profileFor('medium'), 400, 300, 3)).toBe(1.6);
  });
  it('applies the adaptive scale without going below the floor', () => {
    expect(renderPixelRatio(high, 800, 600, 2, 0.5)).toBe(1);
    expect(renderPixelRatio(high, 800, 600, 1, 0.1)).toBe(MIN_PIXEL_RATIO);
  });
  it('never upscales a ratio already under the floor', () => {
    const pr = renderPixelRatio(profileFor('low'), 3840, 2160, 1);
    expect(pr).toBeLessThan(MIN_PIXEL_RATIO);
    expect(renderPixelRatio(profileFor('low'), 3840, 2160, 1, 0.5)).toBe(pr);
  });
});

describe('lowerTier', () => {
  it('steps down and stops at low', () => {
    expect(lowerTier('high')).toBe('medium');
    expect(lowerTier('medium')).toBe('low');
    expect(lowerTier('low')).toBe('low');
  });
});

describe('FrameGovernor', () => {
  it('stays at full quality when frames are smooth', () => {
    const g = new FrameGovernor({ levels: 4 });
    expect(run(g, { now: 0 }, 16.7, 30)).toEqual([]);
    expect(g.level).toBe(0);
  });

  it('steps down when the GPU cannot keep up, one level per window', () => {
    const g = new FrameGovernor({ levels: 4 });
    const clock = { now: 0 };
    expect(run(g, clock, 50, 2.2)).toEqual([1]);
    expect(run(g, clock, 50, 20)).toEqual([2, 3]);
    expect(g.level).toBe(3); // never past the last level
  });

  it('does not step down when the JavaScript itself fills the frame', () => {
    const g = new FrameGovernor({ levels: 4 });
    expect(run(g, { now: 0 }, 40, 10, 36)).toEqual([]);
  });

  it('ignores isolated hitches (shader compile, tab switch)', () => {
    const g = new FrameGovernor({ levels: 4 });
    const clock = { now: 0 };
    run(g, clock, 16.7, 1);
    clock.now += 900;
    expect(g.frame(900, 5, clock.now)).toBeNull();
    expect(run(g, clock, 16.7, 10)).toEqual([]);
  });

  it('climbs back slowly once frames are fast again', () => {
    const g = new FrameGovernor({ levels: 4, upDelayMs: 8000 });
    const clock = { now: 0 };
    run(g, clock, 50, 2.5);
    expect(g.level).toBe(1);
    expect(run(g, clock, 16.7, 5)).toEqual([]);
    expect(run(g, clock, 16.7, 6)).toEqual([0]);
  });

  it('backs off after a climb that proved too ambitious', () => {
    const g = new FrameGovernor({ levels: 4, upDelayMs: 8000 });
    const clock = { now: 0 };
    run(g, clock, 50, 2.5); // → 1
    run(g, clock, 16.7, 12); // → 0 (climb)
    expect(g.level).toBe(0);
    run(g, clock, 50, 2.5); // too slow right after: → 1, and the next climb waits twice as long
    expect(g.level).toBe(1);
    expect(run(g, clock, 16.7, 12)).toEqual([]);
    expect(run(g, clock, 16.7, 6)).toEqual([0]);
  });

  it('atLeast() jumps to a safe level and does not climb back soon', () => {
    const g = new FrameGovernor({ levels: 4 });
    const clock = { now: 0 };
    expect(g.atLeast(2, clock.now)).toBe(2);
    expect(run(g, clock, 16.7, 60)).toEqual([]);
    expect(g.atLeast(1, clock.now)).toBeNull();
    expect(g.atLeast(9, clock.now)).toBe(3);
  });
});
