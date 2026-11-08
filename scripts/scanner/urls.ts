/** URL helpers for the crawler: canonical keys, same-site test, what to skip, what to visit first. */

const TRACKING = /^(utm_\w+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|ref|ref_src|_ga|_gl|igshid|srsltid|variant|view)$/i;

/** Canonical URL used for de-duplication (no hash, no tracking params, no trailing slash). */
export function canonical(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.hostname = u.hostname.toLowerCase();
    let path = u.pathname.replace(/\/{2,}/g, '/');
    if (path.length > 1) path = path.replace(/\/$/, '');
    const q = u.searchParams.toString();
    return `${u.protocol}//${u.host}${path}${q ? '?' + q : ''}`;
  } catch {
    return url;
  }
}

function bareHost(h: string) {
  return h.toLowerCase().replace(/^www\./, '');
}

/** Same site = same host, ignoring "www." (and http/https). */
export function sameSite(a: string, b: string): boolean {
  try {
    return bareHost(new URL(a).hostname) === bareHost(new URL(b).hostname) && new URL(a).port === new URL(b).port;
  } catch {
    return false;
  }
}

/** RFC 2606 placeholder domains used by the demo stalls: nothing to scan there. */
export function isPlaceholder(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return /(^|\.)example\.(com|org|net)$/.test(h) || /\.(example|invalid)$/.test(h);
  } catch {
    return false;
  }
}

const SKIP_EXT = /\.(jpe?g|png|gif|webp|avif|svg|ico|bmp|tiff?|pdf|zip|rar|7z|gz|tar|mp[34]|m4a|wav|ogg|webm|mov|avi|css|js|mjs|json|xml|rss|atom|txt|csv|xlsx?|docx?|pptx?|woff2?|ttf|otf|eot|dmg|exe|apk)$/i;
const SKIP_PATH =
  /\/(cart|panier|checkout|commande\/valider|account|my-account|mon-compte|compte|login|connexion|register|inscription|wp-admin|wp-login|wp-json|cdn-cgi|search|recherche|feed|xmlrpc|tag|tags|author|auteur|wishlist|liste-de-souhaits|compare|comparer|policies\/terms|share|partager|print|imprimer|logout|deconnexion|password|lost-password|cgi-bin|admin)(\/|$)/i;
const SKIP_QUERY = /[?&](add-to-cart|add_to_wishlist|replytocom|share|orderby|filter_|min_price|max_price|lang=(?!fr)|currency=|sort_by|q=|s=)/i;

export function shouldSkip(url: string): boolean {
  try {
    const u = new URL(url);
    if (SKIP_EXT.test(u.pathname)) return true;
    if (SKIP_PATH.test(u.pathname)) return true;
    if (SKIP_QUERY.test(u.search)) return true;
    if (/\/page\/\d{2,}/.test(u.pathname) || /[?&]page=\d{2,}/.test(u.search)) return true; // deep pagination
    return false;
  } catch {
    return true;
  }
}

const HIGH = /(a-propos|apropos|about|qui-sommes|qui-suis|notre-histoire|mon-histoire|histoire|story|l-atelier|atelier|savoir-faire|faq|questions|livraison|shipping|expedition|delivery|envoi|contact|nous-contacter|nous-trouver|horaires|cgv|conditions-generales)/i;
const SHOP = /(boutique|shop|produits|products|collections?|catalogue|store|creations|nos-|mes-)/i;
const PRODUCT = /(\/products?\/[^/]+$|\/produits?\/[^/]+$|\/p\/[^/]+$|\/article\/[^/]+$)/i;
const LOW = /(mentions-legales|legal|privacy|confidentialite|cookies|rgpd|gdpr|terms|blog\/page|\/page\/\d)/i;

/** Higher = visited first. */
export function priority(url: string, depth: number, opts: { haveApiProducts?: boolean } = {}): number {
  let path = url;
  try {
    const u = new URL(url);
    path = decodeURIComponent(u.pathname + u.search).toLowerCase();
  } catch {
    /* ignore */
  }
  let p = 30;
  if (path === '/' || path === '') p = 1000;
  else if (HIGH.test(path)) p = 100;
  else if (PRODUCT.test(path)) p = opts.haveApiProducts ? 12 : 45;
  else if (SHOP.test(path)) p = 60;
  else if (LOW.test(path)) p = 8;
  return p - depth * 8;
}
