/**
 * Property-level destination confirmation (GEO-013).
 *
 * A saved coordinate assertion records WHERE a point is. A destination
 * confirmation records WHERE THE USER SAYS the intended destination is —
 * possibly different (device GPS drift), and never more than a claim about
 * intent. It preserves the original device estimate as untouched evidence
 * and reports ambiguity honestly: several candidate properties near the
 * point means "ambiguous", no candidate data means "unverified", and no
 * combination of GPS, geocoding, or a user pin ever establishes ownership,
 * a legal parcel boundary, or a verified address.
 */

export const CONFIRM_SCHEMA_VERSION = "h1-geo/destination-confirmation-v0";
export const CONFIRM_STORE_KEY = "h1geo.stageb.confirmations.v1";

export const AMBIGUITY_VERDICTS = Object.freeze([
  "no_source_data",     // no candidate dataset supplied at all
  "none_in_range",      // data exists, nothing near the point
  "single_unverified",  // exactly one candidate — a lead, not a verification
  "inside_footprint",   // point lies inside exactly one mapped building outline (footprint, not parcel)
  "ambiguous",          // several candidates — cannot be distinguished
]);

// Confidence levels are deliberately capped: "verified" is NOT reachable
// here — that requires an independent authority (e.g. a site record with
// verifiedBy), which is a different record by design.
export const CONFIDENCE_LEVELS = Object.freeze(["unverified", "low", "moderate"]);

export const NOT_OWNERSHIP_NOTICE =
  "A confirmed destination is a user-stated intent point, not a legal " +
  "parcel boundary, verified address, or proof of ownership.";

const EARTH_RADIUS_M = 6371008.8; // IUGG mean radius
const DEFAULT_AMBIGUITY_RADIUS_M = 15;
const GOOD_DEVICE_ACCURACY_M = 30;

const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);

export function distanceMeters(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s));
}

/** Ray-cast point-in-ring test. ring: [[lat,lng],...] (closed or open). */
export function pointInRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if ((yi > lat) !== (yj > lat) &&
        lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Candidates within radius of a point, sorted by distance.
 * Candidates: [{latitude, longitude, label?, kind?, source?, fixture?}].
 */
export function nearbyCandidates({ point, candidates = [], radiusMeters }) {
  return candidates
    .map((c) => ({ ...c, distanceMeters: distanceMeters(point, c) }))
    .filter((c) => c.distanceMeters <= radiusMeters)
    .sort((x, y) => x.distanceMeters - y.distanceMeters);
}

/**
 * Can the available candidate data distinguish a destination?
 * Absence of candidates is reported as "no_source_data" / "none_in_range"
 * — never silently treated as a match.
 */
export function assessAmbiguity({ point, candidates, accuracyMeters = null, radiusMeters = null }) {
  const radius = radiusMeters ??
    Math.max(DEFAULT_AMBIGUITY_RADIUS_M, isFiniteNumber(accuracyMeters) ? accuracyMeters : 0);
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { verdict: "no_source_data", radiusMeters: radius, within: [],
      summary: "No property-level source data available for this point — nothing to corroborate or distinguish." };
  }
  const within = nearbyCandidates({ point, candidates, radiusMeters: radius });
  // A point inside a footprint outline is "within" regardless of how far
  // the building's centroid is (large buildings have far centroids).
  const inside = candidates.filter((c) =>
    Array.isArray(c.polygon) && c.polygon.length >= 3 &&
    pointInRing(point.latitude, point.longitude, c.polygon));
  const insideIds = new Set(inside.map((c) => c.id));
  const merged = [
    ...inside.map((c) => ({ ...c, distanceMeters: distanceMeters(point, c), inside: true })),
    ...within.filter((c) => !insideIds.has(c.id)).map((c) => ({ ...c, inside: false })),
  // containing footprints lead — the point being inside an outline is
  // stronger evidence than a nearby centroid
  ].sort((x, y) => (Number(y.inside) - Number(x.inside)) || (x.distanceMeters - y.distanceMeters));
  if (inside.length === 1) {
    const neighbors = merged.length - 1;
    return { verdict: "inside_footprint", radiusMeters: radius, within: merged,
      summary: `The point lies inside one mapped building outline (${inside[0].label ?? "unnamed"})` +
        (neighbors ? ` — with ${neighbors} other candidate(s) nearby, so the outline itself is the only discriminator. ` : " — ") +
        "A footprint is not a parcel boundary or a verified address; unverified lead." };
  }
  if (merged.length > 1) {
    const note = inside.length > 1 ? "overlapping mapped outlines" : "candidate properties";
    return { verdict: "ambiguous", radiusMeters: radius, within: merged,
      summary: `${merged.length} ${note} sit within ${Math.round(radius)}m — the destination cannot be distinguished automatically. A user must pick, or record the intent as approximate.` };
  }
  if (merged.length === 1) {
    return { verdict: "single_unverified", radiusMeters: radius, within: merged,
      summary: `One candidate (${merged[0].label ?? "unnamed"}) lies within ${Math.round(radius)}m — a lead only; the source data is not an authority.` };
  }
  return { verdict: "none_in_range", radiusMeters: radius, within,
    summary: `Source data exists but no candidate lies within ${Math.round(radius)}m — the nearest property data cannot identify this destination.` };
}

function confidenceFor({ ambiguity, deviceEstimate, source }) {
  const basis = [];
  if (ambiguity.verdict === "ambiguous") {
    basis.push("multiple candidate properties in range");
    return { level: "low", basis };
  }
  if (ambiguity.verdict === "inside_footprint") {
    basis.push("point inside one mapped building outline — not a parcel or verified address");
    return { level: "moderate", basis };
  }
  if (ambiguity.verdict === "single_unverified") {
    basis.push("one candidate property in range (unverified source)");
  } else {
    basis.push(ambiguity.verdict === "no_source_data"
      ? "no property-level source data" : "no candidate property in range");
  }
  const deviceAccurate = deviceEstimate &&
    isFiniteNumber(deviceEstimate.accuracyMeters) &&
    deviceEstimate.accuracyMeters <= GOOD_DEVICE_ACCURACY_M;
  if (ambiguity.verdict === "single_unverified" && (deviceAccurate || source === "manual_adjustment")) {
    basis.push(deviceAccurate
      ? `device accuracy ±${Math.round(deviceEstimate.accuracyMeters)}m corroborates`
      : "user placed the destination manually");
    return { level: "moderate", basis };
  }
  return { level: "unverified", basis };
}

/**
 * Build a destination-confirmation record. deviceEstimate is the untouched
 * original positioning evidence (typically the saved assertion's own fix);
 * confirmedPoint is where the user says the destination actually is.
 */
export function createDestinationConfirmation({
  assertionId, deviceEstimate = null, confirmedPoint,
  candidates = null, accuracyMeters = null, confirmedBy,
  source = "manual_adjustment", notes = null, confirmedAt = new Date().toISOString(),
  selectedCandidate = null, interactionCount = null, durationMs = null,
}) {
  const moved = deviceEstimate
    ? distanceMeters(
        { latitude: deviceEstimate.latitude, longitude: deviceEstimate.longitude },
        confirmedPoint)
    : null;
  const ambiguity = assessAmbiguity({
    point: confirmedPoint, candidates,
    accuracyMeters: isFiniteNumber(accuracyMeters)
      ? accuracyMeters : deviceEstimate?.accuracyMeters ?? null,
  });
  return {
    schemaVersion: CONFIRM_SCHEMA_VERSION,
    assertionId,
    deviceEstimate: deviceEstimate ? {
      latitude: deviceEstimate.latitude,
      longitude: deviceEstimate.longitude,
      accuracyMeters: deviceEstimate.accuracyMeters ?? null,
      capturedAt: deviceEstimate.capturedAt ?? null,
      source: deviceEstimate.source ?? null,
    } : null,
    confirmedPoint: {
      latitude: confirmedPoint.latitude,
      longitude: confirmedPoint.longitude,
    },
    correctionApplied: {
      moved: moved !== null && moved > 0.5,
      movedMeters: moved === null ? null : Math.round(moved * 10) / 10,
      originalPreserved: true,
      basis: "user_confirmed",
    },
    ambiguity: {
      verdict: ambiguity.verdict,
      radiusMeters: Math.round(ambiguity.radiusMeters * 10) / 10,
      candidates: ambiguity.within.map((c) => ({
        id: c.id ?? null, label: c.label ?? null, kind: c.kind ?? null,
        distanceMeters: Math.round(c.distanceMeters * 10) / 10,
        inside: Boolean(c.inside),
        fixture: Boolean(c.fixture),
        sourceProvider: c.source?.provider ?? (c.fixture ? "synthetic fixture" : null),
      })),
      summary: ambiguity.summary,
    },
    selectedCandidate: selectedCandidate ? {
      id: selectedCandidate.id ?? null,
      label: selectedCandidate.label ?? null,
      kind: selectedCandidate.kind ?? null,
      sourceProvider: selectedCandidate.source?.provider ??
        selectedCandidate.sourceProvider ?? null,
    } : null,
    interactionCount: isFiniteNumber(interactionCount) ? Math.round(interactionCount) : null,
    durationMs: isFiniteNumber(durationMs) ? Math.round(durationMs) : null,
    source,
    confidence: confidenceFor({ ambiguity, deviceEstimate, source }),
    confirmedBy,
    confirmedAt,
    notes: notes ?? null,
    disclaimer: NOT_OWNERSHIP_NOTICE,
  };
}

export function validateDestinationConfirmation(value) {
  const errors = [];
  const err = (field, message) => errors.push({ field, message });
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    err("record", "must be an object"); return { valid: false, errors };
  }
  if (value.schemaVersion !== CONFIRM_SCHEMA_VERSION) err("schemaVersion", `must be "${CONFIRM_SCHEMA_VERSION}"`);
  if (typeof value.assertionId !== "string" || !value.assertionId.trim()) err("assertionId", "must be a non-empty string");
  const pt = value.confirmedPoint;
  if (!pt || typeof pt !== "object" || !isFiniteNumber(pt.latitude) || !isFiniteNumber(pt.longitude)) {
    err("confirmedPoint", "must contain numeric latitude and longitude");
  } else {
    if (pt.latitude < -90 || pt.latitude > 90) err("confirmedPoint.latitude", "must be within [-90, 90] — check axis order");
    if (pt.longitude < -180 || pt.longitude > 180) err("confirmedPoint.longitude", "must be within [-180, 180] — check axis order");
  }
  if (value.deviceEstimate !== null && (typeof value.deviceEstimate !== "object" ||
      !isFiniteNumber(value.deviceEstimate?.latitude) || !isFiniteNumber(value.deviceEstimate?.longitude))) {
    err("deviceEstimate", "must be null or a point snapshot");
  }
  if (typeof value.correctionApplied !== "object" || value.correctionApplied === null ||
      value.correctionApplied.originalPreserved !== true) {
    err("correctionApplied.originalPreserved", "must be true — the original estimate is evidence and is never discarded");
  }
  if (!AMBIGUITY_VERDICTS.includes(value.ambiguity?.verdict)) err("ambiguity.verdict", "must be a known verdict");
  if (value.selectedCandidate !== null && value.selectedCandidate !== undefined &&
      (typeof value.selectedCandidate !== "object" ||
       (value.selectedCandidate.id === null && value.selectedCandidate.label === null))) {
    err("selectedCandidate", "must be null or a candidate reference");
  }
  if (!CONFIDENCE_LEVELS.includes(value.confidence?.level)) err("confidence.level", "must be unverified | low | moderate — never 'verified'");
  if (typeof value.confirmedBy !== "string" || !value.confirmedBy.trim()) err("confirmedBy", "must name who confirmed");
  if (typeof value.confirmedAt !== "string" || Number.isNaN(Date.parse(value.confirmedAt))) err("confirmedAt", "must be an ISO timestamp");
  return { valid: errors.length === 0, errors };
}

/** Latest saved confirmation for an assertion, or null. */
export function destinationConfirmedFor(confirmStore, assertionId) {
  const all = confirmStore
    .list()
    .filter((e) => e.record.assertionId === assertionId)
    .sort((a, b) => String(b.record.confirmedAt).localeCompare(String(a.record.confirmedAt)));
  return all.length ? all[0] : null;
}
