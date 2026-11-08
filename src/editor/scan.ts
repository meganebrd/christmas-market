import type { ScanResponse } from './types';

/**
 * The website scanner runs server-side (no CORS issue). In `npm run dev`, vite.config.ts exposes it at
 * GET /__givrelune/scan?url=…&id=…&maxPages=…; on a static build it does not exist and the editor
 * explains how to run `npm run scan -- <id>` instead.
 */
export const SCAN_AVAILABLE = import.meta.env.DEV;

export async function scanSite(url: string, id: string, maxPages: number, timeoutMs = 90000): Promise<ScanResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const q = new URLSearchParams({ url, id: id || 'preview', maxPages: String(maxPages) });
    const res = await fetch(`/__givrelune/scan?${q}`, { signal: ctrl.signal });
    const data = (await res.json().catch(() => ({}))) as ScanResponse & { error?: string };
    if (!res.ok || data.error) throw new Error(data.error || `erreur ${res.status}`);
    data.products ??= [];
    data.chunks ??= [];
    data.site ??= {};
    return data;
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new Error('le site met trop de temps à répondre');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeUrl(u: string) {
  return u.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
}
