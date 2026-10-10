// Animals (instanced 3D models, see fauna.js), plus visitors and flames drawn as camera-facing sprites.

import * as THREE from 'three';
import { LEVEL, isWater, T, F as FEAT, clamp } from '../config.js';
import { ANIMALS, drawDef } from '../data/animals.js';
import * as S from '../render/sprites.js';
import { TREE_SHAPES, contactShadow } from './geometry.js';
import { PLANTS } from '../data/plants.js';
import { Fauna, PERSON_LOOKS, SNORKEL_LOOKS } from './fauna.js';
import { adultAnimalScale } from './animal-scale.js';
import { waterSurfaceY } from './terrain.js';
import { biome } from '../biome.js';
import { ActorView, animalViewRadius } from './actor-view.js';

const PX = 1 / 50; // sprite pixels to scene units
// Animals that float or paddle when they're on open water.
const FLOATERS = new Set(['duck', 'booby', 'beaver', 'otter', 'frog', 'newt', 'turtle', 'snake', 'capybara', 'tapir', 'caiman', 'hippo', 'wildebeest', 'zebra']); // (the migrating herds swim the river)
const GRAZERS = new Set(['deer', 'rabbit', 'rodent', 'capybara', 'tapir', 'peccary', 'agouti', 'zebra', 'wildebeest', 'gazelle', 'impala', 'buffalo', 'warthog', 'rhino', 'hippo', 'elephant']);
const lerpAngle = (a, b, t) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };

// Where a salmon is in its leap (0..1 across the arc), or -1 when it's swimming. Each fish leaps
// on its own clock, every three seconds or so.
export function salmonLeap(a, time) {
  const period = 2.4 + (a.id % 7) * 0.35, dur = 0.95;
  const t = (time + a.id * 1.37) % period;
  return t < dur ? t / dur : -1;
}

export class Actors {
  constructor(scene) {
    this.scene = scene;
    this.textures = new Map();
    this.fauna = new Fauna(scene);
    this.pose = new Map();      // agent id -> smoothed heading, gait, wings, and where it was drawn
    this.view = new ActorView();
    this.visibleWildlife = [];
    this.cullOffscreen = true;
    this.people = new Map();    // visitor id -> smoothed heading and gait
    this.flames = [];
    this.smoke = [];
    // a soft-edged shadow under each animal (the same fading disc as under plants)
    this.shadowGeo = contactShadow(14).scale(0.5, 1, 0.5);
    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0x0a1206, vertexColors: true, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
    this.shadows = new THREE.InstancedMesh(this.shadowGeo, this.shadowMat, 600);
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 1;
    scene.add(this.shadows);
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

  update(game, camRight, time, camera = null, viewportHeight = 0) {
    const w = game.world;
    this.view.update(camera, viewportHeight, this.cullOffscreen);
    this.visibleWildlife.length = 0;
    const seen = new Set();
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
    const F = this.fauna, k = Math.min(1, (this.lastT != null ? time - this.lastT : 0.016) * 6);
    this.lastT = time;
    F.begin();
    for (const a of game.wildlife.agents) {
      const def = drawDef(ANIMALS[a.sp], a); // (the male look, for a species whose males look different)
      seen.add(a.id);
      let st = this.pose.get(a.id);
      const xi = Math.floor(a.x), yi = Math.floor(a.y);
      const inside = w.inb(xi, yi);
      const i = inside ? w.idx(xi, yi) : -1;
      const t = inside ? w.terrain[i] : T.RIVER;
      const onWater = isWater(t) && t !== T.MARSH;
      const kind = def.sprite.kind;
      const flying = (def.move === 'fly' && (a.flying || a.alt > 0.05)) || kind === 'bat' || kind === 'ray'; // (a manta "flies" through the water)
      const ground = w.heightAt(clamp(a.x, -9, w.w + 9), clamp(a.y, -9, w.h + 9)) * LEVEL;
      const seaY = biome.look.underwater ? biome.look.underwater.level * LEVEL : null;
      // A located animal must acquire a fresh pose even before the camera has
      // reached it. Otherwise an offscreen canopy animal can never be followed.
      if (this.view.enabled && a !== this.followAgent) {
        let low = ground, high = ground;
        if (onWater || def.move === 'swim' || def.move === 'fly' && isWater(t)) {
          const surface = waterSurfaceY(w, a.x, a.y) ?? ground;
          low = Math.min(low, surface); high = Math.max(high, surface + 0.75); // leaping salmon
        }
        if (seaY != null) { low = Math.min(low, seaY); high = Math.max(high, seaY); }
        if (flying && !def.reef) high = Math.max(high, ground, seaY ?? ground) + 2;
        else if (inside && (def.move === 'fly' || def.move === 'tree')) {
          if (w.tree[i]) {
            const p = PLANTS[w.tree[i]];
            high += (TREE_SHAPES[p.look.type]?.height || 2) * (p.look.scale ?? 1) * w.treeG[i];
          } else if (w.feature[i] === FEAT.SNAG) high += 0.9;
        }
        if (!this.view.visible(a.x, low, high, a.y, animalViewRadius(def))) {
          if (st) st.visible = false;
          continue;
        }
      }
      this.visibleWildlife.push(a);
      const returning = st?.visible === false;
      if (!st) { st = { yaw: -(a.hd ?? a.orientation ?? (a.facing < 0 ? Math.PI : 0)), gait: 0, fly: 0, graze: 0, px: a.x, py: a.y, x: a.x, y: 0, z: a.y, h: 0.2 }; this.pose.set(a.id, st); }
      if (returning) {
        // Resume from the current simulation state, not the position/turn/depth last drawn
        // minutes ago. The edge margin gives normal animation blending room to resume.
        st.yaw = -(a.hd ?? a.orientation ?? (a.facing < 0 ? Math.PI : 0));
        st.px = a.x; st.py = a.y; st.depth = null; st.bend = 0; st.t = time;
        st.gait = game.speed > 0 && a.state !== 'idle' ? 1 : 0;
        st.fly = flying ? 1 : 0; st.graze = 0;
        st.rippled = a.drinkT > 0; st.leaping = salmonLeap(a, time) >= 0;
      }
      st.visible = true;
      const ageF = def.mature > 0 ? clamp(0.55 + 0.45 * a.age / (def.mature * 120), 0.55, 1) : 1;
      const sc = adultAnimalScale(def.sprite) * (a.juvenile ? def.sprite.juv ?? 0.5 : 1) * ageF; // (scale: relative proportions; show: display boost; juv: how small the young are)
      const mo = F.motion(def);
      const surf = onWater || def.move === 'swim' || def.move === 'fly' && isWater(t) ? waterSurfaceY(w, a.x, a.y) : null;
      // Flyers descend relative to the visible surface, even above a deeply carved basin.
      let y = def.move === 'fly' ? Math.max(ground, surf ?? ground) : ground;
      if (def.reef && seaY != null) {
        // under the sea: fish, turtles and rays swim at their own depth between the seabed and the
        // surface (clownfish right down in their anemone, sharks and mantas well up off the bottom),
        // drifting gently up and down
        // (each one wanders slowly up and down through its own band of water, so a school isn't a flat sheet)
        const room = Math.max(0.15, seaY - ground - 0.12);
        const sw = def.sprite.swim ?? 0.3, amp = Math.min(1, sw / 0.3); // (clownfish keep down in their anemone)
        const band = clamp(sw + amp * (0.12 * Math.sin(time * 0.11 + a.id * 1.7) + 0.06 * Math.sin(time * 0.29 + a.id * 4.1)), 0.04, 0.9);
        st.depth = st.depth == null ? band : st.depth + (band - st.depth) * k * 0.3;
        y = Math.min(seaY - 0.08, ground + 0.06 + room * st.depth + Math.sin(time * 0.9 + a.id * 2.3) * Math.min(0.04, room * 0.06));
      } else if (flying && seaY != null) y = Math.max(ground, seaY) + 0.7 + a.alt * 1.2; // (seabirds fly over the water, not the seabed)
      else if (seaY != null && def.move === 'fly' && ground < seaY - 0.05) y = seaY - mo.sink * sc + Math.sin(time * 1.3 + a.id) * 0.008; // (and settle on the water to rest, bobbing on the surface)
      else if (flying) y += (kind === 'butterfly' || kind === 'bee' ? 0.12 + a.alt * 0.3 : 0.7 + a.alt * 1.2) * (1 - (a.stoop || 0) * 0.85); // pollinators flit low over the flowers; a stooping hawk drops onto its prey
      else if (def.move === 'swim') {
        y = (surf ?? ground) - 0.05 - mo.sink * sc;
        // running salmon leap: every few seconds one arcs clear of the water, nose up then down
        const jp = def.special === 'salmon' && surf != null ? salmonLeap(a, time) : -1;
        if (jp >= 0) { y = surf + Math.sin(jp * Math.PI) * 0.75 - 0.05; st.pitch = Math.cos(jp * Math.PI) * 0.95; } else st.pitch = 0;
      }
      else if (surf != null && mo.wadeDepth) y = Math.max(ground, surf - mo.wadeDepth * sc);
      else if (surf != null && FLOATERS.has(kind)) y = def.move === 'fly' ? Math.max(ground, surf - mo.sink * sc) : surf - mo.sink * sc;
      else if (def.move === 'fly' && inside && w.tree[i] && w.treeG[i] > 0.5 && kind !== 'duck' && kind !== 'heron' && kind !== 'crane') {
        y += (TREE_SHAPES[PLANTS[w.tree[i]].look.type]?.height || 2) * (PLANTS[w.tree[i]].look.scale ?? 1) * w.treeG[i] * 0.55;
      } else if (def.move === 'tree' && inside) {
        // monkeys and sloths live up in the crowns (or on a snag's bare top)
        // (monkeys up in the sunlit top of the canopy, sloths hanging lower down)
        if (w.tree[i]) y += (TREE_SHAPES[PLANTS[w.tree[i]].look.type]?.height || 2) * (PLANTS[w.tree[i]].look.scale ?? 1) * w.treeG[i] * (kind === 'monkey' || kind === 'orangutan' ? 0.9 : 0.62);
        else if (w.feature[i] === FEAT.SNAG) y += 0.9;
      }
      // Moving between crowns of different heights, a climber (or a perched bird hopping along a
      // branch) rises or drops smoothly with a little hop, instead of snapping to each tree's height.
      const perched = def.move === 'tree' || (def.move === 'fly' && !flying && inside && !!w.tree[i]);
      if (perched && st.canopyY != null && !returning) {
        const gap = y - st.canopyY;
        st.canopyY += gap * Math.min(1, k * 0.9);
        y = st.canopyY + Math.min(0.12, Math.abs(y - st.canopyY) * 0.3);
      } else st.canopyY = perched ? y : null;
      // face the way it's moving, and blend between standing, walking and flying
      const dx = a.x - st.px, dz = a.y - st.py, yaw0 = st.yaw;
      const moving = a.state !== 'idle' && (dx * dx + dz * dz > 1e-7 || flying);
      // Intentional heading wins over small spacing corrections, which mustn't turn a resting
      // animal sideways. Drink direction also updates while it is standing still.
      const heading = a.drinkT > 0 && a.drinkAt ? a.orientation : a.hd ?? a.orientation;
      if (heading != null) st.yaw = lerpAngle(st.yaw, -heading, Math.min(1, k * 1.6));
      else if (dx * dx + dz * dz > 1e-6) st.yaw = lerpAngle(st.yaw, Math.atan2(-dz, dx), Math.min(1, k * 1.6));
      // a swimmer that bends (the shark) curves into its turns: the tail swings to the inside
      if (mo.bend) {
        let dy = st.yaw - yaw0; dy -= Math.round(dy / (Math.PI * 2)) * Math.PI * 2;
        const rate = dy / Math.max(1e-3, time - (st.t ?? time - 0.016));
        st.bend = (st.bend || 0) + (clamp(-rate * 0.45, -1, 1) - (st.bend || 0)) * Math.min(1, k * 0.8);
      }
      st.t = time;
      st.px = a.x; st.py = a.y;
      // a longer stride at a sprint, a shorter one at a creep
      st.gait += ((moving ? Math.min(1.35, 0.55 + 0.45 * (a.run || 1)) : 0) - st.gait) * k;
      st.fly += ((flying ? 1 : 0) - st.fly) * k * 1.5;
      // heads down to graze, and for everyone drinking at the water's edge or feeding at a kill;
      // low while stalking, sniffing at a neighbour or locking horns, up when something's wrong
      const aligned = heading == null || Math.cos(st.yaw + heading) > 0.95;
      const stalking = a.state === 'hunt' && a.hunt?.phase === 'creep';
      const head = a.state === 'feed' || a.sparT > 0 ? 1 : stalking ? 0.45 : a.greetT > 0 ? 0.35 : a.alertT > 0 ? -0.3
        : !moving && (a.drinkT > 0 ? aligned : (GRAZERS.has(kind) && Math.sin(time * 0.35 + a.id * 1.7) > 0.1)) ? 1 : 0;
      st.graze += (head - st.graze) * k * (head < 0 ? 1.2 : 0.5);
      // stalking cats sink low to the ground
      st.crouch = (st.crouch || 0) + ((stalking ? 1 : 0) - (st.crouch || 0)) * k;
      if (st.crouch > 0.01) y -= st.crouch * (def.sprite.leg || def.sprite.h || 8) * sc * 0.3;
      // sparring rivals lunge at each other and back
      let ax = a.x, az = a.y;
      if (a.sparT > 0) { const lunge = Math.max(0, Math.sin(time * 5 + (a.id & 1) * Math.PI)) * 0.08; ax += Math.cos(st.yaw) * lunge; az -= Math.sin(st.yaw) * lunge; }
      F.add(def, ax, y, az, st.yaw, sc, a.phase * Math.PI, st.gait, st.fly, mo.bend ? st.bend : st.graze, st.pitch || 0);
      st.sc = sc; st.eye = mo.eye; st.eyePivot = mo.eyePivot; st.bob = Math.abs(Math.sin(a.phase * Math.PI)) * (mo.bob || 0) * st.gait * (1 - st.fly);
      // (the marker lies on the ground under a flyer, at the surface under a swimmer, else at its feet)
      st.base = flying && !def.reef ? Math.max(ground, surf ?? ground) : def.move === 'swim' && surf != null ? surf : y;
      st.foot = (def.sprite.len || def.sprite.size || 10) * sc;
      st.x = a.x; st.y = y; st.z = a.y; st.h = (def.sprite.h ? def.sprite.h + (def.sprite.leg || 0) : (def.sprite.size || def.sprite.len || 10) * 0.6) * sc;
      st.center ||= new THREE.Vector3();
      st.center.copy(mo.center); st.center.y += st.bob;
      st.center.applyMatrix4(F.m); // same heading, pitch, scale and height as the instance
      if (def.move !== 'swim' && !(surf != null && FLOATERS.has(kind))) shadow(a.x, ground, a.y, (def.sprite.len || def.sprite.size || 10) * sc * (0.4 / 0.62) * (flying || def.reef ? 0.7 : 1));
    }
    for (const id of this.pose.keys()) if (!seen.has(id)) this.pose.delete(id);

    // ---- kills: the prey lying on its side where it fell, sinking away as it's eaten
    for (const c of game.wildlife.carcasses || []) {
      const cdef = ANIMALS[c.sp];
      if (!cdef) continue;
      const def = drawDef(cdef, c);
      const ageF = def.mature > 0 ? clamp(0.55 + 0.45 * c.age / (def.mature * 120), 0.55, 1) : 1;
      const sc = adultAnimalScale(def.sprite) * ageF, ground = w.heightAt(clamp(c.x, 0, w.w), clamp(c.y, 0, w.h)) * LEVEL;
      const left = clamp(c.t / (c.max * 0.3), 0, 1); // (the last stretch: bones and a dark patch)
      const lift = (def.sprite.h || 10) * sc * 0.32 * left - (1 - left) * (def.sprite.h || 10) * sc * 0.2;
      const yaw = -c.yaw;
      if (this.view.enabled && !this.view.visible(c.x, ground - 0.2, ground + 0.6, c.y, animalViewRadius(def))) continue;
      F.add(def, c.x, ground + lift, c.y, yaw, sc, 0, 0, 0, 0.6, 0, c.side * Math.PI / 2);
      shadow(c.x, ground, c.y, (def.sprite.len || 10) * sc * 0.55);
    }

    // ---- visitors: same instanced 3D style as the wildlife
    const pseen = new Set();
    for (const v of game.residents ? game.visitors.agents.concat(game.residents) : game.visitors.agents) {
      pseen.add(v.id);
      let st = this.people.get(v.id);
      if (!st) { st = { yaw: 0, gait: 0, px: v.x, py: v.y }; this.people.set(v.id, st); }
      const dx = v.x - st.px, dz = v.y - st.py;
      if (dx * dx + dz * dz > 1e-7) st.yaw = lerpAngle(st.yaw, Math.atan2(-dz, dx), Math.min(1, k * 1.6));
      st.px = v.x; st.py = v.y;
      st.gait += ((v.pause > 0 ? 0 : 1) - st.gait) * k;
      const onWet = w.inb(Math.floor(v.x), Math.floor(v.y)) && isWater(w.terrain[w.idx(Math.floor(v.x), Math.floor(v.y))]);
      const gy = w.heightAt(v.x, v.y) * LEVEL + (onWet ? 0.08 : 0); // boardwalks sit above the water
      const sea = biome.look.underwater ? biome.look.underwater.level * LEVEL : null;
      if (sea != null && gy < sea - 0.05) {
        // on the reef: a snorkeler, face down at the surface, finning along the trail
        F.add(SNORKEL_LOOKS[v.look % SNORKEL_LOOKS.length], v.x, sea - 0.035, v.y, st.yaw, PX * 0.6, v.phase * Math.PI * 0.7, Math.max(0.6, st.gait), 0, 0, -Math.PI / 2 + 0.12);
        shadow(v.x, gy, v.y, 0.14);
        continue;
      }
      F.add(PERSON_LOOKS[v.look % PERSON_LOOKS.length], v.x, gy, v.y, st.yaw, PX * 0.6, v.phase * Math.PI, st.gait, 0, 0);
      shadow(v.x, gy, v.y, 0.1);
    }
    F.end();
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
    this.pose.clear(); this.people.clear(); this.visibleWildlife.length = 0; this.fauna.clear();
  }
}
