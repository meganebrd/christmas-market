import type {
  Accessory,
  DecorationType,
  DecoSlot,
  HairStyle,
  HatStyle,
  OutfitStyle,
  StallCategory,
  StallLink,
  StallOwner,
} from '../config/types';
import { PALETTE } from '../world/palette';

/** Everything the editor shows in French: labels, curated swatches, hints. */

export interface Choice<T extends string = string> {
  value: T;
  label: string;
  icon?: string;
  hint?: string;
}

export interface Swatch {
  color: string;
  name: string;
}

export const CATEGORIES: Choice<StallCategory>[] = [
  { value: 'artisanat', label: 'Artisanat' },
  { value: 'gourmand', label: 'Gourmandises' },
  { value: 'deco', label: 'Décoration' },
  { value: 'textile', label: 'Textile & tricot' },
  { value: 'bijoux', label: 'Bijoux' },
  { value: 'jouets', label: 'Jouets' },
  { value: 'beaute', label: 'Beauté & bien-être' },
  { value: 'papeterie', label: 'Papeterie' },
  { value: 'ceramique', label: 'Céramique' },
  { value: 'autre', label: 'Autre chose' },
];

export const LINK_KINDS: Choice<NonNullable<StallLink['kind']>>[] = [
  { value: 'site', label: 'Site', icon: '🌐' },
  { value: 'instagram', label: 'Instagram', icon: '📸' },
  { value: 'facebook', label: 'Facebook', icon: '👍' },
  { value: 'etsy', label: 'Etsy', icon: '🛍️' },
  { value: 'tiktok', label: 'TikTok', icon: '🎵' },
  { value: 'youtube', label: 'YouTube', icon: '▶️' },
  { value: 'mail', label: 'E-mail', icon: '✉️' },
  { value: 'phone', label: 'Téléphone', icon: '📞' },
  { value: 'other', label: 'Autre', icon: '🔗' },
];

export const MOODS: Choice<NonNullable<StallOwner['mood']>>[] = [
  { value: 'chaleureux', label: 'Chaleureux', icon: '☀️', hint: 'accueillant, généreux en petits mots gentils' },
  { value: 'timide', label: 'Timide', icon: '🙈', hint: 'doux, un peu réservé, adorable' },
  { value: 'enjoue', label: 'Enjoué', icon: '🎉', hint: 'plein d’entrain et de points d’exclamation' },
  { value: 'sage', label: 'Sage', icon: '🦉', hint: 'posé, des phrases qui prennent leur temps' },
  { value: 'farceur', label: 'Farceur', icon: '😜', hint: 'taquin, toujours le mot pour rire' },
];

export const HAIR_STYLES: Choice<HairStyle>[] = [
  { value: 'short', label: 'Courts' },
  { value: 'long', label: 'Longs' },
  { value: 'bob', label: 'Carré' },
  { value: 'bun', label: 'Chignon' },
  { value: 'braids', label: 'Tresses' },
  { value: 'ponytail', label: 'Queue-de-cheval' },
  { value: 'curly', label: 'Bouclés' },
  { value: 'bald', label: 'Sans cheveux' },
];

export const HATS: Choice<HatStyle>[] = [
  { value: 'none', label: 'Aucun' },
  { value: 'beanie', label: 'Bonnet' },
  { value: 'bobble', label: 'Bonnet à pompon' },
  { value: 'beret', label: 'Béret' },
  { value: 'earmuffs', label: 'Cache-oreilles' },
  { value: 'hood', label: 'Capuche' },
  { value: 'cap', label: 'Casquette' },
  { value: 'tophat', label: 'Haut-de-forme' },
  { value: 'chef', label: 'Toque' },
];

export const OUTFITS: Choice<OutfitStyle>[] = [
  { value: 'coat', label: 'Manteau' },
  { value: 'sweater', label: 'Pull' },
  { value: 'vest', label: 'Gilet' },
  { value: 'apron', label: 'Tablier' },
  { value: 'cape', label: 'Cape' },
];

export const ACCESSORIES: Choice<Accessory>[] = [
  { value: 'none', label: 'Aucun' },
  { value: 'glasses', label: 'Lunettes' },
  { value: 'round-glasses', label: 'Lunettes rondes' },
  { value: 'mittens', label: 'Moufles' },
  { value: 'bag', label: 'Besace' },
  { value: 'apron', label: 'Tablier' },
  { value: 'flower', label: 'Fleur' },
  { value: 'pipe', label: 'Pipe' },
];

export const GARLANDS: Choice<'warm' | 'multicolor' | 'blue' | 'none'>[] = [
  { value: 'warm', label: 'Dorée', icon: '✨' },
  { value: 'multicolor', label: 'Multicolore', icon: '🌈' },
  { value: 'blue', label: 'Bleu givre', icon: '❄️' },
  { value: 'none', label: 'Aucune', icon: '○' },
];

export const AWNINGS: Choice<'stripes' | 'plain' | 'none'>[] = [
  { value: 'stripes', label: 'Rayé' },
  { value: 'plain', label: 'Uni' },
  { value: 'none', label: 'Sans auvent' },
];

// ───────────────────────────── swatches ─────────────────────────────

export const SKIN_SWATCHES: Swatch[] = [
  { color: '#f9e0d0', name: 'Porcelaine' },
  { color: '#f6d7c3', name: 'Pêche claire' },
  { color: '#f1cdb3', name: 'Rosée' },
  { color: '#eac0a0', name: 'Abricot' },
  { color: '#d9a07a', name: 'Caramel' },
  { color: '#b97a56', name: 'Cannelle' },
  { color: '#8d5a3d', name: 'Noisette' },
  { color: '#5e3b29', name: 'Cacao' },
];

export const HAIR_SWATCHES: Swatch[] = [
  { color: '#2b1d16', name: 'Brun très foncé' },
  { color: '#5a3825', name: 'Châtain' },
  { color: '#8a5a35', name: 'Noisette' },
  { color: '#c48a4a', name: 'Miel' },
  { color: '#e2c08a', name: 'Blond' },
  { color: '#b0472f', name: 'Roux' },
  { color: '#d9d4cc', name: 'Argenté' },
  { color: '#3a3a44', name: 'Noir bleuté' },
  { color: '#c76b9e', name: 'Rose fée' },
  { color: '#5b7fc7', name: 'Bleu nuit' },
];

export const CLOTH_SWATCHES: Swatch[] = [
  { color: '#b8413a', name: 'Rouge baie' },
  { color: '#d06a5a', name: 'Corail' },
  { color: '#c98a2e', name: 'Miel' },
  { color: '#e2b34a', name: 'Or' },
  { color: '#2f5d50', name: 'Sapin' },
  { color: '#4f8a5b', name: 'Mousse' },
  { color: '#4b7d8f', name: 'Bleu lac' },
  { color: '#3c5a8a', name: 'Bleu nuit' },
  { color: '#8a5a9c', name: 'Prune' },
  { color: '#6b4f3a', name: 'Écorce' },
  { color: '#3b3340', name: 'Anthracite' },
  { color: '#f3ead8', name: 'Crème' },
];

export const SCARF_SWATCHES: Swatch[] = [
  { color: '#e8c547', name: 'Moutarde' },
  { color: '#d94f45', name: 'Rouge' },
  { color: '#f2efe6', name: 'Neige' },
  { color: '#4f8a5b', name: 'Mousse' },
  { color: '#5b7fc7', name: 'Bleu' },
  { color: '#c76b9e', name: 'Rose' },
  { color: '#2f5d50', name: 'Sapin' },
  { color: '#b8413a', name: 'Baie' },
];

export const WOOD_SWATCHES: Swatch[] = [
  { color: PALETTE.woodLight, name: 'Bois blond' },
  { color: '#a87b52', name: 'Chêne clair' },
  { color: '#9b6a45', name: 'Miel' },
  { color: PALETTE.wood, name: 'Noyer' },
  { color: '#7a4e33', name: 'Châtaignier' },
  { color: PALETTE.woodDark, name: 'Bois brûlé' },
  { color: '#e3d6bd', name: 'Blanchi à la chaux' },
  { color: '#5b6b7d', name: 'Bleu ardoise' },
  { color: '#5f7458', name: 'Vert sauge' },
  { color: '#7d3a33', name: 'Rouge suédois' },
];

export const ROOF_SWATCHES: Swatch[] = [
  { color: PALETTE.roof, name: 'Tuiles brunes' },
  { color: '#6b3b33', name: 'Lie-de-vin' },
  { color: PALETTE.roofSlate, name: 'Ardoise' },
  { color: '#4a5a3f', name: 'Mousse' },
  { color: PALETTE.ink, name: 'Charbon' },
  { color: PALETTE.redDark, name: 'Rouge profond' },
  { color: PALETTE.blue, name: 'Bleu nuit' },
  { color: '#2f5d50', name: 'Sapin' },
];

export const ACCENT_SWATCHES: Swatch[] = [
  { color: PALETTE.red, name: 'Rouge baie' },
  { color: PALETTE.green, name: 'Vert sapin' },
  { color: '#c98a2e', name: 'Miel' },
  { color: PALETTE.gold, name: 'Or' },
  { color: PALETTE.blue, name: 'Bleu nuit' },
  { color: PALETTE.plum, name: 'Prune' },
  { color: '#d06a5a', name: 'Corail' },
  { color: PALETTE.cream, name: 'Crème' },
];

export const SIGN_SWATCHES: Swatch[] = [
  { color: '#f3e6c8', name: 'Parchemin' },
  { color: '#fff8ea', name: 'Crème' },
  { color: PALETTE.ink, name: 'Ardoise' },
  { color: '#8b2c2a', name: 'Rouge profond' },
  { color: '#2f5d50', name: 'Vert sapin' },
  { color: '#3c5a8a', name: 'Bleu nuit' },
  { color: '#e2b34a', name: 'Or' },
  { color: '#9b6a45', name: 'Bois' },
];

export const SIGN_TEXT_SWATCHES: Swatch[] = [
  { color: '#4a2c1a', name: 'Encre brune' },
  { color: PALETTE.ink, name: 'Noir chaud' },
  { color: '#f3d27a', name: 'Or' },
  { color: '#fff8ea', name: 'Crème' },
  { color: '#b8413a', name: 'Rouge baie' },
  { color: '#2f5d50', name: 'Vert sapin' },
  { color: '#3c5a8a', name: 'Bleu nuit' },
];

export const DECO_SWATCHES: Swatch[] = [
  { color: '#c0392b', name: 'Rouge' },
  { color: '#b8413a', name: 'Baie' },
  { color: '#e2b34a', name: 'Or' },
  { color: '#f3ead8', name: 'Crème' },
  { color: '#2f5d50', name: 'Sapin' },
  { color: '#3c5a8a', name: 'Bleu' },
  { color: '#6c4a7d', name: 'Prune' },
  { color: '#c46a3a', name: 'Terre cuite' },
  { color: '#a8744a', name: 'Caramel' },
  { color: '#ffcf6a', name: 'Lumière' },
];

// ───────────────────────────── decorations ─────────────────────────────

export interface DecoInfo {
  label: string;
  hint: string;
  /** Has a text field (chalkboard, star sign). */
  text?: boolean;
  /** What the colour changes. */
  colorOf: string;
}

export const DECOS: Record<DecorationType, DecoInfo> = {
  wreath: { label: 'Couronne', hint: 'de sapin, avec un gros nœud', colorOf: 'le nœud' },
  garland: { label: 'Guirlande de sapin', hint: 'branches et petits nœuds', colorOf: 'les nœuds' },
  lantern: { label: 'Lanterne', hint: 'une vraie flamme qui vacille', colorOf: 'le métal' },
  'mini-tree': { label: 'Petit sapin', hint: 'avec boules et étoile', colorOf: 'les boules' },
  candles: { label: 'Bougies', hint: 'trois bougies allumées', colorOf: 'la cire' },
  'gift-pile': { label: 'Pile de cadeaux', hint: 'paquets et rubans', colorOf: 'le grand paquet' },
  snowman: { label: 'Bonhomme de neige', hint: 'carotte et écharpe', colorOf: 'l’écharpe' },
  'star-sign': { label: 'Étoile lumineuse', hint: 'une étoile qui brille (texte possible)', text: true, colorOf: 'la lumière' },
  pinecones: { label: 'Pommes de pin', hint: 'un petit panier de pommes de pin', colorOf: 'le ruban' },
  ribbon: { label: 'Gros ruban', hint: 'un nœud de fête', colorOf: 'le ruban' },
  teddy: { label: 'Ourson', hint: 'un ourson en peluche', colorOf: 'la fourrure' },
  nutcracker: { label: 'Casse-noisette', hint: 'le soldat de bois', colorOf: 'la veste' },
  holly: { label: 'Houx', hint: 'feuilles et baies rouges', colorOf: 'les baies' },
  mistletoe: { label: 'Gui', hint: 'à suspendre, pour les bisous', colorOf: 'le ruban' },
  reindeer: { label: 'Renne', hint: 'au nez qui brille', colorOf: 'le pelage' },
  bell: { label: 'Cloche', hint: 'clochette dorée', colorOf: 'le métal' },
  sled: { label: 'Luge', hint: 'une luge en bois', colorOf: 'les patins' },
  'crate-apples': { label: 'Cagette de pommes', hint: 'pommes bien rouges', colorOf: 'les pommes' },
  'pot-plant': { label: 'Plante en pot', hint: 'un peu de verdure', colorOf: 'le pot' },
  chalkboard: { label: 'Ardoise', hint: 'un mot écrit à la craie', text: true, colorOf: 'le cadre' },
  bunting: { label: 'Fanions', hint: 'une guirlande de petits drapeaux', colorOf: 'le premier fanion' },
};

export const DECO_ORDER: DecorationType[] = [
  'wreath', 'garland', 'lantern', 'mini-tree', 'candles', 'star-sign', 'bunting',
  'gift-pile', 'snowman', 'holly', 'mistletoe', 'ribbon', 'bell', 'pinecones',
  'teddy', 'nutcracker', 'reindeer', 'sled', 'crate-apples', 'pot-plant', 'chalkboard',
];

export const SLOTS: Choice<DecoSlot>[] = [
  { value: 'roof-ridge', label: 'Faîte du toit' },
  { value: 'roof-left', label: 'Toit, à gauche' },
  { value: 'roof-right', label: 'Toit, à droite' },
  { value: 'sign', label: 'Au-dessus de l’enseigne' },
  { value: 'front-left', label: 'Poteau gauche' },
  { value: 'front-right', label: 'Poteau droit' },
  { value: 'counter-left', label: 'Comptoir, à gauche' },
  { value: 'counter-right', label: 'Comptoir, à droite' },
  { value: 'side-left', label: 'Côté gauche' },
  { value: 'side-right', label: 'Côté droit' },
  { value: 'ground-left', label: 'Au sol, à gauche' },
  { value: 'ground-right', label: 'Au sol, à droite' },
  { value: 'back-wall', label: 'Mur du fond' },
];

export const SLOT_LABEL: Record<DecoSlot, string> = Object.fromEntries(SLOTS.map((s) => [s.value, s.label])) as Record<DecoSlot, string>;

/** Positions of the slots on the little front-view schematic (SVG units, 0..200 × 0..150). */
export const SLOT_POS: Record<DecoSlot, [number, number]> = {
  'roof-ridge': [100, 14],
  'roof-left': [62, 38],
  'roof-right': [138, 38],
  sign: [100, 47],
  'front-left': [37, 78],
  'front-right': [163, 78],
  'counter-left': [62, 92],
  'counter-right': [138, 92],
  'side-left': [14, 104],
  'side-right': [186, 104],
  'ground-left': [34, 134],
  'ground-right': [166, 134],
  'back-wall': [100, 76],
};

export const FACT_TOPICS = [
  'livraison', 'prix', 'horaires', 'matières', 'fabrication', 'contact', 'allergènes', 'entretien',
  'paiement', 'personnalisation', 'tailles', 'histoire', 'retrait', 'commande',
];

export const MAX_DECORATIONS = 13;
export const MAX_PRODUCTS = 8;
export const GOOD_DESCRIPTION = 300;
