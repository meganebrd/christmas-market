import * as THREE from 'three';
import type { GameContext } from '../core/contracts';
import type { Layout, P2, WalkGraph } from '../world/layout';
import type { ZoneId } from '../config/types';
import type { Agent, Behaviour, World } from './agent';
import { GeoBuilder, M, box, cylinder, fluffy } from './factory/geo';
import { characterMaterial } from './factory/material';
import { wrapAngle } from './util';

const range = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

// ───────────────────────────── strolling visitors ─────────────────────────────

export interface Graph {
  nodes: P2[];
  adj: number[][];
  zoneOf: (ZoneId | null)[];
}

export function buildGraph(g: WalkGraph, layout: Layout): Graph {
  const adj: number[][] = g.nodes.map(() => []);
  for (const [a, b] of g.edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  const zoneOf = g.nodes.map((n) => {
    if (Math.hypot(n.x, n.z) < layout.alley.r1 + 1) return null;
    let best: ZoneId | null = null;
    let bd = Infinity;
    for (const z of Object.values(layout.zones)) {
      if (z.id === 'plaza' || !z.enabled) continue;
      const d = Math.hypot(n.x - z.center.x, n.z - z.center.z);
      if (d < bd) {
        bd = d;
        best = z.id;
      }
    }
    return best;
  });
  return { nodes: g.nodes, adj, zoneOf };
}

/** How many strollers browse each stall right now (keep it at ≤ 2 so the visitor finds room). */
const browsing = new Map<string, number>();

export function wanderBehaviour(ctx: GameContext, graph: Graph, opts: { lane: number; speed: number; start: number }): Behaviour {
  const layout = ctx.layout;
  let node = opts.start;
  let prev = -1;
  let mode: 'walk' | 'pause' | 'browse' | 'linger' = 'pause';
  let t = range(0.5, 3);
  let browseStall: string | null = null;
  const look = new THREE.Vector3();

  const goNext = (a: Agent) => {
    const nb = graph.adj[node];
    if (!nb || !nb.length) return;
    let choices = nb.filter((n) => n !== prev);
    if (!choices.length) choices = nb;
    // the alley ring is the heart of the market: prefer it a little
    const nxt = pick(choices);
    const from = graph.nodes[node];
    const to = graph.nodes[nxt];
    prev = node;
    node = nxt;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const l = Math.hypot(dx, dz) || 1;
    const lane = opts.lane * (graph.zoneOf[nxt] ? 0.4 : 1);
    a.walkTo({ x: to.x + (-dz / l) * lane, z: to.z + (dx / l) * lane }, opts.speed, 0.6, () => decide(a));
    mode = 'walk';
  };

  const nearStall = (a: Agent) => {
    const p = a.position;
    let best: (typeof layout.stalls)[number] | null = null;
    let bd = 7.5;
    for (const s of layout.stalls) {
      const d = Math.hypot(s.customerPoint.x - p.x, s.customerPoint.z - p.z);
      if (d < bd && (browsing.get(s.stallId) ?? 0) < 2) {
        bd = d;
        best = s;
      }
    }
    return best;
  };

  const decide = (a: Agent) => {
    const r = Math.random();
    const zone = graph.zoneOf[node];
    const stall = nearStall(a);
    if (stall && r < 0.42) {
      mode = 'browse';
      browseStall = stall.stallId;
      browsing.set(stall.stallId, (browsing.get(stall.stallId) ?? 0) + 1);
      // stand beside the counter spot, leaving the middle for the visitor
      const side = Math.random() < 0.5 ? 1 : -1;
      const along = { x: stall.front.z, z: -stall.front.x };
      const off = side * range(0.75, 1.25);
      const out = range(0.2, 0.6);
      const p = { x: stall.customerPoint.x + along.x * off + stall.front.x * out, z: stall.customerPoint.z + along.z * off + stall.front.z * out };
      a.walkTo(p, opts.speed * 0.9, 0.3, () => {
        a.face(stall.position);
        look.set(stall.keeperPoint.x, 1.05, stall.keeperPoint.z);
        a.rig.lookAt(look);
        t = range(4, 9);
        if (Math.random() < 0.35) setTimeout(() => a.emote(Math.random() < 0.5 ? 'love' : 'happy'), 1200 + Math.random() * 2000);
      });
      t = 99;
      return;
    }
    if (zone && r < 0.65) {
      const z = layout.zones[zone];
      for (let i = 0; i < 6; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random()) * z.radius * 0.55;
        const x = z.center.x + Math.sin(ang) * rr;
        const zz = z.center.z + Math.cos(ang) * rr;
        if (!ctx.colliders.blocked(x, zz, 0.35)) {
          mode = 'linger';
          a.walkTo({ x, z: zz }, opts.speed, 0.4, () => {
            t = range(6, 14);
            a.face(z.center);
            if (zone === 'bar' && Math.random() < 0.8) a.rig.play('drink');
            else if ((zone === 'fair' || zone === 'carousel') && Math.random() < 0.4) a.rig.play('clap', { loop: false });
          });
          t = 99;
          return;
        }
      }
    }
    if (r < 0.8) {
      mode = 'pause';
      t = range(1.5, 5);
      return;
    }
    goNext(a);
  };

  return {
    update(a, dt) {
      if (a.goal) return;
      t -= dt;
      if (t > 0) return;
      if (mode === 'browse' && browseStall) {
        browsing.set(browseStall, Math.max(0, (browsing.get(browseStall) ?? 1) - 1));
        browseStall = null;
      }
      a.rig.lookAt(null);
      if (a.rig.current === 'drink' || a.rig.current === 'clap') a.rig.play('idle');
      goNext(a);
    },
    resume(a) {
      a.rig.lookAt(null);
      a.rig.play('idle');
      t = range(1, 3);
    },
  };
}

/** A companion walking next to a leader and chatting with them whenever they stop. */
export function companionBehaviour(leader: Agent): Behaviour {
  let t = 0;
  let speaking = Math.random() < 0.5;
  let chatT = range(2, 4);
  const look = new THREE.Vector3();
  const side = Math.random() < 0.5 ? 1 : -1;
  return {
    update(a, dt) {
      t -= dt;
      const lp = leader.position;
      const ly = leader.yaw;
      const rx = Math.cos(ly) * side;
      const rz = -Math.sin(ly) * side;
      const moving = !!leader.goal && Math.hypot(leader.vel.x, leader.vel.z) > 0.2;
      if (moving) {
        if (t <= 0) {
          t = 0.3;
          a.walkTo({ x: lp.x + rx * 0.72 - Math.sin(ly) * 0.15, z: lp.z + rz * 0.72 - Math.cos(ly) * 0.15 }, leader.goalSpeed * 1.15, 0.2);
        }
        a.rig.setTalking(false);
        leader.rig.setTalking(false);
        return;
      }
      // stopped: stand by the leader and chat
      const d = Math.hypot(a.position.x - lp.x, a.position.z - lp.z);
      if (d > 1.3 && t <= 0) {
        t = 0.5;
        a.walkTo({ x: lp.x + rx * 0.75, z: lp.z + rz * 0.75 }, 1.5, 0.25);
        return;
      }
      if (a.goal) return;
      a.face(lp);
      a.rig.lookAt(look.set(lp.x, leader.rig.height * 0.85, lp.z));
      chatT -= dt;
      if (chatT <= 0) {
        chatT = range(2.2, 4.5);
        speaking = !speaking;
        a.rig.setTalking(speaking);
        leader.rig.setTalking(!speaking);
        if (Math.random() < 0.15) (speaking ? leader : a).emote(Math.random() < 0.6 ? 'happy' : 'note');
        if (!leader.rig.looking) leader.rig.lookAt(look.clone().set(a.position.x, a.rig.height * 0.85, a.position.z));
      }
    },
    resume(a) {
      a.rig.lookAt(null);
    },
  };
}

// ───────────────────────────── snowball fights ─────────────────────────────

let snowballGeo: THREE.BufferGeometry | null = null;
function snowballMesh() {
  if (!snowballGeo) {
    const g = new GeoBuilder();
    g.add(fluffy(0.05, 10, 8, 0.12, 9, 2), { color: '#f4f7ff', bone: 0, emit: 0.2 });
    snowballGeo = g.buildStatic();
  }
  const m = new THREE.Mesh(snowballGeo, characterMaterial());
  m.visible = false;
  return m;
}

/** Two children throwing snowballs at each other on a lawn, giggling. */
export function createSnowballFight(ctx: GameContext, w: () => World, kids: [Agent, Agent], spots: [P2, P2]) {
  const ball = snowballMesh();
  ctx.scene.add(ball);
  let turn = 0;
  let phase: 'ready' | 'scoop' | 'throw' | 'fly' | 'react' = 'ready';
  let t = range(0.5, 2);
  let flight = { from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, dur: 0.75 };
  let lastFrame = -1;
  let dodge = 0;
  const tmp = new THREE.Vector3();

  const shared = (dt: number) => {
    const world = w();
    if (lastFrame === world.t) return;
    lastFrame = world.t;
    const thrower = kids[turn];
    const target = kids[1 - turn];
    if (thrower.held || target.held || thrower.celebrating || target.celebrating) {
      ball.visible = false;
      return;
    }
    // keep facing each other between throws
    for (let i = 0; i < 2; i++) if (!kids[i].goal) kids[i].face(kids[1 - i].position);
    t -= dt;
    switch (phase) {
      case 'ready':
        if (t <= 0) {
          phase = 'scoop';
          thrower.rig.play('scoop');
          t = 1.4;
        }
        break;
      case 'scoop':
        if (t <= 0) {
          phase = 'throw';
          thrower.rig.play('throw');
          t = 0.52;
        }
        break;
      case 'throw':
        if (t <= 0) {
          phase = 'fly';
          thrower.rig.handWorld('R', flight.from);
          flight.to.set(target.position.x, target.rig.height * 0.6, target.position.z);
          flight.t = 0;
          flight.dur = 0.55 + flight.from.distanceTo(flight.to) * 0.05;
          ball.visible = true;
          // sometimes the target dodges
          dodge = Math.random() < 0.3 ? (Math.random() < 0.5 ? 1 : -1) : 0;
          if (dodge) {
            const sp = spots[1 - turn];
            const dx = spots[turn].x - sp.x;
            const dz = spots[turn].z - sp.z;
            const l = Math.hypot(dx, dz) || 1;
            target.walkTo({ x: sp.x + (-dz / l) * 0.9 * dodge, z: sp.z + (dx / l) * 0.9 * dodge }, 3.2, 0.15);
          }
          const dp = world.player.position;
          if (Math.hypot(dp.x - thrower.position.x, dp.z - thrower.position.z) < 16) {
            try {
              ctx.audio.sfx('throw', { volume: 0.25, position: flight.from.clone() });
            } catch {
              /* stub */
            }
          }
        }
        break;
      case 'fly': {
        flight.t += dt / flight.dur;
        const u = Math.min(1, flight.t);
        tmp.lerpVectors(flight.from, flight.to, u);
        tmp.y += Math.sin(u * Math.PI) * 0.9;
        ball.position.copy(tmp);
        if (u >= 1) {
          ball.visible = false;
          phase = 'react';
          t = 1.3;
          world.fx.snowBurst(tmp, 1);
          const hit = !dodge;
          if (hit) {
            target.emote(Math.random() < 0.5 ? 'surprised' : 'happy');
            target.rig.play('cheer', { loop: false });
          } else {
            target.emote('happy');
            thrower.emote('sweat');
          }
          const dp = world.player.position;
          if (Math.hypot(dp.x - tmp.x, dp.z - tmp.z) < 16) {
            try {
              ctx.audio.sfx('snow-hit', { volume: 0.3, position: tmp.clone() });
            } catch {
              /* stub */
            }
          }
        }
        break;
      }
      case 'react':
        if (t <= 0) {
          // back to the spot, swap roles
          target.walkTo(spots[1 - turn], 2.2, 0.2);
          phase = 'ready';
          turn = 1 - turn;
          t = range(0.6, 1.6);
          if (Math.random() < 0.2) thrower.rig.play('clap', { loop: false });
        }
        break;
    }
  };
  const behaviour: Behaviour = {
    update(_a, dt) {
      shared(dt);
    },
    resume(a) {
      a.rig.play('idle');
      ball.visible = false;
      phase = 'ready';
      t = 1.5;
    },
  };
  return behaviour;
}

// ───────────────────────────── skaters ─────────────────────────────

export function skaterBehaviour(center: P2, rx: number, rz: number, speed: number, dir: number, phase: number): Behaviour {
  let theta = phase;
  let spinT = range(10, 25);
  let spin = -1;
  return {
    update(a, dt) {
      a.data.manualAnim = true;
      const r = (rx + rz) / 2;
      theta += ((speed / r) * dt * dir) % (Math.PI * 2);
      const x = center.x + Math.sin(theta) * rx;
      const z = center.z + Math.cos(theta) * rz;
      const p = a.position;
      const vx = (x - p.x) / Math.max(dt, 1e-3);
      const vz = (z - p.z) / Math.max(dt, 1e-3);
      p.set(x, 0, z);
      // tangent heading
      const tx = Math.cos(theta) * rx * dir;
      const tz = -Math.sin(theta) * rz * dir;
      let yaw = Math.atan2(tx, tz);
      spinT -= dt;
      if (spin >= 0) {
        spin += dt / 1.3;
        yaw += spin * Math.PI * 2;
        if (spin >= 1) spin = -1;
      } else if (spinT <= 0) {
        spinT = range(14, 30);
        spin = 0;
        a.rig.play('cheer', { loop: false });
        setTimeout(() => a.emote('happy'), 300);
      }
      a.faceYaw = wrapAngle(yaw);
      a.yaw = a.faceYaw;
      a.rig.lean = -dir * 0.16;
      if (a.rig.current !== 'cheer') a.rig.locomote('skate', Math.hypot(vx, vz) || speed);
    },
    resume(a) {
      a.rig.play('skate');
    },
  };
}

// ───────────────────────────── bench couple ─────────────────────────────

let benchGeo: THREE.BufferGeometry | null = null;

/** A cosy wooden bench (with snow on the backrest). Returns the seat height. */
export function buildBench(ctx: GameContext, x: number, z: number, yaw: number): number {
  if (!benchGeo) {
    const g = new GeoBuilder();
    const wood = '#8a5a3b';
    const iron = '#2f2f38';
    for (let i = 0; i < 3; i++) g.add(box(1.5, 0.035, 0.11), { color: i % 2 ? '#7a4e33' : wood, bone: 0, matrix: M(0, 0.3, -0.13 + i * 0.12) });
    for (let i = 0; i < 2; i++) g.add(box(1.5, 0.1, 0.03), { color: wood, bone: 0, matrix: M(0, 0.48 + i * 0.13, -0.24, -0.15, 0, 0) });
    g.add(box(1.46, 0.04, 0.08), { color: '#eef3fb', bone: 0, emit: 0.1, matrix: M(0, 0.69, -0.26, -0.15, 0, 0, 1, 1, 1) });
    for (const sx of [-0.62, 0.62]) {
      g.add(box(0.05, 0.3, 0.05), { color: iron, bone: 0, matrix: M(sx, 0.15, 0.12) });
      g.add(box(0.05, 0.7, 0.05), { color: iron, bone: 0, matrix: M(sx, 0.35, -0.2, -0.15, 0, 0) });
      g.add(box(0.05, 0.05, 0.42), { color: iron, bone: 0, matrix: M(sx, 0.27, -0.03) });
      g.add(cylinder(0.025, 0.025, 0.3, 6), { color: iron, bone: 0, matrix: M(sx, 0.42, 0.12, Math.PI / 2, 0, 0) });
    }
    benchGeo = g.buildStatic();
  }
  const m = new THREE.Mesh(benchGeo, characterMaterial());
  m.position.set(x, 0, z);
  m.rotation.y = yaw;
  m.castShadow = ctx.quality.shadows;
  m.receiveShadow = ctx.quality.shadows;
  m.name = 'bench';
  ctx.scene.add(m);
  ctx.colliders.addBox(x, z, 0.8, 0.3, yaw, 'prop');
  return 0.32;
}

/** Two friends on a bench: dangling feet, chatting, sometimes a little heart. */
export function benchBehaviour(other: () => Agent, first: boolean): Behaviour {
  let speaking = first;
  let t = range(1, 3);
  const look = new THREE.Vector3();
  return {
    update(a, dt) {
      a.data.manualAnim = true;
      const o = other();
      t -= dt;
      if (t <= 0) {
        t = range(2.5, 5);
        speaking = !speaking;
        a.rig.play(speaking ? 'sit-talk' : 'sit');
        if (!speaking && Math.random() < 0.15) a.emote(Math.random() < 0.5 ? 'love' : 'happy');
      }
      a.rig.lookAt(Math.random() < 0.995 ? look.set(o.position.x, o.rig.height * 0.75 + 0.15, o.position.z) : null);
    },
    resume(a) {
      a.rig.play('sit');
    },
  };
}
