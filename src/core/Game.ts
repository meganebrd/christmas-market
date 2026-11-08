import * as THREE from 'three';
import type {
  AudioApi,
  GameContext,
  GameEvents,
  GameMode,
  LandmarksApi,
  MarketApi,
  MinigameApi,
  NpcApi,
  PlayerApi,
  PostApi,
  StoryApi,
  System,
  UIApi,
} from './contracts';
import type { ResolvedMarket, ZoneId } from '../config/types';
import { EventBus } from './events';
import { Input } from './Input';
import { Colliders } from './Colliders';
import { Interactables } from './Interactables';
import { LightDirector } from './LightDirector';
import { CameraRig } from './CameraRig';
import { SaveStore } from './save';
import { detectQuality, lowerTier, type QualityProfile, type QualityTier } from './quality';
import { Conversations, type ConversationScript } from './Conversations';
import { RenderPipeline } from './RenderPipeline';
import { createLayout, type Layout } from '../world/layout';
import { fallbackAudio, fallbackLandmarks, fallbackMarket, fallbackMinigames, fallbackNpcs, fallbackStory } from './fallbacks';

import { createUI } from '../ui';
import { h } from '../ui/dom';
import { snowflakeSvg } from '../ui/Loading';
import { createAudio } from '../audio';
import { buildEnvironment } from '../world/environment';
import { buildLandmarks } from '../world/landmarks';
import { buildStalls } from '../world/stalls';
import { createPlayer, createNpcs } from '../characters';
import { registerVendorConversations } from '../dialogue';
import { createStory } from '../story';
import { createMinigames } from '../minigames';

/**
 * The conductor. Owns the renderer, the loop, the modes, and boots every module in order.
 * Each module is isolated in a try/catch: if one fails, the market still opens.
 */
export class Game implements GameContext {
  readonly config: ResolvedMarket;
  readonly layout: Layout;
  readonly quality: QualityProfile;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 900);
  readonly renderer: THREE.WebGLRenderer;
  readonly pipeline: RenderPipeline;
  readonly events = new EventBus<GameEvents>();
  readonly input: Input;
  readonly colliders = new Colliders();
  readonly interactables = new Interactables();
  readonly lights = new LightDirector();
  readonly cameraRig: CameraRig;
  readonly save: SaveStore;
  readonly conversations = new Conversations();
  readonly clock = { elapsed: 0 };
  readonly flags: URLSearchParams;
  readonly post: PostApi;

  ui!: UIApi;
  audio!: AudioApi;
  landmarks!: LandmarksApi;
  market!: MarketApi;
  player!: PlayerApi;
  npcs!: NpcApi;
  story!: StoryApi;
  minigames!: MinigameApi;

  ready = false;
  private _mode: GameMode = 'loading';
  private systems = new Set<(dt: number, t: number) => void>();
  private fadeEl: HTMLDivElement;
  private lastTime = performance.now();
  private zone: ZoneId | 'alley' | null = null;
  private zoneTimer = 0;
  private bannerShown = new Map<string, number>();
  private titleOrbit = 0;
  private fpsEl: HTMLDivElement | null = null;
  private fpsAcc = { frames: 0, time: 0 };
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private pendingInteract: { id: string } | null = null;
  /** The tier was picked by detection (not by the visitor or a URL flag): it may be lowered after a GPU crash. */
  private autoQuality: boolean;
  private gpuNotice: { root: HTMLElement; reload: HTMLButtonElement } | null = null;
  private gpuTimer = 0;
  /** Shaders are recompiling after a context restore: the simulation waits under the notice. */
  private gpuWarming = false;
  private lostWhileVisible = false;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly uiRoot: HTMLElement,
    config: ResolvedMarket,
  ) {
    this.flags = new URLSearchParams(location.search);
    this.config = config;
    this.layout = createLayout(config);
    this.save = new SaveStore({ persist: !this.flags.has('fresh') });
    if (this.flags.has('fresh')) this.save.reset();
    const chosen = this.flags.get('quality') ?? (this.save.data.settings.quality !== 'auto' ? this.save.data.settings.quality : null);
    this.autoQuality = !chosen;
    this.quality = detectQuality(chosen, this.save.flag<string>('gpuCeiling') as QualityTier | undefined);
    // ?fixedres: no adaptive resolution (screenshots under software rendering)
    this.pipeline = new RenderPipeline(canvas, this.scene, this.camera, this.quality, { adaptive: !this.flags.has('fixedres') });
    this.renderer = this.pipeline.renderer;
    this.renderer.info.autoReset = false;
    this.pipeline.onContextLost = () => this.onGpuLost();
    this.pipeline.onContextRestored = () => this.onGpuRestored();
    this.input = new Input(canvas);
    this.cameraRig = new CameraRig(this.camera);
    this.colliders.boundaryRadius = this.layout.walkRadius;

    this.fadeEl = document.createElement('div');
    Object.assign(this.fadeEl.style, {
      position: 'fixed', inset: '0', background: '#070a18', opacity: '1', pointerEvents: 'none',
      transition: 'opacity 600ms ease', zIndex: '50',
    } as CSSStyleDeclaration);
    document.body.appendChild(this.fadeEl);

    if (this.flags.has('debug')) {
      this.fpsEl = document.createElement('div');
      Object.assign(this.fpsEl.style, {
        position: 'fixed', left: '8px', bottom: '8px', font: '12px monospace', color: '#cfe', zIndex: '99',
        background: 'rgba(0,0,0,.4)', padding: '2px 6px', borderRadius: '4px', pointerEvents: 'none',
      } as CSSStyleDeclaration);
      document.body.appendChild(this.fpsEl);
    }

    window.addEventListener('resize', () => this.pipeline.resize());
    document.addEventListener('visibilitychange', () => (this.lastTime = performance.now()));
    this.conversations.runner = (id, script) => this.runConversation(id, script);
    this.post = this.createPost();
  }

  private createPost(): PostApi {
    const pl = this.pipeline;
    const baseBloom = pl.bloom?.strength ?? 0;
    const baseExposure = this.renderer.toneMappingExposure;
    const anim = (get: () => number, set: (v: number) => void, to: number, seconds: number) => {
      const from = get();
      let t = 0;
      if (seconds <= 0) return set(to);
      const off = this.addSystem((dt) => {
        t = Math.min(1, t + dt / seconds);
        const e = t * t * (3 - 2 * t);
        set(from + (to - from) * e);
        if (t >= 1) off();
      });
    };
    let bloomK = 1;
    let expoK = 1;
    return {
      setWarmth: (v, s = 1.5) => anim(() => pl.gradeUniforms.uWarmth.value, (x) => (pl.gradeUniforms.uWarmth.value = x), v, s),
      setBloomBoost: (k, s = 1.5) => anim(() => bloomK, (x) => { bloomK = x; if (pl.bloom) pl.bloom.strength = baseBloom * x; }, k, s),
      setExposure: (k, s = 1.5) => anim(() => expoK, (x) => { expoK = x; this.renderer.toneMappingExposure = baseExposure * x; }, k, s),
    };
  }

  get mode() {
    return this._mode;
  }

  setMode(mode: GameMode) {
    if (mode === this._mode) return;
    const from = this._mode;
    this._mode = mode;
    if (mode !== 'explore') {
      this.interactables.clearFocus();
      this.ui?.setPrompt(null);
    }
    this.events.emit('mode:change', { from, to: mode });
  }

  addSystem(system: System | ((dt: number, elapsed: number) => void)): () => void {
    const fn = typeof system === 'function' ? system : (dt: number, t: number) => system.update(dt, t);
    this.systems.add(fn);
    return () => this.systems.delete(fn);
  }

  fade(to: 0 | 1, ms = 600): Promise<void> {
    this.fadeEl.style.transition = `opacity ${ms}ms ease`;
    // force reflow so the transition always runs
    void this.fadeEl.offsetWidth;
    this.fadeEl.style.opacity = String(to);
    return new Promise((r) => setTimeout(r, ms + 20));
  }

  pickGround(ndcX: number, ndcY: number): THREE.Vector3 | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, p) ? p : null;
  }

  async travelTo(target: ZoneId | `stall:${string}`): Promise<void> {
    let pos: THREE.Vector3;
    let yaw: number;
    if (target.startsWith('stall:')) {
      const id = target.slice(6);
      const slot = this.layout.stalls.find((s) => s.stallId === id);
      if (!slot) return;
      pos = new THREE.Vector3(slot.customerPoint.x + slot.front.x * 0.6, 0, slot.customerPoint.z + slot.front.z * 0.6);
      yaw = Math.atan2(-slot.front.x, -slot.front.z);
      // arriving in front of a chalet: its sign and the "Parler à …" prompt matter more than the alley banner
      this.bannerShown.set('alley', this.clock.elapsed);
    } else {
      const z = this.layout.zones[target as ZoneId];
      if (!z) return;
      pos = new THREE.Vector3(z.arrival.x, 0, z.arrival.z);
      yaw = z.arrivalYaw;
    }
    this.events.emit('travel:start', { to: target });
    this.audio?.sfx('whoosh');
    await this.fade(1, 450);
    this.player.teleport(pos, yaw);
    this.cameraRig.follow(this.player.rig.root, { snap: true, yaw });
    this.setMode('explore');
    await new Promise((r) => setTimeout(r, 120));
    await this.fade(0, 550);
    this.events.emit('travel:end', { to: target });
  }

  // ───────────────────────────── boot ─────────────────────────────

  private async step<T>(label: string, progress: number, fn: () => T | Promise<T>, fallback: () => T): Promise<T> {
    this.ui?.showLoading(progress, label);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    try {
      return await fn();
    } catch (err) {
      console.error(`[givrelune] ${label} failed — using a fallback`, err);
      return fallback();
    }
  }

  async boot() {
    this.scene.background = new THREE.Color('#141b33');
    this.ui = await this.step('Interface', 0, () => createUI(this), () => {
      throw new Error('UI is required');
    });
    this.fade(0, 400);
    this.audio = await this.step('Musique', 0.05, () => createAudio(this), fallbackAudio);
    await this.step('Neige et ciel', 0.15, () => buildEnvironment(this), () => undefined);
    this.landmarks = await this.step('Grand Sapin', 0.35, () => buildLandmarks(this), () => fallbackLandmarks());
    this.market = await this.step('Cabanes', 0.5, () => buildStalls(this), () => fallbackMarket());
    this.player = await this.step('Visiteur', 0.65, () => createPlayer(this), () => {
      throw new Error('player is required');
    });
    this.npcs = await this.step('Habitants', 0.72, () => createNpcs(this), fallbackNpcs);
    await this.step('Conversations', 0.8, () => registerVendorConversations(this), () => undefined);
    this.minigames = await this.step('Jeux', 0.85, () => createMinigames(this), fallbackMinigames);
    this.story = await this.step('Histoire', 0.9, () => createStory(this), () => fallbackStory(this));

    // place the visitor
    const spawn = this.layout.spawn;
    const at = this.flags.get('at');
    this.player.teleport(new THREE.Vector3(spawn.position.x, 0, spawn.position.z), spawn.yaw);
    this.cameraRig.follow(this.player.rig.root, { snap: true, yaw: spawn.yaw });

    // warm up shaders to avoid hitches
    await this.step('Illuminations', 0.95, () => {
      this.pipeline.resize();
      this.renderer.compile(this.scene, this.camera);
    }, () => undefined);

    this.ui.showLoading(1, 'Bienvenue');
    this.ready = true;
    this.startLoop();
    this.exposeDebug();
    this.ui.hideLoading();

    const skip = this.flags.has('skipIntro') || this.flags.has('autostart') || !this.config.story.enabled;
    if (skip) {
      this.story.skipIntro();
      this.setMode('explore');
      if (at) await this.travelTo(at as ZoneId);
      if (this.flags.has('mute')) this.audio.setMuted(true);
      return;
    }
    this.setMode('title');
    this.ui.showTitle({
      title: this.config.meta.title,
      town: this.config.meta.town,
      tagline: this.config.meta.tagline,
      onStart: async () => {
        try {
          await this.audio.unlock();
        } catch (e) {
          console.warn(e);
        }
        this.events.emit('title:start');
        this.ui.hideTitle();
        if (this.save.data.introSeen && !this.flags.has('intro')) {
          this.story.skipIntro();
          await this.fade(1, 300);
          this.player.teleport(new THREE.Vector3(spawn.position.x, 0, spawn.position.z), spawn.yaw);
          this.cameraRig.follow(this.player.rig.root, { snap: true, yaw: spawn.yaw });
          this.setMode('explore');
          await this.fade(0, 900);
        } else {
          await this.story.playIntro();
          this.save.update((d) => (d.introSeen = true));
          if (this.mode === 'cinematic' || this.mode === 'title') this.setMode('explore');
        }
        this.events.emit('intro:done');
      },
    });
  }

  // ───────────────────────────── conversations ─────────────────────────────

  private async runConversation(id: string, script: ConversationScript) {
    const prev = this._mode;
    this.setMode('dialogue');
    this.player.setControlEnabled(false);
    const npc = this.npcs.get(id);
    if (npc) {
      npc.hold(this.player.position);
      this.player.faceToward(npc.position);
      const head = npc.position.clone();
      head.y += npc.rig.height * 0.85;
      const me = this.player.position.clone();
      me.y += this.player.rig.height * 0.85;
      this.cameraRig.focus(head, me);
    }
    this.audio.music.duck(true);
    this.events.emit('conversation:start', { id });
    try {
      await script(this);
    } finally {
      this.ui.dialogue.close();
      npc?.release();
      this.cameraRig.release();
      this.audio.music.duck(false);
      this.player.setControlEnabled(true);
      // a script may have opened a panel (e.g. "Voir mes créations") or started a mini-game: keep it
      if (this._mode === 'dialogue') this.setMode(prev === 'dialogue' || prev === 'panel' ? 'explore' : prev);
      this.events.emit('conversation:end', { id });
    }
  }

  // ───────────────────────────── loop ─────────────────────────────

  private startLoop() {
    const frame = () => {
      requestAnimationFrame(frame);
      const now = performance.now();
      const frameMs = now - this.lastTime;
      const dt = Math.min(0.05, frameMs / 1000);
      this.lastTime = now;
      // hidden tab, or the GPU is away: the market waits (nobody walks blind)
      if (document.hidden || this.pipeline.contextLost || this.gpuWarming) return;
      this.clock.elapsed += dt;
      this.tick(dt);
      this.pipeline.adapt(frameMs, performance.now() - now);
    };
    requestAnimationFrame(frame);
  }

  // ───────────────────────────── GPU crash recovery ─────────────────────────────

  /**
   * The browser dropped the WebGL context (GPU overloaded or reset). Instead of a black screen, a
   * notice covers the canvas until the context comes back; three.js then rebuilds its GL state.
   */
  private onGpuLost() {
    this.lostWhileVisible = !document.hidden;
    this.showGpuNotice(true);
    this.events.emit('render:lost');
    clearTimeout(this.gpuTimer);
    // some browsers never give it back (or block WebGL after repeated crashes): offer a reload
    this.gpuTimer = window.setTimeout(() => {
      if (this.pipeline.contextLost && this.gpuNotice) this.gpuNotice.reload.hidden = false;
    }, 8000);
  }

  private onGpuRestored() {
    clearTimeout(this.gpuTimer);
    // a crash while playing means this tier is too heavy for this device: next visit starts lighter
    if (this.autoQuality && this.lostWhileVisible && this.quality.tier !== 'low') this.save.flag('gpuCeiling', lowerTier(this.quality.tier));
    this.events.emit('render:restored');
    // every shader must be compiled again: do it under the notice, without freezing the page
    this.gpuWarming = true;
    const done = () => {
      if (!this.gpuWarming) return;
      this.gpuWarming = false;
      this.lastTime = performance.now();
      requestAnimationFrame(() => requestAnimationFrame(() => this.showGpuNotice(false)));
    };
    const fallback = window.setTimeout(done, 6000);
    this.renderer
      .compileAsync(this.scene, this.camera)
      .catch((err) => console.warn('[givrelune] shader warm-up after restore failed', err))
      .finally(() => {
        clearTimeout(fallback);
        done();
      });
  }

  private showGpuNotice(on: boolean) {
    if (!this.gpuNotice) {
      const reload = h('button', { class: 'gl-btn gl-btn--berry', type: 'button', hidden: true, onclick: () => location.reload() }, h('span', { text: 'Recharger le marché' }));
      const root = h(
        'div',
        { class: 'gl-gpu', role: 'status', 'aria-live': 'polite' },
        h(
          'div',
          { class: 'gl-gpu__box' },
          snowflakeSvg('gl-gpu__flake'),
          h('p', { class: 'gl-gpu__title', text: 'Les illuminations se rallument…' }),
          h('p', { class: 'gl-gpu__text', text: 'La carte graphique a pris un coup de froid. On allège un peu les lumières pour que la promenade reste fluide.' }),
          reload,
        ),
      );
      document.body.appendChild(root);
      this.gpuNotice = { root, reload };
    }
    this.gpuNotice.root.classList.toggle('is-on', on);
    if (!on) this.gpuNotice.reload.hidden = true;
  }

  private tick(dt: number) {
    const t = this.clock.elapsed;
    this.renderer.info.reset();
    const input = this.input;
    input.enabled = !(document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName));
    input.poll();

    this.cameraRig.assist = null;
    if (this._mode === 'explore' && !this.ui.isBlocking()) {
      this.exploreInput();
      this.cameraAssist(dt);
    } else if (this._mode === 'map' && (input.pressed('map') || input.pressed('cancel'))) this.ui.closeMap();
    else if (this._mode === 'panel' && input.pressed('cancel')) this.ui.closePanels();
    else if (this._mode === 'title') this.titleCamera(dt);

    for (const fn of this.systems) {
      try {
        fn(dt, t);
      } catch (err) {
        console.error('[givrelune] system failed (removed)', err);
        this.systems.delete(fn);
      }
    }
    this.lights.update(dt);
    this.cameraRig.update(dt);
    this.updateZone(dt);
    try {
      const fwd = new THREE.Vector3();
      this.camera.getWorldDirection(fwd);
      this.audio.setListener(this.camera.position, fwd);
    } catch {
      /* ignore */
    }
    this.pipeline.render(t);
    input.endFrame();

    if (this.fpsEl) {
      this.fpsAcc.frames++;
      this.fpsAcc.time += dt;
      if (this.fpsAcc.time > 0.5) {
        const info = this.renderer.info;
        const pl = this.pipeline;
        this.fpsEl.textContent = `${Math.round(this.fpsAcc.frames / this.fpsAcc.time)} fps · ${info.render.calls} draws · ${Math.round(info.render.triangles / 1000)}k tris · ${this.quality.tier} · ×${pl.pixelRatio}${pl.msaaSamples ? ` msaa${pl.msaaSamples}` : ''} · L${pl.renderLevel}`;
        this.fpsAcc = { frames: 0, time: 0 };
      }
    }
  }

  private lastPlayerPos = new THREE.Vector3();

  /** Buildings should face the camera: gently orient the view toward the zone or chalet being approached. */
  private cameraAssist(dt: number) {
    const pos = this.player.position;
    const speed = pos.distanceTo(this.lastPlayerPos) / Math.max(dt, 1e-3);
    this.lastPlayerPos.copy(pos);
    if (speed < 0.6 || this.flags.has('noassist')) {
      this.cameraRig.assist = null;
      return;
    }
    let best: { yaw: number; strength: number } | null = null;
    let bestD = 5;
    for (const s of this.layout.stalls) {
      const d = Math.hypot(pos.x - s.customerPoint.x, pos.z - s.customerPoint.z);
      if (d < bestD) {
        bestD = d;
        best = { yaw: Math.atan2(-s.front.x, -s.front.z), strength: 1.2 };
      }
    }
    if (!best) {
      const z = this.layout.zoneAt(pos.x, pos.z);
      if (z && z !== 'alley' && z !== 'plaza' && z !== 'gate') best = { yaw: this.layout.zones[z].arrivalYaw, strength: 1 };
      else best = { yaw: Math.PI, strength: z === 'alley' ? 0.25 : 0.5 };
    }
    this.cameraRig.assist = best;
  }

  private exploreInput() {
    const input = this.input;
    const p = input.pointer;
    if (p.dragDX || p.zoom) this.cameraRig.orbit(p.dragDX, p.zoom);
    if (input.pressed('camLeft')) this.cameraRig.orbit(-60, 0);
    if (input.pressed('camRight')) this.cameraRig.orbit(60, 0);

    const focused = this.interactables.updateFocus(this.player.position, this.player.yaw);
    if (focused) {
      const pos = focused.position.clone();
      pos.y += focused.promptHeight ?? 2;
      this.ui.setPrompt({ label: focused.label, worldPos: pos });
    } else this.ui.setPrompt(null);

    if (input.pressed('map')) {
      this.setMode('map');
      this.ui.openMap();
      return;
    }
    if (input.pressed('interact') && focused) {
      this.pendingInteract = null;
      focused.onInteract();
      return;
    }
    if (p.clicked) {
      const it = this.interactables.pick(p.x, p.y, this.camera);
      if (it) {
        const reach = Math.max(it.radius ?? 2.2, 1.9);
        if (it.position.distanceTo(this.player.position) <= reach) {
          this.pendingInteract = null;
          this.player.faceToward(it.position);
          it.onInteract();
        } else {
          // walk there, then interact on arrival (unless the visitor took the controls back)
          const id = it.id;
          const target = this.interactables.approachPoint(it, this.player.position);
          this.pendingInteract = { id };
          this.player.walkTo(target, { stopDistance: 0.3 }).then(() => {
            if (this.pendingInteract?.id !== id || this._mode !== 'explore' || this.ui.isBlocking()) return;
            this.pendingInteract = null;
            const cur = this.interactables.get(id);
            if (!cur || (cur.enabled && !cur.enabled())) return;
            const near = this.player.position.distanceTo(target) < 1.2 || cur.position.distanceTo(this.player.position) <= Math.max(cur.radius ?? 2.2, 2.4);
            if (near) {
              this.player.faceToward(cur.position);
              cur.onInteract();
            }
          });
        }
        return;
      }
      const g = this.pickGround(p.x, p.y);
      if (g) {
        this.pendingInteract = null;
        this.player.walkTo(g, { stopDistance: 0.2 });
      }
    }
  }

  private titleCamera(dt: number) {
    if (this.cameraRig.mode === 'shot') return;
    this.titleOrbit += dt * 0.025;
    const a = this.titleOrbit + 0.4;
    const pos = new THREE.Vector3(Math.sin(a) * 58, 24 + Math.sin(this.titleOrbit * 2) * 2, Math.cos(a) * 58);
    this.cameraRig.cut(pos, new THREE.Vector3(0, 6, 0));
  }

  private updateZone(dt: number) {
    if (!this.player || this._mode === 'title' || this._mode === 'cinematic' || this._mode === 'loading') return;
    this.zoneTimer -= dt;
    if (this.zoneTimer > 0) return;
    this.zoneTimer = 0.3;
    const p = this.player.position;
    const z = this.layout.zoneAt(p.x, p.z);
    if (z === this.zone) return;
    const previous = this.zone;
    this.zone = z;
    this.events.emit('zone:enter', { zone: z, previous });
    try {
      this.audio.setAmbience(z);
    } catch {
      /* ignore */
    }
    if (!z) return;
    const last = this.bannerShown.get(z) ?? -999;
    if (this.clock.elapsed - last < 45) return;
    this.bannerShown.set(z, this.clock.elapsed);
    if (z === 'alley') this.ui.zoneBanner('L’Allée des Artisans', `${this.config.stalls.length} cabanes illuminées`);
    else {
      const zone = this.layout.zones[z];
      if (zone) this.ui.zoneBanner(zone.name, zone.subtitle);
    }
  }

  private exposeDebug() {
    const api = {
      ctx: this as GameContext,
      ready: true,
      travelTo: (t: string) => this.travelTo(t as ZoneId),
      setMode: (m: GameMode) => this.setMode(m),
      talk: (id: string) => this.conversations.start(id),
      openStall: (id: string) => {
        const s = this.config.stalls.find((x) => x.id === id);
        if (s) {
          this.setMode('panel');
          this.ui.openStall(s);
        }
      },
      startMinigame: (id: string) => this.minigames.start(id),
      skipIntro: () => this.story.skipIntro(),
      teleport: (x: number, z: number, yaw = 0) => {
        this.player.teleport(new THREE.Vector3(x, 0, z), yaw);
        this.cameraRig.follow(this.player.rig.root, { snap: true, yaw });
      },
      camera: (px: number, py: number, pz: number, lx: number, ly: number, lz: number) =>
        this.cameraRig.cut(new THREE.Vector3(px, py, pz), new THREE.Vector3(lx, ly, lz)),
      info: () => ({ ...this.renderer.info.render, lights: this.lights.count, colliders: this.colliders.count(), mode: this._mode }),
      render: () => ({
        tier: this.quality.tier,
        pixelRatio: this.pipeline.pixelRatio,
        msaa: this.pipeline.msaaSamples,
        level: this.pipeline.renderLevel,
        contextLosses: this.pipeline.contextLosses,
        contextLost: this.pipeline.contextLost,
      }),
      /** Test the GPU crash recovery: drop the WebGL context, give it back after `ms`. */
      simulateContextLoss: (ms = 1500) => {
        const ext = this.renderer.getContext().getExtension('WEBGL_lose_context');
        if (!ext) return false;
        ext.loseContext();
        setTimeout(() => ext.restoreContext(), ms);
        return true;
      },
    };
    (window as any).__givrelune = api;
  }
}
