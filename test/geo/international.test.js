import assert from "node:assert/strict";
import test from "node:test";
import { toWgs84, fromWgs84, SUPPORTED_CRS, CRS_AXIS_ORDER } from "../../src/geo/crs.js";
import {
  lookupTerritory, validateTerritoryDataset, locationStatus,
  checkCountryMatch, LOCATION_STATUSES, LOCATION_KINDS,
} from "../../src/geo/territory.js";
import { createSiteDescriptor, validateSiteDescriptor, explainDiscrepancy } from "../../src/geo/site.js";
import { TERRITORY_DATASET } from "../../src/stage-b/territory-data.js";

// Fixture points (lat, lng) — well inside territory interiors.
const F = {
  atlantaUS: [33.749, -84.388],
  sanJuanPR: [18.466, -66.106],
  mexicoCityMX: [19.432, -99.133],
  tijuanaMX: [32.514, -117.038],
  sanJoseCR: [9.928, -84.091],
  torontoCA: [43.653, -79.383],
  panamaCityPA: [8.983, -79.517],
  midPacific: [0.0, -140.0],
};

const assertion = (lat, lng, source = "manual_target_pin") => ({
  schemaVersion: "h1-geo/coordinate-assertion-v0", latitude: lat, longitude: lng,
  crs: "EPSG:4326", source, capturedAt: "2026-10-17T12:00:00Z",
  accuracyMeters: null, provenanceRef: "h1geo://test/intl",
});

test("dataset is structurally valid and carries provenance", () => {
  const v = validateTerritoryDataset(TERRITORY_DATASET);
  assert.equal(v.valid, true, JSON.stringify(v.errors));
  assert.match(TERRITORY_DATASET.source, /Natural Earth/);
  assert.match(TERRITORY_DATASET.resolution, /110m/);
  assert.equal(TERRITORY_DATASET.features.length, 16);
});

test("territory lookup resolves US, PR, MX, CR fixtures", () => {
  const cases = [
    [...F.atlantaUS, "US"], [...F.sanJuanPR, "PR"], [...F.mexicoCityMX, "MX"],
    [...F.tijuanaMX, "MX"], [...F.sanJoseCR, "CR"], [...F.torontoCA, "CA"],
    [...F.panamaCityPA, "PA"],
  ];
  for (const [lat, lng, iso] of cases) {
    const r = lookupTerritory(lat, lng, TERRITORY_DATASET);
    assert.equal(r.ok, true);
    assert.equal(r.found, true, `${lat},${lng} should resolve`);
    assert.equal(r.iso, iso, `${lat},${lng} expected ${iso}, got ${r.iso}`);
  }
});

test("Puerto Rico is distinct from the United States", () => {
  const pr = lookupTerritory(...F.sanJuanPR, TERRITORY_DATASET);
  assert.equal(pr.iso, "PR");
  assert.equal(pr.admin, "territory");
});

test("unresolved points report honestly — never a guess", () => {
  const r = lookupTerritory(...F.midPacific, TERRITORY_DATASET);
  assert.equal(r.ok, true);
  assert.equal(r.found, false);
  const status = locationStatus({
    assertion: assertion(...F.midPacific), territoryResult: r });
  assert.equal(status.status, "unresolved");
});

test("country match / mismatch / unverified / undeclared", () => {
  const atAtlanta = (iso) => checkCountryMatch({
    latitude: F.atlantaUS[0], longitude: F.atlantaUS[1],
    declaredIso: iso, dataset: TERRITORY_DATASET });
  assert.equal(atAtlanta("US").status, "match");
  const mismatch = atAtlanta("MX");
  assert.equal(mismatch.status, "mismatch");
  assert.match(mismatch.detail, /United States/);
  // Cross-border: a Mexican point declared as US.
  const cross = checkCountryMatch({
    latitude: F.tijuanaMX[0], longitude: F.tijuanaMX[1],
    declaredIso: "US", dataset: TERRITORY_DATASET });
  assert.equal(cross.status, "mismatch");
  assert.equal(cross.territory.iso, "MX");
  // Ocean point → unverified.
  assert.equal(checkCountryMatch({
    latitude: F.midPacific[0], longitude: F.midPacific[1],
    declaredIso: "US", dataset: TERRITORY_DATASET }).status, "unverified");
  // No declaration → undeclared.
  assert.equal(atAtlanta(null).status, "undeclared");
});

test("CRS axis orders are explicit — never silently reordered", () => {
  assert.equal(CRS_AXIS_ORDER["EPSG:4326"].first, "latitude");
  assert.equal(CRS_AXIS_ORDER["CRS:84"].first, "longitude");
  const [lat, lng] = F.mexicoCityMX;
  // EPSG:4326 = (lat, lng); CRS:84 = (lng, lat); same point, different order.
  const a = toWgs84({ crs: "EPSG:4326", first: lat, second: lng });
  const b = toWgs84({ crs: "CRS:84", first: lng, second: lat });
  assert.equal(a.ok && b.ok, true);
  assert.equal(a.latitude, b.latitude);
  // Wrong order is caught, not reordered silently: CRS:84 takes lng first,
  // so (lat, lng) under CRS:84 means lng=19.4 lat=-99 — lat out of range.
  const bad = toWgs84({ crs: "CRS:84", first: lat, second: lng });
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0].message, /outside WGS 84 bounds|axis order/);
  // Web Mercator round trip.
  const wm = fromWgs84({ latitude: lat, longitude: lng, crs: "EPSG:3857" });
  assert.equal(wm.ok, true);
  const back = toWgs84({ crs: "EPSG:3857", first: wm.first, second: wm.second });
  assert.ok(Math.abs(back.latitude - lat) < 1e-6);
  assert.ok(Math.abs(back.longitude - lng) < 1e-6);
  // Unsupported CRS rejected.
  assert.equal(toWgs84({ crs: "EPSG:26910", first: 0, second: 0 }).ok, false);
});

test("location statuses are distinct and verification must be explicit", () => {
  assert.deepEqual([...LOCATION_STATUSES].sort(),
    ["geocoded", "independently_verified", "manually_selected", "unresolved"]);
  const terr = lookupTerritory(...F.atlantaUS, TERRITORY_DATASET);
  assert.equal(locationStatus({
    assertion: assertion(...F.atlantaUS), territoryResult: terr }).status, "manually_selected");
  assert.equal(locationStatus({
    assertion: assertion(...F.atlantaUS, "external_reference"),
    territoryResult: terr }).status, "geocoded");
  assert.equal(locationStatus({
    assertion: assertion(...F.atlantaUS), territoryResult: terr,
    verifiedBy: "second-source-uuid" }).status, "independently_verified");
  // Verified can never be inferred from data alone.
  assert.equal(locationStatus({
    assertion: assertion(...F.atlantaUS), territoryResult: terr,
    verifiedBy: "  " }).status, "manually_selected");
});

test("site descriptors keep point/address/building/parcel separate", () => {
  assert.deepEqual(LOCATION_KINDS, ["point", "postal_address", "building", "legal_parcel"]);
  // A point is just a point.
  const pt = createSiteDescriptor({ kind: "point", assertionId: "asrt_1" });
  assert.equal(validateSiteDescriptor(pt).valid, true);
  // Postal address requires its own fields — the point doesn't supply them.
  const addr = createSiteDescriptor({
    kind: "postal_address", assertionId: "asrt_1",
    fields: { addressLine: "123 Main St", locality: "Atlanta", countryCode: "US" },
    declaredCountryCode: "US" });
  assert.equal(validateSiteDescriptor(addr).valid, true);
  const badAddr = createSiteDescriptor({ kind: "postal_address", fields: {} });
  const check = validateSiteDescriptor(badAddr);
  assert.equal(check.valid, false);
  assert.ok(check.errors.some((e) => e.field === "fields.addressLine"));
  // Parcel/building references require refs.
  assert.equal(validateSiteDescriptor(
    createSiteDescriptor({ kind: "legal_parcel", fields: {} })).valid, false);
  assert.equal(validateSiteDescriptor(
    createSiteDescriptor({ kind: "legal_parcel", fields: { parcelRef: "APN-1234" } })).valid, true);
  // Bad country code.
  assert.equal(validateSiteDescriptor(createSiteDescriptor({
    kind: "point", declaredCountryCode: "USA" })).valid, false);
});

test("discrepancy explanations never rewrite evidence silently", () => {
  const m = checkCountryMatch({
    latitude: F.sanJoseCR[0], longitude: F.sanJoseCR[1],
    declaredIso: "US", dataset: TERRITORY_DATASET });
  const text = explainDiscrepancy(m);
  assert.match(text, /Costa Rica/);
  assert.match(text, /Correct the declared country or move the pin/);
  assert.match(text, /untouched/);
});
