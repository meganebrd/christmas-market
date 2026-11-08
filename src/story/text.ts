/**
 * Givrelune's storytelling text (French, tutoiement). Narration lines come from `content/market.json`
 * (`story.intro`, `story.finale`) when present; these are the defaults and the story module's own lines.
 */

export const DEFAULT_INTRO = [
  'Au creux de la vallée, là où la neige ne fond jamais tout à fait…',
  '…se cache Givrelune, le village que la lune vient givrer chaque hiver.',
  'Ce soir, comme chaque année, les artisans ouvrent leurs cabanes.',
  'Mais le vent du Nord a soufflé très fort la nuit dernière…',
  '…et les sept étoiles de verre du Grand Sapin se sont envolées aux quatre coins du marché.',
];

/** Last line of the intro, while the camera comes down behind the visitor. */
export const INTRO_HANDOVER = (guide: string) => `${guide}, la vieille allumeuse de réverbères, t'attend au pied du Grand Sapin.`;
export const INTRO_HANDOVER_NO_GUIDE = 'Retrouve-les, et le Grand Sapin brillera de nouveau.';

export const DEFAULT_FINALE = [
  'La dernière étoile retrouve sa branche…',
  "…et le Grand Sapin s'embrase de lumière, comme au tout premier hiver de Givrelune.",
  "Merci, voyageur. Les cabanes restent ouvertes toute la nuit : flâne autant qu'il te plaira.",
];

export const OBJECTIVES = {
  meetGuide: (guide: string) => `Rejoins ${guide} au pied du Grand Sapin`,
  findStars: 'Retrouve les étoiles de verre du Grand Sapin',
  backToGuide: (guide: string) => `Retourne voir ${guide} au Grand Sapin`,
  lightTree: 'Admire le Grand Sapin illuminé',
  stroll: 'Flâne dans le marché illuminé',
};

export const PICKUP_LABEL = "Ramasser l'étoile de verre";

/** Toast when a star lands on its branch. */
export function starToast(n: number, total: number): string {
  if (n >= total) return `La dernière étoile de verre ! (${n}/${total})`;
  if (n === 1) return `Ta première étoile de verre ! Regarde-la filer vers le Grand Sapin. (${n}/${total})`;
  if (n === total - 1) return `Plus qu’une étoile à retrouver ! (${n}/${total})`;
  const lines = [
    'Encore une étoile de verre ! Elle file retrouver sa branche.',
    'Une étoile de plus pour le Grand Sapin !',
    'Une étoile de verre ! Le sapin frissonne de plaisir.',
    'Et une de plus, et quelle étoile !',
  ];
  return `${lines[(n - 2) % lines.length]} (${n}/${total})`;
}

/** 8-point compass, from the plaza (θ = atan2(x, z), θ=0 → south). */
export function compass(x: number, z: number): string {
  const a = Math.atan2(x, z);
  const names = ['sud', 'sud-est', 'est', 'nord-est', 'nord', 'nord-ouest', 'ouest', 'sud-ouest'];
  const i = Math.round(((a / (Math.PI * 2)) * 8 + 8) % 8) % 8;
  return names[i];
}

export function plural(n: number, one: string, many: string) {
  return n > 1 ? many : one;
}

export const FINALE_TOAST = 'Joyeux Noël ! Le Grand Sapin brille de nouveau, et le marché est à toi toute la nuit.';
