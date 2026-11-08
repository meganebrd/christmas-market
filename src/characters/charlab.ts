import * as THREE from 'three';
import type { GameContext } from '../core/contracts';
import type { Accessory, CharacterAppearance, HairStyle, HatStyle, OutfitStyle } from '../config/types';
import { resolveAppearance } from '../config/resolve';
import { CosyRig } from './rig';
import type { AnyAnim } from './anims';

/**
 * ?charlab — a debug gallery next to the spawn: every hair style, hat, outfit, accessory and animation
 * in neat rows, to review the designs. Never built without the flag.
 */
const HAIRS: HairStyle[] = ['short', 'long', 'bun', 'braids', 'curly', 'ponytail', 'bald', 'bob'];
const HATS: HatStyle[] = ['none', 'beanie', 'bobble', 'beret', 'tophat', 'chef', 'earmuffs', 'hood', 'cap'];
const OUTFITS: OutfitStyle[] = ['coat', 'sweater', 'apron', 'cape', 'vest'];
const ACCS: Accessory[] = ['none', 'glasses', 'round-glasses', 'apron', 'mittens', 'bag', 'pipe', 'flower'];
const ANIMS: AnyAnim[] = ['idle', 'walk', 'run', 'talk', 'wave', 'cheer', 'cook', 'craft', 'drink', 'skate', 'sit', 'throw', 'clap', 'think', 'stir', 'blow', 'accordion', 'lantern', 'spyglass', 'shake', 'invite'];

export function buildCharlab(ctx: GameContext, register: (rig: CosyRig) => void) {
  const spawn = ctx.layout.spawn.position;
  const rows: { items: Partial<CharacterAppearance>[]; label: string; anims?: AnyAnim[] }[] = [
    { label: 'hair', items: HAIRS.map((hairStyle, i) => ({ hairStyle, hat: 'none', scarf: i % 2 ? '#e8c547' : null, beard: hairStyle === 'bald' ? '#d9d4cc' : null })) },
    { label: 'hats', items: HATS.map((hat) => ({ hat, hairStyle: 'short' })) },
    { label: 'outfits', items: OUTFITS.map((outfit, i) => ({ outfit, outfitColor: ['#3c5a8a', '#b8413a', '#2f5d50', '#6c4a7d', '#c98a2e'][i], outfitColor2: ['#3b3340', '#f3ead8', '#f3ead8', '#3a2c3f', '#2b2b3a'][i], hat: 'none' })) },
    { label: 'accessories', items: ACCS.map((accessory, i) => ({ accessory, hat: i % 2 ? 'beanie' : 'none', beard: accessory === 'pipe' ? '#5a3825' : null })) },
    { label: 'anims', items: ANIMS.map(() => ({})), anims: ANIMS },
  ];
  const group = new THREE.Group();
  group.name = 'charlab';
  ctx.scene.add(group);
  rows.forEach((row, ri) => {
    const rowGroup = new THREE.Group();
    rowGroup.name = 'charlab:' + row.label;
    group.add(rowGroup);
    const z = spawn.z - 3 - ri * 2.2;
    const n = row.items.length;
    const gap = row.anims ? 1.25 : 1.15;
    row.items.forEach((it, i) => {
      const a = resolveAppearance(it, `lab-${row.label}-${i}`);
      const rig = new CosyRig(a, 1);
      rig.root.position.set((i - (n - 1) / 2) * gap, 0, z);
      rig.root.rotation.y = 0;
      rig.autoFidget = false;
      rig.lookAround = false;
      if (row.anims) rig.play(row.anims[i], { loop: true });
      rowGroup.add(rig.root);
      register(rig);
    });
  });
  // debug helper: show only one row → __givrelune.charlab('hats')
  (window as any).__givrelune_charlab = (label?: string) => {
    for (const g of group.children) g.visible = !label || g.name === 'charlab:' + label;
  };
  return group;
}
