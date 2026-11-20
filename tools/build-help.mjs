// Help pages (/help/<topic>/): answers to the questions players type into search engines, in the
// field guide's layout. Every claim names what the game does; keep them in step with the code cited.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mapCatalog } from '../js/biome.js';
import { monthSpan } from './field-guide-data.mjs';
import { page } from './build-field-guide.mjs';

const ORIGIN = 'https://secondgrowth.earth';
// A season that may run over the new year (game months start in March): November to March, not
// "March, November, December, January and February".
const MONTH = ['March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February'];
function season(months) {
  const set = new Set(months), start = [...set].find(m => !set.has((m + 11) % 12));
  if (start == null || set.size === 12) return monthSpan(months);
  let end = start; while (set.has((end + 1) % 12) && (end + 1) % 12 !== start) end = (end + 1) % 12;
  const run = (end - start + 12) % 12 + 1;
  return run !== set.size ? monthSpan(months) : run === 1 ? MONTH[start] : `${MONTH[start]} to ${MONTH[end]}`;
}
const esc = text => String(text ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Flooding: js/sim/events.js (startFlood, reachFrom, sponge, floodRisk), js/ui/ui.js (the Flood risk
// overlay's legend, "Flooded for another N days"), js/tools.js (Demolish pulls a beaver dam apart).
function flooding(landscapes) {
  const seasons = Object.entries(landscapes).map(([id, name]) => {
    const months = mapCatalog(id).definition.climate.floodMonths;
    return `<li><strong>${esc(name)}</strong>: ${months.length ? esc(season(months)) : 'no river floods'}</li>`;
  }).join('');
  const question = 'Why is my farm flooded in Second Growth?';
  const answer = 'Most standing water on your land is one of three things: a river flood, which drains by itself in 4 to 12 days; a beaver pond, which stays while beavers keep the dam; or a pond or marsh you dug. Marshes, ponds and beaver dams soak up floodwater and shrink later floods.';
  const top = {
    backdrop: `    <div class="g-backdrop blur"><img src="../../review-media/landscape-pnw.jpg" alt="" width="1800" height="1200" fetchpriority="high"></div>`,
    content: `    <div class="gi-hero wrap help-hero">
      <div class="gi-copy">
        <p class="eyebrow">Second Growth help</p>
        <h1>My farm is flooded.</h1>
        <p>${esc(answer)}</p>
      </div>
    </div>`,
  };
  const body = `    <article class="help">
      <section>
        <h2>1. A river flood: it drains by itself</h2>
        <p>After several days of rain in the rainy season, the river and the creeks joined to it can spill over low ground. A banner says how many tiles are underwater, and its <strong>Show me</strong> button opens the <strong>Flood risk</strong> overlay. Select a flooded tile to see how many days it has left: a flood lasts 4 to 12 days, then the water goes back. Trails through it close until then.</p>
        <p>Floods reach farthest on the river's floodplain (up to 9 tiles out) and only a few tiles from creeks. Two floods are always at least 45 days apart.</p>
      </section>
      <section>
        <h2>2. It keeps flooding the same place</h2>
        <p>Open the <strong>Flood risk</strong> overlay. Bright blue is underwater now, mid blue floods most rainy seasons, and pale blue floods only in a big one. Keep buildings and anything you can't lose out of the mid-blue zone. Plant it with species that like wet ground instead: the field guide lists what grows in "wet ground or water" on each landscape.</p>
        <p>Rainy months, when floods can come:</p>
        <ul class="help-list">${seasons}</ul>
      </section>
      <section>
        <h2>3. Make floods smaller with wetlands</h2>
        <p>Every marsh and pond on the farm, and every beaver dam, soaks up part of a flood, up to about 60% once there are plenty. After a flood the game says how much your wetlands took. Digging marshes on low ground near the river, and leaving beavers to build, shrinks the blue zones on the overlay.</p>
      </section>
      <section>
        <h2>4. It's a beaver pond: that's a good sign</h2>
        <p>Beavers dam creeks, and the water backs up into a pond with a ring of marsh around it, up to about 4 tiles out. It stays as long as beavers keep the dam, and it's some of the best habitat on the farm for fish, frogs, waterbirds and the animals that hunt them. If you need that ground back, <strong>Demolish</strong> pulls the dam apart: the pond drains and the creek runs through again. Beavers living nearby may build another.</p>
      </section>
      <section>
        <h2>5. It's a pond or marsh you dug</h2>
        <p>Use <strong>Fill &amp; grade</strong> over it to turn it back into dry land. It levels each stroke to one height, so start the stroke on the dry ground beside the water.</p>
      </section>
      <p class="help-play"><a class="button" href="../../play/">Play Second Growth <span aria-hidden="true">↗</span></a> <a class="more-all" href="../../guide/">Browse the field guide <span aria-hidden="true">→</span></a></p>
    </article>`;
  const description = answer.slice(0, 300);
  return page({
    title: 'Farm flooded in Second Growth? Why it happens and what to do', description, path: '/help/flooding/', depth: 2, land: 'pnw', top, body, type: 'article',
    schema: { '@context': 'https://schema.org', '@type': 'FAQPage', url: `${ORIGIN}/help/flooding/`, name: 'Flooding in Second Growth',
      isPartOf: { '@type': 'WebSite', name: 'Second Growth', url: ORIGIN + '/' },
      mainEntity: [{ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } }] },
  });
}

export const helpPaths = ['/help/flooding/'];
export async function buildHelp(output, landscapes) {
  await mkdir(join(output, 'help/flooding'), { recursive: true });
  await writeFile(join(output, 'help/flooding/index.html'), flooding(landscapes));
}
