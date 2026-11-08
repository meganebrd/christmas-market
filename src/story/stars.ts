import * as THREE from 'three';
import type { AnchorName, GameContext } from '../core/contracts';
import type { ZoneId } from '../config/types';
import { ALLEY_R1, STALL_R, polar } from '../world/layout';
import type { CastConfig, PlannedStar, StarId } from './types';
import { compass } from './text';

/**
 * The seven glass stars of the Grand Sapin: where each one is, how the visitor gets it, and its socket
 * on the tree. If a zone, a mini-game or a character is missing, the star is relocated as a hidden
 * pick-up (near the gate arch, under a lawn pine, in a nook of the alley).
 */

interface StarDef {
  id: StarId;
  tint: string;
  zone: ZoneId;
  game?: string;
  role: CastConfig['role'];
  anchors: AnchorName[];
}

export const STAR_DEFS: StarDef[] = [
  { id: 'flocons', tint: '#bfe3ff', zone: 'belvedere', game: 'flocons', role: 'stargazer', anchors: ['belvedere:telescope', 'belvedere:center', 'belvedere:stargazer'] },
  { id: 'chamboule', tint: '#ffb8cc', zone: 'fair', game: 'chamboule', role: 'fair-keeper', anchors: ['fair:targets', 'fair:keeper'] },
  { id: 'crepes', tint: '#ffd98a', zone: 'food', game: 'crepes', role: 'cook', anchors: ['food:griddle', 'food:cook'] },
  { id: 'verrier', tint: '#ffb26e', zone: 'workshop', game: 'verrier', role: 'glassblower', anchors: ['workshop:furnace', 'workshop:glassblower'] },
  { id: 'manege', tint: '#d9bcff', zone: 'carousel', game: 'manege', role: 'carousel-keeper', anchors: ['carousel:center', 'carousel:keeper'] },
  { id: 'chaudron', tint: '#ff9a84', zone: 'bar', role: 'barista', anchors: ['bar:cauldron', 'bar:barista'] },
  { id: 'lac', tint: '#a6f2e2', zone: 'rink', role: 'chestnut-seller', anchors: ['rink:center'] },
];

export const STAR_IDS = STAR_DEFS.map((d) => d.id);

/** "sur le Lac Gelé", "sur la Place…", "sur l’Étang". */
function surZone(name: string): string {
  const m = /^(Le|La|Les) (.*)$/.exec(name);
  if (m) return `sur ${m[1].toLowerCase()} ${m[2]}`;
  if (/^L['’]/.test(name)) return 'sur l’' + name.slice(2);
  return 'sur ' + name;
}

function anchorPos(ctx: GameContext, names: AnchorName[], zone: ZoneId): THREE.Vector3 {
  for (const n of names) {
    const a = ctx.landmarks?.anchors?.get(n);
    if (a) return new THREE.Vector3(a.position.x, 0, a.position.z);
  }
  const z = ctx.layout.zones[zone];
  return new THREE.Vector3(z.center.x, 0, z.center.z);
}

export function castByRole(ctx: GameContext, role: CastConfig['role']): CastConfig | null {
  return ctx.config.cast.find((c) => c.role === role) ?? null;
}

export function npcExists(ctx: GameContext, castId: string): boolean {
  try {
    return !!ctx.npcs?.get('cast:' + castId);
  } catch {
    return false;
  }
}

/** Mini-game id for a star: exact id first, then any game of the same zone not already taken. */
function findGame(ctx: GameContext, def: StarDef, taken: Set<string>): string | undefined {
  let list: { id: string; zone: ZoneId }[] = [];
  try {
    list = ctx.minigames?.list() ?? [];
  } catch {
    list = [];
  }
  const exact = list.find((g) => g.id === def.game && !taken.has(g.id));
  if (exact) return exact.id;
  return list.find((g) => g.zone === def.zone && !taken.has(g.id))?.id;
}

/** Push a point out of colliders and keep it inside the walkable circle. */
function freeSpot(ctx: GameContext, p: THREE.Vector3, radius = 0.55): THREE.Vector3 {
  const q = { x: p.x, z: p.z };
  try {
    ctx.colliders.resolve(q, radius);
  } catch {
    /* ignore */
  }
  const r = Math.hypot(q.x, q.z);
  const max = ctx.layout.walkRadius - 1.2;
  if (r > max) {
    q.x *= max / r;
    q.z *= max / r;
  }
  return new THREE.Vector3(q.x, 0, q.z);
}

interface Spot {
  pos: THREE.Vector3;
  where: string;
}

function relocationSpots(ctx: GameContext): Spot[] {
  const spots: Spot[] = [];
  const gate = ctx.layout.zones.gate;
  const arch = ctx.landmarks?.anchors?.get('gate:arch')?.position;
  const ax = arch?.x ?? gate.center.x;
  const az = arch?.z ?? gate.center.z;
  // just inside the arch, tucked against a pillar
  spots.push({ pos: new THREE.Vector3(ax - 3.1, 0, az - 1.4), where: 'près de la Porte du Givre, au pied de l’arche' });
  // lawn pines (free chalet slots): the star peeks out from under the branches, on the alley side
  for (const s of ctx.layout.freeSlots) {
    const p = new THREE.Vector3(s.position.x + s.front.x * 1.55, 0, s.position.z + s.front.z * 1.55);
    spots.push({ pos: p, where: `sous un sapin de l’allée, côté ${compass(p.x, p.z)}` });
  }
  // nooks beside the avenue mouths, between the chalets and the avenue
  const DEG = Math.PI / 180;
  for (let k = 0; k < 8; k++) {
    for (const side of [1, -1]) {
      const a = (k * 45 + side * 6.2) * DEG;
      const p = polar(a, (ALLEY_R1 + STALL_R) / 2 + 0.6);
      spots.push({ pos: new THREE.Vector3(p.x, 0, p.z), where: `dans un recoin de l’allée, côté ${compass(p.x, p.z)}` });
    }
  }
  return spots;
}

/**
 * Sockets on the Grand Sapin, one per star, in the order they light up. The Grand Sapin of the landmarks
 * module has its own golden sockets (and small stars that appear as `setTreeLight` grows): sit ours in
 * them, matching its thresholds (star k lights when progress ≥ (k+1)/N). Otherwise, raycast the tree.
 * Call after `landmarks.setTreeLight()` (it places its instances during loading).
 */
export function treeSockets(ctx: GameContext, n: number, exclude: THREE.Object3D): THREE.Vector3[] {
  try {
    const theirs = ctx.scene.getObjectByName('tree-glass-stars') as THREE.InstancedMesh | undefined;
    if (theirs && (theirs as any).isInstancedMesh && theirs.count > 0) {
      theirs.updateWorldMatrix(true, false);
      const m = new THREE.Matrix4();
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < theirs.count; i++) {
        theirs.getMatrixAt(i, m);
        pts.push(new THREE.Vector3().setFromMatrixPosition(m).applyMatrix4(theirs.matrixWorld));
      }
      if (pts.every((p) => p.y > 0.8)) {
        const N = pts.length;
        const out: THREE.Vector3[] = [];
        for (let k = 0; k < n; k++) {
          const idx = Math.max(0, Math.min(N - 1, Math.floor(((k + 1) / n) * N + 1e-6) - 1));
          out.push(pts[idx].clone());
        }
        return out;
      }
    }
  } catch {
    /* fall back */
  }
  return computeSockets(ctx, n, exclude);
}

/** Sockets by raycasting the real tree (whatever its shape), falling back to a cone estimate. */
export function computeSockets(ctx: GameContext, n: number, exclude: THREE.Object3D): THREE.Vector3[] {
  const top = ctx.landmarks?.treeTop?.y ?? 13;
  const baseR = (ctx.layout.plaza.treeRadius ?? 3.2) * 1.05;
  const coneR = (h: number) => Math.max(0.6, baseR * (1 - h / Math.max(top, 4)));
  const candidates: THREE.Object3D[] = [];
  try {
    ctx.scene.updateMatrixWorld(true);
    const sphere = new THREE.Sphere();
    ctx.scene.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh || (o as any).isSprite) return;
      let p: THREE.Object3D | null = o;
      while (p) {
        if (p === exclude) return;
        p = p.parent;
      }
      const m = o as THREE.Mesh;
      const g = m.geometry as THREE.BufferGeometry | undefined;
      if (!g) return;
      if (!g.boundingSphere) g.computeBoundingSphere();
      if (!g.boundingSphere) return;
      sphere.copy(g.boundingSphere).applyMatrix4(m.matrixWorld);
      if (sphere.radius > 16) return;
      if (Math.hypot(sphere.center.x, sphere.center.z) - sphere.radius > baseR + 1) return;
      candidates.push(m);
    });
  } catch {
    /* ignore */
  }
  const ray = new THREE.Raycaster();
  ray.camera = ctx.camera;
  const out: THREE.Vector3[] = [];
  const GOLDEN = 2.399963;
  for (let i = 0; i < n; i++) {
    // heights from low to high, spiralling (the first one faces the gate)
    const f = n === 1 ? 0.5 : i / (n - 1);
    const h = top * (0.24 + 0.56 * f);
    const a = 0.35 + i * GOLDEN;
    const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    let socket: THREE.Vector3 | null = null;
    if (candidates.length) {
      const origin = dir.clone().multiplyScalar(baseR + 5).setY(h);
      ray.set(origin, dir.clone().negate());
      ray.far = baseR + 5;
      try {
        const hits = ray.intersectObjects(candidates, false);
        for (const hit of hits) {
          const r = Math.hypot(hit.point.x, hit.point.z);
          if (r <= coneR(h) + 1.6 && r > 0.2) {
            socket = hit.point.clone().addScaledVector(dir, 0.3);
            break;
          }
        }
      } catch {
        socket = null;
      }
    }
    if (!socket) socket = dir.clone().multiplyScalar(coneR(h) + 0.25).setY(h);
    out.push(socket);
  }
  return out;
}

export function buildPlan(ctx: GameContext): PlannedStar[] {
  if (!ctx.config.story.enabled) return [];
  const n = Math.max(1, Math.min(7, ctx.config.story.stars || 7));
  const defs = STAR_DEFS.slice(0, n);
  const taken = new Set<string>();
  const plan: PlannedStar[] = [];
  const needsSpot: PlannedStar[] = [];

  defs.forEach((def, index) => {
    const zone = ctx.layout.zones[def.zone];
    const zoneOn = !!zone?.enabled;
    const home = anchorPos(ctx, def.anchors, def.zone);
    const star: PlannedStar = { id: def.id, index, tint: def.tint, zone: def.zone, mode: 'hidden', role: def.role, home };
    if (def.game) {
      const g = zoneOn ? findGame(ctx, def, taken) : undefined;
      if (g) {
        taken.add(g);
        star.mode = 'minigame';
        star.gameId = g;
      }
    } else if (def.id === 'chaudron') {
      const barista = castByRole(ctx, 'barista');
      if (zoneOn && barista && npcExists(ctx, barista.id)) star.mode = 'gift';
    } else if (def.id === 'lac' && zoneOn) {
      // glinting on the ice, near the far edge of the frozen lake
      const c = new THREE.Vector3(zone.center.x, 0, zone.center.z);
      const out = c.clone().setY(0).normalize();
      const side = new THREE.Vector3(-out.z, 0, out.x);
      star.pickup = c.clone().addScaledVector(out, 5.6).addScaledVector(side, 1.2);
      const r = Math.hypot(star.pickup.x, star.pickup.z);
      const max = ctx.layout.walkRadius - 1.2;
      if (r > max) star.pickup.multiplyScalar(max / r);
      star.where = `${surZone(zone.name || 'Le Lac Gelé')}, tout au bout de la glace`;
      star.home = star.pickup.clone();
    }
    if (star.mode === 'hidden' && !star.pickup) needsSpot.push(star);
    plan.push(star);
  });

  if (needsSpot.length) {
    const spots = relocationSpots(ctx);
    const used: THREE.Vector3[] = plan.filter((s) => s.pickup).map((s) => s.pickup!);
    for (const star of needsSpot) {
      let best: Spot | null = null;
      let bestScore = -Infinity;
      spots.forEach((sp, i) => {
        if (!sp) return;
        const minD = used.reduce((m, u) => Math.min(m, u.distanceTo(sp.pos)), 60);
        // prefer the gate first (the first thing a new visitor sees), then spread & stay near the star's own zone
        const zoneDir = star.home.clone().setY(0);
        const near = zoneDir.lengthSq() > 1 ? sp.pos.clone().normalize().dot(zoneDir.normalize()) : 0;
        const score = Math.min(minD, 25) + near * 6 + (i === 0 ? 30 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = sp;
        }
      });
      if (!best) break;
      const chosen = best as Spot;
      spots[spots.indexOf(chosen)] = undefined as unknown as Spot;
      star.pickup = freeSpot(ctx, chosen.pos);
      star.where = chosen.where;
      star.home = star.pickup.clone();
      used.push(star.pickup);
    }
  }
  return plan;
}
