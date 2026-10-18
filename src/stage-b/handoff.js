/**
 * GEO-007 handoff records — the stable, reviewable artifact of an
 * approve/decline decision on an opportunity draft.
 *
 * A record binds the decision to an exact draft version via its
 * fingerprint: editing the draft afterward makes the approval stale and
 * a new review is required. Approved records carry the exact payload
 * snapshot that was reviewed. Records are append-only — a changed mind
 * is a new record, never an edit of history.
 */

import { fingerprint } from "./fingerprint.js";

export const HANDOFF_SCHEMA_VERSION = "h1-geo/handoff-record-v0";
export const HANDOFF_STORE_KEY = "h1geo.stageb.handoffs.v1";

export const DECISIONS = Object.freeze(["approved", "declined"]);

function fail(errors, field, message) {
  errors.push({ field, message });
}

export function createHandoffRecord({ draftId, candidate, payload, decision, decidedBy, decidedAt = new Date().toISOString() }) {
  return {
    schemaVersion: HANDOFF_SCHEMA_VERSION,
    draftId,
    decision,
    decidedBy,
    decidedAt,
    draftFingerprint: fingerprint(candidate),
    missingAtDecision: payload?.missing ?? [],
    payload: decision === "approved" ? payload : null,
  };
}

export function validateHandoffRecord(value) {
  const errors = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(errors, "", "must be an object");
    return { valid: false, errors };
  }
  if (value.schemaVersion !== HANDOFF_SCHEMA_VERSION) {
    fail(errors, "schemaVersion", `must equal "${HANDOFF_SCHEMA_VERSION}"`);
  }
  if (typeof value.draftId !== "string" || value.draftId.length < 1) {
    fail(errors, "draftId", "must reference a saved draft");
  }
  if (!DECISIONS.includes(value.decision)) {
    fail(errors, "decision", `must be one of: ${DECISIONS.join(", ")}`);
  }
  if (typeof value.decidedBy !== "string" || !/\S/.test(value.decidedBy)) {
    fail(errors, "decidedBy", "requires a named human reviewer");
  }
  if (typeof value.decidedAt !== "string" || Number.isNaN(Date.parse(value.decidedAt))) {
    fail(errors, "decidedAt", "must be a date-time string");
  }
  if (typeof value.draftFingerprint !== "string" || value.draftFingerprint.length < 1) {
    fail(errors, "draftFingerprint", "must carry the reviewed draft fingerprint");
  }
  if (!Array.isArray(value.missingAtDecision)) {
    fail(errors, "missingAtDecision", "must be an array");
  }
  if (value.decision === "approved") {
    if (typeof value.payload !== "object" || value.payload === null || value.payload.dryRun !== true) {
      fail(errors, "payload", "an approved record must snapshot the exact dry-run payload");
    }
  } else if (value.payload !== null) {
    fail(errors, "payload", "a declined record carries no payload");
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Resolve the current review state of a draft from its handoff records.
 * state: "unreviewed" | "approved" | "declined" | "stale"
 * A record is stale when the draft's fingerprint no longer matches the
 * reviewed version — post-decision edits require a new review.
 */
export function resolveReviewState(handoffEntries, currentFingerprint) {
  const latest = handoffEntries.at(-1);
  if (!latest) return { state: "unreviewed", record: null };
  if (latest.record.draftFingerprint !== currentFingerprint) {
    return { state: "stale", record: latest.record };
  }
  return { state: latest.record.decision, record: latest.record };
}
