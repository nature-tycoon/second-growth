// The static homepage switches fresh game captures and their captions.
// It never imports the simulation or touches player saves.
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
    mapImage.alt = choice.dataset.alt;
    mapImage.parentElement.dataset.momentLayout = choice.dataset.momentLayout;
    document.querySelector('#map-image-label').textContent = choice.dataset.name;
    document.querySelector('#moment-title').textContent = choice.dataset.momentTitle;
    document.querySelector('#moment-description').textContent = choice.dataset.momentDescription;
    document.querySelector('.map-panel').dataset.landscape = choice.dataset.map;
  });
}
// Fetch the other landscape and creek images once the explorer nears the
// viewport (or on hover), so switching never shows an empty panel.
const preloaded = new Set();
const preload = src => { if (!preloaded.has(src)) { preloaded.add(src); new Image().src = src; } };
const preloadAll = () => [...choices, ...document.querySelectorAll('.sequence-choice')].forEach(c => preload(c.dataset.image));
for (const choice of choices) choice.addEventListener('pointerenter', () => preload(choice.dataset.image));
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); preloadAll(); }
  }, { rootMargin: '600px 0px' });
  for (const section of document.querySelectorAll('.restoration, .explorer')) observer.observe(section);
} else preloadAll();
const sequenceChoices = [...document.querySelectorAll('.sequence-choice')];
const sequenceImage = document.querySelector('#sequence-image');
for (const choice of sequenceChoices) {
  choice.addEventListener('click', () => {
    for (const button of sequenceChoices) button.setAttribute('aria-pressed', String(button === choice));
    sequenceImage.src = choice.dataset.image;
    sequenceImage.alt = choice.dataset.alt;
    document.querySelector('#sequence-label').textContent = choice.dataset.label;
    document.querySelector('#sequence-description').textContent = choice.dataset.caption;
  });
}
