/**
 * Givrelune's cosy mini-games. Five of the seven glass stars are won here:
 *
 *   flocons   · La Pluie d'Étoiles     (belvédère)  walk under golden snowflakes and catch them
 *   chamboule · Chamboule-Neige        (fête foraine) knock tin cans off the counter with snowballs
 *   crepes    · Les Crêpes de Paulette (gourmandises) flip crêpes at the golden moment, pick a topping
 *   verrier   · Le Souffle du Verrier  (atelier)    blow a glass bauble that follows the moving ring
 *   manege    · Le Pompon du Manège    (manège)     ride the carousel and grab the pompon
 *
 * Flow of every game (shared here): fade → props & camera → keeper explains the rules → 3-2-1 →
 * play → result card → save best score → clean up → back to exploring → `minigame:end`
 * (the story module awards the star on a win).
 *
 * Test hook: `window.__givreluneMg = { autoplay: true, outcome: 'win' | 'lose', speed: 1 }` before
 * `__givrelune.startMinigame(id)`; the outcome is written to `__givreluneMg.last`.
 */
import * as THREE from 'three';
import type { GameContext, MinigameApi } from '../core/contracts';
import { autoplayOpts, groundDecal, mgLog, Session, softDiscTexture, type MinigameDef, type Outcome } from './common';
import { Fx } from './fx';
import { flocons } from './flocons';
import { chamboule } from './chamboule';
import { crepes } from './crepes';
import { verrier } from './verrier';
import { manege } from './manege';

export const MINIGAMES: MinigameDef[] = [flocons, chamboule, crepes, verrier, manege];

export function createMinigames(ctx: GameContext): MinigameApi {
  const enabled = (d: MinigameDef) => !!ctx.layout.zones[d.zone]?.enabled;
  let running: string | null = null;
  let fx: Fx | null = null;

  // persistent decorations (keepsake ornaments, fallback carousel…)
  for (const d of MINIGAMES) {
    if (!enabled(d) || !d.boot) continue;
    try {
      d.boot(ctx);
    } catch (err) {
      console.error(`[givrelune] minigame "${d.id}" boot failed`, err);
    }
  }

  // "Jouer" spots: a soft golden ring on the ground + an interactable
  const markers: THREE.Object3D[] = [];
  const ringTex = softDiscTexture('ring');
  const poolTex = softDiscTexture('pool');
  for (const d of MINIGAMES) {
    if (!enabled(d)) continue;
    let spot;
    try {
      spot = d.spot(ctx);
    } catch (err) {
      console.error(`[givrelune] minigame "${d.id}" has no spot`, err);
      continue;
    }
    const marker = new THREE.Group();
    marker.name = `minigame-marker-${d.id}`;
    const ring = groundDecal(ringTex, '#ffc56b', 1.25, { additive: true, opacity: 0.55 });
    const pool = groundDecal(poolTex, '#ffb347', 1.6, { additive: true, opacity: 0.25 });
    ring.position.y = 0.025;
    pool.position.y = 0.02;
    marker.add(pool, ring);
    marker.position.set(spot.position.x, 0, spot.position.z);
    ctx.scene.add(marker);
    markers.push(marker);
    const ringMat = ring.material as THREE.MeshBasicMaterial;
    const phase = Math.random() * 6;
    ctx.addSystem((_dt, t) => {
      if (!marker.visible) return;
      const won = ctx.save.data.minigames[d.id]?.won;
      ringMat.opacity = (won ? 0.28 : 0.5) + Math.sin(t * 2.2 + phase) * 0.15;
      ring.scale.setScalar(1 + Math.sin(t * 2.2 + phase) * 0.04);
    });
    ctx.interactables.add({
      id: `minigame:${d.id}`,
      position: new THREE.Vector3(spot.position.x, 0, spot.position.z),
      // small radius + priority above the keepers (2): it wins only when the visitor stands on the ring,
      // so the keeper next to it stays reachable a step away
      radius: 0.9,
      label: `Jouer · ${d.title}`,
      priority: 3,
      promptHeight: 1.9,
      objects: [pool, ring],
      enabled: () => running === null && ctx.mode === 'explore',
      onInteract: () => void api.start(d.id),
    });
  }

  async function start(id: string): Promise<{ won: boolean; score: number }> {
    const def = MINIGAMES.find((d) => d.id === id);
    if (!def || !enabled(def)) {
      console.warn(`[givrelune] unknown or disabled mini-game "${id}"`);
      return { won: false, score: 0 };
    }
    if (running || ctx.mode === 'loading' || ctx.mode === 'title' || ctx.mode === 'cinematic') return { won: false, score: 0 };
    running = id;
    fx ??= new Fx();
    for (const m of markers) m.visible = false;
    mgLog(`start ${id}`);

    const s = new Session(ctx, def, fx);
    let outcome: Outcome = { won: false, score: 0, text: '' };
    let aborted = false;
    try {
      ctx.events.emit('minigame:start', { id });
      try {
        if (ctx.ui.dialogue.isOpen()) ctx.ui.dialogue.close();
      } catch {
        /* ignore */
      }
      ctx.setMode('minigame');
      ctx.player.setControlEnabled(false);
      ctx.ui.setPrompt(null);
      s.sfx('whoosh', { volume: 0.45 });
      await ctx.fade(1, 420);
      // a conversation that started us may have just ended: take the controls back
      ctx.setMode('minigame');
      ctx.player.setControlEnabled(false);
      await def.setup(s);
      // the keeper stops what they are doing and watches the visitor play
      const npc = s.keeper.npc;
      if (npc) {
        try {
          npc.hold(ctx.player.position.clone());
          s.scope.onDispose(() => npc.release());
        } catch {
          /* ignore */
        }
      }
      s.cam.snap();
      s.warmup();
      await s.frames(2);
      void ctx.fade(0, 520);
      s.hud({ hint: def.hint(s.device) });
      // from here on the visitor may quit (Échap or the UI's "Quitter" button), even during the rules / 3-2-1
      s.setAbortable(true);
      const game = (async (): Promise<Outcome | 'abort'> => {
        await s.rules(def.rules);
        if (s.quit) return 'abort';
        mgLog(`countdown ${id}`);
        await s.countdown();
        if (s.quit) return 'abort';
        ctx.player.setControlEnabled(!!def.playerControl);
        s.playing = true;
        s.time = 0;
        mgLog(`play ${id}`);
        return def.play(s);
      })();
      void game.catch(() => undefined); // a late failure after quitting must not surface as unhandled
      const res = await Promise.race([game, s.aborted]);
      s.setAbortable(false);
      s.playing = false;
      if (res === 'abort') aborted = true;
      else outcome = res;
    } catch (err) {
      console.error(`[givrelune] mini-game "${id}" failed`, err);
      aborted = true;
    }

    ctx.player.setControlEnabled(false);
    s.hud(null);
    const prev = ctx.save.data.minigames[id];
    if (!aborted) {
      mgLog(`result ${id} won=${outcome.won} score=${outcome.score}`);
      let text = outcome.text;
      if (prev && outcome.score > prev.best) text += ' Nouveau record !';
      if (outcome.won && !prev?.won && ctx.config.story?.enabled !== false) text += ' Une étoile de verre brille pour toi.';
      await showResult(s, { title: def.title, text, won: outcome.won });
    } else mgLog(`aborted ${id}`);
    ctx.save.update((d) => {
      const p = d.minigames[id];
      d.minigames[id] = { best: Math.max(p?.best ?? 0, outcome.score), won: (p?.won ?? false) || outcome.won };
    });

    // clean up & back to exploring
    await ctx.fade(1, 380);
    let exit: { position: THREE.Vector3; yaw: number } | null = null;
    try {
      exit = def.exit?.(s) ?? null;
    } catch {
      exit = null;
    }
    s.dispose();
    try {
      const rig = ctx.player.rig;
      if (exit) ctx.player.teleport(exit.position, exit.yaw);
      rig.play('idle');
      ctx.camera.fov = ctx.cameraRig.baseFov;
      ctx.camera.updateProjectionMatrix();
      ctx.cameraRig.follow(rig.root, { snap: true, yaw: ctx.player.yaw });
    } catch (err) {
      console.error(err);
    }
    ctx.player.setControlEnabled(true);
    ctx.setMode('explore');
    for (const m of markers) m.visible = true;
    running = null;
    void ctx.fade(0, 520);
    if (s.quit) {
      try {
        ctx.ui.toast('Partie interrompue — reviens quand tu veux !', { icon: '❄️', duration: 3200 });
      } catch {
        /* ignore */
      }
    }
    const result = { won: outcome.won, score: outcome.score };
    const hook = (window as unknown as { __givreluneMg?: { last?: unknown } }).__givreluneMg;
    if (hook) hook.last = { id, ...result, aborted, quit: s.quit };
    mgLog(`end ${id}`);
    ctx.events.emit('minigame:end', { id, won: outcome.won, score: outcome.score });
    return result;
  }

  /** The UI module's result card; our own card if the UI resolves instantly (stub) — auto-closing in autoplay. */
  async function showResult(s: Session, o: { title: string; text: string; won: boolean }) {
    const auto = autoplayOpts();
    const t0 = performance.now();
    try {
      const p = ctx.ui.minigameResult(o);
      if (auto) {
        // a real card waits for a click: press its button for the visitor
        const timer = setTimeout(() => {
          const btns = document.querySelectorAll<HTMLButtonElement>('#ui-root button');
          btns[btns.length - 1]?.click();
        }, 2600);
        await Promise.race([p, new Promise((r) => setTimeout(r, 5000))]);
        clearTimeout(timer);
      } else await p;
    } catch {
      /* ignore */
    }
    if (performance.now() - t0 < 120) {
      // the UI module has no result card: ours (with its own little fanfare)
      s.sfx(o.won ? 'success' : 'fail', { volume: 0.7 });
      await s.ui.card({ ...o, autoMs: auto ? 2200 : undefined });
    }
  }

  const api: MinigameApi = {
    list: () => MINIGAMES.filter(enabled).map((d) => ({ id: d.id, title: d.title, zone: d.zone })),
    start,
    isRunning: () => running !== null,
  };
  return api;
}
