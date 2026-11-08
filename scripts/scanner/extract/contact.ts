/** Contact details: mailto: / tel: links, e-mails and French phone numbers in the text, postal address. */
import type { HTMLElement } from 'node-html-parser';
import { clean, decodeEntities } from '../util';

export interface ContactInfo {
  emails: string[];
  phones: string[];
  address?: string;
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}/gi;
const BAD_EMAIL = /(\.(png|jpe?g|gif|webp|svg|avif)$|@2x|@3x|sentry|wixpress|example\.(com|org|net)$|domain\.(com|fr)$|email\.(com|fr)$|exemple\.|votre-?email|your-?email|nom@|name@|user@|test@)/i;
const PHONE_FR = /(?:(?:\+|00)33[\s.-]?(?:\(0\)[\s.-]?)?|\b0)[1-9](?:[\s.-]?\d{2}){4}\b/g;
const ADDRESS_FR =
  /\b\d{1,4}(?:\s?(?:bis|ter))?,?\s+(?:rue|avenue|av\.|chemin|place|boulevard|bd|allée|allee|impasse|route|quai|cours|lieu-dit|hameau|square|passage|faubourg|montée|chaussée)\b[^\n<>]{2,70}?,?\s*\d{5}\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ' -]{1,40}/i;

export function normalizeEmail(e: string): string {
  return decodeEntities(e).replace(/^mailto:/i, '').split('?')[0].trim().toLowerCase();
}

export function normalizePhone(p: string): string {
  return decodeEntities(p).replace(/^tel:/i, '').replace(/[^\d+]/g, (c) => (c === ' ' ? ' ' : '')).replace(/\s+/g, ' ').trim();
}

/** "0612345678" → "06 12 34 56 78" (French numbers only). */
export function prettyPhone(p: string): string {
  const digits = p.replace(/[^\d+]/g, '');
  const fr = digits.match(/^(?:\+33|0033)(\d{9})$/) ?? digits.match(/^0(\d{9})$/);
  if (fr) return ('0' + fr[1]).replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  return p.trim();
}

export function extractContact(root: HTMLElement): ContactInfo {
  const emails: string[] = [];
  const phones: string[] = [];
  const add = (list: string[], v: string) => {
    if (v && !list.includes(v)) list.push(v);
  };
  for (const a of root.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') ?? '';
    if (/^mailto:/i.test(href)) {
      const e = normalizeEmail(href);
      if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e) && !BAD_EMAIL.test(e)) add(emails, e);
    } else if (/^tel:/i.test(href)) {
      const p = prettyPhone(normalizePhone(href));
      if (p.replace(/\D/g, '').length >= 8) add(phones, p);
    }
  }
  // visible text (without scripts/styles)
  const body = root.querySelector('body') ?? root;
  const clone = body.clone() as HTMLElement;
  clone.querySelectorAll('script, style, noscript, template, svg').forEach((n) => n.remove());
  const text = clean(clone.text);
  for (const m of text.match(EMAIL) ?? []) {
    const e = normalizeEmail(m);
    if (!BAD_EMAIL.test(e)) add(emails, e);
  }
  for (const m of text.match(PHONE_FR) ?? []) add(phones, prettyPhone(m));

  let address: string | undefined;
  const addrEl = root.querySelector('address');
  if (addrEl) {
    const t = clean(addrEl.text.replace(EMAIL, '').replace(PHONE_FR, ''));
    if (t.length >= 8 && t.length <= 160 && /\d/.test(t)) address = t.replace(/\s*[,|·–-]\s*$/, '');
  }
  if (!address) {
    const m = text.match(ADDRESS_FR);
    if (m) address = clean(m[0]);
  }
  return { emails, phones, address };
}
