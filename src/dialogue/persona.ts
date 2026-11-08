/**
 * Persona wrappers: the little phrases around answers depend on the artisan's mood
 * (chaleureux, timide, enjoue, sage, farceur). Lines never repeat twice in a row.
 * All lines are gender-neutral for both the artisan and the visitor.
 */
import type { SmalltalkKind } from './intents';

export type Mood = 'chaleureux' | 'timide' | 'enjoue' | 'sage' | 'farceur';

export type LineKind =
  | 'opener'
  | 'hedge'
  | 'fallback'
  | 'warm'
  | 'site'
  | 'noSite'
  | 'product'
  | 'creations'
  | 'profile'
  | 'empty'
  | 'askMore'
  | 'catalogueOutro'
  | 'thirdPerson'
  | 'gift'
  | 'favourite'
  | 'notSold'
  | 'referral'
  | 'referralAlso'
  | 'zone'
  | 'map'
  | 'weatherBar'
  | 'network'
  | 'noNetwork'
  | 'noNetworkNoSite'
  | 'giftFor'
  | `small:${SmalltalkKind | 'glad'}`;

type Lines = Partial<Record<LineKind, string[]>>;

const FALLBACK_MAIN = 'Hmm, ça je ne saurais pas te dire… mais tu trouveras sûrement sur mon site !';

const COMMON: Lines = {
  opener: ['', '', 'Alors…', 'Bonne question !'],
  hedge: ['Si je me souviens bien…', 'Je crois que ça répond à ta question…'],
  fallback: [FALLBACK_MAIN, 'Oh, là tu me poses une colle ! Jette un œil à mon site, tout y est.', 'Je ne voudrais pas te dire de bêtise… Le mieux, c’est de regarder sur mon site !'],
  warm: ['Ça me fait vraiment plaisir que tu t’intéresses autant à mon travail.'],
  site: ['Tout est sur mon site, avec toutes mes créations !', 'Mon site, c’est par ici : tu y trouveras tout.', 'Voilà mon site ! Prends ton temps, il est ouvert même quand ma cabane est fermée.'],
  noSite: ['Je n’ai pas encore de site… Mais tu me trouves ici, tous les soirs du marché !'],
  creations: ['Viens, je te montre tout ça de plus près !', 'Approche, regarde : tout est fait avec amour.', 'Allez, je t’ouvre mon étal !'],
  profile: ['Tiens, voilà ma petite fiche, avec mes liens.', 'Je te laisse ma carte !'],
  empty: ['Prends ton temps, je ne bouge pas d’ici !', 'Je t’écoute…'],
  askMore: ['Autre chose ?', 'Une autre question ?', 'Tu veux savoir autre chose ?', 'Je t’écoute !'],
  catalogueOutro: ['Tu veux les voir de plus près ?', 'Regarde sur l’étal, tout est là !'],
  thirdPerson: ['Comme on dit au village : « %s »', 'Les habitués te diraient : « %s »'],
  'small:greeting': ['Bonsoir à toi !', 'Re-bonsoir ! Qu’est-ce qui te ferait plaisir ?', 'Bonsoir ! Je t’écoute.'],
  'small:thanks': ['Avec plaisir !', 'Mais de rien !', 'C’est moi qui te remercie de ta visite.'],
  'small:howareyou': ['Très bien, merci ! Le marché est si joli ce soir. Et toi ?', 'Ça va, ça va ! Un peu froid aux doigts, mais le cœur au chaud.'],
  'small:xmas': ['Joyeux Noël à toi aussi ! Que tes fêtes soient douces.', 'Et de très belles fêtes à toi !'],
  'small:bye': ['À bientôt !'],
  'small:compliment': ['Oh, tu me fais rougir !', 'Merci, ça me va droit au cœur !', 'Que c’est gentil ! Ça me donne envie d’en faire encore plus.'],
  'small:laugh': ['Hihi ! Ça fait du bien de rire un peu.', 'Haha ! Toi, tu es de bonne humeur ce soir !'],
  'small:yes': ['Parfait !', 'Très bien !', 'Chouette !'],
  'small:no': ['Pas de souci !', 'D’accord, comme tu veux.'],
  'small:sorry': ['Il n’y a pas de mal !', 'Ne t’en fais pas !'],
  'small:weather': ['Brr, oui ! Heureusement, les lampions réchauffent l’allée.', 'C’est le froid de Noël, celui qui fait rosir les joues !'],
  'small:insult': ['Oh… Bon, on ne peut pas plaire à tout le monde !', 'Aïe. Je ferai mieux la prochaine fois, promis.'],
  'small:name': ['Quel joli prénom, %s ! Bienvenue.', 'Bienvenue à toi, %s !'],
  'small:glad': ['Tant mieux !', 'Ah, ça fait plaisir à entendre !'],
  product: ['Ah, %s !', '%s ? Tu as l’œil !', 'Ah, %s, très bon choix !'],
  gift: ['%s, ça fait toujours plaisir !', 'Pour offrir, je te conseille %s.'],
  favourite: ['Mon coup de cœur, c’est %s !', 'Si je ne devais en garder qu’un, ce serait %s.'],
  notSold: ['Hmm, je n’en ai pas sur mon étal… Mais regarde plutôt : %s.', 'Ça, je n’en fais pas ! Par contre, j’ai %s.'],
  referral: ['%s ? Je n’en vends pas, mais va voir %s %s !', 'Ça, ce n’est pas chez moi ! Pour %s, va voir %s %s.'],
  referralAlso: ['Moi, j’ai %s, si ça te tente.', 'Sinon, chez moi, il y a %s !'],
  zone: ['Pour %s, file %s : c’est tout près !', '%s ? C’est %s qu’il faut aller !'],
  map: ['Ça, regarde la carte du marché : tout y est indiqué !', 'Pour ça, jette un œil à la carte du marché, tu trouveras en un clin d’œil.'],
  weatherBar: [
    'Brr, oui ! Rien de tel qu’un vin chaud %s pour se réchauffer.',
    'Un vrai temps de Noël : froid et étoilé ! File boire un chocolat chaud %s, ça réchauffe le cœur.',
    'Il fait frisquet, hein ? Un petit tour %s, et un vin chaud entre les mains : il n’y a pas mieux.',
  ],
  network: ['Oui ! Tu me trouves %s.', 'Bien sûr, retrouve-moi %s !'],
  noNetwork: ['Pas de compte %s pour moi… Mais tout est sur mon site !'],
  noNetworkNoSite: ['Pas de compte %s pour moi… Mais tu me trouves ici, tous les soirs du marché !'],
  giftFor: ['Pour ça, je te conseille %s !', 'J’ai ce qu’il te faut : %s !'],
};

const MOODS: Record<Mood, Lines> = {
  chaleureux: {
    opener: ['', 'Ah, bonne question !', 'Avec plaisir !', 'Alors, écoute…', 'Je t’explique !', 'Oh, ça me fait plaisir que tu demandes !'],
    hedge: ['Si je me souviens bien…', 'Je crois que ça répond à ta question…'],
    warm: ['Ça me touche que tu t’intéresses autant à mon travail, tu sais.', 'Quelle curiosité, j’adore ça ! Reste au chaud près des lampions, va.'],
    'small:compliment': ['Oh, tu me fais rougir !', 'Merci, ça me va droit au cœur !', 'Ça me fait chaud au cœur, merci !'],
  },
  timide: {
    opener: ['', 'Oh… euh, oui.', 'Hum… alors…', 'Euh, eh bien…', 'Oh, c’est gentil de demander…', 'Alors… voilà.'],
    hedge: ['Si je ne me trompe pas…', 'Hum, je crois que…'],
    fallback: ['Oh… je ne sais pas trop, pardon. Tu trouveras sûrement sur mon site…', FALLBACK_MAIN, 'Euh… ça, je ne sais pas. Mais mon site en parle peut-être ?'],
    warm: ['Merci de t’intéresser autant… ça me fait chaud au cœur.', 'C’est rare qu’on me pose autant de questions… ça me fait plaisir.'],
    'small:compliment': ['Oh… merci… tu me fais rougir.', 'C’est… c’est très gentil.'],
    'small:greeting': ['Oh… bonsoir.', 'Re… rebonsoir !'],
    'small:thanks': ['Oh, de rien…', 'Avec plaisir… vraiment.'],
    askMore: ['Euh… autre chose ?', 'Tu… tu as une autre question ?', 'Je t’écoute…'],
  },
  enjoue: {
    opener: ['', 'Oh ! Excellente question !', 'Ah ça, je peux t’en parler des heures !', 'Haha, tu tombes bien !', 'Oh, j’adore qu’on me demande ça !', 'Ah ! Écoute bien !'],
    hedge: ['Alors, si ma mémoire est bonne…', 'Attends, attends… oui !'],
    fallback: ['Oh là là, ça je ne saurais pas te dire ! Mais regarde sur mon site, tout y est !', FALLBACK_MAIN, 'Ah, tu me poses une colle ! Va voir sur mon site, tout y est expliqué.'],
    warm: ['Quelle bonne compagnie tu fais ! Ça me réchauffe plus qu’un bon feu de cheminée.', 'Toutes ces questions ! Tu es la meilleure visite de la soirée.'],
    'small:compliment': ['Oh, arrête, tu vas me faire rougir jusqu’aux oreilles !', 'Haha, merci ! Tu sais parler aux artisans, toi !'],
    'small:laugh': ['Haha ! J’adore les gens qui rient !', 'Hihi, tu es d’humeur joyeuse, ça se voit !'],
    askMore: ['Et quoi d’autre ?', 'Vas-y, demande-moi tout !', 'Une autre question ? J’adore !'],
  },
  sage: {
    opener: ['', 'Vois-tu…', 'Ah…', 'Bonne question.', 'Écoute bien.', 'C’est une longue histoire, mais je fais court.'],
    hedge: ['Si ma mémoire ne me joue pas de tour…', 'Il me semble que…'],
    fallback: ['Ça, je ne saurais te le dire. Mais mon site en sait sans doute plus que moi.', FALLBACK_MAIN, 'Je préfère ne pas te répondre à la légère. Regarde plutôt sur mon site.'],
    warm: ['Tu poses de belles questions. C’est rare, et ça fait plaisir.', 'On voit que tu prends le temps. C’est précieux, le temps.'],
    'small:compliment': ['Merci. Ça me touche, sincèrement.', 'C’est gentil. Le travail bien fait finit toujours par se voir.'],
    'small:greeting': ['Bonsoir.', 'Bonsoir à toi. Belle soirée pour flâner.'],
    askMore: ['Autre chose ?', 'Je t’écoute.', 'Une autre question ?'],
  },
  farceur: {
    opener: ['', 'Ha ! Je savais que tu allais me demander ça.', 'Tiens-toi bien…', 'Secret d’artisan… mais pour toi, je fais une exception.', 'Psst… approche.', 'Roulement de tambour…'],
    hedge: ['Si je ne raconte pas de bêtises…', 'Alors, de mémoire de lutin…'],
    fallback: ['Ah ça, c’est classé secret défense ! Non, je plaisante : je ne sais pas. Mais mon site, lui, sait sûrement.', FALLBACK_MAIN, 'Ça, même le Père Noël ne le sait pas ! Regarde sur mon site, on ne sait jamais.'],
    warm: ['Dis donc, tu poses plus de questions qu’un lutin le soir du 24 ! J’adore.', 'Toi, tu as la curiosité d’un renne devant une carotte ! J’adore.'],
    'small:compliment': ['Je sais, je sais… Non, merci, vraiment !', 'Arrête, je vais devoir agrandir ma cabane pour mes chevilles !'],
    'small:insult': ['Aïe ! Bon, je le note dans mon carnet des critiques… il est tout neuf.', 'Oh ! Le Père Noël a tout entendu, hein.'],
    askMore: ['Une autre ? Je suis en forme !', 'Allez, une autre question !', 'Et ensuite ?'],
  },
};

export interface Persona {
  readonly mood: Mood;
  /** A line of this kind; each `%s` is replaced by the next argument. */
  line(kind: LineKind, ...args: string[]): string;
  /** Opener in front of an answer (may be empty). Never the same twice in a row. */
  opener(confidence: number): string;
}

export function createPersona(mood: string | undefined, random: () => number = Math.random): Persona {
  const m: Mood = (['chaleureux', 'timide', 'enjoue', 'sage', 'farceur'] as const).includes(mood as Mood) ? (mood as Mood) : 'chaleureux';
  const last = new Map<string, string>();
  const pick = (kind: LineKind): string => {
    const list = MOODS[m][kind] ?? COMMON[kind] ?? [''];
    if (list.length === 1) return list[0];
    const prev = last.get(kind);
    let choice = list[Math.floor(random() * list.length) % list.length];
    for (let i = 0; i < 6 && choice === prev && choice !== ''; i++) choice = list[Math.floor(random() * list.length) % list.length];
    if (choice === prev && choice !== '') choice = list[(list.indexOf(choice) + 1) % list.length];
    last.set(kind, choice);
    return choice;
  };
  let emptyStreak = 0;
  return {
    mood: m,
    line(kind, ...args) {
      let i = 0;
      return pick(kind).replace(/%s/g, () => args[i++] ?? '');
    },
    opener(confidence) {
      if (confidence < 0.5) return pick('hedge');
      let o = pick('opener');
      if (o === '') {
        emptyStreak++;
        if (emptyStreak > 2) {
          o = pick('opener');
          if (o === '') o = pick('opener');
        }
      }
      if (o !== '') emptyStreak = 0;
      return o;
    },
  };
}
