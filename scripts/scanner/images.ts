/**
 * Optional image download (`--download-images`): saves product/site images to
 * `public/generated/<stallId>/<hash>.<ext>` and rewrites the URLs to `/generated/<stallId>/…`
 * (same-origin images avoid WebGL CORS issues when the 3D stalls use them as textures).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ScannedStallData } from '../../src/config/types';
import { fetchBinary } from './fetcher';
import { pool, sha1, slug } from './util';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
};

function extFor(contentType: string, url: string): string | undefined {
  const ct = contentType.split(';')[0].trim().toLowerCase();
  if (EXT[ct]) return EXT[ct];
  const m = url.split('?')[0].match(/\.(jpe?g|png|webp|gif|avif|svg)$/i);
  if (m) return m[1].toLowerCase().replace('jpeg', 'jpg');
  return undefined;
}

export interface DownloadOptions {
  stallId: string;
  publicDir: string;
  timeoutMs?: number;
  userAgent?: string;
  warnings: string[];
  maxImages?: number;
}

export async function downloadImages(data: ScannedStallData, o: DownloadOptions): Promise<number> {
  const id = slug(o.stallId);
  const dir = join(o.publicDir, 'generated', id);
  const urls = new Set<string>();
  for (const p of data.products) if (p.image && /^https?:/i.test(p.image)) urls.add(p.image);
  if (data.site.image && /^https?:/i.test(data.site.image)) urls.add(data.site.image);
  const list = [...urls].slice(0, o.maxImages ?? 60);
  if (!list.length) return 0;
  try {
    await mkdir(dir, { recursive: true });
  } catch (err: any) {
    o.warnings.push(`images: cannot create ${dir} (${err?.message ?? err})`);
    return 0;
  }
  const mapped = new Map<string, string>();
  await pool(list, 2, async (url) => {
    const res = await fetchBinary(url, { timeoutMs: o.timeoutMs, userAgent: o.userAgent });
    if (!res.ok || !res.body) {
      o.warnings.push(`image ${url}: ${res.error ?? `HTTP ${res.status}`}`);
      return;
    }
    const ct = res.contentType.toLowerCase();
    const ext = extFor(ct, url);
    if (!ext || (ct && !ct.startsWith('image/') && !ct.startsWith('application/octet-stream'))) {
      o.warnings.push(`image ${url}: not an image (${ct || 'unknown type'})`);
      return;
    }
    const name = `${sha1(url).slice(0, 12)}.${ext}`;
    try {
      await writeFile(join(dir, name), res.body);
      mapped.set(url, `/generated/${id}/${name}`);
    } catch (err: any) {
      o.warnings.push(`image ${url}: cannot write (${err?.message ?? err})`);
    }
  });
  for (const p of data.products) if (p.image && mapped.has(p.image)) p.image = mapped.get(p.image);
  if (data.site.image && mapped.has(data.site.image)) data.site.image = mapped.get(data.site.image);
  return mapped.size;
}
