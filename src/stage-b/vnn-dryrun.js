/**
 * Candidate → VNN-compatible handoff draft (dry-run).
 *
 * Mirrors H1-VNN intake_store field vocabulary exactly — title, outcome,
 * required_capabilities, location, requested_timing, evidence_requirements,
 * offered_amount, currency, amount_certainty, attachments — with absent
 * values as explicit nulls (VNN doctrine: "never silently missing keys").
 * dryRun: true is enforced so a draft can never be mistaken for a live
 * mission request. Zero network calls; preview/fixture material only.
 */

export const VNN_DRYRUN_SCHEMA_VERSION = "h1-geo/vnn-dryrun-v0";

const VNN_LOCATION_MAX_LENGTH = 300; // H1-VNN: location Optional[str], max_length=300

// VNN ATTACHMENT_KINDS = {photo, video, document, other}
const EVIDENCE_TO_ATTACHMENT_KIND = Object.freeze({
  snapntalk_capture: "other", // a capture may hold media; kind unknown here — honest "other"
  snapntalk_package: "other",
  document: "document",
  content: "document",
});
const VNN_ATTACHMENT_KINDS = Object.freeze(["photo", "video", "document", "other"]);

function fail(errors, field, message) {
  errors.push({ field, message });
}

/**
 * Missing-field assessment, mirroring VNN intake's required prompts.
 * Returns field names still needed before the draft is handoff-complete.
 */
export function assessHandoffReadiness({ candidate, assertion }) {
  const missing = [];
  if (typeof candidate.title !== "string" || !candidate.title.trim()) missing.push("title");
  const hasOutcome = (s) => typeof s === "string" && s.trim().length > 0;
  if (!hasOutcome(candidate.condition) && !hasOutcome(candidate.proposedWork)) missing.push("outcome");
  if (typeof candidate.requestedTiming !== "string" || !candidate.requestedTiming.trim()) missing.push("requested_timing");
  if (!Array.isArray(candidate.requiredCapabilities) || candidate.requiredCapabilities.length === 0) {
    missing.push("required_capabilities");
  }
  if (!assertion) missing.push("location"); // location comes from the saved assertion
  if (candidate.offeredAmount != null && !candidate.currency) missing.push("currency");
  return missing;
}

export function buildVnnDryRunPayload({ candidate, assertion, evidenceLinks = [] }) {
  const location = assertion ? `${assertion.latitude},${assertion.longitude}` : null;
  const outcome = [candidate.condition, candidate.proposedWork].filter((s) => typeof s === "string" && s.trim()).join(" — ") || null;
  return {
    schemaRef: VNN_DRYRUN_SCHEMA_VERSION,
    dryRun: true,
    intake: {
      title: candidate.title ?? candidate.summary ?? null,
      outcome,
      required_capabilities: candidate.requiredCapabilities ?? [],
      location,
      requested_timing: candidate.requestedTiming ?? null,
      evidence_requirements: candidate.evidenceRequirements ?? null,
      offered_amount: candidate.offeredAmount ?? null,
      currency: candidate.currency ?? null,
      amount_certainty: candidate.amountCertainty ?? null,
      attachments: evidenceLinks.map((l) => ({
        kind: EVIDENCE_TO_ATTACHMENT_KIND[l.kind] ?? "other",
        reference: l.reference,
      })),
    },
    missing: assessHandoffReadiness({ candidate, assertion }),
    reason: candidate.summary,
    candidateStatus: candidate.status,
    assertionId: candidate.assertionId,
    observationId: candidate.observationId,
    evidenceRefs: evidenceLinks.map((l) => ({ kind: l.kind, reference: l.reference })),
    coordinateSource: assertion?.source ?? null,
    accuracyMeters: assertion?.accuracyMeters ?? null,
    capturedAt: assertion?.capturedAt ?? null,
    provenanceRef: assertion?.provenanceRef ?? null,
  };
}

const INTAKE_MAX_LEN = Object.freeze({
  title: 300, outcome: 5000, location: VNN_LOCATION_MAX_LENGTH,
  requested_timing: 300, evidence_requirements: 2000,
});

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
  const intake = value.intake;
  if (typeof intake !== "object" || intake === null) {
    fail(errors, "intake", "must be the VNN intake field object");
  } else {
    for (const [field, max] of Object.entries(INTAKE_MAX_LEN)) {
      const v = intake[field];
      if (v !== null && (typeof v !== "string" || v.length > max)) {
        fail(errors, `intake.${field}`, `must be null or a string of at most ${max} characters`);
      }
    }
    if (!Array.isArray(intake.required_capabilities) || intake.required_capabilities.some((c) => typeof c !== "string" || c.length < 1)) {
      fail(errors, "intake.required_capabilities", "must be an array of non-empty strings");
    }
    if (intake.offered_amount !== null && (typeof intake.offered_amount !== "number" || !Number.isFinite(intake.offered_amount) || intake.offered_amount < 0)) {
      fail(errors, "intake.offered_amount", "must be a finite number >= 0 or null");
    }
    if (intake.offered_amount !== null && intake.currency === null) {
      fail(errors, "intake.currency", "required when offered_amount is set");
    }
    if (!Array.isArray(intake.attachments) || intake.attachments.some((a) =>
      typeof a !== "object" || a === null || !VNN_ATTACHMENT_KINDS.includes(a.kind) || typeof a.reference !== "string" || a.reference.length < 1)) {
      fail(errors, "intake.attachments", "must be reference objects with a VNN attachment kind");
    }
  }
  if (!Array.isArray(value.missing)) {
    fail(errors, "missing", "must be an array of missing-field names");
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
  if (!Array.isArray(value.evidenceRefs) || value.evidenceRefs.some((r) =>
    typeof r !== "object" || r === null || typeof r.kind !== "string" || !r.kind || typeof r.reference !== "string" || !r.reference)) {
    fail(errors, "evidenceRefs", "must be an array of { kind, reference }");
  }
  return { valid: errors.length === 0, errors };
}
