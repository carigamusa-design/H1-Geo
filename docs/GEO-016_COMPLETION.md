# GEO-016 — Field Accuracy Trial and Launch Evidence

Status: complete for review (uncommitted). GEO-015 committed+pushed as
`cb1665a` (verified 144/144 first).

## A. Field-trial experience

Section 3c is now a complete guided flow:

1. **"Capture device position for this measurement"** — a fresh
   `navigator.geolocation` fix (high accuracy, 15 s timeout) with its
   reported ± accuracy, drawn on the map; denial surfaces the existing
   honest `describeGeolocationError` text and saves `devicePosition: null`
   rather than fabricating a fix.
2. Candidates/destination work in 3b is unchanged (Use / drag / nudge).
3. Reference destination entry requires coordinates **and** a free-text
   `source` stating how it was independently established — the UI text
   states plainly that your own pin or selection is not ground truth.
4. Optional `session` label groups measurements ("Trial A — Summerhill").
5. Save keeps the GEO-015 `simulated`-default; genuine observations need
   the explicit checkbox. Saved record now also carries `regionId`
   (auto-detected from the pilot bboxes), `session`, `ambiguityVerdict`,
   and `candidateCount`.

## B. Accuracy dashboard

`src/geo/dashboard.js` — `fieldDashboard()` over stored measurements only:

- sample counts by **region**, **reference source**, and **session**;
- median and **p95** (nearest-rank) for selection error and device error;
- correct-building rate **only over independently-verified records**
  (`correctBuildingIdentified !== null`), shown as `correct/verified`;
- neighboring-property confusion rate (records whose stored verdict was
  `ambiguous`);
- correction rate; median duration (s) and median interactions;
- missing-coverage (`no_source_data`/`none_in_range`) and unresolved
  (no selected point) counts;
- **insufficient-evidence flag** below `minSample = 5` — numbers are still
  shown but explicitly labeled insufficient, and the caveat states "a local
  software demonstration is not a completed field trial";
- real and simulated are separate columns always; nothing mixes.

Rendered in section **3d** with a one-line caveat + per-region breakdown.

## C. Trial operations

- **Sessions:** free-text label on each measurement; grouped in stats.
- **Export:** `exportFieldMeasurements()` → `h1-geo/field-export-v0` JSON
  (dashboard + raw records + privacy note "precise geographic coordinates"),
  validated by `validateFieldExport` before download; a **local file only**,
  nothing is transmitted.
- **Checklist:** `docs/FIELD_TRIAL_CHECKLIST.md` — permission, per-
  measurement steps, and a scenario matrix (adjacent houses, apartments,
  corner, rural, Tijuana dense block, San José, poor GPS) plus prohibitions
  (no uploads, no fake-real flags, no self-reference).
- **Privacy:** measurements live in the local record store; export is a
  local download carrying an explicit location-data warning.

## D. Launch evidence

`docs/LAUNCH_READINESS.md` — separates *measured* (dataset eval results:
58/58, 405/417, 113/114 centroid identification; drift ambiguity rates)
from *demonstrated* (the software workflow) from *remaining work*.
Genuine field measurements: **0** — stated plainly, with the five steps
needed before any launch-grade accuracy claim.

## E. Verification

- `npm test`: **155/155** (+11: percentiles, empty→insufficient, real/sim
  separation, permission-denied null device fix, missing coverage +
  unresolved counts, region/session grouping, under-minSample flag,
  caveat clearing at minSample, export validation + round-trip + privacy
  note, new-field persistence, wide-accuracy handling). One real bug
  caught: nearest-rank p50 under-reported even-length medians — median now
  averages the middle pair (documented; p95 stays nearest-rank).
- Factory validators (read-only scratch): syntax / constitutional /
  security **PASS**; warnings unchanged — benign `record-store.js`
  `Delete()` + the documented raw-OSM-extract data warnings.
- `git diff --check` clean; demo at `127.0.0.1:8734/stage-b` (HTTP 200).

## Files (uncommitted for review)

- `src/geo/dashboard.js`, `test/geo/dashboard.test.js`,
  `docs/FIELD_TRIAL_CHECKLIST.md`, `docs/LAUNCH_READINESS.md`,
  `docs/GEO-016_COMPLETION.md` (new)
- `src/geo/field.js` (session / ambiguityVerdict / candidateCount fields)
- `src/stage-b/app.js` (live device capture, dashboard render, export,
  region detection, context fields)
- `web/stage-b/index.html` (device/session inputs, 3d fieldset)
