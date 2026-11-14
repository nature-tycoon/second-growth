// Monthly updates by email: a quiet card offered once during a player's first play, and the same
// form behind "Get updates by email" in the menu. Posts to the Worker's /subscribe (js/backend.js).
// Nothing shows while BACKEND_URL is empty.

import { backendOn, postBackend } from '../backend.js';
import { tr } from '../i18n.js';
import { track } from '../analytics.js';

const KEY = 'sg-news';          // 'subscribed' or 'dismissed': never offered again
const VISITED = 'sg-visited';   // set on a device's first visit; later visits are not "first play"
const MIN_PLAY_S = 20 * 60;     // active play before the card may show
const get = k => { try { return localStorage.getItem(k); } catch { return 'x'; } };
const put = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };

// A device with saved settings or a saved farm already played before this prompt existed.
const firstPlay = !get(VISITED) && !get('second-growth-settings');
put(VISITED, '1');

const ERRORS = {
  invalid_email: 'That email doesn\'t look right. Please check it.',
  rate_limited: 'Too many tries. Please wait a minute.',
};
export const newsletterAvailable = () => backendOn();
export const subscribed = () => get(KEY) === 'subscribed';

// The form (an email field and a button) inside `box`; `done` runs after a successful signup.
function form(box, source, done) {
  box.innerHTML = `<form class="news-form" novalidate>
    <input type="email" class="ph-mask" maxlength="200" autocomplete="email" placeholder="${tr('you@example.com')}" aria-label="${tr('Email address')}">
    <button class="btn" type="submit">${tr('Subscribe')}</button></form>
    <div class="small news-status" role="status"></div>${ageLine()}`;
  const f = box.querySelector('form'), status = box.querySelector('.news-status'), btn = box.querySelector('button'), input = box.querySelector('input');
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const email = input.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { status.textContent = tr(ERRORS.invalid_email); return; }
    btn.disabled = true; status.textContent = tr('Sending…');
    const r = await postBackend('/subscribe', { email, source });
    btn.disabled = false;
    if (!r.ok) { status.textContent = tr(ERRORS[r.error] || 'That didn\'t go through. Please try again in a moment.'); return; }
    put(KEY, 'subscribed'); track('newsletter_subscribed', { source });
    done();
  });
  return input;
}

const NOTE = 'One email a month about what\'s new in Second Growth. Unsubscribe from any email.';
const AGE = 'For players 13 and older, or ask a parent first.';
const PRIVACY = 'Privacy';
const ageLine = () => `<div class="small news-age">${tr(AGE)} <a href="https://secondgrowth.earth/privacy/" target="_blank" rel="noopener">${tr(PRIVACY)}</a></div>`;

// The card, appended to the notifications stack (not a modal). Returns it, or null.
export function offerCard(ui) {
  const box = document.getElementById('toasts');
  if (!box) return null;
  const c = document.createElement('div');
  c.className = 'toast news-card';
  const dismiss = () => { put(KEY, get(KEY) || 'dismissed'); c.classList.add('fade'); setTimeout(() => c.remove(), 500); };
  c.innerHTML = `<div class="news-body"><b>${tr('Want monthly updates?')}</b>
    <span class="small">${tr(NOTE)}</span><div class="news-slot"></div></div>
    <button type="button" class="notice-close" aria-label="${tr('Dismiss')}" title="${tr('Dismiss')}">×</button>`;
  c.querySelector('.notice-close').addEventListener('click', () => { track('newsletter_dismissed'); dismiss(); });
  form(c.querySelector('.news-slot'), 'game', () => {
    c.querySelector('.news-body').innerHTML = `<b>${tr('Thanks! You\'re on the list.')}</b>`;
    setTimeout(dismiss, 3500);
  });
  box.appendChild(c);
  track('newsletter_shown');
  return c;
}

// Counts active play time and offers the card at a natural pause: the first year is over and at
// least 20 minutes were played, on the first play only, never in a modal, a moment or the guided
// first chapter. Checked once a game month.
export function watchForOffer(ui, game, inTutorial) {
  if (!backendOn() || !firstPlay || get(KEY)) return;
  let played = 0, shown = false;
  const tick = setInterval(() => { if (!document.hidden && game.speed > 0) played += 5; }, 5000);
  game.on('month', () => {
    if (shown || played < MIN_PLAY_S || game.year < 2) return;
    if (ui.modalOpen || ui.photo || ui.watch?.on || ui.moment || inTutorial()) return;
    shown = true; clearInterval(tick);
    offerCard(ui);
  });
}

// "Get updates by email" in the menu, for returning players.
export function openNewsletter(ui) {
  const m = ui.modal('Get updates by email', `<div class="feedback"><p class="info-desc" style="margin-top:0">${tr(NOTE)}</p><div class="news-slot"></div></div>`, { narrow: true });
  const slot = m.querySelector('.news-slot');
  if (subscribed()) { slot.innerHTML = `<p><b>${tr('You\'re on the list. Thanks!')}</b></p>`; return; }
  const input = form(slot, 'game', () => { slot.innerHTML = `<p><b>${tr('Thanks! You\'re on the list.')}</b></p>`; });
  setTimeout(() => input.focus(), 30);
}
