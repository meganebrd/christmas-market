# Givrelune — Architecture

Givrelune is an open-source, cosy 3D Christmas market that runs in the browser. Visitors stroll between
the chalets of real artisans, talk with them (no AI: a local search engine over each artisan's texts and
website), look at their products and follow links to their shops. A light story (find the 7 glass stars of
the Grand Sapin) and mini-games give the walk a purpose.

## Stack

| Concern | Choice | Why |
|---|---|---|
| Build | **Vite 8** + **TypeScript** (strict) | instant dev server, static output, zero config |
| 3D | **Three.js 0.187** (WebGL2) + `three/addons` post-processing (bloom) | the most mature, lightest full 3D engine on the web |
| UI | **Vanilla DOM + CSS** (no framework) | tiny, fast, no hydration; the UI is a few overlays |
| Audio | **Web Audio API**, everything synthesised (music box carols, ambience, SFX, voices) | zero audio files to license or download |
| Content | **JSON files** in `content/` (one per stall) | anyone can add a stall with a pull request |
| Scraping | **Node script** (`npm run scan`) with `node-html-parser` | reads JSON-LD/OpenGraph/Shopify/WooCommerce at build time — no CORS, no server |
| Dialogue | Home-made **French-aware BM25 + intents** | no AI, deterministic, runs offline, a few KB |
| Tests | **Vitest** (logic) + **Playwright** (screenshots/e2e) | |
| Hosting | any static host (GitHub Pages, Netlify, Vercel…) | `npm run build` → `dist/` |

All 3D models are **procedural** (built from Three.js primitives in code): no asset pipeline, no licences,
tiny download, and every chalet can be re-coloured/re-decorated from JSON.

## Folder map & ownership

```
content/                 market.json, stalls/*.json (hand-written), generated/*.json (written by the scanner)
public/demo/             demo product illustrations (SVG)
scripts/                 scan.ts (CLI), scanner/ (site extractors), shoot.mjs (screenshot tool)
src/config/              types.ts (THE content schema), resolve.ts (defaults & merge), load.ts (Vite glob)
src/core/                Game (boot, loop, modes), contracts.ts (APIs between modules), Input, Colliders,
                         Interactables, LightDirector, CameraRig, RenderPipeline, save, quality
src/world/layout.ts      the plan of the market (pure math) — zones, stall slots, paths, walk graph
src/world/palette.ts     art direction colours        src/world/materials.ts  cached materials (mat/glow/std)
src/world/textures.ts    canvas textures (signs, glow sprites), image loading with CORS fallback
src/world/environment/   sky, moon, aurora, snowfall, terrain, village houses, forest, mountains, lamps, garlands
src/world/landmarks/     Grand Sapin, entrance arch, bar, food stands, workshop, carousel, rink, belvedere, fair booth
src/world/stalls/        chalet builder, decorations catalogue, product displays, stall interactions
src/characters/          character factory (cosy chibi people), procedural animation, player, NPCs & crowd
src/dialogue/            French text normalisation, BM25, intents, responder, vendor conversation script
src/ui/                  title screen, letterbox narration, dialogue box, stall panel, map, HUD, touch controls
src/audio/               music box sequencer + carols, ambience, SFX, voice blips
src/story/               quest (glass stars), intro fly-over, finale, cast conversations
src/minigames/           snowflake catch, snowball toss, crêpe flip, ornament workshop…
src/editor/              stall editor (editor.html): live preview, reorder products/decorations, scan, export JSON
```

**Rule: a module only imports from `src/core/contracts.ts`, `src/config/*`, `src/world/{layout,palette,materials,textures}.ts`
and its own folder.** Cross-module communication goes through `GameContext` (`ctx.ui`, `ctx.audio`,
`ctx.npcs`, …) and the typed event bus `ctx.events`. Exception: the editor and `characters/` builders
may be imported by other modules through their public `index.ts` (e.g. `createCharacter`).

## Boot order (src/core/Game.ts)

`createUI → createAudio → buildEnvironment → buildLandmarks → buildStalls → createPlayer → createNpcs →
registerVendorConversations → createMinigames → createStory`. Each step is wrapped in try/catch with a
fallback, so one broken module never prevents the market from opening.

Then: title screen (`ui.showTitle`) → visitor clicks "Entrer" (unlocks audio) → `story.playIntro()`
(or `story.skipIntro()` for returning visitors / `?skipIntro`) → mode `explore`.

## Modes

`loading → title → cinematic → explore ⇄ dialogue | panel | map | minigame`

- Player movement is applied only in `explore` (and in `minigame` when the mini-game keeps control enabled).
- `ctx.setMode()` is the single source of truth. UI closing a panel/map must call `ctx.setMode('explore')`.
- Conversations: `ctx.conversations.start(id)` → the core switches to `dialogue`, makes the NPC with the same
  id face the player, frames the camera, ducks the music, runs the script, restores everything.
  NPC ids = conversation ids: `vendor:<stallId>`, `cast:<castId>`.

## World conventions

- Units are metres. Ground is flat at y = 0 inside the walkable circle (radius 46).
- **Buildings face the camera.** The default camera looks north from the south (like a diorama), so stall
  slots are chosen to face south-ish: inner ring in the south half (fronts toward the entrance), outer ring
  in the north half (fronts toward the plaza). `CameraRig.assist` then gently turns the view toward the zone
  or chalet being approached (only while walking, never within 6 s of a manual orbit; `?noassist` disables it).
  On portrait screens the camera steps back, widens and looks a little ahead.
- +Z = south (entrance gate), −Z = north (belvedere), +X = east (frozen lake), −X = west (workshop).
- Yaw: `rotation.y = yaw`, local +Z is "forward/front". `yawToward(dx, dz) = atan2(dx, dz)`.
- Characters are ~1.2 m tall (chibi proportions), chalets 3.4 × 2.6 m (`CHALET` in layout.ts).
- Register every solid thing in `ctx.colliders` (circles/boxes on XZ), every light in `ctx.lights`
  (so the intro "light wave" can switch it on), every clickable thing in `ctx.interactables`.
- Performance budget (phones must run it): prefer `InstancedMesh` and merged geometries for repeated
  objects, share materials via `mat()/glow()`, real `PointLight`s ≤ `ctx.quality.maxPointLights` in the
  whole scene (fake the rest with emissive `glow()` materials + additive `glowSprite()`), respect
  `ctx.quality.detail / snowCount / crowdCount`. Target < 250 draw calls, < 400k triangles on `high`.
- Shadows only when `ctx.quality.shadows`. Bloom threshold is ~0.82 (linear): use `glow(color, 2..4)`
  for things that must glow, keep diffuse surfaces below.
- GPU load is fill-rate bound (bloom + colour grade on HalfFloat targets). `RenderPipeline` caps the
  pixel ratio per tier and by a pixel budget (`quality.maxPixels`), keeps MSAA for pixel ratios < 1.4
  only (on Retina it cost ×2.5 GPU time for no visible gain), and `FrameGovernor` lowers the resolution
  when frames stay slow, then climbs back with backoff. A GPU saturated for seconds makes the browser
  drop the WebGL context: the pipeline then shows a notice, three.js rebuilds its state, `render:restored`
  is emitted (redraw anything that lives only on the GPU, e.g. `refreshDuskEnv`) and the session goes
  to a lighter level; in `auto` the next visit starts one tier lower (`save.flags.gpuCeiling`).

## Art direction

Cosy "blue hour" at the end of the day: deep blue sky with a warm amber glow on the western horizon,
the moon rising in the east, a discreet aurora, fine snow falling. Warm lights everywhere (lampions,
garlands, windows), cool blue snow. Low-poly but soft and rounded, honey woods, pine greens, berry reds.
Fairy-tale but believable: no floating castles, no talking animals. People are stylised cosy humans
(big round heads, small bodies, knitted hats and scarves). Colours come from `src/world/palette.ts`.
Fonts: "Fraunces" (titles, signs) and "Nunito" (UI text).

## Testing & visual checks

- `npm run typecheck`, `npm test` (Vitest, `tests/**/*.test.ts`).
- `node scripts/shoot.mjs --prefix mine- --shot "name|<js to run first>|<wait ms>"` boots the game in
  headless Chromium and writes `shots/<prefix><name>.png`; open the PNG to look at it. It prints console
  errors. Debug API in the page: `window.__givrelune` → `travelTo(zone|'stall:<id>')`, `teleport(x,z,yaw)`,
  `camera(px,py,pz,lx,ly,lz)`, `talk(id)`, `openStall(id)`, `startMinigame(id)`, `setMode(m)`, `ctx`, `info()`,
  `render()` (tier, pixel ratio, MSAA, adaptive level, context losses), `simulateContextLoss(ms)`.
- URL flags: `?skipIntro` `?autostart` `?fresh` (reset save) `?mute` `?debug` (fps) `?quality=low|medium|high`
  `?at=<zone>|stall:<id>` `?intro` (force intro) `?draft` (load the stall being edited in the editor)
  `?charlab` (character gallery) `?tod=night` `?noassist` `?fixedres` (no adaptive resolution; `shoot.mjs` adds it).
- Story debug helpers: `__givrelune.ctx.story.scrubIntro(t)`, `scrubFinale(t)`, `collectAll()` (scrub only works
  when the intro is not running — click "Entrer", press Échap, then scrub).
- Mini-game autoplay: `window.__givreluneMg = { autoplay: true, outcome: 'win' | 'lose', speed: 4 }`.
- `npm run e2e` runs the Playwright journey (title, conversation, showcase, map, touch) on desktop and mobile.
