# H1-Geo

**H1 Geographic Intelligence** — a global, human-centered geospatial foundation for H1 Universe.

## Why it exists
H1-Geo develops reusable geographic capabilities for homes, services, mobility, agriculture, infrastructure, drones and robotics. The first commercial direction is a location → observation → reviewable opportunity candidate → eventual authorized H1-VNN work loop. The foundation is designed for many domains; the first release is deliberately narrow and measurable.

## Current state
**GEO-002 Stage A + Stage B slice (uncommitted, under architectural review).** This repository contains founding documents, a coordinate assertion contract with a dependency-free validator, and a sandbox-only Stage B vertical slice: browser map → pin → saved assertion → reopen/edit → observation draft → reviewable opportunity candidate with a dry-run VNN payload preview. It does not contain a live GPS engine, geocoder, parcel registry, property measurement engine, deployed service, or any production integration. No writes leave the browser's local storage.

## Coordinate assertion validation
`src/coordinate-assertion.js` implements [contracts/geo-coordinate-assertion-v0.schema.json](contracts/geo-coordinate-assertion-v0.schema.json) as executable code. It is pure and provider-neutral: no I/O, no network calls, no coercion, no input mutation, and no fabricated values. `validateCoordinateAssertion(value)` returns `{ valid, errors }` where each error is `{ field, message }`.

```js
import { validateCoordinateAssertion } from "./src/coordinate-assertion.js";
```

## Tests
Requires Node.js >= 18.17. One devDependency: `leaflet@1.9.4` (BSD-2-Clause, pinned, vendored into `vendor/leaflet/`; installed with `--ignore-scripts`).

```sh
npm test
```

Runs `node --test` against `test/`: Stage A contract tests plus Stage B store/provenance/observation/candidate/dry-run tests.

## Stage B demo (local only)

```sh
npm run stage-b   # serves http://127.0.0.1:8734/stage-b
```

The slice uses OpenStreetMap public tiles for bounded development testing only — not a production tile decision. Manual coordinate entry works when tiles or geolocation are unavailable. Saved assertions persist in `localStorage` under `h1geo.stageb.*`; corrupted data is quarantined, never silently repaired. Candidates produce dry-run payload previews only — nothing is sent to VNN.

## Read first
- [Founding charter](docs/FOUNDING_CHARTER.md)
- [Architecture and ownership](docs/ARCHITECTURE.md)
- [Field education and conduct](docs/FIELD_EDUCATION_AND_CONDUCT.md)
- [GEO-002 build order and gates](docs/GEO-002_BUILD_ORDER.md)
- [Coordinate assertion draft](contracts/geo-coordinate-assertion-v0.schema.json)

## H1 boundaries
H1-Geo owns shared spatial semantics and eventual geographic operations. H1-SnapNTalk owns capture and evidence. H1-HomeVault owns personal property records. H1-VNN owns opportunities, providers and work. H1-Ride-MX owns ride-specific workflows. H1-Sandbox-Factory hosts isolated validation. Integration must use explicit contracts, not duplicated business logic.

## Engineering posture
Build test-first. Keep source, time, uncertainty, provenance and coordinate reference systems explicit. Never turn a visual observation into a verified service need automatically. Measure before claiming accuracy. Start with internal H1 use, validate against real reference data, and scale only after evidence gates.

## Contributing
No production integration or new vendor dependency without scoped review. No secrets or founder records in tests. Stage A is foundational documentation and a draft schema; validation implementation and the first operational vertical slice require their own acceptance evidence.

## Licensing
No open-source license has been selected. Public repository visibility does not by itself grant reuse rights.
