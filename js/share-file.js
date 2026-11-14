// A farm as one file, for sharing by link and for Export/Import (decision 0047): gzip of the tag
// SGF1, the JSON part's length, the save's JSON part (Game.saveData() without its landscape arrays),
// then each array's raw bytes in the order the JSON lists them. No base64, so it stays small
// (about 90-500 KB). It holds nothing personal: saveData has no names, typed text or ids, and the
// store's savedAt is left out.
//
// A shared farm is untrusted input: decodeFarm caps how much it will unpack, and the caller loads
// it only through Game.restoreSnapshot, which validates it off to the side.

export const FARM_EXT = '.sgfarm';
export const MAX_SHARE = 2 * 1024 * 1024;   // compressed, as the Worker accepts
const MAX_UNPACKED = 12 * 1024 * 1024;       // a grown farm is about 2 MB; past this it isn't a farm
const TAG = [0x53, 0x47, 0x46, 0x31];        // 'SGF1'

const bytesOf = v => v?.b ?? v;

async function pipe(bytes, stream, cap = Infinity) {
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader(), parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > cap) { await reader.cancel(); throw new Error('Farm file too large'); }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

// data: a FarmSave (Game.saveData()). Resolves to the gzip bytes.
export async function encodeFarm(data) {
  const { savedAt, ...rest } = data;
  const arrays = data.world.arrays, order = Object.keys(arrays);
  const meta = { ...rest, world: { ...data.world, arrays: undefined,
    arrayOrder: order.map(k => [k, arrays[k]?.n ?? null, bytesOf(arrays[k]).byteLength]) } };
  const json = new TextEncoder().encode(JSON.stringify(meta));
  const total = 8 + json.length + order.reduce((s, k) => s + bytesOf(arrays[k]).byteLength, 0);
  const raw = new Uint8Array(total);
  raw.set(TAG, 0); new DataView(raw.buffer).setUint32(4, json.length); raw.set(json, 8);
  let at = 8 + json.length;
  for (const k of order) {
    const b = bytesOf(arrays[k]);
    raw.set(new Uint8Array(b.buffer, b.byteOffset, b.byteLength), at); at += b.byteLength;
  }
  return pipe(raw, new CompressionStream('gzip'));
}

// gzip bytes -> a FarmSave in the form the save store keeps (arrays as Uint8Array), or throws.
export async function decodeFarm(gz) {
  const raw = await pipe(gz, new DecompressionStream('gzip'), MAX_UNPACKED);
  if (raw.length < 8 || TAG.some((c, i) => raw[i] !== c)) throw new Error('Not a Second Growth farm');
  const len = new DataView(raw.buffer, raw.byteOffset).getUint32(4);
  if (8 + len > raw.length) throw new Error('Farm file is cut short');
  const data = JSON.parse(new TextDecoder().decode(raw.subarray(8, 8 + len)));
  const order = data?.world?.arrayOrder;
  if (!Array.isArray(order)) throw new Error('Farm file has no landscape');
  const arrays = {};
  let at = 8 + len;
  for (const [k, n, size] of order) {
    if (typeof k !== 'string' || !Number.isInteger(size) || size < 0 || at + size > raw.length) throw new Error('Farm file is cut short');
    const b = raw.slice(at, at + size); at += size;
    arrays[k] = n == null ? b : { n, b };
  }
  delete data.world.arrayOrder;
  data.world.arrays = arrays;
  return data;
}
