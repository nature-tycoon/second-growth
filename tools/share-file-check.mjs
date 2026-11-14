// Headless check of the share file (js/share-file.js, decision 0047): every map's farm, new and a
// few years grown, goes through encodeFarm and decodeFarm and comes back with the same
// saveChecksum, opens with Game.restoreSnapshot, stays under the share size cap, and leaves
// nothing out that a save holds. Broken and oversized files are refused.
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';

globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const { Game } = await import('../js/game.js');
const { BIOME_LIST } = await import('../js/biome.js');
const { saveChecksum } = await import('../js/saves.js');
const { encodeFarm, decodeFarm, MAX_SHARE } = await import('../js/share-file.js');

const years = +(process.argv[2] || 1);
for (const { id: map } of BIOME_LIST) {
  const g = new Game(); g.newGame(1987, 'free', 'standard', map, 11);
  for (let d = 0; d < years * 120; d++) { g.dailyTick(); for (let k = 0; k < 10; k++) g.wildlife.update(0.1); }
  const data = g.saveData(); data.savedAt = 123; // (the store's timestamp: must not travel)
  const file = await encodeFarm(data);
  assert.ok(file.length < MAX_SHARE, `${map}: ${file.length} bytes fits the share cap`);
  const back = await decodeFarm(file);
  assert.equal(back.savedAt, undefined, 'savedAt is left out');
  delete data.savedAt;
  assert.equal(saveChecksum(back), saveChecksum(data), `${map}: same farm after the round trip`);
  const opened = new Game();
  assert.ok(opened.restoreSnapshot({ data: back, checksum: saveChecksum(back) }, map), `${map}: opens`);
  assert.equal(opened.day, g.day);
  console.log(`${map}: ${(file.length / 1024).toFixed(0)} KB`);
}

const refuse = async (bytes, what) => { await assert.rejects(decodeFarm(bytes), undefined, what); };
await refuse(new Uint8Array([1, 2, 3]), 'not gzip');
await refuse(gzipSync(Buffer.from('hello there, not a farm')), 'no SGF1 tag');
await refuse(gzipSync(Buffer.from('SGF1\0\0\0\x40{"world":{}}')), 'cut short');
await refuse(gzipSync(Buffer.from('SGF1\0\0\0\x0c{"world":{}}')), 'no landscape');
await refuse(gzipSync(Buffer.alloc(13 * 1024 * 1024)), 'a zip bomb stops at the unpack cap');
process.stdout.write('share-file-check: ok\n');
