/**
 * Givrelune characters — cosy chibi people, procedural animation, the visitor, the artisans, the cast
 * and the strolling crowd.
 *
 *   createCharacter(appearance, { detail })  ctx-free (editor previews) → CharacterRig (a CosyRig)
 *   createPlayer(ctx)                         → PlayerApi
 *   createNpcs(ctx)                           → NpcApi (vendors, cast, crowd, ?charlab gallery)
 */
import type { CharacterRig, GameContext, NpcApi, PlayerApi } from '../core/contracts';
import type { CharacterAppearance } from '../config/types';
import { CosyRig } from './rig';
import { createPlayerController } from './player';
import { createNpcManager } from './npcs';

export type { CosyRig } from './rig';
export type { AnyAnim, ExtraAnim } from './anims';

/** Builds a character (one skinned mesh, ~1 draw call). Call `rig.update(dt)` every frame. */
export function createCharacter(appearance: Required<CharacterAppearance>, opts: { detail?: number } = {}): CharacterRig {
  return new CosyRig(appearance, opts.detail ?? 1);
}

export function createPlayer(ctx: GameContext): PlayerApi {
  return createPlayerController(ctx);
}

export function createNpcs(ctx: GameContext): NpcApi {
  return createNpcManager(ctx);
}
