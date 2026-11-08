import * as THREE from 'three';
import type { AnimName, CharacterRig } from '../core/contracts';
import type { CharacterAppearance } from '../config/types';
import { buildCharacterMesh, type CharacterBuild } from './factory/build';
import { B } from './factory/dims';
import { createProp, type PropInstance } from './factory/props';
import { ANIMS, type AnimCtx, type AnimDef, type AnyAnim, type PropName } from './anims';
import { P, POSE_SIZE, REST, type Pose } from './pose';
import { Spring } from './springs';
import { Emotes, type EmoteKind } from './emotes';
import { bump, clamp, damp, dampAngle, smoothstep, wrapAngle } from './util';

interface Layer {
  name: AnyAnim;
  def: AnimDef;
  t: number;
  speed: number;
  loop: boolean;
  w: number;
  target: number;
}

interface Expression {
  t: number;
  dur: number;
  eyes: number;
  brow: number;
  smile: number;
  mouth: number;
}

const EXPRESSIONS: Record<EmoteKind, Omit<Expression, 't'> & { hop: number }> = {
  happy: { dur: 1.3, eyes: 0.28, brow: 0.35, smile: 1.4, mouth: 0.3, hop: 0.09 },
  surprised: { dur: 1.1, eyes: 1.3, brow: 1, smile: 0.3, mouth: 0.75, hop: 0.06 },
  love: { dur: 1.8, eyes: 0.22, brow: 0.2, smile: 1.45, mouth: 0.1, hop: 0.04 },
  note: { dur: 1.3, eyes: 0.5, brow: 0.3, smile: 1.25, mouth: 0.25, hop: 0.03 },
  sweat: { dur: 1.5, eyes: 0.85, brow: -0.6, smile: 0.55, mouth: 0.1, hop: 0 },
  idea: { dur: 1.2, eyes: 1.2, brow: 0.9, smile: 1.2, mouth: 0.45, hop: 0.07 },
};

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Vector3();

export type RigEventHandler = (name: string, rig: CosyRig) => void;

/**
 * A cosy chibi character: one skinned mesh (one draw call), a small bone hierarchy animated procedurally.
 * Implements the public CharacterRig contract plus a few extras used by the characters module
 * (locomotion speed, lean, extra role animations, held props, events).
 */
export class CosyRig implements CharacterRig {
  readonly root = new THREE.Group();
  readonly height: number;
  readonly build: CharacterBuild;
  readonly mesh: THREE.SkinnedMesh;
  /** Locomotion speed (m/s) set by the controller — drives the stride phase. */
  locoSpeed = 0;
  /** Banking into turns (radians, + leans to the character's left). */
  lean = 0;
  /** Seat height for 'sit'. */
  seat = 0.3;
  springsEnabled = true;
  autoFidget = true;
  /** Idle head look-around when nothing to look at. */
  lookAround = true;
  onEvent: RigEventHandler | null = null;

  private bones: THREE.Bone[];
  private rest: THREE.Vector3[];
  private layers: Layer[] = [];
  private baseAnim: AnyAnim = 'idle';
  private pose: Pose = new Float32Array(POSE_SIZE);
  private tmp: Pose = new Float32Array(POSE_SIZE);
  private actx: AnimCtx;
  private time = Math.random() * 100;
  private locoPhase = Math.random();
  private talking = false;
  private lookTarget: THREE.Vector3 | null = null;
  private lookYaw = 0;
  private lookPitch = 0;
  private eyeX = 0;
  private eyeY = 0;
  private bodyTurn = 0;
  private idleLook = { yaw: 0, pitch: 0, timer: 2 + Math.random() * 3 };
  private blink = { timer: 1 + Math.random() * 3, t: -1, double: false };
  private expr: Expression | null = null;
  private hop = { t: -1, h: 0 };
  private fidgetTimer = 6 + Math.random() * 8;
  private springs: Spring[] = [];
  private emotes: Emotes;
  private props: Record<'R' | 'L' | 'chest', PropInstance | null> = { R: null, L: null, chest: null };
  private held: { R?: PropName; L?: PropName; chest?: PropName } = {};
  private dominant: Layer | null = null;

  constructor(
    readonly appearance: Required<CharacterAppearance>,
    detail = 1,
  ) {
    this.build = buildCharacterMesh(appearance, detail);
    this.mesh = this.build.mesh;
    this.bones = this.build.bones;
    this.rest = this.build.rest;
    this.height = this.build.height;
    this.root.name = 'character-root';
    this.root.add(this.mesh);
    const d = this.build.dims;
    this.actx = { h: d.h, hipY: d.hipY, seed: Math.random(), seat: this.seat };
    this.emotes = new Emotes(this.root, this.height);
    this.mesh.userData.rig = this;
    this.root.userData.rig = this;

    const sp = this.build.springs;
    const a = appearance;
    if (sp.tip) {
      const chef = a.hat === 'chef';
      const hood = a.hat === 'hood';
      this.springs.push(
        new Spring(this.bones[B.tip], {
          dir: hood ? new THREE.Vector3(0, 0.3, -1).normalize() : new THREE.Vector3(0, 1, 0),
          length: chef ? 0.12 : 0.09,
          stiffness: chef ? 300 : 150,
          damping: chef ? 14 : 6.5,
          gravity: chef ? 1 : 3,
          maxAngle: chef ? 0.22 : 0.65,
        }),
      );
    }
    if (sp.tail) {
      const long = a.hairStyle === 'long';
      this.springs.push(
        new Spring(this.bones[B.tail], {
          dir: a.hairStyle === 'ponytail' ? new THREE.Vector3(0, -1, -0.35).normalize() : new THREE.Vector3(0, -1, 0),
          length: long ? 0.2 : 0.15,
          stiffness: long ? 120 : 70,
          damping: long ? 10 : 6,
          gravity: 5,
          maxAngle: long ? 0.3 : 0.7,
        }),
      );
    }
    if (sp.scarf) {
      this.springs.push(new Spring(this.bones[B.scarf], { dir: new THREE.Vector3(0, -1, 0.12).normalize(), length: 0.15, stiffness: 60, damping: 5, gravity: 5, maxAngle: 0.9 }));
    }
    if (sp.cape) {
      this.springs.push(new Spring(this.bones[B.cape], { dir: new THREE.Vector3(0, -1, 0), length: 0.32, stiffness: 50, damping: 6, gravity: 4, maxAngle: 0.45 }));
    }
    this.play('idle');
    this.update(0);
  }

  // ───────────────────────────── public API ─────────────────────────────

  get current(): AnyAnim {
    return this.layers[this.layers.length - 1]?.name ?? 'idle';
  }

  get dims() {
    return this.build.dims;
  }

  play(anim: AnimName | AnyAnim, opts: { loop?: boolean; speed?: number } = {}): void {
    const def = ANIMS[anim as AnyAnim];
    if (!def) return;
    const loop = opts.loop ?? def.loop;
    const speed = opts.speed ?? 1;
    const top = this.layers[this.layers.length - 1];
    if (top && top.name === anim && top.target === 1) {
      top.speed = speed;
      top.loop = loop;
      if (loop) this.baseAnim = anim as AnyAnim;
      return;
    }
    for (const l of this.layers) l.target = 0;
    this.layers.push({ name: anim as AnyAnim, def, t: 0, speed, loop, w: this.layers.length ? 0 : 1, target: 1 });
    if (this.layers.length > 4) this.layers.splice(0, this.layers.length - 4);
    if (loop) this.baseAnim = anim as AnyAnim;
    if (anim !== 'idle') this.fidgetTimer = 8 + Math.random() * 8;
  }

  /** Locomotion helper for controllers: picks walk/run/skate/idle and sets the stride speed. */
  locomote(kind: 'idle' | 'walk' | 'run' | 'skate', speed: number) {
    this.locoSpeed = speed;
    const cur = this.current;
    const isLoco = cur === 'walk' || cur === 'run' || cur === 'skate';
    if (kind === 'idle') {
      if (isLoco) this.play(this.baseAnim === cur ? 'idle' : this.baseAnim === 'walk' || this.baseAnim === 'run' || this.baseAnim === 'skate' ? 'idle' : this.baseAnim);
      return;
    }
    if (cur !== kind) this.play(kind);
  }

  setTalking(on: boolean): void {
    this.talking = on;
  }

  get isTalking() {
    return this.talking;
  }

  lookAt(target: THREE.Vector3 | null): void {
    this.lookTarget = target;
  }

  get looking() {
    return this.lookTarget;
  }

  emote(kind: 'happy' | 'surprised' | 'love' | 'note' | 'sweat' | 'idea'): void {
    const e = EXPRESSIONS[kind];
    if (!e) return;
    this.emotes.spawn(kind);
    this.expr = { t: 0, dur: e.dur, eyes: e.eyes, brow: e.brow, smile: e.smile, mouth: e.mouth };
    if (e.hop > 0) this.hop = { t: 0, h: e.hop };
    this.onEvent?.('emote:' + kind, this);
  }

  /** Height of the feet above the ground (jumps) — blob shadows shrink. */
  get footLift() {
    return this.sitting ? 0 : this.pose[P.baseY];
  }

  get sitting() {
    const n = this.dominant?.name;
    return n === 'sit' || n === 'sit-talk';
  }

  /** Persistent props (a role's tool) shown whenever the animation doesn't need that hand. */
  hold(props: { R?: PropName; L?: PropName; chest?: PropName }) {
    this.held = { ...props };
  }

  /** World position of a foot (for footprints). */
  footWorld(side: 'l' | 'r', out = new THREE.Vector3()): THREE.Vector3 {
    const d = this.build.dims;
    out.set(side === 'l' ? d.legX : -d.legX, 0, 0.04);
    out.applyQuaternion(this.root.quaternion);
    return out.add(this.root.position).setY(this.root.position.y);
  }

  /** World position of a mitten (snowballs, steam). */
  handWorld(side: 'L' | 'R', out = new THREE.Vector3()): THREE.Vector3 {
    return this.bones[side === 'R' ? B.handR : B.handL].getWorldPosition(out);
  }

  /** World position just in front of the mouth (breath puffs). */
  mouthWorld(out = new THREE.Vector3()): THREE.Vector3 {
    this.bones[B.head].updateWorldMatrix(true, false);
    out.copy(this.build.face.mouthFront).sub(this.build.face.mouth).add(this.rest[B.mouth]);
    return this.bones[B.head].localToWorld(out);
  }

  /** Approximate world position of the top of the head. */
  headWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.root.position).setY(this.root.position.y + this.height * this.root.scale.y);
  }

  // ───────────────────────────── update ─────────────────────────────

  update(dt: number): void {
    dt = Math.min(dt, 0.25);
    this.time += dt;
    this.actx.seat = this.seat;
    this.advanceLayers(dt);
    this.computePose();
    this.additive(dt);
    this.apply();
    const needMatrices = (this.springsEnabled && this.springs.length > 0) || this.props.R || this.props.L || this.props.chest;
    if (needMatrices && dt > 0) {
      this.root.updateMatrixWorld(true);
      if (this.springsEnabled) for (const s of this.springs) s.update(dt);
      this.updateProps(dt);
    }
    this.emotes.update(dt);
  }

  private advanceLayers(dt: number) {
    // shared stride phase for locomotion
    let strideW = 0;
    let stride = 0;
    for (const l of this.layers) {
      if (l.def.stride) {
        strideW += l.w;
        stride += l.def.stride * l.w;
      }
    }
    if (strideW > 0) {
      stride = (stride / strideW) * this.build.dims.h;
      const top = this.layers[this.layers.length - 1];
      const fallback = top?.name === 'run' ? 5 : top?.name === 'skate' ? 3.2 : 2.2;
      const speed = this.locoSpeed > 0.01 ? this.locoSpeed : fallback;
      const prev = this.locoPhase;
      this.locoPhase = (this.locoPhase + (speed * dt) / stride) % 1;
      const dom = this.dominantLoco();
      if (dom?.def.events && this.onEvent) {
        for (const [et, name] of dom.def.events) if (crossed(prev, this.locoPhase, et)) this.onEvent(name, this);
      }
    }
    let maxW = -1;
    this.dominant = null;
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const l = this.layers[i];
      const rate = dt / Math.max(0.05, (l.target > l.w ? l.def.fade : this.layers[this.layers.length - 1].def.fade) || 0.2);
      l.w = l.target > l.w ? Math.min(l.target, l.w + rate) : Math.max(l.target, l.w - rate);
      if (!l.def.stride) {
        const prevT = l.t;
        l.t += dt * l.speed;
        const D = l.def.duration;
        if (l.def.events && this.onEvent && l.target === 1) {
          const a = (prevT % D) / D;
          const b = (l.t % D) / D;
          for (const [et, name] of l.def.events) if (crossed(a, b, et) || (prevT === 0 && et === 0 && dt > 0)) this.onEvent(name, this);
        }
        if (!l.loop && l.t >= D && l.target === 1) {
          l.t = D;
          const back = this.baseAnim === l.name ? 'idle' : this.baseAnim;
          this.play(back);
        }
      }
      if (l.target === 0 && l.w <= 0) this.layers.splice(i, 1);
      else if (l.w > maxW) {
        maxW = l.w;
        this.dominant = l;
      }
    }
  }

  private dominantLoco(): Layer | null {
    let best: Layer | null = null;
    for (const l of this.layers) if (l.def.stride && l.w > 0.5 && (!best || l.w > best.w)) best = l;
    return best;
  }

  private computePose() {
    const p = this.pose;
    let sum = 0;
    for (const l of this.layers) sum += smooth01(l.w);
    if (sum <= 1e-4) {
      p.set(REST);
      return;
    }
    p.fill(0);
    const tmp = this.tmp;
    for (const l of this.layers) {
      const w = smooth01(l.w) / sum;
      if (w <= 0) continue;
      tmp.set(REST);
      const t = l.def.stride ? this.locoPhase : l.loop ? (l.def.loop ? l.t : l.t % l.def.duration) : Math.min(l.t, l.def.duration);
      l.def.fn(t, tmp, this.actx);
      for (let i = 0; i < POSE_SIZE; i++) p[i] += tmp[i] * w;
    }
  }

  private additive(dt: number) {
    const p = this.pose;
    const t = this.time;
    const dom = this.dominant;
    const idleLike = !!dom?.def.idleLike;

    // banking into turns
    p[P.hipsRZ] += this.lean;
    p[P.headRZ] -= this.lean * 0.4;

    // talking mouth
    if (this.talking || dom?.def.talks) {
      const m = clamp(0.25 + 0.45 * Math.sin(t * 15.3) + 0.3 * Math.sin(t * 9.1 + 1.3), 0, 1) * (0.55 + 0.45 * Math.sin(t * 2.1) ** 2);
      p[P.mouth] = Math.max(p[P.mouth], m);
      p[P.smile] *= 0.8;
      p[P.headRX] += 0.035 * Math.sin(t * 7.3);
      p[P.headRY] += 0.025 * Math.sin(t * 2.9);
      p[P.brow] += 0.15 * Math.sin(t * 3.7);
    }

    // emote expression
    if (this.expr) {
      const e = this.expr;
      e.t += dt;
      const k = smoothstep(0, 0.12, e.t) * (1 - smoothstep(e.dur - 0.35, e.dur, e.t));
      p[P.eyes] = p[P.eyes] + (e.eyes - p[P.eyes]) * k;
      p[P.brow] += (e.brow - p[P.brow]) * k;
      p[P.smile] += (e.smile - p[P.smile]) * k;
      p[P.mouth] = Math.max(p[P.mouth], e.mouth * k);
      if (e.t >= e.dur) this.expr = null;
    }

    // hop (emotes)
    if (this.hop.t >= 0) {
      this.hop.t += dt;
      const u = this.hop.t / 0.42;
      if (u >= 1) this.hop.t = -1;
      else {
        p[P.baseY] += this.hop.h * 4 * u * (1 - u) * this.build.dims.h;
        p[P.baseSY] *= 1 + 0.08 * Math.sin(u * Math.PI) - 0.1 * bump(u * 4 - 3);
      }
    }

    // blink
    const bl = this.blink;
    if (bl.t < 0) {
      bl.timer -= dt;
      if (bl.timer <= 0) {
        bl.t = 0;
        bl.double = Math.random() < 0.15;
      }
    } else {
      bl.t += dt;
      const D = 0.16;
      const u = bl.t / D;
      const close = u < 0.4 ? u / 0.4 : 1 - (u - 0.4) / 0.6;
      p[P.eyes] *= 1 - 0.95 * clamp(close, 0, 1);
      if (u >= 1) {
        if (bl.double) {
          bl.double = false;
          bl.t = -0.05;
        } else {
          bl.t = -1;
          bl.timer = 1.8 + Math.random() * 3.6;
        }
      }
    }

    // look-at
    let yaw = 0;
    let pitch = 0;
    let has = false;
    if (this.lookTarget) {
      this.root.updateWorldMatrix(true, false);
      _v.copy(this.lookTarget);
      this.root.worldToLocal(_v);
      const headY = this.build.dims.neckY + this.build.dims.headC;
      const hd = Math.hypot(_v.x, _v.z);
      if (hd > 0.05) {
        yaw = Math.atan2(_v.x, _v.z);
        pitch = Math.atan2(_v.y - headY, hd);
        has = true;
      }
    } else if (this.lookAround && idleLike) {
      const il = this.idleLook;
      il.timer -= dt;
      if (il.timer <= 0) {
        const away = il.yaw === 0 && il.pitch === 0;
        il.yaw = away ? (Math.random() - 0.5) * 1.6 : 0;
        il.pitch = away ? (Math.random() - 0.35) * 0.4 : 0;
        il.timer = away ? 1.4 + Math.random() * 2 : 2.5 + Math.random() * 5;
      }
      yaw = il.yaw;
      pitch = il.pitch;
    }
    // body turns when the target is far to the side/behind
    const absY = Math.abs(yaw);
    const wantTurn = has && absY > 1.3 ? Math.sign(yaw) * (absY - 0.9) : 0;
    this.bodyTurn = dampAngle(this.bodyTurn, wantTurn, 3.2, dt);
    const rem = wrapAngle(yaw - this.bodyTurn);
    const k = damp(has ? 7 : 4, dt);
    this.lookYaw += (clamp(rem, -1.35, 1.35) - this.lookYaw) * k;
    this.lookPitch += (clamp(pitch, -0.5, 0.55) - this.lookPitch) * k;
    const ke = damp(16, dt);
    this.eyeX += (clamp((rem - this.lookYaw) * 0.025, -0.012, 0.012) - this.eyeX) * ke;
    this.eyeY += (clamp((pitch - this.lookPitch) * 0.02 + this.lookPitch * 0.008, -0.008, 0.01) - this.eyeY) * ke;
    p[P.headRY] += this.lookYaw * 0.72;
    p[P.chestRY] += this.lookYaw * 0.28;
    p[P.headRX] -= this.lookPitch * 0.8;
    p[P.eyeX] += this.eyeX;
    p[P.eyeY] += this.eyeY;

    // idle fidgets (rubbing mittens, stomping for warmth)
    if (this.autoFidget && dom && dom.name === 'idle' && !this.talking) {
      this.fidgetTimer -= dt;
      if (this.fidgetTimer <= 0) {
        this.fidgetTimer = 9 + Math.random() * 10;
        this.play(Math.random() < 0.55 ? 'rub' : 'stomp');
      }
    }
  }

  private apply() {
    const p = this.pose;
    const b = this.bones;
    const r = this.rest;
    const k = this.build.dims.hk;
    const base = b[B.base];
    base.position.set(r[B.base].x, r[B.base].y + p[P.baseY], r[B.base].z);
    base.rotation.set(p[P.baseRX], p[P.baseRY] + this.bodyTurn, p[P.baseRZ]);
    base.scale.set(p[P.baseSX], p[P.baseSY], p[P.baseSX]);
    const hips = b[B.hips];
    hips.position.set(r[B.hips].x + p[P.hipsX], r[B.hips].y + p[P.hipsY], r[B.hips].z + p[P.hipsZ]);
    hips.rotation.set(p[P.hipsRX], p[P.hipsRY], p[P.hipsRZ]);
    const chest = b[B.chest];
    chest.position.set(r[B.chest].x, r[B.chest].y + p[P.chestY], r[B.chest].z);
    chest.rotation.set(p[P.chestRX], p[P.chestRY], p[P.chestRZ]);
    const head = b[B.head];
    head.rotation.order = 'YXZ';
    head.rotation.set(p[P.headRX], p[P.headRY], p[P.headRZ]);
    const eyes = b[B.eyes];
    eyes.position.set(r[B.eyes].x + p[P.eyeX] * k, r[B.eyes].y + p[P.eyeY] * k, r[B.eyes].z);
    const eo = Math.max(0.06, p[P.eyes]);
    eyes.scale.set(1 + (eo > 1 ? (eo - 1) * 0.6 : 0), eo, 1);
    const m = clamp(p[P.mouth], 0, 1);
    b[B.mouth].scale.set(0.55 + 0.45 * m, Math.max(0.03, m), 0.7 + 0.3 * m);
    const sm = clamp(p[P.smile], 0.2, 1.6) * (1 - 0.45 * m);
    b[B.smile].scale.set(sm, Math.max(0.2, sm), 1);
    b[B.brows].position.set(r[B.brows].x, r[B.brows].y + p[P.brow] * 0.013 * k, r[B.brows].z);
    b[B.armL].rotation.set(p[P.armLX], p[P.armLY], p[P.armLZ]);
    b[B.armR].rotation.set(p[P.armRX], p[P.armRY], p[P.armRZ]);
    b[B.handL].rotation.set(p[P.handLX], p[P.handLY], p[P.handLZ]);
    b[B.handR].rotation.set(p[P.handRX], p[P.handRY], p[P.handRZ]);
    const lL = b[B.legL];
    lL.rotation.set(p[P.legLX], 0, p[P.legLZ]);
    lL.position.set(r[B.legL].x, r[B.legL].y + p[P.legLY], r[B.legL].z);
    const lR = b[B.legR];
    lR.rotation.set(p[P.legRX], 0, p[P.legRZ]);
    lR.position.set(r[B.legR].x, r[B.legR].y + p[P.legRY], r[B.legR].z);
    if (!this.springsEnabled) for (const i of [B.tip, B.tail, B.scarf, B.cape]) b[i].quaternion.identity();
  }

  private updateProps(dt: number) {
    const dom = this.dominant;
    const want: { R?: PropName; L?: PropName; chest?: PropName } = dom?.def.props ? dom.def.props : dom && USES_HANDS.has(dom.name) ? { chest: this.held.chest } : this.held;
    for (const slot of ['R', 'L', 'chest'] as const) {
      const name = want[slot];
      const cur = this.props[slot];
      if ((cur?.name ?? null) !== (name ?? null)) {
        if (cur) {
          cur.object.removeFromParent();
          cur.dispose();
        }
        this.props[slot] = name ? this.attachProp(slot, name) : null;
      }
      const pr = this.props[slot];
      if (!pr) continue;
      const parent = pr.object.parent!;
      if (pr.upright) {
        parent.matrixWorld.decompose(_m, _q, _s);
        this.root.matrixWorld.decompose(_m, _q2, _s);
        pr.object.quaternion.copy(_q.invert()).multiply(_q2).multiply(pr.rot);
      }
      pr.update?.(this.pose, this.time, dt);
    }
  }

  private attachProp(slot: 'R' | 'L' | 'chest', name: PropName): PropInstance {
    const d = this.build.dims;
    const pr = createProp(name, d.handR);
    if (slot === 'chest') {
      this.bones[B.chest].add(pr.object);
      pr.object.position.set(0, -0.05 * d.h, 0.28 * d.b);
      pr.object.scale.setScalar(1.12);
    } else {
      const bone = this.bones[slot === 'R' ? B.handR : B.handL];
      bone.add(pr.object);
      pr.object.position.add(pr.grip);
      if (!pr.upright) pr.object.quaternion.copy(pr.rot);
      if (slot === 'L') pr.object.scale.x = -1;
    }
    pr.object.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = this.mesh.castShadow;
    });
    return pr;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.emotes.dispose();
    for (const slot of ['R', 'L', 'chest'] as const) this.props[slot]?.dispose();
    this.mesh.geometry.dispose();
    this.mesh.skeleton.dispose();
  }
}

const USES_HANDS = new Set<AnyAnim>(['wave', 'cheer', 'clap', 'throw', 'invite', 'point', 'rub', 'think', 'scoop', 'talk']);

function crossed(a: number, b: number, x: number) {
  return a <= b ? a < x && x <= b : a < x || x <= b;
}

function smooth01(w: number) {
  return w * w * (3 - 2 * w);
}

/** ctx-free factory (also used by the stall editor for previews). */
export function createCosyRig(appearance: Required<CharacterAppearance>, opts: { detail?: number } = {}): CosyRig {
  return new CosyRig(appearance, opts.detail ?? 1);
}
