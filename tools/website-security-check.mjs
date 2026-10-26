// Check policy coverage and exact inline-script hashes before website/itch releases.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
for (const path of ['index.html', 'website/index.html', 'website/visuals.html']) {
  const html = await readFile(new URL(path, root), 'utf8');
  const matches = [...html.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/g)];
  assert.equal(matches.length, 1, `${path}: exactly one CSP`);
  const policy = matches[0][1];
  const directives = new Map(policy.split(';').map(part => part.trim().split(/\s+/)).map(([key, ...values]) => [key, values]));
  const site = path !== 'index.html';
  for (const name of ['default-src', 'base-uri', 'object-src', 'script-src-attr', 'form-action', 'worker-src', ...(site ? [] : ['frame-src'])]) {
    assert.deepEqual(directives.get(name), ["'none'"], `${path}: ${name}`);
  }
  // The website (not the game) runs Google Tag Manager; its no-JavaScript frame is the only allowed frame.
  if (site) assert.deepEqual(directives.get('frame-src'), ['https://www.googletagmanager.com'], `${path}: frame-src`);
  assert.ok(html.indexOf(matches[0][0]) < html.search(/<(?:script|link|style)\b/), `${path}: policy precedes subresources`);
  assert.ok(html.includes('<meta name="referrer" content="strict-origin-when-cross-origin">'));
  assert.ok(!/http-equiv="(?:X-Frame-Options|Permissions-Policy|Strict-Transport-Security|X-Content-Type-Options)"/i.test(html), 'Do not pretend unsupported header meta tags work');
  const scripts = directives.get('script-src');
  if (path !== 'index.html') assert.ok(!/\sstyle\s*=/i.test(html), `${path}: use stylesheet defaults instead of CSP-blocked inline styles`);
  assert.ok(!scripts.some(value => value.includes('unsafe-') || value === '*' || value === 'https:'), `${path}: no broad executable-code permission`);
  const expectedHashes = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc=/.test(match[1]) || /application\/ld\+json/.test(match[1])) continue;
    const hash = `'sha256-${createHash('sha256').update(match[2]).digest('base64')}'`;
    assert.ok(scripts.includes(hash), `${path}: inline script changed; review and update its CSP hash`);
    expectedHashes.push(hash);
  }
  assert.deepEqual(scripts.filter(value => value.startsWith("'sha256-")), expectedHashes, `${path}: no unused inline-script permissions`);
  const remoteScripts = scripts.filter(value => value.startsWith('https:'));
  assert.deepEqual(remoteScripts, site ? ['https://www.googletagmanager.com'] : ['https://us-assets.i.posthog.com']);
  assert.deepEqual(directives.get('connect-src'), site
    ? ['https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com']
    : ["'self'", 'https://us.i.posthog.com', 'https://us-assets.i.posthog.com']);
}
console.log('PASS early CSP/referrer coverage, exact game inline hashes, narrow script/network allowlists, blocked inline handlers, frames, objects, forms and workers.');
