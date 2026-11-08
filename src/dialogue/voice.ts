/**
 * Small French language helpers for the artisan's voice:
 *  - third person → first person ("Élias veille sur ses ruches" → "Je veille sur mes ruches"), conservative:
 *    returns null when the sentence cannot be converted safely;
 *  - articles in front of product names ("Miel de sapin" → "le miel de sapin").
 */
import { normalize } from './normalize';

const VOWEL = /^[aeiouyàâäéèêëîïôöùûüœæh]/i;
/** h aspiré: no elision ("la housse", "le hamac"). */
const H_ASPIRE = new Set(['hamac', 'harpe', 'hache', 'hotte', 'housse', 'hibou', 'haricot', 'hochet', 'hublot', 'hutte', 'hareng', 'houx', 'harnais', 'hall', 'hamster', 'hockey']);

/** Irregular 3rd person → 1st person (present tense). Regular -er verbs ending in -e are unchanged. */
const IRREGULAR: Record<string, string> = {
  est: 'suis', a: 'ai', fait: 'fais', vit: 'vis', peint: 'peins', vend: 'vends', prend: 'prends', dit: 'dis', met: 'mets',
  sait: 'sais', peut: 'peux', veut: 'veux', va: 'vais', part: 'pars', sort: 'sors', écrit: 'écris', connaît: 'connais',
  connait: 'connais', produit: 'produis', construit: 'construis', coud: 'couds', tient: 'tiens', vient: 'viens', choisit: 'choisis',
  finit: 'finis', réunit: 'réunis', sert: 'sers', dort: 'dors', boit: 'bois', voit: 'vois', reçoit: 'reçois', apprend: 'apprends',
  transmet: 'transmets', cuit: 'cuis', élève: 'élève', grandit: 'grandis', réussit: 'réussis', bâtit: 'bâtis', recueille: 'recueille', cueille: 'cueille', ouvre: 'ouvre', offre: 'offre', accueille: 'accueille',
  perpétue: 'perpétue', tisse: 'tisse', était: 'étais', avait: 'avais', faisait: 'faisais', aimait: 'aimais', travaillait: 'travaillais',
};

const PREPOSITIONS = new Set(['avec', 'pour', 'chez', 'sans', 'de', 'à', 'par', 'sur', 'comme', 'contre', 'vers', 'entre']);

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function conjugate(verb: string): string | null {
  const lower = verb.toLowerCase();
  if (IRREGULAR[lower]) return IRREGULAR[lower];
  if (/^[a-zà-ÿœ]+e$/i.test(verb) && lower !== 'est' && verb.length >= 3) return verb; // regular -er verb (coule, veille, parle)
  return null;
}

function subject(verb1st: string, capital: boolean): string {
  const je = VOWEL.test(verb1st) && !H_ASPIRE.has(verb1st.toLowerCase()) ? "j'" : 'je ';
  return capital ? je.charAt(0).toUpperCase() + je.slice(1) : je;
}

/**
 * Converts a sentence about the owner (third person) into the owner's own voice.
 * Returns the sentence unchanged if it doesn't talk about the owner, or null if unsure.
 */
export function toFirstPerson(sentence: string, ownerName: string): string | null {
  const first = firstName(ownerName);
  let s = sentence.trim();
  let changed = false;
  const names = [ownerName, first].filter((n, i, a) => n && a.indexOf(n) === i).sort((a, b) => b.length - a.length);

  // "Tout le monde l'appelle Suzon." → "Tout le monde m'appelle Suzon."
  s = s.replace(/\b[lL]['’](appellen?t?|surnommen?t?)\b/g, (_m, v) => {
    changed = true;
    return `m'${v}`;
  });

  // incises: "…, dit-elle." → "…."
  s = s.replace(/,\s*(dit|ajoute|raconte|assure|confie|avoue|précise|plaisante|sourit)-(elle|il)\b/g, () => {
    changed = true;
    return '';
  });

  // Name as subject, at the start or after a comma: "Margot coule…" → "Je coule…", "…, Gaspard fabrique" → "…, je fabrique"
  for (const n of names) {
    const re = new RegExp(`(^|[,;:]\\s+)${escapeRe(n)}\\s+(ne\\s+|n['’])?([\\wÀ-ÿœ'’-]+)`, 'u');
    const m = s.match(re);
    if (m) {
      const verb = conjugate(m[3]);
      if (!verb) return null;
      const atStart = m[1] === '';
      const neg = m[2] ? (/['’]/.test(m[2]) ? "n'" : 'ne ') : '';
      const subj = neg ? (atStart ? 'Je ' : 'je ') : subject(verb, atStart);
      s = s.slice(0, m.index! + m[1].length) + subj + neg + verb + s.slice(m.index! + m[0].length);
      changed = true;
      break;
    }
  }

  // Subject pronouns: il / elle (+ "qu'il", "qu'elle")
  const tokens = s.split(/(\s+)/);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const m = tok.match(/^(qu['’])?(Il|il|Elle|elle)([,.;:!?…]*)$/);
    if (!m) {
      out.push(tok);
      continue;
    }
    // previous word
    let p = out.length - 1;
    while (p >= 0 && /^\s*$/.test(out[p])) p--;
    const prev = p >= 0 ? out[p].toLowerCase().replace(/[^a-zà-ÿ']/g, '') : '';
    if (m[3] || (!m[1] && PREPOSITIONS.has(prev))) return null; // "avec elle", "elle," → object/ambiguous
    // next non-space words
    let j = i + 1;
    while (j < tokens.length && /^\s*$/.test(tokens[j])) j++;
    let next = tokens[j] ?? '';
    let neg = '';
    let refl = '';
    if (/^(ne|n['’])/i.test(next) && /^(ne)$/i.test(next)) {
      neg = 'ne ';
      j += 1;
      while (j < tokens.length && /^\s*$/.test(tokens[j])) j++;
      next = tokens[j] ?? '';
    } else if (/^n['’]/i.test(next)) {
      neg = "n'";
      next = next.slice(2);
    }
    if (/^(se)$/i.test(next)) {
      refl = 'me ';
      j += 1;
      while (j < tokens.length && /^\s*$/.test(tokens[j])) j++;
      next = tokens[j] ?? '';
    } else if (/^s['’]/i.test(next)) {
      refl = "m'";
      next = next.slice(2);
    }
    const word = next.replace(/[,.;:!?…]+$/, '');
    const punct = next.slice(word.length);
    if (/^(y|fait|faut|pleut|neige)$/i.test(word) && !neg && !refl) return null; // impersonal "il y a", "il fait froid"
    const verb = conjugate(word);
    if (!verb) return null;
    const capital = m[2][0] === m[2][0].toUpperCase() && !m[1];
    const que = m[1] ? 'que ' : '';
    let subj: string;
    if (neg || refl) subj = capital ? 'Je ' : 'je ';
    else subj = subject(verb, capital);
    let negOut = neg;
    if (neg === "n'" || (neg && refl)) negOut = neg === "n'" ? "n'" : 'ne ';
    if (neg === 'ne ' && !refl && VOWEL.test(verb)) negOut = "n'";
    let reflOut = refl;
    if (refl === 'me ' && VOWEL.test(verb)) reflOut = "m'";
    out.push(que + subj + negOut + reflOut + verb + punct);
    i = j;
    changed = true;
  }
  s = out.join('');

  // possessives
  s = s.replace(/\b(S|s)es\b/g, (_m, c) => (c === 'S' ? 'Mes' : 'mes'))
    .replace(/\b(S|s)on\b/g, (_m, c) => (c === 'S' ? 'Mon' : 'mon'))
    .replace(/\b(S|s)a\b/g, (_m, c) => (c === 'S' ? 'Ma' : 'ma'))
    .replace(/\b(lui|elle)-même\b/g, 'moi-même');
  if (/\b(ses|son|sa)\b/i.test(sentence)) changed = true;

  // still names the owner somewhere else → too risky
  const rest = normalize(s);
  if (names.some((n) => new RegExp(`(^|\\s)${escapeRe(normalize(n))}(\\s|$)`).test(rest)) && !/appell|surnomm/.test(rest)) {
    return null;
  }
  // "je" at the start of a sentence after elision fix-ups: "Je aime" → "J'aime"
  s = s.replace(/\b([Jj])e (?=[aeiouyàâäéèêëîïôöùûüh])(?!h(?:amac|arpe|ache|otte|ousse))/g, "$1'");
  return changed ? s : sentence.trim();
}

/** True when the sentence is clearly about the owner in the third person. */
export function isThirdPerson(sentence: string, ownerName: string): boolean {
  const n = normalize(sentence);
  const first = normalize(firstName(ownerName));
  return new RegExp(`(^|\\s)${escapeRe(first)}(\\s|$)`).test(n) || /^(il|elle) /.test(n);
}

// ───────────────────────────── articles ─────────────────────────────

const MASC_E = new Set([
  'verre', 'livre', 'cierge', 'fromage', 'beurre', 'baume', 'vase', 'globe', 'coffre', 'ange', 'magazine', 'musee', 'lycee', 'peigne',
  'masque', 'parapluie', 'carnet', 'cadre', 'sucre', 'vinaigre', 'gingembre', 'savon', 'pinceau', 'photophore', 'tablier', 'chapeau',
  'pull', 'gilet', 'calendrier', 'cahier', 'carre', 'cube', 'disque', 'domaine', 'groupe', 'kimono', 'lange', 'linge', 'miroir', 'nombre',
  'ornement', 'panier', 'pate', 'peuple', 'pole', 'rhume', 'sabre', 'sirop', 'squelette', 'stylo', 'theatre', 'trophee', 'tube', 'voile',
  'sapin', 'diffuseur', 'bracelet', 'collier', 'pendentif', 'mobile', 'service', 'manche', 'centre', 'arbre', 'marbre', 'cuivre', 'jambage',
  'parfum', 'pot', 'thé', 'the', 'café', 'cafe', 'pâté', 'kit', 'set', 'duo', 'trio', 'lot', 'coffret', 'pack', 'assortiment', 'bouquet',
  'chocolat', 'nougat', 'miel', 'pain', 'sirop', 'hydromel', 'vin', 'jus', 'bonnet', 'cache-cou', 'snood', 'plaid', 'coussin',
  // masculine nouns ending in -e (the default rule would say feminine)
  'puzzle', 'mannele', 'manala', 'mannala', 'bredele', 'renne', 'bonhomme', 'cidre', 'champagne', 'panettone', 'crumble', 'cake', 'poeme',
  'cygne', 'cone', 'timbre', 'portefeuille', 'dentifrice', 'monstre', 'chale', 'jouet', 'beignet', 'pique-nique', 'mobile', 'missel',
  'globe', 'microscope', 'telescope', 'kaleidoscope', 'grimoire', 'herbier', 'cahier', 'calice', 'cierge', 'cintre', 'gobelet', 'pichet',
  'saladier', 'beurrier', 'sucrier', 'coquetier', 'bougeoir', 'encensoir', 'diademe', 'peigne', 'rouge', 'liquide', 'sorbet', 'marbre',
  'domino', 'mikado', 'yoyo', 'kazoo', 'xylophone', 'triangle', 'jeu', 'livre', 'disque', 'vinyle', 'cadre', 'poster', 'calepin', 'agenda',
  'carre', 'losange', 'cercle', 'rectangle', 'tote', 'sac', 'cabas', 'panier', 'gilet', 'pull', 'poncho', 'kilt', 'manteau', 'bonnet',
  'reveil', 'savon', 'shampooing', 'shampoing', 'gommage', 'masque', 'beurre', 'lait', 'hydrolat', 'parfum', 'baume',
]);
/** Verb + noun compounds are masculine: le casse-noisette, le porte-clés, le marque-page, le cache-cou… */
const VERB_COMPOUND = /^(casse|porte|tire|coupe|presse|cache|garde|ouvre|chauffe|couvre|protege|range|essuie|pare|lave|attrape|serre|passe|gratte|pique|marque|faire|brise|abat|reveille|souffle|tourne|presse|chasse|fixe|serre|monte|perce|taille|vide|pese|grille|sous)-/;
const FEM_NOT_E = new Set(['fleur', 'couleur', 'senteur', 'odeur', 'douceur', 'lueur', 'chaleur', 'saveur', 'liqueur', 'vapeur', 'main', 'fin', 'nuit', 'foret', 'forêt', 'mer', 'paix', 'voix', 'croix', 'noix', 'perdrix', 'souris', 'brebis', 'part', 'mort', 'dent', 'jument', 'clef', 'clé', 'cle', 'eau', 'peau', 'maison', 'boisson', 'chanson', 'cuisson', 'toison']);

/** "Miel de sapin" → { article: 'le ', noun: 'miel de sapin', plural: false } */
export function articleFor(name: string): { ref: string; plural: boolean; feminine: boolean } {
  const clean = name.trim().replace(/\s+/g, ' ');
  const firstWord = clean.split(/[\s«"“(]/)[0] ?? '';
  const head = normalize(firstWord).split(' ')[0] ?? '';
  // already starts with a determiner ("Mon produit", "Les bougies", "Un coffret") → keep it as is
  if (/^(le|la|les|l|un|une|des|du|mon|ma|mes|ton|ta|tes|son|sa|ses|notre|nos|votre|vos|leur|leurs|ce|cet|cette|ces)$/.test(head) || /^(l|d)['’]/i.test(firstWord)) {
    const lower = clean.charAt(0).toLowerCase() + clean.slice(1);
    const pl = /^(les|des|mes|tes|ses|nos|vos|leurs|ces)$/.test(head);
    return { ref: lower, plural: pl, feminine: /^(la|une|ma|ta|sa|cette)$/.test(head) };
  }
  // brands, numbers, ALL CAPS → no article, quoted
  if (!head || /^\d/.test(head) || (clean.length > 3 && clean === clean.toUpperCase() && /[A-Z]/.test(clean))) {
    return { ref: `« ${clean} »`, plural: false, feminine: false };
  }
  const plural = /[sx]$/.test(head) && !/(ss|is|us|ix|aix|oix|ois)$/.test(head) && !MASC_E.has(head) && head.length > 3;
  const sing = plural ? head.replace(/[sx]$/, '') : head;
  const word = firstWord.toLowerCase();
  const compound = normalize(word).replace(/ /g, '-');
  const accented = word.replace(/[sx]$/, '');
  let feminine: boolean;
  if (MASC_E.has(sing) || MASC_E.has(word) || MASC_E.has(compound) || VERB_COMPOUND.test(compound)) feminine = false;
  // "Sablé", "Praliné", "Fumé" are masculine; "-té" / "-ée" are feminine ("beauté", "veillée")
  else if (/é$/.test(accented)) feminine = /(té|ée)$/.test(accented);
  else if (FEM_NOT_E.has(sing)) feminine = true;
  else if (/(age|isme|ome|ege|aire|oire|ste)$/.test(sing) && !/(image|plage|page|cage|rage|nage)$/.test(sing)) feminine = false;
  else if (/(tion|sion)$/.test(sing)) feminine = true;
  else feminine = /e$/.test(sing);
  const lowerName = clean.charAt(0).toLowerCase() + clean.slice(1);
  let article: string;
  if (plural) article = 'les ';
  else if (VOWEL.test(firstWord) && !H_ASPIRE.has(sing)) article = "l'";
  else article = feminine ? 'la ' : 'le ';
  return { ref: article + lowerName, plural, feminine };
}

/** Short reference for suggestion chips: "Bonnet à pompon « Flocon »" → "le bonnet". Keeps «quoted» names. */
export function shortRef(name: string): string {
  const quoted = name.match(/«\s*([^»]+?)\s*»|"([^"]+)"|“([^”]+)”/);
  const base = name.split(/\s(?:à|au|aux|avec|pour|en|«|-|–|—|\(|,)\s?/)[0].replace(/[«"“].*$/, '').trim();
  const words = base.split(/\s+/).slice(0, 3);
  // don't end on a dangling preposition
  while (words.length > 1 && /^(de|du|des|d'|la|le|les|et)$/i.test(words[words.length - 1])) words.pop();
  let core = words.join(' ');
  const inQuote = quoted ? (quoted[1] ?? quoted[2] ?? quoted[3]) : '';
  const { ref } = articleFor(core || name);
  if (inQuote && words.length <= 2) return `${ref} ${inQuote}`;
  return ref;
}

/** "la bougie" → "La bougie" */
export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
