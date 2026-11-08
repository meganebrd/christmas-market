import * as THREE from 'three';
import type { GameContext, PlayerApi, SfxName } from '../core/contracts';
import type { CharacterAppearance } from '../config/types';
import type { Surface } from '../world/layout';
import { CosyRig } from './rig';
import { getEffects } from './effects';
import { clamp, damp, dampAngle, wrapAngle } from './util';

/** The visitor: red bobble hat, cream scarf, blue duffle coat. */
export const VISITOR: Required<CharacterAppearance> = {
  skin: '#f3d2bd',
  hair: '#6b4128',
  hairStyle: 'short',
  outfit: 'coat',
  outfitColor: '#3c5a8a',
  outfitColor2: '#3b3340',
  scarf: '#f2efe6',
  hat: 'bobble',
  hatColor: '#c0453a',
  accessory: 'none',
  beard: null,
  height: 1,
  build: 1,
};

const WALK = 3.2;
const RUN = 6;
const RADIUS = 0.35;

interface WalkTarget {
  p: THREE.Vector3;
  stop: number;
  run: boolean;
  resolve: () => void;
  best: number;
  stuck: number;
  side: number;
}

export interface PlayerController extends PlayerApi {
  rig: CosyRig;
  readonly velocity: THREE.Vector3;
  readonly surface: Surface;
}

export function createPlayerController(ctx: GameContext): PlayerController {
  const rig = new CosyRig(VISITOR, 1);
  rig.mesh.castShadow = ctx.quality.shadows;
  rig.root.name = 'player';
  ctx.scene.add(rig.root);
  const fx = getEffects(ctx);
  fx.addShadow(rig);

  const pos = rig.root.position;
  const vel = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  let yaw = 0;
  let yawTarget: number | null = null;
  let enabled = true;
  let target: WalkTarget | null = null;
  let surface: Surface = 'snow';
  let running = false;
  let breathT = 1.5;
  let lastYaw = 0;
  let lean = 0;

  const finishWalk = () => {
    const t = target;
    target = null;
    t?.resolve();
  };

  // footsteps, footprints, snow kicks
  rig.onEvent = (name) => {
    const speed = Math.hypot(vel.x, vel.z);
    if (name.startsWith('emote:')) return;
    if (name === 'step-l' || name === 'step-r' || name === 'push-l' || name === 'push-r') {
      if (speed < 0.35) return;
      const side = name.endsWith('l') ? 'l' : 'r';
      const foot = rig.footWorld(side, tmp);
      const s = ctx.layout.surfaceAt(foot.x, foot.z);
      const isPush = name.startsWith('push');
      const volume = isPush ? 0.28 : running ? 0.5 : 0.32;
      try {
        ctx.audio.sfx(('step-' + s) as SfxName, { volume, pitch: 0.9 + Math.random() * 0.2 });
      } catch {
        /* audio may be a stub */
      }
      ctx.events.emit('player:step', { surface: s, running, position: foot.clone() });
      if (s === 'snow') {
        fx.footprint(foot, yaw);
        if (running) fx.snowKick(foot, fwd.set(-vel.x, 0, -vel.z).normalize());
      } else if (s === 'ice' && isPush) {
        fx.iceSpray(foot, fwd.set(Math.cos(yaw) * (side === 'l' ? 1 : -1), 0, -Math.sin(yaw) * (side === 'l' ? 1 : -1)));
      }
    } else if (name === 'breath') {
      fx.breath(rig.mouthWorld(tmp), fwd.set(Math.sin(yaw), 0, Math.cos(yaw)), 1.2);
    }
  };

  const steer = (t: WalkTarget, out: THREE.Vector3): boolean => {
    out.subVectors(t.p, pos).setY(0);
    const dist = out.length();
    if (dist <= t.stop) return false;
    out.divideScalar(dist);
    // probe ahead: rotate the heading until the way is free
    const probe = Math.min(0.9, dist);
    const free = (ang: number) => {
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const x = out.x * c + out.z * s;
      const z = -out.x * s + out.z * c;
      return !ctx.colliders.blocked(pos.x + x * probe, pos.z + z * probe, RADIUS * 0.9) ? [x, z] : null;
    };
    let found = free(0);
    if (!found) {
      for (const a of [0.4, 0.8, 1.2, 1.6, 2.0]) {
        found = free(a * t.side) ?? free(-a * t.side);
        if (found) break;
      }
    }
    if (found) out.set(found[0], 0, found[1]);
    const slow = clamp(dist / 1.1, 0.35, 1);
    out.multiplyScalar(slow);
    return true;
  };

  ctx.addSystem((dt) => {
    const canInput = enabled && (ctx.mode === 'explore' || ctx.mode === 'minigame');
    ctx.cameraRig.toWorld(ctx.input.move.x, ctx.input.move.y, dir);
    const manual = canInput && dir.lengthSq() > 0.0025;
    if (manual && target) finishWalk();
    let wantRun = canInput && ctx.input.run;
    if (!manual) {
      if (target) {
        if (!steer(target, dir)) {
          dir.set(0, 0, 0);
          finishWalk();
        } else wantRun = target.run;
      } else dir.set(0, 0, 0);
    }

    surface = ctx.layout.surfaceAt(pos.x, pos.z);
    const onIce = surface === 'ice';
    const inputLen = Math.min(1, dir.length());
    running = wantRun && inputLen > 0.5;
    const max = (running ? RUN : WALK) * (onIce ? 0.9 : 1);
    desired.copy(dir).setLength(inputLen > 0.001 ? inputLen * max : 0);
    const accelerating = desired.lengthSq() > vel.lengthSq();
    const rate = onIce ? (inputLen > 0.01 ? 1.3 : 0.45) : accelerating ? 9 : 11;
    vel.x += (desired.x - vel.x) * damp(rate, dt);
    vel.z += (desired.z - vel.z) * damp(rate, dt);
    if (vel.lengthSq() < 1e-4 && inputLen === 0) vel.set(0, 0, 0);

    prev.copy(pos);
    pos.x += vel.x * dt;
    pos.z += vel.z * dt;
    pos.y = 0;
    if (ctx.colliders.resolve(pos, RADIUS) && dt > 0) {
      // slide along walls: keep only the motion that actually happened
      const mx = (pos.x - prev.x) / dt;
      const mz = (pos.z - prev.z) / dt;
      if (mx * mx + mz * mz < vel.lengthSq()) vel.set(mx, 0, mz);
    }

    // stuck detection for walkTo
    if (target) {
      const d = Math.hypot(target.p.x - pos.x, target.p.z - pos.z);
      if (d < target.best - 0.05) {
        target.best = d;
        target.stuck = 0;
      } else if ((target.stuck += dt) > 1.4) finishWalk();
    }

    const speed = Math.hypot(vel.x, vel.z);
    // facing: toward the input (responsive), or the velocity on ice
    if (speed > 0.12 && (inputLen > 0.01 || onIce)) {
      const face = onIce && inputLen < 0.01 ? Math.atan2(vel.x, vel.z) : Math.atan2(dir.x || vel.x, dir.z || vel.z);
      yaw = dampAngle(yaw, face, onIce ? 5 : 13, dt);
      yawTarget = null;
    } else if (yawTarget !== null) {
      yaw = dampAngle(yaw, yawTarget, 8, dt);
      if (Math.abs(wrapAngle(yaw - yawTarget)) < 0.01) yawTarget = null;
    }
    rig.root.rotation.y = yaw;
    const yawRate = dt > 0 ? wrapAngle(yaw - lastYaw) / dt : 0;
    lastYaw = yaw;
    lean += (clamp(-yawRate * speed * (onIce ? 0.05 : 0.025), -0.28, 0.28) - lean) * damp(8, dt);
    rig.lean = lean;

    // animation
    if (speed < 0.15) rig.locomote('idle', 0);
    else if (onIce && speed > 0.5) rig.locomote('skate', speed);
    else rig.locomote(speed > 4.3 ? 'run' : 'walk', speed);

    // breath in the cold air
    breathT -= dt;
    if (breathT <= 0) {
      breathT = running ? 1.4 + Math.random() * 0.6 : 2.6 + Math.random() * 1.6;
      fx.breath(rig.mouthWorld(tmp), fwd.set(Math.sin(yaw), 0, Math.cos(yaw)));
    }
    rig.update(dt);
  });

  // little reactions
  ctx.events.on('star:collected', () => {
    rig.play('cheer');
    rig.emote('happy');
  });
  ctx.events.on('minigame:end', ({ won }) => {
    if (won) {
      rig.play('cheer');
      rig.emote('happy');
    } else rig.emote('sweat');
  });
  ctx.events.on('conversation:end', () => rig.lookAt(null));

  const api: PlayerController = {
    rig,
    get position() {
      return pos;
    },
    get yaw() {
      return yaw;
    },
    get velocity() {
      return vel;
    },
    get surface() {
      return surface;
    },
    setControlEnabled(e: boolean) {
      enabled = e;
      if (!e) vel.multiplyScalar(0.3);
    },
    teleport(p: THREE.Vector3, y?: number) {
      finishWalk();
      pos.set(p.x, 0, p.z);
      vel.set(0, 0, 0);
      if (y !== undefined) {
        yaw = lastYaw = y;
        yawTarget = null;
        rig.root.rotation.y = y;
      }
      rig.locomote('idle', 0);
    },
    walkTo(p: THREE.Vector3, opts: { run?: boolean; stopDistance?: number } = {}) {
      finishWalk();
      return new Promise<void>((resolve) => {
        const t: WalkTarget = { p: new THREE.Vector3(p.x, 0, p.z), stop: Math.max(0.05, opts.stopDistance ?? 0.2), run: !!opts.run, resolve, best: Infinity, stuck: 0, side: Math.random() < 0.5 ? 1 : -1 };
        if (Math.hypot(t.p.x - pos.x, t.p.z - pos.z) <= t.stop) return resolve();
        target = t;
      });
    },
    faceToward(p: THREE.Vector3) {
      const dx = p.x - pos.x;
      const dz = p.z - pos.z;
      if (dx * dx + dz * dz < 1e-6) return;
      yawTarget = Math.atan2(dx, dz);
      // look at their face too
      rig.lookAt(new THREE.Vector3(p.x, (p.y || 0) + 0.95, p.z));
    },
  };
  return api;
}
