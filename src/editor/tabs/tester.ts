import { createResponder, linkCard, productCard, type Answer, type Responder } from '../../dialogue';
import { firstName, h, initials, linkProps, readableOn, safeColor, safeImage, safeUrl } from '../../ui/dom';
import { MOODS } from '../catalog';
import { button } from '../fields';
import { icon } from '../icons';
import { insertItem } from '../sortable';
import type { App } from '../types';
import { thumb } from './products';

/** Test the conversation with your character: same engine as in the market (no AI). */

interface Msg {
  from: 'npc' | 'me';
  text: string;
  answer?: Answer;
  question?: string;
}

let responder: Responder | null = null;
let builtFor = -1;
let builtStall = '';
const log: Msg[] = [];
let typing: { msg: Msg; shown: number; timer: number } | null = null;

function getResponder(app: App): Responder {
  if (!responder || builtFor !== app.version) {
    responder = createResponder(app.resolved(), { town: app.town });
    builtFor = app.version;
  }
  return responder;
}

export function resetTester() {
  log.length = 0;
  responder = null;
  builtFor = -1;
  if (typing) clearInterval(typing.timer);
  typing = null;
}

export function testerTab(app: App): HTMLElement {
  const stall = app.resolved();
  if (builtStall !== stall.id) {
    resetTester();
    builtStall = stall.id;
  }
  const r = getResponder(app);
  const owner = stall.owner;
  const mood = MOODS.find((m) => m.value === owner.mood);

  const logEl = h('div', { class: 'ed-chat__log', role: 'log', 'aria-live': 'polite', 'aria-label': `Conversation avec ${owner.name}` });
  const chips = h('div', { class: 'ed-chat__chips', role: 'group', 'aria-label': 'Questions suggérées' });
  const input = h('input', { class: 'ed-input ed-chat__field', id: 'f-chat', type: 'text', placeholder: `Pose une question à ${firstName(owner.name)}…`, autocomplete: 'off', maxlength: 200, dataset: { focusKey: 'chat-input' } });
  const send = h('button', { type: 'submit', class: 'ed-btn ed-btn--berry ed-chat__send', 'aria-label': 'Envoyer' }, icon('send', 18));
  const form = h('form', { class: 'ed-chat__form' }, h('label', { class: 'ed-sr', for: 'f-chat' }, 'Ta question'), input, send);

  const scrollDown = () => requestAnimationFrame(() => (logEl.scrollTop = logEl.scrollHeight));

  const renderMsg = (m: Msg): HTMLElement => {
    if (m.from === 'me') return h('div', { class: 'ed-msg ed-msg--me' }, h('p', { class: 'ed-msg__bubble' }, m.text));
    const isTyping = typing?.msg === m;
    const text = h('span', { class: 'ed-msg__text' }, isTyping ? m.text.slice(0, typing!.shown) : m.text);
    const bubble = h('div', { class: 'ed-msg__bubble' + (isTyping ? ' is-typing' : '') }, text);
    const el = h('div', { class: 'ed-msg ed-msg--npc' }, avatar(), h('div', { class: 'ed-msg__col' }, bubble));
    if (!isTyping) decorate(m, el.querySelector('.ed-msg__col')!);
    return el;
  };

  const avatar = () => {
    const bg = safeColor(owner.appearance.outfitColor, '#b8413a');
    return h('span', { class: 'ed-avatar', style: { background: bg, color: readableOn(bg) }, 'aria-hidden': 'true' }, initials(owner.name));
  };

  const decorate = (m: Msg, col: HTMLElement) => {
    const a = m.answer;
    if (!a) return;
    if (a.product) col.append(productCardEl(a.product));
    else if (a.link && safeUrl(a.link.url)) col.append(linkCardEl(a.link));
    col.append(sourceEl(app, a, m.question));
  };

  const paint = () => {
    logEl.replaceChildren(...log.map(renderMsg));
    const last = [...log].reverse().find((m) => m.from === 'npc' && m.answer);
    const list = (last?.answer?.followUps?.length ? last.answer.followUps : r.suggestions()).slice(0, 4);
    chips.replaceChildren(
      ...list.map((q) => {
        const b = h('button', { type: 'button', class: 'ed-chip' }, q);
        b.addEventListener('click', () => ask(q));
        return b;
      }),
    );
    scrollDown();
  };

  const say = (m: Msg) => {
    if (typing) finishTyping();
    log.push(m);
    const total = m.text.length;
    typing = { msg: m, shown: 0, timer: 0 };
    app.preview?.setTalking(true, Math.max(2, total / 38 + 1));
    paint();
    const textEl = () => logEl.querySelector('.ed-msg__bubble.is-typing .ed-msg__text');
    typing.timer = window.setInterval(() => {
      if (!typing) return;
      typing.shown = Math.min(total, typing.shown + 2);
      const t = textEl();
      if (t) t.textContent = m.text.slice(0, typing.shown);
      if (typing.shown >= total) finishTyping();
    }, 45);
  };

  const finishTyping = () => {
    if (!typing) return;
    clearInterval(typing.timer);
    const m = typing.msg;
    typing = null;
    app.preview?.setTalking(false);
    const emo = emoteFor(m.answer);
    if (emo) app.preview?.emote(emo);
    if (logEl.isConnected) paint();
  };

  const ask = (q: string) => {
    const question = q.trim();
    if (!question) return;
    log.push({ from: 'me', text: question });
    input.value = '';
    let a: Answer;
    try {
      a = getResponder(app).answer(question);
    } catch (err) {
      console.error('[atelier] responder', err);
      a = { text: 'Oups, je me suis emmêlé les pinceaux…', confidence: 0, intent: 'fallback', followUps: [] };
    }
    say({ from: 'npc', text: a.text, answer: a, question });
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    ask(input.value);
  });

  const restart = button('Recommencer', {
    small: true,
    variant: 'plain',
    icon: 'refresh',
    ariaLabel: 'Recommencer la conversation',
    onClick: () => {
      resetTester();
      builtStall = stall.id;
      app.rerender('chat-input');
    },
  });

  const wrap = h(
    'div',
    { class: 'ed-tab' },
    h(
      'section',
      { class: 'ed-section ed-chat' },
      h(
        'header',
        { class: 'ed-chat__head' },
        avatar(),
        h('div', { class: 'ed-chat__who' }, h('b', null, owner.name || 'Ton personnage'), h('span', null, [owner.role, mood ? `${mood.icon} ${mood.label.toLowerCase()}` : null].filter(Boolean).join(' · '))),
        restart,
      ),
      logEl,
      chips,
      form,
    ),
    h(
      'p',
      { class: 'ed-hint ed-chat__note' },
      icon('info', 14),
      ' Mêmes réponses que dans le marché : ton personnage ne cherche que dans tes textes',
      app.store.scan ? ' et ceux trouvés sur ton site' : '',
      '. S’il sèche, ajoute la réponse dans l’onglet Savoir.',
    ),
  );

  if (!log.length) {
    queueMicrotask(() => {
      app.preview?.wave();
      say({ from: 'npc', text: r.greeting() });
    });
  } else paint();
  return wrap;
}

function emoteFor(a: Answer | undefined): 'happy' | 'surprised' | 'love' | 'sweat' | 'idea' | null {
  if (!a) return 'happy';
  if (a.smalltalk === 'compliment') return 'love';
  if (a.smalltalk === 'thanks' || a.smalltalk === 'xmas' || a.smalltalk === 'greeting' || a.smalltalk === 'name') return 'happy';
  if (a.smalltalk === 'insult' || a.intent === 'fallback') return 'sweat';
  if (a.product) return 'happy';
  if (a.confidence >= 0.9 && a.intent !== 'smalltalk') return 'idea';
  return null;
}

function productCardEl(p: NonNullable<Answer['product']>): HTMLElement {
  const c = productCard(p);
  const url = safeUrl(c.url);
  return h(
    'div',
    { class: 'ed-card' },
    thumb(safeImage(c.image) ?? undefined),
    h('div', { class: 'ed-card__text' }, h('b', null, c.title), c.subtitle ? h('span', null, c.subtitle) : null),
    url ? h('a', { class: 'ed-btn ed-btn--ghost ed-btn--small', ...linkProps(url) }, c.cta ?? 'Voir') : null,
  );
}

function linkCardEl(l: { label: string; url: string }): HTMLElement {
  const c = linkCard(l);
  const url = safeUrl(c.url)!;
  return h(
    'div',
    { class: 'ed-card ed-card--link' },
    h('span', { class: 'ed-card__icon' }, icon('link', 20)),
    h('div', { class: 'ed-card__text' }, h('b', null, c.title), h('span', null, c.subtitle)),
    h('a', { class: 'ed-btn ed-btn--ghost ed-btn--small', ...linkProps(url) }, c.cta),
  );
}

/** "Where does this answer come from?" — and a shortcut to teach the missing answer. */
function sourceEl(app: App, a: Answer, question?: string): HTMLElement {
  const d = app.store.draft;
  const src = a.source ?? '';
  let where = '';
  const m = src.match(/^(faq|fact|desc)-(\d+)$/);
  if (m) {
    const i = Number(m[2]);
    if (m[1] === 'faq') where = `ta FAQ « ${d.knowledge?.faq?.[i]?.q ?? ''} »`;
    else if (m[1] === 'fact') where = `tes petits faits (${d.knowledge?.facts?.[i]?.topic ?? ''})`;
    else where = `ta description, paragraphe ${i + 1}`;
  } else if (src.startsWith('product-')) where = 'la fiche d’un produit';
  else if (src.startsWith('scan-')) where = 'ton site (scan)';
  else if (src === 'bio') where = 'ta petite bio';
  else if (src === 'tagline') where = 'ta phrase d’accroche';

  const missed = a.intent === 'fallback' || (!where && a.intent !== 'smalltalk' && a.confidence < 0.35);
  if (missed && question) {
    const teach = button('Ajouter cette question à ma FAQ', {
      small: true,
      icon: 'plus',
      variant: 'plain',
      onClick: () => {
        d.knowledge ??= {};
        d.knowledge.faq ??= [];
        const q = question.charAt(0).toUpperCase() + question.slice(1).replace(/\s*\?*$/, ' ?');
        insertItem(d.knowledge.faq, d.knowledge.faq.length, { q, a: '' });
        app.store.touch('structure');
        app.go('savoir', `f-faq-a-${d.knowledge.faq.length - 1}`);
      },
    });
    return h('div', { class: 'ed-src ed-src--miss' }, h('span', null, icon('alert', 14), ' Pas trouvé dans tes textes.'), teach);
  }
  if (!where) return h('span', { hidden: true });
  return h('div', { class: 'ed-src' }, icon('book', 14), h('span', null, `Trouvé dans ${where}`), h('span', { class: 'ed-src__conf' }, `${Math.round(a.confidence * 100)} %`));
}
