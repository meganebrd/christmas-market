import type { DialogueChoice, DialogueUI, GameContext, SpeakerInfo } from '../../core/contracts';
import type { CastConfig, PlannedStar, StarId, StoryRuntime } from '../types';
import { castByRole } from '../stars';

export interface CastEnv {
  ctx: GameContext;
  story: StoryRuntime;
  m: CastConfig;
  d: DialogueUI;
}

export type Emotion = 'neutral' | 'happy' | 'surprised' | 'thinking' | 'sad';

const ROLE_TITLE: Record<CastConfig['role'], string> = {
  guide: 'Allumeuse de réverbères',
  barista: 'Barista du Chaudron',
  cook: 'Crêpière',
  'chestnut-seller': 'Marchand de marrons',
  glassblower: 'Maître verrier',
  'carousel-keeper': 'Gardienne du manège',
  'fair-keeper': 'Forain',
  musician: 'Musicien',
  stargazer: 'Astronome en herbe',
  skater: 'Habitué du Lac Gelé',
  child: 'Enfant du village',
  villager: 'Habitant de Givrelune',
};

export function speaker(ctx: GameContext, m: CastConfig): SpeakerInfo {
  return {
    id: 'cast:' + m.id,
    name: m.name,
    title: ROLE_TITLE[m.role],
    color: m.appearance?.outfitColor,
    voicePitch: m.voicePitch,
    anchor: ctx.npcs?.get('cast:' + m.id)?.rig?.root,
  };
}

/** Says a line (safe if the UI is a stub). */
export async function say(env: CastEnv, text: string, emotion: Emotion = 'neutral') {
  await env.d.say(text, { emotion });
}

export async function sayAll(env: CastEnv, texts: string[], emotion: Emotion = 'neutral') {
  for (const t of texts) await say(env, t, emotion);
}

export function choose(env: CastEnv, choices: (DialogueChoice | false | null | undefined)[]): Promise<string> {
  return env.d.choose(choices.filter(Boolean) as DialogueChoice[]);
}

/** Next line of a rotating list (remembered per character & topic, so chatting again says something new). */
export function rotate(env: CastEnv, topic: string, list: string[]): string {
  if (!list.length) return '';
  const key = `talk:${env.m.id}:${topic}`;
  const i = (env.ctx.save.flag<number>(key) ?? 0) % list.length;
  env.ctx.save.flag(key, i + 1);
  return list[i];
}

/** The character's own configured lines first, then the defaults (deduplicated). */
export function withOwnLines(m: CastConfig, defaults: string[]): string[] {
  const out: string[] = [];
  for (const l of [...(m.lines ?? []), ...defaults]) if (l && !out.includes(l)) out.push(l);
  return out;
}

export function talks(env: CastEnv): number {
  return env.ctx.save.flag<number>(`talks:${env.m.id}`) ?? 0;
}

export function countTalk(env: CastEnv) {
  env.ctx.save.flag(`talks:${env.m.id}`, talks(env) + 1);
}

export function star(env: CastEnv, id: StarId): PlannedStar | undefined {
  return env.story.plan.find((s) => s.id === id);
}

export function gameAvailable(ctx: GameContext, id: string | undefined): boolean {
  if (!id) return false;
  try {
    return ctx.minigames.list().some((g) => g.id === id);
  } catch {
    return false;
  }
}

/** Start a mini-game right after the dialogue closes (the core restores the mode when the script ends). */
export function startGameAfter(env: CastEnv, id: string) {
  const { ctx } = env;
  env.story.after(() => {
    if (ctx.minigames.isRunning()) return;
    ctx.minigames.start(id).catch((err) => console.error('[givrelune] mini-game failed', err));
  });
}

/** "au Belvédère", "à la Place", "à l’Atelier", "aux Halles". */
export function aZone(name: string): string {
  if (/^Le /.test(name)) return 'au ' + name.slice(3);
  if (/^La /.test(name)) return 'à la ' + name.slice(3);
  if (/^L['’]/.test(name)) return 'à l’' + name.slice(2);
  if (/^Les /.test(name)) return 'aux ' + name.slice(4);
  return 'à ' + name;
}

/** "du Belvédère", "de la Place", "de l’Atelier", "des Halles". */
export function deZone(name: string): string {
  if (/^Le /.test(name)) return 'du ' + name.slice(3);
  if (/^La /.test(name)) return 'de la ' + name.slice(3);
  if (/^L['’]/.test(name)) return 'de l’' + name.slice(2);
  if (/^Les /.test(name)) return 'des ' + name.slice(4);
  return 'de ' + name;
}

export function zoneName(ctx: GameContext, s: PlannedStar): string {
  return ctx.layout.zones[s.zone]?.name ?? '';
}

/** Céleste's (and the villagers') hint for a star not found yet. */
export function starHint(ctx: GameContext, s: PlannedStar): string {
  if (s.mode === 'hidden') return `J’ai cru voir un éclat ${s.where ?? 'quelque part dans le marché'}. Ouvre l’œil !`;
  const who = s.role ? castByRole(ctx, s.role) : null;
  const hasNpc = who ? !!ctx.npcs?.get('cast:' + who.id) : false;
  const zone = zoneName(ctx, s);
  const at = zone ? aZone(zone) : 'dans le marché';
  const name = who && hasNpc ? who.name : null;
  switch (s.id) {
    case 'flocons':
      return name ? `Va voir ${name}, ${at}. Une étoile est tombée parmi les flocons, là-haut.` : `Une étoile est tombée parmi les flocons, ${at}.`;
    case 'chamboule':
      return name ? `${name}, ${at}, jure qu’une étoile dort au sommet de sa pyramide de boîtes.` : `Il paraît qu’une étoile dort au sommet des boîtes, ${at}.`;
    case 'crepes':
      return name ? `${name}, ${at}, a trouvé un drôle d’éclat dans son pot de farine.` : `Un drôle d’éclat brille dans la farine, ${at}.`;
    case 'verrier':
      return name ? `${name}, ${at}, saura quoi faire d’une étoile de verre. Va donc lui rendre visite.` : `Une étoile a roulé jusqu’au four, ${at}.`;
    case 'manege':
      return name ? `${name} dit qu’une étoile s’est prise dans les rubans du manège, ${at}.` : `Une étoile s’est prise dans les rubans du manège, ${at}.`;
    case 'chaudron':
      return name ? `${name}, ${at}, remue son chaudron avec un drôle d’air. Commande-lui donc quelque chose de chaud !` : `Quelque chose brille au fond du chaudron, ${at}.`;
    case 'lac':
      return `Tout au bout du Lac Gelé, quelque chose scintille sous la lune…`;
  }
}

/** Hints for the stars not found yet, in plan order. */
export function pendingHints(env: CastEnv): string[] {
  return env.story.plan.filter((s) => !env.story.isFound(s.id)).map((s) => starHint(env.ctx, s));
}

export const BYE: DialogueChoice = { id: 'bye', label: 'À plus tard !', icon: '👋' };
