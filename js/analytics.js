// Anonymous usage analytics and player feedback, sent to PostHog.
// Does nothing until POSTHOG_KEY is set, when the player has opted out in Settings,
// on localhost, or when the browser asks sites not to track.

import { settings } from './settings.js';

// Project API key from PostHog (Project settings → Project API key). It is meant to be public.
const POSTHOG_KEY = 'phc_wWDczF7Egr2VV5Nj6JN2duzKW4ND298DaKjgaQ3B78sf';
// https://us.i.posthog.com for US cloud, https://eu.i.posthog.com for EU cloud.
const POSTHOG_HOST = 'https://us.i.posthog.com';
export const GAME_VERSION = '0.5';

let ph = null;

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
    disable_session_recording: false, // replays only run if enabled in the PostHog project
    session_recording: {
      maskAllInputs: false, maskTextSelector: '.ph-mask',
      // record the 3D view too (a couple of frames a second, compressed), not just the panels
      captureCanvas: { recordCanvas: true, canvasFps: 2, canvasQuality: '0.35' },
    },
  });
  window.posthog.register({ game_version: GAME_VERSION });
  return window.posthog;
}

// Whether tracking will run on this page (checked before the 3D view is created, because
// recording the WebGL canvas needs its drawing buffer kept).
export function analyticsWillRun() {
  const local = ['localhost', '127.0.0.1', ''].includes(location.hostname) && !new URLSearchParams(location.search).has('ph');
  return !!POSTHOG_KEY && !local && settings.analytics && navigator.doNotTrack !== '1';
}

export function initAnalytics() {
  // local copies stay quiet so testing doesn't pollute the numbers (add ?ph to the URL to test tracking)
  const local = ['localhost', '127.0.0.1', ''].includes(location.hostname) && !new URLSearchParams(location.search).has('ph');
  if (!POSTHOG_KEY || local) return false;
  ph = loadPostHog();
  if (!settings.analytics) ph.opt_out_capturing();
  return true;
}

export const analyticsReady = () => !!ph;

export function track(event, props = {}) {
  if (!ph || !settings.analytics) return;
  try { ph.capture(event, props); } catch (e) { /* never let analytics break the game */ }
}

// Player feedback goes straight to PostHog's capture API instead of through the tracking
// library: it's something the player chose to send, so Do Not Track or opting out of play data
// shouldn't swallow it, and a failure (an ad blocker, no network) is reported instead of hidden.
// When analytics is on, it's tied to the player's session so the replay can be found.
export const feedbackPossible = () => {
  const local = ['localhost', '127.0.0.1', ''].includes(location.hostname) && !new URLSearchParams(location.search).has('ph');
  return !!POSTHOG_KEY && !local;
};
export async function sendFeedback(props) {
  if (!feedbackPossible()) return false;
  const linked = ph && settings.analytics;
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
  if (!ph) return;
  try { ph.register(props); } catch (e) { /* ignore */ }
}

export function setAnalyticsEnabled(on) {
  if (!ph) return;
  try { on ? ph.opt_in_capturing() : ph.opt_out_capturing(); } catch (e) { /* ignore */ }
}
