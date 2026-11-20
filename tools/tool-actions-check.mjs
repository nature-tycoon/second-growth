// Player actions must agree across maps, gestures, scripts, money and Undo.
import assert from 'node:assert/strict';
import { Game, WORLD_ARRAYS } from '../js/game.js';
import { BIOME_LIST } from '../js/biome.js';
import { ToolActions, refusal } from '../js/tool-actions.js';
import { TOOLS, toolCost, naturalFeature } from '../js/tools.js';
import { Undo } from '../js/undo.js';
import { removeTree, plantSuit } from '../js/sim/plants.js';
import { T, F, PLACED, LAID, isWater } from '../js/config.js';
import { shiftGround } from '../js/terrain-edit.js';

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

for (const map of BIOME_LIST.map(b => b.id)) check(`${map}: Demolish takes up laid gravel only, Fill & grade keeps all gravel, and a save keeps which is which`, () => {
  g.newGame(1987, 'free', 'standard', map);
  const w = g.world, open = i => w.struct[i] < 0 && w.feature[i] !== F.CULVERT && !w.feature[i] && (!g.mapDefinition.canEdit || g.mapDefinition.canEdit(g, i));
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
    if (!g.catalog.tools.fill) return;
    new ToolActions(g).apply('fill', [...natural.slice(0, 40), ...laid.slice(0, 5)]);
    assert.ok([...natural, ...laid].every(i => g.world.terrain[i] === T.GRAVEL), `${map}: Fill & grade took up gravel`);
    if (laid.length) assert.ok(notes.some(n => n.includes('Demolish')), notes.join(' | '));
    if (laid.length) {
      const some = laid.slice(0, 5), balance = g.money;
      for (const i of some) assert.equal(toolCost(g, g.catalog.tools.demolish, i), 15);
      const undo = new Undo(g), s = new ToolActions(g, { undo }).apply('demolish', some);
      assert.equal(s.count, some.length);
      assert.equal(g.money, balance - 15 * some.length);
      assert.ok(some.every(i => g.world.terrain[i] === T.SOIL && !(g.world.marks[i] & LAID)));
      assert.ok(undo.undo());
      assert.ok(some.every(i => g.world.terrain[i] === T.GRAVEL && g.world.marks[i] & LAID), `${map}: Undo didn't put the gravel lot back`);
    }
    if (natural.length) {
      const s = new ToolActions(g).apply('demolish', natural.slice(0, 40));
      assert.equal(s.count, 0);
      assert.ok(natural.every(i => g.world.terrain[i] === T.GRAVEL), `${map}: Demolish took up natural gravel`);
    }
  } finally { g.notify = notify; }
});

// Roads are like gravel lots (Cole, 2026-11-15): Fill & grade levels a road but keeps it, with the same
// one-time hint pointing to Demolish, which takes it up (except the suburb's streets, which stay)
for (const map of BIOME_LIST.map(b => b.id)) check(`${map}: Fill & grade levels a road but keeps it; Demolish takes it up`, () => {
  g.newGame(1987, 'free', 'standard', map);
  const w = g.world, tools = g.catalog.tools;
  if (!tools.fill) return;
  const canEdit = i => !g.mapDefinition.canEdit || g.mapDefinition.canEdit(g, i);
  const roads = [];
  for (let i = 0; i < w.n && roads.length < 30; i++) if (w.terrain[i] === T.ROAD && !w.feature[i] && w.struct[i] < 0 && canEdit(i)) roads.push(i);
  if (!roads.length) return;
  const notes = [], notify = g.notify;
  g.notify = text => notes.push(text);
  try {
    // (a bump in the road, so there is something to level)
    const r = roads[Math.min(roads.length - 1, 5)];
    shiftGround(w, r, 0.4);
    new ToolActions(g).apply('fill', roads);
    assert.ok(roads.every(i => w.terrain[i] === T.ROAD), `${map}: Fill & grade took up a road`);
    if (g.mapDefinition.fixedRoads) return;
    const c = w.corners(r % w.w, (r / w.w) | 0);
    assert.ok(Math.max(...c) - Math.min(...c) < 1e-6, `${map}: Fill & grade didn't level the road`);
    assert.ok(notes.some(n => n.includes('roads') && n.includes('Demolish')), `${map}: no Demolish hint: ${notes.join(' | ')}`);
    const n = notes.length;
    new ToolActions(g).apply('fill', roads);
    assert.equal(notes.filter(t => t.includes('Demolish')).length, notes.slice(0, n).filter(t => t.includes('Demolish')).length, 'the hint shows once');
    const s = new ToolActions(g).apply('demolish', roads.slice(0, 3));
    assert.equal(s.count, 3);
    assert.ok(roads.slice(0, 3).every(i => w.terrain[i] === T.SOIL), `${map}: Demolish left the road`);
  } finally { g.notify = notify; }
});

// Fill & grade leaves one level across the stroke: every corner of every graded tile at the height
// where the stroke started, unless it's shared with other water or a building (which never move)
for (const map of BIOME_LIST.map(b => b.id)) check(`${map}: Fill & grade levels a stroke to the height where it starts`, () => {
  g.newGame(1987, 'free', 'standard', map);
  const w = g.world, tools = g.catalog.tools;
  if (!tools.fill) return;
  const canEdit = i => !g.mapDefinition.canEdit || g.mapDefinition.canEdit(g, i);
  const dry = (x, y) => { for (let dy = -3; dy <= 3; dy++) for (let dx = -4; dx <= 4; dx++) { if (!w.inb(x + dx, y + dy)) return false; const j = w.idx(x + dx, y + dy); if (isWater(w.terrain[j]) || w.struct[j] >= 0 || w.terrain[j] === T.ROAD || !canEdit(j)) return false; } return true; };
  // the steepest dry patch the map has (the stroke and the ring round it), so the stroke cuts and fills
  let best = null, relief = 0;
  for (let y = 4; y < w.h - 4; y += 3) for (let x = 4; x < w.w - 4; x += 3) {
    if (!dry(x, y)) continue;
    const r = Math.abs(w.tileH(x + 2, y) - w.tileH(x - 2, y)) + Math.abs(w.tileH(x, y + 2) - w.tileH(x, y - 2));
    if (r > relief && r < 2) { relief = r; best = [x, y]; }
  }
  assert.ok(best, `${map}: no dry patch to grade`);
  const [cx, cy] = best, level = w.tileH(cx - 2, cy), vh = w.vh.slice(), balance = g.money;
  const undo = new Undo(g), actions = new ToolActions(g, { undo }), stroke = actions.begin('fill');
  for (let x = cx - 2; x <= cx + 2; x++) actions.paint(stroke, x, cy, 1);
  actions.end(stroke);
  assert.ok(stroke.count > 0, `${map}: nothing was graded`);
  let off = 0;
  for (const i of stroke.changed) for (const h of w.corners(i % w.w, (i / w.w) | 0)) off = Math.max(off, Math.abs(h - level));
  assert.ok(off < 1e-6, `${map}: a graded corner stands ${off.toFixed(3)} levels off the stroke's level`);
  assert.ok(g.money < balance || g.sandbox);
  assert.ok(undo.undo());
  assert.deepEqual(w.vh, vh);
});

// Grading beside water never moves that water's corners, and filled water stands dry
check('pnw: Fill & grade beside a creek leaves the creek, and a filled pond tile stands dry above the water', () => {
  g.newGame(1987, 'free', 'standard', 'pnw');
  const w = g.world;
  const i = w.terrain.findIndex((t, j) => t === T.CREEK && [1, -1, w.w, -w.w].some(d => !isWater(w.terrain[j + d]) && w.terrain[j + d] !== T.ROAD && w.struct[j + d] < 0));
  assert.ok(i >= 0);
  const x = i % w.w, y = (i / w.w) | 0, creek = w.corners(x, y);
  const land = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy]).filter(([xx, yy]) => w.inb(xx, yy) && !isWater(w.terrain[w.idx(xx, yy)]));
  const actions = new ToolActions(g);
  for (const [lx, ly] of land) {
    // (a stroke started a level above or below the bank, either way the creek's own corners hold)
    for (const shift of [0.6, -0.6]) {
      const s = actions.begin('fill');
      shiftGround(w, w.idx(lx + (lx - x) * 2, ly + (ly - y) * 2), shift * 2);
      actions.paint(s, lx + (lx - x) * 2, ly + (ly - y) * 2, 2);
      actions.end(s);
      assert.deepEqual(w.corners(x, y), creek, 'grading moved the creek bed');
    }
  }
  const p = w.terrain.findIndex(t => t === T.POND), px = p % w.w, py = (p / w.w) | 0;
  const surface = Math.min(...w.corners(px, py)) + 0.4;
  actions.apply('fill', [p]);
  assert.equal(w.terrain[p], T.SOIL);
  // (its corners shared with the rest of the pond come up with it, so it stands dry, not as a marsh)
  assert.ok(Math.min(...w.corners(px, py)) > surface, 'a filled pond tile sits under the pond\'s water');
});

console.log(`${checks} shared player-action checks passed.`);
