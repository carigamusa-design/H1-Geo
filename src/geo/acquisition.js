/**
 * Bounded GPS acquisition (GEO-017).
 *
 * Collects several permissioned readings and reports what was observed —
 * per-reading accuracy, spread, stability. It NEVER averages readings into
 * a synthesized fix: the user picks a real reading, or takes none.
 */
import { distanceMeters } from "./property.js";

export const ACCURACY_BANDS = Object.freeze({ good: 10, fair: 30 });

export const STABILITY_MAX_SPREAD_M = 10;

export function classifyReading({ accuracyMeters } = {}) {
  if (typeof accuracyMeters !== "number" || !Number.isFinite(accuracyMeters)) return "unknown";
  if (accuracyMeters <= ACCURACY_BANDS.good) return "good";
  if (accuracyMeters <= ACCURACY_BANDS.fair) return "fair";
  return "poor";
}

/** Max pairwise distance between usable reading positions. */
export function readingSpreadMeters(readings) {
  const pts = readings.filter((r) =>
    Number.isFinite(r.latitude) && Number.isFinite(r.longitude));
  let max = 0;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    max = Math.max(max, distanceMeters(pts[i], pts[j]));
  }
  return Math.round(max * 10) / 10;
}

/**
 * Summarize a collected set. `best` is the single lowest-accuracy-number
 * REAL reading — a chosen reading, never a computed blend.
 */
export function summarizeReadings(readings) {
  const usable = readings.filter((r) => Number.isFinite(r.accuracyMeters));
  const accuracies = usable.map((r) => r.accuracyMeters).sort((a, b) => a - b);
  const best = usable.length
    ? usable.reduce((a, b) => (b.accuracyMeters < a.accuracyMeters ? b : a))
    : null;
  const spread = readingSpreadMeters(readings);
  const stability = readings.length < 2 ? "insufficient_readings"
    : spread <= STABILITY_MAX_SPREAD_M ? "stable" : "unstable";
  const median = accuracies.length
    ? accuracies[Math.floor((accuracies.length - 1) / 2)]
    : null;
  return {
    count: readings.length,
    usableCount: usable.length,
    best,
    medianAccuracy: median,
    spreadMeters: spread,
    stability,
    detail: readings.length < 2
      ? "not enough readings to judge stability"
      : `readings agree within ${spread}m` + (stability === "stable" ? " — stable" : " — unstable; pick deliberately or re-read"),
  };
}

/**
 * Collect up to `attempts` readings via an injected position getter.
 * getPosition: () => Promise<{latitude, longitude, accuracyMeters}> —
 * rejects for denied/unavailable/timeout. Each attempt is recorded,
 * success or failure; no attempt is retried silently past `attempts`.
 */
export async function collectReadings({ getPosition, attempts = 5, delayMs = 0 }) {
  const readings = [];
  const errors = [];
  for (let i = 0; i < attempts; i++) {
    try {
      const p = await getPosition();
      readings.push({
        latitude: p.latitude,
        longitude: p.longitude,
        accuracyMeters: typeof p.accuracyMeters === "number" ? p.accuracyMeters : null,
        capturedAt: new Date().toISOString(),
        band: classifyReading(p),
      });
    } catch (e) {
      errors.push({
        attempt: i + 1,
        code: e?.code ?? null,
        message: e?.message ?? String(e),
      });
    }
    if (delayMs > 0 && i < attempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return { readings, errors, summary: summarizeReadings(readings) };
}
