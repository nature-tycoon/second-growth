// Animals (instanced 3D models, see fauna.js), plus visitors and flames drawn as camera-facing sprites.

import * as THREE from 'three';
import { LEVEL, isWater, T, F as FEAT, clamp } from '../config.js';
import { ANIMALS, drawDef } from '../data/animals.js';
import * as S from '../render/sprites.js';
import { TREE_SHAPES } from './geometry.js';
import { PLANTS } from '../data/plants.js';
import { Fauna, PERSON_LOOKS, SNORKEL_LOOKS } from './fauna.js';
import { adultAnimalScale } from './animal-scale.js';
import { waterSurfaceY } from './terrain.js';
import { biome } from '../biome.js';

const PX = 1 / 50; // sprite pixels to scene units
// Animals that float or paddle when they're on open water.
const FLOATERS = new Set(['duck', 'beaver', 'otter', 'frog', 'newt', 'turtle', 'snake', 'capybara', 'tapir', 'caiman', 'hippo', 'wildebeest', 'zebra']); // (the migrating herds swim the river)
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
    this.people = new Map();    // visitor id -> smoothed heading and gait
    this.flames = [];
    this.smoke = [];
    this.shadowGeo = new THREE.CircleGeometry(0.5, 14).rotateX(-Math.PI / 2);
    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0x0a1206, transparent: true, opacity: 0.22, depthWrite: false });
    this.shadows = new THREE.InstancedMesh(this.shadowGeo, this.shadowMat, 600);
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 1;
    scene.add(this.shadows);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.36, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe68a, transparent: true, opacity: 0.9, depthWrite: false }));
    this.ring.visible = false; this.ring.renderOrder = 6;
    scene.add(this.ring);
    this.m = new THREE.Matrix4();
  }

  tex(canvas) {
    let t = this.textures.get(canvas);
    if (!t) { t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; this.textures.set(canvas, t); }
    return t;
  }

  update(game, camRight, time) {
    const w = game.world;
    const seen = new Set();
    let sh = 0;
    const shadow = (x, y, z, r) => {
      if (sh >= 600) return;
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
      if (!st) { st = { yaw: Math.random() * Math.PI * 2, gait: 0, fly: 0, graze: 0, px: a.x, py: a.y, x: a.x, y: 0, z: a.y, h: 0.2 }; this.pose.set(a.id, st); }
      const xi = Math.floor(a.x), yi = Math.floor(a.y);
      const inside = w.inb(xi, yi);
      const i = inside ? w.idx(xi, yi) : -1;
      const t = inside ? w.terrain[i] : T.RIVER;
      const onWater = isWater(t) && t !== T.MARSH;
      const kind = def.sprite.kind;
      const flying = (def.move === 'fly' && (a.flying || a.alt > 0.05) && kind !== 'duck') || (kind === 'duck' && a.alt > 0.3) || kind === 'bat' || kind === 'ray'; // (a manta "flies" through the water)
      const ground = w.heightAt(clamp(a.x, -9, w.w + 9), clamp(a.y, -9, w.h + 9)) * LEVEL;
      const ageF = def.mature > 0 ? clamp(0.55 + 0.45 * a.age / (def.mature * 120), 0.55, 1) : 1;
      const sc = adultAnimalScale(def.sprite) * (a.juvenile ? def.sprite.juv ?? 0.5 : 1) * ageF; // (scale: relative proportions; show: display boost; juv: how small the young are)
      const mo = F.motion(def);
      let y = ground;
      const surf = onWater || def.move === 'swim' ? waterSurfaceY(w, a.x, a.y) : null;
      const seaY = biome.look.underwater ? biome.look.underwater.level * LEVEL : null;
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
      else if (seaY != null && def.move === 'fly' && ground < seaY - 0.05) y = seaY - (mo.sink || (def.sprite.size || 10) * 0.22) * sc + Math.sin(time * 1.3 + a.id) * 0.008; // (and settle on the water to rest, bobbing on the surface)
      else if (flying) y += kind === 'butterfly' || kind === 'bee' ? 0.12 + a.alt * 0.3 : 0.7 + a.alt * 1.2; // pollinators flit low over the flowers
      else if (def.move === 'swim') {
        y = (surf ?? ground) - 0.05 - mo.sink * sc;
        // running salmon leap: every few seconds one arcs clear of the water, nose up then down
        const jp = def.special === 'salmon' && surf != null ? salmonLeap(a, time) : -1;
        if (jp >= 0) { y = surf + Math.sin(jp * Math.PI) * 0.75 - 0.05; st.pitch = Math.cos(jp * Math.PI) * 0.95; } else st.pitch = 0;
      }
      else if (surf != null && FLOATERS.has(kind)) y = surf - mo.sink * sc;
      else if (def.move === 'fly' && inside && w.tree[i] && w.treeG[i] > 0.5 && kind !== 'duck' && kind !== 'heron' && kind !== 'crane') {
        y += (TREE_SHAPES[PLANTS[w.tree[i]].look.type]?.height || 2) * (PLANTS[w.tree[i]].look.scale ?? 1) * w.treeG[i] * 0.55;
      } else if (def.move === 'tree' && inside) {
        // monkeys and sloths live up in the crowns (or on a snag's bare top)
        // (monkeys up in the sunlit top of the canopy, sloths hanging lower down)
        if (w.tree[i]) y += (TREE_SHAPES[PLANTS[w.tree[i]].look.type]?.height || 2) * (PLANTS[w.tree[i]].look.scale ?? 1) * w.treeG[i] * (kind === 'monkey' || kind === 'orangutan' ? 0.9 : 0.62);
        else if (w.feature[i] === FEAT.SNAG) y += 0.9;
      }
      // face the way it's moving, and blend between standing, walking and flying
      const dx = a.x - st.px, dz = a.y - st.py, yaw0 = st.yaw;
      const moving = a.state !== 'idle' && (dx * dx + dz * dz > 1e-7 || flying);
      if (dx * dx + dz * dz > 1e-6) st.yaw = lerpAngle(st.yaw, Math.atan2(-dz, dx), Math.min(1, k * 1.6));
      // a swimmer that bends (the shark) curves into its turns: the tail swings to the inside
      if (mo.bend) {
        let dy = st.yaw - yaw0; dy -= Math.round(dy / (Math.PI * 2)) * Math.PI * 2;
        const rate = dy / Math.max(1e-3, time - (st.t ?? time - 0.016));
        st.bend = (st.bend || 0) + (clamp(-rate * 0.45, -1, 1) - (st.bend || 0)) * Math.min(1, k * 0.8);
      }
      st.t = time;
      st.px = a.x; st.py = a.y;
      st.gait += ((moving ? 1 : 0) - st.gait) * k;
      st.fly += ((flying ? 1 : 0) - st.fly) * k * 1.5;
      // heads down to graze, and for everyone drinking at the water's edge
      const grazing = !moving && (a.drinkT > 0 || (GRAZERS.has(kind) && Math.sin(time * 0.35 + a.id * 1.7) > 0.1));
      st.graze += ((grazing ? 1 : 0) - st.graze) * k * 0.5;
      F.add(def, a.x, y, a.y, st.yaw, sc, a.phase * Math.PI, st.gait, st.fly, mo.bend ? st.bend : st.graze, st.pitch || 0);
      st.sc = sc; st.eye = mo.eye; st.eyePivot = mo.eyePivot; st.bob = Math.abs(Math.sin(a.phase * Math.PI)) * (mo.bob || 0) * st.gait * (1 - st.fly);
      st.x = a.x; st.y = y; st.z = a.y; st.h = (def.sprite.h ? def.sprite.h + (def.sprite.leg || 0) : (def.sprite.size || def.sprite.len || 10) * 0.6) * sc;
      if (def.move !== 'swim' && !(surf != null && FLOATERS.has(kind))) shadow(a.x, ground, a.y, (def.sprite.len || def.sprite.size || 10) * sc * (0.4 / 0.62) * (flying || def.reef ? 0.7 : 1));
    }
    for (const id of this.pose.keys()) if (!seen.has(id)) this.pose.delete(id);

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
    this.shadows.instanceMatrix.needsUpdate = true;

    // ---- selection ring
    const sel = this.clean ? null : game.selectedAgent;
    if (sel) {
      this.ring.visible = true;
      this.ring.position.set(sel.x, w.heightAt(clamp(sel.x, -9, w.w + 9), clamp(sel.y, -9, w.h + 9)) * LEVEL + 0.03, sel.y);
      const s = 1 + Math.sin(time * 4) * 0.08;
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
    this.pose.clear(); this.people.clear(); this.fauna.clear();
  }
}
