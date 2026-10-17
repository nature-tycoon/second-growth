// A small landscape browser. No simulation, animation loop, or player saves here.
const choices = [...document.querySelectorAll('.map-choice')];
const preview = document.querySelector('#map-image');
let selection = 0;
for (const choice of choices) {
  choice.addEventListener('click', async () => {
    const request = ++selection;
    const image = new Image();
    image.src = choice.dataset.image;
    try { await image.decode(); } catch { return; }
    if (request !== selection) return;
    for (const button of choices) button.setAttribute('aria-pressed', String(button === choice));
    preview.src = image.src;
    preview.alt = `${choice.dataset.name} landscape in Second Growth`;
    document.querySelector('#map-region').textContent = choice.dataset.region;
    document.querySelector('#map-name').textContent = choice.dataset.name;
    document.querySelector('#map-copy').textContent = choice.dataset.copy;
  });
}
