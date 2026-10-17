// The static homepage switches fresh game captures and their captions.
// It never imports the simulation or touches player saves.
// A short fade when a picture changes, skipped for reduced motion.
const calm = matchMedia('(prefers-reduced-motion: reduce)');
const fadeIn = image => { if (!calm.matches && image.animate) image.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 450, easing: 'ease' }); };
const choices = [...document.querySelectorAll('.map-choice')];
const fields = {
  name: document.querySelector('#map-name'),
  region: document.querySelector('#map-region'),
  habitat: document.querySelector('#map-habitat'),
  copy: document.querySelector('#map-copy'),
  species: document.querySelector('#map-species'),
};
const mapImage = document.querySelector('#map-image');
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
