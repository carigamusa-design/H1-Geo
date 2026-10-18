/**
 * GEO-012 (international) — site descriptors keep the four location
 * concepts separate:
 *
 *   point_location  — a coordinate assertion (what H1-Geo stores)
 *   postal_address  — a postal/mailing address (a different thing)
 *   building        — a structure reference
 *   legal_parcel    — a cadastral/legal parcel reference
 *
 * A descriptor may REFERENCE an assertion or a country check result, but
 * a point never auto-produces an address/parcel — each kind carries its
 * own required fields and provenance, and `derived: false` unless the
 * person explicitly marks it derived-from the point (still not verified).
 */

import { LOCATION_KINDS } from "./territory.js";

export const SITE_SCHEMA_VERSION = "h1-geo/site-descriptor-v0";
export const SITE_STORE_KEY = "h1geo.stageb.sites.v1";

const REQUIRED = {
  point: [],                                  // the assertion IS the point
  postal_address: ["addressLine", "locality", "countryCode"],
  building: ["buildingRef"],
  legal_parcel: ["parcelRef"],
};

function fail(errors, field, message) {
  errors.push({ field, message });
}

export function createSiteDescriptor({ kind, assertionId = null, fields = {},
  declaredCountryCode = null, source = "manual", capturedAt = new Date().toISOString() }) {
  return {
    schemaVersion: SITE_SCHEMA_VERSION,
    kind, assertionId, fields, declaredCountryCode, source, capturedAt,
  };
}

export function validateSiteDescriptor(value) {
  const errors = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(errors, "", "must be an object");
    return { valid: false, errors };
  }
  if (value.schemaVersion !== SITE_SCHEMA_VERSION) {
    fail(errors, "schemaVersion", `must equal "${SITE_SCHEMA_VERSION}"`);
  }
  if (!LOCATION_KINDS.includes(value.kind)) {
    fail(errors, "kind", `must be ${LOCATION_KINDS.join("|")}`);
  }
  if (value.assertionId !== null && (typeof value.assertionId !== "string" || !value.assertionId)) {
    fail(errors, "assertionId", "must be null or a non-empty string");
  }
  if (typeof value.fields !== "object" || value.fields === null || Array.isArray(value.fields)) {
    fail(errors, "fields", "must be an object");
  } else if (LOCATION_KINDS.includes(value.kind)) {
    for (const f of REQUIRED[value.kind]) {
      const v = value.fields[f];
      if (typeof v !== "string" || !/\S/.test(v)) {
        fail(errors, `fields.${f}`, `required for kind "${value.kind}"`);
      }
    }
    if (value.kind === "postal_address") {
      for (const [f, max] of [["addressLine", 200], ["locality", 100], ["region", 100],
        ["countryCode", 8], ["postalCode", 20]]) {
        const v = value.fields[f];
        if (v !== undefined && v !== null && (typeof v !== "string" || v.length > max)) {
          fail(errors, `fields.${f}`, `must be a string of at most ${max} chars`);
        }
      }
    }
  }
  if (value.declaredCountryCode !== null &&
      (typeof value.declaredCountryCode !== "string" || !/^[A-Z]{2}$/.test(value.declaredCountryCode))) {
    fail(errors, "declaredCountryCode", "must be a 2-letter ISO code or null");
  }
  if (typeof value.source !== "string" || !/\S/.test(value.source)) {
    fail(errors, "source", "required — where the descriptor came from");
  }
  if (typeof value.capturedAt !== "string" || Number.isNaN(Date.parse(value.capturedAt))) {
    fail(errors, "capturedAt", "must be a date-time string");
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Explain a mismatch honestly, and what can be corrected — never rewrite
 * either side silently.
 */
export function explainDiscrepancy(match) {
  if (match.status === "match") {
    return `Consistent: the point is inside ${match.territory.name} at 110m resolution.`;
  }
  if (match.status === "mismatch") {
    return `Discrepancy: declared ${match.declaredIso || "?"} but the point resolves to ${match.territory.name}. ` +
      `Correct the declared country or move the pin — the original evidence stays untouched either way.`;
  }
  if (match.status === "unverified") {
    return `Unverified: boundary data can't resolve this point — check the declared country by hand; nothing was guessed.`;
  }
  return `No declared country to compare against.`;
}
