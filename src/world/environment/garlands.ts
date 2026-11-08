import * as THREE from 'three';
import type { Layout } from '../layout';
import { LightBundle } from './fx';
import { addMerged, type EnvKit } from './kit';
import { lampSpots, LAMP_ANCHOR_Y, type LampSpot } from './lamps';
import { matrixOf, MeshBuilder, rng, sagPoints } from './util';

/**
 * Fairy-light garlands: strung across every avenue entrance and zig-zagging over the alley from
 * lamp to lamp (sagging wires, instanced glowing bulbs, warm or multicolour). Each span is one
 * LightDirector handle in the 'garland' group.
 */
const MULTI = ['#ff5040', '#ffcf4a', '#52dc78', '#4aa4ff', '#ff7ad0', '#ffffff'];

export function stringLights(
  kit: EnvKit,
  wires: MeshBuilder,
  a: THREE.Vector3,
  b: THREE.Vector3,
  opts: { sag?: number; multi?: boolean; spacing?: number; seed?: number; group?: string; delay?: number } = {},
) {
  const len = a.distanceTo(b);
  const sag = opts.sag ?? Math.min(0.9, 0.05 * len + 0.08);
  const n = Math.max(4, Math.round(len / (opts.spacing ?? 0.4)));
  const pts = sagPoints(a, b, sag, n);
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.TubeGeometry(curve, Math.max(8, Math.round(len * 2)), 0.011, 3, false);
  wires.add(tube, '#2a2420');
  tube.dispose();
  const bundle = new LightBundle();
  const r = rng(opts.seed ?? 1);
  const warm = kit.warm;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const c = opts.multi ? new THREE.Color(MULTI[i % MULTI.length]) : warm.clone().lerp(new THREE.Color('#fff0c8'), r() * 0.35);
    // bulbs hang a little under the wire
    const m = matrixOf({ x: p.x, y: p.y - 0.05, z: p.z, s: 0.04 });
    bundle.add(kit.bulbs, kit.bulbs.add(m, c, opts.multi ? 2.4 : 2.6));
  }
  const mid = new THREE.Vector3().lerpVectors(a, b, 0.5);
  kit.light({ position: { x: mid.x, y: mid.y, z: mid.z }, group: opts.group ?? 'garland', delay: opts.delay ?? 0.15, set: (k) => bundle.set(k) });
}

export function buildGarlands(kit: EnvKit, layout: Layout) {
  const wires = new MeshBuilder(23);
  const spots = lampSpots(layout);
  const top = (s: LampSpot) => new THREE.Vector3(s.x, kit.heightAt(s.x, s.z) + LAMP_ANCHOR_Y, s.z);
  const outer = new Map(spots.alleyOuter.map((s) => [s.id, s]));
  let seed = 1;
  // across each avenue entrance (between the two lamps that flank it)
  for (let k = 0; k < 8; k++) {
    const a = outer.get(`out${k}a`);
    const b = outer.get(`out${k}b`);
    if (a && b) stringLights(kit, wires, top(a), top(b), { multi: k % 2 === 1, seed: seed++, sag: 0.42 });
  }
  // zig-zag over the alley: inner lamp ↔ the outer lamps of both neighbouring openings
  for (const inner of spots.alleyInner) {
    const k = Number(inner.id.slice(2));
    const a = outer.get(`out${k}b`);
    const b = outer.get(`out${(k + 1) % 8}a`);
    const multi = k % 2 === 0;
    if (a) stringLights(kit, wires, top(inner), top(a), { multi, seed: seed++, sag: 0.55 });
    if (b) stringLights(kit, wires, top(inner), top(b), { multi, seed: seed++, sag: 0.55 });
  }
  // the gate avenue: across the street at each pair of lamps
  const gate = spots.gate;
  for (let i = 0; i + 1 < gate.length; i += 2) {
    if (gate[i].z > 40) continue; // keep the view from the spawn point clear
    stringLights(kit, wires, top(gate[i]), top(gate[i + 1]), { multi: i === 2, seed: seed++, sag: 0.4 });
  }
  // and along it, lamp to lamp on each side
  for (const sx of [0, 1]) {
    const side = gate.filter((_, i) => i % 2 === sx);
    for (let i = 0; i + 1 < side.length; i++) {
      if (Math.abs(side[i].z - side[i + 1].z) > 8) continue;
      stringLights(kit, wires, top(side[i]), top(side[i + 1]), { seed: seed++, sag: 0.5 });
    }
  }
  addMerged(kit, wires.build(), kit.mats.lambert, 'env:garland-wires');
}
