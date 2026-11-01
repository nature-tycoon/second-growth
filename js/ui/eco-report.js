// The Ecosystem Report (decision 0031): an overview of the land against its reference ecosystem
// (the stage reached, six vital signs, the weakest one as a hint, badges), and a deep dive behind
// each card. It only draws: the numbers come from sim/eco-metrics.js via game.updateEco().
import { DAYS_PER_YEAR, H, clamp } from '../config.js';
import { VITAL_NAMES, TIER_NAMES, TIERS, badgeList, ecoState, co2, carsForAYear } from '../sim/eco-metrics.js';
import { CARBON_FRACTION, TILE_HA } from '../data/eco-reference.js';
import { tr } from '../i18n.js';

const DESC = {
  carbon: 'How much carbon your living plants hold, compared with the reference.',
  layers: 'How much of the land is meadow, shrubs, forest and mature forest, compared with the reference.',
  foodweb: 'Which levels of the food web live here: plant eaters, hunters and top predators.',
  native: 'How much of the land native plants cover, how many kinds grow here, and how few invasives.',
  water: 'Wetland area, water quality, and shade over the creek.',
  oldgrowth: 'Big old trees and deadwood: the slowest things to come back.',
  coral: 'How much of the reef living hard coral covers.',
  variety: 'Kinds of hard coral, and the soft corals, sea fans and sponges between them.',
  clean: 'How little of the reef is smothered by algae and starfish, or bleached.',
  seagrass: 'Seagrass on the lagoon sand: food for turtles and dugongs, a nursery for fish, and a carbon store.',
  oldcoral: 'Big old coral heads: the slowest part of a reef to grow back.',
};
const PART_NAMES = {
  meadow: 'Meadow and grassland', shrub: 'Shrubs and thickets', forest: 'Forest', old: 'Mature forest',
  nativeCover: 'Native plant cover', nativeKinds: 'Native plant species', invasive: 'Invasive plants',
  wetland: 'Marsh and pond', quality: 'Water quality', creekShade: 'Shaded creek',
  bigTrees: 'Big old native trees', deadwood: 'Logs and dead trees', living: 'Carbon in living plants',
  coral: 'Living coral', oldCoral: 'Old coral heads', coralKinds: 'Kinds of hard coral', softCoral: 'Soft corals, fans and sponges',
  algae: 'Algae and starfish', bleached: 'Bleached coral', seagrass: 'Seagrass meadow',
};
const HINTS = {
  meadow: 'Sow native meadow on open, sunny ground.',
  shrub: 'Plant native shrubs at forest edges and along the water.',
  forest: 'Plant native trees on open or farmed land.',
  old: 'Mature forest takes decades. Keep your oldest trees standing and let young stands grow up.',
  nativeCover: 'Plant natives on bare and farmed ground.',
  nativeKinds: 'Plant more kinds of native plants. Each one feeds different wildlife.',
  invasive: 'Pull invasive plants, or shade them out with trees and shrubs.',
  wetland: 'Dig ponds and marshes. Wetlands hold water, carbon and life.',
  quality: 'Shade the banks with trees and shrubs, and clear invasives near the water.',
  creekShade: 'Plant trees along the creek. Shade keeps the water cool and clean.',
  bigTrees: 'Let native trees grow old. Big old trees hold the most carbon and the most life.',
  deadwood: 'Leave fallen logs where they lie, and a few dead trees standing. Fungi, beetles, woodpeckers and salamanders need them.',
  living: 'Plant trees. Big, long-lived species store the most carbon.',
  coral: 'Plant nursery corals on reef stars and boulders.',
  oldCoral: 'Protect your oldest coral heads from starfish and heatwaves. They take decades to grow back.',
  coralKinds: 'Grow more kinds of hard coral, each on at least 20 tiles.',
  softCoral: 'Grow soft corals, sea fans and sponges among the hard corals.',
  algae: 'Cull crown-of-thorns starfish and scrape back algae.',
  bleached: 'In a heatwave, string shade cloth over the corals you most want to keep.',
  seagrass: 'Plant seagrass on the lagoon sand.',
  grazers: 'More plant eaters arrive as food and cover grow.',
  hunters: 'Hunters come once there is enough prey for them.',
  apex: 'No top predator yet. They need big, connected habitat and plenty of prey.',
};
const GROUP_NAMES = { grazers: 'Plant and insect eaters', hunters: 'Hunters', apex: 'Top predators' };
const PCT_PARTS = new Set(['nativeCover', 'invasive', 'quality', 'creekShade', 'algae', 'bleached']);
const COUNT_PARTS = new Set(['nativeKinds', 'coralKinds']);

const pct = v => `${Math.round(v * 100)}%`;
const num = v => Math.round(v).toLocaleString();
const tonnes = v => `${num(v)} t`;
const signed = (v, f = num) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${f(Math.abs(v))}`;
const fmtPart = (k, v) => PCT_PARTS.has(k) ? pct(v) : COUNT_PARTS.has(k) ? num(v) : k === 'living' ? tonnes(v) : `${num(v)} ${tr('tiles')}`;
const count = (n, one, many) => `${num(n)} ${tr(Math.round(n) === 1 ? one : many)}`;
const yearOf = day => Math.floor(day / DAYS_PER_YEAR) + 1;

// A trend line as inline SVG (values 0..max, oldest first).
function spark(values, { h = 34, color = 'var(--moss)', max = null, fill = false } = {}) {
  if (values.length < 2) return `<div class="er-spark er-empty">${tr('The trend builds up month by month.')}</div>`;
  const top = max ?? Math.max(...values, 1e-6), W = 100;
  const pts = values.map((v, k) => `${(k / (values.length - 1) * W).toFixed(2)},${(h - 2 - clamp(v / top, 0, 1) * (h - 4)).toFixed(2)}`).join(' ');
  return `<svg class="er-spark" viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" style="height:${h}px">${fill ? `<polygon points="0,${h} ${pts} ${W},${h}" fill="${color}" opacity=".14"/>` : ''}<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}
const bar = (v, color) => `<div class="bar"><i style="width:${pct(clamp(v, 0, 1))}${color ? `;background:${color}` : ''}"></i></div>`;

// The weakest vital sign's advice: its weakest part, or the food web's missing level.
function hintFor(m, key = m.weakest) {
  const v = m.vitals.find(x => x.key === key);
  if (key === 'foodweb') {
    const g = m.foodWeb.groups, miss = ['apex', 'hunters', 'grazers'].find(k => g[k].present.length === 0 && g[k].missing.length) ||
      ['grazers', 'hunters', 'apex'].reduce((a, k) => (g[k].missing.length > (g[a]?.missing.length || 0) ? k : a), 'grazers');
    return HINTS[miss];
  }
  const p = v.parts.reduce((a, b) => (!a || b.score < a.score ? b : a), null);
  return HINTS[p?.key] || '';
}

export function openEcoReport(ui, view = ui.reportView || 'overview') {
  const g = ui.game;
  g.updateScore();
  const m = g.updateEco(), eco = ecoState(g), start = eco.start;
  const ref = m.reference, land = !ref.reef;
  const hist = g.history.filter(h => h.v);
  const since = start.day > 0 ? `${tr('since Year')} ${yearOf(start.day)}` : tr('since you arrived');
  const gained = m.carbon.total - start.carbon;
  const vitalKeys = m.vitals.map(v => v.key);
  const tabs = [['overview', 'Overview'], ...m.vitals.map(v => [v.key, VITAL_NAMES[v.key]]), ['health', 'Health score'], ['badges', 'Badges']];
  if (land && !vitalKeys.includes('carbon')) tabs.splice(1, 0, ['carbon', 'Carbon']);
  if (!land) tabs.splice(tabs.length - 2, 0, ['carbon', 'Carbon']); // (the reef's blue carbon)

  const modal = ui.modal('Ecosystem Report', '<div class="tabs er-tabs"></div><div class="er-view"></div>');
  modal.classList.add('er-modal');
  const tabBar = modal.querySelector('.er-tabs'), body = modal.querySelector('.er-view');
  tabBar.innerHTML = tabs.map(([k, n]) => `<button data-go="${k}">${tr(n)}</button>`).join('');

  const go = k => {
    view = ui.reportView = tabs.some(t => t[0] === k) ? k : 'overview';
    tabBar.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.go === view));
    tabBar.querySelector('.on')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    body.innerHTML = view === 'overview' ? overview() : view === 'health' ? health() : view === 'badges' ? badges()
      : view === 'carbon' ? carbon() : view === 'foodweb' ? foodweb() : vital(view);
    body.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
    modal.querySelector('.modal-body').scrollTop = 0;
  };
  tabBar.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));

  // ---------------------------------------------------------------- overview
  function overview() {
    const score = g.cache.score?.total ?? 0, ds = score - start.score;
    const stages = ref.stages.map((s, k) => `<span class="er-st ${k < m.stage ? 'done' : k === m.stage ? 'now' : ''}">${tr(s)}</span>`).join('');
    const nextAt = [0.2, 0.4, 0.6, 0.8][m.stage];
    const cards = m.vitals.map((v, k) => {
      const d = v.score - (start.vitals[k] ?? v.score);
      return `<button class="er-card" data-go="${v.key}"><span class="er-ct"><span>${v.icon} ${tr(VITAL_NAMES[v.key])}</span><b>${pct(v.score)}</b></span>${bar(v.score)}
        ${spark(hist.map(h => h.v[k] ?? 0), { h: 26, max: 1 })}<span class="er-cs">${cardLine(v)}${Math.abs(d) >= 0.005 ? ` <span class="${d > 0 ? 'up' : 'down'}" title="${tr('Points since you arrived')}">${d > 0 ? '▲' : '▼'} ${Math.round(Math.abs(d) * 100)}</span>` : ''}</span></button>`;
    }).join('');
    const earned = badgeList(g).filter(b => eco.badges[b.key] != null);
    const shown = earned.slice(-8).reverse();
    return `<div class="er-top">
        <button class="er-card er-health" data-go="health"><span class="er-k">${tr('Health')}</span><span class="er-big">${Math.round(score)}<small>/100</small></span><span class="er-cs"><span class="${ds >= 0 ? 'up' : 'down'}">${signed(ds)}</span> ${since}</span></button>
        <button class="er-card er-carbon" data-go="carbon"><span class="er-k">${tr(land ? 'Carbon stored' : 'Blue carbon')}</span><span class="er-big">${signed(gained, tonnes)}</span><span class="er-cs">${since}${gained > 1 ? ` · ${tr('like')} ${num(carsForAYear(gained))} ${tr('cars for a year')}` : ''}</span></button>
        <div class="er-stage"><span class="er-k">${tr('Reference')}: ${tr(ref.name)}</span><div class="er-track">${stages}</div><span class="er-cs">${nextAt ? `${tr('Next stage when the vital signs average')} ${pct(nextAt)} (${tr('now')} ${pct(m.overall)})` : tr('Your land is as healthy as the reference.')}</span></div>
      </div>
      <div class="er-grid">${cards}</div>
      <div class="er-hint"><span class="er-ic">💡</span><span><b>${tr('Weakest vital sign')}: ${tr(VITAL_NAMES[m.weakest])}.</b> ${tr(hintFor(m))}</span></div>
      <button class="er-badges" data-go="badges"><span class="er-k">${tr('Badges')} <b>${earned.length}</b> / ${badgeList(g).length}</span><span class="er-strip">${shown.map(b => `<span class="er-badge ${b.tier}" title="${tr(VITAL_NAMES[b.vital])}, ${tr(TIER_NAMES[b.tier])}">${b.icon}</span>`).join('') || `<span class="er-cs">${tr('Your first badge comes at 30% on any vital sign.')}</span>`}</span><span class="er-more">${tr('All badges')} ›</span></button>`;
  }
  function cardLine(v) {
    const st = g.world.stats, c = m.carbon;
    switch (v.key) {
      case 'carbon': return `${tonnes(c.living)} ${tr('in plants')}`;
      case 'layers': return `${v.parts.filter(p => p.score >= 0.5).length} ${tr('of')} 4 ${tr('layers well grown')}`;
      case 'foodweb': { const gr = m.foodWeb.groups; return gr.apex.present.length ? `${tr('Top predator')}: ${gr.apex.present[0]}` : tr('No top predator yet'); }
      case 'native': return `${tr('Invasives')} ${pct(g.cache.score?.invFrac || 0)}`;
      case 'water': return count((st.counts[H.MARSH] || 0) + (st.counts[H.POND] || 0), 'tile of wetland', 'tiles of wetland');
      case 'oldgrowth': return `${count(c.oldTrees, 'old tree', 'old trees')} · ${count((st.logs || 0) + (st.snags || 0), 'log or snag', 'logs and snags')}`;
      case 'coral': return count(st.coral || 0, 'tile of coral', 'tiles of coral');
      case 'variety': return `${num(st.coralKinds || 0)} ${tr('kinds of hard coral')}`;
      case 'clean': return `${tr('Algae and starfish')} ${pct(g.cache.score?.invFrac || 0)}`;
      case 'seagrass': return count(st.meadow || 0, 'tile', 'tiles');
      case 'oldcoral': return count(c.oldCoral || 0, 'old coral head', 'old coral heads');
    }
    return '';
  }

  // ---------------------------------------------------------------- deep dives
  const head = v => `<div class="er-dh"><span class="er-big">${v.icon} ${pct(v.score)}</span><span><b>${tr(VITAL_NAMES[v.key])}</b><br><span class="er-cs">${tr(DESC[v.key])} ${tr('Reference')}: ${tr(ref.name)}.</span></span></div>`;
  const trend = (k, color) => `<h4>${tr('Over the years')}</h4>${spark(hist.map(h => h.v[k] ?? 0), { h: 70, max: 1, fill: true, color })}`;
  const hintBox = key => `<div class="er-hint"><span class="er-ic">💡</span><span>${tr(hintFor(m, key))}</span></div>`;

  function vital(key) {
    const k = vitalKeys.indexOf(key), v = m.vitals[k];
    const rows = v.parts.map(p => `<div class="er-row"><span>${tr(PART_NAMES[p.key])}</span>${bar(p.score, p.target === 0 ? 'var(--bad)' : null)}<span class="v">${fmtPart(p.key, p.value)}${p.target ? ` <small>/ ${fmtPart(p.key, p.target)}</small>` : ''}</span></div>`).join('');
    return `${head(v)}<div class="er-cols"><div><h4>${tr('What it is made of')}</h4>${rows}<p class="er-cs">${tr('Each bar is how close you are to the reference. A red bar counts against you.')}</p></div><div>${trend(k)}${hintBox(key)}</div></div>`;
  }

  function foodweb() {
    const k = vitalKeys.indexOf('foodweb'), v = m.vitals[k], gr = m.foodWeb.groups;
    const rows = Object.entries(gr).filter(([, x]) => x.present.length + x.missing.length).map(([key, x]) => {
      const n = x.present.length + x.missing.length;
      return `<div class="er-fw"><div class="er-ct"><b>${tr(GROUP_NAMES[key])}</b><span>${x.present.length} ${tr('of')} ${n}</span></div>${bar(x.present.length / Math.max(1, 0.7 * n))}
        <div class="er-chips">${x.present.map(s => `<span class="er-chip">${tr(s)}</span>`).join('')}${x.missing.length ? `<span class="er-chip off">${x.missing.length} ${tr('more could live here')}</span>` : ''}</div></div>`;
    }).join('');
    return `${head(v)}<div class="er-cols"><div>${rows}</div><div>${trend(k)}${hintBox('foodweb')}</div></div>`;
  }

  function carbon() {
    const c = m.carbon, pools = land
      ? [['Trees', c.trees, '#2c4c2f'], ['Shrubs and grass', c.shrubs + c.grass, '#6f9a52'], ['Deadwood', c.dead, '#8a6a3c'], ['Soil (top 30 cm)', c.soil, '#a08360'], ['Mangrove mud', c.blue, '#3d7fa6']]
      : [['Seagrass leaves and roots', c.grass, '#6f9a52'], ['Trees on the cay', c.trees, '#2c4c2f'], ['Seagrass mud', c.blue, '#3d7fa6']];
    const used = pools.filter(p => p[1] > 0.05), total = used.reduce((s, p) => s + p[1], 0) || 1;
    const stack = used.map(([n, t, col]) => `<i style="width:${(t / total * 100).toFixed(2)}%;background:${col}" title="${tr(n)}"></i>`).join('');
    const rows = used.map(([n, t, col]) => `<div class="er-row"><span><span class="chip" style="background:${col}"></span> ${tr(n)}</span>${bar(t / total, col)}<span class="v">${tonnes(t)}</span></div>`).join('');
    const ha = g.world.stats.land * TILE_HA;
    const perHa = c.living / Math.max(ha, 1e-6), refHa = ref.agb * CARBON_FRACTION;
    const yearAgo = hist.find(h => h.day >= g.day - DAYS_PER_YEAR - 1);
    const perYear = yearAgo && yearAgo !== hist.at(-1) ? c.total - yearAgo.c : null;
    const v = m.vitals.find(x => x.key === 'carbon');
    return `<div class="er-dh"><span class="er-big">${signed(gained, tonnes)}</span><span><b>${tr('Carbon stored')} ${since}</b><br><span class="er-cs">${gained >= 1 ? `${tr('That is')} ${num(co2(gained))} ${tr('t of CO₂ taken from the air: as much as')} ${num(carsForAYear(gained))} ${tr('cars give off in a year.')}` : tr('Growing plants, healing soil and wetlands take carbon from the air. A fire or clearing puts it back.')}</span></span></div>
      <div class="er-cols"><div>
        <h4>${tr('Where the carbon is now')}: ${tonnes(c.total)}</h4><div class="er-stack">${stack}</div>${rows}
        ${land ? `<p class="er-cs">${tr('Your plants hold about')} ${num(perHa)} ${tr('t of carbon a hectare. A mature stand of the reference holds about')} ${num(refHa)} ${tr('in its trees.')}${v ? ` (${pct(v.score)})` : ''}</p>` : `<p class="er-cs">${tr('Corals are not counted: a growing reef builds limestone and gives off a little CO₂. Seagrass mud buries carbon year after year.')}</p>`}
      </div><div>
        <h4>${tr('Carbon over the years')}${perYear != null ? ` · <span class="${perYear >= 0 ? 'up' : 'down'}">${signed(perYear, tonnes)} ${tr('this year')}</span>` : ''}</h4>${spark(hist.map(h => h.c - start.carbon), { h: 70, color: 'var(--moss-2)', fill: true, max: Math.max(1, ...hist.map(h => h.c - start.carbon)) })}
        <p class="er-cs">${tr('An estimate from each plant\'s species, size and age, using published figures for forests, soils and wetlands like these. It is not a measurement or a carbon credit.')}</p>
      </div></div>`;
  }

  function health() {
    const s = g.cache.score, st = g.world.stats;
    const rows = s.parts.map(p => {
      const neg = p.pts < 0, width = neg ? Math.abs(p.pts) / 15 : p.pts / (p.max || 1);
      return `<div class="srow"><span>${p.name}</span><div class="bar"><i class="${neg ? 'neg' : ''}" style="width:${pct(clamp(width, 0, 1))}"></i></div><span class="v">${neg ? '' : '+'}${p.pts.toFixed(1)}</span></div>`;
    }).join('');
    const habRows = g.catalog.habitatInfo.map((h, k) => [h, st.counts[k] || 0]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
      .map(([h, n]) => `<div class="srow"><span><span class="chip" style="background:${h.color}"></span> ${h.name}</span><div class="bar"><i style="width:${pct(clamp(n / g.world.n * 2.5, 0, 1))};background:${h.color}"></i></div><span class="v">${n}</span></div>`).join('');
    const all = g.history;
    return `<div class="report">
      <div><h4>${tr('Ecosystem health')}: ${Math.round(s.total)} / 100</h4>${rows}
        <h4 style="margin-top:14px">${tr('Score over time')} <span class="er-legend"><i style="background:var(--moss)"></i>${tr('Health')} <i style="background:#c0467a"></i>${tr('Invasive cover %')}</span></h4>
        <div class="er-dual">${spark(all.map(h => h.score), { h: 80, max: 100, fill: true })}${spark(all.map(h => (h.inv || 0) * 100), { h: 80, max: 100, color: '#c0467a' })}</div>
        <h4 style="margin-top:14px">${tr('Budget')}</h4>${ui.budgetHTML()}
      </div>
      <div><h4>${tr('Land cover')}</h4>${habRows}
        <div class="kv" style="grid-template-columns:150px 1fr;margin-top:12px"><span class="k">${tr('Native cover')}</span><span>${pct(s.nativeFrac || 0)}</span><span class="k">${tr('Invasive cover')}</span><span>${pct(s.invFrac || 0)}</span><span class="k">${tr('Native plant species')}</span><span>${s.nativePlants}</span><span class="k">${tr('Animal species')}</span><span>${m.species} / ${m.speciesMax}</span></div>
      </div></div>`;
  }

  function badges() {
    const list = badgeList(g), rows = {};
    for (const b of list) (rows[b.vital] ||= []).push(b);
    const html = Object.entries(rows).map(([k, bs]) => `<div class="er-brow"><span class="er-bn">${tr(VITAL_NAMES[k])}</span>${bs.map(b => {
      const day = eco.badges[b.key], got = day != null;
      const need = b.vital === 'health' ? `${b.at}` : b.vital === 'streak' ? `${b.at} ${tr('years')}` : pct(b.at);
      return `<span class="er-b ${got ? b.tier : 'lock'}"><span class="er-badge ${got ? '' : 'lock '}${b.tier}"><i>${b.icon}</i></span><span class="er-bl" title="${tr(TIER_NAMES[b.tier])}">${need}<br><small>${got ? (day < 0 ? tr('from the start') : `${tr('Year')} ${yearOf(day)}`) : `${Math.min(99, Math.floor(clamp(b.progress(m, g), 0, 1) * 100))}% ${tr('of the way')}`}</small></span></span>`;
    }).join('')}</div>`).join('');
    const next = list.filter(b => eco.badges[b.key] == null).sort((a, b) => b.progress(m, g) - a.progress(m, g))[0];
    return `<p class="er-cs" style="margin-top:0">${tr('Bronze, silver and gold for each vital sign, for your health score, and for years in a row when health went up.')}</p>
      ${next ? `<div class="er-hint"><span class="er-ic">🎯</span><span><b>${tr('Closest badge')}: ${tr(VITAL_NAMES[next.vital])}, ${tr(TIER_NAMES[next.tier]).toLowerCase()}</b> (${Math.floor(clamp(next.progress(m, g), 0, 1) * 100)}% ${tr('of the way')}). ${tr(next.vital === 'health' || next.vital === 'streak' ? 'Raise your health score every year.' : hintFor(m, next.vital))}</span></div>` : ''}
      <div class="er-bgrid">${html}</div>`;
  }

  go(view);
  return modal;
}
