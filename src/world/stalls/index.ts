import * as THREE from 'three';
import type { GameContext, MarketApi, StallHandle } from '../../core/contracts';
import type { DecoSlot, ResolvedProduct, ResolvedStall } from '../../config/types';
import { CHALET } from '../layout';
import { textTexture } from '../textures';
import { buildStructure, type Variant } from './chalet';
import { assignSlots, placeDecoration } from './decorations';
import { buildGarland, bulbGeometry } from './garland';
import { Atlas, stallFontsReady } from './atlas';
import { buildDisplays, hitBox, layoutProducts, loadProductImage } from './products';
import { Kit, bakeLighting, hashStr, haloGeometry, merge, mulberry32, pickOf, tint } from './kit';
import { bulbMaterial, glowChannelMaterial, haloMaterial, LIGHT_CHANNELS, litMaterial, STALL_TIME } from './shaders';
import { D, insideCabin } from './dims';

/**
 * Givrelune's chalets. `buildChalet` builds one cabin from its config (ctx-free: also used by the stall
 * editor's live preview); `buildStalls` places them in the market, registers colliders, lights (intro
 * light wave), clickable products and signs, and drives the proximity highlight.
 *
 * Per chalet: ~7 draw calls (merged lit structure, product displays, emissive parts, halos, instanced
 * bulbs, sign, picture atlas), no real lights — the warm light is baked in vertex attributes.
 */

export interface ChaletLight {
  /** Chalet-local position. */
  position: THREE.Vector3;
  set(k: number): void;
  /** Suggested offset (s) for the light wave so a chalet lights up in sequence. */
  delay?: number;
}

export interface ChaletBuild {
  group: THREE.Group;
  lights: ChaletLight[];
  productObjects: { product: ResolvedProduct; object: THREE.Object3D }[];
  signObject: THREE.Object3D;
  update(dt: number, t: number): void;
  dispose(): void;
  /** Subtle glow pulse on the sign and garland. */
  setHighlight(on: boolean): void;
  /** Hide the fine details (interior, counter items, trims, pictures) — for far chalets. */
  setLod(far: boolean): void;
  /** Small round colliders (local) for big ground decorations. */
  colliders: { x: number; z: number; r: number }[];
  /** Resolves when the sign and product pictures are painted. */
  ready: Promise<void>;
}

export function buildChalet(stall: ResolvedStall, opts: { detail?: number; shadows?: boolean } = {}): ChaletBuild {
  const detail = Math.max(0.3, Math.min(1, opts.detail ?? 1));
  const seed = hashStr(stall.id || stall.name);
  const rand = mulberry32(seed);
  const ch = stall.chalet;
  const variant: Variant = {
    doorSide: rand() < 0.5 ? 1 : -1,
    trim: pickOf(['scallop', 'teeth', 'beads'] as const, rand()),
    ornament: pickOf(['heart', 'star', 'round'] as const, rand()),
    lower: rand() < 0.55 ? 'heart' : 'cross',
  };
  const kit = new Kit(detail, rand);
  const group = new THREE.Group();
  group.name = `chalet:${stall.id}`;

  // ── light channels ──
  const base = new Float32Array(LIGHT_CHANNELS).fill(1);
  const levels = new Float32Array(LIGHT_CHANNELS).fill(1);
  const flicker = new Float32Array(LIGHT_CHANNELS);
  const lights: ChaletLight[] = [];
  let nextChan = 2;
  const mats = {
    lit: litMaterial(levels),
    glow: glowChannelMaterial(levels, 0.12),
    halo: haloMaterial(levels),
  };

  // ── decorations: slots ──
  const decos = (stall.decorations ?? []).slice(0, 13);
  const assigned = assignSlots(decos);
  const used = new Set<DecoSlot>(assigned.map((a) => a.slot));
  if (!decos.some((d) => d.type === 'lantern')) {
    const first: DecoSlot = rand() < 0.5 ? 'front-left' : 'front-right';
    const order: DecoSlot[] = [first, first === 'front-left' ? 'front-right' : 'front-left', 'side-left', 'side-right'];
    const slot = order.find((s) => !used.has(s));
    if (slot) {
      assigned.push({ item: { type: 'lantern' }, slot });
      used.add(slot);
    }
  }

  // ── structure ──
  const info = buildStructure(kit, stall, variant, used);

  // ── decorations ──
  const atlas = new Atlas(tint(ch.wood, 1.45).getStyle(), detail >= 0.75 ? 512 : 256);
  const env = {
    k: kit,
    accent: ch.accent,
    wood: ch.wood,
    awning: ch.awning,
    awningColors: ch.awningColors,
    snow: ch.snow,
    signW: info.signW,
    lightChan(x: number, y: number, z: number, fl = 0.06): number {
      if (nextChan >= LIGHT_CHANNELS) return 2 + (nextChan++ % (LIGHT_CHANNELS - 2)); // shared channel
      const c = nextChan++;
      flicker[c] = fl;
      lights.push({ position: kit.point(x, y, z), set: (v: number) => setChan(c, v), delay: 0.08 + (c - 2) * 0.07 });
      return c;
    },
    text: (t: string, style: 'chalk' | 'plank') => atlas.allocText(t, style),
  };
  for (const { item, slot } of assigned) {
    try {
      placeDecoration(env, item, slot);
    } catch (err) {
      console.warn(`[givrelune] decoration ${item.type} @ ${slot} failed`, err);
    }
  }

  // ── garland ──
  const bulbs = buildGarland(kit, ch.garland, { apexBow: used.has('roof-ridge') ? null : ch.accent });

  // ── merge ──
  const bakeLights = kit.lights.slice();
  const solidGeo = merge(kit.solids)!;
  bakeLighting(solidGeo, bakeLights, insideCabin);
  const main = new THREE.Mesh(solidGeo, mats.lit);
  main.name = 'chalet-structure';
  main.castShadow = main.receiveShadow = !!opts.shadows;
  group.add(main);

  const detailGeo = merge(kit.details);
  let detailMesh: THREE.Mesh | null = null;
  if (detailGeo) {
    bakeLighting(detailGeo, bakeLights, insideCabin);
    detailMesh = new THREE.Mesh(detailGeo, mats.lit);
    detailMesh.name = 'chalet-details';
    detailMesh.castShadow = false;
    detailMesh.receiveShadow = !!opts.shadows;
    group.add(detailMesh);
  }

  const glowGeo = merge(kit.glows);
  let glowMesh: THREE.Mesh | null = null;
  if (glowGeo) {
    glowMesh = new THREE.Mesh(glowGeo, mats.glow);
    glowMesh.name = 'chalet-glow';
    group.add(glowMesh);
  }

  const haloGeo = haloGeometry(kit.halos);
  let haloMesh: THREE.Mesh | null = null;
  if (haloGeo) {
    haloMesh = new THREE.Mesh(haloGeo, mats.halo);
    haloMesh.name = 'chalet-halos';
    haloMesh.renderOrder = 3;
    group.add(haloMesh);
  }

  let bulbMesh: THREE.InstancedMesh | null = null;
  let bulbMat: THREE.MeshBasicMaterial | null = null;
  if (bulbs && bulbs.matrices.length) {
    bulbMat = bulbMaterial(bulbs.twinkle);
    bulbMesh = new THREE.InstancedMesh(bulbGeometry(), bulbMat, bulbs.matrices.length);
    bulbs.matrices.forEach((m, i) => {
      bulbMesh!.setMatrixAt(i, m);
      bulbMesh!.setColorAt(i, bulbs.colors[i]);
    });
    bulbMesh.instanceMatrix.needsUpdate = true;
    if (bulbMesh.instanceColor) bulbMesh.instanceColor.needsUpdate = true;
    bulbMesh.computeBoundingSphere();
    bulbMesh.name = 'chalet-bulbs';
    group.add(bulbMesh);
  }

  // ── atlas mesh (chalk texts now, product pictures later) ──
  const atlasMat = new THREE.MeshLambertMaterial({
    map: atlas.texture,
    emissive: new THREE.Color('#fff4e2'),
    emissiveMap: atlas.texture,
    emissiveIntensity: 0.4,
    alphaTest: 0.5,
  });
  const staticQuads = merge(kit.quads);
  const atlasMesh = new THREE.Mesh(staticQuads ?? new THREE.BufferGeometry(), atlasMat);
  atlasMesh.name = 'chalet-pictures';
  atlasMesh.receiveShadow = !!opts.shadows;
  group.add(atlasMesh);

  // ── sign ──
  const signText = ch.sign || stall.name;
  const placeholder = solidTexture(ch.signColor);
  const signMat = new THREE.MeshLambertMaterial({ map: placeholder, emissive: new THREE.Color('#ffffff'), emissiveMap: placeholder, emissiveIntensity: 0.4, alphaTest: 0.5 });
  const signGeo = new THREE.PlaneGeometry(info.signW, info.signH);
  const sign = new THREE.Mesh(signGeo, signMat);
  sign.position.copy(info.signPos);
  sign.name = 'chalet-sign';
  group.add(sign);
  let signTex: THREE.Texture = placeholder;

  // ── channel 0 (interior) & 1 (garland) handles ──
  flicker[0] = 0.015;
  lights.unshift(
    { position: new THREE.Vector3(0, 1.6, 0.4), set: (v) => setChan(0, v), delay: 0 },
    ...(bulbs ? [{ position: new THREE.Vector3(0, D.ridge, D.rf), set: (v: number) => setChan(1, v), delay: 0.3 }] : []),
  );
  if (!bulbs) {
    // the tree lights / reindeer nose that use channel 1 follow the interior
    lights[0] = { ...lights[0], set: (v) => (setChan(0, v), setChan(1, v)) };
  }

  let hlTarget = 0;
  let hl = 0;
  let isFar = false;
  function setChan(c: number, v: number) {
    base[c] = v;
    levels[c] = v;
    if (c === 1 && bulbMat) bulbMat.color.setScalar(0.06 + 0.94 * v);
    if (c === 0) {
      atlasMat.emissiveIntensity = 0.1 + 0.32 * v;
      signMat.emissiveIntensity = 0.18 + 0.24 * v;
    }
  }

  // ── products ──
  const placed = layoutProducts(stall.products ?? []);
  const productObjects = placed.map(({ product, spot }) => {
    const o = hitBox(spot);
    group.add(o);
    return { product, object: o as THREE.Object3D };
  });
  let productMesh: THREE.Mesh | null = null;
  let disposed = false;

  const productsReady = Promise.all(placed.map((p) => loadProductImage(p.product.image))).then(async (images) => {
    await stallFontsReady();
    if (disposed) return;
    const pk = new Kit(detail, mulberry32(seed ^ 0x9e3779b9));
    buildDisplays(pk, placed, { stall, atlas, images });
    const g = merge(pk.solids);
    if (g) {
      bakeLighting(g, bakeLights, insideCabin);
      productMesh = new THREE.Mesh(g, mats.lit);
      productMesh.name = 'chalet-products';
      productMesh.castShadow = false;
      productMesh.receiveShadow = !!opts.shadows;
      productMesh.visible = !isFar;
      group.add(productMesh);
    }
    const q = merge(pk.quads);
    if (q) {
      const parts = [q];
      if (staticQuads) parts.unshift(staticQuads.clone());
      const all = merge(parts);
      if (all) {
        atlasMesh.geometry.dispose();
        atlasMesh.geometry = all;
      }
    }
  });

  const textsReady = stallFontsReady().then(() => {
    if (disposed) return;
    atlas.paintTexts();
    const H = 160;
    const W = Math.round((H * info.signW) / info.signH);
    const tex = textTexture(signText, {
      width: W,
      height: H,
      background: ch.signColor,
      color: ch.signTextColor,
      plank: true,
      border: tint(ch.signColor, 0.55).getStyle(),
      size: Math.round(H * 0.5),
      padding: Math.round(H * 0.32),
      weight: 800,
    });
    ornamentSign(tex.image as HTMLCanvasElement, ch.signTextColor);
    tex.needsUpdate = true;
    signMat.map = tex;
    signMat.emissiveMap = tex;
    signTex = tex;
    placeholder.dispose();
  });

  const ready = Promise.all([productsReady, textsReady]).then(() => undefined).catch((err) => console.warn('[givrelune] chalet pictures', err));

  // ── colliders for big ground decorations ──
  const colliders: { x: number; z: number; r: number }[] = [];
  const bigTypes = new Set(['snowman', 'mini-tree', 'nutcracker', 'gift-pile', 'sled', 'crate-apples', 'chalkboard', 'reindeer', 'pot-plant', 'lantern', 'candles', 'holly', 'pinecones', 'teddy']);
  for (const { item, slot } of assigned) {
    if (!bigTypes.has(item.type)) continue;
    if (slot === 'ground-left' || slot === 'ground-right') colliders.push({ x: slot === 'ground-left' ? -1.64 : 1.64, z: 1.7, r: 0.3 });
  }

  const update = (dt: number, t: number) => {
    STALL_TIME.value = t;
    for (let c = 0; c < LIGHT_CHANNELS; c++) {
      const f = flicker[c];
      if (!f) continue;
      const n = 0.5 * Math.sin(t * 9.1 + c * 1.7) + 0.3 * Math.sin(t * 15.3 + c * 3.1) + 0.2 * Math.sin(t * 23.7 + c * 0.9);
      levels[c] = base[c] * (1 + f * n);
    }
    if (hl !== hlTarget || hl > 0) {
      hl += (hlTarget - hl) * Math.min(1, dt * 4);
      if (Math.abs(hl - hlTarget) < 0.002) hl = hlTarget;
      const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
      signMat.emissiveIntensity = 0.18 + 0.24 * base[0] + hl * (0.22 + 0.22 * pulse);
      if (bulbMat) bulbMat.color.setScalar((0.06 + 0.94 * base[1]) * (1 + hl * (0.25 + 0.3 * pulse)));
    }
  };

  return {
    group,
    lights,
    productObjects,
    signObject: sign,
    colliders,
    ready,
    update,
    setHighlight(on: boolean) {
      hlTarget = on ? 1 : 0;
    },
    setLod(far: boolean) {
      if (far === isFar) return;
      isFar = far;
      if (detailMesh) detailMesh.visible = !far;
      if (productMesh) productMesh.visible = !far;
      atlasMesh.visible = !far;
    },
    dispose() {
      disposed = true;
      group.removeFromParent();
      solidGeo.dispose();
      glowGeo?.dispose();
      detailGeo?.dispose();
      haloGeo?.dispose();
      staticQuads?.dispose();
      atlasMesh.geometry.dispose();
      (productMesh as THREE.Mesh | null)?.geometry.dispose();
      signGeo.dispose();
      bulbMesh?.dispose();
      for (const m of [mats.lit, mats.glow, mats.halo, atlasMat, signMat, bulbMat]) m?.dispose();
      signTex.dispose();
      placeholder.dispose();
      atlas.dispose();
    },
  };
}

function solidTexture(color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 4;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, 4, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Two little sparkles in the margins of the sign. */
function ornamentSign(canvas: HTMLCanvasElement, color: string) {
  const g = canvas.getContext('2d');
  if (!g) return;
  const W = canvas.width;
  const H = canvas.height;
  const r = H * 0.085;
  g.save();
  g.fillStyle = color;
  g.globalAlpha = 0.85;
  for (const x of [H * 0.17, W - H * 0.17]) {
    const y = H / 2;
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const rr = i % 2 === 0 ? r : r * 0.32;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  }
  g.restore();
}

// ───────────────────────────── market ─────────────────────────────

interface Entry {
  handle: StallHandle;
  slot: GameContext['layout']['stalls'][number];
  chalet: ChaletBuild | null;
  offs: (() => void)[];
}

export function buildStalls(ctx: GameContext): MarketApi {
  const stalls: MarketApi['stalls'] = new Map();
  const entries = new Map<string, Entry>();
  const detail = ctx.quality.detail;
  const shadows = ctx.quality.shadows;
  const armable = new Set<string>();
  let armed: string | null = null;
  let armedAt = 0;

  const place = (entry: Entry) => {
    const { slot, handle } = entry;
    const stall = handle.stall;
    let chalet: ChaletBuild;
    try {
      chalet = buildChalet(stall, { detail, shadows });
    } catch (err) {
      console.error(`[givrelune] chalet "${stall.id}" failed`, err);
      entry.chalet = null;
      const cid = ctx.colliders.addBox(slot.position.x, slot.position.z, CHALET.width / 2 + 0.1, CHALET.depth / 2 + 0.1, slot.rotationY, 'chalet');
      entry.offs.push(() => ctx.colliders.remove(cid));
      return;
    }
    entry.chalet = chalet;
    const g = chalet.group;
    g.position.set(slot.position.x, 0, slot.position.z);
    g.rotation.y = slot.rotationY;
    ctx.scene.add(g);
    g.updateMatrixWorld(true);
    handle.group = g;

    const cid = ctx.colliders.addBox(slot.position.x, slot.position.z, CHALET.width / 2 + 0.1, CHALET.depth / 2 + 0.1, slot.rotationY, 'chalet');
    entry.offs.push(() => ctx.colliders.remove(cid));
    for (const c of chalet.colliders) {
      const w = g.localToWorld(new THREE.Vector3(c.x, 0, c.z));
      const id = ctx.colliders.addCircle(w.x, w.z, c.r, 'prop');
      entry.offs.push(() => ctx.colliders.remove(id));
    }

    for (const l of chalet.lights) {
      const wp = g.localToWorld(l.position.clone());
      entry.offs.push(ctx.lights.register({ position: wp, set: l.set, group: 'stall', delay: l.delay }));
    }

    // clickable sign → stall panel
    const signId = `sign:${stall.id}`;
    const signPos = chalet.signObject.getWorldPosition(new THREE.Vector3());
    // reach radius while a click is pending: enough to trigger from in front of the counter
    const reach = (p: THREE.Vector3) => p.distanceTo(new THREE.Vector3(slot.customerPoint.x, 0, slot.customerPoint.z)) + 1.0;
    const signReach = reach(signPos);
    entry.offs.push(
      ctx.interactables.add({
        id: signId,
        position: signPos,
        get radius() {
          return armed === signId ? signReach : 0;
        },
        label: stall.name,
        promptHeight: 0.5,
        objects: [chalet.signObject],
        onInteract: () => {
          armed = null;
          ctx.setMode('panel');
          ctx.ui.openStall(handle.stall);
        },
      }),
    );
    armable.add(signId);
    entry.offs.push(() => armable.delete(signId));

    // clickable products → product panel
    for (const { product, object } of chalet.productObjects) {
      const id = `product:${stall.id}:${product.id}`;
      const pos = object.getWorldPosition(new THREE.Vector3());
      const r = reach(pos);
      entry.offs.push(
        ctx.interactables.add({
          id,
          position: pos,
          get radius() {
            return armed === id ? r : 0;
          },
          label: product.name,
          promptHeight: 0.6,
          objects: [object],
          onInteract: () => {
            armed = null;
            ctx.setMode('panel');
            ctx.ui.openProduct(handle.stall, product);
          },
        }),
      );
      armable.add(id);
      entry.offs.push(() => armable.delete(id));
    }
  };

  for (const slot of ctx.layout.stalls) {
    const stall = ctx.config.stalls.find((s) => s.id === slot.stallId);
    if (!stall) continue;
    let highlighted = false;
    const handle: StallHandle = {
      stallId: stall.id,
      stall,
      group: new THREE.Group(),
      keeperPoint: new THREE.Vector3(slot.keeperPoint.x, D.ph + 0.02, slot.keeperPoint.z),
      customerPoint: new THREE.Vector3(slot.customerPoint.x, 0, slot.customerPoint.z),
      setHighlight(on: boolean) {
        if (on === highlighted) return;
        highlighted = on;
        entries.get(stall.id)?.chalet?.setHighlight(on);
      },
    };
    const entry: Entry = { handle, slot, chalet: null, offs: [] };
    entries.set(stall.id, entry);
    stalls.set(stall.id, handle);
    place(entry);
  }

  // per-frame: flicker, twinkle, proximity highlight, click arming
  let hlTimer = 0;
  const LOD_FAR = detail >= 0.9 ? 32 : detail >= 0.7 ? 27 : 22;
  ctx.addSystem((dt, t) => {
    for (const e of entries.values()) e.chalet?.update(dt, t);
    hlTimer -= dt;
    if (hlTimer <= 0) {
      hlTimer = 0.15;
      const cam = ctx.camera.position;
      for (const e of entries.values()) {
        if (!e.chalet) continue;
        const gp = e.chalet.group.position;
        e.chalet.setLod(Math.hypot(cam.x - gp.x, cam.z - gp.z) > LOD_FAR);
      }
      const p = ctx.player?.position;
      for (const e of entries.values()) {
        const near = !!p && ctx.mode !== 'cinematic' && ctx.mode !== 'title' && Math.hypot(p.x - e.handle.customerPoint.x, p.z - e.handle.customerPoint.z) < 4;
        e.handle.setHighlight(near);
      }
    }
    // Click-only interactables (radius 0): when the visitor clicks one, give it a reach radius until
    // they arrive, so the core's "walk there, then interact" flow can complete.
    const ptr = ctx.input?.pointer;
    if (ctx.mode === 'explore' && ptr?.clicked) {
      const it = ctx.interactables.pick(ptr.x, ptr.y, ctx.camera);
      armed = it && armable.has(it.id) ? it.id : null;
      armedAt = t;
    }
    if (armed && (t - armedAt > 8 || ctx.mode !== 'explore')) armed = null;
  });

  return {
    stalls,
    rebuild(stall: ResolvedStall) {
      const entry = entries.get(stall.id);
      if (!entry) {
        console.warn(`[givrelune] rebuild: no slot for stall "${stall.id}"`);
        return;
      }
      for (const off of entry.offs.splice(0)) off();
      entry.chalet?.dispose();
      entry.chalet = null;
      entry.handle.stall = stall;
      place(entry);
    },
  };
}


/** Re-exported for the stall editor (spot map, shelf preview). */
export { assignSlots, DECORATIONS } from './decorations';
export { layoutProducts } from './products';
