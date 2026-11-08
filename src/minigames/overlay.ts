import * as THREE from 'three';

/**
 * The mini-games' own DOM layer: countdown, floating feedback ("Parfait !", "+1"), game widgets
 * (gauge, topping buttons, harmony meter) and — only when the UI module's HUD/result card are
 * not available — a small fallback HUD and result card. Everything lives in one root removed at the end.
 */

const STYLE_ID = 'givrelune-mg-style';

const CSS = /* css */ `
.gmg-root{position:fixed;inset:0;pointer-events:none;z-index:24;font-family:Nunito,system-ui,sans-serif;color:#3a2416;overflow:hidden;-webkit-user-select:none;user-select:none}
.gmg-count{position:absolute;left:50%;top:40%;font:800 clamp(72px,15vw,156px)/1 Fraunces,Georgia,serif;color:#fff6df;
  text-shadow:0 0 28px rgba(255,197,107,.95),0 0 60px rgba(255,170,80,.55),0 5px 0 rgba(90,50,20,.35);animation:gmg-pop .78s cubic-bezier(.2,1.5,.4,1) both;white-space:nowrap}
.gmg-count.go{font-size:clamp(44px,8.5vw,92px)}
@keyframes gmg-pop{0%{opacity:0;transform:translate(-50%,-50%) scale(.35)}22%{opacity:1;transform:translate(-50%,-50%) scale(1.1)}68%{opacity:1;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.3)}}
.gmg-float{position:absolute;font:800 clamp(20px,2.6vw,30px)/1 Fraunces,Georgia,serif;color:#ffe3a1;white-space:nowrap;
  text-shadow:0 0 14px rgba(255,190,90,.95),0 2px 0 rgba(60,30,10,.55);animation:gmg-rise 1.15s ease-out forwards}
.gmg-float.big{font-size:clamp(30px,4.4vw,52px)}
.gmg-float.blue{color:#d9f0ff;text-shadow:0 0 16px rgba(120,190,255,.95),0 2px 0 rgba(20,30,70,.6)}
.gmg-float.warm{color:#ffd7a8;text-shadow:0 0 12px rgba(255,140,60,.9),0 2px 0 rgba(60,30,10,.55)}
.gmg-float.dim{color:#e9e0d2;text-shadow:0 0 8px rgba(40,30,60,.8),0 2px 0 rgba(30,20,40,.6)}
@keyframes gmg-rise{0%{opacity:0;transform:translate(-50%,-30%) scale(.55)}14%{opacity:1;transform:translate(-50%,-60%) scale(1.12)}26%{transform:translate(-50%,-70%) scale(1)}100%{opacity:0;transform:translate(-50%,-230%) scale(.96)}}
.gmg-banner{position:absolute;left:50%;top:24%;transform:translate(-50%,-50%);font:800 clamp(26px,4vw,46px)/1.1 Fraunces,Georgia,serif;color:#fff3d6;text-align:center;
  text-shadow:0 0 18px rgba(255,190,90,.9),0 3px 0 rgba(60,30,10,.45);animation:gmg-banner 2.2s ease-out forwards;white-space:nowrap}
.gmg-banner small{display:block;font:700 clamp(14px,1.6vw,18px) Nunito,sans-serif;margin-top:8px;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.6)}
@keyframes gmg-banner{0%{opacity:0;transform:translate(-50%,-30%) scale(.8)}12%{opacity:1;transform:translate(-50%,-50%) scale(1.05)}20%{transform:translate(-50%,-50%) scale(1)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-60%)}}
.gmg-panel{position:absolute;left:50%;bottom:max(96px,15vh);transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:10px;transition:opacity .3s,transform .3s}
.gmg-panel.hidden{opacity:0;transform:translate(-50%,12px)}
.gmg-label{font:800 15px Nunito,sans-serif;color:#fff8ea;text-shadow:0 1px 6px rgba(20,15,40,.8);letter-spacing:.02em;text-align:center}
.gmg-gauge{position:relative;width:min(80vw,460px);height:28px;border-radius:16px;border:3px solid #fff3dc;
  background:linear-gradient(90deg,#f6ecd2 0%,#f0dcae 22%,#e8b955 34%,#f1c463 50%,#e8b955 66%,#a8652f 78%,#5c3a26 92%,#3d2618 100%);
  box-shadow:0 6px 18px rgba(10,10,30,.45),inset 0 2px 4px rgba(0,0,0,.18)}
.gmg-gauge .good{position:absolute;top:-3px;bottom:-3px;border-radius:12px;border:2px solid rgba(255,250,230,.9);box-shadow:0 0 14px rgba(255,210,110,.75)}
.gmg-gauge .perfect{position:absolute;top:2px;bottom:2px;border-radius:9px;background:rgba(255,246,200,.55);box-shadow:0 0 12px rgba(255,230,140,.95)}
.gmg-gauge .cursor{position:absolute;top:50%;width:34px;height:34px;margin-left:-17px;transform:translateY(-50%);border-radius:50%;
  background:radial-gradient(circle at 40% 35%,#fffaf0,#f1d79a 60%,#d9a95a);border:3px solid #6b3f22;box-shadow:0 3px 8px rgba(0,0,0,.4)}
.gmg-gauge .cursor.flash{animation:gmg-flash .35s ease-out}
@keyframes gmg-flash{0%{box-shadow:0 0 0 0 rgba(255,230,140,1)}100%{box-shadow:0 0 0 18px rgba(255,230,140,0)}}
.gmg-gauge .tag{position:absolute;top:100%;margin-top:6px;font:800 12px Nunito,sans-serif;color:#fff8ea;text-shadow:0 1px 4px rgba(0,0,0,.7);transform:translateX(-50%)}
.gmg-btns{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;pointer-events:auto;max-width:94vw}
.gmg-btn{pointer-events:auto;font:800 16px Nunito,sans-serif;padding:10px 16px 10px 12px;border-radius:18px;background:#fff8ea;color:#3a2416;border:2px solid #ecd6ae;
  box-shadow:0 4px 0 #c9a46c,0 10px 22px rgba(10,10,30,.35);cursor:pointer;display:flex;align-items:center;gap:9px;min-height:50px;touch-action:manipulation;transition:transform .12s,box-shadow .12s;animation:gmg-btn-in .35s cubic-bezier(.2,1.4,.4,1) both}
.gmg-btn:hover,.gmg-btn:focus-visible{transform:translateY(-2px);outline:none;box-shadow:0 6px 0 #c9a46c,0 12px 24px rgba(10,10,30,.4)}
.gmg-btn:active{transform:translateY(2px);box-shadow:0 2px 0 #c9a46c,0 6px 14px rgba(10,10,30,.35)}
.gmg-btn .ico{width:26px;height:26px;border-radius:50%;flex:none;box-shadow:inset 0 -3px 0 rgba(0,0,0,.18),0 0 0 2px #fff}
.gmg-btn kbd{font:800 11px Nunito,sans-serif;background:#3a2416;color:#fff8ea;border-radius:6px;padding:2px 6px;margin-left:2px}
@keyframes gmg-btn-in{0%{opacity:0;transform:translateY(14px) scale(.9)}100%{opacity:1;transform:none}}
.gmg-meter{position:relative;width:min(70vw,320px);height:16px;border-radius:10px;background:rgba(20,18,40,.55);border:2px solid rgba(255,243,220,.85);overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,.35)}
.gmg-meter .fill{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:8px;background:linear-gradient(90deg,#ffb347,#ffd27a,#fff1b8);box-shadow:0 0 12px rgba(255,210,120,.9);transition:width .1s linear}
.gmg-meter .mark{position:absolute;top:0;bottom:0;width:2px;background:rgba(255,255,255,.85)}
.gmg-pill{font:800 16px Nunito,sans-serif;padding:7px 16px;border-radius:20px;background:rgba(255,248,234,.94);color:#3a2416;box-shadow:0 4px 14px rgba(10,10,30,.35);transition:background .2s,color .2s}
.gmg-pill.good{background:#ffe7a6;color:#5c3a10}
.gmg-pill.warn{background:#ffd9cf;color:#7a2a1c}
.gmg-dots{display:flex;gap:6px}
.gmg-dots i{width:14px;height:14px;border-radius:50%;background:rgba(255,255,255,.28);border:2px solid rgba(255,255,255,.7);box-shadow:0 2px 6px rgba(0,0,0,.3)}
.gmg-dots i.on{background:radial-gradient(circle at 35% 30%,#fff,#dfe8ff);}
.gmg-dots i.gold{background:radial-gradient(circle at 35% 30%,#fff6d0,#e2b34a)}
.gmg-hud{position:absolute;left:50%;top:max(14px,env(safe-area-inset-top));transform:translateX(-50%);display:flex;align-items:center;gap:14px;padding:8px 18px;border-radius:22px;background:rgba(255,248,234,.94);box-shadow:0 6px 20px rgba(10,10,30,.35);font:800 15px Nunito,sans-serif;white-space:nowrap}
.gmg-hud b{font:800 17px Fraunces,Georgia,serif}
.gmg-hud .t{min-width:44px;text-align:center;padding:2px 8px;border-radius:12px;background:#3a2416;color:#fff8ea}
.gmg-hint{position:absolute;left:50%;bottom:max(22px,env(safe-area-inset-bottom));transform:translateX(-50%);max-width:92vw;text-align:center;font:700 14px Nunito,sans-serif;color:#fff8ea;padding:7px 14px;border-radius:16px;background:rgba(20,18,40,.55);text-shadow:0 1px 3px rgba(0,0,0,.5)}
.gmg-card-wrap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(8,10,28,.35);pointer-events:auto;animation:gmg-fade .3s ease-out}
.gmg-card{width:min(88vw,420px);padding:26px 26px 22px;border-radius:26px;background:#fff8ea;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.45);animation:gmg-btn-in .45s cubic-bezier(.2,1.4,.4,1) both}
.gmg-card h2{margin:0 0 8px;font:800 30px Fraunces,Georgia,serif;color:#3a2416}
.gmg-card .badge{font-size:44px;line-height:1;margin-bottom:6px}
.gmg-card p{margin:0 0 18px;font:600 16px/1.45 Nunito,sans-serif;color:#5a4030}
.gmg-card button{font:800 16px Nunito,sans-serif;padding:11px 26px;border-radius:18px;border:0;background:#b8413a;color:#fff8ea;box-shadow:0 4px 0 #8b2c2a;cursor:pointer}
@keyframes gmg-fade{from{opacity:0}to{opacity:1}}
@media (max-width:560px){.gmg-btns{display:grid;grid-template-columns:1fr 1fr;width:94vw}.gmg-btn{font-size:15px;justify-content:flex-start}.gmg-btn kbd{display:none}.gmg-panel{bottom:max(150px,19vh)}}
@media (prefers-reduced-motion:reduce){.gmg-count,.gmg-float,.gmg-banner{animation-duration:.01s}}
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

export interface FloatOpts {
  cls?: string;
  /** Screen offset in px. */
  dx?: number;
  dy?: number;
}

export class Overlay {
  readonly root: HTMLDivElement;
  private hudEl: HTMLDivElement | null = null;
  private hintEl: HTMLDivElement | null = null;
  private v = new THREE.Vector3();

  constructor(private camera: THREE.PerspectiveCamera, private canvas: HTMLCanvasElement) {
    injectStyle();
    this.root = document.createElement('div');
    this.root.className = 'gmg-root';
    document.body.appendChild(this.root);
  }

  /** Creates a child element. */
  el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '', parent: HTMLElement = this.root): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html) e.innerHTML = html;
    parent.appendChild(e);
    return e;
  }

  private transient(e: HTMLElement, ms: number) {
    setTimeout(() => e.remove(), ms);
  }

  count(text: string, go = false) {
    const e = this.el('div', 'gmg-count' + (go ? ' go' : ''));
    e.textContent = text;
    this.transient(e, 820);
  }

  banner(text: string, sub?: string) {
    const e = this.el('div', 'gmg-banner');
    e.textContent = text;
    if (sub) {
      const s = document.createElement('small');
      s.textContent = sub;
      e.appendChild(s);
    }
    this.transient(e, 2300);
  }

  /** World → CSS pixels (null when behind the camera). */
  toScreen(world: THREE.Vector3): { x: number; y: number } | null {
    this.v.copy(world).project(this.camera);
    if (this.v.z > 1) return null;
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((this.v.x + 1) / 2) * r.width, y: r.top + ((1 - this.v.y) / 2) * r.height };
  }

  float(world: THREE.Vector3, text: string, o: FloatOpts = {}) {
    const p = this.toScreen(world);
    if (!p) return;
    const e = this.el('div', 'gmg-float' + (o.cls ? ' ' + o.cls : ''));
    e.textContent = text;
    e.style.left = `${p.x + (o.dx ?? 0)}px`;
    e.style.top = `${p.y + (o.dy ?? 0)}px`;
    this.transient(e, 1200);
  }

  /** Fallback HUD (only used when the UI module does not draw one). */
  hud(state: { title: string; score?: string; time?: number; hint?: string } | null) {
    if (!state) {
      this.hudEl?.remove();
      this.hintEl?.remove();
      this.hudEl = this.hintEl = null;
      return;
    }
    if (!this.hudEl) this.hudEl = this.el('div', 'gmg-hud');
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
    this.hudEl.innerHTML =
      `<b>${esc(state.title)}</b>` +
      (state.score ? `<span>${esc(state.score)}</span>` : '') +
      (state.time !== undefined ? `<span class="t">${Math.max(0, Math.ceil(state.time))} s</span>` : '');
    if (state.hint) {
      if (!this.hintEl) this.hintEl = this.el('div', 'gmg-hint');
      this.hintEl.textContent = state.hint;
    } else {
      this.hintEl?.remove();
      this.hintEl = null;
    }
  }

  /** Fallback result card. Resolves on click / Space / Enter (or after `autoMs`). */
  card(o: { title: string; text: string; won: boolean; autoMs?: number }): Promise<void> {
    return new Promise((resolve) => {
      const wrap = this.el('div', 'gmg-card-wrap');
      const card = this.el('div', 'gmg-card', '', wrap);
      this.el('div', 'badge', o.won ? '⭐' : '❄️', card);
      const h = this.el('h2', '', '', card);
      h.textContent = o.title;
      const p = this.el('p', '', '', card);
      p.textContent = o.text;
      const b = this.el('button', '', '', card);
      b.type = 'button';
      b.textContent = 'Continuer';
      let done = false;
      const close = () => {
        if (done) return;
        done = true;
        window.removeEventListener('keydown', onKey, true);
        wrap.remove();
        resolve();
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape' || e.code === 'KeyE') {
          e.preventDefault();
          close();
        }
      };
      setTimeout(() => window.addEventListener('keydown', onKey, true), 350);
      b.addEventListener('click', close);
      if (o.autoMs) setTimeout(close, o.autoMs);
      setTimeout(() => b.focus({ preventScroll: true }), 60);
    });
  }

  dispose() {
    this.root.remove();
  }
}
