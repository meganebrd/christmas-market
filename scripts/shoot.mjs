#!/usr/bin/env node
/**
 * Visual check tool: boots a Vite dev server on a free port, opens the market in headless Chromium,
 * runs optional steps and saves screenshots. Prints browser console errors.
 *
 *   node scripts/shoot.mjs --params "skipIntro&fresh" --shot "plaza|__givrelune.travelTo('plaza')|2500"
 *   node scripts/shoot.mjs --mobile --shot "start||3000"
 *   node scripts/shoot.mjs --page editor.html --shot "editor||2000"
 *
 * Options:
 *   --params  query string appended to the URL (default "skipIntro&fresh&mute")
 *   --shot    "name|javascript to run before|wait ms" (repeatable). Saved to shots/<prefix><name>.png
 *             The JS must not contain "|". Prefix promise-returning calls with `void` (e.g. `void __givrelune.talk('cast:celeste')`)
 *             or the step waits until they resolve.
 *   --prefix  filename prefix (default "")
 *   --out     output dir (default shots)
 *   --width / --height   viewport (default 1280x800)
 *   --mobile  iPhone-like viewport (390x844, touch, dpr 2)
 *   --page    html page (default index.html)
 *   --boot    ms to wait after the game is ready (default 1500)
 *   --url     use an already running server instead of starting one
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name) => args.includes('--' + name);
const shots = [];
args.forEach((a, i) => a === '--shot' && shots.push(args[i + 1]));
if (!shots.length) shots.push('default||1500');

const outDir = resolve(root, opt('out', 'shots'));
mkdirSync(outDir, { recursive: true });
const prefix = opt('prefix', '');
const params = opt('params', 'skipIntro&fresh&mute');
const page = opt('page', 'index.html');
const bootWait = Number(opt('boot', '1500'));
const mobile = flag('mobile');

let server = null;
let base = opt('url', null);
if (!base) {
  server = await createServer({ root, logLevel: 'error', server: { port: 0, strictPort: false, host: '127.0.0.1', hmr: false, watch: null } });
  await server.listen();
  base = server.resolvedUrls.local[0];
}

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const context = await browser.newContext(
  mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: Number(opt('width', '1280')), height: Number(opt('height', '800')) } },
);
const tab = await context.newPage();
tab.setDefaultTimeout(240000);
const errors = [];
tab.on('console', (m) => {
  if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('GL Driver Message')) errors.push(`[${m.type()}] ${m.text()}`);
});
tab.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack ?? ''}`));

// software rendering is slow: keep the resolution fixed so screenshots stay sharp
const query = page === 'index.html' && !/(^|&)fixedres(&|$)/.test(params) ? [params, 'fixedres'].filter(Boolean).join('&') : params;
const url = `${base.replace(/\/$/, '')}/${page}${query ? '?' + query : ''}`;
console.log('→', url);
const t0 = Date.now();
await tab.goto(url, { waitUntil: 'load', timeout: 240000 });
if (page === 'index.html') {
  try {
    await tab.waitForFunction(() => window.__givrelune?.ready, null, { timeout: 240000 });
    console.log(`ready in ${Date.now() - t0} ms`);
  } catch {
    console.log('!! game never became ready');
  }
}
await tab.waitForTimeout(bootWait);

for (const s of shots) {
  const [name, js, wait] = s.split('|');
  if (js) {
    try {
      await tab.evaluate(js);
    } catch (e) {
      errors.push(`[step ${name}] ${e.message}`);
    }
  }
  await tab.waitForTimeout(Number(wait || 1500));
  const file = resolve(outDir, `${prefix}${name}.png`);
  await tab.screenshot({ path: file, timeout: 240000 });
  console.log('📸', file);
}

try {
  const info = await tab.evaluate(() => window.__givrelune?.info?.());
  if (info) console.log('info', JSON.stringify(info));
} catch {}

if (errors.length) {
  console.log(`\n${errors.length} console error(s)/warning(s):`);
  for (const e of [...new Set(errors)].slice(0, 40)) console.log(' ', e.slice(0, 600));
} else console.log('no console errors');

await browser.close();
await server?.close();
process.exit(0);
