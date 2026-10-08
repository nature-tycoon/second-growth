// Art direction in sRGB. These colours affect rendering only, never plant registries.
// Dark canopy, middle understory and lighter meadow values make the layers readable.
export const PALETTES = {
  pnw: {
    name: 'Pine, sage & copper',
    needle: ['#315d58', '#527568'], canopy: ['#53765a', '#8da377'],
    shrub: ['#426958', '#72916a'], ground: ['#688567', '#9cae80'], wet: ['#557e70', '#91a78b'],
    spring: '#b1bf88', dry: '#bdac83', winter: '#8f9987',
    autumn: ['#c9a25b', '#b8784c', '#aa6152'],
    pasture: ['#95a982', '#a5aa80', '#b0a07d', '#899889'],
  },
  atlanta: {
    name: 'Oak, moss & rose',
    needle: ['#466b59', '#6d8771'], canopy: ['#57764d', '#9bad76'],
    shrub: ['#527459', '#899d72'], ground: ['#738f61', '#a9b889'], wet: ['#5e8270', '#9dad87'],
    spring: '#bfcb91', dry: '#c4b089', winter: '#999584',
    autumn: ['#d2a253', '#bf784a', '#ac5e56'],
    pasture: ['#a4b888', '#a9b18b', '#b7a482', '#989a87'],
  },
  amazon: {
    name: 'Jade, fern & orchid',
    needle: ['#306953', '#558866'], canopy: ['#346e58', '#7ca27a'],
    shrub: ['#3a755b', '#6f9b70'], ground: ['#5b8d65', '#a2b880'], wet: ['#4b8170', '#8cae89'],
    spring: '#acbd83', dry: '#b8a576', winter: '#8e9b7d',
    autumn: ['#bda26a', '#aa8059', '#a26860'],
    pasture: ['#94ad80', '#a5ae83', '#9bac82', '#91a67d'],
  },
  sumatra: {
    name: 'Deep emerald & bronze',
    needle: ['#2c6257', '#4c826b'], canopy: ['#316858', '#719579'],
    shrub: ['#3e715e', '#719471'], ground: ['#5d8268', '#9aaa7a'], wet: ['#49796d', '#84a08b'],
    spring: '#a8b880', dry: '#b8a17b', winter: '#889681',
    autumn: ['#b99d63', '#ac7a53', '#9d6657'],
    pasture: ['#91a580', '#a6a57e', '#889d7e', '#95a883'],
  },
  serengeti: {
    name: 'Olive, straw & terracotta',
    needle: ['#586749', '#8b9567'], canopy: ['#68754e', '#a0a77a'],
    shrub: ['#6b7955', '#9aa273'], ground: ['#899562', '#b8bd87'], wet: ['#6d8a69', '#a3b18b'],
    spring: '#bbc48b', dry: '#c6ad78', winter: '#ac9d7c',
    autumn: ['#c5a064', '#b78459', '#a96c50'],
    pasture: ['#a5b07a', '#c0ae7f', '#b5a27a', '#a1ad7b'],
  },
  chinandega: {
    name: 'Dusty sage, ochre & coral',
    needle: ['#526f60', '#85947b'], canopy: ['#667d59', '#a1ad80'],
    shrub: ['#5d7b62', '#91a079'], ground: ['#87976d', '#b0b68a'], wet: ['#4f8070', '#8baa8b'],
    spring: '#b5c48e', dry: '#c5ac83', winter: '#aa9a7d',
    autumn: ['#c5a46e', '#b87e5a', '#ae6b60'],
    pasture: ['#a3b384', '#a1af80', '#baaa83', '#bdac88'],
  },
};

export const colorRgb = h => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const mix = (a, b, t) => a.map((c, k) => c + (b[k] - c) * t);
const compiled = Object.fromEntries(Object.entries(PALETTES).map(([id, p]) => [id,
  Object.fromEntries(Object.entries(p).filter(([k]) => k !== 'name').map(([k, v]) =>
    [k, Array.isArray(v) ? v.map(colorRgb) : colorRgb(v)]))]));

export function pastureColor(map, season, fallback) {
  return compiled[map]?.pasture[season] || colorRgb(fallback);
}

function green(p, pal) {
  const source = colorRgb(p.look.leaf);
  if (!pal) return source; // Reef organisms retain their coral, mantle and bleaching colours.
  const role = p.conifer ? 'needle' : p.layer === 2 ? 'canopy'
    : p.aquatic || ['sedge', 'tule', 'cattail', 'papyrus', 'lily'].includes(p.look.type) ? 'wet'
    : p.layer === 1 ? 'shrub' : 'ground';
  // Keep a species' relative lightness; darker salal remains darker than new alder leaves.
  const lightness = source[0] * .25 + source[1] * .6 + source[2] * .15;
  const t = Math.max(0, Math.min(1, (lightness - .22) / .42));
  return mix(source, mix(pal[role][0], pal[role][1], t), .72);
}

export function paletteLeafColor(p, phase, map) {
  const lk = p.look, pal = compiled[map];
  if (phase === 'bloom' && lk.crownBloom) return colorRgb(lk.flower);
  let c = green(p, pal);
  if (phase === 'bloom' && lk.bloomTint) return mix(c, colorRgb(lk.flower), lk.bloomTint);
  if (phase === 'spring') c = mix(c, pal?.spring || [.72, .86, .45], .4);
  else if (phase === 'late') {
    const dry = lk.dry ? mix(colorRgb(lk.dry), pal?.dry || colorRgb(lk.dry), .65) : pal?.dry || [.45, .5, .25];
    c = mix(c, dry, lk.dry ? .35 : .12);
  } else if (phase === 'fall') {
    if (lk.fall) {
      let fall = colorRgb(lk.fall);
      if (pal) {
        const closest = pal.autumn.reduce((a, b) =>
          b.reduce((s, v, k) => s + (v - fall[k]) ** 2, 0) < a.reduce((s, v, k) => s + (v - fall[k]) ** 2, 0) ? b : a);
        fall = mix(fall, closest, .65);
      }
      c = p.layer === 0 ? mix(fall, pal?.dry || [.55, .45, .3], .5) : fall;
    } else c = mix(c, lk.dry ? mix(colorRgb(lk.dry), pal?.dry || colorRgb(lk.dry), .65) : pal?.dry || [.6, .54, .28], lk.dry ? .7 : .4);
  } else if (phase === 'winter') {
    c = lk.dry ? mix(colorRgb(lk.dry), pal?.winter || [.55, .48, .35], pal ? .65 : .3)
      : mix(c, pal?.winter || [.42, .42, .3], p.layer === 0 && lk.type !== 'fern' && lk.type !== 'sedge' ? .5 : .12);
  }
  return c;
}
