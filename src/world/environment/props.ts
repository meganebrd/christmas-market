import * as THREE from 'three';
import type { Layout, StallSlot } from '../layout';
import { PALETTE } from '../palette';
import { textTexture } from '../textures';
import { patchSkyFog } from './skyShared';
import { LightBundle } from './fx';
import { addMerged, type EnvKit } from './kit';
import { lampInto } from './lamps';
import { DEG, matrixOf, MeshBuilder, rng, SNOW_HEX, TAU } from './util';

/**
 * Street furniture & cosy props: benches, snowmen, sleds, firewood, gift piles, ground lanterns,
 * decorated pines, wooden reindeer, a red "Lettres au Père Noël" mailbox near the plaza, and
 * little prop islands in the empty chalet slots. All merged into one mesh (+ instanced pines and
 * bulbs); every solid prop has a collider.
 */
const IRON = '#23252f';
const GIFT_COLORS = ['#b8413a', '#2f5d50', '#e2b34a', '#3c5a8a', '#f3ead8', '#6c4a7d', '#c0392b'];
const RIBBONS = ['#e2b34a', '#f3ead8', '#b8413a', '#2f6b3f'];
const MULTI = ['#ff5040', '#ffcf4a', '#52dc78', '#4aa4ff', '#ff7ad0'];

type Frame = { x: number; z: number; yaw: number };

interface PropCtx {
  kit: EnvKit;
  b: MeshBuilder;
  r: () => number;
}

function world(f: Frame, lx: number, lz: number) {
  const c = Math.cos(f.yaw);
  const s = Math.sin(f.yaw);
  return { x: f.x + lx * c + lz * s, z: f.z - lx * s + lz * c };
}

function collideCircle(kit: EnvKit, x: number, z: number, r: number) {
  try {
    kit.ctx.colliders.addCircle(x, z, r, 'prop');
  } catch {
    /* ignore */
  }
  kit.occupancy.add(x, z, r);
}

function collideBox(kit: EnvKit, x: number, z: number, hw: number, hd: number, yaw: number) {
  try {
    kit.ctx.colliders.addBox(x, z, hw, hd, yaw, 'prop');
  } catch {
    /* ignore */
  }
  kit.occupancy.add(x, z, Math.max(hw, hd));
}

// ───────────────────────────── props ─────────────────────────────

export function bench(p: PropCtx, x: number, z: number, yaw: number) {
  const { b, kit } = p;
  const wood = p.r() < 0.5 ? PALETTE.wood : PALETTE.woodLight;
  b.push({ x, y: kit.heightAt(x, z), z, ry: yaw });
  for (const sx of [-0.66, 0.66]) {
    b.box(0.06, 0.44, 0.06, IRON, { x: sx, y: 0.22, z: 0.16 });
    b.box(0.06, 0.86, 0.06, IRON, { x: sx, y: 0.43, z: -0.2, rx: -0.08 });
    b.box(0.06, 0.05, 0.46, IRON, { x: sx, y: 0.42, z: -0.02 });
    b.box(0.05, 0.06, 0.3, IRON, { x: sx, y: 0.62, z: 0.03 });
  }
  for (let i = 0; i < 3; i++) b.box(1.56, 0.05, 0.12, wood, { y: 0.46, z: -0.15 + i * 0.14 }, { jitter: 0.06 });
  for (let i = 0; i < 2; i++) b.box(1.56, 0.11, 0.04, wood, { y: 0.66 + i * 0.17, z: -0.23 - i * 0.012, rx: -0.08 }, { jitter: 0.06 });
  // snow on the seat and the backrest
  b.box(1.42, 0.06, 0.3, SNOW_HEX, { x: (p.r() - 0.5) * 0.1, y: 0.51, z: -0.02 });
  b.lump(0.2, SNOW_HEX, { x: -0.45 + p.r() * 0.9, y: 0.52, z: 0.0, s: [1.2, 0.35, 0.8] });
  b.box(1.5, 0.04, 0.06, SNOW_HEX, { y: 0.93, z: -0.245 });
  b.pop();
  collideBox(kit, x, z, 0.8, 0.32, yaw);
}

export function snowman(p: PropCtx, x: number, z: number, yaw: number, s = 1) {
  const { b, kit, r } = p;
  b.push({ x, y: kit.heightAt(x, z), z, ry: yaw, s });
  b.lump(0.62, SNOW_HEX, { y: 0.05, s: [1.2, 0.25, 1.2] });
  b.sphere(0.44, 10, 7, SNOW_HEX, { y: 0.38 });
  b.sphere(0.31, 10, 7, SNOW_HEX, { y: 0.92 });
  b.sphere(0.23, 10, 7, SNOW_HEX, { y: 1.34 });
  for (const ex of [-0.08, 0.08]) b.lump(0.028, '#1b1b22', { x: ex, y: 1.4, z: 0.2 }, undefined, 0);
  b.cone(0.045, 0.24, 6, '#e07a2a', { y: 1.33, z: 0.32, rx: Math.PI / 2 });
  for (let i = 0; i < 3; i++) b.lump(0.03, '#1b1b22', { y: 0.82 + i * 0.12, z: 0.29 - Math.abs(i - 1) * 0.015 }, undefined, 0);
  const scarf = r() < 0.5 ? PALETTE.red : r() < 0.5 ? PALETTE.green : PALETTE.blue;
  b.cyl(0.24, 0.27, 0.1, 12, scarf, { y: 1.14 });
  b.box(0.1, 0.3, 0.04, scarf, { x: 0.12, y: 0.98, z: 0.25, rz: 0.15, rx: -0.2 });
  if (r() < 0.5) {
    b.cyl(0.2, 0.2, 0.03, 12, '#1d1d24', { y: 1.53 });
    b.cyl(0.14, 0.14, 0.24, 12, '#1d1d24', { y: 1.66 });
    b.cyl(0.145, 0.145, 0.04, 12, PALETTE.red, { y: 1.57 });
  } else {
    const hat = r() < 0.5 ? PALETTE.red : PALETTE.plum;
    b.cone(0.19, 0.38, 10, hat, { y: 1.68, rz: 0.15 });
    b.cyl(0.2, 0.2, 0.07, 10, PALETTE.cream, { y: 1.52 });
    b.sphere(0.06, 6, 4, PALETTE.cream, { x: -0.05, y: 1.87 });
  }
  for (const sd of [-1, 1]) {
    b.cyl(0.015, 0.022, 0.55, 4, PALETTE.woodDark, { x: sd * 0.45, y: 1.05, rz: -sd * 1.0 });
    b.cyl(0.01, 0.014, 0.15, 4, PALETTE.woodDark, { x: sd * 0.62, y: 1.24, rz: -sd * 0.3 });
  }
  b.pop();
  collideCircle(kit, x, z, 0.48 * s);
}

export function sled(p: PropCtx, x: number, z: number, yaw: number, opts: { blanket?: boolean; gifts?: boolean } = {}) {
  const { b, kit, r } = p;
  const runner = r() < 0.5 ? PALETTE.red : PALETTE.redDark;
  b.push({ x, y: kit.heightAt(x, z), z, ry: yaw });
  for (const sx of [-0.26, 0.26]) {
    b.box(0.04, 0.04, 1.1, runner, { x: sx, y: 0.03, z: 0 });
    b.box(0.04, 0.04, 0.28, runner, { x: sx, y: 0.12, z: 0.62, rx: -1.0 });
    b.box(0.04, 0.04, 0.16, runner, { x: sx, y: 0.24, z: 0.66, rx: 0.9 });
    for (const sz of [-0.35, 0.05, 0.4]) b.box(0.03, 0.18, 0.03, runner, { x: sx, y: 0.12, z: sz });
  }
  for (let i = 0; i < 4; i++) b.box(0.62, 0.035, 0.18, PALETTE.woodLight, { y: 0.22, z: -0.42 + i * 0.25 }, { jitter: 0.07 });
  if (opts.blanket) b.box(0.6, 0.06, 0.55, r() < 0.5 ? PALETTE.green : PALETTE.plum, { y: 0.27, z: -0.15 });
  if (opts.gifts) {
    giftBox(p, 0.05, 0.25, -0.2, 0.3, 0.26, 0.3, 0.2);
    giftBox(p, -0.1, 0.25, 0.2, 0.24, 0.2, 0.22, -0.3);
  }
  b.lump(0.2, SNOW_HEX, { x: 0.1, y: 0.25, z: 0.3, s: [1, 0.3, 0.8] });
  b.pop();
  collideBox(kit, x, z, 0.36, 0.62, yaw);
}

function giftBox(p: PropCtx, x: number, y: number, z: number, w: number, h: number, d: number, ry: number) {
  const { b, r } = p;
  const c = GIFT_COLORS[Math.floor(r() * GIFT_COLORS.length)];
  let rib = RIBBONS[Math.floor(r() * RIBBONS.length)];
  if (rib === c) rib = PALETTE.gold;
  b.push({ x, y, z, ry });
  b.box(w, h, d, c, { y: h / 2 }, { jitter: 0.05 });
  b.box(w + 0.01, h + 0.01, 0.05, rib, { y: h / 2 });
  b.box(0.05, h + 0.01, d + 0.01, rib, { y: h / 2 });
  b.box(0.1, 0.06, 0.1, rib, { y: h + 0.03, ry: 0.78 });
  b.box(w * 0.9, 0.03, d * 0.9, SNOW_HEX, { y: h + 0.015 });
  b.pop();
}

export function gifts(p: PropCtx, x: number, z: number, n = 4) {
  const { kit, r } = p;
  const y = kit.heightAt(x, z);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r();
    const d = i === 0 ? 0 : 0.28 + r() * 0.2;
    const w = 0.22 + r() * 0.22;
    giftBox(p, x + Math.cos(a) * d, y, z + Math.sin(a) * d, w, 0.18 + r() * 0.26, w * (0.8 + r() * 0.4), r() * 3);
  }
  collideCircle(kit, x, z, 0.5);
}

export function woodpile(p: PropCtx, x: number, z: number, yaw: number) {
  const { b, kit, r } = p;
  const bark = (x0: number, y0: number, z0: number, nx: number, ny: number, nz: number, out: THREE.Color) => {
    void x0;
    void y0;
    void z0;
    void ny;
    // log ends (local X axis after rotation) are pale cut wood
    if (Math.abs(nx * Math.cos(yaw) - nz * Math.sin(yaw)) > 0.9) out.set('#c99f6e');
    else out.set(r() < 0.5 ? '#5c3a26' : '#4a2e1e');
  };
  b.push({ x, y: kit.heightAt(x, z), z, ry: yaw });
  const rows = [5, 4, 3];
  rows.forEach((n, row) => {
    for (let i = 0; i < n; i++) {
      const zz = (i - (n - 1) / 2) * 0.25;
      b.cyl(0.12, 0.12, 1.1, 7, bark, { x: (r() - 0.5) * 0.08, y: 0.12 + row * 0.21, z: zz, rz: Math.PI / 2 });
    }
  });
  b.box(1.0, 0.08, 0.6, SNOW_HEX, { y: 0.69, rx: 0.05 });
  b.lump(0.25, SNOW_HEX, { x: 0.2, y: 0.7, s: [1.6, 0.4, 1.0] });
  // chopping block with an axe
  b.cyl(0.2, 0.22, 0.4, 9, bark, { x: 0.9, y: 0.2, z: 0.45 });
  b.cyl(0.19, 0.19, 0.04, 9, SNOW_HEX, { x: 0.9, y: 0.42, z: 0.45 });
  b.box(0.04, 0.55, 0.04, PALETTE.woodLight, { x: 0.9, y: 0.62, z: 0.48, rz: 0.4 });
  b.box(0.18, 0.1, 0.03, '#8a8f9a', { x: 0.98, y: 0.44, z: 0.48, rz: 0.4 });
  b.pop();
  collideBox(kit, x, z, 0.7, 0.45, yaw);
  const w = world({ x, z, yaw }, 0.9, 0.45);
  collideCircle(kit, w.x, w.z, 0.25);
}

export function groundLantern(p: PropCtx, x: number, z: number, scale = 1) {
  const { b, kit } = p;
  const y = kit.heightAt(x, z);
  b.push({ x, y, z, s: scale });
  b.box(0.3, 0.05, 0.3, IRON, { y: 0.03 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(0.025, 0.36, 0.025, IRON, { x: sx * 0.12, y: 0.22, z: sz * 0.12 });
  b.cone(0.22, 0.16, 4, IRON, { y: 0.48, ry: Math.PI / 4 });
  b.cone(0.18, 0.08, 4, SNOW_HEX, { y: 0.55, ry: Math.PI / 4 });
  b.add(new THREE.TorusGeometry(0.06, 0.012, 4, 8), IRON, { y: 0.6, rx: 0 });
  b.pop();
  const bundle = new LightBundle();
  bundle.add(kit.glass, kit.glass.add(matrixOf({ x, y: y + 0.24 * scale, z, s: [0.2 * scale, 0.3 * scale, 0.2 * scale] }), kit.warm, 3));
  bundle.add(kit.halos, kit.halos.add(x, y + 0.26 * scale, z, 1.1 * scale, kit.warm, 0.55));
  bundle.add(kit.pools, kit.pools.add(x, y + 0.03, z, 3.2 * scale, kit.warm, 0.28), (k) => k * k);
  kit.light({ position: { x, y: y + 0.3, z }, group: 'street', delay: 0.2, set: (k) => bundle.set(k) });
  collideCircle(kit, x, z, 0.2 * scale);
}

/** A pine dressed for Christmas: bulbs spiralling around it and a golden star on top. */
export function decoratedPine(p: PropCtx, x: number, z: number, h: number, opts: { multi?: boolean; star?: boolean } = {}) {
  const { b, kit, r } = p;
  const y = kit.heightAt(x, z);
  const w = h * 0.68;
  kit.pines.add('cast', x, y - 0.05, z, h, w, r() * TAU);
  const bundle = new LightBundle();
  const turns = 3.2;
  const n = Math.round(h * 10);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const yy = 0.2 + t * 0.78;
    // radius of the silhouette at this height (tiers of the pine)
    const rad = (0.33 - t * 0.27) * w * 1.02 + 0.03;
    const a = t * turns * TAU + r() * 0.3;
    const c = opts.multi ? new THREE.Color(MULTI[i % MULTI.length]) : kit.warm.clone().lerp(new THREE.Color('#fff2cc'), r() * 0.4);
    const m = matrixOf({ x: x + Math.sin(a) * rad, y: y + yy * h, z: z + Math.cos(a) * rad, s: 0.045 });
    bundle.add(kit.bulbs, kit.bulbs.add(m, c, opts.multi ? 2.4 : 2.8));
  }
  // a few baubles
  for (let i = 0; i < Math.round(h * 3); i++) {
    const t = 0.1 + r() * 0.75;
    const rad = (0.33 - t * 0.27) * w * 0.98;
    const a = r() * TAU;
    b.lump(0.07, GIFT_COLORS[i % 4], { x: x + Math.sin(a) * rad, y: y + (0.18 + t * 0.75) * h, z: z + Math.cos(a) * rad }, undefined, 0);
  }
  if (opts.star !== false) {
    const sy = y + h * 1.03;
    bundle.add(kit.bulbs, kit.bulbs.add(matrixOf({ x, y: sy, z, s: [0.1, 0.16, 0.1] }), new THREE.Color(PALETTE.gold), 3.2));
    bundle.add(kit.halos, kit.halos.add(x, sy, z, 1.3, new THREE.Color('#ffd27a'), 0.45));
  }
  kit.light({ position: { x, y: y + h * 0.5, z }, group: 'garland', delay: 0.1, set: (k) => bundle.set(k) });
  collideCircle(kit, x, z, Math.max(0.35, w * 0.3));
}

export function reindeer(p: PropCtx, x: number, z: number, yaw: number, s = 1) {
  const { b, kit } = p;
  const wood = '#b08a62';
  const bark = '#6a4a32';
  b.push({ x, y: kit.heightAt(x, z), z, ry: yaw, s });
  b.cyl(0.17, 0.17, 0.75, 8, wood, { y: 0.62, rx: Math.PI / 2 });
  b.cyl(0.15, 0.15, 0.02, 8, '#d8b890', { y: 0.62, z: 0.38, rx: Math.PI / 2 });
  for (const [lx, lz] of [[-0.1, 0.25], [0.1, 0.25], [-0.1, -0.25], [0.1, -0.25]]) b.cyl(0.035, 0.035, 0.56, 5, bark, { x: lx, y: 0.28, z: lz });
  b.cyl(0.06, 0.07, 0.42, 6, wood, { y: 0.88, z: 0.3, rx: 0.5 });
  b.cyl(0.08, 0.09, 0.28, 7, wood, { y: 1.07, z: 0.46, rx: Math.PI / 2 - 0.2 });
  b.lump(0.035, PALETTE.berry, { y: 1.04, z: 0.61 }, undefined, 0);
  for (const sd of [-1, 1]) {
    b.cyl(0.012, 0.016, 0.34, 4, bark, { x: sd * 0.08, y: 1.27, z: 0.38, rz: -sd * 0.5, rx: -0.2 });
    b.cyl(0.01, 0.012, 0.16, 4, bark, { x: sd * 0.18, y: 1.38, z: 0.4, rz: sd * 0.6 });
  }
  b.cyl(0.11, 0.11, 0.06, 8, PALETTE.red, { y: 0.86, z: 0.3, rx: 0.5 });
  b.box(0.36, 0.035, 0.5, SNOW_HEX, { y: 0.8 });
  b.cyl(0.03, 0.02, 0.2, 4, bark, { y: 0.66, z: -0.42, rx: -0.6 });
  b.pop();
  collideBox(kit, x, z, 0.22 * s, 0.45 * s, yaw);
}

function crateOfApples(p: PropCtx, x: number, z: number, yaw: number) {
  const { b, kit, r } = p;
  b.push({ x, y: kit.heightAt(x, z), z, ry: yaw });
  b.box(0.6, 0.32, 0.42, PALETTE.woodLight, { y: 0.16 }, { jitter: 0.06 });
  b.box(0.62, 0.04, 0.44, PALETTE.wood, { y: 0.06 });
  b.box(0.62, 0.04, 0.44, PALETTE.wood, { y: 0.26 });
  for (let i = 0; i < 9; i++) b.lump(0.065, r() < 0.8 ? PALETTE.berry : '#d9a23a', { x: -0.2 + (i % 3) * 0.2, y: 0.34, z: -0.12 + Math.floor(i / 3) * 0.12 }, undefined, 0);
  b.pop();
  collideBox(kit, x, z, 0.32, 0.23, yaw);
}

function snowLumps(p: PropCtx, f: Frame, n: number, spread: number) {
  for (let i = 0; i < n; i++) {
    const w = world(f, (p.r() - 0.5) * spread * 2, (p.r() - 0.5) * spread);
    const s = 0.3 + p.r() * 0.45;
    p.b.lump(s, SNOW_HEX, { x: w.x, y: p.kit.heightAt(w.x, w.z) - s * 0.25, z: w.z, s: [1.4, 0.45, 1.1], ry: p.r() * 3 });
  }
}

// ───────────────────────────── the mailbox ─────────────────────────────

function mailbox(p: PropCtx, signB: THREE.Group, x: number, z: number, yaw: number) {
  const { b, kit } = p;
  const red = '#b8302b';
  b.push({ x, y: kit.heightAt(x, z), z, ry: yaw });
  b.box(0.12, 0.9, 0.12, IRON, { y: 0.45 });
  b.box(0.36, 0.06, 0.36, IRON, { y: 0.03 });
  b.box(0.6, 0.62, 0.46, red, { y: 1.18 });
  b.cyl(0.3, 0.3, 0.46, 14, red, { y: 1.49, rx: Math.PI / 2, s: [1, 1, 1] });
  b.cyl(0.31, 0.31, 0.42, 14, SNOW_HEX, { y: 1.53, rx: Math.PI / 2, s: [1, 1, 0.75] });
  b.box(0.36, 0.05, 0.03, '#1b1416', { y: 1.3, z: 0.235 });
  b.box(0.62, 0.04, 0.48, PALETTE.gold, { y: 0.88 });
  b.box(0.62, 0.03, 0.48, PALETTE.gold, { y: 1.47 });
  b.box(0.2, 0.2, 0.02, PALETTE.gold, { y: 1.08, z: 0.24, rz: Math.PI / 4 });
  // little sign post
  b.box(0.05, 0.7, 0.05, PALETTE.woodDark, { x: -0.42, y: 1.6, z: 0.05 });
  b.box(0.96, 0.32, 0.05, PALETTE.woodDark, { x: -0.1, y: 2.05, z: 0.05 });
  b.box(0.98, 0.05, 0.12, SNOW_HEX, { x: -0.1, y: 2.23, z: 0.05 });
  b.pop();
  // painted sign
  const tex = textTexture('Lettres au Père Noël', { width: 512, height: 160, background: '#f3ead8', color: '#8b2c2a', border: '#5c3a26', size: 62 });
  const signMat = patchSkyFog(new THREE.MeshLambertMaterial({ map: tex }));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.28), signMat);
  const w = world({ x, z, yaw }, -0.1, 0.08);
  sign.position.set(w.x, kit.heightAt(x, z) + 2.05, w.z);
  sign.rotation.y = yaw;
  sign.name = 'env:mailbox-sign';
  signB.add(sign);
  collideCircle(kit, x, z, 0.42);
  // interaction: post a letter
  try {
    let sent = 0;
    const ctx = kit.ctx;
    const pos = new THREE.Vector3(x, 0, z);
    ctx.interactables.add({
      id: 'env:mailbox',
      position: pos,
      radius: 2.1,
      label: 'Poster une lettre au Père Noël',
      promptHeight: 2.5,
      onInteract: () => {
        sent++;
        try {
          ctx.audio?.sfx('page');
          setTimeout(() => ctx.audio?.sfx('chime'), 350);
        } catch {
          /* ignore */
        }
        const lines = [
          'Ta lettre file vers le Grand Nord… Les lutins la liront ce soir.',
          'Encore une ! Le Père Noël va avoir de la lecture.',
          'Plouf ! La boîte aux lettres est pleine de vœux.',
        ];
        try {
          ctx.ui?.toast(lines[Math.min(sent - 1, lines.length - 1)], { icon: '✉️', duration: 3200 });
        } catch {
          /* ignore */
        }
      },
    });
  } catch {
    /* ignore */
  }
}

// ───────────────────────────── islands in empty chalet slots ─────────────────────────────

type Island = (p: PropCtx, f: Frame) => void;

const islands: Island[] = [
  // decorated pine trio + lantern + gifts
  (p, f) => {
    const a = world(f, -0.95, -0.45);
    const b = world(f, 0.75, -0.75);
    const c = world(f, 0.15, 0.35);
    decoratedPine(p, a.x, a.z, 2.9, { multi: true });
    decoratedPine(p, b.x, b.z, 2.2, { star: false });
    decoratedPine(p, c.x, c.z, 1.5, { star: false, multi: true });
    const l = world(f, 1.35, 0.55);
    groundLantern(p, l.x, l.z);
    const g = world(f, -0.6, 0.75);
    gifts(p, g.x, g.z, 3);
    snowLumps(p, f, 4, 1.6);
  },
  // bench + lamp + small pine
  (p, f) => {
    const s = world(f, -0.25, 0.25);
    bench(p, s.x, s.z, f.yaw);
    const l = world(f, 1.25, 0.25);
    lampInto(p.kit, p.b, { x: l.x, z: l.z, yaw: f.yaw, id: 'isl' }, { wreath: true, delay: 0.1 });
    const t = world(f, -1.2, -0.85);
    decoratedPine(p, t.x, t.z, 2.4, { star: true });
    const t2 = world(f, 0.6, -0.9);
    p.kit.pines.add('cast', t2.x, p.kit.heightAt(t2.x, t2.z), t2.z, 1.7, 1.2, p.r() * TAU);
    snowLumps(p, f, 3, 1.5);
  },
  // gifts & sled
  (p, f) => {
    const s = world(f, -0.35, 0.35);
    sled(p, s.x, s.z, f.yaw + 1.2, { gifts: true });
    const g = world(f, 0.85, 0.1);
    gifts(p, g.x, g.z, 5);
    const t = world(f, -1.0, -0.75);
    decoratedPine(p, t.x, t.z, 2.6, { multi: true });
    const t2 = world(f, 1.1, -0.85);
    p.kit.pines.add('cast', t2.x, p.kit.heightAt(t2.x, t2.z), t2.z, 2.0, 1.4, p.r() * TAU);
    snowLumps(p, f, 3, 1.5);
  },
  // snowman & friends
  (p, f) => {
    const s = world(f, 0.1, 0.2);
    snowman(p, s.x, s.z, f.yaw + (p.r() - 0.5) * 0.6, 1.05);
    const s2 = world(f, -0.95, 0.45);
    snowman(p, s2.x, s2.z, f.yaw + 0.4, 0.62);
    const sl = world(f, 1.15, 0.3);
    sled(p, sl.x, sl.z, f.yaw - 0.5, { blanket: true });
    for (const [lx, lz, h] of [[-1.2, -0.8, 2.3], [0.6, -0.95, 1.8], [-0.2, -1.0, 1.4]]) {
      const t = world(f, lx, lz);
      p.kit.pines.add('cast', t.x, p.kit.heightAt(t.x, t.z), t.z, h, h * 0.7, p.r() * TAU);
    }
    snowLumps(p, f, 4, 1.6);
  },
  // firewood & apples
  (p, f) => {
    const w = world(f, -0.2, -0.55);
    woodpile(p, w.x, w.z, f.yaw);
    const c = world(f, -1.2, 0.45);
    crateOfApples(p, c.x, c.z, f.yaw + 0.3);
    const l = world(f, 0.6, 0.6);
    groundLantern(p, l.x, l.z, 1.1);
    const t = world(f, 1.35, -0.7);
    decoratedPine(p, t.x, t.z, 2.2, { star: false });
    snowLumps(p, f, 3, 1.4);
  },
  // wooden reindeer
  (p, f) => {
    const a = world(f, -0.55, 0.0);
    reindeer(p, a.x, a.z, f.yaw + 0.9, 1.1);
    const b = world(f, 0.55, 0.2);
    reindeer(p, b.x, b.z, f.yaw - 0.7, 0.8);
    const l = world(f, 1.35, 0.6);
    groundLantern(p, l.x, l.z);
    const t = world(f, -1.3, -0.8);
    decoratedPine(p, t.x, t.z, 2.7, { multi: true });
    const t2 = world(f, 0.5, -0.95);
    p.kit.pines.add('cast', t2.x, p.kit.heightAt(t2.x, t2.z), t2.z, 1.9, 1.3, p.r() * TAU);
    snowLumps(p, f, 3, 1.5);
  },
];

// ───────────────────────────── clusters between the zones ─────────────────────────────

type Cluster = (p: PropCtx, f: Frame) => void;
const clusters: Cluster[] = [
  // grove with a lantern
  (p, f) => {
    const n = 3 + Math.floor(p.r() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + p.r();
      const d = 0.9 + p.r() * 1.4;
      const w = world(f, Math.cos(a) * d, Math.sin(a) * d);
      const h = 2.4 + p.r() * 2.8;
      if (!p.kit.blocked(w.x, w.z, 0.9)) {
        p.kit.pines.add('cast', w.x, p.kit.heightAt(w.x, w.z) - 0.05, w.z, h, h * 0.66, p.r() * TAU);
        collideCircle(p.kit, w.x, w.z, h * 0.12 + 0.2);
      }
    }
    const l = world(f, 0.2, 2.3);
    if (!p.kit.blocked(l.x, l.z, 0.4)) groundLantern(p, l.x, l.z, 1.15);
    snowLumps(p, f, 5, 2.4);
  },
  // woodshed corner
  (p, f) => {
    woodpile(p, f.x, f.z, f.yaw);
    const s = world(f, -1.4, 0.9);
    sled(p, s.x, s.z, f.yaw + 0.6);
    const t = world(f, 1.6, -0.6);
    p.kit.pines.add('cast', t.x, p.kit.heightAt(t.x, t.z), t.z, 3.4, 2.3, p.r() * TAU);
    collideCircle(p.kit, t.x, t.z, 0.6);
    snowLumps(p, f, 4, 2);
  },
  // snowman family
  (p, f) => {
    snowman(p, f.x, f.z, f.yaw, 1.2);
    const a = world(f, 0.95, 0.2);
    snowman(p, a.x, a.z, f.yaw - 0.3, 0.85);
    const b = world(f, -0.85, 0.35);
    snowman(p, b.x, b.z, f.yaw + 0.4, 0.55);
    const t = world(f, 0.0, -1.5);
    decoratedPine(p, t.x, t.z, 3.0, { multi: true });
    snowLumps(p, f, 4, 2.2);
  },
  // bench nook under a lamp
  (p, f) => {
    bench(p, f.x, f.z, f.yaw);
    const l = world(f, 1.3, 0.1);
    lampInto(p.kit, p.b, { x: l.x, z: l.z, yaw: f.yaw, id: 'nook' }, { wreath: true });
    const t = world(f, -1.4, -0.6);
    decoratedPine(p, t.x, t.z, 2.8, { star: true });
    const t2 = world(f, 0.2, -1.4);
    p.kit.pines.add('cast', t2.x, p.kit.heightAt(t2.x, t2.z), t2.z, 3.6, 2.4, p.r() * TAU);
    collideCircle(p.kit, t2.x, t2.z, 0.6);
    snowLumps(p, f, 3, 2);
  },
];

export function buildProps(kit: EnvKit, layout: Layout) {
  const b = new MeshBuilder(31);
  const p: PropCtx = { kit, b, r: rng(4242) };
  const signs = new THREE.Group();
  signs.name = 'env:signs';
  kit.root.add(signs);
  const step = (label: string, fn: () => void) => {
    try {
      fn();
    } catch (err) {
      console.error(`[givrelune] props: ${label} failed`, err);
    }
  };
  const innerUsed = layout.stalls.filter((s) => s.ring === 'inner').map((s) => s.angle);
  const innerFree = (a: number, margin = 14 * DEG) => !innerUsed.some((u) => Math.abs(Math.atan2(Math.sin(u - a), Math.cos(u - a))) < margin);

  // lawns between the plaza and the alley: decorated pines on the diagonals, benches facing the tree
  step('lawns', () => {
    const rMid = (layout.plaza.radius + layout.alley.r0) / 2;
    for (let k = 0; k < 4; k++) {
      const a = (45 + k * 90) * DEG;
      if (innerFree(a, 10 * DEG)) {
        const x = Math.sin(a) * rMid;
        const z = Math.cos(a) * rMid;
        decoratedPine(p, x, z, 3.1, { multi: k % 2 === 0 });
        gifts(p, x + Math.sin(a + 0.5) * 0.9, z + Math.cos(a + 0.5) * 0.9, 3);
      }
      for (const off of [-21, 21]) {
        const ab = a + off * DEG;
        if (!innerFree(ab)) continue;
        const r = layout.plaza.radius + 1.2;
        const x = Math.sin(ab) * r;
        const z = Math.cos(ab) * r;
        bench(p, x, z, Math.atan2(-x, -z));
      }
    }
  });

  // the mailbox for letters to Father Christmas, by the south entrance of the plaza
  step('mailbox', () => {
    const a = 12 * DEG;
    const r = 12.9;
    const x = Math.sin(a) * r + 0.6;
    const z = Math.cos(a) * r;
    if (innerFree(a)) mailbox(p, signs, x, z, -Math.PI / 2 + 0.25);
    const s = (-14 * Math.PI) / 180;
    if (innerFree(s)) snowman(p, Math.sin(s) * 12.9 - 0.4, Math.cos(s) * 12.9, Math.PI / 2 - 0.3, 0.9);
  });

  // empty chalet slots become little cosy islands
  step('islands', () => {
    const r = rng(99);
    let last = -1;
    layout.freeSlots.forEach((slot: StallSlot) => {
      let i = Math.floor(r() * islands.length);
      if (i === last) i = (i + 1) % islands.length;
      last = i;
      const f: Frame = { x: slot.position.x, z: slot.position.z, yaw: slot.rotationY };
      islands[i](p, f);
    });
  });

  // between the zones, behind the chalets
  step('clusters', () => {
    const r = rng(7);
    let ci = 0;
    for (let k = 0; k < 8; k++) {
      const a = (22.5 + k * 45) * DEG;
      for (const rad of [32.5, 41]) {
        for (let tries = 0; tries < 6; tries++) {
          const aa = a + (r() - 0.5) * 8 * DEG;
          const rr = rad + (r() - 0.5) * 2;
          const x = Math.sin(aa) * rr;
          const z = Math.cos(aa) * rr;
          if (kit.blocked(x, z, 2.2) || !kit.occupancy.free(x, z, 2.5)) continue;
          const f: Frame = { x, z, yaw: Math.atan2(-x, -z) + (r() - 0.5) * 0.5 };
          clusters[ci++ % clusters.length](p, f);
          break;
        }
      }
    }
  });

  addMerged(kit, b.build(), kit.mats.lambert, 'env:props', { cast: true, receive: true });
}
