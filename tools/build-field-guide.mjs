// The website's Living Field Guide: /guide/ (every species, by landscape, with a search) and
// /guide/<species>/ (one page each), generated at build time from the game's data
// (tools/field-guide-data.mjs) and the portraits in website/guide-media/.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fieldGuide } from './field-guide-data.mjs';

const ORIGIN = 'https://secondgrowth.earth';
const esc = text => String(text ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// The homepage's policy, plus audio for the recordings (the game's own files under play/).
export const GUIDE_CSP = "default-src 'none'; base-uri 'none'; object-src 'none'; script-src 'self' https://www.googletagmanager.com; script-src-attr 'none'; style-src 'self' https://fonts.googleapis.com; img-src 'self' https://*.google-analytics.com https://*.googletagmanager.com; media-src 'self'; font-src 'self' https://fonts.gstatic.com; connect-src https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com; form-action 'none'; frame-src https://www.googletagmanager.com; worker-src 'none'";

const weight = kg => kg >= 1000 ? `about ${+(kg / 1000).toFixed(1)} tonnes` : kg >= 1 ? `about ${+kg.toFixed(kg < 10 ? 1 : 0)} kg` : `about ${Math.round(kg * 1000)} g`;
const years = n => n >= 1.5 ? `about ${Math.round(n)} years` : n >= 0.9 ? 'about a year' : `about ${Math.round(n * 12)} months`;
const list = items => items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items.at(-1);
const STATUS = { native: 'Native', invasive: 'Invasive', introduced: 'Introduced' };

// Each landscape's still from the homepage (real game captures, website/review-media/content-provenance.json).
const still = id => `review-media/landscape-${id}.jpg`;
const ICONS = {
  call: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/></svg>',
  night: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  invasive: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20L12 3zm1 14h-2v-2h2v2zm0-4h-2V9h2v4z"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4a6 6 0 1 0 3.7 10.7l4.8 4.8 1.4-1.4-4.8-4.8A6 6 0 0 0 10 4zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8z"/></svg>',
};
const badges = e => [
  e.status === 'invasive' && `<span class="badge invasive">${ICONS.invasive}Invasive</span>`,
  e.status === 'introduced' && '<span class="badge">Introduced</span>',
  e.recording && `<span class="badge call" title="Has a recorded call">${ICONS.call}<span class="visually-hidden">Recorded call</span></span>`,
  e.nocturnal && `<span class="badge night" title="Active at night">${ICONS.night}<span class="visually-hidden">Active at night</span></span>`,
].filter(Boolean).join('');
// A species card: the portrait on a stage tinted for its landscape, used by the index and "more from".
const card = (e, portrait, up, land) => `<li data-slug="${esc(e.slug)}" data-kind="${e.kind}" data-search="${esc((e.name + ' ' + (e.sci || '') + ' ' + e.group).toLowerCase())}"><a class="card" data-land="${esc(land)}" href="${up}${e.slug}/"><span class="card-stage"><img src="${up}../guide-media/${esc(portrait.card.file)}" alt="" width="${portrait.card.width}" height="${portrait.card.height}" loading="lazy" decoding="async"></span><span class="card-text"><strong>${esc(e.name)}</strong>${e.sci ? `<em>${esc(e.sci)}</em>` : ''}<span class="badges">${badges(e)}</span></span></a></li>`;

function page({ title, description, path, depth, land, top, body, schema, image, script }) {
  const up = '../'.repeat(depth);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${GUIDE_CSP}">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="theme-color" content="#102e26">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${ORIGIN}${path}">
  <link rel="icon" href="${up}favicon.svg" type="image/svg+xml">
  <link rel="describedby" href="${up}llms.txt" type="text/plain">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Second Growth">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${ORIGIN}${path}">
  <meta property="og:image" content="${ORIGIN}/${image || 'share.jpg'}">
  <meta name="twitter:card" content="${image ? 'summary' : 'summary_large_image'}">
  <script src="${up}gtm.js" async></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Instrument+Sans:ital,wght@0,400..700;1,400..700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${up}site.css?v=bloom-20261113">
  <link rel="stylesheet" href="${up}guide.css?v=bloom-20261113">
  <script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>${script ? `\n  <script src="${up}guide.js?v=bloom-20261113" defer></script>` : ''}
</head>
<body class="guide">
  <a class="skip" href="#main">Skip to content</a>
  <div class="g-top" data-land="${esc(land || '')}">
${top.backdrop}
    <div class="g-shade" aria-hidden="true"></div>
    <header class="header wrap"><a class="brand" href="${up}">Second Growth</a><nav class="site-nav" aria-label="Main navigation"><a href="${up}guide/" aria-current="${depth === 1 ? 'page' : 'false'}">Field guide</a><a href="${up}#places">Landscapes</a><a href="${up}#ecology">Ecology</a></nav><a class="button small" href="${up}play/">Play <span aria-hidden="true">↗</span></a></header>
${top.content}
  </div>
  <main id="main" class="wrap">
${body}
  </main>
  <footer class="footer wrap"><a class="brand" href="${up}">Second Growth</a><nav aria-label="Footer"><a href="${up}guide/">Field guide</a><a href="${up}#about">Project &amp; credits</a><a href="${up}visuals.html">Game imagery</a></nav><span>Free browser game · In development</span><small class="copyright">© 2026 Second Growth</small></footer>
</body>
</html>
`;
}

function speciesPage(e, landscapes, portraits, guide) {
  const portrait = portraits[e.slug];
  const where = e.maps.map(m => landscapes[m.id] || m.region);
  const home = e.maps[0], homeName = landscapes[home.id] || home.region;
  const animal = e.kind === 'animal';
  const lead = animal
    ? `${e.name} is one of the animals that can come back in Second Growth's ${list(where)} landscape${where.length > 1 ? 's' : ''}, when the habitat suits it.`
    : e.status === 'invasive' ? `${e.name} is an invasive plant in Second Growth's ${list(where)} landscape${where.length > 1 ? 's' : ''}: part of restoring the land is clearing it.`
    : e.status === 'introduced' ? `${e.name} is an introduced plant in Second Growth's ${list(where)} landscape${where.length > 1 ? 's' : ''}.`
    : `${e.name} is one of the native plants you can grow in Second Growth's ${list(where)} landscape${where.length > 1 ? 's' : ''}.`;
  const facts = animal ? [
    e.kg && ['Size', weight(e.kg)],
    e.life && ['Lives', years(e.life), 'in the game'],
    e.young && ['Young born', e.young],
    e.nocturnal && ['Active', 'At night'],
  ] : [
    e.heightM && ['Height', `Up to ${e.heightM} m`],
    ['Grows in', e.grows[0].toUpperCase() + e.grows.slice(1)],
    ['Layer', e.group + (e.aquatic ? ', aquatic' : '')],
    e.nitrogen && ['Soil', 'Fixes nitrogen'],
  ];
  const description = `${e.name}${e.sci ? ` (${e.sci})` : ''} in Second Growth: ${e.desc}`.slice(0, 300);
  const rec = e.recording;
  // More from its first landscape: the same kind first, then its own group, starting after it
  // alphabetically so neighbouring pages suggest different species.
  const pool = guide.filter(o => o !== e && o.maps.some(m => m.id === home.id));
  const after = o => o.name.localeCompare(e.name) > 0 ? 0 : 1;
  const rank = o => (o.kind === e.kind ? 0 : 4) + (o.group === e.group ? 0 : 2) + after(o);
  const related = pool.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).slice(0, 8);
  const top = {
    backdrop: `    <div class="g-backdrop blur"><img src="../../${still(home.id)}" alt="" width="1800" height="1200" fetchpriority="high"></div>`,
    content: `    <div class="sp-hero wrap">
      <div class="sp-title">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="../">Field guide</a><span aria-hidden="true">›</span><a href="../#${esc(home.id)}">${esc(homeName)}</a><span aria-hidden="true">›</span><span>${esc(animal ? e.group : 'Plants')}</span></nav>
        <p class="sp-chips"><span class="chip-tag" data-land="${esc(home.id)}">${esc(homeName)}</span><span class="chip-tag">${esc(e.group)}</span>${e.status === 'invasive' ? `<span class="chip-tag invasive">${ICONS.invasive}Invasive</span>` : e.status === 'introduced' ? '<span class="chip-tag">Introduced</span>' : ''}${e.nocturnal ? `<span class="chip-tag">${ICONS.night}Nocturnal</span>` : ''}</p>
        <h1>${esc(e.name)}</h1>
        ${e.sci ? `<p class="sci">${esc(e.sci)}</p>` : ''}
        <p class="sp-desc">${esc(e.desc)}</p>
        <p class="sp-actions"><a class="button" href="../../play/?map=${esc(home.id)}">Find it in ${esc(homeName)} <span aria-hidden="true">↗</span></a>${rec ? `<a class="sp-listen" href="#call">${ICONS.call}Hear its call</a>` : ''}</p>
      </div>
      <figure class="sp-portrait${e.status === 'invasive' ? ' invasive' : ''}" data-land="${esc(home.id)}"><img src="../../guide-media/${esc(portrait.file)}" alt="${esc(e.name)} as drawn in Second Growth${portrait.look === 'male' ? ' (adult male)' : ''}." width="${portrait.width}" height="${portrait.height}"><figcaption>The game's own model${portrait.look === 'male' ? ' · adult male' : ''}</figcaption></figure>
    </div>`,
  };
  const body = `    <dl class="sp-stats">${facts.filter(Boolean).map(([k, v, note]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}${note ? ` <small>${esc(note)}</small>` : ''}</dd></div>`).join('')}</dl>
    <div class="sp-about${rec ? '' : ' solo'}">
      <p class="sp-lead">${esc(lead)}</p>
      ${rec ? `<div class="call-player" id="call"><p class="eyebrow">Its call, as heard in the game</p><audio controls preload="none" src="../../play/assets/sounds/${esc(rec.clip)}.m4a"></audio><p class="credit">Recording by ${esc(rec.by)}, <a href="${esc(rec.licenseUrl)}" rel="license noopener" target="_blank">${esc(rec.license)}</a> · <a href="${esc(rec.source)}" rel="noopener" target="_blank">source</a></p></div>` : ''}
    </div>
    <section class="sp-where" aria-labelledby="where-title">
      <h2 id="where-title">Where to find it in the game</h2>
      <ul class="where-cards">${e.maps.map(m => { const name = landscapes[m.id] || m.region; return `<li data-land="${esc(m.id)}"><img src="../../${still(m.id)}" alt="" width="1800" height="1200" loading="lazy" decoding="async"><div class="where-text"><p class="eyebrow">${esc(m.farm)} · ${esc(m.region)}</p><h3>${esc(name)}</h3>${m.hint ? `<p class="where-hint"><span>${animal ? 'What it needs' : 'Where it grows'}</span>${esc(m.hint)}</p>` : ''}<a class="map-play" href="../../play/?map=${esc(m.id)}">Play ${esc(name)} <span aria-hidden="true">↗</span></a></div></li>`; }).join('')}</ul>
    </section>
    <section class="sp-more" aria-labelledby="more-title">
      <div class="more-head"><h2 id="more-title">More from ${esc(homeName)}</h2><a class="more-all" href="../#${esc(home.id)}">All ${pool.length + 1} species <span aria-hidden="true">→</span></a></div>
      <ul class="guide-cards">${related.map(o => card(o, portraits[o.slug], '../', home.id)).join('')}</ul>
    </section>
    <aside class="model-note guide-note"><span class="eyebrow">About the game</span><p>Second Growth simplifies how species live and speeds up time. Sizes are real-world figures; lifespans and seasons are the game's. For real-world identification and status, check a regional field guide.</p></aside>`;
  return page({
    title: `${e.name}${e.sci ? ` (${e.sci})` : ''} · Second Growth field guide`, description, path: `/guide/${e.slug}/`, depth: 2, land: home.id, top, body,
    image: `guide-media/${portrait.file}`, script: !!rec,
    schema: { '@context': 'https://schema.org', '@type': 'WebPage', name: `${e.name} in Second Growth`, url: `${ORIGIN}/guide/${e.slug}/`, description,
      isPartOf: { '@type': 'WebSite', name: 'Second Growth', url: ORIGIN + '/' },
      about: { '@type': 'Taxon', name: e.name, ...(e.sci ? { alternateName: e.sci } : {}) },
      primaryImageOfPage: { '@type': 'ImageObject', url: `${ORIGIN}/guide-media/${portrait.file}`, width: portrait.width, height: portrait.height } },
  });
}

function indexPage(guide, landscapes, portraits) {
  const ids = Object.keys(landscapes);
  const here = id => guide.filter(e => e.maps.some(m => m.id === id));
  const sections = ids.map(id => {
    const name = landscapes[id], all = here(id);
    const animals = all.filter(e => e.kind === 'animal'), plants = all.filter(e => e.kind === 'plant');
    const place = all[0]?.maps.find(m => m.id === id);
    return `    <section class="guide-map" id="${esc(id)}" data-land="${esc(id)}" aria-labelledby="${esc(id)}-title">
      <div class="land-banner"><img src="../${still(id)}" alt="" width="1800" height="1200" loading="lazy" decoding="async"><div class="land-text"><p class="eyebrow">${esc(place ? `${place.farm} · ${place.region}` : '')}</p><h2 id="${esc(id)}-title">${esc(name)}</h2><p class="land-count">${animals.length} animals · ${plants.length} plants</p></div><a class="map-play" href="../play/?map=${esc(id)}">Play ${esc(name)} <span aria-hidden="true">↗</span></a></div>
      <div class="kind-group" data-kind="animal"><h3>Animals <small>${animals.length}</small></h3><ul class="guide-cards">${animals.map(e => card(e, portraits[e.slug], '', id)).join('')}</ul></div>
      <div class="kind-group" data-kind="plant"><h3>Plants <small>${plants.length}</small></h3><ul class="guide-cards">${plants.map(e => card(e, portraits[e.slug], '', id)).join('')}</ul></div>
    </section>`;
  }).join('\n');
  const animals = guide.filter(e => e.kind === 'animal').length, plants = guide.length - animals;
  const calls = guide.filter(e => e.recording).length;
  const description = `Every animal and plant in Second Growth: ${animals} animals and ${plants} plants across seven landscapes, from Roosevelt elk to coral, with what each needs to come back.`;
  // A few faces from different landscapes along the bottom of the hero.
  const parade = ['roosevelt-elk', 'african-elephant', 'sumatran-orangutan', 'reef-manta-ray', 'monarch-butterfly', 'olive-ridley-sea-turtle', 'jaguar']
    .filter(slug => portraits[slug]).slice(0, 5);
  const top = {
    backdrop: `    <div class="g-backdrop"><picture><source media="(max-width: 720px) and (orientation: portrait)" srcset="../review-media/header-mobile.jpg"><img src="../review-media/header-desktop.jpg" alt="" width="2400" height="1200" fetchpriority="high"></picture></div>`,
    content: `    <div class="gi-hero wrap">
      <div class="gi-copy">
        <p class="eyebrow">The Second Growth field guide</p>
        <h1>Every species<br> in the game.</h1>
        <p>Meet the ${animals} animals and ${plants} plants of seven landscapes, each shown as the game draws it, with what it needs to come back.</p>
        <dl class="gi-stats"><div><dt>Animals</dt><dd>${animals}</dd></div><div><dt>Plants</dt><dd>${plants}</dd></div><div><dt>Landscapes</dt><dd>${ids.length}</dd></div><div><dt>Real calls</dt><dd>${calls}</dd></div></dl>
      </div>
      <ul class="gi-parade" aria-hidden="true">${parade.map(slug => `<li><img src="../guide-media/${esc(portraits[slug].card.file)}" alt="" width="480" height="360"></li>`).join('')}</ul>
    </div>`,
  };
  const body = `    <div class="guide-tools">
      <div class="tools-row"><label class="guide-search">${ICONS.search}<span class="visually-hidden">Search the guide</span><input type="search" placeholder="Search elk, oak, Ficus…" autocomplete="off"></label><div class="kind-toggle" role="group" aria-label="Show" hidden><button type="button" aria-pressed="true" data-kind="all">All</button><button type="button" aria-pressed="false" data-kind="animal">Animals</button><button type="button" aria-pressed="false" data-kind="plant">Plants</button></div><p class="guide-count" aria-live="polite">${guide.length} species</p></div>
      <nav class="land-chips" aria-label="Landscapes"><a href="#" class="chip" data-land="all" aria-current="true">All landscapes</a>${ids.map(id => `<a href="#${esc(id)}" class="chip" data-land="${esc(id)}"><i aria-hidden="true"></i>${esc(landscapes[id])} <small>${here(id).length}</small></a>`).join('')}</nav>
    </div>
    <p class="guide-empty" hidden>Nothing in the guide matches that. Try a common name, a Latin name or a group like “birds”.</p>
${sections}`;
  return page({ title: 'Field guide: every animal and plant in Second Growth', description, path: '/guide/', depth: 1, top, body, script: true,
    schema: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Second Growth field guide', url: `${ORIGIN}/guide/`, description,
      isPartOf: { '@type': 'WebSite', name: 'Second Growth', url: ORIGIN + '/' } } });
}

// landscapes: { mapId: name } in homepage order. portraits: guide-provenance.json's portraits.
export function guidePaths(guide = fieldGuide()) { return ['/guide/', ...guide.map(e => `/guide/${e.slug}/`)]; }
export async function buildFieldGuide(output, landscapes, portraits) {
  const guide = fieldGuide();
  const missing = guide.filter(e => !portraits[e.slug]).map(e => e.slug);
  if (missing.length) throw Error(`No field-guide portrait for ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ` and ${missing.length - 8} more` : ''}: run tools/capture-field-guide.mjs`);
  await mkdir(join(output, 'guide'), { recursive: true });
  await writeFile(join(output, 'guide/index.html'), indexPage(guide, landscapes, portraits));
  for (const e of guide) {
    await mkdir(join(output, 'guide', e.slug), { recursive: true });
    await writeFile(join(output, 'guide', e.slug, 'index.html'), speciesPage(e, landscapes, portraits, guide));
  }
  return guide;
}
