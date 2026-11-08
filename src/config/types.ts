/**
 * Givrelune — content schema.
 *
 * This is THE contract between the people who create a market (JSON files in /content)
 * and the engine. Everything is optional except what is strictly needed to show a stall:
 * sensible defaults are applied in `src/config/load.ts`.
 *
 *   content/market.json          → MarketFile   (the town, the story, the music, the hosts)
 *   content/stalls/<id>.json     → StallConfig  (one file per artisan: easy to PR)
 *   content/generated/<id>.json  → ScannedStallData (written by `npm run scan`, never by hand)
 */

// ───────────────────────────── Market ─────────────────────────────

export type Locale = 'fr' | 'en';

export interface MarketFile {
  meta: MarketMeta;
  theme?: ThemeConfig;
  story?: StoryConfig;
  music?: MusicConfig;
  /** Story / ambience characters (guide, barista, cook, glassblower…). */
  cast?: CastMember[];
  /** Fun zones of the market. Disable one with `enabled: false`. */
  zones?: Partial<Record<ZoneId, ZoneConfig>>;
}

export interface MarketMeta {
  /** Name of the market, shown on the title screen. */
  title: string;
  /** Name of the (fictional) town. */
  town: string;
  tagline?: string;
  description?: string;
  locale?: Locale;
  /** Optional link to the organiser (shown in credits). */
  organizer?: { name: string; url?: string };
}

export interface ThemeConfig {
  /** 'dusk' = blue hour with a warm horizon, 'night' = deep night sky. */
  timeOfDay?: 'dusk' | 'night';
  /** Main accent colour (UI, ribbons). */
  accent?: string;
  /** Warm light colour used by lamps and garlands. */
  lightColor?: string;
  /** Show the aurora in the sky. */
  aurora?: boolean;
  /** Snowfall density multiplier (0 = no snow). */
  snow?: number;
}

export interface StoryConfig {
  enabled?: boolean;
  /** Lines narrated during the intro fly-over. */
  intro?: string[];
  /** Lines narrated when every glass star has been found. */
  finale?: string[];
  /** Number of glass stars to find (max 7). */
  stars?: number;
}

export interface MusicConfig {
  enabled?: boolean;
  /** 0..1 */
  volume?: number;
  /** Shuffle the playlist. */
  shuffle?: boolean;
  /** Playlist. Procedural tracks are generated live (public-domain carols). */
  tracks?: MusicTrack[];
}

export type MusicTrack =
  | { type: 'procedural'; song: ProceduralSongId; title?: string }
  | { type: 'file'; src: string; title: string; author?: string; license?: string; url?: string };

export type ProceduralSongId =
  | 'douce-nuit'
  | 'mon-beau-sapin'
  | 'il-est-ne'
  | 'vive-le-vent'
  | 'les-anges'
  | 'deck-the-halls'
  | 'we-wish-you'
  | 'greensleeves'
  | 'valse-de-givrelune';

export type ZoneId =
  | 'gate'
  | 'plaza'
  | 'bar'
  | 'food'
  | 'workshop'
  | 'rink'
  | 'belvedere'
  | 'fair'
  | 'carousel';

export interface ZoneConfig {
  enabled?: boolean;
  name?: string;
  subtitle?: string;
}

// ───────────────────────────── Characters ─────────────────────────────

export type HairStyle = 'short' | 'long' | 'bun' | 'braids' | 'curly' | 'ponytail' | 'bald' | 'bob';
export type HatStyle = 'none' | 'beanie' | 'bobble' | 'beret' | 'tophat' | 'chef' | 'earmuffs' | 'hood' | 'cap';
export type OutfitStyle = 'coat' | 'sweater' | 'apron' | 'cape' | 'vest';
export type Accessory = 'none' | 'glasses' | 'round-glasses' | 'apron' | 'mittens' | 'bag' | 'pipe' | 'flower';

export interface CharacterAppearance {
  skin?: string;
  hair?: string;
  hairStyle?: HairStyle;
  outfit?: OutfitStyle;
  outfitColor?: string;
  /** Secondary colour (trousers, skirt, pattern). */
  outfitColor2?: string;
  scarf?: string | null;
  hat?: HatStyle;
  hatColor?: string;
  accessory?: Accessory;
  beard?: string | null;
  /** 0.85..1.15 */
  height?: number;
  /** 0.85..1.2 — chubbiness of the body. */
  build?: number;
}

export type CastRole =
  | 'guide'
  | 'barista'
  | 'cook'
  | 'chestnut-seller'
  | 'glassblower'
  | 'carousel-keeper'
  | 'fair-keeper'
  | 'musician'
  | 'stargazer'
  | 'skater'
  | 'child'
  | 'villager';

export interface CastMember {
  id: string;
  name: string;
  role: CastRole;
  /** Where they stand. Defaults are derived from the role. */
  zone?: ZoneId;
  appearance?: CharacterAppearance;
  /** 0.6 (deep) .. 1.6 (high) */
  voicePitch?: number;
  /** Free lines they say when you talk to them (story NPCs have their own scripts too). */
  lines?: string[];
}

// ───────────────────────────── Stalls ─────────────────────────────

export type StallCategory =
  | 'artisanat'
  | 'gourmand'
  | 'deco'
  | 'textile'
  | 'bijoux'
  | 'jouets'
  | 'beaute'
  | 'papeterie'
  | 'ceramique'
  | 'autre';

export interface StallConfig {
  /** Slug, also the file name. */
  id: string;
  /** Position in the market alley (lower = closer to the entrance). */
  order?: number;
  /** Shop name, painted on the chalet sign. */
  name: string;
  tagline?: string;
  category?: StallCategory;
  /** Main website: the "Visiter le site" button. */
  website?: string;
  links?: StallLink[];
  owner: StallOwner;
  chalet?: ChaletStyle;
  /** Ordered: the order is the display order on the stall. */
  decorations?: DecorationItem[];
  /** Ordered: the order is the display order on the shelves (max ~8 shown in 3D). */
  products?: ProductConfig[];
  knowledge?: StallKnowledge;
}

export interface StallLink {
  label: string;
  url: string;
  kind?: 'site' | 'instagram' | 'facebook' | 'etsy' | 'tiktok' | 'youtube' | 'mail' | 'phone' | 'other';
}

export interface StallOwner {
  name: string;
  /** e.g. "Céramiste", "Apicultrice" */
  role?: string;
  /** Short bio shown on the character card. */
  bio?: string;
  photo?: string;
  appearance?: CharacterAppearance;
  voicePitch?: number;
  /** What they say when you come close. Random pick. */
  greetings?: string[];
  /** What they say when you leave. */
  farewells?: string[];
  /** Personality: changes the little phrases around answers. */
  mood?: 'chaleureux' | 'timide' | 'enjoue' | 'sage' | 'farceur';
}

export interface ChaletStyle {
  wood?: string;
  roof?: string;
  accent?: string;
  /** Text on the sign (defaults to the stall name). */
  sign?: string;
  signColor?: string;
  signTextColor?: string;
  garland?: 'warm' | 'multicolor' | 'blue' | 'none';
  awning?: 'stripes' | 'plain' | 'none';
  awningColors?: [string, string];
  /** Snow on the roof. */
  snow?: boolean;
}

export type DecorationType =
  | 'wreath'
  | 'garland'
  | 'lantern'
  | 'mini-tree'
  | 'candles'
  | 'gift-pile'
  | 'snowman'
  | 'star-sign'
  | 'pinecones'
  | 'ribbon'
  | 'teddy'
  | 'nutcracker'
  | 'holly'
  | 'mistletoe'
  | 'reindeer'
  | 'bell'
  | 'sled'
  | 'crate-apples'
  | 'pot-plant'
  | 'chalkboard'
  | 'bunting';

export type DecoSlot =
  | 'roof-ridge'
  | 'roof-left'
  | 'roof-right'
  | 'sign'
  | 'front-left'
  | 'front-right'
  | 'counter-left'
  | 'counter-right'
  | 'side-left'
  | 'side-right'
  | 'ground-left'
  | 'ground-right'
  | 'back-wall';

export interface DecorationItem {
  type: DecorationType;
  /** Where to put it. If omitted, decorations fill free slots in array order. */
  slot?: DecoSlot;
  color?: string;
  /** Small text, used by 'chalkboard' and 'star-sign'. */
  text?: string;
}

export interface ProductConfig {
  id?: string;
  /** Link to the product page. If name/image/price are missing, `npm run scan` fills them in. */
  url?: string;
  name?: string;
  /** 12.5 or "12,50 €" */
  price?: number | string;
  currency?: string;
  image?: string;
  description?: string;
  /** Put it on the front of the counter. */
  featured?: boolean;
}

export interface StallKnowledge {
  /** Long free text about the artisan, their craft, their story. The more, the better the answers. */
  description?: string;
  faq?: { q: string; a: string }[];
  /** Short facts by topic — used for precise answers ("livraison", "horaires", "matières"…). */
  facts?: { topic: string; text: string }[];
  scan?: {
    enabled?: boolean;
    /** Pages to scan (defaults to the website). */
    urls?: string[];
    maxPages?: number;
    /** If the stall lists no products, take the N first products found on the site. */
    autoProducts?: number;
  };
}

// ───────────────────────────── Generated by the scanner ─────────────────────────────

export interface ScannedStallData {
  stallId: string;
  scannedAt: string;
  source: string;
  site: {
    title?: string;
    description?: string;
    image?: string;
    siteName?: string;
    email?: string;
    phone?: string;
    address?: string;
    social?: StallLink[];
  };
  products: ScannedProduct[];
  chunks: KnowledgeChunk[];
  /** Non-fatal problems met while scanning (robots.txt, timeouts…). */
  warnings?: string[];
}

export interface ScannedProduct {
  url: string;
  name: string;
  price?: number;
  currency?: string;
  image?: string;
  description?: string;
  availability?: 'in_stock' | 'out_of_stock' | 'unknown';
}

export interface KnowledgeChunk {
  id: string;
  text: string;
  /** Page title or heading the chunk comes from. */
  title?: string;
  /** URL the chunk comes from. */
  source?: string;
  /** Optional topic hint (livraison, contact, about…). */
  topic?: string;
}

// ───────────────────────────── Resolved (runtime) ─────────────────────────────

export interface ResolvedProduct {
  id: string;
  name: string;
  url?: string;
  price?: number;
  currency: string;
  /** Formatted, e.g. "12,50 €" */
  priceLabel?: string;
  image?: string;
  description?: string;
  featured: boolean;
}

export interface ResolvedStall extends Omit<StallConfig, 'products' | 'chalet' | 'decorations' | 'owner'> {
  order: number;
  owner: Required<Pick<StallOwner, 'name' | 'greetings' | 'farewells' | 'mood'>> &
    StallOwner & { appearance: Required<CharacterAppearance>; voicePitch: number };
  chalet: Required<Omit<ChaletStyle, 'awningColors'>> & { awningColors: [string, string] };
  decorations: DecorationItem[];
  products: ResolvedProduct[];
  /** Everything the dialogue engine can search in. */
  chunks: KnowledgeChunk[];
  scanned?: ScannedStallData;
}

export interface ResolvedMarket {
  meta: Required<Pick<MarketMeta, 'title' | 'town' | 'locale'>> & MarketMeta;
  theme: Required<ThemeConfig>;
  story: Required<StoryConfig>;
  music: Required<MusicConfig>;
  cast: (CastMember & { appearance: Required<CharacterAppearance>; voicePitch: number; zone: ZoneId })[];
  zones: Record<ZoneId, Required<ZoneConfig>>;
  stalls: ResolvedStall[];
}
