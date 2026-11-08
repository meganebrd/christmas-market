/**
 * "Où je trouve du vin chaud ?", "Où sont les toilettes ?" — questions about the market rather than the artisan.
 * Things sold in a fun zone of the market are referred to that zone (names come from ctx.config.zones);
 * facilities and unknown places are referred to the market map.
 */
import type { ZoneId } from '../config/types';

export interface PlaceHit {
  /** The sentence asks where something is ("où…", "c'est où", "je cherche…"). */
  question: boolean;
  /** About the artisan's own place ("où est ton atelier ?"). */
  aboutMe: boolean;
  /** That place ("atelier"). */
  mine?: string;
  /** Something found in a fun zone of the market. */
  zone?: ZoneId;
  /** "du vin chaud", "des crêpes"… (for the reply) */
  what?: string;
  /** Toilets, parking, exit… → the map. */
  facility?: string;
}

/** Normalised patterns → zone + what to call it in the reply. */
const ZONE_ITEMS: { zone: ZoneId; re: RegExp; what: string }[] = [
  { zone: 'bar', re: /(^|\s)vin chaud(\s|$)/, what: 'du vin chaud' },
  { zone: 'bar', re: /(^|\s)(chocolat chaud|chocolats chauds)(\s|$)/, what: 'un chocolat chaud' },
  { zone: 'bar', re: /(^|\s)(boissons? chaudes?|boire (un coup|quelque chose|un verre)|punch|cidre chaud|grog)(\s|$)/, what: 'une boisson chaude' },
  { zone: 'food', re: /(^|\s)crepes?(\s|$)/, what: 'des crêpes' },
  { zone: 'food', re: /(^|\s)(marrons?( chauds?)?|chataignes?)(\s|$)/, what: 'des marrons chauds' },
  { zone: 'food', re: /(^|\s)(gaufres?|churros|beignets?)(\s|$)/, what: 'des gaufres et des beignets' },
  { zone: 'food', re: /(^|\s)(manger( un morceau| quelque chose)?|faim|casse croute|sandwich|raclette|tartiflette|saucisses?|snack)(\s|$)/, what: 'de quoi manger' },
  { zone: 'workshop', re: /(^|\s)(verriers?|souffleurs? de verre|verre souffle|boules? de (verre|noel) soufflees?)(\s|$)/, what: 'le verrier' },
  { zone: 'rink', re: /(^|\s)(patinoire|patiner|patins?( a glace)?|lac gele)(\s|$)/, what: 'la patinoire' },
  { zone: 'carousel', re: /(^|\s)(manege|carrousel|chevaux de bois)(\s|$)/, what: 'le manège' },
  { zone: 'fair', re: /(^|\s)(chamboule( neige| tout)?|jeux? d adresse|stand de tir)(\s|$)/, what: 'le chamboule-neige' },
  { zone: 'belvedere', re: /(^|\s)(belvedere|telescope|longue vue|point de vue)(\s|$)/, what: 'le belvédère' },
  { zone: 'plaza', re: /(^|\s)(grand sapin|sapin geant|grand arbre)(\s|$)/, what: 'le Grand Sapin' },
];

const FACILITIES =
  /(^|\s)(toilettes?|wc|w c|sanitaires|parking|parkings|sortie|distributeurs?( de billets)?|banque|pharmacie|gare|bus|navette|taxis?|hotel|hotels|poubelles?|vestiaires?|accueil|office de tourisme|point info|infirmerie|secours|metro|tram|tramway|restaurant|restaurants)(\s|$)/;

const QUESTION =
  /(^|\s)(ou|where)\s+(est|sont|se trouve|se trouvent|trouver|je trouve|on trouve|peut on|puis je|je peux|il y a|y a|acheter|boire|manger|aller|vend|vendent|is|are|can)(\s|$)|(^|\s)(est|c est|ca se trouve|se trouve) ou(\s|$)|(^|\s)je cherche(\s|$)|(^|\s)(la|le|les) plus proches?(\s|$)/;
const ABOUT_ME = /(^|\s)(ton|ta|tes|votre|vos)\s+(atelier|boutique|magasin|chalet|ferme|rucher|ruchers|moulin|fournil|forge|lavoir|cabane|maison|ruches|stand|site)(\s|$)/;

/** `normalized`: output of normalize() (accents and elisions removed). */
export function detectPlace(normalized: string): PlaceHit {
  const me = normalized.match(ABOUT_ME);
  const hit: PlaceHit = { question: QUESTION.test(normalized), aboutMe: !!me, mine: me?.[3] };
  for (const z of ZONE_ITEMS) {
    if (z.re.test(normalized)) {
      hit.zone = z.zone;
      hit.what = z.what;
      break;
    }
  }
  const f = normalized.match(FACILITIES);
  if (f) hit.facility = f[2];
  return hit;
}

/** "Le Chaudron Doré" → "au Chaudron Doré", "Les Mailles de Suzon" → "aux Mailles de Suzon", "L'Établi" → "à L'Établi". */
export function atPlace(name: string, common: (firstWord: string) => 'm' | 'f' | 'pl' | null = () => null): string {
  const n = name.trim();
  let m = n.match(/^Le\s+(.*)$/);
  if (m) return `au ${m[1]}`;
  m = n.match(/^Les\s+(.*)$/);
  if (m) return `aux ${m[1]}`;
  if (/^(La\s|L['’])/.test(n)) return `à ${n}`;
  const g = common(n.split(/\s+/)[0] ?? '');
  if (g === 'm') return `au ${n}`;
  if (g === 'f') return /^[aeiouyàâéèêëîïôöùûüh]/i.test(n) ? `à l'${n}` : `à la ${n}`;
  if (g === 'pl') return `aux ${n}`;
  return `à ${n}`;
}
