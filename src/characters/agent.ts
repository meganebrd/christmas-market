import * as THREE from 'three';
import type { GameContext, NpcHandle, PlayerApi } from '../core/contracts';
import type { CharacterAppearance } from '../config/types';
import { CosyRig } from './rig';
import type { Effects } from './effects';
import type { EmoteKind } from './emotes';
import { clamp, damp, dampAngle, wrapAngle } from './util';

/** Everything a behaviour may need each frame. */
export interface World {
  ctx: GameContext;
  fx: Effects;
  player: PlayerApi;
  agents: Agent[];
  /** Seconds since start. */
  t: number;
  /** Bubble budget: only one ambient bubble at a time in the whole market. */
  canBubble(): boolean;
  bubble(agent: Agent, text: string, duration?: number): void;
}

export interface Behaviour {
  update(a: Agent, dt: number, w: World): void;
  /** Called when the agent resumes after a conversation or a celebration. */
  resume?(a: Agent, w: World): void;
}

const _d = new THREE.Vector3();

/**
 * A non-player character: a rig + a tiny steering controller + a pluggable behaviour.
 * Implements the NpcHandle contract (hold/release for conversations).
 */
export class Agent implements NpcHandle {
  readonly rig: CosyRig;
  yaw = 0;
  /** Desired yaw while standing (null = keep). */
  faceYaw: number | null = null;
  behaviour: Behaviour | null = null;
  kind: 'vendor' | 'cast' | 'crowd' = 'crowd';
  role = '';

  // movement
  goal: THREE.Vector3 | null = null;
  goalSpeed = 1.2;
  goalStop = 0.3;
  onArrive: (() => void) | null = null;
  readonly vel = new THREE.Vector3();
  radius = 0.3;
  /** Resolve against the world colliders (off for vendors/cast who stand inside their stand). */
  collide = true;
  /** Soft avoidance of the player and the other walkers. */
  avoid = true;
  /** Lean into turns (skaters). */
  leanK = 0.02;
  private steerAngle = 0;
  private steerT = 0;
  private best = Infinity;
  private stuck = 0;
  private lastYaw = 0;
  private lean = 0;

  // conversation / finale
  held = false;
  readonly holdLook = new THREE.Vector3();
  private holdPoint: THREE.Vector3 | null = null;
  private celebrateT = 0;
  private celebrateNext = 0;
  talkT = 0;

  // LOD & ambience
  lodAcc = 0;
  near = false;
  onScreen = true;
  breathT = 1 + Math.random() * 3;
  /** Free per-behaviour storage. */
  data: Record<string, any> = {};

  constructor(
    readonly id: string,
    readonly name: string,
    appearance: Required<CharacterAppearance>,
    detail: number,
    shadows: boolean,
  ) {
    this.rig = new CosyRig(appearance, detail);
    this.rig.mesh.castShadow = shadows;
    this.rig.root.name = id;
  }

  get position(): THREE.Vector3 {
    return this.rig.root.position;
  }

  place(x: number, z: number, yaw: number) {
    this.rig.root.position.set(x, 0, z);
    this.yaw = this.lastYaw = yaw;
    this.faceYaw = yaw;
    this.rig.root.rotation.y = yaw;
  }

  walkTo(p: { x: number; z: number }, speed = 1.2, stop = 0.3, onArrive: (() => void) | null = null) {
    if (!this.goal) this.goal = new THREE.Vector3();
    this.goal.set(p.x, 0, p.z);
    this.goalSpeed = speed;
    this.goalStop = stop;
    this.onArrive = onArrive;
    this.best = Infinity;
    this.stuck = 0;
  }

  stop() {
    this.goal = null;
    this.onArrive = null;
  }

  face(p: { x: number; z: number }) {
    const dx = p.x - this.position.x;
    const dz = p.z - this.position.z;
    if (dx * dx + dz * dz > 1e-6) this.faceYaw = Math.atan2(dx, dz);
  }

  // ───────────────────────────── NpcHandle ─────────────────────────────

  hold(lookAt: THREE.Vector3 | null): void {
    this.held = true;
    this.holdPoint = lookAt;
    this.stop();
    this.rig.locomote('idle', 0);
    const cur = this.rig.current;
    if (cur !== 'idle' && cur !== 'talk' && cur !== 'sit' && cur !== 'sit-talk' && cur !== 'lantern') this.rig.play(this.rig.sitting ? 'sit' : 'idle');
    this.rig.lookAt(lookAt ? this.holdLook : null);
  }

  release(): void {
    this.held = false;
    this.holdPoint = null;
    this.rig.lookAt(null);
    this.rig.setTalking(false);
    this.talkT = 0;
    this.data.resumePending = true;
  }

  celebrate(seconds: number) {
    this.celebrateT = seconds;
    this.celebrateNext = Math.random() * 0.8;
    this.stop();
  }

  get celebrating() {
    return this.celebrateT > 0;
  }

  emote(kind: EmoteKind) {
    this.rig.emote(kind);
  }

  // ───────────────────────────── update ─────────────────────────────

  step(dt: number, w: World) {
    const rig = this.rig;
    if (this.data.resumePending && !this.held) {
      this.data.resumePending = false;
      this.behaviour?.resume?.(this, w);
    }
    if (this.talkT > 0) {
      this.talkT -= dt;
      if (this.talkT <= 0) rig.setTalking(false);
    }
    if (this.held) {
      if (this.holdPoint) {
        this.face(this.holdPoint);
        this.holdLook.set(this.holdPoint.x, this.holdPoint.y + 0.95, this.holdPoint.z);
      }
    } else if (this.celebrateT > 0) {
      this.celebrateT -= dt;
      const seated = rig.sitting;
      if (this.celebrateT <= 0) {
        rig.play(seated ? 'sit' : 'idle');
        this.data.resumePending = true;
      } else {
        const cur = rig.current;
        if (seated ? cur !== 'clap' && cur !== 'sit' : cur !== 'cheer') rig.play(seated ? 'sit' : 'cheer', { loop: true });
        this.celebrateNext -= dt;
        if (this.celebrateNext <= 0) {
          this.celebrateNext = 1.4 + Math.random() * 1.6;
          const kinds: EmoteKind[] = ['happy', 'love', 'note', 'happy'];
          rig.emote(kinds[Math.floor(Math.random() * kinds.length)]);
        }
      }
    } else this.behaviour?.update(this, dt, w);
    this.move(dt, w);
  }

  private move(dt: number, w: World) {
    const pos = this.position;
    const ctx = w.ctx;
    let dx = 0;
    let dz = 0;
    let want = 0;
    if (this.goal && !this.held && this.celebrateT <= 0) {
      _d.set(this.goal.x - pos.x, 0, this.goal.z - pos.z);
      const dist = _d.length();
      if (dist <= this.goalStop) {
        const cb = this.onArrive;
        this.goal = null;
        this.onArrive = null;
        cb?.();
      } else {
        _d.divideScalar(dist);
        // obstacle steering (cheap: re-probe a few times per second)
        this.steerT -= dt;
        if (this.steerT <= 0 && this.collide) {
          this.steerT = 0.25;
          this.steerAngle = 0;
          const probe = Math.min(0.9, dist);
          const free = (a: number) => {
            const c = Math.cos(a);
            const s = Math.sin(a);
            return !ctx.colliders.blocked(pos.x + (_d.x * c + _d.z * s) * probe, pos.z + (-_d.x * s + _d.z * c) * probe, this.radius);
          };
          if (!free(0)) {
            for (const a of [0.5, -0.5, 1.0, -1.0, 1.5, -1.5]) {
              if (free(a)) {
                this.steerAngle = a;
                break;
              }
            }
          }
        }
        if (this.steerAngle) _d.applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.steerAngle);
        want = this.goalSpeed * clamp(dist / 0.9, 0.35, 1);
        dx = _d.x * want;
        dz = _d.z * want;
        if (dist < this.best - 0.05) {
          this.best = dist;
          this.stuck = 0;
        } else if ((this.stuck += dt) > 3) {
          // give up: pretend we arrived (the behaviour picks something else)
          const cb = this.onArrive;
          this.goal = null;
          this.onArrive = null;
          cb?.();
        }
      }
    }
    // soft avoidance (player + other walkers)
    if (this.avoid) {
      const pp = w.player.position;
      const px = pos.x - pp.x;
      const pz = pos.z - pp.z;
      const pd = Math.hypot(px, pz);
      if (pd < 1.15 && pd > 1e-4) {
        const k = (1.15 - pd) * 2.2;
        dx += (px / pd) * k;
        dz += (pz / pd) * k;
      }
      for (const o of w.agents) {
        if (o === this || !o.avoid) continue;
        const ox = pos.x - o.position.x;
        const oz = pos.z - o.position.z;
        if (Math.abs(ox) > 0.8 || Math.abs(oz) > 0.8) continue;
        const od = Math.hypot(ox, oz);
        if (od < 0.7 && od > 1e-4) {
          const k = (0.7 - od) * 1.6;
          dx += (ox / od) * k;
          dz += (oz / od) * k;
        }
      }
    }
    const r = damp(this.goal ? 6 : 8, dt);
    this.vel.x += (dx - this.vel.x) * r;
    this.vel.z += (dz - this.vel.z) * r;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (speed > 0.01) {
      pos.x += this.vel.x * dt;
      pos.z += this.vel.z * dt;
      if (this.collide) ctx.colliders.resolve(pos, this.radius);
    }
    if (speed > 0.15 && this.goal) this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 9, dt);
    else if (this.faceYaw !== null) this.yaw = dampAngle(this.yaw, this.faceYaw, this.held ? 6 : 4, dt);
    this.rig.root.rotation.y = this.yaw;
    const yawRate = dt > 0 ? wrapAngle(this.yaw - this.lastYaw) / dt : 0;
    this.lastYaw = this.yaw;
    this.lean += (clamp(-yawRate * speed * this.leanK, -0.25, 0.25) - this.lean) * damp(6, dt);
    if (!this.data.manualAnim) this.rig.lean = this.lean;
    if (!this.data.manualAnim) {
      if (speed > 0.18 && this.goal) this.rig.locomote(speed > 3.6 ? 'run' : 'walk', speed);
      else this.rig.locomote('idle', 0);
    }
  }
}
