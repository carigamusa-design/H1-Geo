import assert from "node:assert/strict";
import test from "node:test";
import { SCHEMA_VERSION, CRS } from "../../src/coordinate-assertion.js";
import { createAssertionStore } from "../../src/stage-b/assertion-store.js";
import { createRecordStore, memoryStorage } from "../../src/stage-b/record-store.js";
import { createObservation, validateObservation, OBSERVATION_STORE_KEY } from "../../src/stage-b/observation.js";
import { createCandidate } from "../../src/stage-b/candidate.js";
import { createCandidateStore } from "../../src/stage-b/candidate-store.js";
import { createEvidenceLink } from "../../src/stage-b/evidence.js";
import { createEvidenceStore } from "../../src/stage-b/evidence-store.js";
import { createHandoffRecord } from "../../src/stage-b/handoff.js";
import { createHandoffStore } from "../../src/stage-b/handoff-store.js";
import { buildVnnDryRunPayload } from "../../src/stage-b/vnn-dryrun.js";
import {
  createHandoffPackage, verifyPackage, exportPackageJson,
  PACKAGE_SCHEMA_VERSION,
} from "../../src/stage-b/handoff-package.js";
import {
  ed25519Available, generateSignerKey, createSignatureRecord,
  verifySignatureRecord, validateSignatureRecord, assessTrust,
  SIGNATURE_SCHEMA_VERSION,
} from "../../src/stage-b/signature.js";
import {
  buildVnnIntakeExport, validateVnnIntakeExport,
  VNN_EXPORT_SCHEMA_VERSION,
} from "../../src/stage-b/vnn-export.js";

const ASSERTION = Object.freeze({
  schemaVersion: SCHEMA_VERSION, latitude: 33.749, longitude: -84.388, crs: CRS,
  source: "manual_target_pin", capturedAt: "2026-10-17T12:30:00Z",
  accuracyMeters: null, provenanceRef: "h1geo://pin/geo009",
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
  const { id: draftId } = candidateStore.save(createCandidate({ assertionId, summary: "need" }));
  return { storage, assertionStore, observationStore, evidenceStore, candidateStore, handoffStore, assertionId, draftId };
}

function STORES(ctx) {
  return {
    candidateStore: ctx.candidateStore, assertionStore: ctx.assertionStore,
    evidenceStore: ctx.evidenceStore, handoffStore: ctx.handoffStore,
  };
}

function approve(ctx, decidedBy = "reviewer-1") {
  const candidate = ctx.candidateStore.get(ctx.draftId).record;
  const payload = buildVnnDryRunPayload({ candidate, assertion: ctx.assertionStore.get(ctx.assertionId).record });
  return ctx.handoffStore.save(createHandoffRecord({
    draftId: ctx.draftId, candidate, payload, decision: "approved", decidedBy,
  }));
}

async function signedPkg(ctx, decidedBy = "reviewer-1") {
  approve(ctx, decidedBy);
  const { package: pkg } = await createHandoffPackage({ draftId: ctx.draftId, ...STORES(ctx) });
  const key = await generateSignerKey();
  const sig = await createSignatureRecord({
    pkg, privateKey: key.privateKey, publicKeyHex: key.publicKeyHex, signerId: decidedBy,
  });
  return { pkg, sig: sig.signature, key };
}

test("signing binds digest, signer, and key; verify accepts a good signature", async () => {
  if (!(await ed25519Available())) { console.log("Ed25519 unavailable — skipping"); return; }
  const ctx = setup();
  const { pkg, sig, key } = await signedPkg(ctx);
  assert.equal(sig.schemaVersion, SIGNATURE_SCHEMA_VERSION);
  assert.equal(sig.algorithm, "Ed25519");
  assert.equal(sig.signedHash, pkg.sha256);
  assert.equal(sig.signerId, "reviewer-1");
  assert.match(sig.signature, /^[0-9a-f]{128}$/);
  assert.match(sig.publicKey, /^[0-9a-f]{64}$/);
  const v = await verifySignatureRecord(pkg, sig);
  assert.equal(v.signatureValid, true, JSON.stringify(v.errors));
});

test("verify rejects a signature over a different package and a forged signature", async () => {
  if (!(await ed25519Available())) return;
  const ctx = setup();
  const { pkg, sig } = await signedPkg(ctx);
  // Same digest string re-signed by a DIFFERENT key → crypto fails.
  const key2 = await generateSignerKey();
  const forged = await createSignatureRecord({
    pkg, privateKey: key2.privateKey, publicKeyHex: key2.publicKeyHex, signerId: "reviewer-1",
  });
  const wrongKey = { ...sig, signature: forged.signature.signature };
  assert.equal((await verifySignatureRecord(pkg, wrongKey)).signatureValid, false);
  // Signature bound to another digest → signedHash mismatch.
  const ctx2 = setup();
  approve(ctx2);
  const { package: pkg2 } = await createHandoffPackage({ draftId: ctx2.draftId, ...STORES(ctx2) });
  assert.notEqual(pkg2.sha256, pkg.sha256, "different drafts differ in digest");
  assert.equal((await verifySignatureRecord(pkg2, sig)).signatureValid, false);
});

test("four-way trust verdict keeps the four questions separate", async () => {
  if (!(await ed25519Available())) return;
  const ctx = setup();
  const { pkg, sig } = await signedPkg(ctx, "founder");
  const verdict = await assessTrust(pkg, sig, { verifyPackage, stores: STORES(ctx) });
  assert.equal(verdict.contentIntact, true);
  assert.equal(verdict.signatureValid, true);
  assert.equal(verdict.signerAuthorized, true);
  assert.equal(verdict.evidenceAuthenticity, "not_established");
  // Valid signature by a NON-approver → crypto OK, authorization fails.
  const stranger = await createSignatureRecord({
    pkg, privateKey: (await generateSignerKey()).privateKey,
    publicKeyHex: "0".repeat(64), signerId: "intruder",
  });
  const v2 = await assessTrust(pkg, stranger.signature, { verifyPackage, stores: STORES(ctx) });
  assert.equal(v2.signerAuthorized, false);
  // Unsigned → signature questions stay unanswered, not false.
  const v3 = await assessTrust(pkg, null, { verifyPackage, stores: STORES(ctx) });
  assert.equal(v3.signatureValid, null);
  assert.equal(v3.signerAuthorized, null);
});

test("tampered package fails integrity — the four-way verdict separates the signals", async () => {
  if (!(await ed25519Available())) return;
  const ctx = setup();
  const { pkg, sig } = await signedPkg(ctx);
  const tampered = JSON.parse(exportPackageJson(pkg));
  tampered.content.intake.title = "forged";
  const verdict = await assessTrust(tampered, sig, { verifyPackage, stores: STORES(ctx) });
  // Integrity catches the tamper via digest recompute...
  assert.equal(verdict.contentIntact, false);
  // ...while the signature still verifies over the *claimed* digest —
  // a valid signature alone does not establish integrity.
  assert.equal(verdict.signatureValid, true);
  assert.equal(verdict.signerAuthorized, true);
});

test("signing refuses anonymous signers and malformed records are rejected", async () => {
  if (!(await ed25519Available())) return;
  const ctx = setup();
  approve(ctx);
  const { package: pkg } = await createHandoffPackage({ draftId: ctx.draftId, ...STORES(ctx) });
  const key = await generateSignerKey();
  const anon = await createSignatureRecord({
    pkg, privateKey: key.privateKey, publicKeyHex: key.publicKeyHex, signerId: "   ",
  });
  assert.equal(anon.ok, false);
  assert.ok(anon.errors.some((e) => e.field === "signerId"));
  assert.equal(validateSignatureRecord({ schemaVersion: "nope" }).valid, false);
  const good = await createSignatureRecord({
    pkg, privateKey: key.privateKey, publicKeyHex: key.publicKeyHex, signerId: "reviewer-1",
  });
  assert.equal(validateSignatureRecord(good.signature).valid, true);
});

test("VNN export mirrors real intake boundaries and rejects bad session fields", async () => {
  if (!(await ed25519Available())) return;
  const ctx = setup();
  const { pkg, sig } = await signedPkg(ctx);
  const result = buildVnnIntakeExport({ pkg, requesterRef: " h1geo://reviewer/founder ", signatureRec: sig });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const rec = result.record;
  assert.equal(rec.schemaVersion, VNN_EXPORT_SCHEMA_VERSION);
  assert.equal(rec.session.requester_ref, "h1geo://reviewer/founder");
  assert.equal(rec.session.channel, "form");
  assert.equal(rec.packageRef.sha256, pkg.sha256);
  assert.equal(rec.signature, sig);
  // draftFields carry only VNN-editable, non-null fields; nulls are omitted+listed.
  for (const k of Object.keys(rec.draftFields)) {
    assert.ok(["title", "outcome", "required_capabilities", "location",
      "requested_timing", "evidence_requirements", "offered_amount",
      "currency", "amount_certainty"].includes(k), `unexpected field ${k}`);
    assert.notEqual(rec.draftFields[k], null);
  }
  assert.ok(rec.omittedFields.includes("offered_amount"));
  assert.equal(rec.dryRun, true);
  assert.equal(validateVnnIntakeExport(rec).valid, true, JSON.stringify(validateVnnIntakeExport(rec).errors));
  // Bad session fields are rejected at build and at validate.
  assert.equal(buildVnnIntakeExport({ pkg, requesterRef: " " }).ok, false);
  assert.equal(buildVnnIntakeExport({ pkg, requesterRef: "x", homeContextType: "planet" }).ok, false);
  const bad = JSON.parse(JSON.stringify(rec));
  bad.session.home_context_type = "planet";
  assert.equal(validateVnnIntakeExport(bad).valid, false);
  const bad2 = JSON.parse(JSON.stringify(rec));
  bad2.draftFields.mission_secret = "x";
  assert.equal(validateVnnIntakeExport(bad2).valid, false);
});

test("export attachments map evidence refs onto VNN kinds conservatively", async () => {
  const ctx = setup();
  ctx.evidenceStore.save(createEvidenceLink({
    targetType: "assertion", targetId: ctx.assertionId,
    kind: "snapntalk_capture", reference: "cap_123e4567-e89b-42d3-a456-426614174000",
  }));
  ctx.evidenceStore.save(createEvidenceLink({
    targetType: "assertion", targetId: ctx.assertionId,
    kind: "document", reference: "h1geo://doc/lease-scan",
  }));
  approve(ctx);
  const { package: pkg } = await createHandoffPackage({ draftId: ctx.draftId, ...STORES(ctx) });
  const { ok, record } = buildVnnIntakeExport({ pkg, requesterRef: "r" });
  assert.equal(ok, true);
  const kinds = record.attachments.map((a) => a.kind);
  assert.deepEqual(kinds.sort(), ["document", "other"]);
  assert.ok(record.attachments.every((a) => a.ref && a.ref.length <= 1000));
});

test("signature records and exports persist via their stores", async () => {
  if (!(await ed25519Available())) return;
  const ctx = setup();
  const { sig } = await signedPkg(ctx);
  const sigStore = createRecordStore({
    storage: ctx.storage, key: "h1geo.stageb.signatures.v1",
    validate: validateSignatureRecord, idPrefix: "sig",
  });
  assert.equal(sigStore.save(sig).ok, true);
  const reloaded = createRecordStore({
    storage: ctx.storage, key: "h1geo.stageb.signatures.v1",
    validate: validateSignatureRecord, idPrefix: "sig",
  });
  assert.equal(reloaded.list().length, 1);
  assert.equal(reloaded.list()[0].record.signerId, "reviewer-1");
});

test("changed package after signing breaks the signature binding", async () => {
  if (!(await ed25519Available())) return;
  const ctx = setup();
  const { pkg, sig } = await signedPkg(ctx);
  // Simulate re-packaging after draft edit → new digest; old sig no longer binds.
  const draft = ctx.candidateStore.get(ctx.draftId).record;
  ctx.candidateStore.update(ctx.draftId, { ...draft, title: "v2" });
  approve(ctx, "reviewer-1");
  const { package: pkg2 } = await createHandoffPackage({ draftId: ctx.draftId, ...STORES(ctx) });
  const v = await verifySignatureRecord(pkg2, sig);
  assert.equal(v.signatureValid, false);
  assert.ok(v.errors.some((e) => e.field === "signedHash"));
});
