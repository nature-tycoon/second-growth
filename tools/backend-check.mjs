// Headless check of the backend Worker (server/src/worker.js): feedback email, newsletter signup,
// ratings, CORS, honeypot, rate limit, and that nothing private reaches the logs. Resend, Kit and
// the D1 database are mocked, so it runs offline in well under a second.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const worker = (await import('../server/src/worker.js')).default;
const { ALLOWED_ORIGINS, MAPS, resetMemoryLimiter } = await import('../server/src/worker.js');

// --- mocks --------------------------------------------------------------------------------
let calls = [], replies = {};
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), body: JSON.parse(init.body), headers: init.headers });
  const status = Object.entries(replies).find(([k]) => String(url).includes(k))?.[1] ?? 200;
  return new Response(JSON.stringify({ id: 'x' }), { status });
};
const logs = [];
console.log = (...a) => logs.push(a.join(' '));

// a tiny stand-in for D1 that understands the worker's two statements
function mockDb() {
  const rows = [];
  return {
    rows,
    prepare(sql) {
      const stmt = {
        args: [],
        bind(...args) { stmt.args = args; return stmt; },
        async run() {
          assert.match(sql, /INSERT INTO ratings/);
          const [player, rating, source, map, created_at] = stmt.args;
          const old = player && rows.find(r => r.player === player);
          if (old) Object.assign(old, { rating, source, map, created_at });
          else rows.push({ player, rating, source, map, created_at });
        },
        async all() {
          assert.match(sql, /FROM ratings WHERE source = 'game'/);
          const n = {};
          for (const r of rows) if (r.source === 'game') n[r.rating] = (n[r.rating] || 0) + 1;
          return { results: Object.entries(n).map(([rating, c]) => ({ rating: +rating, n: c })) };
        },
      };
      return stmt;
    },
  };
}

// a stand-in for Workers KV: get / getWithMetadata / put / delete, with expirationTtl recorded
function mockKv() {
  const store = new Map();
  const bytes = v => typeof v === 'string' ? v : new Uint8Array(v).slice().buffer;
  return {
    store,
    async get(key, opts) { const e = store.get(key); if (!e) return null; return opts?.type === 'arrayBuffer' || opts?.type === 'stream' ? bytes(e.value) : String(e.value); },
    async getWithMetadata(key, opts) { const e = store.get(key); return { value: e ? await this.get(key, opts) : null, metadata: e?.metadata ?? null }; },
    async put(key, value, { expirationTtl, metadata } = {}) { store.set(key, { value: typeof value === 'string' ? value : new Uint8Array(value).slice(), expirationTtl, metadata }); },
    async delete(key) { store.delete(key); },
  };
}

let env;
function reset(extra = {}) {
  calls = []; replies = {}; resetMemoryLimiter();
  env = { RESEND_API_KEY: 're_test', KIT_API_KEY: 'kit_test', KIT_TAG_GAME: '11', KIT_TAG_WEBSITE: '22', FEEDBACK_TO: 'info@secondgrowth.earth', DB: mockDb(), FARMS: mockKv(), ...extra };
}
let ipN = 0;
function req(path, { method = 'POST', origin = 'https://secondgrowth.earth', body, raw, type = 'application/json', ip, extra = {} } = {}) {
  const headers = { 'CF-Connecting-IP': ip || `10.0.0.${++ipN % 250}`, ...extra };
  if (origin) headers.Origin = origin;
  if (method === 'POST') headers['Content-Type'] = type;
  return worker.fetch(new Request('https://api.secondgrowth.earth' + path, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined) }), env);
}
const read = async r => ({ status: r.status, headers: r.headers, body: r.status === 204 ? null : await r.json().catch(() => null) });
const resendCalls = () => calls.filter(c => c.url.includes('resend'));
const kitCalls = () => calls.filter(c => c.url.includes('kit.com'));

const SECRET_MESSAGE = 'I loved the wolves but the beavers flooded my secret meadow';
const SECRET_EMAIL = 'player.person@example.org';
const snapshot = { game_year: 12, game_month: 4, score: 812, species: 31, money: 15200, visitors: 340, game_version: '0.5', release: 'abc123' };

// --- CORS ---------------------------------------------------------------------------------
reset();
for (const origin of ALLOWED_ORIGINS) {
  const pre = await read(await req('/feedback', { method: 'OPTIONS', origin }));
  assert.equal(pre.status, 204, `preflight from ${origin}`);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), origin);
  assert.match(pre.headers.get('Access-Control-Allow-Headers'), /Content-Type/);
}
for (const o of ['https://html-classic.itch.zone', 'https://nature-tycoon.github.io', 'http://localhost:8347']) assert.ok(ALLOWED_ORIGINS.includes(o), o);
assert.equal((await read(await req('/feedback', { method: 'OPTIONS', origin: 'https://evil.example' }))).status, 403);
let r = await read(await req('/feedback', { origin: 'https://evil.example', body: { rating: 5, message: 'hi' } }));
assert.deepEqual([r.status, r.body.error], [403, 'origin_not_allowed']);
r = await read(await req('/feedback', { origin: null, body: { rating: 5, message: 'hi' } }));
assert.equal(r.status, 403, 'no Origin (a script, not a browser) is refused');
assert.equal(resendCalls().length, 0);

// --- feedback -----------------------------------------------------------------------------
reset();
r = await read(await req('/feedback', { origin: 'https://html-classic.itch.zone', body: { rating: 4, message: SECRET_MESSAGE, contact: SECRET_EMAIL, map: 'serengeti', player: 'p_abcdefgh12', ...snapshot } }));
assert.deepEqual([r.status, r.body], [200, { ok: true }]);
assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://html-classic.itch.zone');
let mail = resendCalls()[0].body;
assert.equal(resendCalls()[0].headers.Authorization, 'Bearer re_test');
assert.deepEqual(mail.to, ['info@secondgrowth.earth']);
assert.equal(mail.reply_to, SECRET_EMAIL, 'an email contact becomes Reply-To');
assert.match(mail.subject, /^Feedback 4\/5 \(serengeti\): I loved the wolves/);
assert.ok(mail.text.includes(SECRET_MESSAGE) && mail.text.includes('score: 812') && mail.text.includes('game_version: 0.5'));
assert.equal(env.DB.rows.length, 1);
assert.deepEqual([env.DB.rows[0].rating, env.DB.rows[0].source, env.DB.rows[0].map], [4, 'game', 'serengeti']);

// a Reddit name is shown but not used as Reply-To; a message alone (no rating) stores no rating
reset();
await req('/feedback', { body: { rating: null, message: 'Line one\r\nBcc: x@y.z', contact: 'u/rewilder' } });
mail = resendCalls()[0].body;
assert.equal(mail.reply_to, undefined);
assert.match(mail.text, /Contact: u\/rewilder \(not an email/);
assert.ok(!/[\r\n]/.test(mail.subject), 'subject is one line');
assert.match(mail.subject, /^Feedback: Line one Bcc/);
assert.equal(env.DB.rows.length, 0);

// a rating alone is fine; text/plain bodies (no preflight, sendBeacon) work too
reset();
r = await read(await req('/feedback', { raw: JSON.stringify({ rating: 5 }), type: 'text/plain' }));
assert.equal(r.status, 200);
assert.match(resendCalls()[0].body.subject, /rating only/);

// validation
reset();
for (const [body, error] of [
  [{ rating: 6, message: 'x' }, 'invalid_rating'], [{ rating: 0 }, 'invalid_rating'], [{ rating: '4' }, 'invalid_rating'], [{ rating: 3.5 }, 'invalid_rating'],
  [{ message: '   ' }, 'empty'], [{}, 'empty'], [{ message: 42 }, 'invalid_message'], [{ rating: 3, source: 'reddit' }, 'invalid_source'],
]) {
  r = await read(await req('/feedback', { body }));
  assert.deepEqual([r.status, r.body.error], [400, error], JSON.stringify(body));
}
for (const raw of ['not json', '[1,2]', 'null']) assert.equal((await read(await req('/feedback', { raw }))).body.error, 'invalid_json', raw);
r = await read(await req('/feedback', { raw: JSON.stringify({ message: 'x'.repeat(20000) }) }));
assert.deepEqual([r.status, r.body.error], [413, 'too_large']);
assert.equal(resendCalls().length, 0, 'nothing invalid is emailed');

// long messages are capped; nested or odd extra fields are dropped
reset();
await req('/feedback', { body: { message: 'y'.repeat(4000), nested: { a: 1 }, 'bad key!': 'x', list: [1], flag: true } });
mail = resendCalls()[0].body;
assert.ok(!mail.text.includes('nested') && !mail.text.includes('bad key') && !mail.text.includes('list:') && mail.text.includes('flag: true'));

// honeypot: a filled hidden field looks like success but sends and stores nothing
reset();
r = await read(await req('/feedback', { body: { rating: 1, message: 'buy pills', website: 'http://spam.example' } }));
assert.deepEqual([r.status, r.body], [200, { ok: true }]);
assert.equal(resendCalls().length, 0);
assert.equal(env.DB.rows.length, 0);

// Resend failing: the player is told (so the game keeps their note), and the rating waits for the retry
reset(); replies = { resend: 500 };
r = await read(await req('/feedback', { body: { rating: 2, message: 'x' } }));
assert.deepEqual([r.status, r.body.error], [502, 'send_failed']);
assert.equal(env.DB.rows.length, 0);
reset({ RESEND_API_KEY: undefined });
assert.deepEqual((await read(await req('/feedback', { body: { rating: 2 } }))).body.error, 'misconfigured');
// a broken database doesn't fail the feedback: the email already went
reset({ DB: { prepare() { throw new Error('db down'); } } });
assert.equal((await read(await req('/feedback', { body: { rating: 2 } }))).status, 200);

// --- rate limit ---------------------------------------------------------------------------
reset();
const statuses = [];
for (let k = 0; k < 7; k++) statuses.push((await req('/feedback', { ip: '1.2.3.4', body: { rating: 3 } })).status);
assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429, 429]);
r = await read(await req('/feedback', { ip: '1.2.3.4', body: { rating: 3 } }));
assert.equal(r.headers.get('Retry-After'), '60');
assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://secondgrowth.earth', 'the page can read the 429');
assert.equal((await req('/subscribe', { ip: '1.2.3.4', body: { email: 'a@b.co' } })).status, 200, 'limits are per endpoint');
assert.equal((await req('/feedback', { ip: '5.6.7.8', body: { rating: 3 } })).status, 200, 'and per IP');
// with Cloudflare's binding configured, its answer is used
reset({ LIMITER: { limit: async ({ key }) => ({ success: !key.includes('9.9.9.9') }) } });
assert.equal((await req('/feedback', { ip: '9.9.9.9', body: { rating: 3 } })).status, 429);
assert.equal((await req('/feedback', { ip: '9.9.9.8', body: { rating: 3 } })).status, 200);

// --- subscribe ----------------------------------------------------------------------------
reset();
r = await read(await req('/subscribe', { body: { email: '  New.Player@Example.COM ', source: 'game' } }));
assert.deepEqual([r.status, r.body], [200, { ok: true }]);
assert.equal(kitCalls().length, 2);
assert.match(kitCalls()[0].url, /api\.kit\.com\/v4\/subscribers$/);
assert.equal(kitCalls()[0].headers['X-Kit-Api-Key'], 'kit_test');
assert.equal(kitCalls()[0].body.email_address, 'new.player@example.com');
assert.match(kitCalls()[1].url, /\/v4\/tags\/11\/subscribers$/, 'game signups get the game tag');
reset();
await req('/subscribe', { body: { email: 'a@b.co' } });
assert.match(kitCalls()[1].url, /\/tags\/22\//, 'source defaults to website');
reset({ KIT_TAG_WEBSITE: '' });
await req('/subscribe', { body: { email: 'a@b.co', source: 'website' } });
assert.equal(kitCalls().length, 1, 'no tag id: subscribe only');
reset();
for (const email of ['nope', 'a@b', 'a b@c.de', '@x.com', 'x@.c', 42, null, 'a@b.co'.padStart(300, 'a')]) {
  r = await read(await req('/subscribe', { body: { email } }));
  assert.deepEqual([r.status, r.body.error], [400, 'invalid_email'], String(email));
}
assert.equal((await read(await req('/subscribe', { body: { email: 'a@b.co', source: 'x' } }))).body.error, 'invalid_source');
assert.equal(kitCalls().length, 0);
r = await read(await req('/subscribe', { body: { email: 'a@b.co', website: 'x' } }));
assert.deepEqual([r.status, kitCalls().length], [200, 0], 'honeypot');
reset(); replies = { 'kit.com/v4/subscribers': 422 };
assert.equal((await read(await req('/subscribe', { body: { email: 'a@b.co' } }))).body.error, 'invalid_email', 'Kit rejecting the address');
reset(); replies = { 'kit.com/v4/subscribers': 503 };
assert.deepEqual(Object.values((await read(await req('/subscribe', { body: { email: 'a@b.co' } }))).body), [false, 'subscribe_failed']);
reset(); replies = { '/tags/': 404 };
assert.equal((await req('/subscribe', { body: { email: 'a@b.co' } })).status, 200, 'a bad tag id still subscribes');
reset({ KIT_API_KEY: undefined });
assert.equal((await read(await req('/subscribe', { body: { email: 'a@b.co' } }))).body.error, 'misconfigured');

// --- ratings ------------------------------------------------------------------------------
reset();
r = await read(await req('/ratings', { method: 'GET', origin: null }));
assert.deepEqual(r.body, { ok: true, average: null, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
for (const [rating, player, source] of [[5, 'player_aaaaaaaa'], [4, 'player_bbbbbbbb'], [2, null], [1, null, 'website'], [3, 'player_aaaaaaaa'], [4, 'short']]) {
  await req('/feedback', { body: { rating, player, source } });
}
r = await read(await req('/ratings', { method: 'GET', origin: 'https://evil.example' }));
// player a's 5 was replaced by their 3; 'short' isn't a valid player id so it counts on its own; the website 1 is left out
assert.deepEqual(r.body, { ok: true, average: 3.3, count: 4, distribution: { 1: 0, 2: 1, 3: 1, 4: 2, 5: 0 } });
assert.equal(r.headers.get('Access-Control-Allow-Origin'), '*');
assert.match(r.headers.get('Cache-Control'), /public, max-age=\d+/);
assert.equal((await req('/ratings', { method: 'OPTIONS' })).status, 204);
assert.equal((await req('/ratings', { method: 'POST', body: {} })).status, 405);

// --- routing ------------------------------------------------------------------------------
assert.equal((await req('/nope', { method: 'GET' })).status, 404);
assert.equal((await req('/feedback', { method: 'GET' })).status, 405);
assert.equal((await req('/feedback/', { body: { rating: 3 } })).status, 200, 'trailing slash');
assert.equal((await req('/', { method: 'GET' })).status, 200);

// --- shared farms (decision 0047) ------------------------------------------------------------
const { BIOME_LIST } = await import('../js/biome.js');
assert.deepEqual([...MAPS].sort(), BIOME_LIST.map(b => b.id).sort(), 'the Worker knows every map');
const { gzipSync } = await import('node:zlib');
const farmFile = gzipSync(Buffer.from('SGF1' + 'x'.repeat(5000)));
reset();
r = await read(await req('/farms?map=serengeti&v=2', { raw: farmFile, type: 'application/octet-stream', origin: 'https://secondgrowth.earth' }));
assert.equal(r.status, 201);
const shared = r.body;
assert.match(shared.id, /^[2-9a-hjkmnp-z]{10}$/);
assert.equal(shared.url, `https://secondgrowth.earth/play/?farm=${shared.id}`);
assert.match(shared.deleteKey, /^[0-9a-f]{32}$/);
assert.match(shared.expires, /^\d{4}-\d\d-\d\d$/);
const stored = env.FARMS.store.get(`farm:${shared.id}`);
assert.equal(stored.expirationTtl, 365 * 86400, 'kept a year');
assert.deepEqual([stored.metadata.map, stored.metadata.v, stored.metadata.size], ['serengeti', 2, farmFile.length]);
assert.ok(!JSON.stringify(stored.metadata).includes(shared.deleteKey), 'only a hash of the delete key is kept');
// opening it: anyone, byte for byte, with its map
let got = await req(`/farms/${shared.id}`, { method: 'GET', origin: null });
assert.equal(got.status, 200);
assert.deepEqual(new Uint8Array(await got.arrayBuffer()), new Uint8Array(farmFile));
assert.equal(got.headers.get('X-Farm-Map'), 'serengeti');
assert.equal(got.headers.get('Access-Control-Allow-Origin'), '*');
assert.match(got.headers.get('Access-Control-Expose-Headers'), /X-Farm-Map/);
assert.equal((await read(await req('/farms/zzzzzzzzzz', { method: 'GET' }))).body.error, 'not_found');
assert.equal((await req('/farms/../../x', { method: 'GET' })).status, 404);
// preflights: the share (octet-stream) and the delete key header
let pre = await req('/farms', { method: 'OPTIONS', origin: 'https://html-classic.itch.zone' });
assert.equal(pre.status, 204); assert.match(pre.headers.get('Access-Control-Allow-Methods'), /POST/);
pre = await req(`/farms/${shared.id}`, { method: 'OPTIONS' });
assert.match(pre.headers.get('Access-Control-Allow-Headers'), /X-Delete-Key/); assert.match(pre.headers.get('Access-Control-Allow-Methods'), /DELETE/);
// refused shares
for (const [path, opts, status, error] of [
  ['/farms?map=mars', { raw: farmFile }, 400, 'invalid_map'],
  ['/farms?map=reef', { raw: Buffer.from('not gzip at all, just text') }, 400, 'invalid_farm'],
  ['/farms?map=reef', { raw: Buffer.concat([farmFile, Buffer.alloc(2 * 1024 * 1024)]) }, 413, 'too_large'],
  ['/farms?map=reef', { raw: farmFile, origin: 'https://evil.example' }, 403, 'origin_not_allowed'],
  ['/farms?map=reef', { raw: farmFile, origin: null }, 403, 'origin_not_allowed'],
]) {
  r = await read(await req(path, { type: 'application/octet-stream', ...opts }));
  assert.deepEqual([r.status, r.body.error], [status, error], `${path} ${error}`);
}
assert.equal((await read(await req(`/farms/${shared.id}`, { body: {} }))).status, 405);
// the day's cap pauses sharing for everyone
env.FARMS.store.set(`count:${new Date().toISOString().slice(0, 10)}`, { value: '400' });
r = await read(await req('/farms?map=reef', { raw: farmFile, type: 'application/octet-stream' }));
assert.deepEqual([r.status, r.body.error], [503, 'sharing_paused']);
// rate limit per IP
reset();
const shareStatuses = [];
for (let k = 0; k < 6; k++) shareStatuses.push((await req('/farms?map=reef', { raw: farmFile, type: 'application/octet-stream', ip: '7.7.7.7' })).status);
assert.deepEqual(shareStatuses, [201, 201, 201, 201, 201, 429]);
assert.equal(env.FARMS.store.get(`count:${new Date().toISOString().slice(0, 10)}`).value, '5');
// report: emails Cole the id, never more than the reason
reset();
const one = (await read(await req('/farms?map=atlanta&v=2', { raw: farmFile, type: 'application/octet-stream' }))).body;
r = await read(await req(`/farms/${one.id}/report`, { body: { reason: 'rude\r\nshape drawn in fences' } }));
assert.deepEqual([r.status, r.body], [200, { ok: true }]);
mail = resendCalls()[0].body;
assert.match(mail.subject, new RegExp(`Shared farm reported: ${one.id} \\(atlanta\\)`));
assert.ok(mail.text.includes('rude shape drawn in fences') && mail.text.includes(`kv key delete --binding=FARMS --remote "farm:${one.id}"`));
assert.equal((await read(await req('/farms/zzzzzzzzzz/report', { body: {} }))).body.error, 'not_found');
// stop sharing: only with the right key
r = await read(await req(`/farms/${one.id}`, { method: 'DELETE', extra: { 'X-Delete-Key': 'f'.repeat(32) } }));
assert.deepEqual([r.status, r.body.error], [403, 'wrong_key']);
r = await read(await req(`/farms/${one.id}`, { method: 'DELETE', origin: 'https://evil.example', extra: { 'X-Delete-Key': one.deleteKey } }));
assert.equal(r.status, 403);
r = await read(await req(`/farms/${one.id}`, { method: 'DELETE', extra: { 'X-Delete-Key': one.deleteKey } }));
assert.deepEqual([r.status, r.body], [200, { ok: true }]);
assert.equal((await req(`/farms/${one.id}`, { method: 'GET' })).status, 404);
reset({ FARMS: undefined });
assert.equal((await read(await req('/farms?map=reef', { raw: farmFile, type: 'application/octet-stream' }))).body.error, 'misconfigured');

// --- privacy: nothing a player wrote reaches the logs ----------------------------------------
assert.ok(logs.length > 0);
for (const line of logs) for (const secret of [SECRET_MESSAGE, SECRET_EMAIL, 'wolves', '@example', 'new.player', 'u/rewilder', 'buy pills', 'rude', shared.deleteKey]) {
  assert.ok(!line.includes(secret), `log line leaks "${secret}": ${line}`);
}

// --- config and contract stay in step -----------------------------------------------------
const root = new URL('../', import.meta.url);
const toml = await readFile(new URL('server/wrangler.toml', root), 'utf8');
assert.match(toml, /main = "src\/worker\.js"/);
assert.match(toml, /binding = "DB"/);
assert.match(toml, /name = "LIMITER"/);
assert.match(toml, /binding = "FARMS"/);
assert.ok(!/RESEND_API_KEY\s*=|KIT_API_KEY\s*=/.test(toml), 'secrets never live in wrangler.toml');
const schema = await readFile(new URL('server/schema.sql', root), 'utf8');
assert.match(schema, /player TEXT UNIQUE/);
const doc = await readFile(new URL('docs/backend-setup.md', root), 'utf8');
const source = await readFile(new URL('server/src/worker.js', root), 'utf8');
const codes = new Set([...source.matchAll(/fail\(\d+, '([a-z_]+)'/g)].map(m => m[1]));
for (const code of ['invalid_json', 'invalid_rating', 'invalid_message', 'empty', 'invalid_source', 'invalid_email', 'too_large', 'misconfigured', 'send_failed', 'subscribe_failed', 'rate_limited', 'origin_not_allowed', 'not_found', 'method_not_allowed', 'server_error', 'invalid_map', 'invalid_farm', 'sharing_paused', 'wrong_key']) codes.add(code);
for (const code of codes) assert.ok(doc.includes('`' + code + '`'), `docs/backend-setup.md lists error ${code}`);
for (const origin of ALLOWED_ORIGINS) assert.ok(doc.includes(origin), `docs/backend-setup.md lists origin ${origin}`);

process.stdout.write('backend-check: ok\n');
