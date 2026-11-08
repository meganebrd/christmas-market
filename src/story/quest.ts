import * as THREE from 'three';
import type { QuestState } from '../core/contracts';
import type { PlannedStar, StarId, StoryRuntime } from './types';
import { createGlassStar, type GlassStar } from './starMesh';
import type { TreeStars } from './treeStars';
import type { Pickups } from './pickups';
import { starToast } from './text';

/**
 * Quest progress (saved in `ctx.save.data.stars`) and the little ceremony of each star:
 * it rises above the visitor, hovers, then flies in a long arc with a sparkling trail to its
 * branch on the Grand Sapin, which brightens a bit more.
 */
interface Flight {
  star: PlannedStar;
  slot: number;
  socket: THREE.Vector3;
  mesh: GlassStar;
  phase: 'rise' | 'hover' | 'fly';
  t: number;
  from: THREE.Vector3;
  hover: THREE.Vector3;
  ctrl: THREE.Vector3;
  dur: number;
  last: THREE.Vector3;
  color: THREE.Color;
  appear: boolean;
}

export class Quest {
  readonly found = new Set<StarId>();
  /** Found stars in the order they were found (= their socket slot on the tree). */
  readonly order: StarId[] = [];
  private flights: Flight[] = [];
  private landed = new Set<StarId>();
  private tmp = new THREE.Vector3();
  private trailColor = new THREE.Color();

  constructor(private story: StoryRuntime, private tree: TreeStars, private pickups: Pickups) {
    const ids = new Set(story.plan.map((s) => s.id));
    for (const id of story.ctx.save.data.stars ?? []) {
      if (!ids.has(id as StarId) || this.found.has(id as StarId)) continue;
      this.found.add(id as StarId);
      this.order.push(id as StarId);
      this.landed.add(id as StarId);
    }
    this.restoreTree();
  }

  private tint(id: StarId) {
    return this.story.plan.find((s) => s.id === id)?.tint ?? '#ffffff';
  }

  /** Show the landed stars in their slots (after the intro played with all seven on the tree). */
  restoreTree() {
    this.tree.fill(this.order.map((id) => (this.landed.has(id) ? this.tint(id) : null)));
  }

  get total() {
    return this.story.plan.length;
  }

  complete() {
    return this.total > 0 && this.found.size >= this.total;
  }

  /** Tree light level from stars that have landed. */
  treeLevel() {
    if (!this.total) return 1;
    return Math.min(1, this.landed.size / this.total);
  }

  state(objective: string): QuestState {
    return {
      found: this.found.size,
      total: this.total,
      ids: this.story.plan.filter((s) => this.found.has(s.id)).map((s) => s.id),
      objective,
      complete: this.complete(),
    };
  }

  grant(id: StarId, from?: THREE.Vector3) {
    const { ctx } = this.story;
    const star = this.story.plan.find((s) => s.id === id);
    if (!star) {
      console.warn(`[givrelune] unknown glass star "${id}"`);
      return;
    }
    if (this.found.has(id)) return;
    let origin = from;
    if (!origin && this.pickups.has(id)) {
      origin = this.pickups.position(id) ?? undefined;
      this.pickups.remove(id);
    } else if (this.pickups.has(id)) this.pickups.remove(id);
    this.found.add(id);
    this.order.push(id);
    ctx.save.update((d) => {
      if (!d.stars.includes(id)) d.stars.push(id);
    });
    try {
      ctx.audio.sfx('star-collect');
      ctx.player.rig.emote('happy');
    } catch {
      /* ignore */
    }
    this.launch(star, this.order.length - 1, origin);
    const n = this.found.size;
    this.story.refreshQuest();
    ctx.ui.toast(starToast(n, this.total), { icon: '⭐', duration: 4200 });
    ctx.events.emit('star:collected', { id, count: n, total: this.total });
    if (this.complete()) {
      ctx.events.emit('quest:complete');
      this.story.setBeacon(true);
    }
  }

  private launch(star: PlannedStar, slot: number, from?: THREE.Vector3) {
    const { ctx, group } = this.story;
    const player = ctx.player.position;
    const headY = (ctx.player.rig?.height ?? 1.2) + 0.5;
    const appear = !from;
    const start = from?.clone() ?? new THREE.Vector3(player.x, headY, player.z);
    const hover = new THREE.Vector3(player.x, headY + 1.3, player.z);
    if (from && from.distanceTo(hover) > 6) hover.copy(from).setY(from.y + 1.6);
    const mesh = createGlassStar(star.tint, { scale: appear ? 0.01 : 1.15, halo: 2.4 });
    mesh.group.position.copy(start);
    group.add(mesh.group);
    const socket = (this.tree.sockets[slot] ?? this.tree.sockets[this.tree.sockets.length - 1] ?? new THREE.Vector3(0, 8, 2)).clone();
    const dist = hover.distanceTo(socket);
    const mid = new THREE.Vector3().addVectors(hover, socket).multiplyScalar(0.5);
    const ctrl = mid.setY(Math.max(hover.y, socket.y) + 4 + dist * 0.3);
    this.flights.push({
      star,
      slot,
      socket,
      mesh,
      phase: 'rise',
      t: 0,
      from: start,
      hover,
      ctrl,
      dur: THREE.MathUtils.clamp(dist / 15, 1.6, 3.4),
      last: start.clone(),
      color: new THREE.Color(star.tint).lerp(new THREE.Color('#fff3d6'), 0.45).multiplyScalar(2.6),
      appear,
    });
  }

  private land(f: Flight) {
    const { ctx, sparks } = this.story;
    this.landed.add(f.star.id);
    this.tree.set(f.slot, f.star.tint);
    this.tree.pop(f.slot);
    sparks.burst(f.socket, 46, f.color, { speed: 3.4, life: 1.2, size: 0.2 });
    try {
      ctx.audio.sfx('chime', { position: f.socket, volume: 0.9 });
      ctx.landmarks.setTreeLight(this.treeLevel());
    } catch {
      /* ignore */
    }
  }

  update(dt: number, t: number) {
    const sparks = this.story.sparks;
    for (let k = this.flights.length - 1; k >= 0; k--) {
      const f = this.flights[k];
      const g = f.mesh.group;
      f.t += dt;
      f.mesh.spin.rotation.y += dt * (f.phase === 'fly' ? 9 : 5);
      if (f.phase === 'rise') {
        const x = Math.min(1, f.t / 0.85);
        const e = 1 - Math.pow(1 - x, 3);
        g.position.lerpVectors(f.from, f.hover, e);
        if (f.appear) g.scale.setScalar(Math.max(0.01, 1.15 * Math.min(1, x * 1.6)));
        if (x >= 1) {
          f.phase = 'hover';
          f.t = 0;
          sparks.burst(g.position, 26, f.color, { speed: 2.2, life: 0.8 });
          try {
            this.story.ctx.audio.sfx('magic', { volume: 0.5, pitch: 1.3 });
          } catch {
            /* ignore */
          }
        }
      } else if (f.phase === 'hover') {
        g.position.copy(f.hover).setY(f.hover.y + Math.sin(f.t * 5) * 0.06);
        if (f.t >= 0.75) {
          f.phase = 'fly';
          f.t = 0;
          try {
            this.story.ctx.audio.sfx('whoosh', { volume: 0.45, pitch: 1.4 });
          } catch {
            /* ignore */
          }
        }
      } else {
        const x = Math.min(1, f.t / f.dur);
        const e = x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
        // quadratic Bézier hover → ctrl → socket
        const a = (1 - e) * (1 - e);
        const b = 2 * (1 - e) * e;
        const c = e * e;
        g.position.set(
          a * f.hover.x + b * f.ctrl.x + c * f.socket.x,
          a * f.hover.y + b * f.ctrl.y + c * f.socket.y,
          a * f.hover.z + b * f.ctrl.z + c * f.socket.z,
        );
        g.scale.setScalar(1.15 - 0.25 * e);
        // sparkling trail, evenly spaced
        const seg = this.tmp.subVectors(g.position, f.last);
        const len = seg.length();
        const steps = Math.min(8, Math.ceil(len / 0.14));
        for (let s = 1; s <= steps; s++) {
          const u = s / steps;
          this.trailColor.copy(f.color).multiplyScalar(0.7 + Math.random() * 0.5);
          sparks.emit(
            f.last.x + seg.x * u + (Math.random() - 0.5) * 0.12,
            f.last.y + seg.y * u + (Math.random() - 0.5) * 0.12,
            f.last.z + seg.z * u + (Math.random() - 0.5) * 0.12,
            (Math.random() - 0.5) * 0.4,
            -0.25 - Math.random() * 0.3,
            (Math.random() - 0.5) * 0.4,
            { color: this.trailColor, life: 0.55 + Math.random() * 0.45, size: 0.17, sizeEnd: 0.01, drag: 1.5, twinkle: true, hot: true },
          );
        }
        f.last.copy(g.position);
        if (x >= 1) {
          this.land(f);
          f.mesh.dispose();
          this.flights.splice(k, 1);
        }
      }
    }
  }

  get flying() {
    return this.flights.length;
  }
}
