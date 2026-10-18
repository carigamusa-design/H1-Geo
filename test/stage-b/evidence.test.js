import assert from "node:assert/strict";
import test from "node:test";
import { SCHEMA_VERSION, CRS } from "../../src/coordinate-assertion.js";
import { createAssertionStore } from "../../src/stage-b/assertion-store.js";
import { createRecordStore, memoryStorage } from "../../src/stage-b/record-store.js";
import { createObservation, validateObservation, OBSERVATION_STORE_KEY } from "../../src/stage-b/observation.js";
import {
  createEvidenceLink,
  validateEvidenceLink,
  EVIDENCE_STORE_KEY,
} from "../../src/stage-b/evidence.js";
import { createEvidenceStore } from "../../src/stage-b/evidence-store.js";
import { createCandidate } from "../../src/stage-b/candidate.js";
import { buildVnnDryRunPayload, validateVnnDryRunPayload } from "../../src/stage-b/vnn-dryrun.js";

const ASSERTION = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  latitude: 33.749,
  longitude: -84.388,
  crs: CRS,
  source: "manual_target_pin",
  capturedAt: "2026-10-17T12:30:00Z",
  accuracyMeters: null,
  provenanceRef: "h1geo://pin/test-001",
});

const CAP_ID = "cap_123e4567-e89b-42d3-a456-426614174000";
const PKG_ID = "pkg_123e4567-e89b-42d3-a456-426614174001";
const CONTENT_REF = "content://sha256/" + "a".repeat(64);

function setup() {
  const storage = memoryStorage();
  const assertionStore = createAssertionStore(storage);
  const observationStore = createRecordStore({
    storage, key: OBSERVATION_STORE_KEY, validate: validateObservation, idPrefix: "obs",
  });
  const evidenceStore = createEvidenceStore(storage, { assertionStore, observationStore });
  const { id: assertionId } = assertionStore.save(ASSERTION);
  return { storage, assertionStore, observationStore, evidenceStore, assertionId };
}

test("accepts each real evidence kind in its contract shape", () => {
  const { evidenceStore, assertionId } = setup();
  for (const [kind, reference] of [
    ["snapntalk_capture", CAP_ID],
    ["snapntalk_package", PKG_ID],
    ["content", CONTENT_REF],
    ["document", "doc_9f3a"],
  ]) {
    const link = createEvidenceLink({ targetType: "assertion", targetId: assertionId, kind, reference });
    const result = evidenceStore.save(link);
    assert.equal(result.ok, true, `expected kind "${kind}" to save`);
  }
  assert.equal(evidenceStore.list().length, 4);
});

test("rejects malformed and mismatched references", () => {
  for (const [kind, reference] of [
    ["snapntalk_capture", "cap_short"],
    ["snapntalk_capture", "pkg_123e4567-e89b-42d3-a456-426614174000"],
    ["snapntalk_package", "cap_123e4567-e89b-42d3-a456-426614174000"],
    ["content", "sha256:abc"],
    ["content", "content://sha256/xyz"],
    ["document", "  "],
    ["unknown_kind", "cap_123e4567-e89b-42d3-a456-426614174000"],
  ]) {
    const link = createEvidenceLink({ targetType: "assertion", targetId: "x", kind, reference });
    assert.equal(validateEvidenceLink(link).valid, false, `expected ${kind}:${reference} invalid`);
  }
});

test("rejects evidence linked to a target that does not exist", () => {
  const { evidenceStore } = setup();
  const link = createEvidenceLink({
    targetType: "assertion", targetId: "asrt_ghost", kind: "snapntalk_capture", reference: CAP_ID,
  });
  const result = evidenceStore.save(link);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === "targetId"));
});

test("evidence can attach to an observation, not only an assertion", () => {
  const { observationStore, evidenceStore, assertionId } = setup();
  const { id: obsId } = observationStore.save(createObservation({ assertionId, summary: "fence" }));
  const link = createEvidenceLink({
    targetType: "observation", targetId: obsId, kind: "snapntalk_package", reference: PKG_ID,
  });
  assert.equal(evidenceStore.save(link).ok, true);
  assert.equal(evidenceStore.linksFor("observation", obsId).length, 1);
});

test("links survive a reload and resolve through the assertion tree", () => {
  const { storage, observationStore, evidenceStore, assertionId } = setup();
  const { id: obsId } = observationStore.save(createObservation({ assertionId, summary: "s" }));
  evidenceStore.save(createEvidenceLink({ targetType: "assertion", targetId: assertionId, kind: "content", reference: CONTENT_REF }));
  evidenceStore.save(createEvidenceLink({ targetType: "observation", targetId: obsId, kind: "document", reference: "doc_1" }));

  // New stores over the same backend = browser refresh.
  const reloaded = createEvidenceStore(storage, {
    assertionStore: createAssertionStore(storage),
    observationStore,
  });
  const tree = reloaded.linksForAssertionTree(assertionId);
  assert.equal(tree.length, 2);
});

test("corrupted evidence storage is quarantined, not silently repaired", () => {
  const storage = memoryStorage();
  storage.setItem(EVIDENCE_STORE_KEY, "{{{");
  const { evidenceStore } = { evidenceStore: createEvidenceStore(storage, {
    assertionStore: createAssertionStore(storage),
    observationStore: createRecordStore({ storage, key: OBSERVATION_STORE_KEY, validate: validateObservation, idPrefix: "obs" }),
  }) };
  assert.equal(evidenceStore.list().length, 0);
  assert.equal(evidenceStore.health().corrupted, true);
});

test("missing evidence is honest: candidate and payload remain valid with none", () => {
  const { assertionStore, evidenceStore, assertionId } = setup();
  const candidate = createCandidate({ assertionId, summary: "possible need" });
  const payload = buildVnnDryRunPayload({
    candidate,
    assertion: assertionStore.get(assertionId).record,
    evidenceLinks: evidenceStore.linksForAssertionTree(assertionId).map((e) => e.record),
  });
  assert.equal(validateVnnDryRunPayload(payload).valid, true);
  assert.deepEqual(payload.evidenceRefs, []);
});

test("dry-run payload carries evidence references without media", () => {
  const { assertionStore, observationStore, evidenceStore, assertionId } = setup();
  const { id: obsId } = observationStore.save(createObservation({ assertionId, summary: "fence" }));
  evidenceStore.save(createEvidenceLink({ targetType: "assertion", targetId: assertionId, kind: "snapntalk_capture", reference: CAP_ID }));
  evidenceStore.save(createEvidenceLink({ targetType: "observation", targetId: obsId, kind: "content", reference: CONTENT_REF }));
  const candidate = createCandidate({ assertionId, observationId: obsId, summary: "possible need" });
  const payload = buildVnnDryRunPayload({
    candidate,
    assertion: assertionStore.get(assertionId).record,
    evidenceLinks: evidenceStore.linksForAssertionTree(assertionId).map((e) => e.record),
  });
  assert.equal(validateVnnDryRunPayload(payload).valid, true);
  assert.equal(payload.evidenceRefs.length, 2);
  assert.deepEqual(payload.evidenceRefs[0], { kind: "snapntalk_capture", reference: CAP_ID });
  // References only — no bytes, paths, or inline media keys anywhere.
  assert.equal(JSON.stringify(payload).includes("data:"), false);
});

test("payload rejects malformed evidenceRef entries", () => {
  const { assertionStore, assertionId } = setup();
  const candidate = createCandidate({ assertionId, summary: "s" });
  const payload = buildVnnDryRunPayload({ candidate, assertion: assertionStore.get(assertionId).record });
  assert.equal(validateVnnDryRunPayload({ ...payload, evidenceRefs: [{ kind: "", reference: "" }] }).valid, false);
  assert.equal(validateVnnDryRunPayload({ ...payload, evidenceRefs: "none" }).valid, false);
});
