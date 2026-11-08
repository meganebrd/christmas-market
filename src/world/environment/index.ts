import * as THREE from 'three';
import type { GameContext } from '../../core/contracts';
import type { Layout, PathShape } from '../layout';
import { createKit, type EnvKit } from './kit';
import { applySkyTheme, skyColorJS, type TimeOfDay } from './skyShared';
import { buildSky } from './sky';
import { buildLighting } from './lighting';
import { buildTerrain, createHeightFn } from './terrain';
import { buildVillage } from './village';
import { buildForest } from './forest';
import { buildMountains } from './mountains';
import { buildLamps } from './lamps';
import { buildGarlands } from './garlands';
import { buildProps } from './props';
import { buildEdge } from './edge';
import { buildSnowfall } from './snowfall';

/**
 * Givrelune's environment: sky, light, ground, village, forest, mountains, street furniture,
 * garlands, props, the edge of the world and the falling snow. Everything static is merged or
 * instanced; every lamp, window and garland registers with the LightDirector for the intro wave.
 */
export function buildEnvironment(ctx: GameContext): void {
  const theme = ctx.config?.theme;
  // `?tod=night|dusk` overrides the theme (handy to preview both moods)
  const forced = ctx.flags?.get('tod');
  const tod: TimeOfDay = (forced ?? theme?.timeOfDay) === 'night' ? 'night' : 'dusk';
  const skyTheme = applySkyTheme(tod);

  const root = new THREE.Group();
  root.name = 'environment';
  ctx.scene.add(root);

  const base = createKit(ctx, root);
  const layout = ctx.layout;
  const kit: EnvKit = {
    ...base,
    heightAt: createHeightFn(),
    blocked: makeBlocked(layout),
  };

  // fog & background: the haze colour of the horizon, so far things melt into the sky
  const fogColor = skyColorJS(new THREE.Vector3(0, 0.03, -1).normalize()).lerp(skyColorJS(new THREE.Vector3(1, 0.03, 0).normalize()), 0.5);
  ctx.scene.fog = new THREE.FogExp2(fogColor.getHex(), skyTheme.fogDensity);
  ctx.scene.background = new THREE.Color(tod === 'night' ? '#050a1e' : '#0d1538');

  const debug = ctx.flags?.has('debug');
  const timings: string[] = [];
  const t0 = performance.now();
  const step = (label: string, fn: () => void) => {
    const t = performance.now();
    try {
      fn();
    } catch (err) {
      console.error(`[givrelune] environment: ${label} failed`, err);
    }
    if (debug) timings.push(`${label} ${Math.round(performance.now() - t)}ms`);
  };

  step('sky', () => buildSky(kit, tod, theme?.aurora !== false));
  step('lighting', () => buildLighting(kit, tod));
  step('terrain', () => buildTerrain(kit, layout));
  step('mountains', () => buildMountains(kit));
  step('village', () => buildVillage(kit, layout));
  step('lamps', () => buildLamps(kit, layout));
  step('garlands', () => buildGarlands(kit, layout));
  step('props', () => buildProps(kit, layout));
  step('edge', () => buildEdge(kit, layout));
  step('forest', () => buildForest(kit, layout));
  step('pines', () => kit.pines.finalize(kit));
  step('snowfall', () => buildSnowfall(kit, Math.max(0, theme?.snow ?? 1)));

  // fake-light fields are filled by the builders above: upload them once
  step('lights', () => {
    for (const f of [kit.halos, kit.pools]) {
      f.finalize();
      root.add(f.mesh);
    }
    for (const f of [kit.bulbs, kit.glass]) {
      const m = f.finalize();
      if (m) root.add(m);
    }
  });

  if (debug) console.info(`[env] built in ${Math.round(performance.now() - t0)}ms (${timings.join(', ')}), ${ctx.lights?.count ?? 0} lights`);

  const updates = kit.onUpdate;
  ctx.addSystem((dt, t) => {
    for (const fn of updates) fn(dt, t);
    kit.halos.flush();
    kit.pools.flush();
    kit.bulbs.flush();
    kit.glass.flush();
  });
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const abx = bx - ax;
  const abz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / (abx * abx + abz * abz || 1)));
  return Math.hypot(ax + abx * t - px, az + abz * t - pz);
}

function nearShape(s: PathShape, x: number, z: number, m: number): boolean {
  switch (s.kind) {
    case 'disk':
      return Math.hypot(x - s.center.x, z - s.center.z) <= s.r + m;
    case 'ring': {
      const d = Math.hypot(x - s.center.x, z - s.center.z);
      return d >= s.r0 - m && d <= s.r1 + m;
    }
    case 'segment':
      return distToSegment(x, z, s.a.x, s.a.z, s.b.x, s.b.z) <= s.width / 2 + m;
    case 'ellipse':
      return ((x - s.center.x) / (s.rx + m)) ** 2 + ((z - s.center.z) / (s.rz + m)) ** 2 <= 1;
  }
}

/** Is (x,z) on a path, a zone pad or a chalet (+ margin)? Props must stay off. */
function makeBlocked(layout: Layout) {
  return (x: number, z: number, margin: number): boolean => {
    for (const p of layout.paths) if (nearShape(p, x, z, margin)) return true;
    for (const zone of Object.values(layout.zones)) {
      if (!zone.enabled && zone.id !== 'gate') continue;
      if (Math.hypot(x - zone.center.x, z - zone.center.z) <= zone.radius + 1 + margin) return true;
    }
    for (const s of layout.stalls) {
      if (Math.hypot(x - s.position.x, z - s.position.z) <= 2.4 + margin) return true;
      if (Math.hypot(x - s.customerPoint.x, z - s.customerPoint.z) <= 1.2 + margin) return true;
    }
    return false;
  };
}
