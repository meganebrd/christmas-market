import * as THREE from 'three';

/**
 * The sky colour model, shared by the sky dome, the mountains and the "directional fog" of every
 * environment material, so distant things melt exactly into the sky behind them (warm in the west,
 * blue in the east, misty in the north valley).
 */
export type TimeOfDay = 'dusk' | 'night';

interface SkyTheme {
  zenith: string;
  mid: string;
  low: string;
  pink: string;
  amber: string;
  belt: string;
  ground: string;
  glowK: number;
  fogDensity: number;
  mist: number;
  starK: number;
}

export const SKY_THEMES: Record<TimeOfDay, SkyTheme> = {
  dusk: {
    zenith: '#0a1236',
    mid: '#1c2b62',
    low: '#4a5a92',
    pink: '#b8829a',
    amber: '#f4b67c',
    belt: '#8c7aa8',
    ground: '#3c4778',
    glowK: 1,
    fogDensity: 0.0064,
    mist: 0.7,
    starK: 0.75,
  },
  night: {
    zenith: '#040820',
    mid: '#0c1640',
    low: '#1f2b5c',
    pink: '#4a3d63',
    amber: '#8a6a62',
    belt: '#2c2d5a',
    ground: '#1a2246',
    glowK: 0.45,
    fogDensity: 0.0068,
    mist: 0.6,
    starK: 1.15,
  },
};

/** Direction (XZ) toward the set sun: west (−X), a touch south so the glow frames the gate view too. */
export const SUN_DIR = new THREE.Vector2(-1, 0.18).normalize();
/** Where the moon is in the sky (rising in the east, a little north). */
export const MOON_DIR = new THREE.Vector3(0.86, 0.2, -0.46).normalize();
/** Direction the moonlight comes from (cheated higher than the visible moon for nicer shadows). */
export const MOONLIGHT_DIR = new THREE.Vector3(0.62, 0.72, -0.1).normalize();

export const skyUniforms = {
  uSkyZenith: { value: new THREE.Color() },
  uSkyMid: { value: new THREE.Color() },
  uSkyLow: { value: new THREE.Color() },
  uSkyPink: { value: new THREE.Color() },
  uSkyAmber: { value: new THREE.Color() },
  uSkyBelt: { value: new THREE.Color() },
  uSkyGround: { value: new THREE.Color() },
  uSunDir: { value: SUN_DIR.clone() },
  uGlowK: { value: 1 },
  uFogDensity: { value: 0.0064 },
  uMist: { value: 0.7 },
  uTime: { value: 0 },
};

export function applySkyTheme(tod: TimeOfDay): SkyTheme {
  const t = SKY_THEMES[tod] ?? SKY_THEMES.dusk;
  const u = skyUniforms;
  u.uSkyZenith.value.set(t.zenith);
  u.uSkyMid.value.set(t.mid);
  u.uSkyLow.value.set(t.low);
  u.uSkyPink.value.set(t.pink);
  u.uSkyAmber.value.set(t.amber);
  u.uSkyBelt.value.set(t.belt);
  u.uSkyGround.value.set(t.ground);
  u.uGlowK.value = t.glowK;
  u.uFogDensity.value = t.fogDensity;
  u.uMist.value = t.mist;
  return t;
}

/** JS twin of the GLSL `skyColor` (used to pick the scene fog colour). */
export function skyColorJS(dir: THREE.Vector3, out = new THREE.Color()): THREE.Color {
  const u = skyUniforms;
  const ss = (e0: number, e1: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const h = dir.y;
  const hp = Math.max(h, 0);
  const l = Math.hypot(dir.x, dir.z) || 1;
  const az = (dir.x / l) * u.uSunDir.value.x + (dir.z / l) * u.uSunDir.value.y;
  out.copy(u.uSkyLow.value).lerp(u.uSkyMid.value, ss(0, 0.32, hp));
  out.lerp(u.uSkyZenith.value, ss(0.28, 0.95, hp));
  const wa = Math.pow(Math.max(0, Math.min(1, az * 0.5 + 0.5)), 3);
  out.lerp(u.uSkyPink.value, Math.min(1, Math.exp(-hp * 10) * wa * u.uGlowK.value * 0.85));
  out.lerp(u.uSkyAmber.value, Math.min(1, Math.exp(-hp * 22) * Math.pow(wa, 1.6) * u.uGlowK.value));
  out.lerp(u.uSkyGround.value, ss(0, -0.12, h));
  return out;
}

export const SKY_GLSL = /* glsl */ `
uniform vec3 uSkyZenith, uSkyMid, uSkyLow, uSkyPink, uSkyAmber, uSkyBelt, uSkyGround;
uniform vec2 uSunDir;
uniform float uGlowK, uFogDensity, uMist;
vec3 skyColor(vec3 d) {
  float h = d.y;
  float hp = max(h, 0.0);
  vec2 dxz = d.xz / max(length(d.xz), 1e-4);
  float az = dot(dxz, uSunDir);
  vec3 c = mix(uSkyLow, uSkyMid, smoothstep(0.0, 0.32, hp));
  c = mix(c, uSkyZenith, smoothstep(0.28, 0.95, hp));
  float wa = pow(clamp(az * 0.5 + 0.5, 0.0, 1.0), 3.0);
  c = mix(c, uSkyPink, clamp(exp(-hp * 10.0) * wa * uGlowK * 0.85, 0.0, 1.0));
  c = mix(c, uSkyAmber, clamp(exp(-hp * 22.0) * pow(wa, 1.6) * uGlowK, 0.0, 1.0));
  float ea = pow(clamp(-az * 0.5 + 0.5, 0.0, 1.0), 2.0);
  float belt = exp(-pow((hp - 0.11) / 0.07, 2.0));
  c = mix(c, uSkyBelt, ea * belt * 0.4 * uGlowK);
  c = mix(c, uSkyGround, smoothstep(0.0, -0.12, h));
  return c;
}
/* Colour of the haze in a given view direction (sky just above the horizon). */
vec3 hazeColor(vec3 d) {
  return skyColor(normalize(vec3(d.x, clamp(d.y, -0.05, 0.12) * 0.35 + 0.012, d.z)));
}
/* Fog amount for a point at world offset 'off' from the camera. */
float skyFogFactor(vec3 off, vec3 wpos) {
  float dist = length(off);
  float f = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  // valley mist: thicker low down in the north valley
  float mist = smoothstep(-6.0, -55.0, wpos.y) * smoothstep(25.0, 140.0, dist);
  return max(f, mist * uMist);
}
`;

/**
 * Patches a built-in material (Lambert/Basic/Standard) so its fog uses the sky colour of the view
 * direction instead of a flat colour. `strength` < 1 lets lights pierce the haze (windows, lamps).
 */
export function patchSkyFog<T extends THREE.Material>(m: T, strength = 1): T {
  const prev = m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile ? null : m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    Object.assign(sh.uniforms, skyUniforms);
    // the haze colour & amount are smooth over a triangle: computed per vertex (cheap on phones)
    sh.vertexShader = sh.vertexShader
      .replace('#include <fog_pars_vertex>', '#include <fog_pars_vertex>\nvarying vec4 vSkyFog;\n' + SKY_GLSL)
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
        {
          vec3 skyOff = (vec4(mvPosition.xyz, 0.0) * viewMatrix).xyz;
          vSkyFog = vec4(hazeColor(normalize(skyOff)), skyFogFactor(skyOff, cameraPosition + skyOff) * ${strength.toFixed(3)});
        }`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\nvarying vec4 vSkyFog;')
      .replace(
        '#include <fog_fragment>',
        `#ifdef USE_FOG
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vSkyFog.rgb, vSkyFog.a);
        #endif`,
      );
  };
  const baseKey = prev ? m.customProgramCacheKey() : '';
  m.customProgramCacheKey = () => baseKey + '|skyfog2' + strength.toFixed(3);
  return m;
}

/** GLSL for custom ShaderMaterials: include after SKY_GLSL. Returns the fogged colour. */
export const SKY_FOG_APPLY = /* glsl */ `
vec3 applySkyFog(vec3 col, vec3 wpos, float k) {
  vec3 off = wpos - cameraPosition;
  return mix(col, hazeColor(normalize(off)), skyFogFactor(off, wpos) * k);
}
/* For additive things: fade them out in the fog instead of tinting them. */
float skyFogFade(vec3 wpos, float k) {
  vec3 off = wpos - cameraPosition;
  return 1.0 - skyFogFactor(off, wpos) * k;
}
`;
