/**
 * 2D collision world on the XZ plane: circles and oriented boxes. Characters are circles.
 * Builders register what they place (chalets, tree, fences…); the player and NPCs call `resolve`.
 */
export type ColliderTag = 'solid' | 'chalet' | 'tree' | 'prop' | 'water' | 'fence';

interface Circle {
  id: number;
  kind: 'circle';
  x: number;
  z: number;
  r: number;
  tag: ColliderTag;
}
interface Box {
  id: number;
  kind: 'box';
  x: number;
  z: number;
  hw: number;
  hd: number;
  cos: number;
  sin: number;
  tag: ColliderTag;
}
type Shape = Circle | Box;

const CELL = 8;

export class Colliders {
  private shapes = new Map<number, Shape>();
  private grid = new Map<string, Set<number>>();
  private nextId = 1;
  /** Visitors stay inside this circle (from the layout). */
  boundaryRadius = Infinity;

  addCircle(x: number, z: number, r: number, tag: ColliderTag = 'solid'): number {
    const id = this.nextId++;
    this.insert({ id, kind: 'circle', x, z, r, tag }, r);
    return id;
  }

  /** Box centred on (x,z), half extents along its local X (hw) and Z (hd), rotated by yaw (same convention as Object3D.rotation.y). */
  addBox(x: number, z: number, hw: number, hd: number, yaw = 0, tag: ColliderTag = 'solid'): number {
    const id = this.nextId++;
    this.insert({ id, kind: 'box', x, z, hw, hd, cos: Math.cos(yaw), sin: Math.sin(yaw), tag }, Math.hypot(hw, hd));
    return id;
  }

  remove(id: number) {
    this.shapes.delete(id);
    for (const set of this.grid.values()) set.delete(id);
  }

  private insert(s: Shape, extent: number) {
    this.shapes.set(s.id, s);
    const x0 = Math.floor((s.x - extent) / CELL);
    const x1 = Math.floor((s.x + extent) / CELL);
    const z0 = Math.floor((s.z - extent) / CELL);
    const z1 = Math.floor((s.z + extent) / CELL);
    for (let gx = x0; gx <= x1; gx++)
      for (let gz = z0; gz <= z1; gz++) {
        const k = gx + ',' + gz;
        let set = this.grid.get(k);
        if (!set) this.grid.set(k, (set = new Set()));
        set.add(s.id);
      }
  }

  private nearby(x: number, z: number, r: number): Shape[] {
    const out = new Set<Shape>();
    const x0 = Math.floor((x - r) / CELL);
    const x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL);
    const z1 = Math.floor((z + r) / CELL);
    for (let gx = x0; gx <= x1; gx++)
      for (let gz = z0; gz <= z1; gz++) {
        const set = this.grid.get(gx + ',' + gz);
        if (set) for (const id of set) out.add(this.shapes.get(id)!);
      }
    return [...out];
  }

  /** Pushes the point (mutates `pos.x`/`pos.z`) out of every shape. Returns true if a collision happened. */
  resolve(pos: { x: number; z: number }, radius: number): boolean {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const s of this.nearby(pos.x, pos.z, radius + 1)) {
        if (s.kind === 'circle') {
          const dx = pos.x - s.x;
          const dz = pos.z - s.z;
          const d = Math.hypot(dx, dz);
          const min = s.r + radius;
          if (d < min) {
            const nx = d > 1e-5 ? dx / d : 1;
            const nz = d > 1e-5 ? dz / d : 0;
            pos.x = s.x + nx * min;
            pos.z = s.z + nz * min;
            moved = hit = true;
          }
        } else {
          // to box local space (inverse of rotation.y)
          const dx = pos.x - s.x;
          const dz = pos.z - s.z;
          const lx = dx * s.cos - dz * s.sin;
          const lz = dx * s.sin + dz * s.cos;
          const cx = Math.max(-s.hw, Math.min(s.hw, lx));
          const cz = Math.max(-s.hd, Math.min(s.hd, lz));
          let ox = lx - cx;
          let oz = lz - cz;
          let d = Math.hypot(ox, oz);
          if (d < radius) {
            let nlx: number, nlz: number;
            if (d < 1e-5) {
              // inside: push out along the smallest penetration axis
              const px = s.hw - Math.abs(lx);
              const pz = s.hd - Math.abs(lz);
              if (px < pz) {
                nlx = (Math.sign(lx) || 1) * (s.hw + radius);
                nlz = lz;
              } else {
                nlx = lx;
                nlz = (Math.sign(lz) || 1) * (s.hd + radius);
              }
            } else {
              nlx = cx + (ox / d) * radius;
              nlz = cz + (oz / d) * radius;
            }
            // back to world
            pos.x = s.x + nlx * s.cos + nlz * s.sin;
            pos.z = s.z - nlx * s.sin + nlz * s.cos;
            moved = hit = true;
          }
        }
      }
      if (!moved) break;
    }
    const r = Math.hypot(pos.x, pos.z);
    if (r > this.boundaryRadius - radius) {
      const k = (this.boundaryRadius - radius) / r;
      pos.x *= k;
      pos.z *= k;
      hit = true;
    }
    return hit;
  }

  /** True if a circle at (x,z) would overlap something. */
  blocked(x: number, z: number, radius: number): boolean {
    const p = { x, z };
    return this.resolve(p, radius) && Math.hypot(p.x - x, p.z - z) > 1e-3;
  }

  count() {
    return this.shapes.size;
  }
}
