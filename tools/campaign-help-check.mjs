// Run: node tools/campaign-help-check.mjs
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const { Game } = await import('../js/game.js');
const { CHAPTERS, campaignVisitorHint, goalMet } = await import('../js/sim/campaign.js');
const { TOOLS } = await import('../js/tools.js');
const { T } = await import('../js/config.js');

for (const map of ['pnw', 'amazon', 'serengeti']) {
  const g = new Game();
  g.newGame(1987, 'campaign', 'standard', map);
  assert.equal(campaignVisitorHint(g), '');
  g.campaign.chapter = CHAPTERS.findIndex(c => c.key === 'public');
  const c = CHAPTERS[g.campaign.chapter], w = g.world;
  assert.equal(c.goals.length, 3); // preserve saved objective indices
  assert.match(c.goals[0].desc, /parking/);
  assert.match(c.teach, /Visitors → Trailhead parking/);
  assert.match(campaignVisitorHint(g), /parking first/);
  // Exercise real placement and connectivity, including a disconnected trail.
  for (let y = 20; y < 25; y++) for (let x = 10; x < 60; x++) {
    const i = w.idx(x, y);
    w.struct[i] = -1; w.terrain[i] = T.SOIL; w.feature[i] = 0;
  }
  w.terrain[w.idx(10, 20)] = T.ROAD;
  assert.equal(TOOLS.build_parking.apply(g, w.idx(10, 21)), true);
  for (let x = 17; x < 57; x++) w.terrain[w.idx(x, 21)] = T.TRAIL;
  g.visitors.network();
  assert.equal(g.visitors.net.length, 0);
  assert.match(campaignVisitorHint(g), /within two tiles/);
  for (let x = 12; x < 16; x++) w.terrain[w.idx(x, 21)] = T.TRAIL;
  g.visitors.network();
  assert.equal(g.visitors.net.length, 4);
  assert.match(campaignVisitorHint(g), /40 tiles/);
  for (let x = 12; x < 17; x++) w.terrain[w.idx(x, 21)] = T.TRAIL;
  g.visitors.network();
  assert.equal(goalMet(g, c.goals[0]), true);
  assert.match(campaignVisitorHint(g), /more stars/);
  g.visitors.rating = 3;
  assert.equal(goalMet(g, c.goals[2]), true);
  g.visitors.rating = 0; // completed goals remain complete, as in saved games
  assert.match(campaignVisitorHint(g), /end of each month/);
  g.mode = 'free';
  assert.equal(campaignVisitorHint(g), '');
  console.log(`${map}: parking, connectivity, rating and saved progress guidance passed`);
}
