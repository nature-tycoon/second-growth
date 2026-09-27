// Headless campaign check for the Serengeti map: a scripted player works through each chapter with
// only the tools that chapter allows, and we report when each chapter finishes.
//   node tools/campaign-sim-serengeti.mjs [maxYears] [difficulty]
const root = new URL('../js/', import.meta.url).href;
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const { Game } = await import(root + 'game.js');
const { TOOLS, brushTiles, toolCost } = await import(root + 'tools.js');
const { CHAPTERS, currentChapter, toolUnlocked } = await import(root + 'sim/campaign.js');
const { T, F, isWater } = await import(root + 'config.js');
const { PLANTS } = await import(root + 'data/plants.js');
const maxYears = +(process.argv[2] || 14), diff = process.argv[3] || 'standard';
const g = new Game(); g.newGame(2024, 'campaign', diff, 'serengeti');
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
const inv = i => [w.ground[i], w.shrub[i], w.tree[i]].some(id => id && PLANTS[id].invasive);
let band = 8;
const luggaX = y => Math.round(80 + Math.sin(y / 11) * 7 + Math.sin(y / 27 + 2) * 4);
const grassBand = () => {
  // each visit works a new band of the range, pulling weeds and sowing grass behind pits
  const y0 = band, y1 = band + 8; band = band >= 88 ? 8 : band + 8;
  for (let y = y0; y <= y1; y += 3) for (let x = 6; x <= w.w - 6; x += 3) { if (inv(w.idx(x, y))) use('pull', x, y, 1); if (w.terrain[w.idx(x, y)] === T.GRAVEL) use('rip', x, y, 1); }
  for (let y = y0; y <= y1; y += 3) for (let x = 6; x <= w.w - 6; x += 3) use(toolUnlocked(g, 'mix_regrass') && (w.soil[w.idx(x, y)] > 0.12 || (x + y) % 2) ? 'mix_regrass' : 'mix_pioneers_s', x, y, 1);
};
const plans = {
  crust() {
    g.flags.inspected = true;
    for (let y = 30; y <= 50; y += 2) for (let x = 44; x <= 72; x += 3) use('lower', x, y, 0);
    for (let y = 30; y <= 50; y += 3) for (let x = 44; x <= 72; x += 3) { use('rip', x, y, 1); use('mix_pioneers_s', x, y, 1); }
  },
  weed() {
    each(i => inv(i), (x, y) => { if ((x + y) % 2 === 0) use('pull', x, y, 0); });
    grassBand();
  },
  lugga() {
    each(i => w.feature[i] === F.CULVERT, (x, y) => use('demolish', x, y));
    each(i => !isWater(w.terrain[i]) && near(i, j => w.terrain[j] === T.CREEK), (x, y) => { if ((x + y) % 3 === 0) use('mix_riverine', x, y, 0); });
    for (let y = 20; y <= 76; y += 3) use('marsh', luggaX(y) - 3, y, 1);
    each(i => w.terrain[i] === T.POND || w.terrain[i] === T.MARSH, (x, y) => { if ((x + y) % 3 === 0) use('mix_wetland_s', x, y, 1); });
    grassBand();
  },
  route() {
    each(i => w.feature[i] === F.FENCE && ((i % w.w) >= w.w - 1 || ((i / w.w) | 0) === 0), (x, y) => use('demolish', x, y));
    const kinds = ['rocks', 'brush', 'log', 'nestbox', 'snag']; let placed = 0;
    for (let y = 36; y <= 60 && placed < 12; y += 4) for (let x = 46; x <= 76 && placed < 12; x += 3) placed += use(kinds[placed % 5], x, y);
    for (let y = 30; y <= 70; y += 6) for (let x = 20; x <= 100; x += 6) use('mix_wildflowers', x, y, 1);
    grassBand();
  },
  acacia() {
    for (let y = 12; y <= 90; y += 7) for (let x = 10; x <= w.w - 10; x += 9) use((x + y) % 3 ? 'mix_acacia' : 'mix_thornscrub', x, y, 1);
    for (let y = 20; y <= 90; y += 10) use('mix_giants', luggaX(y) - 5, y, 1);
    grassBand();
  },
  fire() {
    if (!used(g, 'burn')) for (let y = 30; y <= 40; y++) for (let x = 44; x <= 50; x++) use('burn', x, y, 0);
    // red oat grass on the ground whose soil has recovered
    let m = 0; each(i => w.soil[i] >= 0.14 && w.soil[i] < 0.26 && !isWater(w.terrain[i]), (x, y) => { if ((x * 3 + y) % 5 === 0 && m < 150) m += use('mulch', x, y, 0); });
    let n = 0; each(i => w.soil[i] >= 0.26 && !isWater(w.terrain[i]) && PLANTS[w.ground[i]]?.key !== 'redoat', (x, y) => { if ((x + y) % 2 === 0 && n < 300) n += use('plant_redoat', x, y, 0); });
    grassBand();
  },
  public() {
    let placed = false;
    for (let x = 41; x < 48 && !placed; x++) if (use('build_parking', x, 30)) placed = [x, 30];
    const px = placed ? placed[0] + 2 : 43;
    const path = (x, y) => use('trail', x, y, 0) || use('boardwalk', x, y, 0);
    for (let x = px; x <= 74; x++) path(x, 32);
    for (let y = 32; y <= 54; y++) path(74, y);
    for (let x = 74; x >= 50; x--) path(x, 56);
    for (let y = 56; y >= 32; y--) path(50, y);
    use('blind', 60, 50); use('blind', 72, 44);
    grassBand();
  },
  herds() {
    plans.fire();
    for (const [k, x, y] of [['intro_elephant', 70, 50], ['intro_rhino', 90, 30]]) if (TOOLS[k]) use(k, x, y);
    grassBand();
  },
};
const used = (g, k) => g.stats.used?.[k] || 0;
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
