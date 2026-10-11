// Instrument the live main.js loop, retaining input, overlays and DOM interface work.
import { releaseGame } from './release-fixtures.mjs';
import { TOOLS, toolCost } from '../js/tools.js';
import { PLANTS } from '../js/data/plants.js';

const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))];
export async function measureGameplay({ map, scene, optimizations }) {
  const { game, renderer, ui } = window.secondGrowth;
  const fixture = releaseGame(map, scene);
  if (!game.restoreSave(fixture.game.saveData())) throw new Error('Gameplay fixture restore failed');
  game.speed = 3; game.autosave = false;
  if (ui.modalOpen) ui.closeModal();
  ui.afterNewGame(); ui.refreshTop(true);
  renderer.applySettings({ quality: 'fast', qualityChosen: true, shadows: true, wind: true, weather: true, dayCycle: false });
  if (optimizations) renderer.flora.setOptimizations(optimizations);
  renderer.autoRes = false; renderer.zoom = scene === 'herd' ? .65 : .7;
  renderer.centerOn(...fixture.center); renderer.updateCamera();
  const original = { update: game.update, draw: renderer.draw, frame: ui.frame };
  const gl = renderer.gl.getContext(), frames = [], simulation = [], drawing = [], interfaceMs = [], gaps = [];
  let n = 0, started, previous, simMs, renderMs;
  const began = performance.now();
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Live gameplay measurement timed out')), 90000);
      const fail = error => { clearTimeout(timeout); reject(error); };
      game.update = function () {
        try {
          started = performance.now();
          if (previous != null && n >= 12) gaps.push(started - previous); previous = started;
          if (scene === 'planting' && n % 12 === 0) {
            const i = game.world.idx(42 + Math.floor(n / 12), 32), clear = TOOLS.clear;
            const cost = toolCost(game, clear, i);
            if (clear.apply(game, i, game.rng) === true) game.spend(cost, clear.cat);
            const p = PLANTS.find(p => p?.native && p.layer === 0 && !p.invasive);
            if (p) {
              const plant = TOOLS['plant_' + p.key], cost = toolCost(game, plant, i);
              if (plant.apply(game, i, () => 0) === true) game.spend(cost, plant.cat);
            }
            renderer.markTileDirty(); game.refreshEnvironment();
          }
          renderer.target.x = fixture.center[0] + Math.sin(n / 20) * 3;
          renderer.updateCamera();
          // Fixed simulated time makes the amount of ecology work repeatable on slower GPUs.
          const at = performance.now(); original.update.call(this, 1 / 30); simMs = performance.now() - at;
        } catch (error) { fail(error); throw error; }
      };
      renderer.draw = function (...args) {
        try {
          const at = performance.now(); original.draw.apply(this, args); gl.finish(); renderMs = performance.now() - at;
        } catch (error) { fail(error); throw error; }
      };
      ui.frame = function (...args) {
        try {
          const at = performance.now(); original.frame.apply(this, args);
          if (n >= 12) { frames.push(performance.now() - started); simulation.push(simMs); drawing.push(renderMs); interfaceMs.push(performance.now() - at); }
          if (++n === 72) { clearTimeout(timeout); resolve(); }
        } catch (error) { fail(error); throw error; }
      };
    });
  } finally {
    game.update = original.update; renderer.draw = original.draw; ui.frame = original.frame;
    game.speed = 0;
  }
  if (gl.getError() !== gl.NO_ERROR) throw new Error('WebGL error in live gameplay');
  return { scenario: scene, map, samples: frames.length, elapsedMs: performance.now() - began,
    frameMedianMs: percentile(frames, .5), frameP95Ms: percentile(frames, .95), frameMaxMs: Math.max(...frames),
    intervalP95Ms: percentile(gaps, .95), simulationP95Ms: percentile(simulation, .95), drawingP95Ms: percentile(drawing, .95), interfaceP95Ms: percentile(interfaceMs, .95),
    ...renderer.perfSample(false), geometries: renderer.gl.info.memory.geometries, textures: renderer.gl.info.memory.textures, animals: game.wildlife.agents.length };
}
