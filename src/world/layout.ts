/**
 * The plan of Givrelune's market. Pure math, no Three.js: shared by the 3D world, the map UI,
 * the NPC wandering, the collisions and the tests.
 *
 * Coordinates: metres, ground plane XZ, y up.
 *   +Z = south (the entrance gate), -Z = north (the belvedere over the valley),
 *   +X = east (the frozen lake), -X = west (the glassblower's workshop).
 * Compass angle θ (radians): position = (sin θ · r, cos θ · r). θ=0 → south, θ=π → north, θ=π/2 → east.
 *
 *            belvedere (N)
 *       food (NW)    bar (NE)
 *  workshop (W)  [plaza+tree]  rink (E)
 *       fair (SW)  carousel (SE)
 *              gate (S)
 */
import type { ResolvedMarket, ZoneId } from '../config/types';

export interface P2 {
  x: number;
  z: number;
}

export type Surface = 'snow' | 'stone' | 'ice' | 'wood';

export interface ZoneArea {
  id: ZoneId;
  name: string;
  subtitle: string;
  enabled: boolean;
  /** Compass angle of the zone from the plaza centre. */
  angle: number;
  center: P2;
  /** Radius of the zone pad (walkable area reserved for the zone builder). */
  radius: number;
  /** Where the avenue from the alley reaches the zone. */
  entrance: P2;
  /** Nice spot to arrive at when fast-travelling (map). */
  arrival: P2;
  /** Facing (yaw, radians) when arriving. */
  arrivalYaw: number;
}

export interface StallSlot {
  index: number;
  ring: 'outer' | 'inner';
  /** Chalet centre on the ground. */
  position: P2;
  /** Yaw so that the chalet's local +Z (its front) faces the alley. */
  rotationY: number;
  /** Unit vector pointing out of the front of the chalet. */
  front: P2;
  angle: number;
  /** Where a visitor stands in front of the counter. */
  customerPoint: P2;
  /** Where the keeper stands behind the counter. */
  keeperPoint: P2;
}

export interface AssignedStall extends StallSlot {
  stallId: string;
}

export type PathShape =
  | { kind: 'disk'; center: P2; r: number; surface: Surface }
  | { kind: 'ring'; center: P2; r0: number; r1: number; surface: Surface }
  | { kind: 'segment'; a: P2; b: P2; width: number; surface: Surface }
  | { kind: 'ellipse'; center: P2; rx: number; rz: number; surface: Surface };

export interface WalkGraph {
  nodes: P2[];
  edges: [number, number][];
}

export interface Layout {
  /** Visitors cannot walk further than this from the centre. */
  walkRadius: number;
  spawn: { position: P2; yaw: number };
  plaza: { center: P2; radius: number; treeRadius: number };
  alley: { r0: number; r1: number; stallRadius: number; innerStallRadius: number };
  zones: Record<ZoneId, ZoneArea>;
  stalls: AssignedStall[];
  /** Slots left empty by stalls — the environment fills them with props (pines, benches…). */
  freeSlots: StallSlot[];
  paths: PathShape[];
  walkGraph: WalkGraph;
  surfaceAt(x: number, z: number): Surface;
  zoneAt(x: number, z: number): ZoneId | 'alley' | null;
}

export const CHALET = {
  width: 3.4,
  depth: 2.6,
  /** Local z of the counter front edge. */
  counterZ: 1.15,
  /** Local z where the keeper stands. */
  keeperZ: 0.15,
  /** Local z where the visitor stands. */
  customerZ: 2.75,
} as const;

export const PLAZA_R = 10.5;
export const TREE_R = 3.2;
export const ALLEY_R0 = 16;
export const ALLEY_R1 = 23.4;
export const STALL_R = 25.2;
export const INNER_STALL_R = 13.4;
export const WALK_R = 46;

const DEG = Math.PI / 180;

export const ZONE_GEOMETRY: Record<ZoneId, { angle: number; dist: number; radius: number }> = {
  gate: { angle: 0, dist: 38, radius: 5 },
  carousel: { angle: 45 * DEG, dist: 33.5, radius: 7 },
  rink: { angle: 90 * DEG, dist: 36, radius: 9 },
  bar: { angle: 135 * DEG, dist: 33.5, radius: 7 },
  belvedere: { angle: 180 * DEG, dist: 38, radius: 7 },
  food: { angle: -135 * DEG, dist: 33.5, radius: 7 },
  workshop: { angle: -90 * DEG, dist: 35.5, radius: 8 },
  fair: { angle: -45 * DEG, dist: 33.5, radius: 7 },
  plaza: { angle: 0, dist: 0, radius: PLAZA_R },
};

export function polar(angle: number, r: number): P2 {
  return { x: Math.sin(angle) * r, z: Math.cos(angle) * r };
}

/** Yaw that turns local +Z toward the direction (dx, dz). */
export function yawToward(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

function wrapAngle(a: number) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function makeSlot(index: number, ring: 'outer' | 'inner', angle: number): StallSlot {
  const r = ring === 'outer' ? STALL_R : INNER_STALL_R;
  const position = polar(angle, r);
  // outer chalets face the centre, inner chalets face outward
  const sign = ring === 'outer' ? -1 : 1;
  const front = { x: Math.sin(angle) * sign, z: Math.cos(angle) * sign };
  const rotationY = yawToward(front.x, front.z);
  const at = (localZ: number): P2 => ({ x: position.x + front.x * localZ, z: position.z + front.z * localZ });
  return {
    index,
    ring,
    position,
    rotationY,
    front,
    angle,
    customerPoint: at(CHALET.customerZ),
    keeperPoint: at(CHALET.keeperZ),
  };
}

/**
 * All candidate chalet slots, best first.
 *
 * Like in any cosy diorama game, buildings should face the camera — and the default camera looks north,
 * from the south. So the preferred slots are those whose front faces south-ish:
 *  - south half of the market: INNER ring chalets (backs to the plaza, fronts toward the entrance),
 *  - north half: OUTER ring chalets (fronts toward the plaza, i.e. south).
 * Among those, the closest to the entrance come first. Side-on slots (east/west) come last.
 */
export function candidateSlots(): StallSlot[] {
  const slots: StallSlot[] = [];
  // Outer ring: 8 sectors of 45°, openings at every multiple of 45° (avenues to zones).
  const outerOffsets = [13.1, 22.5, 31.9];
  for (let s = 0; s < 8; s++) {
    for (const off of outerOffsets) slots.push(makeSlot(0, 'outer', wrapAngle((s * 45 + off) * DEG)));
  }
  // Inner ring: 4 sectors of 90°, openings at cardinals (connector paths to the plaza).
  // (symmetric around the south and north axes)
  const innerOffsets = [19, 35, 56, 72];
  for (const base of [0, 180])
    for (const off of innerOffsets)
      for (const sign of [1, -1]) slots.push(makeSlot(0, 'inner', wrapAngle((base + sign * off) * DEG)));
  const entry = { x: 0, z: ALLEY_R1 };
  const facesCamera = (sl: StallSlot) => sl.front.z > 0.35;
  // camera-facing first; inner (near the entrance) before outer; then the most south-facing; right before left
  const score = (sl: StallSlot) =>
    (facesCamera(sl) ? 0 : 1000) +
    (sl.ring === 'inner' ? 0 : 100) +
    (1 - sl.front.z) * 40 +
    Math.hypot(sl.position.x - entry.x, sl.position.z - entry.z) * 0.05 +
    (sl.angle < 0 ? 0.01 : 0);
  slots.sort((a, b) => score(a) - score(b));
  slots.forEach((s, i) => (s.index = i));
  return slots;
}

function distToSegment(p: P2, a: P2, b: P2) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / (abx * abx + abz * abz || 1)));
  const x = a.x + abx * t - p.x;
  const z = a.z + abz * t - p.z;
  return Math.sqrt(x * x + z * z);
}

export function insideShape(s: PathShape, x: number, z: number): boolean {
  switch (s.kind) {
    case 'disk':
      return (x - s.center.x) ** 2 + (z - s.center.z) ** 2 <= s.r * s.r;
    case 'ring': {
      const d2 = (x - s.center.x) ** 2 + (z - s.center.z) ** 2;
      return d2 >= s.r0 * s.r0 && d2 <= s.r1 * s.r1;
    }
    case 'segment':
      return distToSegment({ x, z }, s.a, s.b) <= s.width / 2;
    case 'ellipse':
      return ((x - s.center.x) / s.rx) ** 2 + ((z - s.center.z) / s.rz) ** 2 <= 1;
  }
}

export function createLayout(market: Pick<ResolvedMarket, 'zones' | 'stalls'>): Layout {
  const zones = {} as Record<ZoneId, ZoneArea>;
  for (const id of Object.keys(ZONE_GEOMETRY) as ZoneId[]) {
    const g = ZONE_GEOMETRY[id];
    const center = polar(g.angle, g.dist);
    const entranceDist = id === 'plaza' ? PLAZA_R : g.dist - g.radius;
    const arrival = id === 'plaza' ? polar(0, PLAZA_R - 2.5) : polar(g.angle, g.dist - g.radius + 1.5);
    // arriving: face the zone centre (for the plaza: face the tree)
    const arrivalYaw = id === 'plaza' ? yawToward(-arrival.x, -arrival.z) : yawToward(center.x - arrival.x, center.z - arrival.z);
    const cfg = market.zones[id];
    zones[id] = {
      id,
      name: cfg.name,
      subtitle: cfg.subtitle,
      enabled: cfg.enabled,
      angle: g.angle,
      center,
      radius: g.radius,
      entrance: polar(g.angle, entranceDist),
      arrival,
      arrivalYaw,
    };
  }
  // The gate: arrive just inside the arch, facing north (toward the market).
  zones.gate.arrival = { x: 0, z: 35 };
  zones.gate.arrivalYaw = Math.PI;

  const slots = candidateSlots();
  const stalls: AssignedStall[] = [];
  market.stalls.forEach((s, i) => {
    if (i < slots.length) stalls.push({ ...slots[i], stallId: s.id });
    else console.warn(`[givrelune] Too many stalls: "${s.id}" has no room (max ${slots.length}).`);
  });
  // empty outer slots get cosy prop islands (inner ones stay as open lawn)
  const freeSlots = slots.slice(stalls.length).filter((s) => s.ring === 'outer');

  const paths: PathShape[] = [];
  const O = { x: 0, z: 0 };
  paths.push({ kind: 'disk', center: O, r: PLAZA_R, surface: 'stone' });
  paths.push({ kind: 'ring', center: O, r0: ALLEY_R0, r1: ALLEY_R1, surface: 'stone' });
  // connectors plaza → alley (cardinals)
  for (const a of [0, 90, 180, -90]) {
    paths.push({ kind: 'segment', a: polar(a * DEG, PLAZA_R - 0.5), b: polar(a * DEG, ALLEY_R0 + 0.5), width: 3.6, surface: 'stone' });
  }
  // avenues alley → zones
  for (const id of Object.keys(zones) as ZoneId[]) {
    if (id === 'plaza') continue;
    const z = zones[id];
    if (!z.enabled && id !== 'gate') continue;
    const end = id === 'gate' ? polar(0, WALK_R - 1) : z.center;
    paths.push({ kind: 'segment', a: polar(z.angle, ALLEY_R1 - 0.5), b: end, width: 4.4, surface: 'stone' });
    if (id === 'rink') {
      paths.push({ kind: 'disk', center: z.center, r: z.radius + 1.5, surface: 'stone' });
      paths.push({ kind: 'ellipse', center: z.center, rx: 7.5, rz: 5.5, surface: 'ice' });
    } else if (id === 'belvedere') {
      paths.push({ kind: 'disk', center: z.center, r: z.radius, surface: 'wood' });
    } else if (id !== 'gate') {
      paths.push({ kind: 'disk', center: z.center, r: z.radius, surface: 'stone' });
    }
  }

  // Walk graph for wandering NPCs.
  const nodes: P2[] = [];
  const edges: [number, number][] = [];
  const ALLEY_MID = (ALLEY_R0 + ALLEY_R1) / 2 - 0.6;
  const ringStart = nodes.length;
  const RING_N = 32;
  for (let i = 0; i < RING_N; i++) nodes.push(polar((i / RING_N) * Math.PI * 2, ALLEY_MID));
  for (let i = 0; i < RING_N; i++) edges.push([ringStart + i, ringStart + ((i + 1) % RING_N)]);
  const plazaStart = nodes.length;
  const PLAZA_N = 12;
  for (let i = 0; i < PLAZA_N; i++) nodes.push(polar((i / PLAZA_N) * Math.PI * 2, PLAZA_R - 2.2));
  for (let i = 0; i < PLAZA_N; i++) edges.push([plazaStart + i, plazaStart + ((i + 1) % PLAZA_N)]);
  // connectors: ring node at cardinal k ↔ plaza node at cardinal k
  for (let k = 0; k < 4; k++) edges.push([ringStart + k * (RING_N / 4), plazaStart + k * (PLAZA_N / 4)]);
  // avenues: ring node at multiples of 45° ↔ zone node
  for (const id of Object.keys(zones) as ZoneId[]) {
    if (id === 'plaza' || id === 'gate') continue;
    const z = zones[id];
    if (!z.enabled) continue;
    let idx = Math.round(((((z.angle / (Math.PI * 2)) % 1) + 1) % 1) * RING_N) % RING_N;
    const zoneNode = nodes.length;
    nodes.push(polar(z.angle, (ZONE_GEOMETRY[id].dist - z.radius) - 0.5));
    edges.push([ringStart + idx, zoneNode]);
  }

  const surfaceAt = (x: number, z: number): Surface => {
    let s: Surface = 'snow';
    for (const p of paths) {
      if (insideShape(p, x, z)) {
        if (p.surface === 'ice' || p.surface === 'wood') return p.surface;
        s = p.surface;
      }
    }
    return s;
  };

  const zoneAt = (x: number, z: number): ZoneId | 'alley' | null => {
    const r = Math.hypot(x, z);
    if (r <= PLAZA_R + 1) return 'plaza';
    let best: ZoneId | null = null;
    let bestD = Infinity;
    for (const id of Object.keys(zones) as ZoneId[]) {
      if (id === 'plaza') continue;
      const zo = zones[id];
      if (!zo.enabled) continue;
      const d = Math.hypot(x - zo.center.x, z - zo.center.z);
      if (d <= zo.radius + 2 && d < bestD) {
        best = id;
        bestD = d;
      }
    }
    if (best) return best;
    if (r >= ALLEY_R0 - 1 && r <= STALL_R + 2) return 'alley';
    return null;
  };

  return {
    walkRadius: WALK_R,
    spawn: { position: { x: 0, z: 42 }, yaw: Math.PI },
    plaza: { center: O, radius: PLAZA_R, treeRadius: TREE_R },
    alley: { r0: ALLEY_R0, r1: ALLEY_R1, stallRadius: STALL_R, innerStallRadius: INNER_STALL_R },
    zones,
    stalls,
    freeSlots,
    paths,
    walkGraph: { nodes, edges },
    surfaceAt,
    zoneAt,
  };
}
