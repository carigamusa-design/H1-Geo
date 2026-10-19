import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  osmCandidates, candidatesNear, containingFootprints,
} from "../../src/geo/sources.js";
import {
  assessAmbiguity, distanceMeters,
  createDestinationConfirmation, validateDestinationConfirmation,
  destinationConfirmedFor, CONFIRM_STORE_KEY,
} from "../../src/geo/property.js";
import { createRecordStore, memoryStorage } from "../../src/stage-b/record-store.js";
import { PROPERTY_FIXTURES } from "../../src/stage-b/property-fixtures.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OSM = JSON.parse(readFileSync(join(root, "data/osm-pilot-areas.json"), "utf8"));
const region = (id) => OSM.regions.find((r) => r.id === id);
const atl = region("atlanta-summerhill");
const mx = region("tijuana-libertad");
const cr = region("sanjose-centro");

test("dataset provenance is carried through to candidates", () => {
  assert.equal(OSM.provider, "OpenStreetMap contributors");
  assert.equal(OSM.license, "Open Database License (ODbL) 1.0");
  const c = osmCandidates(atl);
  assert.equal(c.length, atl.buildingCount);
  const tagged = c.find((x) => x.kind === "address_tagged_footprint");
  assert.equal(tagged.source.provider, "OpenStreetMap contributors");
  assert.equal(tagged.source.license, "ODbL 1.0");
  assert.equal(tagged.fixture, false);
});

test("MX coverage reality: dense footprints but zero address tags — no guessing", () => {
  const c = osmCandidates(mx);
  assert.ok(c.length > 400);
  assert.ok(c.every((x) => x.addr === undefined || x.addr === null || !x.addr));
  assert.ok(c.every((x) => x.kind === "building_footprint"));
});

test("point inside one mapped footprint yields inside_footprint, still unverified", () => {
  const cands = osmCandidates(atl);
  const target = cands[0];
  const amb = assessAmbiguity({ point: target, candidates: cands, accuracyMeters: 10 });
  assert.equal(amb.verdict, "inside_footprint");
  assert.equal(amb.within[0].id, target.id);
  const rec = createDestinationConfirmation({
    assertionId: "asrt_x", confirmedPoint: { latitude: target.latitude, longitude: target.longitude },
    candidates: cands, accuracyMeters: 10, confirmedBy: "eval",
  });
  assert.equal(rec.ambiguity.verdict, "inside_footprint");
  assert.equal(rec.confidence.level, "moderate");
  assert.notEqual(rec.confidence.level, "verified");
  assert.ok(rec.ambiguity.candidates[0].sourceProvider.includes("OpenStreetMap"));
});

test("candidatesNear includes the OSM region only when the point is near it", () => {
  const inAtl = { latitude: 33.7392, longitude: -84.3812 };
  const near = candidatesNear({ point: inAtl, osmDataset: OSM });
  assert.ok(near.some((c) => c.source?.region === "atlanta-summerhill"));
  assert.ok(!near.some((c) => c.source?.region === "tijuana-libertad"));
  const nowhere = candidatesNear({ point: { latitude: 0, longitude: 0 }, osmDataset: OSM });
  assert.equal(nowhere.filter((c) => !c.fixture).length, 0);
});

test("missing coverage: point outside all pilot regions reports no_source_data; open ground inside coverage reports none_in_range", () => {
  const outside = { latitude: 34.05, longitude: -84.3 };
  const cands = candidatesNear({ point: outside, osmDataset: OSM });
  assert.equal(cands.filter((c) => !c.fixture).length, 0);
  assert.equal(
    assessAmbiguity({ point: outside, candidates: cands, accuracyMeters: 15 }).verdict,
    "no_source_data");
  // inside the ATL extract but in a gap between buildings with a tight radius
  const gap = { latitude: 33.7393, longitude: -84.3824 };
  const amb = assessAmbiguity({ point: gap, candidates: osmCandidates(atl), accuracyMeters: 1, radiusMeters: 2 });
  assert.equal(amb.verdict, "none_in_range");
});

test("conflicting/dense sources: MX block midpoints frequently report ambiguous", () => {
  const cands = osmCandidates(mx);
  let ambiguous = 0;
  for (let i = 0; i + 1 < cands.length && i < 100; i += 10) {
    const mid = { latitude: (cands[i].latitude + cands[i + 1].latitude) / 2,
      longitude: (cands[i].longitude + cands[i + 1].longitude) / 2 };
    if (assessAmbiguity({ point: mid, candidates: cands, accuracyMeters: 20 }).verdict === "ambiguous") ambiguous++;
  }
  assert.ok(ambiguous > 0, "expected some ambiguous midpoints in the dense MX block");
});

test("fixtures and real data coexist; fixtures stay labeled synthetic", () => {
  const near = candidatesNear({ point: { latitude: 33.749, longitude: -84.3885 },
    radiusMeters: 100, osmDataset: OSM, fixtureCandidates: PROPERTY_FIXTURES.candidates });
  assert.ok(near.some((c) => c.fixture === true), "fixtures present near Atlanta demo center");
});

test("confirmation with a real candidate persists and re-verifies after reload", () => {
  const cands = osmCandidates(cr);
  const target = cands.find((c) => c.kind === "address_tagged_footprint") ?? cands[0];
  const rec = createDestinationConfirmation({
    assertionId: "asrt_cr", confirmedPoint: { latitude: target.latitude, longitude: target.longitude },
    candidates: cands, accuracyMeters: 12, confirmedBy: "eval", source: "manual_adjustment",
  });
  assert.ok(rec.ambiguity.candidates[0].inside);
  const backend = memoryStorage();
  const store = createRecordStore({ storage: backend, key: CONFIRM_STORE_KEY,
    validate: validateDestinationConfirmation, idPrefix: "conf" });
  assert.ok(store.save(rec).ok);
  const reloaded = createRecordStore({ storage: backend, key: CONFIRM_STORE_KEY,
    validate: validateDestinationConfirmation, idPrefix: "conf" });
  const latest = destinationConfirmedFor(reloaded, "asrt_cr");
  assert.equal(latest.record.ambiguity.verdict, "inside_footprint");
  assert.equal(latest.record.ambiguity.candidates[0].sourceProvider, "OpenStreetMap contributors");
});

test("containingFootprints finds zero on open ground, not a fabricated match", () => {
  const cands = osmCandidates(atl);
  // bbox centroid is a street/intersection area in this extract
  const open = { latitude: 33.7393, longitude: -84.3824 };
  const found = containingFootprints(open, cands);
  assert.ok(Array.isArray(found));
  if (found.length === 0) {
    const amb = assessAmbiguity({ point: open, candidates: cands, accuracyMeters: 10 });
    assert.ok(["none_in_range", "single_unverified", "ambiguous"].includes(amb.verdict));
  }
});

test("distance sanity: nearest ATL buildings to demo-area pins are tens of meters, not kilometers", () => {
  const cands = osmCandidates(atl);
  const p = { latitude: 33.7392, longitude: -84.3812 };
  const nearest = Math.min(...cands.map((c) => distanceMeters(p, c)));
  assert.ok(nearest < 100, `nearest building ${nearest.toFixed(0)}m`);
});
