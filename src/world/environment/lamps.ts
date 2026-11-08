import * as THREE from 'three';
import type { Layout } from '../layout';
import { PALETTE } from '../palette';
import { LightBundle } from './fx';
import { addMerged, type EnvKit } from './kit';
import { roadX } from './terrain';
import { DEG, matrixOf, MeshBuilder, SNOW_HEX } from './util';

/**
 * Street lamps: cast-iron posts with a glowing lantern, a snow cap, a holly wreath on some, an
 * additive halo and a warm pool of light on the snow. Each lamp is one LightDirector handle in
 * the 'street' group (the intro wave lights them one after the other).
 */
export const LAMP_ANCHOR_Y = 2.88;
const IRON = '#23252f';
const torus = new THREE.TorusGeometry(1, 0.3, 5, 12);

export interface LampSpot {
  x: number;
  z: number;
  /** Yaw of the lamp's decorated side (local +Z). */
  yaw: number;
  id: string;
}

export function lampInto(kit: EnvKit, b: MeshBuilder, spot: LampSpot, opts: { wreath?: boolean; delay?: number; group?: string; collider?: boolean } = {}) {
  const { x, z, yaw } = spot;
  const y = kit.heightAt(x, z);
  b.push({ x, y, z, ry: yaw });
  b.cyl(0.2, 0.25, 0.36, 8, IRON, { y: 0.18 });
  b.cyl(0.19, 0.19, 0.05, 8, SNOW_HEX, { y: 0.385 });
  b.cyl(0.055, 0.075, 2.55, 6, IRON, { y: 0.36 + 1.275 });
  b.cyl(0.09, 0.09, 0.07, 6, IRON, { y: 0.75 });
  b.cyl(0.085, 0.085, 0.07, 6, IRON, { y: 2.55 });
  b.cyl(0.15, 0.1, 0.1, 6, IRON, { y: 2.93 });
  // lantern frame
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(0.03, 0.4, 0.03, IRON, { x: sx * 0.14, y: 3.18, z: sz * 0.14 });
  b.box(0.34, 0.04, 0.34, IRON, { y: 2.99 });
  b.cone(0.3, 0.24, 4, IRON, { y: 3.5, ry: Math.PI / 4 });
  b.cone(0.26, 0.13, 4, SNOW_HEX, { y: 3.6, ry: Math.PI / 4 });
  b.lump(0.045, IRON, { y: 3.7 }, undefined, 0);
  if (opts.wreath) {
    b.add(torus, PALETTE.holly, { y: 2.15, z: 0.09, s: 0.24 });
    b.box(0.18, 0.11, 0.05, PALETTE.berry, { y: 1.92, z: 0.14 });
    b.box(0.05, 0.22, 0.03, PALETTE.berry, { x: -0.05, y: 1.8, z: 0.14, rz: 0.3 });
    b.box(0.05, 0.22, 0.03, PALETTE.berry, { x: 0.05, y: 1.8, z: 0.14, rz: -0.3 });
  }
  b.pop();
  const warm = kit.warm;
  const bundle = new LightBundle();
  bundle.add(kit.glass, kit.glass.add(matrixOf({ x, y: y + 3.19, z, ry: yaw, s: [0.25, 0.36, 0.25] }), warm, 2.7));
  bundle.add(kit.halos, kit.halos.add(x, y + 3.2, z, 2.2, warm, 0.34));
  bundle.add(kit.pools, kit.pools.add(x, y + 0.03, z, 7.5, warm, 0.3), (k) => k * k);
  kit.light({ position: { x, y: y + 3.2, z }, group: opts.group ?? 'street', delay: opts.delay, set: (k) => bundle.set(k) });
  if (opts.collider !== false) {
    try {
      kit.ctx.colliders.addCircle(x, z, 0.26, 'prop');
    } catch {
      /* ignore */
    }
  }
  kit.occupancy.add(x, z, 0.6);
  return new THREE.Vector3(x, y + LAMP_ANCHOR_Y, z);
}

/** Deterministic lamp placement (garlands use the same spots). */
export function lampSpots(layout: Layout): { alleyInner: LampSpot[]; alleyOuter: LampSpot[]; gate: LampSpot[]; road: LampSpot[] } {
  const { r0, r1 } = layout.alley;
  const innerUsed = layout.stalls.filter((s) => s.ring === 'inner').map((s) => s.angle);
  const alleyInner: LampSpot[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (22.5 + k * 45) * DEG;
    if (innerUsed.some((u) => Math.abs(Math.atan2(Math.sin(u - a), Math.cos(u - a))) < 10 * DEG)) continue;
    const r = r0 - 0.45;
    // decorated side faces the alley
    alleyInner.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, yaw: Math.atan2(Math.sin(a), Math.cos(a)), id: `in${k}` });
  }
  const alleyOuter: LampSpot[] = [];
  for (let k = 0; k < 8; k++) {
    for (const off of [-7.6, 7.6]) {
      const a = (k * 45 + off) * DEG;
      const r = r1 + 0.35;
      alleyOuter.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, yaw: Math.atan2(-Math.sin(a), -Math.cos(a)), id: `out${k}${off > 0 ? 'b' : 'a'}` });
    }
  }
  const gate: LampSpot[] = [];
  for (const z of [27.6, 32.2, 44.4]) {
    for (const sx of [-1, 1]) gate.push({ x: sx * 3.05, z, yaw: sx > 0 ? -Math.PI / 2 : Math.PI / 2, id: `gate${z}${sx}` });
  }
  const road: LampSpot[] = [];
  let side = 1;
  for (const z of [53, 63.5, 74.5, 86, 98, 111]) {
    const x = roadX(z) + side * 3.3;
    road.push({ x, z, yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2, id: `road${z}` });
    side = -side;
  }
  return { alleyInner, alleyOuter, gate, road };
}

export function buildLamps(kit: EnvKit, layout: Layout) {
  const b = new MeshBuilder(17);
  const spots = lampSpots(layout);
  let i = 0;
  for (const s of spots.alleyInner) lampInto(kit, b, s, { wreath: true });
  for (const s of spots.alleyOuter) lampInto(kit, b, s, { wreath: i++ % 2 === 0 });
  for (const s of spots.gate) lampInto(kit, b, s, { wreath: true });
  for (const s of spots.road) lampInto(kit, b, s, { wreath: false, collider: false });
  addMerged(kit, b.build(), kit.mats.lambert, 'env:lamps', { cast: true, receive: true });
}
