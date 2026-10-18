import assert from "node:assert/strict";
import test from "node:test";
import { SCHEMA_VERSION, CRS } from "../../src/coordinate-assertion.js";
import { createAssertionStore } from "../../src/stage-b/assertion-store.js";
import { createRecordStore, memoryStorage } from "../../src/stage-b/record-store.js";
import { createObservation, validateObservation, OBSERVATION_STORE_KEY } from "../../src/stage-b/observation.js";
import { createEvidenceLink } from "../../src/stage-b/evidence.js";
import { createEvidenceStore } from "../../src/stage-b/evidence-store.js";
import { createCandidate, validateCandidate } from "../../src/stage-b/candidate.js";
import { createCandidateStore } from "../../src/stage-b/candidate-store.js";
import {
  assessHandoffReadiness,
  buildVnnDryRunPayload,
  validateVnnDryRunPayload,
} from "../../src/stage-b/vnn-dryrun.js";

const ASSERTION = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  latitude: 33.749,
  longitude: -84.388,
  crs: CRS,
  source: "manual_target_pin",
  capturedAt: "2026-10-17T12:30:00Z",
  accuracyMeters: null,
  provenanceRef: "h1geo://pin/geo006",
});

const CAP_ID = "cap_123e4567-e89b-42d3-a456-426614174000";

function setup() {
  const storage = memoryStorage();
  const assertionStore = createAssertionStore(storage);
  const observationStore = createRecordStore({
    storage, key: OBSERVATION_STORE_KEY, validate: validateObservation, idPrefix: "obs",
  });
  const evidenceStore = createEvidenceStore(storage, { assertionStore, observationStore });
  const candidateStore = createCandidateStore(storage);
  const { id: assertionId } = assertionStore.save(ASSERTION);
  return { storage, assertionStore, observationStore, evidenceStore, candidateStore, assertionId };
}

test("draft creation captures condition, work, and draft fields", () => {
  const c = createCandidate({ assertionId: "asrt_1", summary: "s" });
  assert.equal(c.status, "unverified");
  assert.equal(c.title, null);
  assert.deepEqual(c.requiredCapabilities, []);
  const filled = { ...c, title: "Fence repair", condition: "Fence leaning", proposedWork: "Reset posts" };
  assert.equal(validateCandidate(filled).valid, true);
});

test("draft field validation rejects bad values honestly", () => {
  const base = createCandidate({ assertionId: "a", summary: "s" });
  for (const bad of [
    { title: "x".repeat(301) },
    { condition: "x".repeat(5001) },
    { requestedTiming: "x".repeat(301) },
    { requiredCapabilities: ["ok", ""] },
    { requiredCapabilities: "fence" },
    { offeredAmount: -5 },
    { offeredAmount: Number.NaN },
    { currency: "US" },
    { amountCertainty: "guess" },
  ]) {
    assert.equal(validateCandidate({ ...base, ...bad }).valid, false, JSON.stringify(bad));
  }
});

test("editing a draft persists and preserves its relationships", () => {
  const { candidateStore, assertionId } = setup();
  const { id } = candidateStore.save(createCandidate({ assertionId, summary: "draft" }));
  const prior = candidateStore.get(id).record;
  const edited = { ...prior, title: "Fence repair", requestedTiming: "this week", requiredCapabilities: ["fencing"] };
  assert.equal(candidateStore.update(id, edited).ok, true);
  const after = candidateStore.get(id).record;
  assert.equal(after.title, "Fence repair");
  assert.equal(after.assertionId, assertionId);
  assert.equal(after.observationId, prior.observationId);
});

test("editing cannot rewire the draft to a different assertion or observation", () => {
  const { candidateStore, assertionId } = setup();
  const { id } = candidateStore.save(createCandidate({ assertionId, summary: "draft" }));
  const prior = candidateStore.get(id).record;
  assert.equal(candidateStore.update(id, { ...prior, assertionId: "asrt_other" }).ok, false);
  assert.equal(candidateStore.update(id, { ...prior, observationId: "obs_other" }).ok, false);
  assert.equal(candidateStore.get(id).record.assertionId, assertionId);
});

test("reopened draft keeps geographic and evidence relationships", () => {
  const { storage, assertionStore, observationStore, evidenceStore, assertionId } = setup();
  const { id: obsId } = observationStore.save(createObservation({ assertionId, summary: "fence" }));
  evidenceStore.save(createEvidenceLink({ targetType: "assertion", targetId: assertionId, kind: "snapntalk_capture", reference: CAP_ID }));
  createCandidateStore(storage).save(createCandidate({ assertionId, observationId: obsId, summary: "draft" }));

  // Reload — equivalent to browser refresh.
  const reopened = createCandidateStore(storage);
  const entry = reopened.list()[0];
  assert.equal(entry.record.assertionId, assertionId);
  assert.equal(entry.record.observationId, obsId);
  const links = evidenceStore.linksForAssertionTree(assertionId);
  assert.equal(links.length, 1);
  assert.equal(links[0].record.reference, CAP_ID);
});

test("handoff readiness reports exactly the missing required fields", () => {
  const assertion = ASSERTION;
  const bare = createCandidate({ assertionId: "a", summary: "s" });
  assert.deepEqual(
    assessHandoffReadiness({ candidate: bare, assertion }).sort(),
    ["outcome", "requested_timing", "required_capabilities", "title"].sort(),
  );
  const full = {
    ...bare, title: "Fence repair", condition: "leaning", proposedWork: "reset",
    requestedTiming: "next week", requiredCapabilities: ["fencing"],
  };
  assert.deepEqual(assessHandoffReadiness({ candidate: full, assertion }), []);
  // Without an assertion there is no location at all.
  assert.ok(assessHandoffReadiness({ candidate: full, assertion: null }).includes("location"));
  // Offered amount without currency is a gap.
  const offered = { ...full, offeredAmount: 100 };
  assert.deepEqual(assessHandoffReadiness({ candidate: offered, assertion }), ["currency"]);
});

test("handoff payload mirrors VNN intake fields with explicit nulls and attachments", () => {
  const { assertionStore, observationStore, evidenceStore, assertionId } = setup();
  const { id: obsId } = observationStore.save(createObservation({ assertionId, summary: "s" }));
  evidenceStore.save(createEvidenceLink({ targetType: "assertion", targetId: assertionId, kind: "document", reference: "doc_7" }));
  const candidate = {
    ...createCandidate({ assertionId, observationId: obsId, summary: "s" }),
    title: "Fence repair", condition: "leaning", proposedWork: "reset posts",
    requestedTiming: "next week", requiredCapabilities: ["fencing"], evidenceRequirements: "photos",
  };
  const payload = buildVnnDryRunPayload({
    candidate, assertion: assertionStore.get(assertionId).record,
    evidenceLinks: evidenceStore.linksForAssertionTree(assertionId).map((e) => e.record),
  });
  assert.equal(validateVnnDryRunPayload(payload).valid, true);
  assert.equal(payload.intake.title, "Fence repair");
  assert.equal(payload.intake.outcome, "leaning — reset posts");
  assert.equal(payload.intake.location, "33.749,-84.388");
  assert.deepEqual(payload.intake.required_capabilities, ["fencing"]);
  assert.deepEqual(payload.intake.attachments, [{ kind: "document", reference: "doc_7" }]);
  assert.equal(payload.intake.currency, null); // explicit null, not a missing key
  assert.deepEqual(payload.missing, []);
  assert.equal(payload.dryRun, true);
});

test("invalid handoff payloads are rejected", () => {
  const c = createCandidate({ assertionId: "a", summary: "s" });
  const p = buildVnnDryRunPayload({ candidate: c, assertion: ASSERTION });
  for (const bad of [
    { ...p, intake: { ...p.intake, title: "x".repeat(301) } },
    { ...p, intake: { ...p.intake, required_capabilities: "fence" } },
    { ...p, intake: { ...p.intake, attachments: [{ kind: "c2pa", reference: "x" }] } },
    { ...p, missing: "none" },
    { ...p, intake: null },
  ]) {
    assert.equal(validateVnnDryRunPayload(bad).valid, false, JSON.stringify(bad).slice(0, 80));
  }
});

test("candidate store quarantines corrupted data honestly", () => {
  const storage = memoryStorage();
  storage.setItem("h1geo.stageb.candidates.v1", "not-json{");
  const store = createCandidateStore(storage);
  assert.equal(store.list().length, 0);
  assert.equal(store.health().corrupted, true);
});
