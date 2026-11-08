import * as THREE from 'three';
import type { CastRole } from '../config/types';
import type { Agent, Behaviour, World } from './agent';
import type { AnyAnim } from './anims';
import { firstSentence } from './util';

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const range = (a: number, b: number) => a + Math.random() * (b - a);
const GREETINGS = ['Bonsoir !', 'Bienvenue !', 'Bonsoir à toi !', 'Coucou !', 'Entre donc !'];

/** Updates `out` to the head of the player (for look-at). */
function playerHead(w: World, out: THREE.Vector3) {
  const p = w.player.position;
  return out.set(p.x, p.y + 0.95, p.z);
}

function headOf(a: Agent, out: THREE.Vector3) {
  const p = a.position;
  return out.set(p.x, p.y + a.rig.height * 0.85, p.z);
}

// ───────────────────────────── vendors ─────────────────────────────

/** A keeper behind the counter: tidies the stall, sips tea, watches passers-by, greets the visitor. */
export function vendorBehaviour(home: { x: number; z: number; yaw: number }): Behaviour {
  let mode: 'idle' | 'arrange' | 'drink' | 'think' = 'idle';
  let t = range(1, 4);
  let greeted = false;
  let atCounter = false;
  let lookT = 0;
  let lookAgent: Agent | null = null;
  let side = 0;
  const look = new THREE.Vector3();

  const choose = (a: Agent) => {
    const r = Math.random();
    if (r < 0.38) {
      mode = 'idle';
      t = range(3, 7);
      a.rig.play('idle');
    } else if (r < 0.74) {
      mode = 'arrange';
      t = range(3, 6);
      side = (Math.random() - 0.5) * 0.9;
      a.rig.play('arrange');
    } else if (r < 0.9) {
      mode = 'drink';
      t = range(5.5, 10);
      a.rig.play('drink');
    } else {
      mode = 'think';
      t = range(3, 5);
      a.rig.play('think');
    }
  };

  return {
    update(a, dt, w) {
      const pp = w.player.position;
      const dPlayer = Math.hypot(pp.x - home.x, pp.z - home.z);
      const explore = w.ctx.mode === 'explore';
      if (!greeted && dPlayer < 6 && explore) {
        greeted = true;
        a.rig.play('wave');
        mode = 'idle';
        t = 3;
        if (w.canBubble()) w.bubble(a, pick(GREETINGS));
      }
      const nowAtCounter = dPlayer < 2.9;
      if (nowAtCounter && !atCounter && greeted && Math.random() < 0.5) a.emote('happy');
      atCounter = nowAtCounter;

      // who to look at
      lookT -= dt;
      if (dPlayer < 6.5) {
        a.rig.lookAt(playerHead(w, look));
        lookAgent = null;
      } else {
        if (lookT <= 0) {
          lookT = range(2, 4.5);
          lookAgent = null;
          let best = 5.5;
          for (const o of w.agents) {
            if (o.kind !== 'crowd') continue;
            const d = Math.hypot(o.position.x - home.x, o.position.z - home.z);
            if (d < best && Math.random() < 0.7) {
              best = d;
              lookAgent = o;
            }
          }
        }
        a.rig.lookAt(lookAgent ? headOf(lookAgent, look) : null);
      }

      t -= dt;
      if (t <= 0) {
        if (nowAtCounter) {
          mode = 'idle';
          t = range(3, 5);
          a.rig.play(Math.random() < 0.2 ? 'clap' : 'idle', { loop: false });
        } else choose(a);
      }
      a.faceYaw = home.yaw + (mode === 'arrange' && dPlayer > 6.5 ? side : 0);
    },
    resume(a) {
      mode = 'idle';
      t = range(2, 4);
      a.rig.play('idle');
    },
  };
}

// ───────────────────────────── cast ─────────────────────────────

interface Activity {
  anim: AnyAnim;
  dur: [number, number];
  weight: number;
  /** Look at the visitor during this activity (0..1 probability). */
  attentive?: number;
}

const ROLE_ACTIVITIES: Partial<Record<CastRole, Activity[]>> = {
  guide: [
    { anim: 'lantern', dur: [7, 13], weight: 5, attentive: 1 },
    { anim: 'point', dur: [2.6, 2.6], weight: 1, attentive: 0 },
  ],
  barista: [
    { anim: 'stir', dur: [7, 12], weight: 4, attentive: 0.4 },
    { anim: 'wipe', dur: [5, 9], weight: 3, attentive: 0.8 },
    { anim: 'idle', dur: [2, 4], weight: 1, attentive: 1 },
  ],
  cook: [
    { anim: 'cook', dur: [10, 18], weight: 5, attentive: 0.35 },
    { anim: 'idle', dur: [2, 3.5], weight: 1, attentive: 1 },
  ],
  'chestnut-seller': [
    { anim: 'shake', dur: [6, 10], weight: 4, attentive: 0.5 },
    { anim: 'invite', dur: [2.6, 2.6], weight: 1.5, attentive: 1 },
    { anim: 'idle', dur: [2, 4], weight: 1, attentive: 1 },
  ],
  glassblower: [
    { anim: 'blow', dur: [8.4, 12.6], weight: 4, attentive: 0.15 },
    { anim: 'think', dur: [3, 5], weight: 1.5, attentive: 0.3 },
    { anim: 'idle', dur: [2, 3], weight: 1, attentive: 1 },
  ],
  musician: [
    { anim: 'accordion', dur: [18, 34], weight: 6, attentive: 0.5 },
    { anim: 'idle', dur: [2.5, 4], weight: 1, attentive: 1 },
  ],
  stargazer: [
    { anim: 'spyglass', dur: [7, 11], weight: 3, attentive: 0 },
    { anim: 'stargaze', dur: [6, 9], weight: 3, attentive: 0 },
    { anim: 'point', dur: [2.6, 2.6], weight: 1, attentive: 0 },
  ],
  'carousel-keeper': [
    { anim: 'idle', dur: [4, 7], weight: 3, attentive: 1 },
    { anim: 'invite', dur: [2.6, 2.6], weight: 2, attentive: 1 },
    { anim: 'clap', dur: [1.6, 2.2], weight: 0.6, attentive: 1 },
  ],
  'fair-keeper': [
    { anim: 'idle', dur: [3.5, 6], weight: 3, attentive: 1 },
    { anim: 'invite', dur: [2.6, 2.6], weight: 2.5, attentive: 1 },
    { anim: 'clap', dur: [1.6, 2.2], weight: 0.8, attentive: 1 },
  ],
};

const GREETERS = new Set<CastRole>(['guide', 'carousel-keeper', 'fair-keeper', 'chestnut-seller', 'barista']);

/** Story & ambience characters standing at their post with role behaviours. */
export function castBehaviour(role: CastRole, home: { x: number; z: number; yaw: number }, lines: string[]): Behaviour {
  const acts = ROLE_ACTIVITIES[role] ?? [{ anim: 'idle', dur: [4, 8], weight: 1, attentive: 1 } as Activity];
  let act = acts[0];
  let t = range(0.5, 2);
  let attentive = true;
  let greeted = false;
  let bubbleT = range(12, 30);
  let notes = 0;
  const look = new THREE.Vector3();
  const total = acts.reduce((s, a) => s + a.weight, 0);
  const lineBubbles = lines.map((l) => firstSentence(l, 46)).filter((l) => l.length > 2);

  const next = (a: Agent) => {
    let r = Math.random() * total;
    let chosen = acts[0];
    for (const x of acts) {
      r -= x.weight;
      if (r <= 0) {
        chosen = x;
        break;
      }
    }
    // never twice the same one-shot in a row
    if (chosen === act && chosen.dur[0] === chosen.dur[1] && acts.length > 1) chosen = acts[0];
    act = chosen;
    t = range(act.dur[0], act.dur[1]);
    attentive = Math.random() < (act.attentive ?? 1);
    a.rig.play(act.anim, { loop: act.dur[0] !== act.dur[1] });
    if (act.anim === 'point') setTimeout(() => a.emote(role === 'stargazer' ? 'idea' : 'happy'), 600);
  };

  return {
    update(a, dt, w) {
      if (!a.data.started) {
        a.data.started = true;
        next(a);
        a.data.onEvent = (name: string) => {
          if (name === 'note' && ++notes % 3 === 0) a.emote('note');
          else if (name === 'flip' && Math.random() < 0.25) setTimeout(() => a.emote('happy'), 500);
        };
      }
      const pp = w.player.position;
      const dPlayer = Math.hypot(pp.x - home.x, pp.z - home.z);
      const explore = w.ctx.mode === 'explore';
      if (GREETERS.has(role) && !greeted && dPlayer < 7 && explore) {
        greeted = true;
        a.rig.play(role === 'carousel-keeper' || role === 'fair-keeper' ? 'invite' : 'wave');
        t = 2.8;
        attentive = true;
        if (w.canBubble()) w.bubble(a, role === 'guide' ? 'Bonsoir, voyageur !' : pick(GREETINGS));
      }
      a.rig.lookAt(attentive && dPlayer < 6 ? playerHead(w, look) : null);
      // invite toward the visitor if near
      a.faceYaw = (act.anim === 'invite' || act.anim === 'clap') && dPlayer < 9 ? Math.atan2(pp.x - home.x, pp.z - home.z) : home.yaw;

      // a rare ambient line
      bubbleT -= dt;
      if (bubbleT <= 0) {
        bubbleT = range(28, 55);
        if (lineBubbles.length && dPlayer < 8 && explore && w.canBubble()) w.bubble(a, pick(lineBubbles), 3200);
      }

      t -= dt;
      if (t <= 0) next(a);
    },
    resume(a) {
      t = 0.5;
      a.rig.play('idle');
    },
  };
}

/** A grown-up or a child pottering around a small area (cast villagers & children). */
export function potterBehaviour(center: { x: number; z: number }, radius: number, playful: boolean): Behaviour {
  let t = range(1, 3);
  return {
    update(a, dt, w) {
      if (a.goal) return;
      t -= dt;
      if (t > 0) return;
      t = range(playful ? 1.5 : 3, playful ? 4 : 8);
      const r = Math.random();
      if (playful && r < 0.2) {
        a.rig.play(Math.random() < 0.5 ? 'cheer' : 'clap', { loop: false });
        return;
      }
      for (let i = 0; i < 6; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random()) * radius;
        const x = center.x + Math.sin(ang) * rr;
        const z = center.z + Math.cos(ang) * rr;
        if (!w.ctx.colliders.blocked(x, z, 0.35)) {
          a.walkTo({ x, z }, playful ? (Math.random() < 0.5 ? 4.2 : 2) : 1.1, 0.4);
          break;
        }
      }
    },
  };
}
