import assert from "node:assert/strict";
import test from "node:test";
import { SCHEMA_VERSION, CRS } from "../../src/coordinate-assertion.js";
import { createCandidate } from "../../src/stage-b/candidate.js";
import { buildVnnDryRunPayload, validateVnnDryRunPayload } from "../../src/stage-b/vnn-dryrun.js";
import { describeGeolocationError, GEOLOCATION_MESSAGES } from "../../src/stage-b/geo-errors.js";

const ASSERTION = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  latitude: 33.749,
  longitude: -84.388,
  crs: CRS,
  source: "manual_target_pin",
  capturedAt: "2026-10-17T12:30:00Z",
  accuracyMeters: null,
  provenanceRef: "h1geo://pin/test-001",
});

test("dry-run payload carries VNN-compatible intake fields and provenance", () => {
  const candidate = { ...createCandidate({ assertionId: "asrt_1", summary: "Possible fence repair" }), status: "needs_review" };
  const payload = buildVnnDryRunPayload({ candidate, assertion: ASSERTION });
  const check = validateVnnDryRunPayload(payload);
  assert.equal(check.valid, true);
  assert.equal(payload.dryRun, true);
  assert.equal(payload.intake.location, "33.749,-84.388");
  assert.ok(payload.intake.location.length <= 300, "VNN location limit");
  assert.equal(payload.intake.title, "Possible fence repair"); // falls back to summary
  assert.equal(payload.provenanceRef, ASSERTION.provenanceRef);
  assert.equal(payload.coordinateSource, "manual_target_pin");
});

test("a non-dry-run or malformed payload is rejected", () => {
  const candidate = createCandidate({ assertionId: "asrt_1", summary: "s" });
  const payload = buildVnnDryRunPayload({ candidate, assertion: ASSERTION });
  assert.equal(validateVnnDryRunPayload({ ...payload, dryRun: false }).valid, false);
  assert.equal(validateVnnDryRunPayload({ ...payload, intake: { ...payload.intake, location: "x".repeat(301) } }).valid, false);
  assert.equal(validateVnnDryRunPayload({ ...payload, provenanceRef: " " }).valid, false);
  assert.equal(validateVnnDryRunPayload({ ...payload, intake: { ...payload.intake, offered_amount: 10 } }).valid, false); // currency required with amount
});

test("geolocation failures produce honest manual-pin guidance", () => {
  assert.equal(describeGeolocationError({ code: 1 }), GEOLOCATION_MESSAGES[1]);
  assert.equal(describeGeolocationError({ code: 2 }), GEOLOCATION_MESSAGES[2]);
  assert.equal(describeGeolocationError({ code: 3 }), GEOLOCATION_MESSAGES[3]);
  assert.equal(describeGeolocationError(null), GEOLOCATION_MESSAGES.unavailable);
  assert.match(describeGeolocationError({ code: 1 }), /manually/i);
});
