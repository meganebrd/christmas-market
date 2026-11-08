import * as THREE from 'three';
import { LightBundle } from './fx';
import type { VillageCtx } from './village';
import { gableGeometry, rng, SNOW_HEX } from './util';

/**
 * A tiny hamlet far below in the north valley, seen from the belvedere: a handful of snowy
 * roofs, warm specks of windows, a little spire, and a string of lamps along the road that
 * winds down from Givrelune.
 */
export function buildHamlet(v: VillageCtx) {
  const { kit, b } = v;
  const r = rng(77);
  const cx = -16;
  const cz = -166;
  const windows = new LightBundle();
  const road = new LightBundle();
  const win = new THREE.Color('#ffc46a');
  const n = Math.round(10 + 8 * kit.detail);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const d = 4 + Math.sqrt(r()) * 24;
    const x = cx + Math.cos(a) * d * 1.3;
    const z = cz + Math.sin(a) * d;
    const y = kit.heightAt(x, z);
    const W = 3 + r() * 2;
    const D = 3 + r() * 1.6;
    const H = 2.3 + r() * 1.4;
    const yaw = r() * Math.PI;
    b.push({ x, y, z, ry: yaw });
    b.box(W, H + 1, D, r() < 0.5 ? '#b89f80' : '#7a5a44', { y: (H - 1) / 2 });
    const R = W * 0.45;
    b.add(gableGeometry(), '#4a3a34', { y: H, s: [W, R, D] });
    for (const side of [-1, 1]) {
      b.box(W * 0.62, 0.25, D + 0.5, SNOW_HEX, { x: side * W * 0.25, y: H + R * 0.55, rz: -side * Math.atan2(R, W / 2) });
    }
    b.pop();
    // windows as warm specks, on the side facing Givrelune (up the valley)
    const lit = 1 + Math.floor(r() * 3);
    const tx = -x;
    const tz = -40 - z;
    const tl = Math.hypot(tx, tz) || 1;
    const out = Math.max(W, D) / 2 + 0.3;
    for (let k = 0; k < lit; k++) {
      const side = (r() - 0.5) * W * 0.7;
      const wx = x + (tx / tl) * out - (tz / tl) * side;
      const wz = z + (tz / tl) * out + (tx / tl) * side;
      windows.add(kit.halos, kit.halos.add(wx, y + 0.9 + r() * 1.4, wz, 1.1 + r() * 0.6, win, 1.3 + r() * 0.7));
    }
  }
  // little church with a spire
  {
    const x = cx + 6;
    const z = cz - 6;
    const y = kit.heightAt(x, z);
    b.box(3.5, 9, 3.5, '#d9d0c0', { x, y: y + 3.5, z });
    b.cone(2.4, 6, 4, '#4a4a5a', { x, y: y + 11, z, ry: Math.PI / 4 }, { snow: 0.4 });
    windows.add(kit.halos, kit.halos.add(x, y + 6, z + 2.1, 1.6, new THREE.Color('#ffd28a'), 1.5));
  }
  // the road winding down from the village (east rim, near the church) to the hamlet
  const pts = [
    new THREE.Vector3(52, 0, -48),
    new THREE.Vector3(48, 0, -72),
    new THREE.Vector3(30, 0, -86),
    new THREE.Vector3(42, 0, -110),
    new THREE.Vector3(24, 0, -132),
    new THREE.Vector3(14, 0, -150),
    new THREE.Vector3(cx + 10, 0, cz + 6),
  ];
  const curve = new THREE.CatmullRomCurve3(pts);
  const len = curve.getLength();
  const step = 11;
  for (let s = 0; s <= len; s += step) {
    const p = curve.getPointAt(s / len);
    const y = kit.heightAt(p.x, p.z) + 2.2;
    road.add(kit.halos, kit.halos.add(p.x, y, p.z, 1.7, kit.warm, 1.5));
  }
  kit.light({ position: { x: cx, y: -60, z: cz }, group: 'window', set: (k) => windows.set(k), delay: 0.8 });
  kit.light({ position: { x: 40, y: -20, z: -100 }, group: 'street', set: (k) => road.set(k), delay: 0.5 });
}
