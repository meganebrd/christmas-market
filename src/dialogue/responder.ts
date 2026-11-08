/**
 * The no-AI question answering engine for one artisan.
 *
 *   const r = createResponder(stall);
 *   r.answer("Tu livres ?") → { text: "Oui ! J'expédie partout en France…", confidence: 0.9, intent: 'livraison', followUps: [...] }
 *
 * Pipeline: normalise → smalltalk → intents → product match → BM25 over the stall's chunks (title & topic boosts,
 * intent expansion) → best sentences → first-person voice → persona wrapper. Pure TS: browser, Node, tests.
 */
import type { KnowledgeChunk, ResolvedProduct, ResolvedStall, StallLink, ZoneConfig, ZoneId } from '../config/types';
import { DEFAULT_ZONES } from '../config/resolve';
import { Bm25Index } from './bm25';
import {
  detectIntents,
  detectSmalltalk,
  expansionStems,
  intentsForTopic,
  type IntentHit,
  type IntentId,
  type SmalltalkKind,
} from './intents';
import { editDistance, normalize, splitSentences, stem, tokenize, tokenizeNormalized } from './normalize';
import { createPersona, type Persona } from './persona';
import { atPlace, detectPlace } from './places';
import { articleFor, capitalize, isThirdPerson, shortRef, toFirstPerson } from './voice';

export type Emotion = 'neutral' | 'happy' | 'surprised' | 'thinking' | 'sad';

export interface Answer {
  text: string;
  /** 0..1 — how sure the engine is that the text answers the question. */
  confidence: number;
  /** Detected intent id ('livraison', 'prix'…) or 'smalltalk' / 'fallback'. */
  intent?: string;
  product?: ResolvedProduct;
  link?: { label: string; url: string };
  /** 2–3 short questions the visitor may ask next. */
  followUps: string[];
  /** Extras for the conversation script. */
  smalltalk?: SmalltalkKind;
  emotion?: Emotion;
  action?: 'openStall' | 'openProfile' | 'bye';
  /** Id of the chunk the answer comes from (debug/tests). */
  source?: string;
  /** Another stall that sells what was asked ("va voir Gaspard à L'Établi de Gaspard !"). */
  referral?: { stallId: string; name: string; owner: string };
}

export interface Responder {
  answer(question: string): Answer;
  /** 3–5 short natural questions, based on what the knowledge actually covers. */
  suggestions(): string[];
  /** "Qui es-tu ?" — 1 or 2 lines in the artisan's voice. */
  introduce(): string[];
  greeting(): string;
  farewell(): string;
  readonly persona: Persona;
}

export interface ResponderOptions {
  /** Town name used in the introduction ("ciergière ici à Givrelune"). */
  town?: string;
  /** Injectable RNG (tests). */
  random?: () => number;
  /** The whole market: lets the artisan send visitors to another stall or to a fun zone. */
  market?: {
    stalls?: ResolvedStall[];
    zones?: Partial<Record<ZoneId, Partial<ZoneConfig>>>;
  };
}

interface IndexedChunk {
  chunk: KnowledgeChunk;
  strong: Set<IntentId>;
  weak: Set<IntentId>;
  /** Weak tags whose text matched at least one strong pattern ("ouvert de 15 h à 21 h"). */
  mentions: Set<IntentId>;
  curated: boolean;
  kind: 'fact' | 'faq' | 'desc' | 'about' | 'product' | 'scan';
  productId?: string;
  sentences: { text: string; tokens: string[] }[];
  norm: string;
}

const MAX_ANSWER = 280;
const PRODUCT_INTENTS = new Set<IntentId | undefined>([undefined, 'prix', 'cadeau', 'catalogue']);
const CARD_INTENTS = new Set<IntentId | undefined>([undefined, 'prix', 'cadeau', 'catalogue', 'taille', 'matieres', 'allergenes', 'duree']);
/** What a good answer sentence contains, per intent. */
const WANT: Partial<Record<IntentId, RegExp>> = {
  contact: /@|(?:\d{2}[\s.]?){4}\d{2}|\+\d{2}|\b(?:rue|chemin|place|route|avenue|impasse|allée)\b/i,
  promo: /r[ée]duction|offerte?s?\b|moiti[ée] prix|promo|remise|gratuit|consign|-\s?\d+\s?%|\d+\s?€ de moins/i,
  histoire: /commenc|depuis|\b(?:19|20)\d{2}\b|appris|grand-(?:père|mère)|\b\d+ ans\b|arrivée?|installée?|repris|racheté|fondé|lancé|avant,/i,
  prix: /\d+(?:[.,]\d+)?\s?€|\beuros?\b/,
  duree: /\d+\s*(?:h\b|heures?|jours?|semaines?|mois|min|ans)|\b(?:une|deux|trois|quatre|cinq|six|huit|dix)\s+(?:heures?|jours?|semaines?|mois|soirées?)/i,
  horaires: /\d+\s*h\b|\b(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|soirs?|matins?)\b/i,
  livraison: /colissimo|relais|lettre suivie|\d+\s?€|offert|exp[ée]di|envo/i,
  taille: /\d+\s*(?:cm|mm|m\b|g\b|kg|cl|ml|l\b)|\btaille\b|\bdu \d+ au \d+/i,
};
/** Intents whose answer must come from a chunk about that very topic (otherwise: an honest "see my site"). */
const STRICT = new Set<IntentId>(['paiement', 'promo', 'horaires', 'livraison', 'allergenes', 'taille', 'personnalisation', 'entretien', 'duree']);
const TOPIC_LABEL: Partial<Record<IntentId, string>> = {
  paiement: 'le paiement',
  promo: 'les promotions',
  horaires: 'mes horaires',
  livraison: 'la livraison',
  allergenes: 'les allergènes',
  taille: 'les tailles et les dimensions',
  personnalisation: 'une commande sur mesure',
  entretien: 'l’entretien',
  duree: 'les durées et les délais',
  contact: 'me contacter',
};
const NETWORKS: { kind: NonNullable<StallLink['kind']>; re: RegExp; name: string; phrase: string }[] = [
  { kind: 'instagram', re: /(^|\s)(instagram|insta)(\s|$)/, name: 'Instagram', phrase: 'sur Instagram' },
  { kind: 'facebook', re: /(^|\s)(facebook|fb)(\s|$)/, name: 'Facebook', phrase: 'sur Facebook' },
  { kind: 'etsy', re: /(^|\s)etsy(\s|$)/, name: 'Etsy', phrase: 'sur ma boutique Etsy' },
  { kind: 'tiktok', re: /(^|\s)tik ?tok(\s|$)/, name: 'TikTok', phrase: 'sur TikTok' },
  { kind: 'youtube', re: /(^|\s)(youtube|you tube)(\s|$)/, name: 'YouTube', phrase: 'sur ma chaîne YouTube' },
];
/** Shop words that take an article in "va voir Albane à la Papeterie du Vieux Moulin". */
const PLACE_GENDER: Record<string, 'm' | 'f' | 'pl'> = {
  papeterie: 'f', boulangerie: 'f', patisserie: 'f', savonnerie: 'f', fromagerie: 'f', epicerie: 'f', brasserie: 'f', librairie: 'f', ferme: 'f',
  maison: 'f', cabane: 'f', boutique: 'f', bijouterie: 'f', chocolaterie: 'f', confiserie: 'f', poterie: 'f', verrerie: 'f', fabrique: 'f', mercerie: 'f',
  atelier: 'm', moulin: 'm', chalet: 'm', comptoir: 'm', jardin: 'm', rucher: 'm', coin: 'm', cellier: 'm', grenier: 'm', fournil: 'm',
  savons: 'pl', bougies: 'pl', jouets: 'pl', douceurs: 'pl', delices: 'pl', saveurs: 'pl', bijoux: 'pl', merveilles: 'pl', mailles: 'pl',
};
const atStall = (name: string) => atPlace(name, (w) => PLACE_GENDER[normalize(w)] ?? null);

/** Social links phrased by network ("sur Instagram et sur ma boutique Etsy"), never by their free-text label. */
export function socialPhrase(links: StallLink[] | undefined, max = 2): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of links ?? []) {
    const n = NETWORKS.find((x) => x.kind === l.kind);
    if (!n || seen.has(n.kind)) continue;
    seen.add(n.kind);
    out.push(n.phrase);
    if (out.length >= max) break;
  }
  return joinList(out);
}

/** Matches product names against query tokens (shared by the stall itself and the cross-stall referrals). */
export function createProductMatcher(list: ResolvedProduct[]) {
  const entries = list.map((p) => {
    const tokens = [...new Set(tokenize(p.name))];
    return { p, tokens, head: tokens[0] ?? '', desc: new Set(tokenize(p.description ?? '')) };
  });
  const df = new Map<string, number>();
  for (const e of entries) for (const t of e.tokens) df.set(t, (df.get(t) ?? 0) + 1);
  const heads = new Map<string, number>();
  for (const e of entries) heads.set(e.head, (heads.get(e.head) ?? 0) + 1);
  const P = entries.length;
  const w = (t: string) => Math.log(1 + P / (df.get(t) ?? 1));
  const fuzzyEq = (q: string, t: string) =>
    q === t ||
    (q.length >= 4 && t.length >= 4 && (q.startsWith(t) || t.startsWith(q)) && Math.abs(q.length - t.length) <= 2) ||
    (q.length >= 5 && t.length >= 5 && editDistance(q, t, 1) <= 1);
  return {
    entries,
    /** Best product whose name the query designates, or null. */
    match(qTokens: string[]): { p: ResolvedProduct; score: number; matched: string[] } | null {
      if (!P || !qTokens.length) return null;
      const scored = entries
        .map((e) => {
          let total = 0;
          let hit = 0;
          let headHit = false;
          const matched: string[] = [];
          for (const t of e.tokens) {
            const wt = w(t);
            total += wt;
            const q = qTokens.find((x) => fuzzyEq(x, t));
            if (q) {
              hit += wt;
              matched.push(q);
              if (t === e.head) headHit = true;
            }
          }
          const coverage = total ? hit / total : 0;
          const headUnique = headHit && heads.get(e.head) === 1 && (df.get(e.head) ?? 1) <= Math.max(1, P / 2);
          return { e, score: Math.max(coverage, headUnique ? 0.6 : 0), coverage, matched };
        })
        .sort((a, b) => b.score - a.score);
      const best = scored[0];
      const second = scored[1];
      if (!best || best.score < 0.5) return null;
      if (second && second.score >= 0.5 && best.score - second.score < 0.1 && best.coverage < 1) return null;
      return { p: best.e.p, score: best.score, matched: best.matched };
    },
    /** Some product name contains this token. */
    nameHas(t: string): boolean {
      return entries.some((e) => e.tokens.some((x) => fuzzyEq(t, x)));
    },
    /** A single product whose name or description contains every given token ("en pot", "poivrée", "miel"). */
    mention(tokens: string[]): ResolvedProduct | null {
      if (!tokens.length) return null;
      const scored = entries
        .map((e) => {
          let sc = 0;
          for (const t of tokens) {
            if (e.tokens.some((x) => fuzzyEq(t, x))) sc += 2;
            else if (e.desc.has(t)) sc += 1;
            else return { e, sc: 0 };
          }
          return { e, sc };
        })
        .filter((x) => x.sc > 0)
        .sort((a, b) => b.sc - a.sc);
      if (!scored.length || (scored[1] && scored[1].sc === scored[0].sc)) return null;
      return scored[0].e.p;
    },
  };
}

/** Words that carry no question on their own ("il fait froid ce soir", "bonjour madame"). */
const FILLER = new Set(
  'soir ce cette ici dehors aujourd hui maintenant encore vraiment tellement beaucoup madame monsieur mademoiselle toi gens monde marche nuit matin soiree journee meme aussi joli jolie belle super chouette hein bon quand'
    .split(' ')
    .map(stem),
);
/** Question words around a product name ("combien coûte…", "où je trouve…", "tu vends…"). */
const GENERIC_Q = new Set(
  'coute coutent cout prix tarif vends vendez vend vendre trouve trouver trouves cherche cherches acheter achete parle parler combien veux voudrais aimerais offrir euro euros faire fais donne montre voir prendre prends recommande conseille propose proposes avoir produit produits article articles creation creations chose choses moins plus cher chere chers cheres moin quoi lequel laquelle meilleur meilleure'
    .split(' ')
    .map(stem),
);
const NOT_QUANTITY = new Set(['temps', 'heure', 'heures', 'jour', 'jours', 'semaine', 'semaines', 'mois', 'an', 'ans', 'annee', 'annees', 'minutes', 'coute', 'coutent', 'vaut', 'valent', 'ca', 'ce', 'cela', 'est', 'sont', 'pour', 'euro', 'euros', 'le', 'la', 'les', 'un', 'une', 'fait', 'font']);
const SUGGESTION_ORDER: IntentId[] = [
  'livraison', 'fabrication', 'matieres', 'personnalisation', 'histoire', 'entretien', 'duree', 'horaires', 'allergenes', 'taille', 'paiement', 'contact', 'cadeau',
];
const SUGGESTION_TEXT: Partial<Record<IntentId, string>> = {
  livraison: 'Tu livres ?',
  fabrication: 'C’est fait comment ?',
  matieres: 'C’est fait avec quoi ?',
  personnalisation: 'Tu fais du sur-mesure ?',
  histoire: 'Depuis quand tu fais ça ?',
  entretien: 'Tu as des conseils d’entretien ?',
  duree: 'Ça dure combien de temps ?',
  horaires: 'Tu ouvres quand ?',
  allergenes: 'Il y a des allergènes ?',
  taille: 'Quelles tailles tu proposes ?',
  paiement: 'Je peux payer par carte ?',
  contact: 'Comment te contacter ?',
  cadeau: 'Tu me conseilles quoi pour offrir ?',
  site: 'Tu as un site ?',
  catalogue: 'Tu vends quoi ?',
};

function firstName(full: string) {
  return full.trim().split(/\s+/)[0] ?? full;
}

function lowerFirst(s: string) {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

function endPunct(s: string) {
  const t = s.trim();
  return /[.!?…»)]$/.test(t) ? t : t + '.';
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Trims a long sentence at a clause boundary (only used for single sentences longer than the budget). */
function clip(s: string, max = MAX_ANSWER): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const at = Math.max(cut.lastIndexOf(', '), cut.lastIndexOf(' ; '), cut.lastIndexOf(' : '), cut.lastIndexOf(' – '));
  return (at > max * 0.5 ? cut.slice(0, at) : cut.slice(0, cut.lastIndexOf(' '))).replace(/[,;:\s–-]+$/, '') + '…';
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(', ') + ' et ' + items[items.length - 1];
}

function kindOf(c: KnowledgeChunk): IndexedChunk['kind'] {
  if (c.id.startsWith('scan-')) return 'scan';
  if (c.id.startsWith('fact-')) return 'fact';
  if (c.id.startsWith('faq-')) return 'faq';
  if (c.id.startsWith('desc-')) return 'desc';
  if (c.id.startsWith('product-')) return 'product';
  return 'about';
}

export function createResponder(stall: ResolvedStall, opts: ResponderOptions = {}): Responder {
  const random = opts.random ?? Math.random;
  const persona = createPersona(stall.owner.mood, random);
  const owner = stall.owner;
  const first = firstName(owner.name);
  const website = stall.website || stall.links?.find((l) => l.kind === 'site')?.url;

  // ── index the chunks
  const indexed: IndexedChunk[] = (stall.chunks ?? [])
    .filter((c) => c && typeof c.text === 'string' && c.text.trim())
    .map((c) => {
      const kind = kindOf(c);
      const strong = new Set<IntentId>(intentsForTopic(c.topic));
      if (kind === 'fact' || kind === 'scan') intentsForTopic(c.title).forEach((i) => strong.add(i));
      if (c.title && kind !== 'product') {
        const hits = detectIntents(normalize(c.title));
        if (hits[0] && hits[0].score >= 2) strong.add(hits[0].id);
        for (const h of hits.slice(1)) if (h.score >= 2) strong.add(h.id);
      }
      const weak = new Set<IntentId>();
      const mentions = new Set<IntentId>();
      for (const h of detectIntents(normalize(c.text))) {
        if (h.score >= 2 && !strong.has(h.id)) weak.add(h.id);
        if (h.strong > 0 && !strong.has(h.id)) mentions.add(h.id);
      }
      if (kind === 'product') {
        weak.add('prix');
        weak.add('catalogue');
      }
      strong.delete('identite');
      const sentences = splitSentences(c.text).map((text) => ({ text, tokens: tokenize(text) }));
      const productId = kind === 'product' ? c.id.slice('product-'.length) : undefined;
      return { chunk: c, strong, weak, mentions, curated: kind !== 'scan', kind, productId, sentences, norm: normalize(c.text) };
    });

  const bm25 = new Bm25Index(
    indexed.map((ic) => ({ title: ic.chunk.title ? tokenize(ic.chunk.title) : [], text: tokenize(ic.chunk.text) })),
    { titleWeight: 2 },
  );

  // ── product names (this stall, and lazily the other stalls of the market for referrals)
  const matcher = createProductMatcher(stall.products ?? []);
  const products = matcher.entries;
  let others: { stall: ResolvedStall; m: ReturnType<typeof createProductMatcher> }[] | null = null;
  function crossMatch(qTokens: string[]): { stall: ResolvedStall; p: ResolvedProduct; score: number; matched: string[] } | null {
    const all = opts.market?.stalls;
    if (!all?.length || !qTokens.length) return null;
    others ??= all.filter((s) => s.id !== stall.id && s.products?.length).map((s) => ({ stall: s, m: createProductMatcher(s.products) }));
    let best: { stall: ResolvedStall; p: ResolvedProduct; score: number; matched: string[] } | null = null;
    for (const o of others) {
      const r = o.m.match(qTokens);
      if (r && r.score >= 0.6 && (!best || r.score > best.score)) best = { stall: o.stall, p: r.p, score: r.score, matched: r.matched };
    }
    return best;
  }
  const zoneName = (id: ZoneId): string | null => {
    const z = opts.market?.zones?.[id];
    if (z?.enabled === false) return null;
    return z?.name ?? DEFAULT_ZONES[id]?.name ?? null;
  };

  // ── what the knowledge covers (for suggestions)
  const covered = new Set<IntentId>();
  for (const ic of indexed) if (ic.curated || ic.kind === 'scan') ic.strong.forEach((i) => covered.add(i));
  for (const ic of indexed) if (ic.curated && ic.kind !== 'product') ic.weak.forEach((i) => (i === 'fabrication' || i === 'matieres' || i === 'histoire') && covered.add(i));

  // ── conversation state
  const askedIntents = new Set<string>();
  const askedSuggestions = new Set<string>();
  let lastOffer: 'stall' | 'howareyou' | null = null;
  let lastGreeting = '';
  let lastFarewell = '';

  function matchProduct(qTokens: string[]): { entry: { p: ResolvedProduct }; score: number; matched: string[] } | null {
    const m = matcher.match(qTokens);
    return m ? { entry: { p: m.p }, score: m.score, matched: m.matched } : null;
  }

  function productLabel(p: ResolvedProduct) {
    return articleFor(p.name);
  }

  function firstSentence(text: string | undefined): string {
    if (!text) return '';
    const s = splitSentences(text)[0] ?? '';
    return s ? endPunct(s) : '';
  }

  function voice(sentence: string): string | null {
    if (!isThirdPerson(sentence, owner.name)) return sentence;
    return toFirstPerson(sentence, owner.name);
  }

  /** 1–3 sentences of a chunk, ranked by overlap with the query, in reading order, ≤ 280 chars. */
  function extract(ic: IndexedChunk, query: Map<string, number>, want?: RegExp): string {
    const sents = ic.sentences;
    if (!sents.length) return '';
    const whole = ic.chunk.text.replace(/\s+/g, ' ').trim();
    const voiced = (list: string[]) => {
      const out: string[] = [];
      for (const s of list) {
        const v = voice(s);
        if (v) out.push(v);
        else if (list.length === 1) out.push(persona.line('thirdPerson', s.replace(/[.]$/, '')));
      }
      return out.join(' ');
    };
    if ((ic.kind === 'faq' || ic.kind === 'fact') && (whole.length <= 200 || (sents.length <= 2 && whole.length <= MAX_ANSWER + 20))) return voiced(sents.map((s) => s.text));
    const scoreOf = (i: number) => {
      let sc = 0;
      const seen = new Set<string>();
      for (const t of sents[i].tokens) {
        if (seen.has(t)) continue;
        seen.add(t);
        const qw = query.get(t);
        if (qw) sc += qw * bm25.idf(t);
      }
      // the sentence carries the kind of data the question asks for (an e-mail, a price, a duration…)
      if (want && want.test(sents[i].text)) sc += 1.5;
      return sc;
    };
    const scores = sents.map((_, i) => scoreOf(i));
    let best = 0;
    // a FAQ answer starts with the direct answer ("Oui ! …"): keep its first sentence
    if (ic.kind !== 'faq') for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
    const picked = new Set([best]);
    let len = sents[best].text.length;
    // extend with neighbours: matching ones first, then a short follow-up for context
    const tryAdd = (i: number, need: boolean) => {
      if (i < 0 || i >= sents.length || picked.has(i) || picked.size >= 3) return false;
      if (need && scores[i] <= 0) return false;
      if (len + 1 + sents[i].text.length > MAX_ANSWER) return false;
      picked.add(i);
      len += 1 + sents[i].text.length;
      return true;
    };
    tryAdd(best + 1, true);
    tryAdd(best - 1, true);
    if (len < 120) tryAdd(best + 1, false) || tryAdd(Math.max(...picked) + 1, false);
    const ordered = [...picked].sort((a, b) => a - b).map((i) => sents[i].text);
    if (ordered.length === 1) return clip(voiced(ordered));
    return voiced(ordered);
  }

  function followUps(current?: string): string[] {
    return suggestionList(current).slice(0, 3);
  }

  function suggestionList(current?: string): string[] {
    const out: string[] = [];
    const push = (q: string | undefined, intent?: string) => {
      if (!q || askedSuggestions.has(q) || out.includes(q)) return;
      if (intent && (askedIntents.has(intent) || intent === current)) return;
      out.push(q);
    };
    const priced = products.filter((e) => e.p.price !== undefined || e.p.priceLabel);
    const featured = priced.find((e) => e.p.featured) ?? priced[0];
    const ordered = SUGGESTION_ORDER.filter((i) => covered.has(i));
    // interleave: 2 knowledge topics, the featured product price, then the rest
    ordered.slice(0, 2).forEach((i) => push(SUGGESTION_TEXT[i], i));
    if (featured) {
      const ref = shortRef(featured.p.name);
      const plural = articleFor(featured.p.name).plural;
      push(`Combien ${plural ? 'coûtent' : 'coûte'} ${ref} ?`, 'prix');
    }
    ordered.slice(2).forEach((i) => push(SUGGESTION_TEXT[i], i));
    if (out.length < 3 && products.length) push(SUGGESTION_TEXT.catalogue, 'catalogue');
    if (out.length < 3 && website) push(SUGGESTION_TEXT.site, 'site');
    if (out.length < 3) {
      const other = priced.filter((e) => e !== featured).slice(0, 2);
      for (const e of other) push(`Combien ${articleFor(e.p.name).plural ? 'coûtent' : 'coûte'} ${shortRef(e.p.name)} ?`);
    }
    return out.slice(0, 5);
  }

  function siteLink(): { label: string; url: string } | undefined {
    if (!website) return undefined;
    return { label: `Le site de ${stall.name}`, url: website };
  }

  function contactLink(): { label: string; url: string } | undefined {
    const mail = stall.links?.find((l) => l.kind === 'mail' || l.url.startsWith('mailto:'));
    if (mail) return { label: mail.label || 'M’écrire', url: mail.url };
    const email = stall.scanned?.site.email;
    if (email) return { label: 'M’écrire', url: `mailto:${email}` };
    const phone = stall.links?.find((l) => l.kind === 'phone' || l.url.startsWith('tel:'));
    if (phone) return { label: phone.label || 'M’appeler', url: phone.url };
    return siteLink();
  }

  function finish(a: Omit<Answer, 'followUps'> & { followUps?: string[] }): Answer {
    if (a.intent && a.intent !== 'smalltalk' && a.intent !== 'fallback') askedIntents.add(a.intent);
    const text = a.text.replace(/\s+/g, ' ').trim();
    return { ...a, text, confidence: Math.max(0, Math.min(1, a.confidence)), followUps: a.followUps ?? followUps(a.intent) };
  }

  function withOpener(text: string, confidence: number, prefix = '', useOpener = true): string {
    const o = prefix || !useOpener ? '' : persona.opener(confidence);
    return [prefix, o, text].filter(Boolean).join(' ');
  }

  function smalltalkPrefix(kinds: SmalltalkKind[], name?: string): string {
    if (kinds.includes('name') && name) return `Bienvenue, ${name} !`;
    if (kinds.includes('thanks')) return 'Avec plaisir !';
    if (kinds.includes('compliment')) return 'Merci !';
    if (kinds.includes('xmas')) return 'Joyeux Noël !';
    if (kinds.includes('greeting')) return 'Bonsoir !';
    return '';
  }

  function smalltalkAnswer(kinds: SmalltalkKind[], name?: string): Answer {
    const kind = kinds[0];
    let text: string;
    let emotion: Emotion = 'happy';
    let action: Answer['action'];
    if (kind === 'bye') {
      text = (kinds.includes('thanks') ? 'Avec plaisir ! ' : '') + pickFarewell();
      action = 'bye';
    } else if (kind === 'name') {
      text = persona.line('small:name', name ?? '');
    } else if ((kind === 'yes' || kind === 'no') && lastOffer === 'stall') {
      lastOffer = null;
      if (kind === 'yes') return finish({ text: persona.line('creations'), confidence: 0.9, intent: 'smalltalk', smalltalk: kind, emotion, action: 'openStall' });
      text = persona.line('small:no');
      emotion = 'neutral';
    } else if (kind === 'weather') {
      const bar = zoneName('bar');
      text = bar ? persona.line('weatherBar', atStall(bar)) : persona.line('small:weather');
    } else if (kind === 'yes' && lastOffer === 'howareyou') {
      text = persona.line('small:glad');
    } else {
      text = persona.line(`small:${kind}`);
      if (kind === 'insult' || kind === 'sorry') emotion = kind === 'insult' ? 'sad' : 'neutral';
      if (kind === 'no' || kind === 'yes') emotion = 'neutral';
    }
    if (kinds.includes('greeting') && kind !== 'greeting' && kind !== 'bye' && !/^bonsoir/i.test(text)) text = `Bonsoir ! ${text}`;
    lastOffer = kind === 'howareyou' ? 'howareyou' : null;
    return finish({ text, confidence: 0.9, intent: 'smalltalk', smalltalk: kind, emotion, action });
  }

  function fallback(intent?: IntentId, prefix = ''): Answer {
    const link = siteLink();
    let text = persona.line('fallback');
    if (!link) text = 'Hmm, ça je ne saurais pas te dire… Demande-moi plutôt comment je travaille, ou regarde mes créations !';
    return finish({
      text: [prefix, text].filter(Boolean).join(' '),
      confidence: 0.1,
      intent: 'fallback',
      link,
      emotion: 'thinking',
      followUps: suggestionList(intent).slice(0, 3),
    });
  }

  function productAnswer(p: ResolvedProduct, intent: IntentId | undefined, score: number, prefix: string): Answer {
    const { ref } = productLabel(p);
    const desc = firstSentence(p.description);
    const price = p.priceLabel;
    let text: string;
    if (intent === 'prix') {
      text = price ? `${capitalize(ref)}, c’est ${price}. ${desc}` : `Pour ${ref}, le prix est indiqué sur mon site !`;
    } else if (intent === 'cadeau') {
      text = `${persona.line('gift', ref)} ${desc}${price ? ` C’est ${price}.` : ''}`;
      text = capitalize(text);
    } else {
      text = `${capitalize(persona.line('product', ref))} ${desc}${price ? ` C’est ${price}.` : ''}`;
    }
    const conf = 0.6 + 0.35 * Math.min(1, score);
    return finish({
      text: withOpener(text, conf, prefix, intent === 'prix'),
      confidence: conf,
      intent: intent ?? 'produit',
      product: p,
      emotion: 'happy',
      source: `product-${p.id}`,
    });
  }

  function catalogueAnswer(prefix: string): Answer {
    if (!products.length) return fallback('catalogue', prefix);
    const items: string[] = [];
    let len = 0;
    for (const e of products) {
      const item = articleFor(e.p.name).ref + (e.p.priceLabel ? ` (${e.p.priceLabel})` : '');
      if (len + item.length > 200 || items.length >= 4) break;
      items.push(item);
      len += item.length + 2;
    }
    const more = products.length > items.length ? ', et d’autres encore' : '';
    lastOffer = 'stall';
    const text = `Sur mon étal, tu trouveras ${joinList(items)}${more} ! ${persona.line('catalogueOutro')}`;
    const outro = text.endsWith('?');
    if (!outro) lastOffer = null;
    return finish({ text: [prefix, text].filter(Boolean).join(' '), confidence: 0.85, intent: 'catalogue', emotion: 'happy' });
  }

  function priceOverview(prefix: string): Answer | null {
    const prices = products.map((e) => e.p).filter((p) => p.price !== undefined) as (ResolvedProduct & { price: number })[];
    if (!prices.length) return null;
    prices.sort((a, b) => a.price - b.price);
    const lo = prices[0];
    const hi = prices[prices.length - 1];
    const text =
      lo.price === hi.price
        ? `Tout est à ${lo.priceLabel} sur mon étal.`
        : `Mes créations vont de ${lo.priceLabel} pour ${articleFor(lo.name).ref} à ${hi.priceLabel} pour ${articleFor(hi.name).ref}.`;
    return finish({ text: withOpener(text, 0.75, prefix), confidence: 0.75, intent: 'prix', source: 'products' });
  }

  function identityAnswer(prefix: string): Answer {
    const lines = introduce();
    const text = lines.join(' ').length <= 330 ? lines.join(' ') : lines[0];
    return finish({ text: [prefix, text].filter(Boolean).join(' '), confidence: 0.95, intent: 'identite', emotion: 'happy', source: 'bio' });
  }

  const join = (...parts: string[]) => parts.filter(Boolean).join(' ');
  const firstSocial = () => (stall.links ?? []).find((l) => NETWORKS.some((n) => n.kind === l.kind));

  function siteAnswer(prefix: string): Answer {
    const link = siteLink();
    const socials = socialPhrase(stall.links);
    if (!link) {
      const social = firstSocial();
      if (social) return finish({ text: join(prefix, `Tu me trouves ${socials} !`), confidence: 0.8, intent: 'site', link: { label: social.label, url: social.url } });
      return finish({ text: join(prefix, persona.line('noSite')), confidence: 0.7, intent: 'site' });
    }
    const extra = socials ? ` Tu me trouves aussi ${socials}.` : '';
    return finish({ text: join(prefix, persona.line('site') + extra), confidence: 0.9, intent: 'site', link, emotion: 'happy' });
  }

  /** "Tu as un compte Instagram ?" */
  function networkAnswer(net: (typeof NETWORKS)[number], prefix: string): Answer {
    const l = (stall.links ?? []).find((x) => x.kind === net.kind);
    if (l) return finish({ text: join(prefix, persona.line('network', net.phrase)), confidence: 0.9, intent: 'site', link: { label: l.label || net.name, url: l.url }, emotion: 'happy' });
    const site = siteLink();
    const others = socialPhrase(stall.links);
    const social = firstSocial();
    if (others && social) {
      return finish({ text: join(prefix, `Pas de compte ${net.name} pour moi… Mais tu me trouves ${others} !`), confidence: 0.8, intent: 'site', link: { label: social.label, url: social.url } });
    }
    return finish({ text: join(prefix, persona.line(site ? 'noNetwork' : 'noNetworkNoSite', net.name)), confidence: 0.75, intent: 'site', link: site });
  }

  function contactAnswer(prefix: string, chunkText?: string, force = false): Answer {
    const link = contactLink();
    const email = stall.links?.find((l) => l.url.startsWith('mailto:'))?.url.slice(7).split('?')[0] ?? stall.scanned?.site.email;
    const phone = stall.links?.find((l) => l.url.startsWith('tel:'))?.url.slice(4) ?? stall.scanned?.site.phone;
    const address = stall.scanned?.site.address;
    const socials = socialPhrase(stall.links);
    let text = '';
    if (chunkText && (force || WANT.contact!.test(chunkText) || (!email && !phone))) text = chunkText;
    const parts: string[] = [];
    if (email && !text.includes(email)) parts.push(`m’écrire à ${email}`);
    if (phone && !text.replace(/\s/g, '').includes(phone.replace(/\s/g, ''))) parts.push(`m’appeler au ${phone}`);
    if (parts.length) text = join(text, `${text ? 'Tu peux aussi' : 'Tu peux'} ${joinList(parts)}.`);
    if (address && !text.includes(address)) text = join(text, `Mon adresse : ${address}.`);
    if (socials && !force && text.length < 200) text = join(text, text ? `Je suis aussi ${socials}.` : `Tu me trouves ${socials}.`);
    if (!text) {
      if (!link) return fallback('contact', prefix);
      return finish({ text: join(prefix, 'Le plus simple, c’est de passer par mon site : tout y est !'), confidence: 0.6, intent: 'contact', link });
    }
    return finish({ text: chunkText ? withOpener(text, 0.85, prefix) : join(prefix, text), confidence: 0.85, intent: 'contact', link: link ?? (firstSocial() ? { label: firstSocial()!.label, url: firstSocial()!.url } : undefined) });
  }

  /** Confident question on a topic the artisan's texts don't cover: say so honestly, point to the site. */
  function topicFallback(intent: IntentId, prefix: string, norm: string): Answer {
    const link = siteLink();
    const giftCard = /(^|\s)(cartes?|bons?|cheques?) (cadeaux?|d achat)(\s|$)|gift cards?/.test(norm);
    const label = giftCard ? 'les cartes cadeaux' : TOPIC_LABEL[intent] ?? 'ça';
    let text: string;
    if (intent === 'promo' && !giftCard) {
      text = link ? 'Je n’ai pas de promotion à t’annoncer ici… Mais jette un œil à mon site, on ne sait jamais !' : 'Je n’ai pas de promotion à t’annoncer, mais tout est fait avec amour, ça compte aussi !';
    } else if (link) {
      text = pickFrom([`Pour ${label}, le mieux est de regarder sur mon site : tout y est indiqué.`, `Pour ${label}, je préfère ne pas te dire de bêtise : regarde sur mon site, c’est plus sûr.`], '');
    } else {
      text = `Pour ${label}, je ne voudrais pas te dire de bêtise… Demande-moi plutôt comment je travaille !`;
    }
    return finish({ text: join(prefix, text), confidence: 0.3, intent, link, emotion: 'thinking', followUps: suggestionList(intent).slice(0, 3) });
  }

  /** "Où est ton atelier ?" → a sentence of the texts that says where it is. */
  const WHERE = /\b(?:dans|au|aux|à|près|derrière|devant|au bord|au pied|à deux pas|en face|entre|sur la|sur le|en altitude|rue|chemin|place)\b/i;
  function placeSentence(word: string): string | null {
    const st = stem(normalize(word));
    let best: { text: string; sc: number } | null = null;
    for (const ic of indexed) {
      if (!ic.curated || ic.kind === 'product') continue;
      for (const se of ic.sentences) {
        const address = ic.strong.has('contact') && /\b(?:rue|chemin|place|route|avenue|impasse)\b/i.test(se.text);
        if (!address && (!se.tokens.includes(st) || !WHERE.test(se.text))) continue;
        const sc = (address ? 4 : 0) + (ic.kind === 'fact' ? 1 : 0) - se.text.length / 400;
        if (!best || sc > best.sc) best = { text: se.text, sc };
      }
    }
    if (!best) return null;
    const v = voice(best.text);
    return v ? clip(v) : null;
  }

  /** Toilets, parking, unknown places → the market map. */
  function mapAnswer(prefix: string): Answer {
    return finish({ text: join(prefix, persona.line('map')), confidence: 0.6, intent: 'lieu', emotion: 'neutral' });
  }

  /** "Où je trouve du vin chaud ?" → the fun zone of the market that has it. */
  function zoneAnswer(zone: ZoneId, what: string, prefix: string): Answer | null {
    const name = zoneName(zone);
    if (!name) return null;
    return finish({ text: join(prefix, capitalize(persona.line('zone', what, atStall(name)))), confidence: 0.8, intent: 'lieu', emotion: 'happy' });
  }

  /** "Combien coûte le petit train ?" at a stall that doesn't sell it → the stall that does. */
  function referralAnswer(other: { stall: ResolvedStall; p: ResolvedProduct }, prefix: string, local?: ResolvedProduct | null): Answer {
    const o = other.stall;
    const ref = articleFor(other.p.name).ref;
    let text = capitalize(persona.line('referral', ref, firstName(o.owner.name), atStall(o.name)));
    if (local) text = join(text, persona.line('referralAlso', articleFor(local.name).ref));
    return finish({
      text: join(prefix, text),
      confidence: 0.8,
      intent: 'catalogue',
      product: other.p,
      referral: { stallId: o.id, name: o.name, owner: o.owner.name },
      emotion: 'happy',
    });
  }

  /** "Pour un enfant de 5 ans ?" → the product whose name/description fits the query, if any. */
  const AUDIENCE: Record<string, string[]> = {
    enfant: ['enfant', 'jouet', 'bebe', 'ans', 'mois', 'jeu', 'jouer'],
    bebe: ['bebe', 'naissance', 'mois'],
    grand: ['grand mere', 'grand pere', 'mamie', 'papy', 'doux', 'chaud'],
    cuisine: ['cuisine', 'gourmand', 'miel', 'chocolat'],
  };
  function giftPick(qTokens: string[], norm: string): ResolvedProduct | null {
    if (!products.length) return null;
    const terms = new Set(qTokens);
    if (/(^|\s)(enfants?|petite?s?|gamins?|fils|fille|neveux?|nieces?|kids?|ado|\d+ ans)(\s|$)/.test(norm)) AUDIENCE.enfant.forEach((w) => tokenizeNormalized(w).forEach((t) => terms.add(t)));
    if (/(^|\s)(bebe|naissance|nourrisson)(\s|$)/.test(norm)) AUDIENCE.bebe.forEach((w) => tokenizeNormalized(w).forEach((t) => terms.add(t)));
    for (const t of expansionStems('cadeau')) terms.delete(t);
    for (const t of ['conseil', 'conseill', 'offrir', 'cadeau', 'quoi', 'pour']) terms.delete(stem(t));
    const age = norm.match(/(\d+)\s*ans/);
    let best: { p: ResolvedProduct; sc: number } | null = null;
    for (const e of products) {
      const toks = new Set([...e.tokens, ...e.desc]);
      let sc = 0;
      for (const t of terms) if (toks.has(t)) sc += e.tokens.includes(t) ? 2 : 1;
      if (age && e.p.description) {
        const m = normalize(e.p.description).match(/(des|a partir de|partir de) (\d+) (ans|mois)/);
        if (m) {
          const min = m[3] === 'mois' ? Number(m[2]) / 12 : Number(m[2]);
          sc += min <= Number(age[1]) ? 2 : -3;
        }
      }
      if (sc > 0 && (!best || sc > best.sc || (sc === best.sc && e.p.featured && !best.p.featured))) best = { p: e.p, sc };
    }
    return best?.p ?? null;
  }

  function pickFrom(list: string[], last: string): string {
    if (!list.length) return '';
    if (list.length === 1) return list[0];
    let c = list[Math.floor(random() * list.length) % list.length];
    if (c === last) c = list[(list.indexOf(c) + 1) % list.length];
    return c;
  }

  function pickFarewell(): string {
    lastFarewell = pickFrom(owner.farewells ?? ['À bientôt !'], lastFarewell) || 'À bientôt !';
    return lastFarewell;
  }

  function introduce(): string[] {
    const role = owner.role ? lowerFirst(owner.role) : '';
    const town = opts.town;
    let line1 = role ? `Moi, c’est ${first}, ${role}${town ? ` ici à ${town}` : ''} !` : `Moi, c’est ${first}, de ${stall.name} !`;
    const bioSents: string[] = [];
    for (const s of splitSentences(owner.bio ?? '')) {
      const v = toFirstPerson(s, owner.name);
      if (v && bioSents.join(' ').length + v.length < 220) bioSents.push(v);
      if (bioSents.length >= 2) break;
    }
    if (bioSents.length) line1 += ' ' + bioSents.join(' ');
    else if (stall.tagline) line1 += ` Ici, ${lowerFirst(endPunct(stall.tagline))}`;
    // 1–2 sentences of the description that don't repeat the bio
    const bioTokens = new Set(tokenize(bioSents.join(' ')));
    const desc = (stall.knowledge?.description ?? '').split(/\n\s*\n/)[0] ?? '';
    const picked: string[] = [];
    for (const s of splitSentences(desc)) {
      const toks = tokenize(s);
      const overlap = toks.length ? toks.filter((t) => bioTokens.has(t)).length / toks.length : 0;
      if (overlap > 0.3) continue;
      const v = voice(s);
      if (!v) continue;
      if (picked.join(' ').length + v.length > 240) break;
      picked.push(v);
      if (picked.length >= 2) break;
    }
    return [line1, picked.join(' ')].filter(Boolean);
  }

  function answer(question: string): Answer {
    const raw = (question ?? '').slice(0, 400);
    const norm = normalize(raw);
    if (!norm) return finish({ text: persona.line('empty'), confidence: 0, intent: 'smalltalk', emotion: 'neutral' });

    // ── smalltalk
    const st = detectSmalltalk(raw, norm);
    const rest = st.kinds.length ? st.rest : norm;
    const restTokens = tokenizeNormalized(rest);
    const intents: IntentHit[] = detectIntents(rest);
    const confident = intents.some((h) => h.score >= 2);
    if (st.kinds.length) {
      const onlyFiller = restTokens.every((t) => FILLER.has(t));
      // "Il fait froid ce soir !", "tu es nul", "bonjour madame" → just smalltalk
      if ((!restTokens.length && !intents.length) || (!confident && (onlyFiller || st.kinds.some((k) => k === 'weather' || k === 'insult')))) {
        return smalltalkAnswer(st.kinds, st.visitorName);
      }
    }
    const prefix = st.kinds.length ? smalltalkPrefix(st.kinds, st.visitorName) : '';
    lastOffer = null;
    askedSuggestions.add(raw.trim());

    const top = intents[0];
    /** confident intent (drives the special answers) */
    const intent: IntentId | undefined = top && top.score >= 2 ? top.id : undefined;
    /** weak hint (only boosts the search) */
    const hint: IntentId | undefined = top?.id;
    // words that triggered an intent are "explained" even if the stall's texts use other words
    const explained = new Set<string>();
    if (top && restTokens.some((t) => !bm25.has(t))) {
      const ws = rest.split(' ');
      const triggers = (txt: string) => detectIntents(txt).some((h) => h.id === top.id || h.score >= 2);
      const single = ws.map((w) => w.length >= 3 && triggers(w));
      ws.forEach((w, i) => single[i] && explained.add(stem(w)));
      // multi-word expressions ("frais de port") — only when no single word of the window explains it already
      for (let n = 2; n <= 3; n++) {
        for (let i = 0; i + n <= ws.length; i++) {
          if (single.slice(i, i + n).some(Boolean)) continue;
          const win = ws.slice(i, i + n);
          if (triggers(win.join(' '))) win.forEach((w) => explained.add(stem(w)));
        }
      }
    }
    // "combien de ruches ?" → a sentence with a number next to the word is probably the answer
    const qm = rest.match(/(?:^|\s)combien (?:de )?(\w+)/);
    const quantity = !!qm && !NOT_QUANTITY.has(qm[1]);

    // ── special intents
    const place = detectPlace(rest);
    if (intent === 'identite') return identityAnswer(prefix);
    const net = NETWORKS.find((n) => n.re.test(rest));
    if (net && !intents.some((h) => h.id !== 'site' && h.score >= 2)) return networkAnswer(net, prefix);
    if (intent === 'site' && !intents.some((h) => h.id !== 'site' && h.score >= top.score)) return siteAnswer(prefix);

    // ── product match (this stall, then the market: zones and other stalls)
    const qTokens = restTokens.filter((t) => t.length > 1);
    const pm = matchProduct(qTokens);
    const productQuestion = !intent || intent === 'prix' || intent === 'catalogue' || place.question;
    if (!pm && place.zone && productQuestion && !place.aboutMe) {
      const z = zoneAnswer(place.zone, place.what ?? '', prefix);
      if (z) return z;
    }
    if (!pm && productQuestion && !place.aboutMe && qTokens.length) {
      const generic = new Set<string>([...explained, ...(intent ? expansionStems(intent) : [])]);
      const specific = qTokens.filter((t) => !generic.has(t) && !GENERIC_Q.has(t) && !FILLER.has(t));
      const sellsIt = specific.some((t) => matcher.nameHas(t));
      if (specific.length) {
        const local = PRODUCT_INTENTS.has(intent) || place.question ? matcher.mention(specific) : null;
        const other = sellsIt ? null : crossMatch(specific);
        if (other) return referralAnswer(other, prefix, local);
        if (local && (intent === 'prix' || !intent || place.question)) return productAnswer(local, intent, 0.55, prefix);
        // "Combien coûte un vélo ?" → nobody sells it here
        if (intent === 'prix' && products.length && !sellsIt && specific.every((t) => !bm25.has(t) && !bm25.resolve(t).length)) {
          const list = joinList(products.slice(0, 3).map((e) => articleFor(e.p.name).ref));
          return finish({ text: join(prefix, persona.line('notSold', list)), confidence: 0.4, intent: 'catalogue', emotion: 'thinking' });
        }
      }
    }
    // "Où sont les toilettes ?", "Où est Céleste ?" → the market map (never a random product)
    if (place.question && !place.aboutMe && !pm && (place.facility || !intent)) return mapAnswer(prefix);
    if (intent === 'catalogue' && !pm) return catalogueAnswer(prefix);
    // "c'est combien la bougie pain d'épices ?", "tu as des moufles ?" → the product itself (with its card)
    // ("comment préparer le chocolat chaud en pot ?" is a how-to: the FAQ answers it, the product chunk is only boosted)
    const howWhy = /(^|\s)(comment|pourquoi|how|why)(\s|$)/.test(rest);
    if (pm && PRODUCT_INTENTS.has(intent) && !howWhy) return productAnswer(pm.entry.p, intent, pm.score, prefix);

    // ── BM25
    const query = new Map<string, number>();
    const contentTerms: string[] = [];
    for (const t of qTokens) {
      // an intent word the texts don't use ("demain") is not a typo of another word ("semaine")
      const res = explained.has(t) && !bm25.has(t) ? [] : bm25.resolve(t);
      if (!res.length && !explained.has(t)) contentTerms.push('∅' + t);
      for (const [v, w] of res) {
        query.set(v, Math.max(query.get(v) ?? 0, w));
        if (!contentTerms.includes(v)) contentTerms.push(v);
      }
    }
    const expansions = hint ? expansionStems(hint) : [];
    for (const e of expansions) for (const [v] of bm25.resolve(e)) if (!query.has(v)) query.set(v, 0.35);
    // second intent's expansions (lighter)
    if (intents[1] && intents[1].score >= 2) for (const e of expansionStems(intents[1].id)) for (const [v] of bm25.resolve(e)) if (!query.has(v)) query.set(v, 0.2);

    const hits = bm25.search(query);
    const hitByIndex = new Map(hits.map((h) => [h.index, h]));
    // a question made only of intent words ("C'est fait comment ?") must be answered by a chunk about that intent
    const intentOnly = !contentTerms.length && !!hint && indexed.some((ic) => ic.strong.has(hint) || ic.weak.has(hint));
    const sinceWhen = hint === 'histoire' && /(^|\s)(depuis|since|commence)/.test(rest);
    let best: { ic: IndexedChunk; score: number; idx: number } | null = null;
    for (let i = 0; i < indexed.length; i++) {
      const ic = indexed[i];
      const h = hitByIndex.get(i);
      const tagged = !!hint && (ic.strong.has(hint) || ic.weak.has(hint));
      if (intentOnly && !tagged) continue;
      let s = h?.score ?? 0;
      if (hint) {
        const k = intent ? 1 : 0.5;
        if (ic.strong.has(hint)) s = s * (1 + 0.5 * k) + 2 * k;
        else if (ic.weak.has(hint)) s = s * (1 + 0.2 * k) + 0.5 * k;
      }
      if (ic.kind === 'product' && hint && (!CARD_INTENTS.has(hint) || hint === 'duree')) s *= 0.6;
      if (intents[1] && intents[1].score >= 2 && ic.strong.has(intents[1].id)) s += 0.6;
      if (!s) continue;
      if (!ic.curated) s *= 0.85;
      const contentHit = !!h && contentTerms.some((t) => h.matched.has(t));
      if (tagged || contentHit) {
        if (ic.kind === 'fact') s += 0.3;
        else if (ic.kind === 'faq') s += 0.2;
      }
      if (ic.chunk.id === 'tagline') s *= 0.6;
      if (sinceWhen) {
        // "Depuis quand ?" → how it all started, not a certification date
        if (tagged && WANT.histoire!.test(ic.chunk.text)) s += 1.5;
        else if (ic.strong.size && !ic.strong.has('histoire')) s *= 0.5;
      }
      if (pm && ic.productId === pm.entry.p.id) s += CARD_INTENTS.has(hint) && hint !== 'duree' ? 1.5 : 0.3;
      if (h && ic.chunk.title && contentTerms.length >= 2 && h.titleMatched.size >= Math.ceil(contentTerms.length * 0.6)) s += 1;
      // a chunk clearly about another topic is a poor answer to a confident intent
      if (intent && ic.strong.size && !ic.strong.has(intent) && (ic.kind === 'faq' || ic.kind === 'fact' || ic.kind === 'scan')) s *= 0.8;
      if (quantity && h) {
        for (const t of h.matched) if (new RegExp(`\\d+\\s+(?:(?!(?:les|des|la|le|de|du|et|en|a|au|aux|sur|pour)\\s)\\S+\\s+)?${t}`).test(ic.norm)) {
          s += 2;
          break;
        }
      }
      if (!best || s > best.score) best = { ic, score: s, idx: i };
    }

    // confidence
    let confidence = 0;
    if (best) {
      const h = hitByIndex.get(best.idx);
      const matchedContent = contentTerms.filter((t) => h?.matched.has(t)).length;
      const intentMatch = hint ? (best.ic.strong.has(hint) ? 1 : best.ic.weak.has(hint) ? 0.5 : 0) * (intent ? 1 : 0.6) : 0;
      if (!contentTerms.length) confidence = intentMatch ? 0.5 + 0.3 * intentMatch : h?.matched.size ? 0.42 : 0;
      else {
        const coverage = matchedContent / contentTerms.length;
        confidence = 0.12 + 0.5 * coverage + 0.3 * intentMatch + (h?.titleMatched.size ? 0.05 : 0);
        if (!matchedContent && !intentMatch) confidence = 0;
      }
    }

    // intent-specific answers built from structured data when the texts don't cover it
    if (intent === 'contact' && place.aboutMe && place.mine) {
      const where = placeSentence(place.mine);
      if (where) return contactAnswer(prefix, where, true);
      // nothing in the texts says where it is: be honest
      const w = place.mine;
      const poss = /^(ruches|ruchers)$/.test(w) ? 'mes' : /^[aeiouyh]/.test(w) || !/^(boutique|ferme|forge|cabane|maison)$/.test(w) ? 'mon' : 'ma';
      const link = siteLink();
      const text = link ? `Pour trouver ${poss} ${w}, le mieux est de regarder sur mon site : tout y est indiqué.` : `${capitalize(poss)} ${w} ? Tu es juste devant mon chalet, c’est déjà ça !`;
      return finish({ text: join(prefix, text), confidence: 0.4, intent: 'contact', link: contactLink(), emotion: 'thinking' });
    }
    if (intent === 'contact' && (!best || !best.ic.strong.has('contact') || confidence < 0.5)) return contactAnswer(prefix);
    if (intent && STRICT.has(intent)) {
      const onTopic = !!best && (best.ic.strong.has(intent) || (best.ic.weak.has(intent) && (best.ic.mentions.has(intent) || contentTerms.some((t) => !t.startsWith('∅')))));
      if (!onTopic) return topicFallback(intent, prefix, norm);
    }
    if (intent === 'prix' && !pm && (!best || confidence < 0.55 || !best.ic.strong.has('prix')) && (!contentTerms.some((t) => !t.startsWith('∅')) || confidence < 0.55)) {
      const ov = priceOverview(prefix);
      if (ov) return ov;
    }
    if (intent === 'cadeau' && (!best || confidence < 0.6 || !best.ic.strong.has('cadeau'))) {
      // a product that fits the request ("pour un enfant de 5 ans") before the artisan's favourite
      const fit = giftPick(qTokens, rest);
      const fav = fit ?? (products.find((e) => e.p.featured) ?? products[0])?.p;
      if (fav) {
        const { ref } = articleFor(fav.name);
        const desc = firstSentence(fav.description);
        const lead = capitalize(persona.line(fit ? 'giftFor' : 'favourite', ref));
        const text = `${lead} ${desc}${fav.priceLabel ? ` C’est ${fav.priceLabel}.` : ''}`;
        return finish({ text: join(prefix, text), confidence: fit ? 0.75 : 0.65, intent: 'cadeau', product: fav, emotion: 'happy', source: `product-${fav.id}` });
      }
    }

    if (!best || confidence < 0.4) {
      // "tu vends des pulls ?" → not on my stall, but here is what I have
      if (!intent && /\b(vends|vendez|as|avez|fais|faites|proposes|proposez|trouve)\b.*\b(des|du|de la|un|une|de)\b/.test(norm) && products.length && qTokens.length) {
        const list = joinList(products.slice(0, 3).map((e) => articleFor(e.p.name).ref));
        return finish({ text: [prefix, persona.line('notSold', list)].filter(Boolean).join(' '), confidence: 0.35, intent: 'catalogue', emotion: 'thinking' });
      }
      if (st.kinds.length) return smalltalkAnswer(st.kinds, st.visitorName);
      if (intent === 'site') return siteAnswer(prefix);
      if (intent === 'catalogue') return catalogueAnswer(prefix);
      return fallback(intent, prefix);
    }

    if (best.ic.kind === 'product' && best.ic.productId && PRODUCT_INTENTS.has(intent)) {
      const prod = products.find((e) => e.p.id === best!.ic.productId)?.p;
      if (prod) return productAnswer(prod, intent, Math.min(1, confidence), prefix);
    }

    let body = extract(best.ic, query, hint ? WANT[hint] : undefined);
    // "Combien de temps… ?" is not a yes/no question: drop a leading "Oui !" / "Bien sûr !"
    if (/(^|\s)(combien|comment|quand|quel|quelle|quels|quelles|pourquoi|ou|qui|quoi|how|what|when|why|where)(\s|$)/.test(rest)) {
      const stripped = body.replace(/^(oui|bien sûr|bien sur|évidemment|absolument|tout à fait|of course|yes)\s*!\s*/i, '');
      if (stripped.length > 20) body = capitalize(stripped);
    }
    if (!body) return fallback(intent, prefix);
    if (intent === 'contact') return contactAnswer(prefix, body);
    const product = pm && CARD_INTENTS.has(intent) && intent !== 'duree' ? pm.entry.p : best.ic.kind === 'product' && CARD_INTENTS.has(intent) ? products.find((e) => e.p.id === best!.ic.productId)?.p : undefined;
    const link = intent === 'site' || intent === 'personnalisation' && /site|ecri/.test(normalize(body)) ? siteLink() : undefined;
    return finish({
      text: withOpener(body, confidence, prefix),
      confidence,
      intent: hint ?? (best.ic.chunk.topic ? String(best.ic.chunk.topic) : undefined),
      product,
      link,
      emotion: confidence >= 0.7 ? 'happy' : 'neutral',
      source: best.ic.chunk.id,
    });
  }

  return {
    persona,
    answer,
    suggestions() {
      const list = suggestionList();
      return list.length >= 3 ? list : [...list, ...['Qui es-tu ?', 'Tu vends quoi ?', 'Tu as un site ?'].filter((x) => !list.includes(x))].slice(0, Math.max(3, list.length));
    },
    introduce,
    greeting() {
      lastGreeting = pickFrom(owner.greetings ?? [], lastGreeting) || `Bonsoir et bienvenue chez ${stall.name} !`;
      return lastGreeting;
    },
    farewell: pickFarewell,
  };
}

export type { IntentId, SmalltalkKind };
