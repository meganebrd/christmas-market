import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { MSAA_MAX_PIXEL_RATIO, renderPixelRatio, type QualityProfile } from './quality';
import { FrameGovernor } from './FrameGovernor';

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

/** Render levels the adaptive resolution walks through (0 = full quality). */
const LEVELS: { scale: number; msaa: boolean }[] = [
  { scale: 1, msaa: true },
  { scale: 1, msaa: false },
  { scale: 0.85, msaa: false },
  { scale: 0.72, msaa: false },
];
/** Level forced after the GPU dropped the context: no MSAA, fewer pixels. */
const SAFE_LEVEL = 2;

export interface RenderPipelineOptions {
  /** Adapt the resolution to the frame rate (fed by `adapt()`). Default true. */
  adaptive?: boolean;
}

export class RenderPipeline {
  readonly renderer: THREE.WebGLRenderer;
  composer: EffectComposer | null = null;
  bloom: UnrealBloomPass | null = null;
  grade: ShaderPass | null = null;
  /** True between `webglcontextlost` and `webglcontextrestored`: nothing can be drawn. */
  contextLost = false;
  /** How many times the browser dropped the WebGL context this session. */
  contextLosses = 0;
  onContextLost: (() => void) | null = null;
  onContextRestored: (() => void) | null = null;
  readonly governor: FrameGovernor | null;
  private renderPass: RenderPass | null = null;
  /** The composer target the scene is drawn into (the only one that may be multisampled). */
  private sceneTarget: THREE.WebGLRenderTarget | null = null;
  private width = 1;
  private height = 1;
  private pr = 1;
  private samples = 0;
  private dprQuery: MediaQueryList | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private quality: QualityProfile,
    opts: RenderPipelineOptions = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      // the scene is drawn into the composer's target: an antialiased canvas would only cost memory
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
      preserveDrawingBuffer: new URLSearchParams(location.search).has('capture'),
    });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = quality.shadows;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.governor = opts.adaptive === false ? null : new FrameGovernor({ levels: LEVELS.length });
    // three.js listens first (it rebuilds its GL state on restore), then us
    canvas.addEventListener('webglcontextlost', this.handleLost, false);
    canvas.addEventListener('webglcontextrestored', this.handleRestored, false);
    this.watchPixelRatio();
    this.setupComposer();
    this.resize();
  }

  /** Pixel ratio currently rendered (after the tier cap, pixel budget and adaptive scale). */
  get pixelRatio() {
    return this.pr;
  }

  get msaaSamples() {
    return this.samples;
  }

  get renderLevel() {
    return this.governor?.level ?? 0;
  }

  /**
   * Feed the adaptive resolution with the last frame (call once per frame from the game loop).
   * @param frameMs time since the previous frame
   * @param cpuMs   time the frame's JavaScript took
   */
  adapt(frameMs: number, cpuMs: number) {
    if (!this.governor || this.contextLost) return;
    if (this.governor.frame(frameMs, cpuMs, performance.now()) !== null) this.resize();
  }

  private handleLost = (e: Event) => {
    e.preventDefault(); // tells the browser we want the context back
    this.contextLost = true;
    this.contextLosses++;
    console.warn('[givrelune] the GPU dropped the WebGL context — waiting for it to come back');
    this.onContextLost?.();
  };

  private handleRestored = () => {
    this.contextLost = false;
    // the GPU gave up once: lighter frames from now on so it does not happen again
    this.governor?.atLeast(SAFE_LEVEL, performance.now());
    this.resize();
    this.onContextRestored?.();
  };

  /** Moving the window to another screen (Retina ↔ external display) changes devicePixelRatio. */
  private watchPixelRatio() {
    if (typeof matchMedia !== 'function') return;
    this.dprQuery?.removeEventListener('change', this.onPixelRatioChange);
    this.dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    this.dprQuery.addEventListener('change', this.onPixelRatioChange);
  }

  private onPixelRatioChange = () => {
    this.resize();
    this.watchPixelRatio();
  };

  private setupComposer() {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 0 });
    this.composer = new EffectComposer(this.renderer, target);
    // RenderPass draws into the read buffer: that one gets the MSAA samples, the other never needs them
    this.sceneTarget = this.composer.readBuffer;
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    if (this.quality.bloom) {
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
    const q = this.quality;
    const level = LEVELS[this.governor?.level ?? 0];
    const pr = renderPixelRatio(q, w, h, window.devicePixelRatio || 1, level.scale);
    const samples = level.msaa && q.msaa > 0 && pr < MSAA_MAX_PIXEL_RATIO ? q.msaa : 0;
    this.pr = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.sceneTarget && this.sceneTarget.samples !== samples) {
      this.sceneTarget.samples = samples;
      this.sceneTarget.dispose(); // re-allocated with the new sample count on next use
    }
    this.samples = samples;
    this.composer?.setPixelRatio(pr);
    this.composer?.setSize(w, h);
    if (this.bloom) {
      const s = q.bloomScale * pr;
      this.bloom.setSize(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
    }
  }

  render(elapsed: number) {
    if (this.contextLost) return;
    if (this.grade) this.gradeUniforms.uTime.value = elapsed;
    if (this.composer) {
      // passes swap buffers: make sure the scene still lands in the multisampled target
      if (this.sceneTarget && this.composer.readBuffer !== this.sceneTarget) this.composer.swapBuffers();
      this.composer.render();
    } else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('webglcontextlost', this.handleLost, false);
    canvas.removeEventListener('webglcontextrestored', this.handleRestored, false);
    this.dprQuery?.removeEventListener('change', this.onPixelRatioChange);
    this.composer?.dispose();
    this.renderer.dispose();
  }
}
