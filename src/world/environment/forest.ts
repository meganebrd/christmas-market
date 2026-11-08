import * as THREE from 'three';
import type { Layout } from '../layout';
import { PALETTE } from '../palette';
import type { EnvKit } from './kit';
import { roadX, valleyWeight } from './terrain';
import { fbm2, matrixOf, MeshBuilder, rng, TAU } from './util';

/**
 * Snowy pines, instanced. Two levels of detail: a "near" pine with snow caps on every tier
 * (market decorations, hedges, the first rows of the forest) and a light "far" pine for the
 * hills. `kit.pines` collects placements from every builder; the forest adds the woods
 * (r 57–235) and everything is uploaded at the end (a few sector meshes for frustum culling).
 */
interface PineItem {
  m: THREE.Matrix4;
  c: THREE.Color;
}

const SNOW_C = new THREE.Color('#e9eef9');
const SNOW_SHADE = new THREE.Color('#b7c3e3');

function pineGeometry(lod: 'near' | 'far'): THREE.BufferGeometry {
  const b = new MeshBuilder(3);
  const tiers = lod === 'near' ? 4 : 3;
  const seg = lod === 'near' ? 10 : 7;
  const dark = new THREE.Color(PALETTE.pineDark);
  const mid = new THREE.Color(PALETTE.pine);
  // trunk
  if (lod === 'near') b.cyl(0.035, 0.05, 0.3, 5, PALETTE.woodDark, { y: 0.1 });
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const y0 = 0.14 + t * (lod === 'near' ? 0.6 : 0.56);
    const h = (lod === 'near' ? 0.44 : 0.5) - t * 0.1;
    const R = (lod === 'near' ? 0.37 : 0.4) - t * (lod === 'near' ? 0.22 : 0.24);
    // green tier: star-shaped base ring, tip
    const pos: number[] = [];
    const col: number[] = [];
    const push = (x: number, y: number, z: number, c: THREE.Color) => {
      pos.push(x, y, z);
      col.push(c.r, c.g, c.b);
    };
    const ring: [number, number, number][] = [];
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * TAU + i * 0.7;
      const rr = R * (k % 2 ? 0.8 : 1);
      ring.push([Math.sin(a) * rr, y0 + (k % 2 ? 0.05 : -0.01) * h, Math.cos(a) * rr]);
    }
    const tip: [number, number, number] = [0, y0 + h, 0];
    for (let k = 0; k < seg; k++) {
      const a = ring[k];
      const bb = ring[(k + 1) % seg];
      const tipC = lod === 'far' && i === tiers - 1 ? SNOW_C : mid;
      push(a[0], a[1], a[2], dark);
      push(bb[0], bb[1], bb[2], dark);
      push(tip[0], tip[1], tip[2], lod === 'far' ? SNOW_SHADE.clone().lerp(mid, 0.4) : tipC);
      if (i === 0 && lod === 'near') {
        // underside of the lowest tier
        push(bb[0], bb[1], bb[2], dark);
        push(a[0], a[1], a[2], dark);
        push(0, y0 + 0.02, 0, dark);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    b.add(g, 'vertex');
    if (lod === 'near') {
      // snow cap with a jagged lower edge
      const cp: number[] = [];
      const cc: number[] = [];
      const capRing: [number, number, number][] = [];
      for (let k = 0; k < seg; k++) {
        const a = (k / seg) * TAU + i * 0.7 + 0.15;
        const rr = R * (k % 2 ? 0.52 : 0.74);
        const yy = y0 + h * (k % 2 ? 0.46 : 0.3);
        capRing.push([Math.sin(a) * rr * 1.04, yy + 0.012, Math.cos(a) * rr * 1.04]);
      }
      for (let k = 0; k < seg; k++) {
        const a = capRing[k];
        const bb = capRing[(k + 1) % seg];
        cp.push(a[0], a[1], a[2], bb[0], bb[1], bb[2], 0, y0 + h + 0.015, 0);
        cc.push(SNOW_SHADE.r, SNOW_SHADE.g, SNOW_SHADE.b, SNOW_SHADE.r, SNOW_SHADE.g, SNOW_SHADE.b, SNOW_C.r, SNOW_C.g, SNOW_C.b);
      }
      const gc = new THREE.BufferGeometry();
      gc.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
      gc.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
      gc.computeVertexNormals();
      b.add(gc, 'vertex');
    }
  }
  const geo = b.build()!;
  return geo;
}

type PineKind = 'cast' | 'near' | 'far';

export class PineField {
  /** Forest pines are split in 4 sectors so the camera can frustum-cull them. */
  private lists = new Map<string, PineItem[]>();

  /** height in metres; `cast` = near detail + casts shadows (things inside the market). */
  add(kind: PineKind, x: number, y: number, z: number, height: number, width = height * 0.9, rotY = 0, tint?: THREE.Color) {
    const m = matrixOf({ x, y, z, ry: rotY, s: [width, height, width] });
    const sector = kind === 'cast' ? 0 : Math.floor(((Math.atan2(x, z) + Math.PI) / TAU) * 4) % 4;
    const key = kind + ':' + sector;
    let list = this.lists.get(key);
    if (!list) this.lists.set(key, (list = []));
    list.push({ m, c: tint ?? new THREE.Color(1, 1, 1) });
  }

  finalize(kit: EnvKit) {
    const geos = { near: pineGeometry('near'), far: pineGeometry('far') };
    for (const [key, items] of this.lists) {
      const kind = key.split(':')[0] as PineKind;
      if (!items.length) continue;
      const mesh = new THREE.InstancedMesh(kind === 'far' ? geos.far : geos.near, kit.mats.lambert, items.length);
      items.forEach((it, i) => {
        mesh.setMatrixAt(i, it.m);
        mesh.setColorAt(i, it.c);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = kind === 'cast' && kit.shadows;
      mesh.receiveShadow = kind === 'cast' && kit.shadows;
      mesh.name = 'env:pines-' + key;
      kit.root.add(mesh);
    }
  }
}

export function buildForest(kit: EnvKit, layout: Layout) {
  const r = rng(321);
  const pines = kit.pines;
  const cell = 5.8 / Math.sqrt(kit.detail);
  const tint = () => {
    const k = 0.86 + r() * 0.2;
    return new THREE.Color(k * (0.97 + r() * 0.06), k, k * (0.97 + r() * 0.06));
  };
  const RMAX = 175 + 60 * kit.detail;
  for (let gx = -RMAX; gx < RMAX; gx += cell) {
    for (let gz = -RMAX; gz < RMAX; gz += cell) {
      const x = gx + r() * cell;
      const z = gz + r() * cell;
      const rad = Math.hypot(x, z);
      if (rad < 57 || rad > RMAX) continue;
      let p = rad > 175 ? 0.3 : rad > 96 ? 0.48 : 0.62;
      // clearings & thickets
      const n = fbm2(x * 0.03 + 4, z * 0.03 - 2, 3);
      p *= Math.min(1.25, Math.max(0.15, 0.85 + n * 1.6));
      // village belt: only between the houses
      if (rad < 70) p *= 0.5;
      // the road south stays open
      if (z > 40 && Math.abs(x - roadX(z)) < 7.5) continue;
      // the north valley: sparse pines on the slopes
      const v = valleyWeight(x, z);
      if (v > 0.05) {
        p *= 1 - v * 0.6;
        if (rad < 60) p *= 0.4;
      }
      if (r() > p) continue;
      if (!kit.occupancy.free(x, z, 1.4)) continue;
      const y = kit.heightAt(x, z);
      const h = (4.5 + r() * 5.5) * (1 + Math.min(0.5, (rad - 60) * 0.004));
      const kind = rad < 96 ? 'near' : 'far';
      pines.add(kind, x, y - 0.15, z, h, h * (0.62 + r() * 0.2), r() * TAU, tint());
    }
  }
  void layout;
}
