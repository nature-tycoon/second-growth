// Terrain tile texture construction and its shared GPU sampling layout.
import * as THREE from 'three';
import { T } from '../config.js';
import * as S from '../render/sprites.js';
import { activeCatalog } from '../data/catalog.js';

const ATLAS_TYPES = [T.PASTURE, T.FIELD, T.SOIL, T.GRAVEL, T.MUD, T.ROAD, T.DUFF, T.TRAIL, S.TURF, S.BED];
const CELL = 64, GUT = 4, SLOT = CELL + GUT * 2, COLS = 28, ATLAS_W = 2048, ATLAS_H = 512;

export const ATLAS_LAYOUT = Object.freeze({ CELL, GUT, SLOT, COLS, ATLAS_W, ATLAS_H });

export function buildAtlas(catalog = activeCatalog) {
  const W = ATLAS_W, H = ATLAS_H;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const uv = {}, slot = {};
  let k = 0;
  for (const t of ATLAS_TYPES) for (let season = 0; season < 4; season++) for (let v = 0; v < 4; v++) {
    const sx = (k % COLS) * SLOT, sy = Math.floor(k / COLS) * SLOT;
    const img = S.terrainSprite(t, season, v, catalog);
    ctx.drawImage(img, sx + GUT, sy + GUT);
    // copy edges into the gutter so mipmaps don't bleed between tiles
    ctx.drawImage(img, 0, 0, 1, CELL, sx, sy + GUT, GUT, CELL);
    ctx.drawImage(img, CELL - 1, 0, 1, CELL, sx + GUT + CELL, sy + GUT, GUT, CELL);
    ctx.drawImage(c, sx, sy + GUT, SLOT, 1, sx, sy, SLOT, GUT);
    ctx.drawImage(c, sx, sy + GUT + CELL - 1, SLOT, 1, sx, sy + GUT + CELL, SLOT, GUT);
    uv[`${t}|${season}|${v}`] = [(sx + GUT + 0.5) / W, 1 - (sy + GUT + 0.5) / H, (sx + GUT + CELL - 0.5) / W, 1 - (sy + GUT + CELL - 0.5) / H];
    slot[`${t}|${season}|${v}`] = k;
    k++;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { tex, uv, slot, W, H };
}
