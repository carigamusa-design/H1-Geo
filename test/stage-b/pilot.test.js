import assert from "node:assert/strict";
import test from "node:test";
import { SCHEMA_VERSION, CRS, validateCoordinateAssertion } from "../../src/coordinate-assertion.js";
import { createAssertionStore } from "../../src/stage-b/assertion-store.js";
import { createRecordStore, memoryStorage } from "../../src/stage-b/record-store.js";
import { createObservation, validateObservation, OBSERVATION_STORE_KEY } from "../../src/stage-b/observation.js";
import { createEvidenceLink, validateEvidenceLink } from "../../src/stage-b/evidence.js";
import { createEvidenceStore } from "../../src/stage-b/evidence-store.js";
import { createCandidate, validateCandidate } from "../../src/stage-b/candidate.js";
import { createCandidateStore } from "../../src/stage-b/candidate-store.js";
import { createHandoffRecord, validateHandoffRecord } from "../../src/stage-b/handoff.js";
import { createHandoffStore } from "../../src/stage-b/handoff-store.js";
import { buildVnnDryRunPayload } from "../../src/stage-b/vnn-dryrun.js";
import { createHandoffPackage, validatePackageStructure, PACKAGE_STORE_KEY } from "../../src/stage-b/handoff-package.js";
import { validateSignatureRecord, SIGNATURE_STORE_KEY, ed25519Available,
  generateSignerKey, createSignatureRecord } from "../../src/stage-b/signature.js";
import { validateVnnIntakeExport, VNN_EXPORT_STORE_KEY } from "../../src/stage-b/vnn-export.js";
import { isSyntheticRecord, draftIndex, filterDrafts, loadH1ExampleScenario } from "../../src/stage-b/workflow.js";
import { createBackup, validateBackup, restoreBackup } from "../../src/stage-b/backup.js";

const PIN_A = Object.freeze({
  schemaVersion: SCHEMA_VERSION, latitude: 33.749, longitude: -84.388, crs: CRS,
  source: "manual_target_pin", capturedAt: "2026-10-17T12:00:00Z",
  accuracyMeters: null, provenanceRef: "h1geo://field/real-visit-1",
});
const PIN_B = Object.freeze({
  schemaVersion: SCHEMA_VERSION, latitude: 34.052, longitude: -118.243, crs: CRS,
  source: "device_position", capturedAt: "2026-10-17T13:00:00Z",
  accuracyMeters: 8.2, provenanceRef: "h1geo://field/real-visit-2",
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
  const stores = {
    assertionStore, observationStore, evidenceStore, candidateStore,
    handoffStore, packageStore, signatureStore, exportStore,
  };
  return { storage, stores };
}

function specs(stores) {
  return [
    { name: "assertions", store: stores.assertionStore, validate: validateCoordinateAssertion,
      save: (r, id) => stores.assertionStore.save(r, { id }) },
    { name: "observations", store: stores.observationStore, validate: validateObservation,
      save: (r, id) => stores.observationStore.save(r, { id }),
      refs: [{ field: "assertionId", into: ["assertions"] }] },
    { name: "candidates", store: stores.candidateStore, validate: validateCandidate,
      save: (r, id) => stores.candidateStore.save(r, { id }),
      refs: [{ field: "assertionId", into: ["assertions"] },
             { field: "observationId", into: ["observations"] }] },
    { name: "evidence", store: stores.evidenceStore, validate: validateEvidenceLink,
      save: (r, id) => stores.evidenceStore.save(r, { id }),
      refs: [{ field: "targetId",
        intoBy: (rec) => [rec.targetType === "observation" ? "observations" : "assertions"] }] },
    { name: "handoffs", store: stores.handoffStore, validate: validateHandoffRecord,
      save: (r) => stores.handoffStore.save(r),
      refs: [{ field: "draftId", into: ["candidates"] }] },
    { name: "packages", store: stores.packageStore, validate: validatePackageStructure,
      save: (r, id) => stores.packageStore.save(r, { id }),
      refs: [{ field: "content.draftId", into: ["candidates"] }] },
    { name: "signatures", store: stores.signatureStore, validate: validateSignatureRecord,
      save: (r, id) => stores.signatureStore.save(r, { id }),
      refs: [{ field: "signedHash", valuesFrom: { store: "packages", path: "sha256" } }] },
    { name: "exports", store: stores.exportStore, validate: validateVnnIntakeExport,
      save: (r, id) => stores.exportStore.save(r, { id }),
      refs: [{ field: "packageRef.sha256", valuesFrom: { store: "packages", path: "sha256" } }] },
  ];
}

/** Two real pins, each with observation + evidence + draft (one approved). */
function multiRecord(stores) {
  const a1 = stores.assertionStore.save(PIN_A).id;
  const a2 = stores.assertionStore.save(PIN_B).id;
  const o1 = stores.observationStore.save(createObservation({
    assertionId: a1, summary: "gate latch broken" })).id;
  const o2 = stores.observationStore.save(createObservation({
    assertionId: a2, summary: "gutter detached at corner" })).id;
  stores.evidenceStore.save(createEvidenceLink({
    targetType: "observation", targetId: o1,
    kind: "snapntalk_capture", reference: "cap_a5b1c2d3-e4f5-4678-89ab-cdef01234567" }));
  const d1 = stores.candidateStore.save(createCandidate({
    assertionId: a1, observationId: o1, summary: "gate repair" })).id;
  const d2 = stores.candidateStore.save(createCandidate({
    assertionId: a2, observationId: o2, summary: "gutter work" })).id;
  // Approve d1 fully populated; leave d2 sparse + unreviewed.
  const c1 = stores.candidateStore.get(d1).record;
  stores.candidateStore.update(d1, {
    ...c1, title: "Fix gate latch", condition: "latch broken",
    proposedWork: "replace latch", requestedTiming: "this week",
    requiredCapabilities: ["handyman"],
  });
  const c1b = stores.candidateStore.get(d1).record;
  const payload = buildVnnDryRunPayload({
    candidate: c1b, assertion: stores.assertionStore.get(a1).record });
  stores.handoffStore.save(createHandoffRecord({
    draftId: d1, candidate: c1b, payload, decision: "approved", decidedBy: "founder" }));
  return { a1, a2, o1, o2, d1, d2 };
}

test("synthetic marking distinguishes loader records from real entries", () => {
  const { stores } = setup();
  const sc = loadH1ExampleScenario(stores);
  const realId = stores.assertionStore.save(PIN_A).id;
  assert.equal(isSyntheticRecord(stores.assertionStore.get(sc.assertionId).record), true);
  assert.equal(isSyntheticRecord(stores.assertionStore.get(realId).record), false);
  assert.equal(isSyntheticRecord(stores.candidateStore.get(sc.draftId).record), true);
  const rows = draftIndex(stores);
  assert.equal(rows.find((r) => r.id === sc.draftId).synthetic, true);
});

test("draft index + filters work across multiple locations and states", async () => {
  const { stores } = setup();
  const { a1, a2, d1, d2 } = multiRecord(stores);
  const all = draftIndex(stores);
  assert.equal(all.length, 2);
  // Status filter.
  assert.equal(filterDrafts(all, { status: "approved" })[0].id, d1);
  assert.equal(filterDrafts(all, { status: "unreviewed" })[0].id, d2);
  // Evidence filter — d1's pin has a link, d2's doesn't.
  assert.equal(filterDrafts(all, { evidence: "linked" })[0].id, d1);
  assert.equal(filterDrafts(all, { evidence: "none" })[0].id, d2);
  // Scope + query.
  assert.equal(filterDrafts(all, { assertionId: a2 })[0].id, d2);
  assert.equal(filterDrafts(all, { query: "gutter" })[0].id, d2);
  assert.equal(filterDrafts(all, { query: "34.052" })[0].id, d2);
  assert.equal(filterDrafts(all, { query: "nowhere" }).length, 0);
  // Missing-field reporting stays per-draft.
  const r2 = all.find((r) => r.id === d2);
  assert.ok(r2.missing.length > 0);
  const r1 = all.find((r) => r.id === d1);
  assert.deepEqual(r1.missing, []);
});

test("backup captures everything; validate accepts a clean backup", async () => {
  const { stores } = setup();
  multiRecord(stores);
  const doc = await createBackup(specs(stores));
  assert.equal(doc.schemaVersion, "h1-geo/working-records-backup-v0");
  assert.match(doc.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(doc.recordCounts, {
    assertions: 2, observations: 2, candidates: 2,
    evidence: 1, handoffs: 1, packages: 0, signatures: 0, exports: 0 });
  const check = await validateBackup(doc, specs(stores));
  assert.equal(check.valid, true, JSON.stringify(check.errors));
});

test("backup restore preserves ids and relationships through a wipe", async () => {
  const { stores } = setup();
  const { a1, o1, d1 } = multiRecord(stores);
  // Package the approved draft so packages/signatures/exercises chain exists.
  const { package: pkg } = await createHandoffPackage({
    draftId: d1, candidateStore: stores.candidateStore,
    assertionStore: stores.assertionStore,
    evidenceStore: stores.evidenceStore, handoffStore: stores.handoffStore });
  stores.packageStore.save(pkg);
  const doc = await createBackup(specs(stores));

  // Wipe via restore into a fresh store set over the same backup.
  const { stores: fresh } = setup();
  const result = await restoreBackup(doc, specs(fresh));
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.ok(fresh.assertionStore.get(a1));
  assert.ok(fresh.candidateStore.get(d1));
  assert.equal(fresh.candidateStore.get(d1).record.observationId, o1);
  assert.equal(fresh.evidenceStore.linksForAssertionTree(a1).length, 1);
  assert.equal(fresh.handoffStore.forDraft(d1).length, 1);
  assert.equal(fresh.handoffStore.forDraft(d1)[0].record.decision, "approved");
  assert.equal(fresh.packageStore.list()[0].record.sha256, pkg.sha256);
});

test("backup validation catches tamper, bad records, and dangling references", async () => {
  const { stores } = setup();
  multiRecord(stores);
  const doc = await createBackup(specs(stores));
  // Tamper → digest fails.
  const t = JSON.parse(JSON.stringify(doc));
  t.records.candidates[0].record.title = "forged";
  assert.equal((await validateBackup(t, specs(stores))).valid, false);
  // Bad record (recompute digest so only the record-level check fires).
  const bad = JSON.parse(JSON.stringify(doc));
  bad.records.observations[0].record.assertionId = 42;
  const { createHash } = await import("node:crypto");
  const { canonicalJson } = await import("../../src/stage-b/fingerprint.js");
  bad.sha256 = createHash("sha256").update(canonicalJson(bad.records)).digest("hex");
  const check = await validateBackup(bad, specs(stores));
  assert.equal(check.valid, false);
  assert.ok(check.errors.some((e) => e.field.includes("observations")));
  // Dangling ref.
  const dangle = JSON.parse(JSON.stringify(doc));
  dangle.records.candidates[0].record.assertionId = "asrt_ghost";
  dangle.sha256 = createHash("sha256").update(canonicalJson(dangle.records)).digest("hex");
  const check2 = await validateBackup(dangle, specs(stores));
  assert.equal(check2.valid, false);
  assert.ok(check2.errors.some((e) => /dangling/.test(e.message)));
  // Wrong version + malformed JSON.
  assert.equal((await validateBackup({ schemaVersion: "v9" }, specs(stores))).valid, false);
  assert.equal((await validateBackup("nope", specs(stores))).valid, false);
});

test("restore refuses an invalid backup without touching the stores", async () => {
  const { stores } = setup();
  multiRecord(stores);
  const doc = await createBackup(specs(stores));
  const bad = JSON.parse(JSON.stringify(doc));
  delete bad.records.assertions;
  const { createHash } = await import("node:crypto");
  const { canonicalJson } = await import("../../src/stage-b/fingerprint.js");
  bad.sha256 = createHash("sha256").update(canonicalJson(bad.records)).digest("hex");
  const before = stores.assertionStore.list().length;
  const result = await restoreBackup(bad, specs(stores));
  assert.equal(result.ok, false);
  assert.equal(stores.assertionStore.list().length, before, "stores untouched on failure");
});

test("full chain backup: package + signature + export all survive restore", async () => {
  if (!(await ed25519Available())) return;
  const { stores } = setup();
  const { d1 } = multiRecord(stores);
  const { package: pkg } = await createHandoffPackage({
    draftId: d1, candidateStore: stores.candidateStore,
    assertionStore: stores.assertionStore,
    evidenceStore: stores.evidenceStore, handoffStore: stores.handoffStore });
  stores.packageStore.save(pkg);
  const key = await generateSignerKey();
  const sig = (await createSignatureRecord({
    pkg, privateKey: key.privateKey, publicKeyHex: key.publicKeyHex, signerId: "founder",
  })).signature;
  stores.signatureStore.save(sig);
  const { buildVnnIntakeExport } = await import("../../src/stage-b/vnn-export.js");
  const exp = (await import("../../src/stage-b/vnn-export.js")).buildVnnIntakeExport;
  const rec = exp({ pkg, requesterRef: "r", signatureRec: sig }).record;
  stores.exportStore.save(rec);
  const doc = await createBackup(specs(stores));
  assert.equal((await validateBackup(doc, specs(stores))).valid, true, JSON.stringify((await validateBackup(doc, specs(stores))).errors));
  const { stores: fresh } = setup();
  const result = await restoreBackup(doc, specs(fresh));
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(fresh.signatureStore.list().length, 1);
  assert.equal(fresh.exportStore.list().length, 1);
  assert.equal(fresh.exportStore.list()[0].record.packageRef.sha256, pkg.sha256);
});
