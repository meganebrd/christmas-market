export type QualityTier = 'low' | 'medium' | 'high';

export interface QualityProfile {
  tier: QualityTier;
  pixelRatio: number;
  antialias: boolean;
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

export function detectQuality(forced?: string | null): QualityProfile {
  const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  const small = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 700;
  const isMobile = isTouch && small;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as any).deviceMemory ?? 8;
  let tier: QualityTier = 'high';
  if (isMobile || cores <= 4 || mem <= 4) tier = 'medium';
  if ((isMobile && (cores <= 4 || mem <= 3)) || cores <= 2) tier = 'low';
  if (forced === 'low' || forced === 'medium' || forced === 'high') tier = forced;
  return profileFor(tier, isTouch, isMobile);
}

export function profileFor(tier: QualityTier, isTouch = false, isMobile = false): QualityProfile {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  switch (tier) {
    case 'low':
      return {
        tier, isTouch, isMobile,
        pixelRatio: Math.min(dpr, 1.25), antialias: false, bloom: true, bloomScale: 0.35,
        shadows: false, shadowMapSize: 512, snowCount: 900, crowdCount: 6, maxPointLights: 2, detail: 0.5,
      };
    case 'medium':
      return {
        tier, isTouch, isMobile,
        pixelRatio: Math.min(dpr, 1.6), antialias: true, bloom: true, bloomScale: 0.5,
        shadows: false, shadowMapSize: 1024, snowCount: 2200, crowdCount: 12, maxPointLights: 4, detail: 0.8,
      };
    default:
      return {
        tier, isTouch, isMobile,
        pixelRatio: Math.min(dpr, 2), antialias: true, bloom: true, bloomScale: 0.5,
        shadows: true, shadowMapSize: 2048, snowCount: 4500, crowdCount: 18, maxPointLights: 6, detail: 1,
      };
  }
}
