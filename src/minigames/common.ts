import * as THREE from 'three';
import type { AnchorName, GameContext, SfxName, SpeakerInfo } from '../core/contracts';
import type { CastMember, CastRole, ZoneId } from '../config/types';
import { Fx } from './fx';
import { Overlay } from './overlay';

// ───────────────────────────── types ─────────────────────────────

export interface Outcome {
  won: boolean;
  score: number;
  /** Text of the result card (French, tutoiement). */
  text: string;
}

export type Device = 'keyboard' | 'pointer' | 'touch';

export interface Spot {
  position: THREE.Vector3;
  yaw: number;
  /** True when the landmarks module published the anchor. */
  fromLandmark: boolean;
}

export interface MinigameDef {
  id: string;
  title: string;
  zone: ZoneId;
  /** Cast member who explains the rules (by role) + the title under their name. */
  keeper?: { role: CastRole; title: string };
  /** Spoken by the keeper before the countdown. */
  rules: string;
  /** Controls hint for the HUD, per device. */
  hint(device: Device): string;
  /** Where the "Jouer" interactable sits. */
  spot(ctx: GameContext): Spot;
  /** Player walks during the game (only the snowflake catch). */
  playerControl?: boolean;
  /** Called once at boot (persistent decorations, keepsakes…). */
  boot?(ctx: GameContext): void;
  /** Build the props, place the visitor and the camera (the screen is black). */
  setup(s: Session): void | Promise<void>;
  /** The game itself. */
  play(s: Session): Promise<Outcome>;
  /** Where the visitor stands after the game (default: where they are). */
  exit?(s: Session): { position: THREE.Vector3; yaw: number } | null;
}

/** Test hook: `window.__givreluneMg = { autoplay: true, outcome: 'win' | 'lose', speed: 1 }`. */
export interface AutoplayOpts {
  autoplay?: boolean;
  outcome?: 'win' | 'lose';
  /** Game-time multiplier (headless runs). */
  speed?: number;
  log?: string[];
  last?: { id: string; won: boolean; score: number };
}

export function autoplayOpts(): AutoplayOpts | null {
  const o = (window as unknown as { __givreluneMg?: AutoplayOpts }).__givreluneMg;
  return o && o.autoplay ? o : null;
}

export function mgLog(msg: string) {
  const o = (window as unknown as { __givreluneMg?: AutoplayOpts }).__givreluneMg;
  if (o) (o.log ??= []).push(msg);
}

// ───────────────────────────── maths ─────────────────────────────

export const clamp = THREE.MathUtils.clamp;
export const lerp = THREE.MathUtils.lerp;
export const smooth = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const pick = <T>(arr: readonly T[]): T => arr[(Math.random() * arr.length) | 0];
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
/** Major pentatonic ratios: combos climb a pretty scale. */
export const PENTA = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2, 3, 10 / 3, 4];

export const UP = new THREE.Vector3(0, 1, 0);

// ───────────────────────────── places ─────────────────────────────

/** Zone centre + unit vectors: `out` points away from the plaza, `right` = out rotated -90° (visitor's right when facing out). */
export function zoneFrame(ctx: GameContext, zone: ZoneId) {
  const z = ctx.layout.zones[zone];
  const center = new THREE.Vector3(z.center.x, 0, z.center.z);
  const out = new THREE.Vector3(z.center.x, 0, z.center.z);
  if (out.lengthSq() < 1e-6) out.set(0, 0, -1);
  out.normalize();
  // facing `out`, the right hand is out × up
  const right = new THREE.Vector3().crossVectors(out, UP).normalize();
  return { center, out, right, radius: z.radius };
}

/** Landmark anchor, or a fallback computed by the caller. */
export function anchor(ctx: GameContext, name: AnchorName, fallback: () => { position: THREE.Vector3; yaw: number }): Spot {
  const a = ctx.landmarks?.anchors?.get(name);
  if (a && Number.isFinite(a.position.x) && Number.isFinite(a.position.z)) {
    return { position: a.position.clone(), yaw: a.yaw ?? 0, fromLandmark: true };
  }
  const f = fallback();
  return { position: f.position.clone(), yaw: f.yaw, fromLandmark: false };
}

export const yawTo = (from: THREE.Vector3, to: THREE.Vector3) => Math.atan2(to.x - from.x, to.z - from.z);

// ───────────────────────────── scene probing ─────────────────────────────

const ray = new THREE.Raycaster();

/** Meshes near (x, z) that could be a counter/table (not sprites, particles, glows or characters). */
function nearbyMeshes(ctx: GameContext, x: number, z: number, radius: number, exclude: THREE.Object3D[]): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const sphere = new THREE.Sphere();
  const excluded = new Set<THREE.Object3D>();
  for (const e of exclude) e.traverse((o) => excluded.add(o));
  ctx.scene.updateMatrixWorld();
  ctx.scene.traverseVisible((o) => {
    if (excluded.has(o)) return;
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    if (mats.some((mm) => !mm || (mm.transparent && (mm.blending === THREE.AdditiveBlending || mm.opacity < 0.6)) || mm.depthWrite === false)) return;
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    const bs = m.geometry.boundingSphere;
    if (!bs) return;
    sphere.copy(bs).applyMatrix4(m.matrixWorld);
    if ((m as THREE.InstancedMesh).isInstancedMesh) {
      out.push(m);
      return;
    }
    if (Math.hypot(sphere.center.x - x, sphere.center.z - z) <= sphere.radius + radius) out.push(m);
  });
  return out;
}

/** Solid meshes around a point (for camera occlusion tests). Instanced meshes are skipped (too costly per frame). */
export function solidMeshesNear(ctx: GameContext, center: THREE.Vector3, radius: number, exclude: THREE.Object3D[] = []): THREE.Object3D[] {
  return nearbyMeshes(ctx, center.x, center.z, radius, exclude).filter((o) => !(o as THREE.InstancedMesh).isInstancedMesh);
}

/** Height of the first surface under (x, fromY, z), or 0 if only the ground (or nothing) is there. */
export function surfaceHeight(ctx: GameContext, x: number, z: number, fromY = 1.6, exclude: THREE.Object3D[] = []): number {
  try {
    const list = nearbyMeshes(ctx, x, z, 0.5, [ctx.player.rig.root, ...exclude]);
    ray.set(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0));
    ray.far = fromY + 1;
    ray.camera = ctx.camera;
    const hits = ray.intersectObjects(list, false);
    return hits.length ? Math.max(0, hits[0].point.y) : 0;
  } catch {
    return 0;
  }
}

/** Finds a table/counter top at `p` (null if nothing above 0.4 m). Probes its extents along the given axes. */
export function probeCounter(
  ctx: GameContext,
  p: THREE.Vector3,
  axisX: THREE.Vector3,
  axisZ: THREE.Vector3,
  exclude: THREE.Object3D[] = [],
): { top: number; x0: number; x1: number; z0: number; z1: number } | null {
  const top = surfaceHeight(ctx, p.x, p.z, 1.6, exclude);
  if (top < 0.4 || top > 1.5) return null;
  const probe = (axis: THREE.Vector3, sign: number) => {
    let d = 0;
    for (let s = 0.05; s <= 1.6; s += 0.05) {
      const h = surfaceHeight(ctx, p.x + axis.x * s * sign, p.z + axis.z * s * sign, top + 0.25, exclude);
      if (Math.abs(h - top) > 0.05) break;
      d = s;
    }
    return d;
  };
  return { top, x0: -probe(axisX, -1), x1: probe(axisX, 1), z0: -probe(axisZ, -1), z1: probe(axisZ, 1) };
}

// ───────────────────────────── cast ─────────────────────────────

export function findCast(ctx: GameContext, role: CastRole): CastMember | undefined {
  return ctx.config.cast?.find((c) => c.role === role);
}

// ───────────────────────────── cleanup scope ─────────────────────────────

export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    // textures are never disposed here (many are cached): register them with `Session.track`
    for (const mm of mats) if (mm.userData.owned) mm.dispose();
  });
}

/** Marks a material as owned (disposed with its mesh). */
export function own<M extends THREE.Material>(m: M): M {
  m.userData.owned = true;
  return m;
}

export class Scope {
  private fns: (() => void)[] = [];
  disposed = false;

  constructor(private parent: THREE.Object3D) {}

  /** Adds an object (to the scene by default); removed and disposed at the end. */
  add<T extends THREE.Object3D>(obj: T, parent: THREE.Object3D = this.parent): T {
    parent.add(obj);
    this.fns.push(() => {
      obj.removeFromParent();
      disposeTree(obj);
    });
    return obj;
  }

  onDispose(fn: () => void) {
    if (this.disposed) {
      fn();
      return;
    }
    this.fns.push(fn);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (let i = this.fns.length - 1; i >= 0; i--) {
      try {
        this.fns[i]();
      } catch (err) {
        console.error('[givrelune] minigame cleanup failed', err);
      }
    }
    this.fns = [];
  }
}

// ───────────────────────────── camera ─────────────────────────────

/** Smooth scripted camera (writes the camera through `cameraRig.cut` every frame). */
export class CamDirector {
  readonly pos = new THREE.Vector3();
  readonly look = new THREE.Vector3();
  private tPos = new THREE.Vector3();
  private tLook = new THREE.Vector3();
  private fov: number;
  private tFov: number;
  /** Catch-up rate (1/s). */
  k = 3.2;

  constructor(private ctx: GameContext) {
    this.pos.copy(ctx.camera.position);
    this.look.copy(ctx.cameraRig.lookTarget);
    this.tPos.copy(this.pos);
    this.tLook.copy(this.look);
    this.fov = this.tFov = ctx.camera.fov;
  }

  to(pos: THREE.Vector3, look: THREE.Vector3, fov?: number) {
    this.tPos.copy(pos);
    this.tLook.copy(look);
    if (fov) this.tFov = fov;
  }

  snap() {
    this.pos.copy(this.tPos);
    this.look.copy(this.tLook);
    this.fov = this.tFov;
    this.apply();
  }

  update(dt: number) {
    const a = 1 - Math.exp(-this.k * dt);
    this.pos.lerp(this.tPos, a);
    this.look.lerp(this.tLook, Math.min(1, a * 1.3));
    this.fov = lerp(this.fov, this.tFov, a);
    this.apply();
  }

  private apply() {
    const cam = this.ctx.camera;
    // portrait phones: widen the vertical FOV so the horizontal framing stays readable
    let fov = this.fov;
    const MIN_ASPECT = 1.25;
    if (cam.aspect > 0 && cam.aspect < MIN_ASPECT) {
      const half = Math.atan((Math.tan(THREE.MathUtils.degToRad(fov) / 2) * MIN_ASPECT) / cam.aspect);
      fov = Math.min(80, THREE.MathUtils.radToDeg(half * 2));
    }
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    this.ctx.cameraRig.cut(this.pos, this.look);
    // keep the rig's yaw in sync so stick/WASD movement matches the view
    const dx = this.look.x - this.pos.x;
    const dz = this.look.z - this.pos.z;
    if (dx * dx + dz * dz > 1e-4) this.ctx.cameraRig.yaw = Math.atan2(dx, dz);
  }
}

// ───────────────────────────── session ─────────────────────────────

type HudState = { title: string; score?: string; time?: number; hint?: string; joystick?: boolean };

/** Everything a running mini-game needs; disposed in one call. */
export class Session {
  readonly scope: Scope;
  readonly fx: Fx;
  readonly cam: CamDirector;
  readonly ui: Overlay;
  readonly auto: AutoplayOpts | null;
  readonly keeper: { cast?: CastMember; speaker: SpeakerInfo; npc?: ReturnType<GameContext['npcs']['get']> };
  /** True between the end of the countdown and the end of play. */
  playing = false;
  /** Seconds of play. */
  time = 0;
  private hudState: HudState;
  private hudKey = '';
  private hudFallback: boolean | null = null;
  private hudChecking = false;
  private prevKeys = new Set<string>();
  readonly justDown = new Set<string>();
  /**
   * Finger / mouse button held on the 3D view, tracked at the window level so it also works on the
   * left half of phones (where the UI's joystick swallows the canvas events). `released` = this frame.
   */
  readonly hold = { down: false, x: 0, y: 0, id: -1, type: 'mouse', released: false };
  private releaseQueued = false;
  private abortResolve: ((v: 'abort') => void) | null = null;
  readonly aborted: Promise<'abort'>;
  /** Quitting is possible from the rules card until the end of play (not during setup or the result card). */
  private abortable = false;
  private abortRequested = false;
  /** True once the visitor quit. */
  quit = false;
  private lastDevice: Device;

  constructor(
    readonly ctx: GameContext,
    readonly def: MinigameDef,
    fx: Fx,
  ) {
    this.auto = autoplayOpts();
    this.scope = new Scope(ctx.scene);
    this.fx = fx;
    fx.attach(ctx.scene);
    this.scope.onDispose(() => fx.detach());
    this.cam = new CamDirector(ctx);
    this.ui = new Overlay(ctx.camera, ctx.renderer.domElement);
    this.scope.onDispose(() => this.ui.dispose());
    this.hudState = { title: def.title };
    this.lastDevice = ctx.input.lastDevice;
    this.aborted = new Promise((r) => (this.abortResolve = r));
    // "Quitter" (UI button, touch) or Échap
    const offAbort = ctx.events.on('minigame:abort', () => this.abort());
    this.scope.onDispose(offAbort);

    const cast = def.keeper ? findCast(ctx, def.keeper.role) : undefined;
    let npc: ReturnType<GameContext['npcs']['get']>;
    try {
      npc = cast ? ctx.npcs?.get(`cast:${cast.id}`) : undefined;
    } catch {
      npc = undefined;
    }
    this.keeper = {
      cast,
      npc,
      speaker: cast
        ? { id: `cast:${cast.id}`, name: cast.name, title: def.keeper?.title, voicePitch: cast.voicePitch, anchor: npc?.rig.root }
        : { id: `minigame:${def.id}`, name: def.title, title: def.keeper?.title },
    };

    // window-level pointer tracking (capture phase: runs even when the joystick stops propagation)
    const canvas = ctx.renderer.domElement;
    const setXY = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      this.hold.x = ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
      this.hold.y = -((e.clientY - r.top) / Math.max(1, r.height)) * 2 + 1;
    };
    const onDown = (e: PointerEvent) => {
      if (e.target !== canvas || this.hold.down) return;
      this.hold.down = true;
      this.hold.id = e.pointerId;
      this.hold.type = e.pointerType;
      setXY(e);
    };
    const onMove = (e: PointerEvent) => {
      if (this.hold.down && e.pointerId === this.hold.id) setXY(e);
    };
    const onUp = (e: PointerEvent) => {
      if (!this.hold.down || e.pointerId !== this.hold.id) return;
      setXY(e);
      this.hold.down = false;
      this.releaseQueued = true;
    };
    const opts = { capture: true } as const;
    window.addEventListener('pointerdown', onDown, opts);
    window.addEventListener('pointermove', onMove, opts);
    window.addEventListener('pointerup', onUp, opts);
    window.addEventListener('pointercancel', onUp, opts);
    window.addEventListener('blur', () => (this.hold.down = false));
    this.scope.onDispose(() => {
      window.removeEventListener('pointerdown', onDown, opts);
      window.removeEventListener('pointermove', onMove, opts);
      window.removeEventListener('pointerup', onUp, opts);
      window.removeEventListener('pointercancel', onUp, opts);
    });

    // per-frame housekeeping: particles, camera, edge-triggered keys, device changes, abort
    this.every((dt, t) => {
      this.hold.released = this.releaseQueued;
      this.releaseQueued = false;
      this.fx.update(dt, t, ctx.camera, ctx.renderer);
      this.cam.update(dt);
      this.justDown.clear();
      for (const code of KEYS) {
        const d = ctx.input.isDown(code);
        if (d && !this.prevKeys.has(code)) this.justDown.add(code);
        if (d) this.prevKeys.add(code);
        else this.prevKeys.delete(code);
      }
      if (this.auto) {
        const a = this.auto as AutoplayOpts & { dbg?: Record<string, unknown> };
        a.dbg = { t: +this.time.toFixed(2), playing: this.playing, frames: ((a.dbg?.frames as number) ?? 0) + 1, mode: ctx.mode };
      }
      if (this.playing) this.time += dt * this.speed;
      // Échap quits during the rules, the countdown and the game (the dialogue box may be open: that's fine)
      if (this.abortable && ctx.input.pressed('cancel')) this.abort();
      const dev = ctx.input.lastDevice as Device;
      if (dev !== this.lastDevice) {
        this.lastDevice = dev;
        this.hud({ hint: def.hint(dev) });
      }
    }, true);
  }

  get device(): Device {
    return this.lastDevice;
  }

  get speed(): number {
    return this.auto?.speed && this.auto.speed > 0 ? this.auto.speed : 1;
  }

  get disposed() {
    return this.scope.disposed;
  }

  /** Quit the game (single press). Requested during setup → applied as soon as the rules card shows. */
  abort() {
    if (this.scope.disposed || this.quit) return;
    if (!this.abortable) {
      this.abortRequested = true;
      return;
    }
    this.quit = true;
    this.abortable = false;
    this.sfx('ui-close', { volume: 0.7 });
    try {
      if (this.ctx.ui.dialogue.isOpen()) this.ctx.ui.dialogue.close();
    } catch {
      /* ignore */
    }
    this.abortResolve?.('abort');
    this.abortResolve = null;
  }

  /** Called by the framework: `on` from the rules card to the end of play. */
  setAbortable(on: boolean) {
    this.abortable = on;
    if (on && this.abortRequested) this.abort();
    if (!on) this.abortRequested = false;
  }

  /** Persistent per-frame update for the whole session. `raw` ignores pause and time scale. */
  every(fn: (dt: number, t: number) => void, raw = false) {
    const off = this.ctx.addSystem((dt, t) => {
      if (this.scope.disposed) return;
      if (!raw && this.ctx.mode !== 'minigame') return;
      try {
        fn(raw ? dt : dt * this.speed, t);
      } catch (err) {
        console.error('[givrelune] minigame update failed', err);
      }
    });
    this.scope.onDispose(off);
  }

  /** Runs `fn` every frame until it returns true. Paused while the game is not in 'minigame' mode. */
  loop(fn: (dt: number, t: number) => boolean | void): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.scope.disposed) return;
      let done = false;
      const off = this.ctx.addSystem((dt, t) => {
        if (done || this.scope.disposed) return;
        if (this.ctx.mode !== 'minigame') return;
        let r: boolean | void;
        try {
          r = fn(dt * this.speed, t);
        } catch (err) {
          done = true;
          off();
          reject(err);
          return;
        }
        if (r === true) {
          done = true;
          off();
          resolve();
        }
      });
      this.scope.onDispose(off);
    });
  }

  /** Game-time wait (scaled, paused with the game). */
  wait(seconds: number): Promise<void> {
    let t = 0;
    return this.loop((dt) => (t += dt) >= seconds);
  }

  /** Real-time frames (used while the screen is black). */
  frames(n = 1): Promise<void> {
    return new Promise((resolve) => {
      let k = 0;
      const off = this.ctx.addSystem(() => {
        if (++k >= n) {
          off();
          resolve();
        }
      });
    });
  }

  /** Edge-triggered action: Space/E/Enter, the UI action button, or a click/tap on the 3D view. */
  pressed(): boolean {
    const inp = this.ctx.input;
    if (this.ctx.ui.isBlocking()) return false;
    return inp.pressed('interact') || inp.pointer.clicked;
  }

  /** Held action (blowing glass): Space/E/Enter, or a pressed mouse button / finger on the 3D view. */
  held(): boolean {
    const inp = this.ctx.input;
    if (this.ctx.ui.isBlocking()) return false;
    return inp.isDown('Space') || inp.isDown('KeyE') || inp.isDown('Enter') || inp.isDown('NumpadEnter') || this.hold.down || inp.pointer.down;
  }

  sfx(name: SfxName, opts?: { volume?: number; pitch?: number; position?: THREE.Vector3 }) {
    try {
      this.ctx.audio?.sfx(name, opts);
    } catch {
      /* ignore */
    }
  }

  /** HUD (the UI module's, or our fallback if it draws nothing). */
  hud(patch: Partial<HudState> | null) {
    if (patch === null) {
      this.hudKey = '';
      try {
        this.ctx.ui.minigameHud(null);
      } catch {
        /* ignore */
      }
      this.ui.hud(null);
      return;
    }
    Object.assign(this.hudState, patch);
    // only games where the visitor walks need the touch joystick (it would steal taps from aiming)
    const st: HudState = { ...this.hudState, joystick: this.def.id === 'flocons' };
    if (st.time !== undefined) st.time = Math.max(0, Math.ceil(st.time));
    const key = JSON.stringify(st);
    if (key === this.hudKey) return;
    this.hudKey = key;
    try {
      this.ctx.ui.minigameHud(st);
    } catch {
      /* ignore */
    }
    if (this.hudFallback) this.ui.hud(st);
    else if (this.hudFallback === null && !this.hudChecking) {
      this.hudChecking = true;
      setTimeout(() => {
        if (this.scope.disposed) return;
        const root = document.getElementById('ui-root');
        this.hudFallback = !(root && root.textContent?.includes(this.def.title));
        if (this.hudFallback) this.ui.hud({ ...this.hudState, time: this.hudState.time !== undefined ? Math.ceil(this.hudState.time) : undefined });
      }, 140);
    }
  }

  /** The keeper explains the rules (dialogue box), auto-advancing. */
  async rules(text: string) {
    if (this.quit || this.disposed) return;
    const d = this.ctx.ui.dialogue;
    try {
      d.open(this.keeper.speaker);
      await Promise.race([
        d.say(text, { emotion: 'happy', autoAdvanceMs: this.auto ? 300 : 5000 }),
        // safety net only (a broken dialogue UI must not block the game)
        new Promise<void>((r) => setTimeout(r, this.auto ? 1500 : 40000)),
      ]);
    } catch {
      /* the dialogue UI may be missing */
    } finally {
      try {
        if (!this.disposed) d.close();
      } catch {
        /* ignore */
      }
    }
  }

  async countdown() {
    for (const n of ['3', '2', '1']) {
      if (this.quit || this.disposed) return;
      this.ui.count(n);
      this.sfx('tick', { volume: 0.8 });
      await this.wait(0.72);
    }
    if (this.quit || this.disposed) return;
    this.ui.count('C’est parti !', true);
    this.sfx('bell', { volume: 0.6, pitch: 1.2 });
  }

  /** Keeper reaction (if the NPC exists). */
  cheer(kind: 'clap' | 'cheer' | 'happy' | 'love' = 'clap') {
    const npc = this.keeper.npc;
    if (!npc) return;
    try {
      if (kind === 'happy' || kind === 'love') npc.rig.emote(kind);
      else npc.rig.play(kind, { loop: false });
    } catch {
      /* ignore */
    }
  }

  /** Small speech bubble above the keeper (if present). */
  bubble(text: string) {
    const npc = this.keeper.npc;
    if (!npc) return;
    try {
      this.ctx.ui.bubble(npc.rig.root, text, { duration: 2200, height: npc.rig.height + 0.3 });
    } catch {
      /* ignore */
    }
  }

  /** Compile the new materials now (the screen is black) to avoid a hitch at the first frame. */
  warmup() {
    try {
      this.ctx.renderer.compile(this.ctx.scene, this.ctx.camera);
    } catch {
      /* ignore */
    }
  }

  /** Disposes `x` (texture, geometry…) at the end of the session. */
  track<T extends { dispose(): void }>(x: T): T {
    this.scope.onDispose(() => x.dispose());
    return x;
  }

  dispose() {
    this.playing = false;
    this.scope.dispose();
  }
}

const KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

// ───────────────────────────── small builders ─────────────────────────────

/** Canvas texture helper (owned by the caller). */
export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Soft round ground decal (shadows, light pools, rings). */
export function softDiscTexture(kind: 'shadow' | 'ring' | 'pool'): THREE.CanvasTexture {
  return canvasTexture(128, 128, (g, w) => {
    const c = w / 2;
    if (kind === 'ring') {
      g.strokeStyle = 'rgba(255,255,255,1)';
      g.shadowColor = 'rgba(255,255,255,1)';
      g.shadowBlur = 8;
      g.lineWidth = 6;
      g.beginPath();
      g.arc(c, c, c - 10, 0, Math.PI * 2);
      g.stroke();
      return;
    }
    const r = g.createRadialGradient(c, c, 0, c, c, c);
    if (kind === 'shadow') {
      r.addColorStop(0, 'rgba(255,255,255,0.9)');
      r.addColorStop(0.55, 'rgba(255,255,255,0.45)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
    } else {
      r.addColorStop(0, 'rgba(255,255,255,0.7)');
      r.addColorStop(0.6, 'rgba(255,255,255,0.18)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
    }
    g.fillStyle = r;
    g.fillRect(0, 0, w, w);
  });
}

/** Flat decal lying on the ground (y up). */
export function groundDecal(tex: THREE.Texture, color: string, size: number, opts: { additive?: boolean; opacity?: number } = {}): THREE.Mesh {
  const m = own(
    new THREE.MeshBasicMaterial({
      map: tex,
      color,
      transparent: true,
      opacity: opts.opacity ?? 1,
      depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 5;
  return mesh;
}
