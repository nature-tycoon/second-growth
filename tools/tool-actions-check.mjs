// Player actions must agree across maps, gestures, scripts, money and Undo.
import assert from 'node:assert/strict';
import { Game, WORLD_ARRAYS } from '../js/game.js';
import { BIOME_LIST } from '../js/biome.js';
import { ToolActions, refusal } from '../js/tool-actions.js';
import { TOOLS, toolCost, naturalFeature } from '../js/tools.js';
import { Undo } from '../js/undo.js';
import { removeTree, plantSuit } from '../js/sim/plants.js';
import { T, F, PLACED, LAID } from '../js/config.js';

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

// Demolish takes out what people built or placed, never deadwood or rock nature left behind
for (const map of BIOME_LIST.map(b => b.id)) check(`${map}: Demolish leaves natural deadwood and rock, and takes out placed features`, () => {
  g.newGame(1987, 'free', 'standard', map);
  const w = g.world, tools = g.catalog.tools, canEdit = i => !g.mapDefinition.canEdit || g.mapDefinition.canEdit(g, i);
  const open = i => canEdit(i) && w.struct[i] < 0 && !w.feature[i] && !w.tree[i] && w.terrain[i] !== T.ROAD && w.terrain[i] !== T.RIVER && w.terrain[i] !== T.POND && w.terrain[i] !== T.CREEK && w.terrain[i] !== T.MARSH;
  // add natural deadwood (as fire, windthrow and dying trees leave it) to whatever the map started with
  let k = 0;
  for (let i = 0; i < w.n && k < 5; i++) if (open(i)) w.feature[i] = [F.SNAG, F.LOG, F.STUMP, F.ROCKS, F.BRUSH][k++];
  const natural = [];
  for (let i = 0; i < w.n; i++) if (naturalFeature(w, i) && canEdit(i)) natural.push(i);
  assert.ok(natural.length >= 5);
  for (const i of natural) assert.equal(toolCost(g, tools.demolish, i), 0);
  const features = w.feature.slice(), balance = g.money, actions = new ToolActions(g, { undo: new Undo(g) });
  const stroke = actions.apply('demolish', natural);
  assert.equal(stroke.count, 0);
  assert.deepEqual(w.feature, features);
  assert.equal(g.money, balance);
  // a feature the player placed can come out again, and Undo puts it back as theirs
  for (const key of ['snag', 'log', 'rocks', 'brush', 'nestbox'].filter(key => tools[key])) {
    const i = w.feature.findIndex((f, j) => open(j) && !(w.marks[j] & PLACED) && !w.shrub[j]);
    const undo = new Undo(g), act = new ToolActions(g, { undo });
    assert.equal(act.apply(key, [i]).count, 1, `${key} placed`);
    assert.ok(!naturalFeature(w, i));
    assert.ok(toolCost(g, tools.demolish, i) > 0);
    assert.equal(act.apply('demolish', [i]).count, 1, `${key} demolished`);
    assert.equal(w.feature[i], 0);
    assert.equal(w.marks[i] & PLACED, 0);
    assert.ok(undo.undo());
    assert.ok(w.feature[i] && (w.marks[i] & PLACED));
  }
  // a tree that dies on a tile where a placed log once rotted away leaves natural deadwood
  const j = w.feature.findIndex((f, i) => open(i));
  w.marks[j] |= PLACED; w.tree[j] = 1; w.treeG[j] = 1;
  removeTree(w, j, 'age', () => 0);
  if (w.feature[j]) assert.ok(naturalFeature(w, j)); // (the reef's dead coral leaves rubble, not deadwood)
});

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

// The cursor tip and the refused stroke's warning share one reason: why the tool fails and what suits the spot
check('A refused planting names its limits and a tool that suits the spot, in the warning and for the cursor tip', () => {
  reset();
  const w = g.world, tool = g.catalog.tools.mix_meadow, plants = tool.species.map(k => g.catalog.plant[k]);
  const i = [...w.terrain.keys()].find(j => !w.ground[j] && w.struct[j] < 0 && Math.max(...plants.map(p => plantSuit(w, j, p))) <= 0.2 && refusal(g, j, tool).better);
  assert.ok(i != null, 'a bare tile meadow mix is refused on but another groundcover suits');
  const { limits, better } = refusal(g, i, tool);
  assert.ok(limits.length);
  assert.notEqual(better, tool);
  assert.ok(better.species.some(k => plantSuit(w, i, g.catalog.plant[k]) > 0.2));
  const notes = [], notify = g.notify;
  g.notify = (text, ...rest) => { notes.push(text); return notify.call(g, text, ...rest); };
  try { new ToolActions(g).apply('mix_meadow', [i], { random: () => 0 }); } finally { g.notify = notify; }
  assert.ok(notes.some(n => n.includes(limits[0]) && n.includes(`try ${better.name}`)), notes.join(' | '));
});

for (const map of BIOME_LIST.map(b => b.id)) check(`${map}: Fill & grade rips up laid gravel only, and a save keeps which is which`, () => {
  g.newGame(1987, 'free', 'standard', map);
  const w = g.world, open = i => w.struct[i] < 0 && w.feature[i] !== F.CULVERT;
  const natural = [], laid = [];
  for (let i = 0; i < w.n; i++) if (w.terrain[i] === T.GRAVEL && open(i)) (w.marks[i] & LAID ? laid : natural).push(i);
  // (a loaded save takes its marks from the map as generated, so an older save without them gets them too)
  const data = structuredClone(g.saveData());
  for (const i of laid) w.marks[i] &= ~LAID;
  assert.ok(g.restoreSave(data));
  for (const i of laid) assert.ok(g.world.marks[i] & LAID, `${map}: laid gravel lost its mark on load`);
  const notes = [], notify = g.notify;
  g.notify = text => notes.push(text);
  try {
    if (natural.length) {
      const s = new ToolActions(g).apply('fill', natural.slice(0, 40));
      assert.equal(s.count, 0);
      assert.ok(natural.every(i => g.world.terrain[i] === T.GRAVEL), `${map}: natural gravel was filled`);
      assert.ok(notes.some(n => n.includes('gravel people laid')), notes.join(' | '));
    }
    if (laid.length) {
      const s = new ToolActions(g).apply('fill', laid.slice(0, 5));
      assert.equal(s.count, Math.min(5, laid.length));
      assert.ok(laid.slice(0, 5).every(i => g.world.terrain[i] === T.SOIL));
    }
  } finally { g.notify = notify; }
});

console.log(`${checks} shared player-action checks passed.`);
