# H1-Geo — Launch Evidence & Readiness Report

Generated for GEO-016 (2026-10-18). **A working local software
demonstration is not a completed field trial.** This report separates what
has been measured, from what has been demonstrated, from what remains.

## 1. What is measured

**Dataset-evaluation results** (`scripts/eval-property.mjs`, deterministic
seed 20261018, real OSM pilot data — GEO-014):

| Metric | Atlanta (58 bldgs) | Tijuana (417) | San José (114) |
|---|---|---|---|
| Correct building identified at centroid | 58/58 | 405/417 | 113/114 |
| Ambiguous at ±20 m GPS drift | 93/200 | 109/200 | 23/200 |
| True building still top after drift | 127/200 | 115/200 | 138/200 |

Interpretation: the system correctly identifies building containment where
data exists, and honestly reports ambiguity under realistic GPS noise. It
does not silently pick wrong buildings — it declines to distinguish.

**Genuine field measurements: 0.** The 3d dashboard currently reports
`real n=0` with the insufficient-evidence caveat (`minSample = 5`). No
field accuracy claim exists or is made.

## 2. What is demonstrated (software, not field data)

- End-to-end flow: permissioned capture → candidates → correction →
  confirmation → field measurement → dashboard → local export.
- Real ODbL-licensed OSM data in three international areas; honest gaps
  (Tijuana has 0% address tags — shown, not patched over).
- Simulated-vs-real separation enforced at record level, dashboard level,
  and export level.
- 155 automated tests; Factory syntax/constitutional/security scans PASS.

## 3. Geographic coverage

Vendored pilot extracts only: ~250 m × ~280 m blocks in Atlanta US,
Tijuana MX, San José CR, plus a labeled synthetic fixture set. There is no
claim of coverage elsewhere — points outside the extracts correctly report
`insufficient information` / `no_source_data`.

## 4. Known limitations

- No parcel, cadastral, or authoritative address data anywhere in the
  system — footprints are outlines, not boundaries.
- Correct-building identification relies on the operator's honest
  independent reference; the software cannot verify ground truth.
- OSM freshness varies by region; the vendored extract is a 2026-10-18
  snapshot, reproducible via `scripts/build-osm-pilot.mjs`.
- Rural and multi-unit cases are under-covered in real data (fixtures only).
- Field UX tested on desktop browser; no physical mobile trial conducted.

## 5. Remaining work before any launch claim

1. Collect ≥5 (ideally ≥20) genuine, permissioned field measurements per
   scenario in `docs/FIELD_TRIAL_CHECKLIST.md` — including MX and CR sites.
2. Repeat the checklist on physical mobile devices in the field.
3. Re-run the dashboard against real data and publish the honest numbers
   (median + p95 error, correct-building rate, confusion rate) — whether
   favorable or not.
4. Evaluate licensed address-point/parcel sources for pilot cities if
   property-level authority is required (GEO-013 research table).
5. Independent review of privacy handling for exported precise locations.

## 6. Explicit non-claims

- No field accuracy rate is claimed: real n = 0.
- No launch, deployment, or production integration is implied.
- Dataset-evaluation numbers measure verdict behavior on vendored data —
  not on-ground truth.
