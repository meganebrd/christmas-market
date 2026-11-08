import * as THREE from 'three';
import type { GameContext, StoryApi } from '../core/contracts';
import { Sparks, updatePointScale } from './fx';
import { tickGlass } from './starMesh';
import { buildPlan, npcExists, treeSockets } from './stars';
import { TreeStars } from './treeStars';
import { Pickups } from './pickups';
import { Quest } from './quest';
import { Beacon } from './beacon';
import { Fireworks } from './fireworks';
import { Intro } from './intro';
import { Finale } from './finale';
import { Hints } from './hints';
import { registerCast } from './cast';
import { castByRole } from './stars';
import { delay } from './timeline';
import { FINALE_TOAST, OBJECTIVES } from './text';
import type { StarId, StoryRuntime } from './types';

/**
 * Givrelune's story: "the village that the moon frosts every winter". Tonight the market opens, but the
 * North wind blew away the seven glass stars of the Grand Sapin. Céleste, the old lamplighter, asks the
 * visitor to find them; when they are all back, the tree blazes and fireworks light up the plaza.
 *
 *   intro.ts     the opening fly-over (light wave, gust, glints)      finale.ts / fireworks.ts  the grand finale
 *   stars.ts     where each star is (and relocation if a zone is off)  quest.ts   progress + star flights
 *   pickups.ts   hidden glass stars                                    treeStars.ts  found stars on the tree
 *   beacon.ts    light column above Céleste, quest-giver icons         hints.ts   first-time tips
 *   cast/        conversations of Céleste, Barnabé, Paulette, Firmin, Aubin, Odile, Léon, Noé, Anatole…
 */
export function createStory(ctx: GameContext): StoryApi {
  const group = new THREE.Group();
  group.name = 'story';
  ctx.scene.add(group);
  const capacity = ctx.quality.tier === 'high' ? 4500 : ctx.quality.tier === 'medium' ? 3000 : 1600;
  const sparks = new Sparks(capacity);
  group.add(sparks.points);
  const guide = castByRole(ctx, 'guide');
  const plan = buildPlan(ctx);
  // the stars already found decide the tree's light (and let the Grand Sapin place its sockets)
  const savedFound = plan.filter((s) => ctx.save.data.stars?.includes(s.id)).length;
  const introWillPlay =
    ctx.config.story.enabled && !ctx.flags.has('skipIntro') && !ctx.flags.has('autostart') && (!ctx.save.data.introSeen || ctx.flags.has('intro'));
  ctx.landmarks.setTreeLight(introWillPlay || !plan.length ? (plan.length ? 0 : 1) : savedFound / plan.length);
  const sockets = treeSockets(ctx, Math.max(1, plan.length), group);

  let afterQueue: (() => void)[] = [];
  let cancelWarm: (() => void) | null = null;
  let quest: Quest;
  let beacon: Beacon;
  let finale: Finale;
  let intro: Intro;

  const metGuide = () => !!ctx.save.flag<boolean>('story:metGuide');
  const finaleSeen = () => !!ctx.save.flag<boolean>('finale');
  const guideNpc = () => !!guide && npcExists(ctx, guide.id);

  const objective = (): string => {
    if (!plan.length || finaleSeen()) return OBJECTIVES.stroll;
    if (quest.complete()) return guide && guideNpc() ? OBJECTIVES.backToGuide(guide.name) : OBJECTIVES.lightTree;
    if (guide && guideNpc() && !metGuide()) return OBJECTIVES.meetGuide(guide.name);
    return OBJECTIVES.findStars;
  };

  const story: StoryRuntime = {
    ctx,
    group,
    sparks,
    plan,
    guide,
    found: () => quest.found,
    isFound: (id) => quest.found.has(id as StarId),
    complete: () => quest.complete(),
    grant: (id, from) => quest.grant(id, from),
    refreshQuest() {
      if (!plan.length) return;
      try {
        ctx.ui.setQuest(quest.state(objective()));
      } catch (err) {
        console.error(err);
      }
    },
    objective,
    after(fn) {
      afterQueue.push(fn);
    },
    warmUp(level, hold = 20) {
      cancelWarm?.();
      ctx.post.setWarmth(level, 1.6);
      cancelWarm = delay(ctx, hold, () => {
        cancelWarm = null;
        ctx.post.setWarmth(0, 6);
      });
    },
    playFinale: (opts) => playFinale(opts),
    finaleRunning: () => finale.running,
    setBeacon: (on) => beacon.setOn(on),
    hasNpc: (castId) => npcExists(ctx, castId),
    reducedMotion: () => !!ctx.save.data.settings?.reducedMotion,
    isTouch: () => ctx.quality.isTouch || ctx.input.lastDevice === 'touch',
  };

  const tree = new TreeStars(sockets);
  group.add(tree.group);
  const pickups = new Pickups(story);
  quest = new Quest(story, tree, pickups);
  beacon = new Beacon(story);
  const fireworks = new Fireworks(story);
  const hints = new Hints(story);
  pickups.spawnAll();

  const shouldBeacon = () => plan.length > 0 && guideNpc() && (!metGuide() || (quest.complete() && !finaleSeen()));

  /** The state after the intro (or when it is skipped): lights on, HUD, objective, beacon, tips. */
  const enterExplore = () => {
    ctx.lights.setAll(1);
    ctx.landmarks.setTreeLight(quest.complete() ? 1 : quest.treeLevel());
    ctx.ui.letterbox(false);
    ctx.ui.setSkippable(null);
    ctx.ui.setHudVisible(true);
    story.refreshQuest();
    beacon.setOn(shouldBeacon());
    hints.start();
  };

  intro = new Intro(story, tree, pickups, enterExplore, () => quest.restoreTree());
  finale = new Finale(story, tree, fireworks, (replay) => {
    ctx.save.flag('finale', true);
    story.refreshQuest();
    beacon.setOn(false);
    ctx.ui.toast(replay ? 'Quel spectacle ! Givrelune s’en souviendra longtemps.' : FINALE_TOAST, { icon: '🎄', duration: replay ? 4000 : 7000 });
  });

  async function playFinale(opts: { replay?: boolean } = {}) {
    if (finale.running || intro.running) return;
    if (!opts.replay && !quest.complete()) return;
    beacon.hideNow();
    await finale.play(opts);
  }

  // ── initial state ──
  if (introWillPlay) {
    // the title backdrop: the market is still asleep, only the houses' windows glow
    ctx.lights.setAll(0);
    ctx.lights.setAll(1, 'window');
    ctx.landmarks.setTreeLight(0);
    pickups.hideAll();
  } else ctx.landmarks.setTreeLight(quest.complete() ? 1 : quest.treeLevel());
  if (finaleSeen()) tree.setGlow(1.25);

  // ── per-frame ──
  let simT = 0;
  const tick = (dt: number, t: number) => {
    t += simT;
    updatePointScale(ctx);
    tickGlass(t);
    pickups.update(dt, t);
    quest.update(dt, t);
    tree.update(dt, t);
    beacon.update(dt, t);
    intro.update(dt);
    finale.update(dt);
    fireworks.update(dt);
    hints.update(dt);
    sparks.update(dt);
  };
  ctx.addSystem(tick);

  /** Run `fn` once the visitor is back to exploring (mini-game result card closed…), or after `max` s. */
  const whenCalm = (fn: () => void, max = 8, settle = 0.4) => {
    let t = 0;
    let calm = 0;
    const off = ctx.addSystem((dt) => {
      t += dt;
      calm = ctx.mode === 'explore' && !ctx.ui.isBlocking() ? calm + dt : 0;
      if (calm >= settle || t >= max) {
        off();
        fn();
      }
    });
  };

  // ── events ──
  ctx.events.on('conversation:start', ({ id }) => {
    if (guide && id === 'cast:' + guide.id) beacon.setOn(false);
  });
  ctx.events.on('conversation:end', ({ id }) => {
    if (guide && id === 'cast:' + guide.id && !finale.running) beacon.setOn(shouldBeacon());
    const q = afterQueue;
    afterQueue = [];
    if (q.length) delay(ctx, 0.05, () => q.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error('[givrelune] story action failed', err);
      }
    }));
  });
  ctx.events.on('minigame:end', ({ id, won }) => {
    const s = plan.find((p) => p.mode === 'minigame' && p.gameId === id);
    if (!s || quest.found.has(s.id)) return;
    if (won) whenCalm(() => quest.grant(s.id), 10, 0.5);
    else {
      const who = s.role ? castByRole(ctx, s.role) : null;
      const npc = who ? ctx.npcs.get('cast:' + who.id) : undefined;
      if (npc)
        whenCalm(() => {
          const lines = ['Presque ! Réessaie quand tu veux.', 'Pas loin ! L’étoile t’attend encore.', 'Ça viendra ! On remet ça ?'];
          ctx.ui.bubble(npc.rig.root, lines[Math.floor(Math.random() * lines.length)], { duration: 3500 });
        }, 6);
    }
  });
  ctx.events.on('quest:complete', () => {
    story.refreshQuest();
    if (!guideNpc()) delay(ctx, 4.5, () => whenCalm(() => void playFinale(), 20));
    else ctx.ui.toast(`Toutes les étoiles sont retrouvées ! Retourne voir ${guide!.name}.`, { icon: '✨', duration: 5500 });
  });

  const castIds = registerCast(ctx, story);

  const api = {
    playIntro: () => intro.play(),
    skipIntro() {
      if (intro.running) {
        void intro.skip();
        return;
      }
      enterExplore();
    },
    collectStar: (id: string) => quest.grant(id as StarId),
    quest: () => quest.state(objective()),
    castIds,
    // extras for the debug console (`__givrelune.ctx.story`)
    playFinale: (opts?: { replay?: boolean }) => playFinale(opts),
    scrubIntro: (t: number) => intro.scrub(t),
    scrubFinale: (t: number) => finale.scrub(t),
    showBeacon: (on = true) => beacon.setOn(on),
    /** Debug / visual checks: step the story's own animations by `seconds` (star flights, sparks…). */
    advance(seconds: number) {
      const dt = 1 / 30;
      for (let k = 0; k < seconds / dt; k++) {
        simT += dt;
        tick(dt, ctx.clock.elapsed);
      }
    },
    fireworks: (seconds = 20) => fireworks.start(seconds),
    collectAll: () => plan.forEach((s) => quest.grant(s.id)),
    plan,
  };
  return api;
}
