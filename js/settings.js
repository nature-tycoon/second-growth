// Player preferences, kept in the browser separately from the saved farm.

const KEY = 'second-growth-settings';

export const DEFAULTS = {
  shadows: true,
  quality: 'high',     // render resolution: high | balanced | fast
  wind: true,          // plants sway in the breeze
  weather: true,       // rain and snow drawn over the view
  dayCycle: true,      // the light moves through golden hour, dusk and dawn
  panSpeed: 1,
  zoomSpeed: 1,
  autosave: true,
  pauseOnEvents: false, // pause the clock when a wildfire or flood starts
  analytics: true,     // share anonymous play data to help improve the game
  muted: false,        // quick mute from the top bar (M)
  music: true, musicVolume: 0.45,     // lo-fi background music
  nature: true, natureVolume: 0.6,    // rain, birds and water
  notifications: 'all', // 'all' or 'important' (skip routine updates; they still go in the journal)
  brushSizes: {},      // last brush radius used with each tool
};

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || '{}');
    // phones and tablets start on a lighter resolution so the game stays smooth and cool
    const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    return { ...DEFAULTS, ...(touch ? { quality: 'balanced' } : {}), ...d, brushSizes: { ...(d.brushSizes || {}) } };
  } catch (e) {
    return { ...DEFAULTS, brushSizes: {} };
  }
}

export const settings = load();

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* storage unavailable */ }
}

export function resetSettings() {
  const brushes = settings.brushSizes;
  Object.assign(settings, DEFAULTS, { brushSizes: brushes });
  saveSettings();
}
