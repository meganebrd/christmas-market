import * as THREE from 'three';
import type { AudioApi, GameContext, LandmarksApi, MarketApi, MinigameApi, NpcApi, StoryApi } from './contracts';

/** No-op implementations used when a module fails to boot (the market must still open). */

export function fallbackAudio(): AudioApi {
  let muted = false;
  return {
    unlocked: false,
    async unlock() {},
    setMuted: (m) => (muted = m),
    isMuted: () => muted,
    setVolume() {},
    music: { play() {}, next() {}, pause() {}, resume() {}, current: () => null, duck() {}, swell() {} },
    sfx() {},
    voice: { blip() {} },
    setAmbience() {},
    setListener() {},
  };
}

export function fallbackLandmarks(): LandmarksApi {
  return { setTreeLight() {}, treeTop: new THREE.Vector3(0, 14, 0), anchors: new Map() };
}

export function fallbackMarket(): MarketApi {
  return { stalls: new Map() };
}

export function fallbackNpcs(): NpcApi {
  return { get: () => undefined, all: () => [], celebrate() {} };
}

export function fallbackMinigames(): MinigameApi {
  return { list: () => [], start: async () => ({ won: false, score: 0 }), isRunning: () => false };
}

export function fallbackStory(ctx: GameContext): StoryApi {
  return {
    async playIntro() {
      ctx.lights.setAll(1);
      ctx.setMode('explore');
    },
    skipIntro() {
      ctx.lights.setAll(1);
    },
    collectStar() {},
    quest: () => ({ found: 0, total: 0, ids: [], complete: false }),
    castIds: [],
  };
}
