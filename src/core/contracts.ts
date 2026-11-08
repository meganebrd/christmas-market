/**
 * Contracts between the modules of the game. Every module receives the `GameContext` and
 * implements one of the APIs below. Modules talk to each other ONLY through these interfaces
 * (and the typed event bus), never by importing each other's internals.
 *
 *   core/        → GameContext, Input, Colliders, Interactables, Lights, CameraRig, Save (core team)
 *   world/       → buildEnvironment(), buildLandmarks() → LandmarksApi, buildStalls() → MarketApi
 *   characters/  → createCharacter(), createPlayer() → PlayerApi, createNpcs() → NpcApi
 *   dialogue/    → registerVendorConversations(), the no-AI question answering engine
 *   ui/          → createUI() → UIApi
 *   audio/       → createAudio() → AudioApi
 *   story/       → createStory() → StoryApi
 *   minigames/   → createMinigames() → MinigameApi
 */
import type * as THREE from 'three';
import type { CastMember, ResolvedMarket, ResolvedProduct, ResolvedStall, ZoneId } from '../config/types';
import type { Layout, Surface } from '../world/layout';
import type { EventBus } from './events';
import type { Input } from './Input';
import type { Colliders } from './Colliders';
import type { Interactables } from './Interactables';
import type { LightDirector } from './LightDirector';
import type { CameraRig } from './CameraRig';
import type { SaveStore } from './save';
import type { QualityProfile } from './quality';
import type { Conversations } from './Conversations';

// ───────────────────────────── Game modes & events ─────────────────────────────

export type GameMode = 'loading' | 'title' | 'cinematic' | 'explore' | 'dialogue' | 'panel' | 'map' | 'minigame';

export type GameEvents = {
  'mode:change': { from: GameMode; to: GameMode };
  /** The visitor clicked "Entrer" on the title screen (audio is now unlocked). */
  'title:start': void;
  'intro:done': void;
  'zone:enter': { zone: ZoneId | 'alley' | null; previous: ZoneId | 'alley' | null };
  'stall:visited': { stallId: string };
  'stall:open': { stallId: string };
  'product:open': { stallId: string; productId: string };
  'conversation:start': { id: string };
  'conversation:end': { id: string };
  'star:collected': { id: string; count: number; total: number };
  'quest:complete': void;
  /** Grand finale: the Grand Sapin lights up. Landmarks/NPCs react to it. */
  'finale:start': void;
  'finale:end': void;
  'minigame:start': { id: string };
  'minigame:end': { id: string; won: boolean; score: number };
  /** The visitor asked to quit the running mini-game (Échap, or the "Quitter" button on touch screens). */
  'minigame:abort': void;
  'player:step': { surface: Surface; running: boolean; position: THREE.Vector3 };
  'settings:change': Settings;
  'travel:start': { to: string };
  'travel:end': { to: string };
  /** The GPU dropped the WebGL context (nothing can be drawn until `render:restored`). */
  'render:lost': void;
  /** The WebGL context is back: anything rendered only on the GPU (env maps…) must be redrawn. */
  'render:restored': void;
};

export interface Settings {
  muted: boolean;
  music: number;
  sfx: number;
  quality: 'auto' | 'low' | 'medium' | 'high';
  reducedMotion: boolean;
}

export interface System {
  update(dt: number, elapsed: number): void;
}

// ───────────────────────────── Context ─────────────────────────────

export interface GameContext {
  readonly config: ResolvedMarket;
  readonly layout: Layout;
  readonly quality: QualityProfile;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly events: EventBus<GameEvents>;
  readonly input: Input;
  readonly colliders: Colliders;
  readonly interactables: Interactables;
  readonly lights: LightDirector;
  readonly cameraRig: CameraRig;
  readonly save: SaveStore;
  readonly conversations: Conversations;
  /** Seconds since start (frozen while the tab is hidden). */
  readonly clock: { elapsed: number };
  /** URL flags: ?debug, ?skipIntro, ?autostart, ?quality=, ?at=, ?mute */
  readonly flags: URLSearchParams;

  // Set during boot, in this order. Always available once `ready` is true.
  ui: UIApi;
  audio: AudioApi;
  landmarks: LandmarksApi;
  market: MarketApi;
  player: PlayerApi;
  npcs: NpcApi;
  story: StoryApi;
  minigames: MinigameApi;

  readonly mode: GameMode;
  setMode(mode: GameMode): void;
  /** Register a per-frame update. Returns an unsubscribe function. */
  addSystem(system: System | ((dt: number, elapsed: number) => void)): () => void;
  /** Fade the screen to black (1) or back (0). */
  fade(to: 0 | 1, ms?: number): Promise<void>;
  /** Fast travel (map): fade, teleport the player, banner. Target = zone id or `stall:<id>`. */
  travelTo(target: ZoneId | `stall:${string}`): Promise<void>;
  /** Ground point under a screen position (NDC), or null. */
  pickGround(ndcX: number, ndcY: number): THREE.Vector3 | null;
  /** Post-processing mood controls (warm glow after a hot drink, bloom boost at the finale). */
  readonly post: PostApi;
}

export interface PostApi {
  /** 0 = neutral, 1 = very warm. Smoothly animated over `seconds`. */
  setWarmth(v: number, seconds?: number): void;
  /** Multiplier on the bloom strength (1 = default). Smoothly animated. */
  setBloomBoost(k: number, seconds?: number): void;
  /** Exposure multiplier (1 = default). */
  setExposure(k: number, seconds?: number): void;
}

// ───────────────────────────── UI ─────────────────────────────

export interface SpeakerInfo {
  id: string;
  name: string;
  /** e.g. "Céramiste" — shown under the name. */
  title?: string;
  /** Name-tag colour. */
  color?: string;
  voicePitch?: number;
  /** World object to keep in frame while talking. */
  anchor?: THREE.Object3D;
}

export interface DialogueChoice {
  id: string;
  label: string;
  /** Small emoji/icon in front of the label. */
  icon?: string;
}

export type AskResult = { type: 'text'; value: string } | { type: 'choice'; id: string };

export interface DialogueUI {
  /** Opens the dialogue box for a speaker. Safe to call while already open (switches speaker). */
  open(speaker: SpeakerInfo): void;
  /** Types the text (with voice blips). Resolves when the visitor presses "continue". */
  say(text: string, opts?: { emotion?: 'neutral' | 'happy' | 'surprised' | 'thinking' | 'sad'; autoAdvanceMs?: number }): Promise<void>;
  /** Shows choices under the last line. Resolves with the chosen id. */
  choose(choices: DialogueChoice[]): Promise<string>;
  /** Free text question with suggestion chips + optional choices. */
  ask(opts: { placeholder?: string; suggestions?: string[]; choices?: DialogueChoice[] }): Promise<AskResult>;
  /** Shows a small card (product, link) inside the dialogue. */
  card(card: { title: string; subtitle?: string; image?: string; url?: string; cta?: string }): void;
  close(): void;
  isOpen(): boolean;
}

export interface QuestState {
  found: number;
  total: number;
  /** Ids of found stars. */
  ids: string[];
  /** Short current objective, e.g. "Trouve les étoiles de verre". */
  objective?: string;
  complete: boolean;
}

export interface UIApi {
  showLoading(progress: number, label?: string): void;
  hideLoading(): void;
  /** Title screen over the slowly drifting 3D scene. `onStart` is called on the visitor's click (user gesture). */
  showTitle(opts: { title: string; town: string; tagline?: string; onStart: () => void }): void;
  hideTitle(): void;
  /** Cinematic black bars. */
  letterbox(on: boolean): void;
  /** Cinematic subtitle. Resolves after `duration` ms (default: based on text length) or on skip. */
  narrate(text: string, opts?: { duration?: number }): Promise<void>;
  /** Show a "Passer" button during cinematics. */
  setSkippable(onSkip: (() => void) | null): void;
  dialogue: DialogueUI;
  openStall(stall: ResolvedStall): void;
  openProduct(stall: ResolvedStall, product: ResolvedProduct): void;
  closePanels(): void;
  /** Character card: who is this artisan, links to their website/socials. */
  openProfile(stall: ResolvedStall): void;
  /** Small ambient speech bubble above a character/object ("Chauds les marrons !"). Auto-hides. */
  bubble(anchor: THREE.Object3D, text: string, opts?: { duration?: number; height?: number }): void;
  /** Interaction hint ("E · Parler à Margot"). worldPos: shows it above that point. */
  setPrompt(prompt: { label: string; worldPos?: THREE.Vector3 } | null): void;
  setHudVisible(visible: boolean): void;
  setQuest(state: QuestState): void;
  toast(text: string, opts?: { icon?: string; duration?: number }): void;
  /** Big elegant banner when entering a zone. */
  zoneBanner(title: string, subtitle?: string): void;
  openMap(): void;
  closeMap(): void;
  /** Mini-game overlay (score, timer, hint). null hides it. */
  minigameHud(state: { title: string; score?: string; time?: number; hint?: string; /** show the touch joystick (default true) */ joystick?: boolean } | null): void;
  /** Big centred result card after a mini-game. Resolves when closed. */
  minigameResult(opts: { title: string; text: string; won: boolean }): Promise<void>;
  /** A UI modal (dialogue, panel, map…) is open: the world should not take input. */
  isBlocking(): boolean;
}

// ───────────────────────────── Audio ─────────────────────────────

export type SfxName =
  | 'step-snow'
  | 'step-stone'
  | 'step-wood'
  | 'step-ice'
  | 'ui-open'
  | 'ui-close'
  | 'ui-select'
  | 'ui-hover'
  | 'dialogue-next'
  | 'star-collect'
  | 'bell'
  | 'chime'
  | 'whoosh'
  | 'pop'
  | 'sizzle'
  | 'pour'
  | 'glass-clink'
  | 'throw'
  | 'snow-hit'
  | 'can-fall'
  | 'success'
  | 'fail'
  | 'firework'
  | 'magic'
  | 'page'
  | 'door'
  | 'tick';

export interface TrackInfo {
  title: string;
  author?: string;
  license?: string;
}

export interface AudioApi {
  /** Must be called from a user gesture (the title screen "Entrer" click). */
  unlock(): Promise<void>;
  readonly unlocked: boolean;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  setVolume(channel: 'music' | 'sfx', v: number): void;
  music: {
    play(index?: number): void;
    next(): void;
    pause(): void;
    resume(): void;
    current(): TrackInfo | null;
    /** Lower the music (dialogue, cinematics). */
    duck(on: boolean): void;
    /** Swell (finale). */
    swell(on: boolean): void;
  };
  sfx(name: SfxName, opts?: { volume?: number; pitch?: number; position?: THREE.Vector3 }): void;
  /** Dialogue "babble" voice, one blip per letter. */
  voice: { blip(char: string, pitch: number): void };
  /** Crossfade the ambience bed to the zone (crowd, bar chatter, fire, skating…). */
  setAmbience(zone: ZoneId | 'alley' | null): void;
  /** Called every frame by the core with the camera. */
  setListener(position: THREE.Vector3, forward: THREE.Vector3): void;
}

// ───────────────────────────── World ─────────────────────────────

export interface StallHandle {
  stallId: string;
  stall: ResolvedStall;
  group: THREE.Group;
  /** World position of the keeper spot. */
  keeperPoint: THREE.Vector3;
  customerPoint: THREE.Vector3;
  /** Highlight (outline glow) when the visitor is near. */
  setHighlight(on: boolean): void;
}

export interface MarketApi {
  stalls: Map<string, StallHandle>;
  /** Rebuild one stall (editor live preview). */
  rebuild?(stall: ResolvedStall): void;
}

export interface LandmarksApi {
  /** 0 = dark tree, 1 = fully lit (finale). Animated by the story. */
  setTreeLight(progress: number): void;
  /** World position of the star on top of the Grand Sapin. */
  treeTop: THREE.Vector3;
  /** World positions of the 7 sockets on the tree where the found glass stars hang (story flies them there). */
  starSockets?: THREE.Vector3[];
  /** Named anchor points inside zones that other modules need (bar counter, crêpe stand, can pyramid…). */
  anchors: Map<string, { position: THREE.Vector3; yaw: number }>;
}

// ───────────────────────────── Characters ─────────────────────────────

export type AnimName = 'idle' | 'walk' | 'run' | 'talk' | 'wave' | 'cheer' | 'cook' | 'craft' | 'drink' | 'skate' | 'sit' | 'throw' | 'clap' | 'think';

export interface CharacterRig {
  root: THREE.Group;
  /** Approximate head height (for bubbles and camera framing). */
  height: number;
  play(anim: AnimName, opts?: { loop?: boolean; speed?: number }): void;
  /** Mouth & head bob while speaking. */
  setTalking(on: boolean): void;
  /** Turn head (and body if needed) toward a world point, or null to release. */
  lookAt(target: THREE.Vector3 | null): void;
  /** One-shot emote: little jump, heart, sparkles… */
  emote(kind: 'happy' | 'surprised' | 'love' | 'note' | 'sweat' | 'idea'): void;
  update(dt: number): void;
  dispose(): void;
}

export interface PlayerApi {
  rig: CharacterRig;
  readonly position: THREE.Vector3;
  /** Yaw in radians (local +Z forward). */
  readonly yaw: number;
  /** Player input is applied only when enabled AND mode is 'explore' (or a minigame that wants it). */
  setControlEnabled(enabled: boolean): void;
  teleport(pos: THREE.Vector3, yaw?: number): void;
  /** Auto-walk to a point (cinematics, tap-to-move). Resolves on arrival (or when interrupted). */
  walkTo(pos: THREE.Vector3, opts?: { run?: boolean; stopDistance?: number }): Promise<void>;
  faceToward(pos: THREE.Vector3): void;
}

export interface NpcHandle {
  id: string;
  name: string;
  rig: CharacterRig;
  readonly position: THREE.Vector3;
  /** Pause the NPC's behaviour and face something (during a conversation). */
  hold(lookAt: THREE.Vector3 | null): void;
  release(): void;
}

export interface NpcApi {
  get(id: string): NpcHandle | undefined;
  /** Vendor keeper id is `vendor:<stallId>`, cast member id is `cast:<castId>`. */
  all(): NpcHandle[];
  /** Everyone cheers (finale). */
  celebrate(): void;
}

// ───────────────────────────── Story & mini-games ─────────────────────────────

export interface StoryApi {
  /** Title screen → fly-over → narration → light wave → guide greeting → explore. */
  playIntro(): Promise<void>;
  /** Skip straight to exploration (returning visitors, ?skipIntro). */
  skipIntro(): void;
  collectStar(id: string): void;
  quest(): QuestState;
  /** Conversation scripts for the cast (guide, barista…). Registered on the Conversations registry. */
  readonly castIds: string[];
}

export interface MinigameApi {
  list(): { id: string; title: string; zone: ZoneId }[];
  start(id: string): Promise<{ won: boolean; score: number }>;
  isRunning(): boolean;
}

export type { CastMember };

/**
 * Anchor names published by the landmarks module in `ctx.landmarks.anchors` (position on the ground + yaw
 * the character/visitor should face). Modules needing one fall back to the zone centre if it is missing.
 *   <zone>:<who>        where a cast member stands      <zone>:<what>-spot  where the visitor stands
 */
export const ANCHORS = [
  'plaza:guide', 'plaza:musician', 'plaza:tree-front',
  'gate:arch',
  'bar:barista', 'bar:counter-spot', 'bar:cauldron',
  'food:cook', 'food:crepe-spot', 'food:griddle', 'food:chestnut', 'food:chestnut-spot',
  'workshop:glassblower', 'workshop:furnace', 'workshop:bench-spot',
  'carousel:keeper', 'carousel:center', 'carousel:board-spot',
  'fair:keeper', 'fair:throw-spot', 'fair:targets',
  'belvedere:stargazer', 'belvedere:telescope', 'belvedere:center',
  'rink:center', 'rink:bench-spot',
] as const;
export type AnchorName = (typeof ANCHORS)[number];
