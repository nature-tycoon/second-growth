// Shared player-action lifecycle. Controls and scripted players use the same
// tool rules, prices, bookkeeping and completion work. Drawing stays with the UI.
import { T, DAYS_PER_MONTH, money } from './config.js';
import { monthlyGrant } from './sim/goals.js';
import { strokeTiles, toolCost } from './tools.js';
import { plantLimits, plantSuit } from './sim/plants.js';
import { toolUnlocked } from './sim/campaign.js';
import { assertToolCost, assertToolResult } from './data/contracts.js';
import { simRandom } from './sim/sim-random.js';
import { steerCourse, finishCourse, creekEndHeading } from './maps/water-shape.js';
import { shapeShoreNear } from './terrain-edit.js';

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
  begin(key, { random = simRandom } = {}) { // (the sim's stream: which plants a stroke places is simulation)
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
    // (a creek follows the stroke the way water would cut it, bending no tighter than a creek does: 0054)
    if (stroke.tool.course) {
      const end = stroke.course ? null : creekEndHeading(w, x, y);
      const r = end ? steerCourse(null, end.at[0], end.at[1], undefined, end.heading) : steerCourse(stroke.course, x, y);
      if (end) Object.assign(r, steerCourse(r.head, x, y)); // (from the creek's end, on to where the stroke starts)
      stroke.course = r.head;
      return this.applyTiles(stroke, r.tiles.filter(([tx, ty]) => w.inb(tx, ty)).map(([tx, ty]) => w.idx(tx, ty)));
    }
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
    // (a creek's head runs a few tiles behind the stroke: it runs on to the stroke's end now)
    if (stroke.tool.course && stroke.course) {
      const w = stroke.world, r = finishCourse(stroke.course);
      stroke.course = r.head;
      const tiles = r.tiles.filter(([tx, ty]) => w.inb(tx, ty)).map(([tx, ty]) => w.idx(tx, ty));
      this.applyTiles(stroke, tiles);
      // (it stopped short: the stroke's end was behind it or inside the tightest turn; the UI says so once)
      const goal = r.head.trail.at(-1);
      stroke.stoppedShort = Math.hypot(goal[0] - r.head.x, goal[1] - r.head.y) > 2;
    }
    stroke.finished = true;
    const tool = stroke.tool;
    // (the shores the stroke reached follow a smooth line again, not the tiles' steps: 0054)
    if (tool.cat === 'land' && stroke.changed.length) {
      stroke.shaped = shapeShoreNear(stroke.world, stroke.changed, tool.key === 'fill' ? stroke.changed : null);
      if (stroke.shaped.length) stroke.world.hydroDirty = true;
    }
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
    // (Fill & grade levels roads and gravel but leaves them: a road or gravel lot comes up with Demolish, a crust with Loosen soil)
    if ((stroke.laidGravel != null || stroke.road != null) && !g.flags.gravelGradeHint) { g.flags.gravelGradeHint = true; g.notify('Fill & grade levels roads and gravel but leaves them in place. To take up a road or a gravel lot people laid, use Remove → Demolish.', 'info'); }
    if (stroke.gravel != null && map.hardpan && !g.flags.crustGradeHint) { g.flags.crustGradeHint = true; g.notify('Fill & grade levels the crust but doesn\'t break it. To break it, use Loosen soil or Half-moon pits.', 'info'); }
    if (stroke.creek != null && !stroke.count && !g.flags.creekShapeHint) { g.flags.creekShapeHint = true; g.notify(map.text.creekShapeHint || 'Raise and Lower leave creeks alone, so their fish can still swim them. To move a creek, fill it with Fill & grade and dig it again.', 'info'); }
    if (stroke.steep != null && !g.flags.steepGradeHint) {
      g.flags.steepGradeHint = true;
      g.notify('Fill & grade levels everything to the height where your stroke starts, and stops where the ground is more than a few metres higher or lower. Start a new stroke there to grade it at its own level.', 'info');
    }
    if (stroke.broke) g.notify(brokeLine(g), 'warn');
    if (!stroke.count && stroke.unsuitable && tool.species) {
      const { limits, better } = stroke.lastBad != null ? refusal(g, stroke.lastBad, tool) : { limits: [], better: null };
      // (the tool that suits comes before the reasons: a phone shows two lines of a warning)
      const why = limits.length ? ` (${limits.join(', ')})` : '';
      g.notify(better ? `${tool.name} won't survive here: try ${better.name}${why}.` : `${tool.name} won't survive here${why}. Green previews show where it will grow.`, 'warn');
      if (map.hardpan && stroke.lastBad != null && g.world.terrain[stroke.lastBad] === T.GRAVEL && !g.flags.hardpanHint) {
        g.flags.hardpanHint = true;
        g.notify(map.text.hardpanHint || 'This is crusted hardpan: rain runs straight off it and seed can\'t root. Break the crust first with Landscape → Loosen soil or Half-moon pits, then sow. Only the Soil builders mix will take on bare crust, slowly.', 'info', {
          x: stroke.lastBad % g.world.w + 0.5, y: Math.floor(stroke.lastBad / g.world.w) + 0.5,
        });
      }
    }
  }
}

// A stroke refused for money: when money comes next and what earns it, in one line. The grant is
// paid as each month closes (Game.monthWork); sales and donations last month say what else comes in;
// the nearest open goal is the bigger payout. Ran through a refused stroke, not the sim.
const EARNERS = { visitors: 'visitor donations', palms: 'palm fruit sales', fruit: 'fruit sales', coop: 'co-op sales' };
export function brokeLine(g) {
  const days = DAYS_PER_MONTH - (g.day % DAYS_PER_MONTH);
  const grant = Math.round(monthlyGrant(g, g.cache.score?.total ?? 0) * (g.mapDefinition.grantScale ?? 1) * g.diff.grants);
  const sales = Object.entries(g.lastLedger?.in || {}).filter(([k, v]) => EARNERS[k] && v > 0).sort((a, b) => b[1] - a[1])[0];
  const goal = g.catalog.goals.find(x => !g.goalsDone[x.key] && !x.chain) || g.catalog.goals.find(x => !g.goalsDone[x.key]);
  return `Not enough money. Next grant: about ${money(grant)} in ${days} ${days === 1 ? 'day' : 'days'}` +
    (sales ? `, plus ${EARNERS[sales[0]]} (${money(sales[1])} last month)` : '') + '.' +
    (goal ? ` Goals pay more: ${goal.name}, ${money(g.goalReward(goal.reward))}.` : '');
}

// Why a planting tool is refused on tile i (plantLimits of its first plant) and the unlocked tool
// that would grow there instead: the after-stroke warning and the brush cursor tip both say it.
export function refusal(g, i, tool) {
  return { limits: plantLimits(g.world, i, g.catalog.plant[tool.species[0]]), better: suitedTool(g, i, tool) };
}

// The unlocked planting tool of the same layer (groundcover, shrub or tree) that suits tile i best,
// as plantTool judges a seed (suitability over 0.2), or null. Lawn suits nothing until it's lifted.
function suitedTool(g, i, tool) {
  const w = g.world, layer = g.catalog.plant[tool.species[0]].layer;
  if (w.ground[i] && g.catalog.plants[w.ground[i]]?.sod) return null;
  let best = null, bestSuit = 0.2;
  for (const t of Object.values(g.catalog.tools)) {
    if (t === tool || !t.species?.length || !toolUnlocked(g, t.key)) continue;
    const plants = t.species.map(k => g.catalog.plant[k]);
    if (plants[0]?.layer !== layer) continue;
    const suit = Math.max(...plants.map(p => plantSuit(w, i, p)));
    if (suit > bestSuit) { best = t; bestSuit = suit; }
  }
  return best;
}
