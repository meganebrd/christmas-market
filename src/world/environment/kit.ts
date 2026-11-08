import * as THREE from 'three';
import type { GameContext } from '../../core/contracts';
import type { LightHandle } from '../../core/LightDirector';
import { GlowField, InstancedGlow } from './fx';
import { PineField } from './forest';
import { patchSkyFog } from './skyShared';

/**
 * Shared resources of the environment builders: materials, fake-light fields, the terrain height
 * function and a small occupancy map so props never overlap paths, zones or each other.
 */
export interface Circle {
  x: number;
  z: number;
  r: number;
}

export class Occupancy {
  private items: Circle[] = [];
  add(x: number, z: number, r: number) {
    this.items.push({ x, z, r });
  }
  free(x: number, z: number, r: number): boolean {
    for (const c of this.items) {
      const dx = x - c.x;
      const dz = z - c.z;
      const m = r + c.r;
      if (dx * dx + dz * dz < m * m) return false;
    }
    return true;
  }
}

export interface EnvKit {
  ctx: GameContext;
  root: THREE.Group;
  detail: number;
  shadows: boolean;
  /** Warm light colour of the theme (lamps, garlands). */
  warm: THREE.Color;
  /** Terrain height (0 inside the walkable circle). */
  heightAt: (x: number, z: number) => number;
  /** true if (x,z) is on a path / zone pad / chalet (with a margin): keep props off it. */
  blocked: (x: number, z: number, margin: number) => boolean;
  occupancy: Occupancy;
  mats: {
    /** Lambert, vertex colours, sky fog. The default for merged geometry. */
    lambert: THREE.MeshLambertMaterial;
    /** Unlit, vertex colours (values > 1 bloom), light fog. */
    glow: THREE.MeshBasicMaterial;
  };
  halos: GlowField;
  pools: GlowField;
  bulbs: InstancedGlow;
  glass: InstancedGlow;
  /** Pine placements from every builder (uploaded by the forest builder). */
  pines: PineField;
  /** Registers a light with the LightDirector (defensive). */
  light: (h: LightHandle) => void;
  /** Per-frame callbacks of the environment (one system for everything). */
  onUpdate: ((dt: number, t: number) => void)[];
}

export function createKit(ctx: GameContext, root: THREE.Group): Omit<EnvKit, 'heightAt' | 'blocked'> {
  const lambert = patchSkyFog(new THREE.MeshLambertMaterial({ vertexColors: true }));
  lambert.name = 'env:lambert';
  const glow = patchSkyFog(new THREE.MeshBasicMaterial({ vertexColors: true }), 0.45);
  glow.name = 'env:glow';
  const q = ctx.quality;
  return {
    ctx,
    root,
    detail: Math.max(0.3, Math.min(1, q.detail ?? 1)),
    shadows: !!q.shadows,
    warm: new THREE.Color(ctx.config?.theme?.lightColor ?? '#ffc56b'),
    occupancy: new Occupancy(),
    mats: { lambert, glow },
    halos: new GlowField('billboard'),
    pools: new GlowField('ground'),
    bulbs: new InstancedGlow(new THREE.IcosahedronGeometry(1, 0), 'env:bulbs', 0.05, 0.5),
    glass: new InstancedGlow(new THREE.BoxGeometry(1, 1, 1), 'env:lantern-glass', 0.07, 0.5),
    pines: new PineField(),
    light: (h) => {
      try {
        ctx.lights?.register(h);
      } catch (err) {
        console.warn('[givrelune] light registration failed', err);
      }
    },
    onUpdate: [],
  };
}

/** Adds a merged geometry as a mesh. */
export function addMerged(kit: EnvKit, geo: THREE.BufferGeometry | null, material: THREE.Material, name: string, opts: { cast?: boolean; receive?: boolean } = {}) {
  if (!geo) return null;
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  mesh.castShadow = !!opts.cast && kit.shadows;
  mesh.receiveShadow = !!opts.receive && kit.shadows;
  kit.root.add(mesh);
  return mesh;
}
