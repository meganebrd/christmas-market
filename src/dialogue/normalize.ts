/**
 * French-first text normalisation for the no-AI question answering engine.
 * Pure functions, no DOM, no dependencies: runs in the browser, in Node and in the tests.
 *
 *   normalize("L'écharpe coûte 55 € ?")  → "echarpe coute 55 euro"
 *   tokenize("Tu livres les bougies ?")   → ["livr", "bougi"]   (stopwords removed, stemmed)
 */
import { STOPWORDS } from './stopwords';

const COMBINING = /[̀-ͯ]/g;
const ELISION = /\b(?:l|d|j|qu|n|s|t|c|m|jusqu|lorsqu|puisqu|quoiqu)'/g;

/** Lowercase, strip accents, elisions, punctuation. Keeps digits (decimals as "12.50") and maps € to "euro". */
export function normalize(input: string): string {
  if (!input) return '';
  let s = input
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(COMBINING, '')
    .replace(/[’‘ʼ`´]/g, "'");
  s = s.replace(/€/g, ' euro ').replace(/\$/g, ' dollar ').replace(/£/g, ' livre ');
  // decimals "12,50" → "12.50" (kept as one token), thousands "1 600" → "1600"
  s = s.replace(/(\d)[\s  ](?=\d{3}\b)/g, '$1');
  s = s.replace(/(\d),(\d)/g, '$1.$2');
  s = s.replace(ELISION, ' ');
  s = s.replace(/(\d)\.(?!\d)/g, '$1 ');
  s = s.replace(/[^a-z0-9.\s-]/g, ' ').replace(/(^|\s)[.-]+|[.-]+(?=\s|$)/g, ' ');
  s = s.replace(/-/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** Words whose final -s / -x is not a plural mark (kept as is by the stemmer). */
const INVARIABLE = new Set([
  'colis', 'bois', 'mois', 'pays', 'fois', 'temps', 'corps', 'souris', 'avis', 'jus', 'tapis', 'repas', 'gras', 'bas',
  'cas', 'dos', 'gros', 'ours', 'velours', 'cours', 'frais', 'anglais', 'francais', 'mais', 'jamais', 'puis', 'depuis',
  'plus', 'sous', 'tous', 'vous', 'nous', 'alors', 'chez', 'parfois', 'toujours', 'apres', 'tres', 'pres', 'ailleurs',
  'dessus', 'dessous', 'autrefois', 'paris', 'lilas', 'ananas', 'cassis', 'radis', 'buis', 'panais', 'relais', 'palais',
  'lys', 'sens', 'poids', 'pois', 'prix', 'noix', 'croix', 'voix', 'choix', 'paix', 'faux', 'doux', 'roux', 'deux',
  'six', 'dix', 'houx', 'perdrix', 'bus', 'gaz', 'riz', 'nez', 'mas', 'tres', 'verglas', 'pres', 'abies', 'kids',
  'news', 'yes', 'this', 'is', 'his', 'has', 'was', 'does', 'its', 'us', 'thanks', 'chips', 'process', 'christmas',
  'atlas', 'campus', 'virus', 'cactus', 'bonus', 'humus', 'hiatus', 'vis', 'jadis', 'tandis', 'remous', 'enclos',
  'propos', 'repos', 'clos', 'gris', 'exquis', 'precis', 'permis', 'devis', 'vernis', 'tamis', 'parvis', 'mepris',
]);

/** Masculine words ending in -e/-é don't matter here: the stemmer only needs to be consistent on both sides. */
function dedupeFinalConsonant(w: string): string {
  return /(ll|nn|tt|mm|pp)$/.test(w) ? w.slice(0, -1) : w;
}

/**
 * Conservative light French stemmer (works on already normalised, accent-free words).
 * Goal: map "livrer / livres / livrez / livré / livraison" to one stem, without conflating unrelated words.
 */
export function stem(word: string): string {
  let w = word;
  if (w.length <= 3 || /\d/.test(w) || INVARIABLE.has(w)) return w;

  // ── plurals
  if (w.endsWith('eaux') || w.endsWith('iaux')) w = w.slice(0, -1);
  else if (w.endsWith('aux') && w.length > 4) w = w.slice(0, -3) + 'al';
  else if (w.endsWith('x') && w.length > 4 && /[eo]ux$/.test(w)) w = w.slice(0, -1);
  else if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) w = w.slice(0, -1);
  if (w.length <= 3) return w;

  // ── derivational / verb endings (longest first)
  const rules: [string, string, number][] = [
    // [suffix, replacement, minimal remaining stem length]
    ['issement', '', 4],
    ['ations', '', 3],
    ['ation', '', 3],
    ['ition', 'i', 4],
    ['aison', '', 4],
    ['aient', '', 4],
    ['trice', 'teu', 3],
    ['euse', 'eu', 3],
    ['ement', 'e', 4],
    ['iment', 'i', 3],
    ['ument', 'u', 3],
    ['ait', '', 5],
    ['eur', 'eu', 2],
    ['ee', '', 3],
    ['ez', '', 3],
    ['er', '', 3],
    ['ing', '', 4],
  ];
  for (const [suf, rep, min] of rules) {
    if (w.endsWith(suf) && w.length - suf.length >= min) {
      w = w.slice(0, -suf.length) + rep;
      break;
    }
  }
  // final -e (feminine / verb) for words long enough
  if (w.endsWith('e') && w.length >= 4) w = w.slice(0, -1);
  w = dedupeFinalConsonant(w);
  if (w.endsWith('qu')) w = w.slice(0, -2) + 'c';
  if (w.endsWith('y') && w.length >= 3) w = w.slice(0, -1) + 'i';
  return w;
}

/** Raw word list of a normalised string (no stemming, stopwords kept). */
export function words(input: string): string[] {
  const n = normalize(input);
  return n ? n.split(' ') : [];
}

/** Content tokens: normalised, stopwords removed, stemmed. */
export function tokenize(input: string): string[] {
  const out: string[] = [];
  for (const w of words(input)) {
    if (STOPWORDS.has(w)) continue;
    if (w.length < 2 && !/\d/.test(w)) continue;
    out.push(stem(w));
  }
  return out;
}

/** Same as tokenize, on a string that is already normalised. */
export function tokenizeNormalized(n: string): string[] {
  const out: string[] = [];
  if (!n) return out;
  for (const w of n.split(' ')) {
    if (!w || STOPWORDS.has(w)) continue;
    if (w.length < 2 && !/\d/.test(w)) continue;
    out.push(stem(w));
  }
  return out;
}

/** Damerau-Levenshtein distance capped at `max` (returns max + 1 when above). Used for typo-tolerant product names. */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = a.length;
  const m = b.length;
  let prev2: number[] = new Array(m + 1).fill(0);
  let prev: number[] = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[m];
}

/** Splits a text into sentences without breaking prices ("12,50 €"), times ("16 h"), e-mails or abbreviations. */
export function splitSentences(text: string): string[] {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const out: string[] = [];
  const re = /[.!?…]+["»”)\]]*(?=\s|$)/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const end = m.index + m[0].length;
    if (end < clean.length) {
      // "bredele… et en goûte", "p. ex. la suite": a real sentence starts with a capital
      if (/^\s+[a-zà-ÿ]/.test(clean.slice(end))) continue;
      if (m[0] === '.') {
        const before = clean.slice(start, m.index);
        if (/(?:^|\s)(?:env|ex|cf|st|ste|mr|mme|mlle|dr|vol|art|réf|ref|approx|av|bd|n°|tél|tel)$/i.test(before)) continue;
        if (/(?:^|\s)[A-Z]$/.test(before)) continue; // initials "J. Dupont"
      }
    }
    const piece = clean.slice(start, end).trim();
    if (piece) out.push(piece);
    start = end;
  }
  const tail = clean.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}
