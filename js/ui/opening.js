// A first visit's opening: open the farm to the wild (docs/ideas/2026-11-21-first-minutes/plan.md, step 3).
//
// The farm is walled off by its story: the boundary fence keeps deer and elk out, the road culvert
// keeps fish out of the creek. On a first visit the view starts at the north fence, where a group
// of deer stands at the forest edge beyond it (the real wander-in rule, its first try made at once:
// sim/fence-gate.js), and the one prompt is to tear the fence out. The deer walk in within seconds.
// Once a deer is on the field, one button to follow it at eye level (watch mode, locked on: Done or
// Esc comes back); then one short prompt for the culvert. Then a first planting, guided in three
// short prompts, each one button with a result seen at once (timelapse-2.md): the invasive shrubs
// out (PNW: Himalayan blackberry, every stand on the farm), trees along the creek, and a meadow
// beside them (Plant opens with the meadow mix chosen, to drag; or the button sows a patch). Each
// can be done by hand instead, or skipped with its ×. A few seconds after the last, the time-lapse
// plays on its own (ui/timelapse.js). Both buttons run Demolish
// through the same path as a stroke (cost, undo, goals, tool_used). Nothing here is scripted
// wildlife: the deer come because the fence is gone, through the rules every arrival follows.
//
// game.flags.opening = { stage: 'fence' | 'culvert' | 'pull' | 'trees' | 'meadow' | 'done' } (saved
// with the farm, so a reload in the middle carries on; fence-gate.js holds the waiting deer while the
// stage is 'fence'). opening_step { step: 'pull'|'trees'|'meadow', how: 'button'|'hand'|'skipped', seconds }.
// farm_opened { how: 'fence'|'culvert', seconds, prompted } goes once per farm and kind, for a hand
// Demolish of the boundary fence or the culvert too (onTool).

import { F, money } from '../config.js';
import { STEPS, stepPlan } from './opening-plan.js';
import { AUTO_AFTER_MS } from './timelapse.js';
import { track } from '../analytics.js';
import { perimeterFence } from '../sim/goals.js';
import { toolCost } from '../tools.js';
import { many, cap, aOne } from '../data/animals.js';

const CULVERT_AFTER_DAYS = 11; // the culvert prompt waits for a deer to be well in, or this long (about 15 s at normal speed; game
                               // days, so a slow frame rate doesn't run the clock out before the deer get there)
const FOLLOW_LIFE_MS = 12e3;   // the "Follow a deer" offer, before the culvert prompt takes its place
const ZOOM = 1.1;

// The species the opening shows at the fence: one the fence stops, that walks in from the north
// (the start view looks north-west, so animals beyond the north fence are seen across it) and that
// the land can already hold, so it would really come. PNW: black-tailed deer.
function openingSpecies(g) {
  return g.catalog.animals.find(d => d.fenced && d.move === 'ground' && !d.crossing && d.sources.includes('N') &&
    g.wildlife.state[d.index].K >= (d.minK ?? 1)) || null;
}

// A north fence column with the most forest just beyond it (the forest edge), held near a third of
// the way along: with an old forest the whole length of the fence (session 6), any column has one,
// and there the opening picture also takes in the farm's hawk and crows (startWildlife).
function gateColumn(g, def) {
  const w = g.world, B = g.border;
  let best = -1, bs = -1;
  for (let x = Math.floor(w.w * 0.2); x < w.w * 0.65; x++) {
    if (w.feature[w.idx(x, 0)] !== F.FENCE) continue;
    let s = 0;
    for (let y = -6; y <= -1; y++) for (let dx = -3; dx <= 3; dx++) { const j = B.bi(x + dx, y); if (j >= 0 && B.tree[j]) s += 1 + B.treeG[j]; }
    if (B.tree[B.bi(x, -2)]) s -= 3; // (not standing in a trunk)
    s -= Math.abs(x - w.w * 0.3);
    if (s > bs) { bs = s; best = x; }
  }
  return best;
}

// The fence on the species' source edges: what the button tears out (the "Wildlife corridors" goal's fence).
function boundaryFence(g, def) {
  const w = g.world, tiles = [];
  for (const e of def.sources) {
    if (e === 'N') for (let x = 0; x < w.w; x++) tiles.push(w.idx(x, 0));
    if (e === 'E') for (let y = 0; y < w.h; y++) tiles.push(w.idx(w.w - 1, y));
    if (e === 'W') for (let y = 0; y < w.h; y++) tiles.push(w.idx(0, y));
  }
  return [...new Set(tiles)].filter(i => w.feature[i] === F.FENCE);
}

const culvertTile = w => { for (let i = 0; i < w.n; i++) if (w.feature[i] === F.CULVERT) return i; return -1; };

export class Opening {
  constructor(ui) {
    this.ui = ui; this.game = ui.game;
    this.t0 = performance.now(); // (farm_opened's seconds: since this farm was started or loaded)
    this.game.on('tool', stroke => { this.onTool(stroke); this.onStepTool(stroke); });
    // (a farm loaded in the middle of its opening carries on: the stage is saved with it)
    this.game.on('reset', () => { this.t0 = performance.now(); this.prompt?.remove(); this.prompt = null; this.followToast?.remove(); this.followToast = null; this.openedDay = null; this.opened = null; this.culvertShown = false; this.pullAt = null; setTimeout(() => this.resume(), 1200); });
  }

  get stage() { return this.game.flags.opening?.stage; }
  get running() { const s = this.stage; return s === 'fence' || s === 'culvert' || STEPS.includes(s); }
  set stage(s) { this.game.flags.opening = { ...this.game.flags.opening, stage: s }; }

  // A first visit's start (ui.startMode): the fence, the culvert, or straight to the guided planting.
  start() {
    const g = this.game;
    this.t0 = performance.now();
    this.def = openingSpecies(g);
    const x = this.def ? gateColumn(g, this.def) : -1;
    if (this.def && x >= 0) {
      g.flags.opening = { stage: 'fence', species: this.def.key, x };
      const n = this.def.groupSize[1];
      g.wildlife.immigrate(this.def, n, false, { edge: 'N', at: x }); // (their first try, made now: they stop at the fence)
      this.ui.renderer.flyTo(x + 0.5, 1, ZOOM, 1.6); // (a glide from the start view up to the fence)
      this.fencePrompt();
      return true;
    }
    if (culvertTile(g.world) >= 0) { g.flags.opening = { stage: 'culvert' }; this.culvertPrompt(); return true; }
    // (nothing to open: straight to the guided planting, which shows the planting tip itself if none of it applies)
    g.flags.opening = { stage: 'culvert' };
    this.step(STEPS[0]);
    return true;
  }

  fencePrompt() {
    const g = this.game, def = this.def, tiles = boundaryFence(g, def), cost = costOf(g, tiles);
    this.prompt = this.ui.toast({
      text: `${cap(many(def))} are waiting at the forest edge, but the old boundary fence keeps them out.`,
      kind: 'tip', date: g.dateString(), life: 10 * 60e3, sticky: true,
      action: { label: `Tear out the fence (${money(cost)})`, run: () => this.tearFence() },
      onClose: () => this.finish(),
    });
  }

  tearFence() {
    const g = this.game, tiles = boundaryFence(g, this.def);
    const stroke = this.ui.actions.apply('demolish', tiles);
    if (!stroke?.count) { this.finish(); return; }
    for (const i of stroke.changed) this.ui.renderer.markTileDirty?.(i % g.world.w, Math.floor(i / g.world.w));
    this.ui.refreshUndo?.();
    this.stage = 'culvert'; this.opened = performance.now();
  }

  // One button, no reading: follow a deer that just walked in, at eye level. Once per first visit.
  followPrompt(a) {
    const g = this.game, def = this.def;
    g.flags.opening.followOffered = true;
    this.followToast = this.ui.toast({
      text: `They're in.`, kind: 'tip', date: g.dateString(), life: FOLLOW_LIFE_MS, sticky: true,
      action: { label: `Follow ${aOne(def)}`, run: () => { const d = this.deerInside() || a; if (g.wildlife.hasAgent(d)) this.ui.watch.follow(d, 'follow_deer'); } },
    });
  }

  deerInside() {
    const g = this.game, key = g.flags.opening?.species;
    return g.wildlife.agents.find(a => a.key === key && !a.leaving && !a.gate && a.y > 4) || null;
  }

  culvertPrompt() {
    const g = this.game, i = culvertTile(g.world);
    if (i < 0) { this.finish(); return; }
    const t = g.catalog.definition.text || {};
    this.followToast?.remove();
    this.prompt = this.ui.toast({
      text: `${this.opened && !g.flags.opening.followOffered ? 'They\'re in. ' : ''}Next, the road culvert: it keeps ${t.culvertBlocks || 'fish'} out of the creek.`,
      kind: 'tip', date: g.dateString(), life: 10 * 60e3, sticky: true,
      action: { label: `Pull it out (${money(costOf(g, [i]))})`, run: () => this.pullCulvert() },
      onClose: () => this.finish(),
    });
  }

  pullCulvert() {
    const g = this.game, w = g.world, i = culvertTile(w);
    if (i < 0) { this.finish(); return; }
    this.ui.follow = null;
    this.ui.renderer.flyTo(i % w.w + 0.5, Math.floor(i / w.w) - 2.5, ZOOM * 0.9, 1.4);
    this.pullAt = performance.now() + 1500; // (once the view is there, so the creek is seen running free)
  }

  // The farm is open: on to the guided planting (or, with nothing to guide, the usual planting tip).
  finish() {
    if (this.stage === 'done' || STEPS.includes(this.stage)) return;
    this.prompt = null; this.pullAt = null;
    this.step(STEPS[0]);
  }

  // ---------------------------------------------------------------- the guided planting
  // One step's prompt; a step with nothing to do here (no invasives, no creek, no tree mix) or that
  // would leave too little money goes on to the next. After the meadow, the time-lapse.
  step(k) {
    const g = this.game;
    for (let n = STEPS.indexOf(k); n >= 0 && n < STEPS.length; n++) {
      const plan = this.plan(STEPS[n]);
      if (!plan) continue;
      this.stage = STEPS[n]; this.stepAt = performance.now();
      if (this.site) this.ui.renderer.flyTo(this.site.x, this.site.y, ZOOM, 1.6);
      if (plan.select) this.choose(plan.tool);
      this.prompt = this.ui.toast({
        text: plan.text, kind: 'tip', date: g.dateString(), life: 10 * 60e3, sticky: true,
        action: { label: `${plan.label} (${plan.about ? 'about ' : ''}${money(plan.cost)})`, run: () => this.doStep(STEPS[n], 'button') },
        onClose: () => this.stepDone(STEPS[n], 'skipped'),
      });
      return;
    }
    this.stage = 'done';
    if (!g.flags.lapseOffered && !this.ui.timelapse.planted.size) this.ui.plantingTip(); // (nothing planted: the lapse comes after their first planting)
  }

  plan(k) {
    const p = stepPlan(this.game, k, key => this.ui.isOpen(key), this.site, TOUCH);
    if (p?.site) this.site = p.site;
    return p;
  }

  choose(key) {
    const ui = this.ui;
    if (ui.state.cat !== 'plants' || document.getElementById('toolpanel')?.classList.contains('hidden')) ui.openCategory('plants');
    ui.state.plantTab = 'mixes';
    ui.selectTool(key);
  }

  doStep(k, how) {
    const g = this.game, plan = this.plan(k);
    if (plan) {
      this.applying = true;
      let stroke;
      try { stroke = this.ui.actions.apply(plan.tool, plan.tiles); } finally { this.applying = false; }
      for (const i of stroke?.changed || []) this.ui.renderer.markTileDirty?.(i % g.world.w, Math.floor(i / g.world.w));
      this.ui.refreshUndo?.();
    }
    this.stepDone(k, how);
  }

  stepDone(k, how) {
    if (this.stage !== k) return;
    this.prompt?.remove(); this.prompt = null;
    track('opening_step', { step: k, how, seconds: Math.round((performance.now() - (this.stepAt || this.t0)) / 1000) });
    const n = STEPS.indexOf(k);
    if (n === STEPS.length - 1) {
      this.stage = 'done';
      // (the time-lapse a few seconds after the last planting, so it's seen going in)
      const lapse = this.ui.timelapse;
      if (how !== 'skipped' && !this.game.flags.lapseOffered) lapse.autoAt = performance.now() + AUTO_AFTER_MS;
      else if (!lapse.planted.size) this.ui.plantingTip();
      return;
    }
    this.step(STEPS[n + 1]);
  }

  // Each frame while the opening runs: the culvert prompt once a deer is in, and the delayed pull.
  frame() {
    const s = this.stage;
    if (!s || s === 'done') return;
    const g = this.game, now = performance.now();
    if (s === 'culvert' && this.opened && !this.culvertShown) {
      const o = g.flags.opening, inside = this.deerInside();
      if (inside && !o.followOffered && !this.ui.watch.on) this.followPrompt(inside);
      // (the culvert prompt waits while the follow offer is up or the deer is being followed)
      const waiting = this.followToast?.isConnected || this.ui.watch.on;
      if (this.openedDay == null) this.openedDay = g.day;
      if (!waiting && (o.followOffered || g.day - this.openedDay > CULVERT_AFTER_DAYS)) { this.culvertShown = true; this.culvertPrompt(); }
    }
    if (this.pullAt && now >= this.pullAt) {
      this.pullAt = null;
      const i = culvertTile(g.world);
      const stroke = i >= 0 ? this.ui.actions.apply('demolish', [i]) : null;
      if (stroke?.count) this.ui.renderer.markTileDirty?.(i % g.world.w, Math.floor(i / g.world.w));
      this.ui.refreshUndo?.();
      setTimeout(() => this.finish(), 2500);
    }
  }

  // A farm reload in the middle of the opening (the stage is saved with the farm).
  resume() {
    const s = this.stage, g = this.game;
    if (!s || s === 'done' || g.visiting) return; // (never on someone else's shared farm)
    this.def = g.catalog.animal[g.flags.opening.species] || null;
    if (STEPS.includes(s)) { this.step(s); return; }
    if (s === 'fence' && this.def && perimeterFence(g.world)) this.fencePrompt();
    else if (culvertTile(g.world) >= 0) { this.culvertShown = true; this.stage = 'culvert'; this.culvertPrompt(); }
    else this.finish();
  }

  // farm_opened: the boundary fence (all of it on one edge, the arrivals' way in) or the culvert
  // taken out, by the prompt or by hand. Once per farm and kind.
  onTool(stroke) {
    if (stroke.tool.key !== 'demolish' || !stroke.count || this.game.visiting) return;
    const g = this.game, done = (g.flags.opened ||= {});
    const prompted = this.stage === 'fence' || this.stage === 'culvert';
    const send = how => { done[how] = true; track('farm_opened', { how, seconds: Math.round((performance.now() - this.t0) / 1000), prompted }); };
    if (!done.culvert && stroke.culvert) send('culvert');
    // (the boundary fence: three tiles or more taken out, a gap animals get through)
    if (stroke.boundaryFence) done.fenceTiles = (done.fenceTiles || 0) + stroke.boundaryFence;
    const opened = done.fenceTiles >= 3;
    if (!done.fence && opened) send('fence');
    // (a hand Demolish during the opening moves it on as the button would)
    if (this.stage === 'fence' && opened && !this.opened) { this.stage = 'culvert'; this.opened = performance.now(); this.prompt?.remove(); }
    if (this.stage === 'culvert' && stroke.culvert && !this.pullAt) { this.prompt?.remove(); setTimeout(() => this.finish(), 2500); }
  }

  // A guided step done by hand: Pull invasives in the pull step, a tree in the trees step, a
  // groundcover in the meadow step. (The step's own button comes through here too, and is already done.)
  onStepTool(stroke) {
    const k = this.stage, t = stroke.tool;
    if (!STEPS.includes(k) || !stroke.count || this.game.visiting || this.applying) return;
    if ((k === 'pull' && t.key === 'pull') || (k === 'trees' && t.cat === 'plants' && t.layer === 2) || (k === 'meadow' && t.cat === 'plants' && t.layer === 0)) this.stepDone(k, 'hand');
  }
}

const TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const costOf = (g, tiles) => tiles.reduce((s, i) => s + Math.max(0, toolCost(g, g.catalog.tools.demolish, i)), 0);
