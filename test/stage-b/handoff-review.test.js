import assert from "node:assert/strict";
import test from "node:test";
import { SCHEMA_VERSION, CRS } from "../../src/coordinate-assertion.js";
import { createAssertionStore } from "../../src/stage-b/assertion-store.js";
import { createRecordStore, memoryStorage } from "../../src/stage-b/record-store.js";
import { createObservation, validateObservation, OBSERVATION_STORE_KEY } from "../../src/stage-b/observation.js";
import { createEvidenceLink } from "../../src/stage-b/evidence.js";
import { createEvidenceStore } from "../../src/stage-b/evidence-store.js";
import { createCandidate } from "../../src/stage-b/candidate.js";
import { createCandidateStore } from "../../src/stage-b/candidate-store.js";
import { createHandoffRecord, validateHandoffRecord, resolveReviewState, HANDOFF_STORE_KEY } from "../../src/stage-b/handoff.js";
import { createHandoffStore } from "../../src/stage-b/handoff-store.js";
import { fingerprint, canonicalJson } from "../../src/stage-b/fingerprint.js";
import { buildVnnDryRunPayload } from "../../src/stage-b/vnn-dryrun.js";

const ASSERTION = Object.freeze({
  schemaVersion: SCHEMA_VERSION, latitude: 33.749, longitude: -84.388, crs: CRS,
  source: "manual_target_pin", capturedAt: "2026-10-17T12:30:00Z",
  accuracyMeters: null, provenanceRef: "h1geo://pin/geo007",
});

function setup() {
  const storage = memoryStorage();
  const assertionStore = createAssertionStore(storage);
  const observationStore = createRecordStore({
    storage, key: OBSERVATION_STORE_KEY, validate: validateObservation, idPrefix: "obs",
  });
  const evidenceStore = createEvidenceStore(storage, { assertionStore, observationStore });
  const candidateStore = createCandidateStore(storage);
  const handoffStore = createHandoffStore(storage, { candidateStore });
  const { id: assertionId } = assertionStore.save(ASSERTION);
  const { id: draftId } = candidateStore.save(createCandidate({ assertionId, summary: "possible need" }));
  return { storage, assertionStore, observationStore, evidenceStore, candidateStore, handoffStore, assertionId, draftId };
}

function decide(ctx, decision, decidedBy = "reviewer-1") {
  const candidate = ctx.candidateStore.get(ctx.draftId).record;
  const payload = buildVnnDryRunPayload({ candidate, assertion: ctx.assertionStore.get(ctx.assertionId).record });
  return ctx.handoffStore.save(createHandoffRecord({ draftId: ctx.draftId, candidate, payload, decision, decidedBy }));
}

test("fingerprint is deterministic and order-independent", () => {
  assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(fingerprint({ x: [1, { y: 2, z: 3 }] }), fingerprint({ x: [1, { z: 3, y: 2 }] }));
  assert.notEqual(fingerprint({ a: 1 }), fingerprint({ a: 2 }));
});

test("approval creates a reviewable record bound to the draft version", () => {
  const ctx = setup();
  const result = decide(ctx, "approved");
  assert.equal(result.ok, true);
  const rec = ctx.handoffStore.get(result.id).record;
  assert.equal(rec.decision, "approved");
  assert.equal(rec.decidedBy, "reviewer-1");
  assert.equal(rec.draftFingerprint, fingerprint(ctx.candidateStore.get(ctx.draftId).record));
  assert.equal(rec.payload.dryRun, true);
  assert.ok(rec.payload.intake.location === "33.749,-84.388");
  assert.ok(!Number.isNaN(Date.parse(rec.decidedAt)));
});

test("decline is recorded without a payload", () => {
  const ctx = setup();
  const result = decide(ctx, "declined");
  assert.equal(result.ok, true);
  const rec = ctx.handoffStore.get(result.id).record;
  assert.equal(rec.decision, "declined");
  assert.equal(rec.payload, null);
});

test("approval requires a named reviewer and an existing draft", () => {
  const ctx = setup();
  assert.equal(decide(ctx, "approved", "   ").ok, false);
  const ghost = { ...createHandoffRecord({ draftId: "cand_ghost", candidate: createCandidate({ assertionId: "a", summary: "s" }), payload: null, decision: "declined", decidedBy: "r" }) };
  const result = ctx.handoffStore.save(ghost);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === "draftId"));
});

test("incomplete drafts can be reviewed; missing fields are recorded honestly", () => {
  const ctx = setup();
  const result = decide(ctx, "approved");
  const rec = ctx.handoffStore.get(result.id).record;
  assert.ok(rec.missingAtDecision.includes("title"));
  assert.ok(rec.missingAtDecision.includes("required_capabilities"));
});

test("editing a draft after approval makes the decision stale", () => {
  const ctx = setup();
  decide(ctx, "approved");
  const before = resolveReviewState(ctx.handoffStore.forDraft(ctx.draftId), fingerprint(ctx.candidateStore.get(ctx.draftId).record));
  assert.equal(before.state, "approved");

  const draft = ctx.candidateStore.get(ctx.draftId).record;
  ctx.candidateStore.update(ctx.draftId, { ...draft, title: "Fence repair" });
  const after = resolveReviewState(ctx.handoffStore.forDraft(ctx.draftId), fingerprint(ctx.candidateStore.get(ctx.draftId).record));
  assert.equal(after.state, "stale");

  // A new review binds to the new version and clears staleness.
  decide(ctx, "approved", "reviewer-2");
  const renewed = resolveReviewState(ctx.handoffStore.forDraft(ctx.draftId), fingerprint(ctx.candidateStore.get(ctx.draftId).record));
  assert.equal(renewed.state, "approved");
  assert.equal(renewed.record.decidedBy, "reviewer-2");
});

test("unrelated draft edits that change nothing material stay approved", () => {
  const ctx = setup();
  decide(ctx, "approved");
  // same-content fingerprint → still approved
  const state = resolveReviewState(ctx.handoffStore.forDraft(ctx.draftId), fingerprint({ ...ctx.candidateStore.get(ctx.draftId).record }));
  assert.equal(state.state, "approved");
});

test("handoff records persist across reload and are append-only", () => {
  const ctx = setup();
  decide(ctx, "approved");
  const reopened = createHandoffStore(ctx.storage, { candidateStore: ctx.candidateStore });
  assert.equal(reopened.forDraft(ctx.draftId).length, 1);
  assert.equal(reopened.update("hof_x", {}).ok, false);
});

test("corrupted handoff storage quarantines instead of silently repairing", () => {
  const ctx = setup();
  ctx.storage.setItem(HANDOFF_STORE_KEY, "broken{");
  assert.equal(ctx.handoffStore.list().length, 0);
  assert.equal(ctx.handoffStore.health().corrupted, true);
});

test("evidence links attached to a reviewed draft flow into the approved payload", () => {
  const ctx = setup();
  ctx.evidenceStore.save(createEvidenceLink({
    targetType: "assertion", targetId: ctx.assertionId,
    kind: "snapntalk_capture", reference: "cap_123e4567-e89b-42d3-a456-426614174000",
  }));
  const candidate = ctx.candidateStore.get(ctx.draftId).record;
  const links = ctx.evidenceStore.linksForAssertionTree(ctx.assertionId).map((e) => e.record);
  const payload = buildVnnDryRunPayload({ candidate, assertion: ctx.assertionStore.get(ctx.assertionId).record, evidenceLinks: links });
  const result = ctx.handoffStore.save(createHandoffRecord({ draftId: ctx.draftId, candidate, payload, decision: "approved", decidedBy: "r" }));
  assert.equal(result.ok, true);
  assert.equal(ctx.handoffStore.get(result.id).record.payload.evidenceRefs.length, 1);
});
