import * as THREE from 'three';

/**
 * Chalet materials. Each chalet owns one instance of each (they all share the same 4 shader programs),
 * so its lights can be dimmed independently by the intro light wave without any real light source.
 *
 * `levels` (8 floats, shared by the materials of one chalet) = brightness of each light channel:
 *   0 = interior lamp + counter fill, 1 = garland, 2..7 = lanterns / candles / star signs.
 */

export const LIGHT_CHANNELS = 8;

/** Global clock for twinkling bulbs (one uniform object shared by every chalet). */
export const STALL_TIME = { value: 0 };

/** Lambert + vertex colours + baked warm light (aGlowA / aGlowB attributes, see kit.bakeLighting). */
export function litMaterial(levels: Float32Array): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLevels = { value: levels };
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 aGlowA;
attribute vec4 aGlowB;
uniform float uLevels[${LIGHT_CHANNELS}];
varying vec3 vGlow;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vGlow = aGlowA.rgb * uLevels[int(aGlowA.w + 0.5)] + aGlowB.rgb * uLevels[int(aGlowB.w + 0.5)];`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vGlow;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow * diffuseColor.rgb;`);
  };
  m.customProgramCacheKey = () => 'givrelune-stall-lit';
  return m;
}

/** Unlit emissive parts (vertex colour = colour × intensity), dimmed per channel. */
export function glowChannelMaterial(levels: Float32Array, offLevel = 0.1): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLevels = { value: levels };
    sh.uniforms.uOff = { value: offLevel };
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aChan;
uniform float uLevels[${LIGHT_CHANNELS}];
uniform float uOff;
varying float vLvl;`,
      )
      .replace('#include <color_vertex>', `#include <color_vertex>\nvLvl = mix(uOff, 1.0, uLevels[int(aChan + 0.5)]);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vLvl;`)
      .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb *= vLvl;`);
  };
  m.customProgramCacheKey = () => 'givrelune-stall-glow';
  return m;
}

/** Garland bulbs (InstancedMesh with instanceColor): gentle per-bulb twinkle. `color` = brightness. */
export function bulbMaterial(twinkle: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = STALL_TIME;
    sh.uniforms.uTwinkle = { value: twinkle };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nuniform float uTwinkle;`)
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
  float tw = sin(uTime * 1.7 + float(gl_InstanceID) * 2.399) * 0.5 + 0.5;
  tw *= tw;
  vColor.xyz *= 1.0 - uTwinkle * tw;
#endif`,
      );
  };
  m.customProgramCacheKey = () => 'givrelune-stall-bulb';
  return m;
}

/** Additive soft halos (camera-facing) and light pools (flat on the ground). */
export function haloMaterial(levels: Float32Array): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uLevels: { value: levels } }]),
    vertexShader: /* glsl */ `
      attribute vec2 aCorner;
      attribute vec2 aSize;
      attribute vec3 aColor;
      attribute float aChan;
      attribute float aFlat;
      attribute float aPush;
      uniform float uLevels[${LIGHT_CHANNELS}];
      varying vec2 vUv;
      varying vec3 vCol;
      #include <fog_pars_vertex>
      void main() {
        vec4 mvPosition;
        if (aFlat > 0.5) {
          mvPosition = modelViewMatrix * vec4(position + vec3(aCorner.x * aSize.x, 0.0, aCorner.y * aSize.y), 1.0);
        } else {
          mvPosition = modelViewMatrix * vec4(position, 1.0);
          mvPosition.xy += aCorner * aSize;
          mvPosition.z += aPush;
        }
        gl_Position = projectionMatrix * mvPosition;
        vUv = aCorner;
        vCol = aColor * uLevels[int(aChan + 0.5)];
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vCol;
      #include <fog_pars_fragment>
      void main() {
        float d = length(vUv);
        float a = 1.0 - smoothstep(0.0, 1.0, d);
        a = a * a * (0.55 + 0.45 * a);
        vec3 c = vCol * a;
        #ifdef USE_FOG
          #ifdef FOG_EXP2
            float fogF = 1.0 - exp(- fogDensity * fogDensity * vFogDepth * vFogDepth);
          #else
            float fogF = smoothstep(fogNear, fogFar, vFogDepth);
          #endif
          c *= 1.0 - fogF;
        #endif
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
}
