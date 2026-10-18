/**
 * Persisted coordinate-assertion store for the Stage B slice.
 *
 * Wraps the generic record store with the Stage A contract validator and
 * adds a provenance guard: an existing assertion's capturedAt and
 * provenanceRef can never be changed by an update. Editing a position is
 * an explicit, visible act — the UI moves source to "refined_manual" —
 * never an invisible rewrite of where the assertion came from.
 */

import { validateCoordinateAssertion } from "../coordinate-assertion.js";
import { createRecordStore } from "./record-store.js";

export const ASSERTION_STORE_KEY = "h1geo.stageb.assertions.v1";

export function createAssertionStore(storage) {
  const inner = createRecordStore({
    storage,
    key: ASSERTION_STORE_KEY,
    validate: validateCoordinateAssertion,
    idPrefix: "asrt",
  });

  return {
    ...inner,

    update(id, assertion) {
      const existing = inner.get(id);
      if (!existing) return { ok: false, errors: [{ field: "id", message: "assertion not found" }] };

      const prior = existing.record;
      const provenanceErrors = [];
      if (assertion.capturedAt !== prior.capturedAt) {
        provenanceErrors.push({ field: "capturedAt", message: "cannot change capture time of an existing assertion" });
      }
      if (assertion.provenanceRef !== prior.provenanceRef) {
        provenanceErrors.push({ field: "provenanceRef", message: "cannot change provenance of an existing assertion" });
      }
      if (provenanceErrors.length) return { ok: false, errors: provenanceErrors };

      return inner.update(id, assertion);
    },
  };
}
