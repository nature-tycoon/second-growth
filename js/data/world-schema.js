import { TRAIL_RESOLUTION } from './animal-trails.js';
// Tile-array names and storage types shared by save encoding and contract checks.
// Plant IDs are one-based (zero means empty); animal indices are zero-based.
// The height field covers vertices plus the decorative border, not just farm tiles.
export const WORLD_ARRAY_TYPES = Object.freeze({
  terrain: Uint8Array, baseMoist: Float32Array, moist: Float32Array, soil: Float32Array,
  ground: Uint8Array, groundG: Float32Array, shrub: Uint8Array, shrubG: Float32Array,
  tree: Uint8Array, treeG: Float32Array, treeAge: Float32Array,
  feature: Uint8Array, featureAge: Float32Array, struct: Int16Array, variant: Uint8Array,
  vh: Float32Array, flood: Uint8Array, fire: Uint8Array, scorch: Float32Array,
  rx: Uint8Array, marks: Uint8Array,
});
export const WORLD_ARRAYS = Object.freeze(Object.keys(WORLD_ARRAY_TYPES));
export const EXTRA_ARRAYS = Object.freeze({
  bleach: Float32Array, seedbank: Uint16Array, trod: Float32Array, trailE: Float32Array, trailS: Float32Array, trailDensity: Float32Array, bloomLast: Int32Array,
  mulchDays: Uint16Array, browseDamage: Float32Array,
});

export const extraArrayLimit = (key, tiles) => key === 'trailDensity' ? tiles * TRAIL_RESOLUTION ** 2 : tiles;
