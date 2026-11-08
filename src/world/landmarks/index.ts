import * as THREE from 'three';
import type { GameContext, LandmarksApi } from '../../core/contracts';
import type { ZoneId } from '../../config/types';
import { fxTime, refreshDuskEnv } from './fx';
import { Frame, type Anchors } from './kit';
import { buildTree } from './tree';
import { buildArch } from './arch';
import { buildBar } from './bar';
import { buildFood } from './food';
import { buildWorkshop } from './workshop';
import { buildCarousel } from './carousel';
import { buildFair } from './fair';
import { buildRink } from './rink';
import { buildBelvedere } from './belvedere';

/**
 * The memorable places of Givrelune: the Grand Sapin, the entrance arch and one landmark per fun zone.
 * Each landmark is built in its zone's local frame (local +Z faces the plaza) and is isolated in a
 * try/catch, so one failing builder never takes the market down.
 */

export interface LandmarkUpdate {
  (dt: number, t: number): void;
}

export interface LandmarkEnv {
  ctx: GameContext;
  anchors: Anchors;
  /** Ask for one of the (few) real point lights. */
  takePointLight(): boolean;
}

type Builder = (env: LandmarkEnv, frame: Frame) => LandmarkUpdate | void;

const BUILDERS: Partial<Record<ZoneId, Builder>> = {
  gate: buildArch,
  bar: buildBar,
  food: buildFood,
  workshop: buildWorkshop,
  carousel: buildCarousel,
  fair: buildFair,
  rink: buildRink,
  belvedere: buildBelvedere,
};

export function frameFor(ctx: GameContext, anchors: Anchors, id: ZoneId): Frame {
  const z = ctx.layout.zones[id];
  // local +Z points from the zone centre toward the plaza centre (the avenue);
  // the gate arch faces outward (south), where visitors arrive.
  const yaw = id === 'gate' ? Math.atan2(z.center.x, z.center.z) : Math.atan2(-z.center.x, -z.center.z);
  return new Frame(ctx, anchors, z.center.x, z.center.z, yaw, 'landmark-' + id);
}

export function buildLandmarks(ctx: GameContext): LandmarksApi {
  const anchors: Anchors = new Map();
  const updates: LandmarkUpdate[] = [];
  let points = Math.min(3, Math.max(0, ctx.quality.maxPointLights - 1));
  const env: LandmarkEnv = {
    ctx,
    anchors,
    takePointLight: () => (points > 0 ? (points--, true) : false),
  };

  // the tree's collider first: it must exist even if the builder fails
  ctx.colliders.addCircle(0, 0, ctx.layout.plaza.treeRadius, 'tree');
  let tree: ReturnType<typeof buildTree> | null = null;
  try {
    tree = buildTree(ctx, anchors, env.takePointLight());
    updates.push(tree.update);
  } catch (err) {
    console.error('[landmarks] Grand Sapin failed', err);
  }

  for (const [id, b] of Object.entries(BUILDERS) as [ZoneId, Builder][]) {
    const zone = ctx.layout.zones[id];
    if (!zone || (!zone.enabled && id !== 'gate')) continue;
    try {
      const frame = frameFor(ctx, anchors, id);
      const u = b(env, frame);
      if (u) updates.push(u);
    } catch (err) {
      console.error(`[landmarks] ${id} failed`, err);
    }
  }

  // the GPU dropped and gave back the WebGL context: the reflections must be rendered again
  ctx.events.on('render:restored', () => refreshDuskEnv(ctx.renderer, ctx.scene));

  ctx.addSystem((dt, t) => {
    fxTime.value = t;
    for (let i = updates.length - 1; i >= 0; i--) {
      try {
        updates[i](dt, t);
      } catch (err) {
        console.error('[landmarks] animation failed (removed)', err);
        updates.splice(i, 1);
      }
    }
  });

  return {
    setTreeLight: (p: number) => tree?.setLight(p),
    treeTop: tree?.treeTop ?? new THREE.Vector3(0, 14, 0),
    starSockets: tree?.starSockets.map((p) => p.clone()),
    anchors,
  };
}
