/**
 * GEO-010 end-to-end workflow layer: a plain-language progress model over
 * the existing stores, plus a labeled synthetic H1 example scenario.
 * Everything here is computed from the stores — no parallel state.
 */

import { SCHEMA_VERSION, CRS } from "../coordinate-assertion.js";
import { createObservation } from "./observation.js";
import { createCandidate } from "./candidate.js";
import { createEvidenceLink } from "./evidence.js";
import { resolveReviewState } from "./handoff.js";
import { fingerprint } from "./fingerprint.js";
import { assessHandoffReadiness } from "./vnn-dryrun.js";

/**
 * A record is synthetic when the example loader marked it — via the
 * h1geo://example provenance prefix or an explicit SYNTHETIC tag in its
 * human-readable text fields. Real observations are simply unmarked.
 */
export function isSyntheticRecord(record) {
  if (!record || typeof record !== "object") return false;
  const haystack = [record.provenanceRef, record.notes, record.summary,
    record.title, record.condition, record.proposedWork]
    .filter((v) => typeof v === "string").join("\n");
  return /synthetic|h1geo:\/\/example/i.test(haystack);
}

export const STAGE_LABELS = [
  "Save a location",
  "Record an observation",
  "Attach evidence references",
  "Draft the opportunity",
  "Review & approve",
  "Generate the package",
  "Sign & verify trust",
  "Confirm the export",
];

/** Plain-language explanations for review/package states. */
export const STATE_TEXT = {
  unreviewed: "Not yet reviewed — a named reviewer must approve or decline.",
  approved: "Approved — a reviewer signed off on this exact draft version.",
  declined: "Declined — a reviewer rejected this draft version.",
  stale: "Changed after approval — the earlier approval no longer covers it; a fresh review is required.",
};

/**
 * Compute the workflow state from the stores. Returns per-stage
 * {done, detail} plus counts and a plain-language summary for the
 * "where you are" strip. Pure — no writes.
 */
export function workflowStatus(stores, selectedId = null) {
  const {
    assertionStore, observationStore, evidenceStore, candidateStore,
    handoffStore, packageStore, signatureStore, exportStore,
  } = stores;
  const assertions = assertionStore.list();
  const selected = selectedId ? assertionStore.get(selectedId) : null;
  const observations = selected
    ? observationStore.list().filter((o) => o.record.assertionId === selectedId)
    : [];
  const evidenceLinks = selected
    ? evidenceStore.linksForAssertionTree(selectedId)
    : [];
  const candidates = selected
    ? candidateStore.list().filter((c) => c.record.assertionId === selectedId)
    : candidateStore.list();

  const draftStates = candidates.map((c) => {
    const assertionEntry = assertionStore.get(c.record.assertionId);
    const missing = assessHandoffReadiness({
      candidate: c.record, assertion: assertionEntry ? assertionEntry.record : null,
    });
    const review = resolveReviewState(
      handoffStore.forDraft(c.id), fingerprint(c.record));
    const packages = packageStore
      ? packageStore.list().filter((p) => p.record.content?.draftId === c.id)
      : [];
    const signatures = packages.length && signatureStore
      ? signatureStore.list().filter((s) =>
          packages.some((p) => p.record.sha256 === s.record.signedHash))
      : [];
    const exports = packages.length && exportStore
      ? exportStore.list().filter((e) =>
          packages.some((p) => p.record.sha256 === e.record.packageRef?.sha256))
      : [];
    return {
      id: c.id, candidate: c.record, missing,
      review, packages, signatures, exports,
    };
  });

  const approved = draftStates.some((d) => d.review.state === "approved");
  const packaged = draftStates.some((d) => d.packages.length > 0);
  const signed = draftStates.some((d) => d.signatures.length > 0);
  const exported = draftStates.some((d) => d.exports.length > 0);
  const intakeComplete = draftStates.some((d) => d.missing.length === 0);

  const stages = [
    { done: assertions.length > 0,
      detail: assertions.length ? `${assertions.length} saved` : "click the map or enter coordinates" },
    { done: observations.length > 0,
      detail: selected ? (observations.length ? `${observations.length} recorded` : "describe what you see") : "select a saved pin first" },
    { done: evidenceLinks.length > 0,
      detail: selected ? (evidenceLinks.length ? `${evidenceLinks.length} linked` : "optional but recommended") : "select a saved pin first" },
    { done: intakeComplete || draftStates.length > 0,
      detail: draftStates.length
        ? (intakeComplete ? "intake fields complete" : `missing: ${[...new Set(draftStates.flatMap((d) => d.missing))].join(", ")}`)
        : "create a draft from a saved pin" },
    { done: approved,
      detail: draftStates.length
        ? STATE_TEXT[draftStates[0].review.state] || draftStates[0].review.state
        : "needs a draft first" },
    { done: packaged,
      detail: packaged ? `${draftStates.reduce((n, d) => n + d.packages.length, 0)} generated` : "approve a draft first" },
    { done: signed,
      detail: signed ? "signed & verifiable" : "optional trust layer — generate a key, sign the package" },
    { done: exported,
      detail: exported ? "export record stored (still local, not submitted)" : "preview then confirm the export" },
  ];

  let summary;
  if (!assertions.length) summary = "Start here: place a pin on the map and save it.";
  else if (!observations.length) summary = "Pin saved. Next: record what you observed at this location.";
  else if (!draftStates.length) summary = "Observation recorded. Next: create an opportunity draft.";
  else if (!approved) summary = "Draft exists — fill the VNN intake fields, then a named reviewer approves it.";
  else if (!packaged) summary = "Approved. Next: generate the handoff package and verify its digest.";
  else if (!signed) summary = "Package ready. Optionally sign it, then preview the VNN export.";
  else if (!exported) summary = "Signed. Preview the VNN export record and confirm it — still local only.";
  else summary = "Complete: approved, packaged, signed, and a confirmed local export record.";

  return { assertions, observations, evidenceLinks, draftStates, stages, summary };
}

/**
 * Flat, filterable view of every draft across all locations — the
 * "drafts overview" model. Each row carries location coords, evidence
 * completeness, review state, and package/sign/export presence.
 */
export function draftIndex(stores) {
  const {
    assertionStore, candidateStore, evidenceStore, handoffStore,
    packageStore, signatureStore, exportStore, observationStore,
  } = stores;
  return candidateStore.list().map((c) => {
    const a = assertionStore.get(c.record.assertionId);
    const obsIds = new Set(
      observationStore.list().filter((o) => o.record.assertionId === c.record.assertionId).map((o) => o.id));
    const evidenceCount = evidenceStore.list().filter((e) =>
      (e.record.targetType === "assertion" && e.record.targetId === c.record.assertionId) ||
      (e.record.targetType === "observation" && obsIds.has(e.record.targetId))).length;
    const assertion = a ? a.record : null;
    const missing = assessHandoffReadiness({ candidate: c.record, assertion });
    const review = resolveReviewState(handoffStore.forDraft(c.id), fingerprint(c.record));
    const pkgs = packageStore ? packageStore.list().filter((p) => p.record.content?.draftId === c.id) : [];
    const sigs = signatureStore ? signatureStore.list().filter((s) =>
      pkgs.some((p) => p.record.sha256 === s.record.signedHash)) : [];
    const exps = exportStore ? exportStore.list().filter((e) =>
      pkgs.some((p) => p.record.sha256 === e.record.packageRef?.sha256)) : [];
    return {
      id: c.id, candidate: c.record, assertion,
      latitude: assertion ? assertion.latitude : null,
      longitude: assertion ? assertion.longitude : null,
      evidenceCount, missing, review,
      packages: pkgs, signatures: sigs, exports: exps,
      synthetic: isSyntheticRecord(c.record) || (assertion ? isSyntheticRecord(assertion) : false),
    };
  });
}

/**
 * Filter a draftIndex result.
 *   { status: "all"|"unreviewed"|"approved"|"declined"|"stale",
 *     evidence: "all"|"linked"|"none",
 *     assertionId: null | id (scope to one location),
 *     query: substring over title/summary/coords }
 */
export function filterDrafts(rows, { status = "all", evidence = "all", assertionId = null, query = "" } = {}) {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => {
    if (assertionId && r.candidate.assertionId !== assertionId) return false;
    if (status !== "all" && r.review.state !== status) return false;
    if (evidence === "linked" && r.evidenceCount === 0) return false;
    if (evidence === "none" && r.evidenceCount > 0) return false;
    if (q) {
      const hay = [r.candidate.title, r.candidate.summary,
        r.latitude, r.longitude].filter((v) => v !== null && v !== undefined)
        .join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/**
 * Load the labeled synthetic H1 example: a storm-damaged fence at a
 * residential lot — an H1 service opportunity end to end through the
 * EXISTING stores (no parallel logic). Everything is marked synthetic
 * via provenanceRef, note text, and the returned descriptor.
 */
export function loadH1ExampleScenario(stores) {
  const { assertionStore, observationStore, evidenceStore, candidateStore } = stores;
  const errors = [];
  const push = (r, what) => {
    if (r.ok === false) errors.push({ what, errors: r.errors });
    return r;
  };

  const pin = push(assertionStore.save({
    schemaVersion: SCHEMA_VERSION,
    latitude: 33.75904, longitude: -84.39313, crs: CRS,
    source: "manual_target_pin",
    capturedAt: new Date().toISOString(),
    accuracyMeters: null,
    provenanceRef: "h1geo://example/synthetic-fence",
    notes: "SYNTHETIC example — residential lot, north fence line",
  }), "assertion");

  const obs = push(observationStore.save(createObservation({
    assertionId: pin.id,
    summary: "SYNTHETIC: ~12 ft of cedar perimeter fence leaning ~15 deg after storm; two posts cracked at base.",
  })), "observation");

  push(evidenceStore.save(createEvidenceLink({
    targetType: "observation", targetId: obs.id,
    kind: "snapntalk_capture",
    reference: "cap_a5b1c2d3-e4f5-4678-89ab-cdef01234567",
    note: "SYNTHETIC capture reference",
  })), "evidence cap");
  push(evidenceStore.save(createEvidenceLink({
    targetType: "assertion", targetId: pin.id,
    kind: "document",
    reference: "h1geo://example/synthetic-property-survey",
    note: "SYNTHETIC lot survey reference",
  })), "evidence doc");

  const draft = push(candidateStore.save(createCandidate({
    assertionId: pin.id, observationId: obs.id,
    summary: "SYNTHETIC: fence repair opportunity",
  })), "draft");
  candidateStore.update(draft.id, {
    ...candidateStore.get(draft.id).record,
    title: "Repair storm-damaged perimeter fence",
    condition: "Fence leaning ~15 deg; two posts cracked at base",
    proposedWork: "Reset two posts, re-seat 12 ft of cedar fencing",
    requestedTiming: "within two weeks",
    requiredCapabilities: ["fencing"],
    evidenceRequirements: "photos of posts and panel before/after",
    offeredAmount: 450, currency: "USD", amountCertainty: "approximate",
  });

  if (errors.length) return { ok: false, errors };
  return {
    ok: true, synthetic: true,
    assertionId: pin.id, observationId: obs.id, draftId: draft.id,
    label: "H1 example (synthetic): storm-damaged residential fence — "
      + "pin, observation, evidence refs, and a completed draft are loaded. "
      + "Next: review & approve it (step 5), then package → sign → export.",
  };
}
