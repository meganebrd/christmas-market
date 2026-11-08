import { clear, h, linkProps, safeUrl } from './dom';
import { icon } from './icons';
import { ModalShell } from './Modal';
import type { UIShared } from './shared';

type Tab = 'controls' | 'about';

const kbd = (...keys: string[]) => h('span', { class: 'gl-keys' }, keys.map((k) => h('kbd', { text: k })));

/** Controls (keyboard & touch), the little quest, and the credits. */
export class HelpPanel {
  private shell: ModalShell;
  private body: HTMLElement;
  private tabs: Record<Tab, HTMLButtonElement>;
  private tab: Tab = 'controls';

  constructor(private ui: UIShared) {
    this.shell = new ModalShell(ui, { cls: 'gl-modal--help', label: 'Aide', lock: 'help', backdropCls: 'gl-backdrop--top' });
    this.body = h('div', { class: 'gl-modal__body' });
    const tabBtn = (t: Tab, label: string) =>
      h('button', { class: 'gl-tab', type: 'button', role: 'tab', 'aria-selected': 'false', onclick: () => this.select(t) }, h('span', { text: label }));
    this.tabs = { controls: tabBtn('controls', 'Comment jouer'), about: tabBtn('about', 'À propos') };
    this.shell.panel.append(
      h(
        'header',
        { class: 'gl-modal__head' },
        h('span', { class: 'gl-modal__badge', 'aria-hidden': 'true' }, icon('help', { size: 22 })),
        h('h2', { class: 'gl-modal__title', text: 'Petit guide' }),
        this.shell.closeBtn,
      ),
      h('div', { class: 'gl-tabs', role: 'tablist' }, this.tabs.controls, this.tabs.about),
      this.body,
    );
  }

  isOpen() {
    return this.shell.isOpen();
  }

  close() {
    this.shell.close();
  }

  open(tab: Tab = 'controls') {
    this.select(tab, true);
    this.shell.show();
  }

  private select(t: Tab, silent = false) {
    this.tab = t;
    for (const [k, b] of Object.entries(this.tabs)) b.setAttribute('aria-selected', String(k === t));
    clear(this.body);
    this.body.appendChild(t === 'controls' ? this.controls() : this.about());
    this.body.scrollTop = 0;
    if (!silent) this.ui.sfx('page', { volume: 0.5 });
  }

  private controls(): HTMLElement {
    const touchFirst = this.ui.isTouch();
    const keyboard = h(
      'section',
      { class: 'gl-help__block' },
      h('h3', { class: 'gl-h3' }, icon('keyboard', { size: 18 }), h('span', { text: 'Au clavier et à la souris' })),
      h(
        'ul',
        { class: 'gl-help__list' },
        h('li', null, kbd('Z', 'Q', 'S', 'D'), h('span', { text: 'ou ' }), kbd('W', 'A', 'S', 'D'), h('span', { text: 'ou les flèches : se promener' })),
        h('li', null, kbd('Maj'), h('span', { text: 'en marchant : courir' })),
        h('li', null, kbd('E'), h('span', { text: 'ou ' }), kbd('Espace'), h('span', { text: ' : parler, regarder, jouer' })),
        h('li', null, kbd('M'), h('span', { text: ': ouvrir la carte du village' })),
        h('li', null, h('span', { class: 'gl-help__mouse', 'aria-hidden': 'true' }, icon('mouse', { size: 17 })), h('span', { text: 'Glisser la souris : tourner la caméra · molette : zoomer' })),
        h('li', null, h('span', { class: 'gl-help__mouse', 'aria-hidden': 'true' }, icon('pointer', { size: 16 })), h('span', { text: 'Cliquer sur le sol ou sur une cabane : s’y rendre' })),
        h('li', null, kbd('Échap'), h('span', { text: ': fermer une fenêtre' })),
      ),
    );
    const touch = h(
      'section',
      { class: 'gl-help__block' },
      h('h3', { class: 'gl-h3' }, icon('touch', { size: 18 }), h('span', { text: 'Sur téléphone' })),
      h(
        'ul',
        { class: 'gl-help__list' },
        h('li', null, h('span', { class: 'gl-help__pic gl-help__pic--stick', 'aria-hidden': 'true' }), h('span', { text: 'Pose ton pouce à gauche de l’écran : un joystick apparaît pour marcher (pousse fort pour courir).' })),
        h('li', null, h('span', { class: 'gl-help__pic gl-help__pic--action', 'aria-hidden': 'true' }, icon('hand', { size: 16 })), h('span', { text: 'Le gros bouton rond, en bas à droite : parler, regarder, jouer.' })),
        h('li', null, h('span', { class: 'gl-help__mouse', 'aria-hidden': 'true' }, icon('pointer', { size: 16 })), h('span', { text: 'Touche le sol pour t’y rendre, ou une cabane pour aller la voir.' })),
        h('li', null, h('span', { class: 'gl-help__mouse', 'aria-hidden': 'true' }, icon('pinch', { size: 16 })), h('span', { text: 'Glisse un doigt pour tourner la caméra, pince pour zoomer.' })),
      ),
    );
    const total = this.ui.ctx.config?.story?.stars ?? 7;
    const quest = h(
      'section',
      { class: 'gl-help__block gl-help__quest' },
      h('h3', { class: 'gl-h3' }, icon('star', { size: 18 }), h('span', { text: 'La petite quête' })),
      h('p', { text: `Le vent du Nord a dispersé les ${total} étoiles de verre du Grand Sapin. Promène-toi, parle aux habitants, joue aux jeux du marché… et rapporte-les toutes pour rallumer le sapin.` }),
      h('p', { text: 'Rien ne presse : les artisans t’attendent dans leurs cabanes, et chacun a une histoire à raconter. Tu peux leur poser tes questions, tout simplement.' }),
    );
    return h('div', { class: 'gl-help' }, touchFirst ? [touch, keyboard] : [keyboard, touch], quest);
  }

  private about(): HTMLElement {
    const cfg = this.ui.ctx.config;
    const org = cfg?.meta?.organizer;
    const orgUrl = safeUrl(org?.url);
    const tracks = (cfg?.music?.tracks ?? []).map((t) => {
      if (t.type === 'file') {
        const src = safeUrl(t.url);
        const meta = [t.author, t.license].filter(Boolean).join(' · ');
        return h('li', null, src ? h('a', { ...linkProps(src), text: t.title }) : h('span', { text: t.title }), meta ? h('small', { text: ` — ${meta}` }) : null);
      }
      const name = t.title || t.song;
      const trad = /trad|douce-nuit|mon-beau-sapin|il-est-ne|vive-le-vent|les-anges|deck-the-halls|we-wish-you|greensleeves/i.test(name + ' ' + t.song);
      return h('li', null, h('span', { text: name }), h('small', { text: trad ? ' — air traditionnel, domaine public' : ' — composée pour le marché' }));
    });
    return h(
      'div',
      { class: 'gl-help gl-about' },
      h(
        'section',
        { class: 'gl-help__block' },
        h('h3', { class: 'gl-h3' }, icon('heart', { size: 18 }), h('span', { text: cfg?.meta?.title || 'Givrelune' })),
        cfg?.meta?.description ? h('p', { text: cfg.meta.description }) : null,
        h('p', { text: 'Givrelune est un projet open source (licence MIT) : un marché de Noël en 3D qui met en lumière de vrais artisans. Chaque cabane est un simple fichier, n’importe qui peut proposer la sienne.' }),
        h('p', { text: 'Les artisans te répondent grâce à un petit moteur de recherche maison, sans intelligence artificielle : leurs mots viennent de leurs propres textes et de leur site.' }),
        org ? h('p', { class: 'gl-about__org' }, h('span', { text: 'Organisé par ' }), orgUrl ? h('a', { ...linkProps(orgUrl), text: org.name }) : h('strong', { text: org.name })) : null,
      ),
      h(
        'section',
        { class: 'gl-help__block' },
        h('h3', { class: 'gl-h3' }, icon('music', { size: 18 }), h('span', { text: 'La musique' })),
        h('p', { text: 'Une boîte à musique jouée en direct par ton navigateur (Web Audio) : aucun fichier, que des notes.' }),
        tracks.length ? h('ul', { class: 'gl-about__tracks' }, tracks) : null,
      ),
      h(
        'section',
        { class: 'gl-help__block' },
        h('h3', { class: 'gl-h3' }, icon('sparkle', { size: 18 }), h('span', { text: 'Fabriqué avec' })),
        h('p', { text: 'Three.js pour la 3D, des modèles entièrement procéduraux, les polices Fraunces et Nunito (SIL Open Font License), et beaucoup de chocolat chaud.' }),
      ),
    );
  }
}
