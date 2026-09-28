// Headless campaign check for the Amazon map: a scripted player works through each chapter with
// only the tools that chapter allows, and we report when each chapter finishes.
//   node tools/campaign-sim-amazon.mjs [maxYears] [difficulty]
const root = new URL('../js/', import.meta.url).href;
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const { Game } = await import(root + 'game.js');
const { TOOLS, brushTiles, toolCost } = await import(root + 'tools.js');
const { CHAPTERS, currentChapter, toolUnlocked } = await import(root + 'sim/campaign.js');
const { T, F, isWater } = await import(root + 'config.js');
const { PLANTS } = await import(root + 'data/plants.js');
const maxYears = +(process.argv[2] || 14), diff = process.argv[3] || 'standard';
const g = new Game(); g.newGame(2024, 'campaign', diff, 'amazon');
const w = g.world, log = [];
g.on('chapter', e => log.push(`day ${g.day} (Y${g.year} ${g.dateString()}): finished "${e.done.title}"  $${Math.round(g.money)}`));
function use(key, x, y, r = null) {
  const t = TOOLS[key];
  if (!toolUnlocked(g, key)) throw new Error(`locked tool used: ${key}`);
  if (!w.inb(x, y)) return 0;
  const tiles = t.brush ? brushTiles(w, x, y, r ?? t.size) : [w.idx(x, y)];
  let n = 0;
  for (const i of tiles) {
    const c = toolCost(g, t, i);
    if (c > 0 && !g.canAfford(c)) continue;
    if (t.apply(g, i, Math.random) === true) { if (c > 0) g.spend(c); else if (c < 0) g.earn(-c); g.stats.used[key] = (g.stats.used[key] || 0) + 1; n++; }
  }
  if (n) g.refreshEnvironment();
  return n;
}
const each = (pred, fn) => { for (let i = 0; i < w.n; i++) if (pred(i)) fn(i % w.w, (i / w.w) | 0, i); };
const near = (i, test, r = 1) => { const x = i % w.w, y = (i / w.w) | 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (w.inb(x + dx, y + dy) && test(w.idx(x + dx, y + dy))) return true; return false; };
const inv = i => w.ground[i] && PLANTS[w.ground[i]].invasive;
let muvucaRow = 10;
const plans = {
  ground() { g.flags.inspected = true; for (let y = 14; y <= 30; y += 2) for (let x = 70; x <= 92; x += 2) { use('pull', x, y, 0); } for (let y = 14; y <= 30; y += 3) for (let x = 70; x <= 92; x += 3) use('mix_pastureshrubs', x, y, 1); },
  muvuca() {
    // each visit works a new band of pasture, moving south-west away from the rainforest edge
    const y0 = muvucaRow, y1 = muvucaRow + 8; muvucaRow = Math.min(80, muvucaRow + 8);
    for (let y = y0; y <= y1; y += 3) for (let x = 60; x <= 96; x += 3) { use('pull', x, y, 1); use('mix_muvuca', x, y, 1); }
    for (let y = y0; y <= y1; y += 4) for (let x = 62; x <= 94; x += 4) use('mix_pioneers', x, y, 1);
  },
  igarape() {
    each(i => w.feature[i] === F.CULVERT, (x, y) => use('demolish', x, y));
    each(i => !isWater(w.terrain[i]) && near(i, j => w.terrain[j] === T.CREEK), (x, y) => { if ((x + y) % 2 === 0) use('mix_varzea', x, y, 0); });
    for (let y = 36; y <= 42; y += 2) for (let x = 60; x <= 68; x += 2) use('marsh', x, y, 1);
    each(i => w.terrain[i] === T.MARSH, (x, y) => { if ((x + y) % 2 === 0) use('mix_wetland', x, y, 1); });
  },
  edge() {
    each(i => w.feature[i] === F.FENCE && ((i % w.w) >= w.w - 1 || ((i / w.w) | 0) === 0 || (i % w.w) >= 70), (x, y) => use('demolish', x, y));
    const kinds = ['snag', 'log', 'nestbox', 'brush', 'rocks']; let placed = 0;
    for (let x = 72; x <= 96 && placed < 12; x += 2) placed += use(kinds[placed % 5], x, 22);
    for (let y = 12; y <= 34; y += 4) for (let x = 70; x <= 94; x += 4) use('mix_understory', x, y, 1);
  },
  fire() {
    for (let y = 8; y <= 44; y++) { use('clear', 66, y, 0); }
    for (let y = 36; y <= 60; y += 3) for (let x = 40; x <= 96; x += 3) { use('pull', x, y, 1); use('mix_muvuca', x, y, 0); }
  },
  canopy() {
    for (let y = 36; y <= 70; y += 2) for (let x = 40; x <= 96; x += 2) { use('pull', x, y, 0); use('mix_muvuca', x, y, 0); }
    for (let y = 12; y <= 60; y += 5) for (let x = 60; x <= 96; x += 5) use('mix_canopy', x, y, 1);
  },
  public() {
    let placed = false;
    for (let x = 36; x < 44 && !placed; x++) if (use('build_parking', x, 25)) placed = [x, 25];
    const px = placed ? placed[0] + 2 : 42;
    const path = (x, y) => use('trail', x, y, 0) || use('boardwalk', x, y, 0) || (use('clear', x, y, 0) && use('trail', x, y, 0));
    for (let x = px; x <= 70; x++) path(x, 27);
    // a loop through the young forest by the rainforest edge, down to the stream and back
    for (let y = 27; y >= 14; y--) path(70, y);
    for (let x = 70; x <= 92; x++) path(x, 14);
    for (let y = 14; y <= 30; y++) path(92, y);
    for (let x = 92; x >= 60; x--) path(x, 30);
    for (let y = 30; y <= 40; y++) path(60, y);
    use('blind', 72, 20); use('blind', 86, 16); use('blind', 90, 28);
  },
  giants() {
    for (const [k, x, y] of [['intro_tapir', 80, 24], ['intro_spider', 90, 12], ['intro_giantotter', 54, 40]]) if (TOOLS[k]) use(k, x, y);
    for (let y = 40; y <= 80; y += 2) for (let x = 10; x <= 60; x += 2) { use('pull', x, y, 0); use('mix_muvuca', x, y, 0); }
  },
};
let lastCh = -1;
for (let d = 0; d < maxYears * 120; d++) {
  const ch = currentChapter(g);
  if (!ch) break;
  if (g.campaign.chapter !== lastCh) { lastCh = g.campaign.chapter; plans[ch.key]?.(); }
  // keep chipping away when money allows, every quarter
  if (d % 30 === 29 && plans[ch.key] && g.money > 6000) plans[ch.key]();
  g.dailyTick();
  for (let k = 0; k < 3; k++) g.wildlife.update(0.33);
  if (d % 120 === 119) console.log(`  Y${g.year} ch${g.campaign.chapter + 1} ${ch.key}: ${ch.goals.map(o => (o.check(g) ? '✓ ' : '· ') + o.prog(g)).join(' | ')}  $${Math.round(g.money)}`);
}
console.log(log.join('\n'));
console.log(currentChapter(g) ? 'NOT complete' : 'campaign complete');
