/**
 * Field-validation records (GEO-015).
 *
 * A field measurement compares the DEVICE's reported position (and the
 * user's selected destination) against an INDEPENDENTLY established
 * reference destination — e.g. the person standing at the known address
 * and saying "this is the property". Every measurement says whether it is
 * simulated or a genuine permissioned observation; statistics are only
 * ever honest about which.
 */
import { distanceMeters } from "./property.js";

export const FIELD_SCHEMA_VERSION = "h1-geo/field-measurement-v0";
export const FIELD_STORE_KEY = "h1geo.stageb.fieldMeasurements.v1";

const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);
const validPoint = (p) => p && typeof p === "object" &&
  isFiniteNumber(p.latitude) && isFiniteNumber(p.longitude) &&
  p.latitude >= -90 && p.latitude <= 90 && p.longitude >= -180 && p.longitude <= 180;

/**
 * Create a field-measurement record.
 * - devicePosition: {latitude, longitude, accuracyMeters?, capturedAt?, source}
 * - referenceDestination: {latitude, longitude, source, description} — the
 *   independently established truth for this check (who/how established it).
 * - selected: {point, candidateId?} — what the user selected/confirmed.
 * - Errors are computed, not asserted: deviceErrorMeters (device→reference)
 *   and selectionErrorMeters (selection→reference).
 * - simulated MUST be true unless the operator is recording a genuine,
 *   permissioned field observation.
 */
export function createFieldMeasurement({
  devicePosition, referenceDestination, selected,
  correctBuildingIdentified = null, correctionNeeded = null,
  interactionCount = null, durationMs = null,
  confirmationId = null, regionId = null, session = null,
  ambiguityVerdict = null, candidateCount = null,
  measuredBy, simulated = true, notes = null,
  measuredAt = new Date().toISOString(),
}) {
  const deviceError = (validPoint(devicePosition) && validPoint(referenceDestination))
    ? Math.round(distanceMeters(devicePosition, referenceDestination) * 10) / 10
    : null;
  const selectionError = (validPoint(selected?.point) && validPoint(referenceDestination))
    ? Math.round(distanceMeters(selected.point, referenceDestination) * 10) / 10
    : null;
  return {
    schemaVersion: FIELD_SCHEMA_VERSION,
    devicePosition: devicePosition ? {
      latitude: devicePosition.latitude,
      longitude: devicePosition.longitude,
      accuracyMeters: devicePosition.accuracyMeters ?? null,
      capturedAt: devicePosition.capturedAt ?? null,
      source: devicePosition.source ?? "device_position",
    } : null,
    referenceDestination: {
      latitude: referenceDestination.latitude,
      longitude: referenceDestination.longitude,
      source: referenceDestination.source,
      description: referenceDestination.description ?? null,
    },
    selected: selected ? {
      point: { latitude: selected.point.latitude, longitude: selected.point.longitude },
      candidateId: selected.candidateId ?? null,
      confirmationId: selected.confirmationId ?? confirmationId ?? null,
    } : null,
    deviceErrorMeters: deviceError,
    selectionErrorMeters: selectionError,
    correctBuildingIdentified,
    correctionNeeded,
    interactionCount: isFiniteNumber(interactionCount) ? Math.round(interactionCount) : null,
    durationMs: isFiniteNumber(durationMs) ? Math.round(durationMs) : null,
    confirmationId: confirmationId ?? null,
    regionId: regionId ?? null,
    session: typeof session === "string" && session.trim() ? session.trim() : null,
    ambiguityVerdict: typeof ambiguityVerdict === "string" ? ambiguityVerdict : null,
    candidateCount: isFiniteNumber(candidateCount) ? Math.round(candidateCount) : null,
    simulated: simulated === true,
    measuredBy,
    measuredAt,
    notes: notes ?? null,
  };
}

export function validateFieldMeasurement(value) {
  const errors = [];
  const err = (field, message) => errors.push({ field, message });
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    err("record", "must be an object"); return { valid: false, errors };
  }
  if (value.schemaVersion !== FIELD_SCHEMA_VERSION) err("schemaVersion", `must be "${FIELD_SCHEMA_VERSION}"`);
  const ref = value.referenceDestination;
  if (!validPoint(ref)) {
    err("referenceDestination", "must contain a valid latitude/longitude");
  } else if (typeof ref.source !== "string" || !ref.source.trim()) {
    err("referenceDestination.source", "must state how the reference was established");
  }
  if (value.devicePosition !== null && !validPoint(value.devicePosition)) {
    err("devicePosition", "must be null or a valid point");
  }
  if (value.selected !== null && !validPoint(value.selected?.point)) {
    err("selected.point", "must be null or a valid point");
  }
  if (value.simulated !== true && value.simulated !== false) {
    err("simulated", "must be explicitly true or false — no silent real claims");
  }
  if (typeof value.measuredBy !== "string" || !value.measuredBy.trim()) err("measuredBy", "must name who measured");
  if (typeof value.measuredAt !== "string" || Number.isNaN(Date.parse(value.measuredAt))) err("measuredAt", "must be an ISO timestamp");
  if (value.correctBuildingIdentified !== null && typeof value.correctBuildingIdentified !== "boolean") {
    err("correctBuildingIdentified", "must be true/false/null");
  }
  if (value.correctionNeeded !== null && typeof value.correctionNeeded !== "boolean") {
    err("correctionNeeded", "must be true/false/null");
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Aggregate measurements into honest stats — simulated and genuine kept
 * strictly separate. Averages are reported only over present fields.
 */
export function measurementSummary(entries) {
  const stats = (list) => {
    const errs = list.map((e) => e.record.selectionErrorMeters ?? e.record.deviceErrorMeters)
      .filter((v) => v !== null);
    const correct = list.filter((e) => e.record.correctBuildingIdentified === true).length;
    const known = list.filter((e) => e.record.correctBuildingIdentified !== null).length;
    return {
      count: list.length,
      meanErrorMeters: errs.length ? Math.round(errs.reduce((a, b) => a + b, 0) / errs.length * 10) / 10 : null,
      maxErrorMeters: errs.length ? Math.max(...errs) : null,
      correctBuildingRate: known ? `${correct}/${known}` : null,
      correctionNeededCount: list.filter((e) => e.record.correctionNeeded === true).length,
    };
  };
  const simulated = entries.filter((e) => e.record.simulated);
  const real = entries.filter((e) => !e.record.simulated);
  return { simulated: stats(simulated), real: stats(real) };
}
