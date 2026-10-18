/**
 * GEO-005 evidence link — associates a geographic assertion or observation
 * draft with a typed external evidence reference.
 *
 * Vocabulary is deliberately reused, not invented:
 * - kind "snapntalk_capture" → SnapN'Talk captureId (`cap_<uuid>`)
 * - kind "snapntalk_package" → SnapN'Talk packageId (`pkg_<uuid>`)
 * - kind "content" → content-addressed ref `content://sha256/<64-hex>`,
 *   matching HomeVault's capture-v1 evidenceReferences vocabulary
 * - kind "document" → a HomeVault document object id (opaque non-empty string)
 *
 * A link is a reference only: no media bytes, file paths, or capture content
 * ever enter H1-Geo records. SnapN'Talk keeps capture authority; HomeVault
 * keeps document/property authority.
 */

export const EVIDENCE_LINK_SCHEMA_VERSION = "h1-geo/evidence-link-v0";
export const EVIDENCE_STORE_KEY = "h1geo.stageb.evidence.v1";

export const EVIDENCE_KINDS = Object.freeze([
  "snapntalk_capture",
  "snapntalk_package",
  "content",
  "document",
]);

const REFERENCE_PATTERNS = Object.freeze({
  snapntalk_capture: /^cap_[0-9a-fA-F-]{36}$/,
  snapntalk_package: /^pkg_[0-9a-fA-F-]{36}$/,
  content: /^content:\/\/sha256\/[0-9a-fA-F]{64}$/,
  document: /^\S+$/,
});

const NOTE_MAX_LENGTH = 200;

function fail(errors, field, message) {
  errors.push({ field, message });
}

export function createEvidenceLink({ targetType, targetId, kind, reference, note = null, addedAt = new Date().toISOString() }) {
  return {
    schemaVersion: EVIDENCE_LINK_SCHEMA_VERSION,
    targetType,
    targetId,
    kind,
    reference,
    note,
    addedAt,
  };
}

export function validateEvidenceLink(value) {
  const errors = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(errors, "", "must be an object");
    return { valid: false, errors };
  }
  if (value.schemaVersion !== EVIDENCE_LINK_SCHEMA_VERSION) {
    fail(errors, "schemaVersion", `must equal "${EVIDENCE_LINK_SCHEMA_VERSION}"`);
  }
  if (!["assertion", "observation"].includes(value.targetType)) {
    fail(errors, "targetType", 'must be "assertion" or "observation"');
  }
  if (typeof value.targetId !== "string" || value.targetId.length < 1) {
    fail(errors, "targetId", "must reference a saved record");
  }
  if (!EVIDENCE_KINDS.includes(value.kind)) {
    fail(errors, "kind", `must be one of: ${EVIDENCE_KINDS.join(", ")}`);
  } else if (typeof value.reference !== "string" || !REFERENCE_PATTERNS[value.kind].test(value.reference)) {
    fail(errors, "reference", `must match the ${value.kind} reference format`);
  }
  if (value.note !== null && (typeof value.note !== "string" || [...value.note].length > NOTE_MAX_LENGTH)) {
    fail(errors, "note", `must be null or a string of at most ${NOTE_MAX_LENGTH} characters`);
  }
  if (typeof value.addedAt !== "string" || Number.isNaN(Date.parse(value.addedAt))) {
    fail(errors, "addedAt", "must be a date-time string");
  }
  return { valid: errors.length === 0, errors };
}
