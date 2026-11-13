// Field guide index: filter the species cards as you type (name, scientific name or group).
const input = document.querySelector('.guide-search input');
const cards = [...document.querySelectorAll('.guide-cards li')];
const sections = [...document.querySelectorAll('.guide-map')];
const empty = document.querySelector('.guide-empty');
input?.addEventListener('input', () => {
  const words = input.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  for (const card of cards) card.hidden = !words.every(w => card.dataset.search.includes(w));
  for (const section of sections) {
    for (const list of section.querySelectorAll('.guide-cards')) {
      const title = list.previousElementSibling;
      title.hidden = list.hidden = ![...list.children].some(li => !li.hidden);
    }
    section.hidden = ![...section.querySelectorAll('.guide-cards li')].some(li => !li.hidden);
  }
  empty.hidden = sections.some(s => !s.hidden);
});
