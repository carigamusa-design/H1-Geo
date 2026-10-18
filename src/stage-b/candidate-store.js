/**
 * Candidate store: draft editing must not silently rewire relationships.
 * assertionId/observationId are fixed at creation — same discipline as the
 * assertion provenance guard.
 */

import { CANDIDATE_STORE_KEY, validateCandidate } from "./candidate.js";
import { createRecordStore } from "./record-store.js";

export function createCandidateStore(storage) {
  const inner = createRecordStore({
    storage,
    key: CANDIDATE_STORE_KEY,
    validate: validateCandidate,
    idPrefix: "cand",
  });

  return {
    ...inner,

    update(id, candidate) {
      const existing = inner.get(id);
      if (!existing) return { ok: false, errors: [{ field: "id", message: "candidate not found" }] };
      const prior = existing.record;
      const relErrors = [];
      if (candidate.assertionId !== prior.assertionId) {
        relErrors.push({ field: "assertionId", message: "cannot rewire a draft to a different assertion" });
      }
      if (candidate.observationId !== prior.observationId) {
        relErrors.push({ field: "observationId", message: "cannot rewire a draft to a different observation" });
      }
      if (relErrors.length) return { ok: false, errors: relErrors };
      return inner.update(id, candidate);
    },
  };
}
