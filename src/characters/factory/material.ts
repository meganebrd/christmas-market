import * as THREE from 'three';

/**
 * The ONE material shared by every character (and their props): vertex-coloured Lambert with
 *  - a soft cool rim light (the blue-hour sky wrapping the silhouettes → readable from the high camera),
 *  - a per-vertex `emit` attribute (0 = lit normally, 1 = self-lit, >1 = blooms) for eye highlights,
 *    rosy cheeks that stay visible at dusk, lantern flames, pipe embers, glowing glass.
 * Sharing it keeps shader programs and state changes to a minimum.
 */
let shared: THREE.MeshLambertMaterial | null = null;

export const RIM = {
  color: new THREE.Color('#6f84d6'),
  strength: { value: 0.55 },
};

export function characterMaterial(): THREE.MeshLambertMaterial {
  if (shared) return shared;
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: RIM.color };
    shader.uniforms.uRimStrength = RIM.strength;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float emit;\nvarying float vEmit;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n\tvEmit = emit;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimStrength;\nvarying float vEmit;')
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
\tfloat gvFacing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
\tfloat gvRim = pow(1.0 - gvFacing, 2.6) * uRimStrength;
\tfloat gvSelf = clamp(vEmit, 0.0, 1.0);
\ttotalEmissiveRadiance += uRimColor * gvRim * (0.55 + 0.45 * diffuseColor.rgb) * (1.0 - gvSelf);
\ttotalEmissiveRadiance += diffuseColor.rgb * vEmit;
\treflectedLight.directDiffuse *= (1.0 - gvSelf * 0.6);
\treflectedLight.indirectDiffuse *= (1.0 - gvSelf * 0.6);`,
      );
  };
  m.customProgramCacheKey = () => 'givrelune-character-v1';
  shared = m;
  return m;
}
