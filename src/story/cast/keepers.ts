import type { CastRole } from '../../config/types';
import type { StarId } from '../types';
import { choose, countTalk, gameAvailable, rotate, say, speaker, star, startGameAfter, talks, type CastEnv } from './common';

/**
 * The people who keep a mini-game — and a glass star hidden in it: Noé (snowflakes, belvédère),
 * Léon (chamboule-neige), Paulette (crêpes), Maître Aubin (glass workshop), Odile (carousel).
 */
interface KeeperText {
  star: StarId;
  greet: string[];
  /** Tells where the star is and offers the game. */
  offer: string[];
  playLabel: string;
  playIcon: string;
  go: string;
  /** Star already back on the tree. */
  done: string[];
  replayLabel: string;
  chatLabel: string;
  chatIcon: string;
  chat: string[];
  /** Small treat (warmth) — optional. */
  treat?: { label: string; icon: string; reply: string; toast: string; warmth: number };
}

const KEEPERS: Partial<Record<CastRole, KeeperText>> = {
  stargazer: {
    star: 'flocons',
    greet: ['Chut… Regarde là-haut ! Ce soir, le ciel est si clair qu’on voit même les étoiles timides.', 'Oh, salut ! Tu viens regarder le ciel avec moi ?'],
    offer: [
      'Cette nuit, j’ai vu une étoile de verre tomber du ciel… enfin, du sapin. Elle est passée juste là, au bord du belvédère, au milieu des flocons !',
      'Si on attrape assez de flocons, elle remontera, j’en suis sûr. Tu m’aides ?',
    ],
    playLabel: 'Attraper les flocons',
    playIcon: '❄️',
    go: 'Génial ! Ouvre bien les mains, les flocons de Givrelune sont rapides.',
    done: ['Tu as vu comme elle brille, maintenant, sur le sapin ? On dirait qu’elle me fait un clin d’œil.', 'Grâce à toi, j’ai une nouvelle étoile à mettre dans mon carnet : l’Étoile du Sapin !'],
    replayLabel: 'Rejouer aux flocons',
    chatLabel: 'Montre-moi les constellations',
    chatIcon: '🔭',
    chat: [
      'Tu vois les trois étoiles alignées, là ? Moi, je l’appelle la Luge. Et celle qui clignote juste au-dessus, c’est la Lanterne de Céleste.',
      'Quand je serai grand, je construirai un télescope si grand qu’on verra les cabanes de la lune.',
      'Ce soir, il y a même une aurore. Les anciens disent que c’est la lune qui secoue son écharpe.',
      'Il y a une constellation en forme de marron chaud. Firmin dit que c’est lui qui l’a découverte. Moi, je crois qu’il l’a inventée.',
    ],
  },
  'fair-keeper': {
    star: 'chamboule',
    greet: ['Roulez jeunesse ! Six boules de neige, une pyramide de boîtes, un seul champion !', 'Approche, approche ! Le Chamboule-Neige n’attend que toi !'],
    offer: [
      'Figure-toi qu’une étoile de verre est tombée pile au sommet de ma pyramide, cette nuit. Je n’ose pas y toucher, j’ai les doigts trop gros.',
      'Fais tout dégringoler, et elle est à toi ! Marché conclu ?',
    ],
    playLabel: 'Lancer les boules de neige',
    playIcon: '⚪',
    go: 'Haut les cœurs ! Vise le bas de la pyramide, c’est là que ça se joue.',
    done: ['Quel bras ! Je n’avais pas vu de lancer pareil depuis le grand tournoi de l’an dernier.', 'Tu reviens défendre ton titre ? La pyramide s’en souvient encore.'],
    replayLabel: 'Rejouer au Chamboule-Neige',
    chatLabel: 'C’est quoi le truc ?',
    chatIcon: '🎩',
    chat: [
      'Le truc ? Il n’y a pas de truc ! Enfin… vise le bas, et souffle un petit coup sur ta boule de neige avant de lancer. Ça porte chance.',
      'Mon chapeau ? Il a appartenu à mon grand-père, qui le tenait de son grand-père, qui l’avait gagné… au chamboule-tout. La boucle est bouclée.',
      'Chaque hiver, je repeins les boîtes. Cette année, elles ont des petits bonnets. Ça les rend moins tristes quand elles tombent.',
    ],
  },
  cook: {
    star: 'crepes',
    greet: ['Bonsoir, mon chou ! Une petite faim ? La pâte repose, la poêle chante.', 'Te revoilà ! Ça sent bon, hein ?'],
    offer: [
      'Dis donc, tu sais faire sauter les crêpes ? Ce matin, j’ai trouvé un drôle d’éclat au fond de mon pot de farine…',
      'Il ne remonte que si la crêpe vole bien haut ! Relève le défi, et on regarde ça ensemble.',
    ],
    playLabel: 'Je relève le défi !',
    playIcon: '🥞',
    go: 'En place ! Poêle bien chaude, poignet souple… et on ne regarde pas la crêpe de travers.',
    done: ['Ta crêpe de tout à l’heure, quel envol ! L’étoile a filé tout droit au sapin.', 'Si un jour tu veux un tablier, il y en a un à ta taille ici.'],
    replayLabel: 'Refaire sauter des crêpes',
    chatLabel: 'Ton secret pour les crêpes ?',
    chatIcon: '💬',
    chat: [
      'Mes crêpes, c’est de la farine du moulin d’en bas et beaucoup d’amour.',
      'Le secret ? Une pincée de sel, un zeste d’orange, et une pâte qui a bien dormi.',
      'Firmin, à côté, prétend que ses marrons sentent meilleur que mes crêpes. Tu en penses quoi, toi ?',
    ],
    treat: { label: 'Une crêpe au sucre, s’il te plaît', icon: '🥞', reply: 'Et une crêpe au sucre, bien dorée ! Attention, ça fond.', toast: 'Une crêpe toute chaude… le bonheur tient dans une main.', warmth: 0.55 },
  },
  glassblower: {
    star: 'verrier',
    greet: ['Entre, entre. Mets-toi près du four, il fait bon.', 'Ah, te revoilà. Le verre attend toujours qu’on le regarde.'],
    offer: [
      'Une de mes étoiles a roulé jusque dans le four, figure-toi. Elle y est encore, toute rouge de honte.',
      'Pour la sortir sans la fêler, il faut souffler une boule parfaite autour d’elle. Tu veux essayer ?',
    ],
    playLabel: 'Souffler le verre',
    playIcon: '🔮',
    go: 'Doucement… Le verre n’aime pas qu’on le brusque. Comme les gens, au fond.',
    done: ['Elle est de retour sur sa branche ? Alors tout va bien. Le verre, ça se casse, mais ça se souvient.', 'Tu as de bons poumons et une main sûre. Si un jour tu veux un apprenti… enfin, devenir apprenti, la porte est ouverte.'],
    replayLabel: 'Souffler une autre boule',
    chatLabel: 'Parle-moi des étoiles de verre',
    chatIcon: '✨',
    chat: [
      'Ces sept étoiles, je les ai soufflées l’hiver de mes vingt ans, avec du sable de la rivière et un peu de clair de lune.',
      'Chacune a sa couleur, si tu regardes bien : le givre, la rose, le miel, l’ambre, le lilas, la braise et l’eau du lac.',
      'Le verre, c’est du sable qui a rêvé d’être lumière. Mes étoiles, elles, rêvent du sapin. C’est pour ça qu’elles y retournent toujours.',
    ],
  },
  'carousel-keeper': {
    star: 'manege',
    greet: ['Approche, approche ! Le Manège des Songes tourne depuis cent hivers sans jamais grincer.', 'Te revoilà ! Les chevaux de bois t’attendaient.'],
    offer: [
      'Cette nuit, une étoile de verre s’est prise dans les rubans du manège. Depuis, elle tourne, elle tourne… et moi j’en ai le tournis.',
      'Monte donc, et attrape-la au vol ! Les chevaux de bois t’aideront.',
    ],
    playLabel: 'Monter sur le manège',
    playIcon: '🎠',
    go: 'Accroche-toi bien ! Et souris : les chevaux aiment les gens qui sourient.',
    done: ['Le manège tourne plus légèrement depuis que l’étoile est repartie. Je crois qu’il était un peu jaloux d’elle.', 'Un petit tour pour le plaisir ? Les chevaux de bois ne disent jamais non.'],
    replayLabel: 'Refaire un tour',
    chatLabel: 'Il est vieux, ce manège ?',
    chatIcon: '🎠',
    chat: [
      'Cent hivers, ou presque ! Mon arrière-grand-mère a sculpté le premier cheval. Il s’appelle Biscotte, et il a toujours la même tête de gourmand.',
      'La musique du manège, c’est Anatole qui l’a réaccordée l’an dernier. Depuis, même les flocons dansent en tombant.',
      'On dit que celui qui fait trois tours sans fermer les yeux fera de beaux rêves tout l’hiver.',
    ],
  },
};

export function hasKeeperScript(role: CastRole) {
  return !!KEEPERS[role];
}

export async function keeperScript(env: CastEnv) {
  const { ctx, story, m } = env;
  const k = KEEPERS[m.role];
  if (!k) return;
  env.d.open(speaker(ctx, m));
  const n = talks(env);
  countTalk(env);
  const s = star(env, k.star);
  const gameId = s?.mode === 'minigame' ? s.gameId : undefined;
  const canPlay = gameAvailable(ctx, gameId) && !ctx.minigames.isRunning();
  const pending = !!s && s.mode === 'minigame' && !story.isFound(k.star);

  if (n === 0) {
    await say(env, k.greet[0], 'happy');
    if (m.lines?.[0] && !k.chat.includes(m.lines[0])) await say(env, m.lines[0]);
  } else await say(env, rotate(env, 'greet', k.greet.length > 1 ? k.greet.slice(1) : k.greet), 'happy');

  for (let round = 0; round < 4; round++) {
    if (pending && canPlay && round === 0) for (const l of k.offer) await say(env, l, 'thinking');
    else if (!pending && s && story.isFound(k.star) && round === 0) await say(env, rotate(env, 'done', k.done), 'happy');
    const c = await choose(env, [
      canPlay && { id: 'play', label: pending ? k.playLabel : k.replayLabel, icon: k.playIcon },
      k.treat && { id: 'treat', label: k.treat.label, icon: k.treat.icon },
      { id: 'chat', label: k.chatLabel, icon: k.chatIcon },
      { id: 'bye', label: pending && canPlay ? 'Une autre fois' : 'À plus tard !', icon: '👋' },
    ]);
    if (c === 'play' && gameId) {
      await say(env, k.go, 'happy');
      startGameAfter(env, gameId);
      return;
    }
    if (c === 'treat' && k.treat) {
      await say(env, k.treat.reply, 'happy');
      ctx.audio.sfx('sizzle', { volume: 0.6 });
      try {
        ctx.player.rig.play('drink');
      } catch {
        /* ignore */
      }
      story.warmUp(k.treat.warmth, 15);
      ctx.ui.toast(k.treat.toast, { icon: k.treat.icon, duration: 3800 });
      if (pending && canPlay) {
        await say(env, 'Et pour l’étoile, tu sais où me trouver !', 'happy');
        continue;
      }
      return;
    }
    if (c === 'chat') {
      await say(env, rotate(env, 'chat', [...k.chat, ...(m.lines ?? []).filter((l) => !k.chat.includes(l))]));
      continue;
    }
    await say(env, rotate(env, 'bye', ['Belle soirée !', 'À tout à l’heure !', 'Reviens quand tu veux !']), 'happy');
    return;
  }
}
