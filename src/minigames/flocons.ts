import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glow } from '../world/materials';
import { glowSprite } from '../world/textures';
import {
  anchor,
  clamp,
  groundDecal,
  own,
  PENTA,
  rand,
  softDiscTexture,
  surfaceHeight,
  UP,
  zoneFrame,
  type MinigameDef,
  type Session,
} from './common';

/**
 * La Pluie d'Étoiles — golden snowflakes drift down over the belvedere; walk under them to catch them.
 * A soft shadow + ring shows where each one will land. Combos climb a pentatonic scale.
 * Rare big blue flake = +3. 40 s, win with 15.
 */

const DURATION = 40;
const GOAL = 15;
const CATCH_R = 0.95;
const CATCH_R_BIG = 1.2;
const CATCH_H = 1.75;
const Y0 = 5.2;

interface Flake {
  root: THREE.Group;
  star: THREE.Mesh;
  halo: THREE.Sprite;
  shadow: THREE.Mesh;
  ring: THREE.Mesh;
  x: number;
  z: number;
  y: number;
  vy: number;
  big: boolean;
  age: number;
  phase: number;
  spin: number;
  done: boolean;
  fade: number;
}

function flakeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const arm = (len: number, w: number, angle: number, ox: number, oy: number) => {
    const g = new THREE.BoxGeometry(w, len, 0.028);
    g.translate(0, len / 2, 0);
    g.rotateZ(angle);
    g.translate(ox, oy, 0);
    parts.push(g);
  };
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    arm(0.3, 0.05, a, 0, 0);
    for (const [d, l] of [
      [0.13, 0.1],
      [0.21, 0.07],
    ]) {
      const bx = -Math.sin(a) * d;
      const by = Math.cos(a) * d;
      arm(l, 0.035, a + 0.85, bx, by);
      arm(l, 0.035, a - 0.85, bx, by);
    }
  }
  const hub = new THREE.CylinderGeometry(0.075, 0.075, 0.034, 6);
  hub.rotateX(Math.PI / 2);
  parts.push(hub);
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  for (const p of parts) p.dispose();
  g.userData.shared = true;
  return g;
}

export const flocons: MinigameDef = {
  id: 'flocons',
  title: 'La Pluie d’Étoiles',
  zone: 'belvedere',
  keeper: { role: 'stargazer', title: 'Astronome en herbe' },
  playerControl: true,
  rules:
    'Regarde ! Ce soir, il neige des étoiles ! Promène-toi sous les flocons dorés pour les attraper avant qu’ils touchent le sol. Le grand flocon bleu vaut 3 points. Attrapes-en 15 en 40 secondes !',
  hint: (d) =>
    d === 'touch'
      ? 'Glisse le doigt pour marcher sous les flocons'
      : d === 'pointer'
        ? 'Garde le clic appuyé pour marcher vers le flocon · ZQSD/flèches aussi'
        : 'ZQSD / flèches pour marcher sous les flocons',

  spot(ctx) {
    const f = zoneFrame(ctx, 'belvedere');
    return anchor(ctx, 'belvedere:center', () => ({ position: f.center.clone(), yaw: Math.atan2(f.out.x, f.out.z) }));
  },

  setup(s) {
    const { ctx } = s;
    const f = zoneFrame(ctx, 'belvedere');
    const spot = this.spot(ctx);
    const C = spot.position.clone().setY(0);
    const arenaR = Math.min(5.6, f.radius - 1);
    const st = state(s);
    // the belvedere deck may be raised: everything sits on its surface
    const deck = surfaceHeight(ctx, C.x, C.z, 1.2, [ctx.player.rig.root]);
    st.y0 = deck < 0.5 ? deck : 0;
    st.C = C;
    st.R = arenaR;
    st.out = f.out.clone();
    // visitor in the middle, facing the valley
    ctx.player.teleport(C.clone().addScaledVector(f.out, -1), Math.atan2(f.out.x, f.out.z));
    try {
      ctx.player.rig.play('idle');
    } catch {
      /* ignore */
    }
    // arena boundary: a thin golden ring and a soft pool of light
    const ring = s.scope.add(
      new THREE.Mesh(
        new THREE.RingGeometry(arenaR - 0.05, arenaR + 0.05, 128),
        own(new THREE.MeshBasicMaterial({ color: '#ffc56b', transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false })),
      ),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(C.x, st.y0 + 0.03, C.z);
    const poolTex = s.track(softDiscTexture('pool'));
    const pool = s.scope.add(groundDecal(poolTex, '#5a6bb8', arenaR * 2.6, { additive: true, opacity: 0.22 }));
    pool.position.set(C.x, st.y0 + 0.02, C.z);
    st.geo = s.track(flakeGeometry());
    st.shadowTex = s.track(softDiscTexture('shadow'));
    st.ringTex = s.track(softDiscTexture('ring'));
    // camera: high, from the plaza side, looking toward the valley
    frame(s, true);
  },

  async play(s) {
    const { ctx } = s;
    const st = state(s);
    let score = 0;
    let combo = 0;
    let lastCatch = -10;
    let nextSpawn = 0.3;
    let goalShown = false;
    const bigTimes = [rand(8, 11), rand(19, 23), rand(29, 32)];
    const flakes: Flake[] = [];
    const auto = s.auto;
    let walkTimer = 0;
    const tmp = new THREE.Vector3();
    s.hud({ score: `★ 0 / ${GOAL}`, time: DURATION });

    const spawn = (big: boolean) => {
      const P = ctx.player.position;
      let x = st.C.x;
      let z = st.C.z;
      for (let tries = 0; tries < 14; tries++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * st.R * 0.93;
        x = st.C.x + Math.sin(a) * r;
        z = st.C.z + Math.cos(a) * r;
        const d = Math.hypot(x - P.x, z - P.z);
        const crowded = flakes.some((o) => !o.done && Math.hypot(o.x - x, o.z - z) < 1.3);
        let blocked = false;
        try {
          blocked = ctx.colliders.blocked(x, z, 0.4);
        } catch {
          blocked = false;
        }
        if (!blocked && !crowded && d > 1.3 && d < 4.8) break;
      }
      const root = new THREE.Group();
      const star = new THREE.Mesh(st.geo, big ? glow('#a8dcff', 3.2) : glow('#ffd27a', 2.6));
      star.scale.setScalar(big ? 2.1 : 1.25);
      const halo = glowSprite(big ? '#8fd0ff' : '#ffc56b', big ? 2.8 : 1.7, big ? 0.75 : 0.6);
      own(halo.material);
      root.add(star, halo);
      s.scope.add(root);
      const shadow = s.scope.add(groundDecal(st.shadowTex, '#141b3a', 1.4, { opacity: 0 }));
      const ring = s.scope.add(groundDecal(st.ringTex, big ? '#8fd0ff' : '#ffc56b', (big ? CATCH_R_BIG : CATCH_R) * 2.1, { additive: true, opacity: 0 }));
      shadow.position.set(x, st.y0 + 0.035, z);
      ring.position.set(x, st.y0 + 0.04, z);
      const fl: Flake = { root, star, halo, shadow, ring, x, z, y: st.y0 + Y0 + (big ? 0.8 : rand(-0.3, 0.3)), vy: big ? 0.85 : rand(1.0, 1.15), big, age: 0, phase: Math.random() * 6, spin: rand(0.8, 1.6) * (Math.random() < 0.5 ? -1 : 1), done: false, fade: 1 };
      flakes.push(fl);
      placeFlake(fl, 0);
      if (big) {
        s.sfx('magic', { volume: 0.5 });
        s.ui.banner('Un flocon bleu !', '+3 points');
      }
    };

    const placeFlake = (fl: Flake, t: number) => {
      const h = clamp((fl.y - st.y0) / Y0, 0, 1);
      const sway = 0.35 * h;
      fl.root.position.set(fl.x + Math.sin(fl.age * 1.3 + fl.phase) * sway, fl.y, fl.z + Math.cos(fl.age * 1.1 + fl.phase) * sway);
      // face the camera, spinning around its own axis with a gentle 3D wobble
      fl.star.quaternion.copy(ctx.camera.quaternion);
      fl.star.rotateZ(fl.age * fl.spin);
      fl.star.rotateX(Math.sin(fl.age * 1.7 + fl.phase) * 0.45);
      fl.star.rotateY(Math.sin(fl.age * 1.3 + fl.phase * 2) * 0.35);
      fl.halo.material.opacity = (fl.big ? 0.75 : 0.55) * fl.fade * (0.85 + 0.15 * Math.sin(t * 6 + fl.phase));
      const near = 1 - h;
      (fl.shadow.material as THREE.MeshBasicMaterial).opacity = (0.18 + near * 0.55) * fl.fade;
      fl.shadow.scale.setScalar(1.25 - near * 0.55);
      (fl.ring.material as THREE.MeshBasicMaterial).opacity = (0.18 + near * 0.6) * fl.fade * (0.85 + 0.15 * Math.sin(t * 8));
    };

    const removeFlake = (fl: Flake) => {
      fl.done = true;
      for (const o of [fl.root, fl.shadow, fl.ring]) {
        o.removeFromParent();
        o.traverse((m) => {
          const mm = (m as THREE.Mesh).material as THREE.Material | undefined;
          if (mm?.userData.owned) mm.dispose();
          const g = (m as THREE.Mesh).geometry;
          if (g && !g.userData.shared) g.dispose();
        });
      }
    };

    const catchFlake = (fl: Flake) => {
      const pts = fl.big ? 3 : 1;
      score += pts;
      combo = s.time - lastCatch < 4.5 ? combo + 1 : 1;
      lastCatch = s.time;
      const p = fl.root.position.clone();
      const pitch = PENTA[Math.min(PENTA.length - 1, combo - 1)];
      s.sfx('chime', { volume: 0.7, pitch, position: p });
      if (fl.big) {
        s.sfx('magic', { volume: 0.7 });
        s.fx.sparkle(p, ['#bfe6ff', '#ffffff', '#8fd0ff'], 46, 1.4);
        try {
          ctx.player.rig.emote('happy');
        } catch {
          /* ignore */
        }
      } else s.fx.sparkle(p, ['#ffd27a', '#fff1c2', '#ffb347'], 24);
      s.ui.float(p, combo >= 3 ? `+${pts} · combo ×${combo}` : `+${pts}`, { cls: fl.big ? 'big blue' : combo >= 3 ? 'big' : '' });
      removeFlake(fl);
      s.hud({ score: `★ ${score} / ${GOAL}` });
      if (!goalShown && score >= GOAL) {
        goalShown = true;
        s.sfx('success', { volume: 0.55 });
        s.ui.banner('Objectif atteint !', 'Continue pour le record');
        s.cheer('cheer');
        try {
          ctx.player.rig.play('cheer', { loop: false });
        } catch {
          /* ignore */
        }
      }
    };

    await s.loop((dt, t) => {
      const T = s.time;
      // spawn
      if (T < DURATION - 5.4) {
        if (bigTimes.length && T >= bigTimes[0]) {
          bigTimes.shift();
          spawn(true);
        }
        if (T >= nextSpawn) {
          spawn(false);
          nextSpawn = T + rand(0.85, 1.2);
        }
      }
      // input: hold the pointer to walk toward it (mouse & touch); stick/keys handled by the player module
      const pointer = ctx.input.pointer;
      walkTimer -= dt;
      const held = s.hold.down && ctx.input.move.x === 0 && ctx.input.move.y === 0; // (the joystick wins)
      if (!auto && (held || pointer.clicked) && walkTimer <= 0 && !ctx.ui.isBlocking()) {
        const g = held ? ctx.pickGround(s.hold.x, s.hold.y) : ctx.pickGround(pointer.x, pointer.y);
        if (g) {
          walkTimer = 0.12;
          void ctx.player.walkTo(g, { stopDistance: 0.12, run: true });
        }
      }
      // keep the visitor inside the arena
      const P = ctx.player.position;
      const off = Math.hypot(P.x - st.C.x, P.z - st.C.z);
      if (off > st.R + 0.6) {
        tmp.set(P.x - st.C.x, 0, P.z - st.C.z).setLength(st.R + 0.6).add(st.C);
        ctx.player.teleport(tmp);
      }
      // autoplay: walk under the flake that lands first
      if (auto) autoWalk(s, flakes, dt);
      // flakes
      for (const fl of flakes) {
        if (fl.done) continue;
        fl.age += dt;
        fl.y -= fl.vy * dt;
        placeFlake(fl, t);
        s.fx.trail(fl.root.position, fl.big ? '#9fd8ff' : '#ffcf73', fl.big ? 0.2 : 0.15, 2.4, 0.8);
        if (Math.random() < 0.25) s.fx.glint.emit(fl.root.position, { count: 1, color: '#fff1c2', intensity: 2.5, speed: [0.05, 0.3], gravity: 0.3, life: [0.4, 0.8], size: [0.08, 0.14], twinkle: true, spread: 0.2 });
        const d = Math.hypot(fl.root.position.x - P.x, fl.root.position.z - P.z);
        if (fl.y - st.y0 < CATCH_H && d < (fl.big ? CATCH_R_BIG : CATCH_R)) {
          catchFlake(fl);
          continue;
        }
        if (fl.y - st.y0 <= 0.05) {
          // missed: a soft golden puff on the snow
          s.fx.puff(new THREE.Vector3(fl.x, st.y0 + 0.08, fl.z), 8, 0.8, '#fff1d0');
          s.fx.glow.emit(new THREE.Vector3(fl.x, st.y0 + 0.1, fl.z), { count: 10, color: fl.big ? '#8fd0ff' : '#ffc56b', intensity: 1.8, speed: [0.3, 1], drag: 2, life: [0.3, 0.7], size: [0.05, 0.1] });
          s.sfx('pop', { volume: 0.25, pitch: 0.7, position: new THREE.Vector3(fl.x, 0, fl.z) });
          combo = 0;
          removeFlake(fl);
        }
      }
      for (let i = flakes.length - 1; i >= 0; i--) if (flakes[i].done) flakes.splice(i, 1);
      frame(s, false);
      s.hud({ time: DURATION - T });
      return T >= DURATION;
    });

    // time's up: the last flakes burst softly
    for (const fl of flakes) {
      if (fl.done) continue;
      s.fx.sparkle(fl.root.position, '#ffd27a', 10, 0.7);
      removeFlake(fl);
    }
    ctx.player.setControlEnabled(false);
    void ctx.player.walkTo(ctx.player.position.clone(), { stopDistance: 5 }); // cancel any tap-to-walk target
    s.sfx('bell', { volume: 0.6 });
    s.ui.banner('Temps écoulé !');
    await s.wait(1.4);
    const won = score >= GOAL;
    if (won) s.cheer('clap');
    return {
      won,
      score,
      text: won
        ? `Tu as attrapé ${score} flocons d’étoile ! Le ciel de Givrelune te fait un clin d’œil.`
        : `${score} flocon${score > 1 ? 's' : ''} attrapé${score > 1 ? 's' : ''}… il en fallait ${GOAL}. Les étoiles retombent bientôt : réessaie quand tu veux !`,
    };
  },
};

// ───────────────────────── helpers ─────────────────────────

interface FlState {
  y0: number;
  C: THREE.Vector3;
  R: number;
  out: THREE.Vector3;
  geo: THREE.BufferGeometry;
  shadowTex: THREE.Texture;
  ringTex: THREE.Texture;
}
const states = new WeakMap<Session, FlState>();
function state(s: Session): FlState {
  let st = states.get(s);
  if (!st) {
    st = {} as FlState;
    states.set(s, st);
  }
  return st;
}

/** Wide, high framing that gently follows the visitor. */
function frame(s: Session, snap: boolean) {
  const st = state(s);
  const P = s.ctx.player.position;
  const look = new THREE.Vector3().lerpVectors(st.C, new THREE.Vector3(P.x, 0, P.z), 0.32).addScaledVector(UP, 0.6).addScaledVector(st.out, 0.3);
  const pos = look.clone().addScaledVector(st.out, -8.2).addScaledVector(UP, 11.2);
  s.cam.k = 2.2;
  s.cam.to(pos, look, 44);
  if (snap) s.cam.snap();
}

function autoWalk(s: Session, flakes: Flake[], dt: number) {
  const ctx = s.ctx;
  if (s.auto?.outcome === 'lose') return;
  const P = ctx.player.position;
  let best: Flake | null = null;
  let bestT = Infinity;
  for (const fl of flakes) {
    if (fl.done) continue;
    const tLand = (fl.y - state(s).y0 - 1.0) / fl.vy;
    const tReach = Math.hypot(fl.x - P.x, fl.z - P.z) / 3.6;
    if (tReach > tLand + 0.2) continue;
    const score = tLand - (fl.big ? 2 : 0);
    if (score < bestT) {
      bestT = score;
      best = fl;
    }
  }
  if (!best) return;
  const to = new THREE.Vector3(best.x - P.x, 0, best.z - P.z);
  const d = to.length();
  if (d < 0.15) return;
  const step = Math.min(d, 3.6 * dt);
  const np = P.clone().addScaledVector(to.normalize(), step);
  ctx.player.teleport(np, Math.atan2(to.x, to.z));
}
