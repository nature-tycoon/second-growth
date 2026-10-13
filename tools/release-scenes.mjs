// Deterministic reference scenes using the production renderer and simulation.
// Only this test page freezes animation; production gameplay stays unchanged.
import { Renderer } from '../js/render3d/scene.js';
import { ANIMALS } from '../js/data/animals.js';
import { renderPortrait } from '../js/render3d/portraits.js';
import { T } from '../js/config.js';
import { releaseGame } from './release-fixtures.mjs';
import { TOOLS } from '../js/tools.js';
import { ToolActions } from '../js/tool-actions.js';
import { Undo } from '../js/undo.js';

const params = new URLSearchParams(location.search), map = params.get('map') || 'pnw';
const kind = params.get('scene') || 'forest', quality = params.get('quality') || 'fast';
window.releaseScene = { ready: false, map, kind, quality };
try {
  const { game, legend, center } = releaseGame(map, kind), w = game.world;
  const renderer = new Renderer(document.getElementById('view'), { preserveDrawingBuffer: true });
  renderer.applySettings({ quality, qualityChosen: true, shadows: true, wind: false, dayCycle: false, weather: false });
  renderer.autoRes = false;
  renderer.time = 17;
  renderer.az = renderer.azTarget = kind === 'animals' ? 0 : Math.PI / 4;
  renderer.zoom = kind === 'animals' ? .43 : kind === 'herd' ? .65 : .7;
  renderer.centerOn(...center); renderer.updateCamera();
  const ui = { clean: true, overlay: 'none' };
  // Keep CPU/GPU comparisons free of random overlay particles while exercising real 3D drawing.
  renderer.drawFX = () => renderer.ux.clearRect(0, 0, renderer.ui.width, renderer.ui.height);
  const gl = renderer.gl.getContext();
  const finish = () => gl.finish();
  const draw = () => { renderer.draw(game, ui, 0); finish(); };
  for (let n = 0; n < 4; n++) draw();
  // Production field-guide portraits make every adult appearance readable at inspection scale.
  // The actual world gallery still supplies rendering/work budgets and restore checks.
  let contact = null, portraits = [];
  if (kind === 'animals') {
    portraits = ANIMALS.flatMap(def => [{ def, species: def.key, stage: 'adult' }, ...(def.sprite.male ? [{ def: { ...def, sprite: { ...def.sprite, ...def.sprite.male } }, species: def.key, stage: 'male' }] : [])]);
    contact = document.createElement('canvas'); contact.width = 960; contact.height = Math.ceil(portraits.length / 6) * 120;
    const ctx = contact.getContext('2d'); ctx.fillStyle = '#edf0e8'; ctx.fillRect(0, 0, contact.width, contact.height);
    portraits.forEach(({ def }, n) => ctx.drawImage(renderPortrait(def), n % 6 * 160, Math.floor(n / 6) * 120, 160, 120));
  }
  const imageSource = () => contact || renderer.canvas;
  const snapshot = () => { draw(); return imageSource().toDataURL('image/png'); };
  const metrics = () => ({ ...renderer.perfSample(false), geometries: renderer.gl.info.memory.geometries, textures: renderer.gl.info.memory.textures, animals: game.wildlife.agents.length });
  async function compare(reference) {
    const image = new Image(); image.src = reference; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = imageSource().width; canvas.height = imageSource().height;
    if (image.width !== canvas.width || image.height !== canvas.height) throw new Error('Reference image dimensions changed');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0); const before = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    draw(); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(imageSource(), 0, 0);
    const after = ctx.getImageData(0, 0, canvas.width, canvas.height), diff = ctx.createImageData(canvas.width, canvas.height);
    let changed = 0, total = 0;
    for (let i = 0; i < before.length; i += 4) {
      const d = Math.max(...[0, 1, 2, 3].map(c => Math.abs(before[i + c] - after.data[i + c])));
      total += d;
      if (d > 16) { changed++; diff.data.set([255, 50, 80, 255], i); }
      else diff.data.set([after.data[i] / 3, after.data[i + 1] / 3, after.data[i + 2] / 3, 255], i);
    }
    ctx.putImageData(diff, 0, 0);
    return { changedFraction: changed / (canvas.width * canvas.height), meanDifference: total / (canvas.width * canvas.height), diff: canvas.toDataURL('image/png') };
  }
  // Production tool, undo, save/restore and rendering must agree after a world replacement.
  function interactions() {
    const undo = new Undo(game), before = game.saveData(), money = game.money;
    const i = w.terrain.findIndex((t, i) => t !== T.RIVER && w.struct[i] < 0), tool = TOOLS.raise;
    const actions = new ToolActions(game, { undo });
    if (actions.apply(tool, [i], { random: game.rng }).count !== 1) throw new Error('Landscape tool failed');
    renderer.markTileDirty(); draw();
    if (!undo.undo(renderer) || game.money !== money) throw new Error('Landscape undo failed');
    if (!game.restoreSave(before)) throw new Error('World restore failed');
    draw();
    if (gl.getError() !== gl.NO_ERROR) throw new Error('World restore left a WebGL error');
    for (const pose of renderer.actors.pose.values()) if (![pose.x, pose.y, pose.z].every(Number.isFinite)) throw new Error('Invalid drawn animal after restore');
    return true;
  }
  window.releaseScene = { ready: true, map, kind, quality, legend, portraits: portraits.map(({ species, stage }) => ({ species, stage })), snapshot, compare, metrics, interactions, game, renderer };
} catch (error) { window.releaseScene = { ready: true, map, kind, quality, error: error.stack || String(error) }; throw error; }
