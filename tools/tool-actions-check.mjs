// Player actions must agree across maps, gestures, scripts, money and Undo.
import assert from 'node:assert/strict';
import { Game, WORLD_ARRAYS } from '../js/game.js';
import { BIOME_LIST } from '../js/biome.js';
import { ToolActions } from '../js/tool-actions.js';
import { TOOLS, toolCost } from '../js/tools.js';
import { Undo } from '../js/undo.js';
import { T } from '../js/config.js';

let checks = 0;
const g = new Game();
function check(name, run) { run(); checks++; console.log('PASS ' + name); }
function reset(mode = 'free') { g.newGame(1987, mode, 'standard', 'pnw'); }
function editableTile() { return g.world.terrain.findIndex((t, i) => t !== T.RIVER && g.world.struct[i] < 0); }
function landscape() { return Object.fromEntries(WORLD_ARRAYS.map(key => [key, g.world[key].slice()])); }

for (const map of BIOME_LIST.map(b => b.id)) for (const difficulty of ['relaxed', 'standard', 'challenging']) {
  check(`${map}/${difficulty}: overlapping brush samples charge once and Undo restores terrain`, () => {
    g.newGame(1987, 'free', difficulty, map);
    const undo = new Undo(g), actions = new ToolActions(g, { undo });
    const i = editableTile(), x = i % g.world.w, y = Math.floor(i / g.world.w);
    const height = g.world.vh.slice(), balance = g.money, price = toolCost(g, TOOLS.raise, i);
    const stroke = actions.begin('raise');
    actions.paint(stroke, x, y, 0);
    actions.paint(stroke, x, y, 0);
    actions.end(stroke); actions.end(stroke);
    assert.equal(stroke.count, 1);
    assert.equal(g.money, balance - price);
    assert.equal(g.stats.used.raise, 1);
    assert.equal(g.ledger.out.land, price);
    assert.notDeepEqual(g.world.vh, height);
    assert.equal(undo.stack.length, 1);
    assert.ok(undo.undo());
    assert.deepEqual(g.world.vh, height);
    assert.equal(g.money, balance);
    assert.equal(g.stats.used.raise, 0);
  });
}

check('Unaffordable and invalid edits leave the landscape and money untouched', () => {
  reset();
  const i = editableTile(), undo = new Undo(g), actions = new ToolActions(g, { undo });
  g.money = toolCost(g, TOOLS.raise, i) - 1;
  const before = landscape(), balance = g.money;
  const stroke = actions.apply('raise', [-1, g.world.n, 0.5, i, i]);
  assert.equal(stroke.count, 0);
  assert.equal(stroke.broke, true);
  assert.equal(g.money, balance);
  assert.deepEqual(landscape(), before);
  assert.equal(undo.stack.length, 0);
});

check('Campaign eligibility is enforced by the shared action path', () => {
  reset('campaign');
  const actions = new ToolActions(g), before = landscape(), balance = g.money;
  assert.ok(actions.apply('raise', [editableTile()]) === null);
  assert.ok(actions.begin('not-a-tool') === null);
  assert.deepEqual(landscape(), before);
  assert.equal(g.money, balance);
  assert.ok(actions.begin('rip'));
});

check('A building is paid for once and its complete footprint is restored by Undo', () => {
  reset();
  const w = g.world, x = 10, y = 20;
  for (let yy = y - 1; yy <= y + 3; yy++) for (let xx = x - 1; xx <= x + 3; xx++) {
    const i = w.idx(xx, yy); w.terrain[i] = T.SOIL; w.struct[i] = -1; w.feature[i] = 0; w.clearPlants(i);
  }
  w.terrain[w.idx(x - 1, y)] = T.ROAD;
  g.refreshEnvironment();
  const before = landscape(), balance = g.money, undo = new Undo(g);
  const actions = new ToolActions(g, { undo });
  assert.equal(actions.apply('build_parking', [w.idx(x, y)]).count, 1);
  assert.equal(g.money, balance - TOOLS.build_parking.cost);
  const structure = w.struct[w.idx(x, y)];
  for (let yy = y; yy < y + 2; yy++) for (let xx = x; xx < x + 2; xx++) assert.equal(w.struct[w.idx(xx, yy)], structure);
  assert.ok(undo.undo());
  assert.equal(g.money, balance);
  assert.deepEqual(landscape(), before);
});

check('Demolition books salvage as income and Undo reverses the same payment', () => {
  reset();
  const w = g.world, i = editableTile(), x = i % w.w, y = Math.floor(i / w.w);
  w.addStructure('tractor', x, y);
  const undo = new Undo(g), actions = new ToolActions(g, { undo }), balance = g.money;
  const stroke = actions.apply('demolish', [i]);
  assert.equal(stroke.count, 1);
  assert.ok(stroke.cost < 0);
  assert.equal(g.money, balance - stroke.cost);
  assert.equal(g.ledger.in.salvage, -stroke.cost);
  assert.ok(undo.undo());
  assert.equal(g.money, balance);
  assert.equal(w.structures[w.struct[i]].type, 'tractor');
});

check('Gestures and explicit scripted tiles produce the same paid landscape edit', () => {
  reset();
  const i = editableTile(), x = i % g.world.w, y = Math.floor(i / g.world.w), before = g.saveData();
  const actions = new ToolActions(g), stroke = actions.begin('raise');
  actions.paint(stroke, x, y, 1); actions.end(stroke);
  const result = { arrays: landscape(), money: g.money, stats: structuredClone(g.stats), ledger: structuredClone(g.ledger) };
  assert.ok(g.restoreSave(before));
  actions.apply('raise', stroke.changed);
  assert.deepEqual({ arrays: landscape(), money: g.money, stats: g.stats, ledger: g.ledger }, result);
});

check('Finishing publishes one completed action and refreshes ecology once', () => {
  reset();
  const actions = new ToolActions(g), i = editableTile(), events = [];
  const refresh = g.refreshEnvironment.bind(g); let refreshes = 0;
  g.refreshEnvironment = () => { refreshes++; refresh(); };
  const listen = stroke => events.push(stroke);
  g.on('tool', listen);
  try {
    const stroke = actions.begin('raise');
    actions.applyTiles(stroke, [i]); actions.applyTiles(stroke, [i]);
    assert.equal(refreshes, 0);
    actions.end(stroke); actions.end(stroke);
    assert.equal(refreshes, 1);
    assert.deepEqual(events, [stroke]);
  } finally {
    g.refreshEnvironment = refresh;
    g.listeners.tool = g.listeners.tool.filter(fn => fn !== listen);
  }
});

check('A stroke from a replaced world cannot edit the new farm', () => {
  reset();
  const actions = new ToolActions(g), stroke = actions.begin('raise'), i = editableTile();
  g.newGame(2);
  const before = landscape(), balance = g.money;
  assert.deepEqual(actions.applyTiles(stroke, [i]), []);
  actions.end(stroke);
  assert.deepEqual(landscape(), before);
  assert.equal(g.money, balance);
});

console.log(`${checks} shared player-action checks passed.`);
