import * as THREE from 'three';
import { PALETTE as P } from '../palette';
import type { LandmarkEnv } from './index';
import { canvasTexture } from './fx';
import { BOX, CYL, SPH, TOR, Frame, Kit, T, cyl, mul, pt, rng, tube } from './kit';
import { IRON, SNOW, bench, crate, lantern, setSignLevel, signBoard, signMesh, snowMound } from './props';

/**
 * Le Belvédère des Étoiles — a wooden deck at the north edge with a railing over the valley,
 * a brass telescope on a tripod, a sky-chart lectern, benches facing the view, lanterns and a signpost.
 * Frame: local +Z faces the plaza (south); the view is toward local -Z (north).
 */

function skyChartTexture() {
  return canvasTexture(512, 384, (g, w, h) => {
    g.fillStyle = '#e9dcbf';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1d2a5a';
    g.beginPath();
    g.roundRect(14, 14, w - 28, h - 28, 20);
    g.fill();
    g.strokeStyle = 'rgba(226,179,74,0.65)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(w / 2, h / 2 + 20, h * 0.38, 0, Math.PI * 2);
    g.stroke();
    const r = rng(5);
    for (let i = 0; i < 140; i++) {
      g.fillStyle = `rgba(255,248,225,${0.35 + r() * 0.6})`;
      g.beginPath();
      g.arc(20 + r() * (w - 40), 20 + r() * (h - 40), 0.6 + r() * 1.6, 0, Math.PI * 2);
      g.fill();
    }
    // a few constellations
    const cons = [
      [
        [90, 120],
        [130, 100],
        [170, 115],
        [205, 95],
        [240, 120],
        [215, 160],
        [175, 150],
      ],
      [
        [320, 90],
        [350, 140],
        [390, 120],
        [420, 170],
      ],
      [
        [300, 250],
        [340, 230],
        [380, 260],
        [360, 300],
        [310, 290],
      ],
    ];
    g.strokeStyle = 'rgba(255,226,160,0.8)';
    g.lineWidth = 1.6;
    for (const c of cons) {
      g.beginPath();
      c.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
      for (const [x, y] of c) {
        g.fillStyle = '#fff4dc';
        g.beginPath();
        g.arc(x, y, 3.2, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = '#e2b34a';
    g.font = '700 30px "Fraunces", Georgia, serif';
    g.textAlign = 'center';
    g.fillText('Carte du ciel', w / 2, 52);
  });
}

export function buildBelvedere(env: LandmarkEnv, f: Frame) {
  const { ctx } = env;
  const kit = new Kit(ctx);
  const r = rng(180);
  const name = ctx.layout.zones.belvedere.name || 'Le Belvédère des Étoiles';
  const RD = Math.min(7, ctx.layout.zones.belvedere.radius);
  const DECK_Y = 0.045;

  // ── deck: planks across the disk + edge beam
  for (let z = -RD + 0.15; z < RD; z += 0.3) {
    const half = Math.sqrt(Math.max(0, RD * RD - z * z));
    if (half < 0.3) continue;
    const shade = new THREE.Color(P.woodLight).multiplyScalar(0.84 + r() * 0.24);
    kit.body.add(BOX(), shade, T(0, DECK_Y / 2, z, 0, 0, 0, half * 2 - 0.05, DECK_Y, 0.27));
  }
  const edge: THREE.Vector3[] = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    edge.push(new THREE.Vector3(Math.sin(a) * RD, 0.04, Math.cos(a) * RD));
  }
  kit.body.add(tube(edge, 0.07, 4, true), P.woodDark);

  // ── railing along the north edge (θ measured from local +Z)
  const RR = RD - 0.3;
  const th0 = Math.PI - 1.5;
  const th1 = Math.PI + 1.5;
  const nPosts = Math.round(((th1 - th0) * RR) / 1.1);
  const postAt = (i: number) => {
    const th = th0 + (i / nPosts) * (th1 - th0);
    return new THREE.Vector3(Math.sin(th) * RR, 0, Math.cos(th) * RR);
  };
  const lanternPosts = new Set([2, Math.round(nPosts / 2) - 3, Math.round(nPosts / 2) + 3, nPosts - 2]);
  for (let i = 0; i <= nPosts; i++) {
    const p = postAt(i);
    const tall = lanternPosts.has(i);
    const h = tall ? 1.75 : 1.12;
    kit.body.add(BOX(), P.woodDark, T(p.x, h / 2, p.z, 0, Math.atan2(p.x, p.z), 0, 0.14, h, 0.14));
    kit.body.add(SPH(6, 4), SNOW, T(p.x, h + 0.02, p.z, 0, 0, 0, 0.1, 0.04, 0.1));
    if (tall) {
      lantern(kit, T(p.x, h + 0.28, p.z), 0.85);
      kit.pool(T(), p.x * 0.9, p.z * 0.9, 1.8, P.warm2, 0.3);
    }
    if (i < nPosts) {
      const q = postAt(i + 1);
      const mid = p.clone().lerp(q, 0.5);
      const len = p.distanceTo(q);
      const yaw = Math.atan2(q.x - p.x, q.z - p.z) - Math.PI / 2;
      kit.body.add(BOX(), '#9b6e47', T(mid.x, 1.02, mid.z, 0, yaw, 0, len + 0.06, 0.1, 0.12));
      kit.body.add(BOX(), SNOW, T(mid.x, 1.09, mid.z, 0, yaw, 0, len * 0.92, 0.045, 0.1));
      kit.body.add(BOX(), '#9b6e47', T(mid.x, 0.3, mid.z, 0, yaw, 0, len + 0.04, 0.07, 0.07));
      // X braces
      for (const s of [-1, 1]) kit.body.add(BOX(), '#8a5f3d', T(mid.x, 0.66, mid.z, 0, yaw, s * 0.62, Math.hypot(len, 0.7) - 0.1, 0.05, 0.05));
      f.box(mid.x, mid.z, len / 2 + 0.08, 0.1, yaw, 'fence');
    }
  }
  // snow drifts along the railing base
  for (let i = 0; i < 12; i++) {
    const th = th0 + 0.1 + (i / 11) * (th1 - th0 - 0.2);
    snowMound(kit, T(Math.sin(th) * (RD + 0.25), 0, Math.cos(th) * (RD + 0.25)), 0.6 + r() * 0.4, 0.22 + r() * 0.1, i + 3);
  }

  // ── brass telescope on a wooden tripod
  const TX = 0.4;
  const TZ = -5.45;
  {
    const top = new THREE.Vector3(TX, 1.05, TZ);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const foot = new THREE.Vector3(TX + Math.sin(a) * 0.45, 0.02, TZ + Math.cos(a) * 0.45);
      kit.body.add(tube([foot, top.clone().lerp(foot, 0.5).add(new THREE.Vector3(0, 0.02, 0)), top], 0.03, 5), P.wood);
      kit.metal.add(SPH(6, 4), '#c9a24a', T(foot.x, 0.04, foot.z, 0, 0, 0, 0.04));
    }
    kit.metal.add(cyl(0.07, 0.07, 0.1, 10), '#c9a24a', T(TX, 1.07, TZ));
    const m = T(TX, 1.17, TZ, -0.42, Math.PI + 0.15, 0);
    // tube points along local +Z of m (north and up)
    kit.metal.add(cyl(0.11, 0.075, 1.25, 16), '#d4a53e', mul(m, T(0, 0, 0.2, Math.PI / 2, 0, 0)));
    kit.metal.add(cyl(0.125, 0.125, 0.08, 16), '#a8782a', mul(m, T(0, 0, 0.8, Math.PI / 2, 0, 0)));
    kit.metal.add(cyl(0.09, 0.09, 0.05, 14), '#a8782a', mul(m, T(0, 0, -0.1, Math.PI / 2, 0, 0)));
    kit.metal.add(cyl(0.04, 0.055, 0.22, 10), '#a8782a', mul(m, T(0, 0, -0.5, Math.PI / 2, 0, 0)));
    kit.gloss.add(CYL(16), '#9fd2ff', mul(m, T(0, 0, 0.845, Math.PI / 2, 0, 0, 0.1, 0.005, 0.1)));
    kit.metal.add(TOR(1, 0.2, 5, 12), '#a8782a', mul(m, T(0, -0.1, 0.2, 0, 0, 0, 0.06)));
    // little step crate for the children
    crate(kit, T(TX + 1.05, 0, TZ - 0.15, 0, 0.3, 0), 0.5, 0.25, 0.4);
    f.circle(TX, TZ, 0.5, 'prop');
    f.circle(TX + 1.05, TZ - 0.15, 0.32, 'prop');
  }

  // ── sky-chart lectern
  {
    const m = T(-1.45, 0, -5.1, 0, 0.35, 0);
    kit.body.add(BOX(), P.woodDark, mul(m, T(0, 0.5, 0, 0, 0, 0, 0.1, 1.0, 0.1)));
    kit.body.add(BOX(), P.woodDark, mul(m, T(0, 0.04, 0, 0, 0, 0, 0.45, 0.08, 0.35)));
    kit.body.add(BOX(), P.wood, mul(m, T(0, 1.0, 0.05, -0.7, 0, 0, 0.78, 0.6, 0.05)));
    const chart = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.54), new THREE.MeshBasicMaterial({ map: skyChartTexture(), color: new THREE.Color(0.85, 0.85, 0.85) }));
    chart.position.copy(pt(m, 0, 1.0, 0.08).add(new THREE.Vector3(0, 0.008, 0)));
    chart.rotation.set(-0.7, 0.35, 0, 'YXZ');
    f.group.add(chart);
    kit.body.add(SPH(8, 4), SNOW, mul(m, T(0.25, 1.22, -0.08, -0.7, 0, 0, 0.12, 0.03, 0.08)));
    f.circle(-1.45, -5.1, 0.3, 'prop');
  }

  // ── benches facing the view
  for (const sx of [-1, 1]) {
    const x = sx * 3.3;
    const z = -3.5;
    const yaw = Math.PI - sx * 0.35;
    bench(kit, T(x, DECK_Y, z, 0, yaw, 0), 1.7);
    f.box(x, z, 0.86, 0.32, yaw, 'prop');
  }

  // ── entrance: lantern posts & signpost
  for (const sx of [-1, 1]) {
    const x = sx * 2.7;
    const z = RD - 0.9;
    kit.metal.add(cyl(0.05, 0.065, 2.2, 8), IRON, T(x, 1.1, z));
    lantern(kit, T(x, 2.35, z), 0.9);
    kit.metal.add(SPH(6, 4), IRON, T(x, 2.62, z, 0, 0, 0, 0.05));
    kit.pool(T(), x, z, 1.7, P.warm2, 0.32);
    f.circle(x, z, 0.12, 'prop');
  }
  const signP = new THREE.Vector3(-3.9, 0, RD - 1.4);
  kit.body.add(BOX(), P.woodDark, T(signP.x, 1.0, signP.z, 0, 0, 0, 0.14, 2.0, 0.14));
  kit.body.add(SPH(6, 4), SNOW, T(signP.x, 2.02, signP.z, 0, 0, 0, 0.1, 0.04, 0.1));
  const sign = signMesh(name, 1.9, 0.6, { bg: '#1d2a5a', fg: '#fff1c8', border: P.gold, stars: true, lit: 1.0, px: 768, round: 0.25, sub: 'Vue sur la vallée' });
  sign.position.set(signP.x, 1.55, signP.z + 0.1);
  f.group.add(sign);
  signBoard(kit, T(signP.x, 1.55, signP.z + 0.07), 1.9, 0.6, { wood: '#14204a' });
  // little arrow plank pointing to the view
  kit.body.add(BOX(), P.woodLight, T(signP.x + 0.35, 0.85, signP.z, 0, 0, 0, 0.7, 0.16, 0.04));
  kit.body.add(BOX(), P.woodLight, T(signP.x + 0.72, 0.85, signP.z, 0, 0, Math.PI / 4, 0.12, 0.12, 0.04));
  f.circle(signP.x, signP.z, 0.15, 'prop');

  // a few snow mounds at the deck sides & a sled leaning on a post
  snowMound(kit, T(-RD + 0.6, 0, 1.5), 0.8, 0.25, 30);
  snowMound(kit, T(RD - 0.5, 0, 2.2), 0.7, 0.22, 31);
  {
    const sm = T(5.2, 0, -1.4, 0, -1.1, 0.0);
    kit.body.add(BOX(), P.red, mul(sm, T(0, 0.35, 0, 1.2, 0, 0, 0.42, 0.05, 0.9)));
    for (const sx of [-1, 1]) kit.metal.add(BOX(), IRON, mul(sm, T(sx * 0.18, 0.25, 0.05, 1.2, 0, 0, 0.03, 0.12, 0.95)));
  }

  const parts = kit.finish(f.group, 'belvedere');
  f.light(0, 2, 0, (k) => {
    parts.setLevel(k);
    setSignLevel(sign, k, 0.45);
  });

  f.anchor('belvedere:center', 0, 0, Math.PI);
  f.anchor('belvedere:telescope', TX, TZ + 0.85, Math.PI);
  f.anchor('belvedere:stargazer', TX + 1.15, TZ + 0.55, 0.35);
}
