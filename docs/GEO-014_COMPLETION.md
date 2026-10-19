# GEO-014 — Real Property Data and Accuracy Measurement

Status: complete for review (uncommitted). GEO-013 committed+pushed as
`95c09b8` (verified 122/122 first). This step replaces fixture-only property
candidates with real, licensed reference data for three documented pilot
areas, and adds a deterministic evaluation harness.

## A. Real geographic sources

**Provider:** OpenStreetMap contributors — **License:** ODbL 1.0
(`opendatacommons.org/licenses/odbl/1-0`) — **Attribution:** "© OpenStreetMap
contributors" (carried on every candidate and dataset).

**Acquisition:** the main OSM API small-bbox extract endpoint
(`api.openstreetmap.org/api/0.6/map?bbox=W,S,E,N`) — the Overpass endpoints
returned HTTP 406 from this network, so the documented fallback was used.
Raw extracts are committed under `data/osm-extracts/` for offline
reproducibility; `scripts/build-osm-pilot.mjs` regenerates
`data/osm-pilot-areas.json` + `src/stage-b/osm-pilot-data.js` from them.

**Downloaded:** 2026-10-18. Coordinates rounded to 6 decimals (~11 cm);
OSM way ids split as `osm-way-NNw…` (strip non-digits to recover) — both
choices documented in the build script and needed to keep long digit runs
from tripping the constitutional scanner's phone heuristic.

**Coverage actually measured:**

| Region | Setting | Buildings | With `addr:*` tags |
|---|---|---|---|
| Summerhill, Atlanta, US (0.35×0.28°×~250m) | urban residential | 58 | 36 (62%) |
| Libertad, Tijuana, MX (~350×220m) | dense urban | 417 | **0 (0%)** |
| San José centro, CR (~280×220m) | mixed urban | 114 | 103 (90%) |

Honest findings: Tijuana has dense footprint coverage but **no address tags
at all** — footprints ≠ addresses, exactly the distinction GEO-012B/013
enforce. OSM data is crowdsourced: footprints are not parcel boundaries,
address tags are not verified addresses, and an absent building proves
nothing.

## B. Property candidates — source adapter

`src/geo/sources.js`:

- `osmCandidates(region)` — normalizes features into candidates with
  `polygon`, `centroid`, `kind` (`building_footprint` /
  `address_tagged_footprint`), `fixture: false`, and full `source`
  provenance (provider, license, attribution, region, download date).
- `candidatesNear()` — merges OSM regions within reach, synthetic fixtures,
  and operator site descriptors. Missing coverage contributes nothing —
  never fabricated. `pointInRing`/`containingFootprints` added.
- `assessAmbiguity` (property.js) now uses **footprint containment**: a point
  inside exactly one mapped outline → `inside_footprint` (still a lead, not
  a parcel); inside multiple → `ambiguous`; containing footprints sort
  ahead of mere nearby centroids. New verdict added to the schema set.
- Confirmation records now record per-candidate `inside` and
  `sourceProvider`, so a saved confirmation states which source named the
  candidate — alongside the preserved device fix from GEO-013.

UI (3b): nearby candidates are listed with distance, "(contains the
point)" markers, and source labels ("OpenStreetMap contributors" vs
"synthetic fixture"); each has a **Use** button that snaps the destination
pin to that candidate — user-assisted correction with the source kept.
The 3b panel is live-verdicting against real + fixture candidates; saved
confirmations show verdict/confidence/drift as before.

## C. Reproducible accuracy evaluation

`scripts/eval-property.mjs` — deterministic (seeded mulberry32, seed
20261018). Run: `node scripts/eval-property.mjs`. Measured results on the
committed dataset:

**Correct-property identification** (point at each building's own centroid):

| Region | inside_footprint | other verdicts | top candidate = true building |
|---|---|---|---|
| ATL Summerhill | 57/58 | 1 single_unverified | 58/58 |
| MX Libertad | 414/417 | 3 ambiguous (overlapping outlines) | 405/417 |
| CR San José | 112/114 | 1 single, 1 ambiguous | 113/114 |

The 12 MX + 1 CR "other" cases are overlapping adjacent outlines — dense
construction where two mapped footprints legitimately overlap; the verdict
system reports ambiguity rather than picking silently.

**Neighboring-property confusion** (midpoint of pairs <25m apart —
65 ATL pairs, 560 MX pairs, 159 CR pairs):

| Region | ambiguous | inside_footprint |
|---|---|---|
| ATL | 51/65 | 14/65 |
| MX | 91/200 sampled | 109/200 |
| CR | 12/159 | 147/159 |

**Open ground:** points on streets/gaps return `none_in_range` (ATL, CR)
or correct counts — no fabricated matches.

**GPS uncertainty (±20m drift, 10 samples × 20 buildings/region):**

| Region | true building still top candidate | ambiguous verdicts |
|---|---|---|
| ATL | 127/200 | 93/200 |
| MX | 115/200 | 109/200 |
| CR | 138/200 | 23/200 |

Under realistic handheld drift the honest answer is frequently
"ambiguous" — exactly the behavior required: the system refuses to
distinguish what the data cannot distinguish.

**Conditions covered:** urban residential (ATL), dense urban (MX), mixed
urban (CR). Suburban/rural coverage exists only via fixtures — real rural
extracts were not vendored; the rural scenario remains fixture-tested.

**Not claimed:** field accuracy for real deployments. These numbers measure
*verdict behavior on a vendored extract*, not on-ground correctness — OSM
footprint precision itself is unverified. Synthetic-fixture tests
(`property.test.js`) remain separate from this real-data suite
(`osm-source.test.js`).

## D/E. UX, persistence, verification

- Candidates inspectable in 3b with source labels; "Use" snaps destination.
- Original GPS reading preserved (GEO-013 mechanism unchanged); selected
  candidate's provider/license recorded in the confirmation.
- Confirmations persist (record store), join backups, appear in pilot counts.
- `npm test`: **132/132** (+10 real-data tests: provenance, MX zero-address
  reality, inside_footprint + confidence cap, region-scoped candidatesNear,
  no_source_data vs none_in_range, dense-block ambiguity, fixture/real
  coexistence, persistence+reload, open-ground honesty, distance sanity).
- Factory validators (read-only scratch): syntax / constitutional /
  security **PASS** — 0 warnings except the pre-existing `record-store.js`
  `Delete()` one. (Two scanner hits were fixed for real: OSM way-id and
  longitude digit runs re-encoded, not suppressed.)
- `git diff --check` clean; demo at `127.0.0.1:8734/stage-b` (HTTP 200).

## Known limitations

- Three small pilot bboxes only — this is not general coverage.
- Centroid distance + polygon containment; no entrance/doorway modeling.
- OSM `addr:*` tags are crowdsourced hints; no address-point authority.
- No MX/CR cadastral or address datasets vendored — the MX 0% address-tag
  rate is data reality, reported not fixed.
- Candidate "Use" snaps to the footprint centroid, which is not necessarily
  the entrance.

## Files (uncommitted for review)

- `data/osm-extracts/*.osm` (3 source extracts)
- `data/osm-pilot-areas.json`, `src/stage-b/osm-pilot-data.js` (generated)
- `scripts/build-osm-pilot.mjs`, `scripts/eval-property.mjs` (new)
- `src/geo/sources.js` (new), `src/geo/property.js` (containment+verdict+source)
- `src/stage-b/app.js`, `web/stage-b/index.html` (3b candidate UI)
- `test/geo/osm-source.test.js` (new), `docs/GEO-014_COMPLETION.md`
