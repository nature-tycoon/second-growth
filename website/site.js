// The static homepage switches fresh game captures and their captions.
// It never imports the simulation or touches player saves.
// A short fade when a picture changes, skipped for reduced motion.
const calm = matchMedia('(prefers-reduced-motion: reduce)');
const fadeIn = image => { if (!calm.matches && image.animate) image.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 450, easing: 'ease' }); };
// The floating header turns solid once the page has scrolled past the top of the hero.
const header = document.querySelector('.home .header');
if (header) {
  const solid = () => header.classList.toggle('scrolled', scrollY > 40);
  addEventListener('scroll', solid, { passive: true });
  solid();
}
const choices = [...document.querySelectorAll('.map-choice')];
const fields = {
  name: document.querySelector('#map-name'),
  region: document.querySelector('#map-region'),
  habitat: document.querySelector('#map-habitat'),
  copy: document.querySelector('#map-copy'),
  species: document.querySelector('#map-species'),
};
const mapImage = document.querySelector('#map-image');
// "Play this landscape" opens the game's start screen on the chosen map (?map=…).
const mapPlay = document.querySelector('#map-play'), mapPlayName = document.querySelector('#map-play-name');
for (const choice of choices) {
  choice.addEventListener('click', () => {
    for (const button of choices) button.setAttribute('aria-pressed', String(button === choice));
    for (const [key, element] of Object.entries(fields)) element.textContent = choice.dataset[key];
    mapImage.src = choice.dataset.image;
    fadeIn(mapImage);
    mapImage.alt = choice.dataset.alt;
    mapImage.parentElement.dataset.momentLayout = choice.dataset.momentLayout;
    document.querySelector('#map-image-label').textContent = choice.dataset.name;
    document.querySelector('#moment-title').textContent = choice.dataset.momentTitle;
    document.querySelector('#moment-description').textContent = choice.dataset.momentDescription;
    document.querySelector('.map-panel').dataset.landscape = choice.dataset.map;
    if (mapPlay) { mapPlay.href = choice.dataset.play; mapPlayName.textContent = choice.dataset.name; }
  });
}
// Fetch the other landscape images once the explorer nears the
// viewport (or on hover), so switching never shows an empty panel.
const preloaded = new Set();
const preload = src => { if (!preloaded.has(src)) { preloaded.add(src); new Image().src = src; } };
const preloadAll = () => choices.forEach(c => preload(c.dataset.image));
for (const choice of choices) choice.addEventListener('pointerenter', () => preload(choice.dataset.image));
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); preloadAll(); }
  }, { rootMargin: '600px 0px' });
  observer.observe(document.querySelector('.explorer'));
} else preloadAll();
// Before/after creek slider. Pointer drag anywhere on the picture; the
// range input underneath keeps it usable from the keyboard.
const compare = document.querySelector('.compare');
if (compare) {
  const range = compare.querySelector('.compare-range');
  const before = compare.querySelector('.compare-tag.before'), after = compare.querySelector('.compare-tag.after');
  const set = value => {
    const pos = Math.max(0, Math.min(100, value));
    compare.style.setProperty('--pos', pos + '%'); range.value = Math.round(pos);
    // Hide a label once its picture is mostly covered.
    before.style.opacity = pos < 28 ? 0 : 1; after.style.opacity = pos > 72 ? 0 : 1;
  };
  const fromPointer = event => { const box = compare.getBoundingClientRect(); set((event.clientX - box.left) / box.width * 100); };
  let dragging = false;
  compare.addEventListener('pointerdown', event => { dragging = true; compare.setPointerCapture(event.pointerId); fromPointer(event); });
  compare.addEventListener('pointermove', event => { if (dragging) fromPointer(event); });
  for (const type of ['pointerup', 'pointercancel']) compare.addEventListener(type, () => { dragging = false; });
  range.addEventListener('input', () => set(Number(range.value)));
  // Once, when it first comes into view, sweep across to show it can be dragged.
  if (!calm.matches && 'IntersectionObserver' in window) {
    const hint = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.intersectionRatio > 0.6)) return;
      hint.disconnect();
      const start = performance.now();
      const step = now => {
        if (dragging) return;
        const t = Math.min(1, (now - start) / 1800);
        set(50 + Math.sin(t * Math.PI * 2) * 30 * (1 - t));
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, { threshold: 0.6 });
    hint.observe(compare);
  }
}
// ------------------------------------------------------------ game footage
// Every clip is real game footage (review-media/video/, see video-provenance.json). Nothing
// downloads until the page has loaded, nothing plays with reduced motion or Save-Data (the posters
// stand in), and every clip pauses off-screen and in a background tab.
const connection = navigator.connection || {};
const quiet = calm.matches || connection.saveData || /(^|-)2g$/.test(connection.effectiveType || '');
const probe = document.createElement('video');
// WebM is smaller; MP4 (H.264) plays everywhere, Safari included.
const pick = (mp4, webm) => probe.canPlayType('video/webm; codecs="vp9"') === 'probably' ? webm : mp4;
const afterLoad = fn => document.readyState === 'complete' ? fn() : addEventListener('load', fn, { once: true });
const play = video => { if (!document.hidden) video.play().catch(() => {}); };
// Each clip sits over a lazy-loaded picture of its first frame (a poster attribute would download
// straight away, before the hero). The video fades in once it has a frame to show. With reduced
// motion it stays on top with its controls, the picture as its poster once that has loaded.
const overPicture = (video, picture, quietly) => {
  if (quietly) {
    const setPoster = () => { video.poster = picture.currentSrc || picture.src; };
    if (picture.complete && picture.naturalWidth) setPoster(); else picture.addEventListener('load', setPoster, { once: true });
    video.controls = true; video.classList.add('on'); video.removeAttribute('aria-hidden'); video.removeAttribute('tabindex');
    video.setAttribute('aria-label', picture.alt);
  } else video.addEventListener('loadeddata', () => video.classList.add('on'));
};
// Play while on screen (and the tab is showing), pause otherwise.
function whileVisible(video, onShow = play) {
  let seen = false;
  const update = () => seen && !document.hidden ? onShow(video) : video.pause();
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => { seen = entries.some(e => e.isIntersecting); update(); }, { threshold: 0.15 }).observe(video);
  else seen = true;
  document.addEventListener('visibilitychange', update);
  update();
}

// Hero: the creek flyover behind the title. Its camera moves one way, so instead of a hard cut at
// the end it fades back to the still underneath (the clip's first frame) and starts again.
const hero = document.querySelector('.hero-video');
if (hero && !quiet) {
  const tall = matchMedia('(max-width: 720px) and (orientation: portrait)');
  const load = () => {
    const kind = tall.matches ? 'tall' : 'wide';
    if (hero.dataset.kind === kind) return;
    hero.dataset.kind = kind;
    hero.classList.remove('on');
    hero.src = pick(hero.dataset[kind + 'Mp4'], hero.dataset[kind + 'Webm']);
    hero.preload = 'auto';
    if (!hero.dataset.watched) { hero.dataset.watched = 1; whileVisible(hero); } else play(hero);
  };
  hero.addEventListener('playing', () => hero.classList.add('on'));
  hero.addEventListener('timeupdate', () => { if (hero.duration - hero.currentTime < 0.8) hero.classList.remove('on'); });
  hero.addEventListener('ended', () => { hero.currentTime = 0; play(hero); });
  afterLoad(load);
  tall.addEventListener?.('change', load);
}

// "From the map to the forest floor". With a mouse on a wide screen, scrolling plays the descent
// (the clip has a keyframe every half second so seeking stays quick). Elsewhere it simply plays
// while on screen, and with reduced motion it waits for the player's own Play.
const descent = document.querySelector('.descent');
if (descent) {
  // (the two beats the clip is cut around: the overhead view, then eye level. The other cards only show
  // while scrolling plays it, where they pass by one after another)
  const video = descent.querySelector('video'), beats = [...descent.querySelectorAll('.descent-beats li:not(.more)')];
  overPicture(video, descent.querySelector('.descent-poster'), quiet);
  const beat = progress => beats.forEach((li, i) => li.classList.toggle('on', i === (progress < 0.5 ? 0 : 1)));
  const source = () => { if (!video.src) { video.src = pick(video.dataset.mp4, video.dataset.webm); video.preload = 'auto'; } };
  if (quiet) { video.src = pick(video.dataset.mp4, video.dataset.webm); video.addEventListener('timeupdate', () => beat(video.currentTime / video.duration)); }
  else if (matchMedia('(pointer: fine) and (min-width: 721px)').matches) {
    descent.classList.add('scrub');
    const track = descent.querySelector('.descent-track');
    // One seek at a time: when it lands, seek again if the reader has scrolled on meanwhile.
    let progress = 0, frame = 0;
    const seek = () => {
      if (!video.duration || video.seeking) return;
      const target = progress * (video.duration - 0.05);
      if (Math.abs(video.currentTime - target) > 0.02) video.currentTime = target;
    };
    video.addEventListener('seeked', seek);
    video.addEventListener('loadedmetadata', seek);
    const onScroll = () => {
      frame = 0;
      const box = track.getBoundingClientRect();
      progress = Math.min(1, Math.max(0, -box.top / (box.height - innerHeight)));
      beat(progress);
      seek();
    };
    addEventListener('scroll', () => { frame ||= requestAnimationFrame(onScroll); }, { passive: true });
    // Fetch it as the section nears, so the first scroll already moves the picture.
    afterLoad(() => {
      if (!('IntersectionObserver' in window)) return source();
      const near = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { near.disconnect(); source(); } }, { rootMargin: '150% 0px' });
      near.observe(descent);
    });
    onScroll();
  } else {
    video.loop = true;
    video.addEventListener('timeupdate', () => beat(video.currentTime / video.duration));
    afterLoad(() => whileVisible(video, v => { source(); play(v); }));
  }
}

// Keystone moments: each clip plays while it is on screen.
for (const video of document.querySelectorAll('.moment-clip video')) {
  const source = () => { if (!video.src) { video.src = pick(video.dataset.mp4, video.dataset.webm); video.preload = 'auto'; } };
  overPicture(video, video.parentElement.querySelector('img'), quiet);
  if (quiet) video.src = pick(video.dataset.mp4, video.dataset.webm);
  else afterLoad(() => whileVisible(video, v => { source(); play(v); }));
}
