import * as THREE from 'three';
import { glow, mat, std } from '../world/materials';
import { PALETTE } from '../world/palette';
import { textTexture } from '../world/textures';
import { dotTexture } from './fx';
import {
  anchor,
  canvasTexture,
  clamp,
  own,
  probeCounter,
  rand,
  UP,
  yawTo,
  zoneFrame,
  type MinigameDef,
  type Session,
} from './common';

/**
 * Chamboule-Neige — 10 tin cans in a pyramid, 6 snowballs. Aim (mouse / finger / arrows), throw
 * (click, release, Space). Cans: gravity, impulses, tumbling that settles upright or lying, rolling,
 * can–can (spheres), can–counter, can–ground, back curtain. Win with 9 cans knocked down.
 */

const CAN_R = 0.095;
const HH = 0.11; // half height
const SR = 0.111; // can collision sphere
const BALL_R = 0.085;
const G = 9.2;
const BALLS = 6;
const WIN = 9;
const MB = 0.6; // snowball mass
const MC = 0.32; // can mass

interface Can {
  mesh: THREE.Mesh;
  p: THREE.Vector3;
  v: THREE.Vector3;
  q: THREE.Quaternion;
  w: THREE.Vector3;
  home: THREE.Vector3;
  asleep: boolean;
  supporters: number[];
  knocked: boolean;
  grounded: boolean;
  still: number;
}

interface Ball {
  mesh: THREE.Mesh;
  p: THREE.Vector3;
  v: THREE.Vector3;
  age: number;
  alive: boolean;
  hit: Set<number>;
}

interface Stand {
  group: THREE.Group;
  top: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  wallZ: number;
  throwLocal: THREE.Vector3;
  handLocal: THREE.Vector3;
  throwSpot: THREE.Vector3;
  targets: THREE.Vector3;
  fwd: THREE.Vector3;
  right: THREE.Vector3;
  pile: THREE.Mesh[];
  splatTex: THREE.Texture;
  splats: THREE.Mesh[];
}

const stands = new WeakMap<Session, Stand>();

function spots(ctx: Session['ctx']) {
  const f = zoneFrame(ctx, 'fair');
  const targets = anchor(ctx, 'fair:targets', () => ({ position: f.center.clone().addScaledVector(f.out, 2.1), yaw: 0 }));
  const throwSpot = anchor(ctx, 'fair:throw-spot', () => {
    const p = f.center.clone().addScaledVector(f.out, -2.7);
    return { position: p, yaw: yawTo(p, targets.position) };
  });
  return { targets, throwSpot };
}

// ───────────────────────── textures ─────────────────────────

function canTexture(variant: number): THREE.CanvasTexture {
  const bases = ['#c0392b', '#2f6b3f', '#e2b34a', '#3c5a8a'];
  return canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = bases[variant % bases.length];
    g.fillRect(0, 0, w, h);
    const star = (x: number, y: number, r: number, color: string) => {
      g.fillStyle = color;
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        const rr = i % 2 ? r * 0.45 : r;
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
    };
    if (variant === 0) {
      g.fillStyle = '#f3ead8';
      g.fillRect(0, h * 0.34, w, h * 0.32);
      for (let i = 0; i < 6; i++) star(20 + i * 43, h * 0.5, 13, '#e2b34a');
    } else if (variant === 1) {
      g.strokeStyle = '#e2b34a';
      g.lineWidth = 9;
      for (let x = -h; x < w + h; x += 34) {
        g.beginPath();
        g.moveTo(x, h);
        g.lineTo(x + h, 0);
        g.stroke();
      }
    } else if (variant === 2) {
      g.fillStyle = '#b8413a';
      g.fillRect(0, h * 0.38, w, h * 0.24);
      g.fillStyle = '#fff8ea';
      for (let i = 0; i < 14; i++) {
        g.beginPath();
        g.arc((i * w) / 14 + 9, i % 2 ? h * 0.2 : h * 0.8, 5, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      for (let i = 0; i < 7; i++) star(18 + i * 37, i % 2 ? h * 0.32 : h * 0.68, 12, '#f3ead8');
    }
    // tin rims
    const rim = g.createLinearGradient(0, 0, 0, 12);
    rim.addColorStop(0, '#9aa3b2');
    rim.addColorStop(1, '#e8ecf2');
    g.fillStyle = rim;
    g.fillRect(0, 0, w, 10);
    g.fillRect(0, h - 10, w, 10);
  });
}

function stripesTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 64, (g, w, h) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#f3ead8' : '#b8413a';
      g.fillRect((i * w) / 8, 0, w / 8 + 1, h);
    }
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(0, h - 8, w, 8);
  });
}

function curtainTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i <= 8; i++) grd.addColorStop(i / 8, i % 2 ? '#1c2750' : '#263465');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e2b34a';
    for (let i = 0; i < 26; i++) {
      const x = (i * 97) % w;
      const y = (i * 61) % h;
      g.beginPath();
      g.arc(x, y, i % 3 ? 2.2 : 3.5, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function splatTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (g, w) => {
    g.fillStyle = 'rgba(248,251,255,0.95)';
    g.beginPath();
    g.arc(w / 2, w / 2, w * 0.26, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + Math.random() * 0.4;
      const d = w * (0.26 + Math.random() * 0.14);
      g.beginPath();
      g.arc(w / 2 + Math.cos(a) * d, w / 2 + Math.sin(a) * d, w * (0.04 + Math.random() * 0.05), 0, Math.PI * 2);
      g.fill();
    }
  });
}

// ───────────────────────── game ─────────────────────────

export const chamboule: MinigameDef = {
  id: 'chamboule',
  title: 'Chamboule-Neige',
  zone: 'fair',
  keeper: { role: 'fair-keeper', title: 'Forain' },
  rules:
    'Approche, approche ! Six boules de neige, dix boîtes en fer. Renverse au moins neuf boîtes et l’étoile est à toi. Vise bien le bas de la pyramide !',
  hint: (d) =>
    d === 'touch'
      ? 'Pose le doigt pour viser, lève-le pour lancer'
      : d === 'pointer'
        ? 'Vise avec la souris · clic pour lancer'
        : 'Flèches pour viser · Espace pour lancer',

  spot(ctx) {
    return spots(ctx).throwSpot;
  },

  setup(s) {
    const { ctx } = s;
    const { targets, throwSpot } = spots(ctx);
    const T = targets.position.clone().setY(0);
    const P = throwSpot.position.clone().setY(0);
    const group = new THREE.Group();
    group.name = 'mg-chamboule-stand';
    group.position.copy(T);
    group.rotation.y = yawTo(T, P); // local +Z faces the thrower
    s.scope.add(group);
    group.updateMatrixWorld(true);
    const axisX = new THREE.Vector3(1, 0, 0).applyQuaternion(group.quaternion);
    const axisZ = new THREE.Vector3(0, 0, 1).applyQuaternion(group.quaternion);

    // counter: the landmark's if there is one at the targets, else our own little booth
    const found = probeCounter(ctx, T, axisX, axisZ, [group]);
    const anchorTop = targets.fromLandmark && targets.position.y > 0.3 ? targets.position.y : 0;
    let top: number;
    let x0: number, x1: number, z0: number, z1: number, wallZ: number;
    if (found && found.x1 - found.x0 > 0.7 && found.z1 - found.z0 > 0.3) {
      ({ top, x0, x1, z0, z1 } = found);
      if (anchorTop && Math.abs(anchorTop - top) < 0.1) top = anchorTop;
      wallZ = z0 - 0.9;
    } else if (anchorTop) {
      // the landmark says where the counter top is (probing failed): trust it
      top = anchorTop;
      x0 = -0.95;
      x1 = 0.95;
      z0 = -0.32;
      z1 = 0.32;
      wallZ = -1.2;
    } else {
      top = 0.8;
      x0 = -0.95;
      x1 = 0.95;
      z0 = -0.32;
      z1 = 0.32;
      wallZ = -1.0;
      buildBooth(s, group, top);
    }

    // cans
    const variants = [0, 1, 2, 3].map((v) => {
      const tex = s.track(canTexture(v));
      return [own(new THREE.MeshStandardMaterial({ map: tex, metalness: 0.2, roughness: 0.4, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.32 })), std('#cfd5de', { metalness: 0.6, roughness: 0.35 }), std('#cfd5de', { metalness: 0.6, roughness: 0.35 })];
    });
    const canGeo = s.track(new THREE.CylinderGeometry(CAN_R, CAN_R, HH * 2, 18));
    canGeo.userData.shared = true;
    const cans: Can[] = [];
    const rows = [4, 3, 2, 1];
    let idx = 0;
    const rowStart: number[] = [];
    rows.forEach((n, k) => {
      rowStart.push(idx);
      for (let i = 0; i < n; i++) {
        const home = new THREE.Vector3((i - (n - 1) / 2) * 0.224, top + HH + k * HH * 2 + 0.001, 0);
        const mesh = new THREE.Mesh(canGeo, variants[(idx + k) % variants.length]);
        mesh.castShadow = ctx.quality.shadows;
        group.add(mesh);
        const supporters = k === 0 ? [] : [rowStart[k - 1] + i, rowStart[k - 1] + i + 1];
        cans.push({ mesh, p: home.clone(), v: new THREE.Vector3(), q: new THREE.Quaternion().setFromAxisAngle(UP, rand(-0.6, 0.6)), w: new THREE.Vector3(), home, asleep: true, supporters, knocked: false, grounded: false, still: 0 });
        idx++;
      }
    });
    for (const c of cans) {
      c.mesh.position.copy(c.p);
      c.mesh.quaternion.copy(c.q);
    }

    // the visitor + a crate with the snowballs
    const yaw = yawTo(P, T);
    ctx.player.teleport(P, yaw);
    try {
      ctx.player.rig.play('idle');
    } catch {
      /* ignore */
    }
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
    const crate = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.36), mat(PALETTE.woodLight, { flat: true }));
    box.position.y = 0.18;
    crate.add(box);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.38), mat(PALETTE.woodDark));
    band.position.y = 0.3;
    crate.add(band);
    const ballGeo = s.track(new THREE.SphereGeometry(BALL_R, 16, 12));
    ballGeo.userData.shared = true;
    const snowMat = mat('#f4f8ff', { emissive: '#8fa6d8', emissiveIntensity: 0.35 });
    const pile: THREE.Mesh[] = [];
    const pilePos = [
      [-0.1, 0, -0.08],
      [0.1, 0, -0.08],
      [-0.1, 0, 0.09],
      [0.1, 0, 0.09],
      [0, 0.13, -0.0],
      [0, 0.13, 0.0],
    ];
    for (let i = 0; i < BALLS; i++) {
      const b = new THREE.Mesh(ballGeo, snowMat);
      const pp = pilePos[i];
      b.position.set(pp[0] + (i === 5 ? 0.0 : 0), 0.36 + BALL_R + pp[1], pp[2] + (i === 5 ? 0.0 : 0));
      if (i === 5) b.position.set(0, 0.36 + BALL_R * 2.5, 0);
      crate.add(b);
      pile.push(b);
    }
    crate.position.copy(P).addScaledVector(right, 0.62).addScaledVector(fwd, 0.15);
    crate.rotation.y = yaw;
    s.scope.add(crate);

    const throwLocal = group.worldToLocal(P.clone());
    const handWorld = P.clone().addScaledVector(UP, 1.0).addScaledVector(right, 0.22).addScaledVector(fwd, 0.25);
    const st: Stand = {
      group, top, x0, x1, z0, z1, wallZ, throwLocal, handLocal: group.worldToLocal(handWorld.clone()), throwSpot: P, targets: T, fwd, right, pile,
      splatTex: s.track(splatTexture()), splats: [],
    };
    stands.set(s, st);
    (s as unknown as { _cans: Can[] })._cans = cans;

    // camera: static, behind the visitor's shoulder, toward the pyramid
    s.cam.k = 2.5;
    s.cam.to(camPos(st), camLook(st, 0, top + 0.3), 34);
    s.cam.snap();
  },

  async play(s) {
    const { ctx } = s;
    const st = stands.get(s)!;
    const cans = (s as unknown as { _cans: Can[] })._cans;
    const balls: Ball[] = [];
    const auto = s.auto;
    let left = BALLS;
    let cooldown = 0;
    let knocked = 0;
    let lastThrow = -10;
    let allDownAt = -1;
    let nineShown = false;
    let pressStartedInPlay = false;
    let lastPx = ctx.input.pointer.px;
    let lastPy = ctx.input.pointer.py;
    const aim = new THREE.Vector2(0, st.top + 0.2);
    const ballGeo = st.pile[0].geometry;
    const snowMat = st.pile[0].material as THREE.Material;

    // reticle (always on top) + dotted arc preview
    const reticle = new THREE.Group();
    const rMat = own(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27a').multiplyScalar(2.2), transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.098, 40), rMat);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.018, 16), rMat);
    reticle.add(ring, dot);
    for (let i = 0; i < 4; i++) {
      const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.045), rMat);
      const a = (i * Math.PI) / 2;
      tick.position.set(Math.sin(a) * 0.135, Math.cos(a) * 0.135, 0);
      tick.rotation.z = -a;
      reticle.add(tick);
    }
    reticle.traverse((o) => (o.renderOrder = 40));
    reticle.position.z = 0.14;
    s.scope.add(reticle, st.group);
    const ARC_N = 14;
    const arcGeo = new THREE.BufferGeometry();
    arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_N * 3), 3));
    const arc = new THREE.Points(
      arcGeo,
      own(new THREE.PointsMaterial({ map: dotTexture(), color: new THREE.Color('#fff1c2').multiplyScalar(1.6), size: 0.07, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })),
    );
    arc.frustumCulled = false;
    arc.renderOrder = 35;
    s.scope.add(arc, st.group);

    const plane = new THREE.Plane();
    const rc = new THREE.Raycaster();
    const tmp = new THREE.Vector3();
    const tmp2 = new THREE.Vector3();
    const axis = new THREE.Vector3();
    const dq = new THREE.Quaternion();

    const launchVelocity = (to: THREE.Vector3, out: THREE.Vector3) => {
      const d = tmp.subVectors(to, st.handLocal);
      const T = clamp(d.length() / 8.5, 0.42, 0.85);
      return out.copy(d).divideScalar(T).addScaledVector(UP, 0.5 * G * T);
    };

    const updateArc = () => {
      const to = tmp2.set(aim.x, aim.y, 0);
      const v0 = launchVelocity(to, new THREE.Vector3());
      const d = new THREE.Vector3().subVectors(to, st.handLocal);
      const T = clamp(d.length() / 8.5, 0.42, 0.85);
      const arr = arcGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < ARC_N; i++) {
        const t = ((i + 1) / (ARC_N + 1)) * T;
        arr[i * 3] = st.handLocal.x + v0.x * t;
        arr[i * 3 + 1] = st.handLocal.y + v0.y * t - 0.5 * G * t * t;
        arr[i * 3 + 2] = st.handLocal.z + v0.z * t;
      }
      arcGeo.attributes.position.needsUpdate = true;
    };

    const throwBall = () => {
      if (left <= 0 || cooldown > 0) return;
      left--;
      cooldown = 0.75;
      lastThrow = s.time;
      st.pile[left].visible = false;
      const mesh = new THREE.Mesh(ballGeo, snowMat);
      st.group.add(mesh);
      s.scope.onDispose(() => mesh.removeFromParent());
      const b: Ball = { mesh, p: st.handLocal.clone(), v: new THREE.Vector3(), age: 0, alive: true, hit: new Set() };
      launchVelocity(new THREE.Vector3(aim.x, aim.y, 0), b.v);
      mesh.position.copy(b.p);
      balls.push(b);
      s.sfx('throw', { volume: 0.8 });
      try {
        ctx.player.rig.play('throw', { loop: false });
      } catch {
        /* ignore */
      }
      s.hud({ score: scoreText() });
    };

    const scoreText = () => `${knocked}/10 boîtes · ${left} boule${left > 1 ? 's' : ''}`;
    s.hud({ score: scoreText() });

    const wake = (c: Can) => {
      if (!c.asleep) return;
      c.asleep = false;
      c.still = 0;
      c.supporters = [];
    };

    const splat = (p: THREE.Vector3, normal: 'z' | 'y') => {
      s.fx.puff(st.group.localToWorld(p.clone()), 18, 1.1);
      s.sfx('snow-hit', { volume: 0.6 });
      if (st.splats.length >= 10) return;
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), own(new THREE.MeshBasicMaterial({ map: st.splatTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 })));
      m.position.copy(p);
      if (normal === 'y') {
        m.rotation.x = -Math.PI / 2;
        m.position.y += 0.004;
      } else m.position.z += 0.012;
      m.rotation.z = Math.random() * 6;
      m.scale.setScalar(rand(0.8, 1.3));
      s.scope.add(m, st.group);
      st.splats.push(m);
    };

    const onCounter = (p: THREE.Vector3) => p.x > st.x0 && p.x < st.x1 && p.z > st.z0 && p.z < st.z1;

    const stepCan = (c: Can, h: number, i: number) => {
      if (c.asleep) return;
      c.v.y -= G * h;
      c.p.addScaledVector(c.v, h);
      const wl = c.w.length();
      if (wl > 1e-5) {
        dq.setFromAxisAngle(tmp.copy(c.w).divideScalar(wl), wl * h);
        c.q.premultiply(dq).normalize();
      }
      axis.set(0, 1, 0).applyQuaternion(c.q);
      const ay = Math.abs(axis.y);
      const off = HH * ay + CAN_R * Math.sqrt(Math.max(0, 1 - ay * ay));
      const over = onCounter(c.p);
      // inside the counter body (rolled under it from the side): push out
      if (over && c.p.y < st.top - 0.03) {
        const pens = [c.p.x - st.x0, st.x1 - c.p.x, c.p.z - st.z0, st.z1 - c.p.z];
        const k = pens.indexOf(Math.min(...pens));
        if (k === 0) (c.p.x = st.x0 - 0.01), (c.v.x = -Math.abs(c.v.x) * 0.3);
        else if (k === 1) (c.p.x = st.x1 + 0.01), (c.v.x = Math.abs(c.v.x) * 0.3);
        else if (k === 2) (c.p.z = st.z0 - 0.01), (c.v.z = -Math.abs(c.v.z) * 0.3);
        else (c.p.z = st.z1 + 0.01), (c.v.z = Math.abs(c.v.z) * 0.3);
      }
      const floor = onCounter(c.p) ? st.top : 0;
      let contact = false;
      if (c.p.y - off < floor) {
        contact = true;
        c.p.y = floor + off;
        if (c.v.y < 0) {
          const impact = -c.v.y;
          c.v.y = impact > 0.7 ? impact * 0.22 : 0;
          if (floor === 0 && !c.grounded) {
            c.grounded = true;
            s.sfx('can-fall', { volume: clamp(0.3 + impact * 0.12, 0.3, 0.9), pitch: rand(0.9, 1.15) });
            s.fx.puff(st.group.localToWorld(tmp.copy(c.p).setY(0.05)), 10, 0.8);
          } else if (impact > 1.2) s.sfx('can-fall', { volume: 0.25, pitch: 1.4 });
        }
        const fr = floor === 0 ? 6 : 2.2;
        const k = Math.exp(-fr * h);
        // friction at the base of a sliding upright can tips it over in the direction it slides
        const vhLen = Math.hypot(c.v.x, c.v.z);
        if (ay > 0.5 && vhLen > 0.25) c.w.addScaledVector(tmp2.set(c.v.z, 0, -c.v.x).divideScalar(vhLen), Math.min(3, vhLen) * 38 * h);
        c.v.x *= k;
        c.v.z *= k;
        // settle: upright if nearly upright, else lying on its side
        const target = ay > 0.82 ? tmp.set(0, Math.sign(axis.y) || 1, 0) : tmp.set(axis.x, 0, axis.z).normalize();
        const corr = tmp2.crossVectors(axis, target);
        // split ω into roll (about the axis) and tumble
        const rollMag = c.w.dot(axis);
        const tumble = c.w.clone().addScaledVector(axis, -rollMag);
        tumble.multiplyScalar(Math.exp(-7 * h)).addScaledVector(corr, (ay > 0.82 ? 30 : 55) * h);
        let roll = rollMag;
        if (ay < 0.35) {
          // rolling without slipping across its axis
          const ah = tmp.set(axis.x, 0, axis.z).normalize();
          const vh = new THREE.Vector3(c.v.x, 0, c.v.z);
          const vPerp = vh.addScaledVector(ah, -vh.dot(ah));
          const wRoll = new THREE.Vector3().crossVectors(UP, vPerp).divideScalar(CAN_R);
          roll = lerpN(rollMag, wRoll.dot(axis), 1 - Math.exp(-18 * h));
          // and slide less along the axis
          const along = c.v.x * ah.x + c.v.z * ah.z;
          c.v.x -= ah.x * along * (1 - Math.exp(-5 * h));
          c.v.z -= ah.z * along * (1 - Math.exp(-5 * h));
        } else roll *= Math.exp(-6 * h);
        c.w.copy(tumble).addScaledVector(axis, roll);
      } else c.w.multiplyScalar(Math.exp(-0.3 * h));
      // back curtain
      if (c.p.z - SR < st.wallZ) {
        c.p.z = st.wallZ + SR;
        if (c.v.z < 0) c.v.z = -c.v.z * 0.3;
      }
      // sleep
      if (contact && c.v.lengthSq() < 0.004 && c.w.lengthSq() < 0.15) {
        c.still += h;
        if (c.still > 0.45) {
          c.asleep = true;
          c.v.set(0, 0, 0);
          c.w.set(0, 0, 0);
        }
      } else c.still = 0;
      void i;
    };

    const collideCans = () => {
      for (let i = 0; i < cans.length; i++) {
        const a = cans[i];
        for (let j = i + 1; j < cans.length; j++) {
          const b = cans[j];
          if (a.asleep && b.asleep) continue;
          const d = tmp.subVectors(b.p, a.p);
          const dist = d.length();
          if (dist >= SR * 2 || dist < 1e-6) continue;
          const n = d.divideScalar(dist);
          const pen = SR * 2 - dist;
          const rel = tmp2.subVectors(b.v, a.v).dot(n);
          const sleeper = a.asleep ? a : b.asleep ? b : null;
          if (sleeper && Math.abs(rel) < 0.25 && pen < 0.02) {
            // rest against a sleeping can
            const mover = sleeper === a ? b : a;
            const sgn = mover === b ? 1 : -1;
            mover.p.addScaledVector(n, pen * sgn);
            const vn = mover.v.dot(n) * sgn;
            if (vn < 0) mover.v.addScaledVector(n, -vn * sgn * 1.2);
            continue;
          }
          wake(a);
          wake(b);
          a.p.addScaledVector(n, -pen / 2);
          b.p.addScaledVector(n, pen / 2);
          if (rel < 0) {
            const imp = (-(1 + 0.3) * rel) / 2;
            a.v.addScaledVector(n, -imp);
            b.v.addScaledVector(n, imp);
            const tq = new THREE.Vector3().crossVectors(n, UP).multiplyScalar(imp * 9);
            a.w.add(tq);
            b.w.sub(tq);
            if (imp > 0.6) s.sfx('can-fall', { volume: 0.2, pitch: rand(1.5, 1.9) });
          }
        }
      }
    };

    const stepBall = (b: Ball, h: number) => {
      b.age += h;
      b.v.y -= G * h;
      b.p.addScaledVector(b.v, h);
      for (let i = 0; i < cans.length; i++) {
        const c = cans[i];
        const d = tmp.subVectors(c.p, b.p);
        const dist = d.length();
        if (dist >= SR + BALL_R || dist < 1e-6) continue;
        const n = d.divideScalar(dist);
        const vr = tmp2.subVectors(b.v, c.v).dot(n);
        c.p.copy(b.p).addScaledVector(n, SR + BALL_R + 0.001);
        if (vr <= 0) continue;
        wake(c);
        const J = ((1 + 0.45) * vr) / (1 / MB + 1 / MC);
        c.v.addScaledVector(n, J / MC);
        c.v.y += 0.9;
        c.v.z -= 0.8; // a little extra shove toward the back of the counter
        b.v.addScaledVector(n, -J / MB);
        // tumble: the top of the can goes the way it is pushed
        c.w.add(new THREE.Vector3().crossVectors(UP, n).multiplyScalar(rand(10, 18))).add(new THREE.Vector3(rand(-3, 3), rand(-3, 3), rand(-3, 3)));
        if (!b.hit.has(i)) {
          b.hit.add(i);
          const wp = st.group.localToWorld(tmp.copy(b.p).addScaledVector(n, BALL_R));
          s.fx.puff(wp, 14, 1);
          s.sfx('snow-hit', { volume: 0.75, pitch: rand(0.9, 1.1) });
          if (!ctx.save.data.settings.reducedMotion) ctx.cameraRig.shake(0.035, 0.18);
        }
      }
      // splats: counter top, ground, curtain
      if (onCounter(b.p) && b.p.y - BALL_R < st.top && b.p.y > st.top - 0.2) {
        b.p.y = st.top;
        splat(b.p, 'y');
        b.alive = false;
      } else if (b.p.y - BALL_R < 0) {
        b.p.y = 0.01;
        splat(b.p, 'y');
        b.alive = false;
      } else if (b.p.z - BALL_R < st.wallZ) {
        b.p.z = st.wallZ;
        splat(b.p, 'z');
        b.alive = false;
      } else if (b.age > 3) b.alive = false;
      if (!b.alive) b.mesh.visible = false;
      else {
        b.mesh.position.copy(b.p);
        b.mesh.rotation.x += h * 12;
      }
    };

    const countKnocked = () => {
      let n = 0;
      for (const c of cans) {
        if (!c.knocked) {
          axis.set(0, 1, 0).applyQuaternion(c.q);
          const moved = Math.hypot(c.p.x - c.home.x, c.p.z - c.home.z);
          if (c.p.y < st.top - 0.05 || (Math.abs(axis.y) < 0.5 && moved > 0.05) || moved > 0.32 || c.p.y < c.home.y - 0.12) {
            c.knocked = true;
            s.fx.sparkle(st.group.localToWorld(tmp.copy(c.p)), '#ffd27a', 8, 0.6);
          }
        }
        if (c.knocked) n++;
      }
      return n;
    };

    // autoplay: aim at the lowest standing can (win) or far off to the side (lose)
    const autoAim = (): THREE.Vector2 => {
      if (auto?.outcome === 'lose') return new THREE.Vector2(0.95, st.top + 1.05);
      let best: Can | null = null;
      for (const c of cans) if (!c.knocked && (!best || c.p.y < best.p.y - 0.05 || (Math.abs(c.p.y - best.p.y) < 0.05 && Math.abs(c.p.x) < Math.abs(best.p.x)))) best = c;
      return best ? new THREE.Vector2(best.p.x, best.p.y) : new THREE.Vector2(0, st.top + 0.15);
    };

    await s.loop((dt) => {
      cooldown -= dt;
      // ── aiming
      const inp = ctx.input;
      const pt = inp.pointer;
      const blocked = ctx.ui.isBlocking();
      if (auto) {
        const target = autoAim();
        aim.lerp(target, 1 - Math.exp(-8 * dt));
        if (cooldown <= -0.45 && aim.distanceTo(target) < 0.03 && left > 0) throwBall();
      } else if (!blocked) {
        const hold = s.hold;
        let ray: THREE.Vector2 | null = null;
        if (hold.down) ray = new THREE.Vector2(hold.x, hold.y); // finger / pressed button: aim under it
        else if (pt.type !== 'touch' && (pt.px !== lastPx || pt.py !== lastPy)) ray = new THREE.Vector2(pt.x, pt.y); // mouse hover
        else if (inp.move.x || inp.move.y) {
          aim.x += inp.move.x * 1.1 * dt;
          aim.y += inp.move.y * 0.9 * dt;
        }
        if (hold.released && pressStartedInPlay) ray = new THREE.Vector2(hold.x, hold.y);
        if (ray) {
          rc.setFromCamera(ray, ctx.camera);
          const n = new THREE.Vector3(0, 0, 1).applyQuaternion(st.group.quaternion);
          plane.setFromNormalAndCoplanarPoint(n, st.targets);
          if (rc.ray.intersectPlane(plane, tmp)) {
            st.group.worldToLocal(tmp);
            aim.set(tmp.x, tmp.y);
          }
        }
        lastPx = pt.px;
        lastPy = pt.py;
        if (hold.down) pressStartedInPlay = true;
        // throw: release of a press that started during play, or Space / E / Enter / the action button
        if (hold.released && pressStartedInPlay) {
          pressStartedInPlay = false;
          aim.x = clamp(aim.x, st.x0 - 0.15, st.x1 + 0.15);
          aim.y = clamp(aim.y, st.top + 0.03, st.top + 1.25);
          throwBall();
        } else if (inp.pressed('interact')) throwBall();
      }
      aim.x = clamp(aim.x, st.x0 - 0.15, st.x1 + 0.15);
      aim.y = clamp(aim.y, st.top + 0.03, st.top + 1.25);
      reticle.position.set(aim.x, aim.y, 0.14);
      const ready = left > 0 && cooldown <= 0;
      reticle.scale.setScalar((ready ? 1 : 0.75) * (1 + Math.sin(s.time * 6) * 0.06));
      rMat.opacity = ready ? 0.95 : 0.35;
      arc.visible = ready;
      if (ready) updateArc();
      // ── physics
      const steps = Math.min(120, Math.max(2, Math.ceil(dt / (1 / 240))));
      const h = dt / steps;
      for (let k = 0; k < steps; k++) {
        for (const b of balls) if (b.alive) stepBall(b, h);
        cans.forEach((c, i) => stepCan(c, h, i));
        collideCans();
      }
      // pyramid cans lose their support → wake
      for (const c of cans) {
        if (!c.asleep || !c.supporters.length) continue;
        if (c.supporters.some((j) => !cans[j].asleep || cans[j].p.distanceTo(cans[j].home) > 0.03)) {
          wake(c);
          c.w.set(rand(-1, 1), 0, rand(-1, 1));
        }
      }
      for (const c of cans) {
        c.mesh.position.copy(c.p);
        c.mesh.quaternion.copy(c.q);
      }
      for (const b of balls) if (b.alive && Math.random() < 0.9) s.fx.soft.emit(st.group.localToWorld(tmp.copy(b.p)), { count: 1, color: '#f4f8ff', alpha: 0.6, speed: [0, 0.1], life: [0.25, 0.4], size: [0.05, 0.08], sizeEnd: 0.3 });
      // ── score
      const n = countKnocked();
      if (n !== knocked) {
        knocked = n;
        s.hud({ score: scoreText() });
        if (knocked >= WIN && !nineShown) {
          nineShown = true;
          s.ui.banner(knocked >= 10 ? 'Carton plein !' : 'Bravo !', knocked >= 10 ? undefined : 'Encore une pour le carton plein ?');
          s.sfx('success', { volume: 0.5 });
          s.cheer('clap');
        } else if (knocked >= 10 && nineShown) s.ui.banner('Carton plein !');
      }
      // ── end
      if (knocked >= 10 && allDownAt < 0) allDownAt = s.time;
      if (allDownAt >= 0 && s.time - allDownAt > 1.6) return true;
      if (left === 0 && !balls.some((b) => b.alive)) {
        const settled = cans.every((c) => c.asleep);
        if ((settled && s.time - lastThrow > 1.2) || s.time - lastThrow > 4) return true;
      }
      // safety: the visitor wanders off mentally
      return s.time > 90;
    });

    reticle.visible = false;
    arc.visible = false;
    const won = knocked >= WIN;
    if (won) {
      try {
        ctx.player.rig.play('cheer', { loop: false });
      } catch {
        /* ignore */
      }
      s.fx.confetti(st.group.localToWorld(new THREE.Vector3(0, st.top + 0.6, 0)), 40);
    }
    await s.wait(0.9);
    const name = s.keeper.cast?.name ?? 'Le forain';
    return {
      won,
      score: knocked,
      text: won
        ? `${knocked} boîtes renversées sur 10 ! ${name} soulève son chapeau : quel bras !`
        : `${knocked} boîte${knocked > 1 ? 's' : ''} renversée${knocked > 1 ? 's' : ''} sur 10… il en fallait ${WIN}. Les boules de neige t’attendent pour la revanche !`,
    };
  },

  exit(s) {
    const st = stands.get(s);
    return st ? { position: st.throwSpot.clone(), yaw: yawTo(st.throwSpot, st.targets) } : null;
  },
};

function lerpN(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function camPos(st: Stand) {
  return st.throwSpot.clone().addScaledVector(st.fwd, -1.5).addScaledVector(UP, 2.0).addScaledVector(st.right, 0.78);
}
function camLook(st: Stand, x: number, y: number) {
  return st.group.localToWorld(new THREE.Vector3(x * 0.2, y, 0));
}

/** Our own little booth (when the landmark has no counter at the targets). */
function buildBooth(s: Session, group: THREE.Group, top: number) {
  const W = 1.9;
  const D = 0.64;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, top - 0.05, D), mat(PALETTE.wood));
  body.position.y = (top - 0.05) / 2;
  group.add(body);
  const plank = new THREE.Mesh(new THREE.BoxGeometry(W + 0.08, 0.05, D + 0.08), mat(PALETTE.woodLight));
  plank.position.y = top - 0.025;
  group.add(plank);
  const skirtTex = s.track(stripesTexture());
  skirtTex.wrapS = THREE.RepeatWrapping;
  skirtTex.repeat.set(2, 1);
  const skirt = new THREE.Mesh(new THREE.PlaneGeometry(W, top - 0.12), own(new THREE.MeshLambertMaterial({ map: skirtTex })));
  skirt.position.set(0, (top - 0.12) / 2 + 0.02, D / 2 + 0.005);
  group.add(skirt);
  // back curtain + posts + banner + bulbs
  const curtainTex = s.track(curtainTexture());
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.9), own(new THREE.MeshLambertMaterial({ map: curtainTex })));
  curtain.position.set(0, 0.95, -1.0);
  group.add(curtain);
  for (const x of [-1.2, 1.2]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.4, 10), mat(PALETTE.woodDark));
    post.position.set(x, 1.2, -0.98);
    group.add(post);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), mat(PALETTE.gold, { emissive: '#7a5a10', emissiveIntensity: 0.4 }));
    cap.position.set(x, 2.45, -0.98);
    group.add(cap);
  }
  const signTex = s.track(textTexture('Chamboule-Neige', { width: 512, height: 128, background: PALETTE.red, color: '#fff3dc', border: PALETTE.gold, size: 58 }));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.48), own(new THREE.MeshBasicMaterial({ map: signTex, color: '#d8d0c4' })));
  sign.position.set(0, 2.15, -0.95);
  group.add(sign);
  const bulbGeo = new THREE.SphereGeometry(0.035, 8, 6);
  const bulbMat = glow(PALETTE.warm, 3);
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, 11);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 11; i++) {
    const x = -1.15 + (i / 10) * 2.3;
    m4.makeTranslation(x, 1.86 - Math.sin((i / 10) * Math.PI) * 0.12, -0.93);
    bulbs.setMatrixAt(i, m4);
  }
  group.add(bulbs);
  // a few colliders so nobody walks through the booth (removed with the stand)
  const ctx = s.ctx;
  const wp = group.position;
  try {
    const id = ctx.colliders.addBox(wp.x, wp.z, W / 2 + 0.05, 0.62, group.rotation.y, 'prop');
    s.scope.onDispose(() => ctx.colliders.remove(id));
  } catch {
    /* ignore */
  }
}
