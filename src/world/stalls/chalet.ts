import * as THREE from 'three';
import type { DecoSlot, ResolvedStall } from '../../config/types';
import { PALETTE } from '../palette';
import { D, EAVE_EDGE, roofUnder } from './dims';
import { G, Kit, col, mixC, tint, toColor, type ColorFn, type V3 } from './kit';

/**
 * The cabin itself: plinth, vertical plank walls, steep gable roof with shingles and a thick soft snow
 * layer, icicles, barge boards with a cut trim, the front opening with its counter, the awning (striped /
 * plain fabric) or the propped-up wooden shutter, back shelves, pendant lamps, glowing windows, side door
 * and the frame of the sign board. All colours come from `stall.chalet`.
 */

export interface Variant {
  doorSide: 1 | -1;
  trim: 'scallop' | 'teeth' | 'beads';
  ornament: 'heart' | 'star' | 'round';
  lower: 'heart' | 'cross';
}

export interface StructureInfo {
  signW: number;
  signH: number;
  signPos: THREE.Vector3;
}

export const SNOW: ColorFn = (_p, n, out) => {
  if (n.y < -0.25) out.copy(col(PALETTE.snowShadow));
  else if (n.y > 0.55) out.copy(col(PALETTE.snow));
  else out.copy(col('#d8e0f2'));
};
export const ICE = '#cfe6f6';
export const IRON = '#2b2a31';
export const GOLD = '#d9a93f';

const SLOPE_L = (D.hw + D.oh) / D.cos;
const BARGE_H = 0.17;

/** Point on a roof slope (s = -1 left, +1 right) at distance t from the apex, offset `off` along the slope normal. */
export function slopePoint(s: number, t: number, off: number): { x: number; y: number } {
  const ux = s * D.cos;
  const uy = -D.sin;
  const nx = s * D.sin;
  const ny = D.cos;
  return { x: ux * t + nx * off, y: D.ridge + uy * t + ny * off };
}

export function signWidth(text: string): number {
  return Math.max(1.15, Math.min(D.signMaxW, 0.55 + 0.072 * text.length));
}

export function buildStructure(k: Kit, stall: ResolvedStall, v: Variant, used: Set<DecoSlot>): StructureInfo {
  const ch = stall.chalet;
  const wood = toColor(ch.wood);
  const woodDark = tint(ch.wood, 0.5);
  const woodLight = mixC(tint(ch.wood, 1.35), '#e8c9a0', 0.15);
  const roofC = toColor(ch.roof);
  const accent = toColor(ch.accent);
  const r = k.rand;

  // ── plinth & floor ──
  k.box(D.pw * 2, D.ph, D.pz1 - D.pz0, woodDark, 0, D.ph / 2, (D.pz0 + D.pz1) / 2, { j: 0.03 });
  k.detailed(() => {
    k.box(D.pw * 2 + 0.02, 0.025, 0.06, tint(ch.wood, 0.75), 0, D.ph - 0.0125, D.pz1 - 0.02);
    k.box(D.hw * 2 - 0.08, 0.02, D.zf - D.zb - 0.08, tint(ch.wood, 0.65), 0, D.ph + 0.01, (D.zf + D.zb) / 2);
  });

  // ── walls: vertical planks ──
  const N = 16;
  const pw = (D.hw * 2) / N;
  const plankPaint = () => {
    const c = wood.clone();
    c.offsetHSL((r() - 0.5) * 0.015, (r() - 0.5) * 0.06, 0);
    return c.multiplyScalar(0.84 + r() * 0.3);
  };
  // planks are built as face quads only (outer + inner faces): a third of the triangles of boxes
  const quad = (p0: V3, p1: V3, p2: V3, p3: V3, paint: THREE.Color | ColorFn) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...p0, ...p1, ...p2, ...p0, ...p2, ...p3], 3));
    g.computeVertexNormals();
    k.add(g, paint);
    g.dispose();
  };
  /** Vertical plank in the XY plane: outer face at z = zo facing `dir` (+1 / -1), top following the roof. */
  const plankXY = (x0: number, x1: number, y0: number, top: ((x: number) => number) | number, zo: number, dir: 1 | -1, paint: THREE.Color, sides = 0) => {
    const t0 = typeof top === 'number' ? top : top(x0) - 0.004;
    const t1 = typeof top === 'number' ? top : top(x1) - 0.004;
    const zi = zo - dir * D.pt;
    const inner = tint(paint, 0.92);
    const xm = (x0 + x1) / 2;
    const tm = (t0 + t1) / 2;
    const bev = bevel(paint, xm, (x1 - x0) / 2, 'x');
    if (dir > 0) {
      quad([x0, y0, zo], [xm, y0, zo], [xm, tm, zo], [x0, t0, zo], bev);
      quad([xm, y0, zo], [x1, y0, zo], [x1, t1, zo], [xm, tm, zo], bev);
      quad([x1, y0, zi], [x0, y0, zi], [x0, t0, zi], [x1, t1, zi], inner);
    } else {
      quad([xm, y0, zo], [x0, y0, zo], [x0, t0, zo], [xm, tm, zo], bev);
      quad([x1, y0, zo], [xm, y0, zo], [xm, tm, zo], [x1, t1, zo], bev);
      quad([x0, y0, zi], [x1, y0, zi], [x1, t1, zi], [x0, t0, zi], inner);
    }
    // side faces (only where the wall edge is visible: the front opening)
    if (sides & 1) quad([x0, y0, zi], [x0, y0, zo], [x0, t0, zo], [x0, t0, zi], inner);
    if (sides & 2) quad([x1, y0, zo], [x1, y0, zi], [x1, t1, zi], [x1, t1, zo], inner);
    if (sides & 4) quad([x0, y0, zi], [x1, y0, zi], [x1, y0, zo], [x0, y0, zo], inner);
  };
  for (let i = 0; i < N; i++) {
    const x0 = -D.hw + i * pw;
    const x1 = x0 + pw;
    const paint = plankPaint();
    const dz = 0;
    const inOpening = x0 >= -D.ow - 1e-6 && x1 <= D.ow + 1e-6;
    // front
    if (inOpening) {
      plankXY(x0, x1, D.ph, D.cy - 0.07, D.zf + dz, 1, paint);
      plankXY(x0, x1, D.oy1, roofUnder, D.zf + dz, 1, paint, 4);
    } else {
      const edge = Math.abs(x1 + D.ow) < 1e-6 ? 2 : Math.abs(x0 - D.ow) < 1e-6 ? 1 : 0;
      plankXY(x0, x1, D.ph, roofUnder, D.zf + dz, 1, paint, edge);
    }
  }
  // back wall: wider planks
  const NB = 12;
  const pb = (D.hw * 2) / NB;
  for (let i = 0; i < NB; i++) {
    const x0 = -D.hw + i * pb;
    plankXY(x0, x0 + pb, D.ph, roofUnder, D.zb, -1, plankPaint());
  }
  const NS = 10;
  const ps = (D.zf - D.zb) / NS;
  for (const s of [-1, 1]) {
    for (let i = 0; i < NS; i++) {
      const z0 = D.zb + i * ps;
      const z1 = z0 + ps;
      const xo = s * D.hw;
      const xi = xo - s * D.pt;
      const paint = plankPaint();
      const inner = tint(paint, 0.92);
      const zm = (z0 + z1) / 2;
      const bev = bevel(paint, zm, ps / 2, 'z');
      if (s > 0) {
        quad([xo, D.ph, z1], [xo, D.ph, zm], [xo, D.eave, zm], [xo, D.eave, z1], bev);
        quad([xo, D.ph, zm], [xo, D.ph, z0], [xo, D.eave, z0], [xo, D.eave, zm], bev);
        quad([xi, D.ph, z0], [xi, D.ph, z1], [xi, D.eave, z1], [xi, D.eave, z0], inner);
      } else {
        quad([xo, D.ph, z0], [xo, D.ph, zm], [xo, D.eave, zm], [xo, D.eave, z0], bev);
        quad([xo, D.ph, zm], [xo, D.ph, z1], [xo, D.eave, z1], [xo, D.eave, zm], bev);
        quad([xi, D.ph, z1], [xi, D.ph, z0], [xi, D.eave, z0], [xi, D.eave, z1], inner);
      }
    }
  }
  // corner posts
  for (const s of [-1, 1]) {
    for (const z of [D.zf - 0.03, D.zb + 0.03]) k.box(0.12, D.eave - D.ph, 0.12, woodDark, s * (D.hw - 0.03), (D.eave + D.ph) / 2, z, { j: 0.04 });
  }

  // ── front opening, counter ──
  for (const s of [-1, 1]) k.box(0.085, D.oy1 - D.cy + 0.02, 0.05, accent, s * (D.ow + 0.042), (D.cy + D.oy1) / 2, D.zf + 0.02);
  k.box(D.ow * 2 + 0.26, 0.13, 0.06, accent, 0, D.oy1 + 0.065, D.zf + 0.025);
  k.rbox(D.chw * 2, 0.07, D.cz1 - D.cz0, 0.02, woodLight, 0, D.cy - 0.035, (D.cz0 + D.cz1) / 2);
  k.box(D.chw * 2 - 0.04, 0.03, 0.025, accent, 0, D.cy - 0.085, D.cz1 - 0.012);
  k.box(D.hw * 2 - 0.26, 0.05, 0.025, accent, 0, 0.26, D.zf + 0.012);
  k.box(D.hw * 2 - 0.26, 0.05, 0.025, accent, 0, D.cy - 0.13, D.zf + 0.012);
  k.detailed(() => {
    for (const s of [-1, 0.33, -0.33, 1]) k.box(0.04, 0.2, 0.04, woodDark, s * 0.95, D.cy - 0.15, D.zf + 0.07, { r: [-0.7, 0, 0] });
    // lower panel motif
    if (v.lower === 'heart') {
      k.add(G.heart(), accent, new THREE.Matrix4().compose(new THREE.Vector3(0, 0.49, D.zf), new THREE.Quaternion(), new THREE.Vector3(0.22, 0.22, 0.025)));
    } else {
      const h = D.cy - 0.13 - 0.26;
      const w = D.hw - 0.13;
      const a = Math.atan2(h, w);
      const len = Math.hypot(h, w);
      for (const sx of [-1, 1]) {
        for (const sa of [-1, 1]) k.box(len, 0.045, 0.02, tint(ch.accent, 0.85), (sx * w) / 2, 0.26 + h / 2, D.zf + 0.008, { r: [0, 0, sa * a] });
      }
    }
    // cloth runner on the counter
    const [c0, c1] = ch.awningColors;
    const cloth = tint(ch.awning === 'none' ? PALETTE.cream : c1, 0.82);
    const band = ch.awning === 'none' ? ch.accent : c0;
    k.box(1.9, 0.006, 0.5, cloth, 0, D.cy + 0.003, 0.89);
    for (const z of [0.68, 1.1]) k.box(1.9, 0.007, 0.035, band, 0, D.cy + 0.0035, z);
    k.box(1.9, 0.07, 0.006, cloth, 0, D.cy - 0.035, D.cz1 + 0.004);
    for (let i = 0; i < 12; i++) k.box(0.045, 0.045, 0.007, band, -0.9 + (i + 0.5) * (1.8 / 12), D.cy - 0.07, D.cz1 + 0.006, { r: [0, 0, Math.PI / 4] });
  });

  // ── interior: shelves, lamps, fairy string ──
  k.detailed(() => {
    for (const y of D.shelfY) {
      k.box(2.64, 0.035, D.shelfD, woodLight, 0, y - 0.0175, D.zb + D.pt + D.shelfD / 2, { j: 0.04 });
      for (const x of [-1.22, 0, 1.22]) k.box(0.03, 0.1, 0.12, woodDark, x, y - 0.085, D.zb + D.pt + 0.06);
    }
  });
  for (const s of [-1, 1]) {
    const x = s * 0.62;
    const z = 0.32;
    const top = roofUnder(x) - 0.02;
    k.detailed(() => {
      k.cyl(0.006, 0.006, top - 1.76, IRON, x, (top + 1.76) / 2, z, { seg: 3 });
      k.cyl(0.035, 0.095, 0.085, accent, x, 1.73, z, { seg: k.seg(8, 6) });
    });
    k.glowSphere(0.032, '#ffd27a', 3, 0, x, 1.675, z);
    k.halo(x, 1.67, z, 0.45, '#ffb35c', 0.45, 0, 0.06);
  }
  for (let i = 0; i < 11; i++) {
    const f = i / 10;
    const x = (f - 0.5) * 2 * (D.ow - 0.06);
    k.glowSphere(0.012, i % 2 ? '#ffd89a' : '#ffc06a', 3.2, 0, x, D.oy1 - 0.035 - Math.sin(f * Math.PI * 3) ** 2 * 0.025, D.zf - 0.06, { seg: 4 });
  }
  k.light(0, 1.62, 0.05, '#ffa954', 4.6, 3.3, 0, true, 0.3);
  k.light(0, 0.95, 2.8, '#ffb868', 0.42, 3.4, 0, false, 0.45);
  k.light(0, 1.72, 1.6, '#ffbd6c', 0.8, 1.95, 0, false, 0.35);
  k.halo(0, 1.32, 0.62, 2.0, '#ffad5a', 0.11, 0, 0);
  k.pool(0, 1.95, 1.8, '#ffb35e', 0.3, 0, 1.05);

  // ── windows & door ──
  const win = (w: number, h: number) => {
    k.glowBox(w, h, 0.01, '#ffc978', 1.35, 0, 0, 0, 0.006);
    for (const sy of [-1, 1]) k.box(w + 0.09, 0.045, 0.04, accent, 0, (sy * (h + 0.045)) / 2, 0.02);
    for (const sx of [-1, 1]) k.box(0.045, h, 0.04, accent, (sx * (w + 0.045)) / 2, 0, 0.02);
    k.box(w + 0.14, 0.035, 0.085, woodLight, 0, -h / 2 - 0.06, 0.042);
    k.detailed(() => {
      k.box(0.022, h, 0.02, woodDark, 0, 0, 0.016);
      k.box(w, 0.022, 0.02, woodDark, 0, 0, 0.016);
      if (ch.snow) k.rbox(w + 0.1, 0.045, 0.075, 0.02, SNOW, 0, -h / 2 - 0.028, 0.045);
    });
  };
  k.with(0, 1.3, D.zb, Math.PI, undefined, () => win(0.48, 0.42));
  const ws = -v.doorSide;
  k.with(ws * D.hw, 1.28, -0.32, (ws * Math.PI) / 2, undefined, () => win(0.4, 0.4));
  const ds = v.doorSide;
  k.with(ds * D.hw, 0, -0.55, (ds * Math.PI) / 2, undefined, () => {
    const dh = 1.5;
    for (let i = 0; i < 4; i++) k.box(0.15, dh, 0.035, accent, -0.225 + i * 0.15, D.ph + dh / 2, 0.018, { j: 0.05 });
    k.box(0.74, 0.07, 0.05, woodDark, 0, D.ph + dh + 0.035, 0.025);
    for (const sx of [-1, 1]) k.box(0.06, dh, 0.05, woodDark, sx * 0.34, D.ph + dh / 2, 0.025);
    k.glowBox(0.17, 0.17, 0.01, '#ffc978', 1.3, 0, 0, D.ph + 1.25, 0.04);
    k.box(0.74, 0.1, 0.32, woodDark, 0, 0.05, 0.16, { j: 0.04 });
    k.detailed(() => {
      k.box(0.5, 0.05, 0.02, tint(ch.accent, 0.75), 0, D.ph + 0.45, 0.04);
      k.box(0.5, 0.05, 0.02, tint(ch.accent, 0.75), 0, D.ph + 1.05, 0.04);
      for (const sy of [-1, 1]) k.box(0.21, 0.025, 0.03, woodDark, 0, D.ph + 1.25 + sy * 0.095, 0.05);
      for (const sx of [-1, 1]) k.box(0.025, 0.17, 0.03, woodDark, sx * 0.095, D.ph + 1.25, 0.05);
      k.sphere(0.024, GOLD, 0.21, 0.92, 0.06, { seg: 5 });
      if (ch.snow) k.rbox(0.66, 0.035, 0.24, 0.015, SNOW, 0, 0.11, 0.18);
    });
  });

  // ── roof ──
  const depth = D.rf - D.rb;
  const zc = (D.rf + D.rb) / 2;
  const roofDark = tint(ch.roof, 0.7);
  const cross = !used.has('roof-ridge');
  for (const s of [-1, 1]) {
    const rz = -s * D.pitch;
    const c = slopePoint(s, SLOPE_L / 2, D.rt / 2);
    k.box(SLOPE_L, D.rt, depth, roofDark, c.x, c.y, zc, { r: [0, 0, rz] });
    // shingle rows (only the visible ones when snowy)
    const rows = Math.ceil(SLOPE_L / 0.19);
    for (let i = 0; i < rows; i++) {
      const t = Math.min(SLOPE_L - 0.1, 0.1 + i * 0.19);
      if (ch.snow && t < SLOPE_L - 0.42) continue;
      const p = slopePoint(s, t, D.rt + D.sh / 2);
      const paint = roofC.clone().multiplyScalar((i % 2 ? 0.88 : 1) * (0.92 + r() * 0.16));
      k.box(0.22, D.sh, depth + 0.02, paint, p.x, p.y, zc, { r: [0, 0, -s * (D.pitch - 0.05)] });
    }
    // barge boards front & back
    const ext = cross ? 0.22 : 0.0;
    const bc = slopePoint(s, (SLOPE_L - ext) / 2, D.rt - BARGE_H / 2 + 0.012);
    for (const z of [D.rf - 0.022, D.rb + 0.022]) k.box(SLOPE_L + ext + 0.02, BARGE_H, 0.045, accent, bc.x, bc.y, z, { r: [0, 0, rz] });
    // cut trim under the front barge board
    const step = v.trim === 'beads' ? 0.15 : 0.125;
    k.layer = 1;
    for (let t = 0.15; t < SLOPE_L - 0.04; t += step) {
      const p = slopePoint(s, t, D.rt - BARGE_H + 0.014);
      k.at(p.x, p.y, D.rf - 0.022, [0, 0, rz]);
      if (v.trim === 'scallop') k.add(G.cyl(1, 1, 4, false, Math.PI / 2, Math.PI), accent, new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), new THREE.Vector3(0.058, 0.04, 0.058)));
      else if (v.trim === 'teeth') k.add(G.cyl(1, 1, 3), accent, new THREE.Matrix4().compose(new THREE.Vector3(0, -0.014, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), new THREE.Vector3(0.055, 0.036, 0.055)));
      else k.blob(0.03, GOLD, 0, -0.024, 0.0);
      k.pop();
    }
    k.layer = 0;
  }
  // ridge cap
  k.box(0.13, 0.13, depth + 0.02, roofDark, 0, D.ridge + D.rt / D.cos - 0.03, zc, { r: [0, 0, Math.PI / 4] });

  // ── snow ──
  if (ch.snow) {
    const Ls = SLOPE_L + 0.03;
    const depthS = depth + 0.08;
    for (const s of [-1, 1]) {
      const rz = -s * D.pitch;
      const c = slopePoint(s, Ls / 2 - 0.0, D.rt + D.sh + D.snowT / 2 - 0.03);
      k.rbox(Ls, D.snowT, depthS, 0.065, SNOW, c.x, c.y, zc + 0.005, { r: [0, 0, rz], seg: k.detail >= 0.75 ? 2 : 1 });
      k.layer = 1;
      // droopy lip on the front edge
      for (const t of [0.7 + r() * 0.2, 1.6 + r() * 0.2]) {
        const p = slopePoint(s, t, D.rt + D.sh + 0.03);
        k.sphere(0.075, SNOW, p.x, p.y - 0.015, D.rf + 0.03, { s: [1.7, 0.55, 0.75], r: [0, 0, -s * D.pitch], seg: 7 });
      }
      // icicles under the side eave
      const n = Math.round(9 * (0.5 + 0.5 * k.detail));
      for (let i = 0; i < n; i++) {
        const z = D.rb + 0.12 + ((i + r() * 0.6) / n) * (depth - 0.24);
        const len = 0.07 + r() * r() * 0.26;
        k.cone(0.02 + r() * 0.012, len, ICE, s * (EAVE_EDGE.x - 0.03), EAVE_EDGE.y - len / 2 + 0.01, z, { r: [Math.PI, 0, 0], seg: 5, j: 0.04 });
      }
      for (let i = 0; i < 2; i++) {
        const t = SLOPE_L - 0.12 - i * 0.22;
        const p = slopePoint(s, t, D.rt - BARGE_H + 0.02);
        const len = 0.08 + r() * 0.12;
        k.cone(0.018, len, ICE, p.x, p.y - len / 2, D.rf - 0.0, { r: [Math.PI, 0, 0], seg: 5 });
      }
      k.layer = 0;
    }
    const top = D.ridge + (D.rt + D.sh + D.snowT) / D.cos - 0.1;
    k.cyl(0.12, 0.12, depthS - 0.05, SNOW, 0, top, zc + 0.005, { r: [Math.PI / 2, 0, 0], s: [1, 1, 0.75], seg: k.seg(10, 6) });
    k.sphere(0.13, SNOW, 0, top + 0.01, D.rf + 0.0, { s: [1.05, 0.8, 0.6], seg: 8 });
    // snow piles around the base
    k.detailed(() => {
      for (const [x, z, sc] of [[-1.5, -1.32, 1], [1.48, -1.36, 0.8]] as const) k.sphere(0.2 * sc, SNOW, x, 0, z, { s: [1.3, 0.75, 1.1], seg: 7 });
    });
  }

  // ── front: awning or propped-up shutter ──
  if (ch.awning === 'none') {
    const ang = 0.2;
    const len = 0.68;
    const w = 2.5;
    const hy = D.oy1 + 0.005;
    const hz = D.zf + 0.07;
    k.with(0, hy, hz, [-ang, 0, 0], undefined, () => {
      const n = 11;
      for (let i = 0; i < n; i++) k.box(w / n, 0.035, len, plankPaint(), -w / 2 + (i + 0.5) * (w / n), 0.0175, len / 2);
      for (const z of [0.05, len - 0.05]) k.box(w, 0.025, 0.07, accent, 0, 0.047, z);
      k.box(Math.hypot(w - 0.2, len - 0.15), 0.022, 0.07, accent, 0, 0.046, len / 2, { r: Math.atan2(len - 0.15, w - 0.2) });
      if (ch.snow) k.rbox(w - 0.06, 0.07, len - 0.05, 0.03, SNOW, 0, 0.08, len / 2);
    });
    for (const s of [-1, 1]) {
      const fy = hy + Math.sin(ang) * (len - 0.06);
      const fz = hz + Math.cos(ang) * (len - 0.06);
      k.rod([s * 1.12, D.cy, D.cz1 - 0.05], [s * 1.12, fy - 0.01, fz], 0.022, woodDark, 6);
    }
  } else {
    const [c0, c1] = ch.awningColors;
    const n = 9;
    const w = (D.awHW * 2) / n;
    const prof = awningProfile();
    for (let i = 0; i < n; i++) {
      const x0 = -D.awHW + i * w;
      const c = ch.awning === 'plain' ? c0 : i % 2 ? c1 : c0;
      k.add(prof, c, new THREE.Matrix4().compose(new THREE.Vector3(x0 + w, 0, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0)), new THREE.Vector3(1, 1, w)));
      const sc = ch.awning === 'plain' ? c0 : c;
      k.add(
        G.cyl(1, 1, k.detail >= 0.75 ? 6 : 4, false, Math.PI / 2, Math.PI),
        sc,
        new THREE.Matrix4().compose(
          new THREE.Vector3(x0 + w / 2, D.awY1 - 0.005, D.awZ - 0.004),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
          new THREE.Vector3(w * 0.5, 0.018, w * 0.5),
        ),
      );
    }
    k.cyl(0.017, 0.017, D.awHW * 2 + 0.02, ch.awning === 'plain' ? c1 : PALETTE.cream, 0, D.awY1 - 0.003, D.awZ, { r: [0, 0, Math.PI / 2], seg: 6 });
    for (const s of [-1, 1]) k.rod([s * (D.awHW - 0.04), D.awY1 - 0.01, D.awZ - 0.03], [s * (D.awHW - 0.04), 1.6, D.zf + 0.02], 0.009, IRON, 4);
  }

  // ── sign frame & gable ornament ──
  const text = ch.sign || stall.name;
  const signW = signWidth(text);
  k.rbox(signW + 0.11, D.signH + 0.11, 0.05, 0.03, accent, 0, D.signY, D.zf + 0.026);
  k.detailed(() => {
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.sphere(0.013, GOLD, sx * (signW / 2 + 0.028), D.signY + sy * (D.signH / 2 + 0.028), D.zf + 0.054, { seg: 4 });
  });
  if (!used.has('sign')) {
    const y = 2.84;
    if (v.ornament === 'round') {
      k.torus(0.13, 0.03, accent, 0, y, D.zf + 0.02, { ts: k.seg(16, 8) });
      k.glowAdd(G.cyl(1, 1, k.seg(14, 8)), '#ffc978', 1.3, 0, new THREE.Matrix4().compose(new THREE.Vector3(0, y, D.zf + 0.004), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), new THREE.Vector3(0.12, 0.008, 0.12)));
      k.box(0.24, 0.02, 0.015, woodDark, 0, y, D.zf + 0.014);
      k.box(0.02, 0.24, 0.015, woodDark, 0, y, D.zf + 0.014);
    } else {
      const shape = v.ornament === 'heart' ? G.heart() : G.star(0.45);
      const sc = v.ornament === 'heart' ? 0.3 : 0.17;
      k.add(shape, accent, new THREE.Matrix4().compose(new THREE.Vector3(0, y, D.zf - 0.004), new THREE.Quaternion(), new THREE.Vector3(sc, sc, 0.03)));
      const face = v.ornament === 'heart' ? G.heart() : G.starFace(0.45);
      k.glowAdd(face, '#ffc978', 1.5, 0, new THREE.Matrix4().compose(new THREE.Vector3(0, y, D.zf + 0.03), new THREE.Quaternion(), new THREE.Vector3(sc * 0.72, sc * 0.72, v.ornament === 'heart' ? 0.004 : 1)));
    }
  }

  return { signW, signH: D.signH, signPos: new THREE.Vector3(0, D.signY, D.zf + 0.053) };
}

/** Plank colour: a touch brighter in the middle, darker at the edges (reads as separate rounded planks). */
function bevel(c: THREE.Color, centre: number, half: number, axis: 'x' | 'z'): ColorFn {
  return (p, _n, out) => {
    const d = Math.min(1, Math.abs((axis === 'x' ? p.x : p.z) - centre) / half);
    out.copy(c).multiplyScalar(1.08 - 0.3 * d * d);
  };
}

/** Fabric awning cross-section (in the YZ plane), extruded 1 m along shape-Z. */
function awningProfile(): THREE.BufferGeometry {
  return tplAwning();
}

let awningTpl: THREE.BufferGeometry | null = null;
function tplAwning(): THREE.BufferGeometry {
  if (awningTpl) return awningTpl;
  const a = new THREE.Vector2(D.zf + 0.03, D.awY0);
  const f = new THREE.Vector2(D.awZ, D.awY1);
  const c = a.clone().lerp(f, 0.5).add(new THREE.Vector2(-0.02, 0.06));
  const pts: THREE.Vector2[] = [];
  const N = 5;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const u = 1 - t;
    pts.push(new THREE.Vector2(u * u * a.x + 2 * u * t * c.x + t * t * f.x, u * u * a.y + 2 * u * t * c.y + t * t * f.y));
  }
  const s = new THREE.Shape();
  s.moveTo(pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) s.lineTo(p.x, p.y);
  for (let i = pts.length - 1; i >= 0; i--) s.lineTo(pts[i].x + 0.004, pts[i].y - 0.022);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 1 });
  const ni = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(ni.attributes)) if (name !== 'position' && name !== 'normal') ni.deleteAttribute(name);
  awningTpl = ni;
  return ni;
}
