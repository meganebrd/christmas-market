#!/usr/bin/env node
/**
 * Audio verification: boots Vite, opens src/audio/__check__.html in headless Chromium and renders, with
 * an OfflineAudioContext and the real synth code + mix graph:
 *   - every song (~20 s from the main theme, plus intro/outro and a loud "swell" pass),
 *   - every SFX (plain, positional, and repeated), the babble voice, every ambience zone.
 * Reports duration, loudness, RMS, peak, NaN/Infinity, clipping (> 0.99) and silence; checks that songs
 * are equally loud; prints each song's first phrase as note names and compares it to the reference.
 *
 *   node scripts/audio-check.mjs            (exit code 1 on failure)
 *   node scripts/audio-check.mjs --quick    (songs from the theme only, fewer variants)
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const quick = process.argv.includes('--quick');

/** Reference openings (as written in the reference scores), to proof-read the transcriptions. */
const EXPECTED = {
  'douce-nuit': 'G4 A4 G4 E4 G4 A4 G4 E4 D5 D5 B4 C5 C5 G4 A4 A4 C5 B4 A4 G4', // Si-lent night, ho-ly night, all is calm…
  'mon-beau-sapin': 'D4 G4 G4 G4 A4 B4 B4 B4 B4 A4 B4 C5 F#4 A4 G4 D5 D5 B4 E5 D5', // O Tan-nen-baum…
  'il-est-ne': 'D4 G4 G4 B4 G4 D4 G4 G4 G4 G4 A4 B4 C5 B4 A4 G4 A4 F#4 D4 D4', // Il est né le di-vin En-fant…
  'vive-le-vent': 'D4 B4 A4 G4 D4 D4 D4 D4 B4 A4 G4 E4 E4 C5 B4 A4 F#4 F#4 D5 D5', // Dashing through the snow…
  'les-anges': 'A4 A4 A4 C5 C5 Bb4 A4 A4 G4 A4 C5 A4 G4 F4 A4 A4 A4 C5 C5 Bb4', // Les an-ges dans nos cam-pa-gnes…
  'deck-the-halls': 'A4 G4 F#4 E4 D4 E4 F#4 D4 E4 F#4 G4 E4 F#4 E4 D4 C#4 D4 A4 G4 F#4', // Deck the halls with boughs of hol-ly…
  'we-wish-you': 'D4 G4 G4 A4 G4 F#4 E4 C4 E4 A4 A4 B4 A4 G4 F#4 D4 D4 B4 B4 C5', // We wish you a mer-ry Christ-mas…
  greensleeves: 'E4 G4 A4 B4 C5 B4 A4 F#4 D4 E4 F#4 G4 E4 E4 D#4 E4 F#4 D#4 B3 E4', // A-las, my love…
  'valse-de-givrelune': 'D5 F5 A5 G5 F5 F5 E5 D5 E5 D5 C#5 D5 F5 A5 C6 Bb5 A5 G5 F5 E5', // original
};
const EXPECTED_RHYTHM = {
  'douce-nuit': '3 1 2 6 3 1 2 6 4 2 6 4 2 6', // sixteenths
  'mon-beau-sapin': '2 3 1 4 4 3 1 6 2 2 2 4 4 4 4', // sixteenths
  'vive-le-vent': '2 2 2 2 6 1 1 2 2 2 2 8', // eighths
  greensleeves: '2 4 2 3 1 2 4 2 3 1 2', // eighths
};

const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = (n) => {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(n);
  return 12 * (Number(m[3]) + 1) + LETTER[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
};

const server = await createServer({ root, logLevel: 'error', server: { port: 0, strictPort: false, host: '127.0.0.1' } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && consoleErrors.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${e.message}`));
await page.goto(`${base}/src/audio/__check__.html`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__audioCheck?.ready, null, { timeout: 60000 });

const failures = [];
const warnings = [];
const fmt = (s) => `${String(s.duration).padStart(5)}s  loud ${String(s.loudDb).padStart(6)} dB  rms ${String(s.rmsDb).padStart(6)} dB  peak ${s.peak.toFixed(3)} (${String(s.peakDb).padStart(5)} dB)${s.nan ? `  NaN×${s.nan}` : ''}${s.clipped ? `  CLIP×${s.clipped}` : ''}${s.silent ? '  SILENT' : ''}`;
const judge = (label, s, opts = {}) => {
  const bad = [];
  if (s.nan) bad.push('NaN/Infinity');
  if (s.clipped) bad.push(`clipped ×${s.clipped}`);
  if (s.silent) bad.push('silent');
  if (opts.minLoud !== undefined && s.loudDb < opts.minLoud) bad.push(`too quiet (${s.loudDb} dB < ${opts.minLoud})`);
  if (bad.length) failures.push(`${label}: ${bad.join(', ')}`);
  return bad.length ? '✗' : '✓';
};

// ───────────────────────────── songs ─────────────────────────────
console.log('\n━━ SONGS ━━');
const songs = await page.evaluate(() => window.__audioCheck.songs());
const louds = [];
for (const s of songs) {
  console.log(`\n♪ ${s.id} — « ${s.title} », ${s.author} (${s.license}) · ${s.meter} @ ${s.bpm} bpm`);
  console.log(`  arrangement ${s.duration}s, ${s.events} events: ${s.passes.join(' · ')}`);
  if (s.errors.length) failures.push(`${s.id}: song data errors: ${s.errors.join('; ')}`);
  if (s.duration < 90 || s.duration > 185) failures.push(`${s.id}: length ${s.duration}s outside 1.5–3 min`);
  const got = s.firstPhrase.map((n) => n.name);
  const exp = (EXPECTED[s.id] ?? '').split(' ').filter(Boolean);
  const okMel = exp.length > 0 && exp.every((n, i) => got[i] && midi(n) === midi(got[i]));
  console.log(`  first phrase  ${s.firstPhrase.map((n) => `${n.name}·${n.len}`).join(' ')}`);
  console.log(`  reference     ${exp.join(' ')}  ${okMel ? '✓ notes match' : '✗ MISMATCH'}`);
  if (!okMel) failures.push(`${s.id}: first phrase differs from the reference`);
  if (EXPECTED_RHYTHM[s.id]) {
    const r = EXPECTED_RHYTHM[s.id].split(' ').map(Number);
    const okR = r.every((d, i) => s.firstPhrase[i]?.len === d);
    console.log(`  rhythm        ${r.join(' ')}  ${okR ? '✓ rhythm matches' : '✗ RHYTHM MISMATCH'}`);
    if (!okR) failures.push(`${s.id}: rhythm differs from the reference`);
  }
  const st = await page.evaluate((id) => window.__audioCheck.renderSong(id, 20, 'theme'), s.id);
  louds.push({ id: s.id, loud: st.loudDb });
  console.log(`  theme 20s     ${fmt(st)}  ${judge(`${s.id} theme`, st, { minLoud: -40 })}`);
  if (!quick) {
    const intro = await page.evaluate((id) => window.__audioCheck.renderSong(id, 8, 0), s.id);
    console.log(`  intro 8s      ${fmt(intro)}  ${judge(`${s.id} intro`, intro, { minLoud: -46 })}`);
    const end = await page.evaluate((id) => window.__audioCheck.renderSong(id, 14, 'end'), s.id);
    console.log(`  ending 14s    ${fmt(end)}  ${judge(`${s.id} ending`, end)}`);
    const loud = await page.evaluate((id) => window.__audioCheck.renderSong(id, 12, 'theme', { swell: true, loud: true }), s.id);
    console.log(`  swell @max    ${fmt(loud)}  ${judge(`${s.id} swell at max volume`, loud)}`);
  }
}
const lmax = Math.max(...louds.map((l) => l.loud));
const lmin = Math.min(...louds.map((l) => l.loud));
const spread = Math.round((lmax - lmin) * 10) / 10;
console.log(`\nsong loudness: ${louds.map((l) => `${l.id} ${l.loud}`).join(' · ')}`);
console.log(`loudness spread ${spread} dB ${spread <= 3 ? '✓ consistent (≤ 3 dB)' : '✗ INCONSISTENT'}`);
if (spread > 3) failures.push(`song loudness spread ${spread} dB > 3 dB`);
else if (spread > 2) warnings.push(`song loudness spread ${spread} dB`);

// ───────────────────────────── sfx ─────────────────────────────
console.log('\n━━ SFX ━━');
const names = await page.evaluate(() => window.__audioCheck.sfxNames);
for (const n of names) {
  const st = await page.evaluate((n) => window.__audioCheck.renderSfx(n), n);
  // hover/tick are meant to be barely there
  const minLoud = n === 'ui-hover' || n === 'tick' ? -62 : -55;
  let line = `${n.padEnd(14)} ${fmt(st)}  ${judge(`sfx ${n}`, st, { minLoud })}`;
  if (!quick) {
    const pos = await page.evaluate((n) => window.__audioCheck.renderSfx(n, { positional: true }), n);
    const rep = await page.evaluate((n) => window.__audioCheck.renderSfx(n, { repeat: 12, loud: true }), n);
    line += `   positional ${judge(`sfx ${n} positional`, pos)}   ×12 @max peak ${rep.peak.toFixed(3)} ${judge(`sfx ${n} ×12 at max volume`, rep)}`;
  }
  console.log(line);
}

// ───────────────────────────── voice ─────────────────────────────
console.log('\n━━ VOICE ━━');
for (const p of [0.6, 1, 1.6]) {
  const st = await page.evaluate((p) => window.__audioCheck.renderVoice(p), p);
  console.log(`babble pitch ${String(p).padEnd(4)} ${fmt(st)}  ${judge(`voice ${p}`, st, { minLoud: -50 })}`);
}

// ───────────────────────────── ambience ─────────────────────────────
console.log('\n━━ AMBIENCE ━━');
const zones = await page.evaluate(() => window.__audioCheck.zones);
for (const z of zones) {
  const st = await page.evaluate(([z, sec]) => window.__audioCheck.renderAmbience(z, sec), [z, quick ? 8 : 12]);
  console.log(`${z.padEnd(10)} ${fmt(st)}  ${judge(`ambience ${z}`, st, { minLoud: -55 })}  events: ${st.events.join(', ')}`);
}

// ───────────────────────────── cost ─────────────────────────────
const cost = await page.evaluate(() => window.__audioCheck.generationCost());
console.log('\n━━ ONE-OFF GENERATION COST (main thread, ms) ━━');
console.log('  ' + Object.entries(cost).map(([k, v]) => `${k} ${v}`).join(' · '));

await browser.close();
await server.close();

if (consoleErrors.length) {
  console.log(`\n${consoleErrors.length} console error(s)/warning(s):`);
  for (const e of [...new Set(consoleErrors)].slice(0, 20)) console.log('  ', e.slice(0, 400));
  failures.push('console errors on the check page');
}
for (const w of warnings) console.log(`⚠ ${w}`);
if (failures.length) {
  console.log(`\n✗ ${failures.length} failure(s):`);
  for (const f of failures) console.log('   -', f);
  process.exit(1);
}
console.log('\n✓ audio check passed: nothing silent, clipped or NaN; songs consistent; melodies match the references.');
process.exit(0);
