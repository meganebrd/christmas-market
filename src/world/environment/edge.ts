import type { Layout } from '../layout';
import { PALETTE } from '../palette';
import { addMerged, type EnvKit } from './kit';
import { DEG, MeshBuilder, rng, SNOW_HEX, TAU, wrapAngle } from './util';

/**
 * The edge of the walkable world (r 46): snowbanks, low split-rail fences and hedges of small
 * pines make the boundary feel natural. The gate avenue (south) stays open; on the valley side
 * (north) a fence runs along the cliff and leaves the belvedere's view free.
 */
export function buildEdge(kit: EnvKit, layout: Layout) {
  const b = new MeshBuilder(41);
  const r = rng(808);
  const R = layout.walkRadius;
  const fenceR = R + 0.45;
  const wood = PALETTE.woodDark;

  const isGate = (a: number) => Math.abs(wrapAngle(a)) < 7 * DEG;
  const isBelvedere = (a: number) => Math.abs(wrapAngle(a - Math.PI)) < 13 * DEG;
  const isCliff = (a: number) => Math.abs(wrapAngle(a - Math.PI)) < 47 * DEG;

  // split-rail fence: posts every ~2.3 m
  const postStep = 2.3 / fenceR;
  const posts: number[] = [];
  for (let a = -Math.PI; a < Math.PI; a += postStep) posts.push(a);
  for (let i = 0; i < posts.length; i++) {
    const a = posts[i];
    const a2 = posts[(i + 1) % posts.length] + (i + 1 === posts.length ? TAU : 0);
    if (isGate(a) || isBelvedere(a)) continue;
    // on the gentle sides, the fence comes and goes between hedges
    const cliff = isCliff(a);
    const hedgeZone = !cliff && Math.sin(a * 3.0 + 1.3) > 0.25;
    const x = Math.sin(a) * fenceR;
    const z = Math.cos(a) * fenceR;
    const y = kit.heightAt(x, z);
    if (!hedgeZone) {
      b.box(0.12, 1.15, 0.12, wood, { x, y: y + 0.45, z, ry: a, rz: (r() - 0.5) * 0.06 }, { jitter: 0.08 });
      b.box(0.15, 0.07, 0.15, SNOW_HEX, { x, y: y + 1.05, z, ry: a });
      if (!isGate(a2) && !isBelvedere(a2) && !(Math.sin(a2 * 3.0 + 1.3) > 0.25 && !isCliff(a2))) {
        const mx = Math.sin((a + a2) / 2) * fenceR;
        const mz = Math.cos((a + a2) / 2) * fenceR;
        const len = 2 * fenceR * Math.sin((a2 - a) / 2) + 0.1;
        const yaw = (a + a2) / 2;
        for (const [hy, th] of [[0.45, 0.07], [0.82, 0.08]] as const) {
          b.box(len, th, 0.06, wood, { x: mx, y: y + hy, z: mz, ry: yaw, rz: (r() - 0.5) * 0.04 }, { jitter: 0.08 });
          b.box(len * (0.6 + r() * 0.4), 0.045, 0.075, SNOW_HEX, { x: mx, y: y + hy + th / 2 + 0.02, z: mz, ry: yaw });
        }
      }
    }
  }

  // snowbanks all along the edge (lower on the cliff side, none in the openings)
  const bankStep = 2.1 / (R + 1.5);
  for (let a = -Math.PI; a < Math.PI; a += bankStep * (0.7 + r() * 0.6)) {
    if (isGate(a) || isBelvedere(a)) continue;
    const cliff = isCliff(a);
    const rr = R + 1.1 + r() * 1.6 + (cliff ? -0.4 : 0);
    const x = Math.sin(a) * rr;
    const z = Math.cos(a) * rr;
    const s = (cliff ? 0.45 : 0.7) + r() * 0.55;
    b.lump(s, SNOW_HEX, { x, y: kit.heightAt(x, z) - s * 0.25, z, ry: r() * 3, s: [1.8, 0.55 + r() * 0.3, 1.2] });
  }
  // a hedge of small pines behind the fences on the gentle sides
  for (let a = -Math.PI; a < Math.PI; a += (1.6 + r() * 1.2) / (R + 2.5)) {
    if (isGate(a) || isCliff(a)) continue;
    if (Math.abs(wrapAngle(a)) < 11 * DEG) continue;
    const dense = Math.sin(a * 3.0 + 1.3) > 0.25;
    if (!dense && r() < 0.55) continue;
    const rr = R + 2.2 + r() * 1.8;
    const x = Math.sin(a) * rr;
    const z = Math.cos(a) * rr;
    const h = (dense ? 1.8 : 1.4) + r() * 1.8;
    kit.pines.add('near', x, kit.heightAt(x, z) - 0.1, z, h, h * (0.68 + r() * 0.15), r() * TAU);
    kit.occupancy.add(x, z, h * 0.25);
  }
  addMerged(kit, b.build(), kit.mats.lambert, 'env:edge', { cast: true, receive: true });
}
