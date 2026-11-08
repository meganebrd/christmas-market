import * as THREE from 'three';
import type { DecorationItem, DecorationType, DecoSlot } from '../../config/types';
import { PALETTE } from '../palette';
import { D, EAVE_EDGE, roofTop } from './dims';
import { GOLD, IRON, SNOW } from './chalet';
import { G, Kit, mixC, pickOf, tint, toColor, type UVRect, type V3 } from './kit';

/**
 * Decorations catalogue. Every `DecorationType` is modelled procedurally (small, round, cute) and can be
 * placed in any `DecoSlot`: each type has a "stand" (on the counter, the ground, the roof…), a "wall"
 * (mounted on the sign gable, a corner post, a side wall, the back wall) and/or a "hang" variant
 * (hanging from an iron bracket). Missing variants are adapted automatically (little shelf, stake, easel).
 *
 * `item.color` overrides the main colour: wreath → bow, garland → bows, lantern → metal, mini-tree →
 * baubles, candles → wax, gift-pile → biggest box, snowman → scarf, star-sign → light, pinecones → ribbon,
 * ribbon → ribbon, teddy → fur, nutcracker → jacket, holly → berries, mistletoe → ribbon, reindeer → body,
 * bell → metal, sled → runners, crate-apples → apples, pot-plant → pot, chalkboard → frame, bunting → 1st flag.
 */

export type Surface = 'ground' | 'counter' | 'roof' | 'apex' | 'wall' | 'post' | 'back' | 'side';

export interface DecoEnv {
  k: Kit;
  item: DecorationItem;
  slot: DecoSlot;
  surface: Surface;
  color: string;
  accent: string;
  wood: string;
  awning: 'stripes' | 'plain' | 'none';
  awningColors: [string, string];
  snow: boolean;
  signW: number;
  /** Allocate a light channel, registered as a light handle at this frame point. */
  lightChan(x: number, y: number, z: number, flicker?: number): number;
  /** Reserve a text cell in the chalet atlas. */
  text(text: string, style: 'chalk' | 'plank'): UVRect | null;
}

interface DecoDef {
  prefer: DecoSlot[];
  color: string;
  stand?: (e: DecoEnv) => void;
  wall?: (e: DecoEnv) => void;
  hang?: (e: DecoEnv) => void;
  /** Slot-specific build in chalet space; return true when handled. */
  special?: (e: DecoEnv) => boolean;
  scale?: Partial<Record<Surface, number>>;
}

const BASE_SCALE: Record<Surface, number> = { ground: 1, counter: 0.42, roof: 0.62, apex: 0.8, wall: 1, post: 0.82, back: 0.8, side: 1 };

const FLAME = '#ffcf6a';
const PINES = [PALETTE.pine, PALETTE.pineDark, PALETTE.pineLight, '#24503f'];
const BERRY = '#c8332b';
const BARK = '#5e3d27';

// ───────────────────────────── small shared bits ─────────────────────────────

function pine(k: Kit) {
  return toColor(pickOf(PINES, k.rand())).multiplyScalar(0.85 + k.rand() * 0.35);
}

export function bow(k: Kit, color: string, x: number, y: number, z: number, s = 1, tail = 0.11) {
  k.with(x, y, z, 0, s, () => {
    for (const sx of [-1, 1]) k.sphere(0.05, color, sx * 0.05, 0.012, 0, { s: [1, 0.6, 0.45], r: [0, 0, sx * 0.4], seg: 6 });
    k.sphere(0.022, tint(color, 0.8), 0, 0, 0.014, { seg: 5 });
    for (const sx of [-1, 1]) k.box(0.026, tail, 0.008, color, sx * 0.032, -tail / 2, 0.004, { r: [0, 0, sx * 0.35] });
  });
}

function berries(k: Kit, color: string, x: number, y: number, z: number, n = 3, r = 0.02) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + k.rand();
    k.blob(r, color, x + Math.cos(a) * r * 1.1, y + Math.sin(a) * r * 1.1, z + r * 0.5, { j: 0.06, r: [a, a * 2, 0] });
  }
}

function hollyLeaf(k: Kit, x: number, y: number, z: number, angle: number, len = 0.15, tiltX = 0) {
  k.add(G.holly(), toColor(PALETTE.holly).multiplyScalar(0.8 + k.rand() * 0.4), new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltX, 0, angle)),
    new THREE.Vector3(len * 0.75, len, 0.012),
  ));
}

/** Iron wall bracket, returns the hook point (local). */
function bracket(k: Kit, len = 0.3): V3 {
  k.box(0.06, 0.2, 0.012, IRON, 0, -0.04, 0.006);
  k.box(0.016, 0.016, len, IRON, 0, 0, len / 2);
  k.rod([0, -0.13, 0.01], [0, -0.006, len * 0.62], 0.007, IRON, 4);
  k.torus(0.03, 0.006, IRON, 0, 0.03, len - 0.015, { r: [0, Math.PI / 2, 0], ts: 8, rs: 3, arc: Math.PI * 1.5 });
  return [0, -0.012, len - 0.02];
}

/** Garden hook stake (on the ground / counter), returns the hook point. */
function hookStake(k: Kit, h: number): V3 {
  k.cyl(0.012, 0.014, h, IRON, 0, h / 2, 0, { seg: 5 });
  k.box(0.012, 0.012, 0.16, IRON, 0, h - 0.006, 0.08);
  k.torus(0.03, 0.006, IRON, 0, h - 0.03, 0.17, { r: [0, Math.PI / 2, 0], ts: 8, rs: 3, arc: Math.PI });
  k.cone(0.03, 0.06, IRON, 0, 0.03, 0, { r: [Math.PI, 0, 0], seg: 4 });
  return [0, h - 0.02, 0.15];
}

/** Little wooden easel holding a wall item at height `h`, returns the mount point. */
function standee(k: Kit, wood: string, h: number): V3 {
  const c = tint(wood, 0.8);
  for (const sx of [-1, 1]) k.box(0.025, h + 0.08, 0.025, c, sx * 0.09, (h + 0.08) / 2, 0.01, { r: [0.12, 0, sx * 0.12] });
  k.box(0.025, h + 0.04, 0.025, c, 0, (h + 0.04) / 2, -0.07, { r: [-0.25, 0, 0] });
  k.box(0.22, 0.025, 0.03, c, 0, h * 0.35, 0.03);
  return [0, h, 0.03];
}

/** Small shelf on a wall, returns the top centre. */
function shelfBracket(k: Kit, wood: string): V3 {
  k.box(0.38, 0.025, 0.17, tint(wood, 1.2), 0, 0, 0.085);
  for (const sx of [-1, 1]) k.box(0.02, 0.1, 0.1, tint(wood, 0.7), sx * 0.14, -0.06, 0.05, { r: [-0.6, 0, 0] });
  return [0, 0.0125, 0.09];
}

function catenary(a: V3, b: V3, sag: number, n: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t));
  }
  return out;
}

/** Pine rope along a polyline (chalet/current frame), with optional fairy lights on channel 1. */
function rope(k: Kit, pts: THREE.Vector3[], radius = 0.045, lights = 0) {
  const step = (k.detail >= 0.75 ? 0.75 : 1) * radius * 1.45;
  let acc = 0;
  let li = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = a.distanceTo(b);
    for (let d = acc; d < len; d += step) {
      const p = a.clone().lerp(b, d / len);
      (k.detail >= 0.75 ? k.blob : k.tuft).call(k, radius * (0.9 + k.rand() * 0.35) * (k.detail >= 0.75 ? 1 : 1.2), pine(k), p.x + (k.rand() - 0.5) * radius * 0.5, p.y + (k.rand() - 0.5) * radius * 0.5, p.z + (k.rand() - 0.5) * radius * 0.5, {
        r: [k.rand() * 3, k.rand() * 3, k.rand() * 3],
      });
      if (lights && li++ % lights === 0) k.glowSphere(0.011, li % 2 ? '#ffd27a' : '#ffbe5c', 3.2, 1, p.x, p.y - radius * 0.5, p.z + radius * 0.9, { seg: 4 });
    }
    acc = (acc + Math.ceil((len - acc) / step) * step) - len;
  }
}

/** Swags of pine rope between `a` and `b`, with bows at the attach points. */
function swags(k: Kit, a: V3, b: V3, n: number, sag: number, bowColor: string, bowScale = 1) {
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const pa: V3 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0, a[2] + (b[2] - a[2]) * t0];
    const pb: V3 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1, a[2] + (b[2] - a[2]) * t1];
    rope(k, catenary(pa, pb, sag, 10), 0.042, 4);
    if (i % 2 === 0) k.sphere(0.026, GOLD, (pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2 - sag - 0.04, (pa[2] + pb[2]) / 2 + 0.02, { seg: 7 });
  }
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    bow(k, bowColor, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + 0.01, a[2] + (b[2] - a[2]) * t + 0.04, 0.85 * bowScale);
  }
}

// ───────────────────────────── models ─────────────────────────────

function wreath(e: DecoEnv) {
  const k = e.k;
  const R = 0.19;
  k.torus(R, 0.055, PALETTE.pineDark, 0, 0, 0.055, { ts: k.seg(12, 8), rs: 4 });
  const n = k.seg(14, 9);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = R + (k.rand() - 0.5) * 0.05;
    k.blob(0.05, pine(k), Math.cos(a) * rr, Math.sin(a) * rr, 0.07 + k.rand() * 0.03, { r: [k.rand() * 3, k.rand() * 3, k.rand() * 3] });
  }
  for (const a of [0.55, 2.3, 3.9]) berries(k, BERRY, Math.cos(a) * R, Math.sin(a) * R, 0.11, 3, 0.018);
  for (const a of [1.3, 3.1]) k.cone(0.03, 0.07, '#7a4f2c', Math.cos(a) * R, Math.sin(a) * R, 0.11, { r: [0, 0, a + Math.PI / 2], seg: 6 });
  bow(e.k, e.color, 0, -R - 0.02, 0.12, 1.05, 0.13);
}

function lanternBody(k: Kit, metal: string, chan: number, snow: boolean) {
  // base at y = 0, ring on top at y ≈ 0.36
  k.box(0.17, 0.025, 0.17, metal, 0, 0.0125, 0);
  k.sphere(0.022, metal, 0, -0.012, 0, { seg: 6 });
  k.glowBox(0.128, 0.17, 0.128, '#ffbb5c', 1.75, chan, 0, 0.11, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.016, 0.19, 0.016, metal, sx * 0.07, 0.11, sz * 0.07);
  k.box(0.15, 0.012, 0.15, metal, 0, 0.11, 0);
  k.box(0.175, 0.02, 0.175, metal, 0, 0.205, 0);
  k.cone(0.13, 0.1, metal, 0, 0.265, 0, { r: Math.PI / 4, seg: 4 });
  if (snow) k.cone(0.1, 0.055, SNOW, 0, 0.29, 0, { r: Math.PI / 4, seg: 4 });
  k.torus(0.026, 0.006, metal, 0, 0.345, 0, { ts: 10, rs: 3 });
}

function lanternLight(e: DecoEnv, y: number) {
  const k = e.k;
  const chan = e.lightChan(0, y, 0, 0.07);
  k.light(0, y, 0.06, '#ffb058', 0.95, 1.35, chan, false, 0.3);
  k.halo(0, y, 0, 0.78, '#ffb35c', 0.55, chan, 0.22);
  return chan;
}

function miniTree(e: DecoEnv) {
  const k = e.k;
  const r = k.rand;
  k.box(0.3, 0.2, 0.3, e.wood, 0, 0.1, 0, { j: 0.05 });
  for (const y of [0.04, 0.16]) k.box(0.31, 0.03, 0.31, tint(e.wood, 0.65), 0, y, 0);
  k.box(0.27, 0.02, 0.27, '#3b2a20', 0, 0.2, 0);
  k.cyl(0.035, 0.045, 0.14, BARK, 0, 0.26, 0, { seg: 6 });
  const tiers: [number, number, number][] = [[0.34, 0.38, 0.47], [0.27, 0.33, 0.67], [0.19, 0.28, 0.86], [0.11, 0.2, 1.0]];
  const seg = k.seg(9, 6);
  const baubles = [e.color, GOLD, PALETTE.cream, e.color];
  tiers.forEach(([rad, h, y], i) => {
    k.cone(rad, h, pine(k), 0, y, 0, { seg, r: r() * 3 });
    if (e.snow) k.cone(rad * 0.55, h * 0.42, SNOW, 0, y + h * 0.29, 0, { seg, r: r() * 3 });
    const nb = i < 3 ? 3 : 1;
    for (let b = 0; b < nb; b++) {
      const a = (b / nb) * Math.PI * 2 + i * 1.3 + r() * 0.4;
      const hy = y - h * 0.35;
      const rr = rad * 0.72;
      k.sphere(0.027, baubles[(i + b) % baubles.length], Math.sin(a) * rr, hy, Math.cos(a) * rr, { seg: 7 });
      const a2 = a + Math.PI / nb;
      k.glowSphere(0.011, '#ffd27a', 3, 1, Math.sin(a2) * rr * 0.9, hy + 0.06, Math.cos(a2) * rr * 0.9, { seg: 4 });
    }
  });
  k.add(G.star(0.45), GOLD, new THREE.Matrix4().compose(new THREE.Vector3(0, 1.15, -0.01), new THREE.Quaternion(), new THREE.Vector3(0.075, 0.075, 0.02)));
  k.glowAdd(G.starFace(0.45), '#ffd36b', 2.4, 1, new THREE.Matrix4().compose(new THREE.Vector3(0, 1.15, 0.012), new THREE.Quaternion(), new THREE.Vector3(0.062, 0.062, 1)));
  k.halo(0, 1.15, 0, 0.3, '#ffcc66', 0.5, 1, 0.1);
}

function candles(e: DecoEnv) {
  const k = e.k;
  const big = e.surface === 'ground' || e.surface === 'side';
  if (big) {
    k.cyl(0.19, 0.21, 0.34, BARK, 0, 0.17, 0, { j: 0.05 });
    k.cyl(0.18, 0.18, 0.012, '#c9a57a', 0, 0.346, 0);
    k.at(0, 0.35, 0);
  }
  k.cyl(0.16, 0.16, 0.025, tint(e.wood, 1.25), 0, 0.0125, 0);
  const set: [number, number, number, number][] = [[-0.06, 0.01, 0.042, 0.2], [0.055, 0.03, 0.036, 0.14], [0.0, -0.065, 0.031, 0.1]];
  if (big) set.push([0.09, -0.06, 0.026, 0.07]);
  const chan = e.lightChan(0, 0.22, 0, 0.12);
  for (const [x, z, r, h] of set) {
    k.cyl(r, r, h, e.color, x, 0.025 + h / 2, z, { j: 0.04, seg: k.seg(10, 6) });
    k.sphere(r * 0.98, e.color, x, 0.025 + h, z, { s: [1, 0.35, 1], seg: 8 });
    k.cyl(0.0035, 0.0035, 0.02, '#2a1d17', x, 0.025 + h + 0.012, z, { seg: 3 });
    k.glowSphere(0.013, FLAME, 3.6, chan, x, 0.025 + h + 0.035, z, { s: [1, 2.1, 1], seg: 6 });
    k.halo(x, 0.025 + h + 0.038, z, 0.2, '#ffb84d', 0.75, chan, 0.04);
  }
  hollyLeaf(k, 0.1, 0.03, 0.09, -1.2, 0.08, -1.3);
  hollyLeaf(k, 0.12, 0.03, 0.05, -2.2, 0.07, -1.3);
  berries(k, BERRY, 0.1, 0.035, 0.08, 2, 0.013);
  k.light(0, 0.3, 0.06, '#ffae4c', 0.8, 0.95, chan, false, 0.4);
  if (big) {
    k.pool(0, 0.1, 0.55, '#ffad55', 0.25, chan);
    k.pop();
  }
}

function giftBox(k: Kit, w: number, h: number, d: number, c: string, rib: string, x: number, y: number, z: number, yaw: number) {
  k.with(x, y, z, yaw, undefined, () => {
    k.box(w, h, d, c, 0, h / 2, 0, { j: 0.04 });
    k.box(w + 0.006, h + 0.006, 0.03, rib, 0, h / 2, 0);
    k.box(0.03, h + 0.006, d + 0.006, rib, 0, h / 2, 0);
    for (const sx of [-1, 1]) k.sphere(0.04, rib, sx * 0.035, h + 0.02, 0, { s: [1, 0.6, 0.5], r: [0, 0, sx * 0.5], seg: 7 });
    k.sphere(0.017, rib, 0, h + 0.012, 0, { seg: 5 });
  });
}

function giftPile(e: DecoEnv) {
  const k = e.k;
  const others = ['#2f5d50', '#e2b34a', '#f3ead8', '#3c5a8a', '#6c4a7d', '#c0392b'].filter((c) => c.toLowerCase() !== e.color.toLowerCase());
  const c1 = pickOf(others, k.rand());
  const c2 = pickOf(others.filter((c) => c !== c1), k.rand());
  const c3 = pickOf(others.filter((c) => c !== c1 && c !== c2), k.rand());
  const rib = (c: string) => (c === '#f3ead8' || c === '#e2b34a' ? '#b8413a' : c === '#c0392b' || c === '#b8413a' ? '#e2b34a' : '#f3ead8');
  giftBox(k, 0.32, 0.25, 0.28, e.color, rib(e.color), 0, 0, 0, 0.12);
  giftBox(k, 0.21, 0.17, 0.2, c1, rib(c1), 0.02, 0.25, 0, -0.35);
  giftBox(k, 0.18, 0.16, 0.18, c2, rib(c2), 0.28, 0, 0.08, 0.5);
  giftBox(k, 0.14, 0.12, 0.14, c3, rib(c3), -0.26, 0, 0.12, -0.25);
}

function snowman(e: DecoEnv) {
  const k = e.k;
  const seg = k.seg(11, 7);
  const coal = '#1f1c24';
  k.sphere(0.27, SNOW, 0, 0.25, 0, { s: [1, 0.92, 1], seg });
  k.sphere(0.2, SNOW, 0, 0.6, 0, { seg });
  k.sphere(0.15, SNOW, 0, 0.9, 0, { seg });
  for (const sx of [-1, 1]) k.sphere(0.019, coal, sx * 0.05, 0.94, 0.136, { seg: 5 });
  k.cone(0.024, 0.13, '#e8792b', 0, 0.9, 0.2, { r: [Math.PI / 2, 0, 0], seg: 6 });
  for (let i = 0; i < 5; i++) {
    const a = -0.6 + (i / 4) * 1.2;
    k.sphere(0.011, coal, Math.sin(a) * 0.075, 0.86 - Math.cos(a) * 0.03, 0.13, { seg: 4 });
  }
  for (const y of [0.68, 0.6, 0.52]) k.sphere(0.017, coal, 0, y, Math.sqrt(Math.max(0, 0.2 * 0.2 - (y - 0.6) ** 2)) + 0.004, { seg: 5 });
  // scarf
  k.torus(0.135, 0.04, e.color, 0, 0.78, 0, { r: [Math.PI / 2, 0, 0], ts: k.seg(14, 8) });
  k.box(0.075, 0.2, 0.03, e.color, 0.08, 0.68, 0.15, { r: [0.15, 0, -0.18] });
  for (const y of [0.63, 0.6]) k.box(0.077, 0.012, 0.032, PALETTE.cream, 0.08 + (0.68 - y) * 0.18, y, 0.152, { r: [0.15, 0, -0.18] });
  // hat
  if (k.rand() < 0.5) {
    k.with(0, 1.02, 0, [0, 0, 0.12], undefined, () => {
      k.cyl(0.16, 0.16, 0.02, coal, 0, 0, 0, { seg });
      k.cyl(0.1, 0.1, 0.17, coal, 0, 0.09, 0, { seg });
      k.cyl(0.102, 0.102, 0.03, e.color, 0, 0.03, 0, { seg });
    });
  } else {
    k.sphere(0.14, e.color, 0, 0.98, 0, { s: [1, 0.75, 1], seg });
    k.torus(0.13, 0.025, PALETTE.cream, 0, 0.96, 0, { r: [Math.PI / 2, 0, 0], ts: 12 });
    k.sphere(0.05, PALETTE.cream, 0, 1.09, 0, { seg: 7 });
  }
  for (const sx of [-1, 1]) {
    k.rod([sx * 0.17, 0.66, 0], [sx * 0.4, 0.8, 0.03], 0.012, BARK, 4);
    k.rod([sx * 0.34, 0.765, 0.02], [sx * 0.4, 0.86, 0.02], 0.008, BARK, 3);
  }
}

function starAssembly(e: DecoEnv, withText: boolean) {
  const k = e.k;
  const chan = e.lightChan(0, 0, 0, 0.02);
  k.add(G.star(0.45), tint(GOLD, 0.8), new THREE.Matrix4().compose(new THREE.Vector3(0, 0, -0.03), new THREE.Quaternion(), new THREE.Vector3(0.3, 0.3, 0.045)));
  k.glowAdd(G.starFace(0.45), e.color, 2.3, chan, new THREE.Matrix4().compose(new THREE.Vector3(0, 0, 0.018), new THREE.Quaternion(), new THREE.Vector3(0.25, 0.25, 1)));
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? 0.27 : 0.13;
    k.glowSphere(0.013, '#fff1c4', 3.2, chan, Math.cos(a) * rr, Math.sin(a) * rr, 0.028, { seg: 4 });
  }
  k.light(0, 0, 0.25, '#ffc860', 0.9, 1.6, chan, false, 0.35);
  k.halo(0, 0, 0.05, 1.15, '#ffc65a', 0.42, chan, 0.3);
  if (withText && e.item.text) {
    const cell = e.text(e.item.text, 'plank');
    for (const sx of [-1, 1]) k.rod([sx * 0.2, -0.13, 0.0], [sx * 0.22, -0.3, 0.0], 0.005, '#d8c9a8', 3);
    k.box(0.6, 0.16, 0.025, tint(e.wood, 1.3), 0, -0.37, 0.0, { j: 0.03 });
    if (cell) k.quad(0.58, 0.145, cell, 0, -0.37, 0.0135);
  }
}

function pinecone(k: Kit, x: number, y: number, z: number, rx: number, ry: number, s = 1) {
  k.with(x, y, z, [rx, ry, 0], s, () => {
    const c = toColor('#6f4526').multiplyScalar(0.85 + k.rand() * 0.3);
    k.cone(0.045, 0.06, c, 0, 0.0, 0, { seg: 6 });
    k.cone(0.04, 0.055, tint(c, 1.15), 0, 0.03, 0, { seg: 6, r: 0.5 });
    k.cone(0.03, 0.05, c, 0, 0.06, 0, { seg: 6, r: 1 });
    k.sphere(0.03, tint(c, 0.85), 0, -0.035, 0, { s: [1, 0.6, 1], seg: 6 });
  });
}

function pinecones(e: DecoEnv) {
  const k = e.k;
  const big = e.surface === 'ground' || e.surface === 'side';
  if (big) {
    k.cyl(0.21, 0.16, 0.17, '#a8743f', 0, 0.085, 0, { j: 0.05 });
    k.torus(0.205, 0.022, '#8a5a30', 0, 0.17, 0, { r: [Math.PI / 2, 0, 0], ts: 16 });
    k.torus(0.2, 0.015, '#8a5a30', 0, 0.17, 0, { arc: Math.PI, ts: 12, rs: 4 });
    for (let i = 0; i < 9; i++) pinecone(k, (k.rand() - 0.5) * 0.24, 0.2 + k.rand() * 0.04, (k.rand() - 0.5) * 0.2, 1 + k.rand(), k.rand() * 6, 1.25);
    bow(k, e.color, 0, 0.14, 0.21, 1.1);
  } else {
    k.cyl(0.17, 0.11, 0.07, tint(e.wood, 1.25), 0, 0.035, 0);
    k.torus(0.168, 0.012, tint(e.wood, 1.05), 0, 0.07, 0, { r: [Math.PI / 2, 0, 0], ts: 14 });
    const pos: [number, number][] = [[-0.07, 0.02], [0.06, 0.04], [0.0, -0.06], [0.08, -0.05], [-0.05, -0.04]];
    for (const [x, z] of pos) pinecone(k, x, 0.1, z, 1.2 + k.rand() * 0.6, k.rand() * 6);
    hollyLeaf(k, -0.08, 0.1, 0.09, 0.8, 0.09, -1.0);
    bow(k, e.color, 0, 0.055, 0.165, 0.75);
  }
}

function ribbonBow(e: DecoEnv, s = 2.1) {
  const k = e.k;
  k.with(0, 0, 0.03, 0, s, () => {
    for (const sx of [-1, 1]) {
      k.torus(0.05, 0.016, e.color, sx * 0.055, 0.01, 0, { s: [1.2, 0.75, 0.6], r: [0, 0, sx * 0.3], ts: 12, rs: 5 });
    }
    k.sphere(0.024, tint(e.color, 0.82), 0, 0, 0.01, { seg: 7 });
    for (const sx of [-1, 1]) {
      k.box(0.03, 0.16, 0.008, e.color, sx * 0.04, -0.08, 0.005, { r: [0, 0, sx * 0.3] });
      k.cone(0.02, 0.03, e.color, sx * 0.065, -0.162, 0.005, { r: [0, 0, Math.PI + sx * 0.3], seg: 3 });
    }
  });
}

function teddy(e: DecoEnv) {
  const k = e.k;
  const fur = e.color;
  const light = mixC(tint(fur, 1.4), PALETTE.cream, 0.35);
  const dark = '#2a1d17';
  k.sphere(0.13, fur, 0, 0.14, 0, { s: [1, 1.05, 0.9], seg: 9 });
  k.sphere(0.085, light, 0, 0.13, 0.068, { s: [1, 1.1, 0.6], seg: 6 });
  for (const sx of [-1, 1]) {
    k.sphere(0.06, fur, sx * 0.08, 0.05, 0.08, { s: [0.85, 0.75, 1.3], seg: 8 });
    k.sphere(0.034, light, sx * 0.08, 0.05, 0.156, { s: [1, 1, 0.4], seg: 7 });
    k.sphere(0.046, fur, sx * 0.12, 0.17, 0.05, { s: [0.8, 1.4, 0.8], r: [0.5, 0, sx * 0.55], seg: 8 });
    k.sphere(0.04, fur, sx * 0.075, 0.42, 0, { seg: 7 });
    k.sphere(0.022, light, sx * 0.075, 0.42, 0.026, { s: [1, 1, 0.5], seg: 6 });
    k.sphere(0.013, dark, sx * 0.04, 0.36, 0.092, { seg: 5 });
  }
  k.sphere(0.105, fur, 0, 0.33, 0.01, { seg: 9 });
  k.sphere(0.045, light, 0, 0.31, 0.09, { s: [1.2, 0.85, 0.8], seg: 8 });
  k.sphere(0.018, dark, 0, 0.325, 0.13, { s: [1.3, 1, 1], seg: 5 });
  bow(k, e.accent, 0, 0.245, 0.085, 0.5, 0.06);
}

function nutcracker(e: DecoEnv) {
  const k = e.k;
  const seg = k.seg(8, 6);
  const black = '#1d1b22';
  const skin = '#f1cdb3';
  const white = '#f3f0ea';
  k.cyl(0.16, 0.17, 0.05, PALETTE.green, 0, 0.025, 0, { seg });
  k.torus(0.165, 0.008, GOLD, 0, 0.05, 0, { r: [Math.PI / 2, 0, 0], ts: 16, rs: 3 });
  for (const sx of [-1, 1]) {
    k.cyl(0.045, 0.05, 0.16, black, sx * 0.05, 0.13, 0, { seg });
    k.cyl(0.05, 0.05, 0.14, white, sx * 0.05, 0.28, 0, { seg });
    k.cyl(0.032, 0.035, 0.22, e.color, sx * 0.13, 0.47, 0, { seg, r: [0, 0, sx * 0.08] });
    k.sphere(0.03, white, sx * 0.14, 0.35, 0.01, { seg: 6 });
    k.sphere(0.04, GOLD, sx * 0.11, 0.585, 0, { s: [1.25, 0.5, 1.25], seg: 7 });
  }
  k.cyl(0.1, 0.11, 0.25, e.color, 0, 0.475, 0, { seg });
  k.cyl(0.113, 0.113, 0.035, black, 0, 0.38, 0, { seg });
  k.box(0.04, 0.03, 0.02, GOLD, 0, 0.38, 0.11);
  k.box(0.03, 0.2, 0.012, GOLD, 0, 0.5, 0.1);
  for (const y of [0.45, 0.51, 0.57]) for (const sx of [-1, 1]) k.sphere(0.011, GOLD, sx * 0.04, y, 0.098, { seg: 4 });
  k.cyl(0.075, 0.075, 0.14, skin, 0, 0.67, 0, { seg });
  for (const sx of [-1, 1]) {
    k.sphere(0.012, black, sx * 0.03, 0.695, 0.072, { seg: 4 });
    k.sphere(0.016, '#e89b8b', sx * 0.05, 0.665, 0.066, { s: [1, 0.7, 0.4], seg: 5 });
  }
  k.sphere(0.017, skin, 0, 0.672, 0.08, { seg: 5 });
  k.box(0.11, 0.025, 0.025, white, 0, 0.645, 0.074, { r: [0, 0, 0] });
  k.box(0.1, 0.04, 0.03, white, 0, 0.61, 0.066);
  k.cyl(0.08, 0.076, 0.19, black, 0, 0.835, 0, { seg });
  k.cyl(0.082, 0.082, 0.03, GOLD, 0, 0.755, 0, { seg });
  k.sphere(0.02, GOLD, 0, 0.84, 0.08, { seg: 5 });
  k.sphere(0.04, PALETTE.red, 0, 0.94, 0.03, { s: [0.8, 1.3, 0.8], seg: 7 });
}

function holly(e: DecoEnv) {
  const k = e.k;
  for (const [a, l] of [[-1.05, 0.15], [-0.35, 0.16], [0.35, 0.16], [1.05, 0.15], [Math.PI - 0.5, 0.12], [Math.PI + 0.5, 0.12]] as const) hollyLeaf(k, 0, 0, 0.012, a, l);
  berries(k, e.color, 0, 0, 0.03, 4, 0.022);
}

function mistletoe(e: DecoEnv) {
  const k = e.k;
  k.box(0.02, 0.14, 0.005, e.color, 0, -0.07, 0);
  bow(k, e.color, 0, -0.02, 0.006, 0.6, 0.07);
  const n = k.seg(12, 7);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const tilt = 0.5 + k.rand() * 0.9;
    k.with(0, -0.2, 0, [0, a, 0], undefined, () => {
      k.with(0, 0, 0, [tilt, 0, 0], undefined, () => {
        k.sphere(0.05, toColor('#8fb36a').multiplyScalar(0.8 + k.rand() * 0.4), 0, 0, 0.055, { s: [0.42, 0.18, 1], seg: 5 });
      });
    });
  }
  for (let i = 0; i < 7; i++) k.sphere(0.016, '#f6f3e6', (k.rand() - 0.5) * 0.07, -0.2 + (k.rand() - 0.5) * 0.07, (k.rand() - 0.5) * 0.07 + 0.02, { seg: 5 });
}

function reindeer(e: DecoEnv) {
  const k = e.k;
  const body = e.color;
  const light = mixC(tint(body, 1.4), PALETTE.cream, 0.4);
  const dark = tint(body, 0.55);
  const antler = '#e2c79a';
  k.with(0, 0, 0, -0.7, undefined, () => {
    k.sphere(0.13, body, 0, 0.37, 0, { s: [1.55, 0.95, 0.85] });
    k.sphere(0.1, light, 0, 0.33, 0, { s: [1.3, 0.75, 0.75] });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.cyl(0.022, 0.018, 0.26, body, sx * 0.12, 0.17, sz * 0.055, { seg: 6 });
      k.cyl(0.02, 0.022, 0.04, dark, sx * 0.12, 0.02, sz * 0.055, { seg: 6 });
    }
    k.cyl(0.045, 0.058, 0.21, body, 0.17, 0.5, 0, { r: [0, 0, -0.65], seg: 8 });
    k.sphere(0.075, body, 0.25, 0.61, 0, { s: [1.25, 0.95, 0.9] });
    k.sphere(0.05, light, 0.32, 0.585, 0, { s: [1, 0.85, 0.85], seg: 8 });
    k.glowSphere(0.024, '#ff3b2f', 2.2, 1, 0.37, 0.595, 0, { seg: 6 });
    for (const sz of [-1, 1]) {
      k.sphere(0.012, '#1d1b22', 0.28, 0.64, sz * 0.05, { seg: 4 });
      k.sphere(0.032, body, 0.21, 0.665, sz * 0.068, { s: [0.5, 1, 0.3], r: [sz * 0.6, 0, 0.4], seg: 6 });
      const b: V3 = [0.22, 0.67, sz * 0.035];
      const m: V3 = [0.2, 0.77, sz * 0.07];
      const t: V3 = [0.16, 0.87, sz * 0.1];
      k.rod(b, m, 0.012, antler, 4);
      k.rod(m, t, 0.01, antler, 4);
      k.rod(m, [0.28, 0.82, sz * 0.08], 0.009, antler, 4);
      k.rod([0.18, 0.82, sz * 0.085], [0.11, 0.86, sz * 0.09], 0.008, antler, 4);
    }
    k.sphere(0.036, PALETTE.cream, -0.2, 0.43, 0, { seg: 6 });
    k.torus(0.058, 0.012, e.accent, 0.14, 0.46, 0, { r: [0, Math.PI / 2, 0.6], ts: 12, rs: 4 });
    k.sphere(0.022, GOLD, 0.17, 0.4, 0, { seg: 6 });
  });
}

function bellOne(k: Kit, color: string, x: number, y: number, z: number, rz: number, s = 1) {
  k.with(x, y, z, [0, 0, rz], s, () => {
    k.add(G.bell(k.seg(10, 7)), color, xf3(0, -0.13, 0, [0.075, 0.13, 0.075]));
    k.sphere(0.02, tint(color, 0.6), 0, -0.135, 0, { seg: 6 });
    k.torus(0.016, 0.005, tint(color, 0.8), 0, 0.006, 0, { ts: 8, rs: 3 });
  });
}

function xf3(x: number, y: number, z: number, s: V3) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(...s));
}

function bells(e: DecoEnv) {
  const k = e.k;
  hollyLeaf(k, -0.05, 0.02, 0.0, 0.9, 0.12);
  hollyLeaf(k, 0.05, 0.02, 0.0, -0.9, 0.12);
  bellOne(k, e.color, -0.05, -0.02, 0.05, -0.3);
  bellOne(k, e.color, 0.05, -0.02, 0.05, 0.3);
  bow(k, PALETTE.red, 0, 0.02, 0.09, 1.0);
}

function sled(e: DecoEnv) {
  const k = e.k;
  const L = 0.8;
  const W = 0.36;
  const slat = tint(e.wood, 1.3);
  for (const sz of [-1, 1]) {
    const z = (sz * W) / 2;
    k.box(L, 0.025, 0.024, e.color, -0.02, 0.0125, z);
    k.torus(0.08, 0.013, e.color, L / 2 - 0.02, 0.09, z, { arc: Math.PI * 1.2, r: [0, 0, -Math.PI / 2], ts: 10, rs: 4 });
    for (const x of [-0.28, 0, 0.26]) k.box(0.022, 0.12, 0.022, e.color, x, 0.08, z);
    k.box(L * 0.82, 0.022, 0.03, tint(e.wood, 0.9), -0.04, 0.15, z);
  }
  for (let i = 0; i < 6; i++) k.box(0.1, 0.022, W + 0.06, slat, -0.33 + i * 0.115, 0.16, 0, { j: 0.06 });
  giftBox(k, 0.16, 0.13, 0.15, e.accent, PALETTE.cream, -0.15, 0.17, 0, 0.3);
  k.box(0.2, 0.06, 0.24, PALETTE.cream, 0.13, 0.2, 0, { r: 0.1 });
  k.box(0.202, 0.062, 0.03, e.accent, 0.13, 0.2, 0.05, { r: 0.1 });
  k.box(0.202, 0.062, 0.03, e.accent, 0.13, 0.2, -0.05, { r: 0.1 });
}

function sledLeaning(e: DecoEnv) {
  const k = e.k;
  const L = 0.82;
  const W = 0.36;
  const slat = tint(e.wood, 1.3);
  k.with(0, 0, 0.2, [-0.22, 0, 0], undefined, () => {
    for (const sx of [-1, 1]) {
      const x = (sx * W) / 2;
      k.box(0.024, L, 0.025, e.color, x, L / 2, 0);
      k.torus(0.08, 0.013, e.color, x, L + 0.0, 0.08, { arc: Math.PI * 1.1, r: [0, Math.PI / 2, Math.PI], ts: 10, rs: 4 });
      for (const y of [0.12, 0.4, 0.68]) k.box(0.022, 0.022, 0.11, e.color, x, y, 0.06);
    }
    for (let i = 0; i < 6; i++) k.box(W + 0.06, 0.1, 0.022, slat, 0, 0.1 + i * 0.115, 0.12, { j: 0.06 });
  });
}

function crate(k: Kit, wood: string, w: number, h: number, d: number) {
  const c = tint(wood, 1.15);
  k.box(w, 0.02, d, tint(wood, 0.8), 0, 0.01, 0);
  for (const y of [0.06, 0.17]) {
    k.box(w, 0.08, 0.02, c, 0, y, d / 2 - 0.01, { j: 0.06 });
    k.box(w, 0.08, 0.02, c, 0, y, -d / 2 + 0.01, { j: 0.06 });
    for (const sx of [-1, 1]) k.box(0.02, 0.08, d - 0.04, c, sx * (w / 2 - 0.01), y, 0, { j: 0.06 });
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.032, h, 0.032, tint(wood, 0.75), sx * (w / 2 - 0.016), h / 2, sz * (d / 2 - 0.016));
}

function crateApples(e: DecoEnv) {
  const k = e.k;
  const big = e.surface === 'ground' || e.surface === 'side';
  if (big) {
    crate(k, e.wood, 0.46, 0.24, 0.32);
    k.at(0.02, 0.24, 0.02, 0.12);
  }
  crate(k, e.wood, 0.42, 0.22, 0.3);
  const seg = k.seg(6, 5);
  for (let i = 0; i < 12; i++) {
    const layer = i < 8 ? 0 : 1;
    const x = layer ? -0.09 + (i - 8) * 0.065 : -0.15 + (i % 4) * 0.1;
    const z = layer ? (i % 2 ? 0.03 : -0.03) : i < 4 ? -0.06 : 0.06;
    const y = 0.17 + layer * 0.06 + k.rand() * 0.015;
    const c = k.rand() < 0.2 ? '#a7c24a' : e.color;
    k.sphere(0.05, c, x + (k.rand() - 0.5) * 0.02, y, z + (k.rand() - 0.5) * 0.02, { seg, j: 0.1, s: [1, 0.92, 1] });
    k.cyl(0.004, 0.004, 0.025, '#4b3621', x, y + 0.055, z, { seg: 3 });
    if (i % 3 === 0) k.sphere(0.02, PALETTE.holly, x + 0.018, y + 0.06, z, { s: [1.2, 0.3, 0.6], seg: 5 });
  }
  if (big) k.pop();
}

function potPlant(e: DecoEnv) {
  const k = e.k;
  const seg = k.seg(12, 7);
  k.cyl(0.12, 0.09, 0.17, e.color, 0, 0.085, 0, { seg, j: 0.04 });
  k.cyl(0.13, 0.13, 0.035, tint(e.color, 1.12), 0, 0.165, 0, { seg });
  k.cyl(0.112, 0.112, 0.01, '#3b2a20', 0, 0.18, 0, { seg });
  k.cyl(0.118, 0.108, 0.03, GOLD, 0, 0.1, 0, { seg });
  const leafG = toColor(PALETTE.holly);
  for (let i = 0; i < 6; i++) {
    k.with(0, 0.21, 0, i * 1.047 + 0.3, undefined, () => k.sphere(0.07, leafG.clone().multiplyScalar(0.8 + k.rand() * 0.4), 0, 0, 0.1, { s: [0.45, 0.14, 1], r: [0.25, 0, 0], seg: 5 }));
  }
  const red = '#c4282b';
  for (let i = 0; i < 7; i++) {
    k.with(0, 0.25, 0, i * 0.8976, undefined, () => k.sphere(0.075, red, 0, 0, 0.08, { s: [0.5, 0.12, 1], r: [-0.35, 0, 0], seg: 5, j: 0.06 }));
  }
  for (let i = 0; i < 5; i++) {
    k.with(0, 0.29, 0, i * 1.2566 + 0.4, undefined, () => k.sphere(0.055, tint(red, 1.1), 0, 0, 0.055, { s: [0.5, 0.12, 1], r: [-0.6, 0, 0], seg: 5 }));
  }
  for (let i = 0; i < 5; i++) k.sphere(0.012, '#f2c94c', (k.rand() - 0.5) * 0.04, 0.31, (k.rand() - 0.5) * 0.04, { seg: 4 });
}

function chalkFace(e: DecoEnv, w: number, h: number, y: number, z: number) {
  const k = e.k;
  k.box(w, h, 0.012, '#27322e', 0, y, z);
  const cell = e.text(e.item.text || 'Joyeux Noël !', 'chalk');
  if (cell) {
    const qw = w * 0.96;
    const qh = Math.min(h * 0.96, qw / 2);
    k.quad(qw, qh, cell, 0, y, z + 0.0075);
  }
}

function chalkboardStand(e: DecoEnv) {
  const k = e.k;
  const H = 0.84;
  const W = 0.54;
  const tilt = 0.2;
  const frame = e.color;
  k.with(0, 0, 0.13, [-tilt, 0, 0], undefined, () => {
    for (const sx of [-1, 1]) k.box(0.04, H, 0.035, frame, sx * (W / 2 - 0.02), H / 2, 0, { j: 0.04 });
    k.box(W, 0.045, 0.035, frame, 0, H - 0.0225, 0);
    k.box(W, 0.04, 0.035, frame, 0, H * 0.27, 0);
    chalkFace(e, W - 0.08, H * 0.6, H * 0.6, 0.006);
  });
  k.with(0, 0, -0.13, [tilt, 0, 0], undefined, () => {
    for (const sx of [-1, 1]) k.box(0.04, H, 0.035, frame, sx * (W / 2 - 0.02), H / 2, 0);
    k.box(W, 0.045, 0.035, frame, 0, H - 0.0225, 0);
    k.box(W - 0.08, H * 0.6, 0.012, '#27322e', 0, H * 0.6, -0.006);
  });
  k.cyl(0.012, 0.012, W - 0.02, IRON, 0, H - 0.02, 0, { r: [0, 0, Math.PI / 2], seg: 5 });
}

function chalkboardWall(e: DecoEnv) {
  const k = e.k;
  const W = 0.56;
  const H = 0.4;
  const frame = e.color;
  for (const sx of [-1, 1]) {
    k.box(0.04, H + 0.04, 0.03, frame, sx * (W / 2), 0, 0.02, { j: 0.04 });
    k.rod([sx * 0.2, H / 2, 0.025], [0, H / 2 + 0.16, 0.012], 0.004, '#d8c9a8', 3);
  }
  for (const sy of [-1, 1]) k.box(W + 0.04, 0.04, 0.03, frame, 0, sy * (H / 2), 0.02, { j: 0.04 });
  k.sphere(0.012, GOLD, 0, H / 2 + 0.16, 0.012, { seg: 4 });
  chalkFace(e, W - 0.03, H - 0.03, 0, 0.012);
}

function bunting(e: DecoEnv): boolean {
  const k = e.k;
  const base = [e.color, PALETTE.cream, e.awningColors[0], PALETTE.gold, PALETTE.green, e.awningColors[1]];
  const colors = base.filter((c, i) => base.findIndex((d) => d.toLowerCase() === c.toLowerCase()) === i);
  const lines: [V3, V3, number][] = [];
  const s = e.slot;
  if (s === 'roof-ridge') {
    const top: V3 = [0, roofTop(0, e.snow) - 0.12, D.rf + 0.05];
    const fy = e.awning === 'none' ? 2.15 : D.awY1 + 0.02;
    const fz = e.awning === 'none' ? 1.7 : D.awZ + 0.01;
    const fx = e.awning === 'none' ? 1.22 : D.awHW - 0.05;
    lines.push([top, [-fx, fy, fz], 0.08], [top, [fx, fy, fz], 0.08]);
  } else if (s === 'back-wall') {
    lines.push([[-1.32, 1.82, D.zb + 0.08], [1.32, 1.82, D.zb + 0.08], 0.14]);
  } else if (s === 'sign') {
    lines.push([[-0.72, 2.62, D.zf + 0.06], [0.72, 2.62, D.zf + 0.06], 0.06]);
  } else if (s === 'side-left' || s === 'side-right' || s === 'roof-left' || s === 'roof-right') {
    const sx = s.endsWith('left') ? -1 : 1;
    lines.push([[sx * (EAVE_EDGE.x - 0.06), EAVE_EDGE.y - 0.06, D.rf - 0.1], [sx * (EAVE_EDGE.x - 0.06), EAVE_EDGE.y - 0.06, D.rb + 0.1], 0.1]);
  } else {
    lines.push([[-1.28, D.cy - 0.035, D.cz1 + 0.02], [1.28, D.cy - 0.035, D.cz1 + 0.02], 0.06]);
  }
  let ci = 0;
  for (const [a, b, sag] of lines) {
    const pts = catenary(a, b, sag, 14);
    for (let i = 0; i < pts.length - 1; i++) k.rod([pts[i].x, pts[i].y, pts[i].z], [pts[i + 1].x, pts[i + 1].y, pts[i + 1].z], 0.005, '#e8dcc0', 3);
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) total += pts[i].distanceTo(pts[i + 1]);
    const n = Math.max(2, Math.floor(total / 0.16));
    for (let f = 0; f < n; f++) {
      const t = (f + 0.5) / n;
      const p = new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t);
      const yaw = Math.atan2(b[0] - a[0], b[2] - a[2]) - Math.PI / 2;
      k.with(p.x, p.y, p.z, yaw, undefined, () => {
        k.add(G.cyl(1, 1, 3), colors[ci++ % colors.length], new THREE.Matrix4().compose(
          new THREE.Vector3(0, -0.037, 0),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
          new THREE.Vector3(0.075, 0.006, 0.075),
        ));
      });
    }
  }
  return true;
}

function garlandSpecial(e: DecoEnv): boolean {
  const k = e.k;
  const s = e.slot;
  if (s === 'sign') {
    const w = e.signW / 2 + 0.06;
    swags(k, [-w, D.signY - D.signH / 2 - 0.04, D.zf + 0.07], [w, D.signY - D.signH / 2 - 0.04, D.zf + 0.07], 2, 0.07, e.color, 0.8);
  } else if (s === 'front-left' || s === 'front-right') {
    const sx = s === 'front-left' ? -1 : 1;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const a = t * Math.PI * 5;
      pts.push(new THREE.Vector3(sx * (D.hw - 0.03) + Math.sin(a) * 0.085, 1.95 - t * 1.7, D.zf - 0.03 + Math.cos(a) * 0.085));
    }
    rope(k, pts, 0.04, 4);
    bow(k, e.color, sx * (D.hw - 0.03), 1.86, D.zf + 0.08, 0.9);
  } else if (s === 'back-wall') {
    swags(k, [-1.3, 1.82, D.zb + 0.08], [1.3, 1.82, D.zb + 0.08], 3, 0.13, e.color, 0.8);
  } else if (s === 'side-left' || s === 'side-right') {
    const sx = s === 'side-left' ? -1 : 1;
    swags(k, [sx * (D.hw + 0.06), 1.78, D.zf - 0.1], [sx * (D.hw + 0.06), 1.78, D.zb + 0.1], 3, 0.12, e.color, 0.8);
  } else {
    swags(k, [-D.chw + 0.02, D.cy - 0.03, D.cz1 + 0.035], [D.chw - 0.02, D.cy - 0.03, D.cz1 + 0.035], 3, 0.14, e.color, 0.9);
  }
  return true;
}

// ───────────────────────────── catalogue ─────────────────────────────

export const DECORATIONS: Record<DecorationType, DecoDef> = {
  wreath: { prefer: ['sign', 'front-left', 'front-right', 'side-left', 'side-right', 'back-wall'], color: '#c0392b', wall: wreath, scale: { post: 0.75, back: 0.8, apex: 0.85 } },
  garland: { prefer: ['counter-left', 'sign', 'back-wall', 'front-left', 'front-right'], color: '#b8413a', special: garlandSpecial },
  lantern: {
    prefer: ['front-left', 'front-right', 'counter-left', 'counter-right', 'ground-left', 'ground-right', 'side-left', 'side-right'],
    color: IRON,
    hang: (e) => {
      let chan = 2;
      e.k.with(0, -0.37, 0, 0, undefined, () => {
        chan = lanternLight(e, 0.11);
        lanternBody(e.k, e.color, chan, false);
      });
      if (e.surface === 'post' || e.surface === 'side') e.k.pool(0, 0.1, 0.75, '#ffad55', 0.26, chan);
    },
    stand: (e) => {
      const chan = lanternLight(e, 0.11);
      lanternBody(e.k, e.color, chan, e.snow && (e.surface === 'ground' || e.surface === 'roof' || e.surface === 'apex'));
      if (e.surface === 'ground' || e.surface === 'side') e.k.pool(0, 0.05, 0.6, '#ffad55', 0.28, chan);
    },
    scale: { ground: 1.45, counter: 0.72, roof: 1.1, apex: 1.2, post: 1, side: 1, back: 1, wall: 1 },
  },
  'mini-tree': { prefer: ['ground-left', 'ground-right', 'counter-left', 'counter-right', 'roof-left', 'roof-right'], color: '#c0392b', stand: miniTree, scale: { counter: 0.4 } },
  candles: { prefer: ['counter-left', 'counter-right', 'ground-left', 'ground-right', 'back-wall'], color: '#f3ead8', stand: candles, scale: { counter: 1, ground: 1.2, roof: 1.1, apex: 1.2, side: 1.2 } },
  'gift-pile': { prefer: ['ground-left', 'ground-right', 'counter-left', 'counter-right'], color: '#b8413a', stand: giftPile, scale: { counter: 0.48 } },
  snowman: { prefer: ['ground-right', 'ground-left', 'roof-left', 'roof-right', 'counter-right', 'counter-left'], color: '#b8413a', stand: snowman, scale: { counter: 0.34, roof: 0.55, ground: 0.92 } },
  'star-sign': {
    prefer: ['roof-ridge', 'sign', 'back-wall', 'front-left', 'front-right'],
    color: '#ffd36b',
    stand: (e) => {
      const k = e.k;
      const H = e.surface === 'ground' || e.surface === 'side' ? 1.25 : e.surface === 'apex' ? 0.14 : 0.2;
      k.cyl(0.022, 0.028, H, tint(e.wood, 0.6), 0, H / 2, 0, { seg: 6 });
      k.with(0, H + 0.28, 0, 0, undefined, () => starAssembly(e, true));
    },
    wall: (e) => e.k.with(0, 0, 0.06, 0, undefined, () => starAssembly(e, e.slot !== 'sign')),
    scale: { apex: 0.95, counter: 0.5, post: 0.8 },
  },
  pinecones: { prefer: ['counter-right', 'counter-left', 'ground-left', 'ground-right'], color: '#b8413a', stand: pinecones, scale: { counter: 1, ground: 1.2, roof: 1.2, apex: 1.2, side: 1.2 } },
  ribbon: {
    prefer: ['sign', 'front-left', 'front-right', 'back-wall'],
    color: '#c0392b',
    wall: (e) => ribbonBow(e),
    stand: (e) => {
      if (e.surface === 'apex' || e.surface === 'roof') e.k.with(0, 0.12, 0, 0, undefined, () => ribbonBow(e, 2.6));
      else {
        giftBox(e.k, 0.26, 0.22, 0.24, PALETTE.cream, e.color, 0, 0, 0, 0.1);
        e.k.with(0, 0.27, 0.02, 0, undefined, () => ribbonBow(e, 1.4));
      }
    },
    scale: { counter: 0.6 },
  },
  teddy: { prefer: ['counter-right', 'counter-left', 'ground-left', 'ground-right', 'roof-left'], color: '#a8744a', stand: teddy, scale: { counter: 0.75, ground: 1.3, roof: 1.1, apex: 1.1, side: 1.3 } },
  nutcracker: { prefer: ['ground-left', 'ground-right', 'counter-left', 'counter-right'], color: '#b8413a', stand: nutcracker, scale: { counter: 0.42 } },
  holly: {
    prefer: ['sign', 'front-left', 'front-right', 'counter-left', 'counter-right'],
    color: BERRY,
    wall: (e) => holly(e),
    stand: (e) => {
      const k = e.k;
      if (e.surface === 'ground' || e.surface === 'side') {
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          k.blob(0.16, toColor(PALETTE.holly).multiplyScalar(0.7 + k.rand() * 0.4), Math.cos(a) * 0.13, 0.17 + k.rand() * 0.12, Math.sin(a) * 0.13, { s: [1, 0.85, 1] });
        }
        k.blob(0.18, PALETTE.holly, 0, 0.32, 0);
        for (let i = 0; i < 9; i++) {
          const a = k.rand() * Math.PI * 2;
          const y = 0.15 + k.rand() * 0.3;
          k.sphere(0.024, e.color, Math.cos(a) * 0.24, y, Math.sin(a) * 0.24, { seg: 5 });
        }
      } else {
        k.cyl(0.075, 0.06, 0.1, '#c46a3a', 0, 0.05, 0, { seg: 8 });
        k.with(0, 0.16, 0.0, [-0.6, 0, 0], 1.1, () => holly(e));
      }
    },
    scale: { counter: 1, ground: 1, post: 1.1, wall: 1.3, back: 1 },
  },
  mistletoe: { prefer: ['front-left', 'front-right', 'sign', 'back-wall'], color: '#b8413a', hang: mistletoe, scale: { post: 1, wall: 1.1, back: 1, counter: 0.7 } },
  reindeer: { prefer: ['roof-left', 'roof-right', 'ground-left', 'ground-right'], color: '#9a6a43', stand: reindeer, scale: { roof: 0.75, counter: 0.42 } },
  bell: {
    prefer: ['roof-ridge', 'sign', 'front-left', 'front-right'],
    color: '#e2b34a',
    wall: (e) => e.k.with(0, 0, 0.02, 0, 1.3, () => bells(e)),
    stand: (e) => {
      const k = e.k;
      const H = e.surface === 'ground' || e.surface === 'side' ? 0.9 : 0.3;
      for (const sx of [-1, 1]) k.cyl(0.015, 0.018, H, tint(e.wood, 0.7), sx * 0.13, H / 2, 0, { seg: 5 });
      k.box(0.32, 0.03, 0.03, tint(e.wood, 0.7), 0, H, 0);
      k.with(0, H - 0.02, 0, 0, 1.25, () => bells(e));
    },
    scale: { apex: 1, post: 0.9 },
  },
  sled: {
    prefer: ['side-left', 'side-right', 'ground-left', 'ground-right'],
    color: '#b8413a',
    stand: sled,
    special: (e) => {
      if (e.slot !== 'side-left' && e.slot !== 'side-right') return false;
      const sx = e.slot === 'side-left' ? -1 : 1;
      e.k.with(sx * D.hw, 0, 0.3, (sx * Math.PI) / 2, undefined, () => sledLeaning(e));
      return true;
    },
    scale: { counter: 0.38, roof: 0.7 },
  },
  'crate-apples': { prefer: ['ground-left', 'ground-right', 'counter-left', 'counter-right', 'side-left'], color: '#c0392b', stand: crateApples, scale: { counter: 0.7 } },
  'pot-plant': { prefer: ['ground-left', 'ground-right', 'counter-left', 'counter-right'], color: '#c46a3a', stand: potPlant, scale: { counter: 0.78, ground: 1.45, side: 1.45, roof: 1 } },
  chalkboard: {
    prefer: ['ground-right', 'ground-left', 'side-left', 'side-right', 'counter-right', 'back-wall'],
    color: '#7a4e33',
    stand: chalkboardStand,
    wall: chalkboardWall,
    scale: { counter: 0.45, wall: 0.85, post: 0.62, back: 0.85 },
  },
  bunting: { prefer: ['roof-ridge', 'back-wall', 'sign'], color: '#b8413a', special: bunting },
};

// ───────────────────────────── slots ─────────────────────────────

interface SlotFrame {
  p: V3;
  yaw: number;
  surface: Surface;
  mount: 'stand' | 'wall';
}

export const ALL_SLOTS: DecoSlot[] = [
  'roof-ridge', 'roof-left', 'roof-right', 'sign', 'front-left', 'front-right', 'counter-left', 'counter-right',
  'side-left', 'side-right', 'ground-left', 'ground-right', 'back-wall',
];

function slotFrame(slot: DecoSlot, snow: boolean, wallMount: boolean): SlotFrame {
  switch (slot) {
    case 'roof-ridge':
      return { p: [0, roofTop(0, snow) - 0.05, D.rf - 0.16], yaw: 0, surface: 'apex', mount: 'stand' };
    case 'roof-left':
    case 'roof-right': {
      const sx = slot === 'roof-left' ? -1 : 1;
      return { p: [sx * 0.8, roofTop(0.8, snow) - 0.04, 0.55], yaw: -sx * 0.25, surface: 'roof', mount: 'stand' };
    }
    case 'sign':
      return { p: [0, 2.85, D.zf + 0.004], yaw: 0, surface: 'wall', mount: 'wall' };
    case 'front-left':
    case 'front-right': {
      const sx = slot === 'front-left' ? -1 : 1;
      return { p: [sx * 1.43, 1.46, D.zf + 0.03], yaw: 0, surface: 'post', mount: 'wall' };
    }
    case 'counter-left':
    case 'counter-right': {
      const sx = slot === 'counter-left' ? -1 : 1;
      return { p: [sx * 0.98, D.cy, 0.9], yaw: -sx * 0.3, surface: 'counter', mount: 'stand' };
    }
    case 'side-left':
    case 'side-right': {
      const sx = slot === 'side-left' ? -1 : 1;
      if (wallMount) return { p: [sx * (D.hw + 0.002), 1.25, 0.4], yaw: (sx * Math.PI) / 2, surface: 'side', mount: 'wall' };
      return { p: [sx * (D.hw + 0.36), 0, 0.42], yaw: sx * 0.75, surface: 'side', mount: 'stand' };
    }
    case 'ground-left':
    case 'ground-right': {
      const sx = slot === 'ground-left' ? -1 : 1;
      return { p: [sx * 1.64, 0, 1.7], yaw: -sx * 0.35, surface: 'ground', mount: 'stand' };
    }
    case 'back-wall':
      return { p: [0, 1.7, D.zb + D.pt + 0.002], yaw: 0, surface: 'back', mount: 'wall' };
  }
}

/** Assigns slots: explicit ones first, then the others in array order following each type's preferences. */
export function assignSlots(items: DecorationItem[]): { item: DecorationItem; slot: DecoSlot }[] {
  const used = new Set<DecoSlot>();
  const out: { item: DecorationItem; slot: DecoSlot }[] = [];
  const pending: DecorationItem[] = [];
  for (const it of items) {
    if (!DECORATIONS[it.type]) continue;
    if (it.slot && ALL_SLOTS.includes(it.slot) && !used.has(it.slot)) {
      used.add(it.slot);
      out.push({ item: it, slot: it.slot });
    } else pending.push(it);
  }
  for (const it of pending) {
    const def = DECORATIONS[it.type];
    const slot = def.prefer.find((s) => !used.has(s)) ?? ALL_SLOTS.find((s) => !used.has(s) && canHost(it.type, s));
    if (!slot) continue;
    used.add(slot);
    out.push({ item: it, slot });
  }
  return out;
}

function canHost(type: DecorationType, slot: DecoSlot): boolean {
  // avoid silly automatic placements (explicit slots are always honoured)
  const big = ['snowman', 'nutcracker', 'sled', 'mini-tree', 'gift-pile', 'reindeer'].includes(type);
  if (big && (slot === 'sign' || slot === 'back-wall' || slot === 'front-left' || slot === 'front-right')) return false;
  if (type === 'bunting' || type === 'garland') return true;
  return true;
}

/** Builds one decoration in its slot. */
export function placeDecoration(e: Omit<DecoEnv, 'surface' | 'color' | 'item' | 'slot'>, item: DecorationItem, slot: DecoSlot): void {
  const def = DECORATIONS[item.type];
  if (!def) return;
  const k = e.k;
  const wallAble = !!(def.wall || def.hang);
  const f = slotFrame(slot, e.snow, wallAble);
  const env: DecoEnv = { ...e, surface: f.surface, color: item.color || def.color, slot, item };
  const prevLayer = k.layer;
  if (f.surface === 'counter' || f.surface === 'back' || f.surface === 'ground' || f.surface === 'side') k.layer = 1;
  try {
    placeIn(env, def, f);
  } finally {
    k.layer = prevLayer;
  }
}

function placeIn(env: DecoEnv, def: DecoDef, f: SlotFrame) {
  const k = env.k;
  const e = env;
  if (def.special?.(env)) return;
  const sc = def.scale?.[f.surface] ?? BASE_SCALE[f.surface];
  k.at(f.p[0], f.p[1], f.p[2], f.yaw, sc);
  try {
    if (f.mount === 'wall') {
      if (def.wall) def.wall(env);
      else if (def.hang) {
        const lift = f.surface === 'post' || f.surface === 'side' ? 0.36 : f.surface === 'back' ? 0.15 : 0;
        k.at(0, lift, 0);
        const hook = bracket(k, 0.3);
        k.at(hook[0], hook[1], hook[2]);
        def.hang(env);
        k.pop().pop();
      } else if (def.stand) {
        const top = shelfBracket(k, e.wood);
        const inner = (def.scale?.counter ?? BASE_SCALE.counter) / sc;
        k.at(top[0], top[1], top[2], 0, inner);
        def.stand({ ...env, surface: 'counter' });
        k.pop();
      }
    } else {
      if (def.stand) {
        // a little snow mound under things standing on the roof
        if ((f.surface === 'roof' || f.surface === 'apex') && e.snow) k.sphere(0.22, SNOW, 0, 0.0, 0, { s: [1.3, 0.35, 1.1], seg: 8 });
        def.stand(env);
      } else if (def.hang) {
        const h = f.surface === 'ground' || f.surface === 'side' ? 1.0 : 0.62;
        const hook = hookStake(k, h);
        k.at(hook[0], hook[1], hook[2]);
        def.hang(env);
        k.pop();
      } else if (def.wall) {
        const h = f.surface === 'apex' || f.surface === 'roof' ? 0.26 : f.surface === 'ground' || f.surface === 'side' ? 0.55 : 0.3;
        const m = standee(k, e.wood, h);
        k.at(m[0], m[1], m[2], [-0.12, 0, 0]);
        def.wall(env);
        k.pop();
      }
    }
  } finally {
    k.pop();
  }
}


