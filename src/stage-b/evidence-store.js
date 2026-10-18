/**
 * Evidence-link store: generic record store + a target-existence guard.
 * A link may only be saved when its target record actually exists —
 * no dangling references to assertions or observations that aren't there.
 */

import { EVIDENCE_STORE_KEY, validateEvidenceLink } from "./evidence.js";
import { createRecordStore } from "./record-store.js";

export function createEvidenceStore(storage, { assertionStore, observationStore }) {
  const inner = createRecordStore({
    storage,
    key: EVIDENCE_STORE_KEY,
    validate: validateEvidenceLink,
    idPrefix: "evd",
  });

  function targetExists(link) {
    const store = link.targetType === "assertion" ? assertionStore : observationStore;
    return store.get(link.targetId) !== null;
  }

  function linksFor(targetType, targetId) {
    return inner.list().filter((e) => e.record.targetType === targetType && e.record.targetId === targetId);
  }

  /** All links for an assertion plus every observation attached to it. */
  function linksForAssertionTree(assertionId) {
    const direct = linksFor("assertion", assertionId);
    const obsIds = new Set(
      observationStore.list()
        .filter((o) => o.record.assertionId === assertionId)
        .map((o) => o.id),
    );
    const viaObs = inner.list().filter((e) => e.record.targetType === "observation" && obsIds.has(e.record.targetId));
    return [...direct, ...viaObs];
  }

  return {
    ...inner,
    linksFor,
    linksForAssertionTree,

    save(link, opts) {
      const check = validateEvidenceLink(link);
      if (!check.valid) return { ok: false, errors: check.errors };
      if (!targetExists(link)) {
        return { ok: false, errors: [{ field: "targetId", message: `no saved ${link.targetType} with that id` }] };
      }
      return inner.save(link, opts);
    },
  };
}
