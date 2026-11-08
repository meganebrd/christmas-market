import type * as THREE from 'three';
import type { GameContext } from '../core/contracts';
import type { ResolvedMarket, ZoneId } from '../config/types';
import type { Sparks } from './fx';

export type CastConfig = ResolvedMarket['cast'][number];

export type StarId = 'flocons' | 'chamboule' | 'crepes' | 'verrier' | 'manege' | 'chaudron' | 'lac';

/** How the visitor gets a star. */
export type StarMode =
  /** Win the zone's mini-game. */
  | 'minigame'
  /** Barnabé gives it after you order a drink. */
  | 'gift'
  /** A glass star lies somewhere: walk to it and pick it up. */
  | 'hidden';

export interface PlannedStar {
  id: StarId;
  index: number;
  /** Glass tint (each of Maître Aubin's stars has its own hue). */
  tint: string;
  /** The zone the star is naturally tied to. */
  zone: ZoneId;
  mode: StarMode;
  /** Mini-game id (mode 'minigame'). */
  gameId?: string;
  /** Cast role that knows about it (gives the game / the gift / a hint). */
  role?: CastConfig['role'];
  /** Where the star "lives" (the intro glints fly there; hints point there). Ground position. */
  home: THREE.Vector3;
  /** Hidden stars: where the pick-up floats. */
  pickup?: THREE.Vector3;
  /** Hidden stars: human description of the place ("près de la Porte du Givre"). */
  where?: string;
}

export interface StoryRuntime {
  ctx: GameContext;
  group: THREE.Group;
  sparks: Sparks;
  plan: PlannedStar[];
  guide: CastConfig | null;
  /** Ids of found stars (only ids from the plan). */
  found(): Set<StarId>;
  isFound(id: string): boolean;
  complete(): boolean;
  /** Star granted (animation from `from`, or above the visitor). */
  grant(id: StarId, from?: THREE.Vector3): void;
  /** Push the quest state to the HUD. */
  refreshQuest(): void;
  objective(): string;
  /** Queue an action to run right after the current conversation script ends (start a game, open the map…). */
  after(fn: () => void): void;
  /** Warm glow after a hot drink / chestnuts (0..1), back to neutral after `hold` seconds. */
  warmUp(level: number, hold?: number): void;
  playFinale(opts?: { replay?: boolean }): Promise<void>;
  finaleRunning(): boolean;
  setBeacon(on: boolean): void;
  hasNpc(castId: string): boolean;
  reducedMotion(): boolean;
  isTouch(): boolean;
}
