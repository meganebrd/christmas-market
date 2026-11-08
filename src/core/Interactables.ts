import * as THREE from 'three';

/**
 * Things the visitor can interact with: talk to a keeper, look at a stall, start a mini-game, pick up a star…
 * The core focuses the best candidate near the player (prefers what is in front), shows the prompt,
 * and triggers it on "interact" (E / Space / tap the action button) or when the visitor clicks its object.
 */
export interface Interactable {
  id: string;
  /** World position (read every frame: you may mutate it, e.g. for a moving NPC). */
  position: THREE.Vector3;
  /** Activation radius around `position` (default 2.2). */
  radius?: number;
  /** "Parler à Margot", "Voir la vitrine"… */
  label: string;
  /** Higher wins when several are in range (default 0). */
  priority?: number;
  /** Height of the prompt bubble above `position` (default 2). */
  promptHeight?: number;
  enabled?: () => boolean;
  /** Meshes that can be clicked/tapped to trigger it (player walks there first if far). */
  objects?: THREE.Object3D[];
  onInteract: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

export class Interactables {
  private items = new Map<string, Interactable>();
  focused: Interactable | null = null;
  private raycaster = new THREE.Raycaster();
  private tmp = new THREE.Vector3();

  add(item: Interactable): () => void {
    this.items.set(item.id, item);
    return () => this.remove(item.id);
  }

  remove(id: string) {
    const it = this.items.get(id);
    if (it && this.focused === it) {
      it.onBlur?.();
      this.focused = null;
    }
    this.items.delete(id);
  }

  get(id: string) {
    return this.items.get(id);
  }

  all() {
    return [...this.items.values()];
  }

  /** Picks the best candidate for the player. */
  updateFocus(playerPos: THREE.Vector3, playerYaw: number): Interactable | null {
    const fx = Math.sin(playerYaw);
    const fz = Math.cos(playerYaw);
    let best: Interactable | null = null;
    let bestScore = -Infinity;
    for (const it of this.items.values()) {
      if (it.enabled && !it.enabled()) continue;
      const dx = it.position.x - playerPos.x;
      const dz = it.position.z - playerPos.z;
      const d = Math.hypot(dx, dz);
      const r = it.radius ?? 2.2;
      if (d > r) continue;
      const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1; // -1..1
      const score = (it.priority ?? 0) * 10 - d + facing * 0.9;
      if (score > bestScore) {
        bestScore = score;
        best = it;
      }
    }
    if (best !== this.focused) {
      this.focused?.onBlur?.();
      this.focused = best;
      best?.onFocus?.();
    }
    return best;
  }

  clearFocus() {
    this.focused?.onBlur?.();
    this.focused = null;
  }

  /** Interactable whose objects are under the pointer. */
  pick(ndcX: number, ndcY: number, camera: THREE.Camera): Interactable | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    let best: { it: Interactable; d: number } | null = null;
    for (const it of this.items.values()) {
      if (!it.objects?.length) continue;
      if (it.enabled && !it.enabled()) continue;
      const hits = this.raycaster.intersectObjects(it.objects, true);
      if (hits.length && (!best || hits[0].distance < best.d)) best = { it, d: hits[0].distance };
    }
    return best?.it ?? null;
  }

  /** Point in front of the interactable where the player should stand to use it. */
  approachPoint(it: Interactable, from: THREE.Vector3): THREE.Vector3 {
    // click-only items (radius 0, e.g. products on a counter) are approached from a comfortable distance
    const r = (it.radius ?? 2.2) > 0 ? Math.max(0.6, (it.radius ?? 2.2) * 0.55) : 1.7;
    this.tmp.set(from.x - it.position.x, 0, from.z - it.position.z);
    if (this.tmp.lengthSq() < 1e-4) this.tmp.set(0, 0, 1);
    this.tmp.normalize().multiplyScalar(r);
    return new THREE.Vector3(it.position.x + this.tmp.x, 0, it.position.z + this.tmp.z);
  }
}
