/**
 * H1-Geo coordinate assertion validation (contract v0).
 *
 * Implements contracts/geo-coordinate-assertion-v0.schema.json as executable
 * code. Pure and provider-neutral: no I/O, no network calls, no clock reads,
 * no coercion and no mutation of the input. Validation never fabricates
 * missing values; an absent or unknown accuracy stays absent or null.
 */

export const SCHEMA_VERSION = "h1-geo/coordinate-assertion-v0";

export const CRS = "EPSG:4326";

export const SOURCES = Object.freeze([
  "device_position",
  "manual_target_pin",
  "refined_manual",
  "sensor_observation",
  "external_reference",
]);

export const REQUIRED_FIELDS = Object.freeze([
  "schemaVersion",
  "latitude",
  "longitude",
  "crs",
  "source",
  "capturedAt",
  "accuracyMeters",
  "provenanceRef",
]);

const ALLOWED_FIELDS = new Set([...REQUIRED_FIELDS, "notes"]);

const LATITUDE_MIN = -90;
const LATITUDE_MAX = 90;
const LONGITUDE_MIN = -180;
const LONGITUDE_MAX = 180;
const NOTES_MAX_LENGTH = 500;

// RFC 3339 date-time profile required by JSON Schema "format": "date-time".
const DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

// Mirrors the contract's "pattern": "\\S" on provenanceRef.
const NON_WHITESPACE_PATTERN = /\S/;

function fail(errors, field, message) {
  errors.push({ field, message });
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateRangeNumber(errors, field, value, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(errors, field, "must be a finite number");
    return;
  }
  if (value < min || value > max) {
    fail(errors, field, `must be within [${min}, ${max}]`);
  }
}

/**
 * Validate a coordinate assertion against contract v0.
 *
 * @param {unknown} value candidate assertion; treated as read-only
 * @returns {{ valid: boolean, errors: Array<{ field: string, message: string }> }}
 */
export function validateCoordinateAssertion(value) {
  const errors = [];

  if (!isPlainObject(value)) {
    fail(errors, "", "must be an object");
    return { valid: false, errors };
  }

  for (const key of Object.keys(value)) {
    if (!ALLOWED_FIELDS.has(key)) {
      fail(errors, key, "is not an allowed property");
    }
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in value)) {
      fail(errors, field, "is required");
    }
  }

  if ("schemaVersion" in value && value.schemaVersion !== SCHEMA_VERSION) {
    fail(errors, "schemaVersion", `must equal "${SCHEMA_VERSION}"`);
  }

  if ("latitude" in value) {
    validateRangeNumber(errors, "latitude", value.latitude, LATITUDE_MIN, LATITUDE_MAX);
  }
  if ("longitude" in value) {
    validateRangeNumber(errors, "longitude", value.longitude, LONGITUDE_MIN, LONGITUDE_MAX);
  }

  if ("crs" in value && value.crs !== CRS) {
    fail(errors, "crs", `must equal "${CRS}"`);
  }

  if ("source" in value && !SOURCES.includes(value.source)) {
    fail(errors, "source", `must be one of: ${SOURCES.join(", ")}`);
  }

  if ("capturedAt" in value) {
    const capturedAt = value.capturedAt;
    if (typeof capturedAt !== "string" || !DATE_TIME_PATTERN.test(capturedAt)) {
      fail(errors, "capturedAt", "must be an RFC 3339 date-time string");
    } else if (Number.isNaN(Date.parse(capturedAt))) {
      fail(errors, "capturedAt", "must be a real calendar date and time");
    }
  }

  if ("accuracyMeters" in value) {
    const accuracy = value.accuracyMeters;
    if (accuracy !== null) {
      if (typeof accuracy !== "number" || !Number.isFinite(accuracy)) {
        fail(errors, "accuracyMeters", "must be a finite number or null");
      } else if (accuracy < 0) {
        fail(errors, "accuracyMeters", "must be >= 0");
      }
    }
  }

  if ("provenanceRef" in value) {
    const ref = value.provenanceRef;
    if (typeof ref !== "string" || ref.length < 1 || !NON_WHITESPACE_PATTERN.test(ref)) {
      fail(errors, "provenanceRef", "must be a non-empty, non-whitespace string");
    }
  }

  if ("notes" in value) {
    const notes = value.notes;
    if (typeof notes !== "string") {
      fail(errors, "notes", "must be a string");
    } else if ([...notes].length > NOTES_MAX_LENGTH) {
      fail(errors, "notes", `must be at most ${NOTES_MAX_LENGTH} characters`);
    }
  }

  return { valid: errors.length === 0, errors };
}
