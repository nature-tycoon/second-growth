// Portrait and tool-icon generation, with one shared cache.
import { isWater } from '../config.js';


import { PASSAGE_SPECIES } from '../data/bird-passage.js';
import { activeCatalog } from '../data/catalog.js';
import * as S from '../render/sprites.js';
import { renderPortrait, renderPlants } from '../render3d/portraits.js';
import { ICONS } from './icons.js';

// ---------------------------------------------------------------- thumbnails
const thumbCache = new Map();
function trim(src, pad = 3) {
  const ctx = src.getContext('2d');
  const { width: w, height: h } = src;
  const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < x0) return src;
  const c = document.createElement('canvas');
  c.width = x1 - x0 + 1 + pad * 2; c.height = y1 - y0 + 1 + pad * 2;
  c.getContext('2d').drawImage(src, x0, y0, c.width - pad * 2, c.height - pad * 2, pad, pad, c.width - pad * 2, c.height - pad * 2);
  return c;
}
function showcaseMonth(p) {
  if (p.look.bloom) return p.look.bloom[0];
  if (p.look.fruit) return p.look.fruit[0];
  return 3;
}
export function plantThumb(key, catalog = activeCatalog) {
  const k = catalog.definition.id + ':p' + key;
  if (thumbCache.has(k)) return thumbCache.get(k);
  const p = catalog.plant[key];
  const m = showcaseMonth(p);
  let src;
  // tropical plants have shapes the 2D painter doesn't know: render their 3D models instead
  if (p.look.tropical || p.look.savanna || catalog.definition.look.underwater) src = trim(renderPlants([p]), 4); // (and the reef's corals)
  else if (p.layer === 0) {
    const c = document.createElement('canvas'); c.width = 84; c.height = 84;
    c.getContext('2d').drawImage(S.groundSprite(p.id, 2, m, 0, catalog), 0, 0);
    src = trim(c);
  } else if (p.layer === 1) src = trim(S.shrubSprite(p.id, 2, m, 0, catalog));
  else src = trim(S.treeSprite(p.id, 3, 3, 0, catalog));
  const url = src.toDataURL();
  thumbCache.set(k, url);
  return url;
}
function mixThumb(keys, catalog = activeCatalog) {
  const k = catalog.definition.id + ':m' + keys.join();
  if (thumbCache.has(k)) return thumbCache.get(k);
  if (catalog.plant[keys[0]].look.tropical || catalog.plant[keys[0]].look.savanna || catalog.definition.look.underwater) {
    // tallest first so the trees stand behind: trees, then shrubs, then groundcover
    const url = trim(renderPlants([...new Set(keys)].slice(0, 3).map(k => catalog.plant[k]).sort((a, b) => b.layer - a.layer)), 4).toDataURL(); // (each kind once, even if the mix weights one)
    thumbCache.set(k, url);
    return url;
  }
  const c = document.createElement('canvas'); c.width = 120; c.height = 120;
  const ctx = c.getContext('2d');
  const pick = keys.slice(0, 3);
  pick.forEach((key, n) => {
    const p = catalog.plant[key], m = showcaseMonth(p);
    const img = p.layer === 0 ? S.groundSprite(p.id, 2, m, n & 1, catalog) : p.layer === 1 ? S.shrubSprite(p.id, 2, m, n & 1, catalog) : S.treeSprite(p.id, 2, 3, n & 1, catalog);
    const sc = p.layer === 2 ? 0.42 : p.layer === 1 ? 0.62 : 0.75;
    const x = 10 + n * 32, y = 120 - img.height * sc - (n === 1 ? 6 : 0);
    ctx.drawImage(img, x - (p.layer === 2 ? 20 : 8), y, img.width * sc, img.height * sc);
  });
  const url = trim(c).toDataURL();
  thumbCache.set(k, url);
  return url;
}
export function animalThumb(key, catalog = activeCatalog) {
  const k = catalog.definition.id + ':a' + key;
  if (thumbCache.has(k)) return thumbCache.get(k);
  const def = catalog.animal[key] || PASSAGE_SPECIES[key];
  // the species' 3D model, rendered once; the old 2D art is a fallback if WebGL isn't available
  let url;
  try { url = trim(renderPortrait(def), 6).toDataURL(); } catch (e) { url = trim(S.animalPortrait(def), 6).toDataURL(); }
  thumbCache.set(k, url);
  return url;
}
export function iconThumb(icon, catalog = activeCatalog) {
  if (icon.mix) return mixThumb(icon.mix, catalog);
  if (icon.plant) return plantThumb(icon.plant, catalog);
  if (icon.animal) return animalThumb(icon.animal, catalog);
  const k = catalog.definition.id + ':' + JSON.stringify(icon);
  if (thumbCache.has(k)) return thumbCache.get(k);
  let url;
  if (icon.terrain != null) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    if (isWater(icon.terrain)) ctx.drawImage(S.waterSprite(icon.terrain, 0, 1), 0, 0);
    else { ctx.beginPath(); ctx.roundRect(4, 4, 56, 56, 12); ctx.clip(); ctx.drawImage(S.terrainSprite(icon.terrain, 0, 1, catalog), 0, 0); }
    url = c.toDataURL();
  } else if (icon.feature != null) url = trim(S.featureSprite(icon.feature, 0)).toDataURL();
  else if (icon.svg) url = 'data:image/svg+xml;utf8,' + encodeURIComponent(ICONS[icon.svg].replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"'));
  thumbCache.set(k, url);
  return url;
}
