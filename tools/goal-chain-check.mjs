// node tools/goal-chain-check.mjs [--years=N] [--seeds=7,11]
// PNW's long goal toward the cougar (PNW_CHAIN in js/sim/goals.js), the money refusal line and how a
// species' loss is told (wildlife-population.js speciesLost), headless.
//   Always: the chain's steps exist in order with live progress lines; a refused stroke says when
//   the next grant comes and which goal pays; a natural loss goes to the journal only, a loss of
//   habitat warns with what the species needs, and a migrant away for its season is no loss.
//   --years=N also runs the scripted Hollis restoration (tools/hollis-restore-plan.mjs) for N years
//   per run seed, through the same wildlife steps and keystone-moment checks as the live game, and
//   prints the day each step was met. With N >= 8 it fails unless deer, the owl and the elk are met.
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const root = new URL('../js/', import.meta.url).href;
const { Game } = await import(root + 'game.js');
const { ToolActions, brokeLine } = await import(root + 'tool-actions.js');
const { momentsUpdate } = await import(root + 'sim/moments.js');
const { PNW_CHAIN } = await import(root + 'sim/goals.js');
const { DAYS_PER_YEAR } = await import(root + 'config.js');
const { hollisRestorePlan } = await import('./hollis-restore-plan.mjs');
const flag = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);

// ---- the chain is there, in order, with a line that says where it stands
{
  const g = new Game(); g.newGame(1987, undefined, undefined, 'pnw', 7);
  assert.equal(g.catalog.definition.goalChain, PNW_CHAIN, 'PNW has the goal chain');
  const keys = g.catalog.goals.map(x => x.key);
  assert.deepEqual(PNW_CHAIN.steps, ['deer', 'owl', 'elk', 'cougar']);
  for (const k of PNW_CHAIN.steps) {
    const goal = g.catalog.goals.find(x => x.key === k);
    assert.ok(goal?.chain, `${k}: a chain goal`);
    assert.ok(keys.indexOf(k) > keys.indexOf('sprout'), `${k}: after the first goal`);
    assert.ok(!goal.check(g), `${k}: not met on day one`);
    const p = goal.prog(g);
    assert.ok(typeof p === 'string' && p.length > 5, `${k}: a progress line (${p})`);
  }
  assert.match(g.catalog.goals.find(x => x.key === 'deer').prog(g), /fence/, 'deer: the fence is what stops them');
  assert.match(g.catalog.goals.find(x => x.key === 'cougar').prog(g), /Habitat \d+%|prey/, 'cougar: says what is missing');
  for (const m of ['owlHunt', 'elkCreek', 'cougarHunt']) assert.ok(g.catalog.definition.moments[m]?.title, `${m}: a keystone moment`);

  // ---- money: a refused stroke says when money comes and what pays
  const notes = []; g.on('notify', n => notes.push(n));
  g.money = 5;
  const tools = new ToolActions(g);
  const field = []; for (let x = 30; x < 40; x++) field.push(g.world.idx(x, 40));
  tools.apply('mix_meadow', field);
  const broke = notes.find(n => /^Not enough money/.test(n.text));
  assert.ok(broke, 'a refused stroke says so');
  assert.match(broke.text, /^Not enough money\. Next grant: about \$[\d,]+ in \d+ days?\. Goals pay more: .+, \$[\d,]+\.$/, broke.text);
  assert.ok(broke.text.length <= 140, `one short line (${broke.text.length} chars)`);
  g.lastLedger = { in: { grant: 300, visitors: 420 }, out: {} };
  assert.match(brokeLine(g), /, plus visitor donations \(\$420 last month\)\./, 'sales or donations are named when they came in');
  console.log('PASS money line:', broke.text);

  // ---- losing a species: nature quietly, habitat loss with what to do, migrants not at all
  const wl = g.wildlife, at = key => g.catalog.animal[key];
  const kill = def => { for (const a of wl.agents.filter(a => a.sp === def.index)) wl.remove(a, 'natural'); wl.recount(); };
  const run = (def, setK) => { notes.length = 0; wl.state[def.index].residents = 3; wl.state[def.index].lostNoted = null; kill(def); setK(wl.state[def.index]); wl.speciesLost(g.month); return notes.slice(); };
  const vole = at('vole');
  let n = run(vole, st => { st.K = 20; st.habitatK = 20; });
  assert.equal(n.length, 1, 'a natural crash is told once');
  assert.equal(n[0].kind, 'info'); assert.ok(n[0].journal, 'a natural crash goes to the journal, no pop-up');
  assert.match(n[0].text, /rise and fall on their own/);
  assert.equal(wl.state[vole.index].lostCause, 'natural');
  const lark = at('meadowlark');
  n = run(lark, st => { st.K = 0.2; st.habitatK = 0.2; st.preyK = null; });
  assert.equal(n[0]?.kind, 'warn', 'habitat lost: a warning'); assert.match(n[0].text, /What they need: Big, open native meadows/);
  const cougar = at('cougar');
  n = run(cougar, st => { st.habitatK = 3; st.preyK = 0.2; st.K = 0.2; });
  assert.match(n[0]?.text || '', /too few black-tailed deer and roosevelt elk|too few .*deer/i, 'prey lost: names the prey');
  const thrush = at('thrush'); assert.ok(thrush.season, 'the thrush is a migrant');
  const off = [...Array(12).keys()].find(m => !thrush.season.includes(m));
  notes.length = 0; wl.state[thrush.index].residents = 4; kill(thrush); wl.speciesLost(off);
  assert.equal(notes.length, 0, 'a migrant away for its season is not a loss');
  console.log('PASS species-loss wording');
}

// ---- the year-long fallback counts from when the species last arrived; an older save keeps its met steps, unpaid
{
  const g = new Game(); g.newGame(1987, undefined, undefined, 'pnw', 7);
  assert.equal(g.flags.chain, 1, 'a new farm starts the chain');
  const wl = g.wildlife, owl = g.catalog.animal.owl, st = wl.state[owl.index], goal = g.catalog.goals.find(x => x.key === 'owl');
  wl.spawn(owl, 40, 40); wl.recount(); wl.speciesLost(g.month);
  assert.equal(st.since, g.day, 'living here since today');
  g.day += 130; assert.ok(goal.check(g), 'a year here without the moment caught still counts');
  for (const a of wl.agents.filter(a => a.sp === owl.index)) wl.remove(a, 'natural'); wl.recount(); wl.speciesLost(g.month);
  assert.equal(st.since, null, 'gone: the clock stops');
  wl.spawn(owl, 40, 40); wl.recount(); wl.speciesLost(g.month);
  assert.ok(!goal.check(g), 'back after a gap: the year starts again');
  const saved = wl.serialize().state[owl.index];
  assert.ok(saved.since != null && saved.residents === 1, 'since and residents are saved');
  // a farm from before the chain, with deer and an owl: marked done, no grant, no cinematic
  delete g.flags.chain; g.goalsDone = { sprout: 1 }; g.flags.moments = {};
  wl.spawn(g.catalog.animal.deer, 50, 50); wl.recount();
  const money0 = g.money; g.checkGoals();
  assert.ok(g.goalsDone.deer && g.goalsDone.owl && !g.goalsDone.elk, 'met steps adopted');
  assert.ok(g.flags.moments.owlHunt != null, 'no "returns" cinematic for an owl that was already here');
  assert.ok(g.money - money0 < 600, 'adopted steps pay nothing');
  console.log('PASS year fallback and older saves');
}

// ---- the chain through a seeded restoration
const years = +(flag('years') || 0);
if (years) {
  const seeds = (flag('seeds') || '7,11,23').split(',').map(Number);
  const met = {};
  for (const seed of seeds) {
    const g = new Game(); g.newGame(1987, undefined, undefined, 'pnw', seed);
    const plan = hollisRestorePlan(g, ToolActions), days = {};
    for (let d = 0; d < years * DAYS_PER_YEAR; d++) {
      plan.day(d);
      g.dailyTick();
      for (let k = 0; k < 10; k++) { g.wildlife.update(0.1); momentsUpdate(g); }
      for (const k of PNW_CHAIN.steps) if (g.goalsDone[k] != null && days[k] == null) days[k] = g.day;
    }
    const yr = d => d == null ? '-' : (d / DAYS_PER_YEAR + 1).toFixed(1);
    console.log(`seed ${seed}: ` + PNW_CHAIN.steps.map(k => `${k} y${yr(days[k])}${g.flags.moments?.[{ owl: 'owlHunt', elk: 'elkCreek', cougar: 'cougarHunt' }[k]] != null ? ' (moment)' : ''}`).join(', '));
    met[seed] = days;
  }
  if (years >= 8) for (const [seed, days] of Object.entries(met)) for (const k of ['deer', 'owl', 'elk']) assert.ok(days[k] != null, `seed ${seed}: ${k} met within ${years} years`);
  console.log('PASS chain in a seeded restoration');
}
