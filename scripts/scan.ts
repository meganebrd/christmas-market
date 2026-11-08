/**
 * Scans the artisans' websites and writes content/generated/<stallId>.json (read by the game at build time).
 *
 *   npm run scan                              every stall with a website (knowledge.scan.enabled !== false)
 *   npm run scan -- la-meche-doree            one stall (several ids allowed)
 *   npm run scan -- --url https://… --id mon-stand
 *
 * Options:
 *   --download-images   save images to public/generated/<id>/ (avoids WebGL CORS issues)
 *   --max-pages N       pages per site (default: knowledge.scan.maxPages or 15)
 *   --timeout MS        per request (default 10000)
 *   --dry               print what was found, write nothing
 *   --verbose           print every visited URL
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ScannedStallData, StallConfig } from '../src/config/types';
import { scanSite, type ScanResult } from './scanner/index';
import { isPlaceholder } from './scanner/urls';
import { slug } from './scanner/util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tty = process.stdout.isTTY;
const c = (code: string) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = c('1');
const dim = c('2');
const green = c('32');
const yellow = c('33');
const red = c('31');
const cyan = c('36');

interface Args {
  ids: string[];
  url?: string;
  id?: string;
  downloadImages: boolean;
  maxPages?: number;
  timeoutMs?: number;
  dry: boolean;
  verbose: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { ids: [], downloadImages: false, dry: false, verbose: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === '--url') a.url = next();
    else if (k === '--id') a.id = next();
    else if (k === '--download-images' || k === '--images') a.downloadImages = true;
    else if (k === '--max-pages') a.maxPages = Number(next());
    else if (k === '--timeout') a.timeoutMs = Number(next());
    else if (k === '--dry' || k === '--dry-run') a.dry = true;
    else if (k === '--verbose' || k === '-v') a.verbose = true;
    else if (k === '--help' || k === '-h') a.help = true;
    else if (k.startsWith('--')) console.warn(yellow(`option inconnue ignorée : ${k}`));
    else a.ids.push(k);
  }
  return a;
}

function loadStalls(): StallConfig[] {
  const dir = join(ROOT, 'content/stalls');
  const out: StallConfig[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json') || f.startsWith('_')) continue;
    try {
      const s = JSON.parse(readFileSync(join(dir, f), 'utf8')) as StallConfig;
      out.push({ ...s, id: s.id ?? f.replace(/\.json$/, '') });
    } catch (err: any) {
      console.error(red(`✗ ${f} : JSON invalide (${err?.message ?? err})`));
    }
  }
  return out;
}

/** Keeps only the ScannedStallData fields (no warnings / page list in the content file). */
function toFile(r: ScanResult): ScannedStallData {
  return { stallId: r.stallId, scannedAt: r.scannedAt, source: r.source, site: r.site, products: r.products, chunks: r.chunks };
}

function summary(r: ScanResult, ms: number): string {
  const ok = r.pages.filter((p) => p.status >= 200 && p.status < 300).length;
  const bits = [
    `${ok} page${ok > 1 ? 's' : ''}`,
    `${r.products.length} produit${r.products.length > 1 ? 's' : ''}`,
    `${r.chunks.length} extrait${r.chunks.length > 1 ? 's' : ''}`,
  ];
  const contact = [r.site.email && '✉', r.site.phone && '☎', r.site.address && '⌂'].filter(Boolean).join(' ');
  if (contact) bits.push(contact);
  if (r.site.social?.length) bits.push(r.site.social.map((s) => s.label).join(', '));
  if (r.platform) bits.push(r.platform);
  bits.push(`${(ms / 1000).toFixed(1)} s`);
  return bits.join(dim(' · '));
}

function preview(r: ScanResult) {
  if (r.site.title) console.log(dim(`    site      `) + r.site.title + (r.site.description ? dim(` — ${r.site.description.slice(0, 80)}`) : ''));
  for (const p of r.products.slice(0, 5)) console.log(dim(`    produit   `) + `${p.name}${p.price !== undefined ? ` — ${p.price} ${p.currency ?? ''}` : ''}${p.image ? dim(' 🖼') : ''}`);
  if (r.products.length > 5) console.log(dim(`              … et ${r.products.length - 5} autres`));
  for (const ch of r.chunks.slice(0, 5)) console.log(dim(`    extrait   `) + `${ch.topic ? cyan(`[${ch.topic}] `) : ''}${ch.title ?? ''} ${dim('— ' + ch.text.slice(0, 70) + '…')}`);
  if (r.chunks.length > 5) console.log(dim(`              … et ${r.chunks.length - 5} autres`));
}

async function scanOne(id: string, url: string, opts: { maxPages?: number; urls?: string[] }, args: Args): Promise<boolean> {
  console.log(`${bold('🔎 ' + id)} ${dim('→')} ${url}`);
  if (isPlaceholder(url)) {
    console.log(dim(`   ⏭  ${new URL(url).hostname} est un domaine d'exemple (stand de démo) : rien à scanner.\n`));
    return true;
  }
  const t0 = Date.now();
  const r = await scanSite(url, {
    stallId: id,
    maxPages: args.maxPages ?? opts.maxPages ?? 15,
    timeoutMs: args.timeoutMs,
    downloadImages: args.downloadImages,
    publicDir: join(ROOT, 'public'),
    urls: opts.urls,
    log: args.verbose ? (m) => console.log(dim(m)) : undefined,
  });
  const ms = Date.now() - t0;
  const empty = !r.products.length && !r.chunks.length;
  console.log(`   ${empty ? yellow('∅') : green('✓')} ${summary(r, ms)}`);
  for (const w of r.warnings.slice(0, 6)) console.log(yellow(`   ⚠ ${w}`));
  if (r.warnings.length > 6) console.log(yellow(`   ⚠ … et ${r.warnings.length - 6} autres avertissements`));
  if (args.dry || args.verbose) preview(r);
  if (args.dry) {
    console.log(dim('   (--dry : rien n’a été écrit)\n'));
    return !empty;
  }
  if (empty && !r.pages.some((p) => p.status === 200)) {
    console.log(yellow(`   fichier non écrit (site injoignable)\n`));
    return false;
  }
  const outDir = join(ROOT, 'content/generated');
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `${id}.json`);
  writeFileSync(file, JSON.stringify(toFile(r), null, 2) + '\n');
  console.log(dim(`   → ${file.replace(ROOT + '/', '')}\n`));
  return true;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*?|^ \* ?/gm, ''));
    return;
  }
  let failures = 0;
  if (args.url) {
    let id = args.id;
    if (!id) {
      try {
        id = slug(new URL(args.url).hostname.replace(/^www\./, ''));
      } catch {
        console.error(red(`URL invalide : ${args.url}`));
        process.exitCode = 1;
        return;
      }
    }
    if (!(await scanOne(id, args.url, {}, args))) failures++;
  } else {
    const stalls = loadStalls();
    let targets = stalls;
    if (args.ids.length) {
      const missing = args.ids.filter((id) => !stalls.some((s) => s.id === id));
      for (const m of missing) console.error(red(`✗ stand inconnu : ${m} (fichiers dans content/stalls/)`));
      if (missing.length) process.exitCode = 1;
      targets = stalls.filter((s) => args.ids.includes(s.id));
    }
    const runnable = targets.filter((s) => {
      const scan = s.knowledge?.scan;
      const url = scan?.urls?.[0] ?? s.website;
      if (!url) {
        if (args.ids.length) console.log(dim(`⏭  ${s.id} : pas de site web.`));
        return false;
      }
      if (scan?.enabled === false) {
        console.log(dim(`⏭  ${s.id} : scan désactivé (knowledge.scan.enabled = false).`));
        return false;
      }
      return true;
    });
    if (!runnable.length) console.log(dim('Rien à scanner.'));
    for (const s of runnable) {
      const scan = s.knowledge?.scan;
      const url = scan?.urls?.[0] ?? s.website!;
      if (!(await scanOne(s.id, url, { maxPages: scan?.maxPages, urls: scan?.urls?.slice(1) }, args))) failures++;
    }
  }
  if (failures) console.log(yellow(`${failures} site(s) sans résultat.`));
}

main().catch((err) => {
  console.error(red(String(err?.stack ?? err)));
  process.exitCode = 1;
});
