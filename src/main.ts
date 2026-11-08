import './ui/styles.css';
import { loadMarket } from './config/load';
import { Game } from './core/Game';

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

async function main() {
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui-root') as HTMLElement;
  if (!webglAvailable()) {
    uiRoot.innerHTML = `<div class="no-webgl"><h1>Givrelune</h1><p>Ce marché de Noël a besoin de WebGL 2 pour s'illuminer. Essayez avec un navigateur récent (Chrome, Firefox, Safari, Edge).</p></div>`;
    return;
  }
  const config = loadMarket();
  document.title = `${config.meta.title} · ${config.meta.town}`;
  const game = new Game(canvas, uiRoot, config);
  await game.boot();
}

main().catch((err) => {
  console.error(err);
  const uiRoot = document.getElementById('ui-root');
  if (uiRoot) uiRoot.innerHTML = `<div class="no-webgl"><h1>Oups…</h1><p>Le marché n'a pas pu s'ouvrir. ${String(err?.message ?? err)}</p></div>`;
});
