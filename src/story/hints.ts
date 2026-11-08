import * as THREE from 'three';
import type { StoryRuntime } from './types';

/**
 * Gentle first-time tips, as toasts, once each (saved): how to walk, turn the camera, talk, open the map.
 * Keyboard or touch wording depending on the device. They wait for calm moments (explore mode).
 */
interface Hint {
  id: string;
  icon: string;
  keyboard: string;
  touch: string;
  /** Ready to show? (evaluated in explore mode). */
  when: (s: HintState) => boolean;
}

interface HintState {
  since: number;
  walked: number;
  focused: boolean;
  metGuide: boolean;
  stars: number;
}

const HINTS: Hint[] = [
  {
    id: 'move',
    icon: '🧭',
    keyboard: 'Promène-toi avec ZQSD, WASD ou les flèches — Maj pour presser le pas.',
    touch: 'Pose ton pouce sur le joystick pour te promener, ou touche le sol pour y aller.',
    when: (s) => s.since > 1.8,
  },
  {
    id: 'camera',
    icon: '🎥',
    keyboard: 'Fais glisser la souris pour tourner la vue, la molette pour t’approcher.',
    touch: 'Fais glisser l’écran pour tourner la vue, pince pour t’approcher.',
    when: (s) => s.walked > 6 || s.since > 14,
  },
  {
    id: 'talk',
    icon: '💬',
    keyboard: 'Quand une bulle apparaît, appuie sur E (ou clique) pour bavarder, jouer ou ramasser.',
    touch: 'Touche les gens et ce qui brille pour bavarder, jouer ou ramasser.',
    when: (s) => s.focused,
  },
  {
    id: 'map',
    icon: '🗺️',
    keyboard: 'Appuie sur M (ou sur l’icône de carte) pour filer d’un coin du marché à l’autre.',
    touch: 'Touche l’icône de carte, en haut, pour filer d’un coin du marché à l’autre.',
    when: (s) => s.metGuide && s.since > 3,
  },
];

export class Hints {
  private started = false;
  private state: HintState = { since: 0, walked: 0, focused: false, metGuide: false, stars: 0 };
  private last = new THREE.Vector3();
  private cooldown = 0;

  constructor(private story: StoryRuntime) {}

  start() {
    if (this.started) return;
    this.started = true;
    this.last.copy(this.story.ctx.player.position);
  }

  private seen(id: string) {
    return !!this.story.ctx.save.flag<boolean>('hint:' + id);
  }

  update(dt: number) {
    if (!this.started) return;
    const { ctx } = this.story;
    if (ctx.mode !== 'explore' || ctx.ui.isBlocking()) return;
    const s = this.state;
    s.since += dt;
    const p = ctx.player.position;
    s.walked += Math.min(1, p.distanceTo(this.last));
    this.last.copy(p);
    if (ctx.interactables.focused) s.focused = true;
    s.metGuide = !!ctx.save.flag<boolean>('story:metGuide');
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    for (const h of HINTS) {
      if (this.seen(h.id) || !h.when(s)) continue;
      const touch = this.story.isTouch();
      ctx.ui.toast(touch ? h.touch : h.keyboard, { icon: h.icon, duration: 6500 });
      ctx.save.flag('hint:' + h.id, true);
      this.cooldown = 7.5;
      break;
    }
  }
}
