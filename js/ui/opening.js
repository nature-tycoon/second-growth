// A first visit's opening: open the farm to the wild (docs/ideas/2026-11-21-first-minutes/plan.md, step 3).
//
// The farm is walled off by its story: the boundary fence keeps deer and elk out, the road culvert
// keeps fish out of the creek. On a first visit the view starts at the north fence, where a group
// of deer stands at the forest edge beyond it (the real wander-in rule, its first try made at once:
// sim/fence-gate.js), and the one prompt is to tear the fence out. The deer walk in within seconds.
// Then one short prompt for the culvert, then the usual planting tip. Both buttons run Demolish
// through the same path as a stroke (cost, undo, goals, tool_used). Nothing here is scripted
// wildlife: the deer come because the fence is gone, through the rules every arrival follows.
//
// game.flags.opening = { stage: 'fence' | 'culvert' | 'done' } (saved with the farm, so a reload in
// the middle carries on; fence-gate.js holds the waiting deer while the stage is 'fence').
// farm_opened { how: 'fence'|'culvert', seconds, prompted } goes once per farm and kind, for a hand
// Demolish of the boundary fence or the culvert too (onTool).

import { F, money } from '../config.js';
import { track } from '../analytics.js';
import { perimeterFence } from '../sim/goals.js';
import { toolCost } from '../tools.js';
import { many, cap } from '../data/animals.js';

const CULVERT_AFTER_MS = 15e3; // the culvert prompt waits for a deer to be well in, or this long
const ZOOM = 1.1;

// The species the opening shows at the fence: one the fence stops, that walks in from the north
// (the start view looks north-west, so animals beyond the north fence are seen across it) and that
// the land can already hold, so it would really come. PNW: black-tailed deer.
function openingSpecies(g) {
  return g.catalog.animals.find(d => d.fenced && d.move === 'ground' && !d.crossing && d.sources.includes('N') &&
    g.wildlife.state[d.index].K >= (d.minK ?? 1)) || null;
}

// A north fence column near the middle with the most forest just beyond it (the forest edge).
function gateColumn(g, def) {
  const w = g.world, B = g.border;
  let best = -1, bs = -1;
  for (let x = Math.floor(w.w * 0.2); x < w.w * 0.65; x++) {
    if (w.feature[w.idx(x, 0)] !== F.FENCE) continue;
    let s = 0;
    for (let y = -6; y <= -1; y++) for (let dx = -3; dx <= 3; dx++) { const j = B.bi(x + dx, y); if (j >= 0 && B.tree[j]) s += 1 + B.treeG[j]; }
    if (B.tree[B.bi(x, -2)]) s -= 3; // (not standing in a trunk)
    s -= Math.abs(x - w.w * 0.4) * 0.05;
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
    this.game.on('tool', stroke => this.onTool(stroke));
    // (a farm loaded in the middle of its opening carries on: the stage is saved with it)
    this.game.on('reset', () => { this.t0 = performance.now(); this.prompt?.remove(); this.prompt = null; this.opened = null; this.culvertShown = false; this.pullAt = null; setTimeout(() => this.resume(), 1200); });
  }

  get stage() { return this.game.flags.opening?.stage; }
  get running() { const s = this.stage; return s === 'fence' || s === 'culvert'; }
  set stage(s) { this.game.flags.opening = { ...this.game.flags.opening, stage: s }; }

  // A first visit's start (ui.startMode). Returns false when nothing applies, so the planting tip shows at once.
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
    return false;
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

  culvertPrompt() {
    const g = this.game, i = culvertTile(g.world);
    if (i < 0) { this.finish(); return; }
    const t = g.catalog.definition.text || {};
    this.prompt = this.ui.toast({
      text: `${this.opened ? 'They\'re in. ' : ''}Next, the road culvert: it keeps ${t.culvertBlocks || 'fish'} out of the creek.`,
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

  finish() {
    if (this.stage === 'done') return;
    this.stage = 'done'; this.prompt = null; this.pullAt = null;
    this.ui.plantingTip();
  }

  // Each frame while the opening runs: the culvert prompt once a deer is in, and the delayed pull.
  frame() {
    const s = this.stage;
    if (!s || s === 'done') return;
    const g = this.game, now = performance.now();
    if (s === 'culvert' && this.opened && !this.culvertShown) {
      const inside = g.wildlife.agents.some(a => a.key === g.flags.opening.species && !a.leaving && a.y > 4);
      if (inside || now - this.opened > CULVERT_AFTER_MS) { this.culvertShown = true; this.culvertPrompt(); }
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
}

const costOf = (g, tiles) => tiles.reduce((s, i) => s + Math.max(0, toolCost(g, g.catalog.tools.demolish, i)), 0);
