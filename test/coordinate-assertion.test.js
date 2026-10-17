import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CRS,
  REQUIRED_FIELDS,
  SCHEMA_VERSION,
  SOURCES,
  validateCoordinateAssertion,
} from "../src/coordinate-assertion.js";

const VALID_ASSERTION = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  latitude: 33.749,
  longitude: -84.388,
  crs: CRS,
  source: "manual_target_pin",
  capturedAt: "2026-10-17T12:30:00Z",
  accuracyMeters: null,
  provenanceRef: "snapntalk://observation/example-001",
});

function fieldsOf(result) {
  return result.errors.map((error) => error.field);
}

test("accepts a valid assertion", () => {
  const result = validateCoordinateAssertion(VALID_ASSERTION);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("accepts boundary latitudes and longitudes", () => {
  for (const [latitude, longitude] of [
    [-90, -180],
    [90, 180],
    [-90, 180],
    [90, -180],
    [0, 0],
  ]) {
    const result = validateCoordinateAssertion({ ...VALID_ASSERTION, latitude, longitude });
    assert.equal(result.valid, true, `expected (${latitude}, ${longitude}) to be valid`);
  }
});

test("rejects out-of-range latitudes and longitudes", () => {
  for (const [latitude, longitude] of [
    [-90.000001, 0],
    [90.000001, 0],
    [0, -180.000001],
    [0, 180.000001],
    [-91, -181],
    [91, 181],
  ]) {
    const result = validateCoordinateAssertion({ ...VALID_ASSERTION, latitude, longitude });
    assert.equal(result.valid, false, `expected (${latitude}, ${longitude}) to be invalid`);
  }
});

test("rejects non-finite and non-numeric coordinates", () => {
  for (const latitude of [Number.NaN, Infinity, -Infinity, "33.749", true]) {
    const result = validateCoordinateAssertion({ ...VALID_ASSERTION, latitude });
    assert.equal(result.valid, false);
    assert.ok(fieldsOf(result).includes("latitude"));
  }
  for (const longitude of [Number.NaN, Infinity, -Infinity, "-84.388", null]) {
    const result = validateCoordinateAssertion({ ...VALID_ASSERTION, longitude });
    assert.equal(result.valid, false);
    assert.ok(fieldsOf(result).includes("longitude"));
  }
});

test("rejects missing coordinates instead of fabricating a location", () => {
  // A denied permission or failed fix must stay absent; the validator must
  // not invent a default position such as 0,0.
  const result = validateCoordinateAssertion({
    schemaVersion: SCHEMA_VERSION,
    crs: CRS,
    source: "device_position",
    capturedAt: "2026-10-17T12:30:00Z",
    accuracyMeters: null,
    provenanceRef: "device://position/denied",
  });
  assert.equal(result.valid, false);
  assert.ok(fieldsOf(result).includes("latitude"));
  assert.ok(fieldsOf(result).includes("longitude"));
});

test("accepts every declared source and rejects undeclared sources", () => {
  for (const source of SOURCES) {
    const result = validateCoordinateAssertion({ ...VALID_ASSERTION, source });
    assert.equal(result.valid, true, `expected source "${source}" to be valid`);
  }
  for (const source of ["gps", "guessed", "verified_survey", "", 42, null]) {
    const result = validateCoordinateAssertion({ ...VALID_ASSERTION, source });
    assert.equal(result.valid, false, `expected source ${JSON.stringify(source)} to be invalid`);
  }
});

test("distinguishes device position from manual target pin as separate sources", () => {
  // The schema keeps observer location and observed-object location as
  // distinct source values; neither may silently stand in for the other.
  assert.ok(SOURCES.includes("device_position"));
  assert.ok(SOURCES.includes("manual_target_pin"));
  assert.notEqual("device_position", "manual_target_pin");
});

test("accepts unknown accuracy as null and rejects fabricated accuracy", () => {
  const unknownAccuracy = validateCoordinateAssertion({ ...VALID_ASSERTION, accuracyMeters: null });
  assert.equal(unknownAccuracy.valid, true);

  const measured = validateCoordinateAssertion({ ...VALID_ASSERTION, accuracyMeters: 0 });
  assert.equal(measured.valid, true);

  for (const accuracyMeters of [-0.001, -5, Number.NaN, Infinity, "5", undefined]) {
    const result = validateCoordinateAssertion({ ...VALID_ASSERTION, accuracyMeters });
    assert.equal(result.valid, false, `expected accuracyMeters ${JSON.stringify(accuracyMeters)} to be invalid`);
  }
});

test("accepts RFC 3339 timestamps and rejects malformed or impossible ones", () => {
  for (const capturedAt of [
    "2026-10-17T12:30:00Z",
    "2026-10-17T12:30:00.123Z",
    "2026-10-17T12:30:00+05:30",
    "2026-10-17T12:30:00-08:00",
  ]) {
    const result = validateCoordinateAssertion({ ...VALID_ASSERTION, capturedAt });
    assert.equal(result.valid, true, `expected "${capturedAt}" to be valid`);
  }

  for (const capturedAt of [
    "2026-10-17",
    "2026-10-17T12:30:00",
    "2026-10-17 12:30:00Z",
    "not-a-date",
    "2026-13-01T00:00:00Z",
    1760700000000,
    null,
  ]) {
    const result = validateCoordinateAssertion({ ...VALID_ASSERTION, capturedAt });
    assert.equal(result.valid, false, `expected ${JSON.stringify(capturedAt)} to be invalid`);
  }
});

test("requires provenanceRef to be a non-empty, non-whitespace string", () => {
  for (const provenanceRef of [
    "",
    " ",
    "   ",
    "\t",
    "\n\r ",
    "\u00A0",
    "\u2003\u2003",
    7,
    null,
    {},
    [],
  ]) {
    const result = validateCoordinateAssertion({ ...VALID_ASSERTION, provenanceRef });
    assert.equal(result.valid, false, `expected provenanceRef ${JSON.stringify(provenanceRef)} to be invalid`);
  }

  // Whitespace around real content remains valid.
  for (const provenanceRef of [" ref ", "\tref\n"]) {
    const result = validateCoordinateAssertion({ ...VALID_ASSERTION, provenanceRef });
    assert.equal(result.valid, true, `expected provenanceRef ${JSON.stringify(provenanceRef)} to be valid`);
  }
});

test("rejects wrong schemaVersion and crs", () => {
  for (const [field, bad] of [
    ["schemaVersion", "h1-geo/coordinate-assertion-v1"],
    ["schemaVersion", 0],
    ["crs", "EPSG:3857"],
    ["crs", "WGS84"],
  ]) {
    const result = validateCoordinateAssertion({ ...VALID_ASSERTION, [field]: bad });
    assert.equal(result.valid, false, `expected ${field}=${JSON.stringify(bad)} to be invalid`);
  }
});

test("rejects missing required fields", () => {
  for (const field of REQUIRED_FIELDS) {
    const candidate = { ...VALID_ASSERTION };
    delete candidate[field];
    const result = validateCoordinateAssertion(candidate);
    assert.equal(result.valid, false, `expected missing "${field}" to be invalid`);
    assert.ok(fieldsOf(result).includes(field));
  }
});

test("rejects additional properties", () => {
  const result = validateCoordinateAssertion({ ...VALID_ASSERTION, address: "1 Main St" });
  assert.equal(result.valid, false);
  assert.ok(fieldsOf(result).includes("address"));
});

test("enforces notes as a string of at most 500 characters", () => {
  const atLimit = validateCoordinateAssertion({ ...VALID_ASSERTION, notes: "x".repeat(500) });
  assert.equal(atLimit.valid, true);

  const overLimit = validateCoordinateAssertion({ ...VALID_ASSERTION, notes: "x".repeat(501) });
  assert.equal(overLimit.valid, false);
  assert.ok(fieldsOf(overLimit).includes("notes"));

  const wrongType = validateCoordinateAssertion({ ...VALID_ASSERTION, notes: 42 });
  assert.equal(wrongType.valid, false);
});

test("rejects non-object candidates", () => {
  for (const candidate of [null, undefined, 42, "pin", true, [33.749, -84.388]]) {
    const result = validateCoordinateAssertion(candidate);
    assert.equal(result.valid, false);
  }
});

test("does not mutate or enrich the candidate (no fabricated certainty)", () => {
  const candidate = {
    schemaVersion: SCHEMA_VERSION,
    latitude: 33.749,
    longitude: -84.388,
    crs: CRS,
    source: "device_position",
    capturedAt: "2026-10-17T12:30:00Z",
    accuracyMeters: null,
    provenanceRef: "device://position/example",
  };
  const snapshot = JSON.parse(JSON.stringify(candidate));
  const result = validateCoordinateAssertion(candidate);
  assert.equal(result.valid, true);
  assert.deepEqual(candidate, snapshot);
  // Null accuracy must stay null; validation must not invent a number.
  assert.equal(candidate.accuracyMeters, null);
});

test("rejects rather than repairs invalid values (no clamp, round, or coerce)", () => {
  const candidate = {
    ...VALID_ASSERTION,
    latitude: 91,
    longitude: -181,
    accuracyMeters: -5,
    capturedAt: 1760700000000,
    provenanceRef: "   ",
  };
  const snapshot = JSON.parse(JSON.stringify(candidate));
  const result = validateCoordinateAssertion(candidate);
  assert.equal(result.valid, false);
  for (const field of ["latitude", "longitude", "accuracyMeters", "capturedAt", "provenanceRef"]) {
    assert.ok(fieldsOf(result).includes(field), `expected an error for "${field}"`);
  }
  assert.deepEqual(candidate, snapshot);
});

test("validator constants stay consistent with the JSON Schema contract", async () => {
  const schemaUrl = new URL("../contracts/geo-coordinate-assertion-v0.schema.json", import.meta.url);
  const schema = JSON.parse(await readFile(schemaUrl, "utf8"));

  assert.equal(schema.properties.schemaVersion.const, SCHEMA_VERSION);
  assert.equal(schema.properties.crs.const, CRS);
  assert.deepEqual(schema.properties.source.enum, [...SOURCES]);
  assert.deepEqual(schema.required, [...REQUIRED_FIELDS]);
  assert.equal(schema.properties.latitude.minimum, -90);
  assert.equal(schema.properties.latitude.maximum, 90);
  assert.equal(schema.properties.longitude.minimum, -180);
  assert.equal(schema.properties.longitude.maximum, 180);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.accuracyMeters.type, ["number", "null"]);
  assert.equal(schema.properties.provenanceRef.minLength, 1);
  assert.equal(schema.properties.provenanceRef.pattern, "\\S");
  assert.equal(schema.properties.notes.maxLength, 500);
});
