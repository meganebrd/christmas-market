import * as THREE from 'three';
import { PALETTE } from '../palette';
import { LightBundle } from './fx';
import type { VillageCtx } from './village';
import { WinKind } from './windows';
import { gableGeometry, matrixOf, SNOW_HEX as SNOW } from './util';

/**
 * The village church, a landmark in the north-east background: white nave with stained glass,
 * a square bell tower with glowing clock faces and an Alpine onion dome topped by a golden cross.
 */
export function buildChurch(v: VillageCtx, at: { x: number; z: number }) {
  const { kit, b, win } = v;
  const yaw = Math.atan2(-at.x, -at.z);
  let hMax = -Infinity;
  for (let dx = -6; dx <= 6; dx += 3) for (let dz = -10; dz <= 6; dz += 4) hMax = Math.max(hMax, kit.heightAt(at.x + dx, at.z + dz));
  const y0 = hMax + 0.1;
  const bundle = new LightBundle();
  const wall = '#efe7da';
  const stone = '#9a948a';
  const slate = '#3b4558';
  const dome = '#3f6a60';
  const NW = 8.4;
  const NL = 15;
  const NH = 7.2;
  const pitch = 0.82;
  const T = 4.6;
  const TH = 17.5;
  const warm = new THREE.Color('#ffcf8a');

  b.push({ x: at.x, y: y0, z: at.z, ry: yaw });
  const HM = b.matrix;
  // nave (front = +z, toward the market); the tower stands in front of it
  const nz = -NL / 2 - T / 2 + 0.6;
  b.box(NW + 0.2, 2.2, NL + 0.2, stone, { y: -0.9, z: nz });
  b.box(NW, NH, NL, wall, { y: NH / 2, z: nz });
  const R = (NW / 2) * Math.tan(pitch);
  b.add(gableGeometry(), wall, { y: NH, z: nz, s: [NW, R, NL] });
  const w2 = NW / 2 + 0.5;
  const L = w2 / Math.cos(pitch);
  for (const side of [-1, 1]) {
    const cx = (side * w2) / 2;
    const cy = NH + R - (w2 / 2) * Math.tan(pitch);
    const nx = side * Math.sin(pitch);
    const ny = Math.cos(pitch);
    b.box(L, 0.2, NL + 0.8, slate, { x: cx + nx * 0.1, y: cy + ny * 0.1, z: nz, rz: -side * pitch });
    b.box(L + 0.05, 0.3, NL + 0.85, SNOW, { x: cx + nx * 0.35, y: cy + ny * 0.35, z: nz, rz: -side * pitch });
    // stained glass windows along the nave
    for (let i = 0; i < 4; i++) {
      const z = nz - NL / 2 + 2.2 + i * ((NL - 3.6) / 3);
      const m = HM.clone().multiply(matrixOf({ x: side * (NW / 2 + 0.03), y: 3.6, z, ry: (side * Math.PI) / 2, s: [1.1, 3.0, 1] }));
      bundle.add(win, win.add(m, WinKind.Stained, warm, 1.7, i * 0.37 + side));
      b.box(0.08, 3.3, 1.35, stone, { x: side * (NW / 2 + 0.01), y: 3.6, z });
    }
    // buttress-like corner stones
    b.box(0.5, NH, 0.5, stone, { x: side * (NW / 2), y: NH / 2, z: nz - NL / 2 + 0.25 });
  }
  b.cyl(0.24, 0.24, NL + 0.85, 7, SNOW, { y: NH + R + 0.4, z: nz, rx: Math.PI / 2 });
  // apse at the back
  b.cyl(NW / 2 - 0.4, NW / 2 - 0.4, NH * 0.85, 14, wall, { y: (NH * 0.85) / 2, z: nz - NL / 2 });
  b.cone(NW / 2, 2.6, 14, slate, { y: NH * 0.85 + 1.3, z: nz - NL / 2 });
  b.cone(NW / 2 - 0.15, 2.3, 14, SNOW, { y: NH * 0.85 + 1.5, z: nz - NL / 2 });

  // tower
  b.box(T + 0.3, 2.4, T + 0.3, stone, { y: -0.8 });
  b.box(T, TH, T, wall, { y: TH / 2 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(0.42, TH, 0.42, stone, { x: (sx * T) / 2, y: TH / 2, z: (sz * T) / 2 });
  b.box(T + 0.3, 0.3, T + 0.3, stone, { y: TH - 4.6 });
  b.box(T + 0.4, 0.35, T + 0.4, stone, { y: TH });
  b.box(T + 0.3, 0.12, T + 0.3, SNOW, { y: TH + 0.22 });
  // portal
  b.box(1.9, 3.2, 0.2, stone, { y: 1.6, z: T / 2 + 0.05 });
  b.box(1.4, 2.7, 0.12, '#5c3a26', { y: 1.35, z: T / 2 + 0.12 });
  b.box(2.6, 0.2, 1.8, stone, { y: 0.0, z: T / 2 + 0.9 });
  // clock faces on four sides, belfry openings above
  const clockY = TH - 6.2;
  const faces: [number, number, number][] = [
    [0, T / 2 + 0.02, 0],
    [T / 2 + 0.02, 0, Math.PI / 2],
    [0, -T / 2 - 0.02, Math.PI],
    [-T / 2 - 0.02, 0, -Math.PI / 2],
  ];
  for (const [x, z, ry] of faces) {
    bundle.add(win, win.add(HM.clone().multiply(matrixOf({ x, y: clockY, z, ry, s: [2.0, 2.0, 1] })), WinKind.Clock, new THREE.Color('#ffe8c0'), 1.25, 0.5));
    b.push({ x, y: clockY, z, ry });
    b.cyl(1.2, 1.2, 0.1, 18, stone, { z: -0.02, rx: Math.PI / 2 });
    // hands at twenty to six
    b.box(0.07, 0.5, 0.03, '#1d1a1a', { x: 0.13, y: -0.22, z: 0.06, rz: 0.52 });
    b.box(0.06, 0.78, 0.03, '#1d1a1a', { x: -0.32, y: 0.22, z: 0.07, rz: 0.96 });
    b.pop();
    // belfry: two arched openings softly lit from inside
    for (const off of [-0.75, 0.75]) {
      const m = HM.clone().multiply(matrixOf({ x: x + (Math.abs(z) > 0.1 ? off : 0), y: TH - 2.3, z: z + (Math.abs(x) > 0.1 ? off : 0), ry, s: [0.7, 1.7, 1] }));
      bundle.add(win, win.add(m, WinKind.Stained, new THREE.Color('#ffb860'), 0.65, 0.1));
    }
  }
  // onion dome
  const profile = [
    [2.3, 0],
    [2.45, 0.5],
    [2.75, 1.4],
    [2.65, 2.3],
    [2.0, 3.2],
    [1.05, 3.95],
    [0.45, 4.5],
    [0.32, 5.0],
    [0.32, 5.4],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const onion = new THREE.LatheGeometry(profile, 16);
  b.add(onion, dome, { y: TH + 0.3 }, { snow: 0.62 });
  // lantern + small onion + cross
  b.cyl(0.55, 0.55, 1.4, 10, wall, { y: TH + 0.3 + 5.4 + 0.7 });
  bundle.add(win, win.add(HM.clone().multiply(matrixOf({ x: 0, y: TH + 6.4, z: 0.56, s: [0.42, 0.9, 1] })), WinKind.Stained, new THREE.Color('#ffc070'), 1.2, 0.8));
  const small = new THREE.LatheGeometry(
    [
      [0.75, 0],
      [0.9, 0.4],
      [0.6, 0.95],
      [0.18, 1.35],
      [0.08, 1.8],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
    12,
  );
  b.add(small, dome, { y: TH + 0.3 + 6.8 }, { snow: 0.6 });
  b.sphere(0.16, 8, 6, PALETTE.gold, { y: TH + 9.0 });
  b.box(0.08, 1.2, 0.08, PALETTE.gold, { y: TH + 9.7 });
  b.box(0.6, 0.08, 0.08, PALETTE.gold, { y: TH + 9.95 });
  b.pop();

  // a lantern by the portal and its light on the snow
  const lp = new THREE.Vector3(1.4, 2.6, T / 2 + 0.35).applyMatrix4(HM);
  bundle.add(kit.glass, kit.glass.add(matrixOf({ x: lp.x, y: lp.y, z: lp.z, ry: yaw, s: [0.2, 0.3, 0.2] }), kit.warm, 3));
  bundle.add(kit.halos, kit.halos.add(lp.x, lp.y, lp.z, 1.1, kit.warm, 0.5));
  const gp = new THREE.Vector3(0, 0, T / 2 + 2.5).applyMatrix4(HM);
  bundle.add(kit.pools, kit.pools.add(gp.x, kit.heightAt(gp.x, gp.z) + 0.05, gp.z, 5, kit.warm, 0.22));
  kit.occupancy.add(at.x, at.z, 9);
  const c = new THREE.Vector3(0, 0, nz).applyMatrix4(HM);
  kit.occupancy.add(c.x, c.z, 8);
  kit.light({ position: { x: at.x, y: y0 + 8, z: at.z }, group: 'window', set: (k) => bundle.set(k), delay: 0.3 });
}
