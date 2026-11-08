import * as THREE from 'three';
import { glowTexture } from '../world/textures';
import { additiveSprite, flareTexture } from './fx';

/**
 * Maître Aubin's glass stars: an extruded, bevelled five-pointed star in a fresnel "glass" shader
 * (transparent body, bright rims, a glint sweeping across the facets) around a warm glowing core.
 * One geometry and one time uniform are shared by every star of the game.
 */

const time = { value: 0 };
export function tickGlass(elapsed: number) {
  time.value = elapsed;
}

let starGeo: THREE.BufferGeometry | null = null;
let coreGeo: THREE.BufferGeometry | null = null;

function starShape(outer: number, inner: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

/** Star of outer radius ≈ 0.36 m, centred on the origin, facing +Z. */
export function starGeometry(): THREE.BufferGeometry {
  if (starGeo) return starGeo;
  const g = new THREE.ExtrudeGeometry(starShape(0.3, 0.13), {
    depth: 0.06,
    bevelEnabled: true,
    bevelThickness: 0.055,
    bevelSize: 0.06,
    bevelSegments: 1,
    curveSegments: 1,
  });
  g.center();
  g.computeVertexNormals();
  g.computeBoundingSphere();
  starGeo = g;
  return g;
}

export function coreGeometry(): THREE.BufferGeometry {
  if (coreGeo) return coreGeo;
  const g = new THREE.ExtrudeGeometry(starShape(0.17, 0.08), { depth: 0.05, bevelEnabled: false, curveSegments: 1 });
  g.center();
  coreGeo = g;
  return g;
}

/** Glass shader. `uTint` per material, or per instance via InstancedMesh.setColorAt. */
export function glassMaterial(tint: THREE.Color | string, glow = 0.6): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: time,
      uTint: { value: new THREE.Color(tint) },
      uGlow: { value: glow },
    },
    vertexShader: /* glsl */ `
      uniform vec3 uTint;
      varying vec3 vN;
      varying vec3 vW;
      varying vec3 vTint;
      void main() {
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = modelMatrix * instanceMatrix;
        #endif
        vec4 wp = m * vec4(position, 1.0);
        vW = wp.xyz;
        vN = normalize(mat3(m) * normal);
        vTint = uTint;
        #ifdef USE_INSTANCING_COLOR
          vTint = instanceColor;
        #endif
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uGlow;
      varying vec3 vN;
      varying vec3 vW;
      varying vec3 vTint;
      void main() {
        vec3 n = normalize(vN);
        vec3 v = normalize(cameraPosition - vW);
        float ndv = abs(dot(n, v));
        float f = pow(1.0 - ndv, 2.2);
        // a glint sweeping across the facets
        float band = smoothstep(0.93, 1.0, sin(dot(vW, vec3(2.3, 3.1, 1.7)) * 1.6 - uTime * 2.4));
        // fake moonlight specular on facets facing up / toward the camera
        float spec = pow(max(dot(n, normalize(v + vec3(0.2, 0.9, 0.1))), 0.0), 24.0);
        vec3 body = vTint * (0.28 + uGlow * 0.55);
        vec3 rim = mix(vTint, vec3(1.0), 0.55) * (1.5 + uGlow);
        vec3 col = mix(body, rim, f) + vec3(1.0, 0.98, 0.92) * (band * 1.8 + spec * 1.4);
        float a = clamp(0.38 + f * 0.62 + band * 0.4 + spec * 0.5, 0.0, 1.0);
        gl_FragColor = vec4(col, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export interface GlassStar {
  group: THREE.Group;
  /** The spinning part (star body + core). */
  spin: THREE.Group;
  body: THREE.Mesh;
  core: THREE.Mesh;
  halo: THREE.Sprite;
  flare: THREE.Sprite;
  material: THREE.ShaderMaterial;
  setGlow(k: number): void;
  dispose(): void;
}

/** A single glass star (pick-ups, flights, the beacon marker). */
export function createGlassStar(tint: string, opts: { scale?: number; halo?: number; flare?: boolean } = {}): GlassStar {
  const group = new THREE.Group();
  const spin = new THREE.Group();
  group.add(spin);
  const material = glassMaterial(tint, 0.6);
  const body = new THREE.Mesh(starGeometry(), material);
  body.renderOrder = 12;
  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).lerp(new THREE.Color('#fff4d6'), 0.6).multiplyScalar(3) });
  const core = new THREE.Mesh(coreGeometry(), coreMat);
  core.renderOrder = 11;
  spin.add(core, body);
  const haloK = opts.halo ?? 1.8;
  const halo = additiveSprite(glowTexture(), new THREE.Color(tint).lerp(new THREE.Color('#fff1c9'), 0.5), haloK, 0.7);
  halo.renderOrder = 10;
  group.add(halo);
  const flare = additiveSprite(flareTexture(), '#ffffff', 0.01, 0.95);
  flare.renderOrder = 13;
  flare.visible = opts.flare ?? false;
  group.add(flare);
  group.scale.setScalar(opts.scale ?? 1);
  const baseCore = coreMat.color.clone();
  return {
    group,
    spin,
    body,
    core,
    halo,
    flare,
    material,
    setGlow(k: number) {
      material.uniforms.uGlow.value = 0.6 * k;
      coreMat.color.copy(baseCore).multiplyScalar(0.5 + 0.5 * k);
      (halo.material as THREE.SpriteMaterial).opacity = Math.min(1, 0.7 * k);
    },
    dispose() {
      material.dispose();
      coreMat.dispose();
      (halo.material as THREE.Material).dispose();
      (flare.material as THREE.Material).dispose();
      group.removeFromParent();
    },
  };
}
