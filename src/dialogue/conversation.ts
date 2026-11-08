/**
 * The vendor conversation script: greeting, then a loop of free questions / choices, answered by the
 * no-AI responder. Registered as `vendor:<stallId>` on ctx.conversations (see index.ts).
 * Everything that touches other modules (npcs, save, ui) is defensive: a missing piece never breaks the talk.
 */
import type { DialogueChoice, GameContext } from '../core/contracts';
import type { ResolvedProduct, ResolvedStall } from '../config/types';
import { createResponder, socialPhrase, type Answer, type Emotion, type Responder, type ResponderOptions } from './responder';

export const VENDOR_CHOICES: DialogueChoice[] = [
  { id: 'creations', label: 'Voir tes créations', icon: '🎁' },
  { id: 'who', label: 'Qui es-tu ?', icon: '🙂' },
  { id: 'site', label: 'Ton site', icon: '🌐' },
  { id: 'bye', label: 'Au revoir', icon: '👋' },
];

const PLACEHOLDER = 'Pose-lui une question…';
const MAX_TURNS = 80;
const WARM_AFTER = 6;

/** One responder per stall object (kept across visits so lines keep varying; rebuilt if the stall changes). */
const responders = new WeakMap<ResolvedStall, Responder>();

export function responderFor(stall: ResolvedStall, town?: string, market?: ResponderOptions['market']): Responder {
  let r = responders.get(stall);
  if (!r) {
    r = createResponder(stall, { town, market });
    responders.set(stall, r);
  }
  return r;
}

type EmoteKind = 'happy' | 'surprised' | 'love' | 'note' | 'sweat' | 'idea';

function safe(fn: () => void) {
  try {
    fn();
  } catch {
    /* another module misbehaved: ignore */
  }
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^mailto:|^tel:/, '');
  }
}

export function productCard(p: ResolvedProduct) {
  const desc = p.description ? (p.description.length > 90 ? p.description.slice(0, 87).replace(/\s+\S*$/, '') + '…' : p.description) : undefined;
  return {
    title: p.name,
    subtitle: [p.priceLabel, desc].filter(Boolean).join(' · ') || undefined,
    image: p.image,
    url: p.url,
    cta: p.url ? 'Voir le produit' : undefined,
  };
}

export function linkCard(link: { label: string; url: string }) {
  const isMail = link.url.startsWith('mailto:');
  const isTel = link.url.startsWith('tel:');
  return {
    title: link.label,
    subtitle: domainOf(link.url),
    url: link.url,
    cta: isMail ? 'Écrire' : isTel ? 'Appeler' : 'Ouvrir le site',
  };
}

function mergeChips(a: string[], b: string[], max = 4): string[] {
  const out: string[] = [];
  for (const s of [...a, ...b]) if (s && !out.includes(s)) out.push(s);
  return out.slice(0, max);
}

function emoteFor(a: Answer): EmoteKind | null {
  if (a.smalltalk === 'compliment') return 'love';
  if (a.smalltalk === 'thanks' || a.smalltalk === 'xmas' || a.smalltalk === 'greeting' || a.smalltalk === 'name') return 'happy';
  if (a.smalltalk === 'insult') return 'sweat';
  if (a.intent === 'fallback') return 'sweat';
  if (a.product) return 'happy';
  if (a.confidence >= 0.9 && a.intent !== 'smalltalk') return 'idea';
  return null;
}

/** Builds the script for one stall. `stallId` is looked up again at run time (editor live changes). */
export function vendorScript(stallId: string, fallbackStall: ResolvedStall) {
  return async (ctx: GameContext): Promise<void> => {
    const stall = ctx.config.stalls.find((s) => s.id === stallId) ?? fallbackStall;
    const ui = ctx.ui.dialogue;
    const responder = responderFor(stall, ctx.config.meta?.town, { stalls: ctx.config.stalls, zones: ctx.config.zones });
    const persona = responder.persona;
    const npc = (() => {
      try {
        return ctx.npcs?.get(`vendor:${stall.id}`);
      } catch {
        return undefined;
      }
    })();
    const rig = npc?.rig;

    const emote = (k: EmoteKind | null) => k && safe(() => rig?.emote(k));
    const say = async (text: string, emotion?: Emotion, card?: Parameters<typeof ui.card>[0]) => {
      if (!text) return;
      safe(() => rig?.setTalking(true));
      try {
        const p = ui.say(text, emotion ? { emotion } : undefined);
        if (card) safe(() => ui.card(card));
        await p;
      } finally {
        safe(() => rig?.setTalking(false));
      }
    };
    const end = async (line?: string) => {
      await say(line ?? responder.farewell(), 'happy');
      emote('happy');
    };
    const openPanel = (what: 'stall' | 'profile') => {
      safe(() => ui.close());
      safe(() => ctx.setMode('panel'));
      if (what === 'stall') ctx.ui.openStall(stall);
      else ctx.ui.openProfile(stall);
    };

    ui.open({
      id: stall.id,
      name: stall.owner.name,
      title: stall.owner.role,
      color: stall.chalet.accent,
      voicePitch: stall.owner.voicePitch,
      anchor: rig?.root,
    });

    // ── greeting
    let returning = false;
    try {
      returning = ctx.save?.data?.visitedStalls?.includes(stall.id) ?? false;
    } catch {
      /* ignore */
    }
    emote('happy');
    const greeting = responder.greeting();
    const greeted = say(returning && Math.random() < 0.5 ? `Re-bonsoir ! ${greeting.replace(/^(bonsoir|bonjour)\s*[!,.]?\s*/i, '')}` : greeting, 'happy');
    // the visit counts as soon as the artisan greets (even if the visitor leaves mid-sentence)
    ctx.events.emit('stall:visited', { stallId: stall.id });
    safe(() =>
      ctx.save?.update((d) => {
        if (!d.visitedStalls.includes(stall.id)) d.visitedStalls.push(stall.id);
      }),
    );
    await greeted;

    // ── question loop
    let chips = responder.suggestions();
    let questions = 0;
    let warmSaid = false;
    let empties = 0;
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const res = await ui.ask({ placeholder: PLACEHOLDER, suggestions: chips, choices: VENDOR_CHOICES });
      if (!res) return end();

      if (res.type === 'choice') {
        if (res.id === 'creations') {
          await say(persona.line('creations'), 'happy');
          emote('happy');
          openPanel('stall');
          return;
        }
        if (res.id === 'who') {
          const lines = responder.introduce();
          emote('happy');
          await say(lines[0], 'happy');
          if (lines[1]) await say(lines[1]);
          const c = await ui.choose([
            { id: 'profile', label: 'Voir sa fiche', icon: '📇' },
            { id: 'stay', label: 'Continuer à discuter', icon: '💬' },
          ]);
          if (c === 'profile') {
            await say(persona.line('profile'), 'happy');
            openPanel('profile');
            return;
          }
          chips = responder.suggestions();
          continue;
        }
        if (res.id === 'site') {
          if (stall.website) {
            await say(persona.line('site'), 'happy', { title: stall.name, subtitle: domainOf(stall.website), url: stall.website, cta: 'Visiter le site' });
          } else {
            const social = stall.links?.find((l) => l.kind && ['instagram', 'facebook', 'etsy', 'tiktok', 'youtube'].includes(l.kind));
            if (social) await say(`Tu me trouves ${socialPhrase([social])} !`, 'happy', linkCard(social));
            else await say(persona.line('noSite'));
          }
          continue;
        }
        // 'bye' and unknown choices
        return end();
      }

      const text = (res.value ?? '').trim();
      if (!text) {
        empties++;
        if (empties >= 2) return end();
        await say(persona.line('empty'));
        continue;
      }
      empties = 0;

      const a = responder.answer(text);
      if (a.intent !== 'smalltalk') questions++;
      emote(emoteFor(a));
      const card = a.product ? productCard(a.product) : a.link ? linkCard(a.link) : undefined;
      await say(a.text, a.emotion, card);

      if (a.action === 'bye') {
        emote('happy');
        return;
      }
      if (a.action === 'openStall') {
        openPanel('stall');
        return;
      }
      if (a.action === 'openProfile') {
        openPanel('profile');
        return;
      }
      if (questions >= WARM_AFTER && !warmSaid) {
        warmSaid = true;
        emote('love');
        await say(persona.line('warm'), 'happy');
      }
      chips = mergeChips(a.followUps, responder.suggestions());
    }
    await end();
  };
}
