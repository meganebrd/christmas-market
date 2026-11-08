import * as THREE from 'three';
import type { GameContext } from '../core/contracts';
import { glow, mat, std } from '../world/materials';
import { PALETTE } from '../world/palette';
import { glowSprite } from '../world/textures';
import {
  anchor,
  canvasTexture,
  clamp,
  own,
  solidMeshesNear,
  PENTA,
  rand,
  UP,
  yawTo,
  zoneFrame,
  type MinigameDef,
  type Session,
} from './common';

/**
 * Le Pompon du Manège — ride the carousel (on `carousel-horse-0`, or our own fallback carousel),
 * a pompon swings from `carousel-pompon-arm`: press (Space / click / tap) when it passes within
 * reach. One try per pass, 3 laps, each catch = a free ride. Win with at least one catch.
 */

const LAPS = 3;
const FALLBACK_SPEED = 0.42; // rad/s
const GAME_SPEED = 0.55; // rad/s during the game
const REACH_H = 0.78;
const REACH_V = 0.62;

// ───────────────────────── places ─────────────────────────

function frame(ctx: GameContext) {
  const f = zoneFrame(ctx, 'carousel');
  const center = anchor(ctx, 'carousel:center', () => ({ position: f.center.clone(), yaw: 0 }));
  const board = anchor(ctx, 'carousel:board-spot', () => {
    const p = f.center.clone().addScaledVector(f.out, -5.4);
    return { position: p, yaw: yawTo(p, f.center) };
  });
  return { f, center: center.position.clone().setY(0), board };
}

function parts(ctx: GameContext) {
  return {
    platform: ctx.scene.getObjectByName('carousel-platform') ?? null,
    horse: ctx.scene.getObjectByName('carousel-horse-0') ?? null,
    arm: ctx.scene.getObjectByName('carousel-pompon-arm') ?? null,
  };
}

// ───────────────────────── fallback carousel (only when the landmarks have none) ─────────────────────────

function stripes(n: number, a: string, b: string) {
  return canvasTexture(512, 64, (g, w, h) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? a : b;
      g.fillRect((i * w) / n, 0, w / n + 1, h);
    }
  });
}

function buildFallbackCarousel(ctx: GameContext) {
  const { f, center } = frame(ctx);
  const root = new THREE.Group();
  root.name = 'mg-fallback-carousel';
  root.position.copy(center);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(4.45, 4.6, 0.24, 40), mat('#6d6a7a'));
  base.position.y = 0.12;
  root.add(base);
  const platform = new THREE.Group();
  platform.name = 'carousel-platform';
  platform.userData.speed = FALLBACK_SPEED;
  platform.userData.fallback = true;
  root.add(platform);
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(4.25, 4.25, 0.12, 40), mat(PALETTE.woodLight));
  deck.position.y = 0.3;
  platform.add(deck);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(4.25, 0.05, 6, 64), std(PALETTE.gold, { metalness: 0.7, roughness: 0.35 }));
  trim.rotation.x = Math.PI / 2;
  trim.position.y = 0.36;
  platform.add(trim);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 3.4, 16), mat(PALETTE.red));
  column.position.y = 2.0;
  platform.add(column);
  const roofTex = stripes(24, '#f3ead8', '#b8413a');
  roofTex.userData.shared = true;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(5.0, 1.6, 24, 1, true), mat('#ffffff', { map: roofTex, side: THREE.DoubleSide }));
  roof.position.y = 4.5;
  platform.add(roof);
  const valance = new THREE.Mesh(new THREE.CylinderGeometry(5.0, 5.0, 0.45, 24, 1, true), mat('#ffffff', { map: roofTex, side: THREE.DoubleSide }));
  valance.position.y = 3.5;
  platform.add(valance);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), glow(PALETTE.gold, 2.2));
  finial.position.y = 5.45;
  platform.add(finial);
  // bulbs under the valance
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6), glow(PALETTE.warm, 3.2), 32);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    bulbs.setMatrixAt(i, m4.makeTranslation(Math.sin(a) * 4.95, 3.22, Math.cos(a) * 4.95));
  }
  platform.add(bulbs);
  // six horses (instanced bodies + accents), driven by named empties so the game can ride horse 0
  const bodyParts: THREE.BufferGeometry[] = [];
  const add = (arr: THREE.BufferGeometry[], g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0) => {
    g.rotateX(rx);
    g.translate(x, y, z);
    arr.push(g.index ? g.toNonIndexed() : g);
  };
  add(bodyParts, new THREE.CapsuleGeometry(0.2, 0.55, 4, 10), 0, 0, 0, Math.PI / 2);
  add(bodyParts, new THREE.CylinderGeometry(0.1, 0.14, 0.45, 8), 0, 0.28, 0.33, -0.6);
  add(bodyParts, new THREE.BoxGeometry(0.16, 0.18, 0.34), 0, 0.5, 0.52);
  for (const [x, z, r] of [
    [-0.12, 0.25, 0.7],
    [0.12, 0.25, -0.2],
    [-0.12, -0.25, -0.6],
    [0.12, -0.25, 0.3],
  ])
    add(bodyParts, new THREE.CylinderGeometry(0.045, 0.04, 0.48, 6), x, -0.3, z, r);
  const accentParts: THREE.BufferGeometry[] = [];
  add(accentParts, new THREE.BoxGeometry(0.34, 0.08, 0.36), 0, 0.2, -0.02);
  add(accentParts, new THREE.BoxGeometry(0.05, 0.22, 0.32), 0, 0.5, 0.36, -0.4);
  add(accentParts, new THREE.ConeGeometry(0.07, 0.4, 6), 0, 0.05, -0.52, -2.2);
  const merge = (arr: THREE.BufferGeometry[]) => {
    let n = 0;
    for (const g of arr) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    let o = 0;
    for (const g of arr) {
      pos.set(g.attributes.position.array as Float32Array, o * 3);
      nor.set(g.attributes.normal.array as Float32Array, o * 3);
      o += g.attributes.position.count;
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    return out;
  };
  const N = 6;
  const bodies = new THREE.InstancedMesh(merge(bodyParts), mat('#f3ead8'), N);
  const accents = new THREE.InstancedMesh(merge(accentParts), mat(PALETTE.red), N);
  const colors = ['#f3ead8', '#d9c4a8', '#f3ead8', '#c9b8d8', '#f3ead8', '#d9c4a8'];
  colors.forEach((c, i) => bodies.setColorAt(i, new THREE.Color(c)));
  platform.add(bodies, accents);
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 3.0, 8), std(PALETTE.gold, { metalness: 0.75, roughness: 0.3 }), N);
  platform.add(poles);
  const horses: THREE.Object3D[] = [];
  const RH = 3.2;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const h = new THREE.Object3D();
    h.name = `carousel-horse-${i}`;
    h.position.set(Math.sin(a) * RH, 1.1, Math.cos(a) * RH);
    h.rotation.y = Math.atan2(Math.cos(a), -Math.sin(a));
    h.userData.seat = 0.28;
    platform.add(h);
    horses.push(h);
    poles.setMatrixAt(i, m4.makeTranslation(h.position.x, 1.85, h.position.z));
  }
  // pompon pole + arm (static), on the side of the zone
  const side = f.right.clone();
  const poleR = 5.8;
  const pole = new THREE.Group();
  pole.position.copy(center).addScaledVector(side, poleR);
  const poleTex = stripes(10, '#f3ead8', '#2f5d50');
  poleTex.userData.shared = true;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.4, 10), mat('#ffffff', { map: poleTex }));
  shaft.position.y = 1.7;
  shaft.rotation.z = 0;
  pole.add(shaft);
  const armLen = poleR - 3.35;
  const arm = new THREE.Group();
  arm.name = 'carousel-pompon-arm';
  arm.position.y = 3.2;
  arm.rotation.y = Math.atan2(-side.x, -side.z); // local +Z toward the carousel axis
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, armLen), mat(PALETTE.woodDark));
  beam.position.z = armLen / 2;
  arm.add(beam);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), std(PALETTE.gold, { metalness: 0.7, roughness: 0.3 }));
  knob.position.z = armLen;
  arm.add(knob);
  const tipObj = new THREE.Object3D();
  tipObj.name = 'carousel-pompon-tip';
  tipObj.position.set(0, -0.06, armLen);
  arm.add(tipObj);
  pole.add(arm);
  ctx.scene.add(root, pole);
  try {
    ctx.colliders.addCircle(center.x, center.z, 4.55, 'prop');
    ctx.colliders.addCircle(pole.position.x, pole.position.z, 0.2, 'prop');
  } catch {
    /* ignore */
  }
  // spin & bob
  const tmpM = new THREE.Matrix4();
  ctx.addSystem((dt, t) => {
    platform.rotation.y += (platform.userData.speed as number) * dt;
    horses.forEach((h, i) => {
      h.position.y = 1.1 + Math.sin(t * 2.1 + i * 1.05) * 0.16;
      h.updateMatrix();
      tmpM.copy(h.matrix);
      bodies.setMatrixAt(i, tmpM);
      accents.setMatrixAt(i, tmpM);
    });
    bodies.instanceMatrix.needsUpdate = true;
    accents.instanceMatrix.needsUpdate = true;
  });
}

// ───────────────────────── the pompon ─────────────────────────

function makePompon(s: Session) {
  const g = new THREE.Group();
  const red = mat('#d94f45');
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), mat('#d94f45', { flat: true }));
  g.add(core);
  for (let i = 0; i < 8; i++) {
    const tuft = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), i % 3 ? red : mat('#f3ead8', { flat: true }));
    const a = (i / 8) * Math.PI * 2;
    tuft.position.set(Math.cos(a) * 0.1, Math.sin(i * 1.7) * 0.07, Math.sin(a) * 0.1);
    g.add(tuft);
  }
  const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 8), std(PALETTE.gold, { metalness: 0.6, roughness: 0.35 }));
  tassel.position.y = -0.18;
  tassel.rotation.x = Math.PI;
  g.add(tassel);
  const halo = glowSprite('#ffd27a', 0.9, 0.35);
  own(halo.material);
  g.add(halo);
  s.scope.add(g);
  return { group: g, halo };
}

// ───────────────────────── game ─────────────────────────

interface Ride {
  center: THREE.Vector3;
  board: THREE.Vector3;
  platform: THREE.Object3D | null;
  horse: THREE.Object3D | null;
  seatOffset: number;
  /** Local seat point published by the landmark (preferred). */
  seatLocal: THREE.Vector3 | null;
  rideR: number;
  simTheta: number;
  hang: THREE.Vector3;
  ropeLen: number;
  pom?: { group: THREE.Group; halo: THREE.Sprite };
  rope?: THREE.Mesh;
  /** Static meshes that may hide the rider from the orbiting camera. */
  occluders: THREE.Object3D[];
  occT: number;
  /** Angular offset of the camera ahead of the rider (radians). */
  camOff: number;
  /** Camera orbit radius (outside the canopy) and height (steady, does not bob with the horse). */
  camR: number;
  camY: number;
}
const rides = new WeakMap<Session, Ride>();

const hp = new THREE.Vector3();
const hq = new THREE.Quaternion();
const hs = new THREE.Vector3();

/** Seat position of the rider this frame (world). */
function seatNow(r: Ride, out: THREE.Vector3, t: number) {
  if (r.horse) {
    r.horse.updateWorldMatrix(true, false);
    if (r.seatLocal) return out.copy(r.seatLocal).applyMatrix4(r.horse.matrixWorld);
    r.horse.matrixWorld.decompose(hp, hq, hs);
    return out.copy(UP).applyQuaternion(hq).multiplyScalar(r.seatOffset).add(hp);
  }
  return out.set(r.center.x + Math.sin(r.simTheta) * r.rideR, 1.2 + Math.sin(t * 2.1) * 0.16, r.center.z + Math.cos(r.simTheta) * r.rideR);
}

const wrap = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export const manege: MinigameDef = {
  id: 'manege',
  title: 'Le Pompon du Manège',
  zone: 'carousel',
  keeper: { role: 'carousel-keeper', title: 'Gardienne du manège' },
  rules:
    'En selle ! Quand ton cheval passe sous le pompon, attrape-le au bon moment. Un essai par tour, trois tours en tout. Attraper le pompon, c’est un tour gratuit : c’est la tradition !',
  hint: (d) =>
    d === 'touch' ? 'Touche l’écran quand le pompon est à portée' : d === 'pointer' ? 'Clique quand le pompon est à portée' : 'Espace quand le pompon est à portée',

  spot(ctx) {
    return frame(ctx).board;
  },

  boot(ctx) {
    if (!ctx.scene.getObjectByName('carousel-platform')) buildFallbackCarousel(ctx);
  },

  setup(s) {
    const { ctx } = s;
    const { center, board } = frame(ctx);
    const { platform, horse, arm } = parts(ctx);
    const C = platform ? platform.getWorldPosition(new THREE.Vector3()).setY(0) : center;
    // seat height on the horse
    let seatOffset = 0.3;
    let seatLocal: THREE.Vector3 | null = null;
    if (horse) {
      horse.updateWorldMatrix(true, true);
      const us = horse.userData.seat;
      if (us instanceof THREE.Vector3) seatLocal = us.clone();
      else if (typeof us === 'number') seatOffset = us;
      else {
        const box = new THREE.Box3().setFromObject(horse);
        const o = horse.getWorldPosition(new THREE.Vector3());
        if (!box.isEmpty()) seatOffset = box.min.y + (box.max.y - box.min.y) * 0.6 - o.y;
      }
    }
    const r: Ride = { center: C, board: board.position.clone().setY(0), platform, horse, seatOffset, seatLocal, rideR: 3.2, simTheta: 0, hang: new THREE.Vector3(), ropeLen: 1, occluders: [], occT: 0, camOff: 0.62, camR: 6.4, camY: 2.0 };
    const seat = seatNow(r, new THREE.Vector3(), 0);
    r.camY = seat.y + 0.35;
    if (horse) r.rideR = Math.hypot(seat.x - C.x, seat.z - C.z);
    else r.simTheta = Math.atan2(r.board.x - C.x, r.board.z - C.z);
    // orbit outside the turning canopy
    let canopyR = r.rideR + 1.4;
    if (platform) {
      try {
        const box = new THREE.Box3().setFromObject(platform);
        if (!box.isEmpty()) canopyR = clamp(Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2, r.rideR + 0.5, 9);
      } catch {
        /* ignore */
      }
    }
    r.camR = Math.max(r.rideR + 2.9, canopyR + 1.35);
    // where the pompon hangs
    let tip: THREE.Vector3;
    const tipObj = ctx.scene.getObjectByName('carousel-pompon-tip');
    if (tipObj) tip = tipObj.getWorldPosition(new THREE.Vector3());
    else if (arm) {
      arm.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(arm);
      tip = box.clampPoint(new THREE.Vector3(C.x, box.min.y, C.z), new THREE.Vector3());
    } else {
      const side = zoneFrame(ctx, 'carousel').right;
      tip = C.clone().addScaledVector(side, r.rideR + 0.2).setY(3.0);
    }
    const tipR = Math.hypot(tip.x - C.x, tip.z - C.z);
    const hang = tip.clone();
    if (Math.abs(tipR - (r.rideR + 0.2)) > 0.35 && tipR > 0.01) {
      const k = (r.rideR + 0.2) / tipR;
      hang.set(C.x + (tip.x - C.x) * k, tip.y, C.z + (tip.z - C.z) * k);
      // a little rod from the arm tip to the hanging point
      const rodDir = new THREE.Vector3().subVectors(hang, tip);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, rodDir.length(), 6), mat(PALETTE.woodDark));
      rod.position.copy(tip).addScaledVector(rodDir, 0.5);
      rod.quaternion.setFromUnitVectors(UP, rodDir.clone().normalize());
      s.scope.add(rod);
    }
    r.hang.copy(hang);
    // camera occluders: whatever stands around the carousel, except the turning part and the visitor
    try {
      r.occluders = solidMeshesNear(ctx, C, r.rideR + 6, [ctx.player.rig.root, ...(platform ? [platform] : [])]).filter((o) => {
        const m = o as THREE.Mesh;
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
        const bs = m.geometry.boundingSphere!.clone().applyMatrix4(m.matrixWorld);
        return bs.radius < 30 && bs.center.y + bs.radius > 0.6;
      });
    } catch {
      r.occluders = [];
    }
    r.ropeLen = clamp(hang.y - (seat.y + 1.0), 0.35, 2.6);
    rides.set(s, r);
    // the keeper gives the ride a little boost for the game (3 laps ≈ 35 s)
    if (platform) {
      const prev = platform.userData.speed;
      const v = Number(prev);
      if (Number.isFinite(v) && Math.abs(v) > 0.05 && Math.abs(v) < GAME_SPEED * s.speed) {
        platform.userData.speed = Math.sign(v) * GAME_SPEED * s.speed;
        s.scope.onDispose(() => (platform.userData.speed = prev));
      }
    }
    // the visitor rides
    try {
      ctx.player.rig.play('sit');
    } catch {
      /* ignore */
    }
    // the pompon already dangles during the rules
    r.pom = makePompon(s);
    r.pom.group.position.set(hang.x, hang.y - r.ropeLen, hang.z);
    r.rope = s.scope.add(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 5), mat('#f3ead8')));
    r.rope.position.set(hang.x, hang.y - r.ropeLen / 2, hang.z);
    r.rope.scale.set(1, r.ropeLen, 1);
    placeRider(s, r, 0, 1);
    orbit(s, r, 1, true);
  },

  async play(s) {
    const { ctx } = s;
    const r = rides.get(s)!;
    const auto = s.auto;
    const pom = r.pom ?? makePompon(s);
    const rope = r.rope ?? s.scope.add(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 5), mat('#f3ead8')));
    const reach = s.scope.add(new THREE.Mesh(new THREE.RingGeometry(0.2, 0.24, 32), own(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27a').multiplyScalar(2), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))));
    reach.renderOrder = 30;
    const g = 9.8;
    const sw = { x: 0, z: 0, vx: 0.25, vz: -0.15 };
    let jiggleT = 2;
    let lastTheta: number | null = null;
    let acc = 0;
    let dirSign = 0;
    let caught = 0;
    let tried = false;
    let held = 0; // seconds the pompon stays in the hand
    let respawn = 0;
    let lap = 0;
    let cooldown = 0;
    let swell = 0;
    let stalled = 0;
    const seat = new THREE.Vector3();
    const ball = new THREE.Vector3();
    const hand = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    const chimes: { at: number; pitch: number }[] = [];
    const hudScore = () => `Tour ${Math.min(LAPS, lap + 1)}/${LAPS} · ${caught} pompon${caught > 1 ? 's' : ''}`;
    s.hud({ score: hudScore() });
    s.scope.onDispose(() => {
      try {
        ctx.audio.music.swell(false);
      } catch {
        /* ignore */
      }
    });

    await s.loop((dt, t) => {
      // ── ride
      if (r.horse && r.platform) {
        if (stalled > 0) r.platform.rotation.y += FALLBACK_SPEED * dt * (dirSign || 1);
      } else if (!r.horse) r.simTheta += FALLBACK_SPEED * dt;
      seatNow(r, seat, t);
      const theta = Math.atan2(seat.x - r.center.x, seat.z - r.center.z);
      if (lastTheta !== null) {
        const d = wrap(theta - lastTheta);
        acc += Math.abs(d);
        if (Math.abs(d) > 1e-4) dirSign = Math.sign(d);
      }
      lastTheta = theta;
      // the landmark carousel does not turn? turn it ourselves
      if (r.horse && s.time > 1.5 && acc < 0.08 && stalled === 0) stalled = 1;
      placeRider(s, r, t, dirSign || 1);
      orbit(s, r, dirSign || 1, false);
      const newLap = Math.floor(acc / (Math.PI * 2));
      if (newLap > lap) {
        lap = newLap;
        if (lap < LAPS) {
          s.sfx('bell', { volume: 0.4, pitch: 1.3 });
          s.hud({ score: hudScore() });
        }
      }
      // ── pompon swing (spherical pendulum, small angles) + the keeper's playful jiggles
      const w2 = g / r.ropeLen;
      const amp = Math.min(0.42, r.ropeLen * 0.55);
      const n = Math.min(60, Math.ceil(dt / 0.008));
      for (let i = 0; i < n; i++) {
        const h = dt / n;
        sw.vx += (-w2 * sw.x - 0.25 * sw.vx) * h;
        sw.vz += (-w2 * sw.z - 0.25 * sw.vz) * h;
        sw.x = clamp(sw.x + sw.vx * h, -amp, amp);
        sw.z = clamp(sw.z + sw.vz * h, -amp, amp);
      }
      jiggleT -= dt;
      if (jiggleT <= 0) {
        jiggleT = rand(2.2, 3.6);
        const j = 0.5 * Math.sqrt(r.ropeLen);
        sw.vx += rand(-j, j);
        sw.vz += rand(-j, j);
      }
      const drop = Math.sqrt(Math.max(0.01, r.ropeLen * r.ropeLen - sw.x * sw.x - sw.z * sw.z));
      ball.set(r.hang.x + sw.x, r.hang.y - drop, r.hang.z + sw.z);
      // hand: above the head, a bit toward the outside of the carousel
      const outward = tmp.set(seat.x - r.center.x, 0, seat.z - r.center.z).normalize();
      hand.copy(seat).addScaledVector(UP, 0.95).addScaledVector(outward, 0.15);
      const dh = Math.hypot(ball.x - hand.x, ball.z - hand.z);
      const dv = Math.abs(ball.y - hand.y);
      const inRange = dh < REACH_H && dv < REACH_V;
      const pomTheta = Math.atan2(r.hang.x - r.center.x, r.hang.z - r.center.z);
      const ahead = wrap(pomTheta - theta) * (dirSign || 1); // > 0: the pompon is coming
      const inPass = ahead > -0.32 && ahead < 0.85;
      if (ahead < -0.6 && tried) tried = false; // passed: next lap, new try
      // ── pompon visuals
      if (held > 0) {
        held -= dt;
        pom.group.position.lerp(hand, 1 - Math.exp(-14 * dt));
        if (held <= 0) respawn = 0.6;
      } else if (respawn > 0) {
        respawn -= dt;
        const k = clamp(1 - respawn / 0.6, 0, 1);
        pom.group.position.copy(ball);
        pom.group.scale.setScalar(Math.max(0.01, k));
        if (respawn <= 0) {
          pom.group.scale.setScalar(1);
          s.fx.sparkle(ball, '#ffd27a', 12, 0.6);
        }
      } else pom.group.position.copy(ball);
      pom.group.rotation.y += dt * 1.2;
      pom.group.rotation.z = sw.x * 0.6;
      const near = clamp(1 - Math.abs(ahead - 0.2) / 1.1, 0, 1);
      pom.halo.material.opacity = 0.3 + near * 0.35 + (inRange && !tried && held <= 0 ? 0.35 : 0);
      pom.halo.scale.setScalar(0.9 + (inRange ? 0.5 + Math.sin(t * 14) * 0.15 : 0));
      const rm = reach.material as THREE.MeshBasicMaterial;
      rm.opacity = inRange && !tried && held <= 0 && respawn <= 0 ? 0.9 : Math.max(0, rm.opacity - dt * 4);
      reach.position.copy(pom.group.position);
      reach.quaternion.copy(ctx.camera.quaternion);
      reach.scale.setScalar(1 + Math.sin(t * 10) * 0.12);
      // rope from the hanging point to the pompon (or slack while it is in the hand)
      const top = r.hang;
      const end = held > 0 || respawn > 0 ? ball : pom.group.position;
      tmp.subVectors(end, top);
      const len = tmp.length();
      rope.position.copy(top).addScaledVector(tmp, 0.5);
      rope.scale.set(1, len, 1);
      rope.quaternion.setFromUnitVectors(UP, tmp.normalize().negate());
      // ── grab!
      cooldown -= dt;
      let press = s.pressed();
      if (auto) press = auto.outcome === 'win' && inRange && inPass && !tried && held <= 0 && respawn <= 0;
      if (press && cooldown <= 0 && lap < LAPS) {
        cooldown = 0.45;
        try {
          ctx.player.rig.play('wave', { loop: false });
        } catch {
          /* ignore */
        }
        if (held > 0 || respawn > 0 || !inPass) {
          s.ui.float(hand.clone(), 'Attends le pompon…', { cls: 'dim' });
        } else if (tried) {
          s.ui.float(hand.clone(), 'Au prochain tour !', { cls: 'dim' });
        } else {
          tried = true;
          if (inRange) {
            caught++;
            held = 1.6;
            s.sfx('success', { volume: 0.7 });
            chimes.push({ at: t, pitch: PENTA[2] }, { at: t + 0.13, pitch: PENTA[3] }, { at: t + 0.26, pitch: PENTA[5] });
            s.fx.confetti(ball.clone(), 46);
            s.ui.float(ball.clone().addScaledVector(UP, 0.3), 'Un tour gratuit !', { cls: 'big' });
            s.ui.banner('Pompon attrapé !', caught > 1 ? `${caught} tours gratuits` : 'Un tour gratuit !');
            s.cheer('clap');
            try {
              ctx.player.rig.play('cheer', { loop: false });
              ctx.player.rig.emote('happy');
              ctx.audio.music.swell(true);
            } catch {
              /* ignore */
            }
            swell = 2.6;
            s.hud({ score: hudScore() });
          } else {
            s.sfx('whoosh', { volume: 0.4, pitch: 0.9 });
            s.ui.float(hand.clone(), dh < REACH_H * 1.8 ? 'Presque !' : 'Raté…', { cls: 'warm' });
          }
        }
      }
      // little arpeggio after a catch
      for (let i = chimes.length - 1; i >= 0; i--) {
        if (t >= chimes[i].at) {
          s.sfx('chime', { volume: 0.6, pitch: chimes[i].pitch });
          chimes.splice(i, 1);
        }
      }
      if (swell > 0) {
        swell -= dt;
        if (swell <= 0) {
          try {
            ctx.audio.music.swell(false);
          } catch {
            /* ignore */
          }
        }
      }
      return (acc >= LAPS * Math.PI * 2 && held <= 0) || s.time > 80;
    });

    // the ride slows down… (just a breath before the result)
    await s.wait(0.6);
    const won = caught >= 1;
    return {
      won,
      score: caught,
      text: won
        ? caught > 1
          ? `Tu as attrapé le pompon ${caught} fois : ${caught} tours gratuits ! ${s.keeper.cast?.name ?? 'La gardienne'} applaudit.`
          : `Tu as attrapé le pompon ! Selon la tradition de Givrelune, ton prochain tour est offert.`
        : 'Le pompon t’a filé entre les doigts… Remonte en selle quand tu veux, il finira par se laisser attraper !',
    };
  },

  exit(s) {
    const r = rides.get(s);
    return r ? { position: r.board.clone(), yaw: yawTo(r.board, r.center) } : null;
  },
};

/** Sit the visitor on the horse (world transform copied every frame, after the carousel moved). */
function placeRider(s: Session, r: Ride, t: number, dir: number) {
  const seat = seatNow(r, new THREE.Vector3(), t);
  const theta = Math.atan2(seat.x - r.center.x, seat.z - r.center.z);
  const yaw = Math.atan2(dir * Math.cos(theta), -dir * Math.sin(theta));
  const rigSeat = (s.ctx.player.rig as unknown as { seat?: number }).seat;
  const feet = seat.clone().addScaledVector(UP, -(typeof rigSeat === 'number' ? rigSeat : 0.3));
  s.ctx.player.teleport(feet, yaw);
  // the player module keeps its feet on the ground (y = 0): lift the rig onto the saddle ourselves
  // (this system runs after the player's, so the saddle height is what gets rendered)
  s.ctx.player.rig.root.position.copy(feet);
  s.ctx.player.rig.root.rotation.y = yaw;
}

/**
 * Smooth orbit just ahead of the rider, always outside the canopy (never crosses the poles), at about the
 * rider's chest height so the canopy bulbs stay above the frame. If the camera spot is inside something
 * (kiosk, lantern) or the view is blocked, a nearby angle is used instead.
 */
function orbit(s: Session, r: Ride, dir: number, snap: boolean) {
  const seat = seatNow(r, new THREE.Vector3(), 0);
  const theta = Math.atan2(seat.x - r.center.x, seat.z - r.center.z);
  const at = (off: number) => {
    const a = theta + dir * off;
    return new THREE.Vector3(r.center.x + Math.sin(a) * r.camR, r.camY, r.center.z + Math.cos(a) * r.camR);
  };
  r.occT -= 1;
  if (r.occT <= 0 || snap) {
    r.occT = 6;
    const from = seat.clone().setY(seat.y + 0.5);
    const free = (p: THREE.Vector3) => {
      try {
        if (s.ctx.colliders.blocked(p.x, p.z, 0.45)) return false;
      } catch {
        /* ignore */
      }
      if (!r.occluders.length) return true;
      const d = p.clone().sub(from);
      const len = d.length();
      occRay.set(from, d.divideScalar(len));
      occRay.far = len;
      occRay.camera = s.ctx.camera;
      return occRay.intersectObjects(r.occluders, false).length === 0;
    };
    r.camOff = CAM_OFFSETS.find((o) => free(at(o))) ?? CAM_OFFSETS[0];
  }
  const pos = at(r.camOff);
  const aheadA = theta + dir * 0.38;
  const ahead = new THREE.Vector3(r.center.x + Math.sin(aheadA) * r.rideR, seat.y + 0.45, r.center.z + Math.cos(aheadA) * r.rideR);
  const look = seat.clone().setY(seat.y + 0.45).lerp(ahead, 0.35);
  s.cam.k = 3.2;
  s.cam.to(pos, look, 42);
  if (snap) s.cam.snap();
}

const CAM_OFFSETS = [0.62, 0.5, 0.76, 0.4, 0.9, 0.3];
const occRay = new THREE.Raycaster();
