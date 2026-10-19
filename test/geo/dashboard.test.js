import test from "node:test";
import assert from "node:assert/strict";
import {
  fieldDashboard, exportFieldMeasurements, validateFieldExport,
  percentile, DEFAULT_MIN_SAMPLE,
} from "../../src/geo/dashboard.js";
import { createFieldMeasurement, validateFieldMeasurement,
  FIELD_STORE_KEY } from "../../src/geo/field.js";
import { createRecordStore, memoryStorage } from "../../src/stage-b/record-store.js";

const mk = (over = {}) => createFieldMeasurement({
  devicePosition: { latitude: 33.739, longitude: -84.381, accuracyMeters: 20 },
  referenceDestination: { latitude: 33.7392, longitude: -84.381, source: "site visit" },
  selected: { point: { latitude: 33.7391, longitude: -84.381 } },
  measuredBy: "op", ...over });
const entriesOf = (recs) => recs.map((r, i) => ({ id: `fld_${i}`, record: r }));

test("percentile: nearest-rank median and p95 on sorted data", () => {
  assert.equal(percentile([1, 2, 3, 4, 5], 50), 3);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
  assert.equal(percentile([], 50), null);
});

test("empty store → insufficient evidence caveat, no invented stats", () => {
  const d = fieldDashboard([]);
  assert.equal(d.insufficientEvidence, true);
  assert.match(d.caveat, /not a completed field trial/i);
  assert.equal(d.real.count, 0);
  assert.equal(d.real.selectionError.median, null);
});

test("stats computed only over real measurements; simulated excluded", () => {
  const recs = [
    mk({ simulated: false, correctBuildingIdentified: true, durationMs: 10_000, interactionCount: 2 }),
    mk({ simulated: false, correctBuildingIdentified: false, correctionNeeded: true,
      ambiguityVerdict: "ambiguous", durationMs: 20_000, interactionCount: 5 }),
    mk({ simulated: true }), // must not pollute real stats
  ];
  const d = fieldDashboard(entriesOf(recs));
  assert.equal(d.real.count, 2);
  assert.equal(d.simulated.count, 1);
  assert.equal(d.real.correctBuilding.correct, 1);
  assert.equal(d.real.correctBuilding.independentlyVerified, 2);
  assert.equal(d.real.correctionRate.corrected, 1);
  assert.equal(d.real.neighborConfusion.ambiguous, 1);
  assert.equal(d.real.medianDurationMs, 15_000);
  assert.equal(d.real.medianInteractions, 3.5);
  assert.ok(d.real.selectionError.median > 0);
});

test("permission denied / missing device fix: measurement still valid, device stats n=0", () => {
  const d = fieldDashboard(entriesOf([
    mk({ devicePosition: null, simulated: false }),
  ]));
  assert.equal(d.real.deviceError.n, 0);
  assert.equal(d.real.deviceError.median, null);
});

test("missing coverage and unresolved counts are tracked", () => {
  const d = fieldDashboard(entriesOf([
    mk({ simulated: false, ambiguityVerdict: "no_source_data" }),
    mk({ simulated: false, ambiguityVerdict: "none_in_range" }),
    mk({ simulated: false, selected: null }),
  ]));
  assert.equal(d.real.missingCoverage, 2);
  assert.equal(d.real.unresolved, 1);
});

test("by-region and by-session grouping", () => {
  const d = fieldDashboard(entriesOf([
    mk({ simulated: false, regionId: "atlanta-summerhill", session: "T1" }),
    mk({ simulated: false, regionId: "tijuana-libertad", session: "T1" }),
    mk({ simulated: false, regionId: "tijuana-libertad", session: "T2" }),
  ]));
  assert.equal(d.real.byRegion["tijuana-libertad"], 2);
  assert.equal(d.real.bySession.T1, 2);
  assert.equal(d.real.bySession.T2, 1);
});

test("sample under minSample is flagged insufficient but numbers still shown", () => {
  const d = fieldDashboard(entriesOf([mk({ simulated: false })]), { minSample: 5 });
  assert.equal(d.real.sufficient, false);
  assert.equal(d.insufficientEvidence, true);
  assert.ok(d.real.selectionError.median !== null); // number exists, flagged not hidden
});

test("minSample met → caveat cleared", () => {
  const recs = Array.from({ length: DEFAULT_MIN_SAMPLE }, () => mk({ simulated: false }));
  const d = fieldDashboard(entriesOf(recs));
  assert.equal(d.insufficientEvidence, false);
  assert.equal(d.caveat, null);
});

test("export document validates, round-trips, and carries the privacy note", () => {
  const entries = entriesOf([mk({ simulated: false }), mk({ simulated: true })]);
  const doc = exportFieldMeasurements(entries);
  assert.equal(validateFieldExport(doc).valid, true);
  const round = JSON.parse(JSON.stringify(doc));
  assert.equal(round.measurements.length, 2);
  assert.equal(round.dashboard.real.count, 1);
  assert.match(round.note, /precise geographic/i);
  assert.equal(validateFieldExport({ schemaVersion: "x" }).valid, false);
});

test("field records validate with new optional context fields and persist through reload", () => {
  const backend = memoryStorage();
  const store = createRecordStore({ storage: backend, key: FIELD_STORE_KEY,
    validate: validateFieldMeasurement, idPrefix: "fld" });
  const rec = mk({ session: "T1", ambiguityVerdict: "ambiguous", candidateCount: 4, simulated: false });
  assert.equal(validateFieldMeasurement(rec).valid, true);
  assert.ok(store.save(rec).ok);
  const reloaded = createRecordStore({ storage: backend, key: FIELD_STORE_KEY,
    validate: validateFieldMeasurement, idPrefix: "fld" });
  const e = reloaded.list()[0];
  assert.equal(e.record.session, "T1");
  assert.equal(e.record.candidateCount, 4);
});

test("poor GPS accuracy does not corrupt stats — wide-accuracy readings stay separate", () => {
  const d = fieldDashboard(entriesOf([
    mk({ devicePosition: { latitude: 33.739, longitude: -84.381, accuracyMeters: 500 },
      simulated: false }),
  ]));
  assert.equal(d.real.deviceError.n, 1);
  assert.ok(d.real.deviceError.median > 0);
});
