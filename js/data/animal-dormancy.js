// Map-specific winter strategies; no generic bear/bat/reptile rule.
// March = 0. Numerical months/rates/arousal intervals are game-scale approximations.
// Sources and limitations: decision 0009.
const WINTER = [9, 10, 11], LONG_WINTER = [8, 9, 10, 11];
const PROFILES = {
  'pnw:bear': { kind: 'denning', shelter: 'den', solitary: true, months: WINTER, rate: 0.05, interval: 15 },
  'pnw:gartersnake': { kind: 'brumation', shelter: 'ground', months: LONG_WINTER, rate: 0.05, interval: 7 },
  'pnw:turtle': { kind: 'brumation', shelter: 'pond', months: LONG_WINTER, rate: 0.05, interval: 7 },
  'atlanta:chipmunk': { kind: 'torpor', shelter: 'ground', solitary: true, months: LONG_WINTER, rate: 0.1, interval: 4 },
  'atlanta:bat': { kind: 'hibernation', shelter: 'roost', months: WINTER, rate: 0.05, interval: 8 },
  'atlanta:boxturtle': { kind: 'brumation', shelter: 'ground', months: LONG_WINTER, rate: 0.05, interval: 7 },
};
export const dormancyProfileFor = def => PROFILES[`${def.mapId}:${def.key}`] || null;
export const dormancySeason = (game, def) => !!def.behavior?.dormancy?.months.includes(game.month);
export function dormancyStatus(a) {
  if (a.state === 'dormant') return ({ denning: 'Winter denning', torpor: 'Winter torpor',
    hibernation: 'Hibernating in a roost', brumation: 'Winter brumation' })[a.dormancy?.kind] || 'Resting in winter shelter';
  return a.dormancy && (a.state === 'walk' || a.state === 'fly') ? 'Seeking winter shelter' : null;
}
