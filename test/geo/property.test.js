import test from "node:test";
import assert from "node:assert/strict";
import {
  distanceMeters, nearbyCandidates, assessAmbiguity,
  createDestinationConfirmation, validateDestinationConfirmation,
  destinationConfirmedFor, CONFIRM_STORE_KEY, NOT_OWNERSHIP_NOTICE,
} from "../../src/geo/property.js";
import { toWgs84 } from "../../src/geo/crs.js";
import { createRecordStore, memoryStorage } from "../../src/stage-b/record-store.js";
import { PROPERTY_FIXTURES } from "../../src/stage-b/property-fixtures.js";

const by = (prefix) => PROPERTY_FIXTURES.candidates.filter((c) => c.id.startsWith(prefix));

test("distanceMeters: neighboring fixture houses ~19m apart, lat/lng order irrelevant to result", () => {
  const [a, b] = by("fx-us-house");
  const d = distanceMeters(a, b);
  assert.ok(d > 15 && d < 25, `expected ~19m, got ${d.toFixed(1)}`);
});

test("two neighboring houses: midpoint pin is ambiguous, both candidates listed", () => {
  const houses = by("fx-us-house");
  const mid = { latitude: 33.7490, longitude: -84.3884 };
  const amb = assessAmbiguity({ point: mid, candidates: houses, accuracyMeters: 20 });
  assert.equal(amb.verdict, "ambiguous");
  assert.equal(amb.within.length, 2);
  assert.ok(amb.summary.includes("cannot be distinguished"));
});

test("opposite sides of a street: ambiguity detected, not collapsed to one address", () => {
  const mid = { latitude: 33.74915, longitude: -84.3905 };
  const amb = assessAmbiguity({ point: mid, candidates: by("fx-us-street"), accuracyMeters: 30 });
  assert.equal(amb.verdict, "ambiguous");
  assert.equal(amb.within.length, 2);
});

test("apartment building: three units within meters are reported ambiguous", () => {
  const amb = assessAmbiguity({
    point: { latitude: 33.7500, longitude: -84.39198 },
    candidates: by("fx-us-apt"), accuracyMeters: 10,
  });
  assert.equal(amb.verdict, "ambiguous");
  assert.equal(amb.within.length, 3);
});

test("corner property: two frontage candidates are ambiguous", () => {
  const amb = assessAmbiguity({
    point: { latitude: 33.7505, longitude: -84.38685 },
    candidates: by("fx-us-corner"), accuracyMeters: 25,
  });
  assert.equal(amb.verdict, "ambiguous");
});

test("rural single candidate far outside a tight radius is none_in_range, then single_unverified when range covers it", () => {
  const rural = by("fx-cr-rural");
  const point = { latitude: 9.2002, longitude: -83.7502 };
  const tight = assessAmbiguity({ point, candidates: rural, accuracyMeters: 10 });
  assert.equal(tight.verdict, "none_in_range");
  const wide = assessAmbiguity({ point, candidates: rural, accuracyMeters: 60 });
  assert.equal(wide.verdict, "single_unverified");
  assert.equal(wide.within[0].id, "fx-cr-rural");
});

test("Mexico fixtures: neighboring casas ambiguous like the US pair", () => {
  const amb = assessAmbiguity({
    point: { latitude: 32.5149, longitude: -117.0381 },
    candidates: by("fx-mx-house"), accuracyMeters: 20,
  });
  assert.equal(amb.verdict, "ambiguous");
  assert.equal(amb.within.length, 2);
});

test("Costa Rica fixtures: neighboring casas ambiguous", () => {
  const amb = assessAmbiguity({
    point: { latitude: 9.9350, longitude: -84.0999 },
    candidates: by("fx-cr-house"), accuracyMeters: 20,
  });
  assert.equal(amb.verdict, "ambiguous");
});

test("no candidate data at all → no_source_data, not a silent pass", () => {
  const amb = assessAmbiguity({ point: { latitude: 0, longitude: 0 }, candidates: [] });
  assert.equal(amb.verdict, "no_source_data");
});

test("GPS drift: corrected destination records moved meters and preserves the device fix", () => {
  const device = { latitude: 33.7495, longitude: -84.3884, accuracyMeters: 80, capturedAt: "2026-10-20T00:00:00Z", source: "device_position" };
  const intended = { latitude: 33.7490, longitude: -84.3884 };
  const rec = createDestinationConfirmation({
    assertionId: "asrt_x", deviceEstimate: device, confirmedPoint: intended,
    candidates: by("fx-us-house"), confirmedBy: "operator",
  });
  assert.ok(rec.correctionApplied.moved);
  assert.ok(rec.correctionApplied.movedMeters > 40 && rec.correctionApplied.movedMeters < 70,
    `drift ~55m, got ${rec.correctionApplied.movedMeters}`);
  assert.equal(rec.correctionApplied.originalPreserved, true);
  assert.equal(rec.deviceEstimate.latitude, device.latitude);
  assert.equal(rec.deviceEstimate.accuracyMeters, 80);
});

test("confidence is capped — confirmation never reports verified, and carries the disclaimer", () => {
  const rec = createDestinationConfirmation({
    assertionId: "asrt_x",
    deviceEstimate: { latitude: 33.7490, longitude: -84.3884, accuracyMeters: 15 },
    confirmedPoint: { latitude: 33.7490, longitude: -84.3884 },
    candidates: by("fx-us-house"), confirmedBy: "operator",
  });
  assert.notEqual(rec.confidence.level, "verified");
  assert.equal(rec.confidence.level, "low"); // two houses in range → ambiguous
  assert.equal(rec.disclaimer, NOT_OWNERSHIP_NOTICE);
});

test("a lone corroborated manual pin reaches moderate, never higher", () => {
  const rec = createDestinationConfirmation({
    assertionId: "asrt_x",
    confirmedPoint: { latitude: 9.2, longitude: -83.75 },
    candidates: by("fx-cr-rural"),
    confirmedBy: "operator", source: "manual_adjustment",
  });
  assert.equal(rec.ambiguity.verdict, "single_unverified");
  assert.equal(rec.confidence.level, "moderate");
});

test("validation rejects out-of-range confirmed points (axis-order swapped) and missing confirmer", () => {
  // Tijuana point (lat 32.5, lng -117.0) with axes swapped → latitude -117 is invalid.
  const swapped = createDestinationConfirmation({
    assertionId: "asrt_x", confirmedPoint: { latitude: -117.038, longitude: 32.515 },
    candidates: [], confirmedBy: "op",
  });
  const v = validateDestinationConfirmation(swapped);
  assert.equal(v.valid, false);
  assert.ok(v.errors.some((e) => e.field.startsWith("confirmedPoint.latitude")));
  const anon = validateDestinationConfirmation(
    createDestinationConfirmation({ assertionId: "x", confirmedPoint: { latitude: 1, longitude: 1 }, candidates: [], confirmedBy: " " }));
  assert.equal(anon.valid, false);
});

test("confirmation persists through a validating record store; latest wins", () => {
  const backend = memoryStorage();
  const store = createRecordStore({
    storage: backend, key: CONFIRM_STORE_KEY,
    validate: validateDestinationConfirmation, idPrefix: "conf",
  });
  const r1 = createDestinationConfirmation({
    assertionId: "asrt_1", confirmedPoint: { latitude: 33.749, longitude: -84.3884 },
    candidates: by("fx-us-house"), confirmedBy: "op", confirmedAt: "2026-10-20T01:00:00Z",
  });
  const r2 = createDestinationConfirmation({
    assertionId: "asrt_1", confirmedPoint: { latitude: 33.749, longitude: -84.3883 },
    candidates: by("fx-us-house"), confirmedBy: "op", confirmedAt: "2026-10-20T02:00:00Z",
  });
  assert.ok(store.save(r1).ok);
  assert.ok(store.save(r2).ok);
  const latest = destinationConfirmedFor(store, "asrt_1");
  assert.equal(latest.record.confirmedPoint.longitude, -84.3883);
  const reloaded = createRecordStore({
    storage: backend, key: CONFIRM_STORE_KEY,
    validate: validateDestinationConfirmation, idPrefix: "conf",
  });
  assert.equal(reloaded.list().length, 2);
});

test("axis order stays honest end-to-end: CRS:84 input converts to the same WGS84 point", () => {
  // CRS:84 axis order is (lng, lat) — a fixture lng=-84.3885 lat=33.749
  const p = toWgs84({ crs: "CRS:84", first: -84.3885, second: 33.749 });
  assert.equal(p.latitude, 33.749);
  assert.equal(p.longitude, -84.3885);
  const amb = assessAmbiguity({ point: p, candidates: by("fx-us-house"), accuracyMeters: 20 });
  assert.equal(amb.verdict, "ambiguous");
});
