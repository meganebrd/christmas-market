import { choose, countTalk, rotate, say, speaker, star, talks, withOwnLines, type CastEnv } from './common';
import { delay } from '../timeline';

/** Barnabé, at the Chaudron Doré: hot drinks (warm glow), and the star he fished out of his cauldron. */

const DRINKS = {
  vin: {
    label: 'Un vin chaud',
    icon: '🍷',
    name: 'vin chaud',
    reply: 'Et un vin chaud, un ! Cannelle, orange, clou de girofle… et un ingrédient secret que je ne dirai à personne.',
  },
  choco: {
    label: 'Un chocolat chaud',
    icon: '☕',
    name: 'chocolat chaud',
    reply: 'Un chocolat chaud bien épais, avec un nuage de crème. Attention à la moustache !',
  },
  pomme: {
    label: 'Un jus de pomme chaud à la cannelle',
    icon: '🍎',
    name: 'jus de pomme à la cannelle',
    reply: 'Jus de pomme chaud à la cannelle ! Les pommes viennent du verger d’en bas, cueillies avant les premières neiges.',
  },
} as const;
type DrinkId = keyof typeof DRINKS;

const CHAT = [
  'Ici, personne ne repart avec les mains froides. C’est la règle, et c’est moi qui l’ai inventée.',
  'Ce chaudron, c’était celui de ma grand-mère. Elle disait qu’un bon vin chaud, ça se remue toujours dans le sens des aiguilles d’une montre. Je n’ai jamais vérifié l’inverse.',
  'Ce soir, j’ai déjà rempli trois cents tasses. Ou trois mille. J’ai arrêté de compter après la deuxième marmite.',
  'Le secret d’une bonne soirée au marché ? Une tasse chaude, une écharpe, et quelqu’un avec qui trinquer.',
];

export async function baristaScript(env: CastEnv) {
  const { ctx, story, m } = env;
  env.d.open(speaker(ctx, m));
  const n = talks(env);
  countTalk(env);
  const s = star(env, 'chaudron');
  const giftPending = !!s && s.mode === 'gift' && !story.isFound('chaudron');

  if (n === 0) await say(env, m.lines?.[0] ?? 'Bienvenue au Chaudron ! Un vin chaud ? Un chocolat ? Ici, personne ne repart avec les mains froides.', 'happy');
  else if (ctx.save.flag<boolean>('finale')) await say(env, 'Le sapin brille, et mon vin chaud aussi ! Qu’est-ce que je te sers ?', 'happy');
  else await say(env, rotate(env, 'greet', ['Re-bonsoir ! Le chaudron est toujours chaud. Qu’est-ce qui te ferait plaisir ?', 'Ah, te revoilà ! La même chose que tout à l’heure ?', 'Tu as les joues toutes roses : il te faut quelque chose de chaud.']), 'happy');
  if (giftPending && n > 0) await say(env, 'Tiens, d’ailleurs… commande-moi quelque chose, j’ai une surprise pour toi.', 'thinking');

  const c = await choose(env, [
    { id: 'vin', label: DRINKS.vin.label, icon: DRINKS.vin.icon },
    { id: 'choco', label: DRINKS.choco.label, icon: DRINKS.choco.icon },
    { id: 'pomme', label: DRINKS.pomme.label, icon: DRINKS.pomme.icon },
    { id: 'chat', label: 'Ça marche, les affaires ?', icon: '💬' },
    { id: 'bye', label: 'Rien pour l’instant, merci', icon: '👋' },
  ]);
  if (c === 'bye') {
    await say(env, 'Pas de souci. Le chaudron ne bouge pas d’ici !');
    return;
  }
  if (c === 'chat') {
    await say(env, rotate(env, 'chat', withOwnLines(m, CHAT)));
    if (giftPending) await say(env, 'Mais dis-moi, tu ne veux vraiment rien boire ? J’ai quelque chose à te montrer…', 'thinking');
    return;
  }
  const drink = DRINKS[c as DrinkId];
  await say(env, drink.reply, 'happy');
  ctx.audio.sfx('pour');
  try {
    ctx.audio.sfx('glass-clink', { volume: 0.5 });
  } catch {
    /* ignore */
  }
  delay(ctx, 0.35, () => {
    try {
      ctx.player.rig.play('drink');
    } catch {
      /* ignore */
    }
  });
  story.warmUp(0.8, 20);
  ctx.ui.toast(`Mmh… un ${drink.name} bien chaud. Tes doigts revivent !`, { icon: drink.icon, duration: 3800 });

  if (giftPending) {
    await say(env, 'Oh ! Attends voir…', 'surprised');
    await say(env, 'Ce matin, en remuant le chaudron, ma louche a cogné quelque chose de dur. J’ai cru à une pomme oubliée…', 'thinking');
    await say(env, 'Tadaa ! Je l’ai repêchée dans le chaudron ! Elle brillait au fond comme une braise.', 'happy');
    await say(env, 'C’est une des étoiles du Grand Sapin, pas vrai ? Allez, rends-la-lui. Elle est encore toute tiède !', 'happy');
    story.after(() => story.grant('chaudron'));
    return;
  }
  await say(env, rotate(env, 'cheers', ['À la tienne ! Reviens quand tu veux, il y en a toujours.', 'Santé ! Et que ta soirée soit aussi douce que ma cannelle.', 'Bois doucement, c’est brûlant. Mais c’est bon, hein ?']), 'happy');
}
