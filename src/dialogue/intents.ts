/**
 * Intent lexicon (French first, minimal English). Patterns are written in NORMALISED form
 * (see normalize.ts: lowercase, no accents, elisions removed — "c'est" → "est", "j'adore" → "adore").
 *
 * An intent gives two things to the responder:
 *  - a topic, used to boost chunks tagged with it (fact topics, FAQ questions, scanned page topics);
 *  - expansion words, so "Tu livres ?" also finds "J'envoie mes colis…".
 */
import { normalize, stem, tokenizeNormalized } from './normalize';

export type IntentId =
  | 'prix'
  | 'livraison'
  | 'horaires'
  | 'matieres'
  | 'fabrication'
  | 'personnalisation'
  | 'contact'
  | 'site'
  | 'histoire'
  | 'entretien'
  | 'allergenes'
  | 'taille'
  | 'paiement'
  | 'cadeau'
  | 'identite'
  | 'catalogue'
  | 'duree'
  | 'promo';

export type SmalltalkKind =
  | 'greeting'
  | 'thanks'
  | 'howareyou'
  | 'xmas'
  | 'bye'
  | 'compliment'
  | 'laugh'
  | 'yes'
  | 'no'
  | 'sorry'
  | 'weather'
  | 'insult'
  | 'name';

interface IntentDef {
  id: IntentId;
  /** Strong signals (regex sources on the normalised text, matched on word boundaries). Weight 2. */
  strong: string[];
  /** Weak signals. Weight 1. */
  weak?: string[];
  /** If one of these matches, the intent is cancelled. */
  not?: string[];
  /** Words added to the search query (low weight) when this intent is detected. */
  expand: string[];
  /** Chunk topics (fact `topic`, scanned page topic) that belong to this intent. */
  topics: string[];
}

const DEFS: IntentDef[] = [
  {
    id: 'prix',
    strong: [
      'prix', 'tarifs?', 'couts?', 'coute(nt)?', 'coutent', 'combien (ca |ce |cela )?(coute|coutent|vaut|valent)',
      'est combien', 'sont combien', 'combien (pour|le|la|les|l|un|une|ton|ta|tes|ce|cette)\\b', 'combien$', 'cheres?', 'chers?',
      'how much', 'prices?', 'costs?', 'pricing', 'euros?', 'budget',
    ],
    weak: ['combien', 'a partir de', 'vaut', 'valent', 'payer combien'],
    not: ['combien (de )?(temps|heures?|jours?|semaines?|mois|ans|annees?|minutes?|nuits?)', 'combien (de )?(?!(ca|ce|cela|coute|coutent|vaut|valent|fait|font|est|sont|pour|le|la|les|un|une|ton|ta|tes|cette|euros?)(\\s|$))\\w+', 'how long', 'how many', 'depuis combien'],
    expand: ['prix', 'tarif', 'euro', 'coute'],
    topics: ['prix', 'tarif', 'tarifs', 'price', 'prices', 'pricing'],
  },
  {
    id: 'livraison',
    strong: [
      'livr\\w*', 'expedi\\w*', 'envoi\\w*', 'envoy\\w*', 'colis', 'colissimo', 'frais (de )?(port|envoi|livraison|expedition)', 'port offert',
      'points? relais', 'relais colis', 'mondial relay', 'la poste', 'chronopost', 'a domicile', 'par la poste', 'ship\\w*',
      'deliver\\w*', 'postage', 'mail order',
    ],
    weak: ['a etranger', 'international\\w*', 'belgique', 'suisse', 'canada', 'europe', 'recevoir', 'send', 'sends', 'delai de reception'],
    expand: ['livraison', 'expedition', 'envoi', 'colis', 'livrer', 'envoyer'],
    topics: ['livraison', 'livraisons', 'expedition', 'envoi', 'envois', 'shipping', 'delivery', 'frais de port'],
  },
  {
    id: 'horaires',
    strong: [
      'horaires?', 'ouverte?s?', 'ouvres?', 'ouvrez', 'ouverture', 'fermes?', 'fermez', 'fermee?s?', 'fermeture', 'a quelle heure',
      'quelle heure', 'quels? jours?', '(?<!depuis )quand (es|etes|est|seras|serez|ouvre|ouvres|ouvrez|ouvert|ouverte|venir|passer)',
      '(tu es|es|vous etes|etes|tu seras|seras|vous serez|serez) (la|ici|presente?s?)( demain| ce soir| aujourd hui| samedi| dimanche| ce week end| cette semaine| le \\w+)?', 'jusqu a quand',
      'opening', 'open', 'hours',
    ],
    weak: ['(?<!depuis )quand', 'ce soir', 'demain', 'aujourd hui', 'samedi', 'dimanche', 'week end', 'visiter', 'visites?', 'when'],
    not: ['depuis quand', 'since when'],
    expand: ['horaire', 'ouvert', 'heure', 'soir', 'jour'],
    topics: ['horaires', 'horaire', 'ouverture', 'hours', 'opening hours', 'visite'],
  },
  {
    id: 'matieres',
    strong: [
      'matieres?', 'materiaux', 'materiau', 'materiel', 'composition', 'composee?s?', '(fait|faite|faits|faites|fabrique|fabriquee|fabriques|fabriquees|realise|realisee|realises) (en|avec|a partir)',
      'en quoi', 'avec quoi', 'quel(le)?s? (matiere|matieres|laine|cire|bois|tissu|fil|farine|ingredients?|parfums?|huiles?|metal|argile|terre|verre|papier|encre|coton|lin|plantes?|fleurs?|miel)',
      'quel(le)?s? \\w+ (tu |vous )?(utilises|utilisez|prends|prenez|emploies|employez|choisis|choisissez)', '(utilises|utilisez) quoi',
      'ingredients?', 'bio', 'biologiques?', 'naturel(le)?s?', 'recyclee?s?', 'ecologiques?', 'eco responsables?', 'vegetal(e|es)?', 'vegetaux',
      'made (of|from|with)', 'materials?', 'organic', 'natural', 'what is it made', 'provenance', 'ou viennent', 'ou vient',
    ],
    weak: ['locale?s?', 'locaux', 'francais(e|es)?', 'france', 'chimiques?', 'toxiques?', 'synthetiques?', 'parfums?', 'quel(le)?s? sortes?'],
    expand: ['matiere', 'composition', 'ingredient', 'naturel', 'bio', 'origine'],
    topics: ['matieres', 'matiere', 'materiaux', 'materiau', 'materials', 'composition', 'ingredients', 'ingredient'],
  },
  {
    id: 'fabrication',
    strong: [
      'fabrication', 'fabriques?', 'fabriquez', 'fabriquer', 'fait main', 'faits? (a la )?main', 'faites? (a la )?main', 'a la main',
      'comment (tu |vous )?(fais|faites|fabriques|fabriquez|travailles|travaillez|crees|creez|realises|realisez|prepares|preparez|produis|produisez)',
      '(fait|faits|faite|faites|fabrique|fabriques|fabriquee|fabriquees|realise|realises|cree|crees|prepare|prepares) comment',
      'comment (est|sont|ca est|cela est) (fait|faits|faite|faites|fabrique|fabriques|realise|cree|prepare)', 'comment ca se fait',
      'techniques?', 'savoir faire', 'processus', 'procede', 'etapes?', 'how (do|is|are) (you|it|they) (make|made)', 'how it s made',
      'handmade', 'hand made', 'artisanale?s?', 'artisanaux', 'confectionn\\w+',
    ],
    weak: ['ateliers?', 'workshop', 'methodes?', 'secrets?', 'recettes?', 'combien de temps pour (faire|fabriquer|tricoter|creer)'],
    expand: ['fabrique', 'main', 'atelier', 'technique', 'fabrication'],
    topics: ['fabrication', 'technique', 'techniques', 'savoir faire', 'process', 'methode'],
  },
  {
    id: 'personnalisation',
    strong: [
      'personnalis\\w*', 'sur mesure', 'commandes? speciales?', 'commandes? personnalisees?', 'sur commande', 'a la demande',
      'grav\\w+', 'prenoms?', 'a mon nom', 'a son nom', 'rien que pour', 'custom\\w*', 'personali[sz]\\w*', 'bespoke', 'made to order',
      'special order', 'choisir (la |les |ma |mes )?(couleur|couleurs|taille|parfum|motif)', 'couleurs? (au|a mon|de mon) choix',
    ],
    weak: ['uniques?', 'mariages?', 'entreprises?', 'en gros', 'grosses? quantites?'],
    expand: ['personnalise', 'mesure', 'commande', 'special'],
    topics: ['personnalisation', 'sur mesure', 'commande', 'commandes', 'custom'],
  },
  {
    id: 'contact',
    strong: [
      'contact\\w*', 'joindre', 'e ?mails?', 'mails?', 'courriels?', 'adresse (mail|email|e mail|postale)', 'telephones?', '(ton|votre) adresse',
      'ou (est|se trouve|se situe|sont|trouver) (ton|votre|tes|vos|l|la|le) (atelier|boutique|magasin|chalet|ferme|rucher|ruchers|moulin|fournil|forge|lavoir|cabane|maison|ruches)',
      'tel', 'numeros?', 'appeler', 'coordonnees', 'phone', 'call you', 'reach you', 'get in touch', 'ecrire', 'how (can|do) i contact',
    ],
    weak: ['adresse', 'messages?', 'ou (es tu|etes vous|se trouve|trouver) (ton |votre )?atelier', 'ou est (ton|votre) atelier', 'where are you'],
    expand: ['contact', 'ecrire', 'mail', 'telephone', 'adresse'],
    topics: ['contact', 'contacts', 'coordonnees', 'adresse', 'email', 'telephone'],
  },
  {
    id: 'site',
    strong: [
      'site', 'sites', 'site web', 'site internet', 'boutique en ligne', 'en ligne', 'internet', 'web', 'e ?shop', 'website', 'online',
      'ou (acheter|trouver|commander)', '(acheter|commander) (en ligne|sur internet|sur ton site|sur le site|a distance|plus tard)',
      'etsy', 'instagram', 'insta', 'facebook', 'reseaux( sociaux)?', 'tiktok', 'youtube', 'pinterest', 'te suivre', 'vous suivre',
    ],
    weak: ['acheter', 'commander', 'commande', 'buy', 'order', 'shop', 'boutique', 'lien', 'link'],
    expand: ['site', 'boutique', 'ligne', 'commande'],
    topics: ['site', 'boutique', 'shop', 'en ligne', 'eshop'],
  },
  {
    id: 'histoire',
    strong: [
      'histoire', 'origines?', 'depuis quand', 'depuis combien (de temps|annees)', '(ca |cela )?fait combien de temps que', 'depuis longtemps',
      'comment (tu as|vous avez|tu es|vous etes|as tu|avez vous) (commence|debute|lance|devenue?|eu idee|appris)', 'comment (tout )?a commence', 'comment as (commence|debute)',
      'pourquoi (tu |vous )?(fais|faites|as|avez|es|etes|ce metier|cette passion)', 'inspirations?', 'inspiree?s?', 'passions?', 'story',
      'since when', 'how did you (start|begin|get)', 'parcours', 'debuts?', 'commencee?', 'commencer', 'appris', 'apprendre', 'background',
      'pourquoi (ce|cette|ton|ta) (nom|metier|activite|passion|choix)',
    ],
    weak: ['pourquoi', 'why', 'longtemps', 'annees?', 'famille', 'tradition'],
    expand: ['histoire', 'commence', 'depuis', 'origine', 'annee'],
    topics: ['histoire', 'about', 'a propos', 'origine', 'story', 'apropos', 'qui sommes nous', 'notre histoire'],
  },
  {
    id: 'entretien',
    strong: [
      'entretien', 'entretenir', 'entretiens', 'lav\\w+', 'lave', 'nettoy\\w+', 'utiliser', 'utilisation', 'comment (bien )?(l |les )?utiliser',
      'mode emploi', 'conseils?', 'astuces?', 'conserver', 'conservation', 'se conserve', 'stocker', 'stockage', 'secher', 'sechage',
      'repass\\w+', 'seche linge', 'en machine', 'precautions?', 'securite', 'allum\\w+', 'care', 'wash\\w*', 'clean\\w*', 'tips?',
      'how (to|do i|should i) (use|store|wash|clean)', 'garder longtemps', 'cristallis\\w+',
    ],
    weak: ['garder', 'machine', 'abimer', 'abime', 'durer longtemps'],
    expand: ['conseil', 'utiliser', 'laver', 'entretien'],
    topics: ['entretien', 'conseils', 'conseil', 'utilisation', 'care', 'mode emploi'],
  },
  {
    id: 'allergenes',
    strong: [
      'allerg\\w+', 'gluten', 'vegan(e|es|s)?', 'vegetalien(ne)?s?', 'vegetarien(ne)?s?', 'lactose', 'fruits? a coques?', 'arachides?',
      'cacahuetes?', 'sans gluten', 'intoleran\\w+', 'nuts?', 'dairy', 'halal', 'casher', 'kasher', 'celiaques?', 'traces?',
    ],
    weak: ['lait', 'noix', 'noisettes?', 'amandes?', 'oeufs?', 'sesame', 'soja', 'sucre', 'enfants?', 'femmes? enceintes?'],
    expand: ['allergene', 'gluten', 'contient', 'lactose', 'vegan'],
    topics: ['allergenes', 'allergene', 'allergies', 'allergie', 'gluten', 'allergens'],
  },
  {
    id: 'taille',
    strong: [
      'tailles?', 'dimensions?', '(quelle|quel) (grandeur|longueur|largeur|hauteur|poids|contenance|volume|format)', 'poids', 'pese(s|nt)?',
      'peser', 'contenance', 'volume', 'longueur', 'largeur', 'hauteur', 'centimetres?', 'litres?', 'grammes?', 'kilos?', 'pointures?',
      'taille unique', 'sizes?', 'weight', 'how big', 'how heavy', 'formats?',
    ],
    weak: ['cm', 'mm', 'cl', 'ml', 'kg', 'xs', 'xl', 'xxl', 'grand pot', 'petit pot', 'enfant', 'adulte'],
    expand: ['taille', 'dimension', 'poids', 'contenance', 'format'],
    topics: ['taille', 'tailles', 'dimensions', 'dimension', 'poids', 'contenance', 'size', 'sizes', 'format', 'formats'],
  },
  {
    id: 'paiement',
    strong: [
      'paiements?', 'payer', 'payes?', 'payez', 'paie', 'carte bancaire', 'carte bleue', 'cb', 'especes', 'cash', 'cheques?',
      'paypal', 'lydia', 'sans contact', 'apple pay', 'virement', 'plusieurs fois', 'payment', 'credit card', 'pay by',
      'cartes? cadeaux?', 'bons? cadeaux?', 'cheques? cadeaux?', 'bons? d achat', 'gift cards?',
    ],
    weak: ['carte', 'cartes', 'liquide', 'monnaie', 'card', 'pay'],
    expand: ['paiement', 'carte', 'espece', 'cheque'],
    topics: ['paiement', 'paiements', 'payment', 'moyens de paiement'],
  },
  {
    id: 'cadeau',
    strong: [
      'cadeaux?', 'idees? cadeaux?', 'offrir', 'a offrir', 'pour qui',
      'pour (ma|mon|mes|un|une) (mere|maman|pere|papa|soeur|frere|copine|copain|cherie|cheri|femme|mari|amie?|ami|enfant|enfants|fille|fils|grand mere|grand pere|mamie|papy|belle mere|collegue|patron|prof|maitresse|bebe|ado|homme|famille)',
      '(tu |vous )?(me )?(conseilles|conseillez|recommandes|recommandez)', 'que (me )?(conseilles|proposes)', 'tu proposes quoi',
      'ta preferee?', 'ton prefere', 'tes preferee?s', 'prefere(e|es|s)?', 'le plus (vendu|populaire|demande|apprecie)', 'best ?sellers?',
      'populaire', 'coup de coeur', 'emballage', 'paquet cadeau', 'papier cadeau', 'gifts?', 'presents?', 'recommend\\w*', 'favou?rite',
    ],
    weak: ['noel', 'christmas', 'surprise', 'faire plaisir'],
    not: ['joyeux noel', 'bon noel', 'merry christmas', 'cartes? cadeaux?', 'bons? cadeaux?', 'cheques? cadeaux?', 'gift cards?'],
    expand: ['cadeau', 'offrir'],
    topics: ['cadeau', 'cadeaux', 'gift', 'gifts', 'idees cadeaux'],
  },
  {
    id: 'identite',
    strong: [
      'qui es tu', 'qui etes vous', 'tu es qui', 'es qui', 'vous etes qui', 'presente toi', 'presentez vous', 'parle moi de toi',
      'parlez moi de vous', '(ton|votre) (nom|prenom)', 'tu appelles', 'vous appelez', 'appelles comment', 'comment (tu )?appelles',
      '^est qui$', 'est qui toi', 'who are you', 'your name', 'about you', 'about yourself', 'toi meme',
      '(ton|votre) (metier|travail|activite|role|job)', 'tu fais quoi( dans la vie)?', 'que fais tu', 'qu fais tu', 'what do you do',
    ],
    expand: [],
    topics: ['bio'],
  },
  {
    id: 'catalogue',
    strong: [
      '(tu |vous )?(vends|vendez) quoi', 'est ce que (tu |vous )?(vends|vendez|proposes|proposez|as a vendre)', 'quoi comme (produits?|creations?|articles?)',
      '(tes|vos) (produits|creations|articles|modeles)', 'tu as quoi', 'est ce que tu as', 'que vends tu', 'que proposes tu',
      'what do you (sell|have|make)', 'your products', 'catalogue', 'gamme', 'collections?', 'montre moi', 'as tu quoi',
    ],
    expand: [],
    topics: ['product', 'produit', 'produits', 'products', 'collection'],
  },
  {
    id: 'promo',
    strong: [
      'reductions?', 'promos?', 'promotions?', 'soldes?', 'remises?', 'rabais', 'codes? promo', 'bons? (de )?reduction', 'moitie prix', 'demi tarif',
      'prix (d ami|reduit|reduits|casse|special|speciaux)', 'offres? speciales?', 'discounts?', 'deux pour un', 'carte de fidelite', 'fidelite',
      'consignee?s?', '(le|la) \\w+ (est )?offerte?', 'offerte? pour', 'geste commercial', 'ristourne',
    ],
    weak: ['offerte?s?', 'gratuite?s?', 'pas cher', 'moins cher', 'cabossee?s?', 'seconds? choix', 'petit prix'],
    expand: ['reduction', 'promotion', 'offert', 'remise', 'moitie'],
    topics: ['promo', 'promos', 'promotion', 'promotions', 'reductions', 'reduction', 'offres', 'soldes'],
  },
  {
    id: 'duree',
    strong: [
      'combien (de )?(temps|heures?|jours?|semaines?|mois|minutes?|nuits?)', 'durees?', 'dure(nt)?', 'durer', 'tenir', 'tient', 'tiennent',
      'duree de vie', 'how long', 'delais?', 'temps de (combustion|fabrication|livraison|sechage|preparation)', 'combustion', 'autonomie',
      'se garde combien', 'garde combien',
    ],
    weak: ['longtemps', 'temps'],
    not: ['depuis combien', 'depuis quand', 'depuis longtemps', 'quel temps', 'quelle meteo', 'a quelle heure', 'quelle heure'],
    expand: ['temps', 'duree', 'heure', 'jour', 'semaine', 'mois', 'delai', 'prend'],
    topics: ['duree', 'delai', 'delais', 'combustion'],
  },
];

function compile(src: string): RegExp {
  return new RegExp(`(?:^|\\s)(?:${src})(?=\\s|$)`);
}

interface CompiledIntent {
  def: IntentDef;
  strong: RegExp[];
  weak: RegExp[];
  not: RegExp[];
  expandStems: string[];
  topicStems: Set<string>;
}

const COMPILED: CompiledIntent[] = DEFS.map((def) => ({
  def,
  strong: def.strong.map(compile),
  weak: (def.weak ?? []).map(compile),
  not: (def.not ?? []).map(compile),
  expandStems: [...new Set(def.expand.flatMap((w) => tokenizeNormalized(normalize(w))))],
  topicStems: new Set(def.topics.map((t) => normalize(t))),
}));

export const INTENT_IDS: IntentId[] = DEFS.map((d) => d.id);

export interface IntentHit {
  id: IntentId;
  score: number;
  /** Number of strong patterns that matched. */
  strong: number;
}

/** Ranks the intents of a (normalised) text. Score ≥ 2 = confident, 1 = weak hint. */
export function detectIntents(normalized: string): IntentHit[] {
  const hits: IntentHit[] = [];
  if (!normalized) return hits;
  for (const c of COMPILED) {
    if (c.not.some((r) => r.test(normalized))) continue;
    let score = 0;
    let strong = 0;
    for (const r of c.strong)
      if (r.test(normalized)) {
        score += 2;
        strong++;
      }
    for (const r of c.weak) if (r.test(normalized)) score += 1;
    if (score > 0) hits.push({ id: c.def.id, score, strong });
  }
  // "combien de temps" questions are about durations, not prices
  return hits.sort((a, b) => b.score - a.score || INTENT_IDS.indexOf(a.id) - INTENT_IDS.indexOf(b.id));
}

export function expansionStems(id: IntentId): string[] {
  return COMPILED.find((c) => c.def.id === id)?.expandStems ?? [];
}

/** Intents matching a chunk topic label ("livraison", "Matières", "shipping"…). */
export function intentsForTopic(topic: string | undefined): IntentId[] {
  if (!topic) return [];
  const n = normalize(topic);
  if (!n) return [];
  const out: IntentId[] = [];
  for (const c of COMPILED) {
    if (c.topicStems.has(n)) out.push(c.def.id);
    else {
      // "frais de livraison", "horaires d'ouverture"… : any topic word stem in the intent's topics
      const st = n.split(' ').map(stem);
      for (const t of c.topicStems) {
        const ts = t.split(' ').map(stem);
        if (ts.length === 1 && st.includes(ts[0])) {
          out.push(c.def.id);
          break;
        }
      }
    }
  }
  return out;
}

// ───────────────────────────── smalltalk ─────────────────────────────

const SMALL: { kind: SmalltalkKind; re: string; whole?: boolean }[] = [
  { kind: 'greeting', re: 're ?bonjour|re ?bonsoir|bonjour|bonsoir|salut( a toi| toi)?|coucou|hello|hi|hey|yo|bjr|slt|good (evening|morning|afternoon)|hola|wesh' },
  { kind: 'thanks', re: 'merci( beaucoup| bien| infiniment| mille fois| a toi| pour tout| pour l info| pour les infos)?|mille mercis|thanks?( you| a lot)?|thank you( so much)?|cimer|thx' },
  { kind: 'howareyou', re: 'comment (ca )?vas? tu|comment allez vous|comment ca va|comment vas tu|tu vas bien|vous allez bien|how are you|how s it going|la forme|bien et toi|et toi' },
  { kind: 'howareyou', re: 'ca va( bien)?( toi| et toi| vous)?', whole: true },
  { kind: 'xmas', re: 'joyeux noel|bon noel|bonnes? fetes|bonne annee|meilleurs voeux|merry (christmas|xmas)|happy (new year|holidays)' },
  { kind: 'bye', re: 'au revoir|a (plus|bientot|la prochaine|tout a l heure|tout a heure|demain|tantot)|bye( bye)?|goodbye|ciao|tchao|adieu|bonne (soiree|nuit|journee|continuation|fin de soiree)|see you|je (dois|vais) (y aller|partir|filer|te laisser)|je en vais|je file|on se revoit' },
  {
    kind: 'compliment',
    re:
      '(tu es|es|vous etes|etes) (vraiment |trop |tres |super |si |tellement )?(sympa|sympathique|gentille?|adorable|drole|mignonn?e?|geniale?|super|chou|top|formidable|charmante?|marrante?|beau|belle|incroyable|douee?|talentueu(x|se)|un amour)' +
      '|(est|sont|ca a air|ils sont|elles sont) (vraiment |trop |tres |super |si |tellement )?(beaux?|belles?|jolie?s?|magnifiques?|superbes?|geniale?s?|chouettes?|mignonn?e?s?|top|canon|parfaite?s?|sublimes?|delicieu\\w*|trop bien|une merveille)' +
      '|adore|bravo|trop bien|felicitations|sent (trop |tres |super |vraiment |si )?bon|ca sent bon|love (it|this|your)|beautiful|nice|cute|awesome|amazing|lovely|wonderful|aime (bien |beaucoup )?(ton|ta|tes|ce|cette|ces)|que est beau|quelle merveille|magnifique|superbe',
  },
  { kind: 'laugh', re: '(ha|ah){2,}h?|hihi+|hehe+|lol|mdr|ptdr|xd|rire' },
  { kind: 'yes', re: 'oui|ouais|yes|ok|okay|d accord|daccord|ca marche|parfait|cool|top|genial|volontiers|carrement|bien sur|tres bien|bien|super', whole: true },
  { kind: 'no', re: 'non|nan|no|pas vraiment|bof|non merci|pas du tout|nope', whole: true },
  { kind: 'sorry', re: 'pardon|desolee?|excusez? moi|sorry|oups' },
  {
    kind: 'weather',
    re:
      'quel temps( fait il| il fait| fait il dehors| fait il ce soir| il fera| fera t il)?|quelle meteo|la meteo|meteo|il fait (trop |tres |super |vraiment |un |un peu )?(froid|chaud|frais|bon|beau|glacial|frisquet)' +
      '|fait (trop |tres |super |vraiment |un peu )?(froid|frisquet|glacial)|(quel|ce) froid|ai (tellement |trop |tres |super |vraiment |un peu )?froid|il neige|ca caille|brr+|gele|cold|snow(ing)?|on se gele|je gele|caille|frisquet|what s the weather',
  },
  { kind: 'insult', re: 'nul(le)?s?|pas terrible|pas sympa|mechante?|moches?|laide?s?|connard|conne?|idiote?|stupide|debile|naze|pourrie?s?|arnaque|degueu\\w*|horrible|ennuyeu(x|se)|boring' },
];

const SMALL_RE = SMALL.map((s) => ({
  kind: s.kind,
  re: s.whole ? new RegExp(`^(?:${s.re})$`) : new RegExp(`(?:^|\\s)(?:${s.re})(?=\\s|$)`, 'g'),
}));

export interface SmalltalkHit {
  kinds: SmalltalkKind[];
  /** Normalised text with every smalltalk expression removed. */
  rest: string;
  /** "je m'appelle Léa" → "Léa" */
  visitorName?: string;
}

const PRIORITY: SmalltalkKind[] = ['bye', 'name', 'thanks', 'compliment', 'xmas', 'howareyou', 'greeting', 'sorry', 'insult', 'weather', 'laugh', 'yes', 'no'];

export function detectSmalltalk(raw: string, normalized: string): SmalltalkHit {
  const kinds = new Set<SmalltalkKind>();
  let rest = ` ${normalized} `;
  let visitorName: string | undefined;
  const nm = raw.match(/\b(?:je m['’ ]?appelle|moi c['’]est|mon (?:pr[ée]nom|nom) (?:c['’]est|est)|my name is|i am|i'm)\s+([A-Za-zÀ-ÖØ-öø-ÿ][\wÀ-ÖØ-öø-ÿ-]{1,24})/i);
  if (nm) {
    visitorName = nm[1].charAt(0).toUpperCase() + nm[1].slice(1);
    kinds.add('name');
    rest = rest.replace(/\b(je appelle|moi est|mon (prenom|nom) (est )?est|my name is|i am|i m)\s+\S+/, ' ');
  }
  for (const s of SMALL_RE) {
    if (s.re.global) {
      s.re.lastIndex = 0;
      if (s.re.test(rest)) {
        kinds.add(s.kind);
        s.re.lastIndex = 0;
        rest = rest.replace(s.re, ' ');
      }
      s.re.lastIndex = 0;
    } else if (s.re.test(normalized)) {
      kinds.add(s.kind);
      rest = '';
    }
  }
  rest = rest.replace(/\s+/g, ' ').trim();
  const sorted = [...kinds].sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b));
  return { kinds: sorted, rest, visitorName };
}
