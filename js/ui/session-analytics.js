// Session measurements and game-event analytics. Presentation is read through
// a small callback; this module owns the session counters and reporting cadence.
import { track, trackExit, setContext } from '../analytics.js';
import { farmSnapshot } from '../farmsnap.js';
import { speciesPresent } from '../sim/goals.js';
import { campaignOn, currentChapter, goalMet } from '../sim/campaign.js';

const secondsSince = t => t == null ? null : Math.round((performance.now() - t) / 1000);
// a warning's wording without its numbers, so "12%" and "14%" count as one message
const gist = text => String(text).replace(/<[^>]+>/g, '').replace(/[\d,.]+/g, '#').slice(0, 90);

export class SessionAnalytics {
  constructor(game, renderer, getUiState) {
    this.game = game;
    this.renderer = renderer;
    this.getUiState = getUiState;
    this.firstToolSent = false;
    // What this session has been like, for went_idle and game_left: how much the player did, how
    // often the game said no, how long since anything rewarded them, and how they spent the time.
    this.tally = { tools: 0, fails_money: 0, fails_unsuitable: 0, rewards: 0, lost: 0, paused_s: 0, fast_s: 0,
      lastTool: null, lastFail: null, lastReward: null, lastFire: null, lastFlood: null, warnings: new Set() };
  }

  // Where a campaign player stands in the chapter, or a free player in the goal list.
  progress() {
    const g = this.game, c = campaignOn(g) ? currentChapter(g) : null;
    if (c) {
      const open = c.goals.filter(o => !goalMet(g, o));
      return { objectives_done: c.goals.length - open.length, objectives: c.goals.length,
        next_objective: open[0]?.desc.slice(0, 90) ?? null, next_objective_progress: open[0]?.prog(g) ?? null };
    }
    return { goals_open: g.catalog.goals.filter(x => !g.goalsDone[x.key]).length };
  }

  exitDetails() {
    const T = this.tally, g = this.game, l = g.lastLedger || { in: {}, out: {} };
    const sum = o => Object.values(o || {}).reduce((a, b) => a + b, 0);
    return { tools_session: T.tools, fails_money_session: T.fails_money, fails_unsuitable_session: T.fails_unsuitable,
      rewards_session: T.rewards, species_lost_session: T.lost, warnings_session: T.warnings.size,
      seconds_since_tool: secondsSince(T.lastTool), seconds_since_fail: secondsSince(T.lastFail),
      seconds_since_reward: secondsSince(T.lastReward), seconds_since_fire: secondsSince(T.lastFire), seconds_since_flood: secondsSince(T.lastFlood),
      paused_seconds: T.paused_s, fast_seconds: T.fast_s, last_month_net: Math.round(sum(l.in) - sum(l.out)),
      zoom: +(this.renderer.zoom ?? 0).toFixed(2), ...this.progress() };
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
    const tool = stroke.tool, T = this.tally;
    if (stroke.count) { T.tools++; T.lastTool = performance.now();
    } else if (stroke.broke || stroke.unsuitable) { T[stroke.broke ? 'fails_money' : 'fails_unsuitable']++; T.lastFail = performance.now(); }
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
    const T = this.tally, reward = () => { T.rewards++; T.lastReward = performance.now(); };
    // (snapshot's species is a count, so the species' own key goes after it)
    g.on('discover', def => { reward(); track('species_discovered', { ...snapshot(), species_present: speciesPresent(g), species: def.key }); });
    g.on('goal', goal => { reward(); track('goal_completed', { goal: goal.key, ...snapshot() }); });
    // each campaign objective as it's ticked, so we can see which step of a chapter players stall on
    g.on('objective', ({ chapter, index, objective }) => {
      reward();
      track('objective_done', { chapter: chapter + 1, chapter_key: g.catalog.chapters[chapter]?.key, objective: index + 1,
        desc: objective.desc.slice(0, 90), days_in_chapter: g.day - (g.campaign.startDay ?? 0), active_minutes: +(this.session.active / 60).toFixed(1), ...snapshot() });
    });
    // the game's warnings (invasives spreading, a herd starving, a fire nearby), once per wording a session
    g.on('notify', ({ text, kind }) => {
      if (kind !== 'warn') return;
      const key = gist(text);
      if (T.warnings.has(key) || T.warnings.size >= 8) return;
      T.warnings.add(key);
      track('warning_shown', { text: key, ...snapshot() });
    });
    g.on('event', kind => {
      if (kind === 'fire' || kind === 'grassfire') T.lastFire = performance.now();
      else if (kind === 'flood') T.lastFlood = performance.now();
      if (kind === 'fire' || kind === 'grassfire') track('wildfire', { crown: !!g.events.severe, routine: kind === 'grassfire', ...snapshot() });
      else if (kind === 'flood') track('flood', { tiles: g.events.floodTiles, ...snapshot() });
    });
    // a wild species the farm had last month and has lost (the last otter gone): up to 5 a session
    const present = () => new Set(g.wildlife.state.flatMap((st, k) => st.pop > 0 && !g.catalog.animals[k]?.domestic ? [g.catalog.animals[k].key] : []));
    let had = present(), hadWorld = g.world;
    g.on('month', () => {
      const now = present();
      if (g.world === hadWorld) for (const key of had) if (!now.has(key) && T.lost < 5) { T.lost++; track('species_lost', { ...snapshot(), species_present: now.size, species: key }); }
      had = now; hadWorld = g.world; // (a new game in the same page isn't a loss)
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
    const doing = () => ({ speed: g.speed, ...this.getUiState(), goals_done: Object.keys(g.goalsDone).length, ...this.exitDetails() });
    setInterval(() => {
      if (document.hidden) return;
      const idle = (performance.now() - S.lastInput) / 1000;
      // active time: the tab is visible and the player has touched something in the last two minutes
      if (idle < 120) {
        if (g.speed === 0) T.paused_s++; else if (g.speed >= 3) T.fast_s++;
        S.active++; if (S.active % 300 === 0) track('play_heartbeat', { active_minutes: S.active / 60, ...snapshot() });
        // how smoothly it's running: early (many phone sessions are short; 10 s is the opening view), then every five minutes
        if (S.active === 10 || S.active === 30 || S.active === 120 || S.active % 300 === 0) track('perf_sample', { active_minutes: +(S.active / 60).toFixed(1), ...this.renderer.perfSample?.() });
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
