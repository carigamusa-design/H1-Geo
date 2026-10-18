/**
 * GEO-009 Geo→VNN intake export contract.
 *
 * Versioned, locally previewable document mirroring VNN's REAL intake
 * entry points (products/h1_vnn/server/intake_router.py +
 * intake_store.py), so a confirmed export can later be played back
 * verbatim through:
 *   POST /vnn/api/intake/sessions                  -> session
 *   POST /vnn/api/intake/sessions/{id}/draft       -> draftFields
 *   POST /vnn/api/intake/sessions/{id}/attachments -> attachments[]
 *   POST /vnn/api/intake/sessions/{id}/confirm     -> human step, VNN-side
 *
 * This record is a PREPARED export only — nothing here calls VNN, and
 * create-mission remains exclusively VNN's authorization boundary.
 */

import { validatePackageStructure } from "./handoff-package.js";

export const VNN_EXPORT_SCHEMA_VERSION = "h1-geo/vnn-intake-export-v0";
export const VNN_EXPORT_STORE_KEY = "h1geo.stageb.exports.v1";

// Mirrored verbatim from intake_store.py / intake_router.py.
export const VNN_EDITABLE_FIELDS = new Set([
  "title", "outcome", "required_capabilities", "location",
  "requested_timing", "evidence_requirements",
  "offered_amount", "currency", "amount_certainty",
]);
export const VNN_HOME_CONTEXT_TYPES = new Set(["property", "project", "case", "life_area"]);
export const VNN_ATTACHMENT_KINDS = new Set(["photo", "video", "document", "other"]);
export const VNN_UTTERANCE_CHANNELS = new Set(["text", "voice_transcript", "form", "other"]);

// Geo evidence kinds carry no media-type semantics; map conservatively.
const EVIDENCE_TO_VNN_KIND = {
  document: "document",
  snapntalk_capture: "other",
  snapntalk_package: "other",
  content: "other",
};

function fail(errors, field, message) {
  errors.push({ field, message });
}

/**
 * Build a prepared VNN intake export from a verified GEO-008 package.
 * Only non-null intake fields go into draftFields (VNN's own draft
 * starts every field at null; sending nulls would stringify to "None"
 * through its _sanitize_field). Nulls are reported in omittedFields so
 * the preview stays honest.
 */
export function buildVnnIntakeExport({ pkg, requesterRef, requesterDisplay = null,
  homeContextType = null, homeContextRef = null, signatureRec = null,
  now = new Date().toISOString() }) {
  const errors = [];
  if (!validatePackageStructure(pkg).valid) {
    fail(errors, "pkg", "not a structurally valid package");
    return { ok: false, errors };
  }
  if (typeof requesterRef !== "string" || !/\S/.test(requesterRef)) {
    fail(errors, "requesterRef", "required (VNN SessionCreate.requester_ref)");
  } else if (requesterRef.length > 200) {
    fail(errors, "requesterRef", "exceeds VNN limit of 200 chars");
  }
  if (requesterDisplay !== null && (typeof requesterDisplay !== "string" || requesterDisplay.length > 200)) {
    fail(errors, "requesterDisplay", "must be a string of at most 200 chars");
  }
  if (homeContextType !== null && !VNN_HOME_CONTEXT_TYPES.has(homeContextType)) {
    fail(errors, "homeContextType", "must be property|project|case|life_area");
  }
  if (homeContextRef !== null && (typeof homeContextRef !== "string" || homeContextRef.length > 200)) {
    fail(errors, "homeContextRef", "must be a string of at most 200 chars");
  }
  if (errors.length) return { ok: false, errors };

  const intake = pkg.content.intake;
  const draftFields = {};
  const omittedFields = [];
  for (const key of Object.keys(intake)) {
    if (key === "attachments") continue;
    if (!VNN_EDITABLE_FIELDS.has(key)) {
      fail(errors, `intake.${key}`, "not a VNN-editable field — export would be rejected");
      continue;
    }
    if (intake[key] === null || intake[key] === undefined) omittedFields.push(key);
    else draftFields[key] = intake[key];
  }
  const attachments = (pkg.content.evidenceRefs || []).map((r) => ({
    kind: EVIDENCE_TO_VNN_KIND[r.kind] || "other",
    ref: r.reference,
    note: r.note !== undefined ? r.note : null,
  }));
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    record: {
      schemaVersion: VNN_EXPORT_SCHEMA_VERSION,
      exportId: `vex_${crypto.randomUUID()}`,
      createdAt: now,
      packageRef: { packageId: pkg.packageId, sha256: pkg.sha256 },
      session: {
        requester_ref: requesterRef.trim(),
        requester_display: requesterDisplay,
        home_context_type: homeContextType,
        home_context_ref: homeContextRef,
        utterance: null,
        channel: "form",
      },
      draftFields,
      omittedFields,
      attachments,
      signature: signatureRec,
      readyForIntake: pkg.content.readyForIntake,
      missing: pkg.content.missing,
      dryRun: true,
    },
  };
}

/** Structural validation — used as the export store's validate fn and
 *  on import of a previously exported record. */
export function validateVnnIntakeExport(rec) {
  const errors = [];
  if (typeof rec !== "object" || rec === null || Array.isArray(rec)) {
    fail(errors, "", "must be an object");
    return { valid: false, errors };
  }
  if (rec.schemaVersion !== VNN_EXPORT_SCHEMA_VERSION) {
    fail(errors, "schemaVersion", `must equal "${VNN_EXPORT_SCHEMA_VERSION}"`);
  }
  if (typeof rec.exportId !== "string" || !rec.exportId) fail(errors, "exportId", "missing");
  if (typeof rec.createdAt !== "string" || Number.isNaN(Date.parse(rec.createdAt))) {
    fail(errors, "createdAt", "must be a date-time string");
  }
  const pr = rec.packageRef;
  if (typeof pr !== "object" || pr === null) {
    fail(errors, "packageRef", "must be an object");
  } else {
    if (typeof pr.packageId !== "string" || !pr.packageId) fail(errors, "packageRef.packageId", "missing");
    if (typeof pr.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(pr.sha256)) {
      fail(errors, "packageRef.sha256", "must be a 64-hex digest");
    }
  }
  const s = rec.session;
  if (typeof s !== "object" || s === null) {
    fail(errors, "session", "must be a SessionCreate-shaped object");
  } else {
    if (typeof s.requester_ref !== "string" || !/\S/.test(s.requester_ref) || s.requester_ref.length > 200) {
      fail(errors, "session.requester_ref", "required, at most 200 chars");
    }
    if (s.requester_display !== null && (typeof s.requester_display !== "string" || s.requester_display.length > 200)) {
      fail(errors, "session.requester_display", "at most 200 chars");
    }
    if (s.home_context_type !== null && !VNN_HOME_CONTEXT_TYPES.has(s.home_context_type)) {
      fail(errors, "session.home_context_type", "must be property|project|case|life_area");
    }
    if (s.home_context_ref !== null && (typeof s.home_context_ref !== "string" || s.home_context_ref.length > 200)) {
      fail(errors, "session.home_context_ref", "at most 200 chars");
    }
    if (!VNN_UTTERANCE_CHANNELS.has(s.channel)) {
      fail(errors, "session.channel", "must be text|voice_transcript|form|other");
    }
  }
  if (typeof rec.draftFields !== "object" || rec.draftFields === null) {
    fail(errors, "draftFields", "must be an object");
  } else {
    for (const k of Object.keys(rec.draftFields)) {
      if (!VNN_EDITABLE_FIELDS.has(k)) fail(errors, `draftFields.${k}`, "not a VNN-editable field");
    }
  }
  if (!Array.isArray(rec.omittedFields)) fail(errors, "omittedFields", "must be an array");
  if (!Array.isArray(rec.attachments)) {
    fail(errors, "attachments", "must be an array");
  } else {
    for (const [i, a] of rec.attachments.entries()) {
      if (typeof a !== "object" || a === null || !VNN_ATTACHMENT_KINDS.has(a.kind)) {
        fail(errors, `attachments[${i}].kind`, "must be photo|video|document|other");
        continue;
      }
      if (typeof a.ref !== "string" || !/\S/.test(a.ref) || a.ref.length > 1000) {
        fail(errors, `attachments[${i}].ref`, "required, at most 1000 chars");
      }
    }
  }
  if (typeof rec.readyForIntake !== "boolean") fail(errors, "readyForIntake", "must be boolean");
  if (!Array.isArray(rec.missing)) fail(errors, "missing", "must be an array");
  if (rec.dryRun !== true) fail(errors, "dryRun", "must be true — exports are never submissions");
  return { valid: errors.length === 0, errors };
}
