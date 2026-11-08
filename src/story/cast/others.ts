import type { ProceduralSongId } from '../../config/types';
import { choose, countTalk, pendingHints, rotate, say, speaker, star, talks, withOwnLines, type CastEnv } from './common';
import { delay } from '../timeline';

// ───────────────────────────── Firmin, the chestnut seller ─────────────────────────────

const FIRMIN = [
  'Chauds, chauds les marrons ! Ça réchauffe les doigts et le cœur.',
  'Mon grand-père vendait déjà des marrons ici. Il disait que la lune de Givrelune les faisait éclater plus joliment.',
  'Tu sais pourquoi le lac gèle si vite, à Givrelune ? Parce que la lune vient s’y regarder tous les soirs. Enfin, c’est ce qu’on raconte.',
  'Paulette prétend que ses crêpes sentent meilleur que mes marrons. Elle a tort, mais je l’aime bien quand même.',
  'Un jour, un marron a sauté si haut qu’il est resté accroché au Grand Sapin. On l’a pris pour une boule pendant trois hivers.',
];

export async function chestnutScript(env: CastEnv) {
  const { ctx, story, m } = env;
  env.d.open(speaker(ctx, m));
  const n = talks(env);
  countTalk(env);
  const lac = star(env, 'lac');
  const lakePending = !!lac && lac.mode === 'hidden' && !story.isFound('lac') && !!lac.where?.includes('glace');
  await say(env, n === 0 ? (m.lines?.[0] ?? FIRMIN[0]) : rotate(env, 'greet', ['Te revoilà ! Les marrons aussi, toujours chauds.', 'Ah, te voilà ! Les marrons t’attendaient, ils n’arrêtaient pas d’éclater d’impatience.']), 'happy');
  for (let round = 0; round < 3; round++) {
    const c = await choose(env, [
      { id: 'cornet', label: 'Un cornet de marrons, s’il te plaît', icon: '🌰' },
      { id: 'story', label: 'Raconte-moi une histoire', icon: '📜' },
      story.plan.length > 0 && !story.complete() && { id: 'star', label: 'Tu n’aurais pas vu une étoile de verre ?', icon: '⭐' },
      { id: 'bye', label: 'À plus tard !', icon: '👋' },
    ]);
    if (c === 'cornet') {
      await say(env, 'Et un cornet bien rempli ! Attention, ils sont brûlants : souffle dessus, comme sur une bougie d’anniversaire.', 'happy');
      ctx.audio.sfx('pop', { volume: 0.6 });
      delay(ctx, 0.25, () => ctx.audio.sfx('pop', { volume: 0.4, pitch: 1.2 }));
      try {
        ctx.player.rig.play('drink');
      } catch {
        /* ignore */
      }
      story.warmUp(0.55, 16);
      ctx.ui.toast('Tu te réchauffes les mains sur un cornet de marrons chauds.', { icon: '🌰', duration: 3800 });
      return;
    }
    if (c === 'story') {
      await say(env, rotate(env, 'story', withOwnLines(m, FIRMIN).slice(1)));
      continue;
    }
    if (c === 'star') {
      if (lakePending) {
        await say(env, 'Une étoile ? Cette nuit, j’ai vu un éclat filer vers le Lac Gelé… Ça brillait tout au bout de la glace, du côté du levant.', 'thinking');
        await say(env, 'Ou bien c’était une braise de mon brasero. À mon âge, on confond.');
      } else {
        const hints = pendingHints(env);
        await say(env, hints.length ? `Moi, non… Mais écoute ça : ${rotate(env, 'hint', hints)}` : 'Toutes retrouvées, il paraît ! Bravo !', 'thinking');
      }
      continue;
    }
    await say(env, 'Belle soirée ! Et garde les mains au chaud.', 'happy');
    return;
  }
}

// ───────────────────────────── Anatole, the musician ─────────────────────────────

const SOFT: ProceduralSongId[] = ['douce-nuit', 'greensleeves', 'les-anges', 'valse-de-givrelune'];
const JOLLY: ProceduralSongId[] = ['il-est-ne', 'vive-le-vent', 'deck-the-halls', 'we-wish-you', 'mon-beau-sapin'];

function pickTrack(env: CastEnv, kinds: ProceduralSongId[] | null): number | null {
  const { ctx } = env;
  const tracks = ctx.config.music.tracks ?? [];
  if (!tracks.length || ctx.config.music.shuffle) return null;
  const current = ctx.audio.music.current()?.title;
  const matches = tracks
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => (kinds ? t.type === 'procedural' && kinds.includes(t.song) : true))
    .filter(({ t }) => (t.title ?? (t.type === 'procedural' ? t.song : '')) !== current);
  if (!matches.length) return null;
  return matches[Math.floor(Math.random() * matches.length)].i;
}

export async function musicianScript(env: CastEnv) {
  const { ctx, m } = env;
  env.d.open(speaker(ctx, m));
  const n = talks(env);
  countTalk(env);
  const now = ctx.audio.music.current()?.title;
  await say(env, n === 0 ? 'Bonsoir ! Je joue pour les flocons, les passants et les chalets. Mais surtout pour les flocons.' : rotate(env, 'greet', ['Te revoilà ! Une petite chanson ?', 'Ah, mon public préféré !']), 'happy');
  if (now && n > 0) await say(env, `Là, c’est « ${now} ». Elle te plaît ?`);
  const c = await choose(env, [
    { id: 'soft', label: 'Une chanson douce', icon: '🌙' },
    { id: 'jolly', label: 'Une chanson joyeuse', icon: '🔔' },
    { id: 'any', label: 'Surprends-moi !', icon: '🎲' },
    { id: 'chat', label: 'Tu joues depuis longtemps ?', icon: '💬' },
    { id: 'bye', label: 'Continue, c’est parfait', icon: '👋' },
  ]);
  if (c === 'chat') {
    await say(env, rotate(env, 'chat', withOwnLines(m, [
      'Depuis que je sais tenir un archet. Ma première chanson, je l’ai jouée pour une vache. Elle a applaudi… enfin, elle a meuglé.',
      'C’est moi qui ai réaccordé l’orgue du manège. Depuis, Odile dit que même les chevaux de bois fredonnent.',
      'La Valse de Givrelune, c’est une vieille mélodie du village. Personne ne sait qui l’a écrite. Moi, je crois que c’est la neige.',
    ])));
    return;
  }
  if (c === 'bye') {
    await say(env, 'Alors je continue ! Les flocons comptent sur moi.', 'happy');
    return;
  }
  await say(env, c === 'soft' ? 'Quelque chose de doux, pour regarder tomber la neige… Écoute.' : c === 'jolly' ? 'Quelque chose qui fait danser les bonnets ! Une, deux, trois…' : 'Une surprise ? J’en ai plein mes poches.', 'happy');
  const idx = pickTrack(env, c === 'soft' ? SOFT : c === 'jolly' ? JOLLY : null);
  try {
    if (idx === null) ctx.audio.music.next();
    else ctx.audio.music.play(idx);
  } catch {
    /* ignore */
  }
  delay(ctx, 0.5, () => {
    const t = ctx.audio.music.current();
    ctx.ui.toast(t ? `${m.name} joue « ${t.title} »` : `${m.name} attaque une nouvelle mélodie`, { icon: '🎻', duration: 4200 });
  });
}

// ───────────────────────────── everyone else ─────────────────────────────

const VILLAGER = [
  'Belle soirée, hein ? Le marché n’a jamais été aussi joli.',
  'Tu as goûté le vin chaud de Barnabé ? Il paraît qu’il y met un secret. Moi je crois que c’est juste beaucoup de cannelle.',
  'Chaque hiver, je me dis que je vais acheter une seule chose au marché. Et chaque hiver, je repars avec un traîneau plein.',
];

export async function villagerScript(env: CastEnv) {
  const { ctx, story, m } = env;
  env.d.open(speaker(ctx, m));
  countTalk(env);
  await say(env, rotate(env, 'chat', withOwnLines(m, VILLAGER)), 'happy');
  const hints = pendingHints(env);
  if (hints.length && ctx.save.flag<boolean>('story:metGuide') && Math.random() < 0.7) {
    await say(env, `Tu cherches les étoiles du Grand Sapin ? ${rotate(env, 'hint', hints)}`, 'thinking');
  } else if (story.complete()) await say(env, 'Le Grand Sapin brille comme jamais. Merci à toi !', 'happy');
}
