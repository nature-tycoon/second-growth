// Headless campaign check: a scripted player works through each chapter with only the tools
// that chapter allows, and we report how many in-game days each chapter takes.
//   node tools/campaign-sim.mjs [maxYears]

const root = new URL('../js/', import.meta.url).href;
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const { Game } = await import(root + 'game.js');
const { TOOLS, brushTiles, toolCost } = await import(root + 'tools.js');
const { CHAPTERS, currentChapter, toolUnlocked } = await import(root + 'sim/campaign.js');
const { T, F, isWater } = await import(root + 'config.js');
const { PLANTS } = await import(root + 'data/plants.js');
const { ANIMAL } = await import(root + 'data/animals.js');

const maxYears = +(process.argv[2] || 12);
const g = new Game(); g.newGame(1987, 'campaign');
const w = g.world;
const log = [];
g.on('chapter', e => log.push(`day ${g.day} (Y${g.year} ${g.dateString()}): finished "${e.done.title}"  $${Math.round(g.money)}`));

// use a tool the way the input layer does: pay, apply, count it
function use(key, x, y, r = null) {
  const t = TOOLS[key];
  if (!toolUnlocked(g, key)) throw new Error(`locked tool used: ${key}`);
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

const plans = {
  fields() {
    g.flags.inspected = true;
    for (let y = 42; y <= 64; y += 2) for (let x = 8; x <= 40; x += 3) { use('rip', x, y, 1); use('mix_meadow', x, y, 1); }
  },
  water() {
    for (let y = 31; y <= 44; y += 2) for (let x = 84; x <= 102; x += 3) use('marsh', x, y, 1);
    each(i => w.terrain[i] === T.MARSH, (x, y) => { if ((x + y) % 2 === 0) use('mix_wet', x, y, 1); });
  },
  gates() {
    each(i => w.feature[i] === F.CULVERT, (x, y) => use('demolish', x, y));
    for (let x = 0; x < w.w; x++) use('demolish', x, 0);
    for (let y = 0; y < w.h; y++) use('demolish', w.w - 1, y);
    let n = 0;
    each(i => (w.ground[i] && PLANTS[w.ground[i]].invasive) || (w.shrub[i] && PLANTS[w.shrub[i]].invasive), (x, y) => { if (n < 80) n += use('pull', x, y, 0); });
  },
  shade() {
    each(i => !isWater(w.terrain[i]) && near(i, j => w.terrain[j] === T.CREEK), (x, y) => { if ((x * 3 + y) % 2 === 0) use('mix_riparian', x, y, 0); });
    for (let y = 4; y <= 20; y += 2) for (let x = 76; x <= 112; x += 3) use('mix_pioneer', x, y, 1);
  },
  homes() {
    const kinds = ['snag', 'log', 'rocks', 'brush', 'nestbox'];
    let placed = 0;
    each(i => !isWater(w.terrain[i]) && near(i, j => w.terrain[j] === T.MARSH, 2), (x, y) => { if (placed < 12 && (x + y) % 3 === 0) placed += use(kinds[placed % kinds.length], x, y); });
    for (let y = 44; y <= 64; y += 3) for (let x = 44; x <= 58; x += 3) { use('mix_meadow', x, y, 1); }
    for (let y = 6; y <= 20; y += 3) for (let x = 78; x <= 110; x += 4) use('mix_forestfloor', x, y, 1);
  },
  disturbance() {
    let n = 0;
    each(i => w.ground[i] && !isWater(w.terrain[i]) && w.groundG[i] > 0.2, (x, y) => { if (n < 30 && x < 45 && y > 40) n += use('burn', x, y, 0); });
    for (let y = 46; y <= 62; y += 2) for (let x = 62; x <= 76; x += 3) use('marsh', x, y, 1);
    each(i => w.terrain[i] === T.MARSH, (x, y) => { if ((x + y) % 3 === 0) use('mix_wet', x, y, 1); });
  },
  public() {
    let placed = false;
    for (let x = 42; x < 64 && !placed; x++) if (use('build_parking', x, 28)) placed = [x, 28];
    const [px] = placed;
    for (let y = 30; y <= 70; y++) use('trail', px + 2, y, 0);
    for (let x = px + 2; x <= px + 30; x++) use('trail', x, 70, 0);
    use('blind', px + 3, 50);
  },
  wild() {
    each(i => w.terrain[i] === T.CREEK, () => {});
    for (const [k, x, y] of [['intro_beaver', 69, 30], ['intro_redlegged', 92, 36], ['intro_turtle', 93, 38], ['intro_elk', 95, 12], ['intro_cutthroat', 69, 20]]) {
      const t = TOOLS[k];
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (!g.flags[k] && g.canAfford(t.cost)) use(k, x + dx, y + dy);
    }
  },
};

// Like a real player, keep restoring with spare money: meadow on old fields, forest up north.
function spendSurplus() {
  if (g.money < 12000) return;
  let budget = g.money - 8000;
  each(i => (w.terrain[i] === T.FIELD || w.terrain[i] === T.PASTURE) && !w.ground[i], (x, y) => {
    if (budget <= 0 || (x + y) % 2) return;
    const before = g.money; use('rip', x, y, 0); use('mix_meadow', x, y, 0); budget -= before - g.money;
  });
  if (toolUnlocked(g, 'mix_pioneer')) each(i => y0(i) < 24 && !w.tree[i] && !isWater(w.terrain[i]) && w.struct[i] < 0, (x, y) => {
    if (budget <= 0 || (x * 5 + y * 3) % 7) return;
    const before = g.money; use('mix_pioneer', x, y, 0); budget -= before - g.money;
  });
}
const y0 = i => (i / w.w) | 0;
let started = -1, lastTry = 0;
for (let d = 0; d < maxYears * 120; d++) {
  const ch = currentChapter(g);
  if (!ch) break;
  const k = g.campaign.chapter;
  // start the chapter's plan, and redo it every half year if the chapter is dragging
  if (k !== started || d - lastTry > 60) { plans[ch.key](); started = k; lastTry = d; spendSurplus(); }
  // the wildlife chapter keeps trying introductions as habitat allows
  if (ch.key === 'wild' && d % 20 === 0) plans.wild();
  g.dailyTick();
  for (let s = 0; s < 10; s++) g.wildlife.update(0.1);
  if (d % 120 === 119) {
    const c = currentChapter(g);
    if (c) console.log(`  Y${g.year} ch${g.campaign.chapter + 1} ${c.key}: ${c.goals.map(o => (o.check(g) ? '✓ ' : '· ') + o.prog(g)).join(' | ')}  $${Math.round(g.money)}`);
  }
}
console.log(log.join('\n'));
console.log(currentChapter(g) ? `stuck in chapter ${g.campaign.chapter + 1}` : 'campaign complete');
