import { Game } from './game.js';
import { Renderer } from './render3d/scene.js';
import { UI } from './ui/ui.js';
import { Input } from './input.js';
import { initAnalytics, analyticsWillRun } from './analytics.js';

const loading = document.getElementById('loading-screen');
const loadingStatus = document.getElementById('loading-status');
const loadingProgress = document.getElementById('loading-progress');
const loadingRetry = document.getElementById('loading-retry');

function stage(label, progress) {
  loadingStatus.textContent = label;
  loadingProgress.style.width = `${progress}%`;
}

// Give the browser a chance to paint the loading page between the heavy setup steps.
const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));

async function boot() {
  try {
    await nextPaint();
    stage('Preparing the valley', 22);
    await nextPaint();

    const game = new Game();
    game.newGame();
    game.speed = 0; // paused until the welcome screen closes
    stage('Growing the landscape', 52);
    await nextPaint();

    // session replays can only see the 3D view if its drawing buffer is kept between frames
    const renderer = new Renderer(document.getElementById('view'), { preserveDrawingBuffer: analyticsWillRun() });
    const ui = new UI(game, renderer);
    const input = new Input(game, renderer, ui);
    renderer.resetView();
    window.addEventListener('resize', () => { renderer.resize(); renderer.clampCam(); });

    ui.openIntro(true, Game.hasSave(), () => { if (game.speed === 0) ui.setSpeed(1); });
    ui.refreshTop(true);
    stage('Welcoming the wild', 82);
    await nextPaint();

    initAnalytics();
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

    // The scene gets its first frame before the loading page fades away.
    requestAnimationFrame(now => {
      try {
        frame(now);
        stage('The valley is ready', 100);
        requestAnimationFrame(() => {
          loading.classList.add('done');
          loading.addEventListener('transitionend', () => loading.remove(), { once: true });
        });
      } catch (error) {
        showLoadError(error);
      }
    });

    // Handy for debugging from the console.
    window.secondGrowth = { game, renderer, ui };
  } catch (error) {
    showLoadError(error);
  }
}

function showLoadError(error) {
  console.error('Second Growth could not start:', error);
  stage('The valley could not load', 100);
  document.getElementById('loading-tip').textContent = 'Something went wrong while opening the farm. Reloading usually fixes it.';
  loadingRetry.classList.remove('hidden');
  loadingRetry.addEventListener('click', () => location.reload(), { once: true });
}

boot();
