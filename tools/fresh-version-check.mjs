// Headless check of js/fresh-version.js: a version bump is noticed at launch and mid-game, the
// cache is refreshed before the reload, a loop is refused, and a dev copy never updates.
import assert from 'node:assert/strict';

const store = {};
globalThis.sessionStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
const listeners = {};
globalThis.document = { hidden: false, addEventListener: (t, f) => { listeners[t] = f; }, removeEventListener() {} };
let reloads = 0;
globalThis.location = { href: 'https://secondgrowth.earth/play/', reload: () => { reloads++; } };
let live = { release: '2026-11-20-bbbbbbb', files: ['js/main.js', 'js/game.js'] };
const calls = [];
globalThis.fetch = async (url, init) => { calls.push({ url: String(url), cache: init?.cache }); return String(url).endsWith('version.json') ? new Response(JSON.stringify(live)) : new Response('x'); };

const m = await import('../js/fresh-version.js');
assert.equal(m.isNewer('dev', live), false);
assert.equal(m.isNewer('2026-11-20-bbbbbbb', live), false);
assert.equal(m.isNewer('2026-11-19-aaaaaaa', live), true);
assert.equal(m.isNewer('2026-11-19-aaaaaaa', null), false);

// launch: newer -> every file refetched with cache 'reload', then one reload; a second try is refused
assert.equal(await m.reloadIfStale('2026-11-19-aaaaaaa'), true);
assert.equal(reloads, 1);
assert.equal(calls[0].cache, 'no-store');
assert.deepEqual(calls.filter(c => c.cache === 'reload').map(c => c.url.replace('https://secondgrowth.earth/play/', '')), ['', 'styles.css', 'js/main.js', 'js/game.js']);
assert.equal(await m.reloadIfStale('2026-11-19-aaaaaaa'), false, 'no reload loop');
assert.equal(reloads, 1);
assert.equal(await m.reloadIfStale('dev'), false);
// same release, or version.json unreachable: just play
live = { release: '2026-11-19-aaaaaaa', files: [] };
assert.equal(await m.reloadIfStale('2026-11-19-aaaaaaa'), false);
globalThis.fetch = async () => { throw new Error('offline'); };
assert.equal(await m.reloadIfStale('2026-11-18-zzzzzzz'), false);

// mid-game: saves and offers a reload once per new release, never reloads by itself
globalThis.fetch = async url => new Response(JSON.stringify({ release: '2026-11-21-ccccccc', files: [] }));
let saves = 0; const notes = [];
const game = { saveReady: true, autosave: true, save: async () => { saves++; }, dateString: () => 'x', emit: (t, n) => notes.push(n) };
m.watchForNewVersion(game, { current: '2026-11-19-aaaaaaa', every: 1e9 });
await listeners.visibilitychange(); await new Promise(r => setTimeout(r, 10));
assert.equal(notes.length, 1); assert.equal(saves, 1); assert.equal(reloads, 1, 'not reloaded yet');
await listeners.visibilitychange(); await new Promise(r => setTimeout(r, 10));
assert.equal(notes.length, 1, 'offered once');
await notes[0].action.run();
assert.equal(reloads, 2); assert.ok(saves >= 2);
assert.equal(typeof m.watchForNewVersion(game, { current: 'dev' }), 'function');
console.log('fresh-version-check ok');
process.exit(0); // (the watcher's timer would keep node alive)
