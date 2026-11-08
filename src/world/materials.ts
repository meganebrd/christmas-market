import * as THREE from 'three';

/**
 * Shared, cached materials. Reusing materials keeps draw-call state changes and shader
 * compilations low (important on phones). Never `dispose()` a cached material.
 *
 *  mat('#8a5a3b')                         → matte Lambert (default for almost everything)
 *  mat('#e9eef9', { flat: true })         → faceted low-poly look
 *  glow('#ffc56b', 3)                     → unlit emissive colour that blooms (bulbs, windows, flames)
 *  std('#bfe0f0', { roughness: 0.2 })     → MeshStandardMaterial when you need specular (ice, glass)
 */
const cache = new Map<string, THREE.Material>();

export interface MatOpts {
  flat?: boolean;
  emissive?: string;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  vertexColors?: boolean;
  map?: THREE.Texture;
}

export function mat(color: string | THREE.Color, opts: MatOpts = {}): THREE.MeshLambertMaterial {
  const c = typeof color === 'string' ? color : '#' + color.getHexString();
  const key = `lam|${c}|${opts.flat ? 1 : 0}|${opts.emissive ?? ''}|${opts.emissiveIntensity ?? ''}|${opts.transparent ? opts.opacity : ''}|${opts.side ?? ''}|${opts.vertexColors ? 1 : 0}|${opts.map?.uuid ?? ''}`;
  let m = cache.get(key) as THREE.MeshLambertMaterial | undefined;
  if (!m) {
    const params: THREE.MeshLambertMaterialParameters = {
      color: c,
      flatShading: opts.flat ?? false,
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide,
      vertexColors: opts.vertexColors ?? false,
    };
    if (opts.emissive) params.emissive = new THREE.Color(opts.emissive);
    if (opts.map) params.map = opts.map;
    m = new THREE.MeshLambertMaterial(params);
    cache.set(key, m);
  }
  return m;
}

export function std(
  color: string,
  opts: { roughness?: number; metalness?: number; transparent?: boolean; opacity?: number; emissive?: string; emissiveIntensity?: number; flat?: boolean } = {},
): THREE.MeshStandardMaterial {
  const key = `std|${color}|${JSON.stringify(opts)}`;
  let m = cache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    const params: THREE.MeshStandardMaterialParameters = {
      color,
      roughness: opts.roughness ?? 0.8,
      metalness: opts.metalness ?? 0,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      flatShading: opts.flat ?? false,
    };
    if (opts.emissive) params.emissive = new THREE.Color(opts.emissive);
    m = new THREE.MeshStandardMaterial(params);
    cache.set(key, m);
  }
  return m;
}

/**
 * Unlit glowing material. `intensity` > 1 pushes it above the bloom threshold.
 * Cached per (color, intensity). If you need to animate one light independently, use `glowUnique`.
 */
export function glow(color: string, intensity = 2.5, opts: { transparent?: boolean; opacity?: number } = {}): THREE.MeshBasicMaterial {
  const key = `glow|${color}|${intensity}|${opts.transparent ? opts.opacity ?? 1 : ''}`;
  let m = cache.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = glowUnique(color, intensity, opts);
    cache.set(key, m);
  }
  return m;
}

export function glowUnique(color: string, intensity = 2.5, opts: { transparent?: boolean; opacity?: number } = {}): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(intensity),
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
  });
  m.userData.baseColor = new THREE.Color(color);
  m.userData.intensity = intensity;
  return m;
}

/** Set the brightness of a glow material made by `glowUnique` (0 = off-ish, 1 = full). */
export function setGlow(m: THREE.MeshBasicMaterial, k: number, offLevel = 0.08) {
  const base = m.userData.baseColor as THREE.Color | undefined;
  if (!base) return;
  const i = (m.userData.intensity as number) * (offLevel + (1 - offLevel) * k);
  m.color.copy(base).multiplyScalar(i);
}
