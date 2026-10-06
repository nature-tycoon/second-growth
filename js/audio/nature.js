// Soundscape rules independent of Web Audio, so every map/season can be audited.
// Voices are quiet, stylized synthesis, not field recordings or identification aids.
// Month numbers follow the game calendar: March = 0, February = 11.
export const CALL_RANGE = { cattle: 42, lion: 64, hyena: 64 };
// Prominent voices use bounded waits instead of a chance that can miss an entire night.
export const PROMINENT_CALLS = {
  moo: { first: [1, 3], repeat: [12, 22], duration: 2.5 },
  lion: { first: [2, 4], repeat: [25, 40], duration: 8.5 },
  hyena: { first: [1, 3], repeat: [16, 28], duration: 4.5 },
};
export const SOUNDSCAPES = {
  pnw: { birds: { robin: 'robin', wren: 'wren', thrush: 'thrush', meadowlark: 'meadowlark', jay: 'jay', kingfisher: 'rattle' },
    seasons: [1, 0.8, 0.35, 0.22], insects: [0, 0.003, 0.001, 0],
    calls: [['treefrog', 'frog', 'wetNight', 0.4, [0, 1, 2, 11]], ['owl', 'owl', 'night', 0.035], ['woodpecker', 'drum', 'day', 0.025]] },
  atlanta: { birds: { cardinal: 'cardinal', wren: 'carolinaWren', chickadee: 'chickadee', bluebird: 'bluebird', goldfinch: 'goldfinch' },
    seasons: [1, 0.85, 0.45, 0.3], insects: [0.001, 0.015, 0.006, 0],
    calls: [['peeper', 'peeper', 'wetNight', 0.65, [0, 1, 11]], ['toad', 'toad', 'wetNight', 0.12, [0, 1, 2]], ['owl', 'barredOwl', 'night', 0.035], ['woodpecker', 'drum', 'day', 0.025]] },
  amazon: { birds: { toucan: 'toucan', macaw: 'parrot', amkingfisher: 'rattle', hoatzin: 'rasp', hermit: 'hummer' },
    seasons: [1, 0.85, 0.85, 1], insects: [0.012, 0.014, 0.012, 0.014],
    calls: [['howler', 'howler', 'dawnDusk', 0.045], ['dartfrog', 'dartfrog', 'dampDay', 0.12]] },
  serengeti: { birds: { weaver: 'weaver', roller: 'rasp' },
    seasons: [1, 0.75, 0.7, 0.9], insects: [0.003, 0.012, 0.009, 0.004],
    calls: [['hyena', 'hyena', 'night', 0.025], ['lion', 'lion', 'night', 0.012], ['hornbill', 'groundHornbill', 'dawnDusk', 0.06], ['hippo', 'hippo', 'water', 0.025], ['zebra', 'zebra', 'day', 0.018]] },
  chinandega: { birds: { motmot: 'motmot', lora: 'parrot', chocoyo: 'parakeet', urraca: 'jay', guaco: 'falcon', hummingbird: 'hummer' },
    seasons: [0.85, 1, 1, 0.85], insects: [0.01, 0.008, 0.01, 0.009],
    calls: [['congo', 'howler', 'dawnDusk', 0.045], ['cattle', 'moo', 'day', 0.025]] },
  sumatra: { birds: { hornbill: 'hornbill', bulbul: 'bulbul', sunbird: 'sunbird', kingfisher: 'rattle', serpenteagle: 'eagle' },
    seasons: [1, 0.9, 1, 1], insects: [0.015, 0.017, 0.014, 0.016],
    calls: [['siamang', 'siamang', 'morning', 0.045], ['barnowl', 'barnOwl', 'night', 0.025], ['flyingfrog', 'treeFrog', 'wetNight', 0.18, [7, 8, 9, 10]]] },
  reef: { birds: { booby: 'booby', noddy: 'noddy' }, seasons: [0.8, 0.7, 1, 1], insects: [0, 0, 0, 0], calls: [] },
};

export const BIRD_PHRASES = {
  // [starting Hz, ending Hz, duration, gap, notes, waveform]
  robin: [2100, 2900, 0.14, 0.22, 4, 'sine'], wren: [3400, 4500, 0.065, 0.1, 12, 'sine'],
  thrush: [1900, 4200, 0.2, 0.26, 5, 'sine'], meadowlark: [2400, 1500, 0.23, 0.3, 5, 'sine'],
  cardinal: [3000, 1800, 0.17, 0.24, 5, 'sine'], carolinaWren: [2900, 3800, 0.1, 0.15, 9, 'sine'],
  chickadee: [4000, 3500, 0.11, 0.2, 3, 'sine'], bluebird: [1900, 2500, 0.16, 0.27, 3, 'sine'],
  goldfinch: [3300, 4200, 0.1, 0.18, 4, 'sine'], jay: [1200, 750, 0.23, 0.45, 3, 'sawtooth'],
  rattle: [1900, 1500, 0.035, 0.07, 10, 'triangle'], toucan: [650, 550, 0.18, 0.4, 5, 'triangle'],
  parrot: [1100, 750, 0.3, 0.55, 3, 'sawtooth'], parakeet: [2100, 1700, 0.15, 0.3, 4, 'sawtooth'],
  rasp: [800, 620, 0.22, 0.4, 3, 'sawtooth'], hummer: [6200, 5400, 0.045, 0.12, 4, 'sine'],
  weaver: [3600, 2400, 0.07, 0.14, 7, 'triangle'], motmot: [650, 800, 0.18, 0.4, 2, 'sine'],
  falcon: [1300, 1000, 0.19, 0.28, 8, 'triangle'], hornbill: [520, 430, 0.32, 0.65, 4, 'triangle'],
  bulbul: [2300, 3400, 0.12, 0.2, 5, 'sine'], sunbird: [4700, 5700, 0.06, 0.13, 6, 'sine'],
  eagle: [2200, 3200, 0.28, 0.65, 3, 'sine'], booby: [550, 400, 0.32, 0.6, 2, 'sawtooth'],
  noddy: [1300, 900, 0.17, 0.27, 4, 'triangle'],
};

export function natureMix(L, weather, season) {
  if (!L || !SOUNDSCAPES[L.map]) return { rain: 0, wind: 0, creek: 0, river: 0, leaves: 0, surf: 0, reef: 0, bugs: 0, birds: 0 };
  const P = SOUNDSCAPES[L.map], marine = L.map === 'reef', rain = weather === 'rain', snow = weather === 'snow';
  const cold = (L.map === 'pnw' || L.map === 'atlanta') && season === 3;
  const day = Math.max(0, 1 - L.night), growth = 0.25 + 0.75 * L.health;
  // Calm weather should leave space between wildlife calls. Trees shelter the low wind
  // bed, and foliage only adds a light rustle instead of a constant broadband rush.
  const breeze = rain ? 1.65 : weather === 'cloud' ? 1 : 0.75;
  const bugs = P.insects[season] * growth * (cold || snow ? 0 : 1) * (rain ? 0.2 : 1);
  return {
    rain: rain ? (marine ? 0.055 : 0.14) : 0, // snowfall has no rain hiss
    wind: (marine ? 0.001 + 0.004 * L.shore : (0.002 + 0.018 * L.bare) * (1 - 0.7 * L.canopy)) * breeze * (1 - 0.2 * L.night),
    creek: marine ? 0 : 0.045 * L.creek * (L.map === 'chinandega' && L.dry ? 0.25 : 1),
    river: marine || L.map === 'chinandega' ? 0 : 0.035 * L.river,
    leaves: marine ? 0 : 0.006 * L.canopy * (rain ? 1.4 : weather === 'cloud' ? 0.8 : 0.5),
    surf: marine ? 0.045 + 0.035 * L.shore : L.map === 'chinandega' ? 0.07 * L.river : 0,
    reef: marine ? (0.008 + 0.015 * L.health) * (1 - L.shore * 0.85) : 0,
    bugs: bugs * (L.map === 'serengeti' || (L.map === 'chinandega' && L.dry) ? day : 0.7 + 0.5 * L.night),
    birds: (snow ? 0 : rain ? 0.18 : 1) * P.seasons[season] * day * (1 + 1.6 * L.dawn) * (0.45 + 0.55 * L.health),
  };
}

export function natureCallRates(L, weather, season) {
  if (!L || !SOUNDSCAPES[L.map] || weather === 'snow') return [];
  const day = 1 - L.night, evening = Math.max(L.night, L.dusk), month = L.month ?? season * 3;
  const activity = { day, night: evening, dawnDusk: L.dawn + L.dusk * 0.35,
    morning: day * (L.dawn + (L.tod >= 0.07 && L.tod < 0.3 ? 0.7 : 0)),
    wetNight: evening * L.wet, dampDay: day * L.canopy, water: L.water };
  const rates = SOUNDSCAPES[L.map].calls.filter(([key, , , , months]) => (L.callPresent ?? L.present).includes(key) && (!months || months.includes(month)))
    .map(([, voice, when, rate]) => ({ voice, rate: rate * activity[when] * (weather === 'rain' ? (when === 'wetNight' ? 1.2 : 0.35) : 1) }));
  if ((L.map === 'pnw' || L.map === 'atlanta') && (season === 1 || season === 2)) rates.push({ voice: 'cricket', rate: L.night * (0.03 + 0.14 * L.health) * (weather === 'rain' ? 0.2 : 1) });
  // A general underwater texture, like insect ambience: shrimp aren't individual game agents.
  if (L.map === 'reef') rates.push({ voice: 'reefSnap', rate: (0.4 + 2 * L.health) * (1 - L.shore * 0.95) });
  return rates.filter(c => c.rate > 0);
}
