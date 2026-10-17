// Exercise the production ES modules with inert browser APIs. Never contact PostHog.
import assert from 'node:assert/strict';

const stored = new Map([['second-growth-settings', JSON.stringify({ analytics: false, v: 2 })]]);
globalThis.localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) };
const { settings, saveSettings } = await import('../js/settings.js');
assert.equal(settings.analytics, false, 'Stored opt-out is loaded');
let sequence = 0;
async function fixture({ enabled = false, navigator = {}, windowFlags = {}, host = 'secondgrowth.earth', search = '' } = {}) {
  const scripts = [], feedback = [];
  settings.analytics = enabled;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: navigator });
  globalThis.window = { ...windowFlags, addEventListener() {} };
  globalThis.document = {
    createElement: () => ({}),
    getElementsByTagName: () => [{ parentNode: { insertBefore: script => scripts.push(script) } }],
  };
  globalThis.location = { hostname: host, search, href: `https://${host}/play/${search}` };
  globalThis.fetch = async (url, options) => { feedback.push({ url, body: JSON.parse(options.body) }); return { ok: true }; };
  // Fresh analytics lifecycle per case; settings remain the actual shared production module.
  const api = await import(`../js/analytics.js?privacy-case=${sequence++}`);
  return { api, scripts, feedback };
}

{
  const { api, scripts, feedback } = await fixture();
  assert.equal(api.initAnalytics(), false);
  api.track('disabled'); api.trackExit('disabled'); api.setContext({ map: 'pnw' });
  assert.equal(api.analyticsReady(), false);
  assert.equal(scripts.length, 0, 'Cold opt-out never inserts the SDK');
  assert.equal(feedback.length, 0, 'Opt-out sends no implicit feedback');
  assert.equal(await api.sendFeedback({ message: 'An explicitly submitted note' }), true);
  assert.equal(feedback.length, 1);
  assert.equal(feedback[0].body.event, 'feedback');
  assert.match(feedback[0].body.distinct_id, /^feedback-/);
  assert.equal(feedback[0].body.properties.$process_person_profile, false);
  assert.equal(scripts.length, 0, 'Explicit feedback does not load the SDK');
}
{
  const { api, scripts, feedback } = await fixture();
  api.initAnalytics();
  api.setAnalyticsEnabled(true);
  api.initAnalytics(); api.setAnalyticsEnabled(true);
  assert.equal(scripts.length, 1, 'Lazy opt-in initializes once');
  assert.equal(scripts[0].src, 'https://us-assets.i.posthog.com/static/array.js');
  const config = window.posthog._i[0][1];
  assert.equal(config.disable_session_recording, true);
  const event = { event: '$pageview' };
  assert.equal(config.before_send(event), event);
  api.setAnalyticsEnabled(false);
  assert.equal(config.before_send(event), null, 'SDK events are blocked if consent changes during load');
  const queued = window.posthog.length;
  api.track('disabled'); api.trackExit('disabled'); api.setContext({ map: 'reef' });
  assert.equal(window.posthog.length, queued, 'Disabled wrappers do not queue more events or context');
  saveSettings();
  assert.equal(JSON.parse(stored.get('second-growth-settings')).analytics, false);

  // Replace the loader queue as the real SDK does after downloading.
  const calls = [];
  window.posthog = {
    capture: (...args) => calls.push(['capture', ...args]),
    register: (...args) => calls.push(['register', ...args]),
    opt_in_capturing: () => calls.push(['in']), opt_out_capturing: () => calls.push(['out']),
    get_distinct_id: () => 'player-id', get_session_id: () => 'session-id',
  };
  api.setAnalyticsEnabled(true); api.setContext({ map: 'pnw' }); api.track('enabled'); api.trackExit('leaving');
  assert.deepEqual(calls.map(call => call[0]), ['in', 'register', 'capture', 'capture']);
  assert.equal(scripts.length, 1, 'Re-enabling uses the loaded SDK');
  await api.sendFeedback({ message: 'Linked by choice' });
  assert.equal(feedback[0].body.distinct_id, 'player-id');
  api.setAnalyticsEnabled(false);
  const count = calls.length;
  api.track('disabled'); api.trackExit('disabled'); api.setContext({ map: 'reef' });
  assert.equal(calls.length, count, 'Opt-out blocks normal, exit and context calls');
  assert.equal(calls.at(-1)[0], 'out');
  await api.sendFeedback({ message: 'Unlinked after opting out' });
  assert.match(feedback[1].body.distinct_id, /^feedback-/);
  assert.equal(feedback[1].body.properties.$session_id, undefined);
}
for (const privacy of [
  { navigator: { doNotTrack: '1' } }, { navigator: { doNotTrack: 'yes' } },
  { navigator: { msDoNotTrack: '1' } }, { windowFlags: { doNotTrack: '1' } },
  { navigator: { globalPrivacyControl: true } },
]) {
  const { api, scripts } = await fixture({ enabled: true, ...privacy });
  assert.equal(api.initAnalytics(), false);
  api.setAnalyticsEnabled(true);
  assert.equal(scripts.length, 0, 'Browser privacy preference prevents SDK loading');
}
for (const host of ['localhost', '127.0.0.1', '']) {
  const { api, scripts } = await fixture({ enabled: true, host });
  assert.equal(api.initAnalytics(), false);
  assert.equal(api.feedbackPossible(), false);
  assert.equal(scripts.length, 0, 'Local testing stays quiet');
}
{
  const { api, scripts } = await fixture({ enabled: true, host: 'localhost', search: '?ph' });
  assert.equal(api.initAnalytics(), true);
  assert.equal(api.initAnalytics(), true);
  assert.equal(scripts.length, 1, 'Existing explicit local analytics testing still works');
}
console.log('PASS saved opt-out, lazy/idempotent opt-in, queued-event consent changes, live SDK opt-out, exit/context gates, browser privacy signals, local silence and explicit feedback. No network requests made.');
