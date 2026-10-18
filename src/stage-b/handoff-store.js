/**
 * Handoff-record store: append-only. Decisions are history — a changed
 * review is a new record, never an edit. Save requires the referenced
 * draft to exist.
 */

import { HANDOFF_STORE_KEY, validateHandoffRecord } from "./handoff.js";
import { createRecordStore } from "./record-store.js";

export function createHandoffStore(storage, { candidateStore }) {
  const inner = createRecordStore({
    storage,
    key: HANDOFF_STORE_KEY,
    validate: validateHandoffRecord,
    idPrefix: "hof",
  });

  return {
    key: inner.key,
    get: inner.get,
    list: inner.list,
    remove: inner.remove,
    health: inner.health,

    forDraft(draftId) {
      return inner.list().filter((e) => e.record.draftId === draftId);
    },

    save(record) {
      const check = validateHandoffRecord(record);
      if (!check.valid) return { ok: false, errors: check.errors };
      if (candidateStore.get(record.draftId) === null) {
        return { ok: false, errors: [{ field: "draftId", message: "no saved draft with that id" }] };
      }
      return inner.save(record);
    },

    update() {
      return { ok: false, errors: [{ field: "", message: "handoff records are append-only; record a new decision instead" }] };
    },
  };
}
