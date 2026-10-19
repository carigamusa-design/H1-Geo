import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyReading, readingSpreadMeters, summarizeReadings,
  collectReadings, ACCURACY_BANDS,
} from "../../src/geo/acquisition.js";
import { improvementFindings } from "../../src/geo/improvement.js";
import { createFieldMeasurement } from "../../src/geo/field.js";

const fix = (lat, lng, acc) => ({ latitude: lat, longitude: lng, accuracyMeters: acc });

// B — acquisition
test("classifyReading: good/fair/poor/unknown bands", () => {
  assert.equal(classifyReading({ accuracyMeters: 5 }), "good");
  assert.equal(classifyReading({ accuracyMeters: 20 }), "fair");
  assert.equal(classifyReading({ accuracyMeters: 80 }), "poor");
  assert.equal(classifyReading({ accuracyMeters: null }), "unknown");
});

test("spread + stability: clustered readings stable, scattered unstable", () => {
  const tight = [fix(33.739, -84.381, 8), fix(33.73902, -84.38102, 9), fix(33.73901, -84.38098, 7)];
  const s = summarizeReadings(tight);
  assert.equal(s.count, 3);
  assert.ok(s.spreadMeters < 10);
  assert.equal(s.stability, "stable");
  const scattered = [fix(33.739, -84.381, 8), fix(33.740, -84.380, 8)];
  assert.equal(summarizeReadings(scattered).stability, "unstable");
});

test("best is a real reading — never an averaged synthesis", () => {
  const readings = [fix(33.739, -84.381, 30), fix(33.7395, -84.3805, 5)];
  const s = summarizeReadings(readings);
  assert.equal(s.best.accuracyMeters, 5);
  assert.equal(s.best.latitude, 33.7395); // the actual second reading's position
  assert.notDeepEqual(
    { latitude: s.best.latitude, longitude: s.best.longitude },
    { latitude: 33.73925, longitude: -84.38075 });
});

test("collectReadings: successes and failures both recorded; no silent retry", async () => {
  let i = 0;
  const getPosition = async () => {
    i++;
    if (i === 2 || i === 4) { const e = new Error("denied"); e.code = 1; throw e; }
    return fix(33.739, -84.381, 10 + i);
  };
  const r = await collectReadings({ getPosition, attempts: 5 });
  assert.equal(r.readings.length, 3);
  assert.equal(r.errors.length, 2);
  assert.equal(r.errors[0].attempt, 2);
  assert.equal(r.errors[0].code, 1);
  assert.equal(r.summary.count, 3);
});

test("collectReadings: all attempts denied → empty readings, errors kept", async () => {
  const getPosition = async () => { const e = new Error("permission denied"); e.code = 1; throw e; };
  const r = await collectReadings({ getPosition, attempts: 3 });
  assert.equal(r.readings.length, 0);
  assert.equal(r.errors.length, 3);
  assert.equal(r.summary.stability, "insufficient_readings");
});

// C — improvement loop
const mk = (over = {}) => createFieldMeasurement({
  referenceDestination: { latitude: 33.739, longitude: -84.381, source: "site visit" },
  measuredBy: "op", simulated: false, ...over });
const entriesOf = (recs) => recs.map((r, i) => ({ id: `f${i}`, record: r }));

test("insufficient real data → honest note, no findings", () => {
  const f = improvementFindings(entriesOf([mk(), mk({ simulated: true })]));
  assert.equal(f.insufficientData, true);
  assert.equal(f.findings.length, 0);
  assert.match(f.note, /needed/);
  assert.equal(f.simulatedCount, 1);
});

test("recurring neighbor confusion produces a scoped finding only when real", () => {
  const recs = Array.from({ length: 5 }, () =>
    mk({ ambiguityVerdict: "ambiguous", regionId: "tijuana-libertad" }));
  const f = improvementFindings(entriesOf(recs));
  const nf = f.findings.find((x) => x.kind === "neighbor_confusion");
  assert.ok(nf);
  assert.equal(nf.evidence.ambiguous, 5);
  // the same rate on simulated data must produce nothing
  const sims = Array.from({ length: 8 }, () =>
    mk({ ambiguityVerdict: "ambiguous", simulated: true }));
  assert.equal(improvementFindings(entriesOf(sims)).findings.length, 0);
});

test("coverage gaps and high correction effort surface as findings", () => {
  const recs = [
    ...Array.from({ length: 3 }, () => mk({ ambiguityVerdict: "no_source_data" })),
    ...Array.from({ length: 3 }, () => mk({ correctionNeeded: true, interactionCount: 9 })),
  ];
  const f = improvementFindings(entriesOf(recs));
  const kinds = f.findings.map((x) => x.kind);
  assert.ok(kinds.includes("coverage_gap"));
  assert.ok(kinds.includes("correction_effort"));
  assert.ok(kinds.includes("interaction_effort"));
});

test("clean real measurements → no findings, honest note", () => {
  const recs = Array.from({ length: 6 }, () =>
    mk({ ambiguityVerdict: "inside_footprint", correctionNeeded: false,
      interactionCount: 2, deviceErrorMeters: 8 }));
  const f = improvementFindings(entriesOf(recs));
  assert.equal(f.findings.length, 0);
  assert.match(f.note, /no recurring/i);
});

test("simulated measurements never enter findings evidence", () => {
  const recs = [
    ...Array.from({ length: 5 }, () => mk({ ambiguityVerdict: "ambiguous" })),
    mk({ ambiguityVerdict: "ambiguous", simulated: true }),
  ];
  const f = improvementFindings(entriesOf(recs));
  assert.equal(f.realCount, 5);
  const nf = f.findings.find((x) => x.kind === "neighbor_confusion");
  assert.equal(nf.evidence.n, 5); // the simulated sixth is not counted
});
