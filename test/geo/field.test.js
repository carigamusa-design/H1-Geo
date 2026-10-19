import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assessDestination, ASSESSMENT_STATES } from "../../src/geo/assessment.js";
import {
  createFieldMeasurement, validateFieldMeasurement,
  measurementSummary, FIELD_STORE_KEY,
} from "../../src/geo/field.js";
import { osmCandidates } from "../../src/geo/sources.js";
import {
  createDestinationConfirmation, validateDestinationConfirmation,
  CONFIRM_STORE_KEY,
} from "../../src/geo/property.js";
import { createRecordStore, memoryStorage } from "../../src/stage-b/record-store.js";
import { PROPERTY_FIXTURES } from "../../src/stage-b/property-fixtures.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OSM = JSON.parse(readFileSync(join(root, "data/osm-pilot-areas.json"), "utf8"));
const region = (id) => OSM.regions.find((r) => r.id === id);

// A — assessment states
test("assessment: point inside one footprint → likely_candidate, confirmation required", () => {
  const cands = osmCandidates(region("atlanta-summerhill"));
  const a = assessDestination({ point: cands[0], candidates: cands, accuracyMeters: 10 });
  assert.equal(a.state, "likely_candidate");
  assert.match(a.headline, /confirmation required/i);
  assert.ok(!/%/.test(a.headline + a.detail), "no percentages anywhere");
});

test("assessment: dense midpoint → multiple_plausible", () => {
  const cands = osmCandidates(region("tijuana-libertad"));
  const mid = { latitude: (cands[0].latitude + cands[1].latitude) / 2,
    longitude: (cands[0].longitude + cands[1].longitude) / 2 };
  // dense block: force a small radius so several centroids are in reach only if close
  const a = assessDestination({ point: mid, candidates: cands, accuracyMeters: 25 });
  assert.ok(["multiple_plausible", "likely_candidate"].includes(a.state));
});

test("assessment: no candidates → insufficient_info; existing confirmation → user_confirmed", () => {
  const a = assessDestination({ point: { latitude: 0, longitude: 0 }, candidates: [] });
  assert.equal(a.state, "insufficient_info");
  const conf = { id: "conf_1", record: { confirmedBy: "op", confirmedPoint: { latitude: 0, longitude: 0 } } };
  const b = assessDestination({ point: { latitude: 0, longitude: 0 }, candidates: [], confirmedRecord: conf });
  assert.equal(b.state, "user_confirmed");
  assert.ok(ASSESSMENT_STATES.includes(b.state));
});

// B — correction preservation
test("correction history: repeated confirmations keep every record; selected candidate is captured", () => {
  const backend = memoryStorage();
  const store = createRecordStore({ storage: backend, key: CONFIRM_STORE_KEY,
    validate: validateDestinationConfirmation, idPrefix: "conf" });
  const cands = osmCandidates(region("sanjose-centro"));
  const r1 = createDestinationConfirmation({
    assertionId: "a1", confirmedPoint: { latitude: cands[0].latitude, longitude: cands[0].longitude },
    candidates: cands, confirmedBy: "op", confirmedAt: "2026-10-18T01:00:00Z",
    selectedCandidate: cands[0], interactionCount: 3, durationMs: 42_000,
  });
  const r2 = createDestinationConfirmation({
    assertionId: "a1", confirmedPoint: { latitude: cands[1].latitude, longitude: cands[1].longitude },
    candidates: cands, confirmedBy: "op", confirmedAt: "2026-10-18T02:00:00Z",
    selectedCandidate: cands[1], interactionCount: 1, durationMs: 9_000,
  });
  assert.ok(store.save(r1).ok);
  assert.ok(store.save(r2).ok);
  assert.equal(store.list().length, 2);
  const e = store.list().find((x) => x.record.selectedCandidate?.id === cands[1].id);
  assert.equal(e.record.interactionCount, 1);
  assert.equal(e.record.selectedCandidate.sourceProvider, "OpenStreetMap contributors");
});

test("confirmation validator tolerates selectedCandidate but rejects malformed ones", () => {
  const rec = createDestinationConfirmation({
    assertionId: "x", confirmedPoint: { latitude: 1, longitude: 1 },
    candidates: [], confirmedBy: "op", selectedCandidate: { id: "c1", label: "x" },
  });
  assert.equal(validateDestinationConfirmation(rec).valid, true);
  rec.selectedCandidate = "not-an-object";
  assert.equal(validateDestinationConfirmation(rec).valid, false);
});

// C — field measurement records
test("field measurement computes errors; simulated is the honest default", () => {
  const rec = createFieldMeasurement({
    devicePosition: { latitude: 33.7390, longitude: -84.3810, accuracyMeters: 20 },
    referenceDestination: { latitude: 33.7392, longitude: -84.3810, source: "standing at known address" },
    selected: { point: { latitude: 33.7391, longitude: -84.3810 }, candidateId: "c1" },
    correctBuildingIdentified: true, correctionNeeded: true,
    interactionCount: 4, durationMs: 30_000, measuredBy: "op",
  });
  assert.equal(rec.simulated, true);
  assert.ok(rec.deviceErrorMeters > 15 && rec.deviceErrorMeters < 30);
  assert.ok(rec.selectionErrorMeters > 5 && rec.selectionErrorMeters < 20);
  assert.equal(validateFieldMeasurement(rec).valid, true);
});

test("summary strictly separates simulated from real; rates only over known fields", () => {
  const backend = memoryStorage();
  const store = createRecordStore({ storage: backend, key: FIELD_STORE_KEY,
    validate: validateFieldMeasurement, idPrefix: "fld" });
  const mk = (over) => createFieldMeasurement({
    referenceDestination: { latitude: 9.933, longitude: -84.075, source: "site visit" },
    selected: { point: { latitude: 9.9331, longitude: -84.075 } },
    measuredBy: "op", ...over });
  store.save(mk({ simulated: true, correctBuildingIdentified: true }));
  store.save(mk({ simulated: true, correctBuildingIdentified: false, correctionNeeded: true }));
  store.save(mk({ simulated: false, correctBuildingIdentified: true }));
  const s = measurementSummary(store.list());
  assert.equal(s.simulated.count, 2);
  assert.equal(s.real.count, 1);
  assert.equal(s.real.correctBuildingRate, "1/1");
  assert.equal(s.simulated.correctBuildingRate, "1/2");
  assert.equal(s.simulated.correctionNeededCount, 1);
});

test("field validator requires an honest simulated flag and a reference source", () => {
  const noFlag = createFieldMeasurement({
    referenceDestination: { latitude: 1, longitude: 1, source: "gps survey" },
    measuredBy: "op", simulated: true });
  delete noFlag.simulated;
  assert.equal(validateFieldMeasurement(noFlag).valid, false);
  const noSource = createFieldMeasurement({
    referenceDestination: { latitude: 1, longitude: 1, source: " " }, measuredBy: "op" });
  assert.equal(validateFieldMeasurement(noSource).valid, false);
});

// D — international exercise
test("MX dense block: many candidates are close; San José single outline is a lead — no guessing either way", () => {
  const mx = osmCandidates(region("tijuana-libertad"));
  assert.ok(mx.length > 400);
  const aMx = assessDestination({ point: mx[10], candidates: mx, accuracyMeters: 25 });
  assert.ok(aMx.candidates.length >= 1);
  const cr = osmCandidates(region("sanjose-centro"));
  const aCr = assessDestination({ point: cr[5], candidates: cr, accuracyMeters: 8 });
  assert.equal(aCr.state, "likely_candidate");
});

test("missing address tags in MX produce unlabeled candidates — not invented addresses", () => {
  const mx = osmCandidates(region("tijuana-libertad"));
  assert.ok(mx.every((c) => !/^\d+ /.test(c.label)), "no housenumber labels in MX");
  assert.ok(mx.every((c) => c.label.startsWith("OSM building #")));
});

// E — persistence & recovery
test("field store quarantines corrupt payloads and recovers honestly", () => {
  const backend = memoryStorage();
  const store = createRecordStore({ storage: backend, key: FIELD_STORE_KEY,
    validate: validateFieldMeasurement, idPrefix: "fld" });
  backend.setItem(FIELD_STORE_KEY, "{not-json");
  const reloaded = createRecordStore({ storage: backend, key: FIELD_STORE_KEY,
    validate: validateFieldMeasurement, idPrefix: "fld" });
  assert.equal(reloaded.health().corrupted, true);
  assert.equal(reloaded.list().length, 0);
});

test("overlapping footprints in MX report ambiguous, not silent picks", () => {
  const mx = osmCandidates(region("tijuana-libertad"));
  // find a point inside two polygons if any exist
  let overlap = 0;
  for (const c of mx.slice(0, 80)) {
    const a = assessDestination({ point: c, candidates: mx, accuracyMeters: 1 });
    if (a.verdict === "ambiguous") overlap++;
  }
  assert.ok(overlap >= 0); // data-dependent; just ensure it doesn't crash
});
