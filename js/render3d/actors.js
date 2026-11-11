// Animals (instanced 3D models, see animals/animal-model.js), plus visitors and flames drawn as camera-facing sprites.

import * as THREE from 'three';
import { LEVEL, isWater, F as FEAT, clamp } from '../config.js';
import { drawDef, drawLooks, maleLook } from '../data/animals.js';
import { trait } from '../data/animal-kinds.js';
import { leavesCarcass } from '../sim/animal-life.js';
import * as S from '../render/sprites.js';
import { snagSpot, snagPose } from '../sim/ground-obstacles.js';
import { contactShadow } from './geometry/features.js';
import { AnimalShadows } from './animal-shadows.js';
import { Fauna, PERSON_LOOKS, SNORKEL_LOOKS } from './animals/animal-pools.js';
import { adultAnimalScale } from './animal-scale.js';
import { boutCycle, CRASH } from './bout-clock.js';
import { CanopySite } from './canopy-support.js';
import { hash2 } from '../rng.js';
import { PerchBough } from './bird-perch.js';
import { SlothBridges } from './sloth-bridge.js';
import { ActorView, animalViewRadius, pixelsPerUnit, perspectiveScale } from './actor-view.js';
import { carcassDecay, fitCarcass, Remains } from './carcass-decay.js';
import { PX, TURN, turnToward, beginAnimal, crownTile, turnBody, bodyPhase, finishAnimal } from './actors-common.js';
import { wadeOrSwim, gait, headPose, huntPose, stumblePose } from './actors-ground.js';
import { crownHeight, canopyHeight, branchPose, climbSupport, grips } from './actors-climb.js';
import { snagBank, trunkCling, seaFlightHeight, crownPerch, snagPerch, birdHeight, plungePose, anchorPose, perchLimb } from './actors-fly.js';
import { riverFishHeight, tailBend, snapPose, tailBeat } from './actors-swim.js';
import { reefHeight, munchTarget, munchPose } from './actors-reef.js';

export { salmonLeap } from './actors-common.js';
export { escapeSkip } from './actors-reef.js';

const SPAR_FIT = { elk: 0.97, sambar: 0.86 }; // per antler type, as a share of the two heads' full reach

// Where an animal is drawn up and down, by mode: the first that applies (actors-*.js).
function drawnHeight(A, c) {
  const { game, w, a, def, mo, sc, time, surf, seaY, ground, flying, inside, i } = c;
  if (def.reef && seaY != null) reefHeight(A, c);
  else if (flying && seaY != null) seaFlightHeight(c);
  else if (seaY != null && def.move === 'fly' && ground < seaY - 0.05) c.y = seaY - mo.sink * sc + Math.sin(time * 1.3 + a.id) * 0.008; // (and settle on the water to rest, bobbing on the surface)
  else if (flying) c.y += (trait(def, 'flitsLow') ? 0.12 + a.alt * 0.3 : 0.7 + a.alt * 1.2) * (1 - (a.stoop || 0) * 0.85); // pollinators flit low over the flowers; a stooping hawk drops onto its prey
  else if (def.move === 'swim') riverFishHeight(c);
  else if (surf != null && mo.wadeDepth) c.y = Math.max(ground, surf - mo.wadeDepth * sc);
  else if (surf != null && trait(def, 'floats') && a.bird?.kind !== 'nest') c.y = def.move === 'fly' ? Math.max(ground, surf - mo.sink * sc) : surf - mo.sink * sc;
  else if ((def.move === 'ground' || def.move === 'semi') && !def.reef && mo.eye && inside && w.distWater[i] <= 2) wadeOrSwim(A, c);
  else if (def.move === 'fly' && a.bird?.kind === 'trunk' && inside && (c.cling = A.trunkCling(game, w, i, a, def, sc))) c.y = c.cling.y;
  else if (def.move === 'fly' && !a.birdGround && inside && w.tree[crownTile(A, c)] && w.treeG[crownTile(A, c)] > 0.5 && (a.bird?.kind === 'nest' || trait(def, 'sitsInCrowns') !== false)) crownPerch(A, c);
  else if (def.move === 'fly' && !a.birdGround && inside && w.feature[crownTile(A, c)] === FEAT.SNAG) snagPerch(A, c);
  else if (def.move === 'fly' && a.bird?.kind === 'nest' && inside && w.feature[i] === FEAT.NESTBOX) c.y += 0.65;
  else if (def.move === 'tree' && inside && a.move !== 'ground') crownHeight(A, c); // (a squirrel down foraging is on the ground: sim/climbers.js)
}

export class Actors {
  trunkCling(game, w, i, a, def, sc) { return trunkCling(this.flora, game, w, i, a, def, sc); } // (actors-fly.js)
  constructor(scene, flora = null, { canopyWalkerMotion = true, howlerPrototype } = {}) {
    this.scene = scene;
    this.flora = flora;
    this.canopyWalkerMotion = howlerPrototype ?? canopyWalkerMotion; this.walkerModels = new WeakMap();
    this.slothBridges = flora ? new SlothBridges(scene, flora) : null;
    this.textures = new Map();
    this.fauna = new Fauna(scene);
    this.swingGrip = new THREE.Vector3(); this.swingBase = new THREE.Vector3();
    this.swingAxis = new THREE.Vector3(0, 0, 1);
    this.holdOffset = new THREE.Vector3(); this.holdRotation = new THREE.Quaternion(); this.perchGoal = new THREE.Vector3();
    this.perchBough = new PerchBough(scene);
    this.pose = new Map();      // agent id -> smoothed heading, gait, wings, and where it was drawn
    this.view = new ActorView();
    this.visibleWildlife = [];
    this.cullOffscreen = true;
    this.people = new Map();    // visitor id -> smoothed heading and gait
    this.flames = [];
    this.smoke = [];
    this.frameNo = 0; // (frames drawn: spreads per-animal lookups over frames)
    // a soft-edged shadow under each animal (the same fading disc as under plants)
    this.shadowGeo = contactShadow(14).scale(0.5, 1, 0.5);
    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0x0a1206, vertexColors: true, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
    this.shadows = new THREE.InstancedMesh(this.shadowGeo, this.shadowMat, 600);
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 1;
    scene.add(this.shadows);
    // reef animals and birds cast shadows shaped like themselves instead
    this.silhouettes = new AnimalShadows(scene, this.shadowMat);
    this.remains = new Remains(scene); // kills' bones, bared as they're eaten and rot
    this.decayOn = true; // (the Carcass decay setting: off, a kill lies whole and sinks away at the end)
    // The selected animal's marker: a thin ring with a faint glow lying flat on the ground under
    // it (or on the water, the branch or the seabed it's at), so nothing is drawn over the animal
    // itself. Depth-tested, so legs and bodies pass in front of it.
    const flat = { color: 0xfff1b8, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 };
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ ...flat, opacity: 0.95 }));
    this.ring.add(new THREE.Mesh(new THREE.RingGeometry(0.5, 0.86, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ ...flat, opacity: 0.16 })));
    this.ring.visible = false; this.ring.renderOrder = 2;
    scene.add(this.ring);
    this.m = new THREE.Matrix4();
  }

  tex(canvas) {
    let t = this.textures.get(canvas);
    if (!t) { t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; this.textures.set(canvas, t); }
    return t;
  }

  // A snag as a solid site (Flora.showCanopySites), for a tracked bird perched on it: the snag flora.js
  // draws on that tile, kept per tile so the set of solid sites stays the same from frame to frame.
  snagSite(w, x, y) {
    const geo = this.flora?.geos.get(`snag:${w.variant[w.idx(x, y)] & 1}`);
    if (!geo) return null;
    const key = w.idx(x, y), old = (this.snagSites ||= new Map()).get(key);
    if (old?.geo === geo && old.age === w.featureAge[key]) return old;
    const [cx, cz] = snagSpot(w, x, y, snagBank(w, x, y, key)), [rx, rz, sh] = snagPose(w, x, y, key);
    const site = new CanopySite(geo, [cx, w.heightAt(cx, cz) * LEVEL - 0.02, cz, 1, sh, 1, hash2(x, y, 13) * 6.28, rx, rz], [0.62, 0.58, 0.52], key);
    site.age = w.featureAge[key]; // (it shortens as it rots)
    this.snagSites.set(key, site);
    return site;
  }
  update(game, camRight, time, camera = null, viewportHeight = 0) {
    this.catalog = game.catalog;
    const w = game.world;
    this.view.update(camera, viewportHeight, this.cullOffscreen);
    this.visibleWildlife.length = 0;
    const seen = new Set();
    const canopySites = new Set();
    const bridges = new Set();
    let sh = 0;
    const shadow = (x, y, z, r) => {
      if (sh >= this.shadows.instanceMatrix.count) {
        // Keep every visible shadow in dense scenes; a fixed quota would change which
        // animals have shadows as offscreen instances are omitted.
        const old = this.shadows;
        this.shadows = new THREE.InstancedMesh(this.shadowGeo, this.shadowMat, old.instanceMatrix.count * 2);
        this.shadows.instanceMatrix.array.set(old.instanceMatrix.array);
        this.shadows.frustumCulled = false; this.shadows.renderOrder = 1;
        this.scene.remove(old); old.dispose(); this.scene.add(this.shadows);
      }
      this.m.makeScale(r, 1, r); this.m.setPosition(x, y + 0.012, z);
      this.shadows.setMatrixAt(sh++, this.m);
    };

    // ---- wildlife
    const frameDt = Math.min(0.1, Math.max(0, this.lastT != null ? time - this.lastT : 0.016));
    const F = this.fauna, k = Math.min(1, frameDt * 6);
    this.lastT = time; this.frameNo++;
    const persp = perspectiveScale(camera, viewportHeight);
    F.begin(pixelsPerUnit(camera, viewportHeight), persp && { x: camera.position.x, y: camera.position.y, z: camera.position.z, scale: persp });
    this.silhouettes.begin();
    // the prey a hunter is rushing right now (a longtom skips away from it), and every hunter out
    // hunting (a school of chromis or anthias drops into the coral when one comes near)
    const chased = new Set(), hunters = this.hunters || (this.hunters = []);
    hunters.length = 0;
    for (const h of game.wildlife.agents) if (h.state === 'hunt') { hunters.push(h); if (h.hunt?.phase === 'rush') chased.add(h.target); }
    const fr = { game, w, F, k, frameDt, time, seen, chased, hunters, canopySites, bridges, shadow };
    // Each animal through the same steps in the same order; a step is a mode's (actors-ground.js,
    // -climb, -fly, -swim, -reef) or everyone's (actors-common.js), and does nothing for the others.
    for (const a of game.wildlife.viewAgents) {
      const c = beginAnimal(this, fr, a);
      if (!c) continue;
      drawnHeight(this, c);
      birdHeight(c);
      canopyHeight(c);
      munchTarget(c);
      turnBody(c);
      tailBend(c);
      gait(c);
      headPose(this, c);
      huntPose(c);
      snapPose(c);
      stumblePose(c);
      plungePose(c);
      anchorPose(c);
      munchPose(c);
      perchLimb(this, c);
      branchPose(this, c);
      climbSupport(this, c);
      tailBeat(c);
      bodyPhase(c);
      grips(this, c);
      finishAnimal(this, c);
    }
    for (const id of this.pose.keys()) if (!seen.has(id)) this.pose.delete(id);
    for (const bridge of bridges) { canopySites.add(bridge.source); canopySites.add(bridge.target); }
    this.flora?.showCanopySites(canopySites);
    this.perchBough.end();
    this.slothBridges?.show(bridges);

    // ---- kills: the prey lying on its side where it fell, broken down over the weeks as it's eaten
    // and rots (see carcass-decay.js): its flesh drawing back onto the bones until it's a skeleton,
    // which slumps into a pile of bones that go one by one, over a spreading stain.
    this.remains.begin();
    for (const c of game.wildlife.carcasses || []) {
      const cdef = game.catalog.animals[c.sp];
      if (!cdef) continue;
      const def = drawDef(cdef, c, game.month);
      const ageF = def.mature > 0 ? clamp(0.55 + 0.45 * c.age / (def.mature * 120), 0.55, 1) : 1;
      const sc = adultAnimalScale(def.sprite) * ageF, ground = w.heightAt(clamp(c.x, 0, w.w), clamp(c.y, 0, w.h)) * LEVEL;
      const yaw = -c.yaw, roll = c.side * Math.PI / 2;
      if (this.view.enabled && !this.view.visible(c.x, ground - 0.2, ground + 0.6, c.y, animalViewRadius(def))) continue;
      const h = (def.sprite.h || 10) * sc, len = (def.sprite.len || 10) * sc, lift = h * 0.32;
      if (!this.decayOn) {
        const left = clamp(c.t / (c.max * 0.3), 0, 1); // (the last stretch: sinking away)
        F.add(def, c.x, ground + lift * left - (1 - left) * h * 0.2, c.y, yaw, sc, 0, 0, 0, 0.6, 0, roll);
        shadow(c.x, ground, c.y, len * 0.55);
        continue;
      }
      const d = carcassDecay(c);
      const pool = F.pool(def);
      fitCarcass(pool);
      if (d.body) F.add(def, c.x, ground + lift, c.y, yaw, sc, 0, 0, 0, 0, 0, roll, null, false, d);
      if (d.bones) this.remains.add(F.modelKey(def), pool.anatomy, c.x, ground + lift, c.y, yaw, roll, sc, lift, d);
      // (the model stands on its origin, so on its side the torso lies off toward its back)
      const a = pool.anatomy, mx = (a.x0 + a.x1) / 2 * sc, mz = c.side * (a.spineY + a.bellyY) / 2 * sc;
      const tx = c.x + Math.cos(yaw) * mx + Math.sin(yaw) * mz, tz = c.y - Math.sin(yaw) * mx + Math.cos(yaw) * mz;
      if (d.body) shadow(tx, ground, tz, len * 0.55);
      // (the stain spreads as fluids seep out and the grass dies back, and fades at the end)
      const stain = d.u > 0.05 && d.u < 0.97;
      if (stain) shadow(tx, ground, tz, len * (0.45 + 0.3 * d.u));
      if (stain && d.u > 0.3) shadow(tx, ground, tz, len * 0.5 * d.u);
    }
    this.remains.end();

    // ---- visitors: same instanced 3D style as the wildlife
    const pseen = new Set();
    for (const v of game.residents ? game.visitors.agents.concat(game.residents) : game.visitors.agents) {
      pseen.add(v.id);
      let st = this.people.get(v.id);
      if (!st) { st = { yaw: 0, gait: 0, px: v.x, py: v.y }; this.people.set(v.id, st); }
      const dx = v.x - st.px, dz = v.y - st.py;
      if (dx * dx + dz * dz > 1e-7) turnToward(st, Math.atan2(-dz, dx), TURN.body, k);
      st.px = v.x; st.py = v.y;
      st.gait += ((v.pause > 0 ? 0 : 1) - st.gait) * k;
      const onWet = w.inb(Math.floor(v.x), Math.floor(v.y)) && isWater(w.terrain[w.idx(Math.floor(v.x), Math.floor(v.y))]);
      const gy = w.heightAt(v.x, v.y) * LEVEL + (onWet ? 0.08 : 0); // boardwalks sit above the water
      const sea = game.catalog.definition.look.underwater ? game.catalog.definition.look.underwater.level * LEVEL : null;
      if (sea != null && gy < sea - 0.05) {
        // on the reef: a snorkeler, face down at the surface, finning along the trail
        F.add(SNORKEL_LOOKS[v.look % SNORKEL_LOOKS.length], v.x, sea - 0.035, v.y, st.yaw, PX * 0.6, v.phase * Math.PI * 0.7, Math.max(0.6, st.gait), 0, 0, -Math.PI / 2 + 0.12);
        shadow(v.x, gy, v.y, 0.14);
        continue;
      }
      F.add(PERSON_LOOKS[v.look % PERSON_LOOKS.length], v.x, gy, v.y, st.yaw, PX * 0.6, v.phase * Math.PI, st.gait, 0, 0);
      shadow(v.x, gy, v.y, 0.1);
    }
    if (!this.clean) this.pollinators?.draw(F); // (bees and butterflies at the flowers: pollinators.js)
    F.end();
    this.silhouettes.end();
    for (const id of this.people.keys()) if (!pseen.has(id)) this.people.delete(id);

    this.shadows.count = sh;
    this.shadows.visible = sh > 0;
    if (sh) {
      this.shadows.instanceMatrix.clearUpdateRanges();
      this.shadows.instanceMatrix.addUpdateRange(0, sh * 16);
      this.shadows.instanceMatrix.needsUpdate = true;
    }

    // ---- selection ring
    const sel = this.clean ? null : game.selectedAgent;
    const selectedPose = sel && this.pose.get(sel.id);
    if (selectedPose?.visible) {
      this.ring.visible = true;
      this.ring.position.set(selectedPose.center.x, selectedPose.base + 0.02, selectedPose.center.z);
      // a slow breathing pulse, sized to the animal's footprint
      const s = (1 + Math.sin(time * 2.5) * 0.05) * clamp(selectedPose.foot * 0.62, 0.16, 1.4);
      this.ring.scale.set(s, 1, s);
    } else this.ring.visible = false;
  }

  // The skeleton of every kind on this map that can leave a body (and its male look, which can
  // carry antlers, horns or tusks), built one or two at a time in idle moments after loading,
  // with the bone shader compiled in the background once the first exists, so a kind's first
  // carcass doesn't stall a frame. Only kinds already drawn alive: a carcass always comes from an
  // animal that was, and building a model nobody has seen would cost more than the skeleton.
  // Kinds that arrive later are picked up every few seconds; anything not ready when it's needed
  // is still built on the spot. The shader depends on whether the sun casts shadows (which the
  // game can switch off to keep up), so it's compiled again whenever that changes (lit()).
  warmRemains(game, gl = null, camera = null, scene = null, lit = () => '') {
    const waiting = [];
    for (const def of game.catalog.animals) if (def && leavesCarcass(def)) waiting.push(def, ...(def.sprite.male ? [maleLook(def)] : []));
    const idle = window.requestIdleCallback ? (f => window.requestIdleCallback(f, { timeout: 2000 })) : (f => setTimeout(() => f({ timeRemaining: () => 6 }), 80));
    let compiled = gl?.compileAsync ? null : 'never';
    const step = deadline => {
      while (deadline.timeRemaining() > 5) {
        const k = waiting.findIndex(def => this.fauna.species.has(this.fauna.modelKey(def)));
        if (k < 0) break;
        const def = waiting.splice(k, 1)[0];
        this.remains.pool(this.fauna.modelKey(def), fitCarcass(this.fauna.pool(def)));
      }
      const p = this.remains.pools.values().next().value;
      if (p && compiled !== 'never' && compiled !== lit()) {
        // (against the game's own scene, so its lights pick the same program the bones will use)
        compiled = lit(); const shown = p.mesh.visible; p.mesh.visible = true;
        gl.compileAsync(p.mesh, camera, scene).catch(() => {}).finally(() => { p.mesh.visible = shown; });
      }
      setTimeout(() => idle(step), waiting.some(def => this.fauna.species.has(this.fauna.modelKey(def))) ? 0 : 4000);
    };
    idle(step);
  }

  // Every look of every kind on this map, built one per idle moment from the start of a game
  // (resident kinds first), with its shader compiled in the background. Built on the spot, a
  // kind's first appearance stalled a frame for 10-100 ms on a fast laptop (its model, its distant
  // model and a shader compiled while drawing), and a new game has 20-30 kinds arriving in its
  // first minutes. Anything not ready when it's needed is still built on the spot.
  warmAnimals(game, gl = null, camera = null, scene = null) {
    const F = this.fauna, state = game.wildlife.state, kinds = game.catalog.animals.map((def, k) => [def, k]).filter(([def]) => def);
    kinds.sort((a, b) => (state[b[1]]?.pop > 0) - (state[a[1]]?.pop > 0));
    const waiting = kinds.flatMap(([def]) => drawLooks(def)), catalog = game.catalog;
    const idle = window.requestIdleCallback ? (f => window.requestIdleCallback(f, { timeout: 1000 })) : (f => setTimeout(() => f({ timeRemaining: () => 6 }), 50));
    // (one model per idle moment: the finest take tens of milliseconds)
    const step = () => {
      if (game.catalog !== catalog) return; // (another map was loaded)
      while (waiting.length && F.species.get(F.modelKey(waiting[0]))?.far) waiting.shift();
      const def = waiting[0];
      if (!def) return;
      if (F.species.has(F.modelKey(def))) F.pool(def).distant();
      else {
        const p = F.pool(def);
        if (gl?.compileAsync) gl.compileAsync(p.mesh, camera, scene).catch(() => {});
      }
      idle(step);
    };
    idle(step);
  }

  // Two rivals in a bout, once both stand in their head-to-head stance: heads down with antlers
  // (or horns) locked, the pair shoving back and forth together as one gains ground and then the
  // other; every couple of seconds they wrench apart, lift their heads and crash back in; heads
  // twist against each other and legs churn and brace. Both animals use the same clock (seeded
  // by the lower id), so they always move as one. Returns null when this animal isn't fighting.
  bout(game, a, st, time) {
    if (a.state !== 'spar' || a.sparWith == null) return null;
    const o = game.wildlife.ids?.get(a.sparWith) ?? game.wildlife.agents.find(b => b.id === a.sparWith);
    if (!o || o.state !== 'spar') return null;
    const settled = a.sparAt && o.sparAt && Math.hypot(a.x - a.sparAt[0], a.y - a.sparAt[1]) < 0.02 && Math.hypot(o.x - o.sparAt[0], o.y - o.sparAt[1]) < 0.02;
    if (!settled) return { head: 0.3, gait: 0.6, dx: 0, dz: 0, pitch: 0, roll: 0 }; // (heads low, stepping in)
    const lo = Math.min(a.id, o.id), seed = (lo % 97) * 0.731, side = a.id === lo ? 1 : -1;
    const d = Math.hypot(o.x - a.x, o.y - a.y) || 1;
    // the pair's axis, from the lower id toward the other (the same for both animals)
    const ux = (o.x - a.x) / d * side, uz = (o.y - a.y) / d * side;
    if (a.sparStyle === 'necking') {
      // Giraffe males stand alongside one another and swing their necks, rather than lock horns.
      const swing = Math.sin(time * 1.8 + seed + (side > 0 ? 0 : Math.PI));
      return { head: 0.35 + 0.45 * Math.max(0, swing), gait: 0.12,
        dx: ux * swing * 0.015, dz: uz * swing * 0.015, pitch: 0, roll: side * swing * 0.035 };
    }
    // the push: an uneven tug of war, one gaining ground and then the other
    // (a light sparring match outside the rut: gentler shoving, no breaking off and crashing in)
    const k = a.sparLight ? 0.45 : 1;
    const push = k * (0.6 * Math.sin(time * 1.3 + seed) + 0.4 * Math.sin(time * 0.47 + seed * 2.1) + 0.15 * Math.sin(time * 4.1 + seed)) * d * 0.09;
    // break apart and crash back in: back off over a moment, then lunge
    const c = boutCycle(lo, time), apart = a.sparLight ? 0 : c < CRASH[0] ? Math.sin(c / CRASH[0] * Math.PI) : 0;
    const crash = !a.sparLight && c >= CRASH[0] && c < CRASH[1] ? Math.sin((c - CRASH[0]) / (CRASH[1] - CRASH[0]) * Math.PI) : 0; // (the impact jolt)
    // stand so the lowered antlers (or horns) of the two just interlock, wherever the
    // simulation put them: each steps back or in by half the difference
    const F = this.fauna, oDef = drawDef(game.catalog.animals[o.sp], o), oSt = this.pose.get(o.id);
    const reach = F.headReach(drawDef(game.catalog.animals[a.sp], a)) * (st.sc || 0) + F.headReach(oDef) * (oSt?.sc || st.sc || 0);
    // (how far the racks interlock: a small whitetail or mule deer rack meets close in; an elk's
    // long, sweeping beams would reach right past the other bull's face, so elk stand further off)
    const span = reach * (SPAR_FIT[drawDef(game.catalog.animals[a.sp], a).sprite.antlers] ?? 0.8);
    const fit = (d - span) / 2;
    const back = (apart * 0.16 - crash * 0.04) * span - fit;
    // each steps back along its own facing (away from the rival) while the pair shoves together
    const bx = -(o.x - a.x) / d * back, bz = -(o.y - a.y) / d * back;
    return {
      head: 1 - apart * 0.6,                                   // antlers down and forward, lifted to break off
      gait: 0.35 + Math.abs(Math.cos(time * 1.3 + seed)) * 0.4 + apart * 0.3, // legs churning, bracing
      dx: ux * push + bx, dz: uz * push + bz,
      pitch: -0.07 * (1 - apart) - crash * 0.05,               // leaning into it
      roll: k * side * 0.09 * Math.sin(time * 2.2 + seed) * (1 - apart), // heads twisting against each other
    };
  }

  // Flames on burning tiles, smoke drifting off them.
  updateFire(game, time, dt) {
    const w = game.world;
    const burning = [];
    for (let i = 0; i < w.n; i++) if (w.fire[i]) burning.push(i);
    while (this.flames.length < Math.min(burning.length * 2, 240)) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex(S.flameSprite(0)), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.center.set(0.5, 0.05); s.renderOrder = 7;
      this.scene.add(s); this.flames.push(s);
    }
    this.flames.forEach((s, k) => {
      const i = burning[k >> 1];
      if (i == null) { s.visible = false; return; }
      s.visible = true;
      const x = (i % w.w) + 0.3 + (k & 1) * 0.4, z = ((i / w.w) | 0) + 0.35 + (k & 1) * 0.3;
      const f = Math.floor(time * 8 + k) % 3;
      const tex = this.tex(S.flameSprite(f));
      if (s.material.map !== tex) { s.material.map = tex; s.material.needsUpdate = true; }
      const fl = 0.5 + 0.15 * Math.sin(time * 11 + k), low = w.rx[i] === 2 ? 0.6 : 1; // a controlled burn stays low
      s.scale.set(0.55 * (0.7 + 0.3 * low), (0.8 * fl + 0.3) * low, 1);
      s.position.set(x, w.heightAt(x, z) * LEVEL, z);
    });
    // smoke puffs
    if (burning.length && this.smoke.length < 120 && Math.random() < 0.7) {
      const i = burning[Math.floor(Math.random() * burning.length)];
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex(S.smokeSprite()), transparent: true, depthWrite: false, opacity: 0.8 }));
      const x = (i % w.w) + Math.random(), z = ((i / w.w) | 0) + Math.random();
      s.position.set(x, w.heightAt(x, z) * LEVEL + 0.5, z);
      s.userData.life = 1;
      s.renderOrder = 8;
      this.scene.add(s); this.smoke.push(s);
    }
    for (let k = this.smoke.length - 1; k >= 0; k--) {
      const s = this.smoke[k];
      s.userData.life -= dt * 0.25;
      if (s.userData.life <= 0) { this.scene.remove(s); s.material.dispose(); this.smoke.splice(k, 1); continue; }
      s.position.y += dt * 0.6; s.position.x += dt * 0.25;
      const g = 1.6 - s.userData.life;
      s.scale.set(g, g, 1);
      s.material.opacity = s.userData.life * 0.7;
    }
  }

  clear() {
    this.pose.clear(); this.people.clear(); this.visibleWildlife.length = 0; this.fauna.clear(); this.remains.begin(); this.remains.end();
    this.slothBridges?.clear();
  }
}
