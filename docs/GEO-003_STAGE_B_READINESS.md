# GEO-003 — Stage B Readiness Plan
Status: Plan for founder review. Stage B implementation is NOT yet authorized. Prepared 2026-10-17 after the GEO-003 reuse and containment verification.

## 1. Vertical slice definition (smallest operational, extensible)

```
Map → select property location → save geographic assertion →
reopen saved location → create observation → prepare opportunity candidate
```

Scope discipline: every step is a distinct record with explicit links, per `docs/ARCHITECTURE.md` identity boundaries. Nothing silently merges; nothing auto-verifies.

| Step | Record | Owner of authority | Stage B behavior |
|---|---|---|---|
| Select location | Geographic assertion (contract v0) | H1-Geo | Manual pin first (`source: "manual_target_pin"`); optional device position (`source: "device_position"`) via browser geolocation; never substitute one for the other |
| Save | Assertion + `provenanceRef` | H1-Geo (scratch store) | Validate with `src/coordinate-assertion.js` before persisting; invalid input cannot be saved |
| Reopen | Same assertion | H1-Geo | List saved pins; re-render pin, source, accuracy, timestamp; round-trip must be lossless |
| Observation | Time-bounded claim/evidence | H1-SnapN'Talk authority | Stage B stores an observation *stub* in the Geo scratch store with an optional `evidenceRef` naming a SnapN'Talk `captureId`/`packageId`. Geo never captures or copies media; a real SnapN'Talk linkage is read-only and behind its own adapter |
| Opportunity candidate | Reviewable candidate record | H1-Geo draft; H1-VNN authority for missions | Status enum: `unverified` → `needs-review` → `verified` (only with explicit evidence/authority). Dry-run VNN payload mapper only; zero live writes |

Explicit non-goals for Stage B (from build order and mission): no production VNN writes, no HomeVault persistence integration, no professional measurement claims, no geocoding, no parcel boundaries, no multi-user sync.

## 2. Map approach — recommendation and open questions

### Recommendation: Leaflet + OpenStreetMap raster tiles

| Criterion | Assessment |
|---|---|
| License | Leaflet: BSD-2-Clause — permissive, no copyleft, vendor-independent |
| Provider dependency | Provider-neutral tile layer interface; OSM public tiles need no API key (dev-scale use; OSM tile-usage policy applies). Swap to any raster provider or self-hosted tiles without code redesign |
| Offline behavior | Degrades gracefully: map canvas absent tiles → manual lat/long entry still works; pins persist locally regardless of tile availability. Optional future: bundled tile cache or MBTiles |
| Simplicity | ~40 KB, one `<script>`/CSS pair, mature API (`L.map`, `L.marker`, `click` events) — smallest path to a working pin flow |
| Extensibility | Layer adapters allow vector/imagery later; if vector rendering becomes needed, the tile-provider seam maps cleanly to MapLibre GL (BSD) without changing the assertion/candidate model |
| Alternatives considered | MapLibre GL (vector, heavier, overkill for pin-first slice); Google Maps (proprietary key + vendor lock, contradicts vendor-independence doctrine); no-map lat/long form (fallback mode, not the primary UX) |

### Founder decision questions before implementation

1. OSM public tiles acceptable for Stage B development, or must Stage B run on self-hosted/local tiles from day one?
2. Vendored Leaflet copy (checked-in `vendor/` file, no package manager) vs. npm devDependency? Recommend vendored single file to keep the zero-dependency posture; needs founder sign-off since it adds third-party source to the repo.
3. Default map center/zoom for first run.

## 3. Persistence strategy (Stage B)

- **H1-Geo scratch store only.** A namespaced browser `localStorage` root (`h1geo.stageb.*`) — offline-capable, zero infrastructure, trivially inspectable/wipeable. Mirrors how HomeVault's own prototype currently persists, without touching HomeVault.
- Assertions stored verbatim (JSON-serialized contract objects); reopen validates on load — corrupted or stale entries surface as honest invalid states, never silently repaired.
- Export/import as a single JSON document for review and test fixtures (gitignored `stage-b/` data root if a file-based variant is preferred later).
- **No HomeVault writes, no VNN writes, no shared indices.** A `provenanceRef`/identity scheme keeps records referable (`h1geo://assertion/<id>`) so later persistence migration replaces the store, not the contract.

## 4. Exact Stage B file scope (proposed)

New files only; nothing existing is modified except README/doc state lines if required.

```
web/stage-b/index.html            # slice UI shell (map + pin list + detail panel)
src/stage-b/map-adapter.js        # provider-neutral map seam (Leaflet impl behind it)
src/stage-b/pin-controller.js     # click→draft assertion, device-position option, denied-permission path
src/stage-b/assertion-store.js    # localStorage CRUD, validate-on-save, validate-on-load
src/stage-b/observation-stub.js   # observation record + evidenceRef (reference only)
src/stage-b/candidate.js          # opportunity-candidate record + status transitions
src/stage-b/vnn-dryrun.js         # candidate → VNN-compatible text payload mapper (fixtures only)
test/stage-b/*.test.js            # unit tests for store, candidate transitions, vnn-dryrun, denied paths
test/fixtures/*.json              # VNN dry-run payload fixtures, sample assertions
vendor/leaflet/                   # vendored map library (pending founder decision Q2)
```

Existing reused code: `src/coordinate-assertion.js` (validator), `contracts/geo-coordinate-assertion-v0.schema.json`. Possibly a second contract: `contracts/opportunity-candidate-v0.schema.json` and `contracts/observation-ref-v0.schema.json` — versioned before implementation, per contract-first doctrine.

## 5. Acceptance criteria (evidence required for Stage B sign-off)

1. `npm test` green including Stage B suite: pin→validate→save→reopen round-trip; invalid assertions rejected; denied-geolocation produces no fabricated position; tile-offline manual entry works.
2. Multiple assertions coexist; nearby pins never silently merge (distinct ids asserted in tests).
3. Candidate status machine: `unverified`/`needs-review` reachable; `verified` unreachable without explicit evidence authority — proven by test.
4. VNN dry-run: fixture payload matches VNN intake field shapes (`location` text ≤300 chars + `provenanceRef`), zero network calls — proven by test and code review.
5. Evidence link: `evidenceRef` accepts a captureId-shaped string; no media paths or bytes enter the Geo store — proven by schema + test.
6. No-write proof: test run produces zero writes outside `h1geo.stageb.*` localStorage keys and `test/fixtures`.
7. `git diff --check` clean; README/docs updated to match implemented state; handoff report per build order §Handoff report.

## 6. Risks and watch items

- OSM tile policy is dev-scale; production tile sourcing remains a separate provider-selection gate.
- localStorage is per-origin and evictable — fine for a scratch slice; flagged so persistence migration stays a designed step, not an accident.
- Denied-permission and offline UX copy must follow `docs/FIELD_EDUCATION_AND_CONDUCT.md` (education over collection).
- Containment is instruction-level (see reuse report §2): Stage B work should keep the same git-evidence discipline; Factory sandbox routing is the fallback if stronger gating is wanted.
