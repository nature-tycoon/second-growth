// "Watch 10 years": a time-lapse of the player's own planting (docs/ideas/2026-11-21-first-minutes/
// s4.md, timelapse-2.md).
//
// It plays on its own once per first visit, a few seconds after the opening's guided planting
// (ui/opening.js: blackberry out, trees along the creek, a meadow sown; or after the first planting
// on a map without those steps), and from the menu for anyone, any time. Ten game years go by in
// about 20 real seconds: the game's own time-lapse clock (Game.startLapse) steps whole days between
// drawn frames, as many as the frame rate allows (about 30 fps; 20 on a slow machine), up to 60 game
// days a second. The panels are tucked away (watch mode, `Watch.start({ lapse })`), the camera makes
// one slow drift round what was planted, and the animals aren't drawn (at that pace they'd streak).
// At the end the clock goes back to normal speed, the animals come back, and one newcomer that
// arrived meanwhile is shown for a few seconds before control comes back with one line on what changed.
// Any click, tap, key or wheel ends it at once (and does nothing else). Money running out or a fire
// reaching the planting stops it early and pauses, and so do beavers cutting a tree that was planted (once
// per farm: the tree guards are offered there, while the rest can still be saved: sim/tree-guard.js).
//
// The ecology is unchanged: each day is the same day a headless run steps (Game.lapseDay).
// timelapse_started { map, from: 'auto'|'menu', first_visit, year },
// timelapse_watched { map, seconds, years, ended: 'done'|'input'|'money'|'fire'|'guards'|'time', from, fps, days_per_s }.

import { MOMENT_HOLD_MS } from '../sim/moments.js';
import { DAYS_PER_YEAR, money } from '../config.js';
import { track } from '../analytics.js';

export const LAPSE_YEARS = 10;
const LAPSE_SPEED = 3;          // the speed shown meanwhile (the drawing paces its redraws by it); the days come from the lapse clock
const RATE = 60;                // game days a real second at most: ten years in about 20 s
const MAX_MS = 45e3;            // a slow machine that can't keep up stops by then, and the line says how many years it was
                                // (this Mac: ten years in ~21 s; at CPU x4, ~12 days a second, so about four years)
export const AUTO_AFTER_MS = 3e3; // after the last planting, so the seeds are seen going in first
const NEWCOMER_MS = 6e3;        // the newcomer shown at normal speed at the end
const LOW_MONEY = 1000;
const NUMBER = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

export class Timelapse {
  constructor(ui) {
    this.ui = ui; this.game = ui.game;
    this.on = false; this.planted = new Set(); this.autoAt = 0;
    this.game.on('tool', stroke => this.onTool(stroke));
    this.game.on('reset', () => { if (this.on) this.stop('input', false); this.planted.clear(); this.autoAt = 0; });
    // (a button or finger down: a stroke may be under way, and the time-lapse waits for it to end)
    for (const t of ['pointerdown', 'pointerup', 'pointercancel']) window.addEventListener(t, e => { this.held = t === 'pointerdown' && !this.on; }, { capture: true, passive: true });
    this.input = e => {
      if (!this.on || performance.now() < this.armedAt) return;
      if (e.type === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      e.preventDefault(); e.stopImmediatePropagation(); // (the click that ends it does only that: no paint, no pause)
      this.stop(this.ending ? this.ending.ended : 'input');
    };
  }

  // Running, or about to start on its own: the Story offer waits (ui.maybeOfferStory).
  get busy() { return this.on || !!this.autoAt; }

  // A first visit's planting: the time-lapse follows on its own (the opening sets autoAt itself after
  // its last step; on a map without those steps, after the first planting). Once per farm.
  onTool(stroke) {
    if (stroke.tool.cat !== 'plants' || !stroke.count || this.game.visiting) return;
    for (const i of stroke.changed) this.planted.add(i);
    if (this.ui.firstVisit && !this.game.flags.lapseOffered && !this.autoAt) this.autoAt = performance.now() + AUTO_AFTER_MS;
  }

  start(from = 'menu') {
    if (this.on) return;
    const g = this.game, ui = this.ui;
    this.autoAt = 0;
    if (ui.modalOpen) ui.closeModal();
    if (ui.moment) return;
    if (from === 'auto') g.flags.lapseOffered = true; // (once per farm)
    this.on = true; this.from = from; this.ending = null;
    this.t0 = performance.now(); this.armedAt = this.t0 + 600; this.day0 = g.day; this.money0 = g.money;
    this.frames = 0; this.slow = 0; this.lastFrame = this.t0;
    this.speedBefore = g.speed || 1;
    this.before = this.snapshot();
    this.fireCheckAt = 0; this.guardsOffered = !!g.flags.guardOffered;
    // (after the guided planting, where its steps were shown: the cleared banks, the young trees, the meadow beside them)
    ui.watch.start({ lapse: { tiles: [...this.planted], at: from === 'auto' ? ui.opening.site : null }, from: 'timelapse' });
    ui.setSpeed(LAPSE_SPEED);
    g.startLapse(RATE);
    ui.renderer.actors.hidden = true;
    this.showYears();
    window.addEventListener('pointerdown', this.input, true);
    window.addEventListener('keydown', this.input, true);
    window.addEventListener('wheel', this.input, { capture: true, passive: false });
    track('timelapse_started', { map: g.map, from, first_visit: !!ui.firstVisit, year: g.year });
  }

  stop(ended, say = true) {
    if (!this.on) return;
    const g = this.game, ui = this.ui;
    this.on = false; this.ending = null;
    ui.lastInput = performance.now(); // (watching isn't idle: the Story offer doesn't drop in over the summary line)
    g.stopLapse();
    ui.renderer.actors.hidden = false;
    window.removeEventListener('pointerdown', this.input, true);
    window.removeEventListener('keydown', this.input, true);
    window.removeEventListener('wheel', this.input, true);
    if (ui.watch.on) ui.watch.stop();
    const halted = ended === 'money' || ended === 'fire' || ended === 'guards';
    ui.setSpeed(halted ? 0 : this.speedBefore === LAPSE_SPEED ? 1 : this.speedBefore);
    const years = (g.day - this.day0) / DAYS_PER_YEAR;
    const secs = ((this.lapseEnd || performance.now()) - this.t0) / 1000;
    track('timelapse_watched', { map: g.map, seconds: Math.round((performance.now() - this.t0) / 1000), years: Math.round(years * 10) / 10, ended, from: this.from,
      fps: this.frames ? Math.round(this.frames / Math.max(0.1, secs)) : null, days_per_s: Math.round((g.day - this.day0) / Math.max(0.1, secs)) });
    this.lapseEnd = 0;
    ui.momentHoldUntil = performance.now() + MOMENT_HOLD_MS; // (keystone moments wait: the player gets their farm back first)
    if (!say) return;
    if (ended === 'fire' && this.fireAt != null) {
      const w = g.world; ui.renderer.flyTo(this.fireAt % w.w + 0.5, Math.floor(this.fireAt / w.w) + 0.5, 1.4, 1.6);
      ui.toast({ text: 'Fire has reached what you planted. The time-lapse stopped here so you can act.', kind: 'fire', date: g.dateString(), life: 14000, loc: { x: this.fireAt % w.w + 0.5, y: Math.floor(this.fireAt / w.w) + 0.5 } });
    } else if (ended === 'guards') {
      const w = g.world, j = g.flags.guardAt;
      if (j != null) ui.renderer.flyTo(j % w.w + 0.5, Math.floor(j / w.w) + 0.5, 1.4, 1.6);
      ui.offerGuards(j ?? 0);
    } else if (ended === 'money') {
      ui.toast({ text: `Money is down to ${money(g.money)}. The time-lapse stopped here so you can look at the books.`, kind: 'warn', date: g.dateString(), life: 14000 });
    }
    // (beavers cut a planted tree on the last day, in the newcomer's few seconds, or the frame it stopped for money or fire: offer them now)
    if (ended !== 'guards' && !this.guardsOffered && g.flags.guardOffered) ui.offerGuards(g.flags.guardAt ?? 0);
    ui.toast({ text: this.summary(years), kind: 'goal', date: g.dateString(), life: 20000 }); // ('goal': the payoff isn't routine news, so notices arriving just after don't push it off a phone's two-toast stack)
    if (!halted) ui.spotlightGoal(); // (what's next stands out for a few seconds: ui.js renderGoalTracker)
  }

  // Each frame (ui.frame): the start on its own, then while it runs the clock and the reasons to stop.
  frame() {
    const g = this.game, ui = this.ui, now = performance.now();
    if (!this.on) {
      if (this.autoAt && now >= this.autoAt && !ui.modalOpen && !ui.moment && !ui.watch.on && !ui.photo && !ui.opening.running && !this.held) this.start('auto'); // (not in the middle of a stroke)
      return;
    }
    if (!ui.watch.on) { this.stop('input'); return; } // (left some other way)
    if (this.ending) { if (now >= this.ending.until) this.stop(this.ending.ended); return; }
    if (!g.lapse) { this.stop('input'); return; }
    this.frames++; if (now - this.lastFrame > 50) this.slow++; this.lastFrame = now;
    if (g.speed !== LAPSE_SPEED && !ui.moment) ui.setSpeed(LAPSE_SPEED);
    this.showYears();
    if (g.day - this.day0 >= LAPSE_YEARS * DAYS_PER_YEAR) { this.newcomer('done'); return; }
    if (now - this.t0 > MAX_MS) { this.newcomer('time'); return; }
    if (!g.sandbox && g.money < LOW_MONEY && g.money < this.money0) { this.stop('money'); return; }
    if (g.events.fireTiles && now >= this.fireCheckAt) {
      this.fireCheckAt = now + 400;
      const w = g.world;
      for (const i of this.planted) if (w.fire[i]) { this.fireAt = i; this.stop('fire'); return; }
    }
    // (beavers have cut a tree the player planted: tree guards are offered here, while the rest can still be saved)
    if (!this.guardsOffered && g.flags.guardOffered) { this.stop('guards'); return; }
  }

  // The years are up (or the time, on a slow machine): the clock back to normal speed and the animals drawn again, and one that has
  // moved in meanwhile shown for a few seconds (the one most worth watching, nearest the planting),
  // before control comes back. With none new, it ends at once.
  newcomer(ended) {
    const g = this.game, ui = this.ui, w = g.world;
    this.lapseEnd = performance.now();
    g.stopLapse();
    ui.renderer.actors.hidden = false;
    ui.setSpeed(1);
    const fresh = new Set([...this.snapshot().species].filter(k => !this.before.species.has(k)));
    let cx = w.w / 2, cy = w.h / 2;
    if (this.planted.size) { cx = 0; cy = 0; for (const i of this.planted) { cx += i % w.w; cy += Math.floor(i / w.w); } cx /= this.planted.size; cy /= this.planted.size; }
    let best = null, bs = 0;
    for (const a of g.wildlife.agents) {
      if (!fresh.has(a.sp) || a.leaving || a.gate || !w.inb(Math.floor(a.x), Math.floor(a.y))) continue;
      const def = g.catalog.animals[a.sp], s = (def.move === 'ground' ? 2 : 1) * (def.intro ? 1.5 : 1) / (8 + Math.hypot(a.x - cx, a.y - cy));
      if (s > bs) { bs = s; best = a; }
    }
    if (!best) { this.stop(ended); return; }
    this.ending = { until: performance.now() + NEWCOMER_MS, ended };
    ui.watch.lapse = null; // (an ordinary shot of one animal from here)
    ui.watch.frameAnimal(best);
    const el = ui.watch.el?.querySelector('.w-lapse');
    if (el) el.textContent = `New since you planted · ${matchMedia?.('(pointer: coarse)').matches ? 'tap' : 'click'} to carry on`;
  }

  showYears() {
    const el = this.ui.watch.el?.querySelector('.w-lapse');
    if (!el) return;
    const y = Math.min(LAPSE_YEARS, Math.floor((this.game.day - this.day0) / DAYS_PER_YEAR) + 1);
    const t = `Year ${y} of ${LAPSE_YEARS} · ${matchMedia?.('(pointer: coarse)').matches ? 'tap' : 'click'} to stop`;
    if (el.textContent !== t) el.textContent = t;
  }

  // What the summary compares: on the planted ground, on the whole farm, and who lives here.
  snapshot() {
    const g = this.game, w = g.world;
    let trees = 0, shrubs = 0, grown = 0, farmTrees = 0;
    for (const i of this.planted) {
      if (w.tree[i]) trees++;
      if (w.shrub[i]) shrubs++;
      if (w.tree[i] || w.shrub[i] || (w.ground[i] && w.groundG[i] > 0.6)) grown++;
    }
    for (let i = 0; i < w.n; i++) if (w.tree[i]) farmTrees++;
    const species = new Set();
    g.wildlife.state.forEach((s, k) => { if (s.pop > 0 && !g.catalog.animals[k]?.domestic) species.add(k); });
    return { trees, shrubs, grown, farmTrees, species, score: Math.round(g.cache?.score?.total ?? 0) };
  }

  // One line on what changed: "Ten years on: 140 trees and 60 shrubs stand where you planted, and
  // Roosevelt elk and black bear have moved in. Health 18 → 34."
  summary(years) {
    const g = this.game, a = this.before, b = this.snapshot(), n = Math.floor(years + 0.05); // (down: 5.5 years on a slow machine is "Five years on")
    const when = years < 0.75 ? 'A few months on' : n <= 1 ? 'A year on' : `${NUMBER[n] || n} years on`;
    const parts = [];
    const count = (k, one, many) => `${k} ${k === 1 ? one : many}`;
    if (this.planted.size) {
      const grew = [];
      if (b.trees) grew.push(count(b.trees, 'tree', 'trees'));
      if (b.shrubs) grew.push(count(b.shrubs, 'shrub', 'shrubs'));
      if (grew.length) parts.push(`${grew.join(' and ')} ${b.trees + b.shrubs === 1 ? 'stands' : 'stand'} where you planted`);
      else if (b.grown) parts.push('what you sowed is grown in');
    }
    if (!parts.length && b.farmTrees > a.farmTrees) parts.push(`the farm has ${count(b.farmTrees - a.farmTrees, 'more tree', 'more trees')}`);
    const came = [...b.species].filter(k => !a.species.has(k)).map(k => g.catalog.animals[k].name);
    if (came.length) {
      const names = came.length > 3 ? [...came.slice(0, 3), `${came.length - 3} more`] : came;
      parts.push(`${names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names.at(-1) : names[0]} ${came.length > 1 ? 'have' : 'has'} moved in`);
    }
    let line = `${when}: ${parts.length ? parts.join(', and ') : 'the land is still finding its feet'}.`;
    if (b.score !== a.score) line += ` Health ${a.score} → ${b.score}.`;
    return line;
  }
}
