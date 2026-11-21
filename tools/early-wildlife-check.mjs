// node tools/early-wildlife-check.mjs
// A fresh PNW farm looks alive from the first minute (first-minutes batch, session 5), through
// habitat rules only (decision 0001): a red-tailed hawk hunting the old pasture's voles, a party
// of crows on the field, and now and then a coyote passing through on its rounds (`ranges`:
// a hunter whose range is mostly the neighbours' land crosses the farm while none live here).
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const { Game } = await import('../js/game.js');
const { trait } = await import('../js/data/animal-kinds.js');

let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
const SEEDS = [1, 2, 3, 4, 5, 6];
const fresh = seed => { const g = new Game(); g.newGame(1987, undefined, undefined, 'pnw', seed); return g; };
const mine = (g, key) => g.wildlife.agents.filter(a => a.key === key && !a.leaving);
// (normal speed, as a first visit plays: about 0.7 game days a real second)
const play = (g, days, each) => { const end = g.day + days; while (g.day < end) { g.update(0.1); each?.(); } };

check('a fresh PNW farm starts with a hawk and a party of crows, and the start is self-consistent', () => {
  for (const seed of SEEDS) {
    const g = fresh(seed), wl = g.wildlife, hawk = g.catalog.animal.hawk, crow = g.catalog.animal.crow;
    assert.ok(crow, 'PNW has American crows');
    assert.equal(mine(g, 'hawk').length, 1, `${seed}: one hawk at the start`);
    assert.ok(mine(g, 'crow').length >= 3, `${seed}: crows at the start`);
    // (the start's prey counts toward a hunter's room: the hawk has room for the one it is)
    assert.ok(wl.state[hawk.index].K >= hawk.minK, `${seed}: hawk K at the start ${wl.state[hawk.index].K.toFixed(2)}`);
    assert.ok(wl.state[crow.index].K >= crow.minK, `${seed}: crow K at the start`);
  }
});

check('the hawk is on the wing much of the first minute and the crows feed on the ground in the first minute', () => {
  let soared = 0, grounded = 0;
  for (const seed of SEEDS) {
    const g = fresh(seed);
    let air = 0, n = 0, down = false;
    play(g, 40, () => {
      n++; air += mine(g, 'hawk').some(a => a.flying);
      down ||= mine(g, 'crow').some(a => !a.flying);
    });
    soared += air / n >= 0.3; grounded += down;
  }
  assert.ok(soared >= SEEDS.length - 1, `hawk on the wing a third of the time or more in ${soared}/${SEEDS.length} first minutes`);
  assert.equal(grounded, SEEDS.length, `crows down on the ground in ${grounded}/${SEEDS.length}`);
});

check('a coyote passes through early, hunts, and goes again', () => {
  let early = 0, left = 0, hunted = 0;
  for (const seed of SEEDS) {
    const g = fresh(seed), def = g.catalog.animal.coyote, wl = g.wildlife;
    assert.ok(trait(def, 'ranges'), 'the coyote ranges');
    let seenAt = null, visitor = null, gone = false;
    play(g, 90, () => {
      const c = wl.agents.find(a => a.key === 'coyote' && a.passUntil != null);
      if (c && seenAt == null) { seenAt = g.day; visitor = c; }
      if (visitor && visitor.leaving) gone = true;
      if (visitor?.hunt) hunted++;
    });
    if (seenAt != null) early++;
    if (visitor) {
      assert.ok(visitor.passUntil - seenAt <= 12, `${seed}: a visit lasts days, not months`);
      play(g, 20, () => { if (visitor.leaving || !wl.agents.includes(visitor)) gone = true; });
      left += gone;
    }
  }
  assert.ok(early >= SEEDS.length - 2, `a coyote passed through in the first 90 days in ${early}/${SEEDS.length} runs`);
  assert.ok(left >= early - 1, `visitors went again (${left}/${early})`);
  assert.ok(hunted > 0, 'a passing coyote hunts while it is here');
});

check('a passing coyote and a lone resident raise no young', () => {
  const g = fresh(2), def = g.catalog.animal.coyote, wl = g.wildlife;
  const a = wl.spawn(def, 60, 45, { silent: true }); a.passUntil = g.day + 30;
  const b = wl.spawn(def, 62, 45, { silent: true }); // (one resident, one passing: no pair)
  g.day = 2 * 10 - 1; // (the end of the month before the coyote's breeding month)
  const young = () => wl.agents.filter(o => o.key === 'coyote' && o.age < 5).length;
  for (let k = 0; k < 40; k++) { wl.state[def.index].K = 5; g.dailyTick(); }
  assert.equal(young(), 0, 'no young from a resident and a passer-by');
  assert.ok(b, 'resident');
});

// (none while residents live here: rangingVisits returns at pop > 0, read in the code)
check('no coyote passes through while a first visit\'s opening holds the deer at the fence', () => {
  for (const seed of SEEDS) {
    const g = fresh(seed); g.flags.opening = { stage: 'fence' };
    play(g, 60);
    assert.ok(!g.wildlife.agents.some(a => a.passUntil != null), `${seed}: no visit during the opening`);
  }
});

check('a passing coyote keeps its passUntil through save and load', () => {
  const g = fresh(3), def = g.catalog.animal.coyote, wl = g.wildlife;
  const a = wl.spawn(def, 60, 45, { silent: true }); a.passUntil = g.day + 7;
  const g2 = new Game(); g2.restoreSave(g.saveData());
  const b = g2.wildlife.agents.find(o => o.id === a.id);
  assert.ok(b && b.passUntil === a.passUntil, 'visit saved');
});

console.log(`${checks} checks passed`);
