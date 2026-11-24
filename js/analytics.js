// Anonymous usage analytics and player feedback, sent to PostHog.
// Does nothing until POSTHOG_KEY is set, when the player has opted out in Settings,
// on localhost, or when the browser asks sites not to track.

import { settings } from './settings.js';
import { RELEASE } from './release.js';
import { backendOn, postBackend, playerId } from './backend.js';

// Project API key from PostHog (Project settings → Project API key). It is meant to be public.
const POSTHOG_KEY = 'phc_wWDczF7Egr2VV5Nj6JN2duzKW4ND298DaKjgaQ3B78sf';
// PostHog's managed reverse proxy on our own domain (Organization settings → Proxy), so ad blockers that
// block posthog.com don't drop players' events; it serves the SDK too. ui_host keeps PostHog's own links right.
const POSTHOG_HOST = 'https://t.secondgrowth.earth';
export const GAME_VERSION = '0.5';

// PostHog, looked up each time rather than kept: the loader puts a stand-in on window.posthog that
// queues calls, and when the library arrives it replaces that stand-in with the real thing. A
// kept reference would go on feeding the stand-in's queue, which nothing reads any more.
let started = false;
const P = () => (started ? window.posthog : null);
const localOnly = () => ['localhost', '127.0.0.1', ''].includes(location.hostname) && !new URLSearchParams(location.search).has('ph');
const browserOptOut = () => navigator.globalPrivacyControl === true ||
  [navigator.doNotTrack, navigator.msDoNotTrack, window.doNotTrack].some(value => value === '1' || value === 'yes');
const trackingAllowed = () => settings.analytics && !browserOptOut();

// ---- Tester tag. Visiting ?tester=dev (the developer) or ?tester=tester (a playtester) once marks
// this browser: the role is kept in localStorage and sent as the `tester` property on every event,
// so PostHog reports can exclude it (docs/posthog-review-2026-11.md). ?tester=off clears it. A role
// label only, never a name. The link is read even when tracking is off, so the flag is stored
// anyway; it is only sent when analytics runs.
const TESTER_KEY = 'second-growth-tester', TESTER_ROLES = ['dev', 'tester'];
export function testerRole() {
  try {
    const url = new URL(location.href), asked = url.searchParams.get('tester');
    if (asked != null) {
      if (asked === 'off') localStorage.removeItem(TESTER_KEY);
      else if (TESTER_ROLES.includes(asked)) localStorage.setItem(TESTER_KEY, asked);
      url.searchParams.delete('tester'); history.replaceState(history.state, '', url); // a reload or share link doesn't repeat it
    }
    const role = localStorage.getItem(TESTER_KEY);
    return TESTER_ROLES.includes(role) ? role : null;
  } catch (e) { return null; /* storage unavailable */ }
}

function loadPostHog() {
  // PostHog's standard loader: queues calls until the library arrives from their CDN.
  /* eslint-disable */
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group getActiveMatchingSurveys getSurveys onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
  /* eslint-enable */
  window.posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    ui_host: 'https://us.posthog.com',
    person_profiles: 'always',       // anonymous profiles, so returning players can be counted
    persistence: 'localStorage',     // no cookies
    respect_dnt: true,
    autocapture: false,              // we send named game events instead of every click
    capture_pageview: true,
    capture_pageleave: true,
    // No session replays: nobody watched them, and filming the 3D view kept its drawing buffer
    // and read it back from the graphics chip every second, which cost players frame rate.
    disable_session_recording: true,
    // Also gate automatic/queued SDK events if the player opts out while it loads.
    before_send: event => trackingAllowed() ? event : null,
  });
  window.posthog.register({ game_version: GAME_VERSION, release: RELEASE });
  const role = testerRole(); // a tester's own browser: every event carries it, so reports can leave it out
  if (role) window.posthog.register({ tester: role });
  return window.posthog;
}

export function initAnalytics() {
  // local copies stay quiet so testing doesn't pollute the numbers (add ?ph to the URL to test tracking)
  if (!POSTHOG_KEY || localOnly() || !trackingAllowed()) return false;
  if (started) return true;
  loadPostHog(); started = true;
  return true;
}

export const analyticsReady = () => !!P();

// For the moment the player leaves: sent with sendBeacon so it survives the tab closing.
export function trackExit(event, props = {}) {
  const ph = P();
  if (!ph || !trackingAllowed()) return;
  try { ph.capture(event, props, { transport: 'sendBeacon' }); } catch (e) { /* ignore */ }
}

// ---- Loading state, shared with main.js (which sets it) and the session code (which reads it): while
// the game is still loading, leaving is `loading_left`, not `game_left`.
export const loadState = { stage: 'Starting', loaded: false, firstVisit: false };
let loadingLeftSent = false;
// Sent once, from main.js's own listeners (visibilitychange hidden is the one that reliably runs when a
// tab is closed; pagehide often doesn't).
export function reportLoadingLeft() {
  if (loadState.loaded || loadingLeftSent) return;
  loadingLeftSent = true;
  trackExit('loading_left', { stage: loadState.stage, seconds: Math.round(performance.now() / 1000) });
}

// Events for the first-minutes work (docs/ideas/2026-11-21-first-minutes/plan.md). Sent today:
//   first_animal_seen { seconds, species, beyond_fence? }   first time a larger animal is on screen, first visit only
//   farm_opened { how: 'fence'|'culvert', seconds, prompted }   boundary fence or culvert out (ui/opening.js)
//   (a shared farm opened as a visit is shared_farm_opened { map, game_year, from: 'link'|'file' }, ui/share.js: renamed from farm_opened, g1)
//   first_tool { seconds_since_load, ... }   (session-analytics.js)
//   opening_step { step: 'pull'|'trees'|'meadow', how: 'button'|'hand'|'skipped', seconds }   the opening's guided planting (ui/opening.js, timelapse-2)
//   timelapse_started { map, from: 'auto'|'menu', first_visit, year }, timelapse_watched { map, seconds, years, ended, from, fps, days_per_s }
//   (ui/timelapse.js: plays on its own after a first visit's guided planting; timelapse_offered and from: 'offer' were retired then)
//   watch_mode { map, from: 'follow_deer'|'timelapse' }   "Follow a deer" in the opening (ui/opening.js), or the time-lapse
//   intro_started { first, muted, size, played, downsized }, intro_skipped { second, first, how, taps }, intro_finished { first, taps }   the intro film (ui/intro.js; first: a first visit's, else a replay)
//   intro_failed { first, reason, second, waited_s, buffered_s, size, downsized, error }   the film didn't play or stalled (ui/intro.js trackFail)
//   intro_not_offered { reason: 'map'|'seen'|'save_data'|'no_storage'|'off', map }   a first visit (no save) that never gets the film (main.js, introBlocked)
//   intro_replay { from: 'start'|'menu', map }   "Watch intro" from the start menu or the menu
//   goal_tracker_opened { map, next }   free play's goal tracker opened (ui.js renderGoalTracker; on PNW the chain toward the cougar)
//   species_lost now skips migrants away for their season and carries cause: 'natural'|'habitat'|'prey' (session 10)
//   goal_spotlight { map, next }   after the time-lapse the next goal stands out for 10 s (ui.js spotlightGoal)
//   other_places_shown { map, where: 'menu'|'note' }, other_places_opened { map, from: 'menu'|'note' },
//   other_place_started { map, from, resume }   "Other places to restore" (ui/other-places.js; map is the place chosen, from the farm left)
// (Names reserved for later sessions go here, so they stay consistent.)
// trackOnce sends an event the first time per page load only.
const sentOnce = new Set();
export function trackOnce(event, props = {}) {
  if (sentOnce.has(event)) return;
  sentOnce.add(event);
  track(event, props);
}

// Crashes and script errors, so we can see where the game breaks for people (a few per session).
let errorsSent = 0;
const errorsSeen = new Set();
function reportError(kind, message, where) {
  // A harmless browser notice (layout settled over two frames), not a game error.
  if (/^ResizeObserver loop/.test(String(message))) return;
  const key = `${message}|${where}`;
  if (errorsSent >= 5 || errorsSeen.has(key)) return;
  errorsSeen.add(key); errorsSent++;
  track('js_error', { kind, message: String(message).slice(0, 300), where: String(where || '').slice(0, 200) });
}
window.addEventListener('error', e => reportError('error', e.message, `${(e.filename || '').split('/').pop()}:${e.lineno}:${e.colno}`));
window.addEventListener('unhandledrejection', e => reportError('promise', e.reason?.message || e.reason, e.reason?.stack?.split('\n')[1]?.trim()));

export function track(event, props = {}) {
  const ph = P();
  if (!ph || !trackingAllowed()) return;
  try { ph.capture(event, props); } catch (e) { /* never let analytics break the game */ }
}

// Player feedback goes straight to PostHog's capture API instead of through the tracking
// library: it's something the player chose to send, so Do Not Track or opting out of play data
// shouldn't swallow it, and a failure (an ad blocker, no network) is reported instead of hidden.
// When analytics is on, it's tied to the player's session so their play data can be found.
export const feedbackPossible = () => backendOn() || (!!POSTHOG_KEY && !localOnly());
// Resolves to { ok, error }. With the backend address set, the note is emailed to us through the
// Worker, and the PostHog event goes too when play data is allowed; without it, PostHog alone.
export async function sendFeedback(props) {
  const mail = backendOn() ? postBackend('/feedback', { ...props, source: 'game', player: playerId(), game_version: GAME_VERSION, release: RELEASE }) : null;
  const ph = (!backendOn() || trackingAllowed()) ? sendFeedbackEvent(props) : null;
  if (mail) { const r = await mail; return r; }
  return { ok: await ph, error: 'network' };
}
async function sendFeedbackEvent(props) {
  if (!POSTHOG_KEY || localOnly()) return false;
  const ph = P(), linked = ph && trackingAllowed();
  let distinct = null, session = null;
  try { if (linked) { distinct = ph.get_distinct_id?.(); session = ph.get_session_id?.(); } } catch (e) { /* ignore */ }
  const body = {
    api_key: POSTHOG_KEY, event: 'feedback',
    distinct_id: distinct || 'feedback-' + Math.random().toString(36).slice(2, 12),
    properties: { ...props, game_version: GAME_VERSION, release: RELEASE, $current_url: location.href, ...(session ? { $session_id: session } : {}), ...(linked ? {} : { $process_person_profile: false }) },
  };
  try {
    const r = await fetch(POSTHOG_HOST + '/i/v0/e/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true });
    return r.ok;
  } catch (e) { return false; }
}

// Game-wide properties attached to every later event (current year, score and so on).
export function setContext(props) {
  const ph = P();
  if (!ph || !trackingAllowed()) return;
  try { ph.register(props); } catch (e) { /* ignore */ }
}

export function setAnalyticsEnabled(on) {
  settings.analytics = !!on;
  if (!on) {
    try { P()?.opt_out_capturing(); } catch (e) { /* ignore */ }
    return;
  }
  if (!initAnalytics()) return;
  // The SDK may retain an opt-out from an earlier visit or an earlier toggle.
  try { P()?.opt_in_capturing(); } catch (e) { /* ignore */ }
}
