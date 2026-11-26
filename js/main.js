import { Game, PENDING_KEY } from './game.js';
import { Renderer } from './render3d/scene.js';
import { UI } from './ui/ui.js';
import { Input } from './input.js';
import { music } from './audio/music.js';
import { createFrameLoop } from './frame-loop.js';
import { PerformanceOverlay, probeGpu, weakGpu } from './performance.js';
import { settings, saveSettings } from './settings.js';
import { initAnalytics, track, loadState, reportLoadingLeft } from './analytics.js';
import { initLang } from './i18n.js';
import { BIOMES } from './biome.js';
import { sharedFarmAtBoot, startVisit, openError } from './ui/share.js';
import { reloadIfStale, watchForNewVersion } from './fresh-version.js';
import { IntroFilm, introBlocked } from './ui/intro.js';
import { PerfNotices } from './ui/perf-notices.js';
import './lang/es.js'; // the Spanish language pack (only used when a map is played in Spanish)

const loading = document.getElementById('loading-screen');
const loadingStatus = document.getElementById('loading-status');
const loadingProgress = document.getElementById('loading-progress');
const loadingPercent = document.getElementById('loading-percent');
const loadingRetry = document.getElementById('loading-retry');

// How long loading takes, step by step (ms since the page started), for game_loaded and
// loading_left: a player who gives up on the loading screen otherwise leaves no trace.
const loadSteps = {};
let loadLabel = 'Starting', loaded = false;
// A tab closed during loading sends loading_left (analytics.js); listening from the very start covers
// every step, and visibilitychange is the event that survives a closing tab.
document.addEventListener('visibilitychange', () => { if (document.hidden) reportLoadingLeft(); });
window.addEventListener('pagehide', reportLoadingLeft);
function stage(label, progress) {
  loadSteps[label] = Math.round(performance.now()); loadLabel = label; loadState.stage = label;
  loadingStatus.textContent = label;
  setProgress(progress);
}
// (a transform, not a width, so the bar's easing runs off the main thread while a step holds it)
function setProgress(progress) {
  loadingProgress.style.transform = `scaleX(${progress / 100})`;
  loadingPercent.textContent = `${Math.round(progress)}%`;
}

// Give the browser a chance to paint the loading page between the heavy setup steps.
// (or after a quarter second without one: a background tab, or an itch.io frame scrolled out of
// view, paints nothing, and loading used to stop there until the player came back, s7.md)
const nextPaint = () => new Promise(resolve => {
  let done = false;
  const go = () => { if (!done) { done = true; resolve(); } };
  requestAnimationFrame(() => setTimeout(go, 0));
  setTimeout(go, 250);
});

async function boot() {
  try {
    // A newer release is live: load it now, while there is nothing to lose (js/fresh-version.js)
    stage('Checking for a new version', 4);
    if (await reloadIfStale()) return;
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
    // A shared farm (?farm=<id>, or a farm file opened from the menu): decision 0047, ui/share.js
    const shared = pending ? null : await sharedFarmAtBoot();
    const sharedMap = shared?.data && Object.hasOwn(BIOMES, shared.data.map || 'pnw') ? shared.data.map || 'pnw' : null;
    const startMap = pending?.map || sharedMap || linkedMap || Game.lastMap();
    initLang(startMap); // the language this map is played in (see i18n.js), from the loading screen on
    window.sgLoadingLand?.(startMap); // the loading scene shows this landscape (index.html guessed it from the last one played)
    await nextPaint();
    stage('Preparing the land', 22);
    await nextPaint();

    // analytics first, so events from a game started on load (after a map switch) aren't lost
    initAnalytics();
    // A first visit plays the intro film (after analytics, so intro_started is sent) over the loading screen while the game loads underneath
    // (ui/intro.js); the farm waits for it and opens at the film's last frame.
    const fresh = !pending && !shared && !Game.hasSave(), introNot = fresh ? introBlocked(startMap) : 'visit';
    if (fresh && introNot && introNot !== 'automated') track('intro_not_offered', { reason: introNot, map: startMap });
    const intro = fresh && !introNot ? new IntroFilm({ first: true }) : null;
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
    renderer.gpuName(); // (asked now, while the chip is idle: asked first after the first draw, it waited for that frame to finish, a second on weak graphics)
    const ui = new UI(game, renderer);
    ui.intro = intro;
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

    const visiting = !!sharedMap && startVisit(ui, shared);
    if (shared && !visiting) setTimeout(() => game.notify(openError(shared.error), 'warn'), 1500);
    if (visiting) {
      track('game_start', { mode: 'visit', map: game.map, game_year: game.year });
      if (game.speed === 0) ui.setSpeed(1);
    } else if (pending?.resume) {
      if (!await game.load(pending.map)) { game.newGame(1987, 'free', 'standard', pending.map, Game.randomRunSeed()); setTimeout(() => game.notify('That saved farm could not be opened. Your stored saves have been kept. Choose a new game to start over.', 'warn'), 1500); }
      else {
        track('game_start', { mode: 'continue', saved_mode: game.mode, map: game.map, difficulty: game.difficulty, game_year: game.year });
        game.notify(`Welcome back. It's ${game.dateString()}.`, 'season');
      }
    } else if (pending) await ui.startMode(pending.mode || 'free', true, pending.difficulty, pending.map, pending.runSeed, { sandbox: !!pending.sandbox });
    // A first visit goes straight into Free Play on the farm already generated: the mode choice
    // was where most new players left (docs/posthog-review-2026-11.md). The story is offered from
    // the menu and after the first goal.
    else if (!Game.hasSave()) await ui.startMode('free', false, 'standard', game.map, undefined, { firstVisit: true });
    else {
      // Choose a place and mode (or resume) before entering the farm. Escape and
      // backdrop clicks cannot start an unchosen farm or make it save-ready.
      ui.startPause = true;
      document.body.classList.add('choosing-map');
      // (this map's farm saved: the short start menu; otherwise the full choice of map and mode)
      if (Game.hasSave(startMap)) ui.openStartMenu(startMap); else ui.openModeChoice(false);
    }
    ui.afterNewGame();
    watchForNewVersion(game);
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
    let frame = null; // (the frame loop, made below)
    // (refresh_hz: the screen's refresh as the frame loop measured it, which decides how often it draws for the cap)
    renderer.frameCap = () => ({ target_fps: targetFps(), on_battery: onBattery, refresh_hz: frame?.pace().refreshHz ?? null });
    // (once ever each: the browser drawing without the graphics chip, and a slow spell on battery)
    const notices = new PerfNotices({
      settings, save: saveSettings, track, gpu: renderer.gpuName(), ua: navigator.userAgent, onBattery: () => onBattery,
      notify: (text, extra) => game.notify(text, 'warn', null, extra),
      shown: () => loaded && loading.classList.contains('done') && !ui.intro?.covering,
      playing: () => game.speed > 0 && !renderer.contextLost,
    });
    const frameErrors = new Set();
    const diagnostics = new URLSearchParams(location.search).get('perf') === '1'
      ? new PerformanceOverlay(game, renderer) : null;
    frame = createFrameLoop({
      targetFps,
      onFrameStart: diagnostics ? () => diagnostics.begin() : null,
      onFrame: sample => { renderer.recordCpuFrame(sample); diagnostics?.record(sample); },
      steps: [
        ['simulation', dt => { if (!renderer.contextLost) game.update(dt); }],
        ['input', dt => input.update(dt)],
        ['render', dt => { if (!ui.intro?.covering) renderer.draw(game, ui.state, dt); }], // (not under the intro film)
        ['interface', dt => { ui.frame(dt); notices.frame(performance.now()); }],
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
    // (counted: a phone short of graphics memory drops the view, and nothing else would tell us how often)
    renderer.pace = frame.pace; // (its frame interval decides which frames count as slow: Renderer.draw)
    renderer.onContextLost = () => {
      track('webgl_context_lost', { stage: loaded ? 'playing' : loadLabel, seconds: Math.round(performance.now() / 1000), quality: settings.quality, gpu: renderer.gpuName(), map: game.map });
      game.notify('Graphics were interrupted. The farm is waiting for the view to recover.', 'warn');
    };
    renderer.onContextRestored = () => game.notify('The view has recovered.', 'info');

    // The scene gets its first frame before the loading page fades away: built, then its shaders
    // compiled together while the bar moves (Renderer.prepareFirstFrame), then drawn.
    window.secondGrowth = { game, renderer, ui, diagnostics }; // (handy for debugging from the console)
    renderer.prepareFirstFrame(game, ui.state);
    if (intro) intro.onHandOver = (scale, holdMs) => renderer.openFromFilm(scale, holdMs); // (the film's framing, then the start zoom)
    stage('Catching the light', 90);
    await nextPaint();
    await renderer.warmShaders(f => setProgress(90 + 9 * f));
    requestAnimationFrame(now => {
      try {
        // Startup failures still show the loading error instead of opening a blank farm.
        renderer.draw(game, ui.state, 0);
        ui.frame(0);
        frame(now);
        stage('Ready', 100); loaded = true; loadState.loaded = true;
        // (page start to the first drawn frame, and each loading step's start, in ms)
        track('game_loaded', { load_ms: loadSteps.Ready, steps: loadSteps, map: game.map, quality: settings.quality, gpu: renderer.gpuName() });
        requestAnimationFrame(() => {
          // (a first visit's film not playing yet: the loading screen stays up until it starts or is
          // dropped, so the farm never shows for a moment before the film covers it)
          intro?.gameReady();
          (intro ? intro.decided : Promise.resolve()).then(() => {
            loading.classList.add('done');
            loading.addEventListener('transitionend', () => loading.remove(), { once: true });
          });
        });
      } catch (error) {
        showLoadError(error);
      }
    });
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
