/**
 * GEO-018/019: the "Pilot run" checklist — pure step model so mobile
 * workflow continuity is testable without a DOM. Each step's `done`
 * flag is computed from real saved state passed in, never from clicks.
 */
export const PILOT_STEPS = [
  { text: "Save a location (device or manual pin)", anchor: "fs-locate" },
  { text: "Confirm the intended destination (3b)", anchor: "fs-dest" },
  { text: "Record an observation and link evidence", anchor: "fs-observe" },
  { text: "Create the opportunity draft", anchor: "fs-draft" },
  { text: "Named reviewer approves the draft", anchor: "fs-draft" },
  { text: "Review the handoff package (still local — no VNN)", anchor: "fs-handoff" },
];

/**
 * pilotRunSteps(state) → [{...step, done}]
 * state: { assertionCount, confirmationCount, observationCount, draftStates }
 * where draftStates is workflowStatus().draftStates ([] allowed).
 */
export function pilotRunSteps({
  assertionCount = 0, confirmationCount = 0, observationCount = 0,
  draftStates = [],
} = {}) {
  const done = [
    assertionCount > 0,
    confirmationCount > 0,
    observationCount > 0,
    draftStates.length > 0,
    draftStates.some((d) => d.review.state === "approved"),
    draftStates.some((d) => d.packages.length > 0),
  ];
  return PILOT_STEPS.map((s, i) => ({ ...s, done: done[i] }));
}

/** First incomplete step index, or -1 when the loop is complete. */
export function pilotNextStep(steps) {
  return steps.findIndex((s) => !s.done);
}
