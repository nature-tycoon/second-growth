// Soothing lo-fi, generated live with Web Audio: warm electric-piano chords, a soft round bass,
// a lazy swung beat, a sparse melody with echo, and vinyl crackle, all through a gentle tape wobble
// and a low-pass "old speaker" filter. Nature sounds (rain, birds, a creek) sit on their own bus
// and follow the weather and seasons. Nothing is downloaded; every sound is synthesized.

const BPM = 72;
const STEP = 60 / BPM / 4;        // one sixteenth note, in seconds
const SWING = 0.18;               // off-beat eighths land a little late
const LOOKAHEAD = 0.15;

// Chord progressions (MIDI notes), four bars each; the band drifts between them.
const PROGRESSIONS = [
  [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]],          // Fmaj7 Em7 Dm7 Cmaj7
  [[45, 52, 55, 60], [50, 54, 57, 60, 64], [43, 50, 54, 59], [48, 52, 55, 59, 62]],  // Am7 D9 Gmaj7 Cmaj9
  [[50, 53, 57, 60, 64], [43, 53, 57, 59], [48, 52, 55, 59, 62], [45, 48, 52, 55]],  // Dm9 G7 Cmaj9 Am7
  [[41, 52, 55, 57, 60], [43, 50, 53, 57], [40, 50, 55, 59], [45, 52, 55, 60]],      // Fmaj9 G6 Em7 Am7
];
// Drum patterns over 16 steps: kick, snare, hat.
const BEATS = [
  { k: [0, 7, 10], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14] },
  { k: [0, 3, 8, 11], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14, 15] },
  { k: [0, 6, 10], s: [4, 12, 15], h: [0, 2, 4, 6, 8, 10, 12, 14] },
];
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  constructor() {
    this.ctx = null;
    this.musicOn = true; this.natureOn = true; this.muted = false;
    this.musicVol = 0.5; this.natureVol = 0.6;
    this.step = 0; this.bar = 0; this.prog = 0; this.beat = 0;
    this.weather = 'clear'; this.season = 0; this.hour = 0;
  }

  // Browsers only allow audio after the player has clicked or pressed something.
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.out = ctx.createDynamicsCompressor();
    this.out.threshold.value = -18; this.out.ratio.value = 3;
    this.out.connect(ctx.destination);

    // music bus: volume -> warm low-pass -> out
    this.musicGain = ctx.createGain();
    this.warm = ctx.createBiquadFilter(); this.warm.type = 'lowpass'; this.warm.frequency.value = 3200; this.warm.Q.value = 0.4;
    this.musicGain.connect(this.warm).connect(this.out);
    this.natureGain = ctx.createGain();
    this.natureGain.connect(this.out);
    // tape wobble shared by the tuned voices
    this.wow = ctx.createOscillator(); this.wow.frequency.value = 0.35;
    this.wowAmt = ctx.createGain(); this.wowAmt.gain.value = 7; // cents
    this.wow.connect(this.wowAmt); this.wow.start();
    // echo for the melody
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = STEP * 6;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 1800;
    this.delay.connect(dl).connect(fb).connect(this.delay);
    dl.connect(this.musicGain);
    // drum bus, a little dull and squashed like a sampled loop
    this.drums = ctx.createBiquadFilter(); this.drums.type = 'lowpass'; this.drums.frequency.value = 4200;
    const dg = ctx.createGain(); dg.gain.value = 0.9;
    this.drums.connect(dg).connect(this.musicGain);

    this.noise = this.makeNoise(2);
    this.startCrackle();
    this.startNature();
    this.applyVolumes();
    this.next = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend(); else this.ctx.resume();
    });
  }

  makeNoise(seconds) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds, this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // ------------------------------------------------------------ settings
  set({ music, nature, muted, musicVol, natureVol }) {
    if (music != null) this.musicOn = music;
    if (nature != null) this.natureOn = nature;
    if (muted != null) this.muted = muted;
    if (musicVol != null) this.musicVol = musicVol;
    if (natureVol != null) this.natureVol = natureVol;
    this.applyVolumes();
  }
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.setTargetAtTime(this.muted || !this.musicOn ? 0 : this.musicVol * 0.8, t, 0.3);
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

  // ------------------------------------------------------------ scheduling
  schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (this.next < ctx.currentTime - 1) this.next = ctx.currentTime + 0.05; // after a long pause
    while (this.next < ctx.currentTime + LOOKAHEAD) {
      const swing = this.step % 4 === 2 ? STEP * SWING * 2 : 0;
      this.playStep(this.step, this.next + swing);
      this.next += STEP;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) {
        this.bar++;
        if (this.bar % 8 === 0) { this.prog = (this.prog + 1 + Math.floor(Math.random() * 2)) % PROGRESSIONS.length; this.beat = Math.floor(Math.random() * BEATS.length); }
      }
    }
    if (this.natureOn && !this.muted && Math.random() < 0.012) this.maybeBird();
  }

  playStep(s, t) {
    if (!this.musicOn || this.muted) return;
    const chord = PROGRESSIONS[this.prog][this.bar % 4], beat = BEATS[this.beat];
    const intro = this.bar < 2; // ease in with just the keys
    // keys: the chord on the downbeat, a softer re-strike late in the bar
    if (s === 0) this.keys(chord, t, 0.055, STEP * 14);
    if (s === 10 && Math.random() < 0.55) this.keys(chord.slice(1), t, 0.03, STEP * 6);
    // bass
    if (!intro && (s === 0 || (s === 7 && Math.random() < 0.7) || (s === 12 && Math.random() < 0.35))) this.bass(chord[0] - 12, t, s === 0 ? STEP * 6 : STEP * 3);
    // drums
    if (!intro) {
      if (beat.k.includes(s)) this.kick(t);
      if (beat.s.includes(s)) this.snare(t);
      if (beat.h.includes(s) && Math.random() < 0.92) this.hat(t, s % 4 === 2 ? 0.035 : 0.05);
    }
    // a sparse melody every other phrase
    if (!intro && Math.floor(this.bar / 4) % 2 === 1 && s % 2 === 0 && Math.random() < 0.22) {
      const tones = chord.map(n => n + 12).concat([chord[1] + 24, chord[2] + 24]);
      this.bell(tones[Math.floor(Math.random() * tones.length)], t);
    }
  }

  // ------------------------------------------------------------ instruments
  keys(notes, t, vel, len) {
    const ctx = this.ctx;
    for (const n of notes) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vel, t + 0.012);
      g.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.9);
      g.gain.exponentialRampToValueAtTime(0.0008, t + len + 0.6);
      const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 1900;
      g.connect(tone).connect(this.musicGain);
      for (const [type, mult, amp] of [['sine', 1, 1], ['triangle', 2, 0.18], ['sine', 3, 0.05]]) {
        const o = ctx.createOscillator(), a = ctx.createGain();
        o.type = type; o.frequency.value = hz(n) * mult;
        o.detune.value = (Math.random() - 0.5) * 6;
        this.wowAmt.connect(o.detune);
        a.gain.value = amp;
        o.connect(a).connect(g);
        o.start(t); o.stop(t + len + 0.7);
      }
    }
  }
  bass(n, t, len) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = hz(n);
    f.type = 'lowpass'; f.frequency.value = 320;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.2, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + len + 0.2);
    o.connect(f).connect(g).connect(this.musicGain);
    o.start(t); o.stop(t + len + 0.25);
  }
  kick(t) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(115, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    o.connect(g).connect(this.drums);
    o.start(t); o.stop(t + 0.35);
  }
  snare(t) {
    const ctx = this.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noise; f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 0.8;
    g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    src.connect(f).connect(g).connect(this.drums);
    src.start(t, Math.random()); src.stop(t + 0.22);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.value = 185; og.gain.setValueAtTime(0.06, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(og).connect(this.drums); o.start(t); o.stop(t + 0.1);
  }
  hat(t, vel) {
    const ctx = this.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noise; f.type = 'highpass'; f.frequency.value = 7000;
    g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    src.connect(f).connect(g).connect(this.drums);
    src.start(t, Math.random()); src.stop(t + 0.05);
  }
  bell(n, t) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), h = ctx.createOscillator(), hg = ctx.createGain();
    o.type = 'sine'; o.frequency.value = hz(n); this.wowAmt.connect(o.detune);
    h.type = 'sine'; h.frequency.value = hz(n) * 4; hg.gain.value = 0.12;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.045, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    o.connect(g); h.connect(hg).connect(g);
    g.connect(this.musicGain); g.connect(this.delay);
    o.start(t); h.start(t); o.stop(t + 1.2); h.stop(t + 1.2);
  }
  // vinyl: a bed of hiss plus sparse dust pops
  startCrackle() {
    const ctx = this.ctx, len = ctx.sampleRate * 4, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.02 + (Math.random() < 0.0006 ? (Math.random() - 0.5) * 0.9 : 0);
    const src = ctx.createBufferSource(); src.buffer = b; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 900;
    const g = ctx.createGain(); g.gain.value = 0.35;
    src.connect(f).connect(g).connect(this.musicGain);
    src.start();
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
