// Anonymous usage analytics and player feedback, sent to PostHog.
// Does nothing until POSTHOG_KEY is set, when the player has opted out in Settings,
// on localhost, or when the browser asks sites not to track.

import { settings } from './settings.js';

// Project API key from PostHog (Project settings → Project API key). It is meant to be public.
const POSTHOG_KEY = 'phc_wWDczF7Egr2VV5Nj6JN2duzKW4ND298DaKjgaQ3B78sf';
// https://us.i.posthog.com for US cloud, https://eu.i.posthog.com for EU cloud.
const POSTHOG_HOST = 'https://us.i.posthog.com';
export const GAME_VERSION = '0.5';

// PostHog, looked up each time rather than kept: the loader puts a stand-in on window.posthog that
// queues calls, and when the library arrives it replaces that stand-in with the real thing. A
// kept reference would go on feeding the stand-in's queue, which nothing reads any more.
let started = false;
const P = () => (started ? window.posthog : null);

function loadPostHog() {
  // PostHog's standard loader: queues calls until the library arrives from their CDN.
  /* eslint-disable */
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group getActiveMatchingSurveys getSurveys onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
  /* eslint-enable */
  window.posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: 'always',       // anonymous profiles, so returning players can be counted
    persistence: 'localStorage',     // no cookies
    respect_dnt: true,
    autocapture: false,              // we send named game events instead of every click
    capture_pageview: true,
    capture_pageleave: true,
    // No session replays: nobody watched them, and filming the 3D view kept its drawing buffer
    // and read it back from the graphics chip every second, which cost players frame rate.
    disable_session_recording: true,
  });
  window.posthog.register({ game_version: GAME_VERSION });
  return window.posthog;
}

export function initAnalytics() {
  // local copies stay quiet so testing doesn't pollute the numbers (add ?ph to the URL to test tracking)
  const local = ['localhost', '127.0.0.1', ''].includes(location.hostname) && !new URLSearchParams(location.search).has('ph');
  if (!POSTHOG_KEY || local) return false;
  loadPostHog(); started = true;
  if (!settings.analytics) P().opt_out_capturing();
  return true;
}

export const analyticsReady = () => !!P();

// For the moment the player leaves: sent with sendBeacon so it survives the tab closing.
export function trackExit(event, props = {}) {
  const ph = P();
  if (!ph || !settings.analytics) return;
  try { ph.capture(event, props, { transport: 'sendBeacon' }); } catch (e) { /* ignore */ }
}

// Crashes and script errors, so we can see where the game breaks for people (a few per session).
let errorsSent = 0;
const errorsSeen = new Set();
function reportError(kind, message, where) {
  const key = `${message}|${where}`;
  if (errorsSent >= 5 || errorsSeen.has(key)) return;
  errorsSeen.add(key); errorsSent++;
  track('js_error', { kind, message: String(message).slice(0, 300), where: String(where || '').slice(0, 200) });
}
window.addEventListener('error', e => reportError('error', e.message, `${(e.filename || '').split('/').pop()}:${e.lineno}:${e.colno}`));
window.addEventListener('unhandledrejection', e => reportError('promise', e.reason?.message || e.reason, e.reason?.stack?.split('\n')[1]?.trim()));

export function track(event, props = {}) {
  const ph = P();
  if (!ph || !settings.analytics) return;
  try { ph.capture(event, props); } catch (e) { /* never let analytics break the game */ }
}

// Player feedback goes straight to PostHog's capture API instead of through the tracking
// library: it's something the player chose to send, so Do Not Track or opting out of play data
// shouldn't swallow it, and a failure (an ad blocker, no network) is reported instead of hidden.
// When analytics is on, it's tied to the player's session so their play data can be found.
export const feedbackPossible = () => {
  const local = ['localhost', '127.0.0.1', ''].includes(location.hostname) && !new URLSearchParams(location.search).has('ph');
  return !!POSTHOG_KEY && !local;
};
export async function sendFeedback(props) {
  if (!feedbackPossible()) return false;
  const ph = P(), linked = ph && settings.analytics;
  let distinct = null, session = null;
  try { if (linked) { distinct = ph.get_distinct_id?.(); session = ph.get_session_id?.(); } } catch (e) { /* ignore */ }
  const body = {
    api_key: POSTHOG_KEY, event: 'feedback',
    distinct_id: distinct || 'feedback-' + Math.random().toString(36).slice(2, 12),
    properties: { ...props, game_version: GAME_VERSION, $current_url: location.href, ...(session ? { $session_id: session } : {}), ...(linked ? {} : { $process_person_profile: false }) },
  };
  try {
    const r = await fetch(POSTHOG_HOST + '/i/v0/e/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true });
    return r.ok;
  } catch (e) { return false; }
}

// Game-wide properties attached to every later event (current year, score and so on).
export function setContext(props) {
  const ph = P();
  if (!ph) return;
  try { ph.register(props); } catch (e) { /* ignore */ }
}

export function setAnalyticsEnabled(on) {
  const ph = P();
  if (!ph) return;
  try { on ? ph.opt_in_capturing() : ph.opt_out_capturing(); } catch (e) { /* ignore */ }
}
