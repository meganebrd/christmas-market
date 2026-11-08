/**
 * Givrelune's UI: loading & title screens, cinematic letterbox, dialogue box, stall panel, map, HUD,
 * touch controls, settings, help, mini-game overlay. Vanilla DOM, every content string goes through
 * textContent (see dom.ts). Implements the whole `UIApi` contract.
 */
import type { GameContext, UIApi } from '../core/contracts';
import { Bubbles } from './Bubbles';
import { Cinematic } from './Cinematic';
import { Dialogue } from './Dialogue';
import { HelpPanel } from './Help';
import { Hud } from './Hud';
import { Loading } from './Loading';
import { MapView } from './Map';
import { Minigame } from './Minigame';
import { Prompt } from './Prompt';
import { SettingsPanel } from './Settings';
import { UIShared } from './shared';
import { StallPanel } from './StallPanel';
import { Title } from './Title';
import { Toasts } from './Toasts';
import { Touch } from './Touch';

export function createUI(ctx: GameContext): UIApi {
  const ui = new UIShared(ctx);

  const loading = new Loading(ui);
  loading.show(0, 'Interface');

  const bubbles = new Bubbles(ui);
  const prompt = new Prompt(ui);
  const toasts = new Toasts(ui);
  const minigame = new Minigame(ui);
  const dialogue = new Dialogue(ui);
  ui.dialogueOpen = () => dialogue.isOpen();
  const cinematic = new Cinematic(ui);
  const stall = new StallPanel(ui);
  const map = new MapView(ui);
  const help = new HelpPanel(ui);
  const settings = new SettingsPanel(ui, () => hud.syncSound());
  const hud = new Hud(ui, {
    openSettings: () => settings.open(),
    openHelp: () => help.open('controls'),
    toast: (t, o) => toasts.toast(t, o),
  });
  const title = new Title(ui, () => help.open('about'));
  new Touch(ui, prompt);

  // Mode classes on the root (CSS hides things per mode), and housekeeping when the mode changes.
  const applyMode = (to: string) => {
    ui.root.dataset.mode = to;
  };
  applyMode(ctx.mode);
  ctx.events?.on('mode:change', ({ to }) => {
    applyMode(to);
    if (to !== 'map' && map.isOpen()) map.hide();
  });
  ctx.events?.on('settings:change', () => ui.applyMotion());

  const api: UIApi = {
    showLoading: (p, label) => loading.show(p, label),
    hideLoading: () => loading.hide(),
    showTitle: (opts) => title.show(opts),
    hideTitle: () => title.hide(),
    letterbox: (on) => cinematic.letterbox(on),
    narrate: (text, opts) => cinematic.narrate(text, opts),
    setSkippable: (fn) => cinematic.setSkippable(fn),
    dialogue,
    openStall: (s) => stall.openStall(s),
    openProduct: (s, p) => stall.openProduct(s, p),
    openProfile: (s) => stall.openProfile(s),
    closePanels: () => {
      if (help.isOpen()) help.close();
      if (settings.isOpen()) settings.close();
      if (stall.isOpen()) stall.close();
    },
    bubble: (anchor, text, opts) => bubbles.show(anchor, text, opts),
    setPrompt: (p) => prompt.set(p),
    setHudVisible: (v) => hud.setVisible(v),
    setQuest: (q) => hud.setQuest(q),
    toast: (text, opts) => toasts.toast(text, opts),
    zoneBanner: (t, sub) => toasts.zoneBanner(t, sub),
    openMap: () => map.open(),
    closeMap: () => map.closeAndExplore(),
    minigameHud: (state) => minigame.setHud(state),
    minigameResult: (opts) => minigame.result(opts),
    isBlocking: () => dialogue.isOpen() || stall.isOpen() || map.isOpen() || settings.isOpen() || help.isOpen() || minigame.isBlocking(),
  };
  return api;
}
