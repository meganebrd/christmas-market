import * as THREE from 'three';
import type { GameContext } from '../../core/contracts';
import { PALETTE as P } from '../palette';
import { glowSprite } from '../textures';
import { Halos, Particles, raysTexture, duskEnv } from './fx';
import { BOX, CONE, CYL, SPH, TOR, Kit, T, cyl, lathe, mul, poolMat, rng, tube, type Anchors } from './kit';
import { SNOW, SNOW_SHADE, gift } from './props';

/**
 * Le Grand Sapin — a ~14 m stylised fir in the middle of the plaza.
 * 7 snowy tiers, 7 star sockets (one per tier), two spiral garlands of bulbs that light up band by band
 * (bottom → top) as the glass stars are found, a golden bead garland, baubles, gifts and a fence ring.
 */

interface Tier {
  yb: number;
  R: number;
  apex: number;
  rot: number;
}

const N_TIERS = 7;
const TIERS: Tier[] = Array.from({ length: N_TIERS }, (_, i) => {
  const yb = 1.05 + i * 1.6;
  const R = 3.05 - i * 0.36;
  const H = R * 1.1 + i * 0.27;
  return { yb, R, apex: yb + H, rot: i * 0.7 };
});
const TOP_Y = TIERS[N_TIERS - 1].apex + 0.62;
const EXP = 1.12;

/** Point on the (average) surface of a tier: t = 0 apex → 1 edge, a = compass angle. */
function surf(tier: Tier, t: number, a: number, out = 0): THREE.Vector3 {
  const r = t * tier.R * 0.92 + out;
  const y = tier.apex - (tier.apex - tier.yb) * Math.pow(t, EXP);
  return new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);
}

/** Outer radius of the tree at height y. */
function envelope(y: number): number {
  let best = 0;
  for (const t of TIERS) {
    if (y > t.apex || y < t.yb - 0.1) continue;
    const f = Math.pow(Math.max(0, Math.min(1, (t.apex - y) / (t.apex - t.yb))), 1 / EXP);
    best = Math.max(best, f * t.R * 0.92);
  }
  return best;
}

const cA = new THREE.Color();
const cB = new THREE.Color();

function tierGeometry(tier: Tier, seed: number) {
  const r = rng(seed);
  const S = 26;
  const J = 4;
  const ang: number[] = [];
  const eR: number[] = [];
  const eY: number[] = [];
  for (let s = 0; s < S; s++) {
    const tip = s % 2 === 0;
    ang.push(tier.rot + (s / S) * Math.PI * 2 + (r() - 0.5) * 0.06);
    eR.push(tier.R * (tip ? 1.0 + (r() - 0.5) * 0.08 : 0.85 + r() * 0.04));
    eY.push(tier.yb + (tip ? -0.15 - r() * 0.1 : 0.08 + r() * 0.05));
  }
  const dark = new THREE.Color(P.pineDark);
  const mid = new THREE.Color(P.pine);
  const light = new THREE.Color(P.pineLight);

  // ── top surface (smooth)
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  pos.push(0, tier.apex, 0);
  col.push(dark.r, dark.g, dark.b);
  for (let j = 1; j <= J; j++) {
    const t = j / J;
    for (let s = 0; s < S; s++) {
      const rr = t * eR[s];
      const y = tier.apex - (tier.apex - eY[s]) * Math.pow(t, EXP);
      pos.push(Math.sin(ang[s]) * rr, y, Math.cos(ang[s]) * rr);
      cA.copy(dark).lerp(mid, Math.min(1, t * 1.4));
      if (j === J && s % 2 === 0) cA.lerp(light, 0.55);
      cA.multiplyScalar(0.92 + r() * 0.16);
      col.push(cA.r, cA.g, cA.b);
    }
  }
  const ring = (j: number, s: number) => 1 + (j - 1) * S + (((s % S) + S) % S);
  for (let s = 0; s < S; s++) idx.push(0, ring(1, s), ring(1, s + 1));
  for (let j = 2; j <= J; j++)
    for (let s = 0; s < S; s++) {
      const a = ring(j - 1, s);
      const b = ring(j - 1, s + 1);
      const c = ring(j, s);
      const d = ring(j, s + 1);
      idx.push(a, c, d, a, d, b);
    }
  // underside: edge ring → inner ring near the trunk
  const u0 = pos.length / 3;
  for (let s = 0; s < S; s++) {
    const rr = eR[s];
    pos.push(Math.sin(ang[s]) * rr, eY[s] - 0.01, Math.cos(ang[s]) * rr);
    cA.copy(dark).multiplyScalar(0.75);
    col.push(cA.r, cA.g, cA.b);
  }
  const u1 = pos.length / 3;
  for (let s = 0; s < S; s++) {
    pos.push(Math.sin(ang[s]) * 0.35, tier.yb + 0.55, Math.cos(ang[s]) * 0.35);
    cA.copy(dark).multiplyScalar(0.45);
    col.push(cA.r, cA.g, cA.b);
  }
  for (let s = 0; s < S; s++) {
    const a = u0 + s;
    const b = u0 + ((s + 1) % S);
    const c = u1 + s;
    const d = u1 + ((s + 1) % S);
    idx.push(a, d, c, a, b, d);
  }
  const top = new THREE.BufferGeometry();
  top.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  top.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  top.setIndex(idx);
  top.computeVertexNormals();

  // ── snow shell on the upper part, wavy lower edge
  const sp: number[] = [];
  const sc: number[] = [];
  const si: number[] = [];
  const JS = 3;
  const snowT: number[] = [];
  for (let s = 0; s < S; s++) snowT.push(0.64 + 0.06 * Math.sin(s * 0.9 + seed) + 0.035 * Math.sin(s * 2.3 + seed * 3) + (s % 2 === 0 ? -0.04 : 0.06));
  const white = new THREE.Color(SNOW);
  const shade = new THREE.Color(SNOW_SHADE);
  sp.push(0, tier.apex + 0.07, 0);
  sc.push(white.r, white.g, white.b);
  for (let j = 1; j <= JS; j++) {
    for (let s = 0; s < S; s++) {
      const t = (j / JS) * snowT[s];
      const rr = t * eR[s] + 0.03 + (j === JS ? 0.03 : 0);
      const y = tier.apex - (tier.apex - eY[s]) * Math.pow(t, EXP) + 0.075 - (j === JS ? 0.04 : 0);
      sp.push(Math.sin(ang[s]) * rr, y, Math.cos(ang[s]) * rr);
      cB.copy(white).lerp(shade, j === JS ? 0.55 : r() * 0.2);
      sc.push(cB.r, cB.g, cB.b);
    }
  }
  const sr = (j: number, s: number) => 1 + (j - 1) * S + (((s % S) + S) % S);
  for (let s = 0; s < S; s++) si.push(0, sr(1, s), sr(1, s + 1));
  for (let j = 2; j <= JS; j++)
    for (let s = 0; s < S; s++) {
      const a = sr(j - 1, s);
      const b = sr(j - 1, s + 1);
      const c = sr(j, s);
      const d = sr(j, s + 1);
      si.push(a, c, d, a, d, b);
    }
  const snow = new THREE.BufferGeometry();
  snow.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  snow.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
  snow.setIndex(si);
  snow.computeVertexNormals();
  return { top, snow };
}

/** Faceted 5-point star (bipyramid), facing +Z. */
function facetedStar(R: number, r: number, depth: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const rim: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r : R;
    rim.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  for (let i = 0; i < 10; i++) {
    const [x0, y0] = rim[i];
    const [x1, y1] = rim[(i + 1) % 10];
    pos.push(0, 0, depth, x0, y0, 0, x1, y1, 0);
    pos.push(0, 0, -depth, x1, y1, 0, x0, y0, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function flatStar(R: number, r: number, depth: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r : R;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.6, bevelSize: R * 0.08, bevelSegments: 1 });
  g.translate(0, 0, -depth / 2);
  return g;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface TreeHandle {
  setLight(p: number): void;
  treeTop: THREE.Vector3;
  /** World positions of the 7 glass-star sockets, in lighting order (bottom tier → top). */
  starSockets: THREE.Vector3[];
  update(dt: number, t: number): void;
}

export function buildTree(ctx: GameContext, anchors: Anchors, usePointLight: boolean): TreeHandle {
  const group = new THREE.Group();
  group.name = 'grand-sapin';
  ctx.scene.add(group);
  const kit = new Kit(ctx);
  const detail = ctx.quality.detail;

  // ── trunk, snow bed, tiers
  kit.body.add(cyl(0.26, 0.42, 5.2, 10), P.woodDark, T(0, 2.6, 0));
  kit.body.add(cyl(0.42, 0.66, 0.34, 10), '#4a2f1f', T(0, 0.17, 0));
  kit.body.add(
    lathe(
      [
        [0.001, 0.15],
        [1.4, 0.14],
        [2.6, 0.1],
        [3.15, 0.05],
        [3.3, 0],
      ],
      28,
    ),
    SNOW,
  );
  TIERS.forEach((tier, i) => {
    const g = tierGeometry(tier, 11 + i * 7);
    kit.body.add(g.top, null);
    kit.body.add(g.snow, null);
  });

  // ── fence ring
  const FR = 3.32;
  const posts = 30;
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2;
    const x = Math.sin(a) * FR;
    const z = Math.cos(a) * FR;
    kit.body.add(BOX(), i % 2 ? '#a87b52' : '#9b6e47', T(x, 0.36, z, 0, a, 0, 0.1, 0.72, 0.1));
    kit.body.add(CONE(4), '#8a5f3d', T(x, 0.77, z, 0, a + Math.PI / 4, 0, 0.08, 0.1, 0.08));
    kit.body.add(SPH(6, 4), SNOW, T(x, 0.8, z, 0, 0, 0, 0.06, 0.035, 0.06));
    if (i % 5 === 0) {
      kit.body.add(SPH(6, 4), P.berry, T(x * 1.03, 0.56, z * 1.03, 0, 0, 0, 0.05));
      kit.body.add(TOR(1, 0.35, 4, 8), P.berry, T(x * 1.03 - Math.cos(a) * 0.06, 0.58, z * 1.03 + Math.sin(a) * 0.06, 0, a + Math.PI / 2, 0.6, 0.05));
      kit.body.add(TOR(1, 0.35, 4, 8), P.berry, T(x * 1.03 + Math.cos(a) * 0.06, 0.58, z * 1.03 - Math.sin(a) * 0.06, 0, a + Math.PI / 2, -0.6, 0.05));
    }
  }
  for (const y of [0.3, 0.58]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.sin(a) * (FR + 0.06), y, Math.cos(a) * (FR + 0.06)));
    }
    kit.body.add(tube(pts, 0.035, 4, true), y > 0.5 ? '#7a5234' : '#6a4630');
    if (y > 0.5) {
      kit.body.add(tube(pts.map((p) => p.clone().setY(y + 0.045)), 0.026, 4, true), SNOW);
      kit.body.add(tube(pts.map((p, k) => p.clone().multiplyScalar(1.012).setY(y - 0.035 - Math.abs(Math.sin(k * 0.52)) * 0.09)), 0.035, 4, true), P.holly);
    }
  }

  // ── gifts
  const rg = rng(4242);
  const giftColors: [string, string][] = [
    [P.berry, P.gold],
    [P.green, P.cream],
    [P.gold, P.redDark],
    [P.cream, P.berry],
    [P.blue, P.gold],
    [P.plum, P.cream],
    ['#d0574a', '#f3ead8'],
  ];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rg() * 0.3;
    const rr = 1.1 + rg() * 1.75;
    const w = 0.34 + rg() * 0.4;
    const h = 0.28 + rg() * 0.38;
    const d = 0.34 + rg() * 0.34;
    const [c1, c2] = giftColors[i % giftColors.length];
    gift(kit, T(Math.sin(a) * rr, 0.1, Math.cos(a) * rr, 0, rg() * 3, 0), w, h, d, c1, c2);
    if (i % 4 === 1) gift(kit, T(Math.sin(a) * rr, 0.1 + h, Math.cos(a) * rr, 0, rg() * 3, 0), w * 0.6, h * 0.6, d * 0.6, c2 === P.gold ? P.green : P.gold, P.berry);
  }

  // ── golden bead garland: festoons around every tier
  TIERS.forEach((tier, i) => {
    const pts: THREE.Vector3[] = [];
    const swags = Math.max(5, Math.round(tier.R * 2.6));
    const n = swags * 5;
    for (let k = 0; k <= n; k++) {
      const a = tier.rot * 1.3 + (k / n) * Math.PI * 2;
      const f = (k % 5) / 5;
      const p = surf(tier, 0.9, a, 0.08);
      p.y -= Math.sin(f * Math.PI) * 0.22;
      const rr = Math.hypot(p.x, p.z) - Math.sin(f * Math.PI) * 0.05;
      p.x = Math.sin(a) * rr;
      p.z = Math.cos(a) * rr;
      pts.push(p);
    }
    kit.glow.add(tube(pts, 0.02, 4, true), '#e8b85a', undefined, 0.55);
  });

  // ── baubles (instanced, glossy)
  const nb = Math.round(54 * Math.max(0.6, detail));
  const rb = rng(777);
  const bauble = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    (() => {
      const m = new THREE.MeshStandardMaterial({ roughness: 0.22, metalness: 0.35 });
      const env = duskEnv(ctx.renderer);
      if (env) {
        m.envMap = env;
        m.envMapIntensity = 1.3;
      }
      return m;
    })(),
    nb,
  );
  bauble.name = 'tree-baubles';
  const bColors = [P.berry, P.gold, '#3f66a8', P.cream, '#a8324a', '#c9a227', '#7b4f9a', '#c0392b'];
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < nb; i++) {
    const ti = Math.min(N_TIERS - 1, Math.floor(Math.pow(rb(), 1.25) * N_TIERS));
    const tier = TIERS[ti];
    const a = rb() * Math.PI * 2;
    const t = 0.8 + rb() * 0.16;
    const p = surf(tier, t, a, 0.1);
    p.y -= 0.12;
    const s = (0.12 + rb() * 0.07) * (1 - ti * 0.05);
    mtx.makeScale(s, s, s).setPosition(p);
    bauble.setMatrixAt(i, mtx);
    bauble.setColorAt(i, cA.set(bColors[i % bColors.length]));
    kit.metal.add(CYL(6), P.gold, T(p.x, p.y + s * 0.95, p.z, 0, 0, 0, s * 0.3, s * 0.3, s * 0.3));
  }
  bauble.instanceMatrix.needsUpdate = true;
  bauble.computeBoundingSphere();
  bauble.castShadow = false;
  group.add(bauble);

  // ── star sockets: little golden star-shaped frames where the found glass stars will hang
  const socketFrame = (() => {
    const star = (R: number, r: number) => {
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r : R;
        pts.push(new THREE.Vector2(Math.cos(a) * rr, Math.sin(a) * rr));
      }
      return pts;
    };
    const shape = new THREE.Shape(star(0.29, 0.13));
    shape.holes.push(new THREE.Path(star(0.22, 0.095).reverse()));
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false });
    g.translate(0, 0, -0.015);
    return g;
  })();
  const socketAngles = [-0.45, 0.95, -1.4, 1.55, -0.05, 0.55, -0.75];
  const socketT = [0.86, 0.84, 0.84, 0.82, 0.8, 0.78, 0.7];
  const sockets: { p: THREE.Vector3; q: THREE.Quaternion }[] = [];
  TIERS.forEach((tier, i) => {
    const a = socketAngles[i];
    const p = surf(tier, socketT[i], a, 0.22);
    p.y -= 0.02;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.32, a, 0, 'YXZ'));
    sockets.push({ p, q });
    const m = new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1));
    kit.glow.add(socketFrame, '#e8b85a', mul(m, T(0, 0, -0.035)), 0.5);
    kit.metal.add(SPH(6, 4), '#f2c75c', mul(m, T(0, 0.26, -0.02, 0, 0, 0, 0.04)));
    // little holly sprig under the socket
    kit.body.add(SPH(6, 4), P.holly, mul(m, T(-0.12, -0.3, -0.05, 0, 0, 0.5, 0.1, 0.04, 0.05)));
    kit.body.add(SPH(6, 4), P.holly, mul(m, T(0.12, -0.3, -0.05, 0, 0, -0.5, 0.1, 0.04, 0.05)));
    kit.body.add(SPH(6, 4), P.berry, mul(m, T(0, -0.29, 0, 0, 0, 0, 0.04)));
  });
  const glassStars = new THREE.InstancedMesh(flatStar(0.2, 0.085, 0.04), new THREE.MeshBasicMaterial({ color: '#ffffff' }), N_TIERS);
  glassStars.name = 'tree-glass-stars';
  // hidden stars keep their socket position (scale 0): the story reads these positions
  for (let i = 0; i < N_TIERS; i++) {
    glassStars.setMatrixAt(i, new THREE.Matrix4().compose(sockets[i].p, sockets[i].q, new THREE.Vector3(0, 0, 0)));
    glassStars.setColorAt(i, cA.set('#e8f4ff'));
  }
  glassStars.frustumCulled = false;
  group.add(glassStars);
  const socketHalos = new Halos(
    sockets.map((s) => ({ pos: s.p, color: '#bfe0ff', size: 1.1, k: 0 })),
    { twinkle: 0.35 },
  );
  group.add(socketHalos.mesh);

  // ── spiral garlands (two strands, bulbs only)
  const spacing = detail >= 0.9 ? 0.3 : detail >= 0.7 ? 0.36 : 0.48;
  interface BulbInfo {
    p: THREE.Vector3;
    band: number;
    phase: number;
    white: boolean;
  }
  const bulbs: BulbInfo[] = [];
  for (const strand of [0, 1]) {
    const y0 = 1.25;
    const y1 = TOP_Y - 1.1;
    const turns = 4.6;
    const steps = 2400;
    let acc = spacing * 0.5;
    let prev: THREE.Vector3 | null = null;
    for (let k = 0; k <= steps; k++) {
      const s = k / steps;
      const theta = strand * Math.PI + s * turns * Math.PI * 2;
      let y = y0 + s * (y1 - y0);
      const sw = ((theta / (Math.PI * 2)) * 6) % 1;
      y -= Math.sin(sw * Math.PI) * 0.2;
      const rr = envelope(y) * 0.97 + 0.05;
      if (rr < 0.1) continue;
      const p = new THREE.Vector3(Math.sin(theta) * rr, y, Math.cos(theta) * rr);
      if (prev) acc += p.distanceTo(prev);
      prev = p;
      if (acc >= spacing) {
        acc -= spacing;
        const band = Math.min(N_TIERS - 1, Math.max(0, Math.floor(((y - 0.9) / (TOP_Y - 1.4)) * N_TIERS)));
        bulbs.push({ p, band, phase: Math.random(), white: Math.random() < 0.18 });
      }
    }
  }
  const bulbMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: '#ffffff' }), bulbs.length);
  bulbMesh.name = 'tree-garland';
  bulbs.forEach((b, i) => {
    mtx.makeScale(0.06, 0.075, 0.06).setPosition(b.p);
    bulbMesh.setMatrixAt(i, mtx);
    bulbMesh.setColorAt(i, cA.set(P.warm));
  });
  bulbMesh.instanceMatrix.needsUpdate = true;
  bulbMesh.computeBoundingSphere();
  group.add(bulbMesh);
  const haloIdx: number[] = [];
  const bulbHalos = new Halos(
    bulbs
      .map((b, i) => ({ b, i }))
      .filter((_, k) => k % 3 === 0)
      .map(({ b, i }) => {
        haloIdx.push(i);
        return { pos: b.p, color: P.warm, size: 0.55, k: 0.2, twinkle: 0.6 };
      }),
    { twinkle: 0 },
  );
  group.add(bulbHalos.mesh);

  // ── top star
  const topMat = new THREE.MeshLambertMaterial({ color: '#c99a3c', emissive: new THREE.Color('#ffc75a'), emissiveIntensity: 0, flatShading: true });
  const topStar = new THREE.Mesh(facetedStar(0.78, 0.33, 0.24), topMat);
  topStar.name = 'tree-top-star';
  topStar.position.set(0, TOP_Y, 0);
  group.add(topStar);
  kit.metal.add(SPH(8, 6), P.gold, T(0, TOP_Y - 0.72, 0, 0, 0, 0, 0.12));
  kit.metal.add(cyl(0.035, 0.06, 0.5, 6), P.gold, T(0, TOP_Y - 0.5, 0));
  const rays = new THREE.Sprite(new THREE.SpriteMaterial({ map: raysTexture(), color: '#ffe0a0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  rays.position.copy(topStar.position);
  rays.scale.setScalar(5.5);
  rays.renderOrder = 4;
  rays.visible = false;
  group.add(rays);
  const topHalo = glowSprite(P.warm, 4, 0);
  topHalo.position.copy(topStar.position);
  topHalo.renderOrder = 4;
  topHalo.visible = false;
  group.add(topHalo);

  // ── warm light pool on the plaza
  const poolM = poolMat();
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), poolM);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.03;
  pool.name = 'tree-pool';
  group.add(pool);
  const poolColor = new THREE.Color(P.warm2);

  // ── finale FX
  const rings: Halos[] = [];
  for (let k = 0; k < 3; k++) {
    const pts: THREE.Vector3[] = [];
    const n = 44;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.sin(a), 0, Math.cos(a)));
    }
    const h = new Halos(
      pts.map((p) => ({ pos: p, color: k === 1 ? '#fff1c8' : P.warm, size: 0.9, k: 1 })),
      {},
    );
    h.level = 0;
    h.mesh.frustumCulled = false;
    rings.push(h);
    group.add(h.mesh);
  }
  const burst = new Particles([new THREE.Vector3(0, TOP_Y, 0)], {
    count: Math.round(180 * Math.max(0.5, detail)),
    life: 3.2,
    vel: [0, 0.6, 0],
    spread: 7,
    gravity: 1.6,
    size: [0.32, 0.12],
    color: ['#fff3c9', P.warm2],
    additive: true,
    sharp: 7,
    burst: true,
  });
  burst.mesh.frustumCulled = false;
  group.add(burst.mesh);

  kit.finish(group, 'tree');

  // ── point light
  let light: THREE.PointLight | null = null;
  if (usePointLight) {
    light = new THREE.PointLight('#ffb35c', 0, 34, 1.15);
    light.position.set(0, TOP_Y + 1.3, 1.2);
    light.name = 'tree-light';
    group.add(light);
  }


  // ── anchors on the plaza
  anchors.set('plaza:tree-front', { position: new THREE.Vector3(0, 0, 5.4), yaw: Math.PI });
  anchors.set('plaza:guide', { position: new THREE.Vector3(-2.3, 0, 5.8), yaw: Math.atan2(0.35, 1) });
  anchors.set('plaza:musician', { position: new THREE.Vector3(6.2, 0, 3.6), yaw: Math.atan2(-6.2, 1.2) });

  // ── state
  let target = 0;
  let current = 0;
  let waveK = 1;
  let started = false;
  let dirty = true;
  const starK = new Array(N_TIERS).fill(0);
  let finale: { t: number; burst: boolean } | null = null;
  let flash = 0;

  ctx.lights.register({
    position: { x: 0, y: 4, z: 0 },
    group: 'tree',
    set: (k) => {
      waveK = k;
      dirty = true;
    },
  });

  ctx.events.on('finale:start', () => {
    finale = { t: 0, burst: false };
    target = Math.max(target, current);
  });

  const warm = new THREE.Color(P.warm);
  const white = new THREE.Color('#fff4dc');
  const cold = new THREE.Color('#cfe8ff');
  const sq = new THREE.Quaternion();
  const sv = new THREE.Vector3();

  const update = (dt: number, t: number) => {
    started = true;
    const rate = 0.2;
    if (current !== target) {
      const d = target - current;
      current += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
      dirty = true;
    }
    const blaze = smooth(6 / 7 + 0.02, 1, current);

    // finale cascade
    let ringY0 = -10;
    if (finale) {
      finale.t += dt;
      const ft = finale.t;
      for (let k = 0; k < 3; k++) {
        const y = 0.6 + Math.max(0, ft - k * 0.42) * 4.4;
        if (k === 0) ringY0 = y;
        const on = ft > k * 0.42 && y < TOP_Y + 0.4;
        const ring = rings[k];
        if (on) {
          const R = envelope(Math.min(y, TOP_Y - 0.8)) + 0.45;
          ring.mesh.position.y = y;
          ring.mesh.scale.set(Math.max(0.35, R), 1, Math.max(0.35, R));
          ring.level = 1.6 - k * 0.35;
        } else ring.level = 0;
      }
      if (!finale.burst && ringY0 >= TOP_Y) {
        finale.burst = true;
        burst.fire(3.4);
        flash = 1;
        target = current = 1;
      }
      if (ft > 8) {
        finale = null;
        for (const r of rings) r.level = 0;
      }
      dirty = true;
    }
    if (flash > 0) {
      flash = Math.max(0, flash - dt * 0.45);
      dirty = true;
    }

    // stars in their sockets (pop with a little overshoot)
    for (let i = 0; i < N_TIERS; i++) {
      const want = current >= (i + 1) / N_TIERS - 0.002 || (finale && ringY0 > sockets[i].p.y) ? 1 : 0;
      if (starK[i] !== want) {
        starK[i] += Math.sign(want - starK[i]) * Math.min(Math.abs(want - starK[i]), dt * 1.4);
        const k = starK[i];
        const c1 = 2.2;
        const s = k <= 0 ? 0 : k >= 1 ? 1 : 1 + (c1 + 1) * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
        mtx.compose(sockets[i].p, sq.copy(sockets[i].q), sv.setScalar(Math.max(0, s)));
        glassStars.setMatrixAt(i, mtx);
        glassStars.instanceMatrix.needsUpdate = true;
        dirty = true;
      }
    }

    if (!dirty && blaze <= 0) {
      topStar.rotation.y += dt * 0.25;
      return;
    }
    dirty = false;

    // bulbs
    for (let i = 0; i < bulbs.length; i++) {
      const b = bulbs[i];
      const lit = smooth(b.band / N_TIERS + 0.015, (b.band + 1) / N_TIERS, current);
      let v = 0.2 + 0.55 * lit;
      let bz = blaze;
      if (finale && b.p.y < ringY0) bz = 1;
      if (bz > 0) {
        const tw = 0.5 + 0.5 * Math.sin(t * (1.6 + b.phase * 2.4) + b.phase * 30);
        v = Math.max(v, 0.75) + bz * (0.08 + 0.32 * tw * tw);
      }
      v *= waveK;
      if (finale) {
        for (let k = 0; k < 3; k++) {
          const ry = 0.6 + Math.max(0, finale.t - k * 0.42) * 4.4;
          const d = (b.p.y - ry) / 0.8;
          v += Math.exp(-d * d) * (1.8 - k * 0.4);
        }
      }
      cA.copy(b.white ? white : warm).lerp(white, Math.min(1, Math.max(0, v - 1) * 0.5));
      cA.multiplyScalar(v * 2.7);
      bulbMesh.setColorAt(i, cA);
    }
    if (bulbMesh.instanceColor) bulbMesh.instanceColor.needsUpdate = true;
    haloIdx.forEach((bi, k) => {
      const b = bulbs[bi];
      const lit = smooth(b.band / N_TIERS + 0.015, (b.band + 1) / N_TIERS, current);
      bulbHalos.setOne(k, waveK * (0.06 + 0.3 * lit + 0.08 * blaze));
    });
    bulbHalos.uniforms.uTwinkle.value = blaze;

    // glass stars glow
    for (let i = 0; i < N_TIERS; i++) {
      const k = Math.min(1, starK[i]);
      const pulse = 0.85 + 0.15 * Math.sin(t * 2.2 + i * 1.7);
      cA.copy(cold).multiplyScalar(k * (2.2 + blaze * 0.8) * pulse);
      glassStars.setColorAt(i, cA);
      socketHalos.setOne(i, k * (0.42 + 0.14 * pulse) * (1 + blaze * 0.3));
    }
    if (glassStars.instanceColor) glassStars.instanceColor.needsUpdate = true;

    // top star
    const topK = smooth(6 / 7 - 0.02, 1, current);
    topMat.emissiveIntensity = 0.03 + topK * (1.5 + 0.3 * Math.sin(t * 2.5)) + flash * 5;
    topStar.rotation.y += dt * (0.25 + flash * 3);
    const rm = rays.material as THREE.SpriteMaterial;
    rm.opacity = Math.min(1, topK * 0.5 + flash);
    rm.rotation += dt * 0.12;
    rays.visible = rm.opacity > 0.01;
    rays.scale.setScalar(5.2 + Math.sin(t * 1.7) * 0.35 + flash * 9);
    const hm = topHalo.material as THREE.SpriteMaterial;
    hm.opacity = Math.min(1, topK * 0.2 + flash * 0.8);
    topHalo.visible = hm.opacity > 0.01;
    topHalo.scale.setScalar(4 + flash * 14);

    // ambient light of the tree
    const glowK = waveK * (0.25 + 0.75 * current) + flash * 0.8;
    poolM.color.copy(poolColor).multiplyScalar(0.07 + 0.28 * glowK);
    if (light) light.intensity = (4 + 20 * current + 50 * flash) * waveK;
  };

  const setLight = (p: number) => {
    const v = Math.max(0, Math.min(1, Number.isFinite(p) ? p : 0));
    target = v;
    if (!started || ctx.mode === 'loading' || ctx.mode === 'title') {
      current = v;
      for (let i = 0; i < N_TIERS; i++) {
        const want = v >= (i + 1) / N_TIERS - 0.002 ? 1 : 0;
        starK[i] = want;
        mtx.compose(sockets[i].p, sockets[i].q, sv.setScalar(want));
        glassStars.setMatrixAt(i, mtx);
      }
      glassStars.instanceMatrix.needsUpdate = true;
    }
    dirty = true;
  };

  update(0, 0);
  started = false;
  group.updateMatrixWorld(true);
  const starSockets = sockets.map((s) => s.p.clone().applyMatrix4(group.matrixWorld));
  return { setLight, treeTop: new THREE.Vector3(0, TOP_Y, 0), starSockets, update };
}
