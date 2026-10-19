/**
 * Launch accuracy dashboard (GEO-016).
 *
 * Computes evidence from STORED field measurements only — never from
 * fixtures or synthetic scenario data. Simulated and genuine measurements
 * are reported as separate columns forever; when a sample is too small to
 * mean anything the result says "insufficient evidence" rather than a
 * confident-looking number.
 */

export const DASHBOARD_EXPORT_VERSION = "h1-geo/field-export-v0";
export const DEFAULT_MIN_SAMPLE = 5;

const finite = (v) => typeof v === "number" && Number.isFinite(v);
const sorted = (arr) => [...arr].sort((a, b) => a - b);

/** Nearest-rank percentile on a sorted array. */
export function percentile(sortedArr, p) {
  if (!sortedArr.length) return null;
  const idx = Math.min(sortedArr.length - 1, Math.max(0, Math.ceil((p / 100) * sortedArr.length) - 1));
  return Math.round(sortedArr[idx] * 10) / 10;
}

const median = (arr) => {
  const s = sorted(arr.filter(finite));
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  const v = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return Math.round(v * 10) / 10;
};

function groupCounts(list, key) {
  const out = {};
  for (const e of list) {
    const v = key(e) ?? "unlabeled";
    out[v] = (out[v] || 0) + 1;
  }
  return out;
}

function statsFor(list, minSample) {
  const selErrs = list.map((e) => e.record.selectionErrorMeters).filter(finite);
  const devErrs = list.map((e) => e.record.deviceErrorMeters).filter(finite);
  const known = list.filter((e) => e.record.correctBuildingIdentified !== null);
  const correct = list.filter((e) => e.record.correctBuildingIdentified === true);
  const corrected = list.filter((e) => e.record.correctionNeeded === true);
  const withVerdict = list.filter((e) => e.record.ambiguityVerdict != null);
  const confused = withVerdict.filter((e) => e.record.ambiguityVerdict === "ambiguous");
  const durations = list.map((e) => e.record.durationMs).filter(finite);
  const interactions = list.map((e) => e.record.interactionCount).filter(finite);
  const missingCoverage = list.filter((e) =>
    e.record.ambiguityVerdict === "no_source_data" || e.record.ambiguityVerdict === "none_in_range").length;
  const unresolved = list.filter((e) => e.record.selected === null).length;
  return {
    count: list.length,
    sufficient: list.length >= minSample,
    byRegion: groupCounts(list, (e) => e.record.regionId),
    byReferenceSource: groupCounts(list, (e) => e.record.referenceDestination?.source),
    bySession: groupCounts(list, (e) => e.record.session),
    selectionError: {
      median: median(selErrs),
      p95: percentile(sorted(selErrs), 95),
      n: selErrs.length,
    },
    deviceError: {
      median: median(devErrs),
      p95: percentile(sorted(devErrs), 95),
      n: devErrs.length,
    },
    correctBuilding: {
      correct: correct.length,
      independentlyVerified: known.length,
      rate: known.length ? Math.round((correct.length / known.length) * 1000) / 10 : null,
    },
    neighborConfusion: {
      ambiguous: confused.length,
      assessed: withVerdict.length,
      rate: withVerdict.length ? Math.round((confused.length / withVerdict.length) * 1000) / 10 : null,
    },
    correctionRate: {
      corrected: corrected.length,
      of: list.length,
      rate: list.length ? Math.round((corrected.length / list.length) * 1000) / 10 : null,
    },
    medianDurationMs: median(durations),
    medianInteractions: median(interactions),
    missingCoverage,
    unresolved,
  };
}

/**
 * Dashboard over store entries ([{id, record}]). real = simulated===false;
 * everything else is simulated — no record can blur the line.
 */
export function fieldDashboard(entries, { minSample = DEFAULT_MIN_SAMPLE,
  now = new Date().toISOString() } = {}) {
  const real = entries.filter((e) => e.record.simulated === false);
  const simulated = entries.filter((e) => e.record.simulated !== false);
  return {
    generatedAt: now,
    minSample,
    total: entries.length,
    real: statsFor(real, minSample),
    simulated: statsFor(simulated, minSample),
    insufficientEvidence: real.length < minSample,
    caveat: real.length < minSample
      ? `Insufficient evidence: ${real.length} genuine field measurement(s); ` +
        `${minSample} needed before launch-grade accuracy statements. ` +
        "A local software demonstration is not a completed field trial."
      : null,
  };
}

/** Exportable trial document — local JSON only, never uploaded anywhere. */
export function exportFieldMeasurements(entries, { now = new Date().toISOString() } = {}) {
  return {
    schemaVersion: DASHBOARD_EXPORT_VERSION,
    exportedAt: now,
    note: "Contains precise geographic coordinates — handle as location " +
      "data with permission. Exported for local trial analysis only.",
    dashboard: fieldDashboard(entries, { now }),
    measurements: entries.map((e) => ({ id: e.id, record: e.record })),
  };
}

export function validateFieldExport(doc) {
  const errors = [];
  const err = (f, m) => errors.push({ field: f, message: m });
  if (!doc || typeof doc !== "object") { err("document", "must be an object"); return { valid: false, errors }; }
  if (doc.schemaVersion !== DASHBOARD_EXPORT_VERSION) err("schemaVersion", `must be "${DASHBOARD_EXPORT_VERSION}"`);
  if (!Array.isArray(doc.measurements)) err("measurements", "must be an array");
  if (!doc.dashboard || typeof doc.dashboard !== "object") err("dashboard", "missing summary block");
  return { valid: errors.length === 0, errors };
}
