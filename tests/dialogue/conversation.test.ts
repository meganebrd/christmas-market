import { beforeAll, describe, expect, it } from 'vitest';
import type { AskResult, DialogueChoice, GameContext, SpeakerInfo } from '../../src/core/contracts';
import type { ResolvedMarket } from '../../src/config/types';
import { Conversations } from '../../src/core/Conversations';
import { EventBus } from '../../src/core/events';
import { registerVendorConversations } from '../../src/dialogue';
import { loadDemoMarket, stall } from './helpers';

let market: ResolvedMarket;
beforeAll(() => {
  market = loadDemoMarket();
});

type Step = AskResult | null;

function mockCtx(script: Step[], opts: { chooses?: string[]; npcThrows?: boolean; noSave?: boolean } = {}) {
  const log = {
    speaker: null as SpeakerInfo | null,
    said: [] as { text: string; emotion?: string }[],
    cards: [] as { title: string; subtitle?: string; image?: string; url?: string; cta?: string }[],
    asks: [] as { placeholder?: string; suggestions?: string[]; choices?: DialogueChoice[] }[],
    emotes: [] as string[],
    talking: [] as boolean[],
    modes: [] as string[],
    openedStall: null as string | null,
    openedProfile: null as string | null,
    visited: [] as string[],
    closed: 0,
  };
  const steps = [...script];
  const chooses = [...(opts.chooses ?? [])];
  const root = { name: 'vendor-root' };
  const rig = {
    root,
    height: 1.2,
    emote: (k: string) => log.emotes.push(k),
    setTalking: (on: boolean) => log.talking.push(on),
  };
  const events = new EventBus<any>();
  events.on('stall:visited', (p: { stallId: string }) => log.visited.push(p.stallId));
  const save = { data: { visitedStalls: [] as string[] }, update(fn: (d: any) => void) { fn(this.data); } };
  const ctx = {
    config: market,
    events,
    conversations: new Conversations(),
    save: opts.noSave ? undefined : save,
    npcs: {
      get: (id: string) => {
        if (opts.npcThrows) throw new Error('npcs not ready');
        return id.startsWith('vendor:') ? { id, name: 'x', rig, position: { x: 0, y: 0, z: 0 }, hold() {}, release() {} } : undefined;
      },
      all: () => [],
      celebrate() {},
    },
    setMode: (m: string) => log.modes.push(m),
    ui: {
      dialogue: {
        open: (s: SpeakerInfo) => (log.speaker = s),
        say: async (text: string, o?: { emotion?: string }) => {
          log.said.push({ text, emotion: o?.emotion });
        },
        choose: async () => chooses.shift() ?? 'stay',
        ask: async (o: { placeholder?: string; suggestions?: string[]; choices?: DialogueChoice[] }) => {
          log.asks.push(o);
          const next = steps.shift();
          return next === undefined ? { type: 'choice', id: 'bye' } : next;
        },
        card: (c: any) => log.cards.push(c),
        close: () => log.closed++,
        isOpen: () => true,
      },
      openStall: (s: { id: string }) => (log.openedStall = s.id),
      openProfile: (s: { id: string }) => (log.openedProfile = s.id),
    },
  } as unknown as GameContext;
  (ctx.conversations as Conversations).runner = (_id, s) => s(ctx);
  registerVendorConversations(ctx);
  return { ctx, log };
}

const text = (value: string): AskResult => ({ type: 'text', value });
const choice = (id: string): AskResult => ({ type: 'choice', id });

describe('vendor conversation', () => {
  it('registers one conversation per stall', () => {
    const { ctx } = mockCtx([]);
    for (const s of market.stalls) expect(ctx.conversations.has(`vendor:${s.id}`)).toBe(true);
  });

  it('greets, answers questions with cards, shows the site, then opens the stall', async () => {
    const { ctx, log } = mockCtx([text('Tu livres ?'), text("c'est combien la bougie pain d'épices ?"), choice('site'), choice('creations')]);
    await ctx.conversations.start('vendor:la-meche-doree');
    const s = stall(market, 'la-meche-doree');
    expect(log.speaker).toMatchObject({ id: 'la-meche-doree', name: 'Margot Lenoir', title: 'Ciergière', color: s.chalet.accent, voicePitch: 1.1 });
    expect(log.speaker?.anchor).toEqual({ name: 'vendor-root' });
    expect(s.owner.greetings).toContain(log.said[0].text);
    expect(log.visited).toEqual(['la-meche-doree']);
    expect(log.asks[0].placeholder).toBe('Pose-lui une question…');
    expect(log.asks[0].choices?.map((c) => c.id)).toEqual(['creations', 'who', 'site', 'bye']);
    expect(log.asks[0].suggestions?.length).toBeGreaterThanOrEqual(3);
    expect(log.said.some((l) => /Colissimo/.test(l.text))).toBe(true);
    const product = log.cards.find((c) => /Pain d'épices/.test(c.title));
    expect(product?.image).toBe('/demo/products/candle-gingerbread.svg');
    expect(product?.subtitle).toMatch(/19\s€/);
    expect(log.cards.some((c) => c.url === s.website)).toBe(true);
    expect(log.openedStall).toBe('la-meche-doree');
    expect(log.modes).toContain('panel');
    expect(log.emotes).toContain('happy');
    expect(log.talking).toContain(true);
    expect(log.talking[log.talking.length - 1]).toBe(false);
  });

  it('"Qui es-tu ?" introduces and can open the profile', async () => {
    const { ctx, log } = mockCtx([choice('who')], { chooses: ['profile'] });
    await ctx.conversations.start('vendor:le-rucher-des-cimes');
    expect(log.said.some((l) => /^Moi, c’est Élias/.test(l.text))).toBe(true);
    expect(log.openedProfile).toBe('le-rucher-des-cimes');
  });

  it('"Au revoir" (choice or free text) ends with a farewell', async () => {
    const s = stall(market, 'les-mailles-de-suzon');
    const a = mockCtx([choice('bye')]);
    await a.ctx.conversations.start('vendor:les-mailles-de-suzon');
    expect(s.owner.farewells).toContain(a.log.said[a.log.said.length - 1].text);
    expect(a.log.asks.length).toBe(1);

    const b = mockCtx([text('merci, au revoir !'), text('ne doit pas être lu')]);
    await b.ctx.conversations.start('vendor:les-mailles-de-suzon');
    expect(b.log.asks.length).toBe(1);
    expect(b.log.said[b.log.said.length - 1].text).toMatch(/Avec plaisir/);
  });

  it('never loops forever on empty input (stub UI)', async () => {
    const { ctx, log } = mockCtx([text(''), text(''), text(''), text('')]);
    await ctx.conversations.start('vendor:la-meche-doree');
    expect(log.asks.length).toBe(2);
  });

  it('says something warm after six questions', async () => {
    const qs = ['Tu livres ?', 'c’est combien ?', 'c’est fait avec quoi ?', 'tu ouvres quand ?', 'qui es-tu ?', 'comment bien utiliser une bougie'];
    const { ctx, log } = mockCtx([...qs.map(text), choice('bye')]);
    await ctx.conversations.start('vendor:la-meche-doree');
    const warmIdx = log.said.findIndex((l) => /plaisir|touche|curiosité/.test(l.text) && !/Colissimo/.test(l.text) && log.said.indexOf(l) > 6);
    expect(warmIdx).toBeGreaterThan(0);
    expect(log.emotes).toContain('love');
  });

  it('knows the whole market: refers to another stall and to the fun zones', async () => {
    const { ctx, log } = mockCtx([text('Combien coûte le petit train ?'), text('Où je trouve du vin chaud ?'), choice('bye')]);
    await ctx.conversations.start('vendor:la-meche-doree');
    expect(log.said.some((l) => /Gaspard/.test(l.text) && /L'Établi de Gaspard/.test(l.text))).toBe(true);
    expect(log.cards.some((c) => c.title === 'Petit train des Cimes')).toBe(true);
    expect(log.said.some((l) => /au Chaudron Doré/.test(l.text))).toBe(true);
  });

  it('is defensive when other modules are missing', async () => {
    const { ctx, log } = mockCtx([text('Tu livres ?'), choice('bye')], { npcThrows: true, noSave: true });
    await ctx.conversations.start('vendor:terre-et-givre');
    expect(log.speaker?.anchor).toBeUndefined();
    expect(log.said.length).toBeGreaterThanOrEqual(3);
  });
});
