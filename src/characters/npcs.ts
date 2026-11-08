import * as THREE from 'three';
import type { GameContext, NpcApi, NpcHandle } from '../core/contracts';
import type { CastMember, CastRole, CharacterAppearance, ZoneId } from '../config/types';
import { hash01, resolveAppearance } from '../config/resolve';
import type { P2 } from '../world/layout';
import { Agent, type World } from './agent';
import { castBehaviour, potterBehaviour, vendorBehaviour } from './behaviours';
import { benchBehaviour, buildBench, buildGraph, companionBehaviour, createSnowballFight, skaterBehaviour, wanderBehaviour } from './crowd';
import { buildCharlab } from './charlab';
import { getEffects } from './effects';
import type { CosyRig } from './rig';
import type { EmoteKind } from './emotes';

const CAST_ANCHOR: Partial<Record<CastRole, string>> = {
  guide: 'plaza:guide',
  barista: 'bar:barista',
  cook: 'food:cook',
  'chestnut-seller': 'food:chestnut',
  glassblower: 'workshop:glassblower',
  'carousel-keeper': 'carousel:keeper',
  'fair-keeper': 'fair:keeper',
  stargazer: 'belvedere:stargazer',
  musician: 'plaza:musician',
};
/** Where the visitor stands to talk to a cast member behind a counter. */
const CAST_SPOT: Partial<Record<CastRole, string>> = {
  barista: 'bar:counter-spot',
  cook: 'food:crepe-spot',
  'chestnut-seller': 'food:chestnut-spot',
  glassblower: 'workshop:bench-spot',
};

/** Fallback cabin floor height when the stalls module is a stub. */
const CABIN_FLOOR = 0.14;
/** Counters are ~1 m high: cast members working behind one stand on a hidden step (chibis are ~1.2 m). */
const ROLE_STEP: Partial<Record<CastRole, number>> = { barista: 0.36, cook: 0.36, 'fair-keeper': 0.3 };
const OUTFITS = ['coat', 'coat', 'coat', 'sweater', 'sweater', 'cape', 'vest'] as const;
const ACCESSORIES = ['none', 'none', 'none', 'none', 'glasses', 'round-glasses', 'mittens', 'mittens', 'bag', 'bag', 'flower', 'pipe'] as const;

/** A varied, deterministic crowd appearance. */
function crowdAppearance(seed: string, kid = false): Required<CharacterAppearance> {
  const h = (k: string) => hash01(seed + k);
  const elder = !kid && h('elder') < 0.18;
  const partial: CharacterAppearance = {
    outfit: OUTFITS[Math.floor(h('outfit') * OUTFITS.length)],
    accessory: kid ? (h('acc') < 0.3 ? 'mittens' : 'none') : ACCESSORIES[Math.floor(h('acc') * ACCESSORIES.length)],
    height: kid ? 0.8 + h('ht') * 0.06 : 0.92 + h('ht') * 0.2,
    build: 0.88 + h('bd') * 0.3,
  };
  if (elder) {
    partial.hair = h('gr') < 0.5 ? '#d9d4cc' : '#b9b4ae';
    if (h('beard') < 0.5) {
      partial.beard = partial.hair;
      partial.hairStyle = h('bald') < 0.5 ? 'bald' : 'short';
    }
  }
  if (kid) partial.hat = (['bobble', 'bobble', 'beanie', 'earmuffs', 'hood'] as const)[Math.floor(h('kh') * 5)];
  if (partial.accessory === 'pipe' && !partial.beard) partial.accessory = 'none';
  const a = resolveAppearance(partial, seed);
  if (kid) a.beard = null;
  return a;
}

export function createNpcManager(ctx: GameContext): NpcApi {
  const fx = getEffects(ctx);
  const agents: Agent[] = [];
  const byId = new Map<string, Agent>();
  const shadows = ctx.quality.shadows;
  const crowdDetail = ctx.quality.tier === 'high' ? 0.55 : ctx.quality.tier === 'medium' ? 0.48 : 0.4;
  const mainDetail = ctx.quality.tier === 'low' ? 0.55 : 0.75;
  let bubbleCooldown = 3;
  const tmp = new THREE.Vector3();
  const fwd = new THREE.Vector3();

  const world: World = {
    ctx,
    fx,
    player: ctx.player,
    agents,
    t: 0,
    canBubble: () => bubbleCooldown <= 0,
    bubble(agent, text, duration = 2600) {
      bubbleCooldown = 4.5;
      try {
        ctx.ui.bubble(agent.rig.root, text, { duration, height: agent.rig.height + 0.3 });
      } catch {
        /* UI may be a stub */
      }
      agent.rig.setTalking(true);
      agent.talkT = Math.min(1.8, 0.4 + text.length * 0.05);
    },
  };

  const add = (a: Agent) => {
    agents.push(a);
    byId.set(a.id, a);
    ctx.scene.add(a.rig.root);
    fx.addShadow(a.rig);
    a.rig.onEvent = (name) => onRigEvent(a, name);
    return a;
  };

  const onRigEvent = (a: Agent, name: string) => {
    a.data.onEvent?.(name);
    if (!a.near) return;
    if (name === 'step-l' || name === 'step-r') {
      const foot = a.rig.footWorld(name === 'step-l' ? 'l' : 'r', tmp);
      if (ctx.layout.surfaceAt(foot.x, foot.z) === 'snow') fx.footprint(foot, a.yaw, 0.85 * a.rig.dims.h);
    } else if (name === 'push-l' || name === 'push-r') {
      const foot = a.rig.footWorld(name === 'push-l' ? 'l' : 'r', tmp);
      const s = name === 'push-l' ? 1 : -1;
      fx.iceSpray(foot, fwd.set(Math.cos(a.yaw) * s, 0, -Math.sin(a.yaw) * s));
    } else if (name === 'breath') {
      fx.breath(a.rig.mouthWorld(tmp), fwd.set(Math.sin(a.yaw), 0, Math.cos(a.yaw)));
    } else if (name === 'steam' && a.rig.current === 'drink') {
      a.rig.handWorld('R', tmp);
      tmp.y += 0.1;
      fx.steam(tmp);
    }
  };

  // ───────────────────────────── vendors ─────────────────────────────
  for (const slot of ctx.layout.stalls) {
    const stall = ctx.config.stalls.find((s) => s.id === slot.stallId);
    if (!stall) continue;
    try {
      const id = `vendor:${stall.id}`;
      const a = new Agent(id, stall.owner.name, stall.owner.appearance, mainDetail, shadows);
      a.kind = 'vendor';
      a.collide = false;
      a.avoid = false;
      const yaw = Math.atan2(slot.front.x, slot.front.z);
      // the keeper stands on the cabin floor (the stalls module publishes its height in keeperPoint.y)
      const kp = ctx.market?.stalls?.get(stall.id)?.keeperPoint;
      const kx = kp?.x ?? slot.keeperPoint.x;
      const kz = kp?.z ?? slot.keeperPoint.z;
      a.place(kx, kz, yaw);
      // + a little hidden step behind the counter so the keeper's shoulders show above it
      a.position.y = (kp ? kp.y : CABIN_FLOOR) + 0.16;
      a.behaviour = vendorBehaviour({ x: kx, z: kz, yaw });
      add(a);
      const first = stall.owner.name.split(' ')[0];
      ctx.interactables.add({
        id,
        position: new THREE.Vector3(slot.customerPoint.x, 0, slot.customerPoint.z),
        radius: 2.3,
        priority: 2,
        label: `Parler à ${first}`,
        promptHeight: 2.4,
        objects: [a.rig.root],
        enabled: () => ctx.conversations.has(id),
        onInteract: () => void ctx.conversations.start(id),
      });
    } catch (err) {
      console.error('[givrelune] vendor failed', stall.id, err);
    }
  }

  // ───────────────────────────── cast ─────────────────────────────
  const anchor = (name: string | undefined) => (name ? ctx.landmarks?.anchors?.get(name) : undefined);
  const zoneSlots = new Map<ZoneId, number>();
  const placeCast = (c: CastMember & { zone: ZoneId }): { x: number; z: number; yaw: number } => {
    const an = anchor(CAST_ANCHOR[c.role]);
    if (an) return { x: an.position.x, z: an.position.z, yaw: an.yaw };
    const zone = ctx.layout.zones[c.zone];
    const n = zoneSlots.get(c.zone) ?? 0;
    zoneSlots.set(c.zone, n + 1);
    const dx = zone.arrival.x - zone.center.x;
    const dz = zone.arrival.z - zone.center.z;
    const l = Math.hypot(dx, dz) || 1;
    const out = c.zone === 'plaza' ? 4.6 : Math.min(2.2, zone.radius * 0.35);
    const lat = (n % 2 ? 1 : -1) * (1.2 + Math.floor(n / 2) * 1.3);
    let x = zone.center.x + (dx / l) * out + (-dz / l) * lat;
    let z = zone.center.z + (dz / l) * out + (dx / l) * lat;
    const p = { x, z };
    ctx.colliders.resolve(p, 0.4);
    x = p.x;
    z = p.z;
    return { x, z, yaw: Math.atan2(zone.arrival.x - x, zone.arrival.z - z) };
  };

  for (const c of ctx.config.cast) {
    try {
      const zone = ctx.layout.zones[c.zone];
      if (!zone || !zone.enabled) continue;
      if (c.role === 'skater' && !ctx.layout.zones.rink.enabled) continue;
      const id = `cast:${c.id}`;
      const a = new Agent(id, c.name, c.appearance, mainDetail, shadows);
      a.kind = 'cast';
      a.role = c.role;
      a.collide = false;
      a.avoid = false;
      const home = placeCast(c);
      a.place(home.x, home.z, home.yaw);
      const an = anchor(CAST_ANCHOR[c.role]);
      a.position.y = an ? Math.max(an.position.y, ROLE_STEP[c.role] ?? 0) : 0;
      let interactPos: THREE.Vector3 = a.position;
      if (c.role === 'skater') {
        const rc = ctx.layout.zones.rink.center;
        a.behaviour = skaterBehaviour(rc, 4.6, 3.3, 2.6, 1, Math.random() * 6);
      } else if (c.role === 'child') {
        a.avoid = true;
        a.collide = true;
        a.behaviour = potterBehaviour(zone.arrival, 3, true);
      } else if (c.role === 'villager') {
        a.avoid = true;
        a.collide = true;
        a.behaviour = potterBehaviour(zone.arrival, 4, false);
      } else {
        a.behaviour = castBehaviour(c.role, home, c.lines ?? []);
        if (c.role === 'guide') a.rig.hold({ R: 'pole' });
        const spot = anchor(CAST_SPOT[c.role]);
        if (spot) interactPos = new THREE.Vector3((spot.position.x + home.x) / 2, 0, (spot.position.z + home.z) / 2);
      }
      add(a);
      ctx.interactables.add({
        id,
        position: interactPos,
        radius: 2.3,
        priority: 2,
        label: `Parler à ${c.name}`,
        promptHeight: 2.4,
        objects: [a.rig.root],
        enabled: () => ctx.conversations.has(id),
        onInteract: () => void ctx.conversations.start(id),
      });
    } catch (err) {
      console.error('[givrelune] cast member failed', c.id, err);
    }
  }

  // fair keeper cheers when the visitor wins a game
  ctx.events.on('minigame:end', ({ won }) => {
    if (!won) return;
    for (const a of agents) {
      if (a.kind === 'cast' && (a.role === 'fair-keeper' || a.role === 'carousel-keeper') && a.position.distanceTo(ctx.player.position) < 14) {
        a.rig.play('clap', { loop: false });
        a.emote('happy');
      }
    }
  });

  // ───────────────────────────── crowd ─────────────────────────────
  const crowdN = Math.max(0, ctx.quality.crowdCount);
  try {
    const graph = buildGraph(ctx.layout.walkGraph, ctx.layout);
    const ringNodes = graph.nodes.map((_, i) => i).filter((i) => !graph.zoneOf[i] && Math.hypot(graph.nodes[i].x, graph.nodes[i].z) > ctx.layout.plaza.radius);
    let i = 0;
    while (i < crowdN) {
      const seed = 'crowd-' + i;
      const start = ringNodes[Math.floor(hash01(seed + 'start') * ringNodes.length)] ?? 0;
      const leader = new Agent(`crowd:${i}`, 'Visiteur', crowdAppearance(seed), crowdDetail, false);
      const sp = graph.nodes[start];
      const jitter = (hash01(seed + 'j') - 0.5) * 1.5;
      leader.place(sp.x + jitter, sp.z - jitter, hash01(seed + 'yaw') * Math.PI * 2);
      leader.behaviour = wanderBehaviour(ctx, graph, { lane: (hash01(seed + 'lane') - 0.5) * 2.6, speed: 1.0 + hash01(seed + 'sp') * 0.45, start });
      add(leader);
      i++;
      // about one in three walks with a friend
      if (i < crowdN && hash01(seed + 'pair') < 0.38) {
        const s2 = 'crowd-' + i;
        const friend = new Agent(`crowd:${i}`, 'Visiteur', crowdAppearance(s2), crowdDetail, false);
        friend.place(sp.x + jitter + 0.7, sp.z - jitter, leader.yaw);
        friend.behaviour = companionBehaviour(leader);
        add(friend);
        i++;
      }
    }
  } catch (err) {
    console.error('[givrelune] crowd failed', err);
  }

  // children having a snowball fight on the plaza lawns
  try {
    const pairs = crowdN >= 12 ? 2 : crowdN > 0 ? 1 : 0;
    const used: P2[] = [];
    for (let k = 0; k < pairs; k++) {
      const spots = findLawnPair(ctx, k === 0 ? Math.PI * 0.25 : Math.PI * 1.25, used);
      if (!spots) continue;
      const kids = [0, 1].map((j) => {
        const seed = `kid-${k}-${j}`;
        const a = new Agent(`kid:${k}:${j}`, 'Enfant', crowdAppearance(seed, true), crowdDetail, false);
        a.place(spots[j].x, spots[j].z, 0);
        a.face(spots[1 - j]);
        a.yaw = a.faceYaw ?? 0;
        a.radius = 0.25;
        return add(a);
      }) as [Agent, Agent];
      const fight = createSnowballFight(ctx, () => world, kids, spots);
      kids[0].behaviour = fight;
      kids[1].behaviour = fight;
      used.push(...spots);
    }
  } catch (err) {
    console.error('[givrelune] kids failed', err);
  }

  // skaters looping on the frozen lake
  try {
    const rink = ctx.layout.zones.rink;
    if (rink.enabled && crowdN > 0) {
      const n = ctx.quality.tier === 'high' ? 5 : ctx.quality.tier === 'medium' ? 4 : 3;
      for (let k = 0; k < n; k++) {
        const seed = `skater-${k}`;
        const a = new Agent(`skater:${k}`, 'Patineur', crowdAppearance(seed, k === 3), crowdDetail, false);
        a.collide = false;
        a.avoid = false;
        const f = hash01(seed + 'r');
        const rx = 3.4 + f * 2.8;
        const rz = 2.4 + f * 1.9;
        const dir = k % 3 === 2 ? -1 : 1;
        a.place(rink.center.x + rx, rink.center.z, 0);
        a.behaviour = skaterBehaviour(rink.center, rx, rz, 2.3 + hash01(seed + 's') * 1.2, dir, (k / n) * Math.PI * 2 + f);
        add(a);
      }
    }
  } catch (err) {
    console.error('[givrelune] skaters failed', err);
  }

  // a couple on a bench, facing the Grand Sapin
  try {
    const spot = findBenchSpot(ctx);
    if (spot && crowdN > 0) {
      const seat = buildBench(ctx, spot.x, spot.z, spot.yaw);
      const rx = Math.cos(spot.yaw);
      const rz = -Math.sin(spot.yaw);
      const pair: Agent[] = [];
      [-1, 1].forEach((s, j) => {
        const a = new Agent(`bench:${j}`, 'Visiteur', crowdAppearance(`bench-${j}`), crowdDetail, false);
        a.collide = false;
        a.avoid = false;
        a.place(spot.x + rx * 0.36 * s + Math.sin(spot.yaw) * 0.02, spot.z + rz * 0.36 * s + Math.cos(spot.yaw) * 0.02, spot.yaw);
        a.rig.seat = seat;
        a.rig.autoFidget = false;
        a.rig.play('sit');
        pair.push(add(a));
      });
      pair[0].behaviour = benchBehaviour(() => pair[1], true);
      pair[1].behaviour = benchBehaviour(() => pair[0], false);
    }
  } catch (err) {
    console.error('[givrelune] bench failed', err);
  }

  // ───────────────────────────── charlab (?charlab) ─────────────────────────────
  const lab: CosyRig[] = [];
  if (ctx.flags.has('charlab')) {
    buildCharlab(ctx, (r) => {
      lab.push(r);
      fx.addShadow(r);
    });
  }

  // ───────────────────────────── dialogue: mouths move while text types ─────────────────────────────
  hookDialogue(ctx, (id) => byId.get(id));
  if (ctx.flags.has('charlab') || ctx.flags.has('debug')) (window as any).__gvfx = fx;

  // ───────────────────────────── update loop (with LOD) ─────────────────────────────
  const frustum = new THREE.Frustum();
  const projView = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  ctx.addSystem((dt, t) => {
    world.t = t;
    bubbleCooldown -= dt;
    const cam = ctx.camera;
    projView.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projView);
    const cp = cam.position;
    const pp = ctx.player.position;
    for (const a of agents) {
      a.step(dt, world);
      const p = a.position;
      sphere.center.set(p.x, p.y + 0.6, p.z);
      sphere.radius = 1.1;
      a.onScreen = frustum.intersectsSphere(sphere);
      const d2 = (p.x - cp.x) ** 2 + (p.z - cp.z) ** 2;
      a.near = a.onScreen && d2 < 26 * 26;
      a.rig.root.visible = d2 < 62 * 62;
      a.rig.springsEnabled = a.near;
      const interval = !a.onScreen ? 0.3 : d2 > 45 * 45 ? 0.2 : d2 > 26 * 26 ? 1 / 30 : 0;
      a.lodAcc += dt;
      if (a.lodAcc >= interval) {
        a.rig.update(a.lodAcc);
        a.lodAcc = 0;
      }
      // breath puffs near the visitor
      if (a.near && (p.x - pp.x) ** 2 + (p.z - pp.z) ** 2 < 15 * 15) {
        a.breathT -= dt;
        if (a.breathT <= 0) {
          a.breathT = 2.8 + Math.random() * 2.5;
          fx.breath(a.rig.mouthWorld(tmp), fwd.set(Math.sin(a.yaw), 0, Math.cos(a.yaw)), a.rig.dims.h);
        }
      }
    }
    for (const r of lab) r.update(dt);
  });

  let celebrating = 0;
  const celebrate = () => {
    if (ctx.clock.elapsed - celebrating < 1) return;
    celebrating = ctx.clock.elapsed;
    for (const a of agents) a.celebrate(7.5 + Math.random());
    try {
      const pr = ctx.player.rig;
      pr.play('cheer');
      pr.emote('happy');
    } catch {
      /* ignore */
    }
  };
  ctx.events.on('finale:start', celebrate);

  return {
    get: (id: string): NpcHandle | undefined => byId.get(id),
    all: (): NpcHandle[] => agents.filter((a) => a.kind !== 'crowd'),
    celebrate,
  };
}

// ───────────────────────────── placement helpers ─────────────────────────────

function lawnFree(ctx: GameContext, x: number, z: number, r: number) {
  return ctx.layout.surfaceAt(x, z) === 'snow' && !ctx.colliders.blocked(x, z, r);
}

/** Two spots ~4 m apart on the snowy lawn ring around the plaza. */
function findLawnPair(ctx: GameContext, baseAngle: number, avoid: P2[]): [P2, P2] | null {
  const { radius } = ctx.layout.plaza;
  const r = (radius + ctx.layout.alley.r0) / 2;
  for (let k = 0; k < 24; k++) {
    const a = baseAngle + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.13;
    const half = 2.1 / r;
    const p1 = { x: Math.sin(a - half) * r, z: Math.cos(a - half) * r };
    const p2 = { x: Math.sin(a + half) * r, z: Math.cos(a + half) * r };
    if (avoid.some((q) => Math.hypot(q.x - p1.x, q.z - p1.z) < 5 || Math.hypot(q.x - p2.x, q.z - p2.z) < 5)) continue;
    if (lawnFree(ctx, p1.x, p1.z, 0.6) && lawnFree(ctx, p2.x, p2.z, 0.6) && !ctx.colliders.blocked((p1.x + p2.x) / 2, (p1.z + p2.z) / 2, 0.5)) return [p1, p2];
  }
  return null;
}

function findBenchSpot(ctx: GameContext): { x: number; z: number; yaw: number } | null {
  const r = ctx.layout.plaza.radius + 2.2;
  const DEG = Math.PI / 180;
  for (const deg of [160, 200, 20, 340, 112, 248, 68, 292, 135, 225]) {
    for (const dr of [0, 0.8, -0.6, 1.6]) {
      const a = deg * DEG;
      const x = Math.sin(a) * (r + dr);
      const z = Math.cos(a) * (r + dr);
      if (lawnFree(ctx, x, z, 1.15)) return { x, z, yaw: Math.atan2(-x, -z) };
    }
  }
  return null;
}

/** Make the conversation partner's mouth move while a line types, and react to the line's emotion. */
function hookDialogue(ctx: GameContext, get: (id: string) => Agent | undefined) {
  const dlg = ctx.ui?.dialogue as (typeof ctx.ui.dialogue & { __gvHooked?: boolean }) | undefined;
  if (!dlg || dlg.__gvHooked || typeof dlg.say !== 'function') return;
  const orig = dlg.say.bind(dlg);
  dlg.__gvHooked = true;
  const EMO: Record<string, EmoteKind | null> = { happy: 'happy', surprised: 'surprised', thinking: 'idea', sad: 'sweat', neutral: null };
  dlg.say = (text, opts) => {
    const id = ctx.conversations.active;
    const a = id ? get(id) : undefined;
    if (a) {
      a.rig.setTalking(true);
      a.talkT = Math.min(7, 0.5 + text.length * 0.032);
      const e = opts?.emotion ? EMO[opts.emotion] : null;
      if (e) a.emote(e);
      if (opts?.emotion === 'thinking') a.rig.play('think', { loop: false });
    }
    return orig(text, opts);
  };
}
