// The soundtrack and the valley's sounds.
// Music: real lo-fi tracks (public domain, see tracks.js), shuffled and crossfaded, streamed one
// at a time so only what's playing gets downloaded. Nature: rain, a creek and birdsong,
// synthesized live with Web Audio on their own bus, following the weather and the seasons.

import { TRACKS } from './tracks.js';

const FADE = 4;        // seconds of crossfade between tracks
const GAP = 1.5;       // quiet seconds after a track fails to load, before the next

// a few milliseconds of silent WAV, for unlocking audio on iOS
const SILENCE = (() => {
  const n = 64, b = new Uint8Array(44 + n), v = new DataView(b.buffer), str = (o, t) => [...t].forEach((c, k) => { b[o + k] = c.charCodeAt(0); });
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); str(36, 'data'); v.setUint32(40, n, true);
  b.fill(128, 44);
  return 'data:audio/wav;base64,' + btoa(String.fromCharCode(...b));
})();

export class Music {
  constructor() {
    this.ctx = null;
    this.musicOn = true; this.natureOn = true; this.muted = false;
    this.musicVol = 0.5; this.natureVol = 0.6;
    this.weather = 'clear'; this.season = 0;
    this.order = []; this.pos = -1; this.current = null; this.nowPlaying = null;
    this.listeners = [];
  }

  // Browsers only allow audio after the player has clicked or pressed something.
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume(); this.syncPlayback(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.out = ctx.createDynamicsCompressor();
    this.out.threshold.value = -18; this.out.ratio.value = 3;
    this.out.connect(ctx.destination);
    this.musicGain = ctx.createGain();
    this.musicGain.connect(this.out);
    this.natureGain = ctx.createGain();
    this.natureGain.connect(this.out);
    // two decks, so one track can fade out while the next fades in
    this.decks = [0, 1].map(() => {
      const el = new Audio();
      el.preload = 'none'; el.crossOrigin = 'anonymous';
      const gain = ctx.createGain(); gain.gain.value = 0;
      ctx.createMediaElementSource(el).connect(gain).connect(this.musicGain);
      const deck = { el, gain, track: null };
      el.addEventListener('ended', () => { if (this.current === deck) this.advance(0); });
      el.addEventListener('error', () => { if (this.current === deck) this.advance(GAP); });
      el.addEventListener('timeupdate', () => {
        // start the next track a little before this one ends
        if (this.current === deck && el.duration && el.duration - el.currentTime < FADE && !deck.handedOff) { deck.handedOff = true; this.advance(0); }
      });
      return deck;
    });
    this.noise = this.makeNoise(2);
    this.startNature();
    this.applyVolumes();
    this.timer = setInterval(() => { if (this.natureOn && !this.muted && this.ctx.state === 'running' && Math.random() < 0.012 * this.birdLife()) this.maybeBird(); }, 25);
    this.callTimer = setInterval(() => { if (this.natureOn && !this.muted && this.ctx.state === 'running') this.calls(0.25); }, 250);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) { this.ctx.suspend(); this.decks.forEach(d => d.el.pause()); }
      else { this.ctx.resume(); this.syncPlayback(); }
    });
    // iOS only lets a media element start inside a tap: start the first track now (it fades in),
    // and unlock the second deck with a moment of silence so later crossfades can play too
    this.syncPlayback();
    const spare = this.decks.find(d => d !== this.current);
    if (spare) { spare.el.src = SILENCE; spare.el.play().then(() => spare.el.pause()).catch(() => {}); }
  }

  makeNoise(seconds) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds, this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // ------------------------------------------------------------ the soundtrack
  // a fresh shuffle each time through, never repeating the last track first
  nextTrack() {
    if (this.pos + 1 >= this.order.length) {
      const last = this.order[this.order.length - 1];
      this.order = TRACKS.map((_, k) => k).sort(() => Math.random() - 0.5);
      if (this.order.length > 1 && this.order[0] === last) this.order.push(this.order.shift());
      this.pos = -1;
    }
    return TRACKS[this.order[++this.pos]];
  }
  // Fade the current track out and the next one in on the other deck.
  advance(delay = 0) {
    if (!this.ctx || !TRACKS.length) return;
    const from = this.current, to = this.decks.find(d => d !== from) || this.decks[0];
    const track = this.nextTrack(), t = this.ctx.currentTime + delay;
    to.track = track; to.handedOff = false;
    to.el.src = track.file; to.el.currentTime = 0;
    to.gain.gain.cancelScheduledValues(t); to.gain.gain.setValueAtTime(0, t); to.gain.gain.linearRampToValueAtTime(1, t + FADE);
    if (from) { from.gain.gain.cancelScheduledValues(t); from.gain.gain.setValueAtTime(from.gain.gain.value, t); from.gain.gain.linearRampToValueAtTime(0, t + FADE); setTimeout(() => { if (this.current !== from) from.el.pause(); }, (delay + FADE + 0.5) * 1000); }
    this.current = to;
    this.nowPlaying = track;
    setTimeout(() => { if (this.current === to && this.wantMusic()) to.el.play().catch(() => {}); }, delay * 1000);
    for (const fn of this.listeners) fn(track);
  }
  wantMusic() { return this.musicOn && !this.muted && !document.hidden; }
  // Play or pause to match the settings (music off pauses the stream instead of downloading silence).
  syncPlayback() {
    if (!this.ctx) return;
    if (!this.wantMusic()) { this.decks.forEach(d => d.el.pause()); return; }
    if (!this.current) { this.advance(0); return; }
    if (this.current.el.paused) this.current.el.play().catch(() => {});
  }
  skip() { if (this.current) this.advance(0); }
  onTrack(fn) { this.listeners.push(fn); }

  // ------------------------------------------------------------ settings
  set({ music, nature, muted, musicVol, natureVol }) {
    if (music != null) this.musicOn = music;
    if (nature != null) this.natureOn = nature;
    if (muted != null) this.muted = muted;
    if (musicVol != null) this.musicVol = musicVol;
    if (natureVol != null) this.natureVol = natureVol;
    this.applyVolumes();
    this.syncPlayback();
  }
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.setTargetAtTime(this.muted || !this.musicOn ? 0 : this.musicVol * 0.7, t, 0.3);
    this.natureGain.gain.setTargetAtTime(this.muted || !this.natureOn ? 0 : this.natureVol, t, 0.3);
  }
  // The game tells us about the weather and season so the nature sounds can follow.
  setScene(weather, season) {
    this.weather = weather; this.season = season;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const rain = weather === 'rain' ? 0.16 : weather === 'snow' ? 0.035 : 0;
    this.rainGain.gain.setTargetAtTime(rain, t, 2.5);
  }

  // ------------------------------------------------------------ nature
  startNature() {
    const ctx = this.ctx;
    // rain: soft filtered noise, faded in and out with the weather
    const rain = ctx.createBufferSource(); rain.buffer = this.noise; rain.loop = true;
    const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 2400;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
    rain.connect(rf).connect(this.rainGain).connect(this.natureGain);
    rain.start();
    // a creek: low, burbling band of noise that slowly breathes
    const creek = ctx.createBufferSource(); creek.buffer = this.noise; creek.loop = true; creek.playbackRate.value = 0.7;
    const cf = ctx.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 520; cf.Q.value = 0.9;
    const cg = ctx.createGain(); cg.gain.value = 0.035;
    const lfo = ctx.createOscillator(), la = ctx.createGain(); lfo.frequency.value = 0.13; la.gain.value = 0.012;
    lfo.connect(la).connect(cg.gain); lfo.start();
    creek.connect(cf).connect(cg).connect(this.natureGain);
    creek.start();
    this.creekGain = cg;
    // wind over open ground: a low, gusting rush that fades as the land fills in
    const wind = ctx.createBufferSource(); wind.buffer = this.noise; wind.loop = true; wind.playbackRate.value = 0.45;
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 420; wf.Q.value = 0.5;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    const gust = ctx.createOscillator(), ga = ctx.createGain(); gust.frequency.value = 0.07; ga.gain.value = 0.35;
    const windAmp = ctx.createGain(); windAmp.gain.value = 0.65;
    gust.connect(ga).connect(windAmp.gain); gust.start();
    wind.connect(wf).connect(windAmp).connect(this.windGain).connect(this.natureGain);
    wind.start();
    // insects: a thin, shimmering buzz (the Amazon's constant hum, Serengeti cicadas)
    const bug = ctx.createBufferSource(); bug.buffer = this.noise; bug.loop = true; bug.playbackRate.value = 1.3;
    const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 5600; bf.Q.value = 9;
    this.bugGain = ctx.createGain(); this.bugGain.gain.value = 0;
    const trem = ctx.createOscillator(), ta = ctx.createGain(), bugAmp = ctx.createGain(); trem.frequency.value = 23; ta.gain.value = 0.4; bugAmp.gain.value = 0.6;
    trem.connect(ta).connect(bugAmp.gain); trem.start();
    bug.connect(bf).connect(bugAmp).connect(this.bugGain).connect(this.natureGain);
    bug.start();
  }

  // ------------------------------------------------------------ the living landscape
  // The game describes the land around the camera every second or so: how bare it is, how many
  // species live here, how close the water is, and whether it's dusk, night or dawn. Bare,
  // wind-scoured ground gives way to birdsong, frogs, insects and each map's own night calls.
  setLand(L) {
    this.land = L;
    if (!this.ctx) return;
    const t = this.ctx.currentTime, wet = this.weather === 'rain';
    this.windGain.gain.setTargetAtTime((0.018 + 0.09 * L.bare) * (wet ? 1.3 : 1) * (1 - 0.45 * L.health), t, 3);
    this.creekGain.gain.setTargetAtTime(0.006 + 0.05 * L.water, t, 1.5);
    const bugs = L.map === 'amazon' ? 0.006 + 0.01 * L.health + 0.012 * L.night
      : L.map === 'serengeti' ? (L.dry ? 0.01 * (1 - L.night) * (0.4 + L.health) : 0.002) : 0;
    this.bugGain.gain.setTargetAtTime(wet ? bugs * 0.2 : bugs, t, 3);
  }
  // how lively the birdsong is: more species and healthier land, a dawn chorus, quiet at night
  birdLife() {
    const L = this.land;
    if (!L) return 1;
    return Math.min(1.6, Math.max(0.12, 0.2 + L.species / 18 + L.health * 0.4)) * (1 - L.night * 0.9) * (1 + L.dawn * 1.8);
  }
  // Occasional calls, each only if the animal lives here: frogs at dusk by the wetlands, owls on
  // Hollis nights, howler monkeys roaring at an Amazon dawn, hyenas whooping and lions roaring on
  // the Serengeti after dark, crickets on summer nights.
  calls(dt) {
    const L = this.land;
    if (!L || this.weather === 'snow') return;
    const r = p => Math.random() < p * dt, has = k => L.present.includes(k);
    const dusk = Math.max(L.night, L.dusk);
    if (L.wet > 0.05 && r(dusk * L.wet * 1.4)) this.frog();
    if (L.map === 'pnw' && (this.season === 1 || this.season === 2) && r(L.night * 0.8)) this.cricket();
    if (L.map === 'pnw' && has('owl') && r(L.night * 0.05)) this.owl();
    if (L.map === 'amazon' && has('howler') && r(L.dawn * 0.09 + L.dusk * 0.02)) this.howler();
    if (L.map === 'serengeti' && has('hyena') && r(L.night * 0.035)) this.hyena();
    if (L.map === 'serengeti' && has('lion') && r(dusk * 0.012)) this.lion();
    if (L.map === 'serengeti' && r((1 - L.night) * 0.02 * (0.3 + L.health))) this.dove();
  }
  voice(pan = Math.random() * 1.4 - 0.7, far = 0.5) {
    const ctx = this.ctx, p = ctx.createStereoPanner ? ctx.createStereoPanner() : null, lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2400 - far * 1600; // distant calls lose their edge
    if (p) { p.pan.value = pan; lp.connect(p).connect(this.natureGain); } else lp.connect(this.natureGain);
    return lp;
  }
  tone(dest, type, f0, f1, t, dur, peak) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  frog() { // a chorus frog's rising "krek-ek"
    const d = this.voice(undefined, 0.3), t = this.ctx.currentTime + 0.02, f = 600 + Math.random() * 400;
    for (let k = 0; k < 2 + (Math.random() < 0.5 ? 1 : 0); k++) this.tone(d, 'square', f, f * 1.3, t + k * 0.13, 0.08, 0.012);
  }
  cricket() {
    const d = this.voice(undefined, 0.2), t = this.ctx.currentTime + 0.02;
    for (let k = 0; k < 3; k++) this.tone(d, 'sine', 4300, 4200, t + k * 0.05, 0.035, 0.006);
  }
  owl() { // great horned owl: "hoo, hoo-hoo, hoo"
    const d = this.voice(undefined, 0.6), t = this.ctx.currentTime + 0.05;
    [[0, 0.32], [0.55, 0.16], [0.75, 0.16], [1.05, 0.4]].forEach(([at, len]) => this.tone(d, 'sine', 360, 330, t + at, len, 0.03));
  }
  dove() { // ring-necked dove: "work HARD-er"
    const d = this.voice(undefined, 0.5), t = this.ctx.currentTime + 0.05;
    [[0, 0.22, 560], [0.3, 0.34, 640], [0.72, 0.24, 540]].forEach(([at, len, f]) => this.tone(d, 'sine', f, f * 0.92, t + at, len, 0.014));
  }
  hyena() { // the spotted hyena's rising "whoo-oop", two or three times
    const d = this.voice(undefined, 0.7), t = this.ctx.currentTime + 0.05;
    for (let k = 0, n = 2 + (Math.random() < 0.5 ? 1 : 0); k < n; k++) this.tone(d, 'sine', 260, 900, t + k * 1.6, 1.1, 0.035);
  }
  roar(d, t, f0, f1, dur, peak) { // a throaty roar: a low buzzing tone with breath noise, swelling and fading
    const ctx = this.ctx, o = ctx.createOscillator(), n = ctx.createBufferSource(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    n.buffer = this.noise; lp.type = 'lowpass'; lp.frequency.value = 520;
    const ng = ctx.createGain(); ng.gain.value = 0.5;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); n.connect(ng).connect(lp); lp.connect(g).connect(d);
    o.start(t); n.start(t); o.stop(t + dur + 0.05); n.stop(t + dur + 0.05);
  }
  lion() { // one long roar, then a run of grunts that slow and fade
    const d = this.voice(undefined, 0.75), t = this.ctx.currentTime + 0.05;
    this.roar(d, t, 110, 70, 1.8, 0.06);
    for (let k = 0; k < 6; k++) this.roar(d, t + 2.2 + k * (0.55 + k * 0.08), 90, 70, 0.4, 0.035 * (1 - k * 0.12));
  }
  howler() { // howler monkeys: a rolling, rising-and-falling roar from the canopy
    const d = this.voice(undefined, 0.8), t = this.ctx.currentTime + 0.05;
    for (let k = 0; k < 4; k++) this.roar(d, t + k * 0.9, 140 + Math.random() * 40, 95, 1.1, 0.045);
  }
  // A songbird phrase now and then: more in spring and summer, none in the rain.
  maybeBird() {
    if (this.weather === 'rain' || this.weather === 'snow') return;
    const chance = [1, 0.8, 0.35, 0.12][this.season] ?? 0.5;
    if (Math.random() > chance) return;
    const ctx = this.ctx, t0 = ctx.currentTime + 0.05;
    const base = 2200 + Math.random() * 1800, notes = 2 + Math.floor(Math.random() * 5);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; pan.connect(this.natureGain); }
    for (let k = 0; k < notes; k++) {
      const t = t0 + k * (0.09 + Math.random() * 0.06), o = ctx.createOscillator(), g = ctx.createGain();
      const f = base * (1 + (Math.random() - 0.4) * 0.35);
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (0.75 + Math.random() * 0.6), t + 0.07);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.018, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.08);
      o.connect(g).connect(pan || this.natureGain);
      o.start(t); o.stop(t + 0.1);
    }
  }
}

export const music = new Music();
