/**
 * Stage B opportunity-candidate draft.
 *
 * A reviewable indication of a possible need — never a verified need,
 * solicitation permission, assignment, or price (docs/ARCHITECTURE.md).
 * "verified" exists in the status vocabulary but is unreachable without
 * an explicit evidenceRef AND a named authority string; the Stage B UI
 * does not expose that transition at all.
 */

export const CANDIDATE_SCHEMA_VERSION = "h1-geo/opportunity-candidate-v0";
export const CANDIDATE_STORE_KEY = "h1geo.stageb.candidates.v1";

export const CANDIDATE_STATUSES = Object.freeze(["unverified", "needs_review", "verified"]);

const ALLOWED_TRANSITIONS = Object.freeze({
  unverified: ["needs_review"],
  needs_review: ["unverified", "verified"],
  verified: [],
});

const SUMMARY_MAX_LENGTH = 500;

function fail(errors, field, message) {
  errors.push({ field, message });
}

export function createCandidate({ assertionId, observationId = null, summary, capturedAt = new Date().toISOString() }) {
  return {
    schemaVersion: CANDIDATE_SCHEMA_VERSION,
    assertionId,
    observationId,
    summary,
    status: "unverified",
    capturedAt,
  };
}

export function validateCandidate(value) {
  const errors = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(errors, "", "must be an object");
    return { valid: false, errors };
  }
  if (value.schemaVersion !== CANDIDATE_SCHEMA_VERSION) {
    fail(errors, "schemaVersion", `must equal "${CANDIDATE_SCHEMA_VERSION}"`);
  }
  if (typeof value.assertionId !== "string" || value.assertionId.length < 1) {
    fail(errors, "assertionId", "must reference a saved assertion");
  }
  if (value.observationId !== null && (typeof value.observationId !== "string" || value.observationId.length < 1)) {
    fail(errors, "observationId", "must be null or reference a saved observation");
  }
  if (typeof value.summary !== "string" || value.summary.length < 1) {
    fail(errors, "summary", "must be a non-empty string");
  } else if ([...value.summary].length > SUMMARY_MAX_LENGTH) {
    fail(errors, "summary", `must be at most ${SUMMARY_MAX_LENGTH} characters`);
  }
  if (!CANDIDATE_STATUSES.includes(value.status)) {
    fail(errors, "status", `must be one of: ${CANDIDATE_STATUSES.join(", ")}`);
  }
  if (typeof value.capturedAt !== "string" || Number.isNaN(Date.parse(value.capturedAt))) {
    fail(errors, "capturedAt", "must be a date-time string");
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Attempt a status transition. Returns { ok, candidate } or { ok:false, errors }.
 * Verification requires BOTH an evidenceRef and an explicit named authority —
 * "insufficient evidence must produce an honest unavailable or unverified state."
 */
export function transitionCandidateStatus(candidate, toStatus, { evidenceRef = null, authority = null } = {}) {
  const check = validateCandidate(candidate);
  if (!check.valid) return { ok: false, errors: check.errors };
  if (!CANDIDATE_STATUSES.includes(toStatus)) {
    return { ok: false, errors: [{ field: "status", message: `unknown status "${toStatus}"` }] };
  }
  if (!(ALLOWED_TRANSITIONS[candidate.status] ?? []).includes(toStatus)) {
    return {
      ok: false,
      errors: [{ field: "status", message: `cannot move from "${candidate.status}" to "${toStatus}"` }],
    };
  }
  if (toStatus === "verified") {
    if (typeof evidenceRef !== "string" || !/\S/.test(evidenceRef)) {
      return { ok: false, errors: [{ field: "evidenceRef", message: "verification requires an explicit evidence reference" }] };
    }
    if (typeof authority !== "string" || !/\S/.test(authority)) {
      return { ok: false, errors: [{ field: "authority", message: "verification requires a named authority" }] };
    }
    return { ok: true, candidate: { ...candidate, status: "verified", verifiedBy: authority, verifiedEvidenceRef: evidenceRef } };
  }
  return { ok: true, candidate: { ...candidate, status: toStatus } };
}
