import * as THREE from 'three';
import type { GameContext } from '../core/contracts';
import { glow, mat, std } from '../world/materials';
import { PALETTE } from '../world/palette';
import { glowSprite } from '../world/textures';
import {
  anchor,
  canvasTexture,
  clamp,
  easeOutBack,
  own,
  rand,
  shuffle,
  smooth,
  surfaceHeight,
  UP,
  yawTo,
  zoneFrame,
  type MinigameDef,
  type Session,
} from './common';

/**
 * Le Souffle du Verrier — hold to blow (Space / mouse / finger), release to let the glass settle:
 * keep the glowing bubble inside the moving ring. It cools into a colourful ornament that is kept
 * as a keepsake (save flag `verrier:ornaments`) and hangs on a little rack by the bench.
 * 3 baubles, win with 2 good ones.
 */

const BAUBLES = 3;
const WIN = 2;
const BLOW = 9;
const GRACE = 1.2;
const TOL = 0.022;
const GROW = 0.085;
const SHRINK = 0.055;
const S_MIN = 0.045;
const S_MAX = 0.3;
const RING_PLANE = 0.36;
const FLAG = 'verrier:ornaments';
const MAX_KEEP = 12;

const COLORS = ['#c0392b', '#2f6fb0', '#2f8a5b', '#e2b34a', '#8a4fa0', '#d9577a', '#3fa7b5', '#eef2ff'];

interface Keepsake {
  c: string;
  p: number;
  q: number;
}

// ───────────────────────── places ─────────────────────────

function spots(ctx: GameContext) {
  const f = zoneFrame(ctx, 'workshop');
  const furnace = anchor(ctx, 'workshop:furnace', () => ({ position: f.center.clone().addScaledVector(f.out, 2.6).addScaledVector(f.right, 0.4), yaw: 0 }));
  const bench = anchor(ctx, 'workshop:bench-spot', () => {
    const p = f.center.clone().addScaledVector(f.out, -0.6);
    return { position: p, yaw: yawTo(p, furnace.position) };
  });
  const toFurnace = new THREE.Vector3(furnace.position.x - bench.position.x, 0, furnace.position.z - bench.position.z);
  if (toFurnace.lengthSq() < 1e-4) toFurnace.set(Math.sin(bench.yaw), 0, Math.cos(bench.yaw));
  toFurnace.normalize();
  let fwd: THREE.Vector3;
  let side: THREE.Vector3;
  const facing = new THREE.Vector3(Math.sin(bench.yaw), 0, Math.cos(bench.yaw));
  if (bench.fromLandmark) {
    // the visitor faces the workbench: blow along its front edge, on the furnace side; the camera looks from the front
    const p = new THREE.Vector3().crossVectors(facing, UP).normalize();
    fwd = p.dot(toFurnace) >= 0 ? p : p.negate();
    side = facing.clone().negate();
  } else {
    fwd = toFurnace;
    side = new THREE.Vector3().crossVectors(fwd, UP).normalize();
  }
  return { furnace, bench, fwd, side, facing };
}

// ───────────────────────── ornaments ─────────────────────────

let sharedSphere: THREE.SphereGeometry | null = null;
function sphereGeo() {
  if (!sharedSphere) {
    sharedSphere = new THREE.SphereGeometry(1, 32, 22);
    sharedSphere.userData.shared = true;
  }
  return sharedSphere;
}

function ornamentTexture(color: string, pattern: number): THREE.CanvasTexture {
  return canvasTexture(256, 128, (g, w, h) => {
    const base = new THREE.Color(color);
    const light = '#' + base.clone().lerp(new THREE.Color('#ffffff'), 0.35).getHexString();
    const dark = '#' + base.clone().multiplyScalar(0.7).getHexString();
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, dark);
    grd.addColorStop(0.5, color);
    grd.addColorStop(1, dark);
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    const gold = color === '#e2b34a' ? '#fff3dc' : '#e9bd52';
    if (pattern === 0) {
      g.fillStyle = gold;
      g.fillRect(0, h * 0.36, w, h * 0.06);
      g.fillRect(0, h * 0.58, w, h * 0.06);
      for (let i = 0; i < 12; i++) {
        g.beginPath();
        g.arc((i + 0.5) * (w / 12), h * 0.5, 4, 0, Math.PI * 2);
        g.fill();
      }
    } else if (pattern === 1) {
      g.strokeStyle = '#fff8ea';
      g.lineWidth = 2.5;
      for (let i = 0; i < 8; i++) {
        const cx = (i + 0.5) * (w / 8);
        const cy = h * (i % 2 ? 0.38 : 0.62);
        for (let k = 0; k < 3; k++) {
          const a = (k * Math.PI) / 3;
          g.beginPath();
          g.moveTo(cx - Math.cos(a) * 9, cy - Math.sin(a) * 9);
          g.lineTo(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9);
          g.stroke();
        }
      }
    } else if (pattern === 2) {
      g.strokeStyle = light;
      g.lineWidth = 9;
      for (let x = -h; x < w + h; x += 32) {
        g.beginPath();
        g.moveTo(x, 0);
        g.bezierCurveTo(x + 16, h * 0.33, x - 16, h * 0.66, x + 8, h);
        g.stroke();
      }
      g.fillStyle = gold;
      g.fillRect(0, h * 0.47, w, h * 0.06);
    } else {
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(0, h * 0.2, w, h * 0.08);
    }
  });
}

/** A glass ornament with its golden cap and hook. Local +Y = cap. */
function makeOrnament(k: Keepsake, radius: number, track: (t: THREE.Texture) => void) {
  const g = new THREE.Group();
  const tex = ornamentTexture(k.c, k.p);
  track(tex);
  const m = own(new THREE.MeshStandardMaterial({ map: tex, metalness: 0.3, roughness: 0.16, emissive: new THREE.Color(k.c), emissiveIntensity: 0.22 }));
  const ball = new THREE.Mesh(sphereGeo(), m);
  ball.scale.setScalar(radius);
  if (k.q === 0) ball.scale.set(radius * 1.12, radius * 0.86, radius * 1.02);
  g.add(ball);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.22, radius * 0.26, radius * 0.25, 12), std(PALETTE.gold, { metalness: 0.8, roughness: 0.3 }));
  cap.position.y = radius * (k.q === 0 ? 0.92 : 1.02);
  g.add(cap);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.12, radius * 0.035, 6, 12), std(PALETTE.gold, { metalness: 0.8, roughness: 0.3 }));
  hook.position.y = cap.position.y + radius * 0.2;
  g.add(hook);
  return { group: g, ball, material: m };
}

function loadKeepsakes(ctx: GameContext): Keepsake[] {
  try {
    const raw = ctx.save.data.flags[FLAG];
    const arr = typeof raw === 'string' ? (JSON.parse(raw) as Keepsake[]) : [];
    return Array.isArray(arr) ? arr.filter((k) => typeof k?.c === 'string').slice(-MAX_KEEP) : [];
  } catch {
    return [];
  }
}

// ───────────────────────── the keepsake rack (persistent) ─────────────────────────

let rack: { group: THREE.Group; off: () => void; textures: THREE.Texture[] } | null = null;

function rackFrame(ctx: GameContext) {
  const { bench, fwd, side } = spots(ctx);
  if (bench.fromLandmark) {
    // beside the visitor, on the other side of the blowpipe, facing the alley
    const pos = bench.position.clone().setY(0).addScaledVector(fwd, -1.3).addScaledVector(side, -0.1);
    return { pos, yaw: Math.atan2(side.x, side.z) };
  }
  const pos = bench.position.clone().setY(0).addScaledVector(side, -1.25).addScaledVector(fwd, 0.25);
  return { pos, yaw: Math.atan2(side.x, side.z) };
}

/** Local position of hook i on the rack. */
function hookLocal(i: number) {
  const row = i < 6 ? 0 : 1;
  const j = i % 6;
  return new THREE.Vector3(-0.45 + j * 0.18, row === 0 ? 1.42 : 1.02, 0);
}
function stringLen(i: number) {
  return 0.14 + ((i * 7) % 3) * 0.06;
}

function buildRack(ctx: GameContext) {
  if (rack) {
    rack.off();
    rack.group.removeFromParent();
    rack.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
      const mm = m.material as THREE.Material | undefined;
      if (mm?.userData.owned) mm.dispose();
    });
    rack.textures.forEach((t) => t.dispose());
    rack = null;
  }
  const list = loadKeepsakes(ctx);
  if (!list.length) return;
  const { pos, yaw } = rackFrame(ctx);
  const group = new THREE.Group();
  group.name = 'mg-verrier-keepsakes';
  group.position.copy(pos);
  group.rotation.y = yaw;
  const wood = mat(PALETTE.woodLight);
  for (const x of [-0.58, 0.58]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.55, 8), mat(PALETTE.wood));
    post.position.set(x, 0.775, 0);
    group.add(post);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.42), mat(PALETTE.woodDark));
    foot.position.set(x, 0.025, 0);
    group.add(foot);
  }
  for (const y of [1.5, 1.1]) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.24, 8), wood);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, y, 0);
    group.add(bar);
  }
  const sign = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), glow(PALETTE.warm, 2.5));
  sign.position.set(0, 1.58, 0);
  group.add(sign);
  const textures: THREE.Texture[] = [];
  const swings: { pivot: THREE.Group; phase: number }[] = [];
  list.forEach((k, i) => {
    const pivot = new THREE.Group();
    const h = hookLocal(i);
    pivot.position.copy(h).setY(h.y + (i < 6 ? 0.08 : 0.08));
    const len = stringLen(i);
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, len, 4), mat('#f3ead8'));
    str.position.y = -len / 2;
    pivot.add(str);
    const o = makeOrnament(k, 0.075, (t) => textures.push(t));
    o.group.position.y = -len - 0.075 * 1.25;
    pivot.add(o.group);
    group.add(pivot);
    swings.push({ pivot, phase: i * 1.7 });
  });
  ctx.scene.add(group);
  const off = ctx.addSystem((_dt, t) => {
    for (const s of swings) {
      s.pivot.rotation.z = Math.sin(t * 1.1 + s.phase) * 0.07;
      s.pivot.rotation.x = Math.sin(t * 0.8 + s.phase * 1.3) * 0.05;
    }
  });
  rack = { group, off, textures };
}

// ───────────────────────── ring shader ─────────────────────────

function ringMaterial() {
  return own(
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color('#cfe4ff') }, uInner: { value: 0.3 }, uOuter: { value: 0.4 }, uAlpha: { value: 0 }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uInner, uOuter, uAlpha, uTime;
        varying vec2 vUv;
        void main(){
          vec2 p = vUv - 0.5;
          float d = length(p) * 2.0;
          float band = smoothstep(uInner - 0.01, uInner, d) * (1.0 - smoothstep(uOuter, uOuter + 0.01, d));
          float e1 = exp(-pow((d - uInner) / 0.01, 2.0));
          float e2 = exp(-pow((d - uOuter) / 0.01, 2.0));
          float ang = atan(p.y, p.x);
          float dash = 0.65 + 0.35 * sin(ang * 18.0 + uTime * 3.0);
          float a = band * 0.28 + (e1 + e2) * dash;
          gl_FragColor = vec4(uColor * (1.4 + (e1 + e2) * 1.8), min(1.0, a) * uAlpha);
        }`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
}

// ───────────────────────── game ─────────────────────────

interface Bench {
  bench: THREE.Vector3;
  fwd: THREE.Vector3;
  side: THREE.Vector3;
  facing: THREE.Vector3;
  tip: THREE.Vector3;
  furnaceGlow: THREE.Sprite | null;
}
const benches = new WeakMap<Session, Bench>();

export const verrier: MinigameDef = {
  id: 'verrier',
  title: 'Le Souffle du Verrier',
  zone: 'workshop',
  keeper: { role: 'glassblower', title: 'Maître verrier' },
  rules:
    'Souffle doucement dans la canne : maintiens pour gonfler, relâche pour laisser le verre se reposer. Garde la bulle dans l’anneau lumineux, il bouge ! Réussis deux boules sur trois.',
  hint: (d) =>
    d === 'touch'
      ? 'Garde le doigt appuyé pour souffler, lève-le pour relâcher'
      : d === 'pointer'
        ? 'Maintiens le clic pour souffler, relâche pour laisser refroidir'
        : 'Maintiens Espace pour souffler, relâche pour laisser refroidir',

  spot(ctx) {
    return spots(ctx).bench;
  },

  boot(ctx) {
    buildRack(ctx);
  },

  setup(s) {
    const { ctx } = s;
    const { furnace, bench, fwd, side, facing } = spots(ctx);
    const B = bench.position.clone().setY(0);
    ctx.player.teleport(B, Math.atan2(fwd.x, fwd.z));
    try {
      ctx.player.rig.play('craft');
    } catch {
      /* ignore */
    }
    const mouth = B.clone().addScaledVector(fwd, 0.2).addScaledVector(UP, 0.86);
    const tip = B.clone().addScaledVector(fwd, 1.02).addScaledVector(UP, 0.8);
    // blowpipe (steel + wooden grip)
    const dir = new THREE.Vector3().subVectors(tip, mouth);
    const len = dir.length();
    dir.normalize();
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, len, 8), std('#8d939c', { metalness: 0.85, roughness: 0.35 }));
    pipe.position.copy(mouth).addScaledVector(dir, len / 2);
    pipe.quaternion.setFromUnitVectors(UP, dir);
    s.scope.add(pipe);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.26, 10), mat(PALETTE.woodDark));
    grip.position.copy(mouth).addScaledVector(dir, 0.2);
    grip.quaternion.copy(pipe.quaternion);
    s.scope.add(grip);
    // a little furnace when the workshop has none
    const F = furnace.position.clone().setY(0);
    let furnaceGlow: THREE.Sprite | null = null;
    const hasFurnace = furnace.fromLandmark || surfaceHeight(ctx, F.x, F.z, 2) > 0.35;
    if (!hasFurnace) {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#7a6a62', { flat: true }));
      dome.position.copy(F);
      s.scope.add(dome);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.82, 0.25, 14), mat('#5c4e48', { flat: true }));
      base.position.copy(F).setY(0.12);
      s.scope.add(base);
      const mouthGlow = new THREE.Mesh(new THREE.CircleGeometry(0.24, 20), glow('#ff8a2a', 3.2));
      mouthGlow.position.copy(F).addScaledVector(fwd, -0.66).setY(0.42);
      mouthGlow.lookAt(B.clone().setY(0.42));
      s.scope.add(mouthGlow);
      const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.9, 10), mat('#4a3e3a'));
      chim.position.copy(F).setY(0.95);
      s.scope.add(chim);
      furnaceGlow = glowSprite('#ff9a3a', 2.6, 0.7);
      own(furnaceGlow.material);
      furnaceGlow.position.copy(F).addScaledVector(fwd, -0.75).setY(0.45);
      s.scope.add(furnaceGlow);
    }
    benches.set(s, { bench: B, fwd, side, facing, tip, furnaceGlow });
    // three-quarter view of the bubble and the visitor, the workshop and its furnace glowing behind
    // frame the visitor's head, the blowpipe and the bubble together
    const look = tip.clone().addScaledVector(fwd, -0.18).addScaledVector(UP, 0.08);
    s.cam.k = 2.6;
    s.cam.to(look.clone().addScaledVector(side, 2.55).addScaledVector(fwd, 0.3).addScaledVector(UP, 0.5), look, 36);
    s.cam.snap();
  },

  async play(s) {
    const { ctx } = s;
    const b = benches.get(s)!;
    const auto = s.auto;
    const colors = shuffle([...COLORS]);
    let good = 0;
    let total = 0;
    const made: Keepsake[] = [];
    const tmp = new THREE.Vector3();
    // furnace flicker
    s.every((_dt, t) => {
      if (b.furnaceGlow) b.furnaceGlow.material.opacity = 0.6 + Math.sin(t * 7) * 0.08 + Math.sin(t * 13) * 0.05;
    });

    // HUD widgets
    const panel = s.ui.el('div', 'gmg-panel hidden');
    const pill = s.ui.el('div', 'gmg-pill', 'Souffle !', panel);
    const meter = s.ui.el('div', 'gmg-meter', '', panel);
    const fill = s.ui.el('div', 'fill', '', meter);
    s.ui.el('div', 'mark', '', meter).style.left = '45%';
    s.ui.el('div', 'mark', '', meter).style.left = '70%';
    s.ui.el('div', 'gmg-label', 'Harmonie du souffle', panel);

    // target ring (billboard)
    const ringMat = ringMaterial();
    const ring = s.scope.add(new THREE.Mesh(new THREE.PlaneGeometry(RING_PLANE * 2, RING_PLANE * 2), ringMat));
    ring.renderOrder = 30;

    for (let i = 0; i < BAUBLES; i++) {
      s.hud({ score: `Boule ${i + 1}/${BAUBLES} · ${good} réussie${good > 1 ? 's' : ''}`, hint: s.def.hint(s.device) });
      const color = colors[i];
      const pattern = Math.floor(Math.random() * 3);
      const orn = makeOrnament({ c: color, p: pattern, q: 2 }, 1, (t) => s.track(t));
      const ballMat = orn.material;
      ballMat.emissive.set('#ff7a1f');
      ballMat.emissiveIntensity = 1.2;
      orn.group.children.slice(1).forEach((c) => (c.visible = false)); // cap & hook appear when cooled
      // cap toward the pipe
      orn.group.quaternion.setFromUnitVectors(UP, b.fwd.clone().negate());
      s.scope.add(orn.group);
      const halo = glowSprite('#ff9a3a', 0.5, 0.32);
      own(halo.material);
      s.scope.add(halo);
      let size = 0;
      const place = (sz: number, t: number, wob = 0) => {
        const c = tmp.copy(b.tip).addScaledVector(b.fwd, sz);
        orn.group.position.copy(c);
        orn.group.scale.setScalar(sz);
        const w1 = Math.sin(t * 9) * wob;
        orn.ball.scale.set(1 + w1, 1 - w1 * 0.6, 1 + w1 * 0.4);
        halo.position.copy(c);
        halo.scale.setScalar(Math.max(0.2, sz * 4.2));
        return c;
      };
      // 1 · gather
      s.sfx('whoosh', { volume: 0.35, pitch: 0.6 });
      let t = 0;
      await s.loop((dt) => {
        t += dt;
        size = S_MIN * easeOutBack(clamp(t / 0.7, 0, 1));
        place(Math.max(0.005, size), t);
        if (Math.random() < 0.5) s.fx.embers(orn.group.position, 1, size);
        return t >= 0.8;
      });
      // 2 · blow
      panel.classList.remove('hidden');
      ringMat.uniforms.uAlpha.value = 0;
      const ph1 = rand(0, Math.PI * 2);
      const ph2 = rand(0, Math.PI * 2);
      const wave = (tt: number) => 0.135 + 0.045 * Math.sin(0.62 * tt + ph1) + 0.022 * Math.sin(1.45 * tt + ph2);
      let harmony = 0;
      let wasIn = false;
      let outFor = 1;
      let whooshT = 0;
      t = 0;
      await s.loop((dt, el) => {
        t += dt;
        const target = THREE.MathUtils.lerp(0.09, wave(t), smooth(t / 1.8));
        let hold = s.held();
        if (auto) hold = auto.outcome === 'lose' ? true : size < target;
        if (auto && auto.outcome !== 'lose') size = clamp(size + clamp(target - size, -SHRINK * dt, GROW * dt), S_MIN, S_MAX);
        else size = clamp(size + (hold ? GROW : -SHRINK) * dt, S_MIN, S_MAX);
        const inside = Math.abs(size - target) < TOL;
        if (inside && t > GRACE * 0.5) harmony += dt;
        if (inside && !wasIn && outFor > 0.6) s.sfx('chime', { volume: 0.35, pitch: 1 + harmony / BLOW });
        outFor = inside ? 0 : outFor + dt;
        wasIn = inside;
        if (hold) {
          whooshT -= dt;
          if (whooshT <= 0) {
            whooshT = 0.42;
            s.sfx('whoosh', { volume: 0.16, pitch: 0.6 + size * 2.6 });
          }
        } else whooshT = 0;
        const c = place(size, el, hold ? 0.03 : 0.012 + (size >= S_MAX - 0.001 ? 0.05 : 0));
        ballMat.emissiveIntensity = 1.15 + Math.sin(el * 11) * 0.1;
        // ring
        ring.position.copy(c);
        ring.quaternion.copy(ctx.camera.quaternion);
        ringMat.uniforms.uInner.value = (target - TOL) / RING_PLANE;
        ringMat.uniforms.uOuter.value = (target + TOL) / RING_PLANE;
        ringMat.uniforms.uAlpha.value = Math.min(1, ringMat.uniforms.uAlpha.value + dt * 3);
        ringMat.uniforms.uTime.value = el;
        (ringMat.uniforms.uColor.value as THREE.Color).lerp(new THREE.Color(inside ? '#8dffc0' : '#bcd8ff'), 1 - Math.exp(-10 * dt));
        if (inside && Math.random() < 0.6) {
          const a = Math.random() * Math.PI * 2;
          const p = c.clone().addScaledVector(b.fwd, Math.cos(a) * target).addScaledVector(UP, Math.sin(a) * target);
          s.fx.glint.emit(p, { count: 1, color: '#ffe3a1', intensity: 2.5, speed: [0, 0.2], life: [0.3, 0.6], size: [0.03, 0.06], twinkle: true });
        }
        if (Math.random() < 0.4) s.fx.embers(c, 1, size * 0.9);
        // widgets
        const score = harmony / (BLOW - GRACE);
        fill.style.width = `${clamp(score, 0, 1) * 100}%`;
        if (inside) {
          pill.textContent = 'Parfait, garde ce souffle !';
          pill.className = 'gmg-pill good';
        } else if (size < target) {
          pill.textContent = 'Souffle !';
          pill.className = 'gmg-pill';
        } else {
          pill.textContent = 'Relâche un peu…';
          pill.className = 'gmg-pill warn';
        }
        return t >= BLOW;
      });
      panel.classList.add('hidden');
      const score = clamp(harmony / (BLOW - GRACE), 0, 1);
      const q = score >= 0.7 ? 2 : score >= 0.45 ? 1 : 0;
      total++;
      if (q >= 1) good++;
      s.hud({ score: `Boule ${i + 1}/${BAUBLES} · ${good} réussie${good > 1 ? 's' : ''}` });
      // 3 · cooling: orange glow fades, the colour appears; it settles to a pretty size
      const s0 = size;
      const final = 0.12;
      t = 0;
      await s.loop((dt, el) => {
        t += dt;
        const k = smooth(t / 1.7);
        ringMat.uniforms.uAlpha.value = Math.max(0, 1 - t * 2.5);
        ballMat.emissive.lerpColors(new THREE.Color('#ff7a1f'), new THREE.Color(color), k);
        ballMat.emissiveIntensity = THREE.MathUtils.lerp(1.2, 0.22, k);
        const sz = THREE.MathUtils.lerp(s0, final, k);
        place(sz, el, 0);
        if (q === 0) orn.ball.scale.set(1 + 0.12 * k, 1 - 0.14 * k, 1 + 0.02 * k);
        orn.ball.rotation.y += dt * 1.5;
        halo.material.opacity = 0.32 * (1 - k);
        if (Math.random() < 0.5 * (1 - k)) s.fx.embers(orn.group.position, 1, sz);
        return t >= 1.8;
      });
      orn.group.children[1].visible = orn.group.children[2].visible = true;
      const c = orn.group.position.clone();
      s.sfx('glass-clink', { volume: 0.8, pitch: rand(0.95, 1.1) });
      if (q >= 1) s.sfx('magic', { volume: 0.5 });
      s.fx.sparkle(c, q === 2 ? ['#ffffff', '#ffe3a1', color] : ['#ffffff', color], q === 2 ? 40 : 22, 0.7);
      s.ui.float(c.clone().addScaledVector(UP, 0.2), q === 2 ? 'Magnifique !' : q === 1 ? 'Jolie boule !' : 'Un peu biscornue…', { cls: q === 2 ? 'big' : q === 1 ? 'big warm' : 'dim' });
      if (q >= 1) s.cheer(q === 2 ? 'love' : 'happy');
      made.push({ c: color, p: q === 0 ? 3 : pattern, q });
      // 4 · it joins the keepsake rack
      const { pos: rp, yaw: ry } = rackFrame(ctx);
      const already = loadKeepsakes(ctx).length + made.length - 1;
      const slot = Math.min(MAX_KEEP - 1, already);
      const hookW = hookLocal(slot)
        .add(new THREE.Vector3(0, 0.08 - stringLen(slot) - 0.075 * 1.25, 0))
        .applyAxisAngle(UP, ry)
        .add(rp);
      const from = orn.group.position.clone();
      const qFrom = orn.group.quaternion.clone();
      t = 0;
      await s.wait(0.5);
      await s.loop((dt) => {
        t += dt;
        const k = smooth(t / 1.0);
        orn.group.position.lerpVectors(from, hookW, k);
        orn.group.position.y += Math.sin(k * Math.PI) * 0.35;
        orn.group.quaternion.slerpQuaternions(qFrom, new THREE.Quaternion(), k);
        orn.group.scale.setScalar(THREE.MathUtils.lerp(final, 0.075, k));
        if (Math.random() < 0.7) s.fx.trail(orn.group.position, color, 0.05, 2, 0.4);
        return t >= 1.0;
      });
      s.sfx('glass-clink', { volume: 0.4, pitch: 1.4 });
      halo.visible = false;
      // the rack shows it from now on (and keeps it for the next visit)
      ctx.save.update((d) => {
        const list = loadKeepsakes(ctx);
        list.push(made[made.length - 1]);
        d.flags[FLAG] = JSON.stringify(list.slice(-MAX_KEEP));
      });
      buildRack(ctx);
      orn.group.visible = false;
      await s.wait(0.3);
    }
    panel.remove();
    const won = good >= WIN;
    if (won) s.cheer('clap');
    await s.wait(0.5);
    const name = s.keeper.cast?.name ?? 'Le maître verrier';
    return {
      won,
      score: good,
      text: won
        ? `${good} boules de verre réussies sur ${total} ! ${name} les accroche près de l’établi : elles t’attendront à ta prochaine visite.`
        : `${good} boule réussie sur ${total}… il en fallait ${WIN}. Tes boules restent accrochées près de l’établi : le verre est patient, retente ta chance !`,
    };
  },

  exit(s) {
    const b = benches.get(s);
    return b ? { position: b.bench.clone(), yaw: Math.atan2(b.facing.x, b.facing.z) } : null;
  },
};
