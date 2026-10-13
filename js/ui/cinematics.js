// Keystone scene presentation and camera/timer cleanup.
import { momentScene } from '../sim/moments.js';
import { track } from '../analytics.js';
import { makePostcard, download } from './postcard.js';

export class Cinematics {
  constructor(game, renderer, state, controls) {
    this.game = game;
    this.renderer = renderer;
    this.state = state;
    this.controls = controls;
    this.moment = null;
    this.momentEnded = -Infinity;
  }

  // A keystone moment: the camera glides to it, letterbox bars slide in, the panels step aside
  // and a title card tells the story. The game keeps running at normal speed so it plays out.
  play(m) {
    const g = this.game, r = this.renderer;
    // wait until the view is free, and leave a breather after the last one (at high speed a few
    // game weeks go by in seconds, so two moments could otherwise come back to back)
    const breather = 25000 - (performance.now() - (this.momentEnded ?? -1e9));
    if (this.moment || this.controls.isBusy() || breather > 0) { setTimeout(() => this.play(m), Math.max(3000, breather)); return; }
    this.moment = m;
    this.state.clean = true; // (the land and the animals only: no brush, overlay or selection ring)
    m.prev = { x: r.target.x, z: r.target.z, zoom: r.zoom, speed: g.speed };
    // a night moment (the fireflies) jumps the clock to a clear, warm night, and the meadows light up
    if (m.night) {
      r.setTimeOfDay(0.9); if (m.fireflies) r.fireflyBoost = 8; if (m.spawn) r.spawnBoost = 1;
      // hold a clear night (no rain, no dawn) until the card is dismissed
      m.hold = setInterval(() => { g.weather = 'clear'; g.weatherDays = 3; r.setTimeOfDay(0.9); }, 200);
    }
    if (g.speed !== 1) this.controls.setSpeed(1);
    const first = momentScene(g, m);
    const fx = first?.x ?? m.agent?.x ?? m.x, fy = first?.y ?? m.agent?.y ?? m.y;
    r.flyTo(fx, fy, first?.zoom ?? (m.agent ? 3.1 : 2.3), 2.4);
    this.controls.setFollow(null);
    // an animal moment selects the animal, so leaves and branches in front of it dissolve
    m.prevSel = g.selectedAgent;
    if (m.agent) g.selectedAgent = m.agent;
    else if (m.reveal) r.focusTile = { x: fx, y: fy }; // (a moment on a plant: see through the canopy over it, like Sumatra's corpse flower)
    m.followTimer = setTimeout(() => {
      if (this.moment !== m) return;
      const scene = momentScene(g, m);
      if (scene) this.controls.setFollow(scene.follow ? scene.agent : null);
      else if (m.agent && g.wildlife.agents.includes(m.agent)) this.controls.setFollow(m.agent);
    }, 2500);
    g.notify(`${m.title}. ${m.text}`, 'discover', m.agent || { x: m.x, y: m.y });
    const o = document.createElement('div'); o.id = 'moment';
    o.innerHTML = `<div class="lb lb-top"></div><div class="lb lb-bot"></div>
      <div class="mo-card"><small>A moment at ${this.game.catalog.definition.farm} · Year ${g.year}</small><h2>${m.title}</h2><div class="mo-beat" hidden></div><p class="mo-text">${m.text}</p>
      <div class="mo-btns"><button class="btn secondary" data-a="card">Save postcard</button><button class="btn" data-a="go">Continue</button></div></div>`;
    document.body.appendChild(o);
    document.body.classList.add('moment-on');
    // keep the subject out from under the title card: frame it in the open part of the screen
    // (beside the card, or above it if there isn't room beside), which matters most on a phone
    const card = o.querySelector('.mo-card');
    const reframe = () => {
      const vw = innerWidth, vh = innerHeight, x0 = card.offsetLeft, x1 = x0 + card.offsetWidth, y0 = card.offsetTop;
      const covers = x0 < vw * 0.62 && x1 > vw * 0.38 && y0 < vh * 0.68;
      r.frameGoal = !covers ? { x: 0.5, y: 0.5 } : vw - x1 >= vw * 0.3 ? { x: (x1 + vw) / 2 / vw, y: 0.48 } : { x: 0.5, y: Math.max(0.2, y0 / 2 / vh) };
    };
    reframe();
    const phases = new Set();
    const updateScene = () => {
      if (this.moment !== m) return;
      const scene = momentScene(g, m);
      if (!scene) return;
      if (scene.stage === m.stage && scene.agent === m.sceneAgent) return;
      const initial = m.stage == null;
      const changed = scene.stage !== m.stage;
      m.stage = scene.stage; m.sceneAgent = scene.agent;
      const beat = o.querySelector('.mo-beat'); beat.hidden = false; beat.textContent = scene.caption;
      o.querySelector('.mo-text').textContent = scene.text;
      this.controls.setFollow(null);
      g.selectedAgent = scene.agent;
      r.focusTile = scene.agent ? null : { x: scene.x, y: scene.y };
      if (!initial) {
        r.flyTo(scene.x, scene.y, scene.zoom, 1.1);
        clearTimeout(m.followTimer);
        m.followTimer = setTimeout(() => {
          if (this.moment !== m) return;
          const current = momentScene(g, m);
          this.controls.setFollow(current?.follow ? current.agent : null);
        }, 1100);
      }
      reframe();
      if (!initial && changed && !phases.has(scene.stage)) g.notify(`${m.title} · ${scene.caption}. ${scene.text}`, 'discover', scene.agent || { x: scene.x, y: scene.y });
      phases.add(scene.stage);
    };
    updateScene();
    if (m.live) m.sceneTimer = setInterval(updateScene, 200);
    window.addEventListener('resize', reframe);
    requestAnimationFrame(() => o.classList.add('bars'));
    setTimeout(() => o.classList.add('card'), 1500);
    const end = (restore = true) => {
      if (this.moment !== m) return;
      this.controls.setFollow(null);
      r.fireflyBoost = 1; r.spawnBoost = 0;
      if (m.hold) clearInterval(m.hold);
      clearInterval(m.sceneTimer); clearTimeout(m.followTimer);
      r.focusTile = null;
      if (m.live || g.selectedAgent === m.agent) g.selectedAgent = m.prevSel && g.wildlife.agents.includes(m.prevSel) ? m.prevSel : null;
      if (restore) { r.flyTo(m.prev.x, m.prev.z, m.prev.zoom, 1.6); this.controls.setSpeed(m.prev.speed); }
      r.frameGoal = { x: 0.5, y: 0.5 };
      window.removeEventListener('resize', reframe);
      o.classList.remove('bars', 'card');
      document.body.classList.remove('moment-on');
      setTimeout(() => o.remove(), 700);
      window.removeEventListener('keydown', key, true);
      this.moment = null; this.momentEnded = performance.now();
      this.state.clean = this.controls.isPhoto();
    };
    m.end = end;
    const key = e => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); end(); } };
    window.addEventListener('keydown', key, true);
    o.querySelector('[data-a=go]').addEventListener('click', end);
    o.querySelector('[data-a=card]').addEventListener('click', async () => {
      const c = await makePostcard({ images: [{ canvas: r.capture(g, this.state, false) }], ...this.controls.postcardText(m.title) });
      download(c, `second-growth-${g.map}-${m.key}.png`);
      track('photo_saved', { map: g.map, kind: 'moment', moment: m.key });
    });
    track('moment', { moment: m.key, map: g.map, game_year: g.year });
  }
}
