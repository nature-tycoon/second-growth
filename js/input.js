// Mouse and keyboard: camera control, brushing tools across the map, inspecting.

import { tr } from './i18n.js';
import { T, money } from './config.js';
import { strokeTiles, toolCost, bestSuit } from './tools.js';
import { settings } from './settings.js';


const SHIFTED = { '-': '_', '_': '-', '=': '+', '+': '=' };
const GAME_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'q', 'e', '-', '_', '=', '+', '[', ']', ' ']);
const WALK_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

export class Input {
  constructor(game, renderer, ui) {
    this.game = game; this.r = renderer; this.ui = ui;
    this.keys = new Set();
    this.stroke = null;
    this.pan = null;
    this.mouse = { x: 0, y: 0, in: false };
    this.tip = document.getElementById('cursor-tip');
    const cv = renderer.canvas;
    cv.addEventListener('mousedown', e => { this.touching = false; this.down(e); });
    window.addEventListener('mousemove', e => this.move(e));
    window.addEventListener('mouseup', e => this.up(e));
    cv.addEventListener('mouseleave', () => { this.mouse.in = false; this.ui.state.hover = null; this.tip.classList.add('hidden'); });
    cv.addEventListener('mouseenter', () => { this.mouse.in = true; });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      if (e.ctrlKey && this.pinch != null) return; // (Safari's own pinch, below, already zooms)
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015) * settings.zoomSpeed);
      this.r.zoomAt(e.clientX, e.clientY, f, true); // eased
    }, { passive: false });
    // A pinch over a panel would zoom the whole page instead of the map, and once the map fills
    // the zoomed page every later pinch lands on the map, so the page can't be zoomed back out
    // and the menus stay off screen. Never let a pinch zoom the page. (Trackpads send it as a
    // ctrl + wheel; Safari, on Macs and iPads, as gesture events.)
    window.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
    // Safari's trackpad pinch carries its scale since the fingers went down; over the map it zooms
    // the camera. (On an iPad the same events come with the touches, which already zoom: skip them.)
    this.pinch = null;
    document.addEventListener('gesturestart', e => { e.preventDefault(); this.pinch = e.target === cv && !this.touch ? e.scale || 1 : null; }, { passive: false });
    document.addEventListener('gesturechange', e => {
      e.preventDefault();
      if (this.pinch == null || !(e.scale > 0)) return;
      this.r.zoomAt(e.clientX, e.clientY, e.scale / this.pinch, true); // eased, like the wheel
      this.pinch = e.scale;
    }, { passive: false });
    document.addEventListener('gestureend', e => { e.preventDefault(); this.pinch = null; }, { passive: false });
    // touch: one finger paints (or pans in Inspect), a tap inspects or places,
    // two fingers pan and pinch-zoom the camera
    for (const [ev, fn] of [['touchstart', 'touchStart'], ['touchmove', 'touchMove'], ['touchend', 'touchEnd'], ['touchcancel', 'touchEnd']]) {
      cv.addEventListener(ev, e => this[fn](e), { passive: false });
    }
    this.bindStick();
    window.addEventListener('keydown', e => this.key(e, true));
    window.addEventListener('keyup', e => this.key(e, false));
    // leaving the page (another app, a phone call, the tab hidden) lets go of everything held
    const release = () => { this.keys.clear(); this.stickEnd?.(); };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
    window.addEventListener('pagehide', release);
  }

  key(e, down) {
    const k = (e.key || '').toLowerCase();
    // A key let go always counts, wherever the focus is: a W released while a button or the
    // feedback box has focus used to be ignored, and the map kept scrolling on its own. (The
    // shifted twin goes too: a + pressed as = comes back up as =.)
    if (!down) {
      this.keys.delete(k); this.keys.delete(SHIFTED[k] ?? k);
      // on a Mac, letting go of ⌘ is the only notice of keys released while it was held
      if (k === 'meta' || k === 'control' || k === 'os') this.keys.clear();
    }
    const tag = e.target && e.target.tagName;
    if (tag === 'TEXTAREA' || (tag === 'INPUT' && !['checkbox', 'radio', 'range', 'button'].includes(e.target.type))) return;
    if (down && (e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey && !this.ui.modalOpen) { e.preventDefault(); this.ui.undoLast(); return; }
    if (down && (e.metaKey || e.ctrlKey) && GAME_KEYS.has(k)) return; // (a ⌘ shortcut, not a camera move: its key-up may never come)
    // A focused dropdown (like the overlay menu) would swallow WASD and arrows as list navigation.
    // Hand the keys back to the map instead.
    if (tag === 'SELECT' || tag === 'BUTTON' || tag === 'INPUT') {
      if (!down || !GAME_KEYS.has(k)) return;
      e.preventDefault();
      e.target.blur();
    }
    if (!down) return;
    // watching: only the watch keys, Space and the speeds (nothing moves the camera or paints)
    // (at eye level, WASD lets go of the animal and walks: see Watch.walk)
    if (this.ui.watch.on && !this.ui.modalOpen && !this.ui.moment) {
      if (WALK_KEYS.has(k) && this.ui.watch.walk()) { e.preventDefault(); this.keys.add(k); return; }
      if (k === 'shift') { this.keys.add(k); return; }
      if (this.ui.watch.key(k)) { e.preventDefault(); return; }
      if (k === ' ' || k === '1' || k === '2' || k === '3' || k === 'm') this.keys.add(k); else return;
    } else this.keys.add(k);
    if (k === 'escape') {
      if (this.ui.modalOpen) this.ui.closeModal();
      else if (this.ui.state.cat !== 'inspect') this.ui.openCategory('inspect');
      else this.ui.closeInfo();
      return;
    }
    if (this.ui.modalOpen) return;
    if (k === ' ') {
      e.preventDefault();
      if (this.game.speed) { this.lastSpeed = this.game.speed; this.ui.setSpeed(0); }
      else this.ui.setSpeed(this.lastSpeed || 1);
    }
    else if (k === '1' || k === '2' || k === '3') this.ui.setSpeed(+k);
    else if (k === '[') this.ui.nudgeBrush(-1);
    else if (k === ']') this.ui.nudgeBrush(1);
    else if (k === 't') this.ui.toggleTrees();
    else if (k === 'q' || k === 'e') {
      // Fine nudges can repeat; quarter-turns stay deliberate when Shift is held.
      if (!e.shiftKey || !e.repeat) this.r.rotate(k === 'q' ? -1 : 1, e.shiftKey ? 90 : 15);
    }
    else if (k === 'tab') { e.preventDefault(); this.ui.togglePanels(); }
    else if (k === 'h') this.ui.setOverlay(this.ui.state.overlay === 'habitat' ? 'none' : 'habitat');
    else if (k === 'g') this.ui.openGuide();
    else if (k === 'm') this.ui.toggleMute();
    else if (k === 'p') this.ui.togglePhoto();
    else if (k === 'c') this.ui.watch.toggle();
  }

  update(dt) {
    this.r.followAgent = null;
    // watch mode directs the camera itself (ui/watch.js), and a keystone moment within it too
    if (this.ui.watch.on) {
      if (this.ui.follow) this.trackFollow(this.ui.follow, dt);
      if (this.ui.watch.walking) {
        const K = this.keys, on = (...ks) => ks.some(x => K.has(x)) ? 1 : 0;
        this.r.eyeMove = { fwd: on('w', 'arrowup') - on('s', 'arrowdown'), turn: on('d', 'arrowright') - on('a', 'arrowleft'), side: on('e') - on('q'), run: K.has('shift') };
      }
      return;
    }
    if (!this.ui.follow && this.r.animalFraming) {
      if (!this.ui.moment) this.r.frameGoal = { x: 0.5, y: 0.5 };
      this.r.animalFraming = false;
    }
    if (this.ui.modalOpen) return;
    const sp = 700 * dt * settings.panSpeed;
    let dx = 0, dy = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= sp;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx += sp;
    if (this.keys.has('w') || this.keys.has('arrowup')) dy -= sp;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy += sp;
    const zs = 1.5 * settings.zoomSpeed;
    if (this.keys.has('-') || this.keys.has('_')) this.r.zoomAt(this.r.vw / 2, this.r.vh / 2, Math.exp(-dt * zs));
    if (this.keys.has('=') || this.keys.has('+')) this.r.zoomAt(this.r.vw / 2, this.r.vh / 2, Math.exp(dt * zs));
    if (dx || dy) this.r.panBy(-dx, -dy);
    // the thumbstick: about a phone screen's width a second and a half at full tilt
    const sv = this.stickV;
    if (sv && !this.ui.modalOpen) {
      const k = 620 * dt * settings.panSpeed;
      this.r.panBy(-sv.x * k, -sv.y * k);
      // a finger held still mid-stroke keeps painting as the land slides under it
      if (this.stroke && this.stroke.tool.brush) this.move(this.fake(this.mouse.x, this.mouse.y));
    }
    if (this.fling) {
      const F = this.fling, decay = Math.exp(-dt * 4.5);
      this.r.panBy(F.vx * dt, F.vy * dt);
      F.vx *= decay; F.vy *= decay;
      if (Math.hypot(F.vx, F.vy) < 12 || dx || dy) this.fling = null;
    }
    // keep a located animal in view until the player moves the camera
    const f = this.ui.follow;
    if (f) {
      if (dx || dy || sv || this.pan || this.fling || !this.trackFollow(f, dt)) this.ui.follow = null;
      else {
        if (!this.ui.moment) { this.r.frameGoal = this.ui.animalFrame(); this.r.animalFraming = true; }
      }
    }
    if (this.mouse.in && !this.pan) this.updateHover();
  }

  // Keep the camera on a followed animal (the renderer follows this frame's visible body, including
  // height). One that's killed, or dies where it stands, leaves a carcass with its id: the camera
  // stays on that while it's eaten, until it's gone. False when there's neither.
  trackFollow(f, dt) {
    if (this.game.wildlife.hasAgent(f)) { this.r.followAgent = f; return true; }
    const body = this.game.wildlife.carcasses.find(c => c.id === f.id);
    if (body) this.r.followCarcass(body, dt);
    return !!body;
  }

  tool() { return this.ui.state.tool && !this.ui.state.clean ? this.game.catalog.tools[this.ui.state.tool] : null; } // (no painting through a keystone moment)
  // The tile under the pointer. Snorkel-trail buoys float at the sea surface, so that tool picks
  // the tile straight below the point on the surface, not the seabed further along the same line
  // of sight (seen from above at an angle, that's a tile or two off).
  pick(sx, sy) {
    const surface = this.game.catalog.definition.buoyTrails && this.ui.state.tool === 'trail';
    return this.r.screenToTile(sx, sy, surface ? this.r.seaY : null);
  }

  // ------------------------------------------------------------ touch
  // With a brush tool, one finger on the map paints; with Inspect or a click-to-place tool it moves
  // the map (with a little glide when flicked). A tap inspects, places, or dabs the brush once.
  // Two fingers move and pinch-zoom the map, and so does the thumbstick in the corner (below), so
  // moving around never means putting the brush down. Only fingers that landed on the map count
  // here (targetTouches): a thumb resting on the stick doesn't turn a stroke into a pinch.
  fake(x, y) { return { button: 0, clientX: x, clientY: y, preventDefault() {} }; }
  touchStart(e) {
    if (e.cancelable) e.preventDefault(); // also stops emulated mouse events and page zoom
    this.touching = true;
    this.fling = null;
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    this.ui.tuckToolPanel?.();
    const ts = e.targetTouches;
    if (ts.length === 1) {
      const t = ts[0];
      this.ui.follow = null;
      this.touch = { mode: 'pending', x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, moved: false, vx: 0, vy: 0, t: performance.now() };
      // wait a moment before painting, in case a second finger is coming for a camera gesture
      const tool = this.tool();
      if (tool && tool.brush) this.touch.timer = setTimeout(() => this.beginTouchPaint(), 110);
    } else if (ts.length >= 2) {
      if (this.touch && this.touch.timer) clearTimeout(this.touch.timer);
      if (this.stroke) this.endStroke();
      const [a, b] = ts;
      this.touch = { mode: 'gesture', mx: (a.clientX + b.clientX) / 2, my: (a.clientY + b.clientY) / 2, d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1 };
      this.hideHover();
    }
  }
  beginTouchPaint() {
    const T = this.touch;
    if (!T || T.mode !== 'pending') return;
    T.mode = 'paint';
    this.mouse.in = true; this.mouse.x = T.x; this.mouse.y = T.y;
    this.down(this.fake(T.x, T.y));
  }
  touchMove(e) {
    if (e.cancelable) e.preventDefault();
    const T = this.touch, ts = e.targetTouches;
    if (!T) return;
    if (T.mode === 'gesture' && ts.length >= 2) {
      const [a, b] = ts, mx = (a.clientX + b.clientX) / 2, my = (a.clientY + b.clientY) / 2, d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
      this.r.panBy(mx - T.mx, my - T.my);
      this.r.zoomAt(mx, my, d / T.d);
      T.mx = mx; T.my = my; T.d = d;
      return;
    }
    if (ts.length !== 1) return;
    const t = ts[0];
    if (!T.moved && Math.hypot(t.clientX - T.x0, t.clientY - T.y0) > 10) {
      T.moved = true;
      if (T.mode === 'pending') {
        const tool = this.tool();
        if (tool && tool.brush) { clearTimeout(T.timer); this.beginTouchPaint(); }
        else { T.mode = 'pan'; T.x = T.x0; T.y = T.y0; } // Inspect and click-to-place tools: dragging moves the map
      }
    }
    const now = performance.now();
    if (T.mode === 'pan') {
      const dx = t.clientX - T.x, dy = t.clientY - T.y, dt = Math.max(1, now - (T.t || now)) / 1000;
      this.r.panBy(dx, dy);
      // how fast the finger is going, for the glide when it lets go
      const k = Math.min(1, dt * 18);
      T.vx += (dx / dt - T.vx) * k; T.vy += (dy / dt - T.vy) * k;
    } else if (T.mode === 'paint') { this.mouse.x = t.clientX; this.mouse.y = t.clientY; this.move(this.fake(t.clientX, t.clientY)); }
    T.x = t.clientX; T.y = t.clientY; T.t = now;
  }
  touchEnd(e) {
    if (e.cancelable) e.preventDefault();
    const T = this.touch;
    if (!T) return;
    const ts = e.targetTouches;
    if (ts.length === 0) {
      clearTimeout(T.timer);
      if (T.mode === 'paint') this.up(this.fake(T.x, T.y));
      else if (T.mode === 'pending' && !T.moved) {
        // a tap: inspect, place, or dab the brush once
        this.mouse.x = T.x0; this.mouse.y = T.y0;
        this.down(this.fake(T.x0, T.y0));
        if (this.stroke) this.up(this.fake(T.x0, T.y0));
      } else if (T.mode === 'pan' && performance.now() - T.t < 80 && Math.hypot(T.vx, T.vy) > 120) {
        // a flick: the map glides on and slows to a stop
        const sp = Math.hypot(T.vx, T.vy), cap = Math.min(1, 2600 / sp);
        this.fling = { vx: T.vx * cap, vy: T.vy * cap };
      }
      this.touch = null;
      this.hideHover();
    } else if (ts.length === 1 && T.mode === 'gesture') {
      // one finger lifted from a pinch: keep moving the map with the other, never paint
      const t = ts[0];
      this.touch = { mode: 'pan', x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, moved: true, vx: 0, vy: 0, t: performance.now() };
    }
  }

  // The thumbstick: push the knob and the map scrolls that way, faster the further it's pushed
  // (gently at first, for fine positioning). It works alongside a finger painting on the map.
  bindStick() {
    const el = document.getElementById('joystick');
    if (!el) return;
    const knob = el.querySelector('.js-knob');
    this.stickV = null;
    let id = null, cx = 0, cy = 0, R = 1;
    const set = (x, y) => {
      let dx = x - cx, dy = y - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const m = Math.min(1, d / R), f = m < 0.12 ? 0 : (m - 0.12) / 0.88; // (a small dead zone in the middle)
      this.stickV = d ? { x: dx / Math.max(d, 1e-6) * f * f, y: dy / Math.max(d, 1e-6) * f * f } : null;
    };
    const stop = () => { id = null; this.stickV = null; el.classList.remove('on'); knob.style.transform = ''; };
    const end = e => { if (e.pointerId === id) stop(); };
    this.stickEnd = stop;
    // Backstops for a lift the stick never hears about (a notification or the app switcher taking
    // the touch, or a browser that drops pointer capture quietly): any pointer coming up anywhere
    // with that id, or the last finger on the stick leaving the screen, lets it go.
    window.addEventListener('pointerup', end, true);
    window.addEventListener('pointercancel', end, true);
    const fingersOff = e => { if (id !== null && ![...e.touches].some(t => el.contains(t.target))) stop(); };
    window.addEventListener('touchend', fingersOff, true);
    window.addEventListener('touchcancel', fingersOff, true);
    el.addEventListener('pointerdown', e => {
      if (id !== null) return;
      e.preventDefault();
      id = e.pointerId;
      try { el.setPointerCapture?.(id); } catch { /* (the finger is already up: the backstops below still let go) */ }
      const r = el.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2; R = r.width * 0.36;
      el.classList.add('on');
      this.fling = null; this.ui.follow = null;
      set(e.clientX, e.clientY);
    });
    el.addEventListener('pointermove', e => { if (e.pointerId === id) set(e.clientX, e.clientY); });
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  hideHover() {
    this.mouse.in = false; this.ui.state.hover = null; this.ui.state.previewTiles = null;
    this.tip.classList.add('hidden');
  }

  down(e) {
    // clicking the map takes focus away from any menu, so the keyboard drives the camera again
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    if (e.button === 2 || e.button === 1) {
      this.pan = { x: e.clientX, y: e.clientY };
      this.r.canvas.style.cursor = 'grabbing';
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    const t = this.pick(e.clientX, e.clientY);
    const tool = this.tool();
    if (!tool) { this.inspectAt(t); return; }
    if (!this.game.world.inb(t.x, t.y)) return;
    this.stroke = this.ui.actions.begin(tool);
    if (!this.stroke) return;
    if (tool.brush) document.body.classList.add('painting');
    this.applyAt(t.x, t.y);
    if (!tool.brush) this.endStroke();
  }

  move(e) {
    this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    if (this.pan) {
      this.r.panBy(e.clientX - this.pan.x, e.clientY - this.pan.y);
      this.pan.x = e.clientX; this.pan.y = e.clientY;
      return;
    }
    if (this.stroke && this.stroke.tool.brush) {
      const t = this.pick(e.clientX, e.clientY);
      const last = this.stroke.last;
      if (last && (last.x !== t.x || last.y !== t.y)) {
        // walk the line between samples so fast strokes stay continuous
        let x0 = last.x, y0 = last.y;
        const dx = Math.abs(t.x - x0), dy = -Math.abs(t.y - y0), sx = x0 < t.x ? 1 : -1, sy = y0 < t.y ? 1 : -1;
        let err = dx + dy;
        for (let guard = 0; guard < 200; guard++) {
          if (x0 === t.x && y0 === t.y) break;
          const e2 = 2 * err;
          const stepX = e2 >= dy, stepY = e2 <= dx;
          if (stepX) { err += dy; x0 += sx; }
          // fill the corner on diagonal steps so trails and creeks stay edge-connected
          if (stepX && stepY) this.applyAt(x0, y0);
          if (stepY) { err += dx; y0 += sy; }
          this.applyAt(x0, y0);
        }
      }
    }
  }

  up(e) {
    if (this.pan && (e.button === 2 || e.button === 1)) { this.pan = null; this.r.canvas.style.cursor = ''; return; }
    if (this.stroke) this.endStroke();
  }

  applyAt(x, y) {
    const w = this.game.world;
    const changed = this.ui.actions.paint(this.stroke, x, y, this.ui.state.brushR);
    for (const i of changed) this.r.markTileDirty(i % w.w, Math.floor(i / w.w));
    this.hoverKey = null;
  }

  endStroke() {
    const s = this.stroke;
    this.stroke = null; this.hoverKey = null;
    document.body.classList.remove('painting');
    if (!s) return;
    this.ui.actions.end(s);
  }

  inspectAt(t) {
    const g = this.game, w = g.world;
    const best = this.r.pickAgent(g, this.mouse.x, this.mouse.y, this.touching ? 48 : 34); // fingers are less precise
    if (best) { this.ui.inspectAgent(best); this.ui.followAnimal(best); return; }
    if (w.inb(t.x, t.y)) this.ui.inspectTile(w.idx(t.x, t.y));
    else this.ui.closeInfo();
  }

  updateHover() {
    const g = this.game, w = g.world, ui = this.ui;
    const t = this.pick(this.mouse.x, this.mouse.y);
    const tool = this.tool();
    ui.state.hover = w.inb(t.x, t.y) ? { x: t.x, y: t.y } : null;
    // Hover only builds the preview. A moment or photo mode temporarily hides the
    // tool; keep its selected radius so preview and painting resume at the same size.
    if (!tool || !ui.state.hover) { ui.state.previewTiles = null; this.tip.classList.add('hidden'); this.hoverKey = null; return; }
    // The preview and tip only change with the tile, tool, brush size or the land under them, so
    // they're worked out again then (painting clears the key) or twice a second for growth and
    // seasons, not every frame: on a slow laptop that alone was a few percent of each frame.
    const now = performance.now(), key = `${t.x},${t.y},${tool.key},${ui.state.brushR}`;
    if (key === this.hoverKey && now - this.hoverAt < 500 && ui.state.previewTiles && !this.tip.classList.contains('hidden')) { this.placeTip(); return; }
    this.hoverKey = key; this.hoverAt = now;
    let tiles = tool.brush ? strokeTiles(w, tool, t.x, t.y, ui.state.brushR) : [w.idx(t.x, t.y)];
    if (tool.footprint) {
      tiles = [];
      for (let yy = t.y; yy < t.y + tool.footprint[1]; yy++) for (let xx = t.x; xx < t.x + tool.footprint[0]; xx++) if (w.inb(xx, yy)) tiles.push(w.idx(xx, yy));
    }
    const prev = [];
    for (const i of tiles) {
      let color = 'rgba(255,250,230,0.16)';
      if (tool.species) {
        const layer = this.game.catalog.plants.find(p => p && p.key === tool.species[0]).layer;
        const occupied = layer === 0 ? w.ground[i] : layer === 1 ? w.shrub[i] : w.tree[i];
        const s = bestSuit(g, i, tool.species);
        color = occupied ? 'rgba(80,80,80,0.2)' : s > 0.55 ? 'rgba(110,220,110,0.36)' : s > 0.3 ? 'rgba(235,210,90,0.36)' : 'rgba(220,90,70,0.34)';
      } else if (tool.key === 'pull') {
        const inv = (w.ground[i] && this.game.catalog.plants[w.ground[i]].invasive) || (w.shrub[i] && this.game.catalog.plants[w.shrub[i]].invasive);
        color = inv ? 'rgba(230,90,160,0.4)' : 'rgba(255,250,230,0.1)';
      } else if (tool.key === 'demolish') {
        color = toolCost(g, tool, i) !== 0 || w.struct[i] >= 0 ? 'rgba(230,120,70,0.45)' : 'rgba(255,250,230,0.1)';
      }
      prev.push({ i, color });
    }
    ui.state.previewTiles = prev;
    // cursor tip
    const i0 = w.idx(t.x, t.y);
    const cost = toolCost(g, tool, i0);
    let txt = tr(tool.name);
    if (tool.key === 'demolish') {
      if (w.struct[i0] >= 0 || cost) txt += cost < 0 ? ` · ${tr(`earns ${money(-cost)} salvage`)}` : ` · ${money(cost)}`;
      if (w.struct[i0] >= 0 && this.game.catalog.structures[w.structures[w.struct[i0]]?.type]?.roost) txt += ` · <span class="bad">${tr('bat roost')}</span>`;
    } else if (cost) txt += ` · ${tool.brush ? tr(`${money(cost)}/tile`) : money(cost)}`;
    if (tool.species) {
      const s = bestSuit(g, i0, tool.species);
      txt += s > 0.55 ? ` · ${tr('good spot')}` : s > 0.3 ? ` · ${tr('okay spot')}` : ` · <span class="bad">${tr('poor spot')}</span>`;
      if (this.game.catalog.definition.hardpan && w.terrain[i0] === T.GRAVEL && !tool.species.some(k => this.game.catalog.plants.find(p => p?.key === k)?.crustOK || this.game.catalog.plants.find(p => p?.key === k)?.gravelOK)) txt += ` · <span class="bad">${tr(this.game.catalog.definition.text.hardpanTip || 'hardpan: loosen it first')}</span>`;
    }
    if (this.stroke && this.stroke.cost) txt += ` · ${tr(`spent ${money(this.stroke.cost)}`)}`;
    this.tip.innerHTML = txt;
    this.tip.classList.remove('hidden');
    this.tipSize = { w: this.tip.offsetWidth, h: this.tip.offsetHeight };
    this.placeTip();
  }
  // The tip follows the pointer every frame, from its size when last written (reading the size
  // every frame would make the browser lay the page out again each time)
  placeTip() {
    const tw = this.tipSize.w, th = this.tipSize.h;
    const left = this.mouse.x + 16 + tw > window.innerWidth - 8 ? this.mouse.x - 12 - tw : this.mouse.x + 16;
    const top = this.mouse.y + 18 + th > window.innerHeight - 8 ? this.mouse.y - 12 - th : this.mouse.y + 18;
    this.tip.style.left = Math.max(4, left) + 'px';
    this.tip.style.top = Math.max(4, top) + 'px';
  }
}
