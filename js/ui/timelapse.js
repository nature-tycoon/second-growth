// "Watch 10 years": a time-lapse of the player's own planting (docs/ideas/2026-11-21-first-minutes/plan.md, step 5).
//
// Offered once, after a first visit's first planting (a short note with one button). Also in the
// menu for anyone, any time, with no prompt. It runs the farm at the top speed with the panels
// tucked away (watch mode, `Watch.start({ lapse })`), the camera drifting slowly over what was
// planted and now and then an animal near it. It ends on its own after ten game years (or a few
// real minutes on a slow machine), on any click or key, or early on anything that needs the
// player: money running out, or a fire reaching what they planted. Fires and floods elsewhere play
// out as part of the story: no banner, no pause. Then one line on what changed.
//
// Nothing about the simulation changes: it is the same game at its usual top speed.
// timelapse_offered { map }, timelapse_started { map, from, first_visit, year },
// timelapse_watched { map, seconds, years, ended: 'done'|'input'|'money'|'fire'|'time' }.

import { DAYS_PER_YEAR, money } from '../config.js';
import { track } from '../analytics.js';

export const LAPSE_YEARS = 10;
const LAPSE_SPEED = 3;          // the top speed: 8 game days a second, so ten years in about 2.5 minutes
const MAX_MS = 210e3;           // a slow machine (under ~25 fps the clock runs behind) still stops by then
const OFFER_AFTER_MS = 5e3;     // after the first planting, so the seeds are seen going in first
const OFFER_LIFE_MS = 40e3;
const LOW_MONEY = 1000;
const NUMBER = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

export class Timelapse {
  constructor(ui) {
    this.ui = ui; this.game = ui.game;
    this.on = false; this.planted = new Set(); this.offerAt = 0; this.offer = null;
    this.game.on('tool', stroke => this.onTool(stroke));
    this.game.on('reset', () => { if (this.on) this.stop('input', false); this.planted.clear(); this.offerAt = 0; this.offer?.remove(); this.offer = null; });
    this.input = e => {
      if (!this.on || performance.now() < this.armedAt) return;
      if (e.type === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      e.preventDefault(); e.stopImmediatePropagation(); // (the click that ends it does only that: no paint, no pause)
      this.stop('input');
    };
  }

  // An offer on screen or the time-lapse running: the Story offer waits (ui.maybeOfferStory).
  get busy() { return this.on || !!this.offer?.isConnected; }

  onTool(stroke) {
    if (stroke.tool.cat !== 'plants' || !stroke.count || this.game.visiting) return;
    for (const i of stroke.changed) this.planted.add(i);
    if (this.ui.firstVisit && !this.game.flags.lapseOffered && !this.offerAt) this.offerAt = performance.now() + OFFER_AFTER_MS;
  }

  showOffer() {
    const g = this.game;
    g.flags.lapseOffered = true; this.offerAt = 0;
    track('timelapse_offered', { map: g.map });
    this.offer = this.ui.toast({
      text: 'Your seeds are in. See what ten years make of them?', kind: 'tip', date: g.dateString(),
      life: OFFER_LIFE_MS, sticky: true, action: { label: `Watch ${LAPSE_YEARS} years`, run: () => this.start('offer') },
    });
  }

  start(from = 'menu') {
    if (this.on) return;
    const g = this.game, ui = this.ui;
    this.offer?.remove(); this.offer = null; this.offerAt = 0;
    if (ui.modalOpen) ui.closeModal();
    if (ui.moment) return;
    this.on = true; this.from = from;
    this.t0 = performance.now(); this.armedAt = this.t0 + 600; this.day0 = g.day; this.money0 = g.money;
    this.speedBefore = g.speed || 1;
    this.before = this.snapshot();
    this.fireCheckAt = 0;
    ui.watch.start({ lapse: { tiles: [...this.planted] }, from: 'timelapse' });
    ui.setSpeed(LAPSE_SPEED);
    this.showYears();
    window.addEventListener('pointerdown', this.input, true);
    window.addEventListener('keydown', this.input, true);
    window.addEventListener('wheel', this.input, { capture: true, passive: false });
    track('timelapse_started', { map: g.map, from, first_visit: !!ui.firstVisit, year: g.year });
  }

  stop(ended, say = true) {
    if (!this.on) return;
    const g = this.game, ui = this.ui;
    this.on = false;
    window.removeEventListener('pointerdown', this.input, true);
    window.removeEventListener('keydown', this.input, true);
    window.removeEventListener('wheel', this.input, true);
    if (ui.watch.on) ui.watch.stop();
    ui.setSpeed(ended === 'money' || ended === 'fire' ? 0 : this.speedBefore === LAPSE_SPEED ? 1 : this.speedBefore);
    const years = (g.day - this.day0) / DAYS_PER_YEAR;
    track('timelapse_watched', { map: g.map, seconds: Math.round((performance.now() - this.t0) / 1000), years: Math.round(years * 10) / 10, ended, from: this.from });
    if (!say) return;
    if (ended === 'fire' && this.fireAt != null) {
      const w = g.world; ui.renderer.flyTo(this.fireAt % w.w + 0.5, Math.floor(this.fireAt / w.w) + 0.5, 1.4, 1.6);
      ui.toast({ text: 'Fire has reached what you planted. The time-lapse stopped here so you can act.', kind: 'fire', date: g.dateString(), life: 14000, loc: { x: this.fireAt % w.w + 0.5, y: Math.floor(this.fireAt / w.w) + 0.5 } });
    } else if (ended === 'money') {
      ui.toast({ text: `Money is down to ${money(g.money)}. The time-lapse stopped here so you can look at the books.`, kind: 'warn', date: g.dateString(), life: 14000 });
    }
    ui.toast({ text: this.summary(years), kind: 'good', date: g.dateString(), life: 20000 });
  }

  // Each frame while it runs (ui.frame): the clock, and the reasons to stop.
  frame() {
    const g = this.game, ui = this.ui, now = performance.now();
    if (!this.on) {
      if (this.offerAt && now >= this.offerAt && !ui.modalOpen && !ui.moment && !ui.watch.on && !ui.photo && !ui.opening.running) this.showOffer();
      return;
    }
    if (!ui.watch.on) { this.stop('input'); return; } // (left some other way)
    if (g.speed !== LAPSE_SPEED && !ui.moment) ui.setSpeed(LAPSE_SPEED);
    this.showYears();
    if (g.day - this.day0 >= LAPSE_YEARS * DAYS_PER_YEAR) { this.stop('done'); return; }
    if (now - this.t0 > MAX_MS) { this.stop('time'); return; }
    if (!g.sandbox && g.money < LOW_MONEY && g.money < this.money0) { this.stop('money'); return; }
    if (g.events.fireTiles && now >= this.fireCheckAt) {
      this.fireCheckAt = now + 400;
      const w = g.world;
      for (const i of this.planted) if (w.fire[i]) { this.fireAt = i; this.stop('fire'); return; }
    }
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
    const g = this.game, a = this.before, b = this.snapshot(), n = Math.round(years);
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
