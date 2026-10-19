/**
 * Destination assessment presentation layer (GEO-015).
 *
 * Translates ambiguity verdicts into four honest, human states. No
 * probability percentages — containment in a footprint is a lead, never
 * proof of the right property, and never ownership.
 */
import { assessAmbiguity } from "./property.js";

export const ASSESSMENT_STATES = Object.freeze([
  "likely_candidate",      // a lead exists — a person must still confirm
  "multiple_plausible",    // data cannot distinguish; the person must choose
  "insufficient_info",     // honest nothing — nothing near, or no data
  "user_confirmed",        // a confirmation record already exists
]);

const HEADLINES = {
  likely_candidate: "Likely candidate — confirmation required",
  multiple_plausible: "Multiple plausible candidates — choose or place manually",
  insufficient_info: "Insufficient geographic information",
  user_confirmed: "User-confirmed destination",
};

const DETAILS = {
  likely_candidate:
    "Source data offers a single lead (a containing outline or one nearby " +
    "candidate). It is not verified — a person must confirm before use.",
  multiple_plausible:
    "Several candidates sit within reach of this point and the data cannot " +
    "tell them apart. Pick one deliberately, or place the pin yourself.",
  insufficient_info:
    "The available geographic data cannot identify a destination here. " +
    "This is a data limit, not a guess.",
  user_confirmed:
    "A named person has already stated the intended destination. The " +
    "original measurements and any correction remain on record.",
};

/**
 * Assess a destination point into a presentable state.
 * confirmedRecord (optional) is the latest saved confirmation — if present,
 * the state is user_confirmed regardless of what the data says now.
 */
export function assessDestination({ point, candidates, accuracyMeters = null,
  deviceEstimate = null, confirmedRecord = null }) {
  if (confirmedRecord) {
    return {
      state: "user_confirmed",
      headline: HEADLINES.user_confirmed,
      detail: DETAILS.user_confirmed +
        ` Confirmed by ${confirmedRecord.record?.confirmedBy ?? confirmedRecord.confirmedBy ?? "someone"}.`,
      candidates: [],
      confirmationId: confirmedRecord.id ?? null,
    };
  }
  const amb = assessAmbiguity({ point, candidates, accuracyMeters });
  const state = {
    inside_footprint: "likely_candidate",
    single_unverified: "likely_candidate",
    ambiguous: "multiple_plausible",
    no_source_data: "insufficient_info",
    none_in_range: "insufficient_info",
  }[amb.verdict] ?? "insufficient_info";
  return {
    state,
    verdict: amb.verdict,
    headline: HEADLINES[state],
    detail: `${DETAILS[state]} ${amb.summary}`,
    candidates: amb.within,
    radiusMeters: amb.radiusMeters,
    deviceAccuracyMeters: deviceEstimate?.accuracyMeters ?? accuracyMeters ?? null,
  };
}
