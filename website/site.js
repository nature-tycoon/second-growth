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
    document.querySelector('#map-image-label').textContent = choice.dataset.name;
    document.querySelector('#moment-title').textContent = choice.dataset.momentTitle;
    document.querySelector('#moment-description').textContent = choice.dataset.momentDescription;
    document.querySelector('#map-image-caption').textContent = choice.dataset.caption;
    document.querySelector('.map-panel').dataset.landscape = choice.dataset.map;
  });
}
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
