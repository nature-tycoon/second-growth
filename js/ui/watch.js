// Watch mode: for sitting back. The panels go, thin letterbox bars come in, and the camera directs
// itself: it picks an animal doing something worth seeing (a hunt, a meal, a sparring match, a calf
// at its mother's side), glides over and follows it for a while with a slow drift round, now and
// then pulls back for a wide view of the land, and moves on. A caption names the animal and what
// it's doing. Keystone moments still play (they're the best of it), and the director picks up
// again when one ends. Eye level (render3d/eye-camera.js) rides along low behind each animal
// instead of looking down on it.
//
// The game carries on underneath at whatever speed it was, and the bar has the same speed buttons
// as the top bar (Space and 1–3 work too). The map can't be painted or panned while watching: a
// click or a moved mouse only brings up the controls.

import { animalDef } from '../data/animals.js';
import { dormancyStatus } from '../data/animal-dormancy.js';
import { SEASONS, clamp } from '../config.js';
import { adultAnimalScale } from '../render3d/animal-scale.js';
import { track } from '../analytics.js';

const SHOT = { follow: 16, eye: 18, wide: 11 }; // seconds a shot lasts
const LONGEST = 40;                              // a hunt or a chase keeps the camera, up to this long

// How worth watching an animal is right now: what it's doing, weighted.
function interest(a) {
  if (a.leaving || dormancyStatus(a)) return 0;
  let s = a.state === 'hunt' ? (a.hunt?.phase === 'rush' ? 9 : 6) : a.state === 'carry' ? 6 : a.state === 'feed' ? (a.prey ? 6 : 2.5)
    : a.state === 'spar' ? 6 : a.state === 'flee' ? 4 : a.state === 'play' ? 4 : a.drinkT > 0 ? 3.5 : a.bugleT > 0 ? 4
    : a.state === 'forage' ? 2 : a.bird?.kind === 'soar' ? 2.5 : a.state === 'walk' || a.state === 'fly' ? 1.5 : 1;
  if (a.mom != null && a.follow) s += 1.5; // a young one at its mother's side
  return s;
}
const busy = a => a.state === 'hunt' || a.state === 'flee' || a.state === 'carry' || a.state === 'spar' || (a.state === 'feed' && a.prey);

export class Watch {
  constructor(game, renderer, ui) {
    this.game = game; this.renderer = renderer; this.ui = ui;
    this.on = false; this.eyeLevel = false;
    this.shot = null; this.recent = []; this.n = 0;
  }

  toggle() { if (this.on) this.stop(); else this.start(); }

  start() {
    if (this.on) return;
    const ui = this.ui, r = this.renderer;
    if (ui.photo) ui.togglePhoto();
    ui.closeInfo();
    this.on = true;
    this.prev = { x: r.target.x, z: r.target.z, zoom: r.zoom, az: r.azTarget };
    ui.state.clean = true;
    document.body.classList.add('watch-mode');
    this.build();
    requestAnimationFrame(() => this.el.classList.add('bars'));
    this.shot = null; this.n = 0;
    this.showControls();
    track('watch_mode', { map: this.game.map });
  }

  stop() {
    if (!this.on) return;
    const ui = this.ui, r = this.renderer;
    this.on = false;
    this.endShot();
    r.setEyeLevel(null);
    ui.follow = null; this.game.selectedAgent = null;
    r.flyTo(this.prev.x, this.prev.z, this.prev.zoom, 1.4); r.azTarget = this.prev.az;
    ui.state.clean = !!ui.photo || !!ui.moment;
    document.body.classList.remove('watch-mode');
    this.el.classList.remove('bars', 'show');
  }

  setEyeLevel(on) {
    this.eyeLevel = on;
    this.el?.querySelector('[data-a=eye]').classList.toggle('on', on);
    if (on) track('watch_eye_level', { map: this.game.map });
    // carry on with the same animal, just from the new place
    const s = this.shot;
    if (s?.agent) this.frameAnimal(s.agent, true); else this.next();
  }

  build() {
    if (this.el) return;
    const o = document.createElement('div'); o.id = 'watch';
    o.innerHTML = `<div class="lb lb-top"></div><div class="lb lb-bot"></div>
      <div class="w-cap"><b></b><span></span></div>
      <div class="w-bar"><span class="w-hint">Esc to stop · N next · F eye level</span>
        <div class="speed w-speed">${document.getElementById('speed').innerHTML}</div>
        <button class="btn secondary" data-a="next">Next</button><button class="btn secondary" data-a="eye">Eye level</button><button class="btn" data-a="done">Done</button></div>`;
    document.body.appendChild(o);
    this.el = o; this.cap = o.querySelector('.w-cap');
    o.querySelector('[data-a=done]').addEventListener('click', () => this.stop());
    o.querySelector('[data-a=next]').addEventListener('click', () => this.next());
    o.querySelector('[data-a=eye]').addEventListener('click', () => this.setEyeLevel(!this.eyeLevel));
    o.querySelectorAll('.w-speed button').forEach(b => b.addEventListener('click', () => this.ui.setSpeed(+b.dataset.speed)));
    // the whole screen catches the pointer, so watching never paints or pans the map by accident
    const show = () => this.showControls();
    o.addEventListener('pointermove', show); o.addEventListener('pointerdown', show);
    o.addEventListener('wheel', e => { e.preventDefault(); show(); }, { passive: false });
  }

  showControls() {
    this.el.classList.add('show');
    clearTimeout(this.hideT);
    this.hideT = setTimeout(() => { if (this.el.querySelector('.w-bar').matches(':hover')) this.showControls(); else this.el.classList.remove('show'); }, 2600);
  }

  // Keys while watching (see Input.key). True when the key was used.
  key(k) {
    if (k === 'escape' || k === 'c') { this.stop(); return true; }
    if (k === 'n' || k === 'arrowright') { this.next(); return true; }
    if (k === 'f') { this.setEyeLevel(!this.eyeLevel); return true; }
    this.showControls();
    return false;
  }

  // ------------------------------------------------------------ directing
  frame(dt) {
    if (!this.on) return;
    const g = this.game, r = this.renderer, ui = this.ui;
    // a keystone moment has the camera: wait it out, and start afresh after
    if (ui.moment) {
      if (this.shot) { this.endShot(); this.shot = null; }
      this.cap.classList.remove('show');
      return;
    }
    const s = this.shot;
    if (!s) { this.next(); return; }
    s.t += dt;
    const a = s.agent;
    if (a && !g.wildlife.hasAgent(a)) { this.next(); return; }
    // an animal that never came into view (in a burrow, under the canopy) isn't worth the wait
    if (a && s.t > 3.5 && !r.actors.pose.get(a.id)?.visible) { this.next(); return; }
    const long = a && busy(a) && s.t < LONGEST;
    if (s.t > s.len && !long) { this.next(); return; }
    if (a && !s.eye) { ui.follow = a; g.selectedAgent = a; }
    // the slow drift round the subject (the usual view only)
    if (!s.eye && s.t > 1.2) r.azTarget += s.drift * dt;
    if ((s.capAt = (s.capAt || 0) - dt) <= 0) { s.capAt = 0.5; this.caption(s); }
  }

  next() {
    this.endShot();
    const g = this.game, wide = !this.eyeLevel && this.n % 4 === 3;
    this.n++;
    const a = wide ? null : this.pick();
    if (a) this.frameAnimal(a);
    else this.wideShot();
    this.recent.unshift(a ? animalDef(a, g.catalog).key : null);
    this.recent.length = Math.min(this.recent.length, 3);
  }

  pick() {
    const g = this.game, last = this.shot?.agent, all = g.wildlife.agents.concat(g.wildlife.flyovers);
    let total = 0;
    const w = all.map(a => {
      let s = interest(a);
      if (!s) return 0;
      if (a === last) s *= 0.05;
      else if (this.recent.includes(animalDef(a, g.catalog).key)) s *= 0.3;
      total += s; return s;
    });
    if (!total) return null;
    let x = Math.random() * total;
    for (let i = 0; i < all.length; i++) if ((x -= w[i]) <= 0 && w[i] > 0) return all[i];
    return null;
  }

  frameAnimal(a, keep = false) {
    const r = this.renderer, ui = this.ui, g = this.game, eye = this.eyeLevel;
    const t = keep && this.shot ? this.shot.t : 0;
    this.endShot();
    this.shot = { agent: a, t, len: eye ? SHOT.eye : SHOT.follow, eye, drift: (Math.random() < 0.5 ? -1 : 1) * (0.05 + Math.random() * 0.04) };
    if (eye) {
      ui.follow = null; g.selectedAgent = null;
      r.centerOnAnimal(a); r.followAgent = null; // (so its pose is fresh, and the usual view is near it to come back to)
      r.setEyeLevel(a);
    } else {
      r.setEyeLevel(null);
      // close, but not so close a big animal or a herd overflows the frame; a small bird closer still
      const def = animalDef(a, g.catalog), tall = (def.sprite.h || 40) * adultAnimalScale(def.sprite);
      r.flyTo(a.x, a.y, clamp(0.9 / tall, 2.3, 4.2) * (0.9 + Math.random() * 0.25), keep ? 0.6 : 2.2);
      ui.follow = null; g.selectedAgent = a;
      // join the animal once the glide is over (following straight away would cut the glide short)
      this.shot.followAt = setTimeout(() => { if (this.shot?.agent === a && !this.shot.eye) { r.glideToAnimal(a); ui.follow = a; } }, keep ? 600 : 2200);
    }
    this.caption(this.shot, true);
  }

  wideShot() {
    const r = this.renderer, w = this.game.world;
    r.setEyeLevel(null);
    this.ui.follow = null; this.game.selectedAgent = null;
    // somewhere with something growing, well inside the map
    let x = w.w / 2, y = w.h / 2;
    for (let k = 0; k < 12; k++) {
      const tx = Math.floor(w.w * (0.2 + Math.random() * 0.6)), ty = Math.floor(w.h * (0.2 + Math.random() * 0.6));
      x = tx; y = ty;
      if (w.tree[ty * w.w + tx] || w.shrub[ty * w.w + tx]) break; // (trees or shrubs: something to look at)
    }
    r.flyTo(x, y, 0.75 + Math.random() * 0.4, 3);
    this.shot = { agent: null, t: 0, len: SHOT.wide, eye: false, drift: (Math.random() < 0.5 ? -1 : 1) * 0.06 };
    this.caption(this.shot, true);
  }

  endShot() {
    const s = this.shot;
    if (!s) return;
    clearTimeout(s.followAt);
  }

  caption(s, fresh = false) {
    const g = this.game, b = this.cap.querySelector('b'), sp = this.cap.querySelector('span');
    if (s.agent) {
      const a = s.agent, def = animalDef(a, g.catalog);
      b.textContent = def.name;
      sp.textContent = a.passing ? 'Flying through' : this.ui.agentStatus(a, def);
    } else {
      b.textContent = g.catalog.definition.farm;
      sp.textContent = `${SEASONS[g.season]}, year ${g.year}`;
    }
    if (fresh) { this.cap.classList.remove('show'); setTimeout(() => this.on && this.shot === s && this.cap.classList.add('show'), 900); }
  }
}
