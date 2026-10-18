/**
 * GEO-012 operational pilot layer: feedback records bound to workflow
 * steps or geographic records, per-draft next actions, and the pilot
 * report with a hard real/synthetic split.
 */

import { createRecordStore } from "./record-store.js";
import { validateCoordinateAssertion } from "../coordinate-assertion.js";
import { isSyntheticRecord, draftIndex, STAGE_LABELS } from "./workflow.js";
import { resolveReviewState } from "./handoff.js";
import { fingerprint } from "./fingerprint.js";

export const FEEDBACK_SCHEMA_VERSION = "h1-geo/pilot-feedback-v0";
export const FEEDBACK_STORE_KEY = "h1geo.stageb.feedback.v1";
export const FEEDBACK_KINDS = Object.freeze(["worked", "confusing", "failed", "improve"]);
export const FEEDBACK_TARGETS = Object.freeze(["none", "assertion", "observation", "draft", "package", "workflow_step"]);

export function createFeedback({ kind, body, targetType = "none", targetId = null,
  step = null, createdAt = new Date().toISOString() }) {
  return {
    schemaVersion: FEEDBACK_SCHEMA_VERSION,
    kind, body, targetType, targetId, step, createdAt,
  };
}

export function validateFeedback(value) {
  const errors = [];
  const fail = (field, message) => errors.push({ field, message });
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("", "must be an object");
    return { valid: false, errors };
  }
  if (value.schemaVersion !== FEEDBACK_SCHEMA_VERSION) {
    fail("schemaVersion", `must equal "${FEEDBACK_SCHEMA_VERSION}"`);
  }
  if (!FEEDBACK_KINDS.includes(value.kind)) {
    fail("kind", `must be ${FEEDBACK_KINDS.join("|")}`);
  }
  if (typeof value.body !== "string" || !/\S/.test(value.body) || value.body.length > 2000) {
    fail("body", "required, at most 2000 chars");
  }
  if (!FEEDBACK_TARGETS.includes(value.targetType)) {
    fail("targetType", `must be ${FEEDBACK_TARGETS.join("|")}`);
  }
  if (value.targetType === "none" && value.targetId !== null) {
    fail("targetId", "must be null when targetType is none");
  }
  if (value.targetType === "workflow_step" &&
      (typeof value.step !== "number" || value.step < 1 || value.step > STAGE_LABELS.length)) {
    fail("step", `must be 1..${STAGE_LABELS.length} for workflow_step feedback`);
  }
  if (["assertion", "observation", "draft", "package"].includes(value.targetType) &&
      (typeof value.targetId !== "string" || !value.targetId)) {
    fail("targetId", "required for a record-targeted feedback");
  }
  if (typeof value.createdAt !== "string" || Number.isNaN(Date.parse(value.createdAt))) {
    fail("createdAt", "must be a date-time string");
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Feedback store with a target-existence guard: record-targeted
 * feedback must point at something that actually exists.
 */
export function createFeedbackStore(storage, stores) {
  const inner = createRecordStore({
    storage, key: FEEDBACK_STORE_KEY, validate: validateFeedback, idPrefix: "fbk",
  });
  const targetStore = (t) => ({
    assertion: stores.assertionStore,
    observation: stores.observationStore,
    draft: stores.candidateStore,
    package: stores.packageStore,
  }[t] || null);
  return {
    ...inner,
    save(record, opts) {
      const check = validateFeedback(record);
      if (!check.valid) return { ok: false, errors: check.errors };
      const ts = targetStore(record.targetType);
      if (ts && ts.get(record.targetId) === null) {
        return { ok: false, errors: [{ field: "targetId", message: `no saved ${record.targetType} with that id` }] };
      }
      return inner.save(record, opts);
    },
  };
}

/** Plain-language next action for a draftIndex row. */
export function nextAction(row) {
  if (row.review.state === "declined") return "declined — edit the draft or leave it closed";
  if (row.review.state === "stale") return "re-review required — the draft changed after approval";
  if (row.review.state === "unreviewed") {
    return row.missing.length
      ? `fill intake fields (${row.missing.join(", ")}), then a named reviewer approves`
      : "ready for review — a named reviewer approves or declines";
  }
  if (!row.packages.length) return "generate the handoff package";
  if (!row.signatures.length) return "optionally sign the package, then preview the export";
  if (!row.exports.length) return "preview + confirm the VNN export record";
  return "complete — prepared locally, not submitted";
}

/**
 * Pilot report — actual counts, real vs. synthetic separated.
 * Child records inherit synthetic-ness from their location: a draft or
 * observation on a synthetic pin is synthetic evidence, not real work.
 */
export function pilotReport(stores, { now = new Date().toISOString() } = {}) {
  const {
    assertionStore, observationStore, evidenceStore, candidateStore,
    handoffStore, packageStore, signatureStore, exportStore, feedbackStore,
    confirmStore,
  } = stores;
  const assertions = assertionStore.list();
  const syntheticAssertions = new Set(
    assertions.filter((a) => isSyntheticRecord(a.record)).map((a) => a.id));
  const split = (entries, getRec, extra = () => false) => ({
    total: entries.length,
    synthetic: entries.filter((e) => isSyntheticRecord(getRec(e)) || extra(e)).length,
    real: entries.filter((e) => !isSyntheticRecord(getRec(e)) && !extra(e)).length,
  });
  const obsAssertion = (e) => syntheticAssertions.has(e.record.assertionId);
  const candAssertion = (e) => syntheticAssertions.has(e.record.assertionId);

  const rows = draftIndex(stores);
  const reviewStates = {};
  for (const r of rows) reviewStates[r.review.state] = (reviewStates[r.review.state] || 0) + 1;

  const fb = feedbackStore ? feedbackStore.list() : [];
  const feedbackByKind = {};
  for (const k of FEEDBACK_KINDS) feedbackByKind[k] = 0;
  for (const e of fb) feedbackByKind[e.record.kind] = (feedbackByKind[e.record.kind] || 0) + 1;

  return {
    generatedAt: now,
    locations: split(assertions, (e) => e.record),
    observations: split(observationStore.list(), (e) => e.record, obsAssertion),
    evidenceLinks: split(evidenceStore.list(), (e) => e.record),
    drafts: split(candidateStore.list(), (e) => e.record, candAssertion),
    approvals: {
      approved: reviewStates.approved || 0,
      declined: reviewStates.declined || 0,
      stale: reviewStates.stale || 0,
      unreviewed: reviewStates.unreviewed || 0,
    },
    packages: packageStore ? packageStore.list().length : 0,
    signatures: signatureStore ? signatureStore.list().length : 0,
    exports: exportStore ? exportStore.list().length : 0,
    feedback: { total: fb.length, byKind: feedbackByKind },
    confirmations: confirmStore ? confirmStore.list().length : 0,
    nextActions: rows.map((r) => ({ draftId: r.id, title: r.candidate.title || r.candidate.summary, action: nextAction(r) })),
  };
}

export { STAGE_LABELS };
