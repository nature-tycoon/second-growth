export const TRAIL_RESOLUTION = 4;
// Large terrestrial mammals form visible trails; smaller wildlife keeps its own
// movement without painting every place it visits. Numerical wear is game-scale.
const UNGULATES = new Set(['deer', 'elk', 'wildebeest', 'zebra', 'gazelle', 'impala', 'topi', 'hartebeest',
  'giraffe', 'elephant', 'gajah', 'buffalo', 'warthog', 'rhino', 'sumrhino', 'hippo', 'peccary', 'boar', 'sambar', 'tapir', 'cattle']);
const profiles = new WeakMap();
export function trailProfile(def) {
  if (!profiles.has(def)) profiles.set(def, buildProfile(def));
  return profiles.get(def);
}
function buildProfile(def) {
  if (def.reef || def.move !== 'ground' && !(def.move === 'semi' && def.key === 'tapir')) return null;
  const size = def.sprite.len || def.sprite.size || 0;
  if (UNGULATES.has(def.key)) return { wear: Math.min(0.055, 0.018 + size * 0.00045), range: !def.crossing, cover: ['deer','elk','sambar','tapir','peccary','boar','sumrhino'].includes(def.key) };
  if (['bear', 'feline', 'canine', 'hyena'].includes(def.sprite.kind) && size >= 24) return { wear: 0.012, range: false };
  return null;
}
