import assert from "node:assert/strict";
import test from "node:test";
import { createObservation, validateObservation } from "../../src/stage-b/observation.js";
import {
  createCandidate,
  validateCandidate,
  transitionCandidateStatus,
} from "../../src/stage-b/candidate.js";

test("observation draft validates and requires assertion association", () => {
  const obs = createObservation({ assertionId: "asrt_1", summary: "Fence appears damaged" });
  assert.equal(validateObservation(obs).valid, true);
  assert.equal(obs.status, "draft");

  const detached = createObservation({ assertionId: "", summary: "orphan" });
  const result = validateObservation(detached);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "assertionId"));
});

test("observation evidenceRef is optional but must be non-empty when present", () => {
  const withRef = createObservation({ assertionId: "a", summary: "s", evidenceRef: "cap_abc" });
  assert.equal(validateObservation(withRef).valid, true);
  const blank = createObservation({ assertionId: "a", summary: "s", evidenceRef: "   " });
  assert.equal(validateObservation(blank).valid, false);
});

test("candidate starts unverified and requires an assertion", () => {
  const c = createCandidate({ assertionId: "asrt_1", observationId: "obs_1", summary: "Possible fence repair need" });
  assert.equal(validateCandidate(c).valid, true);
  assert.equal(c.status, "unverified");
  assert.equal(validateCandidate({ ...c, assertionId: "" }).valid, false);
});

test("candidate status transitions are gated", () => {
  const c = createCandidate({ assertionId: "asrt_1", summary: "s" });
  assert.equal(transitionCandidateStatus(c, "verified").ok, false); // unverified cannot jump
  const nr = transitionCandidateStatus(c, "needs_review");
  assert.equal(nr.ok, true);
  assert.equal(nr.candidate.status, "needs_review");
  assert.equal(transitionCandidateStatus(nr.candidate, "unverified").ok, true);
});

test("verified requires explicit evidence AND named authority", () => {
  const c = transitionCandidateStatus(createCandidate({ assertionId: "a", summary: "s" }), "needs_review").candidate;
  assert.equal(transitionCandidateStatus(c, "verified").ok, false);
  assert.equal(transitionCandidateStatus(c, "verified", { evidenceRef: "cap_1" }).ok, false);
  assert.equal(transitionCandidateStatus(c, "verified", { authority: "reviewer-7" }).ok, false);
  const ok = transitionCandidateStatus(c, "verified", { evidenceRef: "cap_1", authority: "reviewer-7" });
  assert.equal(ok.ok, true);
  assert.equal(ok.candidate.status, "verified");
  assert.equal(ok.candidate.verifiedBy, "reviewer-7");
});
