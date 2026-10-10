import { ANIMAL } from '../data/animals.js';
import { PASSAGE_SPECIES, PASSAGE_ROUTES } from '../data/bird-passage.js';
import { biome } from '../biome.js';
import { PLANTS } from '../data/plants.js';
import { LEVEL, clamp } from '../config.js';
import { facePoint } from './animal-positioning.js';

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
export function passageChoices(game) {
  const routes = PASSAGE_ROUTES[game.map] || {};
  return (biome.look.ambience?.flocks?.[game.season] || []).flatMap(kind =>
    (routes[kind] || []).map(key => ANIMAL[key] || PASSAGE_SPECIES[key]).filter(d => d?.move === 'fly'));
}

// The field guide's passing birds: species that only fly over this map (residents seen in
// passage flocks already have their own entry), with the seasons their flocks come through.
export function passageGuide(game) {
  const routes = PASSAGE_ROUTES[game.map] || {}, seasons = new Map();
  (biome.look.ambience?.flocks || []).forEach((kinds, season) => {
    for (const kind of kinds) for (const key of routes[kind] || []) {
      if (ANIMAL[key] || !PASSAGE_SPECIES[key]) continue;
      if (!seasons.has(key)) seasons.set(key, new Set());
      seasons.get(key).add(season);
    }
  });
  return [...seasons].map(([key, s]) => ({ def: PASSAGE_SPECIES[key], seasons: [...s].sort() }));
}

export function spawnPassage(wl, def, opts = {}) {
  if (!def || def.move !== 'fly' || wl.flyovers.length >= 28) return [];
  const w = wl.game.world, goose = !!def.sprite.goose, swoop = def.key === 'barn_swallow';
  const ang = opts.angle ?? (goose && [0, 2].includes(wl.game.season) ? (wl.game.season === 2 ? Math.PI / 2 : -Math.PI / 2) + rand(-0.35, 0.35) : rand(0, Math.PI * 2));
  const ux = Math.cos(ang), uy = Math.sin(ang), cx = opts.x ?? rand(w.w * 0.25, w.w * 0.75), cy = opts.y ?? rand(w.h * 0.25, w.h * 0.75);
  const radius = Math.min(Math.abs(ux) > 0.001 ? (ux > 0 ? cx : w.w - cx) / Math.abs(ux) : Infinity,
    Math.abs(uy) > 0.001 ? (uy > 0 ? cy : w.h - cy) / Math.abs(uy) : Infinity) + 6;
  const distance = radius + Math.min(Math.abs(ux) > 0.001 ? (ux > 0 ? w.w - cx : cx) / Math.abs(ux) : Infinity,
    Math.abs(uy) > 0.001 ? (uy > 0 ? w.h - cy : cy) / Math.abs(uy) : Infinity) + 10;
  const x = cx - ux * radius, y = cy - uy * radius;
  // One altitude for the whole route, above both terrain and mature crowns.
  // This avoids terrain-following flocks diving into hills or tall forest.
  let flightY = biome.look.underwater ? biome.look.underwater.level * LEVEL + 2 : 2;
  for (let t = 0; t <= distance; t += 1) {
    const xx = clamp(x + ux * t, 0, w.w - 0.01), yy = clamp(y + uy * t, 0, w.h - 0.01), i = w.idx(Math.floor(xx), Math.floor(yy));
    const tree = w.tree[i] && PLANTS[w.tree[i]];
    flightY = Math.max(flightY, w.heightAt(xx, yy) * LEVEL + (tree ? 5 * (tree.look.scale ?? 1) * w.treeG[i] : 0) + 2.2);
  }
  // (tiles a second: unhurried enough to watch a flock cross the view)
  const flock = wl.nextId, speed = opts.speed ?? (goose ? 3.2 : swoop ? 4.8 : def.sprite.kind === 'vulture' ? 2.4 : 3.6);
  const n = Math.min(opts.n ?? (goose ? 7 + Math.floor(Math.random() * 4) : ['macaw', 'hornbill', 'vulture', 'heron'].includes(def.sprite.kind) ? 2 + Math.floor(Math.random() * 3) : 5 + Math.floor(Math.random() * 5)), 28 - wl.flyovers.length);
  const out = [];
  for (let k = 0; k < n; k++) {
    const rank = Math.ceil(k / 2), arm = k ? (k % 2 ? 1 : -1) : 0;
    const back = goose ? rank * 0.85 : rand(0, 2.8), side = goose ? arm * rank * 0.7 : rand(-1.6, 1.6);
    const a = { id: wl.nextId++, sp: def.index ?? -1, key: def.key, passageDef: def, passing: true,
      flock, move: 'fly', state: 'passage', flying: true, alt: 1, age: 360, phase: rand(0, 10),
      x: x - ux * back - uy * side, y: y - uy * back + ux * side, orientation: ang, facing: ux < 0 ? -1 : 1,
      flightY: flightY + (goose ? 0 : rand(-0.12, 0.12)), passage: { ux, uy, speed, left: distance + back, t: 0, swoop,
        glide: def.sprite.kind === 'vulture' || def.sprite.stork, phase: rand(0, 6.3) } };
    wl.flyovers.push(a); out.push(a);
  }
  return out;
}

export function updatePassage(wl, dt) {
  wl.passageWait -= dt;
  if (wl.passageWait <= 0) {
    wl.passageWait = rand(18, 40) * (wl.game.weather === 'rain' ? 2 : 1);
    if (wl.game.weather !== 'snow' && wl.flyovers.length < 14) {
      const choices = passageChoices(wl.game);
      if (choices.length) spawnPassage(wl, choices[Math.floor(Math.random() * choices.length)]);
    }
  }
  for (let k = wl.flyovers.length - 1; k >= 0; k--) {
    const a = wl.flyovers[k], p = a.passage, step = p.speed * dt;
    p.t += dt; p.left -= step; a.age += dt;
    a.soaring = p.glide && Math.sin(p.t * 0.65 + p.phase) < 0.65;
    if (a.soaring) {
      // Ease to the neutral, spread-wing pose between short bouts of flapping.
      const neutral = Math.round(a.phase * 0.9) / 0.9;
      a.phase += (neutral - a.phase) * Math.min(1, dt * 5);
    } else a.phase += dt * 6 * (a.passageDef.sprite.beat ?? 1);
    const bend = p.swoop ? (Math.sin(p.t * 1.8 + p.phase) - Math.sin((p.t - dt) * 1.8 + p.phase)) * 0.55 : 0;
    const nx = a.x + p.ux * step - p.uy * bend, ny = a.y + p.uy * step + p.ux * bend;
    facePoint(a, nx, ny); a.x = nx; a.y = ny;
    if (p.left <= 0) {
      if (wl.game.selectedAgent === a) wl.game.selectedAgent = null;
      wl.flyovers.splice(k, 1);
    }
  }
}
