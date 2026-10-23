// Where the animals are: a smoothed head count per tile for the "Where animals are" overlay,
// and a fixed colour per species for the minimap and the legend.

// Every animal on the map (not ones walking out), or just one species (sp = catalog index).
export function residents(agents, sp = null) {
  return agents.filter(a => !a.leaving && (sp == null || a.sp === sp));
}

// Head count per tile, spread over `radius` tiles with a two-pass box blur, then scaled 0..1 by the
// densest spot. The curve (power 0.6) keeps a lone animal visible beside a big herd.
export function animalDensity(world, agents, sp = null, radius = 2) {
  const { w, h } = world, n = w * h;
  let d = new Float32Array(n), t = new Float32Array(n);
  for (const a of residents(agents, sp)) {
    const x = Math.floor(a.x), y = Math.floor(a.y);
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    d[y * w + x]++;
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = Math.max(0, x - radius), e = Math.min(w - 1, x + radius); k <= e; k++) s += d[y * w + k];
      t[y * w + x] = s;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = Math.max(0, y - radius), e = Math.min(h - 1, y + radius); k <= e; k++) s += t[k * w + x];
      d[y * w + x] = s;
    }
  }
  let max = 0;
  for (let i = 0; i < n; i++) if (d[i] > max) max = d[i];
  if (max > 0) for (let i = 0; i < n; i++) d[i] = Math.pow(d[i] / max, 0.6);
  return d;
}

// The middle of the biggest group of one species (or of all animals): the tile where the smoothed
// head count peaks, as tile-centre coordinates. null when there are none.
export function densestSpot(world, agents, sp = null) {
  const d = animalDensity(world, agents, sp);
  let best = -1;
  for (let i = 0; i < d.length; i++) if (d[i] > 0 && (best < 0 || d[i] > d[best])) best = i;
  return best < 0 ? null : { x: best % world.w + 0.5, y: Math.floor(best / world.w) + 0.5 };
}

// Head count per species (index → count) of the animals on the map.
export function speciesCounts(agents, nSpecies) {
  const c = new Array(nSpecies).fill(0);
  for (const a of agents) if (!a.leaving) c[a.sp]++;
  return c;
}

// A steady, well-spread colour per species (golden-angle hues), the same every visit to a map.
export function speciesColor(index) {
  return `hsl(${Math.round(index * 137.508) % 360}, 72%, 52%)`;
}
