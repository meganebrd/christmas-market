import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveMarket } from '../../src/config/resolve';
import { candidateSlots, createLayout, CHALET, insideShape, polar, STALL_R, WALK_R } from '../../src/world/layout';
import type { MarketFile, StallConfig } from '../../src/config/types';

const root = resolve(__dirname, '../..');
const market = JSON.parse(readFileSync(resolve(root, 'content/market.json'), 'utf8')) as MarketFile;
const stalls = readdirSync(resolve(root, 'content/stalls'))
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .map((f) => JSON.parse(readFileSync(resolve(root, 'content/stalls', f), 'utf8')) as StallConfig);

describe('content', () => {
  it('every stall file has an id, a name and an owner', () => {
    for (const s of stalls) {
      expect(s.id).toMatch(/^[a-z0-9-]+$/);
      expect(s.name.length).toBeGreaterThan(1);
      expect(s.owner?.name).toBeTruthy();
    }
  });
  it('stall ids are unique', () => {
    const ids = stalls.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('resolveMarket', () => {
  const m = resolveMarket(market, stalls);
  it('applies defaults and sorts stalls by order', () => {
    expect(m.meta.locale).toBe('fr');
    expect(m.stalls.length).toBe(stalls.length);
    const orders = m.stalls.map((s) => s.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });
  it('resolves products with formatted prices', () => {
    const meche = m.stalls.find((s) => s.id === 'la-meche-doree')!;
    expect(meche.products.length).toBeGreaterThan(0);
    expect(meche.products[0].priceLabel).toMatch(/€/);
    const fondants = meche.products.find((p) => p.id === 'fondants')!;
    expect(fondants.price).toBe(12.5);
  });
  it('builds knowledge chunks from description, faq, facts and products', () => {
    for (const s of m.stalls) expect(s.chunks.length).toBeGreaterThan(3);
  });
  it('gives every cast member a zone and a full appearance', () => {
    for (const c of m.cast) {
      expect(c.zone).toBeTruthy();
      expect(c.appearance.skin).toMatch(/^#/);
    }
  });
});

describe('layout', () => {
  const m = resolveMarket(market, stalls);
  const layout = createLayout(m);

  it('assigns a slot to every stall, nearest to the entrance first, facing the default camera', () => {
    expect(layout.stalls.length).toBe(m.stalls.length);
    const first = layout.stalls[0];
    expect(Math.abs(first.angle)).toBeLessThan(0.5);
    // the default camera looks north from the south: fronts should face south-ish (+z)
    for (const s of layout.stalls.slice(0, 16)) expect(s.front.z).toBeGreaterThan(0.35);
  });

  it('keeps the plaza connectors clear of inner chalets', () => {
    for (const s of candidateSlots().filter((x) => x.ring === 'inner')) {
      // distance from the chalet centre to the nearest cardinal axis must leave room for the 3.6 m path
      const d = Math.min(Math.abs(s.position.x), Math.abs(s.position.z));
      expect(d).toBeGreaterThan(CHALET.width / 2 + 1.8 + 0.4);
    }
  });

  it('chalets do not overlap each other', () => {
    const all = candidateSlots();
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i].position;
        const b = all[j].position;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(CHALET.width - 0.01);
      }
  });

  it('chalets face the alley and customers stand on the path', () => {
    for (const s of layout.stalls) {
      expect(layout.surfaceAt(s.customerPoint.x, s.customerPoint.z)).toBe('stone');
      const towardCenter = -(s.front.x * s.position.x + s.front.z * s.position.z);
      if (s.ring === 'outer') expect(towardCenter).toBeGreaterThan(0);
      else expect(towardCenter).toBeLessThan(0);
    }
  });

  it('keeps avenue openings free of chalets', () => {
    for (const s of candidateSlots()) {
      const deg = ((s.angle * 180) / Math.PI + 360) % 45;
      if (s.ring === 'outer') expect(Math.min(deg, 45 - deg)).toBeGreaterThan(8);
    }
  });

  it('has every zone inside the world and reachable by an avenue', () => {
    for (const z of Object.values(layout.zones)) {
      expect(Math.hypot(z.center.x, z.center.z)).toBeLessThan(WALK_R);
      if (z.id !== 'plaza') {
        const onPath = layout.paths.some((p) => insideShape(p, z.entrance.x, z.entrance.z));
        expect(onPath, z.id).toBe(true);
      }
    }
  });

  it('spawns the visitor south of the arch, facing north', () => {
    expect(layout.spawn.position.z).toBeGreaterThan(layout.zones.gate.center.z);
    expect(Math.cos(layout.spawn.yaw)).toBeLessThan(-0.99);
  });

  it('detects zones and surfaces', () => {
    expect(layout.zoneAt(0, 0)).toBe('plaza');
    const bar = layout.zones.bar.center;
    expect(layout.zoneAt(bar.x, bar.z)).toBe('bar');
    const alley = polar(0.4, (layout.alley.r0 + layout.alley.r1) / 2);
    expect(layout.zoneAt(alley.x, alley.z)).toBe('alley');
    const rink = layout.zones.rink.center;
    expect(layout.surfaceAt(rink.x, rink.z)).toBe('ice');
    expect(layout.surfaceAt(5, 13)).toBe('snow');
  });

  it('walk graph edges connect valid nodes', () => {
    const { nodes, edges } = layout.walkGraph;
    for (const [a, b] of edges) {
      expect(nodes[a]).toBeDefined();
      expect(nodes[b]).toBeDefined();
    }
    for (const n of nodes) expect(Math.hypot(n.x, n.z)).toBeLessThan(STALL_R + 15);
  });
});
