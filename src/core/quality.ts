export type QualityTier = 'low' | 'medium' | 'high';

export interface QualityProfile {
  tier: QualityTier;
  /** Highest pixel ratio this tier renders at (the device pixel ratio is capped to it). */
  pixelRatio: number;
  /**
   * Most pixels (canvas width × height) this tier renders. On big Retina screens it lowers the pixel
   * ratio further: filling 5 million pixels per frame is what saturates laptop GPUs.
   */
  maxPixels: number;
  /**
   * MSAA samples of the scene target. Only used when the effective pixel ratio is below
   * MSAA_MAX_PIXEL_RATIO: on Retina screens it costs a lot (≈ ×2.5 GPU time) for an invisible gain.
   */
  msaa: number;
  bloom: boolean;
  /** Bloom render scale (0.5 = half resolution). */
  bloomScale: number;
  shadows: boolean;
  shadowMapSize: number;
  /** Number of falling snowflakes. */
  snowCount: number;
  /** Number of wandering visitors. */
  crowdCount: number;
  /** Real THREE.PointLights allowed in the whole scene (the rest is emissive + glow sprites). */
  maxPointLights: number;
  /** Background detail (houses, trees) multiplier 0..1. */
  detail: number;
  isTouch: boolean;
  isMobile: boolean;
}

/** Above this pixel ratio, aliasing is too fine to see: MSAA is skipped. */
export const MSAA_MAX_PIXEL_RATIO = 1.4;
/** The adaptive resolution never renders below this pixel ratio (too blurry). */
export const MIN_PIXEL_RATIO = 0.6;

const TIERS: QualityTier[] = ['low', 'medium', 'high'];

/** One tier lower (used after the GPU gave up: the browser lost the WebGL context). */
export function lowerTier(tier: QualityTier): QualityTier {
  return TIERS[Math.max(0, TIERS.indexOf(tier) - 1)];
}

/**
 * @param forced  a tier asked for explicitly (URL flag or settings), wins over detection
 * @param ceiling highest tier "auto" may pick (lowered after the GPU crashed on a previous visit)
 */
export function detectQuality(forced?: string | null, ceiling?: QualityTier | null): QualityProfile {
  const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  const small = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 700;
  const isMobile = isTouch && small;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as any).deviceMemory ?? 8;
  let tier: QualityTier = 'high';
  if (isMobile || cores <= 4 || mem <= 4) tier = 'medium';
  if ((isMobile && (cores <= 4 || mem <= 3)) || cores <= 2) tier = 'low';
  if (ceiling && TIERS.includes(ceiling) && TIERS.indexOf(ceiling) < TIERS.indexOf(tier)) tier = ceiling;
  if (forced === 'low' || forced === 'medium' || forced === 'high') tier = forced;
  return profileFor(tier, isTouch, isMobile);
}

export function profileFor(tier: QualityTier, isTouch = false, isMobile = false): QualityProfile {
  switch (tier) {
    case 'low':
      return {
        tier, isTouch, isMobile,
        pixelRatio: 1.25, maxPixels: 1.1e6, msaa: 0, bloom: true, bloomScale: 0.35,
        shadows: false, shadowMapSize: 512, snowCount: 900, crowdCount: 6, maxPointLights: 2, detail: 0.5,
      };
    case 'medium':
      return {
        tier, isTouch, isMobile,
        pixelRatio: 1.6, maxPixels: 2.2e6, msaa: 0, bloom: true, bloomScale: 0.5,
        shadows: false, shadowMapSize: 1024, snowCount: 2200, crowdCount: 12, maxPointLights: 4, detail: 0.8,
      };
    default:
      return {
        tier, isTouch, isMobile,
        pixelRatio: 2, maxPixels: 3.2e6, msaa: 4, bloom: true, bloomScale: 0.5,
        shadows: true, shadowMapSize: 2048, snowCount: 4500, crowdCount: 18, maxPointLights: 6, detail: 1,
      };
  }
}

/**
 * Pixel ratio actually rendered: the device's, capped by the tier, by its pixel budget for this
 * canvas size, then scaled by the adaptive resolution (1 = full).
 */
export function renderPixelRatio(q: Pick<QualityProfile, 'pixelRatio' | 'maxPixels'>, cssW: number, cssH: number, dpr: number, scale = 1): number {
  const area = Math.max(1, cssW * cssH);
  const budget = Math.sqrt(q.maxPixels / area);
  const base = Math.min(dpr || 1, q.pixelRatio, budget);
  // a small screen may legitimately sit under the floor (e.g. low tier on a 1× display): never upscale it
  const floor = Math.min(base, MIN_PIXEL_RATIO);
  return Math.max(floor, Math.floor(base * scale * 100) / 100);
}
