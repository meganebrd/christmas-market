/**
 * Readable text → KnowledgeChunks. Strips navigation, headers/footers, scripts, cookie banners, forms…
 * keeps headings, paragraphs and list items, then groups them under the nearest heading (~300–700 chars).
 * FAQ-like sections (a heading ending with "?") become one chunk per question.
 */
import type { HTMLElement, Node } from 'node-html-parser';
import type { KnowledgeChunk } from '../../../src/config/types';
import { clean, slug } from '../util';

export interface TextBlock {
  kind: 'h' | 'p' | 'li' | 'q';
  level: number;
  text: string;
}

const DROP_TAGS = new Set([
  'script', 'style', 'noscript', 'template', 'svg', 'iframe', 'form', 'nav', 'button', 'select', 'option', 'input', 'textarea',
  'label', 'canvas', 'video', 'audio', 'object', 'embed', 'map', 'dialog', 'head', 'meta', 'link', 'picture', 'img', 'source', 'menu',
]);
const OUTER_TAGS = new Set(['header', 'footer', 'aside']);
const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'main', 'li', 'ul', 'ol', 'blockquote', 'dd', 'td', 'th', 'tr', 'table', 'tbody', 'thead', 'figcaption',
  'address', 'details', 'pre', 'center', 'body', 'html', 'dl', 'figure', 'header', 'footer', 'aside', 'hr',
]);
const HEADINGS: Record<string, number> = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 };

/** Class / id words of things that are never content (matched on the first or last part of a class token). */
const NOISE_WORDS = new Set([
  'nav', 'navbar', 'navigation', 'menu', 'megamenu', 'cookie', 'cookies', 'consent', 'gdpr', 'rgpd', 'newsletter', 'popup', 'modal',
  'breadcrumb', 'breadcrumbs', 'share', 'sharing', 'social', 'sidebar', 'cart', 'minicart', 'search', 'searchbar', 'login', 'account',
  'announcement', 'skip', 'offcanvas', 'drawer', 'toolbar', 'pagination', 'related', 'upsell', 'crosssell', 'recently',
]);
const NOISE_TOKENS = /^(visually-hidden|sr-only|screen-reader-text|tarteaucitron\w*|axeptio\w*|didomi\w*|onetrust\w*|cc-window|cc-banner|klaro|cmplz\w*|back-to-top|cmp)$/i;
const OUTER_WORDS = new Set(['header', 'footer', 'topbar', 'masthead', 'colophon']);

function noisySignature(sig: string, inMain: boolean): boolean {
  for (const token of sig.split(/\s+/)) {
    if (!token) continue;
    if (NOISE_TOKENS.test(token)) return true;
    const parts = token.toLowerCase().split(/[-_]+/).filter(Boolean);
    if (!parts.length) continue;
    const first = parts[0];
    const last = parts[parts.length - 1];
    if (NOISE_WORDS.has(first) || NOISE_WORDS.has(last)) return true;
    if (!inMain && (OUTER_WORDS.has(first) || OUTER_WORDS.has(last))) return true;
  }
  return false;
}

const BOILERPLATE =
  /(©|copyright|tous droits réservés|all rights reserved|ajouter au panier|add to cart|lire la suite|read more|en savoir plus|voir plus|voir le produit|accepter|refuser|j'accepte|paramétrer|nous utilisons des cookies|ce site utilise des cookies|we use cookies|inscrivez-vous|abonnez-vous|subscribe|s'inscrire|newsletter|choisir les options|sélectionner les options|quantité|rupture de stock|mot de passe|password|votre panier|your cart|paiement sécurisé|retour en haut|back to top|powered by|propulsé par|thème|theme by)/i;

function attr(el: HTMLElement, name: string): string {
  return el.getAttribute(name) ?? '';
}

function isHidden(el: HTMLElement): boolean {
  if (el.hasAttribute('hidden')) return true;
  if (attr(el, 'aria-hidden') === 'true') return true;
  const style = attr(el, 'style').replace(/\s/g, '').toLowerCase();
  return style.includes('display:none') || style.includes('visibility:hidden');
}

function isNoise(el: HTMLElement, inMain: boolean): boolean {
  const tag = el.rawTagName?.toLowerCase() ?? '';
  if (DROP_TAGS.has(tag)) return true;
  if (!inMain && OUTER_TAGS.has(tag)) return true;
  if (isHidden(el)) return true;
  const role = attr(el, 'role').toLowerCase();
  if (/^(navigation|search|dialog|alertdialog|menu|menubar|toolbar)$/.test(role)) return true;
  if (!inMain && /^(banner|contentinfo|complementary)$/.test(role)) return true;
  return noisySignature(`${attr(el, 'class')} ${attr(el, 'id')}`, inMain);
}

/** Picks the main content element when there is one with enough text. */
function contentRoot(root: HTMLElement): { el: HTMLElement; inMain: boolean } {
  const candidates = root.querySelectorAll('main, [role="main"], article, #content, #main, .main-content, .site-content, .entry-content, .page-content');
  for (const c of candidates) {
    if (clean(c.text).length >= 200) return { el: c, inMain: true };
  }
  return { el: root.querySelector('body') ?? root, inMain: false };
}

export function extractBlocks(root: HTMLElement): TextBlock[] {
  const blocks: TextBlock[] = [];
  const { el: start, inMain } = contentRoot(root);
  let buf = '';
  let linkChars = 0;
  let bufKind: TextBlock['kind'] = 'p';

  const flush = () => {
    const t = clean(buf);
    if (t) {
      const ratio = linkChars / Math.max(1, t.length);
      if (ratio < 0.6 || t.length > 160) blocks.push({ kind: bufKind, level: 0, text: t });
    }
    buf = '';
    linkChars = 0;
    bufKind = 'p';
  };

  const walk = (node: HTMLElement, inLink: boolean, main: boolean) => {
    for (const child of node.childNodes as Node[]) {
      if (child.nodeType === 3) {
        const t = child.text;
        buf += t;
        if (inLink) linkChars += clean(t).length;
        continue;
      }
      if (child.nodeType !== 1) continue;
      const el = child as HTMLElement;
      const tag = el.rawTagName?.toLowerCase() ?? '';
      const nowMain = main || tag === 'main' || tag === 'article' || attr(el, 'role') === 'main';
      if (isNoise(el, nowMain)) continue;
      if (tag === 'br') {
        buf += ' ';
        continue;
      }
      if (HEADINGS[tag]) {
        flush();
        const t = clean(el.text);
        if (t && t.length <= 200) blocks.push({ kind: 'h', level: HEADINGS[tag], text: t });
        else if (t) blocks.push({ kind: 'p', level: 0, text: t });
        continue;
      }
      if (tag === 'summary' || tag === 'dt') {
        flush();
        const t = clean(el.text);
        if (t) blocks.push({ kind: 'q', level: 7, text: t });
        continue;
      }
      if (BLOCK_TAGS.has(tag)) {
        flush();
        if (tag === 'li') bufKind = 'li';
        walk(el, inLink, nowMain);
        flush();
        continue;
      }
      walk(el, inLink || tag === 'a', nowMain);
    }
  };
  walk(start, false, inMain);
  flush();

  // filter + de-duplicate inside the page
  const seen = new Set<string>();
  return blocks.filter((b) => {
    const key = b.text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    if (b.kind === 'h' || b.kind === 'q') return b.text.length >= 2;
    if (b.text.length < (b.kind === 'li' ? 12 : 25)) return false;
    if (b.text.length < 90 && BOILERPLATE.test(b.text)) return false;
    if (/cookies?/i.test(b.text) && /(accept|consent|navigation|traceurs|tracking|paramètres|préférences)/i.test(b.text)) return false;
    if (/^[\d\s€$.,:/-]+$/.test(b.text)) return false; // only prices/dates
    return true;
  });
}

/** Topic hint from the URL and the heading. */
export function guessTopic(url: string, heading?: string): string | undefined {
  const h = (heading ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  const fromText = (s: string): string | undefined => {
    if (/livraison|expedition|shipping|delivery|envoi|frais de port|frais-de-port|colis/.test(s)) return 'livraison';
    if (/horaire|ouverture|opening hours/.test(s)) return 'horaires';
    if (/paiement|payment|moyens de paiement/.test(s)) return 'paiement';
    if (/entretien|conseils? d.utilisation|mode d.emploi|care|utilisation/.test(s)) return 'entretien';
    if (/personnalis|sur[ -]mesure|custom/.test(s)) return 'personnalisation';
    if (/allergene|allergen|ingredient/.test(s)) return 'allergenes';
    if (/matiere|materiau|composition|materials/.test(s)) return 'matieres';
    if (/contact|coordonnees|nous trouver|nous-trouver|acces|adresse/.test(s)) return 'contact';
    if (/faq|questions frequentes|questions-frequentes|foire aux questions/.test(s)) return 'faq';
    if (/a propos|a-propos|apropos|about|qui sommes|qui-sommes|qui suis|qui-suis|notre histoire|notre-histoire|mon histoire|mon-histoire|histoire|l atelier|l-atelier|savoir[ -]faire|notre equipe|valeurs|story/.test(s)) return 'about';
    if (/cgv|conditions generales|conditions-generales|terms/.test(s)) return 'conditions';
    return undefined;
  };
  const byHeading = h ? fromText(h) : undefined;
  if (byHeading && byHeading !== 'faq') return byHeading;
  let path = '';
  try {
    path = decodeURIComponent(new URL(url).pathname).toLowerCase();
  } catch {
    /* ignore */
  }
  if (/\/(products?|produits?|p)\/[^/]+$/.test(path)) return 'product';
  return fromText(path.replace(/[/_]/g, ' ')) ?? byHeading;
}

export interface ChunkOptions {
  pageUrl: string;
  pageTitle?: string;
  /** Topic of the whole page (og:type=product → 'product'). */
  pageTopic?: string;
  idPrefix?: string;
  min?: number;
  max?: number;
}

function ensurePeriod(s: string) {
  return /[.!?…:;»"]$/.test(s) ? s : s + '.';
}

function splitLong(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const sentences = text.match(/[^.!?…]+[.!?…]+["»”)]*\s*|[^.!?…]+$/g) ?? [text];
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && (cur + s).length > max) {
      out.push(cur.trim());
      cur = '';
    }
    if (s.length > max) {
      // a monster sentence: cut on commas
      let rest = s;
      while (rest.length > max) {
        const at = Math.max(rest.lastIndexOf(', ', max), rest.lastIndexOf('; ', max));
        const cutAt = at > max * 0.4 ? at + 1 : rest.lastIndexOf(' ', max);
        out.push(rest.slice(0, cutAt).trim());
        rest = rest.slice(cutAt);
      }
      cur = rest;
    } else cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function blocksToChunks(blocks: TextBlock[], o: ChunkOptions): KnowledgeChunk[] {
  const min = o.min ?? 300;
  const max = o.max ?? 700;
  const chunks: KnowledgeChunk[] = [];
  let prefix = o.idPrefix;
  if (!prefix) {
    try {
      prefix = slug(new URL(o.pageUrl).pathname.replace(/^\/|\/$/g, '') || 'accueil');
    } catch {
      prefix = 'page';
    }
  }
  let heading: string | undefined;
  let faq = false;
  let buf: string[] = [];
  let n = 0;

  const emit = (text: string) => {
    const topic = guessTopic(o.pageUrl, heading) ?? o.pageTopic;
    const precious = faq || (topic !== undefined && ['livraison', 'contact', 'horaires', 'paiement', 'personnalisation', 'allergenes'].includes(topic));
    if (text.length < (precious ? 15 : 40)) return;
    const prev = chunks[chunks.length - 1];
    if (!faq && prev && prev.title === (heading ?? o.pageTitle) && text.length < 120 && prev.text.length + text.length < max + 100) {
      prev.text = `${prev.text} ${text}`;
      return;
    }
    chunks.push({ id: `${prefix}-${n++}`, title: heading ?? o.pageTitle, text, source: o.pageUrl, topic: faq && !topic ? 'faq' : topic });
  };
  const flush = () => {
    if (!buf.length) return;
    let cur = '';
    for (const part of buf) {
      for (const piece of splitLong(part, max)) {
        if (cur && cur.length + 1 + piece.length > max && cur.length >= Math.min(min, 120)) {
          emit(cur);
          cur = '';
        }
        cur = cur ? `${cur} ${piece}` : piece;
        if (cur.length >= min && !faq) {
          emit(cur);
          cur = '';
        }
      }
    }
    if (cur) emit(cur);
    buf = [];
  };

  for (const b of blocks) {
    if (b.kind === 'h' || b.kind === 'q') {
      flush();
      heading = b.text;
      faq = b.kind === 'q' || /\?\s*$/.test(b.text);
      continue;
    }
    buf.push(ensurePeriod(b.text));
  }
  flush();
  return chunks;
}
