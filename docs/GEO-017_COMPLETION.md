# GEO-017 — Field Operations and Accuracy Improvement

**Status:** complete — uncommitted for review.
**Builds on:** GEO-016 (`bb25344` — field-trial dashboard, export, launch evidence).

## What this adds

### A. Mobile field usability

- Single new media query (`max-width: 760px`) in the existing Stage B page —
  no second app, same components:
  - `main` stacks vertically; map gets `55vh` / `min-height: 300px` instead of
    a fixed side-by-side flex row.
  - Sidebar becomes full-width below the map.
  - Buttons get `min-height: 40px`; the N/S/E/W nudge cluster and `.row`
    buttons get `min-height: 48px` / 15px font (touch targets).
  - Pin/candidate list rows get `10px` padding for thumb tapping.
- Destination confirmation, correction buttons, and the 3c measurement flow
  are the same controls as before — now reachable on a phone.

### B. Bounded GPS acquisition (`src/geo/acquisition.js`)

- `classifyReading` → `good` (≤10m) / `fair` (≤30m) / `poor` / `unknown`.
- `collectReadings({getPosition, attempts=5})` — injectable position getter;
  every attempt records either a reading (`latitude`, `longitude`,
  `accuracyMeters`, `capturedAt`, `band`) or an error (`attempt`, `code`,
  `message`). No silent retries past `attempts`.
- `summarizeReadings` reports `best` (**the single lowest-uncertainty REAL
  reading — never an averaged fix**), median accuracy, max pairwise
  `spreadMeters`, and `stable` / `unstable` / `insufficient_readings`.
- UI: "Collect 5 readings (pick the best real one)" in 3c — renders each
  reading with its reported accuracy and band, a stability line
  ("readings agree within Xm — unstable; pick deliberately or re-read"),
  per-attempt failure messages (denial/timeout/unavailable all surface with
  codes), and a **Use** button per reading that adopts exactly that fix.
- No averaging, no weighted blend, no implied improvement.

### C. Accuracy-improvement loop (`src/geo/improvement.js`)

`improvementFindings(entries)` — real measurements only (`simulated`
records counted separately, never evidence). Findings appear **only when
thresholds are met** (`n ≥ 5` real overall, `n ≥ 3` per region):

- `neighbor_confusion` — ≥40% of assessed sites ambiguous.
- `coverage_gap` — any `no_source_data` / `none_in_range` records.
- `correction_effort` — ≥50% needed user correction.
- `interaction_effort` — median interactions > 6.
- `device_error` — median device error > 50m.

Each finding carries `{kind, scope, evidence{n,…}, message, suggestedAction}`
and renders in 3d under the dashboard. Below threshold →
`insufficientData: true` + honest note ("N real measurement(s) — 5 needed").
Clean data → "No recurring error patterns detected". Nothing is inferred.

### D. Pilot preparation

`docs/OPERATOR_GUIDE.md` — consent and privacy (measurements = personal
location data, no upload path), **reference independence** (valid vs.
invalid references with the "measuring the app against itself" warning),
reading procedure including multi-acquisition, repeatable scenario matrix
(adjacent houses, apartments, rural, poor GPS, Tijuana/San José), and an
explicit don't-fabricate / don't-cherry-pick list.

## Verification

- `npm test`: **165/165 pass** (+10: classification bands, stable/unstable
  spread, best-is-a-real-reading (anti-averaging), mixed
  success/failure collection, all-denied, insufficient-data gating,
  scoped neighbor-confusion finding, simulated-never-evidence, coverage/
  correction/interaction findings, clean-data honesty).
- `node --check` clean on all new/edited files.
- Factory validators (production-files scratch):
  - Syntax: **PASS**, 0 issues / 0 warnings.
  - Security: **PASS** — warnings only: benign `Delete()` in
    `record-store.js` + doc mentions, OSM extract phone/email heuristics
    (third-party source data, documented).
  - Constitutional: 2 issues + 5 warnings — **all on pre-existing
    committed files** (`GEO-004_STAGE_B_VERIFICATION.md` language, OSM
    raw data); no GEO-017 file flagged. Not rewritten — that would edit
    history; reported here.
- `git diff --check`: clean.
- Demo: HTTP 200, all new element ids served.

## Honesty status (unchanged)

- `real n = 0` genuine field measurements still on record — dashboard and
  findings both say so plainly.
- The multi-reading workflow does **not** manufacture precision: choosing
  reading #3 of 5 uses reading #3's own reported ±accuracy.
- A demo interface is not a completed field trial.

## Files

New: `src/geo/acquisition.js`, `src/geo/improvement.js`,
`test/geo/acquisition.test.js`, `docs/OPERATOR_GUIDE.md`,
`docs/GEO-017_COMPLETION.md`.
Modified: `src/stage-b/app.js` (acquisition UI + findings render),
`web/stage-b/index.html` (controls + mobile media query).

No VNN submissions, deployments, other-repo changes, or merges.
