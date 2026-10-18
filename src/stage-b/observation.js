/**
 * Stage B observation draft — a time-bounded note associated with a saved
 * geographic assertion.
 *
 * This is an internal draft record, not a SnapN'Talk capture. SnapN'Talk
 * retains capture authority; evidenceRef may only *name* a SnapN'Talk
 * captureId/packageId. No media bytes or paths ever enter this record.
 */

export const OBSERVATION_SCHEMA_VERSION = "h1-geo/observation-ref-v0";
export const OBSERVATION_STORE_KEY = "h1geo.stageb.observations.v1";

const SUMMARY_MAX_LENGTH = 500;

function fail(errors, field, message) {
  errors.push({ field, message });
}

export function createObservation({ assertionId, summary, evidenceRef = null, capturedAt = new Date().toISOString() }) {
  return {
    schemaVersion: OBSERVATION_SCHEMA_VERSION,
    assertionId,
    summary,
    evidenceRef,
    status: "draft",
    capturedAt,
  };
}

export function validateObservation(value) {
  const errors = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(errors, "", "must be an object");
    return { valid: false, errors };
  }
  if (value.schemaVersion !== OBSERVATION_SCHEMA_VERSION) {
    fail(errors, "schemaVersion", `must equal "${OBSERVATION_SCHEMA_VERSION}"`);
  }
  if (typeof value.assertionId !== "string" || value.assertionId.length < 1) {
    fail(errors, "assertionId", "must reference a saved assertion");
  }
  if (typeof value.summary !== "string" || value.summary.length < 1) {
    fail(errors, "summary", "must be a non-empty string");
  } else if ([...value.summary].length > SUMMARY_MAX_LENGTH) {
    fail(errors, "summary", `must be at most ${SUMMARY_MAX_LENGTH} characters`);
  }
  if (value.evidenceRef !== null && (typeof value.evidenceRef !== "string" || !/\S/.test(value.evidenceRef))) {
    fail(errors, "evidenceRef", "must be null or a non-empty SnapN'Talk capture reference");
  }
  if (value.status !== "draft") {
    fail(errors, "status", 'must be "draft" in Stage B');
  }
  if (typeof value.capturedAt !== "string" || Number.isNaN(Date.parse(value.capturedAt))) {
    fail(errors, "capturedAt", "must be a date-time string");
  }
  return { valid: errors.length === 0, errors };
}
