// The soundtrack and the valley's sounds.
// Music: real lo-fi tracks (public domain, see tracks.js), shuffled and crossfaded, streamed one
// at a time so only what's playing gets downloaded. Each map has its own procedural
// nature mix, following local habitat, wildlife, weather and time of day.

import { TRACKS } from './tracks.js';
import { SOUNDSCAPES, BIRD_PHRASES, PROMINENT_CALLS, natureMix, natureCallRates } from './nature.js';

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
    this.activeSources = new Set(); this.cooldowns = new Map(); this.nextBird = 0;
    this.callDue = new Map(); this.foregroundUntil = 0;
  }

  // Browsers only allow audio after the player has clicked or pressed something.
  start() {
    // (an iPhone can refuse to start the audio device, say during a call: try again on the next tap)
    if (this.ctx) { if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume().catch(() => {}); this.syncPlayback(); return; }
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
    this.noise = this.makeNoise(11);
    this.startNature();
    this.applyVolumes();
    this.timer = setInterval(() => { if (this.natureOn && !this.muted && this.ctx.state === 'running') this.maybeBird(); }, 250);
    this.callTimer = setInterval(() => { if (this.natureOn && !this.muted && this.ctx.state === 'running') this.calls(0.25); }, 250);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) { this.ctx.suspend(); this.decks.forEach(d => d.el.pause()); }
      else { this.ctx.resume().catch(() => {}); this.syncPlayback(); }
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
    this.updateNature();
  }

  // ------------------------------------------------------------ nature
  startNature() {
    const ctx = this.ctx;
    this.callGain = ctx.createGain(); this.callGain.connect(this.natureGain);
    // Independent noise beds and offsets avoid a short, synchronized noise loop. Modulation
    // sits before each level control so a silent creek really is silent, even between updates.
    const bed = (name, type, hz, q, rate, speed, depth) => {
      const source = ctx.createBufferSource(); source.buffer = this.noise; source.loop = true; source.playbackRate.value = rate;
      const filter = ctx.createBiquadFilter(); filter.type = type; filter.frequency.value = hz; filter.Q.value = q;
      const gain = this[name + 'Gain'] = ctx.createGain(); gain.gain.value = 0;
      const amp = ctx.createGain(); amp.gain.value = 1 - depth;
      const lfo = ctx.createOscillator(), amount = ctx.createGain(); lfo.frequency.value = speed; amount.gain.value = depth;
      lfo.connect(amount).connect(amp.gain); lfo.start();
      source.connect(filter).connect(amp).connect(gain).connect(this.natureGain);
      source.start(0, Math.random() * this.noise.duration);
    };
    bed('rain', 'lowpass', 2800, 0.7, 1, 0.19, 0.12);
    bed('creek', 'bandpass', 850, 0.8, 0.7, 0.23, 0.24);
    bed('river', 'lowpass', 480, 0.7, 0.55, 0.11, 0.18);
    bed('wind', 'bandpass', 380, 0.5, 0.45, 0.07, 0.45);
    bed('leaves', 'highpass', 1800, 0.7, 0.9, 0.17, 0.3);
    bed('bugs', 'bandpass', 5600, 5, 1.3, 23, 0.4);
    bed('surf', 'lowpass', 1100, 0.7, 0.65, 0.09, 0.48);
    bed('reef', 'lowpass', 220, 0.7, 0.5, 0.06, 0.15);
    this.updateNature();
  }

  setLand(L) {
    if (this.land?.map !== L.map) {
      this.cooldowns.clear(); this.callDue.clear(); this.foregroundUntil = 0; this.nextBird = 0;
      if (this.ctx && this.callGain) {
        // Retire already scheduled calls as well as the current voice when switching maps.
        const t = this.ctx.currentTime, old = this.callGain;
        old.gain.setTargetAtTime(0, t, 0.035);
        for (const source of this.activeSources) source.stop(t + 0.15);
        setTimeout(() => old.disconnect(), 250);
        this.callGain = this.ctx.createGain(); this.callGain.connect(this.natureGain);
      }
    }
    this.land = L;
    this.updateNature();
  }
  updateNature() {
    if (!this.ctx || !this.rainGain) return;
    const mix = natureMix(this.land, this.weather, this.season), t = this.ctx.currentTime;
    for (const name of ['rain', 'wind', 'creek', 'river', 'leaves', 'surf', 'reef', 'bugs']) this[name + 'Gain'].gain.setTargetAtTime(mix[name], t, name === 'rain' ? 2.5 : 1.5);
  }
  birdLife() { return natureMix(this.land, this.weather, this.season).birds; }
  calls(dt) {
    if (!this.ctx || !this.land) return;
    const t = this.ctx.currentTime;
    const rates = natureCallRates(this.land, this.weather, this.season), eligible = new Set(rates.map(c => c.voice));
    for (const voice of this.callDue.keys()) if (!eligible.has(voice)) this.callDue.delete(voice);
    for (const { voice, rate } of rates) {
      const prominent = PROMINENT_CALLS[voice];
      if (prominent) {
        const wait = ([min, max]) => min + Math.random() * (max - min);
        if (!this.callDue.has(voice)) this.callDue.set(voice, t + wait(prominent.first));
        if (t < this.callDue.get(voice) || t < this.foregroundUntil || t < (this.cooldowns.get(voice) ?? 0)) continue;
        this[voice](); this.foregroundUntil = t + prominent.duration + 0.5;
        this.callDue.set(voice, t + wait(prominent.repeat));
        this.cooldowns.set(voice, t + prominent.duration + 0.5);
        continue;
      }
      if (t < (this.cooldowns.get(voice) ?? 0) || Math.random() >= 1 - Math.exp(-rate * dt)) continue;
      this[voice]();
      const gap = { lion: 22, howler: 16, siamang: 18, hyena: 12, barredOwl: 10, owl: 9, drum: 8, reefSnap: 0.15 }[voice] ?? 3;
      this.cooldowns.set(voice, t + gap);
    }
  }
  // Each source releases its gain/filter nodes after playback; a finished voice releases its
  // shared panner and distance filter. Long sessions don't accumulate silent output graphs.
  trackSource(source, nodes, dest) {
    const voice = dest._voice;
    if (voice) voice.count++;
    this.activeSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
      source.disconnect(); nodes.forEach(n => n.disconnect());
      if (voice && --voice.count === 0) voice.nodes.forEach(n => n.disconnect());
    };
  }
  voice(pan = Math.random() * 1.4 - 0.7, far = 0.5, edge = 2400) {
    const ctx = this.ctx, p = ctx.createStereoPanner ? ctx.createStereoPanner() : null, lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = edge * (1 - far * 0.55); // distant calls lose their edge
    if (p) { p.pan.value = pan; lp.connect(p).connect(this.callGain); } else lp.connect(this.callGain);
    lp._voice = { count: 0, nodes: p ? [lp, p] : [lp] };
    return lp;
  }
  tone(dest, type, f0, f1, t, dur, peak) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); this.trackSource(o, [g], dest); o.start(t); o.stop(t + dur + 0.05);
  }
  frog() { // a chorus frog's rising "krek-ek"
    const d = this.voice(undefined, 0.3), t = this.ctx.currentTime + 0.02, f = 600 + Math.random() * 400;
    for (let k = 0; k < 2 + (Math.random() < 0.5 ? 1 : 0); k++) this.tone(d, 'square', f, f * 1.3, t + k * 0.13, 0.08, 0.012);
  }
  cricket() {
    const d = this.voice(undefined, 0.2, 7000), t = this.ctx.currentTime + 0.02;
    for (let k = 0; k < 3; k++) this.tone(d, 'sine', 4300, 4200, t + k * 0.05, 0.035, 0.006);
  }
  owl() { // great horned owl: "hoo, hoo-hoo, hoo"
    const d = this.voice(undefined, 0.6), t = this.ctx.currentTime + 0.05;
    [[0, 0.32], [0.55, 0.16], [0.75, 0.16], [1.05, 0.4]].forEach(([at, len]) => this.tone(d, 'sine', 360, 330, t + at, len, 0.03));
  }
  hyena() { // the spotted hyena's rising "whoo-oop", two or three times
    const d = this.voice(undefined, 0.35, 4000), t = this.ctx.currentTime + 0.05;
    for (let k = 0, n = 2 + (Math.random() < 0.5 ? 1 : 0); k < n; k++) {
      this.tone(d, 'sine', 260, 900, t + k * 1.6, 1.1, 0.075);
      this.tone(d, 'triangle', 520, 1800, t + k * 1.6, 1.1, 0.018);
    }
  }
  roar(d, t, f0, f1, dur, peak) { // a throaty roar: a low buzzing tone with breath noise, swelling and fading
    const ctx = this.ctx, o = ctx.createOscillator(), n = ctx.createBufferSource(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    n.buffer = this.noise; lp.type = 'lowpass'; lp.frequency.value = 520;
    const ng = ctx.createGain(); ng.gain.value = 0.5;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); n.connect(ng).connect(lp); lp.connect(g).connect(d);
    this.trackSource(o, [], d); this.trackSource(n, [ng, lp, g], d);
    o.start(t); n.start(t); o.stop(t + dur + 0.05); n.stop(t + dur + 0.05);
  }
  lion() { // one long roar, then a run of grunts that slow and fade
    const d = this.voice(undefined, 0.35, 3800), t = this.ctx.currentTime + 0.05;
    this.roar(d, t, 110, 70, 1.8, 0.14);
    // Upper harmonics keep the low roar audible on small speakers.
    this.tone(d, 'triangle', 330, 210, t, 1.8, 0.04);
    for (let k = 0; k < 6; k++) this.roar(d, t + 2.2 + k * (0.55 + k * 0.08), 90, 70, 0.4, 0.08 * (1 - k * 0.12));
  }
  moo() { // a cow across the pasture: a long, low call that rises and falls
    const d = this.voice(undefined, 0.25, 3800), t = this.ctx.currentTime + 0.05;
    this.roar(d, t, 120, 165, 0.6, 0.075); this.roar(d, t + 0.55, 165, 110, 1.2, 0.09);
    this.tone(d, 'triangle', 360, 495, t, 0.6, 0.025);
    this.tone(d, 'triangle', 495, 330, t + 0.55, 1.2, 0.03);
  }
  howler() { // howler monkeys: a rolling, rising-and-falling roar from the canopy
    const d = this.voice(undefined, 0.8), t = this.ctx.currentTime + 0.05;
    for (let k = 0; k < 4; k++) this.roar(d, t + k * 0.9, 140 + Math.random() * 40, 95, 1.1, 0.045);
  }
  // Species-dependent phrases. Tropical seasons stay active, and seabirds keep their rough
  // calls. No local animal means no invented chorus; insects and weather still fill the space.
  birdPhrase(style) {
    const [f0, f1, dur, gap, count, type] = BIRD_PHRASES[style];
    const pitch = 0.94 + Math.random() * 0.12, pace = 0.93 + Math.random() * 0.14;
    const d = this.voice(undefined, 0.1 + Math.random() * 0.5, 10000), t = this.ctx.currentTime + 0.03;
    for (let k = 0; k < count; k++) {
      const lift = 1 + Math.sin(k * 1.9) * 0.13;
      this.tone(d, type, f0 * pitch * lift, f1 * pitch * lift, t + k * gap * pace, dur * pace, type === 'sawtooth' ? 0.008 : 0.016);
    }
    return count * gap * pace;
  }
  maybeBird() {
    if (!this.ctx || !this.land || this.ctx.currentTime < this.nextBird) return;
    const choices = Object.entries(SOUNDSCAPES[this.land.map]?.birds || {}).filter(([key]) => this.land.present.includes(key));
    const life = this.birdLife();
    if (!choices.length || Math.random() >= 1 - Math.exp(-0.38 * life * 0.25)) return;
    const [, style] = choices[Math.floor(Math.random() * choices.length)];
    const duration = this.birdPhrase(style);
    this.nextBird = this.ctx.currentTime + duration + 0.8 + Math.random() * 1.8;
  }
  noiseCall(dest, t, dur, peak, hz = 2200, q = 0.8) {
    const ctx = this.ctx, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = this.noise; f.type = 'bandpass'; f.frequency.value = hz; f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.015, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g).connect(dest); this.trackSource(n, [f, g], dest);
    n.start(t, Math.random() * (this.noise.duration - dur)); n.stop(t + dur + 0.02);
  }
  peeper() {
    const d = this.voice(undefined, 0.25, 6500), t = this.ctx.currentTime + 0.03;
    const f = 2900 + Math.random() * 450;
    for (let k = 0; k < 3; k++) this.tone(d, 'sine', f, f * 1.08, t + k * 0.9, 0.16, 0.012);
  }
  toad() {
    const d = this.voice(undefined, 0.35, 5000), t = this.ctx.currentTime + 0.03;
    for (let k = 0; k < 25; k++) this.tone(d, 'sine', 2200, 2200, t + k * 0.055, 0.04, 0.007);
  }
  dartfrog() {
    const d = this.voice(undefined, 0.25, 6000), t = this.ctx.currentTime + 0.03;
    for (let k = 0; k < 7; k++) this.tone(d, 'sine', 3200, 3400, t + k * 0.085, 0.045, 0.005);
  }
  treeFrog() {
    const d = this.voice(undefined, 0.4, 4500), t = this.ctx.currentTime + 0.03;
    for (let k = 0; k < 4; k++) this.tone(d, 'triangle', 850, 1100, t + k * 0.22, 0.12, 0.008);
  }
  barredOwl() {
    const d = this.voice(undefined, 0.5), t = this.ctx.currentTime + 0.03;
    [[0, 0.18], [0.24, 0.18], [0.48, 0.18], [0.74, 0.4], [1.5, 0.18], [1.74, 0.18], [1.98, 0.18], [2.24, 0.65]].forEach(([at, dur]) => this.tone(d, 'sine', 540, at > 2 ? 340 : 480, t + at, dur, 0.025));
  }
  barnOwl() {
    const d = this.voice(undefined, 0.45, 6500);
    this.noiseCall(d, this.ctx.currentTime + 0.03, 0.95, 0.04, 2800, 1.6);
  }
  drum() {
    const d = this.voice(undefined, 0.4), t = this.ctx.currentTime + 0.03;
    for (let k = 0; k < 14; k++) this.noiseCall(d, t + k * 0.11, 0.045, 0.06 * (1 - k * 0.035), 800, 2);
  }
  siamang() {
    const d = this.voice(undefined, 0.6, 4200), t = this.ctx.currentTime + 0.03;
    for (let k = 0; k < 5; k++) {
      const at = t + k * 0.9;
      this.tone(d, 'sine', 280, 340, at, 0.4, 0.03);
      this.tone(d, 'triangle', 650, 1000, at + 0.42, 0.3, 0.014);
    }
  }
  groundHornbill() {
    const d = this.voice(undefined, 0.6), t = this.ctx.currentTime + 0.03;
    for (let k = 0; k < 3; k++) this.tone(d, 'sine', 190, 145, t + k * 0.85, 0.5, 0.026);
  }
  hippo() {
    const d = this.voice(undefined, 0.6), t = this.ctx.currentTime + 0.03;
    for (let k = 0; k < 4; k++) this.roar(d, t + k * 0.42, 160, 110, 0.22, 0.018);
  }
  zebra() {
    const d = this.voice(undefined, 0.6), t = this.ctx.currentTime + 0.03;
    for (let k = 0; k < 3; k++) this.tone(d, 'triangle', 550, 900, t + k * 0.36, 0.22, 0.018);
  }
  reefSnap() {
    const d = this.voice(undefined, 0.15, 12000);
    this.noiseCall(d, this.ctx.currentTime + 0.01, 0.025, 0.035, 6500, 0.7);
  }
}

export const music = new Music();
