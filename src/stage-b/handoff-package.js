/**
 * GEO-008 VNN handoff package — a versioned, tamper-evident, exportable
 * snapshot of an APPROVED opportunity draft.
 *
 * Envelope: { schemaVersion, packageId, createdAt, content, sha256 } where
 * sha256 = SHA-256(canonicalJson(content)). Every meaningful field lives
 * inside content, so the digest covers the whole package. A package is a
 * prepared draft for a VNN intake session — never a submitted mission.
 */

import { canonicalJson, fingerprint } from "./fingerprint.js";
import { resolveReviewState } from "./handoff.js";
import { validateCoordinateAssertion } from "../coordinate-assertion.js";
import { buildVnnDryRunPayload } from "./vnn-dryrun.js";

export const PACKAGE_SCHEMA_VERSION = "h1-geo/vnn-handoff-package-v0";
export const PACKAGE_STORE_KEY = "h1geo.stageb.packages.v1";

function fail(errors, field, message) {
  errors.push({ field, message });
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Build a versioned package from a currently APPROVED draft.
 * Returns { ok:true, package } or { ok:false, errors } when the draft or
 * assertion is missing or the latest review is declined / stale /
 * unreviewed. Incomplete intake fields are packaged but flagged via
 * content.readyForIntake + content.missing — never hidden.
 */
export async function createHandoffPackage({ draftId, candidateStore, assertionStore, evidenceStore, handoffStore, now = new Date().toISOString() }) {
  const errors = [];
  const entry = candidateStore.get(draftId);
  if (!entry) {
    fail(errors, "draftId", "no saved draft with that id");
    return { ok: false, errors };
  }
  const candidate = entry.record;
  const review = resolveReviewState(handoffStore.forDraft(draftId), fingerprint(candidate));
  if (review.state !== "approved") {
    fail(errors, "review", `draft is "${review.state}" — a current approval is required`);
    return { ok: false, errors };
  }
  const assertionEntry = assertionStore.get(candidate.assertionId);
  if (!assertionEntry) {
    fail(errors, "assertionId", "referenced assertion no longer exists (broken relationship)");
    return { ok: false, errors };
  }
  const assertion = assertionEntry.record;
  const links = evidenceStore.linksForAssertionTree(candidate.assertionId).map((e) => e.record);
  const payload = buildVnnDryRunPayload({ candidate, assertion, evidenceLinks: links });

  const content = {
    generator: "h1-geo stage-b",
    draftId,
    review: {
      decidedBy: review.record.decidedBy,
      decidedAt: review.record.decidedAt,
      draftFingerprint: review.record.draftFingerprint,
      missingAtDecision: review.record.missingAtDecision,
    },
    intake: payload.intake,
    readyForIntake: payload.missing.length === 0,
    missing: payload.missing,
    assertion,
    assertionId: candidate.assertionId,
    observationId: candidate.observationId,
    evidenceRefs: payload.evidenceRefs,
    candidateStatus: candidate.status,
    provenanceRef: assertion.provenanceRef,
    dryRun: true,
  };
  const sha256 = await sha256Hex(canonicalJson(content));
  return {
    ok: true,
    package: {
      schemaVersion: PACKAGE_SCHEMA_VERSION,
      packageId: `hop_${crypto.randomUUID()}`,
      createdAt: now,
      content,
      sha256,
    },
  };
}

/** Synchronous structural checks — used as the store's validate fn. */
export function validatePackageStructure(value) {
  const errors = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(errors, "", "must be an object");
    return { valid: false, errors };
  }
  if (value.schemaVersion !== PACKAGE_SCHEMA_VERSION) {
    fail(errors, "schemaVersion", `must equal "${PACKAGE_SCHEMA_VERSION}"`);
  }
  if (typeof value.packageId !== "string" || value.packageId.length < 1) {
    fail(errors, "packageId", "must be a non-empty string");
  }
  if (typeof value.createdAt !== "string" || Number.isNaN(Date.parse(value.createdAt))) {
    fail(errors, "createdAt", "must be a date-time string");
  }
  if (typeof value.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(value.sha256)) {
    fail(errors, "sha256", "must be a 64-char hex digest");
  }
  if (typeof value.content !== "object" || value.content === null) {
    fail(errors, "content", "must be an object");
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Full verification — recomputes the digest and checks internal
 * consistency plus (when stores are given) that referenced records still
 * exist. Async because of the digest; never mutates the package.
 */
export async function verifyPackage(pkg, { assertionStore, candidateStore } = {}) {
  const errors = [];
  const structure = validatePackageStructure(pkg);
  if (!structure.valid) return { valid: false, errors: structure.errors };

  const c = pkg.content;
  if (c.dryRun !== true) fail(errors, "content.dryRun", "must be true — packages are never live submissions");
  if (typeof c.generator !== "string" || !c.generator) fail(errors, "content.generator", "missing");
  if (typeof c.draftId !== "string" || !c.draftId) fail(errors, "content.draftId", "missing");
  if (typeof c.review !== "object" || c.review === null) {
    fail(errors, "content.review", "missing review block");
  } else {
    if (typeof c.review.decidedBy !== "string" || !/\S/.test(c.review.decidedBy)) {
      fail(errors, "content.review.decidedBy", "approval must carry a named reviewer");
    }
    if (typeof c.review.draftFingerprint !== "string" || !c.review.draftFingerprint) {
      fail(errors, "content.review.draftFingerprint", "missing");
    }
    if (typeof c.review.decidedAt !== "string" || Number.isNaN(Date.parse(c.review.decidedAt))) {
      fail(errors, "content.review.decidedAt", "must be a date-time string");
    }
  }
  const assertCheck = validateCoordinateAssertion(c.assertion);
  if (!assertCheck.valid) {
    for (const e of assertCheck.errors) fail(errors, `content.assertion.${e.field}`, e.message);
  }
  if (typeof c.intake !== "object" || c.intake === null) {
    fail(errors, "content.intake", "missing intake block");
  } else if (assertCheck.valid && typeof c.intake.location === "string") {
    const expected = `${c.assertion.latitude},${c.assertion.longitude}`;
    if (c.intake.location !== expected) {
      fail(errors, "content.intake.location", `does not match packaged assertion (${expected})`);
    }
  }
  if (typeof c.provenanceRef !== "string" || !/\S/.test(c.provenanceRef)) {
    fail(errors, "content.provenanceRef", "missing");
  } else if (assertCheck.valid && c.provenanceRef !== c.assertion.provenanceRef) {
    fail(errors, "content.provenanceRef", "does not match packaged assertion provenance");
  }
  if (typeof c.assertionId !== "string" || !c.assertionId) {
    fail(errors, "content.assertionId", "missing");
  } else if (assertCheck.valid === false) {
    // already reported by assertion validation
  }
  if (Array.isArray(c.evidenceRefs)) {
    for (const [i, r] of c.evidenceRefs.entries()) {
      if (typeof r !== "object" || r === null || typeof r.kind !== "string" || !r.kind ||
          typeof r.reference !== "string" || !r.reference) {
        fail(errors, `content.evidenceRefs[${i}]`, "must be { kind, reference }");
      }
    }
  } else {
    fail(errors, "content.evidenceRefs", "must be an array");
  }
  if (typeof c.readyForIntake !== "boolean") fail(errors, "content.readyForIntake", "must be boolean");
  if (!Array.isArray(c.missing)) fail(errors, "content.missing", "must be an array");

  const digest = await sha256Hex(canonicalJson(c));
  if (digest !== pkg.sha256) {
    fail(errors, "sha256", "digest mismatch — package contents were modified");
  }

  // Relationship checks against live stores, when provided.
  if (candidateStore && candidateStore.get(c.draftId) === null) {
    fail(errors, "content.draftId", "referenced draft no longer exists (broken relationship)");
  }
  if (assertionStore && typeof c.assertionId === "string" && assertionStore.get(c.assertionId) === null) {
    fail(errors, "content.assertionId", "referenced assertion no longer exists (broken relationship)");
  }
  return { valid: errors.length === 0, errors };
}

/** Serialize for local export (file save / clipboard). */
export function exportPackageJson(pkg) {
  return JSON.stringify(pkg, null, 2);
}

/**
 * Parse + verify imported package text. Returns { ok, package?, errors }.
 * Never mutates what it imports and never writes it to any store.
 */
export async function importAndVerifyPackage(text, stores) {
  let pkg;
  try {
    pkg = JSON.parse(text);
  } catch {
    return { ok: false, errors: [{ field: "", message: "not valid JSON" }] };
  }
  const result = await verifyPackage(pkg, stores);
  return result.valid ? { ok: true, package: pkg } : { ok: false, errors: result.errors };
}
