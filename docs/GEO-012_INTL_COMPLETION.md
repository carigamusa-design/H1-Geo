# GEO-012 (International) — Geographic Accuracy: Completion Report
Status: Implemented and verified locally, 2026-10-17. Uncommitted on `foundation/geo-002-plumbing` for review.

**Numbering note:** this mission reuses "GEO-012" — the pilot-ops mission used the same number and its `docs/GEO-012_COMPLETION.md` already exists (uncommitted). This doc is filed as `GEO-012_INTL_COMPLETION.md` to avoid overwriting it. Step-1 (commit GEO-011) was already satisfied: `7aaf05a` pushed. The pilot-ops GEO-012 files remain uncommitted alongside this mission's, since neither mission authorized a commit of the other.

## Data source & provenance
- **Dataset:** Natural Earth 1:110m cultural boundaries via `johan/world.geo.json`, public domain. Vendored subset at `data/territories.json` (16 features, 33KB, 3-decimal rounding ≈ ±111m); inlined as `src/stage-b/territory-data.js` so browser + tests need no fetch. Reproducible via `scripts/build-territories.mjs`.
- **Coverage:** US, Puerto Rico (distinct territory), Mexico, Canada, Costa Rica, Panama, Guatemala, Belize, Honduras, El Salvador, Nicaragua, Cuba, Dominican Republic, Haiti, Jamaica, Colombia.
- **License posture:** Natural Earth is public domain — no attribution required, provenance still recorded in the dataset header. No geocoder or cadastral database was built; no runtime external service is used.

## What was built
- **`src/geo/crs.js`** — explicit CRS + axis-order handling: EPSG:4326 (lat,lng per the EPSG registry), CRS:84 (lng,lat — what GeoJSON actually is), EPSG:3857 (Web Mercator m). `toWgs84`/`fromWgs84` never reorder silently; wrong axis order fails range checks honestly.
- **`src/geo/territory.js`** — point-in-polygon lookup (even-odd ray cast, holes subtracted), `checkCountryMatch` → `match | mismatch | unverified | undeclared`, `locationStatus` → `manually_selected | geocoded | independently_verified | unresolved` (verification requires an explicit `verifiedBy`, never inferred).
- **`src/geo/site.js`** — site descriptors keep `point | postal_address | building | legal_parcel` separate; each kind validates its own required fields; a point never auto-produces an address or parcel.
- **UI** — "3a. Geographic accuracy" in the detail panel: live status chip, territory result with source/resolution/±uncertainty, declared-country select, mismatch check with `explainDiscrepancy` ("correct the declared country or move the pin — the original evidence stays untouched"), and a site-descriptor form stored in a separate `sites` store (included in backups).

## Honesty boundaries
- 1:110m data is **country-level only** — cannot resolve streets, parcels, or near-border ambiguity (~km scale). Ocean/gap → `unresolved`, never guessed.
- A point inside a polygon never establishes address, ownership, jurisdiction, or parcel boundaries.
- No formal standards certification is claimed — OGC/EPSG practice used as technical reference only.

## Verification
- `npm test`: **107/107 pass** (+9: dataset provenance, US/PR/MX/CR/CA/PA fixtures, PR distinct from US, unresolved honesty, match/mismatch/unverified/undeclared incl. Tijuana cross-border, axis-order + Web Mercator round-trip + wrong-order rejection, distinct statuses + explicit verification, site-kind separation + required fields, discrepancy text).
- Factory validators: syntax / constitutional / security **PASS** (two scanner warnings fixed: synthetic UUID shape, WGS84 constant digit-run; one benign `delete` warning remains).
- `git diff --check` clean; demo at `127.0.0.1:8734/stage-b`.

## Known limitations
- Only the 16 vendored territories resolve; everywhere else is honestly `unresolved` — expand coverage by regenerating `territories.json` from the same source.
- Antimeridian-crossing polygons aren't specially handled (none of the 16 features cross it at 110m).
- No address geocoding, reverse geocoding, or parcel data — postal/parcel descriptors are operator-entered only.
