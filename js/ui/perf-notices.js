// Two plain notices about the player's computer rather than the game, each said once ever
// (docs/ideas/2026-11-23-creeks-fps-2/s4.md):
// - Software drawing: the browser isn't using the graphics chip (SwiftShader, llvmpipe, Microsoft
//   Basic Render Driver), so the processor draws everything and the game runs at 2-4 frames a
//   second whatever its settings. Said a few seconds after the farm shows, with how to turn
//   hardware acceleration back on in this browser.
// - On battery and slow: a laptop on battery still under 20 frames a second on Fast for two
//   minutes of play in a row. Plugging in lets the computer run at full speed (Windows' battery
//   saver slows the processor: fps-plan section 1). Only on Fast, since Sharp and Balanced have
//   their own one notice suggesting Fast (Renderer.autoQuality), and one notice is enough.
// Neither changes a setting. Both are 'warn' so the "important only" setting can't swallow them.

// The names browsers give a graphics "chip" that is really the processor drawing in software.
export const softwareRenderer = name => !!name &&
  /SwiftShader|llvmpipe|softpipe|lavapipe|Basic Render Driver|Software Rasteri[sz]er/i.test(name);

// Which browser, for the steps to turn hardware acceleration on (Edge and Opera say "Chrome" too).
export function browserKind(ua = '') {
  if (/\bEdg(e|A|iOS)?\//.test(ua)) return 'edge';
  if (/\bFirefox\//.test(ua)) return 'firefox';
  if (/\bOPR\//.test(ua)) return 'other';
  if (/\bChrome\//.test(ua)) return 'chrome';
  return 'other';
}

export function softwareText(ua) {
  const how = {
    chrome: 'In Chrome: Settings, System, turn on "Use graphics acceleration when available", then Relaunch.',
    edge: 'In Edge: Settings, System and performance, turn on "Use graphics acceleration when available", then Restart.',
    firefox: 'In Firefox: Settings, General, Performance, untick "Use recommended performance settings", tick "Use hardware acceleration when available", then restart Firefox.',
    other: 'Look in your browser\'s settings for "hardware acceleration" or "graphics acceleration", turn it on and restart the browser.',
  }[browserKind(ua)];
  return `Your browser is drawing the game without your graphics chip, so it will run very slowly. ${how} If it's already on, updating your graphics driver can help.`;
}

const WINDOW_MS = 3000, BATTERY_WINDOWS = 40; // (two minutes of 3-second spells)

export class PerfNotices {
  // settings: the saved settings (softwareHintAt, batteryHintAt, quality); save(); track(event, props);
  // notify(text, extra); gpu: the chip's name; ua: the browser's user agent;
  // onBattery(): true, false or null (unknown); shown(): the farm is on screen (not under the
  // intro film or loading); playing(): the clock is running.
  constructor({ settings, save, track, notify, gpu, ua = '', onBattery = () => null, shown = () => true, playing = () => true }) {
    Object.assign(this, { settings, save, track, notify, gpu, ua, onBattery, shown, playing });
    this.shownAt = null; this.win = null; this.slowSpells = 0;
  }
  frame(now) {
    if (!this.shown()) { this.shownAt = null; this.win = null; return; }
    this.shownAt ??= now;
    const s = this.settings;
    if (!s.softwareHintAt && softwareRenderer(this.gpu) && now - this.shownAt >= 4000) {
      s.softwareHintAt = Date.now(); this.save();
      this.track('software_render_notice', { gpu: this.gpu, browser: browserKind(this.ua) });
      this.notify(softwareText(this.ua), { life: 30000 });
    }
    if (!s.batteryHintAt) this.batteryFrame(now);
  }
  batteryFrame(now) {
    // (only on battery, on Fast and with the clock running; anything else starts the two minutes over)
    if (this.onBattery() !== true || this.settings.quality !== 'fast' || !this.playing()) { this.win = null; this.slowSpells = 0; return; }
    const W = this.win;
    if (!W || now - W.last > 1000) { this.win = { t0: now, last: now, gaps: [] }; if (W) this.slowSpells = 0; return; } // (a long gap: the tab was hidden)
    W.gaps.push(now - W.last); W.last = now;
    if (now - W.t0 < WINDOW_MS) return;
    this.win = { t0: now, last: now, gaps: [] };
    const g = W.gaps.sort((a, b) => a - b), fps = 1000 / Math.max(1, g[Math.floor(g.length * 0.75)]);
    this.slowSpells = fps < 20 ? this.slowSpells + 1 : 0;
    if (this.slowSpells < BATTERY_WINDOWS) return;
    this.settings.batteryHintAt = Date.now(); this.save();
    this.track('battery_hint', { fps: Math.round(fps), gpu: this.gpu });
    this.notify(`The game is running at about ${Math.round(fps)} frames a second on battery. Plugging in will make it smoother: computers slow themselves down on battery.`, { life: 12000 });
  }
}
