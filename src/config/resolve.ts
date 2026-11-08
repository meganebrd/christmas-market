import type {
  CastMember,
  CastRole,
  CharacterAppearance,
  KnowledgeChunk,
  MarketFile,
  ProductConfig,
  ResolvedMarket,
  ResolvedProduct,
  ResolvedStall,
  ScannedProduct,
  ScannedStallData,
  StallConfig,
  StallLink,
  ZoneConfig,
  ZoneId,
} from './types';

/** Pure: no DOM, no Vite. Used by the game, the editor, the tests and the scanner. */

export const ZONE_IDS: ZoneId[] = ['gate', 'plaza', 'bar', 'food', 'workshop', 'rink', 'belvedere', 'fair', 'carousel'];

export const DEFAULT_ZONES: Record<ZoneId, Required<ZoneConfig>> = {
  gate: { enabled: true, name: 'La Porte du Givre', subtitle: 'Entrée du marché' },
  plaza: { enabled: true, name: 'La Place du Grand Sapin', subtitle: 'Cœur du marché' },
  bar: { enabled: true, name: 'Le Chaudron Doré', subtitle: 'Vin chaud & chocolat' },
  food: { enabled: true, name: 'Le Coin Gourmand', subtitle: 'Crêpes, marrons & pain d’épices' },
  workshop: { enabled: true, name: 'L’Atelier du Verrier', subtitle: 'Boules de verre soufflé' },
  rink: { enabled: true, name: 'Le Lac Gelé', subtitle: 'Patinoire' },
  belvedere: { enabled: true, name: 'Le Belvédère des Étoiles', subtitle: 'Vue sur la vallée' },
  fair: { enabled: true, name: 'Le Chamboule-Neige', subtitle: 'Jeu d’adresse' },
  carousel: { enabled: true, name: 'Le Manège des Songes', subtitle: 'Carrousel d’antan' },
};

const ROLE_ZONE: Record<CastRole, ZoneId> = {
  guide: 'plaza',
  barista: 'bar',
  cook: 'food',
  'chestnut-seller': 'food',
  glassblower: 'workshop',
  'carousel-keeper': 'carousel',
  'fair-keeper': 'fair',
  musician: 'plaza',
  stargazer: 'belvedere',
  skater: 'rink',
  child: 'plaza',
  villager: 'plaza',
};

const SKINS = ['#f6d7c3', '#eac0a0', '#d9a07a', '#b97a56', '#8d5a3d', '#5e3b29'];
const HAIRS = ['#2b1d16', '#5a3825', '#8a5a35', '#c48a4a', '#e2c08a', '#b0472f', '#d9d4cc', '#3a3a44'];
const COATS = ['#b8413a', '#2f5d50', '#3c5a8a', '#8a5a9c', '#c98a2e', '#6b4f3a', '#d06a5a', '#4b7d8f'];
const SCARVES = ['#e8c547', '#d94f45', '#f2efe6', '#4f8a5b', '#5b7fc7', '#c76b9e'];

/** Deterministic hash → [0,1) */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function pick<T>(arr: T[], seed: string): T {
  return arr[Math.floor(hash01(seed) * arr.length) % arr.length];
}

export function resolveAppearance(a: CharacterAppearance | undefined, seed: string): Required<CharacterAppearance> {
  return {
    skin: a?.skin ?? pick(SKINS, seed + 'skin'),
    hair: a?.hair ?? pick(HAIRS, seed + 'hair'),
    hairStyle: a?.hairStyle ?? pick(['short', 'long', 'bun', 'braids', 'curly', 'ponytail', 'bob'] as const, seed + 'hs'),
    outfit: a?.outfit ?? 'coat',
    outfitColor: a?.outfitColor ?? pick(COATS, seed + 'coat'),
    outfitColor2: a?.outfitColor2 ?? '#3b3340',
    scarf: a?.scarf === undefined ? pick(SCARVES, seed + 'scarf') : a.scarf,
    hat: a?.hat ?? pick(['beanie', 'bobble', 'beret', 'none', 'earmuffs'] as const, seed + 'hat'),
    hatColor: a?.hatColor ?? pick(SCARVES, seed + 'hatc'),
    accessory: a?.accessory ?? 'none',
    beard: a?.beard ?? null,
    height: clamp(a?.height ?? 1, 0.8, 1.2),
    build: clamp(a?.build ?? 1, 0.8, 1.25),
  };
}

export function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function parsePrice(p: number | string | undefined): number | undefined {
  if (p === undefined || p === null || p === '') return undefined;
  if (typeof p === 'number') return Number.isFinite(p) ? p : undefined;
  const m = p.replace(/\s/g, '').match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!m) return undefined;
  return parseFloat(m[1].replace(',', '.'));
}

export function formatPrice(price: number | undefined, currency = 'EUR', locale = 'fr'): string | undefined {
  if (price === undefined) return undefined;
  try {
    return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
      style: 'currency',
      currency,
      minimumFractionDigits: price % 1 === 0 ? 0 : 2,
    }).format(price);
  } catch {
    return `${price} ${currency}`;
  }
}

function normalizeUrl(u: string) {
  return u.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
}

export function resolveProducts(
  stall: StallConfig,
  scanned: ScannedStallData | undefined,
  locale: string,
): ResolvedProduct[] {
  const byUrl = new Map<string, ScannedProduct>();
  for (const p of scanned?.products ?? []) byUrl.set(normalizeUrl(p.url), p);

  let configs: ProductConfig[] = stall.products ?? [];
  const auto = stall.knowledge?.scan?.autoProducts ?? 6;
  if (configs.length === 0 && scanned?.products?.length) {
    configs = scanned.products.slice(0, auto).map((p) => ({ url: p.url }));
  }

  const out: ResolvedProduct[] = [];
  configs.forEach((c, i) => {
    const s = c.url ? byUrl.get(normalizeUrl(c.url)) : undefined;
    const name = c.name ?? s?.name;
    if (!name) return; // cannot show a nameless product
    const price = parsePrice(c.price) ?? s?.price;
    const currency = c.currency ?? s?.currency ?? 'EUR';
    out.push({
      id: c.id ?? slugify(name) + '-' + i,
      name,
      url: c.url ?? s?.url,
      price,
      currency,
      priceLabel: typeof c.price === 'string' && price === undefined ? c.price : formatPrice(price, currency, locale),
      image: c.image ?? s?.image,
      description: c.description ?? s?.description,
      featured: c.featured ?? false,
    });
  });
  return out;
}

/** Turns the hand-written knowledge + products + scanned pages into searchable chunks. */
export function buildChunks(stall: StallConfig, products: ResolvedProduct[], scanned?: ScannedStallData): KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = [];
  const k = stall.knowledge ?? {};
  const owner = stall.owner;
  if (stall.tagline) chunks.push({ id: 'tagline', text: stall.tagline, topic: 'about' });
  if (owner.bio) chunks.push({ id: 'bio', text: owner.bio, topic: 'about' });
  if (k.description) {
    k.description
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .forEach((p, i) => chunks.push({ id: `desc-${i}`, text: p, topic: 'about' }));
  }
  (k.faq ?? []).forEach((f, i) => chunks.push({ id: `faq-${i}`, title: f.q, text: f.a, topic: 'faq' }));
  (k.facts ?? []).forEach((f, i) => chunks.push({ id: `fact-${i}`, title: f.topic, text: f.text, topic: f.topic }));
  products.forEach((p) => {
    const parts = [p.name];
    if (p.priceLabel) parts.push(`Prix : ${p.priceLabel}.`);
    if (p.description) parts.push(p.description);
    chunks.push({ id: `product-${p.id}`, title: p.name, text: parts.join(' — '), topic: 'product', source: p.url });
  });
  for (const c of scanned?.chunks ?? []) chunks.push({ ...c, id: `scan-${c.id}` });
  return chunks;
}

/** Hand-written links first, then what the scanner found (socials, e-mail, phone), without duplicates. */
function mergeLinks(stall: StallConfig, scanned?: ScannedStallData): StallLink[] {
  const out: StallLink[] = [...(stall.links ?? [])];
  const has = (url: string) => out.some((l) => l.url.replace(/\/$/, '').toLowerCase() === url.replace(/\/$/, '').toLowerCase());
  for (const s of scanned?.site.social ?? []) if (!has(s.url)) out.push(s);
  const email = scanned?.site.email;
  if (email && !out.some((l) => l.kind === 'mail') && !has('mailto:' + email)) out.push({ label: email, url: 'mailto:' + email, kind: 'mail' });
  const phone = scanned?.site.phone;
  if (phone && !out.some((l) => l.kind === 'phone')) out.push({ label: phone, url: 'tel:' + phone.replace(/[^\d+]/g, ''), kind: 'phone' });
  return out;
}

export function resolveStall(stall: StallConfig, scanned: ScannedStallData | undefined, locale: string, index: number): ResolvedStall {
  const seed = stall.id;
  const products = resolveProducts(stall, scanned, locale);
  const owner = stall.owner ?? { name: 'Artisan' };
  const firstName = owner.name.split(' ')[0];
  return {
    ...stall,
    website: stall.website ?? scanned?.source,
    links: mergeLinks(stall, scanned),
    order: stall.order ?? index,
    owner: {
      ...owner,
      greetings: owner.greetings?.length
        ? owner.greetings
        : [`Bonsoir et bienvenue chez ${stall.name} ! Moi c'est ${firstName}.`, `Oh, de la visite ! Approche, approche, il fait meilleur près des lampions.`],
      farewells: owner.farewells?.length ? owner.farewells : ['Belle soirée au marché !', 'Reviens quand tu veux, la porte est toujours ouverte.'],
      mood: owner.mood ?? 'chaleureux',
      appearance: resolveAppearance(owner.appearance, seed),
      voicePitch: owner.voicePitch ?? 0.85 + hash01(seed + 'voice') * 0.5,
    },
    chalet: {
      wood: stall.chalet?.wood ?? pick(['#8a5a3b', '#9b6a45', '#7a4e33', '#a87b52'], seed + 'wood'),
      roof: stall.chalet?.roof ?? pick(['#5a3a2a', '#6b3b33', '#3f4a5c', '#4a5a3f'], seed + 'roof'),
      accent: stall.chalet?.accent ?? pick(['#b8413a', '#2f5d50', '#c98a2e', '#3c5a8a'], seed + 'accent'),
      sign: stall.chalet?.sign ?? stall.name,
      signColor: stall.chalet?.signColor ?? '#f3e6c8',
      signTextColor: stall.chalet?.signTextColor ?? '#4a2c1a',
      garland: stall.chalet?.garland ?? 'warm',
      awning: stall.chalet?.awning ?? 'stripes',
      awningColors: stall.chalet?.awningColors ?? ['#b8413a', '#f3ead8'],
      snow: stall.chalet?.snow ?? true,
    },
    decorations: stall.decorations ?? [{ type: 'wreath' }, { type: 'lantern' }, { type: 'mini-tree' }],
    products,
    chunks: buildChunks(stall, products, scanned),
    scanned,
  };
}

const DEFAULT_CAST: CastMember[] = [
  { id: 'celeste', name: 'Céleste', role: 'guide' },
  { id: 'barnabe', name: 'Barnabé', role: 'barista' },
];

export function resolveMarket(
  market: MarketFile,
  stalls: StallConfig[],
  generated: ScannedStallData[] = [],
): ResolvedMarket {
  const locale = market.meta.locale ?? 'fr';
  const genById = new Map(generated.map((g) => [g.stallId, g]));
  const zones = { ...DEFAULT_ZONES };
  for (const id of ZONE_IDS) zones[id] = { ...DEFAULT_ZONES[id], ...(market.zones?.[id] ?? {}) };
  zones.gate.enabled = true;
  zones.plaza.enabled = true;

  const resolvedStalls = stalls
    .map((s, i) => resolveStall(s, genById.get(s.id), locale, i))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  return {
    meta: { ...market.meta, locale, title: market.meta.title, town: market.meta.town },
    theme: {
      timeOfDay: market.theme?.timeOfDay ?? 'dusk',
      accent: market.theme?.accent ?? '#c0453a',
      lightColor: market.theme?.lightColor ?? '#ffc56b',
      aurora: market.theme?.aurora ?? true,
      snow: market.theme?.snow ?? 1,
    },
    story: {
      enabled: market.story?.enabled ?? true,
      intro: market.story?.intro ?? [],
      finale: market.story?.finale ?? [],
      stars: clamp(market.story?.stars ?? 7, 1, 7),
    },
    music: {
      enabled: market.music?.enabled ?? true,
      volume: market.music?.volume ?? 0.6,
      shuffle: market.music?.shuffle ?? false,
      tracks: market.music?.tracks?.length
        ? market.music.tracks
        : [
            { type: 'procedural', song: 'valse-de-givrelune' },
            { type: 'procedural', song: 'douce-nuit' },
            { type: 'procedural', song: 'mon-beau-sapin' },
            { type: 'procedural', song: 'il-est-ne' },
          ],
    },
    cast: (market.cast?.length ? market.cast : DEFAULT_CAST).map((c) => ({
      ...c,
      zone: c.zone ?? ROLE_ZONE[c.role] ?? 'plaza',
      appearance: resolveAppearance(c.appearance, c.id),
      voicePitch: c.voicePitch ?? 0.85 + hash01(c.id + 'voice') * 0.5,
    })),
    zones,
    stalls: resolvedStalls,
  };
}
