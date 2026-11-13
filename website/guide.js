// Field guide. Index: search, the animal/plant toggle and the landscape chips (plain anchor links
// without JavaScript). Species pages: the recorded call as a play button over a waveform.
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const still = matchMedia('(prefers-reduced-motion: reduce)');

const input = $('.guide-search input');
if (input) {
  const tools = $('.guide-tools'), sections = $$('.guide-map'), chips = $$('.land-chips .chip');
  const toggle = $('.kind-toggle'), count = $('.guide-count'), empty = $('.guide-empty');
  const lands = new Set(sections.map(s => s.id));
  const state = { land: 'all', kind: 'all' };
  toggle.hidden = false;

  function apply() {
    const words = input.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const shown = new Set(), perLand = {};
    for (const section of sections) {
      const landOk = state.land === 'all' || section.id === state.land;
      const matches = new Set();
      let visible = 0;
      for (const group of $$('.kind-group', section)) {
        const kindOk = state.kind === 'all' || group.dataset.kind === state.kind;
        let inGroup = 0;
        for (const li of group.querySelectorAll('li')) {
          const match = kindOk && words.every(w => li.dataset.search.includes(w));
          if (match) matches.add(li.dataset.slug);
          li.hidden = !(match && landOk);
          if (!li.hidden) { inGroup++; shown.add(li.dataset.slug); }
        }
        group.hidden = !inGroup;
        visible += inGroup;
      }
      section.hidden = !visible;
      perLand[section.id] = matches.size;
    }
    perLand.all = new Set(sections.flatMap(s => $$('li', s).filter(li => {
      const group = li.closest('.kind-group');
      return (state.kind === 'all' || group.dataset.kind === state.kind) && words.every(w => li.dataset.search.includes(w));
    }).map(li => li.dataset.slug))).size;
    for (const chip of chips) {
      chip.setAttribute('aria-current', chip.dataset.land === state.land ? 'true' : 'false');
      const small = $('small', chip);
      if (small) small.textContent = perLand[chip.dataset.land];
      chip.classList.toggle('none', !perLand[chip.dataset.land]);
    }
    for (const button of $$('button', toggle)) button.setAttribute('aria-pressed', String(button.dataset.kind === state.kind));
    count.textContent = `${shown.size} species`;
    empty.hidden = shown.size > 0;
  }
  // Bring the results to the top of the screen when a filter changes far down the page.
  const toResults = () => {
    const top = tools.getBoundingClientRect().top + scrollY;
    if (scrollY > top) scrollTo({ top, behavior: still.matches ? 'auto' : 'smooth' });
  };
  const fromHash = () => { state.land = lands.has(location.hash.slice(1)) ? location.hash.slice(1) : 'all'; apply(); };

  input.addEventListener('input', apply);
  for (const chip of chips) chip.addEventListener('click', event => {
    event.preventDefault();
    state.land = chip.dataset.land;
    history.replaceState(null, '', state.land === 'all' ? location.pathname : '#' + state.land);
    apply();
    toResults();
  });
  toggle.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    state.kind = button.dataset.kind;
    apply();
    toResults();
  });
  addEventListener('hashchange', fromHash);
  fromHash();
  if (state.land !== 'all') requestAnimationFrame(() => tools.scrollIntoView({ block: 'start' }));
}

const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>',
};
const clock = s => isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00';
for (const box of $$('.call-player')) {
  const audio = $('audio', box);
  const player = document.createElement('div');
  player.className = 'player';
  player.innerHTML = `<button type="button" class="play" aria-label="Play the call">${ICON.play}</button><div class="wave" aria-hidden="true"></div><span class="time">0:00</span>`;
  const button = $('.play', player), wave = $('.wave', player), time = $('.time', player);
  // A fixed, decorative waveform (the same shape on every page); it fills in as the call plays.
  const bars = Array.from({ length: 48 }, (_, i) => {
    const bar = document.createElement('i');
    const h = 0.25 + 0.75 * Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.23 + 1));
    bar.style.setProperty('--h', h.toFixed(2));
    wave.append(bar);
    return bar;
  });
  audio.controls = false;
  audio.after(player);
  const paint = () => {
    const p = audio.duration ? audio.currentTime / audio.duration : 0;
    bars.forEach((bar, i) => bar.classList.toggle('on', i / bars.length < p));
    time.textContent = audio.duration ? `${clock(audio.currentTime)} / ${clock(audio.duration)}` : clock(audio.currentTime);
  };
  const setPlaying = playing => {
    button.innerHTML = playing ? ICON.pause : ICON.play;
    button.setAttribute('aria-label', playing ? 'Pause the call' : 'Play the call');
    player.classList.toggle('playing', playing);
  };
  button.addEventListener('click', () => audio.paused ? audio.play() : audio.pause());
  wave.addEventListener('click', event => {
    if (!audio.duration) return;
    const box = wave.getBoundingClientRect();
    audio.currentTime = audio.duration * Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
  });
  audio.addEventListener('play', () => setPlaying(true));
  audio.addEventListener('pause', () => setPlaying(false));
  audio.addEventListener('ended', () => { setPlaying(false); audio.currentTime = 0; paint(); });
  audio.addEventListener('timeupdate', paint);
  audio.addEventListener('loadedmetadata', paint);
}
