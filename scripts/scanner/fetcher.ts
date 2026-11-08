/** Polite HTTP client: identifies itself, times out, caps the body size, never throws. */
import { USER_AGENT } from './util';

export interface FetchResult {
  ok: boolean;
  status: number;
  /** Final URL after redirects. */
  url: string;
  contentType: string;
  text: string;
  error?: string;
}

export interface BinaryResult {
  ok: boolean;
  status: number;
  url: string;
  contentType: string;
  body?: Uint8Array;
  error?: string;
}

export interface FetchOptions {
  timeoutMs?: number;
  accept?: string;
  maxBytes?: number;
  userAgent?: string;
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(await res.arrayBuffer()).slice(0, maxBytes);
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    parts.push(value);
    size += value.byteLength;
    if (size >= maxBytes) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      break;
    }
  }
  const out = new Uint8Array(Math.min(size, maxBytes));
  let off = 0;
  for (const p of parts) {
    const n = Math.min(p.byteLength, out.byteLength - off);
    out.set(p.subarray(0, n), off);
    off += n;
    if (off >= out.byteLength) break;
  }
  return out;
}

function charsetOf(contentType: string): string {
  const m = contentType.match(/charset=["']?([\w-]+)/i);
  return m ? m[1].toLowerCase() : 'utf-8';
}

async function doFetch(url: string, o: FetchOptions): Promise<{ res?: Response; error?: string; timer?: ReturnType<typeof setTimeout> }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), o.timeoutMs ?? 10000);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'user-agent': o.userAgent ?? USER_AGENT,
        accept: o.accept ?? 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'accept-language': 'fr-FR,fr;q=0.9,en;q=0.6',
      },
    });
    return { res, timer };
  } catch (err: any) {
    clearTimeout(timer);
    const msg = err?.name === 'AbortError' ? `timeout after ${o.timeoutMs ?? 10000} ms` : String(err?.cause?.code ?? err?.message ?? err);
    return { error: msg };
  }
}

export async function fetchText(url: string, o: FetchOptions = {}): Promise<FetchResult> {
  const { res, error, timer } = await doFetch(url, o);
  if (!res) return { ok: false, status: 0, url, contentType: '', text: '', error };
  try {
    const contentType = res.headers.get('content-type') ?? '';
    const bytes = await readCapped(res, o.maxBytes ?? 3_000_000);
    let text: string;
    try {
      text = new TextDecoder(charsetOf(contentType)).decode(bytes);
    } catch {
      text = new TextDecoder('utf-8').decode(bytes);
    }
    // <meta charset="iso-8859-1"> without a header
    if (!/charset=/i.test(contentType) && /<meta[^>]+charset=["']?(iso-8859-1|windows-1252|latin1)/i.test(text.slice(0, 2048))) {
      text = new TextDecoder('windows-1252').decode(bytes);
    }
    return { ok: res.ok, status: res.status, url: res.url || url, contentType, text };
  } catch (err: any) {
    const msg = err?.name === 'AbortError' ? `timeout after ${o.timeoutMs ?? 10000} ms` : String(err?.message ?? err);
    return { ok: false, status: res.status, url: res.url || url, contentType: '', text: '', error: msg };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchBinary(url: string, o: FetchOptions = {}): Promise<BinaryResult> {
  const { res, error, timer } = await doFetch(url, { accept: 'image/avif,image/webp,image/*;q=0.9,*/*;q=0.5', ...o });
  if (!res) return { ok: false, status: 0, url, contentType: '', error };
  try {
    const contentType = res.headers.get('content-type') ?? '';
    const max = o.maxBytes ?? 5_000_000;
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > max) {
      try {
        await res.body?.cancel();
      } catch {
        /* ignore */
      }
      return { ok: false, status: res.status, url: res.url || url, contentType, error: `too large (${len} bytes)` };
    }
    const body = await readCapped(res, max + 1);
    if (body.byteLength > max) return { ok: false, status: res.status, url: res.url || url, contentType, error: 'too large' };
    return { ok: res.ok, status: res.status, url: res.url || url, contentType, body };
  } catch (err: any) {
    return { ok: false, status: res.status, url: res.url || url, contentType: '', error: String(err?.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}
