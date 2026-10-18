import assert from "node:assert/strict";
import test from "node:test";
import { SCHEMA_VERSION, CRS } from "../../src/coordinate-assertion.js";
import { createAssertionStore } from "../../src/stage-b/assertion-store.js";
import { createRecordStore, memoryStorage } from "../../src/stage-b/record-store.js";
import { createObservation, validateObservation, OBSERVATION_STORE_KEY } from "../../src/stage-b/observation.js";
import { createEvidenceLink } from "../../src/stage-b/evidence.js";
import { createEvidenceStore } from "../../src/stage-b/evidence-store.js";
import { createCandidate } from "../../src/stage-b/candidate.js";
import { createCandidateStore } from "../../src/stage-b/candidate-store.js";
import { createHandoffRecord, resolveReviewState } from "../../src/stage-b/handoff.js";
import { createHandoffStore } from "../../src/stage-b/handoff-store.js";
import { fingerprint } from "../../src/stage-b/fingerprint.js";
import { buildVnnDryRunPayload } from "../../src/stage-b/vnn-dryrun.js";
import {
  createHandoffPackage,
  exportPackageJson,
  importAndVerifyPackage,
  validatePackageStructure,
  PACKAGE_SCHEMA_VERSION,
} from "../../src/stage-b/handoff-package.js";

const ASSERTION = Object.freeze({
  schemaVersion: SCHEMA_VERSION, latitude: 33.749, longitude: -84.388, crs: CRS,
  source: "manual_target_pin", capturedAt: "2026-10-17T12:30:00Z",
  accuracyMeters: null, provenanceRef: "h1geo://pin/geo008",
});

function setup() {
  const storage = memoryStorage();
  const assertionStore = createAssertionStore(storage);
  const observationStore = createRecordStore({
    storage, key: OBSERVATION_STORE_KEY, validate: validateObservation, idPrefix: "obs",
  });
  const evidenceStore = createEvidenceStore(storage, { assertionStore, observationStore });
  const candidateStore = createCandidateStore(storage);
  const handoffStore = createHandoffStore(storage, { candidateStore });
  const { id: assertionId } = assertionStore.save(ASSERTION);
  const { id: draftId } = candidateStore.save(createCandidate({ assertionId, summary: "possible need" }));
  const stores = { assertionStore, observationStore, evidenceStore, candidateStore, handoffStore };
  return { storage, ...{ assertionStore, observationStore, evidenceStore, candidateStore, handoffStore }, assertionId, draftId };
}

async function decide(ctx, decision, decidedBy = "reviewer-1") {
  const candidate = ctx.candidateStore.get(ctx.draftId).record;
  const payload = buildVnnDryRunPayload({ candidate, assertion: ctx.assertionStore.get(ctx.assertionId).record });
  return ctx.handoffStore.save(createHandoffRecord({
    draftId: ctx.draftId, candidate, payload, decision, decidedBy,
  }));
}

const STORES = (ctx) => ({
  candidateStore: ctx.candidateStore,
  assertionStore: ctx.assertionStore,
  evidenceStore: ctx.evidenceStore,
  handoffStore: ctx.handoffStore,
});

test("packaging an approved draft produces a digest-verifiable package", async () => {
  const ctx = setup();
  await decide(ctx, "approved");
  const result = await createHandoffPackage({ draftId: ctx.draftId, ...STORES(ctx) });
  assert.equal(result.ok, true);
  const pkg = result.package;
  assert.equal(pkg.schemaVersion, PACKAGE_SCHEMA_VERSION);
  assert.match(pkg.sha256, /^[0-9a-f]{64}$/);
  assert.equal(validatePackageStructure(pkg).valid, true);
  const verify = await importAndVerifyPackage(exportPackageJson(pkg), STORES(ctx));
  assert.equal(verify.ok, true, JSON.stringify(verify.errors));
});

test("packaging rejects unreviewed, declined, and stale drafts", async () => {
  const ctx = setup();
  // Unreviewed.
  let result = await createHandoffPackage({ draftId: ctx.draftId, ...STORES(ctx) });
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /unreviewed/);
  // Declined.
  await decide(ctx, "declined");
  result = await createHandoffPackage({ draftId: ctx.draftId, ...STORES(ctx) });
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /declined/);
  // Approved, then draft edited → stale.
  await decide(ctx, "approved");
  const draft = ctx.candidateStore.get(ctx.draftId).record;
  ctx.candidateStore.update(ctx.draftId, { ...draft, title: "changed" });
  result = await createHandoffPackage({ draftId: ctx.draftId, ...STORES(ctx) });
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /stale/);
});

test("package preserves assertion, ids, evidence refs and marks readiness", async () => {
  const ctx = setup();
  ctx.evidenceStore.save(createEvidenceLink({
    targetType: "assertion", targetId: ctx.assertionId,
    kind: "snapntalk_capture", reference: "cap_123e4567-e89b-42d3-a456-426614174000",
  }));
  const draft = ctx.candidateStore.get(ctx.draftId).record;
  ctx.candidateStore.update(ctx.draftId, {
    ...draft, title: "T", condition: "leaning", proposedWork: "reset",
    requestedTiming: "soon", requiredCapabilities: ["fencing"],
  });
  await decide(ctx, "approved", "founder");
  const result = await createHandoffPackage({ draftId: ctx.draftId, ...STORES(ctx) });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const c = result.package.content;
  assert.equal(c.readyForIntake, true);
  assert.deepEqual(c.missing, []);
  assert.deepEqual(c.assertion, ASSERTION);
  assert.equal(c.assertionId, ctx.assertionId);
  assert.equal(c.review.decidedBy, "founder");
  assert.equal(c.evidenceRefs.length, 1);
  assert.equal(c.dryRun, true);
});

test("export → import round trip verifies unchanged contents", async () => {
  const ctx = setup();
  await decide(ctx, "approved");
  const { package: pkg } = await createHandoffPackage({ draftId: ctx.draftId, ...STORES(ctx) });
  const text = exportPackageJson(pkg);
  const back = await importAndVerifyPackage(text, STORES(ctx));
  assert.equal(back.ok, true, JSON.stringify(back.errors));
  assert.equal(back.package.sha256, pkg.sha256);
});

test("tampering with any content byte breaks the digest", async () => {
  const ctx = setup();
  await decide(ctx, "approved");
  const { package: pkg } = await createHandoffPackage({ draftId: ctx.draftId, ...STORES(ctx) });
  const tampered = JSON.parse(exportPackageJson(pkg));
  tampered.content.intake.title = "Free castles for everyone";
  const result = await importAndVerifyPackage(JSON.stringify(tampered), STORES(ctx));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === "sha256"), "expected digest mismatch");
});

test("malformed JSON and unsupported versions are rejected", async () => {
  const ctx = setup();
  const bad = await importAndVerifyPackage("{not json", STORES(ctx));
  assert.equal(bad.ok, false);
  await decide(ctx, "approved");
  const { package: pkg } = await createHandoffPackage({ draftId: ctx.draftId, ...STORES(ctx) });
  const wrongVersion = { ...pkg, schemaVersion: "h1-geo/vnn-handoff-package-v1" };
  const result = await importAndVerifyPackage(JSON.stringify(wrongVersion), STORES(ctx));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === "schemaVersion"));
});

test("broken relationships are detected at verify time", async () => {
  const ctx = setup();
  await decide(ctx, "approved");
  const { package: pkg } = await createHandoffPackage({ draftId: ctx.draftId, ...STORES(ctx) });
  // Verify against EMPTY stores → referenced draft/assertion gone.
  const empty = setup();
  const result = await importAndVerifyPackage(exportPackageJson(pkg), STORES(empty));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /broken relationship/.test(e.message)), JSON.stringify(result.errors));
});

test("packages persist via the package store", async () => {
  const ctx = setup();
  await decide(ctx, "approved");
  const { package: pkg } = await createHandoffPackage({ draftId: ctx.draftId, ...STORES(ctx) });
  const packageStore = createRecordStore({
    storage: ctx.storage, key: "h1geo.stageb.packages.v1",
    validate: validatePackageStructure, idPrefix: "pkg",
  });
  assert.equal(packageStore.save(pkg).ok, true);
  const reloaded = createRecordStore({
    storage: ctx.storage, key: "h1geo.stageb.packages.v1",
    validate: validatePackageStructure, idPrefix: "pkg",
  });
  assert.equal(reloaded.list().length, 1);
  assert.equal(reloaded.list()[0].record.packageId, pkg.packageId);
});
