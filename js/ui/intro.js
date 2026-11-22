// The first-visit intro film (docs/ideas/2026-11-21-first-minutes/s9.md; the film is session 8's,
// assets/intro/intro-film.*, filmed from the game: tools/film-intro.mjs).
//
// On a first visit to the PNW farm it plays over the loading screen while the game loads underneath.
// Its last frame is the live first view (intro-film.json, held by tools/intro-film-check.mjs), so when
// it ends, and the game is ready, it fades straight into the farm. If the game is ready first, the
// game waits for the film; if the film hasn't started (slow network, no codec, an error) by the time
// the game is ready, it is dropped without a word. Skip at any moment: the Skip button, Esc, or a
// tap/click anywhere. Sound is tried first (itch.io's "Run game" click may allow it); where the
// browser refuses, it plays muted with a sound button. Once per device (INTRO_SEEN); "Watch intro"
// in the menus replays it over the paused game.
//
// Events: intro_started { first }, intro_skipped { second, first }, intro_finished { first }.

import { track } from '../analytics.js';
import { music } from '../audio/music.js';

export const INTRO_SEEN = 'second-growth-intro-seen';
const FILM = 'assets/intro/intro-film';
const FILM_1080 = 'assets/intro/intro-film-1080'; // (7.5 MB to the 720p's 3.8: big screens on good connections only)
const FILM_MAP = 'pnw';   // (the film is of the PNW farm, and ends at its first view)
const FADE_MS = 900;
const START_GRACE_MS = 4000; // (the game is ready but the film hasn't started: how long it may still take)

// Does this first visit get the film? Automated browsers (navigator.webdriver: every headless check
// and capture tool) don't get it unless the address asks (?intro=1, tools/intro-browser-check.mjs),
// and neither do Save-Data connections (5 MB). ?intro=0 turns it off. Once per device either way.
export function introWanted(map) {
  const asked = new URLSearchParams(location.search).get('intro');
  if (asked === '0' || map !== FILM_MAP) return false;
  if (asked !== '1' && (navigator.webdriver || navigator.connection?.saveData)) return false;
  try { return !localStorage.getItem(INTRO_SEEN); } catch { return false; } // (no storage: it would play on every visit)
}

// Which copy of the film: the 1080p only where it would show (drawn at least 600 CSS pixels and 900
// device pixels tall: a laptop or desktop, not a phone) and the connection can afford it (no Save-Data,
// 4G or unknown); the 720p otherwise. The film is drawn 'cover' in landscape and 'contain' upright
// (styles.css), so its drawn height is the larger of the window's height and a 16:9 width, or just
// the 16:9 width upright. Even when it picks the 1080p, the 720p is the fallback source.
export function filmSize({ width = innerWidth, height = innerHeight, dpr = devicePixelRatio || 1, connection = navigator.connection } = {}) {
  const drawn = width > height ? Math.max(height, width * 9 / 16) : width * 9 / 16;
  const big = drawn >= 600 && drawn * dpr >= 900;
  const good = !connection?.saveData && (!connection?.effectiveType || connection.effectiveType === '4g');
  return big && good ? 1080 : 720;
}

// One showing of the film. `first`: a first visit (fades into the waiting farm, held until ready);
// otherwise a replay from a menu. `done` resolves with how it ended: 'finished' | 'skipped' | 'failed'.
export class IntroFilm {
  constructor({ first = false } = {}) {
    this.first = first;
    this.ready = !first;      // (the game behind it: a replay plays over a game already running)
    this.ended = false; this.started = false; this.closed = false;
    this.done = new Promise(resolve => { this.resolve = resolve; });
    music.hold?.(true);
    try { localStorage.setItem(INTRO_SEEN, '1'); } catch { /* storage unavailable */ }
    this.build();
    this.play();
  }

  // Covering the whole view: main.js skips drawing the farm underneath while this is true.
  get covering() { return !this.closed && !this.fading; }

  build() {
    const el = this.el = document.createElement('div');
    el.id = 'intro'; el.className = 'intro';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Intro film. Press Escape or tap to skip.');
    el.innerHTML = `<video playsinline preload="auto" disablepictureinpicture disableremoteplayback></video>
      <div class="intro-bar"><button type="button" class="intro-sound" hidden></button><button type="button" class="intro-skip">Skip <span aria-hidden="true">›</span></button></div>
      <p class="intro-hint" hidden>Tap to skip</p>`;
    const v = this.video = el.querySelector('video');
    // WebM (VP9 + Opus) where the browser plays it, MP4 (H.264 + AAC) otherwise: Safari mostly. On a
    // big screen (filmSize) the 1080p MP4 first (no 1080p WebM: it saved 2%, and every browser this
    // picks plays H.264); the 720p after it, so a 1080p that fails or can't play falls through.
    this.size = filmSize();
    const sources = [['webm', 'video/webm; codecs="vp9, opus"'], ['mp4', 'video/mp4; codecs="avc1.64001f, mp4a.40.2"']].map(([ext, type]) => [`${FILM}.${ext}`, type]);
    if (this.size === 1080) sources.unshift([`${FILM_1080}.mp4`, 'video/mp4; codecs="avc1.640028, mp4a.40.2"']);
    for (const [src, type] of sources) {
      if (!v.canPlayType(type)) continue;
      const s = document.createElement('source'); s.src = src; s.type = type; v.append(s);
    }
    v.addEventListener('ended', () => { this.ended = true; this.maybeFinish(); });
    v.addEventListener('playing', () => this.onPlaying(), { once: true });
    // (a <source> that fails: the browser tries the next one, so only the last one's error ends it)
    v.addEventListener('error', e => { if (e.target === v || e.target === v.querySelector('source:last-of-type')) this.fail(); }, true);
    this.soundBtn = el.querySelector('.intro-sound');
    this.soundBtn.addEventListener('click', e => { e.stopPropagation(); this.setMuted(!v.muted); });
    el.querySelector('.intro-skip').addEventListener('click', e => { e.stopPropagation(); this.skip(); });
    el.addEventListener('click', () => this.skip()); // (a tap anywhere else)
    for (const type of ['pointerdown', 'pointerup', 'wheel', 'touchstart', 'contextmenu']) el.addEventListener(type, e => e.stopPropagation(), { passive: true }); // (the camera stays at the film's last view)
    this.onKey = e => {
      if (this.closed || this.fading) return;
      e.stopImmediatePropagation(); // (the game behind it hears no keys while the film plays)
      if (e.key === 'Escape' && e.type === 'keydown') { e.preventDefault(); this.skip(); }
    };
    for (const type of ['keydown', 'keyup']) window.addEventListener(type, this.onKey, true);
    document.body.append(el);
    document.documentElement.classList.add('intro-on');
    if (!v.querySelector('source')) this.fail();
  }

  // Sound first; muted where the browser refuses (autoplay rules), with the sound button showing.
  async play() {
    const v = this.video;
    if (this.closed || !v.querySelector('source')) return;
    v.muted = false;
    try { await v.play(); }
    catch (err) {
      if (this.closed) return;
      if (err?.name !== 'NotAllowedError') { if (err?.name !== 'AbortError') this.fail(); return; }
      v.muted = true;
      try { await v.play(); } catch { this.fail(); return; }
    }
    this.showSound();
  }

  setMuted(m) { this.video.muted = m; this.showSound(); if (!m && this.video.paused && !this.ended) this.video.play().catch(() => {}); }
  showSound() {
    const b = this.soundBtn, m = this.video.muted;
    b.hidden = false;
    b.classList.toggle('off', m);
    b.innerHTML = m ? '<span aria-hidden="true">🔇</span> Sound on' : '<span aria-hidden="true">🔊</span> Sound off';
    b.setAttribute('aria-pressed', String(!m));
  }

  onPlaying() {
    if (this.closed) return;
    this.started = true;
    this.el.classList.add('playing');
    if (matchMedia('(pointer: coarse)').matches) this.el.querySelector('.intro-hint').hidden = false;
    track('intro_started', { first: this.first, muted: this.video.muted, size: this.size, played: /-1080\./.test(this.video.currentSrc) ? 1080 : 720 });
  }

  // The game behind is drawn and ready (main.js, a first visit).
  gameReady() {
    this.ready = true;
    if (this.closed) return;
    // (not started by now: it isn't coming in time, so the farm opens as it would without it)
    // (not started yet: a fast computer can be ready before the film has buffered its first frames,
    // so it gets a few seconds more, the loading screen still up; after that it isn't coming)
    if (!this.started) {
      this.grace = setTimeout(() => { if (!this.started) this.fail(); else this.gameReady(); }, START_GRACE_MS);
      this.video.addEventListener('playing', () => { clearTimeout(this.grace); this.gameReady(); }, { once: true });
      return;
    }
    this.maybeFinish();
    // A film that stalls (a dropped connection) mustn't hold the farm: 6 s without moving, in a
    // visible tab, and it fades out where it is.
    let last = -1, still = 0;
    clearInterval(this.watchdog);
    this.watchdog = setInterval(() => {
      if (this.closed || this.fading) { clearInterval(this.watchdog); return; }
      if (document.hidden || this.ended) return;
      const t = this.video.currentTime;
      still = t === last ? still + 1 : 0; last = t;
      if (still >= 6) { clearInterval(this.watchdog); this.fadeOut('failed'); }
    }, 1000);
  }

  maybeFinish() {
    if (!this.ended || !this.ready || this.closed || this.fading) return;
    track('intro_finished', { first: this.first });
    this.fadeOut('finished');
  }

  skip() {
    if (this.closed || this.fading) return;
    if (!this.started) { this.fail(); return; }
    track('intro_skipped', { second: Math.round(this.video.currentTime * 10) / 10, first: this.first });
    // (skipped before the game is ready: the loading screen behind it shows until it is)
    this.fadeOut('skipped', this.ready ? 350 : 0);
  }

  fail() {
    if (this.closed) return;
    this.close('failed'); // (silently: the farm opens as it would without the film)
  }

  // The farm underneath gets two frames drawn before the film fades off it (main.js stops drawing
  // it while the film covers the screen).
  fadeOut(how, ms = FADE_MS) {
    this.fading = true;
    this.video.pause();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this.el.style.transitionDuration = `${ms}ms`;
      this.el.classList.add('fading');
      setTimeout(() => this.close(how), ms);
    }));
  }

  close(how) {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.watchdog); clearTimeout(this.grace);
    for (const type of ['keydown', 'keyup']) window.removeEventListener(type, this.onKey, true);
    this.video.pause(); this.video.removeAttribute('src');
    for (const s of this.video.querySelectorAll('source')) s.remove();
    this.video.load(); // (lets the browser drop the download and decoder)
    this.el.remove();
    document.documentElement.classList.remove('intro-on');
    music.hold?.(false);
    this.how = how;
    this.resolve(how);
  }
}
