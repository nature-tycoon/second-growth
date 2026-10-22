import { dormancyStatus } from '../data/animal-dormancy.js';
// DOM interface: top bar, tool palette, inspector, notifications, minimap and modal screens.

import { T, F, FEATURE_NAMES, MONTH_NAMES, DIFFICULTY, DAYS_PER_YEAR, isWater, money, moneyShort, clamp } from '../config.js';
import { music } from '../audio/music.js';
import { sampleSoundLand } from '../audio/land.js';
import { rutSounds } from '../audio/rut-events.js';
import { MUSIC_LICENSE } from '../audio/tracks.js';
import { SOUND_CREDITS } from '../audio/sounds.js';
import { LAYER_NAMES } from '../data/plants.js';
import { many, isMaleVariant, animalDef } from '../data/animals.js';
import { passageGuide } from '../sim/bird-passage.js';
import { CATEGORIES, PLANT_TABS, BRUSH_SIZES, listPrice } from '../tools.js';
import { plantSuit, plantLimits } from '../sim/plants.js';
import { speciesPresent } from '../sim/goals.js';
import { campaignOn, currentChapter, unlockedTools, chapterOfTool, goalMet, campaignVisitorHint } from '../sim/campaign.js';
import { Game, PENDING_KEY } from '../game.js';
import { BIOMES, BIOME_LIST } from '../biome.js';
import { worldMap } from './worldmap.js';
import { LANG_MAPS, lang, langFor, storedLang, saveLang, langWithin, tr } from '../i18n.js';
import { makePostcard, download } from './postcard.js';
import { ICONS } from './icons.js';
import { settings, saveSettings, resetSettings } from '../settings.js';
import { Undo } from '../undo.js';
import { ToolActions } from '../tool-actions.js';
import { SaveControls } from './save-controls.js';
import { SessionAnalytics } from './session-analytics.js';
import { Cinematics } from './cinematics.js';
import { animalThumb, plantThumb, iconThumb } from './thumbnails.js';
import { wildlifeDiagnostics } from '../sim/wildlife-diagnostics.js';
import { saves } from '../saves.js';
import { CHALLENGE_TOOL_ADVICE, pressureTileNotes } from '../sim/ecological-pressure.js';
import { track, setAnalyticsEnabled, sendFeedback, feedbackPossible } from '../analytics.js';

export { animalThumb, plantThumb } from './thumbnails.js';

const $ = sel => document.querySelector(sel);
// A phone or tablet (no mouse), and a screen too short for the full layout.
const TOUCH = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
const COMPACT = () => innerHeight <= 520;
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const pct = v => Math.round(v * 100) + '%';
// Only touch the page when something actually changed: every write is a DOM mutation, and the
// browser restyles and lays out the panels again for each one.
const setText = (e, v) => { v = String(v); if (e && e.textContent !== v) e.textContent = v; };
const setHTML = (e, html) => { if (!e || e._html === html) return false; e._html = html; e.innerHTML = html; return true; };
const setAttr = (e, k, v) => { v = String(v); if (e && e.getAttribute(k) !== v) e.setAttribute(k, v); };

// ---------------------------------------------------------------- text helpers
function moistWord(lo, hi) {
  const w = v => v < 0.3 ? 'dry' : v <= 0.66 ? 'moist' : v < 0.88 ? 'wet' : 'standing water';
  const a = w(lo), b = w(hi);
  return a === b ? a : `${a} to ${b}`;
}
function lightWord(lo, hi) {
  if (lo >= 0.5) return 'full sun';
  if (hi <= 0.75) return 'shade';
  if (lo <= 0.1) return 'sun or deep shade';
  return 'sun or part shade';
}
function seasonText(months) {
  if (!months) return null;
  return `${MONTH_NAMES[months[0]]} to ${MONTH_NAMES[months[months.length - 1]]}`;
}

// ---------------------------------------------------------------- UI
// The names of the money panel's rows (a map can rename one: biome.incomeNames), and what raises each income.
const INCOME = {
  grant: 'Monthly grant', reward: 'Goal and chapter rewards', discovery: 'New species bonuses', visitors: 'Visitor donations',
  palms: 'Palm fruit sold to the mill', fruit: 'Fruit-tree harvest', coop: "The co-op's share of its sales", salvage: 'Salvage', other: 'Other',
};
const INCOME_TIPS = {
  grant: 'Grows with ecosystem health and the number of species here.', reward: 'Paid once for each goal or chapter finished.',
  visitors: 'More with longer trails, blinds, a visitor center and a good rating.',
  palms: 'Falls as the palms are felled, shaded by young trees, and get old.', fruit: 'Fruit trees in season, less what the wildlife eats.',
  coop: 'A fifth of its milk and fish sales. Shade trees in the pasture and mangroves on the coast raise them.',
};
const SPENDING = {
  land: 'Landscape work', plants: 'Planting', features: 'Habitat', remove: 'Clearing and removal', wildlife: 'Reintroductions',
  visitors: 'Trails and facilities', upkeep: 'Trail upkeep', work: 'Other work',
};

// small icons for the inspect panel's action pills
const PILL = {
  habitat: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2 14 5.2 8 8.4 2 5.2Z M2 8.4 8 11.6 14 8.4 M2 11.2 8 14.4 14 11.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  guide: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.5h7.5a2 2 0 0 1 2 2v9H5a2 2 0 0 1-2-2z M5 11.5h7.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9 M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  follow: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4.8" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/></svg>',
};

export class UI {
  constructor(game, renderer) {
    this.game = game;
    this.renderer = renderer;
    this.state = {
      cat: 'inspect', tool: null, plantTab: 'mixes', brushR: 1, overlay: 'none', overlaySpecies: null,
      hover: null, previewTiles: null, inspect: null,
      clean: false, // a keystone moment or photo mode: no brush, previews, overlays or selection markers
    };
    this.journal = [];
    this.lastTop = 0; this.lastInfo = 0; this.lastMini = 0;
    this.toastCount = 0;
    this.dismissedBanners = {};
    this.newCats = new Set(); // tool categories a chapter just unlocked (they glow until opened)
    this.undo = new Undo(game);
    this.actions = new ToolActions(game, { undo: this.undo });
    this.saving = new SaveControls(game, {
      openModal: (...args) => this.modal(...args), closeModal: () => this.closeModal(),
      setSpeed: speed => this.setSpeed(speed), afterRestore: () => this.afterNewGame(),
    });
    this.analytics = new SessionAnalytics(game, renderer, () => ({
      open_panel: this.modalOpen ? this.lastModal : null, tool: this.state.tool || null, category: this.state.cat || null,
    }));
    this.cinematics = new Cinematics(game, renderer, this.state, {
      isBusy: () => this.modalOpen || this.photo, isPhoto: () => !!this.photo,
      setSpeed: speed => this.setSpeed(speed), setFollow: agent => { this.follow = agent; },
      postcardText: title => this.postcardText(title),
    });
    this.buildToolbar();
    this.bindTopbar();
    this.minimap = $('#minimap');
    this.minimap.width = 400; this.minimap.height = 300;
    this.bindMinimap();
    game.on('notify', n => this.toast(n));
    game.on('moment', m => this.playMoment(m));
    game.canPlayMoment = () => !this.moment && !this.modalOpen && !this.photo && performance.now() - (this.momentEnded ?? -1e9) >= 25000;
    game.on('reset', () => { this.moment?.end(false); this.undo.clear(); this.journal = []; this.dismissedBanners = {}; this.bannerKey = null; this.closeInfo(); this.buildToolbar(); this.refreshTop(true); this.renderQuest(true); });
    game.on('chapter', e => this.onChapterDone(e));
    game.on('month', () => {
      if (this.state.cat !== 'inspect') this.renderToolPanel();
      this.refreshWildlifeGuide?.();
    });
    game.on('event', kind => {
      if (kind === 'fire' || kind === 'flood') {
        delete this.dismissedBanners[kind]; this.bannerKey = null;
        if (settings.pauseOnEvents && game.speed) this.setSpeed(0);
      }
    });
    this.analytics.bind();
    game.on('tool', stroke => this.onToolAction(stroke));
    this.applySettings();
    this.saving.bind();
    this.warmPortraits();
    void music.prepare();
    const wake = () => { void music.start(); };
    window.addEventListener('pointerdown', wake, true);
    window.addEventListener('keydown', wake, true);
  }

  refreshSaveStatus() { this.saving.refresh(); }

  onToolAction(stroke) {
    // Shade and moisture reach beyond the stroke, including scripted UI actions.
    if (stroke.count) this.renderer.markTileDirty();
    this.refreshUndo();
    this.renderInfo();
    if (stroke.tool.cat === 'visitors') this.renderToolPanel();
  }

  // Render the field-guide portraits a few at a time in the background, so the guide opens instantly.
  warmPortraits() {
    const queue = this.game.catalog.animals.map(a => a.key);
    const step = () => {
      if (!queue.length) return;
      animalThumb(queue.shift(), this.game.catalog);
      (window.requestIdleCallback || (f => setTimeout(f, 60)))(step, { timeout: 400 });
    };
    setTimeout(step, 1500);
  }

  snapshot() { return this.analytics.snapshot(); }
  analyticsContext() { this.analytics.updateContext(); }
  get session() { return this.analytics.session; }

  applySettings() {
    if (settings.notifications === 'hidden') $('#toasts').replaceChildren();
    // Menu blur is decorative; Fast detail keeps transparency without the filter.
    document.body.classList.toggle('menu-effects-off', settings.quality === 'fast');
    // the renderer asks for a lighter Detail level when this computer can't keep up, and a
    // sharper one again once it has had room for a while (see Renderer.autoQuality)
    this.renderer.onQuality ??= (quality, fps, reason) => {
      track('auto_quality', { from: settings.quality, to: quality, fps, reason });
      const name = { high: 'Sharp', balanced: 'Balanced', fast: 'Fast' }[quality];
      settings.quality = quality; settings.autoQualityAt = Date.now();
      if (quality === 'fast') settings.slowFps = fps;
      if (reason === 'undo') settings.autoUpFailedAt = Date.now();
      saveSettings(); this.applySettings();
      if (reason === 'slow') this.game.notify('The game was running slowly on this computer, so Detail is now Fast. You can change it back in Settings.', 'info');
      else if (reason === 'room') this.game.notify(`The game has been running smoothly, so Detail is back up to ${name}.`, 'info');
      else this.game.notify(`That was too much for this computer, so Detail is back to ${name}.`, 'info');
    };
    this.renderer.applySettings(settings);
    this.game.autosave = settings.autosave;
    this.refreshSaveStatus();
    music.set({ music: settings.music, nature: settings.nature, muted: settings.muted, musicVol: settings.musicVolume, natureVol: settings.natureVolume });
    $('#btn-sound')?.classList.toggle('muted', !!settings.muted);
  }
  toggleMute() {
    settings.muted = !settings.muted;
    saveSettings(); this.applySettings();
    track('setting_changed', { setting: 'muted', value: settings.muted });
  }

  // ------------------------------------------------------------ top bar
  bindTopbar() {
    document.querySelectorAll('#speed button').forEach(b => b.addEventListener('click', () => this.setSpeed(+b.dataset.speed)));
    $('#stat-score').addEventListener('click', () => this.openReport());
    $('#stat-money').addEventListener('click', () => this.openMoney());
    $('#stat-species').addEventListener('click', () => this.openGuide());
    $('#stat-visitors').addEventListener('click', () => this.openVisitors());
    $('#mini-toggle').addEventListener('click', () => document.body.classList.toggle('mini-collapsed', $('#minimap-wrap').classList.toggle('collapsed')));
    $('#btn-goals').addEventListener('click', () => this.openGoals());
    $('#btn-journal').addEventListener('click', () => this.openJournal());
    $('#btn-menu').addEventListener('click', () => this.openMenu());
    $('#btn-settings').addEventListener('click', () => this.openSettings());
    $('#btn-sound').addEventListener('click', () => this.toggleMute());
    window.addEventListener('resize', () => this.fitTopbar());
    $('#btn-feedback').addEventListener('click', () => this.openFeedback());
    // Visible on every device; Shift retains a quick quarter-turn on desktop.
    document.querySelectorAll('#view-ctrls [data-v^=rot]').forEach(b => b.addEventListener('click', e => {
      if (!this.modalOpen) this.renderer.rotate(b.dataset.v === 'rotl' ? -1 : 1, e.shiftKey ? 90 : 15);
    }));
    // (on desktop the rotate buttons sit just under the tool bar, which changes height with the
    // tools unlocked and the window: see #view-ctrls in styles.css)
    // (a window too short for the whole tool bar and the pair stacked under it puts them beside it)
    const toolbar = $('#toolbar'), placeViewCtrls = () => {
      const box = toolbar.getBoundingClientRect();
      document.body.classList.toggle('view-ctrls-beside', box.top + toolbar.scrollHeight + 150 > innerHeight);
      document.documentElement.style.setProperty('--toolbar-bottom', `${Math.round(box.bottom)}px`);
    };
    new ResizeObserver(placeViewCtrls).observe(toolbar);
    window.addEventListener('resize', placeViewCtrls);
    const fs = $('#btn-fullscreen'), root = document.documentElement;
    if (TOUCH && (root.requestFullscreen || root.webkitRequestFullscreen)) {
      fs.classList.remove('hidden');
      fs.addEventListener('click', () => {
        const on = document.fullscreenElement || document.webkitFullscreenElement;
        if (on) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        else {
          const req = (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
          req?.then?.(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
        }
      });
    }
    // short screens start with the minimap folded away
    if (COMPACT()) { $('#minimap-wrap').classList.add('collapsed'); document.body.classList.add('mini-collapsed'); }
    $('#btn-trees').addEventListener('click', () => this.toggleTrees());
    // blur after picking so WASD goes back to moving the camera instead of scrolling the list
    $('#overlay').addEventListener('change', e => { this.setOverlay(e.target.value); e.target.blur(); });
    $('#btn-overlay').addEventListener('click', () => this.openOverlayPicker()); // (phones, and narrow top bars: the menu as a button)
  }
  setSpeed(s) { this.startPause = false; document.body.classList.remove('choosing-map'); this.game.speed = s; this.refreshTop(true); }
  // Touch screens: touching the map folds the tool panel down to its title, so the map has room.
  tuckToolPanel() {
    const st = this.state;
    if (!TOUCH || !COMPACT() || st.cat === 'inspect' || st.toolCollapsed || $('#toolpanel').classList.contains('hidden')) return;
    st.toolCollapsed = true;
    this.renderToolPanel();
  }
  // If the top bar still doesn't fit, fold away lower-priority pieces one step at a time.
  fitTopbar() {
    const bar = $('#topbar');
    if (!bar) return;
    for (let k = 1; k <= 6; k++) bar.classList.remove('tight-' + k);
    for (let k = 1; k <= 6 && bar.scrollWidth > bar.clientWidth + 1; k++) bar.classList.add('tight-' + k);
  }
  toggleTrees() {
    this.renderer.fadeTrees = !this.renderer.fadeTrees;
    $('#btn-trees').classList.toggle('on', this.renderer.fadeTrees);
  }
  setOverlay(v, species = null) {
    if (v === 'species' && species == null) species = this.state.overlaySpecies ?? (this.game.catalog.animal.deer ?? this.game.catalog.animals[0]).index;
    this.state.overlay = v;
    if (species != null) this.state.overlaySpecies = species;
    $('#overlay').value = v;
    $('#btn-overlay')?.classList.toggle('on', v !== 'none');
    if (v === 'species') {
      const opt = $('#overlay option[value="species"]');
      opt.textContent = 'Habitat for: ' + this.game.catalog.animals[this.state.overlaySpecies].name;
      this.game.wildlife.computeSuitability();
    }
    this.renderLegend();
  }

  refreshTop(force = false) {
    const g = this.game;
    $('#stat-visitors').hidden = !!g.mapDefinition.noVisitors;
    const now = performance.now();
    if (!force && now - this.lastTop < 250) return;
    this.lastTop = now;
    if (force && !this.fitOnce) { this.fitOnce = true; document.fonts?.ready.then(() => this.fitTopbar()); }
    const m = $('#stat-money');
    const mt = moneyShort(g.money);
    if (m.textContent !== mt) { m.textContent = mt; this.fitTopbar(); }
    m.classList.toggle('low', g.money < 2000);
    setAttr(m, 'title', `Conservation budget: ${money(g.money)}. Tap to see where the money comes from.`);
    setText($('#stat-season'), g.seasonName());
    setText($('#stat-date'), `${MONTH_NAMES[g.month]} ${g.dayOfMonth * 3 - 2}, Year ${g.year}`);
    setText($('#stat-date-short'), `${MONTH_NAMES[g.month].slice(0, 3)} ${g.dayOfMonth * 3 - 2} · Y${g.year}`); // (phones)
    this.refreshUndo();
    const scene = g.weather + g.season;
    if (scene !== this.lastScene) { this.lastScene = scene; music.setScene(g.weather, g.season); }
    // the soundscape follows the land around the camera (about once a second)
    const nowT = performance.now();
    if (force || !this.landAt || nowT - this.landAt > 1000) { this.landAt = nowT; music.setLand(this.landSound()); }
    const wIcon = g.weather === 'clear' && (this.renderer.night || 0) > 0.4 ? 'moon' : { clear: 'sun', cloud: 'cloud', rain: 'rain', snow: 'snow' }[g.weather] || 'sun';
    const we = $('#stat-weather');
    if (we.dataset.w !== wIcon) { we.innerHTML = ICONS[wIcon]; we.dataset.w = wIcon; }
    document.querySelectorAll('#speed button').forEach(b => b.classList.toggle('on', +b.dataset.speed === g.speed));
    const sc = Math.round(g.cache.score?.total ?? 0);
    setText($('#score-num'), sc);
    const ring = $('#score-ring');
    if (ring.dataset.sc !== String(sc)) {
      ring.dataset.sc = sc;
      ring.style.strokeDashoffset = 94.25 * (1 - sc / 100);
      ring.style.stroke = sc < 25 ? '#c07a2a' : sc < 55 ? '#8aa83a' : '#3f8a4e';
    }
    setText($('#species-num'), speciesPresent(g));
    const v = g.visitors;
    setText($('#visitor-num'), v.monthly.toLocaleString());
    setText($('#visitor-stars'), v.facilities().parking ? '★'.repeat(Math.round(v.rating)) + '☆'.repeat(5 - Math.round(v.rating)) : 'no trailhead');
    this.renderBanner();
    const open = this.game.catalog.goals.filter(x => !g.goalsDone[x.key]).length;
    setHTML($('#btn-goals'), `<span class="gl">Goals</span><span class="badge">${this.game.catalog.goals.length - open}/${this.game.catalog.goals.length}</span>`);
    this.renderQuest();
  }

  renderBanner() {
    const g = this.game, b = $('#banner');
    // Dismiss the event, not its current tile count: spreading water/fire must not reopen it.
    if (!g.events.fireTiles) delete this.dismissedBanners.fire;
    if (!g.events.floodTiles) delete this.dismissedBanners.flood;
    const fire = this.dismissedBanners.fire ? 0 : g.events.fireTiles;
    const flood = this.dismissedBanners.flood ? 0 : g.events.floodTiles;
    const crown = fire && g.events.severe && g.events.heat > 0.3;
    const key = `${fire}|${flood}|${crown}`;
    if (key === this.bannerKey) return;
    this.bannerKey = key;
    if (!fire && !flood) { b.classList.add('hidden'); return; }
    b.classList.remove('hidden');
    b.className = 'panel ' + (fire ? 'fire' : 'flood');
    b.innerHTML = fire
      ? `<span class="bi">${ICONS.fire}</span><span><b>${crown ? 'Crown fire' : 'Wildfire'}</b>: ${fire} tiles burning</span><button class="btn secondary" data-b="go">Show me</button><button class="btn" data-b="crew">Fire crew</button>`
      : `<span class="bi">${ICONS.rain}</span><span><b>Flood</b>: ${flood} tiles underwater. Trails through it are closed.</span><button class="btn secondary" data-b="go">Show me</button>`;
    b.insertAdjacentHTML('beforeend', '<button type="button" class="notice-close" data-b="dismiss" aria-label="Dismiss warning" title="Dismiss warning">×</button>');
    b.querySelector('[data-b=dismiss]').addEventListener('click', () => {
      this.dismissedBanners[fire ? 'fire' : 'flood'] = true;
      this.bannerKey = null; this.renderBanner();
    });
    b.querySelector('[data-b=go]').addEventListener('click', () => {
      const w = g.world, arr = fire ? w.fire : w.flood;
      let sx = 0, sy = 0, n = 0;
      for (let i = 0; i < w.n; i++) if (arr[i]) { sx += i % w.w; sy += (i / w.w) | 0; n++; }
      if (n) this.renderer.centerOn(sx / n + 0.5, sy / n + 0.5);
      if (!fire && this.state.overlay !== 'flood') this.setOverlay('flood'); // make the floodwater easy to see
    });
    b.querySelector('[data-b=crew]')?.addEventListener('click', () => { this.state.cat = ''; this.openCategory('remove'); this.selectTool('firecrew'); });
  }

  // ------------------------------------------------------------ toolbar & tool panel
  buildToolbar() {
    const bar = $('#toolbar');
    bar.innerHTML = '';
    CATEGORIES.forEach((c, n) => {
      // a group with nothing unlocked yet in the campaign still shows, dimmed, so players know it's
      // coming (its tools say which chapter opens them); a group with no tools here at all is hidden
      const open = c.key === 'inspect' || this.toolsFor(c.key, true, true).length > 0;
      const exists = open || (this.toolsFor(c.key, false, true).length > 0 && !(this.game.catalog.definition.noVisitors && c.key === 'visitors'));
      const b = el('button', (open ? '' : exists ? 'locked' : 'hidden') + (this.newCats?.has(c.key) ? ' fresh' : ''), `${ICONS[c.icon]}<span>${c.name}</span>`);
      b.dataset.cat = c.key;
      b.title = c.desc;
      b.addEventListener('click', () => this.openCategory(c.key));
      bar.appendChild(b);
      if (n === 0) bar.appendChild(el('div', 'sep'));
    });
    // take back the last thing a tool did (also Ctrl+Z / ⌘Z)
    bar.appendChild(el('div', 'sep'));
    const u = el('button', 'undo undo-btn', `${ICONS.undo}<span>Undo</span>`);
    u.id = 'btn-undo';
    u.addEventListener('click', () => this.undoLast());
    bar.appendChild(u);
    // (on a phone the toolbar scrolls, so Undo also sits by the thumbstick, always in reach)
    if (!$('#btn-undo-float')) {
      const f = el('button', 'undo-btn', ICONS.undo);
      f.id = 'btn-undo-float';
      f.addEventListener('click', () => this.undoLast());
      document.body.appendChild(f);
    }
    this.markToolbar();
    this.refreshUndo();
  }
  // the Undo button says what it would take back, and is dimmed when there's nothing to undo
  refreshUndo() {
    const c = this.undo.last;
    for (const b of document.querySelectorAll('.undo-btn')) {
      b.disabled = !c;
      b.title = c ? `Undo: ${c.tool.name} (${c.count} ${c.count === 1 ? 'tile' : 'tiles'}). Ctrl+Z` : 'Nothing to undo. Tool work can be undone for a month.';
    }
  }
  undoLast() {
    const r = this.undo.undo(this.renderer);
    if (!r) { this.game.notify('Nothing to undo. Work with a tool can be undone for about a month.', 'info'); this.refreshUndo(); return; }
    const m = r.cost > 0 ? `, and ${money(r.cost)} came back` : r.cost < 0 ? `, and the ${money(-r.cost)} it raised went back` : '';
    this.game.notify(`Undid ${r.tool.name.toLowerCase()} on ${r.count} ${r.count === 1 ? 'tile' : 'tiles'}${m}.`, 'info');
    track('undo', { tool: r.tool.key, tiles: r.count, map: this.game.map });
    this.refreshUndo(); this.refreshTop(true); this.renderInfo();
    if (r.tool.cat === 'visitors') this.renderToolPanel();
  }
  markToolbar() {
    document.querySelectorAll('#toolbar button').forEach(b => b.classList.toggle('on', b.dataset.cat === this.state.cat));
  }
  openCategory(cat) {
    const st = this.state;
    if (cat === st.cat && cat !== 'inspect' && !$('#toolpanel').classList.contains('hidden')) {
      // (a folded panel opens back up; an open one hides)
      if (st.toolCollapsed) { st.toolCollapsed = false; this.renderToolPanel(); }
      else $('#toolpanel').classList.add('hidden');
      return;
    }
    st.cat = cat;
    if (this.newCats?.delete(cat)) document.querySelector(`#toolbar [data-cat=${cat}]`)?.classList.remove('fresh');
    this.markToolbar();
    if (cat === 'inspect') { st.tool = null; $('#toolpanel').classList.add('hidden'); return; }
    if (cat === 'plants' && !this.toolsFor('plants', true).length) st.plantTab = PLANT_TABS.find(t => this.tabOpen(t.key))?.key || 'mixes';
    const list = this.toolsFor(cat, true);
    if (!list.length) st.tool = null; // (nothing unlocked here yet: the panel shows what's coming)
    else if (!st.tool || this.game.catalog.tools[st.tool].cat !== cat || !this.isOpen(st.tool)) this.selectTool(list[0].key, false);
    if (TOUCH) st.toolCollapsed = false; // (picking a group on a phone always shows its tools)
    this.renderToolPanel();
    $('#toolpanel').classList.remove('hidden');
  }
  // Tools in a category (the current plant tab only, unless allTabs); openOnly skips campaign-locked ones.
  toolsFor(cat, openOnly = false, allTabs = false) {
    let list = Object.values(this.game.catalog.tools).filter(t => t.cat === cat && !this.game.catalog.definition.hideTools?.includes(t.key)); // (tools a map has no use for, like a pond on the seabed)
    if (cat === 'plants' && !allTabs) list = list.filter(t => t.sub === this.state.plantTab);
    if (openOnly) list = list.filter(t => this.isOpen(t.key));
    return list;
  }
  isOpen(key) { if (this.game.catalog.definition.noVisitors && this.game.catalog.tools[key]?.cat === 'visitors') return false; if (this.game.catalog.definition.hideTools?.includes(key)) return false; const u = unlockedTools(this.game); return !u || u.has(key); }
  tabOpen(sub) { return Object.values(this.game.catalog.tools).some(t => t.sub === sub && this.isOpen(t.key)); }
  selectTool(key, rerender = true) {
    const t = this.game.catalog.tools[key];
    if (!this.isOpen(key)) return;
    this.state.tool = key;
    // each tool category remembers the last brush size you used with it
    this.state.brushR = t.brush ? (settings.brushSizes[t.cat] ?? t.size) : 0;
    if (rerender) this.renderToolPanel();
  }
  setBrush(r) {
    const t = this.game.catalog.tools[this.state.tool];
    this.state.brushR = r;
    if (t && t.brush) { settings.brushSizes[t.cat] = r; saveSettings(); }
    this.renderToolPanel();
  }
  renderToolPanel() {
    const st = this.state, panel = $('#toolpanel');
    if (st.cat === 'inspect') return;
    const cat = CATEGORIES.find(c => c.key === st.cat);
    // Selection and monthly updates rebuild the DOM. Keep the current list's
    // viewport; another category, plant tab or map starts with its own top row.
    const view = `${this.game.map}|${st.cat}|${st.cat === 'plants' ? st.plantTab : ''}`;
    const sameList = this.toolPanelView === view;
    const gridScroll = sameList ? panel.querySelector('.tool-grid')?.scrollTop || 0 : 0;
    const panelScroll = sameList ? panel.scrollTop : 0;
    const descScroll = sameList && this.toolPanelTool === st.tool ? panel.querySelector('.tool-desc')?.scrollTop || 0 : 0;
    this.toolPanelView = view;
    this.toolPanelTool = st.tool;
    panel.innerHTML = '';
    const head = el('div', 'tp-head', `<button class="tp-collapse" title="${st.toolCollapsed ? 'Expand panel' : 'Collapse panel'}">${st.toolCollapsed ? '+' : '−'}</button><h2>${cat.name}</h2><p>${this.game.catalog.definition.categoryDesc?.[cat.key] || cat.desc}</p>`);
    head.querySelector('.tp-collapse').addEventListener('click', () => { st.toolCollapsed = !st.toolCollapsed; this.renderToolPanel(); });
    panel.appendChild(head);
    panel.classList.toggle('collapsed', !!st.toolCollapsed);
    if (st.toolCollapsed) {
      const t = this.game.catalog.tools[st.tool];
      if (t) head.querySelector('p').textContent = `Using: ${t.name}`;
      return;
    }
    if (st.cat === 'plants') {
      const tabs = el('div', 'tabs');
      for (const t of PLANT_TABS) {
        if (!this.tabOpen(t.key)) continue;
        const b = el('button', t.key === st.plantTab ? 'on' : '', this.game.catalog.definition.plantTabs?.[t.key] || t.name); // (the reef calls its trees hard corals)
        b.addEventListener('click', () => {
          st.plantTab = t.key;
          const first = this.toolsFor('plants', true)[0];
          this.selectTool(first.key);
        });
        tabs.appendChild(b);
      }
      panel.appendChild(tabs);
    }
    const grid = el('div', 'tool-grid');
    for (const t of this.toolsFor(st.cat)) {
      const open = this.isOpen(t.key), ch = open ? -1 : chapterOfTool(t.key, this.game);
      const price = listPrice(this.game, t);
      const card = el('div', 'tool-card' + (t.key === st.tool ? ' on' : '') + (open && price > this.game.money ? ' poor' : '') + (open ? '' : ' locked'));
      const costTxt = !open ? (ch < 0 ? 'Later' : `Chapter ${ch + 1}`) : t.costFor ? 'varies' : price ? money(price) + (t.brush ? '/tile' : '') : 'free';
      card.innerHTML = `<img src="${iconThumb(t.icon, this.game.catalog)}" alt="">${open ? '' : `<span class="lock">${ICONS.lock}</span>`}<div class="nm">${t.name}</div><div class="cost">${costTxt}</div>`;
      // (a few tools aren't part of any chapter and open when the campaign is finished)
      const chName = this.game.catalog.chapters[ch]?.title; // (a tool a chapter on another map unlocks has no chapter here)
      card.title = open ? t.desc : ch < 0 || !chName ? 'Unlocks when you finish the campaign' : `Unlocks in Chapter ${ch + 1}: ${chName}`;
      card.addEventListener('click', () => open ? this.selectTool(t.key) : this.game.notify(ch < 0 || !chName ? `${t.name} unlocks when you finish the campaign.` : `${t.name} unlocks in Chapter ${ch + 1}, "${chName}". Finish this chapter's goals to get there.`, 'info'));
      grid.appendChild(card);
    }
    panel.appendChild(grid);
    const t = this.game.catalog.tools[st.tool];
    if (t) {
      const d = el('div', 'tool-desc');
      let html = `<b>${t.name}</b>`;
      html += `<details class="tool-notes"${st.toolNotesOpen ? ' open' : ''}><summary>Details and conditions</summary><div class="tool-notes-body">`;
      if (t.species && t.species.length === 1) {
        const p = this.game.catalog.plant[t.species[0]];
        html += `<div class="sci">${p.sci} · ${p.kindName || this.game.catalog.definition.layerNames?.[p.layer] || LAYER_NAMES[p.layer]}</div>`;
      }
      html += `<div>${t.desc}</div>`;
      if (this.game.diff.ecology && CHALLENGE_TOOL_ADVICE[t.key] && !this.game.catalog.definition.look.underwater) html += `<div>${CHALLENGE_TOOL_ADVICE[t.key]}</div>`;
      if (t.species) {
        const sp = [...new Set(t.species)].map(k => this.game.catalog.plant[k]); // (a mix can weight one species by listing it twice)
        if (sp.length === 1) {
          const p = sp[0];
          // (under the sea: no moisture, and light is how bright the water is; the "soil builder" is the algae that cements rubble)
          html += this.game.catalog.definition.look.underwater && !p.cay
            ? `<div class="prefs"><span>☀ ${p.light[0] >= 0.5 ? 'bright, shallow water' : p.light[0] <= 0.15 ? 'bright or shaded water' : 'bright or part-shaded water'}</span>${p.nfix ? '<span>cements rubble</span>' : ''}</div>`
            : `<div class="prefs"><span>💧 ${moistWord(p.moist[0], p.moist[1])}</span><span>☀ ${lightWord(p.light[0], p.light[1])}</span>${p.soil > 0.15 ? `<span>needs rich soil</span>` : ''}${p.nfix ? '<span>fixes nitrogen</span>' : ''}</div>`;
        } else html += `<div class="prefs">${sp.map(p => `<span>${p.name}</span>`).join('')}</div>`;
      }
      if (t.cat === 'visitors') {
        const v = this.game.visitors, f = v.facilities();
        v.network();
        html += `<div class="prefs"><span>${f.parking ? `${v.net.length} trail tiles connected to a trailhead` : 'No trailhead parking yet'}</span></div>`;
      }
      if (t.animal) {
        const a = this.game.catalog.animal[t.animal];
        html += `<div class="prefs"><span>Needs: ${a.hint}</span></div>`;
      }
      html += '</div></details>';
      if (t.brush) {
        html += `<div class="brush">Brush <span class="bsz"></span></div>`;
      } else if (t.cat !== 'wildlife') html += `<div class="small" style="margin-top:6px">Click a tile to place.</div>`;
      else html += `<div class="small" style="margin-top:6px">Click where you'd like to release them.</div>`;
      d.innerHTML = html;
      const notes = d.querySelector('.tool-notes');
      notes.addEventListener('toggle', () => { st.toolNotesOpen = notes.open; });
      if (t.brush) {
        const wrap = d.querySelector('.bsz');
        BRUSH_SIZES.forEach(r => {
          const b = el('button', r === st.brushR ? 'on' : '', `<span style="width:${4 + r * 2.5}px;height:${4 + r * 2.5}px"></span>`);
          b.title = `Radius ${r}  ([ and ] keys)`;
          b.addEventListener('click', () => this.setBrush(r));
          wrap.appendChild(b);
        });
      }
      panel.appendChild(d);
      d.scrollTop = descScroll;
    }
    grid.scrollTop = gridScroll;
    panel.scrollTop = panelScroll;
  }
  nudgeBrush(dir) {
    const t = this.game.catalog.tools[this.state.tool];
    if (!t || !t.brush) return;
    const k = BRUSH_SIZES.indexOf(this.state.brushR);
    this.setBrush(BRUSH_SIZES[clamp(k + dir, 0, BRUSH_SIZES.length - 1)]);
  }

  // ------------------------------------------------------------ info panel
  // Jump the camera to one of this species' animals; calling again cycles through them.
  locateAnimal(def) {
    const list = this.game.wildlife.agents.filter(a => a.sp === def.index && !a.leaving);
    if (!list.length) return false;
    this.locateIdx = ((this.locateIdx ?? -1) + 1);
    if (this.locateKey !== def.key) { this.locateKey = def.key; this.locateIdx = 0; }
    const a = list[this.locateIdx % list.length];
    if (this.modalOpen) this.closeModal();
    const r = this.renderer;
    if (r.zoom < 2.2) r.zoom = 2.2;
    r.centerOnAnimal(a);
    this.inspectAgent(a);
    // In portrait on a phone the full inspector covers the screen's centre.
    // Keep its compact header available while giving the located animal room.
    const panel = $('#infopanel'), box = panel.getBoundingClientRect();
    if (TOUCH && box.left < innerWidth / 2 && box.right > innerWidth / 2 && box.top < innerHeight / 2 && box.bottom > innerHeight / 2) {
      this.infoMin = true; this.renderInfo();
    }
    r.frameGoal = this.animalFrame(); r.animalFraming = true;
    this.follow = a;
    return true;
  }

  // Keep a clicked animal in view until the player moves the camera (see Input.update).
  followAnimal(a) {
    if (this.follow === a) return;
    this.renderer.glideToAnimal(a);
    this.renderer.frameGoal = this.animalFrame(); this.renderer.animalFraming = true;
    this.follow = a;
  }

  animalFrame() {
    if (!TOUCH) return { x: 0.5, y: 0.5 };
    const panel = $('#infopanel'), box = panel.getBoundingClientRect();
    const toolbar = $('#toolbar').getBoundingClientRect(), topbar = $('#topbar').getBoundingClientRect();
    const left = toolbar.right + 12;
    // Frame the animal in the open map beside the full inspector, rather than
    // behind it or its edge. Recomputed while following for rotation/collapse.
    const right = box.width > 0 && box.height > 0 && !panel.classList.contains('hidden') && !panel.classList.contains('min') ? box.left - 16 : innerWidth - 12;
    return { x: clamp((left + right) / 2 / innerWidth, 0.2, 0.8),
      y: clamp((topbar.bottom + 20 + innerHeight - 24) / 2 / innerHeight, 0.3, 0.7) };
  }

  closeInfo() {
    this.follow = null;
    this.state.inspect = null;
    this.game.selectedAgent = null;
    $('#infopanel').classList.add('hidden');
  }
  inspectTile(i) {
    this.follow = null;
    this.game.flags.inspected = true;
    this.game.selectedAgent = null;
    this.state.inspect = { i };
    this.renderInfo();
  }
  inspectAgent(a) {
    this.game.flags.inspected = true;
    if (this.follow && this.follow !== a) this.follow = null;
    this.game.selectedAgent = a;
    this.state.inspect = { agent: a.id };
    this.renderInfo();
  }
  renderInfo() {
    const panel = $('#infopanel');
    const ins = this.state.inspect;
    if (!ins) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    panel.classList.toggle('min', !!this.infoMin);
    const existingMini = panel.querySelector('.minimize');
    if (existingMini) { setText(existingMini, this.infoMin ? '+' : '−'); setAttr(existingMini, 'title', tr(this.infoMin ? 'Expand' : 'Collapse')); }
    if (ins.agent) {
      const a = this.game.wildlife.findAgent(ins.agent);
      if (!a) { if (!setHTML(panel, `<button class="close">×</button><h3>Gone</h3><p class="info-desc">This animal has moved on, or didn't make it.</p>`)) return; }
      else if (!setHTML(panel, this.agentHTML(a))) return;
    } else if (!setHTML(panel, this.tileHTML(ins.i))) return;
    panel.querySelector('.close')?.addEventListener('click', () => this.closeInfo());
    const mini = el('button', 'minimize', this.infoMin ? '+' : '−');
    mini.title = this.infoMin ? 'Expand' : 'Collapse';
    mini.addEventListener('click', () => { this.infoMin = !this.infoMin; this.renderInfo(); });
    panel.prepend(mini);
    panel.classList.toggle('min', !!this.infoMin);
    panel.querySelectorAll('[data-guide]').forEach(b => b.addEventListener('click', () => this.openGuide('animals', b.dataset.guide)));
    panel.querySelectorAll('[data-overlay]').forEach(b => b.addEventListener('click', () => this.setOverlay('species', +b.dataset.overlay)));
    panel.querySelectorAll('[data-next]').forEach(b => b.addEventListener('click', () => this.locateAnimal(this.game.catalog.animal[b.dataset.next])));
    panel.querySelector('[data-follow]')?.addEventListener('click', () => {
      const a = this.game.wildlife.findAgent(ins.agent);
      if (!a) return;
      this.renderer.zoom = Math.max(2.2, this.renderer.zoom);
      this.renderer.centerOnAnimal(a);
      this.renderer.frameGoal = this.animalFrame(); this.renderer.animalFraming = true;
      this.follow = a;
    });
  }
  agentHTML(a) {
    const def = animalDef(a, this.game.catalog), st = this.game.wildlife.state[a.sp];
    if (a.passing) return `<button class="close">×</button>
      <div class="animal-hero"><img src="${animalThumb(def.key, this.game.catalog)}"><div><h3>${def.name}</h3><div class="small"><i>${def.sci}</i></div></div></div>
      <div class="kv"><span class="k">Status</span><span>Flying through</span><span class="k">Flock</span><span>${this.game.wildlife.flyovers.filter(b => b.flock === a.flock).length} birds</span></div>
      <p class="info-desc">This bird is passing over the map. It does not live on the property or count toward its resident population.</p>
      <div class="info-actions"><button type="button" class="primary" data-follow>${PILL.follow}Follow bird</button><button type="button" data-guide="${def.key}">${PILL.guide}Field guide</button></div>
      <p class="info-desc">${def.desc}</p>`;
    const ageY = a.age / 120;
    const hunt = { creep: 'Stalking prey', rush: 'Chasing prey', circle: 'Circling over prey' }[a.hunt?.phase] || 'Hunting';
    const birdStatus = { forage: 'Pecking for food', perch: 'Resting on a perch', preen: 'Preening feathers', bathe: 'Bathing at the water’s edge', nest: 'Visiting a nest site', rest: 'Resting', soar: 'Soaring over open ground' }[a.bird?.kind];
    const grouped = def.familyHerd && (a.herdOf != null && a.herdOf !== a.id || this.game.wildlife.agents.some(c => c !== a && (c.herdOf === a.id || c.mom === a.id)));
    const familyStatus = a.mom != null ? (a.follow ? 'Following mother' : 'With a family herd') : grouped ? (isMaleVariant(def, a) ? 'With a bachelor group' : 'With a family herd') : null;
    const status = a.leaving ? 'Leaving the property' : dormancyStatus(a) || (a.fromFire && a.state === 'fly' ? 'Fleeing the fire' : a.state === 'hunt' ? hunt : a.state === 'flee' ? (a.play ? 'Playing' : a.fromFire ? 'Fleeing the fire' : 'Running from danger')
      : a.state === 'forage' ? ({ grass: 'Grazing', browse: 'Browsing leaves', leaves: 'Eating canopy leaves', fruit: 'Eating fruit', seeds: 'Foraging for seeds', insects: 'Catching insects', nectar: 'Feeding on nectar', seagrass: 'Grazing seagrass', sponge: 'Feeding on sponges', coral: 'Picking at coral', algae: 'Grazing algae', sediment: 'Deposit feeding', plankton: 'Feeding on plankton', dung: 'Feeding on dung', cleaning: 'Cleaning a reef fish', cleaned: 'Visiting a cleaning station' }[a.forage?.food] || 'Foraging') : a.forageGoal != null ? 'Moving to a feeding spot'
      : a.state === 'primate' ? 'Eating fruit' : a.fruitGoal ? 'Looking for fruit' : a.state === 'play' ? 'Playing' : a.state === 'carry' ? (a.carry?.low ? 'Dragging a fish to the bank' : a.carry?.phase === 'mantle' ? 'Mantling over its catch' : 'Carrying its catch to a perch') : a.state === 'feed' ? (a.prey ? 'Eating its catch' : 'Feeding') : a.drinkT > 0 ? 'Drinking' : a.state === 'spar' ? (a.sparStyle === 'necking' ? 'Necking with a rival male' : def.sprite.male?.antlers ? 'Clashing antlers with a rival' : 'Sparring with a rival')
      : a.greet != null && def.sprite.male?.antlers && isMaleVariant(def, a) ? 'Approaching a rival' : a.socialWith != null ? 'Watching an approaching neighbour' : a.bugleT > 0 ? 'Bugling' : a.haremOf != null ? 'In a bull’s harem' : this.game.wildlife.agents.some(c => c.haremOf === a.id) ? 'Guarding his harem' : a.greetT > 0 ? 'Greeting a neighbour' : a.alertT > 0 ? 'On the alert' : familyStatus || birdStatus || (a.state === 'walk' || a.state === 'fly' ? (a.birdGround ? 'Hopping between feeding spots' : a.move === 'fly' ? 'Flying' : a.move === 'tree' && ['monkey', 'orangutan'].includes(def.sprite.kind) ? 'Climbing through the canopy' : 'Wandering') : 'Resting / foraging'));
    const ageTxt = ageY < 1 ? `${Math.max(1, Math.round(ageY * 12))} months` : `${ageY.toFixed(1)} years`;
    return `<button class="close">×</button>
      <div class="animal-hero"><img src="${animalThumb(def.key, this.game.catalog, isMaleVariant(def, a))}"><div><h3>${def.name}</h3><div class="small"><i>${def.sci}</i></div></div></div>
      <div class="info-actions"><button type="button" class="primary" data-overlay="${def.index}" title="Show where its habitat is on the map">${PILL.habitat}Habitat</button>${st.pop > 1 ? `<button type="button" data-next="${def.key}" title="Jump to another ${def.name.toLowerCase()}">${PILL.next}Find next</button>` : ''}<button type="button" data-guide="${def.key}" title="Open the field guide">${PILL.guide}Guide</button></div>
      <div class="kv"><span class="k">Status</span><span>${status}${a.spawner ? ' (spawning run)' : ''}${a.juvenile ? ' (juvenile)' : ''}${isMaleVariant(def, a) ? ` (${def.sprite.maleName || 'adult male'})` : ''}</span>
      <span class="k">Age</span><span>${ageTxt}</span>
      <span class="k">Population</span><span>${st.pop} here · room for ${Math.floor(st.K)}</span></div>
      <p class="info-desc">${def.desc}</p>
      <div class="section-title">Needs</div><p class="info-desc">${def.hint}</p>
      ${this.wildlifeDiagnosticHTML(def)}`;
  }
  wildlifeDiagnosticHTML(def) {
    const d = wildlifeDiagnostics(this.game, def);
    return `<div class="section-title">Wildlife status</div><p class="info-desc st ${d.tone === 'info' ? '' : d.tone}"><b>${d.status}</b></p>
      ${d.rows.map(row => `<div class="need"><span class="st ${row.tone === 'info' ? '' : row.tone}" aria-hidden="true">${row.tone === 'good' ? '●' : row.tone === 'warn' ? '▲' : '•'}</span><span><b>${row.title}</b><br>${row.text}</span></div>`).join('')}`;
  }
  tileHTML(i) {
    const g = this.game, w = g.world;
    const x = i % w.w, y = (i / w.w) | 0;
    const h = w.habitat[i], hi = this.game.catalog.habitatInfo[h];
    const t = w.terrain[i];
    const bar = (v, col = 'var(--moss)') => `<div class="bar"><i style="width:${pct(clamp(v, 0, 1))};background:${col}"></i></div>`;
    let html = `<button class="close">×</button><h3><span class="chip" style="background:${hi.color}"></span>${hi.name}</h3>
      <div class="small">Tile ${x}, ${y} · ${this.game.catalog.terrainNames[t]}</div>`;
    const sk = w.struct[i];
    if (sk >= 0) {
      const s = w.structures[sk], d = this.game.catalog.structures[s.type];
      html += `<p class="info-desc"><b>${d.name}.</b> ${d.roost && !d.permanent ? `Bats and owls roost in it. You can demolish it for ${money(d.removeCost - d.salvage)}${d.salvage ? ` (after ${money(d.salvage)} salvage)` : ''}, but it takes their roost away.` : `Remove it with the Demolish tool for ${money(d.removeCost - d.salvage)}${d.salvage ? ` (after ${money(d.salvage)} salvage)` : ''}.`}</p>`;
      return html;
    }
    const sea = this.game.catalog.definition.look.underwater, depth = sea ? sea.level - w.tileH(x, y) : 0; // (on the reef: how deep the water is)
    html += `<div class="kv">
      ${sea ? '' : `<span class="k">Moisture</span>${bar(w.moist[i], '#4d8fc0')}`}
      <span class="k">${sea ? 'Reef surface' : 'Soil health'}</span>${bar(w.soil[i], '#8a6a3a')}
      <span class="k">Sunlight</span>${bar(1 - w.canopy[i], '#e0b02a')}
      ${sea ? `<span class="k">Depth</span><span>${depth > 0 ? `${Math.max(1, Math.round(depth * 1.6))} m at low tide` : 'Above the waterline'}</span>` : `<span class="k">Elevation</span><span>${Math.round(180 + w.tileH(x, y) * 40)} ft</span>`}
      ${w.disturb[i] > 0.05 ? `<span class="k">Disturbance</span>${bar(w.disturb[i], '#d0703a')}` : ''}`;
    if (isWater(t)) {
      html += `<span class="k">Water quality</span>${bar(w.waterQ[i], '#5ab0a0')}
        <span class="k">Fish access</span><span>${w.connected[i] ? '<span class="st good">Connected to the river</span>' : '<span class="st bad">Cut off from the river</span>'}</span>`;
      if (t === T.CREEK) html += `<span class="k">For ${this.game.catalog.definition.text.creekFish}</span><span>${w.waterQ[i] > 0.43 ? '<span class="st good">Cool and shaded</span>' : '<span class="st warn">Too sunny and warm. Plant shrubs and trees along the banks.</span>'}</span>`;
    }
    html += `</div>`;
    const waterNote = g.water?.note(i);
    if (waterNote) html += `<div class="info-desc">${waterNote}</div>`;
    const note = this.game.catalog.definition.tileNote?.(this.game, i);
    if (note) html += `<div class="info-desc">${note}</div>`;
    for (const pressure of pressureTileNotes(g, i)) html += `<div class="info-desc">${pressure}</div>`;
    if (w.fire[i]) html += `<div class="info-desc st bad"><b>On fire!</b> Use the Fire crew tool to put it out.</div>`;
    else if (w.flood[i]) html += `<div class="info-desc"><b>Flooded</b> for another ${w.flood[i]} days.</div>`;
    else if (w.scorch[i] > 0) html += `<div class="info-desc">Burned recently. The ash will feed new growth.</div>`;
    const f = w.feature[i];
    if (f) html += `<div class="section-title">Feature</div><div class="info-desc">${f === F.DAM && (w.marks[i] & 4) ? 'Canal block: it holds the water back, so the peat upstream stays wet' : f === F.FENCE && this.game.catalog.definition.text.fenceName ? this.game.catalog.definition.text.fenceName : FEATURE_NAMES[f]}${f === F.CULVERT ? `: blocks ${this.game.catalog.definition.text.culvertBlocks}. Demolish it to reopen the creek.` : f === F.DAM && !(w.marks[i] & 4) ? '. Beavers keep it up; left untended it washes out within a year or two. Demolish it to drain the pond.' : f === F.FENCE ? `: blocks ${this.game.catalog.definition.text.fenceBlocks}.` : ''}</div>`;
    const layers = [[w.ground[i], w.groundG[i]], [w.shrub[i], w.shrubG[i]], [w.tree[i], w.treeG[i]]];
    const rows = layers.filter(l => l[0]).map(([id, gg]) => {
      const p = this.game.catalog.plants[id];
      const s = plantSuit(w, i, p);
      const lim = plantLimits(w, i, p);
      const cls = s >= 0.55 ? 'good' : s >= 0.3 ? 'warn' : 'bad';
      const word = s >= 0.55 ? 'Thriving' : s >= 0.3 ? 'Getting by' : 'Struggling';
      const extra = p.layer === 2 && w.treeAge[i] ? ` · ${(w.treeAge[i] / 120).toFixed(0)} yrs` : '';
      return `<div class="plant-row"><img src="${plantThumb(p.key, this.game.catalog)}"><div style="flex:1"><div class="nm">${p.name}${p.invasive ? ' <span class="st bad">(invasive)</span>' : ''}</div>
        <div class="st ${cls}">${word}${lim.length && s < 0.55 ? ': ' + lim.join(', ') : ''} · ${pct(gg)} grown${extra}</div></div></div>`;
    });
    html += `<div class="section-title">Plants</div>` + (rows.length ? rows.join('') : `<div class="info-desc">Nothing growing here${t === T.PASTURE && !this.game.catalog.definition.sandBed ? ' but tired pasture grass' : ''}.</div>`);
    // animals nearby
    const near = g.wildlife.agents.filter(a => Math.abs(a.x - x - 0.5) < 2 && Math.abs(a.y - y - 0.5) < 2);
    if (near.length) {
      const names = [...new Set(near.map(a => this.game.catalog.animals[a.sp].name))];
      html += `<div class="section-title">Nearby</div><div class="info-desc">${names.join(', ')}</div>`;
    }
    return html;
  }

  // ------------------------------------------------------------ per-frame
  frame() {
    this.refreshTop();
    rutSounds(this.game, this.renderer, music, this.renderer.time);
    const now = performance.now();
    if (this.state.inspect && now - this.lastInfo > 600) { this.lastInfo = now; this.renderInfo(); }
    if (now - this.lastMini > 120) { this.lastMini = now; this.drawMinimap(now - this.lastMiniFull > 1500); }
  }

  // ------------------------------------------------------------ toasts & journal
  toast(n) {
    this.journal.unshift(n);
    if (this.journal.length > 120) this.journal.pop();
    if (settings.notifications === 'hidden') return;
    // "important only": routine updates skip the pop-up but stay in the journal
    if (settings.notifications === 'important' && (n.kind === 'info' || n.kind === 'season') && !n.loc) return;
    const box = $('#toasts');
    const icon = { good: 'good', warn: 'warn', discover: 'star', goal: 'star', season: 'leaf', info: 'info', fire: 'fire', flood: 'rain' }[n.kind] || 'info';
    const t = el('div', `toast ${n.kind}` + (n.loc ? ' clickable' : ''), `<span class="ti">${ICONS[icon]}</span><span class="toast-text">${n.text}</span><button type="button" class="notice-close" aria-label="Dismiss notification" title="Dismiss notification">×</button>`);
    t.querySelector('.notice-close').addEventListener('click', e => { e.stopPropagation(); t.remove(); });
    if (n.loc) t.addEventListener('click', () => {
      this.follow = null;
      const lx = n.loc.x ?? 0, ly = n.loc.y ?? 0;
      this.renderer.centerOn(lx, ly);
      if (n.loc.id && this.game.wildlife.agents.includes(n.loc)) this.inspectAgent(n.loc);
    });
    // a plain note: tap to read it all, tap again to put it away
    else t.addEventListener('click', () => {
      const text = t.querySelector('.toast-text');
      if (!t.classList.contains('open') && text.scrollHeight > text.clientHeight + 2) { t.classList.add('open'); return; }
      t.classList.add('fade'); setTimeout(() => t.remove(), 500);
    });
    box.prepend(t);
    // keep the land in view (everything is in the journal): routine notes go first, so a warning
    // isn't pushed off the screen by two bits of news that came in just after it
    while (box.children.length > 2) {
      const kids = [...box.children], routine = kids.slice(1).reverse().find(c => /\b(info|season|good)\b/.test(c.className));
      (routine || box.lastChild).remove();
    }
    const life = n.kind === 'discover' || n.kind === 'goal' || n.kind === 'fire' || n.kind === 'flood' ? 10000 : n.kind === 'warn' ? 8000 : 5500;
    setTimeout(() => { t.classList.add('fade'); setTimeout(() => t.remove(), 600); }, life);
  }

  // ------------------------------------------------------------ minimap
  bindMinimap() {
    let down = false;
    const go = e => {
      this.follow = null;
      const r = this.minimap.getBoundingClientRect();
      const w = this.game.world;
      this.renderer.centerOn((e.clientX - r.left) / r.width * w.w, (e.clientY - r.top) / r.height * w.h);
    };
    this.minimap.addEventListener('mousedown', e => { down = true; go(e); });
    window.addEventListener('mousemove', e => { if (down) go(e); });
    window.addEventListener('mouseup', () => { down = false; });
  }
  drawMinimap(full) {
    const g = this.game, w = g.world, c = this.minimap, ctx = c.getContext('2d');
    const sx = c.width / w.w, sy = c.height / w.h;
    if (full || !this.miniImg) {
      this.lastMiniFull = performance.now();
      if (!this.miniImg) { this.miniImg = document.createElement('canvas'); this.miniImg.width = c.width; this.miniImg.height = c.height; }
      const m = this.miniImg.getContext('2d');
      for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
        const i = w.idx(x, y);
        m.fillStyle = this.game.catalog.habitatInfo[w.habitat[i]].color;
        m.fillRect(x * sx, y * sy, sx + 0.5, sy + 0.5);
      }
    }
    ctx.drawImage(this.miniImg, 0, 0);
    ctx.fillStyle = 'rgba(255,250,230,0.9)';
    for (const a of g.wildlife.agents) {
      if (a.x < 0 || a.y < 0 || a.x > w.w || a.y > w.h) continue;
      ctx.fillRect(a.x * sx - 1.5, a.y * sy - 1.5, 3, 3);
    }
    if (g.events.fireTiles || g.events.floodTiles) {
      for (let i = 0; i < w.n; i++) {
        if (!w.fire[i] && !w.flood[i]) continue;
        ctx.fillStyle = w.fire[i] ? '#ff5a1e' : 'rgba(90,150,200,0.85)';
        ctx.fillRect((i % w.w) * sx, ((i / w.w) | 0) * sy, sx + 0.5, sy + 0.5);
      }
    }
    const vp = this.renderer.viewportPolygon();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath();
    vp.forEach(([x, z], k) => { const px = x * sx, py = z * sy; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.closePath(); ctx.stroke();
  }

  // ------------------------------------------------------------ legend
  renderLegend() {
    const lg = $('#legend'), mode = this.state.overlay;
    if (mode === 'none') { lg.classList.add('hidden'); return; }
    lg.classList.remove('hidden');
    const grad = (cols, a, b) => `<div class="grad" style="background:linear-gradient(90deg,${cols.join(',')})"></div><div class="ends"><span>${a}</span><span>${b}</span></div>`;
    let html = '';
    if (mode === 'habitat') {
      const counts = this.game.world.stats.counts || [];
      html = '<b>Habitat types</b>' + this.game.catalog.habitatInfo.map((h, k) => counts[k] ? `<div class="row"><span class="chip" style="background:${h.color}"></span>${h.name}<span class="small" style="margin-left:auto">${counts[k]}</span></div>` : '').join('');
    }
    else if (mode === 'moisture') html = '<b>Moisture</b>' + grad(['#d9b36a', '#8fc07a', '#2f6fa8'], 'dry', 'saturated');
    else if (mode === 'soil') html = '<b>Soil health</b>' + grad(['#c8b89a', '#8a6a3a', '#3a2614'], 'worn out', 'rich');
    else if (mode === 'light') html = '<b>Sunlight at ground level</b>' + grad(['#1c2a3a', '#6a8a6a', '#f2e08a'], 'deep shade', 'full sun');
    else if (mode === 'elevation') html = '<b>Elevation</b>' + grad(['#2f6a5a', '#c8c07a', '#f4f0e8'], 'low (wetter)', 'high (drier)');
    else if (mode === 'disturb') html = '<b>Visitor disturbance</b>' + grad(['#f2e08a', '#e0843a', '#b8302a'], 'a little', 'a lot') + '<div class="small" style="margin-top:4px">Shy species avoid busy trails. Screening shrubs and viewing blinds help.</div>';
    else if (mode === 'flood') html = '<b>Flood risk</b><div class="row"><span class="chip" style="background:#1f6bf2"></span>Underwater right now</div><div class="row"><span class="chip" style="background:#3380d9"></span>Floods most winters</div><div class="row"><span class="chip" style="background:#8cc7f2"></span>Only in a big flood</div><div class="small" style="margin-top:4px">Marshes, ponds and beaver dams soak up floodwater and shrink these zones.</div>';
    else if (mode === 'fish') html = '<b>Fish passage</b><div class="row"><span class="chip" style="background:#c83c32"></span>Cut off from the river</div>' + grad(['#d88a4a', '#e8d86a', '#5ad0a0'], 'connected, poor', 'connected, clean & shaded');
    else if (mode === 'species') {
      const def = this.game.catalog.animals[this.state.overlaySpecies];
      html = `<b>Where ${many(def)} could live</b>` + grad(['#c8584a', '#e8c85a', '#4ac86a'], 'poor', 'ideal') + `<div class="small" style="margin-top:4px">${def.hint}</div>`;
    }
    lg.innerHTML = html;
  }

  // ------------------------------------------------------------ modals
  modal(title, bodyHTML, { narrow = false, foot = null, onClose = null, dismissible = true } = {}) {
    const root = $('#modal-root');
    root.innerHTML = '';
    const back = el('div', 'modal-back');
    const m = el('div', 'modal glass-menu' + (narrow ? ' narrow' : '')); // (every dialog is sage glass)
    m.innerHTML = `<div class="modal-head"><h2>${title}</h2><button class="x" title="Close (Esc)"${dismissible ? '' : ' hidden'}>×</button></div><div class="modal-body">${bodyHTML}</div>` + (foot ? `<div class="modal-foot">${foot}</div>` : '');
    back.appendChild(m);
    root.appendChild(back);
    const close = (force = false) => {
      if (!dismissible && !force) return;
      root.innerHTML = ''; this.modalOpen = false; if (onClose) onClose();
      // The initial selector requires an explicit Start/Continue action to close.
      if (this.startPause && !this.modalOpen) this.setSpeed(1);
    };
    m.querySelector('.x').addEventListener('click', () => close());
    back.addEventListener('mousedown', e => { if (e.target === back) close(); });
    this.modalOpen = true;
    this.closeModal = close;
    this.lastModal = title.replace(/<[^>]+>/g, '');
    track('panel_opened', { panel: this.lastModal });
    return m;
  }

  openGuide(tab = 'animals', key = null) {
    const g = this.game;
    const wl = g.wildlife;
    wl.computeSuitability();
    const m = this.modal('Field Guide', `<div class="tabs" style="padding:0 0 8px"><button data-tab="animals">Wildlife</button><button data-tab="plants">Plants</button></div><div class="guide"><div class="guide-list"></div><div class="guide-detail"></div></div>`, { onClose: () => { this.refreshWildlifeGuide = null; } });
    const list = m.querySelector('.guide-list'), detail = m.querySelector('.guide-detail');
    const counts = {};
    const w = g.world;
    for (let i = 0; i < w.n; i++) for (const id of [w.ground[i], w.shrub[i], w.tree[i]]) if (id) counts[id] = (counts[id] || 0) + 1;

    const showAnimal = def => {
      this.refreshWildlifeGuide = () => {
        if (!m.isConnected) { this.refreshWildlifeGuide = null; return; }
        showAnimal(def); // Wildlife.monthly() already refreshed the capacity fields.
      };
      const st = wl.state[def.index];
      const known = st.discovered || def.intro;
      m.querySelectorAll('.gcard').forEach(c => c.classList.toggle('on', c.dataset.key === def.key));
      const needs = [];
      if (def.season) needs.push(['info', `Migratory: here from ${seasonText(def.season)}.`]);
      if (def.sources.length) needs.push(['info', `Arrives from ${[...new Set(def.sources.map(s => this.game.catalog.definition.text.edges[s]))].join(', ')}.`]);
      if (def.intro) needs.push(['info', `Can be reintroduced (${money(def.intro)}) from the Wildlife tools.`]);
      detail.innerHTML = `<div class="hero-wrap"><img class="hero" src="${animalThumb(def.key, this.game.catalog)}"${known ? '' : ' style="filter:brightness(0) opacity(.35);background:none"'}></div>
        <h3>${known ? def.name : 'Not yet seen'}</h3><div class="small"><i>${known ? def.sci : def.group}</i></div>
        <p class="info-desc">${known ? def.desc : 'Something that might live here someday. The clue below says what it needs.'}</p>
        <div class="section-title">Habitat needs</div><p class="info-desc">${def.hint}</p>
        ${this.wildlifeDiagnosticHTML(def)}
        ${needs.map(([c, t]) => `<div class="need"><span class="st ${c === 'info' ? '' : c}">${c === 'good' ? '●' : c === 'warn' ? '▲' : '•'}</span><span>${t}</span></div>`).join('')}
        <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">${st.pop > 0 ? `<button class="btn" id="g-find">Find on map${st.pop > 1 ? ` (${st.pop})` : ''}</button>` : ''}<button class="btn ${st.pop > 0 ? 'secondary' : ''}" id="g-show">Show suitable habitat on map</button></div>`;
      detail.querySelector('#g-show').addEventListener('click', () => { this.closeModal(); this.setOverlay('species', def.index); });
      detail.querySelector('#g-find')?.addEventListener('click', () => this.locateAnimal(def));
    };
    // Birds that only fly over: no habitat to build for them, but worth knowing when to look up.
    const passing = passageGuide(g);
    const overhead = def => wl.flyovers.filter(a => a.key === def.key);
    const showPassing = ({ def, seasons }) => {
      this.refreshWildlifeGuide = null;
      m.querySelectorAll('.gcard').forEach(c => c.classList.toggle('on', c.dataset.key === def.key));
      const now = overhead(def).length;
      detail.innerHTML = `<div class="hero-wrap"><img class="hero" src="${animalThumb(def.key, this.game.catalog)}"></div>
        <h3>${def.name}</h3><div class="small"><i>${def.sci}</i></div>
        <p class="info-desc">${def.desc}</p>
        <div class="kv"><span class="k">Passes over</span><span>${seasons.map(s => this.game.catalog.definition.climate.seasons[s]).join(', ')}</span>
        <span class="k">Overhead now</span><span>${now ? `${now} birds` : 'None'}</span></div>
        <p class="info-desc">Flocks cross the property on their way somewhere else. They don't live here, so they don't count toward your species.</p>
        ${now ? '<div style="margin-top:10px"><button class="btn" id="g-follow">Follow a bird</button></div>' : ''}`;
      detail.querySelector('#g-follow')?.addEventListener('click', () => {
        const a = overhead(def)[0];
        if (!a) return;
        this.closeModal();
        const r = this.renderer;
        r.zoom = Math.max(2.2, r.zoom);
        r.centerOnAnimal(a);
        this.inspectAgent(a);
        r.frameGoal = this.animalFrame(); r.animalFraming = true;
        this.follow = a;
      });
    };
    const showPlant = p => {
      this.refreshWildlifeGuide = null;
      const sea = !!this.game.catalog.definition.look.underwater;
      m.querySelectorAll('.gcard').forEach(c => c.classList.toggle('on', c.dataset.key === p.key));
      detail.innerHTML = `<img class="hero" src="${plantThumb(p.key, this.game.catalog)}"><h3>${p.name}</h3><div class="small"><i>${p.sci}</i> · ${p.kindName || this.game.catalog.definition.layerNames?.[p.layer] || LAYER_NAMES[p.layer]}</div>
        <p class="info-desc">${p.desc}</p>
        <div class="kv">${sea ? '' : `<span class="k">Water</span><span>${moistWord(p.moist[0], p.moist[1])}</span>`}
        <span class="k">Light</span><span>${lightWord(p.light[0], p.light[1])}</span>
        ${sea ? '' : `<span class="k">Soil</span><span>${p.soil >= 0.35 ? 'rich, forest soil' : p.soil >= 0.15 ? 'decent soil' : 'any, even worn out'}</span>`}
        <span class="k">Growth</span><span>${p.grow >= 0.015 ? 'fast' : p.grow >= 0.005 ? 'moderate' : 'slow'}</span>
        <span class="k">On the farm</span><span>${counts[p.id] || 0} tiles</span></div>
        ${p.nfix ? `<div class="need"><span class="st good">●</span><span>${sea ? 'Cements loose rubble together, so corals can settle on it.' : 'Fixes nitrogen and improves soil.'}</span></div>` : ''}
        ${p.invasive ? `<div class="need"><span class="st bad">▲</span><span>${this.game.catalog.tools.pull.name === 'Pull invasives' ? 'Invasive. Remove with Pull invasives, or shade it out with trees.' : sea ? `A nuisance. Clear it with ${this.game.catalog.tools.pull.name}.` : `Invasive. Remove with ${this.game.catalog.tools.pull.name}, or shade it out with trees.`}</span></div>` : ''}`;
    };
    const renderList = tab => {
      m.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
      list.innerHTML = '';
      if (tab === 'animals') {
        for (const grp of this.game.catalog.animalGroups) {
          list.appendChild(el('div', 'guide-group', grp));
          const grid = el('div', 'guide-grid');
          for (const def of this.game.catalog.animals.filter(a => a.group === grp)) {
            const st = wl.state[def.index];
            const known = st.discovered || def.intro;
            const c = el('div', 'gcard' + (known ? '' : ' unknown'), `<img src="${animalThumb(def.key, this.game.catalog)}"><div class="nm">${known ? def.name : '???'}</div><div class="pop ${st.pop ? 'here' : ''}">${st.pop ? st.pop + ' here' : known ? 'not here' : 'undiscovered'}</div>`);
            c.dataset.key = def.key;
            if (st.pop) {
              const pin = el('button', 'locate', ICONS.pin);
              pin.title = `Show me on the map${st.pop > 1 ? ' (click again in the panel for the next one)' : ''}`;
              pin.addEventListener('click', e => { e.stopPropagation(); this.locateAnimal(def); });
              c.appendChild(pin);
              c.title = 'Click for details, double-click to find on the map';
              c.addEventListener('dblclick', () => this.locateAnimal(def));
            }
            c.addEventListener('click', () => showAnimal(def));
            grid.appendChild(c);
          }
          list.appendChild(grid);
        }
        if (passing.length) {
          list.appendChild(el('div', 'guide-group', 'Passing birds'));
          const grid = el('div', 'guide-grid');
          for (const p of passing) {
            const n = overhead(p.def).length;
            const c = el('div', 'gcard', `<img src="${animalThumb(p.def.key, this.game.catalog)}"><div class="nm">${p.def.name}</div><div class="pop ${n ? 'here' : ''}">${n ? 'overhead now' : 'passing through'}</div>`);
            c.dataset.key = p.def.key;
            c.addEventListener('click', () => showPassing(p));
            grid.appendChild(c);
          }
          list.appendChild(grid);
        }
        const pass = key && passing.find(p => p.def.key === key);
        if (pass) showPassing(pass);
        else showAnimal(key && this.game.catalog.animal[key] || this.game.catalog.animals.find(a => wl.state[a.index].pop) || this.game.catalog.animals[0]);
      } else {
        for (let layer = 0; layer < 3; layer++) {
          list.appendChild(el('div', 'guide-group', (this.game.catalog.definition.plantTabs ? [this.game.catalog.definition.plantTabs.ground, this.game.catalog.definition.plantTabs.shrub, this.game.catalog.definition.plantTabs.tree] : ['Groundcover', 'Shrubs', 'Trees'])[layer]));
          const grid = el('div', 'guide-grid');
          for (const p of this.game.catalog.plants.filter(q => q && q.layer === layer)) {
            const c = el('div', 'gcard', `<img src="${plantThumb(p.key, this.game.catalog)}"><div class="nm">${p.name}</div><div class="pop ${counts[p.id] ? 'here' : ''}">${counts[p.id] ? counts[p.id] + ' tiles' : 'none yet'}</div>`);
            c.dataset.key = p.key;
            c.addEventListener('click', () => showPlant(p));
            grid.appendChild(c);
          }
          list.appendChild(grid);
        }
        showPlant(key ? this.game.catalog.plant[key] : this.game.catalog.plants[1]);
      }
    };
    m.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { key = null; renderList(b.dataset.tab); }));
    renderList(tab);
  }

  openGoals() {
    const g = this.game;
    let camp = '';
    if (campaignOn(g)) {
      camp = '<div class="section-title" style="margin-top:0">Campaign</div>' + this.game.catalog.chapters.map((c, k) => {
        const state = k < g.campaign.chapter ? 'done' : k === g.campaign.chapter ? 'now' : 'later';
        const goals = state === 'now' ? `<div class="ch-goals">${c.goals.map(o => `<div class="need"><span class="st ${goalMet(g, o) ? 'good' : ''}">${goalMet(g, o) ? '✓' : '•'}</span><span>${o.desc} <span class="small">(${o.prog(g)})</span></span></div>`).join('')}</div>` : '';
        return `<div class="goal chapter ${state}"><div class="check">${state === 'done' ? '✓' : k + 1}</div><div><div class="gn">${c.title}</div>${state === 'later' ? '<div class="gd">Locked</div>' : state === 'done' ? '<div class="gd">Complete</div>' : goals}</div><div class="gr">${money(this.game.goalReward(c.reward))}</div></div>`;
      }).join('') + '<div class="section-title">Milestone grants</div>';
    }
    const html = camp + this.game.catalog.goals.map(goal => {
      const done = !!g.goalsDone[goal.key];
      return `<div class="goal ${done ? 'done' : ''}"><div class="check">${done ? '✓' : ''}</div><div><div class="gn">${goal.name}</div><div class="gd">${goal.desc}</div><div class="gp">${done ? 'Completed' : goal.prog(g)}</div></div><div class="gr">${money(this.game.goalReward(goal.reward))}</div></div>`;
    }).join('');
    this.modal('Restoration Goals', `<p class="info-desc" style="margin-top:0">The ${this.game.catalog.definition.funder || 'land trust'} pays a grant for each milestone. Monthly funding also grows with your ecosystem health score and the number of species living here.</p>${html}`, { narrow: true });
  }

  // Where the money comes from and where it goes: last month, and since the start.
  budgetHTML() {
    const g = this.game, last = g.lastLedger, all = g.stats.ledger || { in: {}, out: {} };
    const side = (k, names, always) => {
      const keys = [...new Set([...always, ...Object.keys(last?.[k] || {}), ...Object.keys(all[k] || {})])].filter(x => names[x] || all[k]?.[x]);
      keys.sort((a, b) => (all[k]?.[b] || 0) - (all[k]?.[a] || 0));
      const sum = o => keys.reduce((t, x) => t + (o?.[x] || 0), 0);
      const row = x => `<span class="k">${names[x] || 'Other'}${INCOME_TIPS[x] && k === 'in' ? `<small>${this.game.catalog.definition.incomeTips?.[x] || INCOME_TIPS[x]}</small>` : ''}</span><span>${last ? money(last[k]?.[x] || 0) : '-'}</span><span>${money(all[k]?.[x] || 0)}</span>`;
      return { html: keys.map(row).join(''), last: last ? sum(last[k]) : 0, all: sum(all[k]) };
    };
    const inc = side('in', { ...INCOME, ...(this.game.catalog.definition.incomeNames || {}) }, ['grant', ...(this.game.catalog.definition.noVisitors ? [] : ['visitors']), ...(this.game.catalog.definition.income || [])]);
    const out = side('out', SPENDING, []);
    const head = t => `<span class="k mh">${t}</span><span class="mh">Last month</span><span class="mh">Since the start</span>`;
    return `<div class="ledger">${head('Money in')}${inc.html}<span class="k tot">Total in</span><span class="tot">${money(inc.last)}</span><span class="tot">${money(inc.all)}</span>
      ${head('Money out')}${out.html || '<span class="k">Nothing spent yet</span><span></span><span></span>'}<span class="k tot">Total out</span><span class="tot">${money(out.last)}</span><span class="tot">${money(out.all)}</span>
      <span class="k tot">Net</span><span class="tot ${inc.last - out.last < 0 ? 'neg' : ''}">${inc.last - out.last < 0 ? '-' : '+'}${money(Math.abs(inc.last - out.last))}</span><span class="tot ${inc.all - out.all < 0 ? 'neg' : ''}">${inc.all - out.all < 0 ? '-' : '+'}${money(Math.abs(inc.all - out.all))}</span></div>`;
  }
  openMoney() {
    const g = this.game;
    this.modal('Money', `<p class="info-desc" style="margin-top:0">You have ${money(g.money)}. ${g.lastLedger ? 'Last month' : 'At the end of each month this shows last month'}, and everything since the start, by where it came from.</p>${this.budgetHTML()}`, { narrow: true });
    track('panel_opened', { panel: 'money', map: g.map });
  }

  openReport() {
    const g = this.game, s = g.updateScore(), w = g.world, st = w.stats;
    const rows = s.parts.map(p => {
      const neg = p.pts < 0;
      const width = neg ? Math.abs(p.pts) / 15 : p.pts / (p.max || 1);
      return `<div class="srow"><span>${p.name}</span><div class="bar"><i class="${neg ? 'neg' : ''}" style="width:${pct(clamp(width, 0, 1))}"></i></div><span class="v">${neg ? '' : '+'}${p.pts.toFixed(1)}</span></div>`;
    }).join('');
    const land = st.land || 1;
    const habRows = this.game.catalog.habitatInfo.map((h, k) => [h, st.counts[k] || 0]).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1])
      .map(([h, c]) => `<div class="srow"><span><span class="chip" style="background:${h.color}"></span> ${h.name}</span><div class="bar"><i style="width:${pct(c / w.n * 2.5)};background:${h.color}"></i></div><span class="v">${c}</span></div>`).join('');
    const body = `<div class="report">
      <div><h4>Ecosystem health: ${Math.round(s.total)} / 100</h4>${rows}
        <h4 style="margin-top:18px">Score over time</h4><canvas id="spark" class="ph-no-capture" width="420" height="110" style="width:100%;height:110px;background:var(--paper-2);border-radius:10px"></canvas>
        <h4 style="margin-top:18px">Budget</h4>${this.budgetHTML()}
      </div>
      <div><h4>Land cover</h4>${habRows}
        <div class="kv" style="grid-template-columns:150px 1fr;margin-top:12px"><span class="k">Native cover</span><span>${pct(s.nativeFrac || 0)} of land</span><span class="k">Invasive cover</span><span>${pct(s.invFrac || 0)}</span><span class="k">Native plant species</span><span>${s.nativePlants}</span><span class="k">Animal species</span><span>${s.animals} of ${this.game.catalog.animals.length}</span></div>
      </div></div>`;
    const m = this.modal('Ecosystem Report', body);
    const c = m.querySelector('#spark'), ctx = c.getContext('2d');
    const hist = g.history;
    if (hist.length > 1) {
      ctx.strokeStyle = '#4f7d3b'; ctx.lineWidth = 2.5; ctx.beginPath();
      hist.forEach((h, k) => { const x = 8 + k / (hist.length - 1) * (c.width - 16), y = c.height - 8 - h.score / 100 * (c.height - 16); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
      // invasive cover on the same 0-100 scale, so a rising pink line is an early warning
      if (hist.some(h => h.inv != null)) {
        ctx.strokeStyle = '#c0467a'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath();
        hist.forEach((h, k) => { const x = 8 + k / (hist.length - 1) * (c.width - 16), y = c.height - 8 - (h.inv || 0) * 100 / 100 * (c.height - 16); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.stroke(); ctx.setLineDash([]);
        ctx.font = '700 11px Nunito'; ctx.fillStyle = '#4f7d3b'; ctx.fillText(tr('Health'), 12, 16); ctx.fillStyle = '#c0467a'; ctx.fillText(tr('Invasive cover %'), 62, 16);
      }
    } else { ctx.fillStyle = '#7a7a62'; ctx.font = '600 13px Nunito'; ctx.fillText(tr('History builds up month by month.'), 12, 58); }
  }

  openJournal() {
    const rows = this.journal.map(n => `<div class="journal-row"><span class="d">${n.date}</span><span>${n.text}</span></div>`).join('') || '<p class="info-desc">Nothing yet.</p>';
    this.modal('Field Journal', rows, { narrow: true });
  }

  // The overlay menu as a list (on a phone, or wherever the top bar has no room for the dropdown)
  openOverlayPicker() {
    const opts = [...$('#overlay').options].map(o => [o.value, o.value === 'none' ? 'No overlay' : o.textContent]);
    const m = this.modal('Map overlay', `<div class="menu-list">${opts.map(([v, t]) => `<button class="btn ${v === this.state.overlay ? '' : 'secondary'}" data-v="${v}">${t}</button>`).join('')}</div>`, { narrow: true });
    m.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => { this.setOverlay(b.dataset.v); this.closeModal(); }));
  }

  openMenu() {
    const m = this.modal('Menu', `<div class="menu-list">
      <button class="btn secondary" data-a="overlay">Map overlay</button>
      <button class="btn secondary" data-a="settings">Settings</button>
      <button class="btn secondary" data-a="journal">Field journal</button>
      <button class="btn secondary" data-a="trees">${this.renderer.fadeTrees ? 'Show trees normally' : 'See through trees'}</button>
      <button class="btn secondary" data-a="photo">Photo mode</button>
      <button class="btn secondary" data-a="feedback">Send feedback</button>
      <button class="btn secondary" data-a="help">How to play</button>
      <button class="btn secondary" data-a="save">Save game</button>
      <button class="btn secondary" data-a="backups">Restore an earlier save</button>
      <button class="btn secondary" data-a="new">Start a new game (campaign or free play)</button></div>`, { narrow: true });
    m.querySelector('[data-a=help]').addEventListener('click', () => this.openIntro(false));
    m.querySelector('[data-a=overlay]').addEventListener('click', () => this.openOverlayPicker());
    m.querySelector('[data-a=settings]').addEventListener('click', () => this.openSettings());
    m.querySelector('[data-a=journal]').addEventListener('click', () => this.openJournal());
    m.querySelector('[data-a=trees]').addEventListener('click', () => { this.toggleTrees(); this.closeModal(); });
    m.querySelector('[data-a=feedback]').addEventListener('click', () => this.openFeedback());
    m.querySelector('[data-a=photo]').addEventListener('click', () => { this.closeModal(); this.togglePhoto(); });
    m.querySelector('[data-a=save]').addEventListener('click', event => this.saving.manualSave(event.currentTarget));
    m.querySelector('[data-a=backups]').addEventListener('click', () => this.openSaveRecovery());
    m.querySelector('[data-a=new]').addEventListener('click', () => this.openModeChoice(true));
  }

  openSaveRecovery() { return this.saving.openRecovery(); }

  openSettings(tab = this.settingsTab || 'audio') {
    this.settingsTab = tab;
    const g = this.game;
    const toggle = (key, name, desc) => `<label class="set-row"><span><b>${name}</b><small>${desc}</small></span><input type="checkbox" data-s="${key}" ${settings[key] ? 'checked' : ''}></label>`;
    const choice = (key, name, desc, opts, value = settings[key]) => `<label class="set-row"><span><b>${name}</b><small>${desc}</small></span><select data-s="${key}">${opts.map(([v, t]) => `<option value="${v}" ${value === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
    const slider = (key, name, desc, min = 0.4, max = 2.5, fmt = v => v.toFixed(1) + '×') => `<label class="set-row"><span><b>${name}</b><small>${desc}</small></span><span class="set-slide"><input type="range" min="${min}" max="${max}" step="${(max - min) / 20}" data-s="${key}" value="${settings[key]}" data-fmt="${fmt === pctFmt ? 'pct' : 'x'}"><output>${fmt(settings[key])}</output></span></label>`;
    const pctFmt = v => Math.round(v * 100) + '%';
    const TABS = {
      audio: ['Audio', `
        ${toggle('muted', 'Mute everything', 'Also the speaker button in the top bar, or press M.')}
        ${toggle('music', 'Lo-fi music', 'Relaxed lo-fi tracks, shuffled. Streamed one at a time.')}
        ${slider('musicVolume', 'Music volume', '', 0, 1, pctFmt)}
        <div class="set-row now-playing"><span><b>Now playing</b><small class="np-title">${music.nowPlaying ? `${music.nowPlaying.title} · ${music.nowPlaying.artist}` : 'Starts when you begin playing'}</small></span><button type="button" class="btn secondary np-skip">Next track</button></div>
        ${toggle('nature', 'Nature sounds', 'Local wildlife, water, wind and insects, following each map’s seasons and time of day.')}
        ${slider('natureVolume', 'Nature volume', '', 0, 1, pctFmt)}
        <details class="audio-credits">
        <summary>Sound credits and licenses</summary>
        <p class="small" style="margin:4px 2px 10px">Music by <a href="https://freemusicarchive.org/music/holiznacc0/" target="_blank" rel="noopener">HoliznaCC0</a>, released into the public domain under ${MUSIC_LICENSE}.</p>
        <p class="small" style="margin:4px 2px 0">Wildlife and environment recordings are trimmed and mixed for the game; each clip retains its source license.</p>
        <p class="small" style="margin:4px 2px 0">${SOUND_CREDITS.map(c => `${c.what}: ${c.by}, <a href="${c.source}" target="_blank" rel="noopener">recording source</a> · ${c.licenseUrl ? `<a href="${c.licenseUrl}" target="_blank" rel="noopener">${c.license}</a>` : c.license}.`).join(' ')}</p>
        </details>`],
      game: ['Gameplay', `
        <div class="section-title" style="margin-top:0">Difficulty on this farm</div>
        <div class="seg" data-seg="difficulty">${Object.entries(DIFFICULTY).map(([k, d]) => `<button data-d="${k}" class="${k === (g.difficulty || 'standard') ? 'on' : ''}">${d.name}</button>`).join('')}</div>
        <p class="small diff-desc">${g.diff.desc} Grants ×${g.diff.grants}, costs ×${g.diff.costs}, fire and flood ×${g.diff.disasters}.</p>
        ${toggle('autosave', 'Autosave', 'Save every 30 seconds, at the end of each month, and when you leave the tab.')}
        <p class="small">Progress stays in this browser on this device. Clearing site data removes it.</p>
        ${toggle('pauseOnEvents', 'Pause on wildfire or flood', 'Stop the clock so you can respond.')}
        ${choice('notifications', 'Notifications', 'All updates stay in the field journal, even when pop-ups are hidden.', [['all', 'Show everything'], ['important', 'Important only'], ['hidden', 'Hide pop-ups']])}`],
      graphics: ['Graphics', `
        ${choice('quality', 'Detail', TOUCH ? 'Fast suits most phones. On a touch screen the resolution also adjusts itself to keep things smooth.' : 'Lower it if the game feels slow. Fast also uses simpler plants until you zoom in.', [['high', 'Sharp'], ['balanced', 'Balanced'], ['fast', 'Fast']])}
        ${toggle('shadows', 'Shadows', 'Trees and buildings cast soft shadows.')}
        ${choice('fps', 'Frame rate', 'Auto runs at 30 frames a second on phones and on battery power, which keeps devices cool, and 60 otherwise.', [['auto', 'Auto'], ['60', 'Smooth (60)'], ['30', 'Battery saver (30)']])}
        ${toggle('wind', 'Wind in the plants', 'Grass, shrubs and treetops sway.')}
        ${toggle('weather', 'Rain and snow', 'Falling rain and snow over the view.')}
        ${toggle('dayCycle', 'Time of day', 'The light drifts from midday through golden hour and dusk to dawn every few minutes.')}
        ${toggle('decay', 'Carcass decay', 'A kill is eaten and rots down to bones, which scatter and disappear over a few weeks. Off: it lies whole, then fades away.')}`],
      controls: ['Controls', `
        ${slider('panSpeed', 'Camera pan speed', 'WASD and arrow keys.')}
        ${slider('zoomSpeed', 'Zoom speed', 'Mouse wheel and + / − keys.')}
        <p class="small">The rotation arrows turn the view by 15°. Q / E do the same. Hold Shift for a 90° turn.</p>
        <div class="small" style="margin-top:10px">Brush sizes are remembered for each tool group.</div>`],
      privacy: ['Privacy', `
        ${toggle('analytics', 'Share anonymous play data', 'Which tools get used, progress, and game performance. No session recordings or cookies. Turn off to stop sharing play data.')}`],
    };
    const nav = Object.entries(TABS).map(([k, [name]]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${name}</button>`).join('');
    const m = this.modal('Settings', `<div class="settings-wrap"><nav class="settings-nav">${nav}</nav><div class="settings">${TABS[tab][1]}</div></div>`,
      { foot: '<button class="btn secondary" data-a="reset">Restore defaults</button><button class="btn" data-a="done">Done</button>' });
    m.classList.add('settings-modal');
    m.querySelectorAll('.settings-nav [data-tab]').forEach(b => b.addEventListener('click', () => this.openSettings(b.dataset.tab)));
    m.querySelector('.np-skip')?.addEventListener('click', () => { music.start(); if (music.nowPlaying) music.skip(); else music.syncPlayback(); });
    if (!this.npHooked) { this.npHooked = true; music.onTrack(t => document.querySelectorAll('.np-title').forEach(e => { e.textContent = `${t.title} · ${t.artist}`; })); }
    m.querySelectorAll('[data-s]').forEach(inp => {
      const key = inp.dataset.s;
      inp.addEventListener(inp.type === 'range' ? 'input' : 'change', () => {
        settings[key] = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? +inp.value : inp.value;
        if (inp.type === 'range') inp.nextElementSibling.textContent = inp.dataset.fmt === 'pct' ? pctFmt(settings[key]) : settings[key].toFixed(1) + '×';
        if (key === 'analytics') { setAnalyticsEnabled(settings.analytics); if (settings.analytics) this.analyticsContext(); }
        else if (inp.type !== 'range') track('setting_changed', { setting: key, value: settings[key] });
        if (key === 'quality') settings.qualityChosen = true; // (the player's choice: never lowered for them)
        // back up from Fast on a computer that already struggled: say what to expect
        if (key === 'quality' && settings.quality !== 'fast' && settings.slowFps) {
          g.notify(`This computer ran at about ${settings.slowFps} frames a second before Detail went to Fast, so expect some lag. If it gets slow, the game lowers the resolution and turns shadows off on its own; Fast is smoothest.`, 'warn');
        }
        saveSettings();
        this.applySettings();
      });
    });
    m.querySelectorAll('[data-seg=difficulty] [data-d]').forEach(b => b.addEventListener('click', () => {
      g.difficulty = b.dataset.d;
      g.wildlife.computeSuitability();
      track('setting_changed', { setting: 'difficulty', value: g.difficulty });
      this.openSettings('game');
      if (this.state.cat !== 'inspect') this.renderToolPanel();
    }));
    m.querySelector('[data-a=done]').addEventListener('click', () => this.closeModal());
    m.querySelector('[data-a=reset]').addEventListener('click', () => { resetSettings(); setAnalyticsEnabled(settings.analytics); this.analyticsContext(); this.applySettings(); this.openSettings(tab); });
  }

  openFeedback() {
    const faces = ['😞', '😕', '😐', '🙂', '😍'];
    const m = this.modal('Send feedback', `<div class="feedback">
      <p class="info-desc" style="margin-top:0">Second Growth is a work in progress, and every note gets read. What's fun, what's confusing, what broke?</p>
      <div class="section-title">How are you liking it?</div>
      <div class="fb-rate">${faces.map((f, k) => `<button type="button" data-r="${k + 1}" title="${k + 1} of 5">${f}</button>`).join('')}</div>
      <div class="section-title">Your thoughts</div>
      <textarea class="ph-mask" rows="6" maxlength="4000" placeholder="I wish I could… / I got stuck when… / The best part was…"></textarea>
      <label class="fb-contact"><span class="small">Want a reply? Leave an email or Reddit username (optional)</span><input type="text" class="ph-mask" maxlength="200"></label>
      <div class="small fb-status"></div>
      <div class="small" style="margin-top:6px">Rather post publicly? <a href="https://github.com/nature-tycoon/second-growth/issues" target="_blank" rel="noopener">Open an issue on GitHub</a>.</div>
      </div>`, { narrow: true, foot: '<button class="btn secondary" data-a="cancel">Cancel</button><button class="btn" data-a="send">Send</button>' });
    let rating = 0;
    m.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => {
      rating = +b.dataset.r;
      m.querySelectorAll('[data-r]').forEach(o => o.classList.toggle('on', o === b));
    }));
    const ta = m.querySelector('textarea'), status = m.querySelector('.fb-status');
    setTimeout(() => ta.focus(), 30);
    m.querySelector('[data-a=cancel]').addEventListener('click', () => this.closeModal());
    const sendBtn = m.querySelector('[data-a=send]');
    sendBtn.addEventListener('click', async () => {
      const message = ta.value.trim(), contact = m.querySelector('.fb-contact input').value.trim();
      if (!message && !rating) { status.textContent = 'Pick a face or write a few words first.'; return; }
      if (!feedbackPossible()) { status.textContent = 'Feedback can\'t be sent from this copy of the game. Please use the GitHub link below.'; return; }
      sendBtn.disabled = true; status.textContent = 'Sending…';
      const ok = await sendFeedback({ rating: rating || null, message, contact: contact || null, map: this.game.map, ...this.snapshot() });
      sendBtn.disabled = false;
      // keep what they wrote if it didn't go through, so they can copy it elsewhere
      if (!ok) { status.innerHTML = 'That didn\'t go through (an ad blocker or a lost connection can stop it). Your note is still here: please try again, or post it on GitHub below.'; return; }
      this.closeModal();
      this.game.notify('Thanks for the feedback! It really helps.', 'good');
    });
  }

  afterNewGame() {
    this.refreshSaveStatus();
    this.analyticsContext?.();
    if (this.session) this.session.day0 = this.game.day;
    const sub = document.querySelector('#topbar .subtitle, .subtitle');
    if (sub) sub.textContent = `${this.game.catalog.definition.farm} restoration`;
    this.renderer.resetView();
    this.setOverlay('none');
    this.openCategory('inspect');
    this.buildToolbar();
    this.renderQuest(true);
    this.homeScreenHint();
  }
  // iPhone Safari can't go full screen, but a home-screen launch drops the browser bars. Suggest it
  // (a few times, once per visit) to landscape players who still have the bars.
  homeScreenHint() {
    if (this.hintedHomeScreen || !/iPhone|iPod/.test(navigator.userAgent)) return;
    this.hintedHomeScreen = true;
    let shown = 0;
    try { shown = +localStorage.getItem('sg-homescreen-hint') || 0; } catch (e) { /* storage unavailable */ }
    if (shown >= 3) return;
    setTimeout(() => {
      const standalone = navigator.standalone || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
      // (inside itch's frame the launch mode can't be read, so also check whether the page already fills the screen)
      const bars = innerHeight < Math.min(screen.width, screen.height) - 8;
      if (standalone || !bars || innerWidth < innerHeight) return;
      try { localStorage.setItem('sg-homescreen-hint', shown + 1); } catch (e) { /* storage unavailable */ }
      this.game.notify('For a full screen experience, add the game to your home screen: tap Share, then Add to Home Screen.', 'tip');
    }, 4000);
  }

  // ------------------------------------------------------------ campaign
  // Pick Campaign or Free Play. replacing = start over on a new farm (after a confirm).
  openModeChoice(replacing, pick = null, diffPick = null) {
    let diff = diffPick || this.game.difficulty || 'standard', map = pick || this.game.map;
    // the picker reads in the language the chosen map will be played in, so a student who taps
    // Español can read the choices right away
    const shownLang = () => (LANG_MAPS[map] ? langFor(map) : 'en');
    const savedYear = id => Math.floor((saves.summary(id)?.day || 0) / DAYS_PER_YEAR) + 1;
    const m = this.modal('How do you want to play?', `<div class="section-title" style="margin-top:0">Map</div>
      ${worldMap(BIOME_LIST, map)}<div class="map-pick"></div>
      <div class="lang-pick" hidden><div class="section-title">Language · Idioma</div>
      <div class="seg" data-seg="lang"><button data-l="en">English</button><button data-l="es">Español</button></div></div>
      <button class="btn secondary map-resume" data-a="resume" hidden></button>
      <div class="section-title">Difficulty</div>
      <div class="seg" data-seg="diff">${Object.entries(DIFFICULTY).map(([k, d]) => `<button data-d="${k}" class="${k === diff ? 'on' : ''}">${d.name}</button>`).join('')}</div>
      <p class="small diff-desc">${DIFFICULTY[diff].desc}</p>
      <div class="section-title">Mode</div><div class="modes">
      <button class="mode-card" data-m="campaign"><b>Campaign</b><span></span></button>
      <button class="mode-card" data-m="free"><b>Free play</b><span>Every tool from the start and no chapters, just the land, the grants and the milestone goals.</span></button>
      </div><p class="small replace-note" style="margin:10px 2px 0" hidden>This replaces your saved farm.</p>`, { narrow: true, dismissible: !this.startPause });
    if (this.startPause) m.classList.add('startup-selector');
    const pickerLang = shownLang();
    if (pickerLang !== lang) langWithin(m, pickerLang);
    const FREE_TEXT = m.querySelector('[data-m=free] span').textContent;
    const willReplace = () => (replacing || map !== this.game.map) && Game.hasSave(map);
    // playing in a different language than this page is in means reloading into it
    const relang = () => map === this.game.map && langFor(map) !== lang;
    const showMap = () => {
      const b = BIOMES[map], camp = m.querySelector('[data-m=campaign]');
      m.querySelectorAll('[data-map]').forEach(o => o.classList.toggle('on', o.dataset.map === map));
      m.querySelector('.map-pick').innerHTML = `<div class="map-card on"><img src="${b.image}?v=keystone-20261017" alt="${b.region} wildlife scene from Second Growth" width="1800" height="1200" decoding="async"><div><span class="rg">${b.region}</span><b>${b.farm}</b><span class="bl">${b.blurb}</span>${Game.hasSave(b.id) ? `<em>Saved farm, year ${savedYear(b.id)}</em>` : ''}</div></div>`;
      m.querySelectorAll('[data-m]').forEach(o => { delete o.dataset.sure; o.classList.remove('danger'); });
      camp.disabled = !b.campaign;
      camp.querySelector('span').textContent = b.campaign ? `Eight chapters on ${b.farm}. Each one teaches a new part of restoration and unlocks new tools as you go. Best for your first time.` : `No campaign on ${b.farm} yet. Free Play has its own milestone goals for this map.`;
      m.querySelector('[data-m=free] span').textContent = FREE_TEXT;
      m.querySelector('.replace-note').hidden = !willReplace();
      // a map can be played in another language (Nicaragua, in Spanish): the choice is kept for next time
      const langs = LANG_MAPS[map], lp = m.querySelector('.lang-pick');
      lp.hidden = !langs;
      if (langs) lp.querySelectorAll('[data-l]').forEach(o => { o.hidden = !langs.includes(o.dataset.l); o.classList.toggle('on', o.dataset.l === langFor(map)); });
      const resume = m.querySelector('[data-a=resume]');
      resume.hidden = !Game.hasSave(map) || (map === this.game.map && this.game.loaded && !relang());
      resume.textContent = `Continue your saved ${b.farm} farm`;
    };
    showMap();
    m.querySelectorAll('[data-map]').forEach(b => b.addEventListener('click', () => {
      map = b.dataset.map;
      if (shownLang() !== pickerLang) return this.openModeChoice(replacing, map, diff);
      showMap();
    }));
    m.querySelectorAll('[data-l]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.l === storedLang() && langFor(map) === b.dataset.l) return;
      saveLang(b.dataset.l);
      track('setting_changed', { setting: 'language', value: b.dataset.l, map });
      this.openModeChoice(replacing, map, diff); // redrawn in the new language
    }));
    m.querySelector('[data-a=resume]').addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      if (map !== this.game.map || relang()) return this.switchMap({ map, resume: true });
      const wasStarting = !!this.startPause;
      this.closeModal(true);
      const speed = this.game.speed; this.setSpeed(0);
      if (!await this.game.load(map)) {
        this.setSpeed(wasStarting ? 0 : speed);
        if (wasStarting) {
          this.startPause = true;
          document.body.classList.add('choosing-map');
          this.openModeChoice(true, map, diff);
        }
        this.game.notify('That saved farm could not be opened. Your stored saves have been kept.', 'warn');
        return;
      }
      void saves.requestPersistence();
      track('game_start', { mode: 'continue', map });
      this.afterNewGame();
      this.game.notify(`Welcome back. It's ${this.game.dateString()}.`, 'season');
    });
    m.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => {
      diff = b.dataset.d;
      m.querySelectorAll('[data-d]').forEach(o => o.classList.toggle('on', o === b));
      m.querySelector('.diff-desc').textContent = DIFFICULTY[diff].desc;
    }));
    m.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', async () => {
      if (b.disabled) return;
      if (willReplace() && !b.dataset.sure) {
        m.querySelectorAll('[data-m]').forEach(o => { delete o.dataset.sure; o.classList.remove('danger'); });
        b.dataset.sure = 1; b.classList.add('danger'); b.querySelector('span').textContent = 'Click again to replace your saved farm for good.';
        return;
      }
      m.querySelectorAll('[data-m]').forEach(o => { o.disabled = true; });
      this.closeModal(true);
      if (relang()) return this.switchMap({ map, mode: b.dataset.m, difficulty: diff });
      await this.startMode(b.dataset.m, replacing, diff, map);
    }));
  }
  // Another map means a different cast of plants and animals, so the page reloads into it:
  // every cached model, sprite and thumbnail starts clean. main.js picks up where this left off.
  async switchMap(pending) {
    // the same map in another language: keep the progress only if this game is the saved farm
    const same = pending.map === this.game.map;
    const speed = this.game.speed; this.setSpeed(0);
    if (this.game.saveReady && (same ? this.game.loaded : true) && !await this.game.save({ speed })) {
      this.setSpeed(speed); return; // Keep the current farm open if its save did not commit.
    }
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending)); } catch {
      this.setSpeed(speed); this.game.notify('This browser could not switch farms. Your current farm is still open.', 'warn'); return;
    }
    track('map_switch', { from: this.game.map, to: pending.map, resume: !!pending.resume });
    location.reload();
  }
  async startMode(mode, fresh, difficulty = 'standard', map = this.game.map) {
    const g = this.game;
    if (map !== g.map) return this.switchMap({ map, mode, difficulty });
    if (fresh) {
      const speed = g.speed; this.setSpeed(0);
      try { await Game.clearSave(map); } catch {
        this.setSpeed(speed); g.notify('The saved farm could not be replaced. Your current farm is still open.', 'warn'); return;
      }
      track('game_restart', this.snapshot()); g.newGame(Math.floor(Math.random() * 100000), mode, difficulty, map);
    }
    else { g.mode = mode; g.campaign = { chapter: 0 }; g.difficulty = difficulty; g.money = g.diff.startMoney; }
    track('game_start', { mode, fresh, difficulty, map });
    this.newCats = new Set();
    this.afterNewGame();
    g.saveReady = true;
    void saves.requestPersistence();
    if (g.autosave !== false) void g.save();
    if (g.speed === 0) this.setSpeed(1);
    if (mode === 'campaign') this.openChapter(0);
    else g.notify(this.game.catalog.definition.startText, 'season');
  }

  // A chapter's introduction: the story, what to do, the goals, and the tools it unlocks.
  openChapter(k, review = false) {
    const g = this.game, c = this.game.catalog.chapters[k];
    if (!c) return;
    if (!review && !(g.campaign.seen ||= {})[c.key]) { g.campaign.seen[c.key] = true; track('chapter_started', { chapter: k + 1, key: c.key, ...this.snapshot() }); }
    const tools = c.unlock.map(key => this.game.catalog.tools[key]).filter(Boolean);
    const shown = tools.filter(t => !t.sub || t.sub === 'mixes').slice(0, 10);
    const extra = tools.length - shown.length;
    const resume = g.speed; this.setSpeed(0);
    const m = this.modal(`Chapter ${k + 1}: ${c.title}`, `<div class="chapter-intro">
      <p class="ch-story">${c.story}</p>
      <div class="section-title">New tools</div>
      <div class="ch-tools">${shown.map(t => `<div class="ch-tool"><img src="${iconThumb(t.icon, this.game.catalog)}" alt=""><span>${t.name}</span></div>`).join('')}${extra > 0 ? `<div class="ch-tool more">+${extra} more plants</div>` : ''}</div>
      <div class="section-title">How</div><p class="info-desc">${c.teach}</p>
      <div class="section-title">Goals</div>${c.goals.map(o => `<div class="need"><span class="st">•</span><span>${o.desc}</span></div>`).join('')}
      <p class="small" style="margin-top:10px">Complete all three for a ${money(this.game.goalReward(c.reward))} grant and Chapter ${k + 2 <= this.game.catalog.chapters.length ? k + 2 : 'the end'}.</p>
      </div>`, { narrow: true, foot: `<button class="btn" data-a="go">Let's go</button>`, onClose: () => this.setSpeed(resume || 1) });
    m.querySelector('[data-a=go]').addEventListener('click', () => this.closeModal());
    if (!review) for (const t of tools) this.newCats.add(t.cat);
    this.buildToolbar();
    if (this.state.cat !== 'inspect') this.renderToolPanel(); // show the newly unlocked tools
    this.questOpen = !COMPACT(); // on small screens the tracker starts folded
    this.renderQuest(true);
  }

  onChapterDone({ done, next, index }) {
    track('chapter_complete', { chapter: index + 1, key: done.key, days_in_chapter: this.game.day - (this.game.campaign.startDay ?? 0), ...this.snapshot() });
    this.game.campaign.startDay = this.game.day;
    this.analyticsContext?.();
    const g = this.game, resume = g.speed;
    this.setSpeed(0);
    this.newCats ||= new Set();
    const body = next
      ? `<p class="ch-story">You finished <b>${done.title}</b>. The land trust sent a <b>${money(this.game.goalReward(done.reward))}</b> grant.</p><p class="info-desc">Next up: <b>Chapter ${index + 2}, ${next.title}</b>, with new tools to learn.</p>`
      : `<p class="ch-story">${this.game.catalog.definition.campaignEnd}</p><p class="info-desc">The land trust sent a final <b>${money(this.game.goalReward(done.reward))}</b> grant.</p>`;
    const m = this.modal(next ? `Chapter ${index + 1} complete!` : 'The valley is restored', `<div class="chapter-done">${body}</div>`, { narrow: true,
      foot: `<button class="btn" data-a="next">${next ? `Start Chapter ${index + 2}` : 'Keep restoring'}</button>`, onClose: () => { if (!next) this.setSpeed(resume || 1); } });
    m.querySelector('[data-a=next]').addEventListener('click', () => {
      this.closeModal();
      if (next) this.openChapter(index + 1);
      else { this.buildToolbar(); this.renderQuest(true); this.setSpeed(resume || 1); }
    });
    this.buildToolbar();
    this.renderQuest(true);
  }

  // The chapter tracker at the top of the screen.
  renderQuest(force = false) {
    const q = $('#quest'), g = this.game, c = currentChapter(g);
    document.body.classList.toggle('campaign', !!c);
    if (!c) { q.classList.add('hidden'); return; }
    const now = performance.now();
    if (!force && now - (this.questAt || 0) < 1000) return;
    this.questAt = now;
    const k = g.campaign.chapter, doneN = c.goals.filter(o => goalMet(g, o)).length;
    const hint = campaignVisitorHint(g), helpOpen = this.questHelpChapter === c.key;
    q.classList.remove('hidden');
    q.classList.toggle('open', !!this.questOpen);
    const qhtml = `<button class="q-head" title="${this.questOpen ? 'Hide goals' : 'Show goals'}"><span class="q-ch">Chapter ${k + 1}/${this.game.catalog.chapters.length}</span><b>${c.title}</b><span class="q-n">${doneN}/${c.goals.length}</span><span class="q-caret">${this.questOpen ? '▴' : '▾'}</span></button>` +
      (this.questOpen ? `<div class="q-body">${c.goals.map(o => { const ok = goalMet(g, o); return `<div class="q-goal ${ok ? 'ok' : ''}"><span class="q-box">${ok ? '✓' : ''}</span><span>${o.desc}<small>${o.prog(g)}</small></span></div>`; }).join('')}${hint ? `<p class="q-tip">${hint}</p>` : ''}<button class="q-help" aria-expanded="${helpOpen}" aria-controls="quest-help">${helpOpen ? 'Hide help' : 'Need help? Where and how'}</button>${helpOpen ? `<div id="quest-help" class="q-help-text">${c.teach}</div>` : ''}<button class="q-more">Chapter details</button></div>` : '');
    if (!setHTML(q, qhtml)) return; // unchanged: keep the existing nodes (and their listeners)
    q.querySelector('.q-head').addEventListener('click', () => { this.questOpen = !this.questOpen; this.renderQuest(true); });
    q.querySelector('.q-help')?.addEventListener('click', () => { this.questHelpChapter = helpOpen ? null : c.key; this.renderQuest(true); });
    q.querySelector('.q-more')?.addEventListener('click', () => this.openChapter(k, true));
  }

  // Photo mode: everything but the land goes away, the edges of the view soften into a vignette,
  // and a small bar offers to save the picture (with the vignette) to the device.
  togglePhoto() {
    this.photo = !this.photo;
    this.state.clean = this.photo || !!this.moment;
    document.body.classList.toggle('photo-mode', this.photo);
    if (!this.photoBar) {
      const v = document.createElement('div'); v.id = 'photo-vignette'; document.body.appendChild(v);
      const b = document.createElement('div'); b.id = 'photo-bar';
      b.innerHTML = `<span>${TOUCH ? 'Drag to move · pinch to zoom' : 'Drag to move · scroll to zoom · Q E to turn'}</span>
        <button class="btn secondary" data-a="thennow">Then &amp; now</button><button class="btn" data-a="card">Postcard</button>
        <button class="btn secondary" data-a="snap">Picture</button><button class="btn secondary" data-a="done">Done</button>`;
      document.body.appendChild(b);
      b.querySelector('[data-a=done]').addEventListener('click', () => this.togglePhoto());
      b.querySelector('[data-a=snap]').addEventListener('click', () => {
        download(this.renderer.capture(this.game, this.state), `second-growth-${this.game.map}-year-${this.game.year}.png`);
        track('photo_saved', { map: this.game.map, kind: 'picture' });
      });
      b.querySelector('[data-a=card]').addEventListener('click', async () => {
        const c = await makePostcard({ images: [{ canvas: this.renderer.capture(this.game, this.state, false) }], ...this.postcardText(`Greetings from ${this.game.catalog.definition.farm}`) });
        download(c, `second-growth-${this.game.map}-postcard-year-${this.game.year}.png`);
        track('photo_saved', { map: this.game.map, kind: 'postcard' });
      });
      b.querySelector('[data-a=thennow]').addEventListener('click', () => this.openThenNow());
      this.photoBar = b;
    }
    if (this.photo) track('photo_mode', { map: this.game.map });
  }

  playMoment(moment) { this.cinematics.play(moment); }
  get moment() { return this.cinematics.moment; }
  get momentEnded() { return this.cinematics.momentEnded; }
  set momentEnded(time) { this.cinematics.momentEnded = time; }

  // What the land around the camera sounds like: how bare it is, how alive, how near water.
  landSound() {
    return sampleSoundLand(this.game, this.renderer, this.game.catalog.definition, this.game.catalog.animals);
  }

  postcardText(title) {
    const g = this.game, season = this.game.catalog.definition.climate.seasons?.[g.season] || '';
    return {
      title,
      subtitle: `${this.game.catalog.definition.region} · Year ${g.year}${season ? `, ${season.toLowerCase()}` : ''}`,
      stats: `${speciesPresent(g)} species · ecosystem health ${Math.round(g.cache.score?.total ?? 0)}${g.visitors.total ? ` · ${g.visitors.total.toLocaleString()} visitors` : ''}`,
      stamp: `YEAR ${g.year}`,
    };
  }

  // Then and now: the same view on day one and today, with a slider to wipe between them, and a
  // side-by-side postcard to save.
  openThenNow() {
    const g = this.game;
    const { then, now } = this.renderer.thenAndNow(g, this.state);
    const o = document.createElement('div'); o.id = 'thennow';
    o.innerHTML = `<div class="tn-stage" style="--x:50%">
        <img class="tn-now" alt="Today" src="${now.toDataURL('image/jpeg', 0.9)}">
        <div class="tn-then"><img alt="Day one" src="${then.toDataURL('image/jpeg', 0.9)}"></div>
        <div class="tn-handle"><span>⟷</span></div>
        <span class="tn-tag tn-l">Day one</span><span class="tn-tag tn-r">Year ${g.year}</span>
      </div>
      <div class="tn-bar"><span>Drag to compare</span><button class="btn" data-a="card">Save postcard</button><button class="btn secondary" data-a="close">Close</button></div>`;
    document.body.appendChild(o);
    const stage = o.querySelector('.tn-stage');
    const set = e => { const r = stage.getBoundingClientRect(); stage.style.setProperty('--x', `${Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100))}%`); };
    let down = false;
    stage.addEventListener('pointerdown', e => { down = true; stage.setPointerCapture(e.pointerId); set(e); });
    stage.addEventListener('pointermove', e => { if (down) set(e); });
    stage.addEventListener('pointerup', () => { down = false; });
    const close = () => { o.remove(); window.removeEventListener('keydown', key, true); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', key, true);
    o.querySelector('[data-a=close]').addEventListener('click', close);
    o.querySelector('[data-a=card]').addEventListener('click', async () => {
      const c = await makePostcard({ images: [{ canvas: then, label: 'Day one' }, { canvas: now, label: `Year ${g.year}` }], ...this.postcardText(`${this.game.catalog.definition.farm}, then and now`) });
      download(c, `second-growth-${g.map}-then-and-now-year-${g.year}.png`);
      track('photo_saved', { map: g.map, kind: 'then_and_now' });
    });
    track('then_and_now', { map: g.map, game_year: g.year });
  }

  togglePanels() {
    this.panelsHidden = !this.panelsHidden;
    document.body.classList.toggle('panels-hidden', this.panelsHidden);
  }

  openVisitors() {
    const g = this.game, v = g.visitors, f = v.facilities();
    const seen = v.seenLast.map(k => this.game.catalog.animals[k].name);
    const tips = [];
    if (!f.parking) tips.push('Build a <b>trailhead parking</b> lot beside a road (Visitors tab), then run a trail out from it.');
    if (f.parking && v.net.length < 40) tips.push('Longer trails bring more visitors. Loop them past water, meadows and old trees.');
    if (!f.center && f.parking) tips.push('A <b>visitor center</b> nearly doubles what each visitor gives.');
    if (f.blinds < 2) tips.push('<b>Viewing blinds</b> let people watch wildlife without scaring it off.');
    const shy = this.game.catalog.animals.filter(a => a.shy >= 0.5).sort((a, b) => b.shy - a.shy).slice(0, 5).map(a => a.name);
    tips.push(`Shy animals (${shy.join(', ')}) avoid busy trails. Keep some of the land quiet.`);
    const stars = n => '★★★★★'.slice(0, Math.round(n)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(n));
    // where the stars come from, and the single biggest thing to fix
    let breakdown = '';
    if (f.parking && v.parts) {
      const gap = [...v.parts].sort((a, b) => ((b.max - b.pts) - (a.max - a.pts)) || (a.pts - b.pts))[0];
      breakdown = `<h4 style="margin-top:16px">Where the rating comes from</h4>` + v.parts.map(p => {
        const neg = p.pts < 0, w = neg ? Math.min(1, -p.pts / 1.2) : p.max ? p.pts / p.max : 0;
        return `<div class="srow"><span>${p.name}</span><div class="bar"><i class="${neg ? 'neg' : ''}" style="width:${pct(clamp(w, 0, 1))}"></i></div><span class="v">${neg ? '' : '+'}${p.pts.toFixed(1)}</span></div>`;
      }).join('') + `<div class="small" style="margin-top:4px">Every preserve starts at 0.5 stars.</div>` +
        (gap && gap.max - gap.pts > 0.15 ? `<div class="need" style="margin-top:8px"><span class="st warn">▲</span><span><b>Biggest gain:</b> ${gap.tip}</span></div>` : '');
    }
    this.modal('Visitors', `<div class="report">
      <div><h4>Last month</h4><div class="kv" style="grid-template-columns:150px 1fr">
        <span class="k">Visitors</span><span>${v.monthly.toLocaleString()}</span>
        <span class="k">Rating</span><span class="stars">${stars(v.rating)} <span class="small">${v.rating.toFixed(1)}</span></span>
        <span class="k">Donations</span><span>${money(v.income)}</span>
        <span class="k">Trail upkeep</span><span>${v.upkeep ? '-' : ''}${money(v.upkeep)}</span>
        <span class="k">Total visitors</span><span>${v.total.toLocaleString()}</span>
        <span class="k">Connected trail</span><span>${v.net.length} tiles</span>
        <span class="k">Facilities</span><span>${f.parking} parking · ${f.center} visitor center${f.center === 1 ? '' : 's'} · ${f.blinds} blind${f.blinds === 1 ? '' : 's'} · ${f.boardwalk} boardwalk tiles</span></div>
        ${breakdown}
        <h4 style="margin-top:16px">Seen from the trails</h4><p class="info-desc">${seen.length ? seen.join(', ') : 'Nothing yet.'}</p></div>
      <div><h4>How to grow visits</h4>${tips.map(t => `<div class="need"><span class="st">•</span><span>${t}</span></div>`).join('')}</div></div>`, { narrow: false });
  }

  openIntro(first = true, hasSave = false, onClose = null) {
    // first visit: every place pinned on a world map, so the choice is obvious at a glance
    const maps = first ? `${worldMap(BIOME_LIST)}<p class="small wm-cap">${['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'][BIOME_LIST.length - 1] || BIOME_LIST.length} places to bring back. Tap a pin to pick one, or start right here at ${this.game.catalog.definition.farm}.</p>` : '';
    const body = `<div class="intro">${maps}
      ${this.game.catalog.definition.story}
      <h3>How nature works here</h3>
      <ul>${this.game.catalog.definition.rules.map(r => `<li>${r}</li>`).join('')}</ul>
      <h3>Controls</h3>
      <ul>
        ${TOUCH ? `<li>Move the map with the <b>thumbstick</b> at the bottom left or with <b>two fingers</b>, and <b>pinch</b> to zoom. The arrows at the bottom right rotate the view.</li>
        <li>Pick a tool on the left, then <b>drag one finger</b> to brush it across the land, or tap to place things or inspect a tile or animal. With Inspect, one finger moves the map too.</li>
        <li>Touching the map folds the tool panel away; tap its tool group again to open it. The ☰ menu has the journal and see-through trees.</li>
        <li>For the most room, use full screen (the corner button at the top) or add the game to your home screen.</li>` : ''}
        <li${TOUCH ? ' hidden' : ''}>Pick a tool on the left, then <b>click and drag to brush</b> it across the land. <kbd>[</kbd> <kbd>]</kbd> change brush size.</li>
        <li${TOUCH ? ' hidden' : ''}>Right-drag or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to pan, scroll to zoom, <kbd>Q</kbd> <kbd>E</kbd> to rotate by 15°. Hold <kbd>Shift</kbd> for a 90° turn. <kbd>Space</kbd> pauses, <kbd>1</kbd>–<kbd>3</kbd> set speed, <kbd>T</kbd> sees through trees, <kbd>Tab</kbd> hides the panels, <kbd>P</kbd> is photo mode.</li>
        <li>Use <b>Inspect</b> to click any tile or animal. The <b>Overlay</b> menu shows moisture, soil, sunlight, fish passage, or where a species could live.</li>
      </ul>
      <h3>A good first year</h3>
      <ul>${this.game.catalog.definition.firstYear.map(r => `<li>${r}</li>`).join('')}</ul></div>`;
    const foot = first
      ? (hasSave ? `<button class="btn secondary" data-a="new">New game</button><button class="btn" data-a="continue">Continue restoration</button>`
        : `<button class="btn" data-a="start">Start restoring</button>`)
      : `<button class="btn" data-a="close">Back to the farm</button>`;
    const m = this.modal(first ? 'Welcome to Second Growth' : 'How to play', body, { narrow: true, foot, onClose });
    const btn = a => m.querySelector(`[data-a=${a}]`);
    btn('close')?.addEventListener('click', () => this.closeModal());
    btn('continue')?.addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      this.closeModal();
      this.setSpeed(0);
      track('game_start', { mode: 'continue', saved_mode: this.game.mode, map: this.game.map, difficulty: this.game.difficulty, game_year: this.game.year });
      if (!await this.game.load()) {
        this.game.notify('The saved farm could not be opened. Your stored saves have been kept.', 'warn');
        this.openModeChoice(true); return;
      }
      void saves.requestPersistence();
      this.afterNewGame();
      this.game.notify(`Welcome back. It's ${this.game.dateString()}.`, 'season');
    });
    btn('new')?.addEventListener('click', () => this.openModeChoice(true));
    // first visit: the farm is already generated, so just choose how to play it
    btn('start')?.addEventListener('click', () => this.openModeChoice(false));
    m.querySelectorAll('.wm-pin').forEach(b => b.addEventListener('click', () => this.openModeChoice(hasSave, b.dataset.map)));
  }
}
