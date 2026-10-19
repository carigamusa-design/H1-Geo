# GEO-015 — Location Confidence and Field Validation

Status: complete for review (uncommitted). GEO-014 committed+pushed as
`3d35182` (verified 132/132 first). Builds a four-state destination
assessment, frictionless correction (nudges, candidate "Use" snaps, tracked
interactions), and a permissioned field-measurement workflow — all on the
real OSM pilot data from GEO-014.

## A. Intelligent candidate assessment

`src/geo/assessment.js` — `assessDestination()` maps the GEO-013/014
verdicts onto exactly four human states, with **no probability percentages**:

| State | Trigger |
|---|---|
| `likely_candidate` — "Likely candidate — confirmation required" | `inside_footprint` or `single_unverified` |
| `multiple_plausible` — "Multiple plausible candidates — choose or place manually" | `ambiguous` |
| `insufficient_info` — "Insufficient geographic information" | `no_source_data` or `none_in_range` |
| `user_confirmed` — "User-confirmed destination" | a confirmation record exists (takes precedence) |

Evidence considered: footprint containment, centroid distance,
device-reported accuracy (drives the ambiguity radius), source coverage
(no region → contributes nothing), and conflicting candidates (all listed,
never silently ranked into a fake winner). Containment is presented as "a
containing outline … not a parcel boundary or a verified address."

## B. Frictionless correction

- **Candidate comparison:** the 3b list shows each candidate's distance,
  "(contains the point)", and source (`OpenStreetMap contributors` vs
  `synthetic fixture`) with a **Use** button that snaps the destination —
  recorded as `selectedCandidate` in the confirmation.
- **Nudges:** N/S/E/W buttons move the destination ~1.5 m per click —
  usable on mobile where drag precision is poor.
- **Correction history preserved:** every confirmation is an append-only
  record; the original device fix stays untouched (`originalPreserved`),
  `movedMeters` recorded, and the confirmation now also stores
  `interactionCount` (drags/nudges/picks) and `durationMs` — real
  interaction telemetry rather than asserted ease.
- **Validator:** `selectedCandidate` accepted only as a proper reference;
  malformed values rejected.

## C. Field accuracy measurement

`src/geo/field.js` — `h1-geo/field-measurement-v0`, its own validating
store (backs up with the rest). Each record captures:

- device position + reported accuracy (from the pin's device fix),
- the **independently established reference destination** — coordinates
  plus a required free-text `source` (how it was established),
- the selected destination / chosen candidate / confirmation link,
- **computed** `deviceErrorMeters` and `selectionErrorMeters`,
- `correctBuildingIdentified` (yes/no/unknown), `correctionNeeded`,
- `interactionCount` + `durationMs` (carried from the confirmation),
- `simulated` — **defaults true**; a genuine measurement requires the
  explicit "permissioned field observation" checkbox in the UI.

`measurementSummary()` reports simulated and real counts strictly
separately; rates are computed only over records where the field is known
(e.g. `correct 1/1` real / `1/2` simulated). No real-world accuracy is
claimed — zero genuine field observations exist yet, and the summary says
so by showing `real 0`.

UI: "3c. Field validation" fieldset — reference coords/source/description,
correct-building select, correction-needed checkbox, REAL checkbox,
measured-by name, live `fld-summary` line splitting real vs simulated.

## D. International readiness

Exercised against all three committed OSM regions:

- **Atlanta (58 buildings, 62% addr-tagged):** mixed labeled/unlabeled
  candidates; both display correctly with provenance.
- **Tijuana (417 buildings, 0% addr-tagged):** every candidate labels as
  `OSM building #…` — no invented addresses; dense packing exercises
  `multiple_plausible` and overlapping-outline `ambiguous` paths.
- **San José (114 buildings, 90% addr-tagged):** labeled candidates show
  `housenumber street (OSM tag, unverified)` — flagged unverified.
- OSM attribution ("© OpenStreetMap contributors", ODbL 1.0) is carried in
  `source` on every candidate and into confirmation `sourceProvider`.

## E. Verification

- `npm test`: **144/144** (+12 field/assessment tests: the four states,
  no-percentages assertion, correction-history preservation,
  selectedCandidate validation, computed error meters, simulated/real
  separation, reference-source + simulated-flag requirements, MX/CR
  exercise, corrupt-payload quarantine).
- Factory validators (read-only scratch): syntax / constitutional /
  security **PASS**. New warnings on the raw `.osm` extracts only — real
  OSM contributor data (a `contact:email` tag in San José, raw coordinate/
  id digit runs); expected on third-party source XML, documented not
  suppressed. Code files scan clean.
- `git diff --check` clean; demo at `127.0.0.1:8734/stage-b` (HTTP 200).

## Honest limits

- No genuine field measurements exist — `real 0` until an operator records
  one; all current numbers are simulated or dataset-measured.
- `inside_footprint` confidence remains capped at `moderate`; "verified"
  still requires an independent authority record.
- Interaction counting covers 3b actions (drag end, nudges, Use) — not
  page-wide telemetry.

## Files (uncommitted for review)

- `src/geo/assessment.js`, `src/geo/field.js`, `test/geo/field.test.js`,
  `docs/GEO-015_COMPLETION.md` (new)
- `src/geo/property.js` (selectedCandidate + interaction/duration fields)
- `src/stage-b/app.js` (assessment display, nudges, candidate "Use",
  3c handlers, field store + backup spec)
- `web/stage-b/index.html` (nudge buttons, 3c fieldset)
