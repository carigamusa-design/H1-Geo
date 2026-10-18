/**
 * Candidate → VNN-compatible dry-run payload mapper.
 *
 * Produces the *shape* an H1-VNN intake/discovery record would consume —
 * text location (VNN stores location as a string, max 300 chars) plus an
 * explicit provenance reference — marked dryRun so it can never be
 * mistaken for a live mission request. Stage B performs zero network
 * calls and zero VNN writes; this payload is preview/fixture material.
 */

export const VNN_DRYRUN_SCHEMA_VERSION = "h1-geo/vnn-dryrun-v0";

const VNN_LOCATION_MAX_LENGTH = 300; // H1-VNN: location Optional[str], max_length=300

function fail(errors, field, message) {
  errors.push({ field, message });
}

export function buildVnnDryRunPayload({ candidate, assertion }) {
  const location = `${assertion.latitude},${assertion.longitude}`;
  return {
    schemaRef: VNN_DRYRUN_SCHEMA_VERSION,
    dryRun: true,
    location,
    reason: candidate.summary,
    candidateStatus: candidate.status,
    assertionId: candidate.assertionId,
    observationId: candidate.observationId,
    coordinateSource: assertion.source,
    accuracyMeters: assertion.accuracyMeters,
    capturedAt: assertion.capturedAt,
    provenanceRef: assertion.provenanceRef,
  };
}

export function validateVnnDryRunPayload(value) {
  const errors = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(errors, "", "must be an object");
    return { valid: false, errors };
  }
  if (value.schemaRef !== VNN_DRYRUN_SCHEMA_VERSION) {
    fail(errors, "schemaRef", `must equal "${VNN_DRYRUN_SCHEMA_VERSION}"`);
  }
  if (value.dryRun !== true) {
    fail(errors, "dryRun", "must be true — a dry-run payload can never be submitted live");
  }
  if (typeof value.location !== "string" || value.location.length < 1) {
    fail(errors, "location", "must be a non-empty text location");
  } else if (value.location.length > VNN_LOCATION_MAX_LENGTH) {
    fail(errors, "location", `must be at most ${VNN_LOCATION_MAX_LENGTH} characters (VNN intake limit)`);
  }
  if (typeof value.reason !== "string" || value.reason.length < 1) {
    fail(errors, "reason", "must be a non-empty string");
  }
  if (typeof value.provenanceRef !== "string" || !/\S/.test(value.provenanceRef)) {
    fail(errors, "provenanceRef", "must carry the assertion provenance reference");
  }
  if (typeof value.assertionId !== "string" || value.assertionId.length < 1) {
    fail(errors, "assertionId", "must reference the source assertion");
  }
  return { valid: errors.length === 0, errors };
}
