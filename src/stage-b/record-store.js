/**
 * Generic validated record store over a key/value backend.
 *
 * The backend is anything shaped like localStorage (getItem/setItem/
 * removeItem) or the in-memory shim from memoryStorage(). Records are
 * validated on every save and re-validated on every load: corrupted or
 * stale entries are quarantined into a separate key and surfaced through
 * health(), never silently repaired or dropped without a trace.
 */

export function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    _dump: () => Object.fromEntries(data),
  };
}

function newId(prefix) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {{ storage: object, key: string, validate: (v:any)=>({valid:boolean,errors:Array}), idPrefix: string }} opts
 */
export function createRecordStore({ storage, key, validate, idPrefix }) {
  const quarantineKey = `${key}.quarantine`;

  function readRaw() {
    const raw = storage.getItem(key);
    if (raw === null) return { envelope: null, raw };
    try {
      return { envelope: JSON.parse(raw), raw };
    } catch {
      // Corrupted payload: quarantine the raw bytes, start clean.
      storage.setItem(quarantineKey, raw);
      storage.removeItem(key);
      return { envelope: null, raw, corrupted: true };
    }
  }

  function loadRecords() {
    const { envelope, corrupted } = readRaw();
    const result = { records: {}, invalid: [], corrupted: Boolean(corrupted) };
    if (!envelope || typeof envelope !== "object" || envelope.version !== 1 || typeof envelope.records !== "object") {
      if (envelope !== null) {
        storage.setItem(quarantineKey, JSON.stringify(envelope));
        storage.removeItem(key);
        result.corrupted = true;
      }
      return result;
    }
    for (const [id, entry] of Object.entries(envelope.records)) {
      const check = validate(entry.record);
      if (check.valid && typeof entry.savedAt === "string" && typeof entry.updatedAt === "string") {
        result.records[id] = entry;
      } else {
        result.invalid.push({ id, errors: check.errors });
      }
    }
    if (result.invalid.length) {
      const prior = storage.getItem(quarantineKey);
      const quarantined = prior ? JSON.parse(prior) : {};
      storage.setItem(quarantineKey, JSON.stringify({ ...quarantined, invalidEntries: result.invalid }));
    }
    return result;
  }

  function persist(records) {
    storage.setItem(key, JSON.stringify({ version: 1, records }));
  }

  function health() {
    const state = loadRecords();
    const quarantined = storage.getItem(quarantineKey) !== null;
    return {
      corrupted: state.corrupted || quarantined,
      invalidEntryCount: state.invalid.length,
      quarantineKey: quarantined ? quarantineKey : null,
    };
  }

  return {
    key,

    save(record, { id } = {}) {
      const check = validate(record);
      if (!check.valid) return { ok: false, errors: check.errors };
      const state = loadRecords();
      const recordId = id ?? newId(idPrefix);
      const now = new Date().toISOString();
      const existing = state.records[recordId];
      state.records[recordId] = {
        record,
        savedAt: existing ? existing.savedAt : now,
        updatedAt: now,
      };
      persist(state.records);
      return { ok: true, id: recordId };
    },

    update(id, record) {
      const state = loadRecords();
      const existing = state.records[id];
      if (!existing) return { ok: false, errors: [{ field: "id", message: "record not found" }] };
      const check = validate(record);
      if (!check.valid) return { ok: false, errors: check.errors };
      existing.record = record;
      existing.updatedAt = new Date().toISOString();
      persist(state.records);
      return { ok: true, id };
    },

    get(id) {
      return loadRecords().records[id] ?? null;
    },

    list() {
      const state = loadRecords();
      return Object.entries(state.records)
        .map(([id, entry]) => ({ id, ...entry }))
        .sort((a, b) => a.savedAt.localeCompare(b.savedAt));
    },

    remove(id) {
      const state = loadRecords();
      if (!(id in state.records)) return false;
      delete state.records[id];
      persist(state.records);
      return true;
    },

    health,
  };
}
