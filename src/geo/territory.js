/**
 * GEO-012 (international) — country-aware geographic validation over the
 * vendored Natural Earth 1:110m territory dataset.
 *
 * Honesty boundaries:
 * - 1:110m data supports COUNTRY-level checks only. It cannot resolve
 *   streets, parcels, or near-border ambiguity (~km scale).
 * - A point inside a polygon means "within that territory at 110m
 *   resolution" — it never establishes address, ownership, jurisdiction
 *   facts, or parcel boundaries.
 * - No polygon hit → "unresolved", never a guess.
 */

export const DATASET_SCHEMA_VERSION = "h1-geo/territory-dataset-v0";
export const DATASET_UNCERTAINTY_METERS = 111; // ~0.001° at the equator after 3dp rounding

/** Point-in-polygon (even-odd ray cast; rings[0] is the outer ring). */
function pointInPolygon(lng, lat, rings) {
  let inside = false;
  // Outer ring.
  if (!rayCast(lng, lat, rings[0])) return false;
  inside = true;
  // Holes subtract.
  for (let h = 1; h < rings.length; h++) {
    if (rayCast(lng, lat, rings[h])) return false;
  }
  return inside;
}

function rayCast(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Validate a territory dataset document. Returns { valid, errors }.
 */
export function validateTerritoryDataset(doc) {
  const errors = [];
  const fail = (field, message) => errors.push({ field, message });
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    fail("", "must be an object");
    return { valid: false, errors };
  }
  if (doc.schemaVersion !== DATASET_SCHEMA_VERSION) {
    fail("schemaVersion", `must equal "${DATASET_SCHEMA_VERSION}"`);
  }
  if (typeof doc.source !== "string" || !doc.source) fail("source", "missing dataset provenance");
  if (typeof doc.resolution !== "string" || !doc.resolution) fail("resolution", "missing");
  if (!Array.isArray(doc.features)) {
    fail("features", "must be an array");
    return { valid: false, errors };
  }
  for (const [i, f] of doc.features.entries()) {
    if (typeof f !== "object" || f === null || typeof f.iso !== "string" || !f.iso) {
      fail(`features[${i}].iso`, "missing");
      continue;
    }
    const g = f.geometry;
    if (typeof g !== "object" || g === null || !Array.isArray(g.coordinates)) {
      fail(`features[${i}].geometry`, "missing coordinates");
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Look up which territory contains (latitude, longitude). Returns the
 * feature descriptor {iso, name, admin} plus dataset provenance, or null
 * when no feature contains the point — "unresolved", not a guess.
 */
export function lookupTerritory(latitude, longitude, dataset) {
  const check = validateTerritoryDataset(dataset);
  if (!check.valid) return { ok: false, errors: check.errors };
  for (const f of dataset.features) {
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const poly of polys) {
      if (pointInPolygon(longitude, latitude, poly)) {
        return {
          ok: true, found: true,
          iso: f.iso, name: f.name, admin: f.admin,
          source: dataset.source, resolution: dataset.resolution,
          uncertaintyMeters: DATASET_UNCERTAINTY_METERS,
        };
      }
    }
  }
  return {
    ok: true, found: false,
    source: dataset.source, resolution: dataset.resolution,
    uncertaintyMeters: DATASET_UNCERTAINTY_METERS,
  };
}

/**
 * Statuses a resolved location can carry — distinct, never conflated.
 *   manually_selected       — a person/device picked the point
 *   geocoded                — the point came from an external reference
 *   independently_verified  — a second source confirmed it
 *   unresolved              — data couldn't resolve it; NOT a guess
 */
export const LOCATION_STATUSES = Object.freeze([
  "manually_selected", "geocoded", "independently_verified", "unresolved",
]);

/**
 * Derive the status of a saved assertion + optional territory lookup.
 * verifiedBy is an optional explicit second-source confirmation —
 * it must be provided, never inferred.
 */
export function locationStatus({ assertion, territoryResult = null, verifiedBy = null }) {
  if (!assertion) return { status: "unresolved", detail: "no assertion" };
  if (verifiedBy && typeof verifiedBy === "string" && /\S/.test(verifiedBy)) {
    return { status: "independently_verified", detail: `confirmed by ${verifiedBy}` };
  }
  if (territoryResult && territoryResult.ok && !territoryResult.found) {
    return { status: "unresolved", detail: "point falls outside every dataset territory (ocean, gap, or data limit)" };
  }
  if (assertion.source === "external_reference") {
    return { status: "geocoded", detail: "position came from an external reference" };
  }
  return { status: "manually_selected", detail: `source ${assertion.source}` };
}

/**
 * Compare the point's territory against a declared country.
 * Returns { status: "match"|"mismatch"|"unverified"|"undeclared" } —
 * "unverified" when data can't resolve the point; never a silent guess.
 */
export function checkCountryMatch({ latitude, longitude, declaredIso, dataset }) {
  if (!declaredIso) {
    return { status: "undeclared", detail: "no country declared — nothing to check against" };
  }
  const result = lookupTerritory(latitude, longitude, dataset);
  if (!result.ok) return { status: "unverified", errors: result.errors, detail: "dataset invalid" };
  if (!result.found) {
    return { status: "unverified", detail: `no territory polygon contains the point — cannot confirm "${declaredIso}"`, territory: null };
  }
  return result.iso === declaredIso
    ? { status: "match", territory: result, declaredIso, detail: `inside ${result.name} (110m resolution)` }
    : { status: "mismatch", territory: result, declaredIso, detail: `declared ${declaredIso} but the point is inside ${result.name}` };
}

/**
 * The four location kinds are separate concepts — a point never becomes
 * an address, a building, or a parcel without explicit separate data.
 */
export const LOCATION_KINDS = Object.freeze(["point", "postal_address", "building", "legal_parcel"]);
