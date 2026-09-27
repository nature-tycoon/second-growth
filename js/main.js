import { Game } from './game.js';
import { Renderer } from './render3d/scene.js';
import { UI } from './ui/ui.js';
import { Input } from './input.js';
import { initAnalytics } from './analytics.js';

initAnalytics();

const game = new Game();
game.newGame();
game.speed = 0; // paused until the welcome screen closes

const renderer = new Renderer(document.getElementById('view'));
const ui = new UI(game, renderer);
const input = new Input(game, renderer, ui);

renderer.resetView();
window.addEventListener('resize', () => { renderer.resize(); renderer.clampCam(); });

ui.openIntro(true, Game.hasSave(), () => { if (game.speed === 0) ui.setSpeed(1); });
ui.refreshTop(true);

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  game.update(dt);
  input.update(dt);
  renderer.draw(game, ui.state, dt);
  ui.frame(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// handy for debugging from the console
window.secondGrowth = { game, renderer, ui };
