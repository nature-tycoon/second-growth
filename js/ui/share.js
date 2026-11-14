// Sharing a farm (decision 0047): "Share this farm" in the menu posts the farm to the Worker and
// shows a link (secondgrowth.earth/play/?farm=<id>) that opens a copy; the same farm can be saved
// as a file and opened from one, with no server. No accounts, nothing personal in the file.
//
// Opening a shared farm or a file always goes through a page load (main.js, sharedFarmAtBoot), so
// a farm from another map gets that map's plants and animals. It opens as a visit: nothing is
// saved (Game.visiting) until the player chooses "Make it my farm", which asks first.

import { BACKEND_URL, backendOn } from '../backend.js';
import { BIOMES } from '../biome.js';
import { Game } from '../game.js';
import { saves, saveChecksum, bytesFromBase64 } from '../saves.js';
import { encodeFarm, decodeFarm, FARM_EXT, MAX_SHARE } from '../share-file.js';
import { tr } from '../i18n.js';
import { DAYS_PER_YEAR } from '../config.js';
import { track } from '../analytics.js';

const SHARED_KEY = 'second-growth-shared';     // [{ id, deleteKey, map, year, at }]: this browser's shares
const OPEN_KEY = 'second-growth-open-farm';     // sessionStorage: a farm file waiting for the reload
const ID_RE = /^[23456789abcdefghjkmnpqrstuvwxyz]{10}$/;
const mapName = map => BIOMES[map]?.name || map;
const yearOf = g => g.year;

function sharedList() { try { return JSON.parse(localStorage.getItem(SHARED_KEY)) || []; } catch { return []; } }
function putShared(list) { try { localStorage.setItem(SHARED_KEY, JSON.stringify(list.slice(-50))); } catch { /* storage unavailable */ } }

function base64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function downloadBytes(bytes, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
const fileName = (map, year) => `second-growth-${map}-year-${year}${FARM_EXT}`;

// the farm as it stands now, encoded (never half a day)
async function currentFarm(g) {
  g.finishDay();
  return encodeFarm(g.saveData());
}

const SHARE_ERRORS = {
  rate_limited: 'Too many shares just now. Please wait a minute.',
  sharing_paused: 'Sharing is resting for today. Save the farm as a file instead, or try tomorrow.',
  too_large: 'This farm is too big to share by link. Save it as a file instead.',
};

async function postFarm(bytes, map, v) {
  try {
    const r = await fetch(`${BACKEND_URL}/farms?map=${encodeURIComponent(map)}&v=${v}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes });
    const j = await r.json().catch(() => ({}));
    return r.ok && j.ok ? j : { ok: false, error: j.error || 'server_error' };
  } catch { return { ok: false, error: 'network' }; }
}

// --- the dialog ------------------------------------------------------------------------------
export function openShare(ui) {
  const g = ui.game;
  const linkPart = backendOn() ? `<p class="info-desc" style="margin-top:0">${tr('Get a link anyone can open: they see a copy of this farm, and yours stays yours. Links last a year. Handy for moving your farm to another device, too.')}</p>
      <div class="menu-list"><button class="btn" data-a="link">${tr('Get a link')}</button></div>
      <div class="share-link" hidden><input type="text" readonly class="share-url" aria-label="${tr('Link to this farm')}">
        <div class="share-buttons"><button class="btn" data-a="copy">${tr('Copy link')}</button>${navigator.share ? `<button class="btn secondary" data-a="send">${tr('Send…')}</button>` : ''}</div></div>
      <div class="small share-status" role="status"></div>` : '';
  const m = ui.modal('Share this farm', `<div class="feedback">${linkPart}
      <div class="section-title"${backendOn() ? '' : ' style="margin-top:0"'}>${tr('As a file')}</div>
      <p class="info-desc">${tr('Save this farm as a file to keep as a backup or send to someone. Open a farm file here to visit it.')}</p>
      <div class="menu-list"><button class="btn secondary" data-a="save-file">${tr('Save as a file')}</button>
        <button class="btn secondary" data-a="open-file">${tr('Open a farm file')}</button></div>
      <input type="file" accept="${FARM_EXT}" hidden>
      <div class="small file-status" role="status"></div>
      <div class="shared-farms"></div></div>`, { narrow: true });
  const status = m.querySelector('.share-status'), fileStatus = m.querySelector('.file-status');

  m.querySelector('[data-a=link]')?.addEventListener('click', async e => {
    const btn = e.currentTarget; btn.disabled = true; status.textContent = tr('Sharing…');
    let bytes;
    try { bytes = await currentFarm(g); } catch { status.textContent = tr('This farm could not be packed up. Please try again.'); btn.disabled = false; return; }
    if (bytes.length > MAX_SHARE) { status.textContent = tr(SHARE_ERRORS.too_large); btn.disabled = false; return; }
    const r = await postFarm(bytes, g.map, 2);
    btn.disabled = false;
    if (!r.ok) { status.textContent = tr(SHARE_ERRORS[r.error] || 'That didn\'t go through. Please try again in a moment.'); return; }
    track('farm_shared', { map: g.map, game_year: yearOf(g), kb: Math.round(bytes.length / 1024) });
    putShared([...sharedList(), { id: r.id, deleteKey: r.deleteKey, map: g.map, year: yearOf(g), at: Date.now() }]);
    btn.closest('.menu-list').style.display = 'none';
    const box = m.querySelector('.share-link'), input = box.querySelector('input');
    box.hidden = false; input.value = r.url; input.select();
    status.textContent = tr('Anyone with this link can open a copy until') + ' ' + new Date(r.expires).toLocaleDateString() + '.';
    box.querySelector('[data-a=copy]').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(r.url); status.textContent = tr('Link copied.'); } catch { input.select(); }
    });
    box.querySelector('[data-a=send]')?.addEventListener('click', () => {
      navigator.share({ title: 'Second Growth', text: tr('My farm in Second Growth'), url: r.url }).catch(() => {});
    });
    listShared();
  });

  m.querySelector('[data-a=save-file]').addEventListener('click', async e => {
    e.currentTarget.disabled = true;
    try { downloadBytes(await currentFarm(g), fileName(g.map, yearOf(g))); track('farm_exported', { map: g.map }); fileStatus.textContent = ''; }
    catch { fileStatus.textContent = tr('This farm could not be packed up. Please try again.'); }
    e.currentTarget.disabled = false;
  });
  const picker = m.querySelector('input[type=file]');
  m.querySelector('[data-a=open-file]').addEventListener('click', () => picker.click());
  picker.addEventListener('change', async () => {
    const file = picker.files?.[0];
    if (!file) return;
    fileStatus.textContent = tr('Opening…');
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      if (bytes.length > MAX_SHARE * 2) throw new Error('too large');
      const data = await decodeFarm(bytes);
      if (!BIOMES[data.map || 'pnw']) throw new Error('unknown map');
      sessionStorage.setItem(OPEN_KEY, base64(bytes));
    } catch { fileStatus.textContent = tr('That file isn\'t a Second Growth farm, or it is damaged.'); return; }
    // (this farm is saved first, as a map switch would)
    if (g.saveReady && !g.visiting && !await g.save()) { fileStatus.textContent = tr('Your farm could not be saved first, so nothing was opened.'); return; }
    location.reload();
  });

  // this browser's shares, newest first, each with Stop sharing
  const listShared = () => {
    const list = sharedList(), box = m.querySelector('.shared-farms');
    if (!list.length || !backendOn()) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="section-title">${tr('Farms you\'ve shared')}</div>` + list.slice().reverse().map(s =>
      `<div class="shared-row"><span>${mapName(s.map)} · ${tr('year')} ${s.year} · ${new Date(s.at).toLocaleDateString()}</span>
        <button class="btn secondary" data-stop="${s.id}">${tr('Stop sharing')}</button></div>`).join('');
    box.querySelectorAll('[data-stop]').forEach(b => b.addEventListener('click', async () => {
      const s = sharedList().find(x => x.id === b.dataset.stop);
      b.disabled = true;
      let ok = false;
      try {
        const r = await fetch(`${BACKEND_URL}/farms/${s.id}`, { method: 'DELETE', headers: { 'X-Delete-Key': s.deleteKey } });
        ok = r.ok || r.status === 404; // (already gone: expired)
      } catch { /* offline */ }
      if (!ok) { b.disabled = false; status && (status.textContent = tr('That didn\'t go through. Please try again in a moment.')); return; }
      putShared(sharedList().filter(x => x.id !== s.id));
      track('farm_unshared', { map: s.map });
      listShared();
    }));
  };
  listShared();
}

// --- opening, at page load ----------------------------------------------------------------------
// A ?farm=<id> link, or a farm file chosen before the reload. Resolves to null (nothing to open),
// { data, id } or { error }. The address is tidied so a reload opens the player's own farm.
export async function sharedFarmAtBoot() {
  let stashed = null;
  try { stashed = sessionStorage.getItem(OPEN_KEY); sessionStorage.removeItem(OPEN_KEY); } catch { /* ignore */ }
  const id = new URLSearchParams(location.search).get('farm');
  if (id != null) { const url = new URL(location.href); url.searchParams.delete('farm'); history.replaceState(history.state, '', url); }
  try {
    if (stashed) return { data: await decodeFarm(bytesFromBase64(stashed)), id: null };
    if (id == null) return null;
    if (!ID_RE.test(id)) return { error: 'not_found' };
    if (!backendOn()) return { error: 'offline' };
    const r = await fetch(`${BACKEND_URL}/farms/${id}`);
    if (r.status === 404) return { error: 'not_found' };
    if (!r.ok) return { error: 'network' };
    const bytes = new Uint8Array(await r.arrayBuffer());
    return { data: await decodeFarm(bytes), id };
  } catch { return { error: id ? 'network' : 'damaged' }; }
}

const OPEN_ERRORS = {
  not_found: 'That shared farm isn\'t there any more. Links last a year, and a sharer can stop sharing.',
  offline: 'Shared farms can\'t be opened from this copy of the game. Try secondgrowth.earth/play.',
  network: 'That shared farm could not be loaded. Check your connection and open the link again.',
  damaged: 'That farm file could not be opened. It may be damaged.',
  invalid: 'That shared farm could not be opened. It may be from a newer version of the game, or damaged.',
};
export const openError = error => OPEN_ERRORS[error] || OPEN_ERRORS.invalid;

// Load a shared farm into the game as a visit. Returns false if it doesn't open.
export function startVisit(ui, shared) {
  const g = ui.game, data = shared.data, map = data.map || 'pnw';
  if (map !== g.map || !g.restoreSnapshot({ data, checksum: saveChecksum(data) }, map)) return false;
  g.visiting = true; g.saveReady = false;
  ui.refreshSaveStatus();
  track('farm_opened', { map, game_year: g.year, from: shared.id ? 'link' : 'file' });
  showVisitCard(ui, shared);
  return true;
}

function showVisitCard(ui, shared) {
  const g = ui.game, box = document.getElementById('toasts');
  if (!box) return;
  const c = document.createElement('div');
  c.className = 'toast visit-card';
  c.innerHTML = `<div class="news-body"><b>${tr(`You're visiting a shared ${mapName(g.map)} farm, year ${g.year}.`)}</b>
    <span class="small">${tr('Nothing you change here is saved.')}</span>
    <div class="visit-buttons"><button class="btn" data-a="keep">${tr(`Make it my ${mapName(g.map)} farm`)}</button>
      <button class="btn secondary" data-a="leave">${tr('Back to my farm')}</button>
      ${shared.id && backendOn() ? `<button class="btn secondary" data-a="report">${tr('Report')}</button>` : ''}</div></div>`;
  box.appendChild(c);
  c.querySelector('[data-a=leave]').addEventListener('click', () => location.reload());
  c.querySelector('[data-a=keep]').addEventListener('click', () => confirmKeep(ui, c));
  c.querySelector('[data-a=report]')?.addEventListener('click', () => openReport(ui, shared.id));
}

async function keep(ui, card) {
  const g = ui.game;
  g.visiting = false; g.saveReady = true;
  if (!await g.save()) { g.visiting = true; g.saveReady = false; g.notify('This farm could not be saved in this browser. Nothing was replaced.', 'warn'); return; }
  track('farm_adopted', { map: g.map, game_year: g.year });
  ui.refreshSaveStatus();
  card.remove();
  g.notify(`This is now your ${mapName(g.map)} farm. It saves on this device as you play.`, 'good');
}

function confirmKeep(ui, card) {
  const g = ui.game, map = g.map;
  if (!Game.hasSave(map)) { void keep(ui, card); return; }
  const m = ui.modal(`Replace your ${mapName(map)} farm?`, `<p class="info-desc" style="margin-top:0">${tr(`This replaces your own ${mapName(map)} farm on this device. Save yours as a file first if you might want it back.`)}</p>
    <div class="small file-status" role="status"></div>`, { narrow: true,
    foot: `<button class="btn secondary" data-a="backup">${tr('Save my farm as a file')}</button><button class="btn" data-a="replace">${tr('Replace it')}</button>` });
  const status = m.querySelector('.file-status');
  m.querySelector('[data-a=backup]').addEventListener('click', async e => {
    e.currentTarget.disabled = true;
    try {
      const own = (await saves.candidates(map))[0];
      downloadBytes(await encodeFarm(own.data), fileName(map, Math.floor((own.data.day || 0) / DAYS_PER_YEAR) + 1));
      status.textContent = tr('Saved. Now you can replace it.');
    } catch { status.textContent = tr('Your farm could not be saved as a file.'); e.currentTarget.disabled = false; }
  });
  m.querySelector('[data-a=replace]').addEventListener('click', () => { ui.closeModal(); void keep(ui, card); });
}

function openReport(ui, id) {
  const m = ui.modal('Report this farm', `<div class="feedback"><p class="info-desc" style="margin-top:0">${tr('Is something in this farm rude or hurtful? Tell us and we\'ll take a look.')}</p>
    <input type="text" maxlength="200" class="report-reason" placeholder="${tr('What\'s wrong (optional)')}" aria-label="${tr('What\'s wrong')}">
    <div class="small share-status" role="status"></div></div>`, { narrow: true,
    foot: `<button class="btn secondary" data-a="cancel">${tr('Cancel')}</button><button class="btn" data-a="send">${tr('Report')}</button>` });
  const status = m.querySelector('.share-status');
  m.querySelector('[data-a=cancel]').addEventListener('click', () => ui.closeModal());
  m.querySelector('[data-a=send]').addEventListener('click', async e => {
    e.currentTarget.disabled = true; status.textContent = tr('Sending…');
    let ok = false;
    try {
      const r = await fetch(`${BACKEND_URL}/farms/${id}/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: m.querySelector('input').value }) });
      ok = r.ok;
    } catch { /* offline */ }
    if (!ok) { status.textContent = tr('That didn\'t go through. Please try again in a moment.'); e.currentTarget.disabled = false; return; }
    track('farm_reported', { map: ui.game.map });
    ui.closeModal(); ui.game.notify('Thanks. We\'ll take a look.', 'good');
  });
}
