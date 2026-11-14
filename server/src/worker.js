// Second Growth's one small backend: player feedback by email (Resend), newsletter signups (Kit)
// and the average in-game rating. The contract and setup steps are in docs/backend-setup.md;
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

// --- routing ------------------------------------------------------------------------------
export async function handle(request, env) {
  const url = new URL(request.url), origin = request.headers.get('Origin');
  const route = url.pathname.replace(/\/+$/, '') || '/';
  const isPost = route === '/feedback' || route === '/subscribe';
  const cors = corsHeaders(origin);

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

export default {
  async fetch(request, env) {
    try { return await handle(request, env); }
    catch (e) { console.log(`unhandled: ${e?.name || 'error'}`); return fail(500, 'server_error'); }
  },
};
