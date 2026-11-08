import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { QualityProfile } from './quality';

/**
 * Renderer + post-processing: bloom (the illuminations!), a cosy colour grade (cool shadows,
 * warm highlights, vignette, a touch of film grain), then tone mapping.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uVignette: { value: 0.32 },
    uWarmth: { value: 0.0 },
    uGrain: { value: 0.025 },
    uSaturation: { value: 1.06 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uWarmth, uGrain, uSaturation;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      // split toning: shadows → blue, highlights → amber
      vec3 shadowTint = vec3(0.86, 0.93, 1.12);
      vec3 highTint = vec3(1.08, 1.0, 0.88);
      float hl = smoothstep(0.05, 0.9, l);
      col *= mix(shadowTint, highTint, hl);
      col = mix(vec3(l), col, uSaturation);
      col *= 1.0 + uWarmth * vec3(0.12, 0.04, -0.06);
      // vignette
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.2, length(d * vec2(1.1, 1.0)));
      col *= mix(1.0 - uVignette, 1.0, v);
      // grain
      col += (hash(vUv * 1000.0 + fract(uTime)) - 0.5) * uGrain * (0.3 + l);
      gl_FragColor = vec4(max(col, 0.0), c.a);
    }
  `,
};

export class RenderPipeline {
  readonly renderer: THREE.WebGLRenderer;
  composer: EffectComposer | null = null;
  bloom: UnrealBloomPass | null = null;
  grade: ShaderPass | null = null;
  private renderPass: RenderPass | null = null;
  private width = 1;
  private height = 1;

  constructor(
    canvas: HTMLCanvasElement,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private quality: QualityProfile,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality.antialias,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
      preserveDrawingBuffer: new URLSearchParams(location.search).has('capture'),
    });
    const r = this.renderer;
    r.setPixelRatio(quality.pixelRatio);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = quality.shadows;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.setupComposer();
    this.resize();
  }

  private setupComposer() {
    const q = this.quality;
    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: q.antialias && q.tier === 'high' ? 4 : 0,
    });
    this.composer = new EffectComposer(this.renderer, target);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    if (q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.82);
      this.composer.addPass(this.bloom);
    }
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  /** Bloom tuning: strength (0..3), radius (0..1), threshold (linear luminance). */
  setBloom(strength: number, radius?: number, threshold?: number) {
    if (!this.bloom) return;
    this.bloom.strength = strength;
    if (radius !== undefined) this.bloom.radius = radius;
    if (threshold !== undefined) this.bloom.threshold = threshold;
  }

  get gradeUniforms() {
    return this.grade!.uniforms as unknown as typeof GradeShader.uniforms;
  }

  resize() {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer?.setPixelRatio(this.quality.pixelRatio);
    this.composer?.setSize(w, h);
    if (this.bloom) {
      const s = this.quality.bloomScale * this.quality.pixelRatio;
      this.bloom.setSize(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
    }
  }

  render(elapsed: number) {
    if (this.grade) this.gradeUniforms.uTime.value = elapsed;
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
