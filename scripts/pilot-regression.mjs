/**
 * GEO-018 launch-candidate regression — synthetic end-to-end run of the
 * complete pilot loop through the REAL stores and contracts, once per OSM
 * pilot region plus an out-of-coverage control.
 *
 *   location → candidates → ambiguity → destination confirmation →
 *   observation → evidence → opportunity draft → named approval →
 *   handoff package → verify → local export record → field measurement
 *
 * Every record is marked SYNTHETIC. Run: `node scripts/pilot-regression.mjs`
 * Exit 1 on any failed check. Nothing is submitted anywhere.
 */
import { createAssertionStore } from "../src/stage-b/assertion-store.js";
import { createRecordStore, memoryStorage } from "../src/stage-b/record-store.js";
import { createObservation, validateObservation, OBSERVATION_STORE_KEY }
  from "../src/stage-b/observation.js";
import { createEvidenceLink } from "../src/stage-b/evidence.js";
import { createEvidenceStore } from "../src/stage-b/evidence-store.js";
import { createCandidateStore } from "../src/stage-b/candidate-store.js";
import { createCandidate } from "../src/stage-b/candidate.js";
import { createHandoffRecord } from "../src/stage-b/handoff.js";
import { createHandoffStore } from "../src/stage-b/handoff-store.js";
import { buildVnnDryRunPayload } from "../src/stage-b/vnn-dryrun.js";
import { createHandoffPackage, verifyPackage, validatePackageStructure,
  PACKAGE_STORE_KEY } from "../src/stage-b/handoff-package.js";
import { buildVnnIntakeExport } from "../src/stage-b/vnn-export.js";
import { OSM_PILOT_DATASET } from "../src/stage-b/osm-pilot-data.js";
import { candidatesNear } from "../src/geo/sources.js";
import { assessAmbiguity, createDestinationConfirmation,
  validateDestinationConfirmation, CONFIRM_STORE_KEY,
  destinationConfirmedFor } from "../src/geo/property.js";
import { createFieldMeasurement, validateFieldMeasurement, FIELD_STORE_KEY }
  from "../src/geo/field.js";
import { SCHEMA_VERSION, CRS } from "../src/coordinate-assertion.js";

const results = [];
const check = (region, step, ok, detail = "") =>
  results.push({ region, step, ok, detail });

function stores() {
  const storage = memoryStorage();
  const assertionStore = createAssertionStore(storage);
  const observationStore = createRecordStore({
    storage, key: OBSERVATION_STORE_KEY, validate: validateObservation, idPrefix: "obs" });
  const evidenceStore = createEvidenceStore(storage, { assertionStore, observationStore });
  const candidateStore = createCandidateStore(storage);
  const handoffStore = createHandoffStore(storage, { candidateStore });
  const packageStore = createRecordStore({
    storage, key: PACKAGE_STORE_KEY, validate: validatePackageStructure, idPrefix: "pkg" });
  const confirmStore = createRecordStore({
    storage, key: CONFIRM_STORE_KEY, validate: validateDestinationConfirmation, idPrefix: "cnf" });
  const fieldStore = createRecordStore({
    storage, key: FIELD_STORE_KEY, validate: validateFieldMeasurement, idPrefix: "fld" });
  return { assertionStore, observationStore, evidenceStore, candidateStore,
    handoffStore, packageStore, confirmStore, fieldStore };
}

async function runFlow(region, point, tag) {
  const s = stores();
  const R = `${region.id}/${tag}`;

  const pin = s.assertionStore.save({
    schemaVersion: SCHEMA_VERSION, latitude: point.latitude, longitude: point.longitude,
    crs: CRS, source: "manual_target_pin", capturedAt: new Date().toISOString(),
    accuracyMeters: 8, provenanceRef: `h1geo://regression/synthetic-${region.id}-${tag}`,
    notes: "SYNTHETIC regression pin",
  });
  check(R, "location saved", pin.ok !== false && !!pin.id);

  const cands = candidatesNear({ point, osmDataset: OSM_PILOT_DATASET });
  const verdict = assessAmbiguity({ point, candidates: cands, accuracyMeters: 8 });
  check(R, "ambiguity assessed", typeof verdict.verdict === "string",
    `${verdict.verdict} (${cands.length} candidates)`);

  const conf = s.confirmStore.save(createDestinationConfirmation({
    assertionId: pin.id, confirmedPoint: point, candidates: cands,
    accuracyMeters: 8, confirmedBy: "regression",
    notes: "SYNTHETIC regression confirmation",
  }));
  check(R, "destination confirmed", conf.ok !== false &&
    destinationConfirmedFor(s.confirmStore, pin.id) !== null);

  const obs = s.observationStore.save(createObservation({
    assertionId: pin.id, summary: `SYNTHETIC: regression observation at ${region.name}` }));
  check(R, "observation saved", obs.ok !== false && !!obs.id);

  const ev = s.evidenceStore.save(createEvidenceLink({
    targetType: "observation", targetId: obs.id, kind: "document",
    reference: `h1geo://regression/${region.id}-${tag}-doc`, note: "SYNTHETIC" }));
  check(R, "evidence linked", ev.ok !== false && !!ev.id);

  const created = s.candidateStore.save(createCandidate({
    assertionId: pin.id, observationId: obs.id,
    summary: `SYNTHETIC regression opportunity at ${region.name}` }));
  s.candidateStore.update(created.id, {
    ...s.candidateStore.get(created.id).record,
    title: `Regression opportunity ${region.name} ${tag}`,
    condition: "synthetic condition",
    proposedWork: "synthetic work",
    requestedTiming: "within two weeks",
    requiredCapabilities: ["fencing"],
    evidenceRequirements: "photos",
    offeredAmount: 100, currency: region.id === "tijuana-libertad" ? "MXN" : "USD",
    amountCertainty: "approximate",
  });
  const candidate = s.candidateStore.get(created.id).record;
  const payload = buildVnnDryRunPayload({
    candidate, assertion: s.assertionStore.get(pin.id).record });
  check(R, "draft intake complete", payload.missing.length === 0,
    payload.missing.join(",") || "ready");

  const rev = s.handoffStore.save(createHandoffRecord({
    draftId: created.id, candidate, payload,
    decision: "approved", decidedBy: "regression-reviewer" }));
  check(R, "named approval", rev.ok !== false && !!rev.id);

  const { ok: pkgOk, package: pkg, errors } = await createHandoffPackage({
    draftId: created.id, candidateStore: s.candidateStore,
    assertionStore: s.assertionStore, evidenceStore: s.evidenceStore,
    handoffStore: s.handoffStore });
  check(R, "package created", pkgOk === true, errors?.join(";") ?? "");
  if (pkgOk) {
    const c = pkg.content;
    check(R, "location survives to package",
      c.assertion.latitude === point.latitude && c.assertion.longitude === point.longitude);
    check(R, "provenance survives", c.provenanceRef === `h1geo://regression/synthetic-${region.id}-${tag}`);
    const ver = await verifyPackage(pkg, {
      assertionStore: s.assertionStore, candidateStore: s.candidateStore });
    check(R, "package verifies", ver.valid === true);
    const exp = buildVnnIntakeExport({ pkg, requesterRef: "h1geo://regression/self" });
    check(R, "export record (dry-run)", exp.ok === true && exp.record.dryRun === true
      && exp.record.packageRef?.sha256 === pkg.sha256);
  }

  const fm = s.fieldStore.save(createFieldMeasurement({
    referenceDestination: { latitude: point.latitude, longitude: point.longitude,
      source: "synthetic regression reference" },
    selected: { point }, correctBuildingIdentified: null,
    regionId: region.id, measuredBy: "regression", simulated: true,
    ambiguityVerdict: verdict.verdict, candidateCount: cands.length }));
  check(R, "measurement recorded (simulated)", fm.ok !== false &&
    s.fieldStore.get(fm.id).record.simulated === true);
}

for (const region of OSM_PILOT_DATASET.regions) {
  const inside = region.features[0].centroid;
  await runFlow(region, inside, "in-coverage");
  const out = {
    latitude: region.bbox[1] - 0.01, longitude: region.bbox[0] - 0.01 };
  await runFlow(region, out, "out-of-coverage");
}

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.region.padEnd(44)} ${r.step}${r.detail ? ` — ${r.detail}` : ""}`);
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed` +
  (failed.length ? ` — ${failed.length} FAILED` : ""));
process.exit(failed.length ? 1 : 0);
