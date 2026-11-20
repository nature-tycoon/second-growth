// Tell Bing (and the other IndexNow engines: Yandex, Seznam, Naver) which pages changed in a deploy,
// so new field-guide pages are crawled within hours instead of weeks. The key is public by design:
// website/<key>.txt proves the site owns it.
//   node tools/indexnow.mjs <old-sitemap.xml> <new-sitemap.xml> [--dry-run]
// Pages are "changed" when they are new or their <lastmod> moved; an old sitemap that's missing or
// empty sends every page. pages.yml runs it after each deploy and never fails the deploy on it.
import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const HOST = 'secondgrowth.earth';

export function sitemapEntries(xml) {
  return new Map([...String(xml).matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?<\/url>/g)].map(([, loc, mod]) => [loc, mod || '']));
}
export function changedUrls(oldXml, newXml) {
  const before = sitemapEntries(oldXml), after = sitemapEntries(newXml);
  return [...after].filter(([loc, mod]) => !before.has(loc) || before.get(loc) !== mod).map(([loc]) => loc);
}

async function main([oldPath, newPath, ...flags]) {
  const key = (await readdir(new URL('../website/', import.meta.url))).find(f => /^[0-9a-f]{32}\.txt$/.test(f))?.slice(0, -4);
  if (!key) throw Error('No IndexNow key file (website/<32 hex>.txt)');
  const oldXml = await readFile(oldPath, 'utf8').catch(() => '');
  const urls = changedUrls(oldXml, await readFile(newPath, 'utf8')).slice(0, 10000);
  if (!urls.length) return console.log('IndexNow: no changed pages');
  if (flags.includes('--dry-run')) return console.log(`IndexNow (dry run): ${urls.length} pages, e.g. ${urls.slice(0, 3).join(' ')}`);
  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${key}.txt`, urlList: urls }),
  });
  console.log(`IndexNow: sent ${urls.length} pages, HTTP ${response.status}`);
  if (response.status >= 400) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
