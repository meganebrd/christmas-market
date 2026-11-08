import * as THREE from 'three';
import type { StoryRuntime, PlannedStar } from './types';
import { createGlassStar, type GlassStar } from './starMesh';
import { PICKUP_LABEL } from './text';

/**
 * Hidden glass stars lying around the market: slow spin & bob, a soft halo, sparkles drifting up,
 * and every few seconds a lens-flare glint that catches the eye from afar.
 */
interface Pickup {
  star: PlannedStar;
  mesh: GlassStar;
  hit: THREE.Mesh;
  base: THREE.Vector3;
  phase: number;
  /** Hidden until its glint lands during the intro. */
  hidden: boolean;
  appear: number;
  sparkT: number;
  flareT: number;
  removeInteract: () => void;
}

export class Pickups {
  private items = new Map<string, Pickup>();
  private sparkColor = new THREE.Color();
  private tmp = new THREE.Vector3();

  constructor(private story: StoryRuntime) {}

  /** Creates the pick-ups for every hidden star not found yet. */
  spawnAll() {
    for (const s of this.story.plan) if (s.mode === 'hidden' && s.pickup && !this.story.isFound(s.id)) this.spawn(s);
  }

  has(id: string) {
    return this.items.has(id);
  }

  position(id: string): THREE.Vector3 | null {
    const p = this.items.get(id);
    return p ? p.mesh.group.getWorldPosition(new THREE.Vector3()) : null;
  }

  private spawn(star: PlannedStar) {
    const { ctx, group } = this.story;
    const mesh = createGlassStar(star.tint, { scale: 1.15, halo: 1.9, flare: true });
    const onIce = ctx.layout.surfaceAt(star.pickup!.x, star.pickup!.z) === 'ice';
    const base = star.pickup!.clone().setY(onIce ? 0.62 : 0.85);
    mesh.group.position.copy(base);
    mesh.group.name = `story-star-${star.id}`;
    group.add(mesh.group);
    // generous invisible hit sphere for clicks / taps
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.75, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    mesh.group.add(hit);
    const removeInteract = ctx.interactables.add({
      id: `story:star:${star.id}`,
      position: new THREE.Vector3(base.x, 0, base.z),
      radius: 1.9,
      label: PICKUP_LABEL,
      priority: 6,
      promptHeight: 1.75,
      objects: [hit],
      enabled: () => !this.items.get(star.id)?.hidden,
      onInteract: () => this.pick(star.id),
    });
    this.items.set(star.id, { star, mesh, hit, base, phase: Math.random() * 6, hidden: false, appear: 1, sparkT: 0, flareT: 1 + Math.random() * 2, removeInteract });
  }

  /** Intro: the stars are still on the tree. */
  hideAll() {
    for (const p of this.items.values()) {
      p.hidden = true;
      p.appear = 0;
      p.mesh.group.visible = false;
    }
  }

  /** Its glint has landed: the star fades in where it fell. */
  reveal(id: string) {
    const p = this.items.get(id);
    if (!p || !p.hidden) return;
    p.hidden = false;
    p.mesh.group.visible = true;
  }

  revealAll() {
    for (const id of this.items.keys()) this.reveal(id);
  }

  /** The visitor picks it up. */
  pick(id: string) {
    const p = this.items.get(id);
    if (!p) return;
    const from = p.mesh.group.getWorldPosition(new THREE.Vector3());
    this.remove(id);
    this.story.grant(p.star.id, from);
  }

  remove(id: string) {
    const p = this.items.get(id);
    if (!p) return;
    p.removeInteract();
    (p.hit.geometry as THREE.BufferGeometry).dispose();
    p.mesh.dispose();
    this.items.delete(id);
  }

  update(dt: number, t: number) {
    const sparks = this.story.sparks;
    const cam = this.story.ctx.camera.position;
    for (const p of this.items.values()) {
      if (p.hidden) continue;
      const g = p.mesh.group;
      if (p.appear < 1) {
        p.appear = Math.min(1, p.appear + dt * 1.6);
        g.scale.setScalar(1.15 * (1 - Math.pow(1 - p.appear, 3)));
      }
      g.position.set(p.base.x, p.base.y + Math.sin(t * 1.4 + p.phase) * 0.12, p.base.z);
      p.mesh.spin.rotation.order = 'YXZ';
      p.mesh.spin.rotation.y = Math.sin(t * 0.55 + p.phase) * 1.1;
      p.mesh.spin.rotation.x = -0.28;
      p.mesh.spin.rotation.z = Math.sin(t * 0.8 + p.phase) * 0.12;
      // halo breathing
      (p.mesh.halo.material as THREE.SpriteMaterial).opacity = 0.55 + 0.2 * Math.sin(t * 2 + p.phase);
      // glint: a quick 4-point flare every few seconds, bigger when far (so it reads from afar)
      p.flareT -= dt;
      const dist = this.tmp.copy(g.position).distanceTo(cam);
      const far = THREE.MathUtils.clamp(dist / 14, 1, 3.2);
      if (p.flareT < 0) {
        const k = -p.flareT / 0.6; // 0..1 during the glint
        const s = Math.sin(Math.min(1, k) * Math.PI);
        p.mesh.flare.scale.setScalar(0.01 + s * 1.6 * far);
        p.mesh.flare.material.rotation = k * 0.8;
        if (k >= 1) p.flareT = 2.2 + Math.random() * 2.2;
      } else p.mesh.flare.scale.setScalar(0.01);
      // sparkles drifting up
      p.sparkT -= dt;
      if (p.sparkT <= 0 && dist < 60) {
        p.sparkT = 0.12 + Math.random() * 0.12;
        this.sparkColor.set(p.star.tint).lerp(new THREE.Color('#ffffff'), 0.5).multiplyScalar(2.2);
        const a = Math.random() * Math.PI * 2;
        const r = 0.25 + Math.random() * 0.45;
        sparks.emit(g.position.x + Math.cos(a) * r, g.position.y - 0.2 + Math.random() * 0.4, g.position.z + Math.sin(a) * r, 0, 0.35 + Math.random() * 0.3, 0, {
          color: this.sparkColor,
          life: 1.1 + Math.random() * 0.6,
          size: 0.07 + Math.random() * 0.06,
          sizeEnd: 0.01,
          twinkle: true,
          fadeIn: 0.2,
        });
      }
    }
  }
}
