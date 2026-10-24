// Watch mode: for sitting back. The panels go, thin letterbox bars come in, and the camera directs
// itself: it picks an animal doing something worth seeing (a hunt, a meal, a sparring match, a calf
// at its mother's side), glides over and follows it for a while with a slow drift round, now and
// then pulls back for a wide view of the land, and moves on. A caption names the animal and what
// it's doing. Keystone moments still play (they're the best of it), and the director picks up
// again when one ends. Eye level (render3d/eye-camera.js) rides along low behind each animal
// instead of looking down on it.
//
// The game carries on underneath at whatever speed it was, and the bar has the same speed buttons
// as the top bar (Space, 0 and 1–3 work too). The map can't be painted or panned while watching: a
// click or a moved mouse only brings up the controls. The bar can be tucked away into one small
// button (the − on its end), and then it stays away until that button is pressed.
//
// The species chip at the bar's start narrows the director to one species: it moves between that
// species' animals (stays on the one there is, if there's only one) and skips the wide shots.
//
// At eye level, a drag or Q / E swings the view round the animal it's following (it keeps following).
// WASD (or the arrows) lets go of the animal and walks about on foot: W / S forward
// and back, A / D step sideways, Q / E turn (as they rotate the usual view), Shift runs, and a
// drag looks round. Next (N) goes back to the animals. On a touch screen the thumbstick shows at eye
// level and walks the same way (up forward, sideways turns).

import { animalDef } from '../data/animals.js';
import { dormancyStatus } from '../data/animal-dormancy.js';
import { SEASONS, clamp } from '../config.js';
import { adultAnimalScale } from '../render3d/animal-scale.js';
import { track } from '../analytics.js';
import { animalThumb } from './thumbnails.js';

const SHOT = { follow: 16, eye: 18, wide: 11 }; // seconds a shot lasts
const TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches; // (as the thumbstick shows)
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
    this.on = false; this.eyeLevel = false; this.min = false; this.species = null;
    this.shot = null; this.recent = []; this.n = 0;
    this.walking = false;
  }

  toggle() { if (this.on) this.stop(); else this.start(); }

  start() {
    if (this.on) return;
    const ui = this.ui, r = this.renderer;
    this.species = null;
    if (ui.photo) ui.togglePhoto();
    ui.closeInfo();
    this.on = true;
    this.prev = { x: r.target.x, z: r.target.z, zoom: r.zoom, az: r.azTarget };
    ui.state.clean = true;
    document.body.classList.add('watch-mode');
    document.body.classList.toggle('watch-eye', this.eyeLevel);
    this.build();
    this.showSpecies();
    requestAnimationFrame(() => this.el.classList.add('bars'));
    this.shot = null; this.n = 0;
    this.showControls();
    track('watch_mode', { map: this.game.map });
  }

  stop() {
    if (!this.on) return;
    const ui = this.ui, r = this.renderer;
    this.on = false;
    this.walking = false;
    this.endShot();
    this.closeMenu();
    r.setEyeLevel(null);
    ui.follow = null; this.game.selectedAgent = null;
    r.flyTo(this.prev.x, this.prev.z, this.prev.zoom, 1.4); r.azTarget = this.prev.az;
    ui.state.clean = !!ui.photo || !!ui.moment;
    document.body.classList.remove('watch-mode', 'watch-eye');
    this.el.classList.remove('bars', 'show');
  }

  setEyeLevel(on) {
    this.eyeLevel = on;
    document.body.classList.toggle('watch-eye', on);
    if (this.walking) { this.walking = false; this.shot = null; }
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
      <div class="w-menu" role="listbox"></div>
      <div class="w-bar"><button class="w-sp" data-a="species" title="Watch one species (S)" aria-haspopup="listbox"><span></span><svg viewBox="0 0 16 16"><path d="M4 10l4-4 4 4"/></svg></button>
        <div class="speed w-speed">${document.getElementById('speed').innerHTML}</div>
        <button class="btn secondary" data-a="next" title="Next animal (N)">Next</button><button class="btn secondary" data-a="eye" title="Eye level (F)">Eye level</button><button class="btn" data-a="done" title="Stop watching (Esc)">Done</button>
        <button class="w-min" data-a="min" title="Hide the controls (H)"><svg viewBox="0 0 16 16"><path d="M4 8h8"/></svg></button></div>
      <button class="w-expand" title="Show the controls"><svg viewBox="0 0 16 16"><path d="M4 10l4-4 4 4"/></svg></button>`;
    document.body.appendChild(o);
    this.el = o; this.cap = o.querySelector('.w-cap');
    o.querySelector('[data-a=done]').addEventListener('click', () => this.stop());
    o.querySelector('[data-a=next]').addEventListener('click', () => this.next());
    o.querySelector('[data-a=eye]').addEventListener('click', () => this.setEyeLevel(!this.eyeLevel));
    o.querySelector('[data-a=min]').addEventListener('click', () => this.setMinimized(true));
    o.querySelector('.w-expand').addEventListener('click', () => this.setMinimized(false));
    o.querySelector('[data-a=species]').addEventListener('click', () => this.toggleMenu());
    this.menu = o.querySelector('.w-menu');
    this.menu.addEventListener('click', e => { const b = e.target.closest('button'); if (b) this.setSpecies(b.dataset.key || null); });
    // a click anywhere else puts the list away
    o.addEventListener('pointerdown', e => { if (this.menuOpen && !e.target.closest('.w-menu, [data-a=species]')) this.closeMenu(); });
    o.querySelectorAll('.w-speed button').forEach(b => b.addEventListener('click', () => this.ui.setSpeed(+b.dataset.speed)));
    // the whole screen catches the pointer, so watching never paints or pans the map by accident
    const show = () => this.showControls();
    o.addEventListener('pointermove', show); o.addEventListener('pointerdown', show);
    // at eye level a drag over the view swings round the animal, or looks round when walking
    o.addEventListener('pointerdown', e => {
      if (!(this.walking || this.orbiting()) || e.target.closest('.w-bar, .w-menu, .w-expand')) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      o.setPointerCapture?.(e.pointerId);
    });
    o.addEventListener('pointermove', e => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId || !(this.walking || this.orbiting())) return;
      const L = this.renderer.eyeLook, k = 2.4 / Math.max(300, innerHeight);
      L.yaw += (e.clientX - d.x) * k; L.pitch -= (e.clientY - d.y) * k;
      d.x = e.clientX; d.y = e.clientY;
    });
    const drop = e => { if (this.drag?.id === e.pointerId) this.drag = null; };
    o.addEventListener('pointerup', drop); o.addEventListener('pointercancel', drop);
    o.addEventListener('wheel', e => { e.preventDefault(); show(); }, { passive: false });
  }

  setMinimized(on) {
    this.min = on;
    if (on) this.closeMenu();
    this.el.classList.toggle('min', on);
    if (on) { clearTimeout(this.hideT); this.el.classList.remove('show'); } else this.showControls();
  }

  showControls() {
    this.el.classList.toggle('min', this.min);
    if (this.min) return;
    this.el.classList.add('show');
    clearTimeout(this.hideT);
    this.hideT = setTimeout(() => {
      if (this.menuOpen || this.el.querySelector('.w-bar').matches(':hover')) this.showControls(); else this.el.classList.remove('show');
    }, 2600);
  }

  // ------------------------------------------------------------ one species
  // The species there are to watch right now (awake, not leaving), most numerous first.
  watchable() {
    const g = this.game, by = new Map();
    for (const a of g.wildlife.agents.concat(g.wildlife.flyovers)) {
      if (!interest(a)) continue;
      const def = animalDef(a, g.catalog), e = by.get(def.key);
      if (e) e.n++; else by.set(def.key, { key: def.key, name: def.name, n: 1 });
    }
    return [...by.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  }

  toggleMenu() { if (this.menuOpen) this.closeMenu(); else this.openMenu(); }

  openMenu() {
    if (this.min) this.setMinimized(false);
    const cat = this.game.catalog, list = this.watchable();
    const row = (key, name, n, img) => `<button role="option" aria-selected="${this.species === key}" class="${this.species === key ? 'on' : ''}"${key ? ` data-key="${key}"` : ''}>
      ${img ? `<img src="${img}" alt="">` : '<i></i>'}<span>${name}</span>${n ? `<em>${n}</em>` : ''}</button>`;
    this.menu.innerHTML = row(null, 'All animals', 0, null)
      + (list.length ? list.map(s => row(s.key, s.name, s.n, animalThumb(s.key, cat))).join('') : '<p>No animals out right now</p>');
    this.menuOpen = true;
    this.el.classList.add('menu');
    this.showControls();
    this.menu.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  }

  closeMenu() {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    this.el.classList.remove('menu');
  }

  setSpecies(key) {
    const changed = key !== this.species;
    this.species = key;
    this.speciesName = key && this.menu.querySelector(`[data-key="${key}"] span`)?.textContent;
    this.closeMenu();
    this.showSpecies();
    if (!changed) return;
    if (key) track('watch_species', { map: this.game.map, species: key });
    // straight to it, unless the camera is already on one
    const a = this.shot?.agent;
    if (key && (!a || !this.game.wildlife.hasAgent(a) || animalDef(a, this.game.catalog).key !== key)) this.next();
  }

  showSpecies() {
    const b = this.el.querySelector('[data-a=species]');
    b.querySelector('span').textContent = this.species ? this.speciesName : 'All animals';
    b.classList.toggle('on', !!this.species);
  }

  // Keys while watching (see Input.key). True when the key was used.
  key(k) {
    if (k === 'escape' && this.menuOpen) { this.closeMenu(); return true; }
    if (k === 's') { this.toggleMenu(); return true; }
    if (k === 'escape' || k === 'c') { this.stop(); return true; }
    if (k === 'n' || k === 'arrowright') { this.next(); return true; }
    if (k === 'f') { this.setEyeLevel(!this.eyeLevel); return true; }
    if (k === 'h') { this.setMinimized(!this.min); return true; }
    this.showControls();
    return false;
  }

  // At eye level behind an animal: a drag or Q / E swings round it (EyeCamera.update).
  orbiting() { return this.on && this.eyeLevel && !this.walking && !!this.renderer.eyeAgent; }

  // ------------------------------------------------------------ on foot
  // Let go of the animal and walk from where the eye is (Input, on WASD at eye level). True when walking.
  walk() {
    if (this.walking) return true;
    if (!this.eyeLevel || this.ui.moment || !this.renderer.walkEye()) return false;
    this.endShot();
    this.walking = true;
    this.ui.follow = null; this.game.selectedAgent = null;
    this.shot = { agent: null, t: 0, len: Infinity, eye: true, walk: true };
    this.caption(this.shot, true);
    track('watch_walk', { map: this.game.map });
    return true;
  }

  // ------------------------------------------------------------ directing
  frame(dt) {
    if (!this.on) return;
    const g = this.game, r = this.renderer, ui = this.ui;
    // walking about: nothing to direct (a keystone moment takes over as usual, and the animals come back after)
    if (this.walking) {
      if (!ui.moment) return;
      this.walking = false; r.setEyeLevel(null);
    }
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
    // killed (or died where it stood): stay on its carcass while it's eaten, until it's gone
    if (a && !g.wildlife.hasAgent(a)) {
      const body = !s.eye && g.wildlife.carcasses.find(c => c.id === a.id);
      if (!body) { this.next(); return; }
      if (!s.body) { s.body = true; this.caption(s, true); }
      ui.follow = a; g.selectedAgent = null;
      if (s.t > 1.2) r.azTarget += s.drift * dt;
      if ((s.capAt = (s.capAt || 0) - dt) <= 0) { s.capAt = 0.5; this.caption(s); }
      return;
    }
    // an animal that never came into view (in a burrow, under the canopy) isn't worth the wait
    if (a && s.t > 3.5 && !r.actors.pose.get(a.id)?.visible) { this.next(); return; }
    // (nor while it's being swung round: the shot waits till that's a few seconds over)
    const long = a && (busy(a) && s.t < LONGEST || s.eye && r.time - (r.eyeOrbitAt ?? -1e9) < 4);
    if (s.t > s.len && !long) {
      // watching one species and this is the only one of it out: carry on with it
      if (this.species && a && this.pick() === a) { s.t = 0; s.len = SHOT.follow; }
      else { this.next(); return; }
    }
    if (a && !s.eye) { ui.follow = a; g.selectedAgent = a; }
    // the slow drift round the subject (the usual view only)
    if (!s.eye && s.t > 1.2) r.azTarget += s.drift * dt;
    if ((s.capAt = (s.capAt || 0) - dt) <= 0) { s.capAt = 0.5; this.caption(s); }
  }

  next() {
    this.walking = false;
    this.endShot();
    const g = this.game, wide = !this.eyeLevel && !this.species && this.n % 4 === 3;
    this.n++;
    let a = wide ? null : this.pick();
    // the species being watched has none left out (all gone, or asleep for the winter): back to everything
    if (!a && this.species) { this.species = null; this.showSpecies(); a = this.pick(); }
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
      const key = animalDef(a, g.catalog).key;
      if (this.species && key !== this.species) return 0;
      if (a === last) s *= 0.05;
      else if (this.recent.includes(key)) s *= 0.3;
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

  // What's happening at a watched animal's carcass.
  bodyStatus(a) {
    const g = this.game, c = g.wildlife.carcasses.find(k => k.id === a.id);
    if (!c) return '';
    const feeders = g.wildlife.agents.filter(o => o.state === 'feed' && o.carcass === c.id);
    if (feeders.length) return `Carcass · being eaten by ${[...new Set(feeders.map(o => animalDef(o, g.catalog).name))].join(', ')}`;
    return c.by != null && g.catalog.animals[c.by] ? `Carcass · killed by ${g.catalog.animals[c.by].name}` : 'Carcass';
  }

  caption(s, fresh = false) {
    const g = this.game, b = this.cap.querySelector('b'), sp = this.cap.querySelector('span');
    if (s.walk) {
      b.textContent = 'On foot';
      sp.textContent = TOUCH ? 'Stick to walk · drag to look · Next for the animals' : 'W S walk · A D step · Q E turn · Shift run · drag to look · N back to the animals';
    } else if (s.agent) {
      const a = s.agent, def = animalDef(a, g.catalog);
      b.textContent = def.name;
      sp.textContent = s.body ? this.bodyStatus(a) : a.passing ? 'Flying through' : this.ui.agentStatus(a, def);
    } else {
      b.textContent = g.catalog.definition.farm;
      sp.textContent = `${SEASONS[g.season]}, year ${g.year}`;
    }
    if (fresh) { this.cap.classList.remove('show'); setTimeout(() => this.on && this.shot === s && this.cap.classList.add('show'), 900); }
  }
}
