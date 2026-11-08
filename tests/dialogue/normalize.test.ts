import { describe, expect, it } from 'vitest';
import { normalize, splitSentences, stem, tokenize } from '../../src/dialogue/normalize';
import { detectIntents, detectSmalltalk } from '../../src/dialogue/intents';
import { articleFor, shortRef, toFirstPerson } from '../../src/dialogue/voice';

describe('normalize', () => {
  it('lowercases, strips accents, elisions, punctuation and maps €', () => {
    expect(normalize("L'Écharpe coûte 55 € ?")).toBe('echarpe coute 55 euro');
    expect(normalize('Qu’est-ce que c’est ?')).toBe('est ce que est');
    expect(normalize("J'adore tes bougies !!!")).toBe('adore tes bougies');
    expect(normalize('12,50 € — 1 600 m')).toBe('12.50 euro 1600 m');
    expect(normalize('Œuvre, sœur')).toBe('oeuvre soeur');
  });
});

describe('stemmer', () => {
  const same = (...words: string[]) => expect(new Set(words.map((w) => stem(normalize(w)))).size).toBe(1);
  it('maps the forms of a verb and its noun together', () => {
    same('livrer', 'livres', 'livrez', 'livré', 'livraison', 'livraisons');
    same('expédier', 'expédiez', 'expédition', 'expédie');
    same('envoyer', 'envoyez', 'envoi', 'envois', 'envoie');
    same('fabriquer', 'fabriqué', 'fabriquée', 'fabrication', 'fabrique');
    same('personnaliser', 'personnalisé', 'personnalisées', 'personnalisation');
  });
  it('handles plurals and feminine forms', () => {
    same('bougie', 'bougies');
    same('naturel', 'naturelle', 'naturels');
    same('tricoteur', 'tricoteuse');
    same('matériau', 'matériaux');
    same('chaussette', 'chaussettes');
  });
  it('keeps invariable words', () => {
    expect(stem('colis')).toBe('colis');
    expect(stem('bois')).toBe('bois');
    expect(stem('prix')).toBe('prix');
  });
  it('tokenize removes stopwords', () => {
    expect(tokenize('Est-ce que tu livres les bougies ?')).toEqual(['livr', 'bougi']);
  });
});

describe('sentences', () => {
  it('does not split prices, e-mails or times', () => {
    const s = splitSentences("On peut m'écrire à bonjour@example.com ou passer. Ouvert de 16 h à 22 h. Prix : 12,50 €.");
    expect(s).toEqual(["On peut m'écrire à bonjour@example.com ou passer.", 'Ouvert de 16 h à 22 h.', 'Prix : 12,50 €.']);
  });
});

describe('intents', () => {
  const top = (q: string) => detectIntents(normalize(q))[0]?.id;
  it('detects the main intents', () => {
    expect(top('Tu livres ?')).toBe('livraison');
    expect(top('c’est combien ?')).toBe('prix');
    expect(top('elle dure combien de temps')).toBe('duree');
    expect(top('quelle laine tu utilises')).toBe('matieres');
    expect(top('tu fais du sur mesure ?')).toBe('personnalisation');
    expect(top('comment te contacter ?')).toBe('contact');
    expect(top('depuis quand tu fais ça ?')).toBe('histoire');
    expect(top('comment laver un bonnet')).toBe('entretien');
    expect(top('il y a du gluten ?')).toBe('allergenes');
    expect(top('je peux payer par carte ?')).toBe('paiement');
    expect(top('qui es-tu ?')).toBe('identite');
    expect(top('do you ship?')).toBe('livraison');
    expect(top('how much is it?')).toBe('prix');
  });
  it('"combien de ruches" is not a price question', () => {
    expect(detectIntents(normalize('tu as combien de ruches ?')).some((h) => h.id === 'prix')).toBe(false);
  });
  it('detects smalltalk and keeps the rest of the question', () => {
    const st = detectSmalltalk('Bonjour ! Tu livres ?', normalize('Bonjour ! Tu livres ?'));
    expect(st.kinds).toContain('greeting');
    expect(st.rest).toBe('tu livres');
    expect(detectSmalltalk('merci beaucoup', normalize('merci beaucoup')).kinds).toEqual(['thanks']);
    expect(detectSmalltalk("je m'appelle Léa", normalize("je m'appelle Léa")).visitorName).toBe('Léa');
  });
});

describe('voice', () => {
  it('turns a third-person bio into the first person', () => {
    expect(toFirstPerson("Margot coule ses bougies dans l'ancienne laiterie depuis 2016.", 'Margot Lenoir')).toBe("Je coule mes bougies dans l'ancienne laiterie depuis 2016.");
    expect(toFirstPerson("Il parle de ses abeilles comme d'une grande famille.", 'Élias Moreau')).toBe("Je parle de mes abeilles comme d'une grande famille.");
    expect(toFirstPerson("À 72 ans, elle tricote plus vite qu'elle ne parle, et elle parle beaucoup.", 'Suzanne Arnaud')).toBe(
      'À 72 ans, je tricote plus vite que je ne parle, et je parle beaucoup.',
    );
    expect(toFirstPerson("Tout le monde l'appelle Suzon.", 'Suzanne Arnaud')).toBe("Tout le monde m'appelle Suzon.");
    expect(toFirstPerson('Élias est apiculteur.', 'Élias Moreau')).toBe('Je suis apiculteur.');
  });
  it('refuses unsafe conversions', () => {
    expect(toFirstPerson('Il fait froid chez Margot.', 'Margot Lenoir')).toBeNull();
  });
  it('puts the right article in front of product names', () => {
    expect(articleFor('Miel de sapin').ref).toBe('le miel de sapin');
    expect(articleFor('Bougie « Pain d’épices »').ref).toBe('la bougie « Pain d’épices »');
    expect(articleFor('Écharpe torsadée').ref).toBe("l'écharpe torsadée");
    expect(articleFor('Chaussettes de cheminée').ref).toBe('les chaussettes de cheminée');
    expect(articleFor('Hydromel des Cimes').ref).toBe("l'hydromel des Cimes");
    expect(articleFor('Coffret de fondants').ref).toBe('le coffret de fondants');
    expect(shortRef('Bonnet à pompon « Flocon »')).toBe('le bonnet Flocon');
    expect(shortRef('Pain d’épices au miel')).toBe('le pain d’épices');
  });
});
