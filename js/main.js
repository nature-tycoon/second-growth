import { Game, PENDING_KEY } from './game.js';
import { Renderer } from './render3d/scene.js';
import { UI } from './ui/ui.js';
import { Input } from './input.js';
import { createFrameLoop } from './frame-loop.js';
import { settings } from './settings.js';
import { initAnalytics, analyticsWillRun, track } from './analytics.js';
import { initLang } from './i18n.js';
import './lang/es.js'; // the Spanish language pack (only used when a map is played in Spanish)

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
    // a map switch reloads the page (see UI.switchMap); otherwise open on the last map played
    let pending = null;
    try { pending = JSON.parse(sessionStorage.getItem(PENDING_KEY)); sessionStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
    stage('Opening your saved farms', 12);
    await Game.prepareSaves();
    initLang(pending?.map || Game.lastMap()); // the language this map is played in (see i18n.js), from the loading screen on
    await nextPaint();
    stage('Preparing the land', 22);
    await nextPaint();

    // analytics first, so events from a game started on load (after a map switch) aren't lost
    initAnalytics();
    const game = new Game();
    game.newGame(1987, 'free', 'standard', pending?.map || Game.lastMap());
    game.speed = 0; // paused until the welcome screen closes
    stage('Growing the landscape', 52);
    await nextPaint();

    // session replays can only see the 3D view if its drawing buffer is kept between frames
    const renderer = new Renderer(document.getElementById('view'), { preserveDrawingBuffer: analyticsWillRun() });
    const ui = new UI(game, renderer);
    const input = new Input(game, renderer, ui);
    renderer.resetView();
    window.addEventListener('resize', () => { renderer.resize(); renderer.clampCam(); });

    if (pending?.resume) {
      if (!await game.load(pending.map)) { game.newGame(1987, 'free', 'standard', pending.map); setTimeout(() => game.notify('That saved farm could not be opened. Your stored saves have been kept. Choose a new game to start over.', 'warn'), 1500); }
      else {
        track('game_start', { mode: 'continue', saved_mode: game.mode, map: game.map, difficulty: game.difficulty, game_year: game.year });
        game.notify(`Welcome back. It's ${game.dateString()}.`, 'season');
      }
    } else if (pending) await ui.startMode(pending.mode || 'free', true, pending.difficulty, pending.map);
    else ui.openIntro(true, Game.hasSave(), () => { if (game.speed === 0) ui.setSpeed(1); });
    ui.afterNewGame();
    ui.refreshTop(true);
    stage('Welcoming the wild', 82);
    await nextPaint();

    // Frame rate: a slow, calm game reads just as well at 30 frames a second, and half the
    // drawing keeps phones cool and laptop batteries going. Auto means 30 on touch screens and
    // while a laptop runs on battery (where the browser says so), 60 otherwise.
    const touch = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
    let onBattery = false;
    navigator.getBattery?.().then(b => { const upd = () => { onBattery = !b.charging; }; upd(); b.addEventListener('chargingchange', upd); }).catch(() => {});
    const targetFps = () => settings.fps === '60' ? 60 : settings.fps === '30' ? 30 : touch || onBattery ? 30 : 60;
    const frameErrors = new Set();
    const frame = createFrameLoop({
      targetFps,
      steps: [
        ['simulation', dt => { if (!renderer.contextLost) game.update(dt); }],
        ['input', dt => input.update(dt)],
        ['render', dt => renderer.draw(game, ui.state, dt)],
        ['interface', dt => ui.frame(dt)],
      ],
      onError(error, phase) {
        if (phase === 'simulation') {
          game.speed = 0;
          game.saveReady = false; // keep automatic saves from replacing the last intact farm
        }
        const message = String(error?.message || error), key = `${phase}|${message}`;
        if (frameErrors.has(key) || frameErrors.size >= 5) return;
        frameErrors.add(key);
        console.error(`Second Growth frame failed (${phase}):`, error);
        track('js_error', { kind: 'frame', stage: phase, message: message.slice(0, 300),
          where: String(error?.stack?.split('\n')[1] || '').trim().slice(0, 200),
          map: game.map, day: game.day, animals: game.wildlife.agents.length });
        game.notify(phase === 'simulation'
          ? 'The simulation hit a problem and was paused. Reload to continue from your saved farm.'
          : 'The game hit a display problem. If the view does not recover, reload to continue.', 'warn');
      },
    });
    renderer.onContextLost = () => game.notify('Graphics were interrupted. The farm is waiting for the view to recover.', 'warn');
    renderer.onContextRestored = () => game.notify('The view has recovered.', 'info');

    // The scene gets its first frame before the loading page fades away.
    requestAnimationFrame(now => {
      try {
        // Startup failures still show the loading error instead of opening a blank farm.
        renderer.draw(game, ui.state, 0);
        ui.frame(0);
        frame(now);
        stage('Ready', 100);
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
  stage('The game could not load', 100);
  document.getElementById('loading-tip').textContent = 'Something went wrong while opening the farm. Reloading usually fixes it.';
  loadingRetry.classList.remove('hidden');
  loadingRetry.addEventListener('click', () => location.reload(), { once: true });
}

boot();
