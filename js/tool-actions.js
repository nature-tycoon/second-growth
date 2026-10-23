// Shared player-action lifecycle. Controls and scripted players use the same
// tool rules, prices, bookkeeping and completion work. Drawing stays with the UI.
import { T } from './config.js';
import { strokeTiles, toolCost } from './tools.js';
import { plantLimits } from './sim/plants.js';
import { toolUnlocked } from './sim/campaign.js';
import { assertToolCost, assertToolResult } from './data/contracts.js';

/**
 * @typedef {Object} ToolStroke
 * @property {import('./world.js').World} world
 * @property {import('./data/contracts.js').ToolDefinition} tool
 * @property {import('./data/contracts.js').RandomSource} random
 * @property {Set<number>} applied Tiles attempted during this stroke.
 * @property {number[]} changed Tiles successfully changed.
 * @property {number} count
 * @property {number} cost Net price; negative values are salvage income.
 * @property {number} unsuitable
 * @property {boolean} broke
 * @property {boolean} finished
 * @property {{x: number, y: number}|null} last
 * @property {number} [locked]
 * @property {number} [lastOk]
 * @property {number} [lastBad]
 */

export class ToolActions {
  // Undo is an optional history sink, so headless plans can share the action
  // rules without copying the world for every stroke. Batched fixture setup can
  // defer environment refresh until its next daily tick.
  constructor(game, { undo = null, refreshEnvironment = true } = {}) {
    this.game = game;
    this.undo = undo;
    this.refreshEnvironment = refreshEnvironment;
  }

  /** @returns {ToolStroke|null} */
  begin(key, { random = Math.random } = {}) {
    const tool = typeof key === 'string' ? this.game.catalog.tools[key] : key;
    if (!tool || this.game.catalog.tools[tool.key] !== tool || !toolUnlocked(this.game, tool.key)) return null;
    const stroke = {
      world: this.game.world, tool, random, applied: new Set(), changed: [],
      cost: 0, count: 0, unsuitable: 0, broke: false, last: null, finished: false,
    };
    this.undo?.begin(tool);
    return stroke;
  }

  current(stroke) {
    return stroke && !stroke.finished && stroke.world === this.game.world && this.game.catalog.tools[stroke.tool.key] === stroke.tool;
  }

  /** Paint one brush position; returns the tiles changed by this sample. */
  paint(stroke, x, y, radius = stroke?.tool.size ?? 0) {
    if (!this.current(stroke)) return [];
    stroke.last = { x, y };
    const w = stroke.world;
    if (!Number.isInteger(x) || !Number.isInteger(y) || !w.inb(x, y)) return [];
    const tiles = stroke.tool.brush ? strokeTiles(w, stroke.tool, x, y, radius) : [w.idx(x, y)];
    return this.applyTiles(stroke, tiles);
  }

  /** Apply explicit tile indices, sharing duplicate suppression across samples. */
  applyTiles(stroke, tiles) {
    if (!this.current(stroke)) return [];
    const g = this.game, w = stroke.world, tool = stroke.tool, map = g.mapDefinition, changed = [];
    for (const i of tiles) {
      if (!Number.isInteger(i) || i < 0 || i >= w.n || stroke.applied.has(i)) continue;
      stroke.applied.add(i);
      if (map.canEdit && !map.canEdit(g, i)) { stroke.locked ??= i; continue; }
      const cost = toolCost(g, tool, i);
      assertToolCost(cost, `${g.map}.tools.${tool.key}.costFor`);
      if (cost > 0 && !g.canAfford(cost)) { stroke.broke = true; continue; }
      const result = tool.apply(g, i, stroke.random, stroke);
      assertToolResult(result, `${g.map}.tools.${tool.key}.apply`);
      if (result === true) {
        g.stats.used ||= {};
        g.stats.used[tool.key] = (g.stats.used[tool.key] || 0) + 1;
        if (cost > 0) g.spend(cost, tool.cat);
        else if (cost < 0) g.earn(-cost, 'salvage');
        this.undo?.touch(i);
        stroke.cost += cost;
        stroke.count++;
        stroke.lastOk = i;
        stroke.changed.push(i);
        changed.push(i);
      } else if (result === 'unsuitable') {
        stroke.unsuitable++;
        stroke.lastBad = i;
      }
    }
    w.renderDirty = true;
    return changed;
  }

  /** Complete a stroke once, refreshing ecology and publishing its outcome. */
  end(stroke) {
    if (!this.current(stroke)) return stroke;
    stroke.finished = true;
    const tool = stroke.tool;
    this.notifyOutcome(stroke);
    if (this.refreshEnvironment && (stroke.count || tool.cat === 'land' || tool.key === 'demolish' || tool.key === 'log')) this.game.refreshEnvironment();
    this.undo?.end(stroke);
    this.game.emit('tool', stroke);
    return stroke;
  }

  /** Apply a complete action to explicit tiles, for scripts and one-off edits. */
  apply(key, tiles, options) {
    const stroke = this.begin(key, options);
    if (!stroke) return null;
    this.applyTiles(stroke, tiles);
    return this.end(stroke);
  }

  notifyOutcome(stroke) {
    const g = this.game, tool = stroke.tool, map = g.mapDefinition;
    if (['trail', 'boardwalk', 'blind'].includes(tool.key) && stroke.count && !g.visitors.facilities().parking && !g.flags.trailHint) {
      g.flags.trailHint = true;
      g.notify('Visitors need a way in: build a Trailhead parking lot right beside a road, then connect your trail to it.', 'warn');
    }
    if (stroke.locked != null && !stroke.count && map.lockedNote) g.notify(map.lockedNote(g, stroke.locked), 'info');
    if (stroke.broke) g.notify('Not enough money. Monthly grants will top up your budget. Healthier land earns bigger grants.', 'warn');
    if (!stroke.count && stroke.unsuitable && tool.species) {
      const plant = this.game.catalog.plant[tool.species[0]];
      const limits = stroke.lastBad != null ? plantLimits(g.world, stroke.lastBad, plant) : [];
      g.notify(`${tool.name} won't survive here${limits.length ? ` (${limits.join(', ')})` : ''}. Green previews show where it will grow.`, 'warn');
      if (map.hardpan && stroke.lastBad != null && g.world.terrain[stroke.lastBad] === T.GRAVEL && !g.flags.hardpanHint) {
        g.flags.hardpanHint = true;
        g.notify(map.text.hardpanHint || 'This is crusted hardpan: rain runs straight off it and seed can\'t root. Break the crust first with Landscape → Loosen soil or Half-moon pits, then sow. Only the Soil builders mix will take on bare crust, slowly.', 'info', {
          x: stroke.lastBad % g.world.w + 0.5, y: Math.floor(stroke.lastBad / g.world.w) + 0.5,
        });
      }
    }
  }
}
