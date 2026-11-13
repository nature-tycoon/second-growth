// The website's field guide, read straight from the game's map catalogs: one entry per species
// (merged where a species lives on several maps), with what the game knows about it.
// Used by tools/build-field-guide.mjs (the pages) and tools/capture-field-guide.mjs (the portraits).
import { BIOME_LIST, mapCatalog } from '../js/biome.js';
import { FIELD_RECORDINGS, MAP_RECORDINGS } from '../js/audio/recordings.js';
import { pathToFileURL } from 'node:url';

export const slugify = text => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Game months run from March (0) to February (11).
const MONTHS = ['March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February'];
// "April to June", or "March, May and July" when the months aren't in a row.
export function monthSpan(months) {
  if (!months?.length) return null;
  const sorted = [...new Set(months)].sort((a, b) => a - b);
  if (sorted.length === 12) return 'all year';
  const inRow = sorted.every((m, i) => i === 0 || m === sorted[i - 1] + 1);
  if (inRow) return sorted.length === 1 ? MONTHS[sorted[0]] : `${MONTHS[sorted[0]]} to ${MONTHS[sorted.at(-1)]}`;
  const names = sorted.map(m => MONTHS[m]);
  return names.slice(0, -1).join(', ') + ' and ' + names.at(-1);
}

const LAYERS = ['Ground plant', 'Shrub', 'Tree'];
// Moisture and light ranges (0..1) in words, from the middle of the plant's range.
const wetness = ([lo, hi]) => { const m = (lo + hi) / 2; return m < 0.3 ? 'dry ground' : m < 0.55 ? 'moist ground' : m < 0.8 ? 'damp ground' : 'wet ground or water'; };
const sunlight = ([lo]) => lo >= 0.5 ? 'full sun' : lo >= 0.25 ? 'sun or part shade' : 'shade or sun';

// A species' own recording: the birds the map names, or a recording named for the species.
function recordingFor(mapId, key, name) {
  const id = MAP_RECORDINGS[mapId]?.birds?.[key] || (FIELD_RECORDINGS[slugify(name)] ? slugify(name) : null);
  const rec = id && FIELD_RECORDINGS[id];
  return rec ? { id, clip: rec.clips[0], by: rec.by, license: rec.license, licenseUrl: rec.licenseUrl, source: rec.source } : null;
}

export function fieldGuide() {
  const bySlug = new Map();
  for (const map of BIOME_LIST) {
    const catalog = mapCatalog(map.id);
    const place = { id: map.id, name: map.name, farm: map.farm, region: map.region };
    const add = (kind, def, facts) => {
      if (!def?.name) return;
      const slug = slugify(def.name);
      let entry = bySlug.get(slug);
      if (!entry) bySlug.set(slug, entry = { slug, kind, key: def.key, firstMap: map.id, name: def.name, sci: def.sci || null, desc: (def.desc || '').replace(/^INVASIVE\.\s*/, ''), maps: [], ...facts });
      if (!entry.maps.some(m => m.id === map.id)) entry.maps.push({ ...place, hint: def.hint || null });
      entry.recording ||= kind === 'animal' ? recordingFor(map.id, def.key, def.name) : null;
    };
    for (const a of catalog.animals) if (a) add('animal', a, {
      group: a.group || 'Wildlife', kg: a.kg ?? null, life: a.life ?? null, young: monthSpan(a.breed), // (breed: the months young are born)
      move: a.move, nocturnal: !!a.nocturnal,
    });
    for (const p of catalog.plants) if (p) add('plant', p, {
      group: LAYERS[p.layer] || 'Plant', status: p.invasive ? 'invasive' : p.native === false ? 'introduced' : 'native',
      heightM: p.heightM ?? null, grows: `${wetness(p.moist)}, ${sunlight(p.light)}`,
      nitrogen: !!p.nfix, aquatic: !!p.aquatic,
    });
  }
  return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const guide = fieldGuide();
  const animals = guide.filter(e => e.kind === 'animal'), plants = guide.filter(e => e.kind === 'plant');
  console.log(`${guide.length} species: ${animals.length} animals (${animals.filter(e => e.recording).length} with a recording), ${plants.length} plants (${plants.filter(e => e.status === 'invasive').length} invasive)`);
  const dupes = guide.filter(e => e.maps.length > 1);
  console.log(`${dupes.length} on more than one map, e.g. ${dupes.slice(0, 5).map(e => e.name + ' (' + e.maps.map(m => m.id).join(', ') + ')').join('; ')}`);
}
