// Run: node tools/brush-size-check.mjs
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
globalThis.window = { innerWidth: 1280, innerHeight: 800, addEventListener() {} };
const { Input } = await import('../js/input.js');
const { Game } = await import('../js/game.js');
const { TOOLS, BRUSH_SIZES, strokeTiles } = await import('../js/tools.js');

const g = new Game();
g.newGame(1987, 'free');
g.money = 1e9;
const input = Object.create(Input.prototype);
input.game = g;
input.mouse = { x: 400, y: 300 };
input.pick = () => ({ x: 30, y: 50 });
input.tip = { classList: { add() {}, remove() {} }, style: {}, offsetWidth: 100, offsetHeight: 20 };
input.r = { markTileDirty() {} };
input.ui = { state: { tool: 'rip', clean: false }, undo: { touch() {} } };

for (const radius of BRUSH_SIZES) {
  input.ui.state.brushR = radius;
  input.updateHover();
  const expected = strokeTiles(g.world, TOOLS.rip, 30, 50, radius);
  assert.deepEqual(input.ui.state.previewTiles.map(p => p.i), expected);
  // Moments and photo mode both hide the tool through clean state, for many frames.
  for (let interruption = 0; interruption < 2; interruption++) {
    input.ui.state.clean = true;
    for (let frame = 0; frame < 10; frame++) input.updateHover();
    assert.equal(input.tool(), null);
    assert.equal(input.ui.state.previewTiles, null);
    assert.equal(input.ui.state.brushR, radius, 'hidden tool preserves selected radius');
    input.ui.state.clean = false;
    input.updateHover();
    assert.deepEqual(input.ui.state.previewTiles.map(p => p.i), expected, 'preview resumes at selected size');
    input.stroke = { tool: TOOLS.rip, applied: new Set(), cost: 0, count: 0 };
    input.applyAt(30, 50);
    assert.deepEqual([...input.stroke.applied], expected, 'painting uses the same footprint as the preview');
    input.stroke = null;
  }
}
// Inspect has no active tool either, and must not silently edit the brush choice.
input.ui.state.tool = null;
input.ui.state.brushR = 5;
input.updateHover();
assert.equal(input.ui.state.brushR, 5);
assert.equal(input.ui.state.previewTiles, null);
console.log('All brush sizes preserve preview and painting footprints after moments, photo mode and inactive tools.');
