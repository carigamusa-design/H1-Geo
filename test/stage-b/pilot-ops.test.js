import assert from "node:assert/strict";
import test from "node:test";
import { SCHEMA_VERSION, CRS, validateCoordinateAssertion } from "../../src/coordinate-assertion.js";
import { createAssertionStore } from "../../src/stage-b/assertion-store.js";
import { createRecordStore, memoryStorage } from "../../src/stage-b/record-store.js";
import { createObservation, validateObservation, OBSERVATION_STORE_KEY } from "../../src/stage-b/observation.js";
import { createEvidenceLink } from "../../src/stage-b/evidence.js";
import { createEvidenceStore } from "../../src/stage-b/evidence-store.js";
import { createCandidate } from "../../src/stage-b/candidate.js";
import { createCandidateStore } from "../../src/stage-b/candidate-store.js";
import { createHandoffRecord } from "../../src/stage-b/handoff.js";
import { createHandoffStore } from "../../src/stage-b/handoff-store.js";
import { buildVnnDryRunPayload } from "../../src/stage-b/vnn-dryrun.js";
import { validatePackageStructure, PACKAGE_STORE_KEY,
  createHandoffPackage } from "../../src/stage-b/handoff-package.js";
import { validateSignatureRecord, SIGNATURE_STORE_KEY } from "../../src/stage-b/signature.js";
import { validateVnnIntakeExport, VNN_EXPORT_STORE_KEY } from "../../src/stage-b/vnn-export.js";
import { loadH1ExampleScenario } from "../../src/stage-b/workflow.js";
import {
  createFeedback, validateFeedback, createFeedbackStore,
  pilotReport, nextAction, FEEDBACK_SCHEMA_VERSION, FEEDBACK_STORE_KEY,
} from "../../src/stage-b/pilot.js";

const REAL_PIN = Object.freeze({
  schemaVersion: SCHEMA_VERSION, latitude: 33.749, longitude: -84.388, crs: CRS,
  source: "manual_target_pin", capturedAt: "2026-10-17T12:00:00Z",
  accuracyMeters: null, provenanceRef: "h1geo://field/real-visit-1",
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
  const packageStore = createRecordStore({
    storage, key: PACKAGE_STORE_KEY, validate: validatePackageStructure, idPrefix: "pkg",
  });
  const signatureStore = createRecordStore({
    storage, key: SIGNATURE_STORE_KEY, validate: validateSignatureRecord, idPrefix: "sig",
  });
  const exportStore = createRecordStore({
    storage, key: VNN_EXPORT_STORE_KEY, validate: validateVnnIntakeExport, idPrefix: "vex",
  });
  const feedbackStore = createFeedbackStore(storage, {
    assertionStore, observationStore, candidateStore, packageStore });
  const stores = {
    assertionStore, observationStore, evidenceStore, candidateStore,
    handoffStore, packageStore, signatureStore, exportStore, feedbackStore,
  };
  return { storage, stores };
}

test("feedback validates kind/body/target consistency honestly", () => {
  const { stores } = setup();
  const a = stores.assertionStore.save(REAL_PIN).id;
  // Valid record-targeted feedback.
  const good = createFeedback({ kind: "worked", body: "pin saving was clear",
    targetType: "assertion", targetId: a });
  assert.equal(validateFeedback(good).valid, true);
  assert.equal(stores.feedbackStore.save(good).ok, true);
  // Bad kind / empty body / dangling target / target on "none".
  assert.equal(validateFeedback(createFeedback({ kind: "meh", body: "x" })).valid, false);
  assert.equal(validateFeedback(createFeedback({ kind: "worked", body: "  " })).valid, false);
  assert.equal(validateFeedback(createFeedback({
    kind: "worked", body: "x", targetType: "none", targetId: "asrt_x" })).valid, false);
  const dangle = stores.feedbackStore.save(createFeedback({
    kind: "failed", body: "missing target", targetType: "draft", targetId: "cand_ghost" }));
  assert.equal(dangle.ok, false);
  // Workflow-step feedback needs a step number in range.
  assert.equal(validateFeedback(createFeedback({
    kind: "confusing", body: "x", targetType: "workflow_step", step: 5 })).valid, true);
  assert.equal(validateFeedback(createFeedback({
    kind: "confusing", body: "x", targetType: "workflow_step", step: 99 })).valid, false);
});

test("feedback persists across reload and quarantines corrupted data", () => {
  const { storage, stores } = setup();
  stores.feedbackStore.save(createFeedback({ kind: "improve", body: "add map scale" }));
  const reloaded = createFeedbackStore(storage, {
    assertionStore: stores.assertionStore, observationStore: stores.observationStore,
    candidateStore: stores.candidateStore, packageStore: stores.packageStore });
  assert.equal(reloaded.list().length, 1);
  assert.equal(reloaded.list()[0].record.kind, "improve");
  // Corrupt the stored payload → quarantine, not silent repair.
  storage.setItem(FEEDBACK_STORE_KEY, "{broken json");
  const h = reloaded.health();
  assert.equal(h.corrupted, true);
  assert.equal(reloaded.list().length, 0);
});

test("pilot report counts separate real from synthetic", async () => {
  const { stores } = setup();
  // Synthetic scenario.
  const sc = loadH1ExampleScenario(stores);
  // Real pin + observation + draft.
  const a = stores.assertionStore.save(REAL_PIN).id;
  const o = stores.observationStore.save(createObservation({
    assertionId: a, summary: "real: gate latch is broken" })).id;
  const d = stores.candidateStore.save(createCandidate({
    assertionId: a, observationId: o, summary: "real: gate repair" })).id;
  const rep = pilotReport(stores);
  assert.equal(rep.locations.total, 2);
  assert.equal(rep.locations.synthetic, 1);
  assert.equal(rep.locations.real, 1);
  assert.equal(rep.observations.total, 2);
  assert.equal(rep.observations.synthetic, 1);
  assert.equal(rep.observations.real, 1);
  assert.equal(rep.drafts.total, 2);
  assert.equal(rep.drafts.synthetic, 1);
  assert.equal(rep.evidenceLinks.total, 2);
  assert.equal(rep.evidenceLinks.synthetic, 2); // both links are on synthetic records
  assert.deepEqual(rep.approvals, { approved: 0, declined: 0, stale: 0, unreviewed: 2 });
  assert.equal(rep.packages, 0);
  // Next actions speak plainly.
  const realRow = rep.nextActions.find((n) => n.draftId === d);
  assert.match(realRow.action, /fill intake fields|ready for review/);
});

test("report reflects approvals, packages, and feedback kinds", async () => {
  const { stores } = setup();
  const sc = loadH1ExampleScenario(stores);
  const { assertionStore, candidateStore, handoffStore } = stores;
  const candidate = candidateStore.get(sc.draftId).record;
  const payload = buildVnnDryRunPayload({
    candidate, assertion: assertionStore.get(sc.assertionId).record });
  handoffStore.save(createHandoffRecord({
    draftId: sc.draftId, candidate, payload, decision: "approved", decidedBy: "founder" }));
  const { package: pkg } = await createHandoffPackage({
    draftId: sc.draftId, candidateStore, assertionStore,
    evidenceStore: stores.evidenceStore, handoffStore });
  stores.packageStore.save(pkg);
  stores.feedbackStore.save(createFeedback({ kind: "worked", body: "approval was clear" }));
  stores.feedbackStore.save(createFeedback({ kind: "confusing", body: "digest prefix confused me",
    targetType: "package", targetId: stores.packageStore.list()[0].id }));
  const rep = pilotReport(stores);
  assert.equal(rep.approvals.approved, 1);
  assert.equal(rep.packages, 1);
  assert.deepEqual(rep.feedback.byKind, { worked: 1, confusing: 1, failed: 0, improve: 0 });
  assert.equal(rep.feedback.total, 2);
  const row = rep.nextActions.find((n) => n.draftId === sc.draftId);
  assert.match(row.action, /sign the package|preview/);
});

test("nextAction walks the full lifecycle", async () => {
  const { stores } = setup();
  const sc = loadH1ExampleScenario(stores);
  const { assertionStore, candidateStore, handoffStore } = stores;
  const rows = () => pilotReport(stores).nextActions.find((n) => n.draftId === sc.draftId);
  assert.match(rows().action, /review/);
  const candidate = candidateStore.get(sc.draftId).record;
  const payload = buildVnnDryRunPayload({
    candidate, assertion: assertionStore.get(sc.assertionId).record });
  handoffStore.save(createHandoffRecord({
    draftId: sc.draftId, candidate, payload, decision: "approved", decidedBy: "founder" }));
  assert.match(rows().action, /generate the handoff package/);
  // Stale after edit.
  candidateStore.update(sc.draftId, { ...candidate, title: "touched" });
  assert.match(rows().action, /re-review/);
  // Decline path.
  handoffStore.save(createHandoffRecord({
    draftId: sc.draftId, candidate: candidateStore.get(sc.draftId).record,
    payload: null, decision: "declined", decidedBy: "founder" }));
  assert.match(rows().action, /declined/);
});
