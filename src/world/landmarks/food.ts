import * as THREE from 'three';
import { PALETTE as P } from '../palette';
import type { LandmarkEnv } from './index';
import { BOX, CONE, CYL, SPH, TOR, Bucket, Frame, Kit, T, catenary, cyl, emitter, lathe, metalMat, mul, pt, rng, tube } from './kit';
import { IRON, SNOW, crate, gableRoof, gableWall, lantern, lump, mug, plankWall, setSignLevel, signBoard, signMesh, snowMound, stringLights } from './props';

/**
 * Le Coin Gourmand — a crêpe stand, a gingerbread stand that looks like a gingerbread house
 * (with hanging iced hearts swaying in the wind), a chestnut-roasting cart and picnic tables.
 * Frame: local +Z faces the plaza.
 */

function heartShape(s: number) {
  const h = new THREE.Shape();
  h.moveTo(0, -0.5 * s);
  h.bezierCurveTo(0.15 * s, -0.32 * s, 0.55 * s, -0.12 * s, 0.5 * s, 0.18 * s);
  h.bezierCurveTo(0.46 * s, 0.45 * s, 0.12 * s, 0.5 * s, 0, 0.26 * s);
  h.bezierCurveTo(-0.12 * s, 0.5 * s, -0.46 * s, 0.45 * s, -0.5 * s, 0.18 * s);
  h.bezierCurveTo(-0.55 * s, -0.12 * s, -0.15 * s, -0.32 * s, 0, -0.5 * s);
  return h;
}

/** A small market booth: plank walls, open counter front, gable roof. Returns the counter top y. */
function booth(
  kit: Kit,
  f: Frame,
  x: number,
  z: number,
  w: number,
  d: number,
  o: { wall: string; roof: string; post: string; seed: number; interior: string },
) {
  const H = 2.15;
  const front = z + d / 2;
  const back = z - d / 2;
  plankWall(kit, T(x, 0, back + 0.04), w, H, o.wall, o.seed);
  plankWall(kit, T(x - w / 2 + 0.04, 0, z, 0, Math.PI / 2, 0), d, H, o.wall, o.seed + 1);
  plankWall(kit, T(x + w / 2 - 0.04, 0, z, 0, Math.PI / 2, 0), d, H, o.wall, o.seed + 2);
  for (const sx of [-1, 1]) gableWall(kit, T(x + sx * (w / 2 - 0.04), H, z, 0, Math.PI / 2, 0), d + 0.1, 0.72, o.wall, 0.08);
  plankWall(kit, T(x, 0, front - 0.02), w, 0.9, o.wall, o.seed + 3);
  for (const sx of [-1, 1]) kit.body.add(BOX(), o.post, T(x + sx * (w / 2 - 0.07), H / 2, front, 0, 0, 0, 0.14, H, 0.14));
  kit.body.add(BOX(), o.post, T(x, H - 0.1, front, 0, 0, 0, w, 0.2, 0.16));
  kit.body.add(BOX(), '#c9a27a', T(x, 0.93, front + 0.14, 0, 0, 0, w + 0.06, 0.06, 0.6));
  kit.lit.add(BOX(), o.interior, T(x, 1.4, back + 0.1, 0, 0, 0, w - 0.3, 1.5, 0.02), 0.28);
  gableRoof(kit, T(x, H, z), w, d, 0.72, { color: o.roof, overhang: 0.32, seed: o.seed });
  f.box(x, back + 0.06, w / 2, 0.1, 0, 'chalet');
  f.box(x - w / 2 + 0.06, z, 0.1, d / 2, 0, 'chalet');
  f.box(x + w / 2 - 0.06, z, 0.1, d / 2, 0, 'chalet');
  f.box(x, front + 0.1, w / 2, 0.32, 0, 'chalet');
  return { top: 0.96, front, back, H, eaveY: H - (0.72 * 0.32) / (d / 2), eaveZ: front + 0.32 };
}

export function buildFood(env: LandmarkEnv, f: Frame) {
  const { ctx } = env;
  const kit = new Kit(ctx);
  const r = rng(225);

  // ───────── crêpe stand
  const CX = -2.55;
  const CZ = -4.3;
  const cb = booth(kit, f, CX, CZ, 3.0, 1.9, { wall: '#c79a6a', roof: '#6b3b33', post: P.woodDark, seed: 11, interior: '#ffb878' });
  // blue & cream valance
  for (let i = 0; i < 12; i++) {
    const x = CX - 1.8 + (i + 0.5) * (3.6 / 12);
    const c = i % 2 ? P.cream : '#3c5a8a';
    kit.body.add(BOX(), c, T(x, cb.eaveY - 0.07, cb.eaveZ - 0.02, 0, 0, 0, 3.6 / 12, 0.14, 0.02));
    kit.body.add(CYL(10), c, T(x, cb.eaveY - 0.14, cb.eaveZ - 0.02, Math.PI / 2, 0, 0, 3.6 / 24, 0.02, 3.6 / 24));
  }
  // griddles (billigs)
  const gx = [CX - 0.55, CX + 0.25];
  for (const x of gx) {
    kit.metal.add(BOX(), '#3a3438', T(x, cb.top + 0.06, cb.front + 0.12, 0, 0, 0, 0.5, 0.1, 0.46));
    kit.metal.add(cyl(0.23, 0.23, 0.03, 20), '#2a2628', T(x, cb.top + 0.125, cb.front + 0.12));
    kit.glow.add(TOR(1, 0.04, 4, 24), '#ff6a2a', T(x, cb.top + 0.108, cb.front + 0.12, Math.PI / 2, 0, 0, 0.235), 0.9);
  }
  kit.body.add(cyl(0.2, 0.2, 0.006, 20), '#e8b86a', T(gx[0], cb.top + 0.143, cb.front + 0.12));
  kit.body.add(cyl(0.12, 0.12, 0.004, 14), '#d9a250', T(gx[0] + 0.03, cb.top + 0.147, cb.front + 0.1));
  // wooden spreader & spatula
  kit.body.add(BOX(), '#b08458', T(gx[1] + 0.05, cb.top + 0.15, cb.front + 0.3, 0, 0.6, 0, 0.3, 0.012, 0.03));
  kit.body.add(BOX(), '#b08458', T(gx[1] - 0.1, cb.top + 0.15, cb.front + 0.32, 0, -0.3, 0, 0.18, 0.012, 0.012));
  // batter bowl + ladle
  const bowlX = CX + 0.95;
  kit.body.add(
    lathe(
      [
        [0.001, 0],
        [0.1, 0],
        [0.17, 0.06],
        [0.2, 0.15],
        [0.185, 0.155],
        [0.16, 0.08],
      ],
      16,
    ),
    P.cream,
    T(bowlX, cb.top + 0.03, cb.front + 0.1),
  );
  kit.body.add(CYL(16), '#f2dc8f', T(bowlX, cb.top + 0.155, cb.front + 0.1, 0, 0, 0, 0.18, 0.005, 0.18));
  kit.metal.add(CYL(6), '#c9ccd6', T(bowlX + 0.08, cb.top + 0.3, cb.front + 0.1, 0, 0, -0.5, 0.012, 0.36, 0.012));
  kit.metal.add(SPH(8, 4), '#c9ccd6', T(bowlX + 0.0, cb.top + 0.16, cb.front + 0.1, 0, 0, 0, 0.06, 0.03, 0.06));
  // stack of folded crêpes, jam jars, sugar shaker
  for (let i = 0; i < 5; i++) kit.body.add(CYL(12, ), '#e2ad62', T(CX - 1.2, cb.top + 0.04 + i * 0.012, cb.front + 0.15, 0, i * 0.4, 0, 0.14, 0.012, 0.14));
  kit.body.add(CYL(14), P.cream, T(CX - 1.2, cb.top + 0.035, cb.front + 0.15, 0, 0, 0, 0.18, 0.01, 0.18));
  const jars = ['#b8413a', '#e0862a', '#5a3018', '#6c2a4a'];
  jars.forEach((c, i) => {
    kit.gloss.add(cyl(0.045, 0.045, 0.11, 10), c, T(CX - 0.95 + i * 0.12, cb.top + 0.085, cb.front - 0.12));
    kit.body.add(cyl(0.048, 0.048, 0.03, 10), i % 2 ? P.cream : '#c0392b', T(CX - 0.95 + i * 0.12, cb.top + 0.155, cb.front - 0.12));
  });
  kit.gloss.add(cyl(0.04, 0.05, 0.16, 10), '#eef3f8', T(CX + 1.2, cb.top + 0.11, cb.front + 0.05));
  kit.metal.add(SPH(8, 4), '#c9ccd6', T(CX + 1.2, cb.top + 0.2, cb.front + 0.05, 0, 0, 0, 0.04, 0.03, 0.04));
  lantern(kit, T(CX, cb.H - 0.4, CZ - 0.1), 0.75);
  // sign
  const crepeSign = signMesh('Crêpes', 1.7, 0.5, {
    bg: '#f3e6c8',
    fg: '#6b3b33',
    border: '#3c5a8a',
    grain: true,
    lit: 0.72,
    px: 512,
    paint: (g, w, h) => {
      for (const x of [w * 0.11, w * 0.89]) {
        g.fillStyle = '#e2ad62';
        g.beginPath();
        g.arc(x, h * 0.52, h * 0.24, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#c98a3a';
        g.beginPath();
        g.arc(x, h * 0.52, h * 0.24, -0.4, Math.PI * 0.55);
        g.lineTo(x, h * 0.52);
        g.fill();
      }
    },
  });
  crepeSign.position.set(CX, cb.H + 0.62, cb.front + 0.05);
  f.group.add(crepeSign);
  signBoard(kit, T(CX, cb.H + 0.62, cb.front + 0.02), 1.7, 0.5);
  for (const sx of [-1, 1]) kit.body.add(BOX(), P.woodDark, T(CX + sx * 0.7, cb.H + 0.25, cb.front - 0.05, 0, 0, 0, 0.06, 0.5, 0.06));
  // little menu slate on the side
  {
    const m = signMesh('Sucre · Confiture · Chocolat', 0.9, 0.32, { bg: '#24302a', fg: '#f3ead8', chalk: true, px: 512, round: 0.1, font: '"Nunito", system-ui, sans-serif' });
    m.position.set(CX - 1.555, 1.55, CZ + 0.2);
    m.rotation.y = -Math.PI / 2;
    f.group.add(m);
  }

  // ───────── gingerbread stand (a gingerbread house!)
  const GX = 2.65;
  const GZ = -4.45;
  const gb = booth(kit, f, GX, GZ, 2.8, 1.8, { wall: '#b5733a', roof: '#6a3a1e', post: '#8a5228', seed: 21, interior: '#ffc27a' });
  // white icing on the eaves (drips) and the gable corners
  for (const side of [1, -1]) {
    const ez = GZ + side * (1.8 / 2 + 0.32);
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const x = GX - 1.72 + (i / n) * 3.44;
      kit.body.add(SPH(6, 4), '#fbf6ee', T(x, gb.eaveY + 0.02, ez - side * 0.01, 0, 0, 0, 0.07, 0.05 + (i % 3) * 0.025, 0.05));
    }
  }
  for (let i = 0; i < 14; i++) {
    const x = GX - 1.2 + (i / 13) * 2.4;
    const c = ['#d94f45', '#2f6b3f', '#f3ead8', '#e2b34a'][i % 4];
    kit.body.add(SPH(6, 4), c, T(x, gb.H + 0.82, GZ, 0, 0, 0, 0.065));
  }
  // candy-cane posts
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 7; k++) kit.body.add(BOX(), k % 2 ? '#fbf6ee' : '#d94f45', T(GX + sx * 1.33, 0.15 + k * 0.3, gb.front + 0.01, 0, 0, 0, 0.16, 0.3, 0.16));
  }
  // counter display: cookies, little gingerbread houses, a jar of candy canes
  const cookie = new THREE.ExtrudeGeometry(heartShape(0.14), { depth: 0.02, bevelEnabled: false, curveSegments: 4 });
  for (let i = 0; i < 6; i++) {
    kit.body.add(cookie, '#a8642e', T(GX - 1.0 + i * 0.17, gb.top + 0.04, gb.front + 0.2 + (i % 2) * 0.12, -Math.PI / 2, i * 0.5, 0));
    kit.body.add(cookie, '#fbf6ee', T(GX - 1.0 + i * 0.17, gb.top + 0.042, gb.front + 0.2 + (i % 2) * 0.12, -Math.PI / 2, i * 0.5, 0, 0.6, 0.6, 1));
  }
  for (let i = 0; i < 3; i++) {
    const m = T(GX + 0.35 + i * 0.32, gb.top + 0.03, gb.front + 0.15, 0, 0.3 - i * 0.3, 0);
    kit.body.add(BOX(), '#b06a32', mul(m, T(0, 0.09, 0, 0, 0, 0, 0.2, 0.18, 0.18)));
    kit.body.add(CONE(4), '#fbf6ee', mul(m, T(0, 0.25, 0, 0, Math.PI / 4, 0, 0.17, 0.15, 0.17)));
    kit.body.add(BOX(), '#e2b34a', mul(m, T(0, 0.08, 0.092, 0, 0, 0, 0.06, 0.08, 0.01)));
  }
  kit.gloss.add(cyl(0.07, 0.07, 0.2, 10), '#eef3f8', T(GX + 1.2, gb.top + 0.13, gb.front + 0.05));
  for (let i = 0; i < 4; i++) kit.body.add(CYL(5), i % 2 ? '#d94f45' : '#fbf6ee', T(GX + 1.17 + (i % 2) * 0.05, gb.top + 0.25, gb.front + 0.04 + (i > 1 ? 0.04 : 0), 0.1 * (i - 2), 0, 0, 0.014, 0.28, 0.014));
  // shelves inside with big hearts
  kit.body.add(BOX(), '#7a4422', T(GX, 1.45, gb.back + 0.2, 0, 0, 0, 2.4, 0.05, 0.22));
  for (let i = 0; i < 5; i++) {
    kit.body.add(cookie, '#a8642e', T(GX - 0.9 + i * 0.45, 1.67, gb.back + 0.16, 0, 0, 0, 2.2, 2.2, 1));
    kit.body.add(cookie, '#fbf6ee', T(GX - 0.9 + i * 0.45, 1.67, gb.back + 0.15, 0, 0, 0, 2.45, 2.45, 1));
  }
  lantern(kit, T(GX + 0.2, gb.H - 0.4, GZ - 0.1), 0.75);
  const gingerSign = signMesh('Pain d’épices', 1.8, 0.48, { bg: '#7a4422', fg: '#fbf6ee', border: '#fbf6ee', lit: 0.9, px: 512, stars: true });
  gingerSign.position.set(GX, gb.H + 0.6, gb.front + 0.05);
  f.group.add(gingerSign);
  signBoard(kit, T(GX, gb.H + 0.6, gb.front + 0.02), 1.8, 0.48, { wood: '#5a3018' });
  for (const sx of [-1, 1]) kit.body.add(BOX(), '#8a5228', T(GX + sx * 0.75, gb.H + 0.25, gb.front - 0.05, 0, 0, 0, 0.06, 0.5, 0.06));

  // hanging iced hearts (instanced, they sway)
  const nH = 8;
  const heartGeo = new THREE.ExtrudeGeometry(heartShape(0.3), { depth: 0.035, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.012, bevelSegments: 1, curveSegments: 6 });
  heartGeo.translate(0, -0.2, -0.017);
  const icingGeo = new THREE.ExtrudeGeometry(heartShape(0.335), { depth: 0.02, bevelEnabled: false, curveSegments: 6 });
  icingGeo.translate(0, -0.2, -0.01);
  const hearts = new THREE.InstancedMesh(heartGeo, new THREE.MeshLambertMaterial({ color: '#a8642e' }), nH);
  const icing = new THREE.InstancedMesh(icingGeo, new THREE.MeshLambertMaterial({ color: '#fbf6ee' }), nH);
  hearts.name = 'gingerbread-hearts';
  const heartPivots: { p: THREE.Vector3; ph: number; len: number }[] = [];
  for (let i = 0; i < nH; i++) {
    const x = GX - 1.25 + (i / (nH - 1)) * 2.5;
    const len = 0.18 + (i % 3) * 0.12;
    const p = new THREE.Vector3(x, gb.eaveY - 0.04, gb.eaveZ - 0.05);
    heartPivots.push({ p, ph: r() * 6, len });
    kit.body.add(BOX(), '#c0392b', T(x, p.y - len / 2, p.z, 0, 0, 0, 0.012, len, 0.012));
    kit.body.add(BOX(), '#c0392b', T(x, p.y - len + 0.02, p.z + 0.02, 0, 0, 0, 0.09, 0.03, 0.01));
  }
  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const tmpP = new THREE.Vector3();
  const placeHearts = (t: number) => {
    for (let i = 0; i < nH; i++) {
      const h = heartPivots[i];
      const a = Math.sin(t * 1.3 + h.ph) * 0.12 + Math.sin(t * 2.1 + h.ph * 2) * 0.05;
      tmpE.set(a, Math.sin(t * 0.7 + h.ph) * 0.35, a * 0.5);
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpP.set(h.p.x, h.p.y - h.len, h.p.z), tmpQ, one);
      hearts.setMatrixAt(i, tmpM);
      icing.setMatrixAt(i, tmpM);
    }
    hearts.instanceMatrix.needsUpdate = true;
    icing.instanceMatrix.needsUpdate = true;
  };
  placeHearts(0);
  hearts.computeBoundingSphere();
  icing.computeBoundingSphere();
  f.group.add(hearts, icing);

  // bunting between the two stands
  {
    const a = new THREE.Vector3(CX + 1.5, cb.H + 0.25, cb.front + 0.3);
    const b = new THREE.Vector3(GX - 1.4, gb.H + 0.25, gb.front + 0.3);
    const pts = catenary(a, b, 0.45, 12);
    kit.body.add(tube(pts, 0.008, 3), '#3a2c24');
    const flag = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.1, 0, 0), new THREE.Vector3(0.1, 0, 0), new THREE.Vector3(0, -0.22, 0)]);
    flag.computeVertexNormals();
    const cols = ['#d94f45', '#f3ead8', '#3c5a8a', '#e2b34a', '#2f6b3f'];
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i];
      kit.body.add(flag, cols[i % cols.length], T(p.x, p.y, p.z));
      kit.body.add(flag, cols[i % cols.length], T(p.x, p.y, p.z, 0, Math.PI, 0));
    }
  }

  // ───────── chestnut cart
  const KX = -4.45;
  const KZ = 0.75;
  const kyaw = 0.95;
  const km = T(KX, 0, KZ, 0, kyaw, 0);
  {
    const green = '#2f5d50';
    kit.body.add(BOX(), green, mul(km, T(0, 0.78, 0, 0, 0, 0, 1.3, 0.5, 0.74)));
    kit.body.add(BOX(), P.gold, mul(km, T(0, 0.78, 0.375, 0, 0, 0, 1.2, 0.04, 0.01)));
    kit.body.add(BOX(), P.gold, mul(km, T(0, 0.98, 0.375, 0, 0, 0, 1.2, 0.03, 0.01)));
    kit.body.add(BOX(), P.woodDark, mul(km, T(0, 1.05, 0, 0, 0, 0, 1.36, 0.05, 0.8)));
    // wheels
    for (const sx of [-1, 1]) {
      const wm = mul(km, T(sx * 0.72, 0.42, 0, 0, Math.PI / 2, 0));
      kit.body.add(TOR(1, 0.08, 5, 20), '#b8413a', mul(wm, T(0, 0, 0, 0, 0, 0, 0.42)));
      kit.body.add(CYL(8), P.gold, mul(wm, T(0, 0, 0, Math.PI / 2, 0, 0, 0.07, 0.1, 0.07)));
      for (let k = 0; k < 8; k++) kit.body.add(BOX(), '#8a2c2a', mul(wm, T(0, 0, 0, 0, 0, (k / 8) * Math.PI, 0.03, 0.8, 0.03)));
    }
    // handles + prop leg
    for (const sx of [-1, 1]) kit.body.add(BOX(), P.woodDark, mul(km, T(sx * 0.45, 0.85, -0.75, 0.15, 0, 0, 0.05, 0.05, 0.8)));
    kit.body.add(BOX(), P.woodDark, mul(km, T(0, 0.3, -0.55, 0, 0, 0, 0.05, 0.6, 0.05)));
    // roaster: firebox + perforated pan with chestnuts + chimney
    kit.metal.add(BOX(), '#2e2a2e', mul(km, T(0, 1.2, 0, 0, 0, 0, 1.0, 0.26, 0.6)));
    kit.glow.add(BOX(), '#ff6a2a', mul(km, T(0, 1.16, 0.301, 0, 0, 0, 0.8, 0.1, 0.01)), 1.6);
    for (let k = 0; k < 6; k++) kit.metal.add(BOX(), '#2e2a2e', mul(km, T(-0.35 + k * 0.14, 1.16, 0.305, 0, 0, 0, 0.03, 0.12, 0.012)));
    // shallow pan of roasted chestnuts (left) + the turning roasting drum (right)
    kit.metal.add(cyl(0.24, 0.21, 0.07, 14, true), '#3a3438', mul(km, T(-0.3, 1.365, 0)));
    kit.metal.add(cyl(0.21, 0.21, 0.01, 14), '#1f1c1e', mul(km, T(-0.3, 1.335, 0)));
    for (let i = 0; i < 24; i++) {
      const a = r() * Math.PI * 2;
      const rr = Math.sqrt(r()) * 0.17;
      kit.body.add(SPH(5, 3), i % 3 ? '#6a3a20' : '#7d4a2a', mul(km, T(-0.3 + Math.cos(a) * rr, 1.36 + r() * 0.03, Math.sin(a) * rr, 0, a, 0, 0.045, 0.035, 0.04)));
    }
    for (const x of [-0.02, 0.42]) kit.metal.add(BOX(), '#2e2a2e', mul(km, T(x, 1.42, 0, 0, 0, 0, 0.03, 0.18, 0.05)));
    kit.metal.add(cyl(0.05, 0.05, 0.85, 8), '#2e2a2e', mul(km, T(0.48, 1.75, -0.2)));
    kit.metal.add(cyl(0.09, 0.05, 0.08, 8), '#2e2a2e', mul(km, T(0.48, 2.2, -0.2)));
    // paper cones
    for (let i = 0; i < 4; i++) kit.body.add(CONE(8), P.cream, mul(km, T(-0.55 + i * 0.07, 1.16, -0.25 + (i % 2) * 0.06, Math.PI, 0, 0.1 * i, 0.06, 0.2, 0.06)));
    // canopy pole + lantern
    kit.metal.add(cyl(0.025, 0.025, 1.4, 6), IRON, mul(km, T(-0.6, 1.75, -0.3)));
    lantern(kit, mul(km, T(-0.6, 2.25, -0.08)), 0.6);
    kit.metal.add(BOX(), IRON, mul(km, T(-0.6, 2.47, -0.19, 0, 0, 0, 0.02, 0.02, 0.24)));
    // sign
    const ks = signMesh('Marrons chauds', 1.1, 0.3, { bg: '#f3e6c8', fg: '#7a2c22', border: '#b8413a', px: 512, round: 0.2 });
    ks.position.copy(pt(km, 0, 0.78, 0.382));
    ks.rotation.y = kyaw;
    f.group.add(ks);
    snowMound(kit, mul(km, T(0.95, 0, -0.6)), 0.5, 0.18, 4);
    f.box(KX - Math.sin(kyaw) * 0.2, KZ - Math.cos(kyaw) * 0.2, 0.8, 0.85, kyaw, 'prop');
  }
  const chestnutSmoke = pt(km, 0.48, 2.3, -0.2);
  const panSmoke = pt(km, -0.3, 1.45, 0);
  // roasting drum: its own little mesh so it can turn
  const drum = (() => {
    const b = new Bucket();
    b.add(CYL(12), '#2e2a2e', T(0, 0, 0, 0, 0, Math.PI / 2, 0.16, 0.42, 0.16));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      b.add(BOX(), '#4a4446', T(0, Math.sin(a) * 0.162, Math.cos(a) * 0.162, a, 0, 0, 0.4, 0.015, 0.025));
    }
    for (const x of [-0.21, 0.21]) b.add(TOR(1, 0.12, 4, 14), P.gold, T(x, 0, 0, 0, Math.PI / 2, 0, 0.16));
    b.add(CYL(6), '#2e2a2e', T(0, 0, 0, 0, 0, Math.PI / 2, 0.015, 0.62, 0.015));
    b.add(BOX(), '#2e2a2e', T(0.31, 0.06, 0, 0, 0, 0, 0.02, 0.14, 0.02));
    b.add(CYL(6), '#7a3a1a', T(0.33, 0.13, 0, 0, 0, Math.PI / 2, 0.022, 0.08, 0.022));
    const m = b.build(metalMat(ctx.renderer), 'chestnut-drum')!;
    m.position.copy(pt(km, 0.2, 1.52, 0));
    m.rotation.order = 'YXZ';
    m.rotation.y = kyaw;
    f.group.add(m);
    return m;
  })();

  // ───────── picnic tables
  const tables = [
    { x: 3.2, z: 0.6, yaw: 0.25 },
    { x: 2.5, z: 3.55, yaw: -0.15 },
  ];
  for (const tb of tables) {
    const m = T(tb.x, 0, tb.z, 0, tb.yaw, 0);
    kit.body.add(BOX(), '#a5774f', mul(m, T(0, 0.72, 0, 0, 0, 0, 1.6, 0.05, 0.7)));
    for (const sz of [-1, 1]) {
      kit.body.add(BOX(), '#9b6e47', mul(m, T(0, 0.42, sz * 0.62, 0, 0, 0, 1.6, 0.045, 0.26)));
      kit.body.add(SPH(8, 4), SNOW, mul(m, T(0.5 * sz, 0.45, sz * 0.62, 0, 0, 0, 0.35, 0.03, 0.12)));
    }
    for (const sx of [-1, 1]) {
      kit.body.add(BOX(), P.woodDark, mul(m, T(sx * 0.6, 0.36, 0, 0, 0, 0, 0.06, 0.72, 0.06)));
      kit.body.add(BOX(), P.woodDark, mul(m, T(sx * 0.6, 0.3, 0, 0, 0, 0, 0.05, 0.05, 1.5)));
    }
    kit.body.add(SPH(10, 4), SNOW, mul(m, T(-0.45, 0.75, 0.1, 0, 0, 0, 0.35, 0.04, 0.22)));
    mug(kit, mul(m, T(0.3, 0.745, 0.15)), P.red);
    mug(kit, mul(m, T(0.45, 0.745, -0.1, 0, 2, 0)), P.cream);
    kit.body.add(CYL(14), P.cream, mul(m, T(0.05, 0.75, -0.12, 0, 0, 0, 0.15, 0.01, 0.15)));
    kit.body.add(CYL(12), '#e2ad62', mul(m, T(0.05, 0.758, -0.12, 0, 0, 0, 0.11, 0.008, 0.11)));
    kit.gloss.add(cyl(0.06, 0.06, 0.12, 8), '#e8eef2', mul(m, T(-0.1, 0.805, 0.12)));
    kit.lit.add(cyl(0.035, 0.035, 0.05, 6), P.candle, mul(m, T(-0.1, 0.8, 0.12)), 2.2);
    kit.halos.push({ pos: pt(m, -0.1, 0.88, 0.12), color: P.candle, size: 0.8, k: 0.55, twinkle: 0.6 });
    f.box(tb.x, tb.z, 0.82, 0.78, tb.yaw, 'prop');
  }

  // ───────── string lights over the picnic area
  const pole1 = new THREE.Vector3(4.95, 2.9, 2.0);
  const pole2 = new THREE.Vector3(0.95, 2.9, 5.0);
  for (const p of [pole1, pole2]) {
    kit.metal.add(cyl(0.045, 0.06, p.y, 8), IRON, T(p.x, p.y / 2, p.z));
    kit.metal.add(SPH(6, 4), IRON, T(p.x, p.y + 0.04, p.z, 0, 0, 0, 0.07));
    f.circle(p.x, p.z, 0.12, 'prop');
  }
  const mix = [P.warm, P.candle, '#ffb35c'];
  stringLights(kit, new THREE.Vector3(GX + 1.35, gb.eaveY, gb.eaveZ), pole1, 0.6, { colors: mix });
  stringLights(kit, pole1, pole2, 0.75, { colors: mix });
  stringLights(kit, new THREE.Vector3(GX - 1.35, gb.eaveY, gb.eaveZ), pole2, 0.8, { colors: mix });
  stringLights(kit, new THREE.Vector3(CX + 1.5, cb.eaveY, cb.eaveZ), pole2, 0.8, { colors: mix });
  stringLights(kit, new THREE.Vector3(CX - 1.5, cb.eaveY, cb.eaveZ), new THREE.Vector3(CX + 1.5, cb.eaveY, cb.eaveZ), 0.1, { colors: mix, spacing: 0.3, halo: 0.4 });
  stringLights(kit, new THREE.Vector3(GX - 1.4, gb.eaveY, gb.eaveZ + 0.02), new THREE.Vector3(GX + 1.4, gb.eaveY, gb.eaveZ + 0.02), 0.08, { colors: mix, spacing: 0.3, halo: 0.4 });
  kit.pool(T(), 2.8, 2.0, 4.2, P.warm, 0.13);
  kit.pool(T(), CX, cb.front + 0.9, 2.2, P.warm2, 0.22);
  kit.pool(T(), GX, gb.front + 0.9, 2.2, P.warm2, 0.22);
  kit.pool(T(), KX, KZ, 1.8, '#ff7a2a', 0.22);

  // little snow mounds & a sack of flour
  snowMound(kit, T(-4.8, 0, -4.9), 1.0, 0.32, 7);
  snowMound(kit, T(4.9, 0, -4.6), 0.8, 0.28, 8);
  snowMound(kit, T(-5.6, 0, 2.6), 0.7, 0.22, 9);
  kit.body.add(lump(5, 1, 0.08), '#e8dcc4', T(CX - 1.95, 0.32, CZ + 0.4, 0, 0.3, 0, 0.3, 0.34, 0.26));
  crate(kit, T(CX - 1.95, 0, CZ - 0.5, 0, -0.2, 0), 0.5, 0.36, 0.4);
  f.circle(CX - 1.95, CZ, 0.45, 'prop');

  const parts = kit.finish(f.group, 'food', { twinkle: 0.2 });
  emitter(f.group, [chestnutSmoke], {
    count: Math.round(26 * Math.max(0.5, kit.detail)),
    life: 4,
    vel: [0.08, 0.5, 0.02],
    spread: 0.7,
    jitter: 0.04,
    wobble: 0.35,
    size: [0.15, 0.9],
    color: ['#c9c4c8', '#7d8399'],
    opacity: 0.3,
    sharp: 2.5,
  });
  emitter(f.group, [panSmoke], {
    count: Math.round(16 * Math.max(0.5, kit.detail)),
    life: 2.6,
    vel: [0, 0.35, 0],
    spread: 0.35,
    jitter: 0.25,
    wobble: 0.2,
    size: [0.15, 0.55],
    color: ['#f2f0f4', '#a9b2cc'],
    opacity: 0.22,
    sharp: 2.5,
  });
  emitter(
    f.group,
    gx.map((x) => new THREE.Vector3(x, cb.top + 0.16, cb.front + 0.12)),
    { count: Math.round(10 * Math.max(0.5, kit.detail)), life: 2.2, vel: [0, 0.3, 0], spread: 0.25, jitter: 0.15, wobble: 0.15, size: [0.1, 0.4], color: ['#ffffff', '#c3cce4'], opacity: 0.2, sharp: 2.5 },
  );

  f.light(0, 2, -3, (k) => {
    parts.setLevel(k);
    setSignLevel(crepeSign, k, 0.5);
    setSignLevel(gingerSign, k, 0.5);
  });

  // anchors
  f.anchor('food:cook', CX - 0.15, cb.front - 0.72, 0);
  f.anchor('food:crepe-spot', CX - 0.15, cb.front + 1.1, Math.PI);
  f.anchor('food:griddle', gx[0], cb.front + 0.12, 0);
  f.anchor('food:chestnut', KX - Math.sin(kyaw) * 1.5, KZ - Math.cos(kyaw) * 1.5, kyaw);
  f.anchor('food:chestnut-spot', KX + Math.sin(kyaw) * 1.35, KZ + Math.cos(kyaw) * 1.35, kyaw + Math.PI);

  return (dt: number, t: number) => {
    placeHearts(t);
    drum.rotation.x += dt * 1.1;
  };
}
