// Device-local saves only. IndexedDB keeps binary snapshots and rotates backups in
// one transaction. Small preferences and the last-played map stay in localStorage.
export const LEGACY_SAVE_KEY = 'second-growth-save-v3';
export const LAST_MAP_KEY = 'second-growth-last-map';
export const legacySaveKey = map => map === 'pnw' ? LEGACY_SAVE_KEY : `${LEGACY_SAVE_KEY}-${map}`;
export const SAVE_DB = 'second-growth-saves';
const STORE = 'farms';
const KEEP = 3; // latest plus two previous, distinct snapshots

export function bytesFromBase64(str) {
  const binary = atob(str), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function base64FromBytes(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
export function compactSave(data) {
  if (data?.v !== 1 && data?.v !== 2) throw new Error('Unsupported save version');
  const copy = structuredClone(data);
  if (!copy.world?.arrays) throw new Error('Missing landscape');
  for (const [key, value] of Object.entries(copy.world.arrays)) {
    if (typeof value === 'string') copy.world.arrays[key] = bytesFromBase64(value);
    else if (value && typeof value.b === 'string') value.b = bytesFromBase64(value.b);
  }
  // Keep v1's allowance for arrays added after an older game version. The
  // binary encoding is independent of the gameplay save schema version.
  return copy;
}
function legacyJSON(data) {
  const copy = structuredClone(data);
  copy.savedAt = Date.now(); // Reconcile a temporary fallback save when IndexedDB returns.
  for (const [key, value] of Object.entries(copy.world.arrays)) {
    if (value instanceof Uint8Array) copy.world.arrays[key] = base64FromBytes(value);
    else if (value?.b instanceof Uint8Array) value.b = base64FromBytes(value.b);
  }
  copy.v = 1;
  return JSON.stringify(copy);
}

// Detect damaged records before loading them. Hash the small JSON metadata and
// raw array bytes separately, without turning the landscape back into text.
export function saveChecksum(data) {
  let h = 2166136261;
  const add = n => { h = Math.imul(h ^ n, 16777619); };
  const text = JSON.stringify({ ...data, world: { ...data.world, arrays: undefined } });
  for (let i = 0; i < text.length; i++) add(text.charCodeAt(i));
  for (const key of Object.keys(data.world.arrays).sort()) {
    for (let i = 0; i < key.length; i++) add(key.charCodeAt(i));
    const value = data.world.arrays[key], bytes = value?.b ?? value;
    if (!(bytes instanceof Uint8Array)) throw new Error('Invalid landscape array');
    add(bytes.length); if (value?.n != null) add(value.n);
    for (const byte of bytes) add(byte);
  }
  return h >>> 0;
}
export function intact(snapshot) {
  try { return snapshot?.checksum === saveChecksum(snapshot.data); } catch { return false; }
}

export class BrowserSaves {
  constructor({ database = SAVE_DB, storage = null } = {}) {
    this.database = database; this.storage = storage;
    this.db = null; this.ready = null; this.backend = 'local';
    this.metadata = new Map(); this.queue = Promise.resolve();
    this.persistenceRequest = null; this.persistent = false;
  }
  local() { return this.storage || globalThis.localStorage; }
  enqueue(work) {
    const result = this.queue.then(work);
    this.queue = result.catch(() => {});
    return result;
  }
  init(maps = []) {
    if (!this.ready) this.ready = this.open(maps);
    return this.ready;
  }
  async open(maps) {
    try {
      if (!globalThis.indexedDB) return;
      this.db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(this.database, 1);
        let finished = false;
        const fail = () => {
          if (finished) return;
          finished = true; clearTimeout(timer);
          reject((request.readyState === 'done' ? request.error : null) || new Error('Save database unavailable'));
        };
        const timer = setTimeout(fail, 4000);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'map' });
        };
        request.onerror = fail; request.onblocked = fail;
        request.onsuccess = () => {
          if (finished) { request.result.close(); return; }
          finished = true; clearTimeout(timer); resolve(request.result);
        };
      });
      this.db.onversionchange = () => { this.db.close(); };
      const records = await this.readAll();
      for (const record of records) this.remember(record);
      this.backend = 'indexeddb';
    } catch (error) {
      this.db?.close(); this.db = null;
      console.warn('Using limited browser save storage', error);
      return;
    }
    // Never remove an old save until its IndexedDB transaction has committed.
    for (const map of maps) {
      try {
        const str = this.local().getItem(legacySaveKey(map));
        if (!str) continue;
        const data = compactSave(JSON.parse(str));
        if ((data.map || 'pnw') !== map) continue;
        const current = this.metadata.get(map)?.[0];
        if (current && (!data.savedAt || data.savedAt <= current.savedAt)) continue;
        await this.writeRecord(map, data, !!current);
        this.local().removeItem(legacySaveKey(map));
      } catch (error) { console.warn('Existing save kept for later migration', map, error); }
    }
  }
  remember(record) {
    const snapshots = Array.isArray(record.snapshots) ? record.snapshots : [];
    this.metadata.delete(record.map);
    this.metadata.set(record.map, snapshots.map(s => ({ savedAt: s.savedAt, day: s.data?.day, checksum: s.checksum })));
  }
  readAll() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, 'readonly'), request = tx.objectStore(STORE).getAll();
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error || new Error('Could not read saves'));
      tx.onerror = () => {}; // onabort reports transaction failures
    });
  }
  readRecord(map) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, 'readonly'), request = tx.objectStore(STORE).get(map);
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error || new Error('Could not read save'));
      tx.onerror = () => {};
    });
  }
  has(map) {
    if (this.metadata.get(map)?.length) return true;
    try { return !!this.local().getItem(legacySaveKey(map)); } catch { return false; }
  }
  summary(map) {
    const current = this.metadata.get(map)?.[0];
    try {
      const data = JSON.parse(this.local().getItem(legacySaveKey(map)));
      if (data && (!current || data.savedAt > current.savedAt)) return { day: data.day, savedAt: data.savedAt || 0 };
    } catch { /* IndexedDB metadata still works with blocked preferences. */ }
    return current || null;
  }
  lastMap() {
    try { const map = this.local().getItem(LAST_MAP_KEY); if (this.has(map)) return map; } catch { /* small preferences may be blocked */ }
    return [...this.metadata].reverse().sort((a, b) => (b[1][0]?.savedAt || 0) - (a[1][0]?.savedAt || 0))[0]?.[0] || 'pnw';
  }
  async candidates(map) {
    await this.init(); await this.queue;
    const record = this.db ? await this.readRecord(map) : null;
    const snapshots = Array.isArray(record?.snapshots) ? record.snapshots : [];
    try {
      const data = compactSave(JSON.parse(this.local().getItem(legacySaveKey(map))));
      if (!snapshots.length || data.savedAt > snapshots[0].savedAt) {
        return [{ data, checksum: saveChecksum(data), savedAt: data.savedAt || 0 }, ...snapshots];
      }
    } catch { /* Missing or inaccessible legacy storage does not hide database saves. */ }
    return snapshots;
  }
  write(map, data) {
    // Capture state now, before waiting for another write or database startup.
    const snapshot = structuredClone(data);
    return this.enqueue(async () => {
      await this.init();
      if (this.db) await this.writeRecord(map, snapshot);
      else this.local().setItem(legacySaveKey(map), legacyJSON(snapshot));
      // This preference is optional; failure must not turn a committed save into an error.
      try { this.local().setItem(LAST_MAP_KEY, map); } catch { /* IndexedDB metadata supplies a fallback */ }
    });
  }
  writeRecord(map, data, rotate = true) {
    const checksum = saveChecksum(data), savedAt = Date.now();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE);
      const request = store.get(map); let record, failure;
      request.onsuccess = () => {
        try {
          const previous = (Array.isArray(request.result?.snapshots) ? request.result.snapshots : []).filter(intact);
          // Frequent hidden-tab or manual saves of unchanged state keep useful backups.
          const snapshots = rotate && previous[0]?.checksum === checksum ?
            [{ ...previous[0], savedAt }, ...previous.slice(1)] :
            [{ data, checksum, savedAt }, ...(rotate ? previous : [])].slice(0, KEEP);
          record = { map, snapshots }; store.put(record);
        } catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => { this.remember(record); resolve(); };
      tx.onabort = () => reject(failure || tx.error || new Error('Save did not finish'));
      tx.onerror = () => {};
    });
  }
  clear(map) {
    return this.enqueue(async () => {
      await this.init();
      if (this.db) await new Promise((resolve, reject) => {
        const tx = this.db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(map);
        tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || new Error('Could not replace save')); tx.onerror = () => {};
      });
      this.metadata.delete(map);
      try { this.local().removeItem(legacySaveKey(map)); } catch (error) { if (!this.db) throw error; }
    });
  }
  requestPersistence() {
    if (!this.persistenceRequest) this.persistenceRequest = (async () => {
      try {
        const storage = globalThis.navigator?.storage;
        this.persistent = !!(await storage?.persisted?.() || await storage?.persist?.());
      } catch { /* Persistence is optional; normal saves still work. */ }
      return this.persistent;
    })();
    return this.persistenceRequest;
  }
}

export const saves = new BrowserSaves();
