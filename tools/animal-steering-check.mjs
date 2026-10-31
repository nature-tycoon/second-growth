// node tools/animal-steering-check.mjs [--report] [maps...]
// How animals share space and face what they act on (decision 0025), measured on the real
// restored landscapes of every map: animals spread over their habitat, the predators hungry, and
// the antlered deer, elk and sambar in the rut, so chases, bouts and drinking all happen.
// Every simulation step it counts, per 1000 animal-steps:
//   overlap    two ground animals' bodies deep inside each other (centres closer than half their
//              summed spacing radii), not counting a hunter on its prey, rivals in a bout, play
//              or a mother with her young; `fleeOverlap` the same among animals running away
//   trunk      a walker's body (a capsule along its heading) inside a drawn trunk; `antler` an
//              antlered male's rack (a disc at the head) inside one
//   water      a land walker (move 'ground') on a water tile: `wade` crossing it, `stand` stopped in
//              it, `dryFooted` a small one (a vole, a rabbit) in it at all
//   spar       rivals settled in their stance but not facing each other within 30°, and
//              `sparStuck` rivals both there but still not in their stance half a day on
//   drink      a drinker with no water ahead of it (within 30° of its heading, about as near as the nearest)
//   fleeTurn   a fleeing animal's heading jumping more than 35° in one step
// It fails on the acceptance limits in decision 0025; --report only prints the numbers. SEED=91 another seed, HERD=60 migration-sized
// herds, DETAIL=1 what each count is made of (species and state).
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { BIOME_LIST } from '../js/biome.js';
import { restoredGame } from './map-audit-fixtures.mjs';
import { mulberry32, hash2 } from '../js/rng.js';
import { T, isWater, DAYS_PER_YEAR } from '../js/config.js';
import { passable, canLand } from '../js/sim/animal-terrain.js';
import { underWater } from '../js/sim/waterline.js';
import { animalRadius } from '../js/sim/animal-positioning.js';
import { treeTrunk, groundWalker } from '../js/sim/ground-obstacles.js';
import { isMaleVariant } from '../js/data/animals.js';

globalThis.localStorage ||= { getItem() { return null; }, setItem() {}, removeItem() {} };
const args = process.argv.slice(2), strict = !args.includes('--report');
const maps = args.filter(s => !s.startsWith('--'));
const DT = 0.02, DAYS = 12, WARM = 2, HERD = +(process.env.HERD || 14);
// (small land animals that never set foot in water: animal-terrain.js)
const DRY_KINDS = new Set(['rodent', 'rabbit', 'squirrel', 'agouti', 'armadillo', 'turtle', 'beetle', 'pangolin', 'monitor']);
const wrap = d => d - Math.round(d / (Math.PI * 2)) * Math.PI * 2;
const heading = a => a.hd ?? a.orientation ?? 0;

export function populate(g, rng) {
  const wl = g.wildlife, w = g.world;
  wl.agents = []; wl.flyovers = []; wl.recount(); wl.passageWait = 1e6;
  wl.computeSuitability();
  for (const d of g.catalog.animals) {
    if (d.reef || d.move === 'swim') continue;
    const suit = wl.suit[d.index], good = [];
    for (let j = 0; j < w.n; j++) if (suit[j] > 0.3 && !w.fire[j] && passable(w, j, d) && canLand(w, j, d)) good.push(j);
    if (!good.length) continue;
    const groups = d.herd ? 2 : Math.min(d.max, 4), size = d.herd ? Math.min(d.herdMax || HERD, HERD) : 1;
    for (let k = 0; k < groups; k++) {
      const j = good[Math.floor(rng() * good.length)];
      // (a herd spread over a few tiles round its centre, as herds stand, not piled on one tile)
      const room = d.herd ? good.filter(i => Math.hypot(i % w.w - j % w.w, (i / w.w | 0) - (j / w.w | 0)) < 4) : [j];
      for (let m = 0; m < size; m++) {
        const at = room[Math.floor(rng() * room.length)];
        const a = wl.spawn(d, at % w.w, at / w.w | 0, { silent: true, age: d.mature * DAYS_PER_YEAR * (1.2 + rng() * 2) });
        a.wait = rng() * 2;
        if (d.prey) a.hunger = 10; // (hungry hunters: chases happen)
      }
    }
  }
}

// The nearest drawn water (the visible waterline, not the tile grid: a carved creek's water reaches
// part-way up its bank tiles) within two tiles of (x, y), as [x, y, distance], or null.
function nearestWater(w, x, y) {
  let best = null;
  for (let k = 0; k < 32; k++) {
    const ang = k * Math.PI / 16, c = Math.cos(ang), s = Math.sin(ang);
    for (let d = 0; d <= 2 && (!best || d < best[2]); d += 0.05) {
      const px = x + c * d, py = y + s * d;
      if (!w.inb(Math.floor(px), Math.floor(py))) break;
      if (underWater(w, px, py)) { best = [px, py, d]; break; }
    }
  }
  return best;
}
// How far a segment's nearest point is from (cx, cy).
function segDist(x0, y0, x1, y1, cx, cy) {
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((cx - x0) * dx + (cy - y0) * dy) / L2));
  return Math.hypot(x0 + dx * t - cx, y0 + dy * t - cy);
}

export function measure(map, { seed = 1987, rut = true } = {}) {
  Math.random = mulberry32(seed);
  const rng = mulberry32(seed + 1);
  const g = restoredGame(map, seed), wl = g.wildlife, w = g.world;
  if (rut) g.day = 70; // (October: the rut. The wildlife update alone never moves the calendar on)
  populate(g, rng);
  const cat = g.catalog, c = { steps: 0, ground: 0, overlap: 0, flee: 0, fleeOverlap: 0, walkers: 0, trunk: 0, trunkCentre: 0, squeeze: 0,
    antlered: 0, antler: 0, wade: 0, stand: 0, dryFooted: 0, sparSteps: 0, spar: 0, sparStuck: 0, drinkSteps: 0, drink: 0, fleeSteps: 0, fleeTurn: 0 };
  const gaps = [], waterBy = {}, why = {}, note = (k, n = 1) => { why[k] = (why[k] || 0) + n; }, last = new Map(), sparSince = new Map();
  const trunks = new Map(); // (tile -> drawn trunk, per step: trees don't move)
  const trunkAt = (xx, yy) => { const i = w.idx(xx, yy); if (!trunks.has(i)) trunks.set(i, w.tree[i] && !isWater(w.terrain[i]) ? treeTrunk(w, xx, yy) : null); return trunks.get(i); };
  const total = Math.round((DAYS + WARM) / DT);
  for (let step = 0; step < total; step++) {
    wl.update(DT);
    if (step % 50 === 0) trunks.clear();
    if (step < WARM / DT) { for (const a of wl.agents) last.set(a.id, heading(a)); continue; }
    c.steps++;
    // overlaps, from the spacing buckets the update just rebuilt
    const sp = wl.spacing;
    for (const e of sp.entries) {
      if (e.band !== 'ground') continue;
      c.ground++;
      const a = e.a, fleeing = a.state === 'flee';
      if (fleeing) c.flee++;
      for (const bucket of sp.around(a.x, a.y)) for (const f of bucket) {
        const b = f.a;
        if (b.id <= a.id || f.band !== 'ground') continue;
        if (a.target === b.id || b.target === a.id || a.sparWith === b.id || a.mom === b.id || b.mom === a.id) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) >= (e.r + f.r) * 0.5) continue;
        c.overlap++; note(`overlap ${a.key}/${a.state} ${b.key}/${b.state}`);
        if (fleeing || b.state === 'flee') c.fleeOverlap++;
      }
    }
    // how close grazing herd mates stand: the nearest of its kind also grazing or resting, in body lengths
    if (step % 10 === 0) for (const e of sp.entries) {
      const a = e.a;
      if (e.band !== 'ground' || !cat.animals[a.sp].herd || !(a.state === 'idle' || a.state === 'forage') || a.drinkT > 0 || a.juvenile) continue;
      let best = Infinity, who = null;
      for (const bucket of sp.around(a.x, a.y)) for (const f of bucket) if (f.a !== a && f.a.sp === a.sp && f.a.mom !== a.id && (f.a.state === 'idle' || f.a.state === 'forage') && !(f.a.drinkT > 0)) { const d = Math.hypot(f.a.x - a.x, f.a.y - a.y); if (d < best) { best = d; who = f.a; } }
      if (best < 3) gaps.push(best / (e.r / 0.65));
      if (best / (e.r / 0.65) < 1) note(`close ${a.key}/${a.state}${a.juvenile ? '/young' : ''} ${who.state}${who.juvenile ? '/young' : ''}${who.drinkT > 0 ? '/drink' : ''}`);
    }
    for (const a of wl.agents) {
      const def = cat.animals[a.sp], h = heading(a);
      const was = last.get(a.id); last.set(a.id, h);
      if (a.state === 'dormant' || a.leaving) continue;
      if (a.state === 'flee' && !(a.fleeDelay > 0)) { c.fleeSteps++; if (was != null && Math.abs(wrap(h - was)) > 0.6) { c.fleeTurn++; note(`fleeTurn ${a.key} dodge=${a.dodge || 0} age=${(a.fleeAge || 0) < 0.05 ? 'start' : 'on'} hd=${a.fleeHd != null && Math.abs(wrap(a.fleeHd - h)) > 0.3 ? 'off' : 'on'}`); } }
      const xx = Math.floor(a.x), yy = Math.floor(a.y);
      if (!w.inb(xx, yy)) continue;
      const t = w.terrain[w.idx(xx, yy)];
      if (def.move === 'ground' && !a.flying && !(a.alt > 0.05) && !def.reef && isWater(t) && !(def.crossing && t === T.RIVER)) {
        const moving = a.state === 'walk' || a.state === 'flee' || a.state === 'hunt' || a.state === 'play' || a.state === 'approach';
        c[moving ? 'wade' : 'stand']++;
        if (DRY_KINDS.has(def.sprite.kind)) c.dryFooted++;
        waterBy[a.key] = (waterBy[a.key] || 0) + 1; note(`water ${a.key}/${a.state}${a.drinkT > 0 ? '/drink' : ''} ${t}`);
      }
      if (groundWalker(def, a)) {
        c.walkers++;
        if (a.squeeze > 0) c.squeeze++;
        const r = animalRadius(a, cat), half = r * 0.38, reach = r / 0.65 / 2 - half; // (body: a capsule from rump to chest)
        const ux = Math.cos(h), uy = Math.sin(h);
        const antlers = !!def.sprite.male?.antlers && isMaleVariant(def, a);
        if (antlers) c.antlered++;
        let inBody = false, inCentre = false, inRack = false;
        for (let ty = yy - 1; ty <= yy + 1; ty++) for (let tx = xx - 1; tx <= xx + 1; tx++) {
          if (!w.inb(tx, ty)) continue;
          const tr = trunkAt(tx, ty);
          if (!tr || def.tramples && w.treeG[w.idx(tx, ty)] < 0.4) continue; // (an elephant walks through saplings)
          if (Math.hypot(a.x - tr[0], a.y - tr[1]) < tr[2]) inCentre = true;
          if (segDist(a.x - ux * reach, a.y - uy * reach, a.x + ux * reach, a.y + uy * reach, tr[0], tr[1]) < tr[2] + half * 0.5) inBody = true;
          if (antlers && Math.hypot(a.x + ux * (reach + half) - tr[0], a.y + uy * (reach + half) - tr[1]) < tr[2] + r * 0.3) inRack = true;
        }
        if (inBody) { c.trunk++; note(`trunk ${a.key}/${a.state}`); }
        if (inCentre) c.trunkCentre++;
        if (inRack) { c.antler++; note(`antler ${a.key}/${a.state}`); }
      }
      if (a.state === 'spar' && a.sparStyle !== 'necking') {
        const o = wl.ids.get(a.sparWith);
        const settled = o && a.sparAt && o.sparAt && !a.sparPath?.length && !o.sparPath?.length &&
          Math.hypot(a.x - a.sparAt[0], a.y - a.sparAt[1]) < 0.02 && Math.hypot(o.x - o.sparAt[0], o.y - o.sparAt[1]) < 0.02;
        if (settled) {
          c.sparSteps++; sparSince.delete(a.id);
          if (Math.abs(wrap(Math.atan2(o.y - a.y, o.x - a.x) - h)) > 0.52) c.spar++;
        } else if (!a.sparPath?.length && !o?.sparPath?.length) { // (both walked over: the last steps into the stance)
          const since = sparSince.get(a.id) ?? step; sparSince.set(a.id, since);
          if ((step - since) * DT > 0.5) { c.sparStuck++; note(`sparStuck ${a.key} ${a.sparPath?.length ?? '-'} ${a.sparAt ? Math.hypot(a.x - a.sparAt[0], a.y - a.sparAt[1]).toFixed(2) : '-'}`); }
        }
      } else sparSince.delete(a.id);
      if (a.drinkT > 0 && a.drinkAt && !a.flying && wl.drinks(def)) {
        c.drinkSteps++;
        // (it faces water when, within 30° of its heading, there's water about as near as the nearest)
        const near = nearestWater(w, a.x, a.y);
        let ahead = false;
        if (near) for (let k = -4; k <= 4 && !ahead; k++) {
          const ang = h + k * 0.13, cx = Math.cos(ang), cy = Math.sin(ang);
          for (let d = 0; d <= near[2] + 0.25; d += 0.05) if (underWater(w, a.x + cx * d, a.y + cy * d)) { ahead = true; break; }
        }
        if (!ahead) { c.drink++; note(`drink ${a.key} ${a.state} ${near ? 'water' : 'none'} dAt=${Math.hypot(a.drinkAt[0] - a.x, a.drinkAt[1] - a.y).toFixed(1)} dW=${near ? near[2].toFixed(1) : '-'}`); }
      }
    }
  }
  const per = (n, d) => d ? +(1000 * n / d).toFixed(2) : 0;
  return {
    map, seed, animals: wl.agents.length,
    herdGap: gaps.length ? +gaps.sort((p, q) => p - q)[gaps.length >> 1].toFixed(2) : null, herdClose: per(gaps.filter(v => v < 1).length, gaps.length),
    overlap: per(c.overlap, c.ground), fleeOverlap: per(c.fleeOverlap, c.flee), fleeShare: per(c.flee, c.ground),
    trunk: per(c.trunk, c.walkers), trunkCentre: per(c.trunkCentre, c.walkers), squeeze: per(c.squeeze, c.walkers), antler: per(c.antler, c.antlered),
    wade: per(c.wade, c.ground), stand: per(c.stand, c.ground), dryFooted: per(c.dryFooted, c.ground), waterBy,
    spar: per(c.spar, c.sparSteps), sparSteps: c.sparSteps, sparStuck: c.sparStuck,
    ...(process.env.DETAIL ? { why: Object.fromEntries(Object.entries(why).sort((p, q) => q[1] - p[1]).slice(0, 40)) } : {}),
    drink: per(c.drink, c.drinkSteps), drinkSteps: c.drinkSteps, fleeTurn: per(c.fleeTurn, c.fleeSteps), fleeSteps: c.fleeSteps,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rows = [];
  for (const biome of BIOME_LIST) {
    if (maps.length && !maps.includes(biome.id)) continue;
    const t0 = performance.now(), r = measure(biome.id, { seed: +(process.env.SEED || 1987) });
    rows.push(r);
    console.log(JSON.stringify({ ...r, ms: Math.round(performance.now() - t0) }));
  }
  if (strict) for (const r of rows) {
    assert.ok(r.overlap < 1, `${r.map}: ${r.overlap} deep overlaps per 1000 animal-steps`);
    assert.ok(r.trunkCentre < 0.1, `${r.map}: ${r.trunkCentre} walkers' centres inside a trunk per 1000`);
    assert.ok(r.trunk < 2, `${r.map}: ${r.trunk} bodies inside a trunk per 1000`);
    assert.ok(r.antler < 5, `${r.map}: ${r.antler} racks inside a trunk per 1000`);
    assert.ok(r.stand === 0, `${r.map}: ${r.stand} per 1000 land walkers stopped in water ${JSON.stringify(r.waterBy)}`);
    assert.ok(r.dryFooted === 0, `${r.map}: small land animals in water ${JSON.stringify(r.waterBy)}`);
    assert.ok(r.spar < 5, `${r.map}: ${r.spar} per 1000 settled rival-steps not facing`);
    assert.ok(r.sparStuck === 0, `${r.map}: ${r.sparStuck} rival-steps stuck short of their stance`);
    assert.ok(r.drink < 5, `${r.map}: ${r.drink} per 1000 drinking steps with no water ahead`);
    assert.ok(r.fleeTurn < 15, `${r.map}: ${r.fleeTurn} per 1000 flee steps jerking round`);
    console.log('PASS ' + r.map);
  }
}
