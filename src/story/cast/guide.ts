import type { DialogueChoice } from '../../core/contracts';
import { BYE, choose, countTalk, pendingHints, rotate, say, speaker, withOwnLines, type CastEnv } from './common';
import { plural } from '../text';

/**
 * Céleste, the old lamplighter: she starts the quest, gives hints, explains the controls, opens the map,
 * and lights the Grand Sapin with the visitor when every star is back.
 */

const LORE = [
  'Givrelune, c’est un vieux village de montagne. Chaque hiver, la lune descend si bas qu’elle vient givrer les toits : d’où son nom.',
  'Le marché existe depuis que Maître Aubin a soufflé les étoiles du sapin. Avant, il n’y avait qu’un feu de camp et beaucoup de chaussettes mouillées.',
  'Les artisans de l’allée viennent de toute la vallée. Va les voir : ils adorent raconter leur métier, et ils ont toujours une petite merveille à montrer.',
  'Tu vois l’aurore, là-haut, au-dessus des sommets ? Noé dit que c’est la lune qui secoue son écharpe. Je n’ai jamais osé le contredire.',
];

const CHOICE = {
  hint: { id: 'hint', label: 'Un indice ?', icon: '💡' },
  controls: { id: 'controls', label: 'Comment on se déplace ?', icon: '🎮' },
  map: { id: 'map', label: 'Ouvre-moi la carte', icon: '🗺️' },
  lore: { id: 'lore', label: 'Parle-moi de Givrelune', icon: '🏔️' },
} satisfies Record<string, DialogueChoice>;

async function controls(env: CastEnv) {
  if (env.story.isTouch()) {
    await say(env, 'Pour marcher, glisse ton pouce sur le joystick, ou touche simplement le sol là où tu veux aller.');
    await say(env, 'Glisse l’écran pour tourner la vue, pince pour t’approcher, et touche les gens pour leur parler. Facile comme une glissade !', 'happy');
  } else {
    await say(env, 'Pour marcher : ZQSD, WASD ou les flèches. Maj pour courir, E ou Espace pour parler, M pour la carte.');
    await say(env, 'Et pour regarder autour de toi, fais glisser la souris ; la molette rapproche la vue. Tu peux aussi cliquer là où tu veux aller.', 'happy');
  }
}

function openMapAfter(env: CastEnv) {
  const { ctx } = env;
  env.story.after(() => {
    if (ctx.mode !== 'explore') return;
    ctx.setMode('map');
    ctx.ui.openMap();
  });
}

async function firstMeeting(env: CastEnv) {
  const { story, m } = env;
  const total = story.plan.length;
  const found = story.found().size;
  const own = m.lines?.[0];
  await say(env, 'Ah, te voilà enfin ! Bienvenue à Givrelune.', 'happy');
  await say(env, own ? `Moi, c’est ${m.name}. ${own}` : `Moi, c’est ${m.name}. Les réverbères du village, c’est moi qui les allume, chaque soir, depuis quarante hivers.`);
  await say(env, `Mais regarde notre Grand Sapin… Pas une lueur. Le vent du Nord a emporté ses ${total > 1 ? `${total} étoiles` : 'étoile'} de verre, cette nuit.`, 'sad');
  await say(env, 'C’est Maître Aubin, le verrier, qui les a soufflées il y a bien longtemps. Sans elles, le sapin ne peut pas s’illuminer pour l’ouverture du marché.');
  if (found > 0) {
    await say(env, `… Attends. Tu en as déjà trouvé ${found} ?! Eh bien, tu as l’œil, toi !`, 'surprised');
    await say(env, 'Les autres ne sont pas loin, je le sens dans mes vieux os. Une dans chaque coin du marché.', 'thinking');
  } else await say(env, 'Elles ne sont pas loin, je le sens dans mes vieux os : une dans chaque coin du marché. Les habitants en ont sûrement aperçu une ou deux…', 'thinking');
  const c = await choose(env, [
    { id: 'go', label: 'Je vais les retrouver !', icon: '⭐' },
    { id: 'how', label: 'Par où commencer ?', icon: '🧭' },
  ]);
  if (c === 'how') {
    await say(env, 'Va bavarder avec les habitants : ceux qui savent quelque chose ont une petite étoile au-dessus de la tête.');
    const hints = pendingHints(env);
    if (hints[0]) await say(env, `Tiens, un premier indice. ${hints[0]}`, 'thinking');
    await say(env, 'Et si tes jambes fatiguent, ouvre la carte : elle te mène où tu veux en un clin d’œil.');
    const c2 = await choose(env, [CHOICE.map, { id: 'go', label: 'C’est parti !', icon: '⭐' }, CHOICE.controls]);
    if (c2 === 'controls') await controls(env);
    if (c2 === 'map') {
      await say(env, 'Tiens, la voilà. Ne la tiens pas à l’envers, c’est déjà arrivé à Firmin.', 'happy');
      openMapAfter(env);
      return;
    }
  }
  await say(env, 'Merci, mon trésor. Chaque étoile retrouvée rallumera un peu le sapin. Je t’attends ici !', 'happy');
}

async function progressTalk(env: CastEnv) {
  const { story } = env;
  const total = story.plan.length;
  const n = story.found().size;
  const left = total - n;
  if (n === 0) await say(env, 'Alors, ces étoiles ? Ne t’en fais pas, la nuit est longue à Givrelune.');
  else if (left === 1) await say(env, 'Plus qu’une ! Une toute petite dernière, et le sapin sera complet.', 'happy');
  else if (n <= 2) await say(env, `Déjà ${n} ${plural(n, 'étoile', 'étoiles')} ! Regarde comme le sapin se réveille.`, 'happy');
  else await say(env, `${n} étoiles sur ${total} ! Le sapin n’a pas brillé comme ça depuis des lustres.`, 'happy');

  for (let round = 0; round < 5; round++) {
    const c = await choose(env, [CHOICE.hint, CHOICE.controls, CHOICE.map, CHOICE.lore, BYE]);
    if (c === 'hint') {
      const hints = pendingHints(env);
      await say(env, hints.length ? rotate(env, 'hint', hints) : 'Je crois bien que tu les as toutes !', 'thinking');
    } else if (c === 'controls') await controls(env);
    else if (c === 'map') {
      await say(env, 'Voilà la carte. Choisis un coin du marché, et hop !', 'happy');
      openMapAfter(env);
      return;
    } else if (c === 'lore') await say(env, rotate(env, 'lore', withOwnLines(env.m, LORE)));
    else {
      await say(env, 'File, file ! Et garde ton écharpe bien serrée.', 'happy');
      return;
    }
    if (round < 4) await say(env, 'Autre chose, mon trésor ?');
  }
}

async function lightTheTree(env: CastEnv) {
  const { story } = env;
  const total = story.plan.length;
  await say(env, total > 1 ? `Les ${total} étoiles… toutes ! Oh, regarde-moi ça, j’en ai les lunettes qui s’embuent.` : 'L’étoile est revenue ! Oh, j’en ai les lunettes qui s’embuent.', 'surprised');
  await say(env, 'Approche, viens près de moi. On allume le Grand Sapin, ensemble ?', 'happy');
  const c = await choose(env, [
    { id: 'light', label: 'Allumer le Grand Sapin', icon: '✨' },
    { id: 'later', label: 'Attends, encore un instant', icon: '⏳' },
  ]);
  if (c === 'light') {
    await say(env, 'Alors… un, deux, trois…', 'happy');
    story.after(() => void story.playFinale());
    return;
  }
  await say(env, 'Prends ton temps, mon trésor. Le sapin attendra bien quelques minutes de plus.');
}

async function afterFinale(env: CastEnv) {
  const { story } = env;
  await say(env, rotate(env, 'after', [
    'Quelle soirée ! Le sapin n’a jamais aussi bien brillé, et c’est grâce à toi.',
    'Regarde-le briller… Je crois qu’il te dit merci, à sa façon.',
    'Les cabanes restent ouvertes toute la nuit. Profite, mon trésor !',
  ]), 'happy');
  for (let round = 0; round < 4; round++) {
    const c = await choose(env, [{ id: 'fireworks', label: 'Relancer le feu d’artifice', icon: '🎆' }, CHOICE.lore, CHOICE.map, CHOICE.controls, { id: 'bye', label: 'Bonne nuit, Céleste', icon: '🌙' }]);
    if (c === 'fireworks') {
      await say(env, 'Encore ? Ha ! Firmin a gardé quelques fusées sous ses marrons. Lève les yeux…', 'happy');
      story.after(() => void story.playFinale({ replay: true }));
      return;
    }
    if (c === 'map') {
      await say(env, 'Voilà la carte. Bonne balade !', 'happy');
      openMapAfter(env);
      return;
    }
    if (c === 'lore') await say(env, rotate(env, 'lore', withOwnLines(env.m, LORE)));
    else if (c === 'controls') await controls(env);
    else {
      await say(env, 'Bonne nuit, et joyeux Noël. Reviens quand tu veux : Givrelune t’attendra.', 'happy');
      return;
    }
  }
}

async function noQuest(env: CastEnv) {
  await say(env, rotate(env, 'chat', withOwnLines(env.m, ['Bienvenue à Givrelune ! Les cabanes sont ouvertes toute la nuit.', ...LORE])), 'happy');
  const c = await choose(env, [CHOICE.controls, CHOICE.map, BYE]);
  if (c === 'controls') await controls(env);
  if (c === 'map') openMapAfter(env);
}

export async function guideScript(env: CastEnv) {
  const { ctx, story } = env;
  env.d.open(speaker(ctx, env.m));
  countTalk(env);
  if (!story.plan.length) return noQuest(env);
  const met = !!ctx.save.flag<boolean>('story:metGuide');
  if (!met) {
    ctx.save.flag('story:metGuide', true);
    story.setBeacon(false);
    story.refreshQuest();
  }
  if (story.complete() && !ctx.save.flag<boolean>('finale')) return lightTheTree(env);
  if (story.complete()) return afterFinale(env);
  if (!met) return firstMeeting(env);
  return progressTalk(env);
}
