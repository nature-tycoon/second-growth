import { Game, PENDING_KEY } from './game.js';
import { Renderer } from './render3d/scene.js';
import { UI } from './ui/ui.js';
import { Input } from './input.js';
import { music } from './audio/music.js';
import { createFrameLoop } from './frame-loop.js';
import { PerformanceOverlay, probeGpu, weakGpu } from './performance.js';
import { settings, saveSettings } from './settings.js';
import { initAnalytics, track, trackExit } from './analytics.js';
import { initLang } from './i18n.js';
import { BIOMES } from './biome.js';
import './lang/es.js'; // the Spanish language pack (only used when a map is played in Spanish)

const loading = document.getElementById('loading-screen');
const loadingStatus = document.getElementById('loading-status');
const loadingProgress = document.getElementById('loading-progress');
const loadingRetry = document.getElementById('loading-retry');

// How long loading takes, step by step (ms since the page started), for game_loaded and
// loading_left: a player who gives up on the loading screen otherwise leaves no trace.
const loadSteps = {};
let loadLabel = 'Starting', loaded = false;
function stage(label, progress) {
  loadSteps[label] = Math.round(performance.now()); loadLabel = label;
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
    // A link to one landscape (?map=amazon, from the website) opens the start screen on that map.
    // The address is tidied so a later reload or map switch behaves as usual.
    const linked = new URLSearchParams(location.search).get('map');
    const linkedMap = !pending && Object.hasOwn(BIOMES, linked) ? linked : null;
    if (linked) { const url = new URL(location.href); url.searchParams.delete('map'); history.replaceState(history.state, '', url); }
    stage('Opening your saved farms', 12);
    await Game.prepareSaves();
    const startMap = pending?.map || linkedMap || Game.lastMap();
    initLang(startMap); // the language this map is played in (see i18n.js), from the loading screen on
    await nextPaint();
    stage('Preparing the land', 22);
    await nextPaint();

    // analytics first, so events from a game started on load (after a map switch) aren't lost
    initAnalytics();
    window.addEventListener('pagehide', () => { if (!loaded) trackExit('loading_left', { stage: loadLabel, seconds: Math.round(performance.now() / 1000) }); });
    const game = new Game();
    game.newGame(1987, 'free', 'standard', startMap, pending?.runSeed ?? Game.randomRunSeed());
    game.speed = 0; // paused until the player chooses Start or Continue
    stage('Growing the landscape', 52);
    await nextPaint();

    // Built-in graphics that run High at about half the frame rate of Fast start on Fast, unless
    // the player has chosen a Detail level (the step the game would otherwise take only after a
    // few slow spells). Fast on a computer keeps the screen's sharpness: see Renderer.applySettings.
    const chip = probeGpu(), touchScreen = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
    const weak = !touchScreen && weakGpu(chip);
    // (Once the game has measured this computer itself and changed Detail, that wins over the chip.)
    if (weak && !settings.qualityChosen && !settings.autoQualityAt && settings.quality !== 'fast') {
      track('auto_quality', { from: settings.quality, to: 'fast', reason: 'graphics_chip', gpu: chip });
      settings.quality = 'fast'; saveSettings();
    }
    const renderer = new Renderer(document.getElementById('view'), { catalog: game.catalog });
    const ui = new UI(game, renderer);
    const input = new Input(game, renderer, ui);
    renderer.resetView();
    window.addEventListener('resize', () => {
      scrollTo(0, 0);
      if (innerWidth === renderer.vw && innerHeight === renderer.vh) return;
      renderer.resize(); renderer.clampCam();
    });
    // iOS reports the window's size late while the phone turns, most of all from the home screen, so
    // the resize event can carry the old size. Measure everything again once the turn has settled.
    addEventListener('orientationchange', () => {
      for (const ms of [100, 400, 1000]) setTimeout(() => dispatchEvent(new Event('resize')), ms);
    });

    if (pending?.resume) {
      if (!await game.load(pending.map)) { game.newGame(1987, 'free', 'standard', pending.map, Game.randomRunSeed()); setTimeout(() => game.notify('That saved farm could not be opened. Your stored saves have been kept. Choose a new game to start over.', 'warn'), 1500); }
      else {
        track('game_start', { mode: 'continue', saved_mode: game.mode, map: game.map, difficulty: game.difficulty, game_year: game.year });
        game.notify(`Welcome back. It's ${game.dateString()}.`, 'season');
      }
    } else if (pending) await ui.startMode(pending.mode || 'free', true, pending.difficulty, pending.map, pending.runSeed);
    // A first visit goes straight into Free Play on the farm already generated: the mode choice
    // was where most new players left (docs/posthog-review-2026-11.md). The story is offered from
    // the menu and after the first goal.
    else if (!Game.hasSave()) await ui.startMode('free', false, 'standard', game.map, undefined, { firstVisit: true });
    else {
      // Choose a place and mode (or resume) before entering the farm. Escape and
      // backdrop clicks cannot start an unchosen farm or make it save-ready.
      ui.startPause = true;
      document.body.classList.add('choosing-map');
      ui.openModeChoice(Game.hasSave(startMap));
    }
    ui.afterNewGame();
    ui.refreshTop(true);
    // A map reload has no welcome click. Reuse browser autoplay permission when
    // available; the ordinary gesture listeners retry if this browser requires a tap.
    if (pending) void music.start();
    stage('Welcoming the wild', 82);
    await nextPaint();

    // Frame rate: a slow, calm game reads just as well at 30 frames a second, and half the
    // drawing keeps phones cool and laptop batteries going. Auto means 30 on touch screens and
    // while a laptop runs on battery (where the browser says so), 60 otherwise.
    const touch = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
    let onBattery = null; // (unknown: Safari and Firefox don't say)
    navigator.getBattery?.().then(b => { const upd = () => { onBattery = !b.charging; }; upd(); b.addEventListener('chargingchange', upd); }).catch(() => {});
    const targetFps = () => settings.fps === '60' ? 60 : settings.fps === '30' ? 30 : touch || onBattery ? 30 : 60;
    renderer.frameCap = () => ({ target_fps: targetFps(), on_battery: onBattery });
    const frameErrors = new Set();
    const diagnostics = new URLSearchParams(location.search).get('perf') === '1'
      ? new PerformanceOverlay(game, renderer) : null;
    const frame = createFrameLoop({
      targetFps,
      onFrameStart: diagnostics ? () => diagnostics.begin() : null,
      onFrame: sample => { renderer.recordCpuFrame(sample); diagnostics?.record(sample); },
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
        stage('Ready', 100); loaded = true;
        // (page start to the first drawn frame, and each loading step's start, in ms)
        track('game_loaded', { load_ms: loadSteps.Ready, steps: loadSteps, map: game.map, quality: settings.quality, gpu: renderer.gpuName() });
        requestAnimationFrame(() => {
          loading.classList.add('done');
          loading.addEventListener('transitionend', () => loading.remove(), { once: true });
        });
      } catch (error) {
        showLoadError(error);
      }
    });

    // Handy for debugging from the console.
    window.secondGrowth = { game, renderer, ui, diagnostics };
  } catch (error) {
    showLoadError(error);
  }
}

function showLoadError(error) {
  console.error('Second Growth could not start:', error);
  loaded = true;
  track('load_failed', { stage: loadLabel, message: String(error?.message || error).slice(0, 300), seconds: Math.round(performance.now() / 1000) });
  stage('The game could not load', 100);
  loading.classList.add('failed');
  document.getElementById('loading-tip').textContent = 'Something went wrong while opening the farm. Reloading usually fixes it.';
  loadingRetry.classList.remove('hidden');
  loadingRetry.addEventListener('click', () => location.reload(), { once: true });
}

boot();
