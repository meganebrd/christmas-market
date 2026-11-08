import * as THREE from 'three';
import { glowTexture } from '../world/textures';
import { createIconPointsMaterial, hot, starIconTexture } from './fx';
import { createGlassStar, type GlassStar } from './starMesh';
import { castByRole } from './stars';
import type { StoryRuntime } from './types';

/**
 * "Come here" cues: a soft column of light with rising motes and a floating glass star above Céleste
 * (until the first talk, and again when every star is found), and tiny star icons above the people
 * who know where a star is.
 */
export class Beacon {
  readonly group = new THREE.Group();
  private pillar: THREE.Mesh;
  private pillarMat: THREE.ShaderMaterial;
  private pool: THREE.Mesh;
  private marker: GlassStar;
  private k = 0;
  private target = 0;
  private moteT = 0;
  private moteColor = hot('#ffd98f', 2.2);
  private pos = new THREE.Vector3();
  // quest-giver icons
  private icons: THREE.Points;
  private iconPos: Float32Array;
  private iconColor: Float32Array;
  private iconSize: Float32Array;
  private iconFade: number[] = [];

  constructor(private story: StoryRuntime) {
    this.group.name = 'story-beacon';
    this.pillarMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uK: { value: 0 }, uColor: { value: hot('#ffd48a', 1.7) } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vEdge;
        void main() {
          vUv = uv;
          vec3 nv = normalize(normalMatrix * normal);
          vEdge = abs(nv.z);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime, uK;
        uniform vec3 uColor;
        varying vec2 vUv;
        varying float vEdge;
        void main() {
          float y = vUv.y;
          // starts above the guide's head (y≈0.1 of 16 m) so she is never washed out
          float a = pow(1.0 - y, 2.2) * smoothstep(0.1, 0.24, y);
          float flow = 0.7 + 0.3 * sin(y * 22.0 - uTime * 2.6);
          float edge = pow(vEdge, 1.6);
          gl_FragColor = vec4(uColor * flow, a * edge * uK * 0.42);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const H = 16;
    const geo = new THREE.CylinderGeometry(0.4, 0.5, H, 18, 1, true);
    geo.translate(0, H / 2, 0);
    this.pillar = new THREE.Mesh(geo, this.pillarMat);
    this.pillar.renderOrder = 9;
    this.pillar.frustumCulled = false;
    this.pool = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 3.4),
      new THREE.MeshBasicMaterial({ map: glowTexture(), color: hot('#ffcf80', 0.9), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.y = 0.04;
    this.marker = createGlassStar('#ffe3a3', { scale: 0.9, halo: 2 });
    this.group.add(this.pillar, this.pool, this.marker.group);
    this.group.visible = false;
    story.group.add(this.group);

    const n = 8;
    this.iconPos = new Float32Array(n * 3);
    this.iconColor = new Float32Array(n * 4);
    this.iconSize = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.iconPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.iconColor, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.iconSize, 1).setUsage(THREE.DynamicDrawUsage));
    this.icons = new THREE.Points(g, createIconPointsMaterial(starIconTexture()));
    this.icons.frustumCulled = false;
    this.icons.renderOrder = 14;
    this.icons.name = 'story-quest-icons';
    story.group.add(this.icons);
  }

  setOn(on: boolean) {
    this.target = on ? 1 : 0;
    if (on) this.group.visible = true;
  }

  /** Off immediately (cinematics). */
  hideNow() {
    this.target = 0;
    this.k = 0;
    this.group.visible = false;
  }

  get on() {
    return this.target > 0;
  }

  /** Where the guide stands (NPC, else the anchor, else in front of the tree). */
  guidePosition(out = new THREE.Vector3()): THREE.Vector3 {
    const { ctx, guide } = this.story;
    const npc = guide ? ctx.npcs?.get('cast:' + guide.id) : undefined;
    if (npc) return out.copy(npc.position).setY(0);
    const a = ctx.landmarks?.anchors?.get('plaza:guide') ?? ctx.landmarks?.anchors?.get('plaza:tree-front');
    if (a) return out.set(a.position.x, 0, a.position.z);
    return out.set(0, 0, ctx.layout.plaza.treeRadius + 2.6);
  }

  private guideHeight() {
    const { ctx, guide } = this.story;
    const npc = guide ? ctx.npcs?.get('cast:' + guide.id) : undefined;
    return npc?.rig?.height ?? 1.25;
  }

  update(dt: number, t: number) {
    const { ctx, sparks } = this.story;
    const cinematic = ctx.mode === 'cinematic' || ctx.mode === 'title' || ctx.mode === 'loading';
    const want = cinematic ? 0 : this.target;
    this.k += (want - this.k) * Math.min(1, dt * 2.2);
    if (this.k < 0.01 && want === 0) this.group.visible = false;
    else this.group.visible = true;
    if (this.group.visible) {
      this.guidePosition(this.pos);
      this.group.position.copy(this.pos);
      this.pillarMat.uniforms.uTime.value = t;
      this.pillarMat.uniforms.uK.value = this.k;
      (this.pool.material as THREE.MeshBasicMaterial).opacity = 0.55 * this.k * (0.85 + 0.15 * Math.sin(t * 2));
      const h = this.guideHeight();
      this.marker.group.position.set(0, h + 0.75 + Math.sin(t * 2.2) * 0.1, 0);
      this.marker.spin.rotation.y += dt * 1.4;
      this.marker.group.scale.setScalar(0.9 * Math.max(0.01, this.k));
      this.moteT -= dt;
      if (this.moteT <= 0 && this.k > 0.3) {
        this.moteT = 0.09;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.55;
        sparks.emit(this.pos.x + Math.cos(a) * r, 0.2 + Math.random() * 0.6, this.pos.z + Math.sin(a) * r, 0, 1.1 + Math.random() * 0.9, 0, {
          color: this.moteColor,
          life: 2.6 + Math.random(),
          size: 0.09 + Math.random() * 0.05,
          sizeEnd: 0.02,
          twinkle: true,
          fadeIn: 0.15,
        });
      }
    }
    this.updateIcons(dt, t, cinematic);
  }

  /** Star icons above the characters who hold a star (after meeting the guide). */
  private updateIcons(dt: number, t: number, cinematic: boolean) {
    const { ctx, plan } = this.story;
    const met = !!ctx.save.flag<boolean>('story:metGuide');
    let n = 0;
    for (const s of plan) {
      if (n >= 8) break;
      if (s.mode === 'hidden' || !s.role) continue;
      const member = castByRole(ctx, s.role);
      const npc = member ? ctx.npcs?.get('cast:' + member.id) : undefined;
      const i = n++;
      const show = met && !cinematic && !this.story.isFound(s.id) && !!npc && ctx.mode !== 'dialogue' && ctx.mode !== 'minigame';
      this.iconFade[i] = (this.iconFade[i] ?? 0) + ((show ? 1 : 0) - (this.iconFade[i] ?? 0)) * Math.min(1, dt * 3);
      const f = this.iconFade[i];
      if (npc) {
        const p = npc.position;
        this.iconPos[i * 3] = p.x;
        this.iconPos[i * 3 + 1] = p.y + (npc.rig?.height ?? 1.2) + 0.62 + Math.sin(t * 2.4 + i) * 0.07;
        this.iconPos[i * 3 + 2] = p.z;
      }
      this.iconColor[i * 4] = 1.6;
      this.iconColor[i * 4 + 1] = 1.5;
      this.iconColor[i * 4 + 2] = 1.3;
      this.iconColor[i * 4 + 3] = f;
      this.iconSize[i] = 0.55 * f * (0.92 + 0.08 * Math.sin(t * 3 + i));
    }
    const g = this.icons.geometry;
    g.setDrawRange(0, n);
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    this.icons.visible = n > 0;
  }
}
