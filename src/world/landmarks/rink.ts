import * as THREE from 'three';
import { PALETTE as P } from '../palette';
import { glowTexture } from '../textures';
import type { LandmarkEnv } from './index';
import { canvasTexture, duskEnv } from './fx';
import { BOX, CONE, CYL, SPH, TOR, Frame, Kit, T, cyl, mul, rng, tube } from './kit';
import { IRON, SNOW, bench, lantern, lump, setSignLevel, signBoard, signMesh, snowMound, stringLights } from './props';

/**
 * Le Lac Gelé — the frozen lake: a glossy ice ellipse (rx 7.5 × rz 5.5 world, matching the 'ice' path)
 * with view-dependent fake reflections of the lanterns and string lights (flat additive decals that
 * follow the camera), a snow lip, a low wooden fence with two openings, benches, lanterns and a snowman.
 * Frame: local +Z faces the plaza (world -X), so the ellipse is A = 5.5 along local X, B = 7.5 along local Z.
 */

const A = 5.5;
const B = 7.5;

function iceTexture() {
  return canvasTexture(1024, 1024, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, w * 0.05, w / 2, h / 2, w * 0.5);
    grd.addColorStop(0, '#d8eef8');
    grd.addColorStop(0.6, '#b3d6ea');
    grd.addColorStop(1, '#8fbcd6');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    const r = rng(17);
    // frost clouds
    for (let i = 0; i < 70; i++) {
      const x = r() * w;
      const y = r() * h;
      const rr = 20 + r() * 90;
      const c = g.createRadialGradient(x, y, 0, x, y, rr);
      c.addColorStop(0, `rgba(255,255,255,${0.06 + r() * 0.08})`);
      c.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = c;
      g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    // skate marks: long arcs
    g.lineCap = 'round';
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = `rgba(255,255,255,${0.12 + r() * 0.22})`;
      g.lineWidth = 0.8 + r() * 1.6;
      const cx = w / 2 + (r() - 0.5) * w * 0.5;
      const cy = h / 2 + (r() - 0.5) * h * 0.5;
      const rad = 80 + r() * 330;
      const a0 = r() * Math.PI * 2;
      g.beginPath();
      g.arc(cx, cy, rad, a0, a0 + 0.3 + r() * 1.4);
      g.stroke();
    }
    // a few darker cracks
    for (let i = 0; i < 10; i++) {
      g.strokeStyle = 'rgba(80,130,170,0.25)';
      g.lineWidth = 1;
      let x = r() * w;
      let y = r() * h;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (r() - 0.5) * 60;
        y += (r() - 0.5) * 60;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
}

function ellipsePoint(a: number, b: number, phi: number, y = 0) {
  return new THREE.Vector3(Math.cos(phi) * a, y, Math.sin(phi) * b);
}

export function buildRink(env: LandmarkEnv, f: Frame) {
  const { ctx } = env;
  const kit = new Kit(ctx);
  const r = rng(90);
  const name = ctx.layout.zones.rink.name || 'Le Lac Gelé';
  const ICE_Y = 0.03;

  // ── ice
  const iceGeo = new THREE.CircleGeometry(1, 80);
  iceGeo.rotateX(-Math.PI / 2);
  iceGeo.scale(A, 1, B);
  const iceMat = new THREE.MeshStandardMaterial({
    color: '#9cc6de',
    map: iceTexture(),
    roughness: 0.07,
    metalness: 0.15,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const env2 = duskEnv(ctx.renderer);
  if (env2) {
    iceMat.envMap = env2;
    iceMat.envMapIntensity = 1.6;
  }
  const ice = new THREE.Mesh(iceGeo, iceMat);
  ice.position.y = ICE_Y;
  ice.name = 'rink-ice';
  ice.receiveShadow = ctx.quality.shadows;
  f.group.add(ice);

  // snow lip around the ice
  const lip: THREE.Vector3[] = [];
  for (let i = 0; i < 96; i++) lip.push(ellipsePoint(A + 0.1, B + 0.1, (i / 96) * Math.PI * 2, 0.04));
  kit.body.add(tube(lip, 0.14, 5, true), SNOW);
  for (let i = 0; i < 40; i++) {
    const phi = r() * Math.PI * 2;
    const p = ellipsePoint(A + 0.18, B + 0.18, phi);
    kit.body.add(lump(i, 0, 0.25), SNOW, T(p.x, 0.04, p.z, 0, phi, 0, 0.22 + r() * 0.18, 0.1 + r() * 0.06, 0.2 + r() * 0.14));
  }

  // ── fence with two openings (toward the plaza = local +Z, and south = local +X)
  const FA = A + 0.55;
  const FB = B + 0.55;
  const openings = [new THREE.Vector3(0, 0, FB), new THREE.Vector3(FA, 0, 0)];
  const posts: THREE.Vector3[] = [];
  {
    let acc = 0;
    let prev = ellipsePoint(FA, FB, 0);
    const steps = 2400;
    for (let i = 1; i <= steps; i++) {
      const p = ellipsePoint(FA, FB, (i / steps) * Math.PI * 2);
      acc += p.distanceTo(prev);
      prev = p;
      if (acc >= 1.3) {
        acc = 0;
        posts.push(p);
      }
    }
  }
  const nearOpening = (p: THREE.Vector3) => openings.some((o) => o.distanceTo(p) < 1.35);
  const gatePosts: THREE.Vector3[] = [];
  for (let i = 0; i < posts.length; i++) {
    const a = posts[i];
    const b = posts[(i + 1) % posts.length];
    const mid = a.clone().lerp(b, 0.5);
    const gap = nearOpening(mid);
    if (!nearOpening(a)) {
      kit.body.add(BOX(), P.woodDark, T(a.x, 0.45, a.z, 0, 0, 0, 0.11, 0.9, 0.11));
      kit.body.add(SPH(6, 4), SNOW, T(a.x, 0.92, a.z, 0, 0, 0, 0.08, 0.04, 0.08));
    }
    if (gap) {
      if (!nearOpening(a)) gatePosts.push(a);
      if (!nearOpening(b)) gatePosts.push(b);
      continue;
    }
    if (nearOpening(a) || nearOpening(b)) continue;
    const len = a.distanceTo(b);
    const yaw = Math.atan2(b.x - a.x, b.z - a.z) - Math.PI / 2;
    for (const y of [0.4, 0.78]) kit.body.add(BOX(), '#9b6e47', T(mid.x, y, mid.z, 0, yaw, 0, len + 0.04, 0.09, 0.06));
    kit.body.add(BOX(), SNOW, T(mid.x, 0.85, mid.z, 0, yaw, 0, len * 0.9, 0.04, 0.07));
    f.box(mid.x, mid.z, len / 2 + 0.05, 0.08, yaw, 'fence');
  }

  // ── sign arch over the plaza-side opening
  {
    const gx = 1.5;
    const gz = FB * Math.sqrt(1 - (gx / FA) ** 2);
    for (const sx of [-1, 1]) {
      kit.body.add(BOX(), P.woodDark, T(sx * gx, 1.3, gz, 0, 0, 0, 0.16, 2.6, 0.16));
      kit.body.add(SPH(8, 4), SNOW, T(sx * gx, 2.63, gz, 0, 0, 0, 0.12, 0.05, 0.12));
      f.circle(sx * gx, gz, 0.14, 'fence');
    }
    kit.body.add(BOX(), P.wood, T(0, 2.45, gz, 0, 0, 0, gx * 2 + 0.4, 0.14, 0.14));
    const sign = signMesh(name, 2.2, 0.5, { bg: '#2f4f7a', fg: '#eaf6ff', border: '#bfe0f0', stars: true, lit: 1.0, px: 768, round: 0.3 });
    sign.position.set(0, 2.05, gz + 0.08);
    f.group.add(sign);
    signBoard(kit, T(0, 2.05, gz + 0.05), 2.2, 0.5, { wood: '#1f3150', chains: 0.25 });
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(new THREE.Vector3(-gx + t * gx * 2, 2.52 - Math.sin(t * Math.PI) * 0.12, gz + 0.1));
    }
    kit.body.add(tube(pts, 0.06, 5), P.holly);
    for (let i = 1; i < 12; i += 2) kit.bulb(pts[i].clone().add(new THREE.Vector3(0, -0.06, 0.06)), '#cfe8ff', 0.04, 0.45);
    f.light(0, 2, gz, (k) => setSignLevel(sign, k, 0.4));
  }

  // ── lanterns around the lake
  const lanternPhis = [Math.PI / 2 + 0.32, Math.PI / 2 - 0.32, 0.36, -0.36, Math.PI, -Math.PI / 2, Math.PI * 0.78, -Math.PI * 0.22];
  const sources: { p: THREE.Vector3; size: number; k: number }[] = [];
  for (const phi of lanternPhis) {
    const p = ellipsePoint(FA + 0.7, FB + 0.7, phi);
    const yaw = Math.atan2(p.z, -p.x);
    const m = T(p.x, 0, p.z, 0, yaw, 0);
    kit.metal.add(cyl(0.05, 0.065, 2.4, 8), IRON, mul(m, T(0, 1.2, 0)));
    kit.metal.add(BOX(), IRON, mul(m, T(0.22, 2.35, 0, 0, 0, 0, 0.5, 0.04, 0.04)));
    kit.metal.add(SPH(6, 4), IRON, mul(m, T(0, 2.42, 0, 0, 0, 0, 0.06)));
    const c = lantern(kit, mul(m, T(0.45, 2.08, 0)), 0.9);
    kit.pool(m, 0.45, 0, 1.8, P.warm2, 0.32);
    sources.push({ p: c, size: 1, k: 1 });
    f.circle(p.x, p.z, 0.12, 'prop');
  }

  // ── tall poles with string lights crossing over the ice
  const poles = [Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4, -Math.PI / 4].map((phi) => ellipsePoint(FA + 2.3, FB + 2.3, phi, 4.1));
  for (const p of poles) {
    kit.metal.add(cyl(0.06, 0.08, p.y, 8), IRON, T(p.x, p.y / 2, p.z));
    kit.metal.add(SPH(8, 6), P.gold, T(p.x, p.y + 0.06, p.z, 0, 0, 0, 0.09));
    snowMound(kit, T(p.x, 0, p.z), 0.45, 0.16, 3);
    f.circle(p.x, p.z, 0.14, 'prop');
  }
  const cold = ['#fff1c8', P.warm, '#cfe8ff', P.warm];
  const before = kit.bulbs.length;
  stringLights(kit, poles[0], poles[2], 1.1, { colors: cold, spacing: 0.45 });
  stringLights(kit, poles[1], poles[3], 1.1, { colors: cold, spacing: 0.45 });
  for (let i = 0; i < 4; i++) stringLights(kit, poles[i], poles[(i + 1) % 4], 0.55, { colors: cold, spacing: 0.45 });
  for (let i = before; i < kit.bulbs.length; i += 4) sources.push({ p: kit.bulbs[i].p, size: 0.45, k: 0.7 });

  // ── benches, snowman, snowbanks
  const benches: { x: number; z: number; yaw: number }[] = [
    { x: -(FA + 1.0), z: 2.4, yaw: Math.PI / 2 },
    { x: -(FA + 1.0), z: -2.4, yaw: Math.PI / 2 },
    { x: FA + 1.0, z: -3.0, yaw: -Math.PI / 2 },
    { x: 5.26, z: 6.68, yaw: Math.atan2(-5.26, -6.68) },
  ];
  for (const b of benches) {
    bench(kit, T(b.x, 0, b.z, 0, b.yaw, 0), 1.6);
    f.box(b.x, b.z, 0.82, 0.3, b.yaw, 'prop');
  }
  {
    const sm = T(FA + 1.5, 0, 2.6, 0, -1.2, 0);
    kit.body.add(lump(1, 1, 0.06), '#f6f8fd', mul(sm, T(0, 0.42, 0, 0, 0, 0, 0.48, 0.44, 0.48)));
    kit.body.add(lump(2, 1, 0.06), '#f6f8fd', mul(sm, T(0, 1.0, 0, 0, 0, 0, 0.34, 0.32, 0.34)));
    kit.body.add(lump(3, 1, 0.05), '#f6f8fd', mul(sm, T(0, 1.45, 0, 0, 0, 0, 0.24)));
    kit.body.add(CONE(8), '#f08a2a', mul(sm, T(0, 1.45, 0.3, Math.PI / 2, 0, 0, 0.045, 0.22, 0.045)));
    for (const sx of [-1, 1]) {
      kit.body.add(SPH(6, 4), '#1d1a1e', mul(sm, T(sx * 0.08, 1.53, 0.2, 0, 0, 0, 0.03)));
      kit.body.add(CYL(5), '#5c3a26', mul(sm, T(sx * 0.48, 1.12, 0, 0, 0, sx * 1.0, 0.02, 0.55, 0.02)));
    }
    for (let i = 0; i < 3; i++) kit.body.add(SPH(6, 4), '#1d1a1e', mul(sm, T(0, 0.9 + i * 0.12, 0.33 - i * 0.01, 0, 0, 0, 0.03)));
    kit.body.add(TOR(1, 0.3, 6, 14), P.berry, mul(sm, T(0, 1.24, 0, Math.PI / 2, 0, 0, 0.25)));
    kit.body.add(BOX(), P.berry, mul(sm, T(0.12, 1.08, 0.22, 0.2, 0, 0.1, 0.09, 0.3, 0.04)));
    kit.body.add(cyl(0.16, 0.2, 0.22, 10), '#8a3a2a', mul(sm, T(0, 1.72, 0, 0.15, 0, 0.1)));
    f.circle(FA + 1.5, 2.6, 0.5, 'prop');
  }
  for (let i = 0; i < 16; i++) {
    const phi = (i / 16) * Math.PI * 2 + r() * 0.2;
    const p = ellipsePoint(FA + 1.9 + r() * 0.6, FB + 1.9 + r() * 0.6, phi);
    if (openings.some((o) => o.distanceTo(ellipsePoint(FA, FB, phi)) < 2.6)) continue;
    if (Math.hypot(p.x, p.z) > 9.6) continue;
    snowMound(kit, T(p.x, 0, p.z), 0.7 + r() * 0.6, 0.24 + r() * 0.16, i + 20);
  }

  const parts = kit.finish(f.group, 'rink', { twinkle: 0.25 });

  // ── view-dependent reflections on the ice (flat additive decals stretched toward the viewer)
  const reflMat = new THREE.MeshBasicMaterial({
    map: glowTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -6,
    polygonOffsetUnits: -6,
  });
  const quad = new THREE.PlaneGeometry(1, 1);
  quad.rotateX(-Math.PI / 2);
  const refl = new THREE.InstancedMesh(quad, reflMat, sources.length);
  refl.name = 'rink-reflections';
  refl.frustumCulled = false;
  refl.renderOrder = 1;
  f.group.add(refl);
  const warm = new THREE.Color(P.warm);
  const col = new THREE.Color();
  const zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < sources.length; i++) {
    refl.setMatrixAt(i, zeroM);
    refl.setColorAt(i, col.set('#000000'));
  }
  // the Grand Sapin's star also reflects in the lake
  const starLocal = f.group.worldToLocal(new THREE.Vector3(0, 13.9, 0));
  sources.push({ p: starLocal, size: 2.2, k: 0.5 });
  const refl2 = new THREE.InstancedMesh(quad, reflMat, 1);
  refl2.frustumCulled = false;
  refl2.setMatrixAt(0, zeroM);
  refl2.setColorAt(0, col.set('#000000'));
  f.group.add(refl2);

  let level = 1;
  f.light(0, 2, 0, (k) => {
    parts.setLevel(k);
    level = k;
  });

  const camL = new THREE.Vector3();
  const R = new THREE.Vector3();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const worldCenter = f.v(0, 0, 0);
  const updateReflections = () => {
    const cam = ctx.camera;
    if (cam.position.distanceTo(worldCenter) > 60) return;
    camL.copy(cam.position);
    f.group.worldToLocal(camL);
    if (camL.y <= ICE_Y + 0.05) return;
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      const my = 2 * ICE_Y - s.p.y;
      const t = (camL.y - ICE_Y) / (camL.y - my);
      R.set(camL.x + (s.p.x - camL.x) * t, ICE_Y + 0.004, camL.z + (s.p.z - camL.z) * t);
      const e = (R.x / A) ** 2 + (R.z / B) ** 2;
      const mesh = i < sources.length - 1 ? refl : refl2;
      const idx = i < sources.length - 1 ? i : 0;
      if (e >= 0.97) {
        mesh.setMatrixAt(idx, zeroM);
        continue;
      }
      const fade = Math.min(1, (0.97 - e) / 0.12);
      const yaw = Math.atan2(camL.x - R.x, camL.z - R.z);
      const dist = Math.hypot(camL.x - R.x, camL.z - R.z);
      const stretch = 2.6 + Math.min(4, (dist / Math.max(0.5, camL.y)) * 0.6);
      q.setFromAxisAngle(up, yaw);
      sc.set(s.size * 0.55, 1, s.size * stretch);
      m4.compose(R, q, sc);
      mesh.setMatrixAt(idx, m4);
      col.copy(warm).multiplyScalar(s.k * fade * 0.7 * (i < sources.length - 1 ? level : 1));
      mesh.setColorAt(idx, col);
    }
    refl.instanceMatrix.needsUpdate = true;
    if (refl.instanceColor) refl.instanceColor.needsUpdate = true;
    refl2.instanceMatrix.needsUpdate = true;
    if (refl2.instanceColor) refl2.instanceColor.needsUpdate = true;
  };

  // anchors
  f.anchor('rink:center', 0, 0, 0);
  {
    const b = benches[3];
    const fx = Math.sin(b.yaw);
    const fz = Math.cos(b.yaw);
    f.anchor('rink:bench-spot', b.x + fx * 0.75, b.z + fz * 0.75, b.yaw);
  }
  return () => updateReflections();
}
