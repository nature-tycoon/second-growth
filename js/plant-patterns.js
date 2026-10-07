// Stable, overlapping plant communities, shared by seed mixes and their appearance.
// Habitat suitability still decides what can grow; this only groups suitable species.
import { hashStr, valueNoise } from './rng.js';

export function plantAffinity(p, x, y) {
  const salt = hashStr(p.key) % 10000;
  const scale = p.layer === 2 ? 11 : p.layer === 1 ? 6 : 4.5;
  const n = valueNoise(x + 83, y + 137, scale, salt) * 0.8
    + valueNoise(x + 227, y + 59, scale * 0.45, salt + 1) * 0.2;
  return Math.exp((n - 0.5) * 8);
}

const FORMS = {
  coneflower: 'cone', blackeyed: 'darkdaisy', sunshine: 'daisy', coreopsis: 'daisy',
  aster: 'aster', cosmos: 'daisy', tithonia: 'daisy',
  camas: 'camas', lupine: 'spike', fireweed: 'spire', cardinalflower: 'spire',
  salvia: 'spire', indigofera: 'spike', crotalaria: 'spike', kudzu: 'spike',
  yarrow: 'umbel', butterflyweed: 'umbel', swampmilkweed: 'umbel', joepye: 'umbel',
  mountainmint: 'umbel', parthenium: 'umbel', mikania: 'umbel',
  goldenrod: 'plume', phlox: 'star', sodomapple: 'star', pescaprae: 'trumpet',
  asystasia: 'trumpet', honeysuckle: 'trumpet',
  beebalm: 'crown', mimosa: 'puff', dormilona: 'puff', fireball: 'globe',
  skunk: 'spathe', costus: 'cone', calathea: 'spathe',
  bluelily: 'waterlily', waterlily: 'waterlily', lotus: 'waterlily', hyacinth: 'camas',
};
export function flowerForm(p) {
  if (!p.look.flower) return null;
  if (FORMS[p.key]) return FORMS[p.key];
  return ['forb', 'tallforb'].includes(p.look.type) ? 'star' : null;
}

export function grassForm(p) {
  return p.key === 'redoat' ? 'savannagrass' : p.key === 'sporobolus' ? 'dropseed'
    : p.key === 'papyrus' ? 'papyrus' : p.look.type;
}
