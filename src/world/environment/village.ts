import * as THREE from 'three';
import type { Layout } from '../layout';
import { PALETTE } from '../palette';
import { LightBundle } from './fx';
import { addMerged, type EnvKit } from './kit';
import { buildSmoke } from './smoke';
import { buildChurch } from './church';
import { buildHamlet } from './hamlet';
import { WindowField, WinKind } from './windows';
import { DEG, gableGeometry, matrixOf, MeshBuilder, rng, sagPoints, SNOW_HEX } from './util';

/**
 * The village around the market (not walkable): a ring of cosy half-timbered and wooden houses
 * facing the square, snowy roofs with icicles, warm windows (curtains, paper stars), wreaths on
 * the doors, light strings under some eaves, chimneys with smoke, a church in the north-east.
 */

export const SNOW = SNOW_HEX;
const ICE = '#d6ecfb';
const WALLS = ['#efe3c8', '#e6cf9f', '#e9c2ae', '#c9d6e2', '#d5dcc0', '#f1e9dc', '#e4b98f'];
const TIMBER = ['#4a2e1e', '#3d2618', '#5c3a26'];
const WOOD = ['#9b6a40', '#8a5a3b', '#a8794a', '#7a4e32'];
const ROOFS = ['#3f4a5c', '#5a3a2a', '#4a3226', '#6a3b2c', '#394354'];
const SHUTTERS = ['#2f5d50', '#8b2c2a', '#3c5a8a', '#6c4a7d', '#5c3a26', '#2f4f6a'];
const DOORS = ['#5c3a26', '#7a2f2a', '#2f5d50', '#3d2618', '#3c5a8a'];
const WIN_COLORS = ['#ffcf7e', '#ffc068', '#ffd9a0', '#ffb45a'];

type Style = 'timber' | 'chalet' | 'plaster';

export interface HouseSpec {
  x: number;
  z: number;
  yaw: number;
  W: number;
  D: number;
  floors: 1 | 2;
  style: Style;
  gableFront: boolean;
  seed: number;
  back: boolean;
}

export interface VillageCtx {
  kit: EnvKit;
  /** Builder of the current sector (the village is split in 4 for frustum culling). */
  b: MeshBuilder;
  win: WindowField;
  chimneys: THREE.Vector3[];
}

const torus = new THREE.TorusGeometry(1, 0.32, 5, 12);

function pick<T>(r: () => number, arr: readonly T[]): T {
  return arr[Math.floor(r() * arr.length) % arr.length];
}

/** Builds one house into the shared builder; registers its windows as one light. */
export function buildHouse(v: VillageCtx, s: HouseSpec) {
  const { kit, b, win } = v;
  const r = rng(s.seed);
  const W = s.W;
  const D = s.D;
  // sit on the terrain: floor at the highest corner, a stone plinth down to the lowest one
  const c = Math.cos(s.yaw);
  const sn = Math.sin(s.yaw);
  let hMin = Infinity;
  let hMax = -Infinity;
  for (const [lx, lz] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2], [0, 0]]) {
    const h = kit.heightAt(s.x + lx * c + lz * sn, s.z - lx * sn + lz * c);
    hMin = Math.min(hMin, h);
    hMax = Math.max(hMax, h);
  }
  const y0 = hMax + 0.1;
  const bundle = new LightBundle();
  const wall = pick(r, WALLS);
  const timber = pick(r, TIMBER);
  const wood = pick(r, WOOD);
  const roofC = pick(r, ROOFS);
  const shutter = pick(r, SHUTTERS);
  const stone = r() < 0.5 ? '#8f8c96' : '#9a948a';
  const pitch = (s.style === 'chalet' ? 27 + r() * 6 : s.style === 'timber' ? 44 + r() * 8 : 36 + r() * 8) * DEG;
  const ovh = s.style === 'chalet' ? 0.85 : 0.45;
  const g1 = 2.7;
  const g2 = s.floors > 1 ? 2.5 : 0;
  const P = 0.45; // plinth height
  const Hw = P + g1 + g2;
  const lit = r() < 0.92;

  b.push({ x: s.x, y: y0, z: s.z, ry: s.yaw });
  const HM = b.matrix;

  // plinth & walls
  const plinthH = P + (y0 - hMin) + 1.2;
  b.box(W + 0.14, plinthH, D + 0.14, stone, { y: P - plinthH / 2 }, { jitter: 0.04 });
  const groundWall = s.style === 'chalet' ? (r() < 0.5 ? '#efe7da' : stone) : wall;
  b.box(W, g1, D, groundWall, { y: P + g1 / 2 }, { jitter: 0.03 });
  const jetty = s.style === 'timber' ? 0.12 : 0;
  if (g2) b.box(W + jetty * 2, g2, D + jetty * 2, s.style === 'chalet' ? wood : wall, { y: P + g1 + g2 / 2 }, { jitter: 0.03 });
  if (s.style === 'chalet' && g2) {
    // plank lines on the wooden floor
    for (let y = P + g1 + 0.35; y < Hw - 0.1; y += 0.42) b.box(W + 0.02, 0.035, D + 0.02, '#5c3a26', { y });
  }

  // roof (built in a frame where the ridge runs along local z)
  const span = s.gableFront ? W + jetty * 2 : D + jetty * 2;
  const length = s.gableFront ? D + jetty * 2 : W + jetty * 2;
  b.push({ ry: s.gableFront ? 0 : Math.PI / 2 });
  const half = span / 2;
  const R = half * Math.tan(pitch);
  const gableColor = s.style === 'chalet' ? wood : wall;
  b.add(gableGeometry(), gableColor, { y: Hw, s: [span, R, length] });
  const w2 = half + ovh;
  const L = w2 / Math.cos(pitch);
  const ovhL = ovh * 0.8;
  const roofLen = length + ovhL * 2;
  const th = 0.16;
  const snowT = 0.24 + r() * 0.08;
  const eaveY = Hw - ovh * Math.tan(pitch);
  for (const side of [-1, 1]) {
    const cx = (side * w2) / 2;
    const cy = Hw + R - (w2 / 2) * Math.tan(pitch);
    const nx = side * Math.sin(pitch);
    const ny = Math.cos(pitch);
    b.box(L, th, roofLen, roofC, { x: cx + (nx * th) / 2, y: cy + (ny * th) / 2, rz: -side * pitch }, { jitter: 0.05 });
    b.box(L + 0.04, snowT, roofLen + 0.05, SNOW, { x: cx + nx * (th + snowT / 2), y: cy + ny * (th + snowT / 2), rz: -side * pitch });
    // the snow rolls over the eave
    b.cyl(0.16, 0.16, roofLen + 0.05, 7, SNOW, { x: side * w2 + nx * (th + 0.04), y: eaveY + ny * (th + 0.04), rx: Math.PI / 2 });
    // icicles
    const icN = Math.floor(roofLen / 0.32);
    for (let i = 0; i < icN; i++) {
      if (r() < 0.45) continue;
      const len = 0.12 + Math.pow(r(), 2) * 0.55;
      const z = -roofLen / 2 + (i + 0.5) * (roofLen / icN);
      b.cone(0.035 + len * 0.05, len, 4, ICE, { x: side * (w2 - 0.02), y: eaveY - 0.02 - len / 2, z, rx: Math.PI });
    }
  }
  b.cyl(0.2, 0.2, roofLen + 0.05, 7, SNOW, { y: Hw + R + th + snowT * 0.55, rx: Math.PI / 2 });
  // barge boards on the gable ends
  for (const end of [-1, 1]) {
    for (const side of [-1, 1]) {
      b.box(L, 0.2, 0.08, timber, { x: (side * w2) / 2, y: Hw + R - (w2 / 2) * Math.tan(pitch) - 0.04, z: end * (roofLen / 2 - 0.02), rz: -side * pitch });
    }
  }
  if (s.style === 'timber' && s.gableFront) {
    // timber in the front gable
    const z = length / 2 + 0.02;
    b.box(0.14, R * 0.92, 0.05, timber, { y: Hw + R * 0.46, z });
    b.box(span * 0.62, 0.13, 0.05, timber, { y: Hw + R * 0.42, z });
    b.box(span, 0.14, 0.05, timber, { y: Hw + 0.07, z });
  }
  // chimney
  const chx = (r() < 0.5 ? -1 : 1) * half * (0.3 + r() * 0.25);
  const chz = (r() - 0.5) * length * 0.5;
  const yr = Hw + R - Math.abs(chx) * Math.tan(pitch) + th;
  const chH = 1.5 + r() * 0.5;
  b.box(0.62, chH + 0.6, 0.62, r() < 0.5 ? '#8a5a4a' : stone, { x: chx, y: yr - 0.6 + (chH + 0.6) / 2, z: chz }, { jitter: 0.05 });
  b.box(0.78, 0.12, 0.78, '#4a4652', { x: chx, y: yr + chH, z: chz });
  b.box(0.74, 0.14, 0.74, SNOW, { x: chx, y: yr + chH + 0.12, z: chz });
  v.chimneys.push(b.world(chx, yr + chH + 0.3, chz));
  // light string along the front eave or the front gable
  const string = !s.back && r() < 0.45;
  const multi = r() < 0.5;
  if (string) {
    const pts: THREE.Vector3[] = [];
    if (s.gableFront) {
      const zf = roofLen / 2 + 0.03;
      for (const side of [-1, 1]) {
        const a = new THREE.Vector3(side * (w2 - 0.1), eaveY - 0.05, zf);
        const top = new THREE.Vector3(0, Hw + R - 0.05, zf);
        const n = 9;
        for (let i = 0; i < n; i++) pts.push(new THREE.Vector3().lerpVectors(a, top, i / n));
      }
    } else {
      // scallops under the front eave (in the rotated roof frame, the house front is local −x)
      const xEdge = -(w2 - 0.08);
      const segs = Math.max(2, Math.round(roofLen / 1.4));
      for (let i = 0; i < segs; i++) {
        const a = new THREE.Vector3(xEdge, eaveY - 0.04, -roofLen / 2 + 0.2 + (i * (roofLen - 0.4)) / segs);
        const bb = new THREE.Vector3(xEdge, eaveY - 0.04, -roofLen / 2 + 0.2 + ((i + 1) * (roofLen - 0.4)) / segs);
        pts.push(...sagPoints(a, bb, 0.18, 6).slice(0, 6));
      }
    }
    const cols = multi ? ['#ff5a4a', '#ffd25a', '#59d17a', '#5aa8ff', '#ff8ad0'] : ['#ffc56b'];
    pts.forEach((p, i) => {
      const wp = p.clone().applyMatrix4(b.matrix);
      const m = matrixOf({ x: wp.x, y: wp.y, z: wp.z, s: 0.055 });
      bundle.add(kit.bulbs, kit.bulbs.add(m, new THREE.Color(cols[i % cols.length]), multi ? 2.4 : 2.8));
    });
  }
  b.pop();

  // front facade
  const fz = D / 2 + jetty;
  const faceZ = D / 2;
  const frameC = s.style === 'plaster' ? '#f3ead8' : timber;
  const window = (x: number, y: number, w: number, h: number, z: number, yaw: number, shutters: boolean, kind: number) => {
    b.push({ x, y, z, ry: yaw });
    b.box(w + 0.16, h + 0.16, 0.05, frameC, { z: 0.01 });
    b.box(w + 0.26, 0.07, 0.2, frameC, { y: -h / 2 - 0.07, z: 0.09 });
    b.box(w + 0.2, 0.07, 0.17, SNOW, { y: -h / 2 - 0.0, z: 0.09 });
    if (shutters) {
      for (const sd of [-1, 1]) b.box(w * 0.5, h + 0.06, 0.05, shutter, { x: sd * (w * 0.75 + 0.12), z: 0.03 }, { jitter: 0.04 });
    }
    b.pop();
    const wm = HM.clone().multiply(matrixOf({ x, y, z: z + 0.04, ry: yaw, s: [w, h, 1] }));
    const on = lit && r() < 0.86;
    const color = new THREE.Color(pick(r, WIN_COLORS));
    const k = on ? 1.5 + r() * 1.1 : 0;
    bundle.add(win, win.add(wm, kind as WinKind, color, k, r()));
  };
  const kindFor = () => {
    const q = r();
    return q < 0.3 ? WinKind.Cross : q < 0.55 ? WinKind.Six : q < 0.85 ? WinKind.Curtains : WinKind.Star;
  };
  const shut = s.style !== 'chalet' || r() < 0.6;
  // ground floor: windows + door
  const nG = Math.max(2, Math.floor((W - 0.6) / 1.75));
  const doorI = s.back ? -1 : Math.floor(r() * nG);
  for (let i = 0; i < nG; i++) {
    const x = -W / 2 + ((i + 0.5) * W) / nG;
    if (i === doorI) {
      // door with a wreath and a lantern
      const dc = pick(r, DOORS);
      b.box(1.2, 2.15, 0.05, stone, { x, y: P + 1.05, z: faceZ + 0.01 });
      b.box(0.95, 1.95, 0.08, dc, { x, y: P + 0.98, z: faceZ + 0.04 });
      b.box(0.08, 0.08, 0.06, PALETTE.gold, { x: x + 0.32, y: P + 0.95, z: faceZ + 0.1 });
      b.box(1.4, 0.16, 0.7, stone, { x, y: 0.0, z: faceZ + 0.35 });
      b.add(torus, PALETTE.holly, { x, y: P + 1.45, z: faceZ + 0.12, s: 0.2 });
      b.box(0.14, 0.1, 0.05, PALETTE.berry, { x, y: P + 1.27, z: faceZ + 0.17 });
      // lantern next to the door
      const lp = new THREE.Vector3(x + 0.78, P + 2.15, faceZ + 0.2).applyMatrix4(HM);
      b.box(0.06, 0.06, 0.25, '#2a2a33', { x: x + 0.78, y: P + 2.32, z: faceZ + 0.1 });
      b.box(0.24, 0.05, 0.24, '#2a2a33', { x: x + 0.78, y: P + 2.32, z: faceZ + 0.2 });
      if (lit || r() < 0.5) {
        const warm = kit.warm;
        bundle.add(kit.glass, kit.glass.add(matrixOf({ x: lp.x, y: lp.y, z: lp.z, ry: s.yaw, s: [0.17, 0.26, 0.17] }), warm, 3));
        bundle.add(kit.halos, kit.halos.add(lp.x, lp.y, lp.z, 0.9, warm, 0.5));
        const gp = new THREE.Vector3(x + 0.3, 0, faceZ + 1.6).applyMatrix4(HM);
        bundle.add(kit.pools, kit.pools.add(gp.x, kit.heightAt(gp.x, gp.z) + 0.05, gp.z, 3.6, warm, 0.22));
      }
      continue;
    }
    window(x, P + 1.45, 0.82, 1.08, faceZ, 0, shut, kindFor());
  }
  // upper floor
  if (g2) {
    const nU = Math.max(2, Math.floor((W - 0.4) / 1.6));
    for (let i = 0; i < nU; i++) {
      const x = -W / 2 + ((i + 0.5) * W) / nU;
      window(x, P + g1 + 1.2, 0.78, 1.0, fz, 0, shut, kindFor());
    }
    if (s.style === 'timber') {
      // half-timbering on the upper floor
      const z = fz + 0.025;
      const y0f = P + g1;
      b.box(W + jetty * 2, 0.15, 0.06, timber, { y: y0f + 0.07, z });
      b.box(W + jetty * 2, 0.15, 0.06, timber, { y: Hw - 0.07, z });
      const posts = [-W / 2 - jetty + 0.07, W / 2 + jetty - 0.07];
      for (let i = 1; i < nU; i++) posts.push(-W / 2 + (i * W) / nU);
      for (const x of posts) b.box(0.14, g2, 0.06, timber, { x, y: y0f + g2 / 2, z });
      for (const sd of [-1, 1]) {
        const x = sd * (W / 2 + jetty - 0.3);
        b.box(0.12, g2 * 1.05, 0.06, timber, { x, y: y0f + g2 / 2, z: z + 0.005, rz: sd * 0.42 });
      }
      // side walls get posts too
      for (const sd of [-1, 1]) {
        const x = sd * (W / 2 + jetty + 0.025);
        b.box(0.06, 0.15, D + jetty * 2, timber, { x, y: y0f + 0.07 });
        b.box(0.06, 0.15, D + jetty * 2, timber, { x, y: Hw - 0.07 });
        for (let k = 0; k <= 3; k++) b.box(0.06, g2, 0.14, timber, { x, y: y0f + g2 / 2, z: -D / 2 - jetty + 0.07 + (k * (D + jetty * 2 - 0.14)) / 3 });
      }
    }
    if (s.style === 'chalet' && s.gableFront && !s.back) {
      // balcony with balusters and snow on the rail
      const z = fz + 0.55;
      const y = P + g1 + 0.05;
      b.box(W * 0.86, 0.12, 1.1, wood, { y, z: fz + 0.5 });
      for (let x = -W * 0.42; x <= W * 0.42 + 1e-3; x += 0.22) b.box(0.07, 0.85, 0.05, wood, { x, y: y + 0.48, z: z + 0.5 });
      b.box(W * 0.88, 0.08, 0.12, wood, { y: y + 0.92, z: z + 0.5 });
      b.box(W * 0.88, 0.07, 0.14, SNOW, { y: y + 0.99, z: z + 0.5 });
      b.box(W * 0.86, 0.1, 1.1, SNOW, { y: y + 0.11, z: fz + 0.5 });
    }
  }
  // gable window
  if (s.gableFront) {
    const R2 = (W / 2 + jetty) * Math.tan(pitch);
    if (R2 > 1.6) window(0, Hw + R2 * 0.32, 0.6, 0.72, fz, 0, false, r() < 0.5 ? WinKind.Round : WinKind.Cross);
  }
  // side windows (seen from the alley at an angle)
  if (!s.back) {
    for (const sd of [-1, 1]) {
      const xw = sd * (W / 2 + jetty);
      window(xw, P + 1.45, 0.74, 1.0, 0, (sd * Math.PI) / 2, shut, kindFor());
      if (g2 && r() < 0.7) window(xw, P + g1 + 1.2, 0.7, 0.92, D * 0.15, (sd * Math.PI) / 2, shut, kindFor());
    }
  }
  b.pop();

  // footprint for other builders (forest keeps away)
  kit.occupancy.add(s.x, s.z, Math.hypot(W, D) / 2 + 0.8);
  if (bundle.size) {
    kit.light({ position: { x: s.x, y: y0 + 2, z: s.z }, group: 'window', set: (k) => bundle.set(k), delay: r() * 0.6 });
  }
}

export function buildVillage(kit: EnvKit, layout: Layout) {
  const sectors = [0, 1, 2, 3].map((i) => new MeshBuilder(11 + i));
  const sectorOf = (x: number, z: number) => Math.floor(((Math.atan2(x, z) + Math.PI) / (Math.PI * 2)) * 4) % 4;
  const win = new WindowField();
  const v: VillageCtx = { kit, b: sectors[0], win, chimneys: [] };
  const r = rng(2024);
  const detail = kit.detail;

  const place = (row: 'front' | 'back') => {
    const maxA = row === 'front' ? 127 * DEG : 122 * DEG;
    for (const side of [1, -1]) {
      let a = row === 'front' ? 15.5 * DEG : 19 * DEG + r() * 4 * DEG;
      while (a < maxA) {
        const W = 5.6 + r() * 2.6;
        const D = 5.2 + r() * 1.8;
        const rad = row === 'front' ? 54.5 + r() * 2.2 : 64 + r() * 3.5;
        const dA = (W + (row === 'front' ? 2.4 + r() * 2.2 : 4 + r() * 6)) / rad;
        const ang = side * (a + dA / 2);
        a += dA;
        if (a > maxA) break;
        // the church stands in the north-east
        if (row === 'back' && side > 0 && ang > 108 * DEG) continue;
        if (row === 'back' && r() > 0.55 + 0.45 * detail) continue;
        const x = Math.sin(ang) * rad;
        const z = Math.cos(ang) * rad;
        const q = r();
        const style: Style = q < 0.42 ? 'timber' : q < 0.72 ? 'chalet' : 'plaster';
        v.b = sectors[sectorOf(x, z)];
        buildHouse(v, {
          x,
          z,
          yaw: Math.atan2(-x, -z) + (r() - 0.5) * 0.12,
          W,
          D,
          floors: row === 'back' || r() < 0.75 ? 2 : 1,
          style,
          gableFront: style === 'chalet' ? r() < 0.8 : r() < 0.55,
          seed: Math.floor(r() * 1e9),
          back: row === 'back',
        });
      }
    }
  };
  place('front');
  place('back');

  try {
    const cx = Math.sin(124 * DEG) * 70;
    const cz = Math.cos(124 * DEG) * 70;
    v.b = sectors[sectorOf(cx, cz)];
    buildChurch(v, { x: cx, z: cz });
  } catch (err) {
    console.error('[givrelune] church failed', err);
  }

  try {
    v.b = sectors[sectorOf(0, -150)];
    buildHamlet(v);
  } catch (err) {
    console.error('[givrelune] hamlet failed', err);
  }

  sectors.forEach((sb, i) => addMerged(kit, sb.build(), kit.mats.lambert, 'env:village-' + i));
  const wm = win.finalize();
  if (wm) kit.root.add(wm);
  kit.onUpdate.push(() => win.flush());
  buildSmoke(kit, v.chimneys);
  void layout;
}
