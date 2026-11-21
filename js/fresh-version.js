// Fresh version on launch (and a nudge mid-game). GitHub Pages lets browsers keep every file for
// 10 minutes and the game's ~230 modules have no version in their URLs, so an installed app or an
// open tab could run an old copy, or a mix of old and new files. The deploy (tools/stamp-release.sh)
// writes version.json ({ release, files }) beside index.html; here it is fetched with
// cache: 'no-store' and compared with this copy's RELEASE. A local copy is 'dev' and never updates.
import { RELEASE } from './release.js';

const TRIED = 'second-growth-fresh-tried';

export const isNewer = (current, remote) => !!remote?.release && current !== 'dev' && remote.release !== current;

export async function latestVersion(fetchFn = fetch, base = location.href, timeoutMs = 4000) {
  try {
    const r = await fetchFn(new URL('version.json', base), { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    const v = await r.json();
    return typeof v?.release === 'string' ? v : null;
  } catch { return null; }
}

// Make the browser's cache hold the new files, then reload. (A plain reload only revalidates the
// page itself, so the modules would still come from the 10-minute cache.)
export async function refreshCache(version, fetchFn = fetch, base = location.href) {
  const urls = ['./', 'styles.css', ...(version.files || [])];
  await Promise.all(urls.map(u => fetchFn(new URL(u, base), { cache: 'reload' }).catch(() => {})));
}

// At launch, before play: true when the page is reloading into a newer version.
export async function reloadIfStale(current = RELEASE) {
  if (current === 'dev') return false;
  const v = await latestVersion();
  if (!isNewer(current, v)) return false;
  try { if (sessionStorage.getItem(TRIED) === v.release) return false; sessionStorage.setItem(TRIED, v.release); } catch { return false; }
  await refreshCache(v);
  location.reload();
  return true;
}

// Mid-game: every so often (and when the tab comes back), look again. A newer version saves the
// farm and offers a reload; nothing is ever reloaded under the player.
export function watchForNewVersion(game, { current = RELEASE, every = 10 * 60 * 1000 } = {}) {
  if (current === 'dev') return () => {};
  let offered = null, busy = false;
  const check = async () => {
    if (busy || document.hidden) return;
    busy = true;
    try {
      const v = await latestVersion();
      if (!isNewer(current, v) || offered === v.release) return;
      offered = v.release;
      if (game.saveReady && game.autosave !== false) void game.save();
      game.emit('notify', {
        text: 'A new version of Second Growth is ready. Your farm is saved.', kind: 'info', loc: null, date: game.dateString(),
        action: { label: 'Reload', run: async () => { if (game.saveReady) await game.save(); await refreshCache(v); location.reload(); } },
      });
    } finally { busy = false; }
  };
  const timer = setInterval(check, every);
  const onShow = () => { if (!document.hidden) check(); };
  document.addEventListener('visibilitychange', onShow);
  return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onShow); };
}
