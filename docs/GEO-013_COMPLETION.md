# GEO-013 — Property-Level Location Accuracy

Status: complete for review (uncommitted). Scope: research on property-level
geographic data + a bounded destination-confirmation capability on top of
GEO-012B's international layer. Local demo only — no deployments, no live
VNN submissions, no other-repo changes, `main` untouched.

## Step 1 — GEO-012 checkpoints

Two separate commits on `foundation/geo-002-plumbing`, both pushed:

- `7863d3f` — GEO-012A: operational pilot view, feedback records, report counts.
- `e979524` — GEO-012B: CRS/axis-order, Natural Earth territory validation,
  site-descriptor separation, status semantics.

Shared files (`src/stage-b/app.js`, `web/stage-b/index.html`,
`src/stage-b/workflow.js`, `src/stage-b/pilot.js`) retain both feature sets.
Combined suite: **107/107** at the time of the commits. (One real bug found
while splitting: a duplicated `validateObservation` import in `app.js` —
browser-only file, invisible to `node --test`; fixed in both commits.)

## Step 2 — Research: property-level sources vs. country-scale data

Country-scale datasets (Natural Earth, GADM) answer "which country is this
point in" at ~100m+ uncertainty. They cannot answer "which house." The
property-level problem decomposes into distinct capabilities with very
different coverage and licensing:

| Capability | Mature sources | Coverage reality | License notes |
|---|---|---|---|
| Device positioning | W3C Geolocation `coords.accuracy` | 3–10m open sky; 20–100m+ in urban canyons, indoors, low power; drift is normal | platform API; accuracy is an estimate, not a bound |
| Forward/reverse geocoding | Nominatim (OSM), Pelias (self-host), Google/Mapbox/HERE | good in dense US/EU addresses; weak in rural MX/CR, informal settlements, unit-level | Nominatim free under usage policy + ODbL data; commercial APIs restrict derived-data storage |
| Building footprints | Google Open Buildings v3 (1.8B footprints; LatAm/Caribbean included), Microsoft GlobalML (1.4B+), OSM buildings | footprints only — no address, no unit, no entrance | Google: CC-BY-4.0 or ODbL; Microsoft: CDLA Permissive 2.0 (some distributions ODbL); OSM: ODbL share-alike |
| Address points | OpenAddresses (varied per-region licenses), US county open data, INEGI/DENUE (MX) | patchy outside US/EU; Mexico has municipal cadastral data, no unified open national address layer; Costa Rica relies on descriptive addressing | varies by region — must check per source |
| Parcels / cadastral | US county GIS (patchwork), Regrid (commercial), Registro Nacional (CR), municipal cadastres (MX) | **no open global parcel layer exists** — this is the core gap | mostly proprietary or restricted; do not fabricate |
| User-assisted correction | OSM editing, pin-drag UX (as implemented here) | highest real-world accuracy when the user knows the property | creates its own evidence; must preserve the original |

Conclusions that shaped the build:

1. **No free lunch at parcel level.** An honest system must treat "which
   property" as *user-stated intent corroborated by candidate data*, not a
   resolved fact — hence confirmations never reach "verified".
2. **Footprints ≠ addresses ≠ parcels.** These are three different datasets
   with different authorities; conflating them is the classic failure mode.
3. **Ambiguity is the common case, not the edge case.** Neighboring houses,
   duplexes, apartments, and corner lots routinely sit inside one GPS radius.
4. **MX/CR coverage is materially worse** than US for addresses/parcels;
   rural addressing is often descriptive ("200m norte de la escuela") — the
   system must say "unverified" rather than guess.

## Step 3 — What was built

**`src/geo/property.js`** — `h1-geo/destination-confirmation-v0`:

- `deviceEstimate` — the original positioning evidence (lat/lng/accuracy/
  capturedAt), **preserved verbatim** even when the destination is moved.
- `confirmedPoint` — the user's stated destination; corrections record
  `movedMeters` and `originalPreserved: true`. Validation hard-requires
  `originalPreserved === true`.
- `assessAmbiguity` — verdicts: `no_source_data`, `none_in_range`,
  `single_unverified`, `ambiguous` (with the candidate list + distances).
  Radius defaults to `max(15m, device accuracy)` — a wide GPS radius makes
  more properties candidates, increasing ambiguity honestly.
- `confidence` — capped at `unverified | low | moderate`. **"verified" is
  unreachable** from a pin, GPS fix, or candidate data; that requires an
  independent authority record (the GEO-012B site-descriptor path with
  `verifiedBy`). Every record carries the non-ownership disclaimer.
- `validateDestinationConfirmation` — rejects out-of-range points (catches
  axis-order swaps), missing confirmer name, and tampered
  `originalPreserved`.

**`src/stage-b/property-fixtures.js`** — clearly-labeled synthetic candidate
set (US neighbor pair, US street pair, US apartment stack, US corner pair,
MX pair, CR pair, CR rural singleton). Stands in for licensed footprint/
address data; every entry marked `fixture: true`.

**`src/stage-b/map-adapter.js`** — a separate draggable red destination
marker (`confirmed_destination`), visually distinct from the blue manual
pin and green device fix.

**UI — "3b. Destination confirmation":**

- Device estimate shown with its ±accuracy (the accuracy circle already
  renders on the map for `device_position` pins).
- Red destination pin draggable to the intended property; "set to device
  estimate" / "reset to saved pin" controls.
- Live ambiguity verdict + summary against fixture candidates and any
  site descriptors carrying coordinates.
- Named-confirmer save; confirmation history per pin shows verdict,
  confidence, and drift (`moved Xm from the original fix (kept)`).
- Creating an opportunity draft without a confirmation triggers an explicit
  informed override (`confirm()`), not a silent pass.
- Confirmations persist in the standard record store, join backups
  (assertion reference validated), and appear in the pilot report count.

## Step 4 — Accuracy testing (ambiguity measured, not accuracy claimed)

`test/geo/property.test.js` — 15 tests covering the required matrix:

| Scenario | Result |
|---|---|
| Two neighboring houses (~19m) | `ambiguous`, both listed |
| Opposite sides of street (~33m) | `ambiguous` |
| Apartment building, 3 units ~4m | `ambiguous` |
| Corner property, 2 frontages | `ambiguous` |
| Rural CR singleton | `none_in_range` at tight radius → `single_unverified` at wide |
| Mexico pair (Tijuana) | `ambiguous` |
| Costa Rica pair (San José) | `ambiguous` |
| No candidate data | `no_source_data` — never a silent pass |
| GPS drift ~55m correction | `movedMeters` recorded, device fix preserved |
| Axis-order swap | validator rejects lat out of range |
| Confidence cap | `ambiguous`→`low`; corroborated manual→`moderate`; never `verified` |
| Store persistence | save/reload/latest-wins verified |

**Not claimed:** any measured real-world property-accuracy rate. These tests
prove the system *identifies* ambiguity correctly on reproducible fixtures;
they say nothing about field accuracy, which requires real data collection.

## Verification

- `npm test`: **122/122 pass** (was 107 → +15 property tests).
- Factory validators (read-only scratch `C:\dev\_geo013-factory`, Factory
  untouched): syntax **PASS**, constitutional **PASS**, security **PASS**
  (1 benign warning — pre-existing `record-store.js` `Delete()`).
- `git diff --check`: clean.
- Demo: `npm run stage-b` → `127.0.0.1:8734/stage-b` (HTTP 200).

## Known limitations

- Candidate data is a labeled synthetic fixture set. Real deployment needs
  licensed footprint/address sources (see research table) — none were
  integrated or vendored.
- Ambiguity assessment is distance-only; no footprint polygon contains-point
  test yet (footprint data isn't vendored).
- No geocoder/reverse-geocoder is called — addresses remain operator-entered
  site descriptors, per GEO-012B separation.
- `destinationConfirmedFor` uses string-sorted `confirmedAt`; two
  confirmations within the same ISO tick order arbitrarily (harmless:
  history is listed, not authoritative).
- UI candidate-creation gate is a `window.confirm` informed override —
  deliberate: blocking entirely would prevent legitimate no-data regions.

## Changed / added files (uncommitted for review)

- `src/geo/property.js` (new)
- `src/stage-b/property-fixtures.js` (new)
- `test/geo/property.test.js` (new)
- `docs/GEO-013_COMPLETION.md` (new)
- `src/stage-b/map-adapter.js` (destination marker)
- `src/stage-b/app.js` (3b panel, store, backup spec, draft gate, report)
- `src/stage-b/pilot.js` (confirmations count)
- `web/stage-b/index.html` (3b fieldset)
