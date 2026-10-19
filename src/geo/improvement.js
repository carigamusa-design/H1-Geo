/**
 * Accuracy-improvement loop (GEO-017).
 *
 * Turns stored REAL field measurements into actionable findings — only
 * when the data supports them. Simulated records never produce findings;
 * they are reported as context, not evidence.
 */

const DEFAULTS = { minSample: 5, regionSample: 3, confusionRatePct: 40,
  correctionRatePct: 50, medianInteractionMax: 6, deviceErrorMedianMax: 50 };

function finding(kind, scope, evidence, message, suggestedAction) {
  return { kind, scope, evidence, message, suggestedAction };
}

export function improvementFindings(entries, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const real = entries.filter((e) => e.record.simulated === false);
  const simulated = entries.filter((e) => e.record.simulated !== false);
  const out = {
    realCount: real.length,
    simulatedCount: simulated.length,
    insufficientData: real.length < o.minSample,
    findings: [],
  };
  if (real.length < o.minSample) {
    out.note = `${real.length} real measurement(s) — ${o.minSample} needed ` +
      "before the loop can report findings honestly.";
    return out;
  }

  const byRegion = {};
  for (const e of real) {
    const r = e.record.regionId ?? "unlabeled";
    (byRegion[r] = byRegion[r] || []).push(e);
  }
  const scopes = { all: real, ...byRegion };
  for (const [scope, list] of Object.entries(scopes)) {
    const n = list.length;
    if (scope !== "all" && n < o.regionSample) continue;

    const withVerdict = list.filter((e) => e.record.ambiguityVerdict != null);
    const confused = withVerdict.filter((e) => e.record.ambiguityVerdict === "ambiguous");
    if (withVerdict.length && (confused.length / withVerdict.length) * 100 >= o.confusionRatePct) {
      out.findings.push(finding("neighbor_confusion", scope,
        { n: withVerdict.length, ambiguous: confused.length,
          rate: Math.round((confused.length / withVerdict.length) * 1000) / 10 },
        `${scope === "all" ? "Across measurements" : `In ${scope}`}, ` +
          `${confused.length}/${withVerdict.length} assessed sites had multiple plausible candidates.`,
        "Train operators to expect neighbor picks in dense areas; consider larger pilot footprints."));
    }

    const missing = list.filter((e) =>
      e.record.ambiguityVerdict === "no_source_data" || e.record.ambiguityVerdict === "none_in_range");
    if (missing.length) {
      out.findings.push(finding("coverage_gap", scope,
        { n, missing: missing.length },
        `${missing.length} site(s) had no usable geographic coverage.`,
        "Source additional licensed data for these areas before field use."));
    }

    const corrected = list.filter((e) => e.record.correctionNeeded === true).length;
    if ((corrected / n) * 100 >= o.correctionRatePct) {
      out.findings.push(finding("correction_effort", scope,
        { n, corrected, rate: Math.round((corrected / n) * 1000) / 10 },
        `${corrected}/${n} measurements needed user correction.`,
        "Review initial-pin placement guidance; drift is pushing destinations off-target."));
    }

    const inter = list.map((e) => e.record.interactionCount).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    if (inter.length) {
      const med = inter[Math.floor((inter.length - 1) / 2)];
      if (med > o.medianInteractionMax) {
        out.findings.push(finding("interaction_effort", scope,
          { n: inter.length, medianInteractions: med },
          `Median ${med} interactions per confirmation is high.`,
          "Improve candidate presentation or nudge step size to cut correction effort."));
      }
    }

    const devErrs = list.map((e) => e.record.deviceErrorMeters).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    if (devErrs.length) {
      const med = devErrs[Math.floor((devErrs.length - 1) / 2)];
      if (med > o.deviceErrorMedianMax) {
        out.findings.push(finding("device_error", scope,
          { n: devErrs.length, medianErrorMeters: med },
          `Median device error ${med}m exceeds ${o.deviceErrorMedianMax}m.`,
          "Field conditions degrade GPS — advise open-sky readings and multiple acquisitions."));
      }
    }
  }
  if (!out.findings.length) {
    out.note = "No recurring error patterns detected in the real measurements on record.";
  }
  return out;
}
