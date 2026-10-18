# GEO-004 — Stage B Verification Report
Status: Stage B vertical slice implemented and verified locally, 2026-10-17. Changes uncommitted on `foundation/geo-002-plumbing` @ `90a6f3c` for architectural review. Demo: `npm run stage-b` → http://127.0.0.1:8734/stage-b.

## Slice delivered
Map (Leaflet, vendored) → manual pin / device position → Stage A-validated assertion → localStorage persistence → reopen + edit (provenance-guarded) → observation draft → opportunity candidate (unverified → needs_review) → dry-run VNN payload preview. Zero live VNN/HomeVault writes, zero network calls from app code except OSM tile fetches by Leaflet.

## Paths changed
| Path | Change |
|---|---|
| `package.json`, `package-lock.json` | `leaflet@1.9.4` devDependency (exact pin), `stage-b` script |
| `.gitignore` | `node_modules/` |
| `vendor/leaflet/` | Vendored dist: `leaflet.js`, `leaflet.css`, `images/` (copied from `node_modules/leaflet/dist`) |
| `src/stage-b/record-store.js` | Generic validated store; quarantine-on-corruption |
| `src/stage-b/assertion-store.js` | Stage A validator + provenance guard (capturedAt/provenanceRef immutable on update) |
| `src/stage-b/observation.js` | Observation draft record + validator (`evidenceRef` = reference only) |
| `src/stage-b/candidate.js` | Candidate record + gated status transitions (verified requires evidence + named authority) |
| `src/stage-b/vnn-dryrun.js` | Candidate → VNN-shaped dry-run payload (text location ≤300, `dryRun: true` enforced) |
| `src/stage-b/geo-errors.js` | Honest messages: geolocation denial/unavailable, tile failure, quarantine |
| `src/stage-b/map-adapter.js` | Leaflet seam; `L` injected; only vendor-aware module |
| `src/stage-b/app.js` | DOM wiring |
| `web/stage-b/index.html` | Slice UI |
| `scripts/serve-stage-b.mjs` | Zero-dependency static server (127.0.0.1:8734, traversal-blocked) |
| `test/stage-b/*.test.js` | 17 new tests |
| `README.md` | State + run instructions |
| `docs/GEO-004_STAGE_B_VERIFICATION.md` | This report |

## Dependency and execution safety
- `leaflet@1.9.4`: published May 2023 (>> 7 days), BSD-2-Clause, `npm audit` 0 vulnerabilities, sha512 integrity in `package-lock.json`, installed with `--ignore-scripts`; package has no install lifecycle scripts. Vendored copy lets the demo run without `node_modules`.
- No restricted execution environment exists for this builder (GEO-003 finding stands); consequently **no install scripts were executed** and no code outside the workspace was written. npm registry read access was used for the pinned package only.

## Verification evidence

### Commands and results
- `npm test` → **35/35 pass, 0 fail** (~80 ms). New coverage: store save/list/get, invalid-rejection at boundary, cross-instance persistence (refresh survival), provenance guard (capturedAt/provenanceRef rewrite rejected), refined_manual on coordinate edit, no silent merge of nearby pins, corrupted-JSON and invalid-entry quarantine, observation association + evidenceRef rules, candidate status gating (verified unreachable without evidence+authority), dry-run payload shape/limits/rejections, geolocation error messages.
- `git diff --check` → clean.
- Static server traversal checks: `/%2e%2e/%2e%2e/H1-VNN/PROVENANCE.md` → 404, `..%5C..%5C` variant → 404; files outside repo root unreachable.

### Factory validation (run read-only, Factory unmodified)
Scratch `build/`+`test/` copy of `src/`, `web/`, `contracts/` inside H1-Geo, removed afterward:
- `01_syntax_validator` → **PASS** (0 issues)
- `02_constitutional_scan` → **PASS** (0 issues; initial run flagged the phrase "silent rewrite" inside our own guard comment — reworded)
- `03_integration_validator` → **PASS** (1 warning: localhost reference — expected for local demo)
- `04_security_scan` → **PASS** (1 warning: `delete` on in-memory map — benign; initial run flagged `innerHTML` usage — replaced with DOM APIs)
- `05_output_integrity_validator` → **FAIL (not applicable)**: expects `sandbox.yaml` + sandbox README — required only for Factory sandbox artifacts; H1-Geo is not a Factory sandbox. Documented, not worked around.

### Boundary evidence
All writes confined to `C:\dev\H1-Geo` (plus npm cache/registry reads). No other repo touched; `git status` shows only intended paths. GEO-003's earlier probe files remain deleted.

## Known limitations
- Geolocation requires localhost/secure context and user grant; denial path shows manual-pin guidance (no fabricated position). Verified by code path + unit-tested messages; browser-level denial requires interactive permission prompt (visible in demo).
- OSM public tiles are a dev convenience — tile outage falls back to manual coordinate entry; production tile sourcing remains a separate provider gate.
- `localStorage` is per-origin and evictable — scratch persistence only; Hull/HomeVault persistence migration is a later gate.
- Observation and candidate records use code-level validators; formalizing them as published `contracts/*.schema.json` is a recommended follow-up before any external consumption.
- The dry-run payload is *VNN-shaped*, not VNN-integrated: `location` is "lat,lng" text per VNN's current free-text field. A structured-coordinate handoff needs a reviewed VNN contract change.

## Stage B acceptance criteria status
| Criterion | Result |
|---|---|
| Interactive map, zoom, pan | Implemented (Leaflet) |
| Manual selection; manual vs device distinct | Implemented — separate sources, distinct pin colors, accuracy circle only for device_position |
| Stage A validation on save/load | Enforced at store boundary |
| Persistence survives refresh | localStorage + tested |
| Reopen/edit without silent provenance change | Provenance guard in store + refined_manual source transition |
| Observation draft on saved assertion | Implemented, associated by assertionId |
| Reviewable candidate, no VNN submit | Implemented, dry-run preview only |
| Error handling: geo denied, tiles down, invalid coords, corrupted data | All four paths implemented and messaged |
| Tests green | 35/35 |
