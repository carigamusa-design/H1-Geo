import test from "node:test";
import assert from "node:assert/strict";
import { createAssertionStore } from "../../src/stage-b/assertion-store.js";
import { createRecordStore, memoryStorage } from "../../src/stage-b/record-store.js";
import { createObservation, validateObservation, OBSERVATION_STORE_KEY }
  from "../../src/stage-b/observation.js";
import { createEvidenceLink, validateEvidenceLink, EVIDENCE_STORE_KEY }
  from "../../src/stage-b/evidence.js";
import { createEvidenceStore } from "../../src/stage-b/evidence-store.js";
import { createCandidateStore } from "../../src/stage-b/candidate-store.js";
import { createCandidate, validateCandidate } from "../../src/stage-b/candidate.js";
import { createHandoffRecord, validateHandoffRecord } from "../../src/stage-b/handoff.js";
import { createHandoffStore } from "../../src/stage-b/handoff-store.js";
import { buildVnnDryRunPayload } from "../../src/stage-b/vnn-dryrun.js";
import { createHandoffPackage, verifyPackage, validatePackageStructure,
  PACKAGE_STORE_KEY } from "../../src/stage-b/handoff-package.js";
import { buildVnnIntakeExport, validateVnnIntakeExport, VNN_EXPORT_STORE_KEY }
  from "../../src/stage-b/vnn-export.js";
import { createBackup, restoreBackup, validateBackup } from "../../src/stage-b/backup.js";
import { validateCoordinateAssertion } from "../../src/coordinate-assertion.js";
import { validateSignatureRecord, SIGNATURE_STORE_KEY } from "../../src/stage-b/signature.js";
import { candidatesNear } from "../../src/geo/sources.js";
import { OSM_PILOT_DATASET } from "../../src/stage-b/osm-pilot-data.js";
import { createDestinationConfirmation, validateDestinationConfirmation,
  CONFIRM_STORE_KEY, destinationConfirmedFor } from "../../src/geo/property.js";
import { createFieldMeasurement, validateFieldMeasurement, FIELD_STORE_KEY }
  from "../../src/geo/field.js";
import { SITE_STORE_KEY, validateSiteDescriptor } from "../../src/geo/site.js";

const ATL = OSM_PILOT_DATASET.regions.find((r) => r.id === "atlanta-summerhill");
const POINT = ATL.features[0].centroid;

function setup(storage = memoryStorage()) {
  const assertionStore = createAssertionStore(storage);
  const observationStore = createRecordStore({
    storage, key: OBSERVATION_STORE_KEY, validate: validateObservation, idPrefix: "obs" });
  const evidenceStore = createEvidenceStore(storage, { assertionStore, observationStore });
  const candidateStore = createCandidateStore(storage);
  const handoffStore = createHandoffStore(storage, { candidateStore });
  const packageStore = createRecordStore({
    storage, key: PACKAGE_STORE_KEY, validate: validatePackageStructure, idPrefix: "pkg" });
  const signatureStore = createRecordStore({
    storage, key: SIGNATURE_STORE_KEY, validate: validateSignatureRecord, idPrefix: "sig" });
  const exportStore = createRecordStore({
    storage, key: VNN_EXPORT_STORE_KEY, validate: validateVnnIntakeExport, idPrefix: "vex" });
  const siteStore = createRecordStore({
    storage, key: SITE_STORE_KEY, validate: validateSiteDescriptor, idPrefix: "site" });
  const confirmStore = createRecordStore({
    storage, key: CONFIRM_STORE_KEY, validate: validateDestinationConfirmation, idPrefix: "cnf" });
  const fieldStore = createRecordStore({
    storage, key: FIELD_STORE_KEY, validate: validateFieldMeasurement, idPrefix: "fld" });
  const stores = { assertionStore, observationStore, evidenceStore, candidateStore,
    handoffStore, packageStore, signatureStore, exportStore, siteStore,
    confirmStore, fieldStore };
  const specs = [
    { name: "assertions", store: assertionStore, validate: validateCoordinateAssertion,
      save: (r, id) => assertionStore.save(r, { id }) },
    { name: "observations", store: observationStore, validate: validateObservation,
      save: (r, id) => observationStore.save(r, { id }),
      refs: [{ field: "assertionId", into: ["assertions"] }] },
    { name: "candidates", store: candidateStore, validate: validateCandidate,
      save: (r, id) => candidateStore.save(r, { id }),
      refs: [{ field: "assertionId", into: ["assertions"] },
             { field: "observationId", into: ["observations"] }] },
    { name: "evidence", store: evidenceStore, validate: validateEvidenceLink,
      save: (r, id) => evidenceStore.save(r, { id }),
      refs: [{ field: "targetId",
        intoBy: (rec) => [rec.targetType === "observation" ? "observations" : "assertions"] }] },
    { name: "handoffs", store: handoffStore, validate: validateHandoffRecord,
      save: (r) => handoffStore.save(r),
      refs: [{ field: "draftId", into: ["candidates"] }] },
    { name: "packages", store: packageStore, validate: validatePackageStructure,
      save: (r, id) => packageStore.save(r, { id }),
      refs: [{ field: "content.draftId", into: ["candidates"] }] },
    { name: "confirmations", store: confirmStore, validate: validateDestinationConfirmation,
      save: (r, id) => confirmStore.save(r, { id }),
      refs: [{ field: "assertionId", into: ["assertions"] }] },
    { name: "fieldMeasurements", store: fieldStore, validate: validateFieldMeasurement,
      save: (r, id) => fieldStore.save(r, { id }) },
  ];
  return { storage, stores, specs };
}

async function runPilotFlow(stores, point, region) {
  const pin = stores.assertionStore.save({
    schemaVersion: "h1-geo/coordinate-assertion-v0",
    latitude: point.latitude, longitude: point.longitude, crs: "EPSG:4326",
    source: "manual_target_pin", capturedAt: new Date().toISOString(),
    accuracyMeters: 8, provenanceRef: `h1geo://e2e/synthetic-${region.id}`,
    notes: "SYNTHETIC e2e pin" });
  assert.equal(pin.ok, true);
  const cands = candidatesNear({ point, osmDataset: OSM_PILOT_DATASET });
  const conf = stores.confirmStore.save(createDestinationConfirmation({
    assertionId: pin.id, confirmedPoint: point, candidates: cands,
    accuracyMeters: 8, confirmedBy: "e2e", notes: "SYNTHETIC" }));
  const obs = stores.observationStore.save(createObservation({
    assertionId: pin.id, summary: "SYNTHETIC e2e observation" }));
  stores.evidenceStore.save(createEvidenceLink({
    targetType: "observation", targetId: obs.id, kind: "document",
    reference: `h1geo://e2e/${region.id}-doc`, note: "SYNTHETIC" }));
  const draft = stores.candidateStore.save(createCandidate({
    assertionId: pin.id, observationId: obs.id, summary: "SYNTHETIC e2e draft" }));
  stores.candidateStore.update(draft.id, { ...draft.record,
    title: "E2E fence", condition: "c", proposedWork: "w",
    requestedTiming: "soon", requiredCapabilities: ["fencing"],
    evidenceRequirements: "photos", offeredAmount: 100,
    currency: "USD", amountCertainty: "approximate" });
  const candidate = stores.candidateStore.get(draft.id).record;
  const payload = buildVnnDryRunPayload({
    candidate, assertion: stores.assertionStore.get(pin.id).record });
  stores.handoffStore.save(createHandoffRecord({
    draftId: draft.id, candidate, payload,
    decision: "approved", decidedBy: "e2e-reviewer" }));
  const { package: pkg } = await createHandoffPackage({
    draftId: draft.id, candidateStore: stores.candidateStore,
    assertionStore: stores.assertionStore,
    evidenceStore: stores.evidenceStore, handoffStore: stores.handoffStore });
  stores.packageStore.save(pkg);
  const exp = buildVnnIntakeExport({ pkg, requesterRef: "h1geo://e2e/self" });
  stores.exportStore.save(exp.record);
  const fm = stores.fieldStore.save(createFieldMeasurement({
    referenceDestination: { latitude: point.latitude, longitude: point.longitude,
      source: "synthetic e2e reference" },
    selected: { point }, regionId: region.id, measuredBy: "e2e",
    simulated: true }));
  return { pinId: pin.id, draftId: draft.id, pkg, fmId: fm.id };
}

test("complete pilot flow: every stage's required info survives to export", async () => {
  const { stores } = setup();
  const r = await runPilotFlow(stores, POINT, ATL);
  const c = r.pkg.content;
  assert.equal(c.assertion.latitude, POINT.latitude);
  assert.equal(c.assertion.provenanceRef, `h1geo://e2e/synthetic-${ATL.id}`);
  assert.equal(c.review.decidedBy, "e2e-reviewer");
  assert.equal(c.dryRun, true);
  assert.ok(c.evidenceRefs.some((e) => e.reference.includes("e2e")));
  const ver = await verifyPackage(r.pkg, {
    assertionStore: stores.assertionStore, candidateStore: stores.candidateStore });
  assert.equal(ver.valid, true);
  const exp = stores.exportStore.list()[0].record;
  assert.equal(exp.packageRef.sha256, r.pkg.sha256);
  assert.equal(exp.dryRun, true);
  // confirmation + measurement linked to the same location
  assert.equal(destinationConfirmedFor(stores.confirmStore, r.pinId) !== null, true);
  assert.equal(stores.fieldStore.get(r.fmId).record.simulated, true);
});

test("measurement continuity: full state survives backup → fresh stores → restore", async () => {
  const { stores, specs } = setup();
  const r = await runPilotFlow(stores, POINT, ATL);
  const backup = await createBackup(specs);
  const check = await validateBackup(backup, specs);
  assert.equal(check.valid, true, check.errors.map((e) => `${e.field}: ${e.message}`).join("; "));

  const storage2 = memoryStorage();
  const { stores: stores2, specs: specs2 } = setup(storage2);
  const res = await restoreBackup(backup, specs2);
  assert.equal(res.ok, true, res.errors?.map((e) => `${e.field}: ${e.message}`).join("; "));

  const pin2 = stores2.assertionStore.get(r.pinId);
  assert.equal(pin2.record.provenanceRef, `h1geo://e2e/synthetic-${ATL.id}`);
  assert.equal(destinationConfirmedFor(stores2.confirmStore, r.pinId) !== null, true);
  const fm2 = stores2.fieldStore.get(r.fmId);
  assert.equal(fm2.record.regionId, ATL.id);
  assert.equal(fm2.record.simulated, true);
  assert.equal(fm2.record.referenceDestination.source, "synthetic e2e reference");
  const ver = await verifyPackage(stores2.packageStore.list()[0].record, {
    assertionStore: stores2.assertionStore, candidateStore: stores2.candidateStore });
  assert.equal(ver.valid, true);
});

test("tampered backup is rejected at restore — nothing half-restores", async () => {
  const { stores, specs } = setup();
  await runPilotFlow(stores, POINT, ATL);
  const backup = await createBackup(specs);
  backup.records.assertions[0].record.latitude += 0.001; // silent edit
  const check = await validateBackup(backup, specs);
  assert.equal(check.valid, false);
  assert.ok(check.errors.some((e) => /digest/.test(e.message)));
});
