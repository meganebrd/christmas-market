import * as THREE from 'three';
import { Timeline, easeInOut } from './timeline';
import { hot } from './fx';
import { V, evalKeys, type ShotKey } from './intro';
import type { Fireworks } from './fireworks';
import type { TreeStars } from './treeStars';
import type { StoryRuntime } from './types';
import { DEFAULT_FINALE } from './text';

interface ShotCue {
  at: number;
  keys: ShotKey[];
  duration: number;
  fov?: number;
}

const BLAZE_AT = 4.2;
const FIREWORKS_AT = 11.2;
const FINALE_END = 41.1;

/**
 * The grand finale (≈ 40 s, skippable): a slow rising orbit around the Grand Sapin as the last star
 * finds its branch, the tree blazes, the music swells, then fireworks over the plaza while every
 * villager cheers. Replayable from Céleste (shorter, fireworks only).
 */
export class Finale {
  running = false;
  private tl: Timeline | null = null;
  private replay = false;
  private started = false;
  private finishing: Promise<void> | null = null;
  private blazeT = 0;
  private blazeColor = hot('#ffd27a', 2.6);
  private blazeColor2 = hot('#fff1c9', 2.4);

  constructor(
    private story: StoryRuntime,
    private tree: TreeStars,
    private fireworks: Fireworks,
    private onEnd: (replay: boolean) => void,
  ) {}

  private followPose(yaw: number): ShotKey {
    const { ctx } = this.story;
    const rig = ctx.cameraRig;
    const p = ctx.player.position;
    const look = V(p.x, p.y + rig.lookHeight, p.z);
    const horiz = Math.cos(rig.pitch) * rig.distance;
    return { pos: V(look.x - Math.sin(yaw) * horiz, look.y + Math.sin(rig.pitch) * rig.distance, look.z - Math.cos(yaw) * horiz), look };
  }

  /** Yaw for the follow camera so that the visitor looks at the tree. */
  private treeYaw() {
    const p = this.story.ctx.player.position;
    return Math.hypot(p.x, p.z) > 0.5 ? Math.atan2(-p.x, -p.z) : Math.PI;
  }

  private static WIDE: ShotKey = { pos: V(1.5, 3.2, 22), look: V(0, 12, -6) };
  private static DRIFT: ShotKey[] = [Finale.WIDE, { pos: V(-1.2, 2.9, 19.8), look: V(0, 12.6, -7) }, { pos: V(-3.6, 2.5, 17.6), look: V(0, 13.4, -8) }];

  /** The first-time finale as data: shots and narration (seconds). */
  private script(cam: THREE.Vector3, camLook: THREE.Vector3) {
    const { ctx } = this.story;
    const wide = Finale.WIDE;
    const drift = Finale.DRIFT;
    // a slow rising orbit around the tree, ending south-south-east (fireworks go up behind the tree)
    const th0 = Math.atan2(cam.x, cam.z);
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    const dir = Math.abs(wrap(th0 + 2 - 0.3)) < Math.abs(wrap(th0 - 2 - 0.3)) ? 1 : -1;
    const orbit: ShotKey[] = [{ pos: cam.clone(), look: camLook.clone() }];
    for (const f of [0.2, 0.4, 0.6, 0.8, 1]) {
      const th = th0 + dir * 2 * f;
      const r = 13 + 9 * f;
      orbit.push({ pos: V(Math.sin(th) * r, 2.4 + 6.6 * f, Math.cos(th) * r), look: V(0, 4.5 + 5 * f, 0) });
    }
    const oEnd = orbit[orbit.length - 1];
    const end = this.followPose(this.treeYaw());
    const shots: ShotCue[] = [
      { at: 0, keys: orbit, duration: 14, fov: 44 },
      { at: 14, keys: [oEnd, { pos: oEnd.pos.clone().lerp(wide.pos, 0.5).setY(6), look: V(0, 12, -2) }, wide], duration: 9, fov: 55 },
      { at: 23, keys: drift, duration: 13, fov: 55 },
      { at: 36.2, keys: [drift[2], { pos: end.pos.clone().lerp(drift[2].pos, 0.5).setY(end.pos.y + 1.5), look: V(0, 6, 0) }, end], duration: 4.8, fov: ctx.cameraRig.baseFov },
    ];
    const cfg = ctx.config.story.finale?.length ? ctx.config.story.finale : DEFAULT_FINALE;
    const lines: { at: number; text: string; dur: number }[] = [];
    if (cfg[0]) lines.push({ at: 0.6, text: cfg[0], dur: 4 });
    if (cfg[1]) lines.push({ at: 5, text: cfg[1], dur: 5.8 });
    const rest = cfg.slice(2, 6);
    if (rest.length) {
      const from = rest.length > 1 ? 24 : 30;
      const slot = (36.5 - from) / rest.length;
      rest.forEach((text, i) => lines.push({ at: from + i * slot, text, dur: Math.max(3, slot - 0.5) }));
    }
    return { shots, lines };
  }

  /**
   * Debug / visual checks: freeze the finale at time `t` (camera, tree, fireworks simulated up to t).
   * `__givrelune.ctx.story.scrubFinale(20)`. Not used by the game.
   */
  scrub(t: number) {
    const { ctx, sparks } = this.story;
    if (this.running) return;
    ctx.setMode('cinematic');
    ctx.ui.setHudVisible(false);
    ctx.ui.letterbox(true);
    ctx.player.faceToward(V(0, 0, 0));
    const { shots, lines } = this.script(ctx.camera.position.clone(), ctx.cameraRig.lookTarget);
    let fov = ctx.cameraRig.baseFov;
    let pose: ShotKey = shots[0].keys[0];
    for (const sh of shots) {
      if (t < sh.at) break;
      const e = easeInOut(Math.min(1, (t - sh.at) / sh.duration));
      const f0 = fov;
      if (sh.fov) fov = f0 + (sh.fov - f0) * e;
      pose = evalKeys(sh.keys, e);
    }
    ctx.cameraRig.cut(pose.pos, pose.look);
    ctx.camera.fov = fov;
    ctx.camera.updateProjectionMatrix();
    ctx.camera.updateMatrixWorld();
    if (t >= BLAZE_AT) {
      ctx.events.emit('finale:start');
      ctx.landmarks.setTreeLight(1);
      this.tree.setGlow(2.2);
      ctx.post.setBloomBoost(1.5, 0);
    }
    sparks.clear();
    if (t >= FIREWORKS_AT) {
      this.fireworks.start(30);
      const dt = 1 / 30;
      for (let tt = FIREWORKS_AT; tt < t; tt += dt) {
        this.fireworks.update(dt);
        sparks.update(dt);
      }
    }
    const line = lines.find((l) => t >= l.at && t < l.at + l.dur);
    if (line) void ctx.ui.narrate(line.text, { duration: 600000 });
  }

  async play(opts: { replay?: boolean } = {}): Promise<void> {
    if (this.running) return;
    const { ctx } = this.story;
    this.running = true;
    this.replay = !!opts.replay;
    this.started = false;
    this.finishing = null;
    const tl = (this.tl = new Timeline(ctx));
    const reduced = this.story.reducedMotion();

    ctx.setMode('cinematic');
    ctx.player.setControlEnabled(false);
    ctx.ui.setHudVisible(false);
    ctx.ui.setPrompt(null);
    ctx.ui.letterbox(true);
    ctx.ui.setSkippable(() => void this.skip());
    ctx.player.faceToward(V(0, 0, 0));

    const cam = ctx.camera.position.clone();
    const camLook = ctx.cameraRig.lookTarget;
    const wide = Finale.WIDE;
    const drift = Finale.DRIFT;
    const yaw = this.treeYaw();

    const start = () => {
      if (this.started) return;
      this.started = true;
      ctx.events.emit('finale:start');
      ctx.landmarks.setTreeLight(1);
      this.tree.setGlow(2.2);
      ctx.audio.music.swell(true);
      ctx.post.setBloomBoost(1.5, 2.5);
    };
    const celebrate = () => {
      try {
        ctx.npcs.celebrate();
        ctx.player.rig.play('cheer');
        ctx.player.rig.emote('love');
      } catch {
        /* ignore */
      }
    };

    if (this.replay) {
      void ctx.cameraRig.playShot({ keys: [{ pos: cam, look: camLook }, { pos: V(cam.x * 0.5 + 0.75, 5, cam.z * 0.5 + 10.5), look: V(0, 9, 0) }, wide], duration: 4.5, ease: 'inOut', fov: 55 });
      tl.cue(0.4, () => {
        start();
        ctx.audio.sfx('magic', { volume: 0.8 });
      });
      tl.cue(1.6, () => this.fireworks.start(24));
      tl.cue(2.2, celebrate);
      tl.cue(4.5, () => void ctx.cameraRig.playShot({ keys: drift, duration: 17, ease: 'inOut', fov: 55 }));
      tl.cue(21.5, () => {
        const end = this.followPose(yaw);
        void ctx.cameraRig.playShot({ keys: [drift[2], { pos: end.pos.clone().lerp(drift[2].pos, 0.5).setY(end.pos.y + 1.5), look: V(0, 6, 0) }, end], duration: 4.6, ease: 'inOut', fov: ctx.cameraRig.baseFov });
      });
      if (!(await tl.at(26.2))) return this.finishing ?? undefined;
      return this.finish();
    }

    const { shots, lines } = this.script(cam, camLook);
    for (const sh of shots) tl.cue(sh.at, () => void ctx.cameraRig.playShot({ keys: sh.keys, duration: sh.duration, ease: 'inOut', fov: sh.fov }));
    for (const l of lines) tl.cue(l.at, () => void ctx.ui.narrate(l.text, { duration: Math.round(l.dur * 1000) }));

    // the stars on the branches answer one by one…
    this.tree.sockets.forEach((p, i) =>
      tl.cue(0.9 + i * 0.24, () => {
        this.tree.pop(i);
        const tint = this.story.plan[i]?.tint ?? '#ffe7a8';
        this.story.sparks.burst(p, 16, new THREE.Color(tint).multiplyScalar(2.6), { speed: 2.2, life: 0.9 });
        ctx.audio.sfx('chime', { volume: 0.4, pitch: 0.85 + i * 0.1, position: p });
      }),
    );
    tl.cue(1, () => this.tree.setGlow(1.6));
    // …and the Grand Sapin blazes
    tl.cue(BLAZE_AT, () => {
      start();
      ctx.audio.sfx('magic', { volume: 1 });
      this.blazeT = 2.8;
      if (!reduced) ctx.cameraRig.shake(0.06, 0.5);
    });
    tl.cue(5.4, () => ctx.audio.sfx('bell', { volume: 0.6 }));
    tl.cue(FIREWORKS_AT, () => this.fireworks.start(30));
    tl.cue(11.8, celebrate);
    tl.cue(26, () => {
      try {
        ctx.player.rig.play('clap');
      } catch {
        /* ignore */
      }
    });
    if (!(await tl.at(FINALE_END))) return this.finishing ?? undefined;
    return this.finish();
  }

  private finish(): Promise<void> {
    const { ctx } = this.story;
    const yaw = this.treeYaw();
    ctx.cameraRig.follow(ctx.player.rig.root, { yaw });
    this.end();
    return Promise.resolve();
  }

  private end() {
    const { ctx } = this.story;
    if (!this.started) {
      this.started = true;
      ctx.events.emit('finale:start');
      ctx.landmarks.setTreeLight(1);
    }
    this.tl?.dispose();
    this.tl = null;
    this.blazeT = 0;
    this.running = false;
    this.tree.setGlow(1.25);
    ctx.audio.music.swell(false);
    ctx.post.setBloomBoost(1, 4);
    ctx.ui.letterbox(false);
    ctx.ui.setSkippable(null);
    ctx.ui.setHudVisible(true);
    ctx.player.setControlEnabled(true);
    try {
      ctx.player.rig.play('idle');
    } catch {
      /* ignore */
    }
    if (ctx.mode === 'cinematic') ctx.setMode('explore');
    ctx.events.emit('finale:end');
    this.onEnd(this.replay);
  }

  skip(): Promise<void> {
    if (!this.running || !this.tl) return Promise.resolve();
    if (this.finishing) return this.finishing;
    const { ctx } = this.story;
    this.tl.abort();
    ctx.ui.setSkippable(null);
    this.finishing = (async () => {
      await ctx.fade(1, 260);
      ctx.cameraRig.stopShot();
      this.fireworks.stop();
      const yaw = this.treeYaw();
      ctx.cameraRig.follow(ctx.player.rig.root, { snap: true, yaw });
      ctx.camera.fov = ctx.cameraRig.baseFov;
      ctx.camera.updateProjectionMatrix();
      this.end();
      await ctx.fade(0, 650);
    })();
    return this.finishing;
  }

  update(dt: number) {
    if (this.blazeT <= 0) return;
    // a spiral of golden sparks climbing the tree
    const { ctx, sparks } = this.story;
    const top = ctx.landmarks?.treeTop?.y ?? 13;
    const baseR = (ctx.layout.plaza.treeRadius ?? 3.2) * 1.05;
    const T = 2.8;
    const prog = 1 - this.blazeT / T;
    this.blazeT -= dt;
    const n = ctx.quality.tier === 'low' ? 4 : 9;
    for (let k = 0; k < n; k++) {
      const p = Math.min(1, prog + (k / n) * 0.05);
      const h = 0.6 + p * (top - 0.6);
      const r = Math.max(0.3, baseR * (1 - h / top)) + 0.35;
      for (const arm of [0, Math.PI]) {
        const a = p * Math.PI * 7 + arm;
        sparks.emit(Math.sin(a) * r, h, Math.cos(a) * r, Math.sin(a) * 0.6, 0.9 + Math.random() * 0.8, Math.cos(a) * 0.6, {
          color: k % 3 === 0 ? this.blazeColor2 : this.blazeColor,
          life: 1 + Math.random() * 0.7,
          size: 0.22,
          sizeEnd: 0.02,
          drag: 1.2,
          gravity: -0.4,
          twinkle: true,
          hot: true,
        });
      }
    }
  }
}
