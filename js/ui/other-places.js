// "Other places to restore" (docs/ideas/2026-11-21-first-minutes/other-places.md): the other maps,
// each with its picture, name and one line from its own definition, and a Start (or Continue) button
// that goes through the usual map switch, so the farm on screen is saved first and kept.
//
// When it shows: in the Menu once this farm has had a full game year (on a first visit that's right
// after the time-lapse, which runs ten), and always for a returning player. Once per device, a quiet
// note says so at the first new year the player plays through (not watches), never in the quiet
// first minutes, the opening or the time-lapse, and never next to the Story offer.

import { BIOMES, BIOME_LIST } from '../biome.js';
import { DAYS_PER_YEAR } from '../config.js';
import { Game } from '../game.js';
import { saves } from '../saves.js';
import { track } from '../analytics.js';

const NOTE_SEEN = 'sg-other-places-note'; // (the note, once per device)
const STORY_GAP_MS = 60e3; // the note and the Story offer stay this far apart
const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const shownFrom = new Set(); // other_places_shown once per page load per place

export const otherMaps = map => BIOME_LIST.filter(b => b.id !== map);

// Whether the Menu lists it: not on a visit to someone's shared farm; a returning player always;
// a first visit once the time-lapse has been watched or the farm has had its first full year.
export function otherPlacesReady(ui) {
  const g = ui.game;
  if (g.visiting || otherMaps(g.map).length === 0) return false;
  return !ui.firstVisit || g.day >= DAYS_PER_YEAR || (!!g.flags.lapseOffered && !ui.timelapse?.busy);
}

export function otherPlacesShown(ui, where) {
  if (shownFrom.has(where)) return;
  shownFrom.add(where);
  track('other_places_shown', { map: ui.game.map, where });
}

const savedYear = id => Math.floor((saves.summary(id)?.day || 0) / DAYS_PER_YEAR) + 1;

export function openOtherPlaces(ui, from = 'menu') {
  const g = ui.game, here = BIOMES[g.map];
  track('other_places_opened', { map: g.map, from });
  const cards = otherMaps(g.map).map(b => {
    const saved = Game.hasSave(b.id);
    return `<div class="map-card op-card"><img src="${b.image}?v=keystone-20261017" alt="${b.region} wildlife scene from Second Growth" width="1800" height="1200" loading="lazy" decoding="async">
      <div><span class="rg">${b.region}</span><b>${b.farm}</b><span class="bl">${b.blurb}</span>
      <button class="btn ${saved ? 'secondary' : ''}" data-go="${b.id}">${saved ? `Continue there <span class="small">(year ${savedYear(b.id)})</span> →` : 'Start here →'}</button></div></div>`;
  }).join('');
  const keep = g.visiting ? '' : `<p class="op-keep">Your farm at <b>${here.farm}</b> stays saved, year ${g.year} and all. Come back to it any time from this list on another farm, or from the start menu.</p>`;
  const m = ui.modal('Other places to restore', `${keep}<div class="op-list">${cards}</div>`, { narrow: true });
  m.classList.add('other-places');
  m.querySelectorAll('[data-go]').forEach(btn => btn.addEventListener('click', () => {
    const map = btn.dataset.go;
    m.querySelectorAll('[data-go]').forEach(o => { o.disabled = true; });
    track('other_place_started', { map, from: g.map, resume: Game.hasSave(map) });
    ui.closeModal(true);
    // (switchMap saves this farm first and stays here if that save fails)
    if (Game.hasSave(map)) void ui.switchMap({ map, resume: true });
    else void ui.switchMap({ map, mode: 'free', difficulty: g.difficulty || 'standard', sandbox: !!g.flags.sandbox });
  }));
  return m;
}

// The once-per-device note. Checked at each month's turn: the first year's turn the player plays
// through makes it due, and it waits for a calm month after that.
export function watchOtherPlacesNote(ui) {
  const g = ui.game;
  let seen = true;
  try { seen = !!localStorage.getItem(NOTE_SEEN); } catch { /* storage unavailable: no note */ }
  if (seen) return;
  let due = false;
  g.on('month', () => {
    if (seen || g.visiting || g.lapse || ui.timelapse?.busy) return;
    if (!due) { due = g.month === 0 && otherPlacesReady(ui); if (!due) return; } // (a new year's turn, played through)
    const now = performance.now();
    if (ui.quietNow() || ui.opening?.running || ui.modalOpen || ui.moment || ui.photo || ui.watch?.on || ui.goalSpotOn?.()) return;
    if (ui.storyPending || now - (ui.storyOfferedAt || -1e9) < STORY_GAP_MS) return; // (never next to the Story offer)
    seen = true;
    try { localStorage.setItem(NOTE_SEEN, '1'); } catch { /* storage unavailable */ }
    const n = otherMaps(g.map).length;
    ui.otherPlacesNoteAt = now;
    otherPlacesShown(ui, 'note');
    ui.toast({ text: `${WORDS[n] || n} other places need restoring too: Menu → Other places.`, kind: 'tip', date: g.dateString(), life: 12000,
      action: { label: 'See them', run: () => openOtherPlaces(ui, 'note') } });
  });
}
