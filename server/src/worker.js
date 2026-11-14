// Second Growth's one small backend: player feedback by email (Resend), newsletter signups (Kit),
// the average in-game rating, and farms shared by link (Cloudflare KV, decision 0047). The contract and setup steps are in docs/backend-setup.md;
// tools/backend-check.mjs runs this handler headless with Resend, Kit and storage mocked.
//
// Privacy: never log a message, contact or email address. Logs carry statuses and counts only.

export const ALLOWED_ORIGINS = [
  'https://secondgrowth.earth',
  'https://www.secondgrowth.earth',
  'https://nature-tycoon.github.io',
  'https://html-classic.itch.zone', // (itch.io serves the game in an iframe from here)
  'http://localhost:8347',
  'http://127.0.0.1:8347',
];

const MAX_BODY = 16 * 1024;
const MAX_MESSAGE = 4000, MAX_CONTACT = 200, MAX_EXTRA_FIELDS = 30;
// requests per IP per minute, per endpoint
const LIMIT_PER_MINUTE = 5;
const RATINGS_MAX_AGE = 600;
// shared farms (decision 0047): gzip-compressed share files, kept a year, at most this many a day
// in all (two KV writes each, under the free tier's 1,000 writes a day)
export const MAPS = ['pnw', 'amazon', 'serengeti', 'atlanta', 'chinandega', 'reef', 'sumatra'];
const MAX_FARM = 2 * 1024 * 1024, FARM_TTL = 365 * 86400, SHARES_PER_DAY = 400;
const ID_LETTERS = '23456789abcdefghjkmnpqrstuvwxyz'; // (no 0/o, 1/l/i look-alikes)
const ID_RE = /^[23456789abcdefghjkmnpqrstuvwxyz]{10}$/;
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

export function isEmail(s) {
  return typeof s === 'string' && s.length <= 254 && EMAIL_RE.test(s);
}

function corsHeaders(origin, allowAny = false) {
  const h = { 'Vary': 'Origin' };
  if (allowAny) h['Access-Control-Allow-Origin'] = '*';
  else if (origin && ALLOWED_ORIGINS.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}

function fail(status, error, headers) { return json(status, { ok: false, error }, headers); }

// One line, no control characters, capped: safe for an email subject or a table cell.
function oneLine(s, max) {
  return String(s).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);
}

// --- rate limit ---------------------------------------------------------------------------
// Cloudflare's rate-limit binding (env.LIMITER) when it's configured; otherwise a per-isolate
// memory window, which is weaker (each Cloudflare machine counts on its own) but never off.
const memoryHits = new Map();
export function resetMemoryLimiter() { memoryHits.clear(); }

async function allowed(env, key) {
  if (env.LIMITER?.limit) {
    try { return (await env.LIMITER.limit({ key })).success; } catch (e) { /* fall through to memory */ }
  }
  const now = Date.now(), recent = (memoryHits.get(key) || []).filter(t => now - t < 60_000);
  if (recent.length >= LIMIT_PER_MINUTE) { memoryHits.set(key, recent); return false; }
  recent.push(now); memoryHits.set(key, recent);
  if (memoryHits.size > 5000) memoryHits.clear(); // (bounded: a flood of IPs just resets it)
  return true;
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) return { error: 'too_large' };
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'invalid_json' };
    return { body };
  } catch (e) { return { error: 'invalid_json' }; }
}

// --- feedback -----------------------------------------------------------------------------
const FEEDBACK_KEYS = new Set(['rating', 'message', 'contact', 'map', 'source', 'player', 'website']);

export function parseFeedback(b) {
  let rating = b.rating ?? null;
  if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) return { error: 'invalid_rating' };
  if (b.message != null && typeof b.message !== 'string') return { error: 'invalid_message' };
  const message = (b.message || '').trim().slice(0, MAX_MESSAGE);
  if (!message && rating === null) return { error: 'empty' };
  const source = b.source ?? 'game';
  if (source !== 'game' && source !== 'website') return { error: 'invalid_source' };
  const contact = typeof b.contact === 'string' ? oneLine(b.contact, MAX_CONTACT) : '';
  const map = typeof b.map === 'string' ? oneLine(b.map, 40) : '';
  const player = typeof b.player === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(b.player) ? b.player : null;
  // everything else the game sends (its snapshot: year, score, species, version...) goes in the
  // email as a small table; only short plain values, so nothing big or nested gets through
  const extra = [];
  for (const [k, v] of Object.entries(b)) {
    if (FEEDBACK_KEYS.has(k) || extra.length >= MAX_EXTRA_FIELDS) continue;
    if (!/^[A-Za-z0-9_$.-]{1,40}$/.test(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v) || typeof v === 'boolean') extra.push([k, String(v)]);
    else if (typeof v === 'string' && v) extra.push([k, oneLine(v, 200)]);
  }
  return { rating, message, contact, map, source, player, extra };
}

export function feedbackEmail(f, env) {
  const first = f.message ? oneLine(f.message, 60) + (f.message.length > 60 ? '…' : '') : 'rating only';
  const subject = oneLine(`Feedback${f.rating ? ` ${f.rating}/5` : ''}${f.map ? ` (${f.map})` : ''}: ${first}`, 140);
  const lines = [
    f.rating ? `Rating: ${f.rating}/5 ${['😞', '😕', '😐', '🙂', '😍'][f.rating - 1]}` : 'Rating: none',
    `From: ${f.source === 'website' ? 'the website' : 'the game'}${f.map ? `, map ${f.map}` : ''}`,
    `Contact: ${f.contact || 'none left'}${f.contact && !isEmail(f.contact) ? ' (not an email: maybe a Reddit name)' : ''}`,
    '',
    f.message || '(no message)',
    '',
  ];
  if (f.extra.length) lines.push('— Game details —', ...f.extra.map(([k, v]) => `${k}: ${v}`));
  const email = {
    from: env.FEEDBACK_FROM || 'Second Growth feedback <feedback@secondgrowth.earth>',
    to: [env.FEEDBACK_TO || 'info@secondgrowth.earth'],
    subject,
    text: lines.join('\n'),
  };
  if (isEmail(f.contact)) email.reply_to = f.contact;
  return email;
}

async function sendEmail(env, email) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(email),
  });
  if (!r.ok) console.log(`resend failed: ${r.status}`);
  return r.ok;
}

async function storeRating(env, f) {
  if (!env.DB || f.rating === null) return;
  // one current rating per player when the game sends its random player id; a later rating replaces it
  await env.DB.prepare(
    `INSERT INTO ratings (player, rating, source, map, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(player) DO UPDATE SET rating = excluded.rating, source = excluded.source, map = excluded.map, created_at = excluded.created_at`,
  ).bind(f.player, f.rating, f.source, f.map || null, new Date().toISOString()).run();
}

async function handleFeedback(request, env, cors) {
  const { body, error } = await readBody(request);
  if (error) return fail(error === 'too_large' ? 413 : 400, error, cors);
  if (body.website) return json(200, { ok: true }, cors); // honeypot: a bot filled the hidden field
  const f = parseFeedback(body);
  if (f.error) return fail(400, f.error, cors);
  if (!env.RESEND_API_KEY) { console.log('feedback: RESEND_API_KEY missing'); return fail(500, 'misconfigured', cors); }
  let sent = false;
  try { sent = await sendEmail(env, feedbackEmail(f, env)); } catch (e) { console.log('resend unreachable'); }
  if (!sent) return fail(502, 'send_failed', cors);
  // the email is what matters; a storage hiccup only loses this one rating from the average
  try { await storeRating(env, f); } catch (e) { console.log('rating not stored'); }
  console.log(`feedback sent: source=${f.source} rating=${f.rating ?? '-'} chars=${f.message.length}`);
  return json(200, { ok: true }, cors);
}

// --- newsletter ---------------------------------------------------------------------------
async function kit(env, path, payload) {
  return fetch(`https://api.kit.com/v4${path}`, {
    method: 'POST',
    headers: { 'X-Kit-Api-Key': env.KIT_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function handleSubscribe(request, env, cors) {
  const { body, error } = await readBody(request);
  if (error) return fail(error === 'too_large' ? 413 : 400, error, cors);
  if (body.website) return json(200, { ok: true }, cors);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!isEmail(email)) return fail(400, 'invalid_email', cors);
  const source = body.source ?? 'website';
  if (source !== 'game' && source !== 'website') return fail(400, 'invalid_source', cors);
  if (!env.KIT_API_KEY) { console.log('subscribe: KIT_API_KEY missing'); return fail(500, 'misconfigured', cors); }
  try {
    // creating an existing subscriber just returns them, so a repeat signup is fine
    const r = await kit(env, '/subscribers', { email_address: email, state: 'active' });
    if (r.status === 422) return fail(400, 'invalid_email', cors);
    if (!r.ok) { console.log(`kit subscribe failed: ${r.status}`); return fail(502, 'subscribe_failed', cors); }
    const tag = source === 'game' ? env.KIT_TAG_GAME : env.KIT_TAG_WEBSITE;
    if (tag) {
      const t = await kit(env, `/tags/${encodeURIComponent(tag)}/subscribers`, { email_address: email });
      if (!t.ok) console.log(`kit tag failed: ${t.status}`); // (still subscribed: only the label is missing)
    }
  } catch (e) { console.log('kit unreachable'); return fail(502, 'subscribe_failed', cors); }
  console.log(`subscribed: source=${source}`);
  return json(200, { ok: true }, cors);
}

// --- ratings ------------------------------------------------------------------------------
async function handleRatings(env) {
  const headers = { ...corsHeaders(null, true), 'Cache-Control': `public, max-age=${RATINGS_MAX_AGE}` };
  if (!env.DB) return fail(500, 'misconfigured', headers);
  // only ratings given in the game count: website visitors may not have played
  const { results } = await env.DB.prepare(
    `SELECT rating, COUNT(*) AS n FROM ratings WHERE source = 'game' GROUP BY rating`,
  ).all();
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let count = 0, sum = 0;
  for (const row of results || []) {
    if (!(row.rating in distribution)) continue;
    distribution[row.rating] = row.n; count += row.n; sum += row.rating * row.n;
  }
  const average = count ? Math.round(sum / count * 10) / 10 : null;
  return json(200, { ok: true, average, count, distribution }, headers);
}

// --- shared farms (decision 0047) --------------------------------------------------------------
// A farm is stored as KV key farm:<id>, the share file exactly as the game sent it, with its map,
// save version and a hash of the sharer's delete key as metadata. The Worker can't run the game,
// so it checks only the size, the gzip header and the map; the game validates a farm on opening.
function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map(b => ID_LETTERS[b % ID_LETTERS.length]).join('');
}
async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function handleShare(request, env, cors, url) {
  if (!env.FARMS) { console.log('share: FARMS namespace missing'); return fail(500, 'misconfigured', cors); }
  const map = url.searchParams.get('map'), v = url.searchParams.get('v');
  if (!MAPS.includes(map)) return fail(400, 'invalid_map', cors);
  if (Number(request.headers.get('Content-Length')) > MAX_FARM) return fail(413, 'too_large', cors);
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length > MAX_FARM) return fail(413, 'too_large', cors);
  if (body.length < 18 || body[0] !== 0x1f || body[1] !== 0x8b) return fail(400, 'invalid_farm', cors);
  // the day's count across everyone: a script can't fill the free tier (approximate, which is fine)
  const day = new Date().toISOString().slice(0, 10), countKey = `count:${day}`;
  const shared = Number(await env.FARMS.get(countKey)) || 0;
  if (shared >= SHARES_PER_DAY) { console.log('share: daily cap reached'); return fail(503, 'sharing_paused', cors); }
  let id = randomId();
  if (await env.FARMS.get(`farm:${id}`, { type: 'stream' })) id = randomId(); // (50 bits: a repeat is all but impossible)
  const deleteKey = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
  const created = new Date(), expires = new Date(created.getTime() + FARM_TTL * 1000).toISOString().slice(0, 10);
  await env.FARMS.put(`farm:${id}`, body, { expirationTtl: FARM_TTL,
    metadata: { map, v: /^\d{1,3}$/.test(v || '') ? +v : null, size: body.length, created: created.toISOString(), delHash: await sha256(deleteKey) } });
  await env.FARMS.put(countKey, String(shared + 1), { expirationTtl: 2 * 86400 });
  console.log(`farm shared: map=${map} bytes=${body.length}`);
  const base = env.SHARE_BASE || 'https://secondgrowth.earth/play/';
  return json(201, { ok: true, id, url: `${base}?farm=${id}`, deleteKey, expires }, cors);
}

async function handleFarmGet(env, id) {
  const headers = corsHeaders(null, true);
  if (!env.FARMS) return fail(500, 'misconfigured', headers);
  const { value, metadata } = await env.FARMS.getWithMetadata(`farm:${id}`, { type: 'arrayBuffer' });
  if (!value) return fail(404, 'not_found', headers);
  return new Response(value, { headers: { ...headers, 'Content-Type': 'application/octet-stream',
    'X-Farm-Map': metadata?.map || '', 'X-Farm-Version': String(metadata?.v ?? ''),
    'Access-Control-Expose-Headers': 'X-Farm-Map, X-Farm-Version',
    'Cache-Control': 'public, max-age=86400, immutable' } });
}

async function handleFarmDelete(request, env, cors, id) {
  if (!env.FARMS) return fail(500, 'misconfigured', cors);
  const { metadata } = await env.FARMS.getWithMetadata(`farm:${id}`, { type: 'stream' });
  if (!metadata) return fail(404, 'not_found', cors);
  const key = request.headers.get('X-Delete-Key') || '';
  if (!key || await sha256(key) !== metadata.delHash) return fail(403, 'wrong_key', cors);
  await env.FARMS.delete(`farm:${id}`);
  console.log('farm removed by its sharer');
  return json(200, { ok: true }, cors);
}

async function handleFarmReport(request, env, cors, id) {
  const { body, error } = await readBody(request);
  if (error) return fail(error === 'too_large' ? 413 : 400, error, cors);
  if (!env.RESEND_API_KEY) return fail(500, 'misconfigured', cors);
  const reason = typeof body.reason === 'string' ? oneLine(body.reason, 200) : '';
  const meta = env.FARMS ? (await env.FARMS.getWithMetadata(`farm:${id}`, { type: 'stream' })).metadata : null;
  if (!meta) return fail(404, 'not_found', cors);
  const email = {
    from: env.FEEDBACK_FROM || 'Second Growth feedback <feedback@secondgrowth.earth>',
    to: [env.FEEDBACK_TO || 'info@secondgrowth.earth'],
    subject: `Shared farm reported: ${id} (${meta.map})`,
    text: [`A player reported the shared farm ${id} (${meta.map}, shared ${meta.created?.slice(0, 10)}).`, `Reason: ${reason || 'none given'}`, '',
      `Look at it: ${(env.SHARE_BASE || 'https://secondgrowth.earth/play/')}?farm=${id}`,
      `Remove it (from the server folder): npx wrangler@4 kv key delete --binding=FARMS --remote "farm:${id}"`].join('\n'),
  };
  let sent = false;
  try { sent = await sendEmail(env, email); } catch (e) { console.log('resend unreachable'); }
  if (!sent) return fail(502, 'send_failed', cors);
  console.log('farm reported');
  return json(200, { ok: true }, cors);
}

// --- routing ------------------------------------------------------------------------------
export async function handle(request, env) {
  const url = new URL(request.url), origin = request.headers.get('Origin');
  const route = url.pathname.replace(/\/+$/, '') || '/';
  const isPost = route === '/feedback' || route === '/subscribe';
  const cors = corsHeaders(origin);
  const farm = route.match(/^\/farms(?:\/([^/]+))?(\/report)?$/);
  if (farm) return handleFarms(request, env, cors, url, farm[1], !!farm[2]);

  if (request.method === 'OPTIONS') {
    if (route === '/ratings') return new Response(null, { status: 204, headers: { ...corsHeaders(null, true), 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Max-Age': '86400' } });
    if (!isPost) return fail(404, 'not_found');
    if (!cors['Access-Control-Allow-Origin']) return fail(403, 'origin_not_allowed');
    return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
  }
  if (route === '/ratings') return request.method === 'GET' || request.method === 'HEAD' ? handleRatings(env) : fail(405, 'method_not_allowed', corsHeaders(null, true));
  if (route === '/') return new Response('Second Growth API. See docs/backend-setup.md.\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  if (!isPost) return fail(404, 'not_found');
  if (request.method !== 'POST') return fail(405, 'method_not_allowed', cors);
  // browsers always send Origin on these; a missing or foreign one is a script or another site
  if (!cors['Access-Control-Allow-Origin']) return fail(403, 'origin_not_allowed');
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!await allowed(env, `${route}:${ip}`)) return fail(429, 'rate_limited', { ...cors, 'Retry-After': '60' });
  return route === '/feedback' ? handleFeedback(request, env, cors) : handleSubscribe(request, env, cors);
}

// /farms (POST: share), /farms/<id> (GET: open, DELETE: stop sharing), /farms/<id>/report (POST)
async function handleFarms(request, env, cors, url, id, report) {
  const m = request.method;
  if (id && !ID_RE.test(id)) return fail(404, 'not_found', id && m === 'GET' ? corsHeaders(null, true) : cors);
  const methods = !id ? ['POST'] : report ? ['POST'] : ['GET', 'DELETE'];
  if (m === 'OPTIONS') {
    if (id && !report && !cors['Access-Control-Allow-Origin']) return new Response(null, { status: 204, headers: { ...corsHeaders(null, true), 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
    if (!cors['Access-Control-Allow-Origin']) return fail(403, 'origin_not_allowed');
    return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': `${methods.join(', ')}, OPTIONS`, 'Access-Control-Allow-Headers': 'Content-Type, X-Delete-Key', 'Access-Control-Max-Age': '86400' } });
  }
  // opening a shared farm is open to everyone, like /ratings (the link is the key)
  if (m === 'GET' && id && !report) return handleFarmGet(env, id);
  if (!methods.includes(m)) return fail(405, 'method_not_allowed', cors);
  if (!cors['Access-Control-Allow-Origin']) return fail(403, 'origin_not_allowed');
  if (m === 'DELETE') return handleFarmDelete(request, env, cors, id);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!await allowed(env, `/farms${report ? '/report' : ''}:${ip}`)) return fail(429, 'rate_limited', { ...cors, 'Retry-After': '60' });
  return report ? handleFarmReport(request, env, cors, id) : handleShare(request, env, cors, url);
}

export default {
  async fetch(request, env) {
    try { return await handle(request, env); }
    catch (e) { console.log(`unhandled: ${e?.name || 'error'}`); return fail(500, 'server_error'); }
  },
};
