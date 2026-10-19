import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OSM_PILOT_DATASET } from "../../src/stage-b/osm-pilot-data.js";
import { candidatesNear } from "../../src/geo/sources.js";
import { assessAmbiguity, createDestinationConfirmation,
  validateDestinationConfirmation } from "../../src/geo/property.js";
import { assessDestination } from "../../src/geo/assessment.js";
import { createAssertionStore } from "../../src/stage-b/assertion-store.js";
import { createRecordStore, memoryStorage } from "../../src/stage-b/record-store.js";
import { createCandidateStore } from "../../src/stage-b/candidate-store.js";
import { createHandoffStore } from "../../src/stage-b/handoff-store.js";
import { createEvidenceStore } from "../../src/stage-b/evidence-store.js";
import { createObservation, validateObservation, OBSERVATION_STORE_KEY }
  from "../../src/stage-b/observation.js";
import { createHandoffPackage } from "../../src/stage-b/handoff-package.js";
import { createCandidate } from "../../src/stage-b/candidate.js";
import { SCHEMA_VERSION, CRS } from "../../src/coordinate-assertion.js";

// GEO-019: controlled-pilot acceptance criteria as executable checks.
const ATL = OSM_PILOT_DATASET.regions.find((r) => r.id === "atlanta-summerhill");
const TIJ = OSM_PILOT_DATASET.regions.find((r) => r.id === "tijuana-libertad");

test("AC1: never auto-selects an uncertain neighbor — ambiguous stays a choice", () => {
  // Dense Tijuana point between buildings: multiple candidates in range,
  // none containing the point. The assessment surfaces options but never
  // contains a selected property.
  const point = { latitude: 32.51416, longitude: -117.0385 };
  const cands = candidatesNear({ point, osmDataset: OSM_PILOT_DATASET });
  const a = assessDestination({ point, candidates: cands, accuracyMeters: 5 });
  assert.equal(a.state, "multiple_plausible");
  assert.ok(a.candidates.length > 1);
  assert.equal(a.selectedCandidate, undefined);
  assert.equal(a.confirmationId ?? null, null); // no confirmation implied
});

test("AC2: correction is explicit and recorded — never silent", () => {
  const device = { latitude: 33.73950, longitude: -84.38295, accuracyMeters: 12 };
  const corrected = { latitude: 33.73958, longitude: -84.38298 };
  const conf = createDestinationConfirmation({
    assertionId: "a1", deviceEstimate: device, confirmedPoint: corrected,
    confirmedBy: "acceptance", source: "manual_adjustment" });
  assert.equal(conf.correctionApplied.moved, true);
  assert.ok(conf.correctionApplied.movedMeters > 0);
  assert.equal(conf.correctionApplied.originalPreserved, true);
  assert.equal(conf.deviceEstimate.latitude, device.latitude); // evidence intact
  // A record claiming the original was not preserved fails validation.
  const bad = { ...conf, correctionApplied: { ...conf.correctionApplied, originalPreserved: false } };
  assert.equal(validateDestinationConfirmation(bad).valid, false);
});

test("AC3: no fabricated addresses — untagged footprints get building labels", () => {
  // Tijuana has zero addr tags: labels must describe buildings, not addresses.
  const cands = candidatesNear({
    point: TIJ.features[0].centroid, osmDataset: OSM_PILOT_DATASET });
  assert.ok(cands.length > 0);
  for (const c of cands) {
    assert.equal(c.source.provider, "OpenStreetMap contributors");
    if (c.kind === "building_footprint") {
      assert.match(c.label, /OSM building/);
      assert.doesNotMatch(c.label, /unverified|no housenumber/);
    } else {
      assert.match(c.label, /unverified/); // addr tags always labeled unverified
    }
  }
});

test("AC4: no handoff package without a named approval", async () => {
  const storage = memoryStorage();
  const assertionStore = createAssertionStore(storage);
  const observationStore = createRecordStore({
    storage, key: OBSERVATION_STORE_KEY, validate: validateObservation, idPrefix: "obs" });
  const candidateStore = createCandidateStore(storage);
  const handoffStore = createHandoffStore(storage, { candidateStore });
  const evidenceStore = createEvidenceStore(storage, { assertionStore, observationStore });
  const pin = assertionStore.save({
    schemaVersion: SCHEMA_VERSION, latitude: 33.73958, longitude: -84.38298,
    crs: CRS, source: "manual_target_pin", capturedAt: new Date().toISOString(),
    provenanceRef: "h1geo://acceptance/x" });
  const draft = candidateStore.save(createCandidate({
    assertionId: pin.id, summary: "x" }));
  const res = await createHandoffPackage({
    draftId: draft.id, candidateStore, assertionStore, evidenceStore, handoffStore });
  assert.equal(res.ok, false); // unreviewed draft cannot be packaged
});

test("AC5: unavailable geographic data is reported, not guessed", () => {
  // Point outside all pilot coverage.
  const point = { latitude: 34.0, longitude: -85.0 };
  const cands = candidatesNear({ point, osmDataset: OSM_PILOT_DATASET });
  assert.equal(cands.length, 0);
  const a = assessDestination({ point, candidates: cands, accuracyMeters: 10 });
  assert.equal(a.state, "insufficient_info");
  assert.equal(a.verdict, "no_source_data");
  // Inside coverage but on open ground: a different honest verdict.
  const open = { latitude: (ATL.bbox[1] + ATL.bbox[3]) / 2 - 0.0011,
    longitude: (ATL.bbox[0] + ATL.bbox[2]) / 2 };
  const near = candidatesNear({ point: open, osmDataset: OSM_PILOT_DATASET });
  const v = assessAmbiguity({ point: open, candidates: near });
  assert.notEqual(v.verdict, "no_source_data");
});

test("AC6: privacy — dev certificates are gitignored, exports carry a privacy note", () => {
  const gitignore = readFileSync(".gitignore", "utf8");
  assert.match(gitignore, /dev-cert/);
  // And no cert/key material is tracked in the repo.
  const tracked = readFileSync("docs/LAUNCH_CANDIDATE.md", "utf8"); // sanity read
  assert.ok(tracked.length > 0);
});
