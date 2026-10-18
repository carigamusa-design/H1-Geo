import assert from "node:assert/strict";
import test from "node:test";
import { createAssertionStore } from "../../src/stage-b/assertion-store.js";
import { createRecordStore, memoryStorage } from "../../src/stage-b/record-store.js";
import { validateObservation, OBSERVATION_STORE_KEY } from "../../src/stage-b/observation.js";
import { createEvidenceLink } from "../../src/stage-b/evidence.js";
import { createEvidenceStore } from "../../src/stage-b/evidence-store.js";
import { createCandidateStore } from "../../src/stage-b/candidate-store.js";
import { createHandoffRecord } from "../../src/stage-b/handoff.js";
import { createHandoffStore } from "../../src/stage-b/handoff-store.js";
import { buildVnnDryRunPayload } from "../../src/stage-b/vnn-dryrun.js";
import {
  createHandoffPackage, verifyPackage, exportPackageJson,
  importAndVerifyPackage, validatePackageStructure, PACKAGE_STORE_KEY,
} from "../../src/stage-b/handoff-package.js";
import {
  ed25519Available, generateSignerKey, createSignatureRecord,
  assessTrust, validateSignatureRecord, SIGNATURE_STORE_KEY,
} from "../../src/stage-b/signature.js";
import {
  buildVnnIntakeExport, validateVnnIntakeExport, VNN_EXPORT_STORE_KEY,
} from "../../src/stage-b/vnn-export.js";
import { workflowStatus, loadH1ExampleScenario } from "../../src/stage-b/workflow.js";

function setup() {
  const storage = memoryStorage();
  const assertionStore = createAssertionStore(storage);
  const observationStore = createRecordStore({
    storage, key: OBSERVATION_STORE_KEY, validate: validateObservation, idPrefix: "obs",
  });
  const evidenceStore = createEvidenceStore(storage, { assertionStore, observationStore });
  const candidateStore = createCandidateStore(storage);
  const handoffStore = createHandoffStore(storage, { candidateStore });
  const packageStore = createRecordStore({
    storage, key: PACKAGE_STORE_KEY, validate: validatePackageStructure, idPrefix: "pkg",
  });
  const signatureStore = createRecordStore({
    storage, key: SIGNATURE_STORE_KEY,
    validate: validateSignatureRecord, idPrefix: "sig",
  });
  const exportStore = createRecordStore({
    storage, key: VNN_EXPORT_STORE_KEY, validate: validateVnnIntakeExport, idPrefix: "vex",
  });
  const stores = {
    assertionStore, observationStore, evidenceStore, candidateStore,
    handoffStore, packageStore, signatureStore, exportStore,
  };
  return { storage, stores };
}

test("synthetic H1 example loads through the real stores and drives all 8 stages", async () => {
  const { storage, stores } = setup();
  const { assertionStore, candidateStore, handoffStore, packageStore, signatureStore, exportStore } = stores;

  // 0. Scenario loads via existing save paths, marked synthetic.
  const sc = loadH1ExampleScenario(stores);
  assert.equal(sc.ok, true);
  assert.equal(sc.synthetic, true);
  assert.match(assertionStore.get(sc.assertionId).record.provenanceRef, /synthetic/);

  let status = workflowStatus(stores, sc.assertionId);
  assert.equal(status.stages[0].done, true);  // location
  assert.equal(status.stages[1].done, true);  // observation
  assert.equal(status.stages[2].done, true);  // evidence
  assert.equal(status.stages[3].done, true);  // draft exists + intake complete
  assert.equal(status.stages[4].done, false); // not reviewed yet
  assert.match(status.summary, /approves/);

  // 5. Named review approves the exact draft.
  const candidate = candidateStore.get(sc.draftId).record;
  const payload = buildVnnDryRunPayload({
    candidate, assertion: assertionStore.get(sc.assertionId).record,
  });
  assert.deepEqual(payload.missing, []);
  handoffStore.save(createHandoffRecord({
    draftId: sc.draftId, candidate, payload, decision: "approved", decidedBy: "founder",
  }));
  status = workflowStatus(stores, sc.assertionId);
  assert.equal(status.stages[4].done, true);
  assert.match(status.summary, /package/);

  // 6. Package generated, digest verifies, persists.
  const { package: pkg } = await createHandoffPackage({
    draftId: sc.draftId, candidateStore, assertionStore,
    evidenceStore: stores.evidenceStore, handoffStore,
  });
  packageStore.save(pkg);
  const verify = await importAndVerifyPackage(exportPackageJson(pkg), {
    assertionStore, candidateStore,
  });
  assert.equal(verify.ok, true);
  status = workflowStatus(stores, sc.assertionId);
  assert.equal(status.stages[5].done, true);

  // 7. Sign + 4-way trust.
  if (await ed25519Available()) {
    const key = await generateSignerKey();
    const sig = (await createSignatureRecord({
      pkg, privateKey: key.privateKey, publicKeyHex: key.publicKeyHex,
      signerId: "founder",
    })).signature;
    signatureStore.save(sig);
    const verdict = await assessTrust(pkg, sig, {
      verifyPackage, stores: { assertionStore, candidateStore },
    });
    assert.deepEqual(
      [verdict.contentIntact, verdict.signatureValid, verdict.signerAuthorized],
      [true, true, true]);
    status = workflowStatus(stores, sc.assertionId);
    assert.equal(status.stages[6].done, true);

    // 8. Export preview + confirm — ready, still dry-run.
    const exp = buildVnnIntakeExport({
      pkg, requesterRef: "h1geo://customer/h1", signatureRec: sig,
    });
    assert.equal(exp.ok, true);
    assert.equal(exp.record.readyForIntake, true);
    assert.equal(exp.record.dryRun, true);
    exportStore.save(exp.record);
    status = workflowStatus(stores, sc.assertionId);
    assert.equal(status.stages[7].done, true);
    assert.equal(status.stages.every((s) => s.done), true);
    assert.match(status.summary, /Complete/);
  }
});

test("leave and return: all state survives a full store reload", async () => {
  const { storage, stores } = setup();
  const sc = loadH1ExampleScenario(stores);
  assert.equal(sc.ok, true);
  // Rebuild every store from the same storage (simulates browser refresh).
  const assertionStore2 = createAssertionStore(storage);
  assert.equal(assertionStore2.get(sc.assertionId).record.provenanceRef,
    "h1geo://example/synthetic-fence");
  const observationStore2 = createRecordStore({
    storage, key: OBSERVATION_STORE_KEY, validate: validateObservation, idPrefix: "obs",
  });
  assert.equal(observationStore2.get(sc.observationId).record.summary.includes("SYNTHETIC"), true);
  const candidateStore2 = createCandidateStore(storage);
  assert.equal(candidateStore2.get(sc.draftId).record.title,
    "Repair storm-damaged perimeter fence");
});

test("edit after approval flips the workflow back to needing review", async () => {
  const { stores } = setup();
  const sc = loadH1ExampleScenario(stores);
  const { assertionStore, candidateStore, handoffStore } = stores;
  const candidate = candidateStore.get(sc.draftId).record;
  const payload = buildVnnDryRunPayload({
    candidate, assertion: assertionStore.get(sc.assertionId).record,
  });
  handoffStore.save(createHandoffRecord({
    draftId: sc.draftId, candidate, payload, decision: "approved", decidedBy: "founder",
  }));
  assert.equal(workflowStatus(stores, sc.assertionId).stages[4].done, true);
  candidateStore.update(sc.draftId, { ...candidate, title: "changed" });
  const status = workflowStatus(stores, sc.assertionId);
  assert.equal(status.draftStates[0].review.state, "stale");
  assert.match(status.stages[4].detail, /fresh review/);
  assert.equal(status.stages[4].done, false);
});

test("invalid evidence references are rejected inside the scenario path", async () => {
  const { stores } = setup();
  const sc = loadH1ExampleScenario(stores);
  // Bad reference format.
  const bad = stores.evidenceStore.save(createEvidenceLink({
    targetType: "assertion", targetId: sc.assertionId,
    kind: "snapntalk_capture", reference: "not-a-cap-id",
  }));
  assert.equal(bad.ok, false);
  // Dangling target.
  const dangle = stores.evidenceStore.save(createEvidenceLink({
    targetType: "observation", targetId: "obs_does-not-exist",
    kind: "document", reference: "h1geo://doc/x",
  }));
  assert.equal(dangle.ok, false);
});

test("unsigned package shows signature questions as unanswered, ready flag drives export", async () => {
  const { stores } = setup();
  const sc = loadH1ExampleScenario(stores);
  const { assertionStore, candidateStore, handoffStore } = stores;
  const candidate = candidateStore.get(sc.draftId).record;
  const payload = buildVnnDryRunPayload({
    candidate, assertion: assertionStore.get(sc.assertionId).record,
  });
  handoffStore.save(createHandoffRecord({
    draftId: sc.draftId, candidate, payload, decision: "approved", decidedBy: "founder",
  }));
  const { package: pkg } = await createHandoffPackage({
    draftId: sc.draftId, candidateStore, assertionStore,
    evidenceStore: stores.evidenceStore, handoffStore,
  });
  const verdict = await assessTrust(pkg, null, {
    verifyPackage, stores: { assertionStore, candidateStore },
  });
  assert.equal(verdict.signatureValid, null);
  assert.equal(verdict.signerAuthorized, null);
  assert.equal(verdict.evidenceAuthenticity, "not_established");
  // Export still works unsigned — signature is optional, recorded as null.
  const exp = buildVnnIntakeExport({ pkg, requesterRef: "r" });
  assert.equal(exp.ok, true);
  assert.equal(exp.record.signature, null);
  assert.equal(exp.record.readyForIntake, true);
});

test("declined draft cannot package and the stage explains why", async () => {
  const { stores } = setup();
  const sc = loadH1ExampleScenario(stores);
  const { assertionStore, candidateStore, handoffStore } = stores;
  const candidate = candidateStore.get(sc.draftId).record;
  const payload = buildVnnDryRunPayload({
    candidate, assertion: assertionStore.get(sc.assertionId).record,
  });
  handoffStore.save(createHandoffRecord({
    draftId: sc.draftId, candidate, payload, decision: "declined", decidedBy: "founder",
  }));
  const result = await createHandoffPackage({
    draftId: sc.draftId, candidateStore, assertionStore,
    evidenceStore: stores.evidenceStore, handoffStore,
  });
  assert.equal(result.ok, false);
  const status = workflowStatus(stores, sc.assertionId);
  assert.match(status.stages[4].detail, /Declined/);
});
