import * as THREE from 'three';
import type { GameContext } from '../core/contracts';
import { Timeline, easeInOut } from './timeline';
import { hot } from './fx';
import type { TreeStars } from './treeStars';
import type { Pickups } from './pickups';
import type { PlannedStar, StoryRuntime } from './types';
import { DEFAULT_INTRO, INTRO_HANDOVER, INTRO_HANDOVER_NO_GUIDE } from './text';

/**
 * The opening fly-over (≈ 40 s, skippable):
 *  1. high in the sky by the moon, slowly tilting down over the valley onto the snowy village;
 *  2. gliding over the rooftops while the market switches on in a wave of light (the magic moment);
 *  3. by the dim Grand Sapin: a gust of North wind blows its seven glass stars away;
 *  4. down to the gate, behind the visitor, handing over to the follow camera.
 */

interface Glint {
  star: PlannedStar;
  slot: number;
  t: number;
  dur: number;
  from: THREE.Vector3;
  ctrl: THREE.Vector3;
  to: THREE.Vector3;
  last: THREE.Vector3;
  color: THREE.Color;
  left: boolean;
  done: boolean;
}

interface ShotCue {
  at: number;
  keys: ShotKey[];
  duration: number;
  fov?: number;
}

interface LineCue {
  at: number;
  text: string;
  dur: number;
}

const WAVE_AT = 10.4;
const GUST_AT = 22.5;
const GLINTS_AT = 23.05;
const INTRO_END = 38.65;

/** Same evaluation as CameraRig.playShot (centripetal Catmull-Rom). */
export function evalKeys(keys: ShotKey[], e: number): ShotKey {
  const k = keys.length === 1 ? [keys[0], keys[0]] : keys;
  const pc = new THREE.CatmullRomCurve3(k.map((x) => x.pos.clone()), false, 'centripetal');
  const lc = new THREE.CatmullRomCurve3(k.map((x) => x.look.clone()), false, 'centripetal');
  return { pos: pc.getPoint(e), look: lc.getPoint(e) };
}

export type ShotKey = Parameters<GameContext['cameraRig']['playShot']>[0]['keys'][number];

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Split the configured lines over the three narrated beats (sky, wave, gust). */
function distribute(lines: string[]) {
  const L = lines.filter((l) => typeof l === 'string' && l.trim()).slice(0, 7);
  const table: Record<number, [number, number, number]> = { 1: [1, 0, 0], 2: [1, 1, 0], 3: [1, 1, 1], 4: [2, 1, 1], 5: [2, 1, 2], 6: [2, 2, 2], 7: [3, 2, 2] };
  const [a, b, c] = table[L.length] ?? [0, 0, 0];
  return { sky: L.slice(0, a), wave: L.slice(a, a + b), gust: L.slice(a + b, a + b + c) };
}

function moonDirection(scene: THREE.Scene): THREE.Vector3 {
  let found: THREE.Object3D | null = null;
  scene.traverse((o) => {
    if (!found && /moon|lune/i.test(o.name)) found = o;
  });
  if (found) {
    const p = (found as THREE.Object3D).getWorldPosition(new THREE.Vector3());
    if (p.lengthSq() > 400 && p.y > 5) return p.normalize();
  }
  // the moon rises in the east, a little to the north
  return V(0.62, 0.4, -0.66).normalize();
}

export class Intro {
  private tl: Timeline | null = null;
  private glints: Glint[] = [];
  private gustT = 0;
  private gustColor = hot('#f2f6ff', 1.15);
  private tmp = new THREE.Vector3();
  private finishing: Promise<void> | null = null;
  running = false;

  constructor(
    private story: StoryRuntime,
    private tree: TreeStars,
    private pickups: Pickups,
    /** Puts the game in its "after the intro" state (lights, HUD, objective, beacon). */
    private onEnd: () => void,
    /** Back to the real progress on the tree. */
    private restoreTree: () => void,
  ) {}

  /** Follow-camera pose behind the visitor (so the last shot lands exactly on it). */
  private followPose(yaw: number): ShotKey {
    const { ctx } = this.story;
    const rig = ctx.cameraRig;
    const p = ctx.player.position;
    const look = V(p.x, p.y + rig.lookHeight, p.z);
    const horiz = Math.cos(rig.pitch) * rig.distance;
    const pos = V(look.x - Math.sin(yaw) * horiz, look.y + Math.sin(rig.pitch) * rig.distance, look.z - Math.cos(yaw) * horiz);
    return { pos, look };
  }

  /** The whole intro as data: camera shots and narrated lines on the timeline (seconds). */
  private script(): { shots: ShotCue[]; lines: LineCue[] } {
    const { ctx } = this.story;
    const spawn = ctx.layout.spawn;
    const md = moonDirection(ctx.scene);
    const back = V(-md.x, 0, -md.z);
    if (back.lengthSq() < 1e-3) back.set(0, 0, 1);
    back.normalize();
    const side = V(-back.z, 0, back.x);
    const at = (r: number, h: number, s = 0) => back.clone().multiplyScalar(r).addScaledVector(side, s).setY(h);
    const A0 = at(104, 58, 6);
    const A1 = at(86, 48, 4);
    // 1–2: by the moon, tilting down over the valley, then gliding over the rooftops to the plaza
    const shotA: ShotKey[] = [
      { pos: A0, look: A0.clone().addScaledVector(md, 120) },
      { pos: A1, look: A1.clone().addScaledVector(md, 120).lerp(V(0, 4, 0), 0.42) },
      { pos: at(60, 31, 2), look: V(0, 3, 0) },
      { pos: at(36, 14, 1), look: V(0, 4.5, 0) },
      { pos: at(23, 8.5, 0), look: V(0, 6.5, 0) },
    ];
    const thA = Math.atan2(shotA[4].pos.x, shotA[4].pos.z);
    // 3: end south of the tree so the North wind blows toward the camera
    let d = 0.22 - thA;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const thS = thA + d;
    const orbit = (th: number, r: number, h: number) => V(Math.sin(th) * r, h, Math.cos(th) * r);
    const shotB: ShotKey[] = [
      { pos: shotA[4].pos.clone(), look: V(0, 6.5, 0) },
      { pos: orbit(thA + d * 0.55, 22.5, 7.4), look: V(0, 7, 0) },
      { pos: orbit(thS, 22, 6.4), look: V(0, 7.6, 0) },
    ];
    // …pulling back and up to watch the glints scatter over the market
    const shotC: ShotKey[] = [
      { pos: orbit(thS, 22, 6.4), look: V(0, 7.6, 0) },
      { pos: orbit(thS * 0.6, 29, 16), look: V(0, 4.5, -2) },
      { pos: orbit(thS * 0.25, 38, 31), look: V(0, 2, -5) },
    ];
    // 4: down to the gate, landing exactly on the follow camera behind the visitor
    const end = this.followPose(spawn.yaw);
    const cEnd = shotC[2].pos;
    const shotD: ShotKey[] = [
      { pos: cEnd.clone(), look: V(0, 2, -5) },
      { pos: V(cEnd.x * 0.4, 18, (cEnd.z + end.pos.z) / 2 + 2), look: V(end.look.x, 3, end.look.z - 12) },
      end,
    ];
    const shots: ShotCue[] = [
      { at: 0, keys: shotA, duration: 20, fov: 40 },
      { at: 20, keys: shotB, duration: 2.55, fov: 42 },
      { at: 22.6, keys: shotC, duration: 7, fov: 52 },
      { at: 29.7, keys: shotD, duration: 8.9, fov: ctx.cameraRig.baseFov },
    ];

    const configured = ctx.config.story.intro?.length ? ctx.config.story.intro : DEFAULT_INTRO;
    const beats = distribute(configured);
    const guideName = this.story.guide?.name;
    const lines: LineCue[] = [];
    const spread = (texts: string[], from: number, to: number) => {
      if (!texts.length) return;
      const slot = (to - from) / texts.length;
      texts.forEach((text, i) => lines.push({ at: from + i * slot, text, dur: Math.max(2.8, slot - 0.45) }));
    };
    spread(beats.sky, 0.9, 10.2);
    spread(beats.wave, 10.8, 19.8);
    if (beats.gust.length >= 2) {
      lines.push({ at: 20.2, text: beats.gust[0], dur: 3.7 });
      spread(beats.gust.slice(1), 23.9, 29.6);
    } else spread(beats.gust, 20.4, 26);
    lines.push({ at: 30.4, text: guideName ? INTRO_HANDOVER(guideName) : INTRO_HANDOVER_NO_GUIDE, dur: 5.8 });
    return { shots, lines };
  }

  /** Everything at rest before the first shot: the market asleep, the stars still on the tree. */
  private setStage() {
    const { ctx } = this.story;
    ctx.setMode('cinematic');
    ctx.ui.setHudVisible(false);
    ctx.ui.letterbox(true);
    ctx.ui.setPrompt(null);
    const spawn = ctx.layout.spawn;
    ctx.player.teleport(V(spawn.position.x, 0, spawn.position.z), spawn.yaw);
    try {
      ctx.player.rig.play('idle');
    } catch {
      /* ignore */
    }
    ctx.lights.setAll(0);
    ctx.lights.setAll(1, 'window');
    ctx.landmarks.setTreeLight(0);
    this.tree.fill(this.story.plan.map((s) => s.tint));
    this.pickups.hideAll();
  }

  async play(): Promise<void> {
    if (this.running) return;
    const { ctx } = this.story;
    this.running = true;
    const tl = (this.tl = new Timeline(ctx));
    const reduced = this.story.reducedMotion();
    this.setStage();
    ctx.ui.setSkippable(() => void this.skip());
    const { shots, lines } = this.script();

    // ── 0 s: fade through black into the sky ──
    await ctx.fade(1, 450);
    if (tl.aborted) return this.finishing ?? undefined;
    ctx.post.setExposure(0.82, 0);
    ctx.cameraRig.cut(shots[0].keys[0].pos, shots[0].keys[0].look);
    for (const s of shots) tl.cue(s.at, () => void ctx.cameraRig.playShot({ keys: s.keys, duration: s.duration, ease: 'inOut', fov: s.fov }));
    void ctx.fade(0, 1600);
    for (const l of lines) tl.cue(l.at, () => void ctx.ui.narrate(l.text, { duration: Math.round(l.dur * 1000) }));

    // ── 10.4 s: the market switches on, from the Grand Sapin outward ──
    tl.cue(WAVE_AT, () => {
      ctx.lights.wave({ x: 0, z: 0 }, { speed: 12 });
      ctx.landmarks.setTreeLight(0);
      ctx.post.setExposure(1, 3.5);
      ctx.post.setBloomBoost(1.45, 1.1);
      ctx.audio.sfx('magic', { volume: 0.9 });
    });
    tl.cue(11.5, () => ctx.audio.sfx('chime', { volume: 0.7 }));
    tl.cue(12.4, () => ctx.post.setBloomBoost(1, 4));
    tl.cue(12.7, () => ctx.audio.sfx('chime', { volume: 0.55, pitch: 1.26 }));
    tl.cue(14.2, () => ctx.audio.sfx('bell', { volume: 0.45 }));

    // ── 22.5 s: the North wind ──
    tl.cue(GUST_AT, () => {
      ctx.audio.sfx('whoosh', { volume: 1, pitch: 0.7 });
      if (!reduced) ctx.cameraRig.shake(0.22, 0.9);
      this.gustT = 1.3;
    });
    tl.cue(GLINTS_AT, () => this.launchGlints());

    const ok = await tl.at(INTRO_END);
    if (!ok) return this.finishing ?? undefined;
    ctx.cameraRig.follow(ctx.player.rig.root, { yaw: ctx.layout.spawn.yaw });
    this.cleanup();
    this.onEnd();
    if (ctx.mode === 'cinematic') ctx.setMode('explore');
  }

  /**
   * Debug / visual checks: freeze the intro at time `t` (camera, lights, stars, glints, subtitle).
   * `__givrelune.ctx.story.scrubIntro(22)`. Not used by the game.
   */
  scrub(t: number) {
    const { ctx, sparks } = this.story;
    if (this.running) return;
    this.setStage();
    const { shots, lines } = this.script();
    let fov = ctx.cameraRig.baseFov;
    let pose: ShotKey = shots[0].keys[0];
    for (const s of shots) {
      if (t < s.at) break;
      const e = easeInOut(Math.min(1, (t - s.at) / s.duration));
      const f0 = fov;
      if (s.fov) fov = f0 + (s.fov - f0) * e;
      pose = evalKeys(s.keys, e);
    }
    ctx.cameraRig.cut(pose.pos, pose.look);
    ctx.camera.fov = fov;
    ctx.camera.updateProjectionMatrix();
    if (t >= WAVE_AT) ctx.lights.setAll(1);
    ctx.post.setExposure(t >= WAVE_AT ? 1 : 0.82, 0);
    sparks.clear();
    this.glints = [];
    this.gustT = 0;
    if (t >= GUST_AT) {
      const dt = 1 / 30;
      let tt = GUST_AT;
      this.gustT = 1.3;
      let launched = false;
      while (tt < t) {
        if (!launched && tt >= GLINTS_AT) {
          this.launchGlints();
          launched = true;
        }
        this.update(dt);
        sparks.update(dt);
        tt += dt;
      }
    }
    const line = lines.find((l) => t >= l.at && t < l.at + l.dur);
    if (line) void ctx.ui.narrate(line.text, { duration: 600000 });
  }

  /** "Passer": stop everything and jump to the end state. */
  skip(): Promise<void> {
    if (!this.running || !this.tl) return Promise.resolve();
    if (this.finishing) return this.finishing;
    const { ctx } = this.story;
    this.tl.abort();
    ctx.ui.setSkippable(null);
    this.finishing = (async () => {
      await ctx.fade(1, 260);
      ctx.cameraRig.stopShot();
      this.cleanup();
      const spawn = ctx.layout.spawn;
      ctx.player.teleport(V(spawn.position.x, 0, spawn.position.z), spawn.yaw);
      ctx.cameraRig.follow(ctx.player.rig.root, { snap: true, yaw: spawn.yaw });
      ctx.camera.fov = ctx.cameraRig.baseFov;
      ctx.camera.updateProjectionMatrix();
      ctx.post.setExposure(1, 0);
      ctx.post.setBloomBoost(1, 0);
      this.onEnd();
      if (ctx.mode === 'cinematic') ctx.setMode('explore');
      await ctx.fade(0, 650);
    })();
    return this.finishing;
  }

  private cleanup() {
    this.tl?.dispose();
    this.tl = null;
    this.glints = [];
    this.gustT = 0;
    this.running = false;
    this.restoreTree();
    this.pickups.revealAll();
    const { ctx } = this.story;
    ctx.ui.letterbox(false);
    ctx.ui.setSkippable(null);
  }

  private launchGlints() {
    const { plan } = this.story;
    plan.forEach((s, i) => {
      const from = (this.tree.sockets[i] ?? new THREE.Vector3(0, 8, 0)).clone();
      const to = s.home.clone().setY(1.3);
      const dist = from.distanceTo(to);
      const ctrl = from.clone().add(to).multiplyScalar(0.5).setY(Math.max(from.y, to.y) + 5 + dist * 0.24);
      this.glints.push({
        star: s,
        slot: i,
        t: -i * 0.11,
        dur: 2.3 + dist * 0.022,
        from,
        ctrl,
        to,
        last: from.clone(),
        color: new THREE.Color(s.tint).lerp(new THREE.Color('#fff6e0'), 0.4).multiplyScalar(2.3),
        left: false,
        done: false,
      });
    });
  }

  update(dt: number) {
    const sparks = this.story.sparks;
    // North-wind gust: a sheet of snow blown from behind the tree toward the gate
    if (this.gustT > 0) {
      this.gustT -= dt;
      const low = this.story.ctx.quality.tier === 'low';
      const n = Math.round(200 * dt * (low ? 1.3 : 2.6));
      for (let k = 0; k < n; k++) {
        const streak = !low && Math.random() < 0.3;
        sparks.emit((Math.random() - 0.5) * 26, 0.4 + Math.random() * 14, -22 + Math.random() * 26, (Math.random() - 0.5) * 3, (Math.random() - 0.3) * 1.6, 16 + Math.random() * 10, {
          color: this.gustColor,
          life: 1.3 + Math.random() * 1,
          size: 0.1 + Math.random() * 0.12,
          sizeEnd: 0.06,
          drag: 0.25,
          gravity: -0.6,
          fadeIn: 0.12,
          trail: streak ? 0.035 : 0,
        });
      }
    }
    for (const g of this.glints) {
      if (g.done) continue;
      g.t += dt;
      if (g.t < 0) continue;
      if (!g.left) {
        // the star leaves its branch
        g.left = true;
        this.tree.set(g.slot, null);
        sparks.burst(g.from, 14, new THREE.Color(g.star.tint).multiplyScalar(2.5), { speed: 2, life: 0.7 });
        this.story.ctx.audio.sfx('chime', { volume: 0.32, pitch: 0.9 + g.slot * 0.12, position: g.from });
      }
      const x = Math.min(1, g.t / g.dur);
      // gentle lift-off from the branch (C1-continuous), then a long gliding arc
      const e = x < 0.12 ? 7.59 * x * x : 0.1093 + (1 - Math.pow(1 - (x - 0.12) / 0.88, 1.8)) * 0.8907;
      const a = (1 - e) * (1 - e);
      const b = 2 * (1 - e) * e;
      const c = e * e;
      const p = this.tmp.set(
        a * g.from.x + b * g.ctrl.x + c * g.to.x,
        a * g.from.y + b * g.ctrl.y + c * g.to.y,
        a * g.from.z + b * g.ctrl.z + c * g.to.z,
      );
      // bright head (smaller when it brushes past the camera, so it never blows out the frame)
      const near = THREE.MathUtils.clamp(p.distanceTo(this.story.ctx.camera.position) / 16, 0.3, 1);
      sparks.emit(p.x, p.y, p.z, 0, 0, 0, { color: g.color, life: 0.045, size: 0.85 * near, sizeEnd: 0.7 * near, fadeIn: 0.01 });
      // trail
      const seg = p.clone().sub(g.last);
      const steps = Math.min(9, Math.ceil(seg.length() / 0.16));
      for (let s = 1; s <= steps; s++) {
        const u = s / steps;
        sparks.emit(g.last.x + seg.x * u, g.last.y + seg.y * u, g.last.z + seg.z * u, (Math.random() - 0.5) * 0.5, -0.3 - Math.random() * 0.4, (Math.random() - 0.5) * 0.5, {
          color: g.color,
          life: 0.9 + Math.random() * 0.7,
          size: 0.3 * near,
          sizeEnd: 0.01,
          drag: 1.4,
          twinkle: true,
          hot: true,
        });
      }
      g.last.copy(p);
      if (x >= 1) {
        g.done = true;
        sparks.burst(g.to, 18, g.color, { speed: 1.8, life: 0.9, size: 0.18 });
        this.pickups.reveal(g.star.id);
      }
    }
  }
}
