// The game's link to the Cloudflare Worker in server/ (feedback email, newsletter signup).
// Contract: docs/backend-setup.md, Part 2. Everything here does nothing while BACKEND_URL is empty.

// Cole's Worker address (no trailing slash), once it is deployed. When you set it, also add it to
// connect-src in index.html's Content-Security-Policy.
export const BACKEND_URL = '';

export const backendOn = () => !!BACKEND_URL;

// An anonymous id made once and kept, so a player's later rating replaces their earlier one.
export function playerId() {
  try {
    let id = localStorage.getItem('sg-player');
    if (!id) { id = 'p_' + Math.random().toString(36).slice(2, 12).padEnd(10, '0'); localStorage.setItem('sg-player', id); }
    return id;
  } catch { return undefined; }
}

// Posts JSON; resolves to { ok, error } (error is the contract's code, or 'network').
export async function postBackend(path, body) {
  if (!BACKEND_URL) return { ok: false, error: 'misconfigured' };
  try {
    const r = await fetch(BACKEND_URL + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, website: '' }) });
    const j = await r.json().catch(() => ({}));
    return r.ok && j.ok ? { ok: true } : { ok: false, error: j.error || 'server_error' };
  } catch { return { ok: false, error: 'network' }; }
}
