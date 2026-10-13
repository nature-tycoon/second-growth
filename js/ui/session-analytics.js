// Session measurements and game-event analytics. Presentation is read through
// a small callback; this module owns the session counters and reporting cadence.
import { track, trackExit, setContext } from '../analytics.js';
import { farmSnapshot } from '../farmsnap.js';
import { speciesPresent } from '../sim/goals.js';
import { campaignOn, currentChapter } from '../sim/campaign.js';

export class SessionAnalytics {
  constructor(game, renderer, getUiState) {
    this.game = game;
    this.renderer = renderer;
    this.getUiState = getUiState;
    this.firstToolSent = false;
  }

  snapshot() {
    const g = this.game;
    return { game_year: g.year, game_month: g.month, score: Math.round(g.cache.score?.total ?? 0),
      species: speciesPresent(g), money: Math.round(g.money), visitors: g.visitors.monthly };
  }

  context() {
    const g = this.game;
    return { map: g.map, mode: g.mode, difficulty: g.difficulty,
      chapter: campaignOn(g) ? g.campaign.chapter + 1 : null, chapter_key: currentChapter(g)?.key ?? null };
  }

  updateContext() { setContext(this.context()); }

  trackTool(stroke) {
    const tool = stroke.tool;
    if (stroke.count) {
      track('tool_used', { tool: tool.key, category: tool.cat, tiles: stroke.count, cost: Math.round(stroke.cost) });
      if (!this.firstToolSent) {
        this.firstToolSent = true;
        track('first_tool', { tool: tool.key, category: tool.cat, seconds_since_load: Math.round(performance.now() / 1000) });
      }
    } else if (stroke.broke || stroke.unsuitable) {
      track('tool_failed', { tool: tool.key, category: tool.cat, reason: stroke.broke ? 'money' : 'unsuitable' });
    }
  }

  bind() {
    const g = this.game;
    g.on('tool', stroke => this.trackTool(stroke));
    const snapshot = () => this.snapshot();
    g.on('discover', def => track('species_discovered', { species: def.key, ...snapshot() }));
    g.on('goal', goal => track('goal_completed', { goal: goal.key, ...snapshot() }));
    g.on('event', kind => {
      if (kind === 'fire') track('wildfire', { crown: !!g.events.severe, ...snapshot() });
      else if (kind === 'flood') track('flood', { tiles: g.events.floodTiles, ...snapshot() });
    });
    g.on('month', () => {
      const s = snapshot();
      setContext({ ...s, ...context() });
      if (g.month === 0) track('year_reached', s);
    });

    // ---- sessions: how long people play each map and mode, and what they were doing when they
    // drifted off or left. Map, mode, difficulty and chapter ride along on every event.
    const context = () => this.context();
    const S = this.session = { t0: performance.now(), active: 0, lastInput: performance.now(), day0: g.day, idleSent: false, leftAt: -Infinity };
    const touch = () => { S.lastInput = performance.now(); S.idleSent = false; };
    for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, touch, { passive: true, capture: true });
    const doing = () => ({ speed: g.speed, ...this.getUiState(), goals_done: Object.keys(g.goalsDone).length });
    setInterval(() => {
      if (document.hidden) return;
      const idle = (performance.now() - S.lastInput) / 1000;
      // active time: the tab is visible and the player has touched something in the last two minutes
      if (idle < 120) {
        S.active++; if (S.active % 300 === 0) track('play_heartbeat', { active_minutes: S.active / 60, ...snapshot() });
        // how smoothly it's running: early (many phone sessions are short), then every five minutes
        if (S.active === 30 || S.active === 120 || S.active % 300 === 0) track('perf_sample', { active_minutes: +(S.active / 60).toFixed(1), ...this.renderer.perfSample?.() });
      }
      if (idle > 240 && !S.idleSent) { S.idleSent = true; track('went_idle', { active_minutes: +(S.active / 60).toFixed(1), ...snapshot(), ...doing() }); }
    }, 1000);
    // a picture of the farm itself, when there's something to see: on leaving, and now and then
    const worthSnapping = () => g.day >= 20 && Object.keys(g.stats.used || {}).length > 0;
    const snap = (why, exit = false) => {
      if (!worthSnapping()) return;
      try { (exit ? trackExit : track)('farm_snapshot', { why, active_minutes: +(S.active / 60).toFixed(1), ...context(), ...farmSnapshot(g) }); } catch (e) { /* never break the game */ }
    };
    setInterval(() => { if (!document.hidden && (performance.now() - S.lastInput) < 120000) snap('periodic'); }, 10 * 60 * 1000);
    const perfAtExit = () => { const p = this.renderer.perfSample?.(false); return p ? { fps: p.fps, slow_frames_pct: p.slow_frames_pct } : {}; };
    const leave = reason => {
      if (performance.now() - S.leftAt < 5000) return;
      S.leftAt = performance.now();
      snap(reason, true);
      trackExit('game_left', { reason, active_minutes: +(S.active / 60).toFixed(1), session_minutes: +((performance.now() - S.t0) / 60000).toFixed(1),
        days_played: g.day - S.day0, idle_seconds: Math.round((performance.now() - S.lastInput) / 1000), rotate_prompt_up: S.rotateSince != null, ...snapshot(), ...doing(), ...perfAtExit() });
    };
    document.addEventListener('visibilitychange', () => { if (document.hidden) leave('hidden'); });
    window.addEventListener('pagehide', () => leave('closed'));
    // the "turn your phone sideways" screen: how many players meet it, how long they take to turn
    // the phone, and (in game_left) whether it was still up when they gave up
    const upright = window.matchMedia('(orientation: portrait) and (max-width: 700px)');
    const rotate = () => {
      if (upright.matches && S.rotateSince == null) {
        S.rotateSince = performance.now();
        if ((S.rotateShown = (S.rotateShown || 0) + 1) <= 3) track('rotate_prompt_shown', { times: S.rotateShown, seconds_since_load: Math.round(performance.now() / 1000) });
      } else if (!upright.matches && S.rotateSince != null) {
        if (S.rotateShown <= 3) track('rotate_prompt_cleared', { seconds: Math.round((performance.now() - S.rotateSince) / 1000), times: S.rotateShown });
        S.rotateSince = null;
      }
    };
    rotate();
    upright.addEventListener?.('change', rotate);
  }
}
