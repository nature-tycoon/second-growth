// Mouse and keyboard: camera control, brushing tools across the map, inspecting.

import { TILE, money } from './config.js';
import { TOOLS, brushTiles, toolCost, bestSuit } from './tools.js';
import { PLANTS } from './data/plants.js';
import { ANIMALS } from './data/animals.js';
import { plantLimits } from './sim/plants.js';

export class Input {
  constructor(game, renderer, ui) {
    this.game = game; this.r = renderer; this.ui = ui;
    this.keys = new Set();
    this.stroke = null;
    this.pan = null;
    this.mouse = { x: 0, y: 0, in: false };
    this.tip = document.getElementById('cursor-tip');
    const cv = renderer.canvas;
    cv.addEventListener('mousedown', e => this.down(e));
    window.addEventListener('mousemove', e => this.move(e));
    window.addEventListener('mouseup', e => this.up(e));
    cv.addEventListener('mouseleave', () => { this.mouse.in = false; this.ui.state.hover = null; this.tip.classList.add('hidden'); });
    cv.addEventListener('mouseenter', () => { this.mouse.in = true; });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      this.r.zoomAt(e.clientX, e.clientY, f);
    }, { passive: false });
    window.addEventListener('keydown', e => this.key(e, true));
    window.addEventListener('keyup', e => this.key(e, false));
    window.addEventListener('blur', () => this.keys.clear());
  }

  key(e, down) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
    const k = e.key.toLowerCase();
    if (down) this.keys.add(k); else this.keys.delete(k);
    if (!down) return;
    if (k === 'escape') {
      if (this.ui.modalOpen) this.ui.closeModal();
      else if (this.ui.state.cat !== 'inspect') this.ui.openCategory('inspect');
      else this.ui.closeInfo();
      return;
    }
    if (this.ui.modalOpen) return;
    if (k === ' ') {
      e.preventDefault();
      if (this.game.speed) { this.lastSpeed = this.game.speed; this.ui.setSpeed(0); }
      else this.ui.setSpeed(this.lastSpeed || 1);
    }
    else if (k === '1' || k === '2' || k === '3') this.ui.setSpeed(+k);
    else if (k === '[') this.ui.nudgeBrush(-1);
    else if (k === ']') this.ui.nudgeBrush(1);
    else if (k === 't') this.ui.toggleTrees();
    else if (k === 'q') this.r.rotate(-1);
    else if (k === 'e') this.r.rotate(1);
    else if (k === 'tab') { e.preventDefault(); this.ui.togglePanels(); }
    else if (k === 'h') this.ui.setOverlay(this.ui.state.overlay === 'habitat' ? 'none' : 'habitat');
    else if (k === 'g') this.ui.openGuide();
  }

  update(dt) {
    if (this.ui.modalOpen) return;
    const sp = 700 * dt;
    let dx = 0, dy = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= sp;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx += sp;
    if (this.keys.has('w') || this.keys.has('arrowup')) dy -= sp;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy += sp;
    if (this.keys.has('-') || this.keys.has('_')) this.r.zoomAt(this.r.vw / 2, this.r.vh / 2, Math.exp(-dt * 1.5));
    if (this.keys.has('=') || this.keys.has('+')) this.r.zoomAt(this.r.vw / 2, this.r.vh / 2, Math.exp(dt * 1.5));
    if (dx || dy) this.r.panBy(-dx, -dy);
    if (this.mouse.in && !this.pan) this.updateHover();
  }

  tool() { return this.ui.state.tool ? TOOLS[this.ui.state.tool] : null; }

  down(e) {
    if (e.button === 2 || e.button === 1) {
      this.pan = { x: e.clientX, y: e.clientY };
      this.r.canvas.style.cursor = 'grabbing';
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    const t = this.r.screenToTile(e.clientX, e.clientY);
    const tool = this.tool();
    if (!tool) { this.inspectAt(t); return; }
    if (!this.game.world.inb(t.x, t.y)) return;
    this.stroke = { applied: new Set(), cost: 0, count: 0, unsuitable: 0, broke: false, last: null, tool };
    if (tool.brush) document.body.classList.add('painting');
    this.applyAt(t.x, t.y);
    if (!tool.brush) this.endStroke();
  }

  move(e) {
    this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    if (this.pan) {
      this.r.panBy(e.clientX - this.pan.x, e.clientY - this.pan.y);
      this.pan.x = e.clientX; this.pan.y = e.clientY;
      return;
    }
    if (this.stroke && this.stroke.tool.brush) {
      const t = this.r.screenToTile(e.clientX, e.clientY);
      const last = this.stroke.last;
      if (last && (last.x !== t.x || last.y !== t.y)) {
        // walk the line between samples so fast strokes stay continuous
        let x0 = last.x, y0 = last.y;
        const dx = Math.abs(t.x - x0), dy = -Math.abs(t.y - y0), sx = x0 < t.x ? 1 : -1, sy = y0 < t.y ? 1 : -1;
        let err = dx + dy;
        for (let guard = 0; guard < 200; guard++) {
          if (x0 === t.x && y0 === t.y) break;
          const e2 = 2 * err;
          if (e2 >= dy) { err += dy; x0 += sx; }
          if (e2 <= dx) { err += dx; y0 += sy; }
          this.applyAt(x0, y0);
        }
      }
    }
  }

  up(e) {
    if (this.pan && (e.button === 2 || e.button === 1)) { this.pan = null; this.r.canvas.style.cursor = ''; return; }
    if (this.stroke) this.endStroke();
  }

  applyAt(x, y) {
    const s = this.stroke, g = this.game, w = g.world, tool = s.tool;
    s.last = { x, y };
    if (!w.inb(x, y)) return;
    const tiles = tool.brush ? brushTiles(w, x, y, this.ui.state.brushR) : [w.idx(x, y)];
    for (const i of tiles) {
      if (s.applied.has(i)) continue;
      s.applied.add(i);
      const cost = toolCost(g, tool, i);
      if (cost > 0 && !g.canAfford(cost)) { s.broke = true; continue; }
      const res = tool.apply(g, i, Math.random);
      if (res === true) {
        this.r.markTileDirty(i % w.w, (i / w.w) | 0);
        if (cost > 0) g.spend(cost); else if (cost < 0) g.earn(-cost);
        s.cost += cost; s.count++;
        s.lastOk = i;
      } else if (res === 'unsuitable') { s.unsuitable++; s.lastBad = i; }
    }
    w.renderDirty = true;
  }

  endStroke() {
    const s = this.stroke, g = this.game;
    this.stroke = null;
    document.body.classList.remove('painting');
    if (!s) return;
    if ((s.tool.key === 'trail' || s.tool.key === 'boardwalk' || s.tool.key === 'blind') && s.count && !g.visitors.facilities().parking && !g.flags.trailHint) {
      g.flags.trailHint = true;
      g.notify('Visitors need a way in: build a Trailhead parking lot right beside a road, then connect your trail to it.', 'warn');
    }
    if (s.tool.cat === 'land' || s.tool.key === 'demolish' || s.tool.key === 'log') g.refreshEnvironment();
    else if (s.count) g.refreshEnvironment();
    if (s.broke) g.notify(`Not enough money. Monthly grants will top up your budget. Healthier land earns bigger grants.`, 'warn');
    if (!s.count && s.unsuitable && s.tool.species) {
      const p = PLANTS.find(q => q && q.key === s.tool.species[0]);
      const lim = s.lastBad != null ? plantLimits(g.world, s.lastBad, p) : [];
      g.notify(`${s.tool.name} won't survive here${lim.length ? ` (${lim.join(', ')})` : ''}. Green previews show where it will grow.`, 'warn');
    }
    this.ui.renderInfo();
    if (s.tool.cat === 'visitors') this.ui.renderToolPanel();
  }

  inspectAt(t) {
    const g = this.game, w = g.world;
    const best = this.r.pickAgent(g, this.mouse.x, this.mouse.y);
    if (best) { this.ui.inspectAgent(best); return; }
    if (w.inb(t.x, t.y)) this.ui.inspectTile(w.idx(t.x, t.y));
    else this.ui.closeInfo();
  }

  updateHover() {
    const g = this.game, w = g.world, ui = this.ui;
    const t = this.r.screenToTile(this.mouse.x, this.mouse.y);
    const tool = this.tool();
    ui.state.hover = w.inb(t.x, t.y) ? { x: t.x, y: t.y } : null;
    ui.state.brushR = tool && tool.brush ? ui.state.brushR : 0;
    if (!tool || !ui.state.hover) { ui.state.previewTiles = null; this.tip.classList.add('hidden'); return; }
    let tiles = tool.brush ? brushTiles(w, t.x, t.y, ui.state.brushR) : [w.idx(t.x, t.y)];
    if (tool.footprint) {
      tiles = [];
      for (let yy = t.y; yy < t.y + tool.footprint[1]; yy++) for (let xx = t.x; xx < t.x + tool.footprint[0]; xx++) if (w.inb(xx, yy)) tiles.push(w.idx(xx, yy));
    }
    const prev = [];
    for (const i of tiles) {
      let color = 'rgba(255,250,230,0.16)';
      if (tool.species) {
        const layer = PLANTS.find(p => p && p.key === tool.species[0]).layer;
        const occupied = layer === 0 ? w.ground[i] : layer === 1 ? w.shrub[i] : w.tree[i];
        const s = bestSuit(g, i, tool.species);
        color = occupied ? 'rgba(80,80,80,0.2)' : s > 0.55 ? 'rgba(110,220,110,0.36)' : s > 0.3 ? 'rgba(235,210,90,0.36)' : 'rgba(220,90,70,0.34)';
      } else if (tool.key === 'pull') {
        const inv = (w.ground[i] && PLANTS[w.ground[i]].invasive) || (w.shrub[i] && PLANTS[w.shrub[i]].invasive);
        color = inv ? 'rgba(230,90,160,0.4)' : 'rgba(255,250,230,0.1)';
      } else if (tool.key === 'demolish') {
        color = toolCost(g, tool, i) !== 0 || w.struct[i] >= 0 ? 'rgba(230,120,70,0.45)' : 'rgba(255,250,230,0.1)';
      }
      prev.push({ i, color });
    }
    ui.state.previewTiles = prev;
    // cursor tip
    const i0 = w.idx(t.x, t.y);
    const cost = toolCost(g, tool, i0);
    let txt = `${tool.name}`;
    if (tool.key === 'demolish') {
      if (w.struct[i0] >= 0 || cost) txt += cost < 0 ? ` · earns ${money(-cost)} salvage` : ` · ${money(cost)}`;
    } else if (cost) txt += ` · ${money(cost)}${tool.brush ? '/tile' : ''}`;
    if (tool.species) {
      const s = bestSuit(g, i0, tool.species);
      txt += s > 0.55 ? ' · good spot' : s > 0.3 ? ' · okay spot' : ' · <span class="bad">poor spot</span>';
    }
    if (this.stroke && this.stroke.cost) txt += ` · spent ${money(this.stroke.cost)}`;
    this.tip.innerHTML = txt;
    this.tip.classList.remove('hidden');
    const tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
    const left = this.mouse.x + 16 + tw > window.innerWidth - 8 ? this.mouse.x - 12 - tw : this.mouse.x + 16;
    const top = this.mouse.y + 18 + th > window.innerHeight - 8 ? this.mouse.y - 12 - th : this.mouse.y + 18;
    this.tip.style.left = Math.max(4, left) + 'px';
    this.tip.style.top = Math.max(4, top) + 'px';
  }
}
