// The soundtrack and the valley's sounds.
// Music: real lo-fi tracks (public domain, see tracks.js), shuffled and crossfaded, streamed one
// at a time so only what's playing gets downloaded. Each map has its own recorded
// nature mix, following local habitat, wildlife, weather and time of day.

import { TRACKS } from './tracks.js';
import { SOUNDSCAPES, PROMINENT_CALLS, natureMix, natureCallRates } from './nature.js';
import { RUT_SOUNDS, RACK_PITCH, soundFile } from './sounds.js';
import { FIELD_RECORDINGS, MAP_RECORDINGS, RECORDED_BEDS } from './recordings.js';
import { seamlessLoop } from './loop.js';
import { makeRainBuffer, prepareRainBuffer, createRainSource } from './rain.js';

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
    this.rutClips = new Map(); this.rutLast = 0; this.rutBulls = new Map();
    this.fieldClips = new Map(); this.fieldLoads = new Map(); this.fieldRetry = new Map();
    this.fieldBeds = new Map();
    this.rainClip = null;
    this.started = false; this.ready = false; this.preparing = null;
  }

  // Prepare in separate tasks while the welcome screen is open. Nothing plays or
  // downloads until start(); an early click can unlock the elements before wiring finishes.
  prepare() {
    if (this.preparing) return this.preparing;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return Promise.resolve();
    let ctx;
    try { ctx = new AC(); } catch { return Promise.resolve(); }
    this.ctx = ctx;
    this.decks = [0, 1].map(() => {
      const el = new Audio();
      el.preload = 'none'; el.crossOrigin = 'anonymous';
      return { el, gain: null, track: null, unlocked: false, unlocking: false };
    });
    const nextTask = () => new Promise(resolve => setTimeout(resolve, 0));
    this.preparing = (async () => {
      await nextTask();
      this.out = ctx.createDynamicsCompressor();
      this.out.threshold.value = -18; this.out.ratio.value = 3;
      this.out.connect(ctx.destination);
      this.musicGain = ctx.createGain(); this.musicGain.connect(this.out);
      this.natureGain = ctx.createGain(); this.natureGain.connect(this.out);
      for (const deck of this.decks) {
        await nextTask();
        const { el } = deck, gain = deck.gain = ctx.createGain();
        gain.gain.value = 0;
        ctx.createMediaElementSource(el).connect(gain).connect(this.musicGain);
        el.addEventListener('ended', () => { if (this.current === deck) this.advance(0); });
        el.addEventListener('error', () => { if (this.current === deck) this.advance(GAP); });
        el.addEventListener('timeupdate', () => {
          if (this.current === deck && el.duration && el.duration - el.currentTime < FADE && !deck.handedOff) { deck.handedOff = true; this.advance(0); }
        });
      }
      await nextTask();
      this.startNature();
      this.ready = true;
      if (document.hidden) ctx.suspend().catch(() => {});
      this.applyVolumes();
      this.timer = setInterval(() => { if (this.started && this.natureOn && !this.muted && ctx.state === 'running') this.maybeBird(); }, 250);
      this.callTimer = setInterval(() => { if (this.started && this.natureOn && !this.muted && ctx.state === 'running') this.calls(0.25); }, 250);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { ctx.suspend().catch(() => {}); this.decks.forEach(d => d.el.pause()); }
        else if (this.started) this.start();
      });
      if (this.started) { this.syncPlayback(); this.updateNature(); }
    })();
    return this.preparing;
  }

  // Keep only browser unlocking on the gesture stack. Retry on later taps when a
  // browser blocks autoplay after navigation, or the audio device was interrupted.
  start() {
    const preparing = this.prepare();
    if (!this.ctx) return preparing;
    this.started = true;
    if (!document.hidden && this.ctx.state !== 'running') this.ctx.resume().then(() => this.syncPlayback()).catch(() => {});
    for (const deck of this.decks) if (!document.hidden && !deck.unlocked && !deck.unlocking && !deck.track) {
      deck.unlocking = true;
      deck.el.src = SILENCE;
      deck.el.play().then(() => {
        deck.unlocked = true;
        // Preparation may already have assigned a real track to this element.
        if (!deck.track) deck.el.pause();
      }).catch(() => {}).finally(() => { deck.unlocking = false; });
    }
    this.syncPlayback();
    return preparing;
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
    if (!this.ready || !TRACKS.length) return;
    const from = this.current, to = this.decks.find(d => d !== from) || this.decks[0];
    const track = this.nextTrack(), t = this.ctx.currentTime + delay;
    to.track = track; to.handedOff = false;
    to.el.src = track.file; to.el.currentTime = 0;
    to.gain.gain.cancelScheduledValues(t); to.gain.gain.setValueAtTime(0, t); to.gain.gain.linearRampToValueAtTime(1, t + FADE);
    if (from) { from.gain.gain.cancelScheduledValues(t); from.gain.gain.setValueAtTime(from.gain.gain.value, t); from.gain.gain.linearRampToValueAtTime(0, t + FADE); setTimeout(() => { if (this.current !== from) from.el.pause(); }, (delay + FADE + 0.5) * 1000); }
    this.current = to;
    this.nowPlaying = track;
    const play = () => { if (this.current === to && this.wantMusic()) to.el.play().catch(() => {}); };
    if (delay) setTimeout(play, delay * 1000); else play();
    for (const fn of this.listeners) fn(track);
  }
  wantMusic() { return this.musicOn && !this.muted && !document.hidden; }
  // Play or pause to match the settings (music off pauses the stream instead of downloading silence).
  syncPlayback() {
    if (!this.ready || !this.started) return;
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
    this.updateNature();
  }
  applyVolumes() {
    if (!this.musicGain || !this.natureGain) return;
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
    // Wildlife and habitat beds are recorded; rain is a steady synthesized hiss.
    for (const name of ['rain', ...Object.keys(RECORDED_BEDS)]) {
      const gain = this[name + 'Gain'] = ctx.createGain();
      gain.gain.value = 0; gain.connect(this.natureGain);
    }
  }

  rainBuffer() {
    return this.rainClip ??= makeRainBuffer(this.ctx);
  }

  setLand(L) {
    if (this.land?.map !== L.map) {
      this.cooldowns.clear(); this.callDue.clear(); this.foregroundUntil = 0; this.nextBird = 0; this.rutBulls.clear();
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
    if (!this.ctx || !this.rainGain || !this.started) return;
    const mix = natureMix(this.land, this.weather, this.season), t = this.ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(mix.rain, t, 2.5);
    if (mix.rain > 0 && this.natureOn && !this.muted && !this.fieldBeds.has('rain')) {
      this.rainLoading ??= (this.rainClip ? Promise.resolve(this.rainClip) : prepareRainBuffer(this.ctx)).then(clip => { this.rainClip = clip; return clip; });
      this.rainLoading.then(clip => {
        if (this.fieldBeds.has('rain') || !this.natureOn || this.muted || !natureMix(this.land, this.weather, this.season).rain) return;
        const source = createRainSource(this.ctx, clip, this.rainGain);
        source.start(0, Math.random() * clip.duration);
        this.fieldBeds.set('rain', source);
      });
    }
    for (const [name, id] of Object.entries(RECORDED_BEDS)) {
      this[name + 'Gain'].gain.setTargetAtTime(mix[name], t, 1.5);
      if (mix[name] > 0 && this.natureOn && !this.muted && FIELD_RECORDINGS[id] && !this.fieldBeds.has(name)) {
        this.loadField(id).then(() => {
          if (this.fieldBeds.has(name) || !this.natureOn || this.muted || !natureMix(this.land, this.weather, this.season)[name]) return;
          const clip = this.fieldClips.get(FIELD_RECORDINGS[id].clips[0]);
          if (!clip) return;
          const source = this.ctx.createBufferSource(); source.buffer = clip; source.loop = true;
          source.connect(this[name + 'Gain']); source.start(0, Math.random() * clip.duration);
          this.fieldBeds.set(name, source);
        });
      }
    }
    this.warmField();
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
        const duration = this[voice]();
        if (duration === 0) continue; // loading: keep the call due, without pretending it played
        const playedFor = duration ?? prominent.duration;
        this.foregroundUntil = t + playedFor + 0.5;
        this.callDue.set(voice, t + wait(prominent.repeat));
        this.cooldowns.set(voice, t + playedFor + 0.5);
        continue;
      }
      if (t < (this.cooldowns.get(voice) ?? 0) || Math.random() >= 1 - Math.exp(-rate * dt)) continue;
      const duration = this[voice]();
      if (duration === 0) continue;
      const gap = { lion: 22, howler: 16, siamang: 18, hyena: 12, barredOwl: 10, owl: 9, drum: 8, reefSnap: 0.15 }[voice] ?? 3;
      this.cooldowns.set(voice, t + Math.max(gap, (duration ?? 0) + 1));
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
  // Only assets for audible animals and active environment layers are fetched. A failed
  // request backs off; loading never triggers a delayed call after the map has changed.
  loadField(id) {
    const def = FIELD_RECORDINGS[id];
    if (!this.ctx || !def) return Promise.resolve();
    return Promise.all(def.clips.map(name => {
      if (this.fieldClips.has(name)) return Promise.resolve();
      if (this.fieldLoads.has(name)) return this.fieldLoads.get(name);
      if (this.ctx.currentTime < (this.fieldRetry.get(name) ?? 0)) return Promise.resolve();
      const request = fetch(soundFile(name)).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(data => new Promise((ok, fail) => this.ctx.decodeAudioData(data, ok, fail)))
        .then(clip => { this.fieldClips.set(name, id.startsWith('bed-') ? seamlessLoop(this.ctx, clip) : clip); this.fieldRetry.delete(name); }, () => { this.fieldRetry.set(name, this.ctx.currentTime + 30); })
        .finally(() => this.fieldLoads.delete(name));
      this.fieldLoads.set(name, request);
      return request;
    }));
  }
  warmField() {
    if (!this.land || !this.ctx || !this.natureOn || this.muted) return;
    const map = MAP_RECORDINGS[this.land.map];
    for (const [key, id] of Object.entries(map?.birds || {})) if (this.land.present.includes(key)) this.loadField(id);
    for (const { voice } of natureCallRates(this.land, this.weather, this.season)) this.loadField(map?.calls[voice]);
  }
  // (`anywhere` starts at a random point, for an excerpt of a long recording)
  playField(id, { far = 0.2, pan, offset = 0, length, anywhere = false } = {}) {
    if (!this.ctx || !this.natureOn || this.muted || this.ctx.state !== 'running' || !this.callGain) return 0;
    const def = FIELD_RECORDINGS[id];
    if (!def) return 0;
    const ready = def.clips.map(n => this.fieldClips.get(n)).filter(Boolean);
    if (!ready.length) { this.loadField(id); return 0; }
    const clip = ready[Math.floor(Math.random() * ready.length)];
    if (anywhere) offset = Math.random() * Math.max(0, clip.duration - (length ?? clip.duration));
    const duration = Math.min(length ?? clip.duration, clip.duration - offset);
    if (duration <= 0) return 0;
    const t = this.ctx.currentTime, source = this.ctx.createBufferSource(), gain = this.ctx.createGain();
    source.buffer = clip; // Preserve the animal's real pitch and pace.
    const level = def.gain * (1 - far) ** 1.2;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(level, t + Math.min(0.04, duration / 4));
    gain.gain.setValueAtTime(level, t + Math.max(0.04, duration - 0.08));
    gain.gain.linearRampToValueAtTime(0, t + duration);
    const dest = this.voice(pan, far, 12000);
    source.connect(gain).connect(dest); this.trackSource(source, [gain], dest);
    source.start(t, offset, duration);
    return duration;
  }
  recordedCall(voice) {
    const key = SOUNDSCAPES[this.land?.map]?.calls.find(c => c[1] === voice)?.[0];
    return this.playField(MAP_RECORDINGS[this.land?.map]?.calls[voice], this.land?.callPositions?.[key]);
  }
  frog() { return this.recordedCall('frog'); }
  owl() { return this.recordedCall('owl'); }
  hyena() { return this.recordedCall('hyena'); }
  lion() { return this.recordedCall('lion'); }
  moo() { return this.recordedCall('moo'); }
  howler() { return this.recordedCall('howler'); }
  peeper() { return this.recordedCall('peeper'); }
  toad() { return this.recordedCall('toad'); }
  dartfrog() { return this.recordedCall('dartfrog'); }
  treeFrog() { return this.recordedCall('treeFrog'); }
  barredOwl() { return this.recordedCall('barredOwl'); }
  barnOwl() { return this.recordedCall('barnOwl'); }
  drum() { return this.recordedCall('drum'); }
  siamang() { return this.recordedCall('siamang'); }
  groundHornbill() { return this.recordedCall('groundHornbill'); }
  hippo() { return this.recordedCall('hippo'); }
  zebra() { return this.recordedCall('zebra'); }
  elephant() { return this.recordedCall('elephant'); }
  tiger() { return this.recordedCall('tiger'); }
  birdPhrase(key) { return this.playField(MAP_RECORDINGS[this.land?.map]?.birds[key], this.land?.callPositions?.[key]); }
  maybeBird() {
    if (!this.ctx || !this.land || this.ctx.currentTime < this.nextBird || this.ctx.currentTime < this.foregroundUntil) return;
    const choices = Object.keys(MAP_RECORDINGS[this.land.map]?.birds || {}).filter(key => this.land.present.includes(key));
    const life = this.birdLife();
    if (!choices.length || Math.random() >= 1 - Math.exp(-0.38 * life * 0.25)) return;
    const duration = this.birdPhrase(choices[Math.floor(Math.random() * choices.length)]);
    if (duration) this.nextBird = this.ctx.currentTime + duration + 1.5 + Math.random() * 2.5;
  }
  // ------------------------------------------------------------ the rut
  // Recorded bugles and antler clashes (sounds.js), fetched and decoded once the animals that
  // make them are around, so nothing downloads on maps without them.
  warmRut(racks) {
    if (!this.ctx || !this.started) return;
    const names = new Set(racks.length ? [...RUT_SOUNDS.clash, ...RUT_SOUNDS.rattle] : []);
    if (racks.includes('elk')) RUT_SOUNDS.bugle.forEach(n => names.add(n));
    for (const name of names) if (!this.rutClips.has(name)) {
      this.rutClips.set(name, null); // (loading)
      fetch(soundFile(name)).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(data => new Promise((ok, fail) => this.ctx.decodeAudioData(data, ok, fail))) // (callback form for older Safari)
        .then(clip => this.rutClips.set(name, clip), () => this.rutClips.delete(name)); // (a failed load is tried again later)
    }
  }
  rut(kind, { rack = 'elk', far = 0, pan = 0, id = 0 } = {}) {
    if (!this.ctx || !this.callGain || !this.natureOn || this.muted || this.ctx.state !== 'running') return false;
    const t = this.ctx.currentTime, bugling = kind === 'bugle' || kind === 'answer';
    // One bugle at a time, so a rival can answer but never talks over him, and each bull
    // rests between calls: at fast game speed the herd would otherwise bugle without a break.
    if (bugling && (t < this.rutLast || t < (this.rutBulls.get(id) ?? 0))) return false;
    const ready = RUT_SOUNDS[kind].map(n => this.rutClips.get(n)).filter(Boolean);
    if (!ready.length) return false; // (still loading)
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
    src.buffer = ready[Math.floor(Math.random() * ready.length)];
    // each bull keeps his own voice: a steady pitch offset per animal, not per call
    src.playbackRate.value = bugling ? 0.97 + (id * 0.6180339 % 1) * 0.06 : (RACK_PITCH[rack] ?? 1) * (0.96 + Math.random() * 0.08);
    const level = { bugle: 0.14, answer: 0.12, clash: 0.2, rattle: 0.12 }[kind];
    g.gain.value = level * (1 - far) ** (bugling ? 1.2 : 2);
    const d = this.voice(pan, far, bugling ? 7000 : 9000);
    src.connect(g).connect(d); this.trackSource(src, [g], d); src.start(t + 0.01);
    if (bugling) {
      const ends = t + src.buffer.duration / src.playbackRate.value;
      this.rutLast = ends + 0.6 + Math.random() * 1.5; this.rutBulls.set(id, ends + 6 + Math.random() * 6);
      this.foregroundUntil = Math.max(this.foregroundUntil, ends);
    }
    return true;
  }

}

export const music = new Music();
