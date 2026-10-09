// Deterministic miniature landscapes for the watershed lab and numerical checks.
import { Watershed } from '../js/sim/watershed.js';

export function creekValley() {
  const width = 48, height = 36, n = width * height;
  const bed = new Float64Array(n), surface = new Float64Array(n), infiltration = new Float64Array(n).fill(.065);
  const channel = y => Math.round(27 + Math.sin(y / 6) * 2);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, d = Math.abs(x - channel(y));
    bed[i] = .032 * (height - 1 - y) + .032 * Math.pow(Math.max(0, d - 1), 1.35);
    if (d <= 1) { bed[i] -= .32; surface[i] = .18; infiltration[i] = .002; }
    // A disconnected bowl: its surrounding ridge forces retained rainfall to
    // reach the lip before it can escape. It starts empty.
    const r = Math.hypot((x - 13) / 5, (y - 20) / 5);
    if (r < 1.25) {
      bed[i] = .48 + .9 * Math.min(1.4, r * r);
      infiltration[i] = .006;
    }
    if (x < 21 && y < 14) infiltration[i] = .012; // compacted pasture
  }
  const w = new Watershed(width, height, { bed, surface, infiltration, soil: .12, baseflow: .008, conductance: 8 });
  for (let x = channel(0) - 1; x <= channel(0) + 1; x++) w.addSource(x, .065);
  for (let x = channel(height - 1) - 1; x <= channel(height - 1) + 1; x++) w.addOutlet((height - 1) * width + x);
  const damRow = 23, damEdges = [];
  // Barriers span the low valley including the banks, allowing overtopping
  // once the upstream sheet rises above their crest.
  for (let x = channel(damRow) - 3; x <= channel(damRow) + 3; x++) {
    const a = damRow * width + x, b = a + width;
    damEdges.push({ a, b, crest: Math.max(w.bed[a], w.bed[b], .78) });
  }
  return { id: 'valley', title: 'Creek valley', w, damEdges,
    places: [{ name: 'Rain-fed basin', x: 13, y: 20 }, { name: 'Dam crossing', x: channel(damRow), y: damRow }, { name: 'Compacted pasture', x: 12, y: 8 }],
    description: 'Follow the creek downhill, fill the isolated basin with rain, and compare runoff from compacted and permeable ground.' };
}

export function amazonFloodplain() {
  const width = 48, height = 36, n = width * height;
  const bed = new Float64Array(n), surface = new Float64Array(n), infiltration = new Float64Array(n).fill(.018);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    bed[i] = .48 + .005 * (height - 1 - y) + .002 * Math.abs(x - 23);
    if (x >= 21 && x <= 25) { bed[i] = -.26 + .009 * (height - 1 - y); surface[i] = .35; infiltration[i] = .001; }
    // An existing horseshoe-shaped abandoned bend, with an elevated tie channel.
    const r = Math.hypot((x - 33) / 7, (y - 19) / 8);
    if (r > .68 && r < 1.12 && x > 28) { bed[i] = -.04; surface[i] = .22; infiltration[i] = .0015; }
    if (x >= 25 && x <= 31 && y >= 12 && y <= 14) {
      bed[i] = x >= 26 && x <= 28 ? .31 : .12; infiltration[i] = .002;
    }
  }
  const w = new Watershed(width, height, { bed, surface, infiltration, soil: .24, baseflow: .006, conductance: 8 });
  for (let x = 21; x <= 25; x++) { w.addSource(x, .14); w.addOutlet((height - 1) * width + x); }
  return { id: 'amazon', title: 'Amazon floodplain', w, damEdges: [],
    places: [{ name: 'Existing oxbow', x: 39, y: 19 }, { name: 'Seasonal connection', x: 27, y: 13 }, { name: 'Main river', x: 23, y: 22 }],
    description: 'An existing oxbow is separated from the river by a raised entrance. High river water can cross it; dry weather leaves the lake isolated again.' };
}

export function createWatershedFixture(id = 'valley') {
  if (id === 'valley') return creekValley();
  if (id === 'amazon') return amazonFloodplain();
  throw new RangeError('Unknown watershed landscape');
}
