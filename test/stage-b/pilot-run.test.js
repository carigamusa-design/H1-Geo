import test from "node:test";
import assert from "node:assert/strict";
import { pilotRunSteps, pilotNextStep, PILOT_STEPS } from "../../src/stage-b/pilot-run.js";

test("fresh state: nothing done, step 1 is next, anchors target real sections", () => {
  const steps = pilotRunSteps();
  assert.equal(steps.length, PILOT_STEPS.length);
  assert.ok(steps.every((s) => !s.done));
  assert.equal(pilotNextStep(steps), 0);
  const ids = steps.map((s) => s.anchor);
  assert.deepEqual([...new Set(ids)],
    ["fs-locate", "fs-dest", "fs-observe", "fs-draft", "fs-handoff"]);
});

test("progression: each saved record advances exactly its own step", () => {
  const after = (over) => pilotRunSteps({
    assertionCount: 0, confirmationCount: 0, observationCount: 0,
    draftStates: [], ...over });
  assert.equal(pilotNextStep(after({ assertionCount: 1 })), 1);
  assert.equal(pilotNextStep(after({ assertionCount: 1, confirmationCount: 1 })), 2);
  assert.equal(pilotNextStep(after({ assertionCount: 1, confirmationCount: 1, observationCount: 1 })), 3);
});

test("draft → approval → package progression mirrors review state", () => {
  const base = { assertionCount: 1, confirmationCount: 1, observationCount: 1 };
  const unreviewed = pilotRunSteps({ ...base,
    draftStates: [{ review: { state: "unreviewed" }, packages: [] }] });
  assert.equal(pilotNextStep(unreviewed), 4); // draft exists, needs approval
  const stale = pilotRunSteps({ ...base,
    draftStates: [{ review: { state: "stale" }, packages: [] }] });
  assert.equal(pilotNextStep(stale), 4); // stale still needs a fresh review
  const approved = pilotRunSteps({ ...base,
    draftStates: [{ review: { state: "approved" }, packages: [] }] });
  assert.equal(pilotNextStep(approved), 5);
  const packaged = pilotRunSteps({ ...base,
    draftStates: [{ review: { state: "approved" }, packages: [{}] }] });
  assert.equal(pilotNextStep(packaged), -1); // complete
});

test("done flags reflect stores only — no step can be skipped by order", () => {
  const s = pilotRunSteps({ draftStates: [{ review: { state: "approved" }, packages: [{}] }] });
  assert.equal(pilotNextStep(s), 0); // approved package, but no location — still step 1
});
