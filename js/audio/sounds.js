// Recorded wildlife sounds, trimmed and re-encoded to 80–96 kbps mono AAC. Sources and licences
// were checked on each original page.
import { FIELD_RECORDINGS } from './recordings.js';
const NPS = 'https://www.nps.gov/yell/learn/photosmultimedia/sounds-elk.htm';
const DEER = 'https://commons.wikimedia.org/wiki/File:Red_deer_rut.webm';
export const SOUND_CREDITS = [
  { what: 'Bull elk bugles', by: 'National Park Service (Neal Herbert), Yellowstone sound library', license: 'Public domain', source: NPS },
  { what: 'Antler clashes', by: 'Dan Davison, "Red deer rut" (Wikimedia Commons)', license: 'CC BY 2.0', licenseUrl: 'https://creativecommons.org/licenses/by/2.0/', source: DEER },
  ...Object.entries(FIELD_RECORDINGS).map(([id, d]) => ({ what: id.replaceAll('-', ' '), by: d.by, license: d.license, licenseUrl: d.licenseUrl, source: d.source, modified: d.modified })),
];
// kind -> clips. A satellite bull's answer uses the shorter bugles.
export const RUT_SOUNDS = {
  bugle: ['elk-bugle-1', 'elk-bugle-2', 'elk-bugle-3'],
  answer: ['elk-bugle-2', 'elk-bugle-3'],
  clash: ['antler-clash-1', 'antler-clash-2', 'antler-clash-3', 'antler-clash-4'],
  rattle: ['antler-rattle-1', 'antler-clash-3', 'antler-clash-4'],
};
// Thunder (audio/thunder.js): a crack or a clap for a bolt nearby, a rumble or a roll for one far off.
export const THUNDER = { near: ['field-thunder-crack-1', 'field-thunder-claps-1'], far: ['field-thunder-distant-1', 'field-thunder-claps-2'] };
export const THUNDER_RECORDINGS = ['thunder-crack', 'thunder-claps', 'thunder-distant'];
// (resolved from this module, so tools pages under tools/ find them too)
export const soundFile = name => new URL(`../../assets/sounds/${name}.m4a`, import.meta.url).href;
// The recordings are red deer; heavier racks play a little lower, lighter ones a little higher.
export const RACK_PITCH = { elk: 0.84, sambar: 0.94, mule: 1.06, whitetail: 1.12 };
