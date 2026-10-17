// Explicit, researched species profiles. Radii are compact game-scale core areas,
// not estimates of real-world hectares. Sources and scope: decision 0007.
import { DAYS_PER_YEAR } from '../config.js';
import { isMale } from './animals.js';
const CAT = { kind: 'range', rivals: 'males' };
const PROFILES = {
  bobcat: { ...CAT, rivals: 'same-sex' },
  cougar: CAT, jaguar: CAT, ocelot: CAT, leopard: CAT,
  tiger: { ...CAT, rivals: 'same-sex' },
  robin: { kind: 'nest', rivals: 'same-sex', seasonal: true, radius: 4 },
  cardinal: { kind: 'nest', rivals: 'same-sex', seasonal: true, radius: 4 },
  clownfish: { kind: 'host', radius: 1.6 },
};
export const territoryProfileFor = def => PROFILES[def.key] || null;
export function activeTerritory(def, a, month) {
  const p = def.behavior?.territory;
  return p && !a.leaving && !a.juvenile && a.age >= def.mature * DAYS_PER_YEAR &&
    (!p.seasonal || def.breed.includes(month)) ? p : null;
}
export function territorialRivals(def, a, b, month) {
  const p = activeTerritory(def, a, month);
  if (!p || a === b || a.sp !== b.sp || !activeTerritory(def, b, month)) return false;
  if (p.kind === 'host') return Number.isInteger(a.territory?.home) && Number.isInteger(b.territory?.home) && a.territory.home !== b.territory.home;
  if (!p.rivals) return false;
  if (a.mom === b.id || b.mom === a.id) return false;
  return p.rivals === 'males' ? isMale(def, a) && isMale(def, b) : isMale(def, a) === isMale(def, b);
}
