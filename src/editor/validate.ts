import type { StallConfig } from '../config/types';
import { safeImage, safeUrl } from '../ui/dom';
import { GOOD_DESCRIPTION, MAX_DECORATIONS, MAX_PRODUCTS } from './catalog';
import type { TabId } from './types';

export interface Issue {
  level: 'error' | 'warn' | 'tip';
  text: string;
  tab: TabId;
  /** Element id to focus when the artisan clicks the issue. */
  focus?: string;
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isHttp(u: string | undefined): boolean {
  if (!u) return false;
  try {
    const p = new URL(u).protocol;
    return p === 'http:' || p === 'https:';
  } catch {
    return false;
  }
}

/** Only http(s), mailto and tel — the same rule the game applies before showing a link. */
export function isSafeLink(u: string | undefined): boolean {
  if (!u) return false;
  const t = u.trim();
  if (!/^(https?:|mailto:|tel:)/i.test(t)) return false;
  return !!safeUrl(t);
}

export function slugProblem(id: string): string | null {
  if (!id) return 'Il faut un identifiant (il sert aussi de nom de fichier).';
  if (!SLUG_RE.test(id)) return 'Seulement des minuscules sans accent, des chiffres et des tirets (ex. « la-meche-doree »).';
  return null;
}

export function validate(d: StallConfig, existing: StallConfig[], source: string): Issue[] {
  const out: Issue[] = [];
  const idErr = slugProblem(d.id ?? '');
  if (idErr) out.push({ level: 'error', text: idErr, tab: 'identite', focus: 'f-id' });
  if (!d.name?.trim()) out.push({ level: 'error', text: 'Donne un nom à ta cabane.', tab: 'identite', focus: 'f-name' });
  if (!d.owner?.name?.trim()) out.push({ level: 'error', text: 'Ton personnage a besoin d’un prénom.', tab: 'personnage', focus: 'f-owner-name' });

  (d.links ?? []).forEach((l, i) => {
    if (l.url?.trim() && !isSafeLink(l.url)) out.push({ level: 'error', text: `Le lien « ${l.label || 'sans nom'} » doit commencer par https://, mailto: ou tel:.`, tab: 'identite', focus: `f-link-url-${i}` });
  });
  if (d.website?.trim() && !isHttp(d.website.trim())) out.push({ level: 'error', text: 'L’adresse du site doit commencer par https://', tab: 'identite', focus: 'f-website' });

  const clash = existing.find((s) => s.id === d.id);
  if (clash && source !== d.id) out.push({ level: 'warn', text: `« ${clash.name} » utilise déjà l’identifiant « ${d.id} » : ta cabane la remplacerait.`, tab: 'identite', focus: 'f-id' });

  const products = d.products ?? [];
  if (!products.length) out.push({ level: 'warn', text: 'Ta cabane n’a pas encore de produit à montrer.', tab: 'produits' });
  products.forEach((p, i) => {
    if (p.url?.trim() && !isHttp(p.url.trim())) out.push({ level: 'error', text: `Le lien du produit ${i + 1} doit commencer par https://`, tab: 'produits', focus: `f-prod-url-${i}` });
    if (p.image?.trim() && !safeImage(p.image.trim())) out.push({ level: 'warn', text: `L’image du produit ${i + 1} n’est pas une adresse d’image valide.`, tab: 'produits', focus: `f-prod-image-${i}` });
  });
  const nameless = products.filter((p) => !p.name?.trim()).length;
  if (nameless) out.push({ level: 'tip', text: `${nameless} produit${nameless > 1 ? 's' : ''} sans nom : le scan de ton site les complétera, sinon ${nameless > 1 ? 'ils' : 'il'} ne s’affiche${nameless > 1 ? 'nt' : ''} pas.`, tab: 'produits' });
  if (products.length > MAX_PRODUCTS) out.push({ level: 'tip', text: `Seuls les ${MAX_PRODUCTS} premiers produits sont posés sur l’étal (les autres restent dans la vitrine).`, tab: 'produits' });
  if ((d.decorations ?? []).length > MAX_DECORATIONS) out.push({ level: 'tip', text: `Seules les ${MAX_DECORATIONS} premières décorations trouvent une place.`, tab: 'decorations' });

  const desc = d.knowledge?.description?.trim() ?? '';
  if (desc.length < GOOD_DESCRIPTION)
    out.push({ level: 'warn', text: `Ta description fait ${desc.length} caractères : plus tu écris, mieux ton personnage répondra (vise au moins ${GOOD_DESCRIPTION}).`, tab: 'savoir', focus: 'f-description' });
  if (!(d.knowledge?.faq ?? []).some((f) => f.q?.trim() && f.a?.trim())) out.push({ level: 'tip', text: 'Ajoute quelques questions fréquentes : ce sont les réponses les plus précises.', tab: 'savoir' });
  return out;
}
